use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::Response;
use axum::Extension;
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::cloud::e2b::{
    parse_process_event, ConnectFrame, ConnectFrameDecoder, EnvdProcessEvent, SandboxLease,
};
use crate::cloud::workspace;
use crate::shared::auth::VerifiedUser;
use crate::shared::error::ApiResult;
use crate::shared::extract::ApiQuery;
use crate::state::ServerState;

#[derive(Deserialize)]
pub struct TerminalQuery {
    pub workspace: String,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum ClientMsg {
    Input { data: String },
    Resize { cols: u16, rows: u16 },
    Close,
}

#[derive(Default)]
struct Utf8Decoder {
    pending: Vec<u8>,
}

impl Utf8Decoder {
    fn decode(&mut self, chunk: &[u8]) -> String {
        self.pending.extend_from_slice(chunk);
        let mut out = String::new();
        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(s) => {
                    out.push_str(s);
                    self.pending.clear();
                    break;
                }
                Err(err) => {
                    let valid_up_to = err.valid_up_to();
                    if valid_up_to > 0 {
                        out.push_str(
                            std::str::from_utf8(&self.pending[..valid_up_to]).unwrap_or_default(),
                        );
                    }
                    if let Some(err_len) = err.error_len() {
                        out.push('\u{FFFD}');
                        self.pending.drain(..valid_up_to + err_len);
                        if self.pending.is_empty() {
                            break;
                        }
                    } else {
                        self.pending.drain(..valid_up_to);
                        break;
                    }
                }
            }
        }
        out
    }

    fn flush(&mut self) -> String {
        if self.pending.is_empty() {
            return String::new();
        }
        let rest = std::mem::take(&mut self.pending);
        String::from_utf8_lossy(&rest).into_owned()
    }
}

pub async fn ws_handler(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiQuery(query): ApiQuery<TerminalQuery>,
    ws: WebSocketUpgrade,
) -> ApiResult<Response> {
    let cloud_ws = workspace::normalize(&query.workspace)?;
    let lease = Arc::new(state.sandbox_manager.acquire(&user.id, &cloud_ws).await?);
    let cols = query.cols.unwrap_or(80).clamp(10, 500);
    let rows = query.rows.unwrap_or(24).clamp(4, 200);
    let repo_dir = cloud_ws.repo_dir;

    Ok(ws.on_upgrade(move |socket| bridge(socket, lease, repo_dir, cols, rows)))
}

async fn send_ws(sender: &mut futures::stream::SplitSink<WebSocket, Message>, val: Value) -> bool {
    sender.send(Message::Text(val.to_string().into())).await.is_ok()
}

async fn bridge(
    socket: WebSocket,
    lease: Arc<SandboxLease>,
    repo_dir: String,
    cols: u16,
    rows: u16,
) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let mut envs = HashMap::new();
    envs.insert("TERM".to_string(), "xterm-256color".to_string());
    envs.insert("COLORTERM".to_string(), "truecolor".to_string());
    envs.insert("TERM_PROGRAM".to_string(), "Orch".to_string());

    let resp = match lease
        .manager
        .start_process_stream(
            &lease.conn,
            "/bin/bash",
            &["-l"],
            Some(&repo_dir),
            Some(envs),
            Some((cols, rows)),
            true,
        )
        .await
    {
        Ok(resp) => resp,
        Err(err) => {
            tracing::warn!(error = %err.message(), "failed to start E2B terminal PTY");
            let _ = send_ws(&mut ws_tx, json!({ "type": "exit" })).await;
            let _ = ws_tx.close().await;
            return;
        }
    };
    let mut pty_stream = resp.bytes_stream();
    let mut decoder = ConnectFrameDecoder::default();
    let mut utf8 = Utf8Decoder::default();
    let mut pid: Option<u64> = None;
    let mut pending_inputs: Vec<Vec<u8>> = Vec::new();
    let mut pending_resize: Option<(u16, u16)> = None;
    let mut exited = false;

    loop {
        tokio::select! {
            ws_item = ws_rx.next() => {
                match ws_item {
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<ClientMsg>(&text) {
                            Ok(ClientMsg::Input { data }) => {
                                let bytes = data.into_bytes();
                                if let Some(p) = pid {
                                    if lease.manager.send_input_pty(&lease.conn, p, &bytes).await.is_err() {
                                        break;
                                    }
                                } else if pending_inputs.len() < 64 {
                                    pending_inputs.push(bytes);
                                }
                            }
                            Ok(ClientMsg::Resize { cols, rows }) => {
                                let c = cols.clamp(10, 500);
                                let r = rows.clamp(4, 200);
                                if let Some(p) = pid {
                                    let _ = lease.manager.update_pty(&lease.conn, p, c, r).await;
                                } else {
                                    pending_resize = Some((c, r));
                                }
                            }
                            Ok(ClientMsg::Close) => break,
                            Err(_) => {}
                        }
                    }
                    Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                    Some(Ok(_)) => {}
                }
            }
            pty_item = pty_stream.next() => {
                match pty_item {
                    None => break,
                    Some(Err(err)) => {
                        tracing::warn!(error = %err, "E2B terminal stream ended with error");
                        break;
                    }
                    Some(Ok(chunk)) => {
                        decoder.push(&chunk);
                        loop {
                            match decoder.next_frame() {
                                Ok(None) => break,
                                Ok(Some(ConnectFrame::EndStream(_))) => {
                                    exited = true;
                                    break;
                                }
                                Ok(Some(ConnectFrame::Message(val))) => {
                                    if let Some(process_event) = parse_process_event(&val) {
                                        match process_event {
                                            EnvdProcessEvent::Start { pid: process_pid } => {
                                                pid = Some(process_pid);
                                                if let Some((c, r)) = pending_resize.take() {
                                                    let _ = lease.manager.update_pty(&lease.conn, process_pid, c, r).await;
                                                }
                                                for bytes in pending_inputs.drain(..) {
                                                    let _ = lease.manager.send_input_pty(&lease.conn, process_pid, &bytes).await;
                                                }
                                            }
                                            EnvdProcessEvent::Data { stdout, stderr, pty } => {
                                                for bytes in [pty, stdout, stderr].into_iter().flatten() {
                                                    let text = utf8.decode(&bytes);
                                                    if !text.is_empty()
                                                        && !send_ws(&mut ws_tx, json!({ "type": "data", "data": text })).await
                                                    {
                                                        exited = true;
                                                        break;
                                                    }
                                                }
                                            }
                                            EnvdProcessEvent::End { .. } => {
                                                exited = true;
                                            }
                                        }
                                    }
                                }
                                Err(_) => {
                                    exited = true;
                                    break;
                                }
                            }
                            if exited {
                                break;
                            }
                        }
                        if exited {
                            break;
                        }
                    }
                }
            }
        }
    }

    let tail = utf8.flush();
    if !tail.is_empty() {
        let _ = send_ws(&mut ws_tx, json!({ "type": "data", "data": tail })).await;
    }
    let _ = send_ws(&mut ws_tx, json!({ "type": "exit" })).await;
    let _ = ws_tx.close().await;

    if let Some(p) = pid {
        let _ = lease
            .manager
            .send_signal(&lease.conn, p, "SIGNAL_SIGKILL")
            .await;
    }
    drop(lease);
}
