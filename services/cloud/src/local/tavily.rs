use std::time::Duration;

use async_trait::async_trait;
use axum::extract::State;
use axum::Json;
use orchharness::backend::{TavilyRequest, TavilyResponse, WebSearchBackend};
use orchharness::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::shared::config;
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::extract::ApiJson;
use crate::state::ServerState;

const SERVICE: &str = "Search service";
const DEFAULT_MAX_RESULTS: u64 = 5;
const MAX_RESULTS_LIMIT: u64 = 20;
const REQUEST_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum SearchDepth {
    #[default]
    Basic,
    Advanced,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Topic {
    #[default]
    General,
    News,
    Finance,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    query: String,
    #[serde(default)]
    search_depth: SearchDepth,
    #[serde(default)]
    topic: Topic,
    max_results: Option<u64>,
    #[serde(default)]
    include_images: bool,
    domain: Option<String>,
}

#[derive(Serialize)]
struct SearchPayload<'a> {
    query: &'a str,
    search_depth: SearchDepth,
    topic: Topic,
    max_results: u64,
    include_images: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    include_domains: Option<[&'a str; 1]>,
}

pub async fn execute_search(state: &ServerState, request: SearchRequest) -> ApiResult<Value> {
    let query = request.query.trim();
    if query.is_empty() {
        return Err(ApiError::bad_request("query is required"));
    }

    let payload = SearchPayload {
        query,
        search_depth: request.search_depth,
        topic: request.topic,
        max_results: request
            .max_results
            .unwrap_or(DEFAULT_MAX_RESULTS)
            .clamp(1, MAX_RESULTS_LIMIT),
        include_images: request.include_images,
        include_domains: request
            .domain
            .as_deref()
            .filter(|domain| !domain.is_empty())
            .map(|domain| [domain]),
    };

    let response = state
        .http
        .post(config::TAVILY_SEARCH_URL)
        .bearer_auth(&state.config.tavily_api_key)
        .json(&payload)
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .send()
        .await
        .map_err(|error| ApiError::unreachable(SERVICE, error))?;

    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        return Err(ApiError::upstream_failure(SERVICE, status.as_u16(), &detail));
    }
    response
        .json()
        .await
        .map_err(|error| ApiError::unreachable(SERVICE, error))
}

pub async fn handle(
    State(state): State<ServerState>,
    ApiJson(request): ApiJson<SearchRequest>,
) -> ApiResult<Json<Value>> {
    Ok(Json(execute_search(&state, request).await?))
}

#[derive(Clone)]
pub struct InProcessWebSearchBackend {
    pub state: ServerState,
}

#[async_trait]
impl WebSearchBackend for InProcessWebSearchBackend {
    async fn tavily(&self, req: &TavilyRequest) -> AppResult<TavilyResponse> {
        let val = serde_json::to_value(req)
            .map_err(|e| AppError::Gateway { status: 400, body: e.to_string() })?;
        let parsed: SearchRequest = serde_json::from_value(val)
            .map_err(|e| AppError::Gateway { status: 400, body: e.to_string() })?;
        let result = execute_search(&self.state, parsed)
            .await
            .map_err(|e| AppError::Gateway { status: e.status.as_u16(), body: e.message().to_string() })?;
        serde_json::from_value(result)
            .map_err(|e| AppError::Gateway { status: 502, body: e.to_string() })
    }
}
