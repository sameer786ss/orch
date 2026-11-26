package com.orch.app.ui

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.runtime.Immutable
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.orch.app.chat.ChatReducer
import com.orch.app.chat.ChatRow
import com.orch.app.chat.EarlierRow
import com.orch.app.chat.LIVE_STEP_EVENTS
import com.orch.app.chat.UserAttachment
import com.orch.app.chat.buildRows
import com.orch.app.data.ApiError
import com.orch.app.data.ArtifactLoader
import com.orch.app.data.ArtifactState
import com.orch.app.data.AttachmentSource
import com.orch.app.data.Budget
import com.orch.app.data.CancelRequest
import com.orch.app.data.ChatRequest
import com.orch.app.data.CloudProject
import com.orch.app.data.ConnectorAccount
import com.orch.app.data.ConnectorConnectRequest
import com.orch.app.data.ConnectorDefinition
import com.orch.app.data.CreateProjectRequest
import com.orch.app.data.FileEntry
import com.orch.app.data.GithubAccount
import com.orch.app.data.GithubConnectRequest
import com.orch.app.data.GithubRepo
import com.orch.app.data.ModelInfo
import com.orch.app.data.OpenProjectRequest
import com.orch.app.data.OrchClient
import com.orch.app.data.OrchPreferences
import com.orch.app.data.OrchStream
import com.orch.app.data.SessionSummary
import com.orch.app.data.SseFrame
import com.orch.app.data.TranscribeRequest
import com.orch.app.data.TreeEntry
import com.orch.app.data.runCatchingSuspend
import com.orch.app.data.toApiError
import com.orch.app.terminal.SandboxTerminal
import com.orch.app.terminal.TerminalUi
import com.orch.app.ui.chat.clearThumbnailCache
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.util.UUID
import kotlin.math.min

@Immutable
data class WorkspaceUi(
    val projects: List<CloudProject> = emptyList(),
    val projectsFailed: Boolean = false,
    val activeProjectId: String? = null,
    val deletingProjectId: String? = null,
    val sessions: List<SessionSummary> = emptyList(),
    val sessionsFailed: Boolean = false
)

@Immutable
data class GithubUi(
    val account: GithubAccount? = null,
    val accountLoading: Boolean = false,
    val connecting: Boolean = false,
    val disconnecting: Boolean = false,
    val error: String? = null,
    val repos: List<GithubRepo> = emptyList(),
    val reposLoading: Boolean = false,
    val reposError: String? = null,
    val projectBusy: Boolean = false,
    val projectError: String? = null
)

@Immutable
data class ModelUi(
    val models: List<ModelInfo> = emptyList(),
    val selectedModelId: String = "",
    val thinkingEffort: String = "low"
)

@Immutable
data class ArtifactUi(
    val state: ArtifactState = ArtifactState.Hidden,
    val saving: Boolean = false
)

@Immutable
data class ChatUi(
    val sessionId: String,
    val rows: List<ChatRow> = emptyList(),
    val streaming: Boolean = false,
    val loading: Boolean = false,
    val loadFailed: Boolean = false,
    val project: CloudProject? = null,
    val projectLocked: Boolean = false,
    val contextTokens: Long = 0
) {
    val canSend: Boolean get() = !loadFailed && project != null
}

@Immutable
data class PendingAttachment(
    val uri: Uri,
    val name: String,
    val size: Long,
    val isImage: Boolean
)

@Immutable
data class FilesUi(
    val currentPath: String = "",
    val query: String = "",
    val treeEntries: List<TreeEntry> = emptyList(),
    val treeTruncated: Boolean = false,
    val searchEntries: List<FileEntry> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null
)

@Immutable
data class ConnectorItemUi(
    val definition: ConnectorDefinition,
    val accountId: String? = null,
    val connected: Boolean = false,
    val active: Boolean = false,
    val busy: Boolean = false
)

@Immutable
data class ConnectorsUi(
    val items: List<ConnectorItemUi> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null
) {
    val activeIds: List<String>
        get() = items.filter { it.connected && it.active }.map { it.definition.id }
}

class OrchViewModel(application: Application) : AndroidViewModel(application) {
    private val client = OrchClient()
    private val api = client.api
    private val stream = OrchStream(client, application.cacheDir)
    private val preferences = OrchPreferences(application)
    private val artifactLoader = ArtifactLoader(api, application.cacheDir)
    private val terminal = SandboxTerminal(client)
    private val resolver = application.contentResolver
    private val reducer = ChatReducer()

    private val _workspace = MutableStateFlow(WorkspaceUi())
    val workspace: StateFlow<WorkspaceUi> = _workspace.asStateFlow()

    private val _github = MutableStateFlow(GithubUi())
    val github: StateFlow<GithubUi> = _github.asStateFlow()

    private val _modelUi = MutableStateFlow(ModelUi())
    val modelUi: StateFlow<ModelUi> = _modelUi.asStateFlow()

    private val _budget = MutableStateFlow<Budget?>(null)
    val budget: StateFlow<Budget?> = _budget.asStateFlow()

    private val _chat = MutableStateFlow(ChatUi(sessionId = newSessionId()))
    val chat: StateFlow<ChatUi> = _chat.asStateFlow()

    private val _attachments = MutableStateFlow<List<PendingAttachment>>(emptyList())
    val attachments: StateFlow<List<PendingAttachment>> = _attachments.asStateFlow()

    private val _files = MutableStateFlow(FilesUi())
    val files: StateFlow<FilesUi> = _files.asStateFlow()

    private val _connectors = MutableStateFlow(ConnectorsUi())
    val connectors: StateFlow<ConnectorsUi> = _connectors.asStateFlow()

    private val _artifactUi = MutableStateFlow(ArtifactUi())
    val artifactUi: StateFlow<ArtifactUi> = _artifactUi.asStateFlow()

    val terminalState: StateFlow<TerminalUi> = terminal.state

    private val _notices = MutableSharedFlow<String>(extraBufferCapacity = 16)
    val notices: SharedFlow<String> = _notices.asSharedFlow()

    private val _saveResults = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val saveResults: SharedFlow<String> = _saveResults.asSharedFlow()

    private var streamJob: Job? = null
    private var cancelFallbackJob: Job? = null
    private var titleJob: Job? = null
    private var filesJob: Job? = null
    private var fileRefreshJob: Job? = null
    private var historyJob: Job? = null
    private var artifactJob: Job? = null
    private var modelsJob: Job? = null
    private var connectorsJob: Job? = null
    private var projectsJob: Job? = null
    private var githubReposJob: Job? = null
    private var publishJob: Job? = null
    private var earliestSeq: Long? = null
    private var hasMore = false
    private var loadingEarlier = false
    private var earlierFailed = false
    private var pagingGeneration = 0
    private var pendingConnectToolkit: String? = null
    private var lastLoadedAccounts: List<ConnectorAccount> = emptyList()
    private var connectorDefinitions: List<ConnectorDefinition> = emptyList()
    private val deleting = HashSet<String>()
    private var lastForegroundSyncMs = 0L
    private val sessionCache = object : LinkedHashMap<String, HistoryPage>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, HistoryPage>?) = size > 15
    }

    init {
        loadModels(reportFailure = true)
        loadConnectors()
        refreshGithubAccounts()
        refreshProjects()
        refreshSessions()
    }

    private fun newSessionId(): String = UUID.randomUUID().toString()

    private fun notice(message: String) {
        _notices.tryEmit(message)
    }

    private fun report(error: Throwable) {
        notice(error.toApiError().message)
    }

    private fun resolveThinkingEffort(model: ModelInfo, preferred: String?): String {
        val matched = preferred?.let { target ->
            model.thinkingEfforts.firstOrNull { it.equals(target, ignoreCase = true) }
        }
        return matched ?: model.defaultThinkingEffort
    }

    private fun loadModels(reportFailure: Boolean) {
        if (modelsJob?.isActive == true) return
        modelsJob = viewModelScope.launch {
            val savedModelId = preferences.modelId.first()
            val savedEffort = preferences.thinkingEffort.first()?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
            if (savedEffort != null) {
                _modelUi.update { it.copy(thinkingEffort = savedEffort) }
            }
            runCatchingSuspend { api.models() }
                .onSuccess { list ->
                    _modelUi.update { current ->
                        val nextId = list.firstOrNull { it.id == current.selectedModelId }?.id
                            ?: list.firstOrNull { it.id == savedModelId }?.id
                            ?: list.firstOrNull()?.id.orEmpty()
                        val model = list.firstOrNull { it.id == nextId }
                        val nextEffort = model?.let {
                            resolveThinkingEffort(it, savedEffort ?: current.thinkingEffort)
                        } ?: current.thinkingEffort
                        ModelUi(
                            models = list,
                            selectedModelId = nextId,
                            thinkingEffort = nextEffort
                        )
                    }
                }
                .onFailure { if (reportFailure) report(it) }
        }
    }

    fun selectModel(id: String) {
        _modelUi.update { current ->
            val model = current.models.firstOrNull { it.id == id }
            val nextEffort = model?.let { resolveThinkingEffort(it, current.thinkingEffort) }
                ?: current.thinkingEffort
            current.copy(selectedModelId = id, thinkingEffort = nextEffort)
        }
        viewModelScope.launch { preferences.setModelId(id) }
    }

    fun selectThinkingEffort(effort: String) {
        val current = _modelUi.value
        val model = current.models.firstOrNull { it.id == current.selectedModelId }
        val matched = model?.thinkingEfforts?.firstOrNull { it.equals(effort, ignoreCase = true) } ?: return
        _modelUi.update { it.copy(thinkingEffort = matched) }
        viewModelScope.launch { preferences.setThinkingEffort(matched) }
    }

    fun loadConnectors() {
        if (connectorsJob?.isActive == true) return
        connectorsJob = viewModelScope.launch {
            _connectors.update { it.copy(loading = true, error = null) }
            val savedActive = preferences.activeConnectors.first().toMutableSet()
            val definitions = runCatchingSuspend { api.connectorCatalog() }.getOrElse { error ->
                _connectors.update { state ->
                    state.copy(loading = false, error = error.toApiError().message)
                }
                return@launch
            }
            connectorDefinitions = definitions
            runCatchingSuspend { api.connectorAccounts() }
                .onSuccess { response ->
                    lastLoadedAccounts = response.accounts
                    val pending = pendingConnectToolkit
                    if (pending != null && response.accounts.any { it.toolkit.equals(pending, ignoreCase = true) }) {
                        savedActive += pending
                        pendingConnectToolkit = null
                        preferences.setActiveConnectors(savedActive)
                    }
                    rebuildConnectors(response.accounts, savedActive, loading = false, error = null)
                }
                .onFailure { error ->
                    _connectors.update { it.copy(loading = false, error = error.toApiError().message) }
                }
        }
    }

    private fun rebuildConnectors(
        accounts: List<ConnectorAccount>,
        activeSet: Set<String>,
        loading: Boolean,
        error: String?
    ) {
        val byToolkit = accounts.associateBy { it.toolkit.lowercase() }
        val busyMap = _connectors.value.items.associate { it.definition.id to it.busy }
        _connectors.value = ConnectorsUi(
            items = connectorDefinitions.map { def ->
                val account = byToolkit[def.id]
                ConnectorItemUi(
                    definition = def,
                    accountId = account?.id,
                    connected = account != null,
                    active = account != null && def.id in activeSet,
                    busy = busyMap[def.id] == true
                )
            },
            loading = loading,
            error = error
        )
    }

    fun toggleConnector(id: String) {
        val item = _connectors.value.items.firstOrNull { it.definition.id == id } ?: return
        if (!item.connected) return
        val nextActive = _connectors.value.items
            .filter { it.connected && if (it.definition.id == id) !it.active else it.active }
            .mapTo(HashSet()) { it.definition.id }
        rebuildConnectors(lastLoadedAccounts, nextActive, loading = _connectors.value.loading, error = _connectors.value.error)
        viewModelScope.launch { preferences.setActiveConnectors(nextActive) }
    }

    fun connectConnector(id: String, onOpenUrl: (String) -> Unit) {
        setConnectorBusy(id, true)
        viewModelScope.launch {
            runCatchingSuspend { api.connectConnector(ConnectorConnectRequest(id)) }
                .onSuccess { response ->
                    pendingConnectToolkit = id
                    setConnectorBusy(id, false)
                    onOpenUrl(response.redirectUrl)
                }
                .onFailure { error ->
                    setConnectorBusy(id, false)
                    report(error)
                }
        }
    }

    fun disconnectConnector(id: String, accountId: String) {
        setConnectorBusy(id, true)
        viewModelScope.launch {
            runCatchingSuspend { api.disconnectConnector(accountId) }
                .onSuccess {
                    lastLoadedAccounts = lastLoadedAccounts.filterNot { it.id == accountId || it.toolkit.equals(id, ignoreCase = true) }
                    val nextActive = preferences.activeConnectors.first().toMutableSet().apply { remove(id) }
                    preferences.setActiveConnectors(nextActive)
                    setConnectorBusy(id, false)
                    rebuildConnectors(lastLoadedAccounts, nextActive, loading = false, error = null)
                }
                .onFailure { error ->
                    setConnectorBusy(id, false)
                    report(error)
                }
        }
    }

    private fun setConnectorBusy(id: String, busy: Boolean) {
        _connectors.update { state ->
            state.copy(
                items = state.items.map {
                    if (it.definition.id == id) it.copy(busy = busy) else it
                }
            )
        }
    }

    private fun findProjectForWorkspace(workspacePath: String?, list: List<CloudProject> = _workspace.value.projects): CloudProject? {
        val path = workspacePath?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return list.firstOrNull { it.workspace == path }
    }

    private fun resolveActiveProject(list: List<CloudProject>, preferredId: String?): CloudProject? =
        preferredId?.let { id -> list.firstOrNull { it.id == id } } ?: list.firstOrNull()

    fun refreshProjects() {
        if (projectsJob?.isActive == true) return
        projectsJob = viewModelScope.launch { loadProjects() }
    }

    private suspend fun loadProjects(): List<CloudProject>? {
        val savedPreferred = _workspace.value.activeProjectId ?: preferences.activeProjectId.first()
        val remote = runCatchingSuspend { api.projects() }.getOrNull()
        if (remote == null) {
            _workspace.update { it.copy(projectsFailed = true) }
            return null
        }
        val active = resolveActiveProject(remote, savedPreferred)
        _workspace.update {
            it.copy(
                projects = remote,
                projectsFailed = false,
                activeProjectId = active?.id
            )
        }
        if (active?.id != savedPreferred) {
            preferences.setActiveProjectId(active?.id)
        }
        _chat.update { ui ->
            val currentProject = ui.project
            val refreshed = currentProject?.let { prev -> remote.firstOrNull { it.id == prev.id } }
            val nextProject = when {
                refreshed != null -> refreshed
                ui.projectLocked || ui.rows.isNotEmpty() -> null
                else -> active
            }
            ui.copy(project = nextProject)
        }
        return remote
    }

    fun refreshGithubAccounts(reloadRepos: Boolean = false) {
        viewModelScope.launch {
            _github.update { it.copy(accountLoading = true) }
            runCatchingSuspend { api.githubAccount() }
                .onSuccess { account ->
                    _github.update { it.copy(account = account, accountLoading = false, error = null) }
                    if (reloadRepos && account != null) {
                        loadGithubRepos(query = "")
                    }
                }
                .onFailure { error ->
                    _github.update { it.copy(accountLoading = false, error = error.toApiError().message) }
                }
        }
    }

    fun connectGithub(onOpenUrl: (String) -> Unit) {
        if (_github.value.connecting) return
        _github.update { it.copy(connecting = true, error = null) }
        viewModelScope.launch {
            runCatchingSuspend { api.connectGithub(GithubConnectRequest("mobile")) }
                .onSuccess { response ->
                    _github.update { it.copy(connecting = false) }
                    onOpenUrl(response.redirectUrl)
                }
                .onFailure { error ->
                    val message = error.toApiError().message
                    _github.update { it.copy(connecting = false, error = message) }
                    notice(message)
                }
        }
    }

    fun disconnectGithub() {
        if (_github.value.disconnecting) return
        _github.update { it.copy(disconnecting = true, error = null) }
        viewModelScope.launch {
            runCatchingSuspend { api.disconnectGithub() }
                .onSuccess {
                    _github.update { it.copy(disconnecting = false) }
                    refreshGithubAccounts()
                    refreshProjects()
                }
                .onFailure { error ->
                    val message = error.toApiError().message
                    _github.update { it.copy(disconnecting = false, error = message) }
                    notice(message)
                }
        }
    }

    fun loadGithubRepos(query: String = "") {
        githubReposJob?.cancel()
        githubReposJob = viewModelScope.launch {
            _github.update { it.copy(reposLoading = true, reposError = null) }
            runCatchingSuspend { api.githubRepos(query.trim().ifEmpty { null }) }
                .onSuccess { list ->
                    _github.update { it.copy(repos = list, reposLoading = false) }
                }
                .onFailure { error ->
                    _github.update {
                        it.copy(
                            repos = emptyList(),
                            reposLoading = false,
                            reposError = error.toApiError().message
                        )
                    }
                }
        }
    }

    fun clearProjectError() {
        _github.update { it.copy(projectError = null) }
    }

    private fun activateProject(project: CloudProject) {
        _workspace.update { state ->
            state.copy(
                projects = listOf(project) + state.projects.filterNot { it.id == project.id },
                projectsFailed = false
            )
        }
        newChat(projectId = project.id)
    }

    fun openGithubProject(repoUrl: String, onSuccess: () -> Unit) {
        if (_github.value.projectBusy) return
        _github.update { it.copy(projectBusy = true, projectError = null) }
        viewModelScope.launch {
            runCatchingSuspend { api.openProject(OpenProjectRequest(repoUrl = repoUrl)) }
                .onSuccess { project ->
                    _github.update { it.copy(projectBusy = false) }
                    activateProject(project)
                    onSuccess()
                }
                .onFailure { error ->
                    _github.update { it.copy(projectBusy = false, projectError = error.toApiError().message) }
                }
        }
    }

    fun createGithubProject(
        name: String,
        description: String?,
        private: Boolean,
        onSuccess: () -> Unit
    ) {
        if (_github.value.projectBusy) return
        val cleanName = name.trim()
        if (cleanName.isEmpty()) {
            _github.update { it.copy(projectError = "Repository name is required.") }
            return
        }
        _github.update { it.copy(projectBusy = true, projectError = null) }
        viewModelScope.launch {
            runCatchingSuspend {
                api.createProject(
                    CreateProjectRequest(
                        name = cleanName,
                        description = description?.trim()?.ifEmpty { null },
                        private = private
                    )
                )
            }
                .onSuccess { project ->
                    _github.update { it.copy(projectBusy = false) }
                    activateProject(project)
                    onSuccess()
                }
                .onFailure { error ->
                    _github.update { it.copy(projectBusy = false, projectError = error.toApiError().message) }
                }
        }
    }

    fun selectProject(projectId: String) {
        val state = _workspace.value
        val target = state.projects.firstOrNull { it.id == projectId } ?: return
        if (state.activeProjectId != projectId) {
            _workspace.update { it.copy(activeProjectId = projectId) }
            viewModelScope.launch { preferences.setActiveProjectId(projectId) }
        }
        if (_chat.value.project?.id != projectId) {
            val latestSession = state.sessions.firstOrNull { it.workspacePath == target.workspace }
            if (latestSession != null) {
                openSession(latestSession.id)
            } else {
                newChat(projectId = projectId)
            }
        }
    }

    fun deleteProject(projectId: String) {
        val state = _workspace.value
        if (state.deletingProjectId != null) return
        val target = state.projects.firstOrNull { it.id == projectId } ?: return
        _workspace.update { it.copy(deletingProjectId = projectId) }
        viewModelScope.launch {
            runCatchingSuspend { api.deleteProject(projectId) }
                .onSuccess {
                    val currentState = _workspace.value
                    val remaining = currentState.projects.filterNot { it.id == projectId }
                    val nextActive = if (currentState.activeProjectId == projectId) {
                        remaining.firstOrNull()
                    } else {
                        resolveActiveProject(remaining, currentState.activeProjectId)
                    }
                    _workspace.update {
                        it.copy(
                            deletingProjectId = null,
                            projects = remaining,
                            sessions = it.sessions.filterNot { s -> s.workspacePath == target.workspace },
                            activeProjectId = nextActive?.id
                        )
                    }
                    preferences.setActiveProjectId(nextActive?.id)
                    val currentProject = _chat.value.project
                    if (currentProject?.id == projectId || currentProject?.workspace == target.workspace) {
                        newChat(projectId = nextActive?.id)
                    }
                }
                .onFailure { error ->
                    _workspace.update { it.copy(deletingProjectId = null) }
                    report(error)
                    refreshProjects()
                }
        }
    }

    fun onOAuthRedirect(uri: Uri) {
        if (!uri.scheme.equals("orch", ignoreCase = true)) return
        if (!uri.host.equals("oauth", ignoreCase = true)) return
        val route = uri.path?.trim('/') ?: ""
        val status = uri.getQueryParameter("status")
        when (route) {
            "github" -> {
                if (status == "success") {
                    val login = uri.getQueryParameter("login")?.takeIf { it.isNotBlank() }
                    notice(if (login != null) "Connected GitHub @$login" else "GitHub connected")
                    _github.update { it.copy(error = null) }
                    refreshGithubAccounts(reloadRepos = true)
                    refreshProjects()
                } else {
                    val message = uri.getQueryParameter("message")?.takeIf { it.isNotBlank() }
                        ?: "GitHub connection was not completed."
                    _github.update { it.copy(error = message) }
                    notice(message)
                }
            }
            "composio" -> {
                if (status == "success") {
                    loadConnectors()
                } else {
                    pendingConnectToolkit = null
                    notice("The connector sign-in was not completed.")
                }
            }
        }
    }

    fun refreshSessions() {
        viewModelScope.launch { loadSessions() }
    }

    private suspend fun loadSessions(): List<SessionSummary>? {
        val remote = runCatchingSuspend { api.sessions() }.getOrNull()
        if (remote == null) {
            _workspace.update { it.copy(sessionsFailed = true) }
            return null
        }
        val ids = remote.mapTo(HashSet()) { it.id }
        val previous = _workspace.value.sessions.associateBy { it.id }
        val currentId = _chat.value.sessionId
        val local = previous[currentId]?.takeIf { it.id !in ids }
        val merged = remote
            .filter { it.id !in deleting }
            .map { summary ->
                if (summary.title.isNullOrBlank()) summary.copy(title = previous[summary.id]?.title) else summary
            }
        _workspace.update {
            it.copy(
                sessions = (merged + listOfNotNull(local)).sortedByDescending { s -> s.updatedAt },
                sessionsFailed = false
            )
        }
        return remote
    }

    fun refreshBudget() {
        viewModelScope.launch { runCatchingSuspend { api.budget() }.onSuccess { _budget.value = it } }
    }

    fun onForeground() {
        val now = System.currentTimeMillis()
        if (now - lastForegroundSyncMs < 60_000L) return
        lastForegroundSyncMs = now
        refreshBudget()
        if (_modelUi.value.models.isEmpty()) loadModels(reportFailure = false)
        loadConnectors()
        refreshGithubAccounts()
        viewModelScope.launch {
            val projectsDeferred = async { loadProjects() }
            val sessionsDeferred = async { loadSessions() }
            projectsDeferred.await()
            val remote = sessionsDeferred.await() ?: return@launch
            val current = _chat.value
            val running = remote.firstOrNull { it.id == current.sessionId }?.running == true
            if (running && streamJob?.isActive != true && !current.streaming && !current.loading) {
                openSession(current.sessionId, force = true)
            }
        }
    }

    fun newChat(projectId: String? = null) {
        stopTracking()
        reducer.clear()
        _attachments.value = emptyList()
        resetPaging()
        val state = _workspace.value
        val resolvedId = projectId ?: _chat.value.project?.id ?: state.activeProjectId
        val project = resolveActiveProject(state.projects, resolvedId)
        _workspace.update { it.copy(activeProjectId = project?.id) }
        viewModelScope.launch { preferences.setActiveProjectId(project?.id) }
        _chat.value = ChatUi(
            sessionId = newSessionId(),
            project = project
        )
    }

    fun openSession(id: String, force: Boolean = false) {
        val sameSession = id == _chat.value.sessionId
        if (!force && sameSession && _chat.value.rows.isNotEmpty()) return
        stopTracking()
        reducer.clear()
        resetPaging()
        if (!sameSession) _attachments.value = emptyList()
        val summary = _workspace.value.sessions.firstOrNull { it.id == id }
        val initialProject = findProjectForWorkspace(summary?.workspacePath)
            ?: _chat.value.project.takeIf { sameSession }
        reducer.setContextTokens(summary?.contextTokens ?: 0)
        val cached = if (!force) sessionCache[id] else null
        if (cached != null) {
            reducer.load(cached.records)
            earliestSeq = cached.earliestSeq
            hasMore = cached.hasMore
            _chat.value = ChatUi(
                sessionId = id,
                loading = false,
                project = initialProject,
                contextTokens = summary?.contextTokens ?: 0
            )
            publishNow()
        } else {
            _chat.value = ChatUi(
                sessionId = id,
                loading = true,
                project = initialProject,
                contextTokens = summary?.contextTokens ?: 0
            )
        }
        historyJob = viewModelScope.launch {
            val history = async { runCatchingSuspend { api.history(id, HISTORY_LIMIT, null) } }
            val list = async { loadSessions() }
            val projectsList = async {
                val ws = _workspace.value
                if (ws.projects.isEmpty() || ws.projectsFailed) loadProjects() else ws.projects
            }
            val page = history.await().getOrElse {
                if (cached == null) {
                    report(it)
                    _chat.update { ui -> ui.copy(loading = false, loadFailed = true) }
                }
                return@launch
            }
            sessionCache[id] = page
            val remoteSummary = list.await()?.firstOrNull { it.id == id }
            val loadedProjects = projectsList.await() ?: _workspace.value.projects
            val running = remoteSummary?.running ?: (summary?.running == true)
            val workspacePath = remoteSummary?.workspacePath ?: summary?.workspacePath
            val resolvedProject = findProjectForWorkspace(workspacePath, loadedProjects)
                ?: _chat.value.project
            if (resolvedProject != null) {
                _workspace.update { it.copy(activeProjectId = resolvedProject.id) }
                preferences.setActiveProjectId(resolvedProject.id)
            }
            remoteSummary?.contextTokens?.let { reducer.setContextTokens(it) }
            reducer.load(page.records)
            earliestSeq = page.earliestSeq
            hasMore = page.hasMore
            _chat.update { it.copy(loading = false, project = resolvedProject) }
            if (running) {
                reducer.beginFollow()
                publishNow()
                runStream(id) { lastId, _ -> stream.resume(id, lastId) }
            } else {
                publishNow()
            }
        }
    }

    fun loadEarlier() {
        val before = earliestSeq ?: return
        val id = _chat.value.sessionId
        if (loadingEarlier || reducer.streaming || !hasMore) return
        loadingEarlier = true
        earlierFailed = false
        val generation = pagingGeneration
        publishNow()
        viewModelScope.launch {
            val result = runCatchingSuspend { api.history(id, HISTORY_LIMIT, before) }
            if (generation != pagingGeneration) return@launch
            result
                .onSuccess { page ->
                    reducer.prepend(page.records)
                    earliestSeq = page.earliestSeq
                    hasMore = page.hasMore
                }
                .onFailure {
                    earlierFailed = true
                    report(it)
                }
            loadingEarlier = false
            publishNow()
        }
    }

    fun deleteSession(id: String) {
        deleting += id
        sessionCache.remove(id)
        val sessionWorkspace = _workspace.value.sessions.firstOrNull { it.id == id }?.workspacePath
        val targetProjectId = findProjectForWorkspace(sessionWorkspace)?.id
            ?: _chat.value.project?.id
            ?: _workspace.value.activeProjectId
        _workspace.update { state -> state.copy(sessions = state.sessions.filterNot { it.id == id }) }
        if (_chat.value.sessionId == id) newChat(projectId = targetProjectId)
        viewModelScope.launch {
            val result = runCatchingSuspend { api.deleteSession(id) }
            deleting -= id
            result.onFailure {
                report(it)
                loadSessions()
            }
        }
    }

    fun addAttachments(uris: List<Uri>) {
        viewModelScope.launch {
            val known = _attachments.value.mapTo(HashSet()) { it.uri }
            val fresh = uris.distinct().filter { it !in known }
            val described = withContext(Dispatchers.IO) { fresh.map(::describe) }
            val unreadable = described.count { it == null }
            if (unreadable > 0) {
                notice(if (unreadable == 1) "Unable to read the selected file." else "$unreadable files could not be read.")
            }
            val current = _attachments.value
            val added = described.filterNotNull().filter { item -> current.none { it.uri == item.uri } }
            if (current.sumOf { it.size } + added.sumOf { it.size } > MAX_ATTACHMENT_BYTES) {
                notice("Attachments cannot exceed 20 MB.")
                return@launch
            }
            _attachments.value = current + added
        }
    }

    fun removeAttachment(uri: Uri) {
        _attachments.update { list -> list.filterNot { it.uri == uri } }
    }

    private fun describe(uri: Uri): PendingAttachment? = runCatching {
        var name = uri.lastPathSegment ?: "file"
        var size = -1L
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0) cursor.getString(nameIndex)?.let { name = it }
                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
            }
        }
        if (size < 0) size = resolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
        if (size < 0) {
            resolver.openInputStream(uri)?.use { /* verify readable */ } ?: return null
        }
        val mime = resolver.getType(uri)?.lowercase() ?: ""
        val ext = name.substringAfterLast('.', "").lowercase()
        val isImage = mime in SUPPORTED_IMAGE_MIMES ||
            ext in SUPPORTED_IMAGE_EXTS ||
            mime.startsWith("image/")
        PendingAttachment(uri, name, size.coerceAtLeast(0), isImage)
    }.getOrNull()

    fun send(text: String): Boolean {
        val ui = _chat.value
        val project = ui.project ?: return false
        val prompt = text.trim()
        val pending = _attachments.value
        if (ui.streaming || ui.loading || !ui.canSend || (prompt.isEmpty() && pending.isEmpty())) return false
        val modelState = _modelUi.value
        val model = modelState.models.firstOrNull { it.id == modelState.selectedModelId }
        if (model == null) {
            loadModels(reportFailure = false)
            notice("Models are not loaded yet. Trying again, send once they appear.")
            return false
        }
        val id = ui.sessionId
        val sources = pending.map { item -> AttachmentSource(item.name) { resolver.openInputStream(item.uri) } }
        val activeConnectors = _connectors.value.activeIds
        val effort = resolveThinkingEffort(model, modelState.thinkingEffort)
        reducer.beginTurn(
            prompt,
            pending.map { UserAttachment(name = it.name, previewUri = if (it.isImage) it.uri.toString() else null) }
        )
        _attachments.value = emptyList()
        publishNow()
        runStream(id, canRetryFirst = false) { lastId, retry ->
            if (retry) {
                stream.resume(id, lastId)
            } else {
                stream.chat(
                    ChatRequest(
                        sessionId = id,
                        prompt = prompt,
                        model = model.id,
                        workspace = project.workspace,
                        activeConnectors = activeConnectors,
                        thinkingEffort = effort
                    ),
                    sources
                )
            }
        }
        return true
    }

    fun stop() {
        val id = _chat.value.sessionId
        viewModelScope.launch { runCatchingSuspend { api.cancel(CancelRequest(id)) }.onFailure(::report) }
        cancelFallbackJob?.cancel()
        cancelFallbackJob = viewModelScope.launch {
            delay(CANCEL_TIMEOUT_MS)
            if (_chat.value.sessionId == id && reducer.streaming) {
                streamJob?.cancel()
                reducer.cancel()
                publishNow()
                markIdle(id)
            }
        }
    }

    private fun runStream(
        sessionId: String,
        canRetryFirst: Boolean = true,
        open: (lastId: Long, retry: Boolean) -> Flow<SseFrame>
    ) {
        cancelFallbackJob?.cancel()
        streamJob?.cancel()
        streamJob = viewModelScope.launch {
            var lastId = 0L
            var failures = 0
            var retry = false
            var received = false
            var finished = false
            var reloaded = false
            var resynced = false
            var tailError: String? = null
            while (!finished) {
                val error: ApiError? = try {
                    open(lastId, retry).collect { frame ->
                        if (!received) onFirstFrame(sessionId)
                        received = true
                        failures = 0
                        when {
                            frame.type == "resync" -> {
                                lastId = 0
                                resynced = true
                            }
                            frame.id != null && frame.id > lastId -> {
                                lastId = frame.id
                                resynced = false
                            }
                        }
                        if (frame.type in LIVE_STEP_EVENTS) resynced = false
                        if (resynced && frame.type == "error") {
                            tailError = (frame.data["message"] as? JsonPrimitive)?.contentOrNull
                                ?: (frame.data["error"] as? JsonPrimitive)?.contentOrNull
                        }
                        if (frame.type == "fileWritten") {
                            onFileWritten((frame.data["path"] as? JsonPrimitive)?.contentOrNull)
                        }
                        reducer.onFrame(frame.type, frame.data)
                        if (frame.type == "done") finished = true
                        publishSoon()
                    }
                    null
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Throwable) {
                    failure.toApiError()
                }
                if (finished) break
                failures++
                val giveUp = (error != null && !error.retryable) ||
                    failures > MAX_RETRIES || (!received && !canRetryFirst)
                if (giveUp) {
                    reloaded = recoverAfterLoss(sessionId, received, error?.message ?: "Connection lost.")
                    break
                }
                delay(min(1000L shl (failures - 1), 8000L))
                retry = true
            }
            cancelFallbackJob?.cancel()
            if (reloaded) return@launch
            if (resynced) {
                refreshBudget()
                openSession(sessionId, force = true)
                tailError?.let(::notice)
                return@launch
            }
            publishNow()
            markIdle(sessionId)
            refreshBudget()
            trackTitle(sessionId)
        }
    }

    private fun onFileWritten(path: String?) {
        if (path.isNullOrBlank()) return
        val current = _files.value
        if (current.treeEntries.isEmpty() && current.searchEntries.isEmpty()) return
        fileRefreshJob?.cancel()
        fileRefreshJob = viewModelScope.launch {
            delay(FILE_REFRESH_DEBOUNCE_MS)
            val latest = _files.value
            if (latest.treeEntries.isNotEmpty() || latest.searchEntries.isNotEmpty()) {
                browseFiles(latest.currentPath, latest.query)
            }
        }
    }

    private suspend fun recoverAfterLoss(sessionId: String, received: Boolean, message: String): Boolean {
        if (received) {
            val running = loadSessions()?.firstOrNull { it.id == sessionId }?.running
            if (running == false) {
                notice("Live updates were interrupted ($message). Showing the saved result.")
                openSession(sessionId, force = true)
                return true
            }
        }
        reducer.fail(message)
        return false
    }

    private fun markIdle(sessionId: String) {
        _workspace.update { state ->
            state.copy(
                sessions = state.sessions.map {
                    if (it.id == sessionId && it.running) it.copy(running = false) else it
                }
            )
        }
    }

    private fun onFirstFrame(sessionId: String) {
        val ui = _chat.value
        if (_workspace.value.sessions.none { it.id == sessionId }) {
            val placeholder = SessionSummary(
                id = sessionId,
                workspacePath = ui.project?.workspace,
                updatedAt = System.currentTimeMillis(),
                running = true
            )
            _workspace.update { state -> state.copy(sessions = listOf(placeholder) + state.sessions) }
        }
    }

    private fun trackTitle(sessionId: String) {
        titleJob?.cancel()
        titleJob = viewModelScope.launch {
            repeat(TITLE_ATTEMPTS) {
                val title = loadSessions()?.firstOrNull { it.id == sessionId }?.title
                if (!title.isNullOrBlank()) return@launch
                delay(TITLE_RETRY_MS)
            }
        }
    }

    private fun stopTracking() {
        streamJob?.cancel()
        cancelFallbackJob?.cancel()
        titleJob?.cancel()
        historyJob?.cancel()
        filesJob?.cancel()
        fileRefreshJob?.cancel()
        artifactJob?.cancel()
        publishJob?.cancel()
        terminal.disconnect()
        _files.value = FilesUi()
        _artifactUi.value = ArtifactUi()
    }

    private fun resetPaging() {
        pagingGeneration++
        earliestSeq = null
        hasMore = false
        loadingEarlier = false
        earlierFailed = false
    }

    private fun publishSoon() {
        if (publishJob?.isActive == true) return
        publishJob = viewModelScope.launch {
            delay(PUBLISH_INTERVAL_MS)
            publish()
        }
    }

    private fun publishNow() {
        publishJob?.cancel()
        publish()
    }

    private fun publish() {
        val rows = buildList {
            if (hasMore) add(EarlierRow(loadingEarlier, earlierFailed))
            addAll(buildRows(reducer.messages))
        }
        _chat.update {
            it.copy(
                rows = rows,
                streaming = reducer.streaming,
                projectLocked = reducer.hasUserMessage,
                contextTokens = reducer.contextTokens
            )
        }
    }

    fun browseFiles(path: String = _files.value.currentPath, query: String = _files.value.query) {
        val workspace = _chat.value.project?.workspace
        filesJob?.cancel()
        if (workspace.isNullOrBlank()) {
            _files.value = FilesUi(currentPath = path, query = query, loading = false, error = null)
            return
        }
        filesJob = viewModelScope.launch {
            _files.update {
                it.copy(
                    currentPath = path,
                    query = query,
                    loading = true,
                    error = null
                )
            }
            if (query.isNotBlank()) {
                runCatchingSuspend { api.files(workspace, query.trim(), FILE_LIST_LIMIT) }
                    .onSuccess { entries ->
                        _files.update {
                            it.copy(
                                searchEntries = entries,
                                loading = false,
                                error = null
                            )
                        }
                    }
                    .onFailure { error ->
                        _files.update {
                            it.copy(
                                searchEntries = emptyList(),
                                loading = false,
                                error = error.toApiError().message
                            )
                        }
                    }
            } else {
                runCatchingSuspend { api.fileTree(workspace, path.ifBlank { null }) }
                    .onSuccess { listing ->
                        _files.update {
                            it.copy(
                                treeEntries = listing.entries,
                                treeTruncated = listing.truncated,
                                searchEntries = emptyList(),
                                loading = false,
                                error = null
                            )
                        }
                    }
                    .onFailure { error ->
                        _files.update {
                            it.copy(
                                treeEntries = emptyList(),
                                treeTruncated = false,
                                loading = false,
                                error = error.toApiError().message
                            )
                        }
                    }
            }
        }
    }

    fun browseUp() {
        val current = _files.value.currentPath.trimEnd('/')
        if (current.isEmpty()) return
        val parent = current.substringBeforeLast('/', "")
        browseFiles(path = parent, query = "")
    }

    fun openFile(path: String) {
        val workspace = _chat.value.project?.workspace ?: return
        val name = path.trimEnd('/').substringAfterLast('/')
        artifactJob?.cancel()
        _artifactUi.update { it.copy(state = ArtifactState.Loading(name, path)) }
        artifactJob = viewModelScope.launch {
            val next = try {
                artifactLoader.load(workspace, path)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Throwable) {
                ArtifactState.Failed(name, path, failure.toApiError().message)
            }
            _artifactUi.update { it.copy(state = next) }
        }
    }

    fun closeArtifact() {
        artifactJob?.cancel()
        _artifactUi.update { it.copy(state = ArtifactState.Hidden) }
    }

    fun saveArtifact(destination: Uri) {
        val current = _artifactUi.value
        val (path, name) = when (val state = current.state) {
            is ArtifactState.Ready -> state.path to state.name
            is ArtifactState.Failed -> state.path to state.name
            else -> return
        }
        if (current.saving) return
        val workspace = _chat.value.project?.workspace ?: return
        _artifactUi.update { it.copy(saving = true) }
        viewModelScope.launch {
            val message = try {
                withContext(Dispatchers.IO) {
                    val file = artifactLoader.download(workspace, path, name)
                    val output = resolver.openOutputStream(destination, "wt")
                        ?: throw ApiError(-1, "Unable to write the file.")
                    output.use { sink -> file.inputStream().use { it.copyTo(sink) } }
                }
                "Saved $name"
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Throwable) {
                failure.toApiError().message
            } finally {
                _artifactUi.update { it.copy(saving = false) }
            }
            _saveResults.tryEmit(message)
        }
    }

    fun connectTerminal(workspace: String, cols: Int, rows: Int) {
        terminal.connect(workspace, cols, rows)
    }

    fun sendTerminalInput(data: String) {
        terminal.sendInput(data)
    }

    fun resizeTerminal(cols: Int, rows: Int) {
        terminal.resize(cols, rows)
    }

    fun clearTerminal() {
        terminal.clearOutput()
    }

    fun disconnectTerminal() {
        terminal.disconnect()
    }

    suspend fun transcribe(audioBase64: String, format: String): String? =
        runCatchingSuspend { api.transcribe(TranscribeRequest(audioBase64, format)).text.trim() }
            .onFailure(::report)
            .getOrNull()
            ?.takeIf { it.isNotEmpty() }

    override fun onCleared() {
        terminal.disconnect()
        terminal.shutdown()
        artifactLoader.clear()
        clearThumbnailCache()
        CoroutineScope(Dispatchers.IO).launch {
            client.http.dispatcher.cancelAll()
            client.http.connectionPool.evictAll()
            client.http.dispatcher.executorService.shutdown()
        }
    }

    companion object {
        private val SUPPORTED_IMAGE_MIMES = setOf("image/png", "image/jpeg", "image/webp", "image/heic", "image/heif")
        private val SUPPORTED_IMAGE_EXTS = setOf("png", "jpg", "jpeg", "webp", "heic", "heif")
        private const val HISTORY_LIMIT = 200
        private const val PUBLISH_INTERVAL_MS = 32L
        private const val CANCEL_TIMEOUT_MS = 4000L
        private const val FILE_REFRESH_DEBOUNCE_MS = 400L
        private const val MAX_RETRIES = 6
        private const val TITLE_ATTEMPTS = 5
        private const val TITLE_RETRY_MS = 2000L
        private const val MAX_ATTACHMENT_BYTES = 20L * 1024 * 1024
        private const val FILE_LIST_LIMIT = 500

        fun factory(application: Application) = viewModelFactory {
            initializer { OrchViewModel(application) }
        }
    }
}
