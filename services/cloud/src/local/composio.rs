use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use axum::extract::State;
use axum::{Extension, Json};
use futures::future::try_join_all;
use orchharness::connector_tools::client::{
    AccountWire, ComposioError, ComposioTransport, ConnectorCatalogEntry, ExecuteWire, ToolWire,
};
use reqwest::Method;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize, Serializer};
use serde_json::{json, Map, Value};

use crate::shared::auth::VerifiedUser;
use crate::shared::config;
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::extract::{ApiJson, ApiPath, ApiQuery};
use crate::state::ServerState;

const SERVICE: &str = "The connector service";
const LIST_TIMEOUT_SECS: u64 = 20;
const TOOLS_TIMEOUT_SECS: u64 = 30;
const EXECUTE_TIMEOUT_SECS: u64 = 120;
const PAGE_LIMIT: &str = "100";
const MAX_SLUGS: usize = 100;

#[derive(Deserialize)]
struct Page<T> {
    items: Vec<T>,
}

#[derive(Deserialize)]
struct ConnectedAccount {
    id: String,
    status: String,
    #[serde(default)]
    is_disabled: bool,
    toolkit: ToolkitRef,
}

#[derive(Deserialize)]
struct ToolkitRef {
    slug: String,
}

#[derive(Deserialize, Default)]
struct ToolkitCategory {
    #[serde(default)]
    name: String,
    #[serde(default)]
    slug: String,
}

#[derive(Deserialize, Default)]
struct ToolkitMeta {
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    logo: Option<String>,
    #[serde(default)]
    categories: Vec<ToolkitCategory>,
    #[serde(default)]
    tools_count: usize,
}

#[derive(Deserialize)]
struct ToolkitWire {
    #[serde(default)]
    name: String,
    #[serde(default)]
    meta: ToolkitMeta,
}

#[derive(Serialize)]
struct AccountOut {
    id: String,
    toolkit: String,
    status: String,
}

fn text_or_empty<S: Serializer>(value: &Option<String>, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(value.as_deref().unwrap_or_default())
}

#[derive(Deserialize, Serialize)]
struct Tool {
    slug: String,
    name: String,
    #[serde(serialize_with = "text_or_empty")]
    description: Option<String>,
    version: String,
    #[serde(
        default,
        rename(serialize = "isDeprecated", deserialize = "is_deprecated")
    )]
    is_deprecated: bool,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(rename(serialize = "inputParameters", deserialize = "input_parameters"))]
    input_parameters: Value,
}

#[derive(Deserialize)]
struct RawExecuteResult {
    #[serde(default)]
    data: Value,
    #[serde(default)]
    error: Value,
    #[serde(default)]
    successful: bool,
}

#[derive(Serialize)]
pub struct ExecuteResult {
    data: Value,
    error: Option<String>,
    successful: bool,
}

impl From<RawExecuteResult> for ExecuteResult {
    fn from(raw: RawExecuteResult) -> Self {
        let error = match raw.error {
            Value::Null => None,
            Value::String(message) if message.trim().is_empty() => None,
            Value::String(message) => Some(message),
            other => Some(other.to_string()),
        };
        Self {
            data: raw.data,
            error,
            successful: raw.successful,
        }
    }
}

#[derive(Deserialize)]
struct Link {
    redirect_url: String,
}

fn failure(status: u16, detail: &str) -> ApiError {
    tracing::warn!(status, detail, "connector request failed");
    let parsed: Option<Value> = serde_json::from_str(detail).ok();
    let error = parsed.as_ref().and_then(|value| value.get("error"));
    let code = error
        .and_then(|error| error.get("slug"))
        .and_then(Value::as_str)
        .unwrap_or("COMPOSIO_ERROR");
    let message = if matches!(status, 400 | 404 | 408 | 413 | 422 | 429) {
        error
            .and_then(|error| {
                error
                    .get("message")
                    .and_then(Value::as_str)
                    .or_else(|| error.as_str())
            })
            .unwrap_or("Composio request failed")
    } else {
        "The connector service returned an error. Please retry."
    };
    ApiError::upstream(status, message).with_code(code)
}

async fn call<T: DeserializeOwned>(
    state: &ServerState,
    method: Method,
    path: &str,
    query: &[(&str, String)],
    body: Option<Value>,
    timeout_secs: u64,
) -> ApiResult<T> {
    let mut request = state
        .http
        .request(method, format!("{}{path}", config::COMPOSIO_API_BASE))
        .header("x-api-key", &state.config.composio.api_key)
        .query(query)
        .timeout(Duration::from_secs(timeout_secs));
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|error| ApiError::unreachable(SERVICE, error))?;
    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        return Err(failure(status.as_u16(), &detail));
    }
    response
        .json()
        .await
        .map_err(|error| ApiError::unreachable(SERVICE, error))
}

fn toolkit_query(state: &ServerState, user_id: &str) -> Vec<(&'static str, String)> {
    let mut query = vec![
        ("user_ids", user_id.to_string()),
        ("limit", PAGE_LIMIT.to_string()),
    ];
    query.extend(
        state
            .config
            .composio
            .auth_config_ids
            .keys()
            .map(|toolkit| ("toolkit_slugs", toolkit.clone())),
    );
    query
}

fn is_supported_slug(toolkits: &HashMap<String, String>, slug: &str) -> bool {
    slug.chars()
        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
        && slug.split_once('_').is_some_and(|(prefix, rest)| {
            !rest.is_empty() && toolkits.contains_key(&prefix.to_ascii_lowercase())
        })
}

fn extract_category(wire: &ToolkitWire) -> String {
    wire.meta
        .categories
        .iter()
        .find_map(|c| {
            let name = c.name.trim();
            if !name.is_empty() {
                Some(name)
            } else {
                let slug = c.slug.trim();
                (!slug.is_empty()).then_some(slug)
            }
        })
        .unwrap_or_default()
        .to_string()
}

async fn load_toolkit_entry(state: &ServerState, toolkit: &str) -> ApiResult<ConnectorCatalogEntry> {
    let path = format!("/toolkits/{toolkit}");
    let wire: ToolkitWire = call(state, Method::GET, &path, &[], None, LIST_TIMEOUT_SECS).await?;
    let id = toolkit.to_ascii_lowercase();
    let name = wire.name.trim().to_string();
    let description = wire.meta.description.unwrap_or_default().trim().to_string();
    let category = extract_category(&wire);
    let icon_url = wire
        .meta
        .logo
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    Ok(ConnectorCatalogEntry {
        id,
        name,
        description,
        category,
        icon_url,
        tool_count: wire.meta.tools_count,
    })
}

async fn catalog_entries(state: &ServerState) -> ApiResult<Vec<ConnectorCatalogEntry>> {
    let state_bg = state.clone();
    let cached = state
        .connector_catalog_cache
        .try_get_with((), async move {
            let slugs: Vec<String> = state_bg
                .config
                .composio
                .auth_config_ids
                .keys()
                .map(|s| s.to_ascii_lowercase())
                .collect();
            let mut entries =
                try_join_all(slugs.iter().map(|slug| load_toolkit_entry(&state_bg, slug))).await?;
            entries.sort_by(|a, b| a.name.cmp(&b.name));
            Ok::<_, ApiError>(Arc::new(entries))
        })
        .await
        .map_err(|err| Arc::try_unwrap(err).unwrap_or_else(|e| ApiError::upstream(e.status.as_u16(), e.message())))?;
    Ok((*cached).clone())
}

pub async fn catalog(State(state): State<ServerState>) -> ApiResult<Json<Vec<ConnectorCatalogEntry>>> {
    Ok(Json(catalog_entries(&state).await?))
}

pub async fn accounts(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
) -> ApiResult<Json<Value>> {
    let mut query = toolkit_query(&state, &user.id);
    query.push(("statuses", "ACTIVE".to_string()));
    let page: Page<ConnectedAccount> = call(
        &state,
        Method::GET,
        "/connected_accounts",
        &query,
        None,
        LIST_TIMEOUT_SECS,
    )
    .await?;
    let accounts: Vec<AccountOut> = page
        .items
        .into_iter()
        .filter(|account| !account.is_disabled)
        .map(|account| AccountOut {
            id: account.id,
            toolkit: account.toolkit.slug,
            status: account.status,
        })
        .collect();
    Ok(Json(json!({ "accounts": accounts })))
}

#[derive(Deserialize)]
pub struct ConnectRequest {
    toolkit: String,
}

pub async fn connect(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiJson(request): ApiJson<ConnectRequest>,
) -> ApiResult<Json<Value>> {
    let composio = &state.config.composio;
    let toolkit = request.toolkit.trim().to_ascii_lowercase();
    let auth_config_id = composio
        .auth_config_ids
        .get(&toolkit)
        .ok_or_else(|| ApiError::bad_request("Unknown connector").with_code("UNKNOWN_CONNECTOR"))?;
    let link: Link = call(
        &state,
        Method::POST,
        "/connected_accounts/link",
        &[],
        Some(json!({
            "auth_config_id": auth_config_id,
            "user_id": user.id,
            "callback_url": composio.callback_url,
        })),
        LIST_TIMEOUT_SECS,
    )
    .await?;
    Ok(Json(json!({ "redirectUrl": link.redirect_url })))
}

pub async fn disconnect(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiPath(account_id): ApiPath<String>,
) -> ApiResult<Json<Value>> {
    if account_id.is_empty()
        || !account_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        return Err(ApiError::bad_request("Invalid account id").with_code("BAD_ACCOUNT"));
    }
    let owned: Page<ConnectedAccount> = call(
        &state,
        Method::GET,
        "/connected_accounts",
        &toolkit_query(&state, &user.id),
        None,
        LIST_TIMEOUT_SECS,
    )
    .await?;
    if !owned.items.iter().any(|account| account.id == account_id) {
        return Err(ApiError::not_found("Unknown account").with_code("UNKNOWN_ACCOUNT"));
    }
    let _: Value = call(
        &state,
        Method::DELETE,
        &format!("/connected_accounts/{account_id}"),
        &[],
        None,
        LIST_TIMEOUT_SECS,
    )
    .await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct ToolsQuery {
    #[serde(default)]
    toolkit: Option<String>,
    #[serde(default)]
    slugs: Option<String>,
}

async fn fetch_toolkit_tools(state: &ServerState, toolkit: &str) -> ApiResult<Vec<Tool>> {
    let key = toolkit.trim().to_ascii_lowercase();
    if !state.config.composio.auth_config_ids.contains_key(&key) {
        return Err(ApiError::bad_request("Unknown connector").with_code("UNKNOWN_CONNECTOR"));
    }
    let page: Page<Tool> = call(
        state,
        Method::GET,
        "/tools",
        &[
            ("toolkit_slug", key),
            ("important", "true".to_string()),
            ("toolkit_versions", "latest".to_string()),
            ("limit", PAGE_LIMIT.to_string()),
        ],
        None,
        TOOLS_TIMEOUT_SECS,
    )
    .await?;
    Ok(page.items)
}

async fn fetch_tools_by_slugs(state: &ServerState, slugs: &[&str]) -> ApiResult<Vec<Tool>> {
    let toolkits = &state.config.composio.auth_config_ids;
    if slugs.is_empty()
        || slugs.len() > MAX_SLUGS
        || !slugs.iter().all(|slug| is_supported_slug(toolkits, slug))
    {
        return Err(
            ApiError::bad_request("slugs must list 1 to 100 supported tool slugs")
                .with_code("BAD_SLUGS"),
        );
    }
    let page: Page<Tool> = call(
        state,
        Method::GET,
        "/tools",
        &[
            ("tool_slugs", slugs.join(",")),
            ("toolkit_versions", "latest".to_string()),
            ("limit", PAGE_LIMIT.to_string()),
        ],
        None,
        TOOLS_TIMEOUT_SECS,
    )
    .await?;
    Ok(page.items)
}

pub async fn tools(
    State(state): State<ServerState>,
    ApiQuery(query): ApiQuery<ToolsQuery>,
) -> ApiResult<Json<Value>> {
    let items = if let Some(toolkit) = query.toolkit.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        fetch_toolkit_tools(&state, toolkit).await?
    } else if let Some(raw_slugs) = query.slugs.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let slugs: Vec<&str> = raw_slugs.split(',').filter(|slug| !slug.is_empty()).collect();
        fetch_tools_by_slugs(&state, &slugs).await?
    } else {
        return Err(ApiError::bad_request("toolkit or slugs query parameter is required").with_code("BAD_QUERY"));
    };
    Ok(Json(json!({ "tools": items })))
}

#[derive(Deserialize)]
pub struct ExecuteRequest {
    slug: String,
    version: String,
    arguments: Map<String, Value>,
}

async fn execute_tool(
    state: &ServerState,
    user_id: &str,
    slug: &str,
    version: &str,
    arguments: Value,
) -> ApiResult<ExecuteResult> {
    if !is_supported_slug(&state.config.composio.auth_config_ids, slug) {
        return Err(ApiError::bad_request("Unsupported tool").with_code("BAD_SLUG"));
    }
    if version.is_empty() {
        return Err(ApiError::bad_request("version is required").with_code("BAD_VERSION"));
    }
    let result: RawExecuteResult = call(
        state,
        Method::POST,
        &format!("/tools/execute/{slug}"),
        &[],
        Some(json!({
            "user_id": user_id,
            "version": version,
            "arguments": arguments,
        })),
        EXECUTE_TIMEOUT_SECS,
    )
    .await?;
    Ok(result.into())
}

pub async fn execute(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiJson(request): ApiJson<ExecuteRequest>,
) -> ApiResult<Json<ExecuteResult>> {
    let res = execute_tool(
        &state,
        &user.id,
        &request.slug,
        &request.version,
        Value::Object(request.arguments),
    )
    .await?;
    Ok(Json(res))
}

fn map_api_err(err: ApiError) -> ComposioError {
    let code = err
        .body
        .get("code")
        .and_then(Value::as_str)
        .map(str::to_string);
    ComposioError::Rejected {
        status: err.status.as_u16(),
        code,
        message: err.message().to_string(),
    }
}

fn map_tool_wire(t: Tool) -> ToolWire {
    ToolWire {
        slug: t.slug,
        description: t.description.unwrap_or_default(),
        version: t.version,
        is_deprecated: t.is_deprecated,
        tags: t.tags,
        input_parameters: t.input_parameters,
    }
}

#[derive(Clone)]
pub struct InProcessComposioTransport {
    pub state: ServerState,
    pub user_id: String,
}

#[async_trait]
impl ComposioTransport for InProcessComposioTransport {
    async fn catalog(&self) -> Result<Vec<ConnectorCatalogEntry>, ComposioError> {
        catalog_entries(&self.state).await.map_err(map_api_err)
    }

    async fn accounts(&self) -> Result<Vec<AccountWire>, ComposioError> {
        let mut query = toolkit_query(&self.state, &self.user_id);
        query.push(("statuses", "ACTIVE".to_string()));
        let page: Page<ConnectedAccount> = call(
            &self.state,
            Method::GET,
            "/connected_accounts",
            &query,
            None,
            LIST_TIMEOUT_SECS,
        )
        .await
        .map_err(map_api_err)?;
        Ok(page
            .items
            .into_iter()
            .filter(|account| !account.is_disabled)
            .map(|account| AccountWire {
                id: account.id,
                toolkit: account.toolkit.slug,
                status: account.status,
            })
            .collect())
    }

    async fn connect(&self, _toolkit: &str) -> Result<String, ComposioError> {
        Err(ComposioError::Rejected {
            status: 400,
            code: Some("LOCAL_ONLY".to_string()),
            message: "Connector linking must be performed from the desktop client.".to_string(),
        })
    }

    async fn disconnect(&self, _account_id: &str) -> Result<(), ComposioError> {
        Err(ComposioError::Rejected {
            status: 400,
            code: Some("LOCAL_ONLY".to_string()),
            message: "Connector unlinking must be performed from the desktop client.".to_string(),
        })
    }

    async fn toolkit_tools(&self, toolkit: &str) -> Result<Vec<ToolWire>, ComposioError> {
        let items = fetch_toolkit_tools(&self.state, toolkit)
            .await
            .map_err(map_api_err)?;
        Ok(items.into_iter().map(map_tool_wire).collect())
    }

    async fn tools_by_slugs(&self, slugs: &[&str]) -> Result<Vec<ToolWire>, ComposioError> {
        let items = fetch_tools_by_slugs(&self.state, slugs)
            .await
            .map_err(map_api_err)?;
        Ok(items.into_iter().map(map_tool_wire).collect())
    }

    async fn execute(
        &self,
        slug: &str,
        version: &str,
        arguments: Value,
    ) -> Result<ExecuteWire, ComposioError> {
        let res = execute_tool(&self.state, &self.user_id, slug, version, arguments)
            .await
            .map_err(map_api_err)?;
        Ok(ExecuteWire {
            data: res.data,
            error: res.error,
            successful: res.successful,
        })
    }
}
