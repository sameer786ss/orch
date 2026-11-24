use rig::completion::Message;
use rig::conversation::Conversation;
use rig::message::{DocumentSourceKind, MimeType, ToolResultContent, UserContent};

use crate::config;
use crate::llm::{
    is_mention_context_part, is_payload_part, payload_part_label, NOTE_PART_PREFIX,
};
use crate::persistence::{HistoryRecord, HistoryUserPart};

pub fn is_safe_session_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= config::SESSION_ID_MAX_LEN
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn render_tool_result<'a>(content: impl IntoIterator<Item = &'a ToolResultContent>) -> String {
    content
        .into_iter()
        .filter_map(|part| match part {
            ToolResultContent::Text(t) => Some(t.text.as_str()),
            _ => None,
        })
        .collect()
}

pub fn user_history_record(message: &Message) -> Option<HistoryRecord> {
    let Message::User { content } = message else {
        return None;
    };
    let mut text = String::new();
    let mut parts: Vec<HistoryUserPart> = Vec::new();
    for part in content {
        match part {
            UserContent::Text(t) => {
                if is_payload_part(&t.text) {
                    if let Some(label) = payload_part_label(&t.text) {
                        if !is_mention_context_part(&t.text) {
                            let path = label
                                .split_once("#L")
                                .map(|(path, _)| path)
                                .unwrap_or(&label)
                                .to_string();
                            parts.push(HistoryUserPart::Document {
                                name: crate::util::basename(&path),
                                path: Some(path),
                            });
                        }
                    } else if let Some(note) = t
                        .text
                        .strip_prefix(NOTE_PART_PREFIX)
                        .and_then(|value| value.strip_suffix("</note>"))
                    {
                        if !text.is_empty() {
                            text.push_str("\n\n");
                        }
                        text.push_str(note);
                    }
                } else if text.is_empty() {
                    text = t.text.clone();
                } else {
                    text.push_str("\n\n");
                    text.push_str(&t.text);
                }
            }
            UserContent::Image(img) => {
                let mime_type = img
                    .media_type
                    .as_ref()
                    .map(|m| m.to_mime_type().to_string())
                    .unwrap_or_else(|| "image/png".to_string());
                match &img.data {
                    DocumentSourceKind::Base64(b64) => {
                        parts.push(HistoryUserPart::Image {
                            mime_type,
                            data: Some(b64.clone()),
                            uri: None,
                        });
                    }
                    DocumentSourceKind::Url(url) => {
                        parts.push(HistoryUserPart::Image {
                            mime_type,
                            data: None,
                            uri: Some(url.clone()),
                        });
                    }
                    _ => {}
                }
            }
            UserContent::Document(doc) => {
                let meta = doc.additional_params.as_ref();
                let is_mention = meta
                    .and_then(|m| m.get("isMention"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                if !is_mention {
                    let path = meta
                        .and_then(|m| m.get("path"))
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                    let name = meta
                        .and_then(|m| m.get("name"))
                        .and_then(|v| v.as_str())
                        .map(str::to_string)
                        .or_else(|| path.as_deref().map(crate::util::basename))
                        .unwrap_or_else(|| "document.pdf".to_string());
                    parts.push(HistoryUserPart::Document { name, path });
                }
            }
            _ => {}
        }
    }
    let mut content_parts: Vec<HistoryUserPart> = Vec::new();
    if !text.is_empty() {
        content_parts.push(HistoryUserPart::Text { text });
    }
    content_parts.extend(parts);
    (!content_parts.is_empty()).then_some(HistoryRecord::User {
        content: content_parts,
    })
}

pub fn replaced_message_count(conversation: &Conversation, end: usize) -> usize {
    conversation
        .entries()
        .take(end)
        .filter(|entry| entry.author.is_none())
        .count()
}

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::events::{ChatEvent, ToolDisplayInfo};
use crate::persistence::SessionRecord;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolStatus {
    Running,
    Done,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UserAttachment {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data_url: Option<String>,
    #[serde(default)]
    pub is_image: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MessageItem {
    Work {
        id: String,
        active: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        duration_seconds: Option<u64>,
        #[serde(default)]
        stopped: bool,
    },
    Reasoning {
        id: String,
        text: String,
        active: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        duration_seconds: Option<u64>,
    },
    ToolCall {
        id: String,
        #[serde(rename = "callId")]
        call_id: String,
        name: String,
        arguments: Value,
        display: ToolDisplayInfo,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        output: Option<String>,
        status: ToolStatus,
    },
    Text {
        id: String,
        text: String,
        active: bool,
    },
    CompactionNotice {
        id: String,
        #[serde(rename = "originalMessageCount")]
        original_message_count: usize,
        ts: i64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub role: Role,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub items: Vec<MessageItem>,
    #[serde(default)]
    pub attachments: Vec<UserAttachment>,
    #[serde(default)]
    pub streaming: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notice: Option<String>,
}

pub fn records_to_messages(records: &[SessionRecord]) -> Vec<ChatMessage> {
    let mut messages: Vec<ChatMessage> = Vec::new();
    let mut current_assistant_idx: Option<usize> = None;

    let ensure_assistant = |messages: &mut Vec<ChatMessage>,
                            current_idx: &mut Option<usize>,
                            seq: i64|
     -> usize {
        if let Some(idx) = *current_idx {
            return idx;
        }
        let created = ChatMessage {
            id: format!("h-{seq}"),
            role: Role::Assistant,
            text: String::new(),
            items: Vec::new(),
            attachments: Vec::new(),
            streaming: false,
            error: None,
            notice: None,
        };
        messages.push(created);
        let idx = messages.len() - 1;
        *current_idx = Some(idx);
        idx
    };

    for item in records {
        match &item.record {
            HistoryRecord::User { content } => {
                current_assistant_idx = None;
                let mut texts = Vec::new();
                let mut attachments = Vec::new();
                for part in content {
                    match part {
                        HistoryUserPart::Text { text } => {
                            if !text.is_empty() {
                                texts.push(text.clone());
                            }
                        }
                        HistoryUserPart::Image {
                            mime_type,
                            data,
                            uri,
                        } => {
                            let ext = mime_type.split('/').nth(1).unwrap_or("png");
                            let data_url = data
                                .as_ref()
                                .map(|d| format!("data:{mime_type};base64,{d}"))
                                .or_else(|| uri.clone());
                            attachments.push(UserAttachment {
                                name: format!("image.{ext}"),
                                path: None,
                                data_url,
                                is_image: true,
                            });
                        }
                        HistoryUserPart::Document { name, path } => {
                            attachments.push(UserAttachment {
                                name: name.clone(),
                                path: path.clone(),
                                data_url: None,
                                is_image: false,
                            });
                        }
                    }
                }
                let combined_text = texts.join("\n\n");
                let user_items = if combined_text.is_empty() {
                    Vec::new()
                } else {
                    vec![MessageItem::Text {
                        id: format!("h-{}-text", item.seq),
                        text: combined_text.clone(),
                        active: false,
                    }]
                };
                messages.push(ChatMessage {
                    id: format!("h-{}", item.seq),
                    role: Role::User,
                    text: combined_text,
                    items: user_items,
                    attachments,
                    streaming: false,
                    error: None,
                    notice: None,
                });
            }
            HistoryRecord::Work {
                duration_seconds,
                stopped,
            } => {
                let idx = ensure_assistant(&mut messages, &mut current_assistant_idx, item.seq);
                messages[idx].items.push(MessageItem::Work {
                    id: format!("h-{}", item.seq),
                    active: false,
                    duration_seconds: Some(*duration_seconds),
                    stopped: *stopped,
                });
            }
            HistoryRecord::Reasoning {
                text,
                duration_seconds,
            } => {
                if !text.is_empty() {
                    let idx =
                        ensure_assistant(&mut messages, &mut current_assistant_idx, item.seq);
                    messages[idx].items.push(MessageItem::Reasoning {
                        id: format!("h-{}", item.seq),
                        text: text.clone(),
                        active: false,
                        duration_seconds: Some(*duration_seconds),
                    });
                }
            }
            HistoryRecord::ToolCall {
                id,
                name,
                arguments,
                display,
                output,
                is_error,
            } => {
                let idx = ensure_assistant(&mut messages, &mut current_assistant_idx, item.seq);
                messages[idx].items.push(MessageItem::ToolCall {
                    id: if id.is_empty() {
                        format!("h-{}", item.seq)
                    } else {
                        id.clone()
                    },
                    call_id: id.clone(),
                    name: name.clone(),
                    arguments: arguments.clone(),
                    display: display.clone(),
                    output: output.clone(),
                    status: if *is_error {
                        ToolStatus::Error
                    } else {
                        ToolStatus::Done
                    },
                });
            }
            HistoryRecord::Text { text } => {
                if !text.is_empty() {
                    let idx =
                        ensure_assistant(&mut messages, &mut current_assistant_idx, item.seq);
                    messages[idx].items.push(MessageItem::Text {
                        id: format!("h-{}", item.seq),
                        text: text.clone(),
                        active: false,
                    });
                }
            }
            HistoryRecord::Compaction {
                id,
                original_message_count,
                ts,
            } => {
                current_assistant_idx = None;
                messages.push(ChatMessage {
                    id: if id.is_empty() {
                        format!("h-{}", item.seq)
                    } else {
                        id.clone()
                    },
                    role: Role::System,
                    text: String::new(),
                    items: vec![MessageItem::CompactionNotice {
                        id: if id.is_empty() {
                            format!("h-{}-compaction", item.seq)
                        } else {
                            format!("{id}-notice")
                        },
                        original_message_count: *original_message_count,
                        ts: *ts,
                    }],
                    attachments: Vec::new(),
                    streaming: false,
                    error: None,
                    notice: None,
                });
            }
            HistoryRecord::Error { message } => {
                let idx = ensure_assistant(&mut messages, &mut current_assistant_idx, item.seq);
                messages[idx].error = Some(message.clone());
            }
        }
    }
    messages
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatSessionState {
    pub messages: Vec<ChatMessage>,
    pub context_tokens: u64,
    pub streaming: bool,
    counter: usize,
}

impl ChatSessionState {
    pub fn new() -> Self {
        Self::default()
    }

    fn new_id(&mut self) -> String {
        self.counter += 1;
        format!("c{}", self.counter)
    }

    pub fn begin_turn(&mut self, prompt: &str, attachments: Vec<UserAttachment>) {
        let user_id = self.new_id();
        let assistant_id = self.new_id();
        let user_items = if prompt.trim().is_empty() {
            Vec::new()
        } else {
            vec![MessageItem::Text {
                id: format!("{user_id}-text"),
                text: prompt.to_string(),
                active: false,
            }]
        };
        self.messages.push(ChatMessage {
            id: user_id,
            role: Role::User,
            text: prompt.to_string(),
            items: user_items,
            attachments,
            streaming: false,
            error: None,
            notice: None,
        });
        self.messages.push(ChatMessage {
            id: assistant_id,
            role: Role::Assistant,
            text: String::new(),
            items: Vec::new(),
            attachments: Vec::new(),
            streaming: true,
            error: None,
            notice: None,
        });
        self.streaming = true;
    }

    pub fn apply_event(&mut self, event: &ChatEvent) {
        match event {
            ChatEvent::WorkStart => {
                if let Some(msg) = self.last_streaming_assistant_mut() {
                    let id = format!("w-{}", msg.items.len());
                    msg.items.push(MessageItem::Work {
                        id,
                        active: true,
                        duration_seconds: None,
                        stopped: false,
                    });
                }
            }
            ChatEvent::WorkStop { duration_seconds, stopped } => {
                if let Some(msg) = self.last_streaming_assistant_mut() {
                    for item in msg.items.iter_mut().rev() {
                        if let MessageItem::Work { active, duration_seconds: dur, stopped: st, .. } = item {
                            *active = false;
                            *dur = Some(*duration_seconds);
                            *st = *stopped;
                            break;
                        }
                    }
                }
            }
            ChatEvent::ReasoningStart => {
                if let Some(msg) = self.last_streaming_assistant_mut() {
                    let id = format!("r-{}", msg.items.len());
                    msg.items.push(MessageItem::Reasoning {
                        id,
                        text: String::new(),
                        active: true,
                        duration_seconds: None,
                    });
                }
            }
            ChatEvent::ReasoningDelta { text } => {
                if let Some(msg) = self.last_streaming_assistant_mut() {
                    for item in msg.items.iter_mut().rev() {
                        if let MessageItem::Reasoning { text: rtext, active: true, .. } = item {
                            rtext.push_str(text);
                            break;
                        }
                    }
                }
            }
            ChatEvent::ReasoningStop { duration_seconds } => {
                if let Some(msg) = self.last_streaming_assistant_mut() {
                    for item in msg.items.iter_mut().rev() {
                        if let MessageItem::Reasoning { active, duration_seconds: dur, .. } = item {
                            *active = false;
                            *dur = Some(*duration_seconds);
                            break;
                        }
                    }
                }
            }
            ChatEvent::TextDelta { text } => {
                if let Some(msg) = self.last_streaming_assistant_mut() {
                    msg.text.push_str(text);
                    let mut found = false;
                    for item in msg.items.iter_mut().rev() {
                        if let MessageItem::Text { text: ttext, active: true, .. } = item {
                            ttext.push_str(text);
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        let id = format!("t-{}", msg.items.len());
                        msg.items.push(MessageItem::Text {
                            id,
                            text: text.clone(),
                            active: true,
                        });
                    }
                }
            }
            ChatEvent::TextStop => {
                if let Some(msg) = self.last_streaming_assistant_mut() {
                    for item in msg.items.iter_mut().rev() {
                        if let MessageItem::Text { active, .. } = item {
                            *active = false;
                            break;
                        }
                    }
                }
            }
            ChatEvent::ToolStart { id, name, arguments, display } => {
                if let Some(msg) = self.last_streaming_assistant_mut() {
                    msg.items.push(MessageItem::ToolCall {
                        id: id.clone(),
                        call_id: id.clone(),
                        name: name.clone(),
                        arguments: arguments.clone(),
                        display: display.clone(),
                        output: None,
                        status: ToolStatus::Running,
                    });
                }
            }
            ChatEvent::ToolResult { call_id, is_error, output } => {
                if let Some(msg) = self.last_streaming_assistant_mut() {
                    for item in msg.items.iter_mut().rev() {
                        if let MessageItem::ToolCall { call_id: cid, output: out, status, .. } = item {
                            if cid == call_id {
                                *out = Some(output.clone());
                                *status = if *is_error { ToolStatus::Error } else { ToolStatus::Done };
                                break;
                            }
                        }
                    }
                }
            }
            ChatEvent::Usage(usage) => {
                self.context_tokens = usage.context_tokens;
            }
            ChatEvent::Notice { message } => {
                if let Some(msg) = self.last_streaming_assistant_mut() {
                    msg.notice = Some(message.clone());
                }
            }
            ChatEvent::Compacted { id, original_message_count, ts, context_tokens } => {
                self.context_tokens = *context_tokens;
                self.messages.push(ChatMessage {
                    id: id.clone(),
                    role: Role::System,
                    text: String::new(),
                    items: vec![MessageItem::CompactionNotice {
                        id: format!("{id}-notice"),
                        original_message_count: *original_message_count,
                        ts: *ts,
                    }],
                    attachments: Vec::new(),
                    streaming: false,
                    error: None,
                    notice: None,
                });
            }
            ChatEvent::Cancelled => {
                self.settle(true, None);
            }
            ChatEvent::Error { message, .. } => {
                self.settle(false, Some(message.clone()));
            }
            ChatEvent::Done => {
                self.settle(false, None);
            }
            _ => {}
        }
    }

    pub fn settle(&mut self, cancelled: bool, error: Option<String>) {
        self.streaming = false;
        if let Some(msg) = self.last_streaming_assistant_mut() {
            msg.streaming = false;
            msg.error = error;
            if cancelled {
                msg.notice = Some("Operation cancelled".to_string());
            }
            for item in &mut msg.items {
                match item {
                    MessageItem::Work { active, .. } => *active = false,
                    MessageItem::Reasoning { active, .. } => *active = false,
                    MessageItem::Text { active, .. } => *active = false,
                    MessageItem::ToolCall { status, .. } => {
                        if *status == ToolStatus::Running {
                            *status = if cancelled { ToolStatus::Error } else { ToolStatus::Done };
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    fn last_streaming_assistant_mut(&mut self) -> Option<&mut ChatMessage> {
        let last = self.messages.last_mut()?;
        if last.role == Role::Assistant && last.streaming {
            Some(last)
        } else {
            None
        }
    }
}
