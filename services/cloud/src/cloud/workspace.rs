use crate::shared::config::{self, CLOUD_WORKSPACE_PREFIX, SUPPORTED_CLOUD_GIT_HOSTS};
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::util;

#[derive(Debug, Clone)]
pub struct CloudWorkspace {
    pub uri: String,
    pub repo_url: String,
    pub repo_dir: String,
    pub owner: String,
    pub repo: String,
    pub full_name: String,
}

fn supported_host(host: &str) -> bool {
    SUPPORTED_CLOUD_GIT_HOSTS
        .iter()
        .any(|allowed| host.eq_ignore_ascii_case(allowed))
}

fn valid_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment != "."
        && segment != ".."
        && segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

pub fn normalize(input: &str) -> ApiResult<CloudWorkspace> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(ApiError::bad_request("Repository URL cannot be empty."));
    }

    let without_scheme = [CLOUD_WORKSPACE_PREFIX, "https://", "http://"]
        .iter()
        .find_map(|prefix| trimmed.strip_prefix(prefix))
        .or_else(|| (!trimmed.contains("://")).then_some(trimmed))
        .ok_or_else(|| {
            ApiError::bad_request(
                "Only GitHub repositories (e.g. owner/repo or https://github.com/owner/repo) are supported.",
            )
        })?;

    let clean = without_scheme.trim_matches('/').trim_end_matches(".git");
    let parts: Vec<&str> = clean.split('/').filter(|segment| !segment.is_empty()).collect();
    let (owner, repo) = match parts.as_slice() {
        [owner, repo] if valid_segment(owner) && valid_segment(repo) => (*owner, *repo),
        [host, owner, repo]
            if supported_host(host) && valid_segment(owner) && valid_segment(repo) =>
        {
            (*owner, *repo)
        }
        _ => {
            return Err(ApiError::bad_request(
                "Invalid repository. Only GitHub repositories (owner/repo) are supported.",
            ));
        }
    };

    let full_name = format!("{owner}/{repo}");
    let canonical_path = format!("github.com/{full_name}");
    Ok(CloudWorkspace {
        uri: format!("{CLOUD_WORKSPACE_PREFIX}{canonical_path}"),
        repo_url: format!("https://{canonical_path}"),
        repo_dir: format!("{}/{}", config::WORKSPACE_ROOT, util::safe_file_name(repo)),
        owner: owner.to_string(),
        repo: repo.to_string(),
        full_name,
    })
}
