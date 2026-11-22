use std::collections::HashMap;
use std::time::Duration;

use axum::extract::{Request, State};
use axum::http::header::AUTHORIZATION;
use axum::middleware::Next;
use axum::response::Response;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::Deserialize;

use crate::shared::config;
use crate::shared::error::{ApiError, ApiResult};
use crate::state::ServerState;

#[derive(Clone)]
pub struct VerifiedUser {
    pub id: String,
}

#[derive(Clone)]
pub struct CachedUser {
    pub user: VerifiedUser,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct FirebaseClaims {
    sub: String,
    exp: usize,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(i64::MAX)
}

fn auth_unavailable() -> ApiError {
    ApiError::unavailable("Authentication key service unavailable").with_code("AUTH_UNAVAILABLE")
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

async fn fetch_key(state: &ServerState, kid: &str) -> ApiResult<DecodingKey> {
    let response = state
        .http
        .get(config::GOOGLE_CERTS_URL)
        .timeout(Duration::from_secs(config::AUTH_CACHE_TTL_SECS.min(30)))
        .send()
        .await
        .map_err(|error| {
            tracing::error!(error = %error.without_url(), "firebase signing key fetch failed");
            auth_unavailable()
        })?;
    if !response.status().is_success() {
        tracing::error!(status = %response.status(), "firebase signing key fetch rejected");
        return Err(auth_unavailable());
    }
    let certs: HashMap<String, String> = response.json().await.map_err(|error| {
        tracing::error!(error = %error.without_url(), "firebase signing key response was invalid");
        auth_unavailable()
    })?;
    let pem = certs.get(kid).ok_or_else(ApiError::unauthorized)?;
    DecodingKey::from_rsa_pem(pem.as_bytes()).map_err(|error| {
        tracing::error!(%error, "firebase signing key was invalid");
        auth_unavailable()
    })
}

async fn key_for(state: &ServerState, kid: &str) -> ApiResult<std::sync::Arc<DecodingKey>> {
    if let Some(key) = state.auth_key_cache.get(kid).await {
        return Ok(key);
    }
    let key = std::sync::Arc::new(fetch_key(state, kid).await?);
    state.auth_key_cache.insert(kid.to_string(), key.clone()).await;
    Ok(key)
}

async fn verify(state: &ServerState, token: &str) -> ApiResult<VerifiedUser> {
    if let Some(cached) = state.auth_cache.get(token).await {
        if cached.expires_at.is_none_or(|expires_at| expires_at > now_secs()) {
            return Ok(cached.user);
        }
        state.auth_cache.invalidate(token).await;
    }

    let header = decode_header(token).map_err(|_| ApiError::unauthorized())?;
    if header.alg != Algorithm::RS256 {
        return Err(ApiError::unauthorized());
    }
    let kid = header.kid.ok_or_else(ApiError::unauthorized)?;
    let key = key_for(state, &kid).await?;
    let issuer = format!("https://securetoken.google.com/{}", state.config.project_id);
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[state.config.project_id.as_str()]);
    validation.set_issuer(&[issuer.as_str()]);
    let claims = decode::<FirebaseClaims>(token, &key, &validation)
        .map_err(|_| ApiError::unauthorized())?
        .claims;
    if claims.sub.trim().is_empty() {
        return Err(ApiError::unauthorized());
    }

    let user = VerifiedUser { id: claims.sub };
    state
        .auth_cache
        .insert(
            token.to_string(),
            CachedUser {
                user: user.clone(),
                expires_at: Some(claims.exp as i64),
            },
        )
        .await;
    Ok(user)
}
