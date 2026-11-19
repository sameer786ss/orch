use std::convert::Infallible;

use axum::body::Body;
use axum::http::{header, HeaderValue};
use axum::response::Response;
use futures::StreamExt;
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

pub const KEEP_ALIVE_BLOCK: &str = ": keep-alive\n\n";

pub fn data_only(data: &Value) -> String {
    format!("data: {data}\n\n")
}

pub fn sse_response(receiver: mpsc::Receiver<String>) -> Response {
    let stream = ReceiverStream::new(receiver).map(Ok::<_, Infallible>);
    let mut response = Response::new(Body::from_stream(stream));
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/event-stream; charset=utf-8"),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-cache, no-transform"),
    );
    headers.insert("x-accel-buffering", HeaderValue::from_static("no"));
    response
}

pub struct Block {
    pub data: Option<String>,
}

pub fn parse_block(block: &str) -> Block {
    let mut data: Vec<&str> = Vec::new();
    for line in block.lines() {
        if let Some(rest) = line.strip_prefix("data:") {
            data.push(rest.strip_prefix(' ').unwrap_or(rest));
        }
    }
    Block {
        data: (!data.is_empty()).then(|| data.join("\n")),
    }
}

#[derive(Default)]
pub struct BlockSplitter {
    buffer: Vec<u8>,
    scanned: usize,
}

impl BlockSplitter {
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
