mod cloud;
mod local;
mod shared;
mod state;

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::DefaultBodyLimit;
use axum::http::{header, Method, Uri};
use axum::middleware;
use axum::routing::get;
use axum::Router;
use dashmap::DashMap;
use tokio::signal::unix::{signal, SignalKind};
use tower_http::cors::CorsLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;

use crate::cloud::e2b::SandboxManager;
use crate::cloud::runs::LiveRun;
use crate::shared::config::{self, Config};
use crate::shared::error::ApiError;
use crate::shared::{auth, budget};
use crate::state::ServerState;

fn api_routes(state: &ServerState) -> Router<ServerState> {
    let public = local::public_routes();
    let protected = cloud::protected_routes()
        .merge(local::protected_routes())
        .route("/budget", get(budget::handle))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_user,
        ));
    public.merge(protected)
}

async fn not_found(uri: Uri) -> ApiError {
    ApiError::not_found(format!("Not Found: {}", uri.path()))
}

async fn shutdown_signal(runs: Arc<DashMap<String, Arc<LiveRun>>>, sandboxes: SandboxManager) {
    let mut terminate = signal(SignalKind::terminate()).expect("failed to install SIGTERM handler");
    tokio::select! {
        _ = terminate.recv() => {}
        result = tokio::signal::ctrl_c() => {
            result.expect("failed to listen for ctrl-c");
        }
    }
    tracing::info!("shutdown requested, stopping active runs");
    for entry in runs.iter() {
        entry.value().cancel.cancel();
    }
    let deadline = Instant::now() + Duration::from_secs(config::SHUTDOWN_GRACE_SECS);
    while runs.iter().any(|entry| !entry.value().is_finished()) && Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    sandboxes.pause_all_active().await;
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_ansi(false).init();

    let config = Config::from_env();
    let port = config.port;
    let state = ServerState::new(config).await;

    let app = api_routes(&state)
        .fallback(not_found)
        .layer(DefaultBodyLimit::max(config::DEFAULT_BODY_LIMIT_BYTES))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .layer(
            CorsLayer::new()
                .allow_methods([Method::GET, Method::POST, Method::DELETE])
                .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]),
        )
        .with_state(state.clone());

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .expect("failed to bind TCP listener");
    tracing::info!("OrchCloud listening on port {port}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(
            state.active_runs.clone(),
            state.sandbox_manager.clone(),
        ))
        .await
        .expect("server exited with error");
}
