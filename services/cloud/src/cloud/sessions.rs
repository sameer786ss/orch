use std::time::Duration;

use axum::extract::State;
use axum::{Extension, Json};
use orchharness::backend::SessionStore;
use orchharness::persistence::{SessionRecordPage, SessionSummary};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::cloud::owned_session;
use crate::cloud::store::{CloudSessionStore, StorageClient};
use crate::cloud::workspace;
use crate::shared::auth::VerifiedUser;
use crate::shared::config::{self, CLOUD_WORKSPACE_PREFIX};
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::extract::{ApiPath, ApiQuery};
use crate::state::ServerState;

#[derive(Deserialize)]
pub struct ListQuery {
    workspace: Option<String>,
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    limit: Option<usize>,
    before: Option<i64>,
}

pub async fn list(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiQuery(query): ApiQuery<ListQuery>,
) -> ApiResult<Json<Vec<SessionSummary>>> {
    let canonical = match query.workspace.as_deref().filter(|value| !value.is_empty()) {
        Some(value) if value.starts_with(CLOUD_WORKSPACE_PREFIX) => {
            Some(workspace::normalize(value)?.uri)
        }
        Some(value) => Some(value.to_string()),
        None => None,
    };
    let sessions = state
        .firestore
        .list_sessions(&user.id, canonical.as_deref())
        .await?;
    Ok(Json(sessions))
}

pub async fn history(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiPath(session_id): ApiPath<String>,
    ApiQuery(query): ApiQuery<HistoryQuery>,
) -> ApiResult<Json<SessionRecordPage>> {
    let Some(record) = owned_session(&state, &session_id, &user).await? else {
        return Ok(Json(SessionRecordPage {
            records: Vec::new(),
            has_more: false,
            earliest_seq: None,
        }));
    };
    let limit = query
        .limit
        .unwrap_or(config::DEFAULT_HISTORY_LIMIT)
        .clamp(1, config::MAX_HISTORY_LIMIT);
    let store = CloudSessionStore::new(
        state.firestore.clone(),
        state.http.clone(),
        &state.config.gcs_bucket,
        &session_id,
        record.next_seq,
    );
    let page = store
        .get_history(&session_id, limit, query.before)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(page))
}

pub async fn purge_session(state: &ServerState, session_id: &str) -> ApiResult<()> {
    if let Some((_, run)) = state.active_runs.remove(session_id) {
        run.cancel.cancel();
        let wait = Duration::from_secs(config::RUN_CANCEL_WAIT_SECS);
        if tokio::time::timeout(wait, run.wait_finished()).await.is_err() {
            tracing::warn!(session = %session_id, "run did not stop before session deletion");
        }
    }

    let storage = StorageClient::new(
        state.http.clone(),
        state.firestore.auth_provider(),
        &state.config.gcs_bucket,
        session_id,
    );
    storage.delete_prefix().await.map_err(ApiError::internal)?;
    state
        .firestore
        .delete_session_and_entries(session_id)
        .await?;
    Ok(())
}

pub async fn delete(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiPath(session_id): ApiPath<String>,
) -> ApiResult<Json<Value>> {
    let record = owned_session(&state, &session_id, &user).await?;
    if record.is_some() {
        purge_session(&state, &session_id).await?;
    } else if let Some((_, run)) = state.active_runs.remove(&session_id) {
        run.cancel.cancel();
    }
    Ok(Json(json!({ "ok": true })))
}
