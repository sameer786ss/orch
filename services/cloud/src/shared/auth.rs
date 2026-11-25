use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Request, State};
use axum::http::header::AUTHORIZATION;
use axum::middleware::Next;
use axum::response::Response;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use ring::digest;
use serde::Deserialize;

use crate::shared::config;
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::util::now_secs;
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

fn auth_unavailable() -> ApiError {
    ApiError::unavailable("Authentication key service unavailable").with_code("AUTH_UNAVAILABLE")
}

fn token_cache_key(token: &str) -> [u8; 32] {
    let hash = digest::digest(&digest::SHA256, token.as_bytes());
    let mut key = [0u8; 32];
    key.copy_from_slice(hash.as_ref());
    key
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

async fn fetch_key_map(state: &ServerState) -> Result<Arc<HashMap<String, Arc<DecodingKey>>>, String> {
    let response = state
        .http
        .get(config::GOOGLE_CERTS_URL)
        .timeout(Duration::from_secs(config::AUTH_CACHE_TTL_SECS.min(30)))
        .send()
        .await
        .map_err(|error| format!("firebase signing key fetch failed: {}", error.without_url()))?;
    if !response.status().is_success() {
        return Err(format!(
            "firebase signing key fetch rejected with HTTP {}",
            response.status()
        ));
    }
    let certs: HashMap<String, String> = response
        .json()
        .await
        .map_err(|error| format!("firebase signing key response was invalid: {}", error.without_url()))?;
    let mut keys = HashMap::with_capacity(certs.len());
    for (kid, pem) in certs {
        let key = DecodingKey::from_rsa_pem(pem.as_bytes())
            .map_err(|error| format!("firebase signing key {kid} was invalid: {error}"))?;
        keys.insert(kid, Arc::new(key));
    }
    Ok(Arc::new(keys))
}

async fn key_for(state: &ServerState, kid: &str) -> ApiResult<Arc<DecodingKey>> {
    let keys = state
        .auth_key_cache
        .try_get_with((), fetch_key_map(state))
        .await
        .map_err(|error| {
            tracing::error!(%error, "firebase signing key refresh failed");
            auth_unavailable()
        })?;
    keys.get(kid).cloned().ok_or_else(ApiError::unauthorized)
}

async fn verify(state: &ServerState, token: &str) -> ApiResult<VerifiedUser> {
    let cache_key = token_cache_key(token);
    if let Some(cached) = state.auth_cache.get(&cache_key).await {
        if cached.expires_at.is_none_or(|expires_at| expires_at > now_secs()) {
            return Ok(cached.user);
        }
        state.auth_cache.invalidate(&cache_key).await;
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
            cache_key,
            CachedUser {
                user: user.clone(),
                expires_at: Some(claims.exp as i64),
            },
        )
        .await;
    Ok(user)
}
