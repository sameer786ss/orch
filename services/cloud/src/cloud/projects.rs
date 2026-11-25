use axum::extract::State;
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::cloud::github;
use crate::cloud::sessions::purge_session;
use crate::cloud::store::{workspace_doc_id, CloudWorkspaceRecord, GithubAccountRecord};
use crate::cloud::workspace;
use crate::shared::auth::VerifiedUser;
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::extract::{ApiJson, ApiPath};
use crate::shared::util::now_ms;
use crate::state::ServerState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudProjectDto {
    pub id: String,
    pub name: String,
    pub workspace: String,
    pub repo_url: String,
    pub repo_dir: String,
    pub account_login: String,
    pub is_private: bool,
    pub account_connected: bool,
    pub updated_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectRequest {
    pub repo_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub private: bool,
}

fn to_dto(record: CloudWorkspaceRecord, account: Option<&GithubAccountRecord>) -> CloudProjectDto {
    CloudProjectDto {
        id: record.doc_id,
        name: record.name,
        workspace: record.workspace_uri,
        repo_url: record.repo_url,
        repo_dir: record.repo_dir,
        account_login: account.map(|a| a.login.clone()).unwrap_or_default(),
        is_private: record.is_private,
        account_connected: account.is_some(),
        updated_at: record.updated_at,
    }
}

async fn save_project(
    state: &ServerState,
    user_id: &str,
    ws: &workspace::CloudWorkspace,
    account: &github::DecryptedGithubAccount,
    is_private: bool,
) -> ApiResult<CloudProjectDto> {
    let doc_id = workspace_doc_id(user_id, &ws.uri);
    let existing = state.firestore.get_workspace(&doc_id).await?;
    let now = now_ms();
    let record = match existing {
        Some(mut prev) => {
            prev.name = ws.full_name.clone();
            prev.workspace_uri = ws.uri.clone();
            prev.repo_url = ws.repo_url.clone();
            prev.repo_dir = ws.repo_dir.clone();
            prev.is_private = is_private;
            prev.updated_at = now;
            prev
        }
        None => CloudWorkspaceRecord {
            doc_id: doc_id.clone(),
            user_id: user_id.to_string(),
            name: ws.full_name.clone(),
            workspace_uri: ws.uri.clone(),
            repo_url: ws.repo_url.clone(),
            repo_dir: ws.repo_dir.clone(),
            is_private,
            sandbox_id: String::new(),
            domain: String::new(),
            envd_access_token: String::new(),
            created_at: now,
            updated_at: now,
        },
    };
    state
        .firestore
        .upsert_workspace(&record)
        .await
        .map_err(ApiError::internal)?;

    Ok(to_dto(record, Some(&account.record)))
}

pub async fn list(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
) -> ApiResult<Json<Vec<CloudProjectDto>>> {
    let (workspaces, account) = tokio::try_join!(
        state.firestore.list_workspaces(&user.id),
        state.firestore.get_github_account(&user.id),
    )?;
    let projects = workspaces
        .into_iter()
        .map(|ws| to_dto(ws, account.as_ref()))
        .collect();
    Ok(Json(projects))
}

pub async fn open(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiJson(request): ApiJson<OpenProjectRequest>,
) -> ApiResult<Json<CloudProjectDto>> {
    let requested = workspace::normalize(&request.repo_url)?;
    let (account, verified) =
        github::verify_repo(&state, &user.id, &requested.owner, &requested.repo).await?;
    let canonical = workspace::normalize(&verified.full_name)?;
    let dto = save_project(&state, &user.id, &canonical, &account, verified.private).await?;
    Ok(Json(dto))
}

pub async fn create(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiJson(request): ApiJson<CreateProjectRequest>,
) -> ApiResult<Json<CloudProjectDto>> {
    let (account, verified) = github::create_repo(
        &state,
        &user.id,
        &request.name,
        request.description.as_deref(),
        request.private,
    )
    .await?;
    let canonical = workspace::normalize(&verified.full_name)?;
    let dto = save_project(&state, &user.id, &canonical, &account, verified.private).await?;
    Ok(Json(dto))
}

pub async fn delete(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiPath(project_id): ApiPath<String>,
) -> ApiResult<Json<Value>> {
    if project_id.is_empty() || !project_id.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(ApiError::bad_request("Invalid project id"));
    }
    let record = state
        .firestore
        .get_workspace(&project_id)
        .await?
        .ok_or_else(|| ApiError::not_found("Project not found"))?;
    if record.user_id != user.id {
        return Err(ApiError::forbidden("Project does not belong to user"));
    }

    loop {
        let session_ids = state
            .firestore
            .list_all_session_ids_for_workspace(&user.id, &record.workspace_uri)
            .await?;
        if session_ids.is_empty() {
            break;
        }
        for session_id in session_ids {
            purge_session(&state, &session_id).await?;
        }
    }

    state
        .sandbox_manager
        .destroy_workspace(&record.doc_id, &record.sandbox_id)
        .await?;
    state.firestore.delete_workspace(&record.doc_id).await?;
    Ok(Json(json!({ "ok": true })))
}
