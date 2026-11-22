use rig::conversation::Conversation;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use crate::events::TurnUsage;
use crate::events::ToolDisplayInfo;

fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub conversation: Conversation,
    #[serde(default)]
    pub context_tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HistoryUserPart {
    Text {
        text: String,
    },
    Image {
        #[serde(rename = "mimeType")]
        mime_type: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        data: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        uri: Option<String>,
    },
    Document {
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        path: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HistoryRecord {
    User {
        content: Vec<HistoryUserPart>,
    },
    Work {
        #[serde(rename = "durationSeconds")]
        duration_seconds: u64,
        #[serde(default, skip_serializing_if = "is_false")]
        stopped: bool,
    },
    Reasoning {
        text: String,
        #[serde(rename = "durationSeconds")]
        duration_seconds: u64,
    },
    ToolCall {
        id: String,
        name: String,
        arguments: Value,
        display: ToolDisplayInfo,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        output: Option<String>,
        #[serde(default, skip_serializing_if = "is_false")]
        #[serde(rename = "isError")]
        is_error: bool,
    },
    Text {
        text: String,
    },
    Compaction {
        id: String,
        #[serde(rename = "originalMessageCount")]
        original_message_count: usize,
        ts: i64,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub seq: i64,
    #[serde(flatten)]
    pub record: HistoryRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecordPage {
    pub records: Vec<SessionRecord>,
    pub has_more: bool,
    pub earliest_seq: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: Option<String>,
    pub workspace_path: Option<String>,
    pub updated_at: i64,
    pub context_tokens: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cached_tokens: i64,
    pub reasoning_tokens: i64,
    #[serde(default)]
    pub running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRef {
    pub path: String,
    pub name: String,
    pub is_image: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data_base64: Option<String>,
}
