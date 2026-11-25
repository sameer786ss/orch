use std::sync::LazyLock;

pub use orchharness::config::{
    compaction_trigger_tokens, is_cloud_workspace, CLOUD_MAX_ATTACHMENT_TOTAL_BYTES,
    CLOUD_WORKSPACE_PREFIX, MAX_DIR_ENTRIES, MAX_INDEXED_FILES, SUMMARY_REQUEST_TIMEOUT_SECS,
    SUPPORTED_CLOUD_GIT_HOSTS,
};
pub const CLOUD_FILE_LIST_LIMIT: usize = 2_000;
pub const CLOUD_STREAM_IDLE_TIMEOUT_SECS: u64 = 60;

pub const LATEST_RELEASE_URL: &str =
    "https://github.com/sameer786ss/orch/releases/latest/download/latest.json";

pub fn gcp_functions_url() -> &'static str {
    static URL: LazyLock<String> = LazyLock::new(|| {
        std::env::var("GCP_FUNCTIONS_URL")
            .ok()
            .map(|s| s.trim().trim_end_matches('/').to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                option_env!("GCP_FUNCTIONS_URL")
                    .map(|s| s.trim().trim_end_matches('/').to_string())
                    .filter(|s| !s.is_empty())
            })
            .unwrap_or_default()
    });
    URL.as_str()
}

pub fn firebase_api_key() -> &'static str {
    static KEY: LazyLock<String> = LazyLock::new(|| {
        std::env::var("FIREBASE_API_KEY")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                option_env!("FIREBASE_API_KEY")
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            })
            .unwrap_or_default()
    });
    KEY.as_str()
}

pub fn sentry_dsn() -> &'static str {
    static DSN: LazyLock<String> = LazyLock::new(|| {
        std::env::var("SENTRY_DSN")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                option_env!("SENTRY_DSN")
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_default()
            })
    });
    DSN.as_str()
}

pub const AUTH_REDIRECT_URL: &str = "https://orch.live/auth-callback";

pub fn inference_base_url() -> String {
    format!("{}/vertex", gcp_functions_url())
}

pub fn models_url() -> &'static str {
    static URL: LazyLock<String> = LazyLock::new(|| format!("{}/models", gcp_functions_url()));
    URL.as_str()
}

pub fn title_url() -> &'static str {
    static URL: LazyLock<String> = LazyLock::new(|| format!("{}/title", gcp_functions_url()));
    URL.as_str()
}

pub fn summarize_url() -> &'static str {
    static URL: LazyLock<String> = LazyLock::new(|| format!("{}/summarize", gcp_functions_url()));
    URL.as_str()
}

pub fn budget_url() -> &'static str {
    static URL: LazyLock<String> = LazyLock::new(|| format!("{}/budget", gcp_functions_url()));
    URL.as_str()
}

pub fn transcribe_url() -> &'static str {
    static URL: LazyLock<String> = LazyLock::new(|| format!("{}/transcribe", gcp_functions_url()));
    URL.as_str()
}

pub fn tavily_url() -> &'static str {
    static URL: LazyLock<String> = LazyLock::new(|| format!("{}/tavily", gcp_functions_url()));
    URL.as_str()
}

pub fn composio_url(path: &str) -> String {
    format!("{}/composio{}", gcp_functions_url(), path)
}

pub fn github_url(path: &str) -> String {
    format!("{}/github{}", gcp_functions_url(), path)
}

pub fn cloud_url(path: &str) -> String {
    format!("{}/cloud{}", gcp_functions_url(), path)
}

pub const TOKEN_REFRESH_CHECK_INTERVAL_SECS: u64 = 60;
pub const TOKEN_REFRESH_SKEW_SECS: i64 = 600;
pub const SIGN_IN_WINDOW_SECS: u64 = 600;
pub const AUTH_REQUEST_TIMEOUT_SECS: u64 = 15;

pub const FILE_INDEX_TTL_SECS: u64 = 120;

pub const MAX_PREVIEW_IMAGE_BYTES: u64 = 50 * 1024 * 1024;
pub const MAX_BINARY_PREVIEW_BYTES: u64 = 30 * 1024 * 1024;

pub const DICTATION_TARGET_SAMPLE_RATE: u32 = 16_000;
