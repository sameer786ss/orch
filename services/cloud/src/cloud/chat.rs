use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::response::Response;
use axum::{Extension, Json};
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use dashmap::mapref::entry::Entry;
use futures::future::join_all;
use orchharness::backend::{SessionStore, SummarizerBackend, WebSearchBackend, WorkspaceOps};
use orchharness::connectors::ConnectorManager;
use orchharness::events::{ChatEvent, EventSink};
use orchharness::llm::{
    build_agent, build_client_with_http, build_user_message, parse_thinking_effort, run_chat,
    AgentInputs, ChatRun, RunOutcome, RunParams,
};
use orchharness::media::{is_pdf_extension, is_raster_extension};
use orchharness::models::{resolve_static_model, ModelInfo};
use orchharness::persistence::AttachmentRef;
use orchharness::skills::load_embedded_skills;
use orchharness::tools::ToolContext;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::cloud::e2b::{CloudWorkspaceOps, SandboxLease};
use crate::cloud::owned_session;
use crate::cloud::runs::{self, LiveRun};
use crate::cloud::store::{Acquire, Beat, CloudSessionRecord, CloudSessionStore};
use crate::cloud::workspace::{self, CloudWorkspace, CLOUD_WORKSPACE_PREFIX};
use crate::local::composio::InProcessComposioTransport;
use crate::local::tavily::InProcessWebSearchBackend;
use crate::local::v1internal::{self, InProcessSummarizerBackend, V1InternalHttp};
use crate::shared::auth::VerifiedUser;
use crate::shared::config;
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::extract::{ApiJson, ApiQuery};
use crate::shared::sse::sse_response;
use crate::shared::util::{now_ms, safe_file_name};
use crate::state::ServerState;

const MEGABYTE: usize = 1024 * 1024;
const FINISHED_RUN_TTL_SECS: u64 = 120;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudAttachment {
    name: String,
    data_base64: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudChatStreamReq {
    session_id: String,
    prompt: String,
    model: String,
    workspace: String,
    repo_url: Option<String>,
    #[serde(default)]
    attachments: Vec<CloudAttachment>,
    #[serde(default)]
    active_connectors: Vec<String>,
    #[serde(default)]
    thinking_effort: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelRequest {
    session_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeQuery {
    session_id: String,
    last_event_id: Option<u64>,
}

struct CloudEventSink {
    run: Arc<LiveRun>,
}

impl EventSink for CloudEventSink {
    fn send(&self, event: ChatEvent) {
        self.run.push(&event.to_sse_block());
    }
}

fn run_active() -> ApiError {
    ApiError::conflict("A run is already active for this session.").with_code("RUN_ACTIVE")
}

pub async fn cancel(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiJson(request): ApiJson<CancelRequest>,
) -> ApiResult<Json<Value>> {
    let record = owned_session(&state, &request.session_id, &user)
        .await?
        .ok_or_else(|| ApiError::not_found("session not found"))?;
    let live = state
        .active_runs
        .get(&request.session_id)
        .map(|entry| entry.value().clone())
        .filter(|run| !run.is_finished());
    if let Some(run) = live {
        run.cancel.cancel();
    } else if record.is_running(now_ms()) {
        state.firestore.request_cancel(&request.session_id).await?;
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn resume(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiQuery(query): ApiQuery<ResumeQuery>,
) -> ApiResult<Response> {
    owned_session(&state, &query.session_id, &user)
        .await?
        .ok_or_else(|| ApiError::not_found("session not found"))?;
    let last_event_id = query.last_event_id.unwrap_or_default();
    let live = state
        .active_runs
        .get(&query.session_id)
        .map(|entry| entry.value().clone());
    if let Some(run) = live
        && !run.has_gap(last_event_id)
    {
        return Ok(sse_response(runs::spawn_subscriber(run, last_event_id)));
    }
    Ok(sse_response(runs::spawn_tail(
        state.firestore.clone(),
        query.session_id,
    )))
}

fn resolve_workspace(
    request: &CloudChatStreamReq,
    existing: Option<&CloudSessionRecord>,
) -> ApiResult<CloudWorkspace> {
    let candidate = existing
        .map(|record| record.repo_url.as_str())
        .filter(|repo_url| !repo_url.is_empty())
        .or_else(|| {
            existing
                .map(|record| record.workspace_path.as_str())
                .filter(|path| path.starts_with(CLOUD_WORKSPACE_PREFIX))
        })
        .or_else(|| {
            request
                .repo_url
                .as_deref()
                .map(str::trim)
                .filter(|repo_url| !repo_url.is_empty())
        })
        .or_else(|| {
            let ws = request.workspace.trim();
            ws.starts_with(CLOUD_WORKSPACE_PREFIX).then_some(ws)
        })
        .ok_or_else(|| ApiError::bad_request("a cloud workspace is required"))?;
    workspace::normalize(candidate)
}

async fn stage_attachments(
    lease: &SandboxLease,
    attachments: &[CloudAttachment],
) -> ApiResult<(Vec<AttachmentRef>, Vec<String>)> {
    let estimated_bytes: usize = attachments
        .iter()
        .map(|attachment| attachment.data_base64.len() / 4 * 3)
        .sum();
    if estimated_bytes > config::MAX_ATTACHMENT_TOTAL_BYTES {
        return Err(ApiError::payload_too_large(format!(
            "Attachments exceed the {} MB limit",
            config::MAX_ATTACHMENT_TOTAL_BYTES / MEGABYTE
        )));
    }

    let mut pending = Vec::new();
    let mut notes = Vec::new();
    for (index, attachment) in attachments.iter().enumerate() {
        let Ok(bytes) = STANDARD.decode(&attachment.data_base64) else {
            notes.push(format!("{} could not be decoded", attachment.name));
            continue;
        };
        let safe = safe_file_name(&attachment.name);
        let remote_path = format!("{}/{}-{}", config::UPLOAD_DIR, index, safe);
        let ext = orchharness::util::lowercase_extension_str(&safe);
        let is_image = is_raster_extension(&ext);
        let is_pdf = is_pdf_extension(&ext);
        let is_text = !is_image && !is_pdf && !orchharness::util::looks_binary(&bytes);
        let data_base64 = STANDARD.encode(&bytes);
        pending.push((
            attachment.name.clone(),
            remote_path,
            bytes,
            data_base64,
            is_image,
            is_pdf || is_text,
        ));
    }

    let manager = lease.manager.clone();
    let conn = lease.conn.clone();
    let uploaded = join_all(pending.into_iter().map(|(name, path, bytes, data_base64, is_image, attachable)| {
        let manager = manager.clone();
        let conn = conn.clone();
        async move {
            let result = manager.write_bytes(&conn, &path, &bytes).await;
            (name, path, data_base64, is_image, attachable, result)
        }
    }))
    .await;

    let mut refs = Vec::new();
    for (name, remote_path, data_base64, is_image, attachable, result) in uploaded {
        result?;
        if attachable {
            refs.push(AttachmentRef {
                path: remote_path,
                name,
                is_image,
                data_base64: Some(data_base64),
            });
        } else {
            notes.push(format!("Attached binary file uploaded to {remote_path}"));
        }
    }

    Ok((refs, notes))
}

fn spawn_heartbeat(state: ServerState, session_id: String, run: Arc<LiveRun>) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(config::HEARTBEAT_SECS));
        ticker.tick().await;
        loop {
            tokio::select! {
                _ = run.cancel.cancelled() => return,
                _ = ticker.tick() => {
                    match state.firestore.heartbeat(&session_id, &run.run_id).await {
                        Ok(Beat::Gone) => {
                            run.cancel.cancel();
                            return;
                        }
                        Ok(Beat::Alive { owned, cancel_requested }) => {
                            if !owned || cancel_requested {
                                run.cancel.cancel();
                                return;
                            }
                        }
                        Err(error) => {
                            tracing::warn!(session = %session_id, %error, "heartbeat failed");
                        }
                    }
                }
            }
        }
    });
}

fn spawn_title(state: ServerState, session_id: String, prompt: String) {
    tokio::spawn(async move {
        let Ok(title) = v1internal::generate_title(&state, &prompt).await else {
            return;
        };
        let trimmed = title.trim();
        if trimmed.is_empty() {
            return;
        }
        let clipped = orchharness::util::truncate_chars(trimmed, 120).to_string();
        if let Err(error) = state.firestore.set_session_title(&session_id, &clipped).await {
            tracing::warn!(session = %session_id, %error, "failed to store session title");
        }
    });
}

pub async fn stream(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiJson(request): ApiJson<CloudChatStreamReq>,
) -> ApiResult<Response> {
    if !orchharness::session::is_safe_session_id(&request.session_id) {
        return Err(ApiError::bad_request("Invalid sessionId"));
    }
    let model = resolve_static_model(&request.model)
        .map(|m| m.to_model_info())
        .ok_or_else(|| ApiError::bad_request(format!("Unsupported model: {}", request.model)))?;
    if request.prompt.trim().is_empty() && request.attachments.is_empty() {
        return Err(ApiError::bad_request(
            "a prompt or at least one attachment is required",
        ));
    }

    let existing = owned_session(&state, &request.session_id, &user).await?;
    state.require_budget(&user.id).await?;
    let workspace = resolve_workspace(&request, existing.as_ref())?;

    let run = LiveRun::new(uuid::Uuid::new_v4().to_string());
    match state.active_runs.entry(request.session_id.clone()) {
        Entry::Occupied(mut occupied) => {
            if !occupied.get().is_finished() {
                return Err(run_active());
            }
            occupied.insert(run.clone());
        }
        Entry::Vacant(slot) => {
            slot.insert(run.clone());
        }
    }

    let session_id = request.session_id.clone();
    let outcome = start_turn(&state, request, &user, &workspace, &model, &run).await;
    if outcome.is_err() {
        run.finish();
        state
            .active_runs
            .remove_if(&session_id, |_, entry| entry.run_id == run.run_id);
    }
    outcome
}

async fn start_turn(
    state: &ServerState,
    request: CloudChatStreamReq,
    user: &VerifiedUser,
    workspace: &CloudWorkspace,
    model: &ModelInfo,
    run: &Arc<LiveRun>,
) -> ApiResult<Response> {
    let (record, created) = state
        .firestore
        .ensure_session(
            &request.session_id,
            &workspace.uri,
            &user.id,
            &workspace.repo_url,
            &model.id,
        )
        .await?;

    let session_id = request.session_id.clone();
    let outcome = launch(state, request, user, workspace, model, run, &record).await;
    if outcome.is_err()
        && created
        && let Err(error) = state
            .firestore
            .delete_session_and_entries(&session_id)
            .await
    {
        tracing::warn!(session = %session_id, %error, "failed to remove unstarted session");
    }
    outcome
}

async fn launch(
    state: &ServerState,
    mut request: CloudChatStreamReq,
    user: &VerifiedUser,
    workspace: &CloudWorkspace,
    model: &ModelInfo,
    run: &Arc<LiveRun>,
    record: &CloudSessionRecord,
) -> ApiResult<Response> {
    let lease = Arc::new(state.sandbox_manager.acquire(&user.id, workspace).await?);
    let (attachment_refs, extra_notes) = stage_attachments(&lease, &request.attachments).await?;
    request.attachments.clear();

    let ops: Arc<dyn WorkspaceOps> = Arc::new(CloudWorkspaceOps {
        lease: lease.clone(),
        repo_dir: workspace.repo_dir.clone(),
        cmd_mgr: state.sandbox_manager.cmd_mgr.clone(),
    });

    let effective_prompt = if extra_notes.is_empty() {
        request.prompt.clone()
    } else if request.prompt.trim().is_empty() {
        extra_notes
            .iter()
            .map(|n| format!("[{n}]"))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        format!(
            "{}\n\n{}",
            request.prompt,
            extra_notes
                .iter()
                .map(|n| format!("[{n}]"))
                .collect::<Vec<_>>()
                .join("\n")
        )
    };

    let built = build_user_message(
        ops.as_ref(),
        &effective_prompt,
        &attachment_refs,
        model.supports_images(),
    )
    .await
    .map_err(ApiError::bad_request)?;

    let prepared_connectors = if request.active_connectors.is_empty() {
        None
    } else {
        let transport = Arc::new(InProcessComposioTransport {
            state: state.clone(),
            user_id: user.id.clone(),
        });
        let manager = ConnectorManager::new_with_specs_cache(
            transport,
            state.connector_specs_cache.clone(),
        );
        Some(
            manager
                .prepare(&request.active_connectors)
                .await
                .map_err(|e| ApiError::bad_request(e.to_string()))?,
        )
    };

    let store: Arc<dyn SessionStore> = Arc::new(CloudSessionStore::new(
        state.firestore.clone(),
        state.http.clone(),
        &state.config.gcs_bucket,
        &request.session_id,
        record.next_seq,
    ));
    let summarizer: Arc<dyn SummarizerBackend> = Arc::new(InProcessSummarizerBackend {
        state: state.clone(),
    });
    let web_search: Arc<dyn WebSearchBackend> = Arc::new(InProcessWebSearchBackend {
        state: state.clone(),
    });
    let event_sink: Arc<dyn EventSink> = Arc::new(CloudEventSink { run: run.clone() });

    let chat = ChatRun::begin(RunParams {
        session_id: &request.session_id,
        store,
        summarizer,
        event_sink: event_sink.clone(),
        model,
        cancel: run.cancel.clone(),
    })
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    match state
        .firestore
        .acquire_run(&request.session_id, &run.run_id)
        .await?
    {
        Acquire::Acquired => {}
        Acquire::Busy => return Err(run_active()),
    }

    spawn_heartbeat(state.clone(), request.session_id.clone(), run.clone());

    if record.title.is_empty() && !request.prompt.trim().is_empty() {
        spawn_title(
            state.clone(),
            request.session_id.clone(),
            request.prompt.clone(),
        );
    }

    let env_note = lease
        .manager
        .inspect_environment(&lease.conn, &workspace.repo_dir)
        .await;

    let (connector_defs, connector_tools) = match prepared_connectors {
        Some(c) => (c.defs, c.tools),
        None => (Vec::new(), Vec::new()),
    };

    let client = build_client_with_http(
        "https://v1internal.local",
        V1InternalHttp {
            state: state.clone(),
            user_id: user.id.clone(),
        },
    );

    let tools_ctx = ToolContext {
        ops: ops.clone(),
        web_search,
        event_sink: event_sink.clone(),
        run_id: run.run_id.clone(),
        supports_images: model.supports_images(),
    };

    let skills = load_embedded_skills();
    let agent = build_agent(AgentInputs {
        client: &client,
        model,
        tools: &tools_ctx,
        workspace: Some(&workspace.repo_dir),
        environment_note: Some(&env_note),
        connectors: connector_defs,
        connector_tools,
        thinking_effort: parse_thinking_effort(&request.thinking_effort),
        skills,
    });

    if !built.notes.is_empty() {
        event_sink.send(ChatEvent::notice(built.notes.join("\n")));
    }

    let state_bg = state.clone();
    let session_id_bg = request.session_id.clone();
    let run_bg = run.clone();
    let prompt_msg = built.message;

    tokio::spawn(async move {
        let _keep_lease = lease;

        let cancel_ops = ops.clone();
        let cancel_run_id = run_bg.run_id.clone();
        let cancel_tok = run_bg.cancel.clone();
        let cancel_watcher = tokio::spawn(async move {
            cancel_tok.cancelled().await;
            cancel_ops.cancel_run_commands(&cancel_run_id).await;
        });

        let result = run_chat(agent, &chat, prompt_msg.clone()).await;

        cancel_watcher.abort();
        ops.cleanup_foreground_commands(&run_bg.run_id).await;

        if let Err(error) = chat.finish(&prompt_msg, &result).await {
            tracing::error!(session = %session_id_bg, error = %error, "failed to save cloud conversation");
        }

        match result.outcome {
            RunOutcome::Completed => {}
            RunOutcome::Cancelled => {
                event_sink.send(ChatEvent::Cancelled);
            }
            RunOutcome::Failed(message) => {
                event_sink.send(ChatEvent::error(message));
            }
        }
        event_sink.send(ChatEvent::Done);
        run_bg.finish();

        if let Err(error) = state_bg
            .firestore
            .release_run(&session_id_bg, &run_bg.run_id)
            .await
        {
            tracing::warn!(session = %session_id_bg, %error, "failed to release cloud run");
        }

        let runs_map = state_bg.active_runs.clone();
        let sid = session_id_bg;
        let rid = run_bg.run_id.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(FINISHED_RUN_TTL_SECS)).await;
            runs_map.remove_if(&sid, |_, entry| entry.run_id == rid);
        });
    });

    Ok(sse_response(runs::spawn_subscriber(run.clone(), 0)))
}
