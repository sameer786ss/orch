use axum::extract::State;
use axum::http::header::ACCEPT;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use axum::{Extension, Json};
use futures::future::try_join_all;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::cloud::store::{github_account_doc_id, GithubAccountRecord, OAuthStateRecord};
use crate::shared::auth::VerifiedUser;
use crate::shared::config;
use crate::shared::crypto;
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::extract::{ApiJson, ApiPath, ApiQuery};
use crate::shared::util::now_ms;
use crate::state::ServerState;

const GITHUB_API_VERSION: &str = "2022-11-28";
const GITHUB_SCOPES: &str = "repo read:user user:email";
const GITHUB_SERVICE: &str = "GitHub";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubAccountDto {
    pub id: String,
    pub login: String,
    pub name: String,
    pub avatar_url: String,
    pub email: String,
    pub updated_at: i64,
}

impl From<&GithubAccountRecord> for GithubAccountDto {
    fn from(record: &GithubAccountRecord) -> Self {
        Self {
            id: record.github_id.clone(),
            login: record.login.clone(),
            name: record.name.clone(),
            avatar_url: record.avatar_url.clone(),
            email: record.email.clone(),
            updated_at: record.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubRepoDto {
    pub id: String,
    pub full_name: String,
    pub owner: String,
    pub name: String,
    pub description: String,
    pub private: bool,
    pub url: String,
    pub updated_at: String,
    pub account_id: String,
    pub account_login: String,
}

#[derive(Debug, Clone)]
pub struct DecryptedGithubAccount {
    pub record: GithubAccountRecord,
    pub token: String,
}

#[derive(Debug, Clone)]
pub struct VerifiedRepo {
    pub full_name: String,
    pub private: bool,
}

#[derive(Deserialize)]
pub struct ConnectRequest {
    platform: String,
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReposQuery {
    account_id: Option<String>,
    query: Option<String>,
}

#[derive(Deserialize)]
struct OAuthTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize)]
struct GithubApiUser {
    id: u64,
    login: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    avatar_url: String,
    #[serde(default)]
    email: Option<String>,
}

#[derive(Deserialize)]
struct GithubEmailEntry {
    email: String,
    #[serde(default)]
    primary: bool,
    #[serde(default)]
    verified: bool,
}

#[derive(Deserialize)]
struct GithubApiOwner {
    login: String,
}

#[derive(Deserialize)]
struct GithubApiRepo {
    id: u64,
    full_name: String,
    name: String,
    owner: GithubApiOwner,
    #[serde(default)]
    description: Option<String>,
    private: bool,
    html_url: String,
    #[serde(default)]
    updated_at: String,
}

fn handoff_redirect(state: &ServerState, params: &[(&str, &str)]) -> Response {
    let target = reqwest::Url::parse_with_params(&state.config.github.web_handoff_url, params)
        .expect("GITHUB_WEB_HANDOFF_URL validated at startup");
    Redirect::temporary(target.as_str()).into_response()
}

fn validate_platform(platform: &str) -> ApiResult<&'static str> {
    match platform.trim().to_ascii_lowercase().as_str() {
        "desktop" => Ok("desktop"),
        "mobile" => Ok("mobile"),
        _ => Err(ApiError::bad_request("platform must be desktop or mobile")),
    }
}

pub fn is_valid_account_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_digit())
}

fn token_aad(user_id: &str, github_id: &str) -> String {
    format!("{user_id}\0{github_id}")
}

fn decrypt_account(
    state: &ServerState,
    record: GithubAccountRecord,
) -> ApiResult<DecryptedGithubAccount> {
    let token = crypto::open_token(
        &state.config.github.token_key,
        &token_aad(&record.user_id, &record.github_id),
        &record.token_ciphertext,
    )
    .map_err(|_| {
        ApiError::forbidden(format!(
            "GitHub authorization for @{} needs to be reconnected.",
            record.login
        ))
        .with_code("GITHUB_RECONNECT_REQUIRED")
    })?;
    Ok(DecryptedGithubAccount { record, token })
}

pub async fn require_account(
    state: &ServerState,
    user_id: &str,
    github_account_id: &str,
) -> ApiResult<DecryptedGithubAccount> {
    if !is_valid_account_id(github_account_id) {
        return Err(ApiError::forbidden(
            "GitHub account is disconnected. Reconnect your GitHub account to use this project.",
        )
        .with_code("GITHUB_RECONNECT_REQUIRED"));
    }
    let doc_id = github_account_doc_id(user_id, github_account_id);
    let record = state
        .firestore
        .get_github_account(&doc_id)
        .await?
        .filter(|acc| acc.user_id == user_id)
        .ok_or_else(|| {
            ApiError::forbidden("GitHub account is disconnected. Connect a GitHub account to continue.")
                .with_code("GITHUB_RECONNECT_REQUIRED")
        })?;
    decrypt_account(state, record)
}

async fn github_get<T: for<'de> Deserialize<'de>>(
    state: &ServerState,
    token: &str,
    path: &str,
    query: &[(&str, &str)],
) -> ApiResult<T> {
    let resp = state
        .http
        .get(format!("{}{path}", config::GITHUB_API_BASE))
        .header(ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .bearer_auth(token)
        .query(query)
        .send()
        .await
        .map_err(|e| ApiError::unreachable(GITHUB_SERVICE, e))?;
    let status = resp.status();
    if status == StatusCode::UNAUTHORIZED {
        return Err(
            ApiError::forbidden("GitHub session expired. Reconnect your GitHub account.")
                .with_code("GITHUB_RECONNECT_REQUIRED"),
        );
    }
    if status == StatusCode::NOT_FOUND {
        return Err(ApiError::not_found("GitHub repository was not found."));
    }
    if !status.is_success() {
        let detail = resp.text().await.unwrap_or_default();
        return Err(ApiError::upstream_failure(
            GITHUB_SERVICE,
            status.as_u16(),
            &detail,
        ));
    }
    resp.json()
        .await
        .map_err(|e| ApiError::unreachable(GITHUB_SERVICE, e))
}

async fn github_post<T: for<'de> Deserialize<'de>>(
    state: &ServerState,
    token: &str,
    path: &str,
    body: &Value,
) -> ApiResult<T> {
    let resp = state
        .http
        .post(format!("{}{path}", config::GITHUB_API_BASE))
        .header(ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .bearer_auth(token)
        .json(body)
        .send()
        .await
        .map_err(|e| ApiError::unreachable(GITHUB_SERVICE, e))?;
    let status = resp.status();
    if status == StatusCode::UNAUTHORIZED {
        return Err(
            ApiError::forbidden("GitHub session expired. Reconnect your GitHub account.")
                .with_code("GITHUB_RECONNECT_REQUIRED"),
        );
    }
    if status == StatusCode::UNPROCESSABLE_ENTITY {
        let body_json: Value = resp.json().await.unwrap_or(Value::Null);
        let msg = body_json
            .get("errors")
            .and_then(Value::as_array)
            .and_then(|arr| arr.first())
            .and_then(|e| e.get("message"))
            .and_then(Value::as_str)
            .or_else(|| body_json.get("message").and_then(Value::as_str))
            .unwrap_or("Could not create GitHub repository.");
        return Err(ApiError::bad_request(msg));
    }
    if !status.is_success() {
        let detail = resp.text().await.unwrap_or_default();
        return Err(ApiError::upstream_failure(
            GITHUB_SERVICE,
            status.as_u16(),
            &detail,
        ));
    }
    resp.json()
        .await
        .map_err(|e| ApiError::unreachable(GITHUB_SERVICE, e))
}

async fn exchange_code(state: &ServerState, code: &str) -> Result<String, String> {
    let resp = state
        .http
        .post(config::GITHUB_TOKEN_URL)
        .header(ACCEPT, "application/json")
        .form(&[
            ("client_id", state.config.github.client_id.as_str()),
            ("client_secret", state.config.github.client_secret.as_str()),
            ("code", code),
            ("redirect_uri", state.config.github.callback_url.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to reach GitHub: {}", e.without_url()))?;
    if !resp.status().is_success() {
        return Err("GitHub token exchange failed.".to_string());
    }
    let parsed: OAuthTokenResponse = resp
        .json()
        .await
        .map_err(|_| "GitHub returned an invalid token response.".to_string())?;
    if let Some(err) = parsed.error {
        return Err(parsed
            .error_description
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(err));
    }
    parsed
        .access_token
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "GitHub did not return an access token.".to_string())
}

async fn fetch_user_profile(state: &ServerState, token: &str) -> Result<GithubApiUser, String> {
    let mut user: GithubApiUser = github_get(state, token, "/user", &[])
        .await
        .map_err(|e| e.message().to_string())?;
    if user.email.as_deref().is_none_or(|e| e.trim().is_empty()) {
        if let Ok(emails) = github_get::<Vec<GithubEmailEntry>>(state, token, "/user/emails", &[]).await {
            user.email = emails
                .iter()
                .find(|e| e.primary && e.verified)
                .or_else(|| emails.iter().find(|e| e.verified))
                .or_else(|| emails.first())
                .map(|e| e.email.clone());
        }
    }
    Ok(user)
}

pub async fn connect(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiJson(request): ApiJson<ConnectRequest>,
) -> ApiResult<Json<Value>> {
    let platform = validate_platform(&request.platform)?;
    let state_token = crypto::random_token_url_safe(32)?;
    let expires_at = now_ms() + config::OAUTH_STATE_TTL_SECS * 1000;
    state
        .firestore
        .put_oauth_state(&OAuthStateRecord {
            state: state_token.clone(),
            user_id: user.id,
            platform: platform.to_string(),
            expires_at,
        })
        .await?;

    let authorize_url = reqwest::Url::parse_with_params(
        config::GITHUB_AUTHORIZE_URL,
        &[
            ("client_id", state.config.github.client_id.as_str()),
            ("redirect_uri", state.config.github.callback_url.as_str()),
            ("scope", GITHUB_SCOPES),
            ("state", state_token.as_str()),
        ],
    )
    .map_err(|e| ApiError::internal(format!("failed to build GitHub OAuth URL: {e}")))?
    .to_string();

    Ok(Json(json!({ "redirectUrl": authorize_url })))
}

pub async fn callback(
    State(state): State<ServerState>,
    ApiQuery(query): ApiQuery<CallbackQuery>,
) -> Response {
    let Some(state_token) = query.state.as_deref().map(str::trim).filter(|s| !s.is_empty()) else {
        return handoff_redirect(
            &state,
            &[
                ("status", "failed"),
                ("message", "Missing authorization state. Start GitHub sign-in again from Orch."),
            ],
        );
    };

    let saved = match state.firestore.take_oauth_state(state_token).await {
        Ok(Some(record)) if record.expires_at >= now_ms() => record,
        _ => {
            return handoff_redirect(
                &state,
                &[
                    ("status", "failed"),
                    ("message", "This GitHub authorization link expired. Start it again from Orch."),
                ],
            );
        }
    };
    let platform = saved.platform.as_str();

    if let Some(error) = query.error.as_deref().filter(|s| !s.trim().is_empty()) {
        let message = query
            .error_description
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(error);
        return handoff_redirect(
            &state,
            &[("status", "failed"), ("platform", platform), ("message", message)],
        );
    }

    let Some(code) = query.code.as_deref().map(str::trim).filter(|s| !s.is_empty()) else {
        return handoff_redirect(
            &state,
            &[
                ("status", "failed"),
                ("platform", platform),
                ("message", "GitHub did not return an authorization code."),
            ],
        );
    };

    let token = match exchange_code(&state, code).await {
        Ok(token) => token,
        Err(message) => {
            return handoff_redirect(
                &state,
                &[("status", "failed"), ("platform", platform), ("message", &message)],
            );
        }
    };

    let gh_user = match fetch_user_profile(&state, &token).await {
        Ok(user) => user,
        Err(message) => {
            return handoff_redirect(
                &state,
                &[("status", "failed"), ("platform", platform), ("message", &message)],
            );
        }
    };

    let github_id = gh_user.id.to_string();
    let ciphertext = match crypto::seal_token(
        &state.config.github.token_key,
        &token_aad(&saved.user_id, &github_id),
        &token,
    ) {
        Ok(ct) => ct,
        Err(message) => {
            return handoff_redirect(
                &state,
                &[("status", "failed"), ("platform", platform), ("message", &message)],
            );
        }
    };

    let record = GithubAccountRecord {
        doc_id: github_account_doc_id(&saved.user_id, &github_id),
        user_id: saved.user_id,
        github_id,
        login: gh_user.login.clone(),
        name: gh_user.name.unwrap_or_else(|| gh_user.login.clone()),
        avatar_url: gh_user.avatar_url,
        email: gh_user.email.unwrap_or_default(),
        token_ciphertext: ciphertext,
        updated_at: now_ms(),
    };

    if let Err(err) = state.firestore.upsert_github_account(&record).await {
        tracing::error!(%err, "failed to store GitHub account");
        return handoff_redirect(
            &state,
            &[
                ("status", "failed"),
                ("platform", platform),
                ("message", "Could not save your GitHub account."),
            ],
        );
    }

    handoff_redirect(
        &state,
        &[
            ("status", "success"),
            ("platform", platform),
            ("login", &gh_user.login),
        ],
    )
}

pub async fn list_accounts(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
) -> ApiResult<Json<Vec<GithubAccountDto>>> {
    let records = state.firestore.list_github_accounts(&user.id).await?;
    Ok(Json(records.iter().map(GithubAccountDto::from).collect()))
}

pub async fn disconnect_account(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiPath(github_id): ApiPath<String>,
) -> ApiResult<Json<Value>> {
    if !is_valid_account_id(&github_id) {
        return Err(ApiError::bad_request("Invalid GitHub account ID"));
    }
    let doc_id = github_account_doc_id(&user.id, &github_id);
    let existing = state.firestore.get_github_account(&doc_id).await?;
    match existing {
        Some(acc) if acc.user_id == user.id => {}
        _ => return Err(ApiError::not_found("GitHub account not found")),
    }
    state.firestore.delete_github_account(&doc_id).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn fetch_account_repos(
    state: &ServerState,
    account: GithubAccountRecord,
) -> ApiResult<Vec<GithubRepoDto>> {
    let decrypted = decrypt_account(state, account)?;
    let mut all_repos = Vec::new();
    for page in 1..=5u32 {
        let page_str = page.to_string();
        let batch: Vec<GithubApiRepo> = github_get(
            state,
            &decrypted.token,
            "/user/repos",
            &[
                ("affiliation", "owner,collaborator,organization_member"),
                ("sort", "updated"),
                ("per_page", "100"),
                ("page", &page_str),
            ],
        )
        .await?;
        let count = batch.len();
        for repo in batch {
            all_repos.push(GithubRepoDto {
                id: repo.id.to_string(),
                full_name: repo.full_name,
                owner: repo.owner.login,
                name: repo.name,
                description: repo.description.unwrap_or_default(),
                private: repo.private,
                url: repo.html_url,
                updated_at: repo.updated_at,
                account_id: decrypted.record.github_id.clone(),
                account_login: decrypted.record.login.clone(),
            });
        }
        if count < 100 {
            break;
        }
    }
    Ok(all_repos)
}

pub async fn list_repos(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiQuery(query): ApiQuery<ReposQuery>,
) -> ApiResult<Json<Vec<GithubRepoDto>>> {
    let accounts = state.firestore.list_github_accounts(&user.id).await?;
    if accounts.is_empty() {
        return Ok(Json(Vec::new()));
    }
    let selected: Vec<GithubAccountRecord> = match query
        .account_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(target_id) => {
            if !is_valid_account_id(target_id) {
                return Err(ApiError::bad_request("Invalid GitHub account ID"));
            }
            let found = accounts
                .into_iter()
                .find(|a| a.github_id == target_id)
                .ok_or_else(|| ApiError::not_found("GitHub account not found"))?;
            vec![found]
        }
        None => accounts,
    };

    let needle = query
        .query
        .as_deref()
        .map(str::trim)
        .unwrap_or_default()
        .to_ascii_lowercase();

    let groups = try_join_all(
        selected
            .into_iter()
            .map(|account| fetch_account_repos(&state, account)),
    )
    .await?;

    let mut repos: Vec<GithubRepoDto> = groups
        .into_iter()
        .flatten()
        .filter(|repo| {
            needle.is_empty()
                || repo.full_name.to_ascii_lowercase().contains(&needle)
                || repo.description.to_ascii_lowercase().contains(&needle)
        })
        .collect();
    repos.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then_with(|| a.full_name.cmp(&b.full_name)));
    Ok(Json(repos))
}

pub async fn verify_repo(
    state: &ServerState,
    user_id: &str,
    account_id: &str,
    owner: &str,
    repo: &str,
) -> ApiResult<(DecryptedGithubAccount, VerifiedRepo)> {
    let account = require_account(state, user_id, account_id).await?;
    let api_repo: GithubApiRepo = github_get(
        state,
        &account.token,
        &format!("/repos/{owner}/{repo}"),
        &[],
    )
    .await?;
    let verified = VerifiedRepo {
        full_name: api_repo.full_name,
        private: api_repo.private,
    };
    Ok((account, verified))
}

pub async fn create_repo(
    state: &ServerState,
    user_id: &str,
    account_id: &str,
    name: &str,
    description: Option<&str>,
    private: bool,
) -> ApiResult<(DecryptedGithubAccount, VerifiedRepo)> {
    let account = require_account(state, user_id, account_id).await?;
    let clean_name = name.trim();
    if clean_name.is_empty()
        || clean_name.len() > 100
        || clean_name == "."
        || clean_name == ".."
        || clean_name.ends_with(".git")
        || !clean_name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err(ApiError::bad_request(
            "Repository name may only contain letters, numbers, '.', '_', and '-'.",
        ));
    }
    let mut payload = json!({
        "name": clean_name,
        "private": private,
        "auto_init": true,
    });
    if let Some(desc) = description.map(str::trim).filter(|s| !s.is_empty()) {
        payload["description"] = Value::String(desc.to_string());
    }
    let api_repo: GithubApiRepo = github_post(state, &account.token, "/user/repos", &payload).await?;
    let verified = VerifiedRepo {
        full_name: api_repo.full_name,
        private: api_repo.private,
    };
    Ok((account, verified))
}
