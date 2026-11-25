package com.orch.app.ui

import android.text.format.DateUtils
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Lock
import com.orch.app.ui.icons.OrchIcons
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orch.app.data.CloudProject
import com.orch.app.data.SessionSummary
import com.orch.app.ui.components.OrchAlertDialog
import com.orch.app.ui.components.OrchBanner
import com.orch.app.ui.components.OrchEmptyMessage
import com.orch.app.ui.components.OrchIconBadge
import com.orch.app.ui.components.OrchSecondaryButton
import com.orch.app.ui.theme.OrchDimens
import com.orch.app.ui.theme.OrchSuccess

@Composable
fun SessionsDrawer(
    projects: List<CloudProject>,
    projectsFailed: Boolean,
    activeProjectId: String?,
    deletingProjectId: String?,
    sessions: List<SessionSummary>,
    loadFailed: Boolean,
    onRetry: () -> Unit,
    activeId: String,
    userName: String?,
    onConnectorsScreen: Boolean,
    activeConnectorCount: Int,
    onNewProject: () -> Unit,
    onSelectProject: (String) -> Unit,
    onNewChatInProject: (String) -> Unit,
    onDeleteProject: (String) -> Unit,
    onConnectors: () -> Unit,
    onOpen: (String) -> Unit,
    onDelete: (String) -> Unit,
    onAccount: () -> Unit
) {
    var pendingDeleteSession by remember { mutableStateOf<SessionSummary?>(null) }
    var pendingDeleteProject by remember { mutableStateOf<CloudProject?>(null) }
    val sessionsByWorkspace = remember(sessions) { sessions.groupBy { it.workspacePath } }

    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            verticalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = OrchDimens.ScreenPadding, vertical = OrchDimens.CardPaddingV)
        ) {
            Text(
                text = "Projects",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface
            )
            OrchSecondaryButton(
                text = "New project",
                onClick = onNewProject,
                icon = OrchIcons.CreateNewFolder,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("drawer_new_project_button")
            )
            Surface(
                onClick = onConnectors,
                shape = MaterialTheme.shapes.medium,
                color = if (onConnectorsScreen) MaterialTheme.colorScheme.surfaceContainerHigh else Color.Transparent,
                border = if (onConnectorsScreen) BorderStroke(1.dp, MaterialTheme.colorScheme.outline) else null,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = OrchDimens.ButtonHeight)
                    .testTag("drawer_connectors_button")
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    Icon(
                        imageVector = OrchIcons.Extension,
                        contentDescription = null,
                        tint = if (onConnectorsScreen) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                    Text(
                        text = "Connectors",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f)
                    )
                    if (activeConnectorCount > 0) {
                        Surface(
                            color = OrchSuccess.copy(alpha = 0.16f),
                            shape = MaterialTheme.shapes.extraSmall
                        ) {
                            Text(
                                text = "$activeConnectorCount active",
                                style = MaterialTheme.typography.labelMedium,
                                color = OrchSuccess,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                            )
                        }
                    }
                }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        when {
            projects.isEmpty() && projectsFailed -> OrchEmptyMessage(
                text = "Couldn't load projects",
                isError = true,
                actionLabel = "Retry",
                onAction = onRetry,
                modifier = Modifier.weight(1f)
            )
            projects.isEmpty() -> OrchEmptyMessage(
                text = "No projects yet",
                actionLabel = "New project",
                onAction = onNewProject,
                modifier = Modifier.weight(1f)
            )
            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = OrchDimens.ItemGap, vertical = OrchDimens.ItemGap),
                verticalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier.weight(1f)
            ) {
                if (projectsFailed || loadFailed) {
                    item(key = "load-failed") {
                        OrchBanner(
                            text = "Couldn't refresh everything",
                            isError = true,
                            actionLabel = "Retry",
                            onAction = onRetry,
                            modifier = Modifier.padding(bottom = OrchDimens.ItemGap)
                        )
                    }
                }
                projects.forEach { project ->
                    item(key = "project:${project.id}") {
                        ProjectHeader(
                            project = project,
                            selected = !onConnectorsScreen && project.id == activeProjectId,
                            deleting = deletingProjectId == project.id,
                            onSelect = { onSelectProject(project.id) },
                            onNewChat = { onNewChatInProject(project.id) },
                            onDelete = { pendingDeleteProject = project }
                        )
                    }
                    val projectSessions = sessionsByWorkspace[project.workspace].orEmpty()
                    if (projectSessions.isEmpty()) {
                        item(key = "empty:${project.id}") {
                            Text(
                                text = "No chats yet — tap + to start",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(MaterialTheme.shapes.small)
                                    .clickable { onNewChatInProject(project.id) }
                                    .padding(horizontal = 16.dp, vertical = 8.dp)
                            )
                        }
                    } else {
                        items(projectSessions, key = { it.id }) { session ->
                            SessionItem(
                                session = session,
                                selected = !onConnectorsScreen && session.id == activeId,
                                onClick = { onOpen(session.id) },
                                onDelete = { pendingDeleteSession = session }
                            )
                        }
                    }
                }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .clickable(onClick = onAccount)
                .padding(horizontal = OrchDimens.ScreenPadding, vertical = OrchDimens.ItemGap)
                .testTag("drawer_account_row")
        ) {
            OrchIconBadge(
                size = OrchDimens.AvatarSmall,
                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
            ) {
                Text(
                    text = (userName ?: "?").take(1).uppercase(),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            Text(
                text = userName ?: "Account",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }

    pendingDeleteSession?.let { session ->
        OrchAlertDialog(
            title = "Delete chat?",
            onDismiss = { pendingDeleteSession = null },
            confirmLabel = "Delete",
            onConfirm = {
                onDelete(session.id)
                pendingDeleteSession = null
            }
        ) {
            Text(
                text = "This removes the conversation history and saved attachments. The project and its cloud sandbox are kept.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }

    pendingDeleteProject?.let { project ->
        OrchAlertDialog(
            title = "Remove project?",
            onDismiss = { pendingDeleteProject = null },
            confirmLabel = "Remove",
            onConfirm = {
                onDeleteProject(project.id)
                pendingDeleteProject = null
            }
        ) {
            Text(
                text = "This deletes all conversations in ${project.name}, destroys its cloud sandbox, and removes it from Orch. Your GitHub repository is not affected.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun ProjectHeader(
    project: CloudProject,
    selected: Boolean,
    deleting: Boolean,
    onSelect: () -> Unit,
    onNewChat: () -> Unit,
    onDelete: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = OrchDimens.ItemGap, bottom = OrchDimens.TightGap)
            .clip(MaterialTheme.shapes.small)
            .background(if (selected) MaterialTheme.colorScheme.surfaceContainerHigh else Color.Transparent)
            .clickable(enabled = !deleting, onClick = onSelect)
            .padding(start = 10.dp, end = 2.dp, top = 4.dp, bottom = 4.dp)
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
            modifier = Modifier.size(16.dp)
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 8.dp)
        ) {
            Text(
                text = project.name,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (project.accountLogin.isNotBlank()) {
                Text(
                    text = if (project.accountConnected) "@${project.accountLogin}" else "@${project.accountLogin} · disconnected",
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
        }
        IconButton(onClick = onNewChat, enabled = !deleting) {
            Icon(
                imageVector = Icons.Outlined.Add,
                contentDescription = "New chat in ${project.name}",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp)
            )
        }
        IconButton(onClick = onDelete, enabled = !deleting) {
            if (deleting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.error
                )
            } else {
                Icon(
                    imageVector = Icons.Outlined.Delete,
                    contentDescription = "Remove ${project.name}",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

@Composable
private fun SessionItem(
    session: SessionSummary,
    selected: Boolean,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = OrchDimens.TouchTarget)
            .clip(MaterialTheme.shapes.small)
            .background(if (selected) MaterialTheme.colorScheme.surfaceVariant else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(start = 12.dp, top = 4.dp, bottom = 4.dp)
    ) {
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(vertical = 4.dp)
        ) {
            Text(
                text = session.title ?: "New chat",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (session.updatedAt > 0) {
                Text(
                    text = DateUtils.getRelativeTimeSpanString(
                        session.updatedAt,
                        System.currentTimeMillis(),
                        DateUtils.MINUTE_IN_MILLIS
                    ).toString(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        if (session.running) {
            CircularProgressIndicator(
                modifier = Modifier.size(16.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.primary
            )
        }
        IconButton(onClick = onDelete) {
            Icon(
                imageVector = Icons.Outlined.Delete,
                contentDescription = "Delete chat",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}
