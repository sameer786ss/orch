pub mod composio;
pub mod tavily;
pub mod transcribe;
pub mod v1internal;

use axum::extract::DefaultBodyLimit;
use axum::routing::{delete, get, post};
use axum::Router;

use crate::shared::config;
use crate::state::ServerState;

pub fn public_routes() -> Router<ServerState> {
    Router::new().route("/models", get(v1internal::list_models))
}

pub fn protected_routes() -> Router<ServerState> {
    Router::new()
        .route(
            "/vertex/{*path}",
            post(v1internal::generate).layer(DefaultBodyLimit::max(config::LARGE_BODY_LIMIT_BYTES)),
        )
        .route("/tavily", post(tavily::handle))
        .route(
            "/transcribe",
            post(transcribe::handle).layer(DefaultBodyLimit::max(config::LARGE_BODY_LIMIT_BYTES)),
        )
        .route("/title", post(v1internal::handle_title))
        .route("/summarize", post(v1internal::handle_summarize))
        .route("/composio/catalog", get(composio::catalog))
        .route("/composio/accounts", get(composio::accounts))
        .route("/composio/accounts/{id}", delete(composio::disconnect))
        .route("/composio/connect", post(composio::connect))
        .route("/composio/tools", get(composio::tools))
        .route("/composio/execute", post(composio::execute))
}
