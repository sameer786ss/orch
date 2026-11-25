package com.orch.app.update

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.pm.PackageInfoCompat
import com.orch.app.BuildConfig
import com.orch.app.data.OrchJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

data class UpdateInfo(
    val versionCode: Long,
    val tag: String,
    val apkUrl: String,
    val checksumUrl: String,
    val sizeBytes: Long
)

@Serializable
private data class ReleaseManifest(
    val versionCode: Long = 0,
    val versionName: String = "",
    val tag: String = "",
    val apkUrl: String = "",
    val checksumUrl: String = "",
    val sizeBytes: Long = 0
)

class AppUpdater(private val context: Context) {
    private val http: OkHttpClient
        get() = sharedHttp

    private val directory = File(context.cacheDir, "update")

    val installedVersion: Long
        get() = PackageInfoCompat.getLongVersionCode(context.packageManager.getPackageInfo(context.packageName, 0))

    suspend fun latest(): UpdateInfo? = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("https://github.com/${BuildConfig.ORCH_UPDATE_REPO}/releases/download/$MANIFEST_TAG/$MANIFEST_NAME")
            .header("Accept", "application/json")
            .build()
        val body = http.newCall(request).execute().use { response ->
            if (response.isSuccessful) response.body?.string() else null
        } ?: return@withContext null
        val manifest = runCatching { OrchJson.decodeFromString<ReleaseManifest>(body) }.getOrNull()
            ?: return@withContext null
        if (manifest.versionCode <= 0L || manifest.apkUrl.isBlank() || manifest.checksumUrl.isBlank()) {
            return@withContext null
        }
        val label = manifest.versionName.takeIf { it.isNotBlank() }?.let { "v$it" }
            ?: displayVersion(manifest.versionCode)
        UpdateInfo(
            versionCode = manifest.versionCode,
            tag = label,
            apkUrl = manifest.apkUrl,
            checksumUrl = manifest.checksumUrl,
            sizeBytes = manifest.sizeBytes
        )
    }

    suspend fun download(info: UpdateInfo, onProgress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        directory.mkdirs()
        val target = File(directory, "Orch-${info.versionCode}.apk")
        if (isValid(target, info) && verifyChecksum(target, info)) return@withContext target

        directory.listFiles()?.forEach { it.delete() }
        val partial = File(directory, target.name + ".part")
        http.newCall(Request.Builder().url(info.apkUrl).build()).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Download failed (HTTP ${response.code}).")
            val body = response.body ?: throw IOException("Download failed.")
            val total = body.contentLength().takeIf { it > 0 } ?: info.sizeBytes
            var copied = 0L
            body.byteStream().use { input ->
                partial.outputStream().use { output ->
                    val buffer = ByteArray(BUFFER_BYTES)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        ensureActive()
                        output.write(buffer, 0, read)
                        copied += read
                        if (total > 0) onProgress((copied.toFloat() / total).coerceIn(0f, 1f))
                    }
                }
            }
        }
        if (!partial.renameTo(target)) {
            partial.delete()
            throw IOException("Unable to store the update.")
        }
        if (!isValid(target, info) || !verifyChecksum(target, info)) {
            target.delete()
            throw IOException("The downloaded update failed verification. Please try again.")
        }
        target
    }

    suspend fun cleanStale() = withContext(Dispatchers.IO) {
        directory.listFiles()?.forEach { file ->
            val version = archiveVersion(file)
            if (version == null || version <= installedVersion) file.delete()
        }
    }

    fun canInstall(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

    fun openInstallSettings() {
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    fun install(apk: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(context.packageName)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            try {
                apk.inputStream().use { input ->
                    session.openWrite(apk.name, 0, apk.length()).use { output ->
                        input.copyTo(output)
                        session.fsync(output)
                    }
                }
                val callback = PendingIntent.getBroadcast(
                    context,
                    sessionId,
                    Intent(context, UpdateInstallReceiver::class.java),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                )
                session.commit(callback.intentSender)
            } catch (failure: Throwable) {
                session.abandon()
                throw failure
            }
        }
    }

    private fun verifyChecksum(file: File, info: UpdateInfo): Boolean {
        val expected = runCatching {
            http.newCall(Request.Builder().url(info.checksumUrl).build()).execute().use { response ->
                if (!response.isSuccessful) return false
                response.body?.string()?.trim()?.split(Regex("\\s+"))?.firstOrNull()?.lowercase()
            }
        }.getOrNull()?.takeIf { it.length == 64 } ?: return false
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(BUFFER_BYTES)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        val actual = digest.digest().joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
        return actual == expected
    }

    private fun isValid(file: File, info: UpdateInfo): Boolean =
        file.isFile && archiveVersion(file) == info.versionCode

    @Suppress("DEPRECATION")
    private fun archiveVersion(file: File): Long? {
        if (!file.isFile || file.extension != "apk") return null
        val archive = context.packageManager.getPackageArchiveInfo(file.path, 0) ?: return null
        if (archive.packageName != context.packageName) return null
        return PackageInfoCompat.getLongVersionCode(archive)
    }

    private companion object {
        const val MANIFEST_TAG = "app-latest"
        const val MANIFEST_NAME = "app-latest.json"
        const val BUFFER_BYTES = 64 * 1024

        val sharedHttp: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .build()
        }

        fun displayVersion(versionCode: Long): String =
            "v${versionCode / 1_000_000}.${versionCode / 1_000 % 1_000}.${versionCode % 1_000}"
    }
}
