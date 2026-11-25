pub mod chat;
pub mod e2b;
pub mod files;
pub mod github;
pub mod projects;
pub mod runs;
pub mod sessions;
pub mod store;
pub mod terminal;
pub mod workspace;

use axum::extract::DefaultBodyLimit;
use axum::routing::{delete, get, post};
use axum::Router;
use orchharness::session::is_safe_session_id;

use crate::cloud::store::CloudSessionRecord;
use crate::shared::auth::VerifiedUser;
use crate::shared::config;
use crate::shared::error::{ApiError, ApiResult};
use crate::state::ServerState;

pub async fn owned_session(
    state: &ServerState,
    session_id: &str,
    user: &VerifiedUser,
) -> ApiResult<Option<CloudSessionRecord>> {
    if !is_safe_session_id(session_id) {
        return Err(ApiError::bad_request("Invalid sessionId"));
    }
    match state.firestore.get_session(session_id).await? {
        Some(record) if record.user_id != user.id => {
            Err(ApiError::forbidden("session does not belong to user"))
        }
        record => Ok(record),
    }
}

pub fn public_routes() -> Router<ServerState> {
    Router::new().route("/github/callback", get(github::callback))
}

pub fn protected_routes() -> Router<ServerState> {
    Router::new()
        .route("/github/account", get(github::get_account).delete(github::disconnect_account))
        .route("/github/connect", post(github::connect))
        .route("/github/repos", get(github::list_repos))
        .route("/cloud/projects", get(projects::list).post(projects::open))
        .route("/cloud/projects/create", post(projects::create))
        .route("/cloud/projects/{id}", delete(projects::delete))
        .route("/cloud/sessions", get(sessions::list))
        .route("/cloud/sessions/{id}/history", get(sessions::history))
        .route("/cloud/sessions/{id}", delete(sessions::delete))
        .route("/cloud/files/{kind}", get(files::handle))
        .route("/cloud/terminal", get(terminal::ws_handler))
        .route("/cloud/chat/resume", get(chat::resume))
        .route("/cloud/chat/cancel", post(chat::cancel))
        .route(
            "/cloud/chat/stream",
            post(chat::stream).layer(DefaultBodyLimit::max(config::LARGE_BODY_LIMIT_BYTES)),
        )
}
