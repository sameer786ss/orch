use rig::completion::Usage;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::persistence::HistoryUserPart;

fn is_false(value: &bool) -> bool {
    !*value
}

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
    User {
        content: Vec<HistoryUserPart>,
    },
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
        #[serde(default, skip_serializing_if = "Option::is_none")]
        text: Option<String>,
    },
    TextDelta {
        text: String,
    },
    TextStop {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        text: Option<String>,
    },
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
        let value = serde_json::to_value(self).unwrap_or_else(|_| {
            serde_json::json!({
                "type": "error",
                "message": "failed to serialize event"
            })
        });
        let kind = value
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("error");
        let data = serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_string());
        format!("event: {kind}\ndata: {data}\n\n")
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

pub struct SseFrame {
    pub event: Option<String>,
    pub id: Option<u64>,
    pub data: String,
}

pub fn parse_sse_block(block: &str) -> SseFrame {
    let mut event = None;
    let mut id = None;
    let mut data = Vec::new();
    for line in block.lines() {
        if let Some(rest) = line.strip_prefix("event:") {
            event = Some(rest.trim().to_string());
        } else if let Some(rest) = line.strip_prefix("id:") {
            id = rest.trim().parse().ok();
        } else if let Some(rest) = line.strip_prefix("data:") {
            data.push(rest.strip_prefix(' ').unwrap_or(rest));
        }
    }
    SseFrame {
        event,
        id,
        data: data.join("\n"),
    }
}

#[derive(Default)]
pub struct SseBlockSplitter {
    buffer: Vec<u8>,
    scanned: usize,
}

impl SseBlockSplitter {
    pub fn push(&mut self, chunk: &[u8]) {
        self.buffer
            .extend(chunk.iter().copied().filter(|byte| *byte != b'\r'));
    }

    pub fn buffered(&self) -> usize {
        self.buffer.len()
    }

    pub fn next_block(&mut self) -> Option<String> {
        let start = self.scanned.saturating_sub(1);
        match self.buffer[start..]
            .windows(2)
            .position(|pair| pair == b"\n\n")
        {
            Some(offset) => {
                let end = start + offset;
                let block = String::from_utf8_lossy(&self.buffer[..end]).into_owned();
                self.buffer.drain(..end + 2);
                self.scanned = 0;
                Some(block)
            }
            None => {
                self.scanned = self.buffer.len();
                None
            }
        }
    }
}

pub trait EventSink: Send + Sync {
    fn send(&self, event: ChatEvent);
}
