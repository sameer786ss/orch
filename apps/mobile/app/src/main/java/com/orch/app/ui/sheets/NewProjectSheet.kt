package com.orch.app.ui.sheets

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
import com.orch.app.ui.icons.OrchIcons
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orch.app.R
import com.orch.app.data.GithubAccount
import com.orch.app.data.GithubRepo
import com.orch.app.ui.components.OrchActionChip
import com.orch.app.ui.components.OrchBanner
import com.orch.app.ui.components.OrchBottomSheet
import com.orch.app.ui.components.OrchCard
import com.orch.app.ui.components.OrchCenteredSpinner
import com.orch.app.ui.components.OrchEmptyMessage
import com.orch.app.ui.components.OrchIconBadge
import com.orch.app.ui.components.OrchPrimaryButton
import com.orch.app.ui.components.OrchSheetHeader
import com.orch.app.ui.components.OrchTextField
import com.orch.app.ui.theme.OrchDimens
import com.orch.app.ui.theme.OrchMonoBody
import com.orch.app.ui.theme.OrchMonoLabel
import kotlinx.coroutines.delay

@Composable
fun NewProjectSheet(
    accounts: List<GithubAccount>,
    accountsLoading: Boolean,
    connectingGithub: Boolean,
    repos: List<GithubRepo>,
    reposLoading: Boolean,
    reposError: String?,
    projectBusy: Boolean,
    projectError: String?,
    onConnectGithub: () -> Unit,
    onLoadRepos: (accountId: String?, query: String) -> Unit,
    onOpenRepo: (repoUrl: String, accountId: String) -> Unit,
    onCreateRepo: (accountId: String, name: String, description: String?, private: Boolean) -> Unit,
    onClearError: () -> Unit,
    onDismiss: () -> Unit
) {
    var createMode by rememberSaveable { mutableStateOf(false) }
    var selectedAccountId by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var repoName by rememberSaveable { mutableStateOf("") }
    var repoDesc by rememberSaveable { mutableStateOf("") }
    var privateRepo by rememberSaveable { mutableStateOf(true) }

    LaunchedEffect(accounts) {
        if (accounts.isEmpty()) {
            selectedAccountId = null
        } else if (accounts.size == 1 || (selectedAccountId != null && accounts.none { it.id == selectedAccountId })) {
            selectedAccountId = accounts.first().id
        }
    }

    LaunchedEffect(accounts, selectedAccountId, query, createMode) {
        if (accounts.isNotEmpty() && !createMode) {
            delay(if (query.isEmpty()) 0L else 250L)
            onLoadRepos(selectedAccountId, query.trim())
        }
    }

    val createAccountId = selectedAccountId ?: accounts.firstOrNull()?.id

    OrchBottomSheet(onDismiss = onDismiss) {
        OrchSheetHeader(
            title = "New project",
            subtitle = "Cloud workspace on GitHub",
            onClose = onDismiss
        )

        when {
            accountsLoading && accounts.isEmpty() -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp)
            ) { OrchCenteredSpinner() }

            accounts.isEmpty() -> Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(OrchDimens.SectionGap),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(OrchDimens.ScreenPadding)
                    .padding(vertical = 12.dp)
            ) {
                OrchIconBadge(size = 52.dp) {
                    Icon(
                        painter = painterResource(R.drawable.ic_github_logo),
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(26.dp)
                    )
                }
                Text(
                    text = "Connect GitHub to browse your repositories or create a new one.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
                projectError?.let { OrchBanner(text = it, isError = true) }
                OrchPrimaryButton(
                    text = if (connectingGithub) "Waiting for GitHub…" else "Connect GitHub",
                    onClick = onConnectGithub,
                    loading = connectingGithub,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            else -> Column(
                verticalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = OrchDimens.ScreenPadding)
                    .padding(top = OrchDimens.ItemGap, bottom = OrchDimens.ScreenPadding)
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OrchActionChip(
                        label = "Existing repos",
                        selected = !createMode,
                        onClick = {
                            onClearError()
                            createMode = false
                        },
                        modifier = Modifier.weight(1f)
                    )
                    OrchActionChip(
                        label = "Create new",
                        selected = createMode,
                        onClick = {
                            onClearError()
                            createMode = true
                        },
                        modifier = Modifier.weight(1f)
                    )
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                ) {
                    if (!createMode && accounts.size > 1) {
                        OrchActionChip(
                            label = "All accounts",
                            selected = selectedAccountId == null,
                            onClick = { selectedAccountId = null }
                        )
                    }
                    accounts.forEach { acc ->
                        val active = if (createMode) createAccountId == acc.id else selectedAccountId == acc.id
                        OrchActionChip(
                            label = "@${acc.login}",
                            selected = active,
                            onClick = { selectedAccountId = acc.id }
                        )
                    }
                    OrchActionChip(
                        label = if (connectingGithub) "Waiting…" else "+ Account",
                        enabled = !connectingGithub,
                        onClick = onConnectGithub
                    )
                }

                (projectError ?: reposError)?.let { err ->
                    OrchBanner(text = err, isError = true)
                }

                if (!createMode) {
                    OrchTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = "Search repositories",
                        leadingIcon = { Icon(Icons.Rounded.Search, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(onClick = { query = "" }) {
                                    Icon(Icons.Rounded.Close, "Clear search", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    )

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 180.dp, max = 380.dp)
                    ) {
                        when {
                            reposLoading -> OrchCenteredSpinner()
                            repos.isEmpty() -> OrchEmptyMessage(
                                text = "No repositories found",
                                actionLabel = "Create new repository",
                                onAction = { createMode = true }
                            )
                            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(repos, key = { "${it.accountId}:${it.fullName}" }) { repo ->
                                    OrchCard(
                                        onClick = if (!projectBusy) {
                                            { onOpenRepo(repo.url, repo.accountId) }
                                        } else {
                                            null
                                        }
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Icon(
                                                imageVector = if (repo.private) Icons.Outlined.Lock else OrchIcons.Public,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                                modifier = Modifier.size(18.dp)
                                            )
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    text = repo.fullName,
                                                    style = OrchMonoBody,
                                                    color = MaterialTheme.colorScheme.onSurface,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                                if (repo.description.isNotBlank()) {
                                                    Text(
                                                        text = repo.description,
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                        maxLines = 2,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }
                                            }
                                            Surface(
                                                color = MaterialTheme.colorScheme.surfaceContainerHigh,
                                                shape = MaterialTheme.shapes.extraSmall,
                                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                                            ) {
                                                Text(
                                                    text = if (repo.private) "Private" else "Public",
                                                    style = OrchMonoLabel,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap),
                        modifier = Modifier.verticalScroll(rememberScrollState())
                    ) {
                        val submit = {
                            if (createAccountId != null && repoName.isNotBlank() && !projectBusy) {
                                onCreateRepo(
                                    createAccountId,
                                    repoName.trim(),
                                    repoDesc.trim().takeIf { it.isNotEmpty() },
                                    privateRepo
                                )
                            }
                        }
                        OrchTextField(
                            value = repoName,
                            onValueChange = {
                                repoName = it
                                onClearError()
                            },
                            placeholder = "Repository name (e.g. my-app)",
                            keyboardOptions = KeyboardOptions(
                                capitalization = KeyboardCapitalization.None,
                                imeAction = ImeAction.Next
                            )
                        )
                        OrchTextField(
                            value = repoDesc,
                            onValueChange = { repoDesc = it },
                            placeholder = "Description (optional)",
                            keyboardOptions = KeyboardOptions(
                                capitalization = KeyboardCapitalization.Sentences,
                                imeAction = ImeAction.Done
                            ),
                            keyboardActions = KeyboardActions(onDone = { submit() })
                        )
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            OrchActionChip(
                                label = "Private",
                                selected = privateRepo,
                                onClick = { privateRepo = true },
                                modifier = Modifier.weight(1f)
                            )
                            OrchActionChip(
                                label = "Public",
                                selected = !privateRepo,
                                onClick = { privateRepo = false },
                                modifier = Modifier.weight(1f)
                            )
                        }
                        Spacer(Modifier.height(4.dp))
                        OrchPrimaryButton(
                            text = "Create & open",
                            onClick = submit,
                            enabled = createAccountId != null && repoName.isNotBlank(),
                            loading = projectBusy,
                            icon = Icons.Outlined.Add,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
        }
    }
}
