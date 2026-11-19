use rig::completion::Usage;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ToolDisplayInfo {
    pub label: String,
    pub active_label: String,
    pub filename: Option<String>,
    pub full_path: Option<String>,
    pub line_range: Option<String>,
    pub added_lines: Option<u32>,
    pub removed_lines: Option<u32>,
    pub target_text: Option<String>,
    pub icon: ToolIcon,
    pub opens_artifact: bool,
    pub connector: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ToolIcon {
    #[default]
    File,
    Folder,
    Terminal,
    Search,
    Globe,
    Book,
    Cpu,
    ZapOff,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnUsage {
    pub context_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
}

impl TurnUsage {
    pub fn from_rig(usage: &Usage) -> Option<Self> {
        Some(Self {
            context_tokens: usage.context_tokens()?,
            input_tokens: usage.input_tokens.unwrap_or(0),
            output_tokens: usage.output_tokens.unwrap_or(0),
            cached_tokens: usage.cached_input_tokens.unwrap_or(0),
            reasoning_tokens: usage.reasoning_tokens.unwrap_or(0),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChatEvent {
    WorkStart,
    WorkStop {
        #[serde(rename = "durationSeconds")]
        duration_seconds: u64,
        stopped: bool,
    },
    ReasoningStart,
    ReasoningDelta {
        text: String,
    },
    ReasoningStop {
        #[serde(rename = "durationSeconds")]
        duration_seconds: u64,
    },
    TextDelta {
        text: String,
    },
    TextStop,
    ToolStart {
        id: String,
        name: String,
        arguments: Value,
        display: ToolDisplayInfo,
    },
    ToolResult {
        #[serde(rename = "callId")]
        call_id: String,
        #[serde(rename = "isError")]
        is_error: bool,
        output: String,
    },
    FileWritten {
        path: String,
    },
    Usage(TurnUsage),
    Notice {
        message: String,
    },
    Compacted {
        id: String,
        #[serde(rename = "originalMessageCount")]
        original_message_count: usize,
        ts: i64,
        #[serde(rename = "contextTokens")]
        context_tokens: u64,
    },
    Resync,
    Cancelled,
    Error {
        message: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        code: Option<String>,
    },
    Done,
}

impl ChatEvent {
    pub fn from_sse(event: Option<&str>, data: &str) -> Option<Self> {
        let trimmed = data.trim();
        if !trimmed.is_empty() {
            if let Ok(parsed) = serde_json::from_str::<Self>(trimmed) {
                return Some(parsed);
            }
        }
        match event.map(str::trim) {
            Some("done") => Some(Self::Done),
            Some("resync") => Some(Self::Resync),
            Some("cancelled") => Some(Self::Cancelled),
            _ => None,
        }
    }

    pub fn to_sse_block(&self) -> String {
        let kind = self.event_type();
        let data = serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string());
        format!("event: {kind}\ndata: {data}\n\n")
    }

    pub fn event_type(&self) -> &'static str {
        match self {
            Self::WorkStart => "workStart",
            Self::WorkStop { .. } => "workStop",
            Self::ReasoningStart => "reasoningStart",
            Self::ReasoningDelta { .. } => "reasoningDelta",
            Self::ReasoningStop { .. } => "reasoningStop",
            Self::TextDelta { .. } => "textDelta",
            Self::TextStop => "textStop",
            Self::ToolStart { .. } => "toolStart",
            Self::ToolResult { .. } => "toolResult",
            Self::FileWritten { .. } => "fileWritten",
            Self::Usage(_) => "usage",
            Self::Notice { .. } => "notice",
            Self::Compacted { .. } => "compacted",
            Self::Resync => "resync",
            Self::Cancelled => "cancelled",
            Self::Error { .. } => "error",
            Self::Done => "done",
        }
    }

    pub fn is_done(&self) -> bool {
        matches!(self, Self::Done)
    }

    pub fn notice(message: impl Into<String>) -> Self {
        Self::Notice {
            message: message.into(),
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self::Error {
            message: message.into(),
            code: Some("local".to_string()),
        }
    }

    pub fn error_with_code(message: impl Into<String>, code: impl Into<String>) -> Self {
        Self::Error {
            message: message.into(),
            code: Some(code.into()),
        }
    }
}

pub trait EventSink: Send + Sync {
    fn send(&self, event: ChatEvent);
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DictationEvent {
    Final { text: String },
    Error { message: String },
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TerminalEvent {
    Data { data: String },
    Exit,
}
