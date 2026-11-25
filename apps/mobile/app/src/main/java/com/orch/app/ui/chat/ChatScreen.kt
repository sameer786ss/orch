package com.orch.app.ui.chat

import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Menu
import com.orch.app.ui.icons.OrchIcons
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.orch.app.chat.ChatRow
import com.orch.app.chat.CopyRow
import com.orch.app.chat.EarlierRow
import com.orch.app.chat.UserRow
import com.orch.app.data.CloudProject
import com.orch.app.data.ModelInfo
import com.orch.app.ui.ChatUi
import com.orch.app.ui.PendingAttachment
import com.orch.app.ui.components.OrchBanner
import com.orch.app.ui.components.OrchCenteredSpinner
import com.orch.app.ui.components.OrchEmptyMessage
import com.orch.app.ui.components.OrchPrimaryButton
import com.orch.app.ui.theme.OrchDimens
import kotlinx.coroutines.launch

private val BottomGap = 120.dp
private val PromptToReplyGap = 24.dp
private val BlockGap = 14.dp
private val CopyGap = 4.dp
private val TurnGap = 36.dp
private val SnackbarLift = 64.dp

@Composable
fun ChatScreen(
    title: String,
    chat: ChatUi,
    attachments: List<PendingAttachment>,
    models: List<ModelInfo>,
    selectedModelId: String,
    thinkingEffort: String,
    connectorIcons: Map<String, String> = emptyMap(),
    snackbar: SnackbarHostState,
    onMenu: () -> Unit,
    onPickProject: () -> Unit,
    onReconnectGithub: () -> Unit,
    onOpenExplorer: () -> Unit,
    onOpenTerminal: () -> Unit,
    onSend: (String) -> Boolean,
    onStop: () -> Unit,
    onAttach: () -> Unit,
    onPickModel: () -> Unit,
    onRemoveAttachment: (Uri) -> Unit,
    onOpenFile: (String) -> Unit,
    onLoadEarlier: () -> Unit,
    onRetryLoad: () -> Unit,
    transcribe: suspend (String, String) -> String?
) {
    val model = remember(models, selectedModelId) { models.firstOrNull { it.id == selectedModelId } }
    val contextRatio = remember(chat.contextTokens, model) {
        if (model != null && model.contextWindow > 0) {
            (chat.contextTokens.toFloat() / model.contextWindow).coerceIn(0f, 1f)
        } else {
            0f
        }
    }
    val modelLabel = remember(model, thinkingEffort) {
        model?.let {
            "${it.name} · ${thinkingEffort.replaceFirstChar(Char::uppercase)}"
        } ?: "Model"
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        TopBar(
            title = title,
            project = chat.project,
            onMenu = onMenu,
            onPickProject = onPickProject,
            onOpenExplorer = onOpenExplorer,
            onOpenTerminal = onOpenTerminal
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            MessageList(
                chat = chat,
                connectorIcons = connectorIcons,
                snackbarVisible = snackbar.currentSnackbarData != null,
                onOpenFile = onOpenFile,
                onLoadEarlier = onLoadEarlier,
                onRetryLoad = onRetryLoad,
                onPickProject = onPickProject
            )
            SnackbarHost(
                hostState = snackbar,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            )
        }
        val activeProject = chat.project
        if (activeProject != null && !activeProject.accountConnected) {
            OrchBanner(
                text = if (activeProject.accountLogin.isNotBlank()) {
                    "GitHub @${activeProject.accountLogin} disconnected"
                } else {
                    "GitHub account disconnected"
                },
                isError = true,
                actionLabel = "Reconnect",
                onAction = onReconnectGithub,
                modifier = Modifier.padding(horizontal = OrchDimens.ScreenPadding, vertical = OrchDimens.TightGap)
            )
        }
        key(chat.sessionId) {
            Composer(
                placeholder = when {
                    chat.loading -> "Loading chat…"
                    chat.loadFailed -> "This chat could not be loaded"
                    chat.project == null -> "Open or create a GitHub repository"
                    !chat.project.accountConnected -> "Reconnect GitHub or ask anything"
                    else -> "Ask anything"
                },
                streaming = chat.streaming,
                canSend = chat.canSend && !chat.loading,
                attachments = attachments,
                modelLabel = modelLabel,
                contextRatio = contextRatio,
                onSend = onSend,
                onStop = onStop,
                onAttach = onAttach,
                onPickModel = onPickModel,
                onRemoveAttachment = onRemoveAttachment,
                transcribe = transcribe,
                modifier = Modifier
                    .navigationBarsPadding()
                    .imePadding()
            )
        }
    }
}

@Composable
private fun TopBar(
    title: String,
    project: CloudProject?,
    onMenu: () -> Unit,
    onPickProject: () -> Unit,
    onOpenExplorer: () -> Unit,
    onOpenTerminal: () -> Unit
) {
    val hasWorkspace = project != null
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .height(OrchDimens.TopBarHeight)
            .padding(horizontal = OrchDimens.TightGap)
    ) {
        IconButton(
            onClick = onMenu,
            modifier = Modifier.testTag("topbar_menu_button")
        ) {
            Icon(
                imageVector = Icons.Rounded.Menu,
                contentDescription = "Projects and chats",
                tint = MaterialTheme.colorScheme.onSurface
            )
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .clip(MaterialTheme.shapes.small)
                .clickable(onClick = onPickProject)
                .padding(horizontal = 6.dp, vertical = 2.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (project != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = when {
                            !project.accountConnected -> OrchIcons.WarningAmber
                            project.isPrivate -> Icons.Outlined.Lock
                            else -> OrchIcons.Public
                        },
                        contentDescription = null,
                        tint = if (project.accountConnected) {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        } else {
                            MaterialTheme.colorScheme.error
                        },
                        modifier = Modifier.size(12.dp)
                    )
                    Text(
                        text = if (project.accountLogin.isNotBlank()) {
                            "${project.name} · @${project.accountLogin}"
                        } else {
                            project.name
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (project.accountConnected) {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        } else {
                            MaterialTheme.colorScheme.error
                        },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            } else {
                Text(
                    text = "Open or create GitHub repo",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        IconButton(
            onClick = onOpenExplorer,
            enabled = hasWorkspace,
            modifier = Modifier.testTag("topbar_explorer_button")
        ) {
            Icon(
                imageVector = OrchIcons.FolderOpen,
                contentDescription = "File explorer",
                tint = if (hasWorkspace) {
                    MaterialTheme.colorScheme.onSurface
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                }
            )
        }
        IconButton(
            onClick = onOpenTerminal,
            enabled = hasWorkspace,
            modifier = Modifier.testTag("topbar_terminal_button")
        ) {
            Icon(
                imageVector = OrchIcons.Terminal,
                contentDescription = "Terminal",
                tint = if (hasWorkspace) {
                    MaterialTheme.colorScheme.onSurface
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                }
            )
        }
    }
}

@Composable
private fun EdgeFade(top: Boolean, modifier: Modifier) {
    val bg = MaterialTheme.colorScheme.background
    val brush = remember(top, bg) {
        val colors = if (top) listOf(bg, Color.Transparent) else listOf(Color.Transparent, bg)
        Brush.verticalGradient(colors)
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(14.dp)
            .background(brush)
    )
}

private fun gapAbove(above: ChatRow?, row: ChatRow): Dp = when {
    above == null -> 0.dp
    above is EarlierRow || row is EarlierRow -> 12.dp
    row is CopyRow -> CopyGap
    row is UserRow && above !is UserRow -> TurnGap
    row is UserRow -> BlockGap
    above is UserRow -> PromptToReplyGap
    else -> BlockGap
}

@Composable
private fun MessageList(
    chat: ChatUi,
    connectorIcons: Map<String, String>,
    snackbarVisible: Boolean,
    onOpenFile: (String) -> Unit,
    onLoadEarlier: () -> Unit,
    onRetryLoad: () -> Unit,
    onPickProject: () -> Unit
) {
    key(chat.sessionId) {
        val listState = rememberLazyListState()
        val scope = rememberCoroutineScope()
        val rows = chat.rows
        var autoFollow by remember { mutableStateOf(true) }

        val scrollIntentConnection = remember(listState) {
            object : NestedScrollConnection {
                override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                    if (source == NestedScrollSource.UserInput && available.y > 0f && listState.canScrollBackward) {
                        autoFollow = false
                    }
                    return Offset.Zero
                }
            }
        }

        // Re-enable autoFollow only when user manually scrolls all the way back to the bottom.
        LaunchedEffect(listState) {
            snapshotFlow { listState.isScrollInProgress }.collect { scrolling ->
                if (!scrolling && !listState.canScrollForward) {
                    autoFollow = true
                }
            }
        }

        // Animate to the bottom only when a newly sent prompt arrives after initial load.
        val newestPromptKey = rows.lastOrNull { it is UserRow }?.key
        var lastSeenPromptKey by remember { mutableStateOf<String?>(null) }
        var initializedPrompt by remember { mutableStateOf(false) }
        LaunchedEffect(newestPromptKey) {
            if (!initializedPrompt) {
                if (newestPromptKey != null) {
                    lastSeenPromptKey = newestPromptKey
                    initializedPrompt = true
                }
                return@LaunchedEffect
            }
            if (newestPromptKey != null && newestPromptKey != lastSeenPromptKey) {
                lastSeenPromptKey = newestPromptKey
                autoFollow = true
                val lastIdx = (listState.layoutInfo.totalItemsCount - 1).coerceAtLeast(0)
                listState.animateScrollToItem(lastIdx, Int.MAX_VALUE)
            }
        }

        // Keep viewport pinned to the exact bottom edge whenever content grows during streaming or initial load.
        LaunchedEffect(autoFollow, listState) {
            if (!autoFollow) return@LaunchedEffect
            snapshotFlow {
                val info = listState.layoutInfo
                val lastVisible = info.visibleItemsInfo.lastOrNull()
                val bottomEdge = lastVisible?.let { it.offset + it.size } ?: 0
                val flags = (if (listState.canScrollForward) 1L else 0L) or
                    (if (listState.isScrollInProgress) 2L else 0L)
                (info.totalItemsCount.toLong() shl 34) xor
                    ((bottomEdge.toLong() and 0xFFFFFFFFL) shl 2) xor
                    flags
            }.collect {
                if (autoFollow && !listState.isScrollInProgress && listState.canScrollForward) {
                    val lastIdx = (listState.layoutInfo.totalItemsCount - 1).coerceAtLeast(0)
                    listState.scrollToItem(lastIdx, Int.MAX_VALUE)
                }
            }
        }

        val showPinToBottom by remember {
            derivedStateOf { !autoFollow && listState.canScrollForward }
        }
        val lift by animateDpAsState(if (snackbarVisible) SnackbarLift else 0.dp, label = "snackbarLift")

        Box(modifier = Modifier.fillMaxSize()) {
            if (rows.isEmpty()) {
                EmptyState(chat, onRetryLoad, onPickProject)
            }
            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(
                    start = OrchDimens.ScreenPadding,
                    end = OrchDimens.ScreenPadding,
                    top = 12.dp,
                    bottom = BottomGap
                ),
                modifier = Modifier
                    .fillMaxSize()
                    .nestedScroll(scrollIntentConnection)
            ) {
                itemsIndexed(
                    items = rows,
                    key = { _, row -> row.key },
                    contentType = { _, row -> row::class }
                ) { index, row ->
                    Box(modifier = Modifier.padding(top = gapAbove(rows.getOrNull(index - 1), row))) {
                        ChatRowView(row, connectorIcons, onOpenFile, onLoadEarlier)
                    }
                }
                item(key = "end") { Spacer(Modifier.height(1.dp)) }
            }
            EdgeFade(top = true, modifier = Modifier.align(Alignment.TopCenter))
            EdgeFade(top = false, modifier = Modifier.align(Alignment.BottomCenter))
            AnimatedVisibility(
                visible = showPinToBottom,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .offset { IntOffset(0, -lift.roundToPx()) }
                    .padding(bottom = 12.dp)
            ) {
                Surface(
                    onClick = {
                        autoFollow = true
                        scope.launch {
                            val lastIdx = (listState.layoutInfo.totalItemsCount - 1).coerceAtLeast(0)
                            listState.animateScrollToItem(lastIdx, Int.MAX_VALUE)
                        }
                    },
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.surfaceContainerHigh,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                    shadowElevation = 4.dp,
                    modifier = Modifier
                        .size(OrchDimens.TouchTarget)
                        .testTag("chat_scroll_to_bottom_button")
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = OrchIcons.ArrowDownward,
                            contentDescription = "Scroll to latest",
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyState(
    chat: ChatUi,
    onRetryLoad: () -> Unit,
    onPickProject: () -> Unit
) {
    when {
        chat.loading -> OrchCenteredSpinner()
        chat.loadFailed -> OrchEmptyMessage(
            text = "Couldn't load this chat",
            actionLabel = "Try again",
            onAction = onRetryLoad
        )
        chat.project != null -> OrchEmptyMessage(
            text = "What should we work on in ${chat.project.name}?"
        )
        else -> Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp)
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(OrchDimens.SectionGap)
            ) {
                Text(
                    text = "Open an existing GitHub repository or create a new one to start.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
                OrchPrimaryButton(
                    text = "Open or create GitHub repo",
                    onClick = onPickProject,
                    icon = Icons.Outlined.Add,
                    modifier = Modifier.testTag("empty_new_project_button")
                )
            }
        }
    }
}

