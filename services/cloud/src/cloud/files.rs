use axum::extract::State;
use axum::http::{header, HeaderValue};
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use orchharness::backend::{display_relative_str, normalize_workspace_subpath};
use orchharness::config as hconfig;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::cloud::e2b::SandboxLease;
use crate::cloud::workspace::{self, CloudWorkspace};
use crate::shared::auth::VerifiedUser;
use crate::shared::config;
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::extract::{ApiPath, ApiQuery};
use crate::shared::util;
use crate::state::ServerState;

#[derive(Serialize)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub entries: Vec<TreeEntry>,
    pub truncated: bool,
}

#[derive(Serialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub truncated: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesQuery {
    workspace: String,
    path: Option<String>,
    limit: Option<usize>,
    query: Option<String>,
}

fn resolve_cloud_path(cloud_ws: &CloudWorkspace, raw: &str) -> ApiResult<String> {
    normalize_workspace_subpath(&cloud_ws.repo_dir, raw)
        .map_err(|e| ApiError::bad_request(e.to_string()))
}

async fn list_files(
    lease: &SandboxLease,
    cloud_ws: &CloudWorkspace,
    query: Option<&str>,
    limit: usize,
) -> ApiResult<Vec<FileEntry>> {
    let mut args = vec![
        "--files".to_string(),
        "--hidden".to_string(),
        "--color=never".to_string(),
    ];
    for skipped in hconfig::SKIP_DIRS {
        args.push("--glob".to_string());
        args.push(format!("!{skipped}/**"));
    }
    args.push("--".to_string());
    args.push(cloud_ws.repo_dir.clone());
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let (code, stdout, stderr) = lease
        .manager
        .run_oneshot(&lease.conn, "rg", &arg_refs, Some(&cloud_ws.repo_dir), None, 30)
        .await?;
    if code != 0 && code != 1 {
        return Err(ApiError::bad_gateway(format!(
            "workspace file index failed: {}",
            stderr.trim()
        )));
    }

    let needle = query.unwrap_or_default().trim().to_ascii_lowercase();
    let mut entries: Vec<FileEntry> = stdout
        .lines()
        .map(|line| line.trim_start_matches("./").to_string())
        .filter(|path| needle.is_empty() || path.to_ascii_lowercase().contains(&needle))
        .take(hconfig::MAX_INDEXED_FILES)
        .map(|path| FileEntry {
            name: path.rsplit('/').next().unwrap_or(&path).to_string(),
            path,
        })
        .collect();
    entries.sort_by(|left, right| {
        left.path
            .matches('/')
            .count()
            .cmp(&right.path.matches('/').count())
            .then_with(|| left.path.to_ascii_lowercase().cmp(&right.path.to_ascii_lowercase()))
    });
    entries.truncate(limit.clamp(1, config::FILE_LIST_MAX_LIMIT));
    Ok(entries)
}

async fn list_tree(
    lease: &SandboxLease,
    cloud_ws: &CloudWorkspace,
    subpath: Option<&str>,
) -> ApiResult<DirListing> {
    let requested = subpath.map(str::trim).filter(|s| !s.is_empty()).unwrap_or(".");
    let target = resolve_cloud_path(cloud_ws, requested)?;
    let stat = lease
        .manager
        .stat(&lease.conn, &target)
        .await?
        .ok_or_else(|| ApiError::not_found(format!("not found: {requested}")))?;
    if !stat.is_dir {
        return Err(ApiError::bad_request(format!("not a folder: {requested}")));
    }

    let raw_entries = lease.manager.list_dir(&lease.conn, &target, 1).await?;
    let mut entries: Vec<TreeEntry> = Vec::new();
    let mut truncated = false;
    for entry in raw_entries {
        if entry.is_dir && hconfig::SKIP_DIRS.contains(&entry.name.as_str()) {
            continue;
        }
        if entries.len() >= hconfig::MAX_DIR_ENTRIES {
            truncated = true;
            break;
        }
        let full = if target.ends_with('/') {
            format!("{target}{}", entry.name)
        } else {
            format!("{target}/{}", entry.name)
        };
        entries.push(TreeEntry {
            name: entry.name,
            path: display_relative_str(&cloud_ws.repo_dir, &full),
            is_dir: entry.is_dir,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()))
    });
    Ok(DirListing { entries, truncated })
}

async fn require_file_stat(
    lease: &SandboxLease,
    cloud_ws: &CloudWorkspace,
    path: &str,
) -> ApiResult<(String, String, crate::cloud::e2b::EnvdStat)> {
    let abs = resolve_cloud_path(cloud_ws, path)?;
    let stat = lease
        .manager
        .stat(&lease.conn, &abs)
        .await?
        .ok_or_else(|| ApiError::not_found(format!("not found: {abs}")))?;
    if !stat.is_file {
        return Err(ApiError::bad_request(format!("not a file: {abs}")));
    }
    Ok((abs.clone(), display_relative_str(&cloud_ws.repo_dir, &abs), stat))
}

async fn read_text(
    lease: &SandboxLease,
    cloud_ws: &CloudWorkspace,
    path: &str,
) -> ApiResult<FileContent> {
    let (abs, rel, _stat) = require_file_stat(lease, cloud_ws, path).await?;
    let (mut bytes, truncated) = lease
        .manager
        .read_bytes_prefix(&lease.conn, &abs, config::MAX_TEXT_PREVIEW_BYTES)
        .await?;
    if truncated {
        bytes.truncate(config::MAX_TEXT_PREVIEW_BYTES);
        let valid = match std::str::from_utf8(&bytes) {
            Ok(text) => text.len(),
            Err(error) => error.valid_up_to(),
        };
        bytes.truncate(valid);
    }
    if util::looks_binary(&bytes) {
        return Err(ApiError::bad_request(format!(
            "cannot read binary file as text: {rel}"
        )));
    }
    Ok(FileContent {
        path: rel,
        content: String::from_utf8_lossy(&bytes).into_owned(),
        truncated,
    })
}

fn mime_for_name(name: &str) -> String {
    mime_guess::from_path(name)
        .first_or_octet_stream()
        .essence_str()
        .to_string()
}

async fn read_image_data_url(
    lease: &SandboxLease,
    cloud_ws: &CloudWorkspace,
    path: &str,
) -> ApiResult<String> {
    let (abs, rel, stat) = require_file_stat(lease, cloud_ws, path).await?;
    let mime = mime_for_name(&stat.name);
    if !mime.starts_with("image/") {
        return Err(ApiError::bad_request(format!(
            "not a supported image: {rel}"
        )));
    }
    if stat.size > config::MAX_PREVIEW_IMAGE_BYTES {
        return Err(ApiError::bad_request(format!(
            "image too large to preview: {rel}"
        )));
    }
    let bytes = lease.manager.read_bytes(&lease.conn, &abs).await?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
}

async fn read_binary(
    lease: &SandboxLease,
    cloud_ws: &CloudWorkspace,
    path: &str,
) -> ApiResult<Vec<u8>> {
    let (abs, rel, stat) = require_file_stat(lease, cloud_ws, path).await?;
    if stat.size > config::MAX_BINARY_PREVIEW_BYTES {
        return Err(ApiError::bad_request(format!(
            "file too large to preview: {rel}"
        )));
    }
    lease.manager.read_bytes(&lease.conn, &abs).await
}

pub async fn handle(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
    ApiPath(kind): ApiPath<String>,
    ApiQuery(query): ApiQuery<FilesQuery>,
) -> ApiResult<Response> {
    let cloud_ws = workspace::normalize(&query.workspace)?;
    let lease = state.sandbox_manager.acquire(&user.id, &cloud_ws).await?;
    let path = || {
        query
            .path
            .as_deref()
            .ok_or_else(|| ApiError::bad_request("path is required"))
    };

    match kind.as_str() {
        "list" => {
            let limit = query.limit.unwrap_or(config::FILE_LIST_DEFAULT_LIMIT);
            let entries = list_files(&lease, &cloud_ws, query.query.as_deref(), limit).await?;
            Ok(Json(entries).into_response())
        }
        "tree" => {
            let listing = list_tree(&lease, &cloud_ws, query.path.as_deref()).await?;
            Ok(Json(listing).into_response())
        }
        "text" => Ok(Json(read_text(&lease, &cloud_ws, path()?).await?).into_response()),
        "image" => {
            let data_url = read_image_data_url(&lease, &cloud_ws, path()?).await?;
            Ok(Json(json!({ "dataUrl": data_url })).into_response())
        }
        "binary" => {
            let bytes = read_binary(&lease, &cloud_ws, path()?).await?;
            let mut response = bytes.into_response();
            response.headers_mut().insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/octet-stream"),
            );
            Ok(response)
        }
        _ => Err(ApiError::not_found(format!("Not Found: /cloud/files/{kind}"))),
    }
}
