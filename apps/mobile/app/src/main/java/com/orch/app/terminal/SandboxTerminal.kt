package com.orch.app.terminal

import androidx.compose.runtime.Immutable
import com.orch.app.data.OrchClient
import com.orch.app.data.OrchJson
import com.orch.app.data.parseErrorBody
import com.orch.app.data.toApiError
import io.sentry.Sentry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

enum class TerminalStatus { Disconnected, Connecting, Connected, Exited }

@Immutable
data class TerminalUi(
    val workspace: String = "",
    val status: TerminalStatus = TerminalStatus.Disconnected,
    val output: String = "",
    val error: String? = null
)

class SandboxTerminal(private val client: OrchClient) {
    private val _state = MutableStateFlow(TerminalUi())
    val state: StateFlow<TerminalUi> = _state.asStateFlow()

    private val lock = Any()
    private val renderScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var renderJob: Job? = null
    private var renderPending = false
    private val lines = ArrayDeque<StringBuilder>().apply { addLast(StringBuilder()) }
    private var cursorCol = 0
    private var cursorRow = 0
    private val csiParams = StringBuilder()
    private var escState = EscState.Normal
    private var socket: WebSocket? = null
    private var connectionGen = 0L
    private var activeWorkspace = ""
    private var currentCols = DEFAULT_COLS
    private var currentRows = DEFAULT_ROWS

    fun connect(workspace: String, cols: Int = currentCols, rows: Int = currentRows) {
        val clampedCols = cols.coerceIn(MIN_COLS, MAX_COLS)
        val clampedRows = rows.coerceIn(MIN_ROWS, MAX_ROWS)
        val gen: Long = synchronized(lock) {
            if (socket != null && activeWorkspace == workspace &&
                (_state.value.status == TerminalStatus.Connecting || _state.value.status == TerminalStatus.Connected)
            ) {
                return
            }
            socket?.close(1000, "reconnect")
            socket = null
            activeWorkspace = workspace
            currentCols = clampedCols
            currentRows = clampedRows
            ++connectionGen
        }

        _state.update {
            it.copy(
                workspace = workspace,
                status = TerminalStatus.Connecting,
                error = null
            )
        }

        val url = client.baseUrl.newBuilder()
            .addPathSegments("cloud/terminal")
            .addQueryParameter("workspace", workspace)
            .addQueryParameter("cols", clampedCols.toString())
            .addQueryParameter("rows", clampedRows.toString())
            .build()

        val request = Request.Builder().url(url).build()
        val opened = client.sseHttp.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    synchronized(lock) {
                        if (connectionGen != gen) {
                            webSocket.close(1000, "stale")
                            return
                        }
                    }
                    _state.update { it.copy(status = TerminalStatus.Connected, error = null) }
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    synchronized(lock) {
                        if (connectionGen != gen) return
                    }
                    val root = runCatching { OrchJson.parseToJsonElement(text).jsonObject }.getOrNull() ?: return
                    when (root.str("type")) {
                        "data" -> {
                            val chunk = (root["data"] as? JsonPrimitive)?.contentOrNull ?: return
                            appendChunk(chunk)
                        }
                        "exit" -> {
                            synchronized(lock) {
                                if (connectionGen == gen) socket = null
                            }
                            _state.update { it.copy(status = TerminalStatus.Exited) }
                        }
                    }
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(1000, null)
                    synchronized(lock) {
                        if (connectionGen != gen) return
                        socket = null
                    }
                    _state.update {
                        if (it.status == TerminalStatus.Connected || it.status == TerminalStatus.Connecting) {
                            it.copy(status = TerminalStatus.Exited)
                        } else {
                            it
                        }
                    }
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Sentry.captureException(t)
                    synchronized(lock) {
                        if (connectionGen != gen) return
                        socket = null
                    }
                    val message = if (response != null && !response.isSuccessful) {
                        parseErrorBody(response.code, runCatching { response.body?.string().orEmpty() }.getOrDefault("")).message
                    } else {
                        t.toApiError().message
                    }
                    _state.update { it.copy(status = TerminalStatus.Disconnected, error = message) }
                }
            }
        )
        synchronized(lock) {
            if (connectionGen == gen) {
                socket = opened
            } else {
                opened.close(1000, "stale")
            }
        }
    }

    fun sendInput(data: String) {
        if (data.isEmpty()) return
        val ws = synchronized(lock) { socket } ?: return
        val payload = OrchJson.encodeToString(
            buildJsonObject {
                put("type", "input")
                put("data", data)
            }
        )
        ws.send(payload)
    }

    fun resize(cols: Int, rows: Int) {
        val c = cols.coerceIn(MIN_COLS, MAX_COLS)
        val r = rows.coerceIn(MIN_ROWS, MAX_ROWS)
        val ws = synchronized(lock) {
            if (c == currentCols && r == currentRows) return
            currentCols = c
            currentRows = r
            socket
        } ?: return
        val payload = OrchJson.encodeToString(
            buildJsonObject {
                put("type", "resize")
                put("cols", c)
                put("rows", r)
            }
        )
        ws.send(payload)
    }

    fun clearOutput() {
        synchronized(lock) {
            renderJob?.cancel()
            renderJob = null
            renderPending = false
            lines.clear()
            lines.addLast(StringBuilder())
            cursorCol = 0
            cursorRow = 0
            csiParams.clear()
            escState = EscState.Normal
        }
        _state.update { it.copy(output = "") }
    }

    fun disconnect() {
        val ws = synchronized(lock) {
            connectionGen++
            val existing = socket
            socket = null
            existing
        } ?: return
        ws.send(OrchJson.encodeToString(buildJsonObject { put("type", "close") }))
        ws.close(1000, "closed")
        _state.update { it.copy(status = TerminalStatus.Disconnected) }
    }

    private fun appendChunk(chunk: String) {
        synchronized(lock) {
            for (ch in chunk) {
                when (escState) {
                    EscState.Normal -> when (ch) {
                        '\u001B' -> escState = EscState.Esc
                        '\u0007' -> Unit
                        '\r' -> cursorCol = 0
                        '\n' -> {
                            if (cursorRow == lines.lastIndex) {
                                lines.addLast(StringBuilder())
                                if (lines.size > MAX_SCROLLBACK_LINES) lines.removeFirst()
                                cursorRow = lines.lastIndex
                            } else {
                                cursorRow++
                            }
                            cursorCol = 0
                        }
                        '\b' -> if (cursorCol > 0) cursorCol--
                        '\t' -> writeChars("    ")
                        else -> if (ch >= ' ') writeChar(ch)
                    }
                    EscState.Esc -> when (ch) {
                        '[' -> {
                            csiParams.clear()
                            escState = EscState.Csi
                        }
                        ']' -> escState = EscState.Osc
                        '(', ')', '*', '+' -> escState = EscState.Charset
                        else -> escState = EscState.Normal
                    }
                    EscState.Charset -> escState = EscState.Normal
                    EscState.Csi -> {
                        if (ch in '@'..'~') {
                            applyCsi(ch, csiParams.toString())
                            csiParams.clear()
                            escState = EscState.Normal
                        } else if (csiParams.length < MAX_CSI_PARAMS) {
                            csiParams.append(ch)
                        }
                    }
                    EscState.Osc -> when (ch) {
                        '\u0007' -> escState = EscState.Normal
                        '\u001B' -> escState = EscState.OscEsc
                    }
                    EscState.OscEsc -> {
                        escState = if (ch == '\\') EscState.Normal else EscState.Osc
                    }
                }
            }
            renderPending = true
        }
        scheduleRender()
    }

    private fun scheduleRender() {
        synchronized(lock) {
            if (renderJob?.isActive == true) return
            renderJob = renderScope.launch {
                delay(RENDER_INTERVAL_MS)
                publishOutput()
                synchronized(lock) {
                    renderJob = null
                    if (renderPending) scheduleRender()
                }
            }
        }
    }

    private fun publishOutput() {
        val rendered = synchronized(lock) {
            renderPending = false
            buildString {
                lines.forEachIndexed { index, sb ->
                    if (index > 0) append('\n')
                    append(sb)
                }
            }
        }
        _state.update { it.copy(output = rendered) }
    }

    private fun applyCsi(command: Char, rawParams: String) {
        val params = rawParams.trimStart('?', '>').split(';').map { it.toIntOrNull() ?: 0 }
        fun amount(index: Int = 0): Int = (params.getOrNull(index) ?: 0).let { if (it <= 0) 1 else it }
        fun position(index: Int, fallback: Int): Int = (params.getOrNull(index) ?: 0).let { if (it <= 0) fallback else it }

        when (command) {
            'A' -> cursorRow = (cursorRow - amount()).coerceAtLeast(0)
            'B', 'e' -> cursorRow = (cursorRow + amount()).coerceAtMost(lines.lastIndex)
            'C', 'a' -> cursorCol = (cursorCol + amount()).coerceAtMost(MAX_LINE_COLS)
            'D' -> cursorCol = (cursorCol - amount()).coerceAtLeast(0)
            'E' -> {
                cursorRow = (cursorRow + amount()).coerceAtMost(lines.lastIndex)
                cursorCol = 0
            }
            'F' -> {
                cursorRow = (cursorRow - amount()).coerceAtLeast(0)
                cursorCol = 0
            }
            'G', '`' -> cursorCol = (position(0, 1) - 1).coerceIn(0, MAX_LINE_COLS)
            'd' -> cursorRow = (position(0, 1) - 1).coerceIn(0, lines.lastIndex)
            'H', 'f' -> {
                cursorRow = (position(0, 1) - 1).coerceIn(0, lines.lastIndex)
                cursorCol = (position(1, 1) - 1).coerceIn(0, MAX_LINE_COLS)
            }
            'J' -> when (params.firstOrNull() ?: 0) {
                2, 3 -> {
                    lines.clear()
                    lines.addLast(StringBuilder())
                    cursorRow = 0
                    cursorCol = 0
                }
                1 -> {
                    for (index in 0..cursorRow) lines[index].clear()
                }
                else -> {
                    lines[cursorRow].setLength(cursorCol.coerceAtMost(lines[cursorRow].length))
                    while (lines.size > cursorRow + 1) lines.removeLast()
                }
            }
            'K' -> when (params.firstOrNull() ?: 0) {
                1 -> {
                    val line = lines[cursorRow]
                    val end = (cursorCol + 1).coerceAtMost(line.length)
                    for (i in 0 until end) line.setCharAt(i, ' ')
                }
                2 -> lines[cursorRow].clear()
                else -> lines[cursorRow].setLength(cursorCol.coerceAtMost(lines[cursorRow].length))
            }
            else -> Unit
        }
    }

    private fun writeChars(text: String) {
        for (ch in text) writeChar(ch)
    }

    private fun writeChar(ch: Char) {
        if (cursorCol >= MAX_LINE_COLS) return
        cursorRow = cursorRow.coerceIn(0, lines.lastIndex)
        val line = lines[cursorRow]
        while (line.length < cursorCol) line.append(' ')
        if (cursorCol == line.length) {
            line.append(ch)
        } else {
            line.setCharAt(cursorCol, ch)
        }
        cursorCol++
    }

    private enum class EscState { Normal, Esc, Csi, Osc, OscEsc, Charset }

    fun shutdown() {
        disconnect()
        renderScope.cancel()
    }

    private companion object {
        const val DEFAULT_COLS = 80
        const val DEFAULT_ROWS = 24
        const val MIN_COLS = 10
        const val MAX_COLS = 500
        const val MIN_ROWS = 4
        const val MAX_ROWS = 200
        const val MAX_LINE_COLS = 4096
        const val MAX_SCROLLBACK_LINES = 1500
        const val MAX_CSI_PARAMS = 64
        const val RENDER_INTERVAL_MS = 50L
    }
}

private fun JsonObject.str(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
