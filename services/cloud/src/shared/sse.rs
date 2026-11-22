use std::convert::Infallible;

use axum::body::Body;
use axum::http::{header, HeaderValue};
use axum::response::Response;
use futures::StreamExt;
use orchharness::events::parse_sse_block;
pub use orchharness::events::SseBlockSplitter as BlockSplitter;
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
    let frame = parse_sse_block(block);
    Block {
        data: (!frame.data.is_empty()).then_some(frame.data),
    }
}

