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
