use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use serde_json::Value;

use crate::events::{ChatEvent, EventSink, ToolDisplayInfo, TurnUsage};

enum OpenStep {
    Reasoning { started: Instant, text: String },
    Text { text: String },
}

struct ActiveWork {
    started: Instant,
    items: Vec<ChatEvent>,
}

pub struct TurnRecorder {
    sink: Arc<dyn EventSink>,
    work: Option<ActiveWork>,
    open: Option<OpenStep>,
    pending_tools: HashMap<String, usize>,
    completed: Vec<ChatEvent>,
    partial_text: String,
}

impl TurnRecorder {
    pub fn new(sink: Arc<dyn EventSink>) -> Self {
        Self {
            sink,
            work: None,
            open: None,
            pending_tools: HashMap::new(),
            completed: Vec::new(),
            partial_text: String::new(),
        }
    }

    fn ensure_work(&mut self) {
        if self.work.is_some() {
            return;
        }
        self.sink.send(ChatEvent::WorkStart);
        self.work = Some(ActiveWork {
            started: Instant::now(),
            items: Vec::new(),
        });
    }

    fn close_open_step(&mut self) {
        let Some(open) = self.open.take() else {
            return;
        };
        match open {
            OpenStep::Reasoning { started, text } => {
                let duration_seconds = started.elapsed().as_secs_f64().round().max(1.0) as u64;
                self.sink.send(ChatEvent::ReasoningStop {
                    duration_seconds,
                    text: None,
                });
                if let Some(work) = &mut self.work {
                    work.items.push(ChatEvent::ReasoningStop {
                        duration_seconds,
                        text: Some(text),
                    });
                }
            }
            OpenStep::Text { text } => {
                self.sink.send(ChatEvent::TextStop { text: None });
                if !text.is_empty() {
                    self.completed.push(ChatEvent::TextStop { text: Some(text) });
                }
            }
        }
    }

    fn close_work(&mut self, stopped: bool) {
        let Some(mut active) = self.work.take() else {
            return;
        };
        if !self.pending_tools.is_empty() {
            for (_, idx) in self.pending_tools.drain() {
                if let Some(ChatEvent::ToolCall { is_error, .. }) = active.items.get_mut(idx) {
                    *is_error = true;
                }
            }
        }
        let duration_seconds = active.started.elapsed().as_secs_f64().round().max(1.0) as u64;
        self.sink.send(ChatEvent::WorkStop {
            duration_seconds,
            stopped,
        });
        self.completed.push(ChatEvent::WorkStop {
            duration_seconds,
            stopped,
        });
        self.completed.extend(active.items);
    }

    pub fn on_reasoning_delta(&mut self, text: String) {
        if text.is_empty() {
            return;
        }
        if !matches!(self.open, Some(OpenStep::Reasoning { .. })) {
            self.close_open_step();
            self.ensure_work();
            self.sink.send(ChatEvent::ReasoningStart);
            self.open = Some(OpenStep::Reasoning {
                started: Instant::now(),
                text: String::new(),
            });
        }
        if let Some(OpenStep::Reasoning { text: buf, .. }) = &mut self.open {
            buf.push_str(&text);
        }
        self.sink.send(ChatEvent::ReasoningDelta { text });
    }

    pub fn on_text_delta(&mut self, text: String) {
        if text.is_empty() {
            return;
        }
        if !matches!(self.open, Some(OpenStep::Text { .. })) {
            self.close_open_step();
            self.close_work(false);
            self.open = Some(OpenStep::Text {
                text: String::new(),
            });
        }
        if let Some(OpenStep::Text { text: buf }) = &mut self.open {
            buf.push_str(&text);
        }
        self.partial_text.push_str(&text);
        self.sink.send(ChatEvent::TextDelta { text });
    }

    pub fn on_tool_call(
        &mut self,
        id: String,
        name: String,
        arguments: Value,
        display: ToolDisplayInfo,
    ) {
        self.close_open_step();
        self.ensure_work();
        self.sink.send(ChatEvent::ToolStart {
            id: id.clone(),
            name: name.clone(),
            arguments: arguments.clone(),
            display: display.clone(),
        });
        if let Some(work) = &mut self.work {
            let idx = work.items.len();
            self.pending_tools.insert(id.clone(), idx);
            work.items.push(ChatEvent::ToolCall {
                id,
                name,
                arguments,
                display,
                output: None,
                is_error: false,
            });
        }
    }

    pub fn on_tool_result(&mut self, call_id: String, is_error: bool, output: String) {
        self.sink.send(ChatEvent::ToolResult {
            call_id: call_id.clone(),
            is_error,
            output: output.clone(),
        });
        if let Some(idx) = self.pending_tools.remove(&call_id) {
            if let Some(work) = &mut self.work {
                if let Some(ChatEvent::ToolCall {
                    output: slot_out,
                    is_error: slot_err,
                    ..
                }) = work.items.get_mut(idx)
                {
                    *slot_out = Some(output);
                    *slot_err = is_error;
                }
            }
        }
    }

    pub fn on_usage(&self, usage: TurnUsage) {
        self.sink.send(ChatEvent::Usage(usage));
    }

    pub fn reset_partial_text(&mut self) {
        self.partial_text.clear();
    }

    pub fn drain_completed(&mut self) -> Vec<ChatEvent> {
        std::mem::take(&mut self.completed)
    }

    pub fn close_for_compaction(
        &mut self,
        id: String,
        original_message_count: usize,
        ts: i64,
        context_tokens: u64,
    ) -> Vec<ChatEvent> {
        self.close_open_step();
        self.close_work(false);
        let event = ChatEvent::Compacted {
            id,
            original_message_count,
            ts,
            context_tokens,
        };
        self.sink.send(event.clone());
        self.completed.push(event);
        std::mem::take(&mut self.completed)
    }

    pub fn finish(
        &mut self,
        stopped: bool,
        failure_message: Option<&str>,
    ) -> (Vec<ChatEvent>, String) {
        self.close_open_step();
        self.close_work(stopped);
        if let Some(message) = failure_message {
            self.completed.push(ChatEvent::error(message));
        }
        (
            std::mem::take(&mut self.completed),
            std::mem::take(&mut self.partial_text),
        )
    }
}
