package com.orch.app.ui

import android.app.Application
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.width
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.orch.app.ui.auth.signOutUser
import com.orch.app.ui.chat.ChatScreen
import com.orch.app.ui.components.ArtifactModalBottomSheet
import com.orch.app.ui.components.openOAuthBrowser
import com.orch.app.ui.connectors.ConnectorsScreen
import com.orch.app.ui.sheets.AccountSheet
import com.orch.app.ui.sheets.AttachmentSheet
import com.orch.app.ui.sheets.FilesSheet
import com.orch.app.ui.sheets.ModelSheet
import com.orch.app.ui.sheets.NewProjectSheet
import com.orch.app.ui.sheets.TerminalSheet
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

private enum class Sheet { None, Attach, NewProject, Files, Terminal, Models, Account }
private enum class AppScreen { Chat, Connectors }

@Composable
fun OrchApp(
    userScope: UserScope,
    userId: String,
    userName: String?,
    userEmail: String?,
    deepLinks: Flow<Uri>
) {
    val context = LocalContext.current
    val application = context.applicationContext as Application
    val vm: OrchViewModel = viewModel(
        viewModelStoreOwner = userScope,
        key = userId,
        factory = remember(application) { OrchViewModel.factory(application) }
    )
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val snackbar = remember { SnackbarHostState() }
    var sheet by rememberSaveable { mutableStateOf(Sheet.None) }
    var screen by rememberSaveable { mutableStateOf(AppScreen.Chat) }

    val workspace by vm.workspace.collectAsStateWithLifecycle()
    val chat by vm.chat.collectAsStateWithLifecycle()
    val modelUi by vm.modelUi.collectAsStateWithLifecycle()
    val attachments by vm.attachments.collectAsStateWithLifecycle()
    val connectors by vm.connectors.collectAsStateWithLifecycle()

    val launchOAuth: (String) -> Unit = remember(context) {
        { url ->
            runCatching {
                openOAuthBrowser(context, url)
            }.onFailure {
                Toast.makeText(context, "Unable to open browser.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.onForeground() }
    LaunchedEffect(vm) { vm.notices.collectLatest { snackbar.showSnackbar(it) } }
    LaunchedEffect(vm) {
        vm.saveResults.collect { Toast.makeText(context, it, Toast.LENGTH_SHORT).show() }
    }
    LaunchedEffect(deepLinks, vm) {
        deepLinks.collect { uri -> vm.onOAuthRedirect(uri) }
    }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) {
        vm.addAttachments(it)
    }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) {
        vm.addAttachments(it)
    }

    val title = remember(workspace.sessions, chat.sessionId) {
        workspace.sessions.firstOrNull { it.id == chat.sessionId }?.title ?: "New chat"
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = screen == AppScreen.Chat,
        drawerContent = {
            ModalDrawerSheet(
                drawerContainerColor = MaterialTheme.colorScheme.background,
                modifier = Modifier.width(320.dp)
            ) {
                SessionsDrawer(
                    projects = workspace.projects,
                    projectsFailed = workspace.projectsFailed,
                    activeProjectId = workspace.activeProjectId,
                    deletingProjectId = workspace.deletingProjectId,
                    sessions = workspace.sessions,
                    loadFailed = workspace.sessionsFailed,
                    onRetry = {
                        vm.refreshProjects()
                        vm.refreshSessions()
                    },
                    activeId = chat.sessionId,
                    userName = userName,
                    onConnectorsScreen = screen == AppScreen.Connectors,
                    activeConnectorCount = connectors.activeIds.size,
                    onNewProject = {
                        screen = AppScreen.Chat
                        vm.clearProjectError()
                        scope.launch { drawerState.close() }
                        sheet = Sheet.NewProject
                    },
                    onSelectProject = { projectId ->
                        vm.selectProject(projectId)
                        screen = AppScreen.Chat
                        scope.launch { drawerState.close() }
                    },
                    onNewChatInProject = { projectId ->
                        vm.newChat(projectId = projectId)
                        screen = AppScreen.Chat
                        scope.launch { drawerState.close() }
                    },
                    onDeleteProject = vm::deleteProject,
                    onConnectors = {
                        screen = AppScreen.Connectors
                        scope.launch { drawerState.close() }
                    },
                    onOpen = {
                        vm.openSession(it)
                        screen = AppScreen.Chat
                        scope.launch { drawerState.close() }
                    },
                    onDelete = vm::deleteSession,
                    onAccount = {
                        scope.launch { drawerState.close() }
                        sheet = Sheet.Account
                    }
                )
            }
        }
    ) {
        when (screen) {
            AppScreen.Chat -> {
                val connectorIcons = remember(connectors.items) {
                    connectors.items.mapNotNull { item ->
                        item.definition.iconUrl?.trim()?.takeIf { it.isNotEmpty() }?.let {
                            item.definition.id.lowercase() to it
                        }
                    }.toMap()
                }
                ChatScreen(
                    title = title,
                    chat = chat,
                    attachments = attachments,
                    models = modelUi.models,
                    selectedModelId = modelUi.selectedModelId,
                    thinkingEffort = modelUi.thinkingEffort,
                    connectorIcons = connectorIcons,
                    snackbar = snackbar,
                    onMenu = { scope.launch { drawerState.open() } },
                    onPickProject = {
                        vm.clearProjectError()
                        sheet = Sheet.NewProject
                    },
                    onReconnectGithub = { vm.connectGithub(launchOAuth) },
                    onOpenExplorer = { sheet = Sheet.Files },
                    onOpenTerminal = { sheet = Sheet.Terminal },
                    onSend = vm::send,
                    onStop = vm::stop,
                    onAttach = { sheet = Sheet.Attach },
                    onPickModel = { sheet = Sheet.Models },
                    onRemoveAttachment = vm::removeAttachment,
                    onOpenFile = vm::openFile,
                    onLoadEarlier = vm::loadEarlier,
                    onRetryLoad = { vm.openSession(chat.sessionId, force = true) },
                    transcribe = vm::transcribe
                )
            }
            AppScreen.Connectors -> ConnectorsScreen(
                connectors = connectors,
                onBack = { screen = AppScreen.Chat },
                onRefresh = vm::loadConnectors,
                onToggle = vm::toggleConnector,
                onConnect = { id -> vm.connectConnector(id, launchOAuth) },
                onDisconnect = vm::disconnectConnector
            )
        }
    }

    when (sheet) {
        Sheet.None -> Unit
        Sheet.NewProject -> NewProjectSheetHost(
            vm = vm,
            onConnectGithub = { vm.connectGithub(launchOAuth) },
            onDismiss = { sheet = Sheet.None }
        )
        Sheet.Attach -> AttachmentSheet(
            connectors = connectors,
            onPickImages = {
                sheet = Sheet.None
                imagePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            },
            onPickFiles = {
                sheet = Sheet.None
                filePicker.launch(arrayOf("*/*"))
            },
            onToggleConnector = vm::toggleConnector,
            onManageConnectors = {
                sheet = Sheet.None
                screen = AppScreen.Connectors
            },
            onDismiss = { sheet = Sheet.None }
        )
        Sheet.Files -> {
            val project = chat.project
            if (project != null) {
                FilesSheetHost(
                    repoName = project.name,
                    vm = vm,
                    onDismiss = { sheet = Sheet.None }
                )
            } else {
                sheet = Sheet.None
            }
        }
        Sheet.Terminal -> {
            val project = chat.project
            if (project != null) {
                TerminalSheetHost(
                    repoName = project.name,
                    workspace = project.workspace,
                    vm = vm,
                    onDismiss = { sheet = Sheet.None }
                )
            } else {
                sheet = Sheet.None
            }
        }
        Sheet.Models -> ModelSheet(
            models = modelUi.models,
            selectedId = modelUi.selectedModelId,
            thinkingEffort = modelUi.thinkingEffort,
            onSelectModel = vm::selectModel,
            onSelectThinkingEffort = vm::selectThinkingEffort,
            onDismiss = { sheet = Sheet.None }
        )
        Sheet.Account -> AccountSheetHost(
            userName = userName,
            userEmail = userEmail,
            vm = vm,
            onConnectGithub = { vm.connectGithub(launchOAuth) },
            onSignOut = {
                sheet = Sheet.None
                userScope.autoSignIn = false
                signOutUser(CredentialManager.create(context), scope)
            },
            onDismiss = { sheet = Sheet.None }
        )
    }

    ArtifactSheetHost(vm = vm)
}

@Composable
private fun NewProjectSheetHost(
    vm: OrchViewModel,
    onConnectGithub: () -> Unit,
    onDismiss: () -> Unit
) {
    val github by vm.github.collectAsStateWithLifecycle()
    NewProjectSheet(
        accounts = github.accounts,
        accountsLoading = github.accountsLoading,
        connectingGithub = github.connecting,
        repos = github.repos,
        reposLoading = github.reposLoading,
        reposError = github.reposError,
        projectBusy = github.projectBusy,
        projectError = github.projectError,
        onConnectGithub = onConnectGithub,
        onLoadRepos = vm::loadGithubRepos,
        onOpenRepo = { repoUrl, accountId ->
            vm.openGithubProject(repoUrl, accountId, onDismiss)
        },
        onCreateRepo = { accountId, name, description, private ->
            vm.createGithubProject(accountId, name, description, private, onDismiss)
        },
        onClearError = vm::clearProjectError,
        onDismiss = onDismiss
    )
}

@Composable
private fun FilesSheetHost(
    repoName: String,
    vm: OrchViewModel,
    onDismiss: () -> Unit
) {
    val files by vm.files.collectAsStateWithLifecycle()
    FilesSheet(
        repoName = repoName,
        files = files,
        onBrowse = vm::browseFiles,
        onNavigateUp = vm::browseUp,
        onOpen = vm::openFile,
        onDismiss = onDismiss
    )
}

@Composable
private fun TerminalSheetHost(
    repoName: String,
    workspace: String,
    vm: OrchViewModel,
    onDismiss: () -> Unit
) {
    val terminal by vm.terminalState.collectAsStateWithLifecycle()
    TerminalSheet(
        repoName = repoName,
        workspace = workspace,
        terminal = terminal,
        onConnect = vm::connectTerminal,
        onInput = vm::sendTerminalInput,
        onResize = vm::resizeTerminal,
        onClear = vm::clearTerminal,
        onDisconnect = vm::disconnectTerminal,
        onDismiss = onDismiss
    )
}

@Composable
private fun AccountSheetHost(
    userName: String?,
    userEmail: String?,
    vm: OrchViewModel,
    onConnectGithub: () -> Unit,
    onSignOut: () -> Unit,
    onDismiss: () -> Unit
) {
    val budget by vm.budget.collectAsStateWithLifecycle()
    val github by vm.github.collectAsStateWithLifecycle()
    AccountSheet(
        name = userName,
        email = userEmail,
        budget = budget,
        githubAccounts = github.accounts,
        githubConnecting = github.connecting,
        githubDisconnectingId = github.disconnectingId,
        githubError = github.error,
        onConnectGithub = onConnectGithub,
        onDisconnectGithub = vm::disconnectGithub,
        onSignOut = onSignOut,
        onDismiss = onDismiss
    )
}

@Composable
private fun ArtifactSheetHost(vm: OrchViewModel) {
    val artifactUi by vm.artifactUi.collectAsStateWithLifecycle()
    ArtifactModalBottomSheet(
        state = artifactUi.state,
        saving = artifactUi.saving,
        onSave = vm::saveArtifact,
        onDismiss = vm::closeArtifact
    )
}
