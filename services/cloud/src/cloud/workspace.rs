use crate::shared::config;
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::util;

pub const CLOUD_WORKSPACE_PREFIX: &str = "cloud://";

pub struct CloudWorkspace {
    pub uri: String,
    pub repo_url: String,
    pub repo_dir: String,
}

fn supported_host(host: &str) -> bool {
    matches!(
        host.to_ascii_lowercase().as_str(),
        "github.com"
            | "www.github.com"
            | "gitlab.com"
            | "www.gitlab.com"
            | "bitbucket.org"
            | "www.bitbucket.org"
    )
}

fn valid_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment != "."
        && segment != ".."
        && segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~'))
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
                "Only public HTTP/HTTPS Git repository URLs (e.g. https://github.com/owner/repo) are supported.",
            )
        })?;

    let clean = without_scheme
        .trim_matches('/')
        .trim_end_matches(".git");
    let parts: Vec<&str> = clean.split('/').filter(|segment| !segment.is_empty()).collect();
    let (host, owner, repo) = match parts.as_slice() {
        [owner, repo] if valid_segment(owner) && valid_segment(repo) => {
            ("github.com", *owner, *repo)
        }
        [host, owner, repo]
            if supported_host(host) && valid_segment(owner) && valid_segment(repo) =>
        {
            (*host, *owner, *repo)
        }
        _ => {
            return Err(ApiError::bad_request(
                "Invalid repository URL. Only github.com, gitlab.com, and bitbucket.org repositories are supported.",
            ));
        }
    };

    let canonical_path = format!("{host}/{owner}/{repo}");
    Ok(CloudWorkspace {
        uri: format!("{CLOUD_WORKSPACE_PREFIX}{canonical_path}"),
        repo_url: format!("https://{canonical_path}"),
        repo_dir: format!("{}/{}", config::WORKSPACE_ROOT, util::safe_file_name(repo)),
    })
}
