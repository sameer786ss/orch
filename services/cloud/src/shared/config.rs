use std::collections::HashMap;

use serde::de::DeserializeOwned;

use crate::shared::crypto;

pub struct Config {
    pub port: u16,
    pub project_id: String,
    pub tavily_api_key: String,
    pub groq_api_key: String,
    pub e2b_api_key: String,
    pub e2b_template_id: String,
    pub e2b_domain: String,
    pub gcs_bucket: String,
    pub antigravity: AntigravityConfig,
    pub composio: ComposioConfig,
    pub github: GithubConfig,
}

pub struct AntigravityConfig {
    pub client_id: String,
    pub client_secret: String,
    pub endpoint: String,
    pub project_id: String,
    pub refresh_tokens: Vec<String>,
}

pub struct ComposioConfig {
    pub api_key: String,
    pub callback_url: String,
    pub auth_config_ids: HashMap<String, String>,
}

pub struct GithubConfig {
    pub client_id: String,
    pub client_secret: String,
    pub callback_url: String,
    pub web_handoff_url: String,
    pub token_key: [u8; 32],
}

fn var(key: &str) -> String {
    match std::env::var(key) {
        Ok(value) if !value.trim().is_empty() => value.trim().to_string(),
        _ => panic!("{key} must be set"),
    }
}

fn optional_var(key: &str, default: &str) -> String {
    match std::env::var(key) {
        Ok(value) if !value.trim().is_empty() => value.trim().to_string(),
        _ => default.to_string(),
    }
}

fn normalize_bucket(raw: String) -> String {
    raw.trim()
        .strip_prefix("gs://")
        .unwrap_or(raw.trim())
        .trim_matches('/')
        .to_string()
}

fn json_var<T: DeserializeOwned>(key: &str) -> T {
    serde_json::from_str(&var(key)).unwrap_or_else(|error| panic!("{key} must be valid JSON: {error}"))
}

impl Config {
    pub fn from_env() -> Self {
        let refresh_tokens: Vec<String> = json_var("ANTIGRAVITY_REFRESH_TOKENS");
        assert!(
            !refresh_tokens.is_empty(),
            "ANTIGRAVITY_REFRESH_TOKENS must contain at least one token"
        );
        let auth_config_ids: HashMap<String, String> =
            json_var::<HashMap<String, String>>("COMPOSIO_AUTH_CONFIG_IDS")
                .into_iter()
                .map(|(k, v)| (k.trim().to_ascii_lowercase(), v))
                .collect();
        assert!(
            !auth_config_ids.is_empty(),
            "COMPOSIO_AUTH_CONFIG_IDS must contain at least one toolkit"
        );
        let gcs_bucket = normalize_bucket(var("GCS_BUCKET"));
        assert!(!gcs_bucket.is_empty(), "GCS_BUCKET must not be empty");
        let github_token_key = crypto::parse_key(&var("GITHUB_TOKEN_KEY"));
        let github_callback_url = var("GITHUB_CALLBACK_URL");
        let github_web_handoff_url = var("GITHUB_WEB_HANDOFF_URL");
        reqwest::Url::parse(&github_callback_url).expect("GITHUB_CALLBACK_URL must be a valid URL");
        reqwest::Url::parse(&github_web_handoff_url).expect("GITHUB_WEB_HANDOFF_URL must be a valid URL");
        Self {
            port: var("PORT").parse().expect("PORT must be a valid port number"),
            project_id: var("VERTEX_PROJECT_ID"),
            tavily_api_key: var("TAVILY_API_KEY"),
            groq_api_key: var("GROQ_API_KEY"),
            e2b_api_key: var("E2B_API_KEY"),
            e2b_template_id: var("E2B_TEMPLATE_ID"),
            e2b_domain: optional_var("E2B_DOMAIN", "e2b.app"),
            gcs_bucket,
            antigravity: AntigravityConfig {
                client_id: var("ANTIGRAVITY_CLIENT_ID"),
                client_secret: var("ANTIGRAVITY_CLIENT_SECRET"),
                endpoint: var("ANTIGRAVITY_ENDPOINT").trim_end_matches('/').to_string(),
                project_id: var("ANTIGRAVITY_PROJECT_ID"),
                refresh_tokens,
            },
            composio: ComposioConfig {
                api_key: var("COMPOSIO_API_KEY"),
                callback_url: var("COMPOSIO_CALLBACK_URL"),
                auth_config_ids,
            },
            github: GithubConfig {
                client_id: var("GITHUB_CLIENT_ID"),
                client_secret: var("GITHUB_CLIENT_SECRET"),
                callback_url: github_callback_url,
                web_handoff_url: github_web_handoff_url,
                token_key: github_token_key,
            },
        }
    }
}

pub const GOOGLE_CERTS_URL: &str = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
pub const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
pub const TAVILY_SEARCH_URL: &str = "https://api.tavily.com/search";
pub const GROQ_TRANSCRIBE_URL: &str = "https://api.groq.com/openai/v1/audio/transcriptions";
pub const COMPOSIO_API_BASE: &str = "https://backend.composio.dev/api/v3";
pub const GITHUB_AUTHORIZE_URL: &str = "https://github.com/login/oauth/authorize";
pub const GITHUB_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
pub const GITHUB_API_BASE: &str = "https://api.github.com";
pub const OAUTH_STATE_TTL_SECS: i64 = 600;
pub const FIRESTORE_SCOPE: &str = "https://www.googleapis.com/auth/datastore";
pub const GCS_STORAGE_BASE: &str = "https://storage.googleapis.com";
pub const GCS_SCOPE: &str = "https://www.googleapis.com/auth/devstorage.read_write";

pub const E2B_API_BASE: &str = "https://api.e2b.app";
pub const E2B_ENVD_PORT: u16 = 49983;
pub const E2B_IDLE_PAUSE_SECS: u64 = 40;
pub const E2B_REQUEST_TIMEOUT_SECS: u64 = 60;
pub const E2B_SANDBOX_TIMEOUT_SECS: u64 = 3600;

pub const UTILITY_MODEL: &str = "gemini-3.5-flash-lite";
pub const GROQ_TRANSCRIBE_MODEL: &str = "whisper-large-v3";
pub const VERTEX_USER_AGENT: &str = "antigravity/2.28.2 darwin/arm64";

pub const DEFAULT_BUDGET_LIMIT_USD: f64 = 20.0;
pub const BUDGET_CACHE_TTL_SECS: u64 = 30;
pub const BUDGET_WRITE_ATTEMPTS: u32 = 3;

pub const AUTH_CACHE_TTL_SECS: u64 = 300;
pub const AUTH_CACHE_CAPACITY: u64 = 2000;

pub const HTTP_CONNECT_TIMEOUT_SECS: u64 = 15;
pub const HTTP_REQUEST_TIMEOUT_SECS: u64 = 120;
pub const UPSTREAM_OPEN_TIMEOUT_SECS: u64 = 60;
pub const FIRESTORE_TIMEOUT_SECS: u64 = 15;
pub const FIRESTORE_RETRY_ATTEMPTS: u32 = 2;
pub const FIRESTORE_BATCH_LIMIT: usize = 450;
pub const SHUTDOWN_GRACE_SECS: u64 = 25;

pub const DEFAULT_BODY_LIMIT_BYTES: usize = 1024 * 1024;
pub const LARGE_BODY_LIMIT_BYTES: usize = 64 * 1024 * 1024;
pub use orchharness::config::{
    CLOUD_MAX_ATTACHMENT_TOTAL_BYTES, CLOUD_WORKSPACE_PREFIX, SUPPORTED_CLOUD_GIT_HOSTS,
};

pub const TITLE_PROMPT: &str = "Generate a concise, 3 to 6 word title summarizing this user prompt. Do not use quotes or punctuation.\n\nUser prompt: ";
pub const TITLE_PROMPT_MAX_CHARS: usize = 2000;
pub const TITLE_MAX_OUTPUT_TOKENS: u64 = 64;
pub const SUMMARIZE_DEFAULT_MAX_TOKENS: u64 = 8000;

pub const STREAM_IDLE_TIMEOUT_SECS: u64 = 1800;
pub const KEEPALIVE_SECS: u64 = 15;
pub const HEARTBEAT_SECS: u64 = 30;
pub const RUN_LEASE_SECS: i64 = 90;
pub const RUN_CANCEL_WAIT_SECS: u64 = 15;
pub const MAX_RUN_BUFFER_BYTES: usize = 512 * 1024;
pub const MAX_STREAM_BUFFER_BYTES: usize = 32 * 1024 * 1024;
pub const TAIL_POLL_MS: u64 = 1500;
pub const TAIL_MAX_FAILURES: u32 = 5;
pub const SUBSCRIBER_CHANNEL_CAPACITY: usize = 64;

pub const SESSION_PAGE_SIZE: usize = 300;

pub const MAX_SANDBOX_LEASES_PER_USER: usize = 4;
pub const MAX_SANDBOX_LEASES_TOTAL: usize = 16;

pub const WORKSPACE_ROOT: &str = "/home/user/workspace";
pub const UPLOAD_DIR: &str = "/home/user/uploads";

pub const MAX_TEXT_PREVIEW_BYTES: usize = 512 * 1024;
pub const MAX_PREVIEW_IMAGE_BYTES: u64 = 8 * 1024 * 1024;
pub const MAX_BINARY_PREVIEW_BYTES: u64 = 8 * 1024 * 1024;
pub const FILE_LIST_DEFAULT_LIMIT: usize = 100;
pub const FILE_LIST_MAX_LIMIT: usize = 2000;

pub const DEFAULT_HISTORY_LIMIT: usize = 200;
pub const MAX_HISTORY_LIMIT: usize = 1000;
