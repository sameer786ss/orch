use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};
use crate::persistence::{HistoryRecord, SessionRecordPage, SessionSnapshot, TurnUsage};

pub const OUTPUT_RING_BYTES: usize = 100 * 1024;
const TASK_MAX_AGE: Duration = Duration::from_secs(3600);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
    TimedOut,
}

impl std::fmt::Display for CommandStatus {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::TimedOut => "timed_out",
        })
    }
}

#[derive(Debug, Clone, Default)]
pub struct PathStat {
    pub exists: bool,
    pub is_file: bool,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct CommandResult {
    pub status: CommandStatus,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub background_task_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CommandTaskStatus {
    pub task_id: String,
    pub command: String,
    pub status: CommandStatus,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub elapsed_secs: u64,
}

pub struct RingBuffer {
    data: VecDeque<u8>,
}

impl RingBuffer {
    pub fn new() -> Self {
        Self {
            data: VecDeque::with_capacity(OUTPUT_RING_BYTES),
        }
    }

    pub fn push(&mut self, bytes: &[u8]) {
        if bytes.len() >= OUTPUT_RING_BYTES {
            self.data.clear();
            self.data
                .extend(bytes[bytes.len() - OUTPUT_RING_BYTES..].iter().copied());
            return;
        }
        let excess = self
            .data
            .len()
            .saturating_add(bytes.len())
            .saturating_sub(OUTPUT_RING_BYTES);
        if excess > 0 {
            self.data.drain(..excess);
        }
        self.data.extend(bytes.iter().copied());
    }

    pub fn as_string(&self) -> String {
        let (first, second) = self.data.as_slices();
        let mut bytes = Vec::with_capacity(first.len() + second.len());
        bytes.extend_from_slice(first);
        bytes.extend_from_slice(second);
        let mut start = 0;
        while start < bytes.len() && (bytes[start] & 0b1100_0000) == 0b1000_0000 {
            start += 1;
        }
        String::from_utf8_lossy(&bytes[start..]).into_owned()
    }
}

impl Default for RingBuffer {
    fn default() -> Self {
        Self::new()
    }
}

struct ManagedTask {
    task_id: String,
    run_id: String,
    background: bool,
    command: String,
    status: CommandStatus,
    exit_code: Option<i32>,
    stdout: RingBuffer,
    stderr: RingBuffer,
    started_at: Instant,
    cancel_token: CancellationToken,
}

impl ManagedTask {
    fn request_kill(&mut self) -> bool {
        if self.status != CommandStatus::Running {
            return false;
        }
        self.cancel_token.cancel();
        true
    }
}

#[derive(Clone)]
pub struct CommandTaskHandle {
    inner: Arc<Mutex<ManagedTask>>,
}

impl CommandTaskHandle {
    pub fn push_stdout(&self, bytes: &[u8]) {
        self.inner.lock().stdout.push(bytes);
    }

    pub fn push_stderr(&self, bytes: &[u8]) {
        self.inner.lock().stderr.push(bytes);
    }

    pub fn is_running(&self) -> bool {
        self.inner.lock().status == CommandStatus::Running
    }

    pub fn set_completed(&self, code: i32) {
        let mut g = self.inner.lock();
        g.exit_code = Some(code);
        g.status = if code == 0 {
            CommandStatus::Completed
        } else {
            CommandStatus::Failed
        };
    }

    pub fn set_finished_default(&self) {
        let mut g = self.inner.lock();
        if g.status == CommandStatus::Running {
            g.status = CommandStatus::Completed;
            g.exit_code.get_or_insert(0);
        }
    }

    pub fn set_cancelled(&self) {
        self.inner.lock().status = CommandStatus::Cancelled;
    }

    pub fn set_timed_out(&self, message: &str) {
        let mut g = self.inner.lock();
        g.status = CommandStatus::TimedOut;
        g.stderr.push(message.as_bytes());
    }

    pub fn set_failed(&self, message: &str) {
        let mut g = self.inner.lock();
        g.status = CommandStatus::Failed;
        g.stderr.push(message.as_bytes());
    }

    pub fn set_failed_if_running(&self, message: &str) {
        let mut g = self.inner.lock();
        if g.status == CommandStatus::Running {
            g.status = CommandStatus::Failed;
            g.stderr.push(message.as_bytes());
        }
    }
}

#[derive(Clone, Default)]
pub struct CommandRegistry {
    tasks: Arc<Mutex<HashMap<String, Arc<Mutex<ManagedTask>>>>>,
}

impl CommandRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(
        &self,
        command: &str,
        run_id: &str,
        background: bool,
    ) -> (String, CommandTaskHandle, Arc<Notify>, CancellationToken) {
        self.prune_old_tasks();
        let task_id = format!("task-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
        let done = Arc::new(Notify::new());
        let cancel_token = CancellationToken::new();
        let inner = Arc::new(Mutex::new(ManagedTask {
            task_id: task_id.clone(),
            run_id: run_id.to_string(),
            background,
            command: command.to_string(),
            status: CommandStatus::Running,
            exit_code: None,
            stdout: RingBuffer::new(),
            stderr: RingBuffer::new(),
            started_at: Instant::now(),
            cancel_token: cancel_token.clone(),
        }));
        self.tasks.lock().insert(task_id.clone(), inner.clone());
        (task_id, CommandTaskHandle { inner }, done, cancel_token)
    }

    pub fn mark_background(&self, task_id: &str) {
        let task = self.tasks.lock().get(task_id).cloned();
        if let Some(task) = task {
            task.lock().background = true;
        }
    }

    pub fn get_status(&self, task_id: &str) -> Option<CommandTaskStatus> {
        let task = self.tasks.lock().get(task_id).cloned()?;
        let g = task.lock();
        Some(CommandTaskStatus {
            task_id: g.task_id.clone(),
            command: g.command.clone(),
            status: g.status.clone(),
            exit_code: g.exit_code,
            stdout: g.stdout.as_string(),
            stderr: g.stderr.as_string(),
            elapsed_secs: g.started_at.elapsed().as_secs(),
        })
    }

    pub fn kill_task(&self, task_id: &str) -> bool {
        let task = self.tasks.lock().get(task_id).cloned();
        match task {
            Some(t) => t.lock().request_kill(),
            None => false,
        }
    }

    pub fn kill_for_run(&self, run_id: &str) {
        self.kill_matching(|task| task.run_id == run_id);
    }

    pub fn kill_foreground_for_run(&self, run_id: &str) {
        self.kill_matching(|task| task.run_id == run_id && !task.background);
    }

    pub fn kill_all(&self) {
        self.kill_matching(|_| true);
    }

    fn kill_matching(&self, predicate: impl Fn(&ManagedTask) -> bool) {
        let list: Vec<_> = self.tasks.lock().values().cloned().collect();
        for task in list {
            let mut g = task.lock();
            if predicate(&g) {
                g.request_kill();
            }
        }
    }

    fn prune_old_tasks(&self) {
        let mut guard = self.tasks.lock();
        guard.retain(|_, task| {
            let g = task.lock();
            g.status == CommandStatus::Running || g.started_at.elapsed() < TASK_MAX_AGE
        });
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SearchTopic {
    #[default]
    General,
    News,
    Finance,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SearchDepth {
    #[default]
    Basic,
    Advanced,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TavilyRequest {
    pub query: String,
    #[serde(rename = "maxResults", skip_serializing_if = "Option::is_none")]
    pub max_results: Option<u32>,
    #[serde(rename = "searchDepth", skip_serializing_if = "Option::is_none")]
    pub search_depth: Option<SearchDepth>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic: Option<SearchTopic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TavilyResponse {
    #[serde(default)]
    pub results: Vec<TavilyResult>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TavilyResult {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub content: String,
}

#[async_trait]
pub trait WorkspaceOps: Send + Sync {
    fn root(&self) -> Option<String>;
    fn resolve_in_workspace(&self, input: &str) -> AppResult<String>;
    fn display_relative(&self, path: &str) -> String;
    async fn stat(&self, abs_path: &str) -> AppResult<PathStat>;
    async fn read_bytes(&self, abs_path: &str, max_bytes: Option<u64>) -> AppResult<Vec<u8>>;
    async fn write_bytes(&self, abs_path: &str, bytes: &[u8]) -> AppResult<()>;
    async fn list_dir(&self, abs_dir: &str) -> AppResult<Vec<String>>;
    async fn search_workspace(
        &self,
        abs_path: &str,
        query: &str,
        max_hits: usize,
    ) -> AppResult<String>;
    async fn execute_bash(
        &self,
        command: &str,
        cwd: &str,
        wait_ms: u64,
        timeout_secs: u64,
        run_id: &str,
    ) -> AppResult<CommandResult>;
    async fn get_command_status(&self, task_id: &str) -> AppResult<CommandTaskStatus>;
    async fn stop_command(&self, task_id: &str) -> AppResult<bool>;
    async fn cancel_run_commands(&self, _run_id: &str) {}
    async fn cleanup_foreground_commands(&self, _run_id: &str) {}
    async fn read_skill(&self, name: &str) -> AppResult<Option<String>>;
}

#[async_trait]
pub trait SessionStore: Send + Sync {
    async fn load_snapshot(&self, session_id: &str) -> AppResult<SessionSnapshot>;
    async fn save_snapshot(&self, session_id: &str, snapshot: &SessionSnapshot) -> AppResult<()>;
    async fn append_history(
        &self,
        session_id: &str,
        records: &[HistoryRecord],
    ) -> AppResult<()>;
    async fn get_history(
        &self,
        session_id: &str,
        limit: usize,
        before_seq: Option<i64>,
    ) -> AppResult<SessionRecordPage>;
    async fn set_context_tokens(&self, session_id: &str, tokens: u64) -> AppResult<()>;
    async fn record_usage(&self, session_id: &str, usage: &TurnUsage) -> AppResult<()>;
}

#[async_trait]
pub trait WebSearchBackend: Send + Sync {
    async fn tavily(&self, req: &TavilyRequest) -> AppResult<TavilyResponse>;
}

#[async_trait]
pub trait SummarizerBackend: Send + Sync {
    async fn summarize(&self, system: &str, prompt: &str, max_tokens: u64) -> AppResult<String>;
}

pub fn normalize_workspace_subpath(root: &str, input: &str) -> AppResult<String> {
    use path_clean::PathClean;
    use std::path::Path;

    let root_path = Path::new(root.trim_end_matches('/')).clean();
    let trimmed = input.trim();
    let stripped = trimmed.strip_prefix("file://").unwrap_or(trimmed);
    let raw = Path::new(stripped);
    let candidate = if raw.is_absolute() {
        raw.to_path_buf()
    } else {
        root_path.join(raw)
    }
    .clean();

    if candidate.strip_prefix(&root_path).is_err() {
        return Err(AppError::PathEscapesWorkspace(trimmed.to_string()));
    }
    Ok(candidate.to_string_lossy().replace('\\', "/"))
}

pub fn display_relative_str(root: &str, path: &str) -> String {
    let clean_root = root.trim_end_matches('/');
    let prefix = format!("{clean_root}/");
    path.strip_prefix(&prefix).unwrap_or(path).to_string()
}

#[cfg(feature = "local-fs")]
pub mod local_fs {
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};
    use std::sync::{Arc, OnceLock};
    use std::time::Duration;

    use async_trait::async_trait;
    use process_wrap::tokio::CommandWrap;
    #[cfg(unix)]
    use process_wrap::tokio::ProcessGroup;
    #[cfg(windows)]
    use process_wrap::tokio::{CreationFlags, JobObject};
    #[cfg(windows)]
    use windows::Win32::System::Threading::PROCESS_CREATION_FLAGS;
    use process_wrap::tokio::KillOnDrop;
    use ignore::{WalkBuilder, WalkState};
    use parking_lot::Mutex;
    use path_clean::PathClean;
    use tokio::io::AsyncReadExt;
    use tokio::sync::Notify;

    use super::{
        CommandRegistry, CommandResult, CommandStatus, CommandTaskHandle, CommandTaskStatus,
        PathStat,
        WorkspaceOps,
    };
    use crate::config;
    use crate::error::{AppError, AppResult};

    pub mod fs_util {
        use super::*;

        pub fn workspace_walker(root: &Path) -> WalkBuilder {
            let mut builder = WalkBuilder::new(root);
            builder
                .git_ignore(true)
                .git_global(false)
                .git_exclude(true)
                .hidden(false)
                .follow_links(false)
                .filter_entry(|entry| {
                    if entry.depth() == 0 {
                        return true;
                    }
                    if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        return true;
                    }
                    let name = entry.file_name().to_string_lossy();
                    !config::SKIP_DIRS.contains(&name.as_ref())
                });
            builder
        }

        pub fn resolve_path(root: Option<&Path>, input: &str) -> AppResult<PathBuf> {
            let stripped = input
                .trim()
                .strip_prefix("file://")
                .unwrap_or(input.trim());
            let raw = Path::new(stripped);
            let (root, candidate) = match root {
                Some(root) => {
                    let canonical_root = dunce::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
                    let candidate = if raw.is_absolute() {
                        raw.to_path_buf()
                    } else {
                        canonical_root.join(raw)
                    };
                    (Some(canonical_root), candidate.clean())
                }
                None => (None, raw.to_path_buf().clean()),
            };

            let Some(root) = root else {
                return Ok(candidate);
            };
            if candidate.strip_prefix(&root).is_err() {
                return Err(AppError::PathEscapesWorkspace(stripped.to_string()));
            }

            let mut existing = candidate.as_path();
            while !existing.exists() {
                existing = existing
                    .parent()
                    .ok_or_else(|| AppError::PathEscapesWorkspace(stripped.to_string()))?;
            }
            let canonical_existing = dunce::canonicalize(existing)?;
            if canonical_existing.strip_prefix(&root).is_err() {
                return Err(AppError::PathEscapesWorkspace(stripped.to_string()));
            }
            Ok(candidate)
        }

        pub fn resolve_in_workspace(root: &Path, input: &str) -> AppResult<PathBuf> {
            resolve_path(Some(root), input)
        }

        pub fn resolve_existing_file(root: &Path, input: &str) -> AppResult<PathBuf> {
            let resolved = resolve_in_workspace(root, input)?;
            let metadata = std::fs::metadata(&resolved)?;
            if !metadata.is_file() {
                return Err(AppError::Other(format!("not a file: {input}")));
            }
            Ok(resolved)
        }

        pub use crate::util::display_relative;

        pub fn file_lock(path: &Path) -> Arc<tokio::sync::Mutex<()>> {
            static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<tokio::sync::Mutex<()>>>>> =
                OnceLock::new();
            let locks = LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
            let mut guard = locks.lock();
            guard.retain(|_, lock| Arc::strong_count(lock) > 1);
            guard
                .entry(path.to_path_buf())
                .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
                .clone()
        }

        pub async fn atomic_write(path: &Path, content: &[u8]) -> AppResult<()> {
            let requested = path.to_path_buf();
            let bytes = content.to_vec();
            tokio::task::spawn_blocking(move || -> AppResult<()> {
                use std::io::Write;
                let target = dunce::canonicalize(&requested).unwrap_or(requested);
                let existing = std::fs::metadata(&target).ok();

                #[cfg(unix)]
                {
                    use std::os::unix::fs::MetadataExt;
                    if let Some(meta) = existing.as_ref() {
                        if meta.nlink() > 1 {
                            let mut file = std::fs::OpenOptions::new()
                                .write(true)
                                .truncate(true)
                                .open(&target)?;
                            file.write_all(&bytes)?;
                            file.sync_all()?;
                            return Ok(());
                        }
                    }
                }

                let parent = target
                    .parent()
                    .ok_or_else(|| AppError::other("target path has no parent directory"))?;
                std::fs::create_dir_all(parent)?;
                let mut tmp = tempfile::NamedTempFile::new_in(parent)?;
                tmp.write_all(&bytes)?;
                tmp.as_file().sync_all()?;
                match existing {
                    Some(meta) => tmp.as_file().set_permissions(meta.permissions())?,
                    None => {
                        #[cfg(unix)]
                        {
                            use std::os::unix::fs::PermissionsExt;
                            tmp.as_file()
                                .set_permissions(std::fs::Permissions::from_mode(0o644))?;
                        }
                    }
                }
                tmp.persist(&target).map_err(|e| AppError::Io(e.error))?;
                Ok(())
            })
            .await
            .map_err(|e| AppError::other(format!("atomic write join failed: {e}")))?
        }
    }

    const PIPE_DRAIN_GRACE: Duration = Duration::from_millis(750);

    #[derive(Clone, Default)]
    pub struct CommandManager {
        registry: CommandRegistry,
    }

    impl CommandManager {
        pub fn new() -> Self {
            Self::default()
        }

        pub fn mark_background(&self, task_id: &str) {
            self.registry.mark_background(task_id);
        }

        pub fn spawn_task(
            &self,
            command_str: &str,
            cwd: &Path,
            run_id: &str,
            background: bool,
            timeout_secs: u64,
        ) -> (String, Arc<Notify>) {
            let (task_id, handle, done, cancel_token) =
                self.registry.insert(command_str, run_id, background);

            let cmd_str = command_str.to_string();
            let cwd_buf = cwd.to_path_buf();
            let done_signal = done.clone();
            let clamped_timeout = timeout_secs.clamp(1, config::TOOL_EXECUTION_TIMEOUT_SECS);

            tokio::spawn(async move {
                let mut cmd = {
                    #[cfg(target_os = "windows")]
                    {
                        CommandWrap::with_new("powershell.exe", |command| {
                            command.args([
                                "-NoLogo",
                                "-NoProfile",
                                "-NonInteractive",
                                "-WindowStyle",
                                "Hidden",
                                "-Command",
                                &cmd_str,
                            ]);
                        })
                    }

                    #[cfg(not(target_os = "windows"))]
                    {
                        CommandWrap::with_new("/bin/sh", |command| {
                            command.args(["-c", &cmd_str]);
                            if let Some(path) = crate::util::login_shell_path() {
                                command.env("PATH", path);
                            }
                        })
                    }
                };

                cmd.command_mut()
                    .current_dir(&cwd_buf)
                    .env("CI", "1")
                    .env("TERM", "dumb")
                    .env("NO_COLOR", "1")
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped());
                cmd.wrap(KillOnDrop);
                #[cfg(unix)]
                cmd.wrap(ProcessGroup::leader());
                #[cfg(windows)]
                {
                    cmd.wrap(CreationFlags(PROCESS_CREATION_FLAGS(0x08000000)));
                    cmd.wrap(JobObject);
                }

                let spawn_result = cmd.spawn();

                match spawn_result {
                    Ok(mut child) => {
                        if cancel_token.is_cancelled() {
                            let _ = child.start_kill();
                        }

                        let stdout_task = child.stdout().take().map(|out| {
                            let h = handle.clone();
                            tokio::spawn(async move { pump(out, h, StreamKind::Stdout).await })
                        });
                        let stderr_task = child.stderr().take().map(|err| {
                            let h = handle.clone();
                            tokio::spawn(async move { pump(err, h, StreamKind::Stderr).await })
                        });

                        let deadline =
                            tokio::time::Instant::now() + Duration::from_secs(clamped_timeout);

                        tokio::select! {
                            biased;
                            _ = cancel_token.cancelled() => {
                                let _ = child.start_kill();
                                if tokio::time::timeout(PIPE_DRAIN_GRACE, child.wait()).await.is_err() {
                                    let _ = child.start_kill();
                                    let _ = tokio::time::timeout(PIPE_DRAIN_GRACE, child.wait()).await;
                                }
                                handle.set_cancelled();
                            }
                            _ = tokio::time::sleep_until(deadline) => {
                                let _ = child.start_kill();
                                if tokio::time::timeout(PIPE_DRAIN_GRACE, child.wait()).await.is_err() {
                                    let _ = child.start_kill();
                                    let _ = tokio::time::timeout(PIPE_DRAIN_GRACE, child.wait()).await;
                                }
                                handle.set_timed_out(&format!("\ncommand timed out after {clamped_timeout}s\n"));
                            }
                            wait_result = child.wait() => {
                                if cancel_token.is_cancelled() {
                                    handle.set_cancelled();
                                } else {
                                    match wait_result {
                                        Ok(status) => match status.code() {
                                            Some(code) => handle.set_completed(code),
                                            None if status.success() => handle.set_finished_default(),
                                            None => handle.set_failed("\nprocess terminated by signal\n"),
                                        },
                                        Err(e) => {
                                            handle.set_failed(&format!("\nprocess wait error: {e}\n"));
                                        }
                                    }
                                }
                            }
                        }

                        let stdout_abort = stdout_task.as_ref().map(|h| h.abort_handle());
                        let stderr_abort = stderr_task.as_ref().map(|h| h.abort_handle());
                        let drain = async {
                            if let Some(task) = stdout_task {
                                let _ = task.await;
                            }
                            if let Some(task) = stderr_task {
                                let _ = task.await;
                            }
                        };
                        if tokio::time::timeout(PIPE_DRAIN_GRACE, drain).await.is_err() {
                            if let Some(a) = stdout_abort {
                                a.abort();
                            }
                            if let Some(a) = stderr_abort {
                                a.abort();
                            }
                        }
                    }
                    Err(e) => {
                        handle.set_failed(&format!("spawn error: {e}"));
                    }
                }

                done_signal.notify_one();
            });

            (task_id, done)
        }

        pub fn get_status(&self, task_id: &str) -> Option<CommandTaskStatus> {
            self.registry.get_status(task_id)
        }

        pub fn kill_task(&self, task_id: &str) -> bool {
            self.registry.kill_task(task_id)
        }

        pub fn kill_for_run(&self, run_id: &str) {
            self.registry.kill_for_run(run_id);
        }

        pub fn kill_foreground_for_run(&self, run_id: &str) {
            self.registry.kill_foreground_for_run(run_id);
        }

        pub fn kill_all(&self) {
            self.registry.kill_all();
        }
    }

    #[derive(Clone, Copy)]
    enum StreamKind {
        Stdout,
        Stderr,
    }

    async fn pump<R>(mut reader: R, handle: CommandTaskHandle, kind: StreamKind)
    where
        R: tokio::io::AsyncRead + Unpin,
    {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => match kind {
                    StreamKind::Stdout => handle.push_stdout(&buf[..n]),
                    StreamKind::Stderr => handle.push_stderr(&buf[..n]),
                },
                Err(_) => break,
            }
        }
    }

    pub struct LocalWorkspaceOps {
        pub workspace: Option<PathBuf>,
        pub data_dir: PathBuf,
        pub command_manager: CommandManager,
    }

    impl LocalWorkspaceOps {
        fn require_root(&self) -> AppResult<PathBuf> {
            self.workspace.clone().ok_or(AppError::NoWorkspace)
        }
    }

    #[async_trait]
    impl WorkspaceOps for LocalWorkspaceOps {
        fn root(&self) -> Option<String> {
            self.workspace
                .as_ref()
                .map(|p| p.to_string_lossy().replace('\\', "/"))
        }

        fn resolve_in_workspace(&self, input: &str) -> AppResult<String> {
            let resolved = fs_util::resolve_path(self.workspace.as_deref(), input)?;
            Ok(resolved.to_string_lossy().replace('\\', "/"))
        }

        fn display_relative(&self, path: &str) -> String {
            match &self.workspace {
                Some(root) => fs_util::display_relative(root, Path::new(path)),
                None => path.replace('\\', "/"),
            }
        }

        async fn stat(&self, abs_path: &str) -> AppResult<PathStat> {
            let path = fs_util::resolve_in_workspace(&self.require_root()?, abs_path)?;
            let meta = match tokio::fs::metadata(&path).await {
                Ok(m) => m,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    return Ok(PathStat::default())
                }
                Err(e) => return Err(AppError::Io(e)),
            };
            Ok(PathStat {
                exists: true,
                is_file: meta.is_file(),
                is_dir: meta.is_dir(),
                size: meta.len(),
            })
        }

        async fn read_bytes(&self, abs_path: &str, max_bytes: Option<u64>) -> AppResult<Vec<u8>> {
            let path = fs_util::resolve_in_workspace(&self.require_root()?, abs_path)?;
            let meta = tokio::fs::metadata(&path).await?;
            if let Some(limit) = max_bytes {
                if meta.len() > limit {
                    return Err(AppError::other(format!(
                        "file too large ({} bytes, limit {} bytes): {abs_path}",
                        meta.len(),
                        limit
                    )));
                }
            }
            Ok(tokio::fs::read(&path).await?)
        }

        async fn write_bytes(&self, abs_path: &str, bytes: &[u8]) -> AppResult<()> {
            let path = fs_util::resolve_in_workspace(&self.require_root()?, abs_path)?;
            let lock = fs_util::file_lock(&path);
            let _guard = lock.lock().await;
            fs_util::atomic_write(&path, bytes).await
        }

        async fn list_dir(&self, abs_dir: &str) -> AppResult<Vec<String>> {
            let resolved = fs_util::resolve_in_workspace(&self.require_root()?, abs_dir)?;
            tokio::task::spawn_blocking(move || {
                if !resolved.exists() {
                    return Err(AppError::other(format!(
                        "path {} does not exist",
                        crate::tools::file_uri_str(&resolved.to_string_lossy())
                    )));
                }
                if !resolved.is_dir() {
                    return Err(AppError::other(format!(
                        "path {} is not a directory",
                        crate::tools::file_uri_str(&resolved.to_string_lossy())
                    )));
                }
                let entries = std::fs::read_dir(&resolved)
                    .map_err(|e| AppError::other(format!("Failed to read directory: {e}")))?;
                let mut paths: Vec<_> = entries.filter_map(Result::ok).collect();
                paths.sort_by_key(|e| e.file_name());

                let mut lines: Vec<String> = Vec::new();
                for entry in paths {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                    if is_dir && config::SKIP_DIRS.contains(&name.as_str()) {
                        continue;
                    }
                    if lines.len() >= config::MAX_DIR_ENTRIES {
                        lines.push("... (truncated, too many entries)".to_string());
                        break;
                    }
                    if is_dir {
                        lines.push(format!("{name}/"));
                    } else {
                        lines.push(name);
                    }
                }
                Ok(lines)
            })
            .await
            .map_err(|e| AppError::other(format!("list_dir task failed: {e}")))?
        }

        async fn search_workspace(
            &self,
            abs_path: &str,
            query: &str,
            max_hits: usize,
        ) -> AppResult<String> {
            let root = self.require_root()?;
            let search_path = fs_util::resolve_in_workspace(&root, abs_path)?;
            let query = query.to_string();
            tokio::task::spawn_blocking(move || search_text(&root, &search_path, &query, max_hits))
                .await
                .map_err(|e| AppError::other(format!("search task failed: {e}")))?
        }

        async fn execute_bash(
            &self,
            command: &str,
            cwd: &str,
            wait_ms: u64,
            timeout_secs: u64,
            run_id: &str,
        ) -> AppResult<CommandResult> {
            let root = self.require_root()?;
            let cwd_path = fs_util::resolve_in_workspace(&root, cwd)?;
            if !cwd_path.is_dir() {
                return Err(AppError::other(format!(
                    "cwd is not a directory: {}",
                    cwd_path.display()
                )));
            }
            let (task_id, done) = self.command_manager.spawn_task(
                command,
                &cwd_path,
                run_id,
                false,
                timeout_secs,
            );
            let notified = done.notified();
            tokio::pin!(notified);
            if tokio::time::timeout(Duration::from_millis(wait_ms), notified)
                .await
                .is_err()
            {
                self.command_manager.mark_background(&task_id);
                let partial = self.command_manager.get_status(&task_id);
                return Ok(CommandResult {
                    status: CommandStatus::Running,
                    exit_code: None,
                    stdout: partial.as_ref().map(|s| s.stdout.clone()).unwrap_or_default(),
                    stderr: partial.as_ref().map(|s| s.stderr.clone()).unwrap_or_default(),
                    background_task_id: Some(task_id),
                });
            }
            let status = self
                .command_manager
                .get_status(&task_id)
                .ok_or_else(|| AppError::other("command task disappeared unexpectedly"))?;
            Ok(CommandResult {
                status: status.status,
                exit_code: status.exit_code,
                stdout: status.stdout,
                stderr: status.stderr,
                background_task_id: None,
            })
        }

        async fn get_command_status(&self, task_id: &str) -> AppResult<CommandTaskStatus> {
            self.command_manager
                .get_status(task_id)
                .ok_or_else(|| AppError::other(format!("task_id '{task_id}' not found")))
        }

        async fn stop_command(&self, task_id: &str) -> AppResult<bool> {
            Ok(self.command_manager.kill_task(task_id))
        }

        async fn cancel_run_commands(&self, run_id: &str) {
            self.command_manager.kill_for_run(run_id);
        }

        async fn cleanup_foreground_commands(&self, run_id: &str) {
            self.command_manager.kill_foreground_for_run(run_id);
        }

        async fn read_skill(&self, name: &str) -> AppResult<Option<String>> {
            match crate::skills::read_skill_from_dir(self.data_dir.clone(), name).await {
                Ok(content) => Ok(Some(content)),
                Err(_) => Ok(None),
            }
        }
    }

    fn search_text(
        root: &Path,
        search_path: &Path,
        query: &str,
        max_hits: usize,
    ) -> AppResult<String> {
        let matcher = grep_regex::RegexMatcherBuilder::new()
            .case_insensitive(true)
            .build(query)
            .map_err(|e| AppError::other(format!("invalid search pattern: {e}")))?;

        #[derive(Default)]
        struct SearchAccumulator {
            results: Vec<(String, u64, String)>,
            total_chars: usize,
            truncated: bool,
        }

        let state = Arc::new(Mutex::new(SearchAccumulator::default()));
        let matcher = Arc::new(matcher);

        fs_util::workspace_walker(search_path)
            .build_parallel()
            .run(|| {
                let matcher = matcher.clone();
                let state = state.clone();
                let mut searcher = grep_searcher::SearcherBuilder::new()
                    .binary_detection(grep_searcher::BinaryDetection::quit(b'\x00'))
                    .line_number(true)
                    .build();
                Box::new(move |entry| {
                    let Ok(entry) = entry else {
                        return WalkState::Continue;
                    };
                    if !entry.file_type().map(|ft| ft.is_file()).unwrap_or(false)
                        || entry
                            .metadata()
                            .map(|metadata| metadata.len() > config::MAX_SEARCHABLE_FILE_BYTES)
                            .unwrap_or(true)
                    {
                        return WalkState::Continue;
                    }
                    {
                        let mut guard = state.lock();
                        if guard.results.len() >= max_hits
                            || guard.total_chars >= config::MAX_SEARCH_OUTPUT_CHARS
                        {
                            guard.truncated = true;
                            return WalkState::Quit;
                        }
                    }

                    let file_path = entry.path().to_path_buf();
                    let rel_path = fs_util::display_relative(root, &file_path);
                    let state = state.clone();
                    let sink = grep_searcher::sinks::UTF8(move |line_num, line| {
                        let mut guard = state.lock();
                        if guard.results.len() >= max_hits
                            || guard.total_chars >= config::MAX_SEARCH_OUTPUT_CHARS
                        {
                            guard.truncated = true;
                            return Ok(false);
                        }
                        let trimmed = line.trim();
                        let shown =
                            crate::util::truncate_chars(trimmed, config::MAX_SEARCH_LINE_CHARS);
                        let suffix = if shown.len() < trimmed.len() {
                            " …"
                        } else {
                            ""
                        };
                        let output = format!("{rel_path}:{line_num}: {shown}{suffix}");
                        guard.total_chars += output.chars().count() + 1;
                        guard.results.push((rel_path.clone(), line_num, output));
                        let continue_search = guard.results.len() < max_hits
                            && guard.total_chars < config::MAX_SEARCH_OUTPUT_CHARS;
                        if !continue_search {
                            guard.truncated = true;
                        }
                        Ok(continue_search)
                    });
                    let _ = searcher.search_path(matcher.as_ref(), &file_path, sink);
                    WalkState::Continue
                })
            });

        let (mut results, truncated) = {
            let mut guard = state.lock();
            (std::mem::take(&mut guard.results), guard.truncated)
        };
        results.sort_by(|left, right| left.0.cmp(&right.0).then(left.1.cmp(&right.1)));
        if results.is_empty() {
            Ok(format!("No matches found for pattern: '{query}'"))
        } else {
            let result_count = results.len();
            let mut out = results
                .into_iter()
                .map(|(_, _, line)| line)
                .collect::<Vec<_>>()
                .join("\n");
            if truncated || result_count >= max_hits {
                out.push_str("\n\n[results limited; narrow the pattern or pass path to search a subdirectory]");
            }
            Ok(out)
        }
    }
}
