package com.orch.app.ui.sheets

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.orch.app.R
import com.orch.app.ui.icons.OrchIcons
import com.orch.app.data.Budget
import com.orch.app.data.GithubAccount
import com.orch.app.data.ModelInfo
import com.orch.app.ui.FilesUi
import com.orch.app.ui.components.OrchActionChip
import com.orch.app.ui.components.OrchAlertDialog
import com.orch.app.ui.components.OrchBanner
import com.orch.app.ui.components.OrchBottomSheet
import com.orch.app.ui.components.OrchCard
import com.orch.app.ui.components.OrchCenteredSpinner
import com.orch.app.ui.components.OrchEmptyMessage
import com.orch.app.ui.components.OrchIconBadge
import com.orch.app.ui.components.OrchSecondaryButton
import com.orch.app.ui.components.OrchSheetHeader
import com.orch.app.ui.components.OrchTextField
import com.orch.app.ui.theme.OrchDimens
import com.orch.app.ui.theme.OrchMonoLabel
import kotlinx.coroutines.delay

@Composable
fun FilesSheet(
    repoName: String,
    files: FilesUi,
    onBrowse: (path: String, query: String) -> Unit,
    onNavigateUp: () -> Unit,
    onOpen: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var query by rememberSaveable { mutableStateOf("") }
    val latestPath by rememberUpdatedState(files.currentPath)
    val latestOnBrowse by rememberUpdatedState(onBrowse)
    LaunchedEffect(query) {
        if (query.isNotEmpty()) delay(250)
        latestOnBrowse(latestPath, query)
    }

    val currentLocation = if (files.currentPath.isEmpty()) repoName else "$repoName/${files.currentPath}"

    OrchBottomSheet(onDismiss = onDismiss) {
        OrchSheetHeader(
            title = "Files",
            subtitle = currentLocation,
            onClose = onDismiss
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = OrchDimens.ScreenPadding)
                .padding(top = OrchDimens.ItemGap, bottom = OrchDimens.ScreenPadding)
        ) {
            OrchTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search files",
                leadingIcon = { Icon(Icons.Rounded.Search, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                trailingIcon = {
                    if (query.isNotEmpty()) {
                        IconButton(onClick = { query = "" }) {
                            Icon(Icons.Rounded.Close, "Clear search", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            )
            if (query.isBlank() && (files.currentPath.isNotEmpty() || files.treeTruncated)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = OrchDimens.TouchTarget)
                        .padding(top = OrchDimens.TightGap)
                ) {
                    if (files.currentPath.isNotEmpty()) {
                        IconButton(onClick = onNavigateUp) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                                contentDescription = "Parent folder",
                                tint = MaterialTheme.colorScheme.onSurface
                            )
                        }
                        Spacer(Modifier.width(OrchDimens.TightGap))
                    }
                    Text(
                        text = currentLocation,
                        style = OrchMonoLabel,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    if (files.treeTruncated) {
                        Text(
                            text = "Truncated",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false)
                    .heightIn(min = 180.dp, max = 420.dp)
                    .padding(top = OrchDimens.TightGap)
            ) {
                val isEmpty = if (query.isNotBlank()) files.searchEntries.isEmpty() else files.treeEntries.isEmpty()
                when {
                    files.loading -> OrchCenteredSpinner()
                    files.error != null -> OrchEmptyMessage(text = files.error, isError = true)
                    isEmpty -> OrchEmptyMessage(text = if (query.isNotBlank()) "No files found" else "Empty folder")
                    query.isNotBlank() -> LazyColumn {
                        items(files.searchEntries, key = { it.path }) { entry ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = OrchDimens.TouchTarget)
                                    .clip(MaterialTheme.shapes.small)
                                    .clickable {
                                        onDismiss()
                                        onOpen(entry.path)
                                    }
                                    .padding(horizontal = OrchDimens.ItemGap, vertical = 10.dp)
                            ) {
                                Icon(
                                    imageVector = OrchIcons.InsertDriveFile,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(20.dp)
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = entry.name,
                                        style = MaterialTheme.typography.titleMedium,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = entry.path,
                                        style = OrchMonoLabel,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                    else -> LazyColumn {
                        items(files.treeEntries, key = { "${it.isDir}:${it.path}" }) { entry ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = OrchDimens.TouchTarget)
                                    .clip(MaterialTheme.shapes.small)
                                    .clickable {
                                        if (entry.isDir) {
                                            onBrowse(entry.path, "")
                                        } else {
                                            onDismiss()
                                            onOpen(entry.path)
                                        }
                                    }
                                    .padding(horizontal = OrchDimens.ItemGap, vertical = 10.dp)
                            ) {
                                Icon(
                                    imageVector = if (entry.isDir) OrchIcons.Folder else OrchIcons.InsertDriveFile,
                                    contentDescription = null,
                                    tint = if (entry.isDir) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(20.dp)
                                )
                                Text(
                                    text = entry.name,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f)
                                )
                                if (entry.isDir) {
                                    Icon(
                                        imageVector = OrchIcons.ChevronRight,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ModelSheet(
    models: List<ModelInfo>,
    selectedId: String,
    thinkingEffort: String,
    onSelectModel: (String) -> Unit,
    onSelectThinkingEffort: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val selectedModel = models.firstOrNull { it.id == selectedId }
    OrchBottomSheet(onDismiss = onDismiss) {
        OrchSheetHeader(
            title = "Select model",
            onClose = onDismiss
        )
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(bottom = OrchDimens.ScreenPadding)
        ) {
            if (models.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp)
                ) {
                    OrchEmptyMessage(text = "No models available")
                }
            } else {
                models.forEach { model ->
                    val selected = model.id == selectedId
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 56.dp)
                            .clickable {
                                onSelectModel(model.id)
                            }
                            .padding(horizontal = OrchDimens.ScreenPadding, vertical = OrchDimens.CardPaddingV)
                    ) {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = model.name,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f, fill = false)
                                )
                                model.badge?.takeIf { it.isNotBlank() }?.let { badge ->
                                    Surface(
                                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                                        shape = MaterialTheme.shapes.extraSmall,
                                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f))
                                    ) {
                                        Text(
                                            text = badge,
                                            style = MaterialTheme.typography.labelMedium,
                                            color = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }
                            if (model.contextWindow > 0) {
                                Text(
                                    text = "${formatContext(model.contextWindow)} context",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        if (selected) {
                            Icon(
                                imageVector = Icons.Rounded.Check,
                                contentDescription = "Selected",
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }
            if (selectedModel != null) {
                HorizontalDivider(
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.padding(vertical = OrchDimens.ItemGap)
                )
                Column(
                    verticalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap),
                    modifier = Modifier.padding(horizontal = OrchDimens.ScreenPadding, vertical = OrchDimens.ItemGap)
                ) {
                    Text(
                        text = "Thinking effort",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        selectedModel.thinkingEfforts.forEach { effort ->
                            OrchActionChip(
                                label = effort.replaceFirstChar(Char::uppercase),
                                selected = effort.equals(thinkingEffort, ignoreCase = true),
                                onClick = { onSelectThinkingEffort(effort) },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AccountSheet(
    name: String?,
    email: String?,
    budget: Budget?,
    githubAccount: GithubAccount?,
    githubConnecting: Boolean,
    githubDisconnecting: Boolean,
    githubError: String?,
    onConnectGithub: () -> Unit,
    onDisconnectGithub: () -> Unit,
    onSignOut: () -> Unit,
    onDismiss: () -> Unit
) {
    var confirmDisconnect by remember { mutableStateOf(false) }

    OrchBottomSheet(onDismiss = onDismiss) {
        OrchSheetHeader(
            title = "Account",
            onClose = onDismiss
        )
        Column(
            verticalArrangement = Arrangement.spacedBy(OrchDimens.SectionGap),
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(OrchDimens.ScreenPadding)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(OrchDimens.CardPaddingH)
            ) {
                OrchIconBadge(size = OrchDimens.AvatarLarge) {
                    Text(
                        text = (name ?: email ?: "?").take(1).uppercase(),
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = name ?: "Signed in",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    email?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            OrchCard {
                Column(verticalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(
                            painter = painterResource(R.drawable.ic_github_logo),
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = "GitHub",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.weight(1f)
                        )
                        if (githubConnecting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                    githubError?.let { OrchBanner(text = it, isError = true) }
                    if (githubAccount == null) {
                        Text(
                            text = "Connect GitHub to browse or create cloud project repositories.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        OrchSecondaryButton(
                            text = "Connect GitHub",
                            onClick = onConnectGithub,
                            enabled = !githubConnecting,
                            icon = Icons.Outlined.Add,
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            OrchIconBadge(
                                size = 32.dp,
                                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
                            ) {
                                if (githubAccount.avatarUrl.isNotBlank()) {
                                    AsyncImage(
                                        model = githubAccount.avatarUrl,
                                        contentDescription = null,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .size(32.dp)
                                            .clip(MaterialTheme.shapes.small)
                                    )
                                } else {
                                    Text(
                                        text = githubAccount.login.take(1).uppercase(),
                                        style = MaterialTheme.typography.labelLarge,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "@${githubAccount.login}",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                if (githubAccount.email.isNotBlank()) {
                                    Text(
                                        text = githubAccount.email,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                            IconButton(
                                enabled = !githubDisconnecting,
                                onClick = { confirmDisconnect = true }
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.Delete,
                                    contentDescription = "Disconnect @${githubAccount.login}",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }
                }
            }
            if (budget != null) {
                val ratio = if (budget.limitUsd > 0) (budget.costUsd / budget.limitUsd).toFloat().coerceIn(0f, 1f) else 0f
                OrchCard {
                    Column(verticalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "Monthly usage",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f)
                            )
                            Text(
                                text = "$%.2f / $%.2f".format(budget.costUsd, budget.limitUsd),
                                style = OrchMonoLabel,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        LinearProgressIndicator(
                            progress = { ratio },
                            color = if (ratio > 0.9f) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                            trackColor = MaterialTheme.colorScheme.background,
                            modifier = Modifier.fillMaxWidth()
                        )
                        if (budget.resetsOn.isNotBlank()) {
                            Text(
                                text = "Resets ${budget.resetsOn}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
            OrchSecondaryButton(
                text = "Sign out",
                onClick = onSignOut,
                icon = OrchIcons.Logout,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }

    if (confirmDisconnect && githubAccount != null) {
        OrchAlertDialog(
            title = "Disconnect @${githubAccount.login}?",
            onDismiss = { confirmDisconnect = false },
            confirmLabel = "Disconnect",
            onConfirm = {
                onDisconnectGithub()
                confirmDisconnect = false
            }
        ) {
            Text(
                text = "Cloud projects will require reconnecting GitHub before opening their sandbox.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

private fun formatContext(tokens: Long): String = when {
    tokens >= 1_000_000 && tokens % 1_000_000 == 0L -> "${tokens / 1_000_000}M"
    tokens >= 1_000_000 -> "%.1fM".format(tokens / 1_000_000.0)
    else -> "${tokens / 1000}K"
}

