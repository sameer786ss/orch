package com.orch.app.ui.sheets

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.orch.app.ui.ConnectorsUi
import com.orch.app.ui.icons.OrchIcons
import com.orch.app.ui.components.OrchBottomSheet
import com.orch.app.ui.components.OrchCard
import com.orch.app.ui.components.OrchIconBadge
import com.orch.app.ui.components.OrchSheetHeader
import com.orch.app.ui.theme.OrchDimens
import com.orch.app.ui.theme.OrchSuccess

@Composable
fun AttachmentSheet(
    connectors: ConnectorsUi,
    onPickImages: () -> Unit,
    onPickFiles: () -> Unit,
    onToggleConnector: (String) -> Unit,
    onManageConnectors: () -> Unit,
    onDismiss: () -> Unit
) {
    val connectedApps = connectors.items.filter { it.connected }

    OrchBottomSheet(onDismiss = onDismiss) {
        OrchSheetHeader(
            title = "Add to chat",
            onClose = onDismiss
        )
        Column(
            verticalArrangement = Arrangement.spacedBy(OrchDimens.SectionGap),
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(OrchDimens.ScreenPadding)
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap),
                modifier = Modifier.fillMaxWidth()
            ) {
                AttachmentSourceTile(
                    title = "Photos",
                    subtitle = "Images & screenshots",
                    icon = OrchIcons.Image,
                    onClick = onPickImages,
                    modifier = Modifier.weight(1f)
                )
                AttachmentSourceTile(
                    title = "Files",
                    subtitle = "Docs & code",
                    icon = OrchIcons.AttachFile,
                    onClick = onPickFiles,
                    modifier = Modifier.weight(1f)
                )
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outline)

            Column(verticalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Connectors",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f)
                    )
                    TextButton(onClick = onManageConnectors) {
                        Text("Manage", color = MaterialTheme.colorScheme.primary)
                    }
                }

                if (connectedApps.isEmpty()) {
                    Text(
                        text = "No connected apps yet. Link Drive, Gmail, Jira, or Slack in Connectors.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    connectedApps.forEach { item ->
                        OrchCard {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                OrchIconBadge(
                                    size = 34.dp,
                                    containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
                                ) {
                                    item.definition.iconUrl?.trim()?.takeIf { it.isNotEmpty() }?.let { url ->
                                        AsyncImage(
                                            model = url,
                                            contentDescription = null,
                                            contentScale = ContentScale.Fit,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = item.definition.name,
                                        style = MaterialTheme.typography.titleSmall,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    if (item.definition.category.isNotBlank()) {
                                        Text(
                                            text = item.definition.category,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                                Switch(
                                    checked = item.active,
                                    onCheckedChange = { onToggleConnector(item.definition.id) },
                                    colors = SwitchDefaults.colors(
                                        checkedThumbColor = MaterialTheme.colorScheme.background,
                                        checkedTrackColor = OrchSuccess,
                                        uncheckedThumbColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                        uncheckedTrackColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                                        uncheckedBorderColor = MaterialTheme.colorScheme.outline
                                    )
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AttachmentSourceTile(
    title: String,
    subtitle: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = modifier
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.padding(14.dp)
        ) {
            OrchIconBadge(
                size = 36.dp,
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(18.dp)
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
