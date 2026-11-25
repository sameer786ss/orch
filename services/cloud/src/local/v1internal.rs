use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use dashmap::DashMap;
use axum::extract::State;
use axum::body::Bytes;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use futures::StreamExt;
use http::{header as http_header, HeaderMap, HeaderValue, Request, StatusCode as HttpStatusCode};
use moka::future::Cache;
use moka::Expiry;
use orchharness::backend::SummarizerBackend;
use orchharness::error::{AppError, AppResult};
use orchharness::models::{resolve_static_model, vertex_models_dto, ModelInfo, ModelRates, StaticModelInfo};
use reqwest::{header, StatusCode};
use rig_http::http_client::{
    BoxedStream, Error as RigHttpError, HttpClientExt, LazyBody, MultipartForm,
    Result as RigHttpResult, StreamingResponse,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use crate::shared::auth::VerifiedUser;
use crate::shared::config::{self, AntigravityConfig};
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::extract::{ApiJson, ApiPath, ApiQuery};
use crate::shared::sse::{self, BlockSplitter};
use crate::state::ServerState;

const SERVICE: &str = "The model provider";
const TOKEN_REFRESH_TIMEOUT_SECS: u64 = 15;
const TOKEN_EXPIRY_MARGIN_SECS: u64 = 300;
const TOKEN_MIN_TTL_SECS: u64 = 60;
const STREAM_CHANNEL_CAPACITY: usize = 128;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct GeminiUsage {
    prompt_token_count: u64,
    tool_use_prompt_token_count: u64,
    candidates_token_count: u64,
    thoughts_token_count: u64,
}

impl GeminiUsage {
    fn from_response(response: &Value) -> Result<Option<Self>, serde_json::Error> {
        response
            .get("usageMetadata")
            .map(Self::deserialize)
            .transpose()
    }

    fn cost_usd(&self, rates: ModelRates) -> f64 {
        rates.cost_usd(
            self.prompt_token_count + self.tool_use_prompt_token_count,
            self.candidates_token_count + self.thoughts_token_count,
        )
    }
}

#[derive(Clone)]
struct CachedToken {
    access_token: String,
    ttl: Duration,
}

struct TokenExpiry;

impl Expiry<String, CachedToken> for TokenExpiry {
    fn expire_after_create(
        &self,
        _key: &String,
        value: &CachedToken,
        _created_at: Instant,
    ) -> Option<Duration> {
        Some(value.ttl)
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

#[derive(Clone)]
pub struct VertexTokenPool {
    refresh_tokens: Arc<[String]>,
    index: Arc<AtomicUsize>,
    cache: Cache<String, CachedToken>,
    unhealthy_until: Arc<DashMap<usize, Instant>>,
    http: reqwest::Client,
    client_id: Arc<str>,
    client_secret: Arc<str>,
}

impl VertexTokenPool {
    pub fn new(config: &AntigravityConfig, http: reqwest::Client) -> Self {
        Self {
            refresh_tokens: config.refresh_tokens.clone().into(),
            index: Arc::new(AtomicUsize::new(0)),
            cache: Cache::builder()
                .max_capacity(config.refresh_tokens.len() as u64)
                .expire_after(TokenExpiry)
                .build(),
            unhealthy_until: Arc::new(DashMap::new()),
            http,
            client_id: config.client_id.as_str().into(),
            client_secret: config.client_secret.as_str().into(),
        }
    }

    fn current_index(&self) -> usize {
        let start = self.index.load(Ordering::Relaxed) % self.refresh_tokens.len();
        (0..self.refresh_tokens.len())
            .map(|offset| (start + offset) % self.refresh_tokens.len())
            .find(|index| {
                self.unhealthy_until
                    .get(index)
                    .is_none_or(|until| *until <= Instant::now())
            })
            .unwrap_or(start)
    }

    fn advance_index(&self) -> usize {
        self.index.fetch_add(1, Ordering::Relaxed) + 1
    }

    fn mark_unhealthy(&self, index: usize) {
        self.unhealthy_until
            .insert(index % self.refresh_tokens.len(), Instant::now() + Duration::from_secs(30));
    }

    async fn refresh(&self, refresh_token: &str) -> Result<CachedToken, String> {
        let response = self
            .http
            .post(config::GOOGLE_TOKEN_URL)
            .form(&[
                ("client_id", &*self.client_id),
                ("client_secret", &*self.client_secret),
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
            ])
            .timeout(Duration::from_secs(TOKEN_REFRESH_TIMEOUT_SECS))
            .send()
            .await
            .map_err(|error| format!("token refresh request failed: {}", error.without_url()))?;
        let status = response.status();
        if !status.is_success() {
            let detail = response.text().await.unwrap_or_default();
            return Err(format!("token refresh failed with HTTP {status}: {detail}"));
        }
        let token: TokenResponse = response
            .json()
            .await
            .map_err(|error| format!("token refresh response was invalid: {}", error.without_url()))?;
        Ok(CachedToken {
            access_token: token.access_token,
            ttl: Duration::from_secs(
                token
                    .expires_in
                    .saturating_sub(TOKEN_EXPIRY_MARGIN_SECS)
                    .max(TOKEN_MIN_TTL_SECS),
            ),
        })
    }

    async fn access_token(&self, index: usize) -> ApiResult<String> {
        let refresh_token = &self.refresh_tokens[index % self.refresh_tokens.len()];
        self.cache
            .try_get_with(refresh_token.clone(), self.refresh(refresh_token))
            .await
            .map(|cached| cached.access_token)
            .map_err(|error| {
                tracing::error!(%error, "model provider authentication failed");
                ApiError::bad_gateway("Model provider authentication failed").with_code("UPSTREAM_AUTH")
            })
    }
}

pub async fn list_models() -> Json<Vec<ModelInfo>> {
    Json(vertex_models_dto())
}

fn unwrap_envelope(mut envelope: Value) -> Result<Value, String> {
    envelope
        .get_mut("response")
        .map(Value::take)
        .ok_or_else(|| "model provider event has no response".to_string())
}

fn read_usage(response: &Value, usage: &mut Option<GeminiUsage>) -> Result<(), String> {
    if let Some(reported) = GeminiUsage::from_response(response)
        .map_err(|error| format!("model provider usage was invalid: {error}"))?
    {
        *usage = Some(reported);
    }
    Ok(())
}

fn transform_block(block: &str, usage: &mut Option<GeminiUsage>) -> Result<Option<String>, String> {
    let Some(data) = sse::parse_block(block).data else {
        return Ok(None);
    };
    let envelope: Value = serde_json::from_str(&data)
        .map_err(|error| format!("model provider event was not JSON: {error}"))?;
    let response = unwrap_envelope(envelope)?;
    read_usage(&response, usage)?;
    Ok(Some(sse::data_only(&response)))
}

async fn send_attempt(
    state: &ServerState,
    token_index: usize,
    streaming: bool,
    verb: &str,
    params: &[(String, String)],
    envelope: &Value,
) -> ApiResult<reqwest::Response> {
    let token = state.vertex_pool.access_token(token_index).await?;
    let client = if streaming {
        &state.streaming_http
    } else {
        &state.http
    };
    let request = client
        .post(format!(
            "{}/v1internal:{verb}",
            state.config.antigravity.endpoint
        ))
        .query(params)
        .bearer_auth(token)
        .header(header::USER_AGENT, config::VERTEX_USER_AGENT)
        .header(
            header::ACCEPT,
            if streaming {
                "text/event-stream"
            } else {
                "application/json"
            },
        )
        .json(envelope)
        .send();
    tokio::time::timeout(
        Duration::from_secs(config::UPSTREAM_OPEN_TIMEOUT_SECS),
        request,
    )
    .await
    .map_err(|_| ApiError::gateway_timeout("The model provider did not respond in time. Please retry."))?
    .map_err(|error| ApiError::unreachable(SERVICE, error))
}

async fn send_v1internal(
    state: &ServerState,
    streaming: bool,
    model_id: &str,
    verb: &str,
    params: &[(String, String)],
    request: Value,
) -> ApiResult<reqwest::Response> {
    let envelope = json!({
        "project": state.config.antigravity.project_id,
        "model": model_id,
        "request": request,
    });

    let mut token_index = state.vertex_pool.current_index();
    let mut attempt = 0u32;
    let response = loop {
        attempt += 1;
        match send_attempt(state, token_index, streaming, verb, params, &envelope).await {
            Ok(resp) if resp.status() == StatusCode::TOO_MANY_REQUESTS && attempt < 3 => {
                state.vertex_pool.mark_unhealthy(token_index);
                token_index = state.vertex_pool.advance_index();
                tokio::time::sleep(Duration::from_millis(500 * u64::from(attempt))).await;
            }
            Ok(resp) if resp.status().is_server_error() && attempt < 3 => {
                tokio::time::sleep(Duration::from_millis(300 * u64::from(attempt))).await;
            }
            Ok(resp) => break resp,
            Err(err) if attempt < 3 && matches!(err.status, StatusCode::BAD_GATEWAY | StatusCode::GATEWAY_TIMEOUT) => {
                tokio::time::sleep(Duration::from_millis(300 * u64::from(attempt))).await;
            }
            Err(err) => return Err(err),
        }
    };

    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        if status == StatusCode::BAD_REQUEST
            && let Some(msg) = extract_context_overflow_message(&detail)
        {
            tracing::warn!(service = SERVICE, status = status.as_u16(), detail, "upstream context overflow");
            return Err(ApiError::bad_request(msg).with_code("CONTEXT_OVERFLOW"));
        }
        return Err(ApiError::upstream_failure(SERVICE, status.as_u16(), &detail));
    }
    Ok(response)
}

fn extract_context_overflow_message(detail: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(detail).ok()?;
    let msg = parsed
        .pointer("/error/message")
        .or_else(|| parsed.pointer("/0/error/message"))
        .and_then(Value::as_str)?
        .trim();
    let lower = msg.to_ascii_lowercase();
    let is_overflow = lower.contains("exceeds the maximum number of tokens")
        || lower.contains("context length")
        || lower.contains("too many tokens")
        || lower.contains("token count exceeds")
        || lower.contains("input token count");
    is_overflow.then(|| msg.to_string())
}

async fn relay_stream(
    state: ServerState,
    user_id: String,
    model: &'static StaticModelInfo,
    response: reqwest::Response,
    tx: mpsc::Sender<String>,
) {
    let mut stream = response.bytes_stream();
    let mut splitter = BlockSplitter::default();
    let mut usage: Option<GeminiUsage> = None;
    let mut client_open = true;
    let idle_limit = Duration::from_secs(config::STREAM_IDLE_TIMEOUT_SECS);

    let failure = 'stream: loop {
        match tokio::time::timeout(idle_limit, stream.next()).await {
            Err(_) => break 'stream Some("The model provider stopped responding."),
            Ok(None) => break 'stream None,
            Ok(Some(Err(error))) => {
                tracing::warn!(error = %error.without_url(), "model provider stream interrupted");
                break 'stream Some("The connection to the model provider was interrupted.");
            }
            Ok(Some(Ok(chunk))) => {
                splitter.push(&chunk);
                if splitter.buffered() > config::MAX_STREAM_BUFFER_BYTES {
                    break 'stream Some("The model provider sent an oversized event.");
                }
                while let Some(block) = splitter.next_block() {
                    match transform_block(&block, &mut usage) {
                        Ok(Some(output)) if client_open => {
                            client_open = tx.send(output).await.is_ok();
                        }
                        Ok(_) => {}
                        Err(error) => {
                            tracing::error!(%error, "invalid model provider stream event");
                            break 'stream Some("The model provider sent an invalid event.");
                        }
                    }
                }
            }
        }
    };

    if let Some(message) = failure
        && client_open
    {
        let error = json!({ "error": { "code": 502, "message": message, "status": "UNAVAILABLE" } });
        let _ = tx.send(sse::data_only(&error)).await;
    }
    if let Some(usage) = usage {
        state
            .record_cost(&user_id, usage.cost_usd(model.rates))
            .await;
    }
}

pub enum VertexOutput {
    Json(Value),
    Sse(mpsc::Receiver<String>),
}

pub async fn dispatch_chat(
    state: &ServerState,
    user_id: &str,
    path: &str,
    query: HashMap<String, String>,
    body: Value,
) -> ApiResult<VertexOutput> {
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let [.., "models", target] = segments.as_slice() else {
        return Err(ApiError::bad_request("Expected models/{model}:{method}").with_code("BAD_REQUEST"));
    };
    let (model_id, verb) = target
        .split_once(':')
        .ok_or_else(|| ApiError::bad_request("Expected models/{model}:{method}").with_code("BAD_REQUEST"))?;
    let model = resolve_static_model(model_id).ok_or_else(|| {
        ApiError::bad_request(format!("Unsupported model: {model_id}")).with_code("BAD_REQUEST")
    })?;
    let streaming = match verb {
        "generateContent" => false,
        "streamGenerateContent" => true,
        _ => {
            return Err(
                ApiError::bad_request(format!("Unsupported method: {verb}")).with_code("BAD_REQUEST"),
            );
        }
    };
    state.require_budget(user_id).await?;

    let mut params: Vec<(String, String)> =
        query.into_iter().filter(|(key, _)| key != "key").collect();
    if streaming && !params.iter().any(|(key, _)| key == "alt") {
        params.push(("alt".to_string(), "sse".to_string()));
    }

    let response = send_v1internal(state, streaming, model.id, verb, &params, body).await?;

    if !streaming {
        let envelope: Value = response
            .json()
            .await
            .map_err(|error| ApiError::unreachable(SERVICE, error))?;
        let reply = unwrap_envelope(envelope).map_err(ApiError::bad_gateway)?;
        let mut usage = None;
        read_usage(&reply, &mut usage).map_err(ApiError::bad_gateway)?;
        if let Some(usage) = usage {
            state
                .record_cost(user_id, usage.cost_usd(model.rates))
                .await;
        }
        return Ok(VertexOutput::Json(reply));
    }

    let (tx, rx) = mpsc::channel(STREAM_CHANNEL_CAPACITY);
    tokio::spawn(relay_stream(
        state.clone(),
        user_id.to_string(),
        model,
        response,
        tx,
    ));
    Ok(VertexOutput::Sse(rx))
}

pub async fn generate(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiPath(path): ApiPath<String>,
    ApiQuery(query): ApiQuery<HashMap<String, String>>,
    ApiJson(body): ApiJson<Value>,
) -> ApiResult<Response> {
    match dispatch_chat(&state, &user.id, &path, query, body).await? {
        VertexOutput::Json(reply) => Ok(Json(reply).into_response()),
        VertexOutput::Sse(rx) => Ok(sse::sse_response(rx)),
    }
}

fn non_success_rig_error(err: ApiError) -> RigHttpError {
    let mut headers = HeaderMap::new();
    headers.insert(
        http_header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    let body = serde_json::to_string(&Value::Object(err.body)).unwrap_or_default();
    let status = HttpStatusCode::from_u16(err.status.as_u16()).unwrap_or(HttpStatusCode::BAD_GATEWAY);
    RigHttpError::non_success_with_details(status, headers, body)
}

fn parse_query_pairs(uri: &http::Uri) -> HashMap<String, String> {
    let Some(raw) = uri.query() else {
        return HashMap::new();
    };
    reqwest::Url::parse(&format!("http://local/?{raw}"))
        .map(|url| {
            url.query_pairs()
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect()
        })
        .unwrap_or_default()
}

fn parse_request_body(bytes: &[u8]) -> RigHttpResult<Value> {
    if bytes.is_empty() {
        Ok(Value::Null)
    } else {
        serde_json::from_slice(bytes).map_err(RigHttpError::instance)
    }
}

#[derive(Clone)]
pub struct V1InternalHttp {
    pub state: ServerState,
    pub user_id: String,
}

impl HttpClientExt for V1InternalHttp {
    fn send<T, U>(
        &self,
        req: Request<T>,
    ) -> impl Future<Output = RigHttpResult<http::Response<LazyBody<U>>>> + Send + 'static
    where
        T: Into<Bytes> + Send,
        U: From<Bytes> + Send + 'static,
    {
        let state = self.state.clone();
        let user_id = self.user_id.clone();
        let (parts, body) = req.into_parts();
        let body_bytes: Bytes = body.into();

        async move {
            let body = parse_request_body(&body_bytes)?;
            let query = parse_query_pairs(&parts.uri);
            match dispatch_chat(&state, &user_id, parts.uri.path(), query, body).await {
                Ok(VertexOutput::Json(reply)) => {
                    let bytes = Bytes::from(serde_json::to_vec(&reply).unwrap_or_default());
                    let lazy: LazyBody<U> = Box::pin(async move { Ok(U::from(bytes)) });
                    http::Response::builder()
                        .status(HttpStatusCode::OK)
                        .header(http_header::CONTENT_TYPE, "application/json")
                        .body(lazy)
                        .map_err(RigHttpError::Protocol)
                }
                Ok(VertexOutput::Sse(mut rx)) => {
                    let mut buf = Vec::new();
                    while let Some(chunk) = rx.recv().await {
                        buf.extend_from_slice(chunk.as_bytes());
                    }
                    let bytes = Bytes::from(buf);
                    let lazy: LazyBody<U> = Box::pin(async move { Ok(U::from(bytes)) });
                    http::Response::builder()
                        .status(HttpStatusCode::OK)
                        .header(http_header::CONTENT_TYPE, "text/event-stream")
                        .body(lazy)
                        .map_err(RigHttpError::Protocol)
                }
                Err(api_err) => Err(non_success_rig_error(api_err)),
            }
        }
    }

    fn send_multipart<U>(
        &self,
        _req: Request<MultipartForm>,
    ) -> impl Future<Output = RigHttpResult<http::Response<LazyBody<U>>>> + Send + 'static
    where
        U: From<Bytes> + Send + 'static,
    {
        async move {
            Err(RigHttpError::instance(std::io::Error::other(
                "multipart requests are not supported",
            )))
        }
    }

    fn send_streaming<T>(
        &self,
        req: Request<T>,
    ) -> impl Future<Output = RigHttpResult<StreamingResponse>> + Send
    where
        T: Into<Bytes> + Send,
    {
        let state = self.state.clone();
        let user_id = self.user_id.clone();
        let (parts, body) = req.into_parts();
        let body_bytes: Bytes = body.into();

        async move {
            let body = parse_request_body(&body_bytes)?;
            let query = parse_query_pairs(&parts.uri);
            match dispatch_chat(&state, &user_id, parts.uri.path(), query, body).await {
                Ok(VertexOutput::Sse(rx)) => {
                    let stream: BoxedStream =
                        Box::pin(ReceiverStream::new(rx).map(|chunk| Ok(Bytes::from(chunk))));
                    http::Response::builder()
                        .status(HttpStatusCode::OK)
                        .header(http_header::CONTENT_TYPE, "text/event-stream")
                        .body(stream)
                        .map_err(RigHttpError::Protocol)
                }
                Ok(VertexOutput::Json(reply)) => {
                    let bytes = Bytes::from(serde_json::to_vec(&reply).unwrap_or_default());
                    let stream: BoxedStream = Box::pin(futures::stream::once(async move { Ok(bytes) }));
                    http::Response::builder()
                        .status(HttpStatusCode::OK)
                        .header(http_header::CONTENT_TYPE, "application/json")
                        .body(stream)
                        .map_err(RigHttpError::Protocol)
                }
                Err(api_err) => Err(non_success_rig_error(api_err)),
            }
        }
    }
}

pub async fn generate_text(
    state: &ServerState,
    system: Option<&str>,
    prompt: &str,
    max_tokens: u64,
    temperature: f64,
) -> ApiResult<String> {
    let mut body = json!({
        "contents": [{ "role": "user", "parts": [{ "text": prompt }] }],
        "generationConfig": { "maxOutputTokens": max_tokens, "temperature": temperature },
    });
    if let Some(system) = system {
        body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
    }

    let response = send_v1internal(
        state,
        false,
        config::UTILITY_MODEL,
        "generateContent",
        &[],
        body,
    )
    .await?;

    let envelope: Value = response
        .json()
        .await
        .map_err(|error| ApiError::unreachable(SERVICE, error))?;
    let parsed = unwrap_envelope(envelope).map_err(ApiError::bad_gateway)?;

    let text: String = parsed
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter(|part| part.get("thought").and_then(Value::as_bool) != Some(true))
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default();
    if text.trim().is_empty() {
        return Err(ApiError::bad_gateway(format!("{SERVICE} returned no text")));
    }
    Ok(text)
}

pub async fn generate_title(state: &ServerState, prompt: &str) -> ApiResult<String> {
    let excerpt: String = prompt.chars().take(config::TITLE_PROMPT_MAX_CHARS).collect();
    let raw = generate_text(
        state,
        None,
        &format!("{}{excerpt}", config::TITLE_PROMPT),
        config::TITLE_MAX_OUTPUT_TOKENS,
        0.3,
    )
    .await?;
    Ok(raw.trim().trim_matches(['"', '\'']).to_string())
}

#[derive(Deserialize)]
pub struct TitleRequest {
    prompt: String,
}

pub async fn handle_title(
    State(state): State<ServerState>,
    ApiJson(request): ApiJson<TitleRequest>,
) -> ApiResult<Json<Value>> {
    if request.prompt.trim().is_empty() {
        return Err(ApiError::bad_request("prompt is required"));
    }
    let title = generate_title(&state, &request.prompt).await?;
    Ok(Json(json!({ "title": title })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummarizeRequest {
    prompt: String,
    system: Option<String>,
    max_tokens: Option<u64>,
}

pub async fn handle_summarize(
    State(state): State<ServerState>,
    ApiJson(request): ApiJson<SummarizeRequest>,
) -> ApiResult<Json<Value>> {
    if request.prompt.trim().is_empty() {
        return Err(ApiError::bad_request("prompt is required"));
    }
    let system = request
        .system
        .as_deref()
        .filter(|system| !system.trim().is_empty());
    let max_tokens = request
        .max_tokens
        .unwrap_or(config::SUMMARIZE_DEFAULT_MAX_TOKENS)
        .clamp(512, 16_000);
    let text = generate_text(&state, system, &request.prompt, max_tokens, 0.2).await?;
    Ok(Json(json!({ "text": text.trim() })))
}

#[derive(Clone)]
pub struct InProcessSummarizerBackend {
    pub state: ServerState,
}

#[async_trait]
impl SummarizerBackend for InProcessSummarizerBackend {
    async fn summarize(&self, system: &str, prompt: &str, max_tokens: u64) -> AppResult<String> {
        let sys = (!system.trim().is_empty()).then_some(system);
        generate_text(&self.state, sys, prompt, max_tokens.clamp(512, 16_000), 0.2)
            .await
            .map(|t| t.trim().to_string())
            .map_err(|e| AppError::Gateway {
                status: e.status.as_u16(),
                body: e.message().to_string(),
            })
    }
}
