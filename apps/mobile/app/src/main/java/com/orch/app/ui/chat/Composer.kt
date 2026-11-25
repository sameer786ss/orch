package com.orch.app.ui.chat

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.clearText
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import coil3.compose.AsyncImage
import com.orch.app.ui.PendingAttachment
import com.orch.app.ui.components.OrchCircleIconButton
import com.orch.app.ui.icons.OrchIcons
import com.orch.app.ui.theme.OrchDimens
import com.orch.app.ui.theme.OrchMonoLabel
import com.orch.app.voice.VoicePromptRecorder
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun Composer(
    placeholder: String,
    streaming: Boolean,
    canSend: Boolean,
    attachments: List<PendingAttachment>,
    modelLabel: String,
    contextRatio: Float,
    onSend: (String) -> Boolean,
    onStop: () -> Unit,
    onAttach: () -> Unit,
    onPickModel: () -> Unit,
    onRemoveAttachment: (Uri) -> Unit,
    transcribe: suspend (String, String) -> String?,
    modifier: Modifier = Modifier
) {
    val state = rememberTextFieldState()
    val hasText by remember { derivedStateOf { state.text.isNotBlank() } }
    val hasContent = hasText || attachments.isNotEmpty()
    val sendEnabled = canSend && hasContent
    var micActive by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = OrchDimens.ScreenPadding, vertical = OrchDimens.ItemGap)
    ) {
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(24.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
        ) {
            Column(
                modifier = Modifier.padding(
                    horizontal = 6.dp,
                    vertical = 6.dp
                )
            ) {
                if (attachments.isNotEmpty()) {
                    AttachmentStrip(attachments, onRemoveAttachment)
                }
                BasicTextField(
                    state = state,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    lineLimits = TextFieldLineLimits.MultiLine(minHeightInLines = 1, maxHeightInLines = 6),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    decorator = { inner ->
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 38.dp)
                                .padding(top = 6.dp, bottom = 2.dp),
                            contentAlignment = Alignment.CenterStart
                        ) {
                            if (state.text.isEmpty()) {
                                Text(
                                    text = placeholder,
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                            inner()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp)
                        .testTag("composer_input")
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    IconButton(
                        onClick = onAttach,
                        modifier = Modifier.testTag("composer_attach_button")
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Add,
                            contentDescription = "Attach",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                            modifier = Modifier
                                .heightIn(min = 40.dp)
                                .clip(MaterialTheme.shapes.small)
                                .clickable(onClick = onPickModel)
                                .padding(horizontal = 6.dp, vertical = 6.dp)
                                .testTag("composer_model_button")
                        ) {
                            Text(
                                text = modelLabel,
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f, fill = false)
                            )
                            Icon(
                                imageVector = Icons.Rounded.KeyboardArrowDown,
                                contentDescription = "Select model",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    if (contextRatio > 0f) {
                        CircularProgressIndicator(
                            progress = { contextRatio },
                            modifier = Modifier
                                .padding(end = 6.dp)
                                .size(16.dp),
                            strokeWidth = 2.dp,
                            color = if (contextRatio > 0.85f) {
                                MaterialTheme.colorScheme.error
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            trackColor = MaterialTheme.colorScheme.outline
                        )
                    }
                    val action = when {
                        streaming -> ComposerAction.Stop
                        canSend && (micActive || !hasContent) -> ComposerAction.Mic
                        else -> ComposerAction.Send
                    }
                    AnimatedContent(
                        targetState = action,
                        transitionSpec = {
                            (fadeIn() + scaleIn(initialScale = 0.8f)) togetherWith
                                (fadeOut() + scaleOut(targetScale = 0.8f))
                        },
                        label = "composerAction"
                    ) { target ->
                        when (target) {
                            ComposerAction.Mic -> MicButton(
                                transcribe = transcribe,
                                onBusyChange = { micActive = it },
                                onText = { text ->
                                    val current = state.text
                                    val separator = if (current.isNotEmpty() && !current.last().isWhitespace()) " " else ""
                                    state.edit { append(separator + text) }
                                }
                            )
                            ComposerAction.Stop, ComposerAction.Send -> {
                                val isStop = target == ComposerAction.Stop
                                OrchCircleIconButton(
                                    onClick = {
                                        if (isStop) {
                                            onStop()
                                        } else {
                                            if (onSend(state.text.toString())) state.clearText()
                                        }
                                    },
                                    enabled = isStop || sendEnabled,
                                    icon = if (isStop) OrchIcons.Stop else OrchIcons.ArrowUpward,
                                    contentDescription = if (isStop) "Stop" else "Send",
                                    containerColor = if (isStop) {
                                        MaterialTheme.colorScheme.error
                                    } else {
                                        MaterialTheme.colorScheme.onSurface
                                    },
                                    contentColor = if (isStop) {
                                        MaterialTheme.colorScheme.onError
                                    } else {
                                        MaterialTheme.colorScheme.background
                                    },
                                    modifier = Modifier.testTag("composer_send_button")
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private enum class ComposerAction {
    Mic,
    Send,
    Stop
}

@Composable
private fun AttachmentStrip(attachments: List<PendingAttachment>, onRemove: (Uri) -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(OrchDimens.ItemGap),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(start = 10.dp, end = 10.dp, top = 4.dp, bottom = 8.dp)
    ) {
        attachments.forEach { attachment ->
            if (attachment.isImage) {
                Box(modifier = Modifier.padding(top = 6.dp, end = 6.dp)) {
                    AsyncImage(
                        model = attachment.uri,
                        contentDescription = attachment.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(56.dp)
                            .clip(MaterialTheme.shapes.small)
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                            .border(1.dp, MaterialTheme.colorScheme.outline, MaterialTheme.shapes.small)
                    )
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .offset(x = 6.dp, y = (-6).dp)
                            .size(22.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                            .clickable { onRemove(attachment.uri) }
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = "Remove ${attachment.name}",
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(13.dp)
                        )
                    }
                }
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier
                        .heightIn(min = 40.dp)
                        .clip(MaterialTheme.shapes.small)
                        .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                        .border(1.dp, MaterialTheme.colorScheme.outline, MaterialTheme.shapes.small)
                        .padding(start = 8.dp, top = 4.dp, bottom = 4.dp, end = 2.dp)
                ) {
                    Icon(
                        imageVector = OrchIcons.AttachFile,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = attachment.name,
                        style = OrchMonoLabel,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.widthIn(max = 160.dp)
                    )
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .minimumInteractiveComponentSize()
                            .size(32.dp)
                            .clip(MaterialTheme.shapes.extraSmall)
                            .clickable { onRemove(attachment.uri) }
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = "Remove ${attachment.name}",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MicButton(
    transcribe: suspend (String, String) -> String?,
    onBusyChange: (Boolean) -> Unit,
    onText: (String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val recorder = remember(context) { VoicePromptRecorder(context) }
    var recording by remember { mutableStateOf(false) }
    var transcribing by remember { mutableStateOf(false) }
    var elapsedSeconds by remember { mutableIntStateOf(0) }
    val latestTranscribe by rememberUpdatedState(transcribe)
    val latestOnText by rememberUpdatedState(onText)

    LaunchedEffect(recording, transcribing) {
        onBusyChange(recording || transcribing)
    }

    DisposableEffect(recorder) {
        onDispose {
            recorder.cancel()
            onBusyChange(false)
        }
    }

    LifecycleEventEffect(Lifecycle.Event.ON_STOP) {
        if (recording) {
            recorder.cancel()
            recording = false
        }
    }

    LaunchedEffect(recording) {
        elapsedSeconds = 0
        while (recording) {
            delay(1000)
            elapsedSeconds++
        }
    }

    fun finish() {
        if (!recording) return
        recording = false
        scope.launch {
            transcribing = true
            try {
                recorder.stop()
                    .onSuccess { (audio, format) -> latestTranscribe(audio, format)?.let(latestOnText) }
                    .onFailure { Toast.makeText(context, it.message ?: "Recording failed", Toast.LENGTH_SHORT).show() }
            } finally {
                transcribing = false
            }
        }
    }

    fun begin() {
        recorder.start(onLimit = ::finish)
            .onSuccess { recording = true }
            .onFailure { Toast.makeText(context, it.message ?: "Microphone unavailable", Toast.LENGTH_SHORT).show() }
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) begin()
    }

    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        if (recording) {
            Text(
                text = "%d:%02d".format(elapsedSeconds / 60, elapsedSeconds % 60),
                style = OrchMonoLabel,
                color = MaterialTheme.colorScheme.primary
            )
        }
        OrchCircleIconButton(
            onClick = {
                when {
                    recording -> finish()
                    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                        PackageManager.PERMISSION_GRANTED -> begin()
                    else -> permission.launch(Manifest.permission.RECORD_AUDIO)
                }
            },
            enabled = !transcribing,
            loading = transcribing,
            icon = if (recording) OrchIcons.Stop else OrchIcons.Mic,
            contentDescription = if (recording) "Stop recording" else "Dictate",
            containerColor = if (recording) {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
            } else {
                MaterialTheme.colorScheme.surfaceContainerHigh
            },
            contentColor = if (recording) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            modifier = Modifier.testTag("composer_mic_button")
        )
    }
}

