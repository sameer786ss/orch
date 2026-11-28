plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.kotlin.serialization)
  alias(libs.plugins.google.services)
}

kotlin {
  jvmToolchain(17)
}

android {
  namespace = "com.orch.app"
  compileSdk { version = release(36) { minorApiLevel = 1 } }

  defaultConfig {
    applicationId = "com.orch.app"
    minSdk = 24
    targetSdk = 36
    versionCode = System.getenv("VERSION_CODE")?.toIntOrNull() ?: 1_000_000
    versionName = System.getenv("VERSION_NAME") ?: "1.0.0"

    buildConfigField("String", "ORCH_API_BASE_URL", "\"https://orchapi.duckdns.org\"")
    buildConfigField("String", "ORCH_UPDATE_REPO", "\"sameer786ss/orch\"")
    buildConfigField("String", "ORCH_TERMS_URL", "\"https://orch.live/terms\"")
    buildConfigField("String", "ORCH_PRIVACY_URL", "\"https://orch.live/privacy\"")
    val sentryDsn = System.getenv("SENTRY_DSN_MOB")?.trim().orEmpty()
    buildConfigField("String", "SENTRY_DSN", "\"${sentryDsn.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
  }

  signingConfigs {
    // Release signing is driven entirely by the environment (set by CI). There are no
    // fallback keys: an assembleRelease without these variables fails at configuration.
    create("release") {
      System.getenv("KEYSTORE_PATH")?.let { path ->
        storeFile = file(path)
        storePassword = System.getenv("STORE_PASSWORD")
        keyAlias = System.getenv("KEY_ALIAS")
        keyPassword = System.getenv("KEY_PASSWORD")
      }
    }
  }

  buildTypes {
    release {
      isCrunchPngs = false
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      signingConfig = signingConfigs.getByName("release")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  buildFeatures {
    compose = true
    buildConfig = true
  }
  dependenciesInfo {
    includeInApk = false
    includeInBundle = true
  }
}

dependencies {
  implementation(platform(libs.androidx.compose.bom))
  implementation(platform(libs.firebase.bom))
  implementation(platform(libs.sentry.bom))
  implementation(libs.sentry.android)
  implementation(libs.sentry.okhttp)
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.browser)
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.material.icons.core)
  implementation(libs.androidx.datastore.preferences)
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.viewmodel.compose)
  implementation(libs.kotlinx.coroutines.android)
  implementation(libs.kotlinx.coroutines.play.services)
  implementation(libs.kotlinx.serialization.json)
  implementation(libs.okhttp)
  implementation(libs.okhttp.sse)
  implementation(libs.retrofit)
  implementation(libs.retrofit.converter.kotlinx.serialization)
  implementation(libs.coil.compose)
  implementation(libs.coil.svg)
  implementation(libs.coil.network.okhttp)
  implementation(libs.markdown.renderer.m3)
  implementation(libs.firebase.auth)
  implementation(libs.androidx.credentials)
  implementation(libs.androidx.credentials.play.services)
  implementation(libs.googleid)
  debugImplementation(libs.androidx.compose.ui.tooling)
}
