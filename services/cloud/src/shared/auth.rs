use std::time::Duration;

use axum::extract::{Request, State};
use axum::http::header::AUTHORIZATION;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;
use serde_json::{json, Value};

use crate::shared::config;
use crate::shared::error::{ApiError, ApiResult};
use crate::state::ServerState;

#[derive(Clone)]
pub struct VerifiedUser {
    pub id: String,
}

fn auth_unavailable() -> ApiError {
    ApiError::unavailable("Authentication service unavailable").with_code("AUTH_UNAVAILABLE")
}

pub async fn require_user(
    State(state): State<ServerState>,
    mut request: Request,
    next: Next,
) -> ApiResult<Response> {
    let token = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(str::to_string)
        .ok_or_else(ApiError::unauthorized)?;
    let user = verify(&state, &token).await?;
    request.extensions_mut().insert(user);
    Ok(next.run(request).await)
}

async fn verify(state: &ServerState, token: &str) -> ApiResult<VerifiedUser> {
    if let Some(cached) = state.auth_cache.get(token).await {
        return Ok(cached);
    }

    let response = state
        .http
        .post(config::FIREBASE_LOOKUP_URL)
        .query(&[("key", state.config.firebase_api_key.as_str())])
        .json(&json!({ "idToken": token }))
        .timeout(Duration::from_secs(config::AUTH_LOOKUP_TIMEOUT_SECS))
        .send()
        .await
        .map_err(|error| {
            tracing::error!(error = %error.without_url(), "firebase token lookup failed");
            auth_unavailable()
        })?;

    let status = response.status();
    if status == StatusCode::BAD_REQUEST {
        return Err(ApiError::unauthorized());
    }
    if !status.is_success() {
        tracing::error!(%status, "firebase token lookup rejected");
        return Err(auth_unavailable());
    }

    let body: Value = response.json().await.map_err(|error| {
        tracing::error!(error = %error.without_url(), "firebase token lookup returned invalid json");
        auth_unavailable()
    })?;
    let account = body
        .get("users")
        .and_then(Value::as_array)
        .and_then(|users| users.first())
        .ok_or_else(ApiError::unauthorized)?;
    if account.get("disabled").and_then(Value::as_bool) == Some(true) {
        return Err(ApiError::unauthorized());
    }
    let id = account
        .get("localId")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::internal("firebase account lookup returned no localId"))?;

    let user = VerifiedUser { id: id.to_string() };
    state.auth_cache.insert(token.to_string(), user.clone()).await;
    Ok(user)
}
