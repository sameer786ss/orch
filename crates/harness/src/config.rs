pub const DEFAULT_MAX_TURNS: usize = 100;
pub const DEFAULT_TOOL_CONCURRENCY: usize = 4;
pub const COMMAND_FOREGROUND_HANDOFF_SECS: u64 = 30;
pub const COMMAND_MAX_WAIT_MS: u64 = 300_000;

pub const MAX_ATTACHMENT_SOURCE_BYTES: u64 = 20 * 1024 * 1024;
pub const CLOUD_MAX_ATTACHMENT_TOTAL_BYTES: usize = 18 * 1024 * 1024;

pub const CLOUD_WORKSPACE_PREFIX: &str = "cloud://";
pub const SUPPORTED_CLOUD_GIT_HOSTS: &[&str] = &[
    "github.com",
    "www.github.com",
];

pub fn is_cloud_workspace(workspace: &str) -> bool {
    workspace.trim().starts_with(CLOUD_WORKSPACE_PREFIX)
}

pub const MAX_TOOL_OUTPUT_CHARS: usize = 48_000;
pub const MAX_READ_FILE_LINES: usize = 2_000;
pub const MAX_READ_FILE_CHARS: usize = 40_000;
pub const MAX_SEARCH_LINE_CHARS: usize = 300;
pub const MAX_SEARCH_OUTPUT_CHARS: usize = 40_000;
pub const MAX_VIEW_TOOL_OUTPUT_CHARS: usize = 16_000;

pub const PREAMBLE_TOKEN_RESERVE: u64 = 9_000;
pub const COMPACTION_TRIGGER_PERCENT: u64 = 80;
pub const COMPACTION_KEEP_RECENT_TOKENS: usize = 24_000;
pub const COMPACTION_SUMMARY_TOKENS: u64 = 10_000;
pub const COMPACTION_SNIPPET_CHARS: usize = 3_000;

pub const STREAM_CHUNK_TIMEOUT_SECS: u64 = 360;
pub const TOOL_EXECUTION_TIMEOUT_SECS: u64 = 1_800;
pub const SUMMARY_REQUEST_TIMEOUT_SECS: u64 = 180;

pub const MAX_INDEXED_FILES: usize = 200_000;
pub const MAX_DIR_ENTRIES: usize = 5_000;

pub const FILE_SIZE_LIMIT: u64 = 10 * 1024 * 1024;
pub const MAX_SEARCHABLE_FILE_BYTES: u64 = 10 * 1024 * 1024;

pub const SESSION_ID_MAX_LEN: usize = 64;

pub const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    ".git",
    ".next",
    ".turbo",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
];

pub fn compaction_trigger_tokens(context_window: u64) -> u64 {
    context_window
        .saturating_mul(COMPACTION_TRIGGER_PERCENT)
        .checked_div(100)
        .unwrap_or(0)
}
