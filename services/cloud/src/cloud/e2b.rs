use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use dashmap::DashMap;
use futures::StreamExt;
use orchharness::backend::{
    display_relative_str, normalize_workspace_subpath, CommandRegistry, CommandResult,
    CommandStatus, CommandTaskStatus, PathStat, WorkspaceOps,
};
use orchharness::config as hconfig;
use orchharness::error::{AppError, AppResult};
use reqwest::multipart::{Form, Part};
use reqwest::{Method, StatusCode};
use serde_json::{json, Value};
use tokio::sync::{Mutex, Notify, OwnedSemaphorePermit, Semaphore};
use tokio::task::JoinHandle;

use crate::cloud::github::is_valid_account_id;
use crate::cloud::store::{github_account_doc_id, workspace_doc_id};
use crate::cloud::workspace::CloudWorkspace;
use crate::shared::config::{self, Config};
use crate::shared::crypto;
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::firestore::FirestoreClient;
use crate::shared::util::now_ms;

const E2B_SERVICE: &str = "E2B sandbox";
const ENVD_USER: &str = "user";
const MAX_CONNECT_FRAME_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct SandboxConn {
    pub sandbox_id: String,
    pub domain: String,
    pub access_token: String,
}

impl SandboxConn {
    pub fn envd_url(&self, path: &str) -> String {
        format!(
            "https://{}-{}.{}{}",
            config::E2B_ENVD_PORT,
            self.sandbox_id,
            self.domain,
            path
        )
    }
}

#[derive(Debug, Clone)]
pub struct EnvdStat {
    pub name: String,
    pub is_file: bool,
    pub is_dir: bool,
    pub size: u64,
}

fn parse_u64(v: &Value) -> u64 {
    v.as_u64()
        .or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok()))
        .unwrap_or(0)
}

fn parse_entry(entry: &Value) -> EnvdStat {
    let kind = entry.get("type").and_then(Value::as_str).unwrap_or("");
    let is_dir = kind.contains("DIRECTORY") || kind.eq_ignore_ascii_case("directory");
    let is_file = !is_dir && (kind.contains("FILE") || kind.eq_ignore_ascii_case("file"));
    let name = entry
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let size = entry.get("size").map(parse_u64).unwrap_or(0);
    EnvdStat {
        name,
        is_file,
        is_dir,
        size,
    }
}

#[derive(Default)]
pub struct ConnectFrameDecoder {
    buf: Vec<u8>,
}

pub enum ConnectFrame {
    Message(Value),
    EndStream(Option<String>),
}

pub enum EnvdProcessEvent {
    Start { pid: u64 },
    Data {
        stdout: Option<Vec<u8>>,
        stderr: Option<Vec<u8>>,
        pty: Option<Vec<u8>>,
    },
    End { exit_code: i32 },
}

pub fn parse_process_event(value: &Value) -> Option<EnvdProcessEvent> {
    let event = value.get("event")?;
    if let Some(start) = event.get("start") {
        let pid = start.get("pid").map(parse_u64).filter(|pid| *pid > 0)?;
        return Some(EnvdProcessEvent::Start { pid });
    }
    if let Some(data) = event.get("data") {
        let decode = |key: &str| {
            data.get(key)
                .and_then(Value::as_str)
                .and_then(|encoded| STANDARD.decode(encoded).ok())
        };
        return Some(EnvdProcessEvent::Data {
            stdout: decode("stdout"),
            stderr: decode("stderr"),
            pty: decode("pty"),
        });
    }
    if let Some(end) = event.get("end") {
        let exit_code = end
            .get("exitCode")
            .and_then(Value::as_i64)
            .or_else(|| {
                end.get("exitCode")
                    .and_then(Value::as_str)
                    .and_then(|value| value.parse().ok())
            })
            .unwrap_or(0) as i32;
        return Some(EnvdProcessEvent::End { exit_code });
    }
    None
}

impl ConnectFrameDecoder {
    pub fn push(&mut self, chunk: &[u8]) {
        self.buf.extend_from_slice(chunk);
    }

    pub fn next_frame(&mut self) -> Result<Option<ConnectFrame>, String> {
        if self.buf.len() < 5 {
            return Ok(None);
        }
        let flags = self.buf[0];
        let len = u32::from_be_bytes([self.buf[1], self.buf[2], self.buf[3], self.buf[4]]) as usize;
        if len > MAX_CONNECT_FRAME_BYTES {
            return Err(format!(
                "connect frame size {len} exceeds maximum {MAX_CONNECT_FRAME_BYTES} bytes"
            ));
        }
        if self.buf.len() < 5 + len {
            return Ok(None);
        }
        let payload = self.buf[5..5 + len].to_vec();
        self.buf.drain(..5 + len);
        let val: Value = serde_json::from_slice(&payload)
            .map_err(|e| format!("invalid connect frame json: {e}"))?;
        if (flags & 2) != 0 {
            let err = val
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(Value::as_str)
                .map(str::to_string);
            Ok(Some(ConnectFrame::EndStream(err)))
        } else {
            Ok(Some(ConnectFrame::Message(val)))
        }
    }
}

#[derive(Default)]
pub struct CloudCommandManager {
    registry: CommandRegistry,
}

impl CloudCommandManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn mark_background(&self, task_id: &str) {
        self.registry.mark_background(task_id);
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

    pub fn spawn_task(
        &self,
        lease: Arc<SandboxLease>,
        command_str: &str,
        cwd: &str,
        run_id: &str,
        timeout_secs: u64,
    ) -> (String, Arc<Notify>) {
        let (task_id, handle, done, cancel_token) =
            self.registry.insert(command_str, run_id, false);

        let cmd_str = command_str.to_string();
        let cwd_str = cwd.to_string();
        let done_signal = done.clone();
        let clamped_timeout = timeout_secs.clamp(1, hconfig::TOOL_EXECUTION_TIMEOUT_SECS);

        tokio::spawn(async move {
            let manager = lease.manager.clone();
            let conn = lease.conn.clone();
            let deadline = tokio::time::Instant::now() + Duration::from_secs(clamped_timeout);
            let mut envs = HashMap::new();
            envs.insert("CI".to_string(), "1".to_string());
            envs.insert("TERM".to_string(), "dumb".to_string());
            envs.insert("NO_COLOR".to_string(), "1".to_string());

            let stream_res = manager
                .start_process_stream(
                    &conn,
                    "/bin/bash",
                    &["-lc", &cmd_str],
                    Some(&cwd_str),
                    Some(envs),
                    None,
                    false,
                )
                .await;

            match stream_res {
                Ok(resp) => {
                    let mut stream = resp.bytes_stream();
                    let mut decoder = ConnectFrameDecoder::default();
                    let mut pid: Option<u64> = None;

                    loop {
                        tokio::select! {
                            biased;
                            _ = cancel_token.cancelled() => {
                                if let Some(p) = pid {
                                    let _ = manager.send_signal(&conn, p, "SIGNAL_SIGKILL").await;
                                }
                                handle.set_cancelled();
                                break;
                            }
                            _ = tokio::time::sleep_until(deadline) => {
                                if let Some(p) = pid {
                                    let _ = manager.send_signal(&conn, p, "SIGNAL_SIGKILL").await;
                                }
                                handle.set_timed_out(&format!(
                                    "\ncommand timed out after {clamped_timeout}s\n"
                                ));
                                break;
                            }
                            next = stream.next() => {
                                match next {
                                    None => {
                                        handle.set_finished_default();
                                        break;
                                    }
                                    Some(Err(err)) => {
                                        handle.set_failed(&format!("\nstream error: {err}\n"));
                                        break;
                                    }
                                    Some(Ok(chunk)) => {
                                        decoder.push(&chunk);
                                        loop {
                                            match decoder.next_frame() {
                                                Ok(None) => break,
                                                Ok(Some(ConnectFrame::EndStream(Some(err)))) => {
                                                    handle.set_failed_if_running(&format!("\n{err}\n"));
                                                }
                                                Ok(Some(ConnectFrame::EndStream(None))) => {}
                                                Ok(Some(ConnectFrame::Message(val))) => {
                                                    if let Some(process_event) = parse_process_event(&val) {
                                                        match process_event {
                                                            EnvdProcessEvent::Start { pid: process_pid } => {
                                                                pid = Some(process_pid);
                                                            }
                                                            EnvdProcessEvent::Data { stdout, stderr, .. } => {
                                                                if let Some(out) = stdout {
                                                                    handle.push_stdout(&out);
                                                                }
                                                                if let Some(err) = stderr {
                                                                    handle.push_stderr(&err);
                                                                }
                                                            }
                                                            EnvdProcessEvent::End { exit_code } => {
                                                                handle.set_completed(exit_code);
                                                            }
                                                        }
                                                    }
                                                }
                                                Err(e) => {
                                                    handle.set_failed(&format!("\nframe decode error: {e}\n"));
                                                    break;
                                                }
                                            }
                                        }
                                        if !handle.is_running() {
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    handle.set_failed(&format!("spawn error: {}", e.message()));
                }
            }

            drop(lease);
            done_signal.notify_one();
        });

        (task_id, done)
    }
}

#[derive(Default)]
struct ManagedSandbox {
    conn: Option<SandboxConn>,
    user_id: String,
    github_account_id: String,
    repo_ready: bool,
    git_auth_token: String,
    active_leases: usize,
    idle_pause_task: Option<JoinHandle<()>>,
}

struct LeaseInner {
    manager: SandboxManager,
    doc_id: String,
    user_id: String,
    _permit: OwnedSemaphorePermit,
    _global_permit: OwnedSemaphorePermit,
}

impl Drop for LeaseInner {
    fn drop(&mut self) {
        let manager = self.manager.clone();
        let doc_id = self.doc_id.clone();
        let user_id = self.user_id.clone();
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            handle.spawn(async move {
                manager.release_lease(&doc_id, &user_id).await;
            });
        }
    }
}

#[derive(Clone)]
pub struct SandboxLease {
    pub manager: SandboxManager,
    pub conn: SandboxConn,
    _inner: Arc<LeaseInner>,
}

#[derive(Clone)]
pub struct SandboxManager {
    config: Arc<Config>,
    http: reqwest::Client,
    streaming_http: reqwest::Client,
    firestore: FirestoreClient,
    slots: Arc<DashMap<String, Arc<Mutex<ManagedSandbox>>>>,
    user_leases: Arc<DashMap<String, Arc<Semaphore>>>,
    global_leases: Arc<Semaphore>,
    pub cmd_mgr: Arc<CloudCommandManager>,
}

impl SandboxManager {
    pub fn new(
        config: Arc<Config>,
        http: reqwest::Client,
        streaming_http: reqwest::Client,
        firestore: FirestoreClient,
    ) -> Self {
        Self {
            config,
            http,
            streaming_http,
            firestore,
            slots: Arc::new(DashMap::new()),
            user_leases: Arc::new(DashMap::new()),
            global_leases: Arc::new(Semaphore::new(config::MAX_SANDBOX_LEASES_TOTAL)),
            cmd_mgr: Arc::new(CloudCommandManager::new()),
        }
    }

    fn slot_for(&self, doc_id: &str) -> Arc<Mutex<ManagedSandbox>> {
        self.slots
            .entry(doc_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(ManagedSandbox::default())))
            .clone()
    }

    fn user_semaphore(&self, user_id: &str) -> Arc<Semaphore> {
        self.user_leases
            .entry(user_id.to_string())
            .or_insert_with(|| Arc::new(Semaphore::new(config::MAX_SANDBOX_LEASES_PER_USER)))
            .clone()
    }

    pub async fn acquire(
        &self,
        user_id: &str,
        workspace: &CloudWorkspace,
    ) -> ApiResult<SandboxLease> {
        let doc_id = workspace_doc_id(user_id, &workspace.uri);
        let mut record = self
            .firestore
            .get_workspace(&doc_id)
            .await?
            .filter(|rec| rec.user_id == user_id)
            .ok_or_else(|| {
                ApiError::not_found("Project not found. Open or create a GitHub project first.")
            })?;
        if !is_valid_account_id(&record.github_account_id) {
            return Err(ApiError::forbidden(
                "GitHub account is disconnected. Reconnect or re-open this project with a connected GitHub account.",
            )
            .with_code("GITHUB_RECONNECT_REQUIRED"));
        }
        let account_doc_id = github_account_doc_id(user_id, &record.github_account_id);
        let account = self
            .firestore
            .get_github_account(&account_doc_id)
            .await?
            .filter(|acc| acc.user_id == user_id)
            .ok_or_else(|| {
                ApiError::forbidden(
                    "GitHub account is disconnected. Reconnect your GitHub account to use this workspace.",
                )
                .with_code("GITHUB_RECONNECT_REQUIRED")
            })?;
        let token = crypto::open_token(
            &self.config.github.token_key,
            &format!("{user_id}\0{}", account.github_id),
            &account.token_ciphertext,
        )
        .map_err(|_| {
            ApiError::forbidden(format!(
                "GitHub authorization for @{} needs to be reconnected.",
                account.login
            ))
            .with_code("GITHUB_RECONNECT_REQUIRED")
        })?;

        let permit = self
            .user_semaphore(user_id)
            .acquire_owned()
            .await
            .map_err(|_| ApiError::unavailable("Sandbox capacity is unavailable"))?;
        let global_permit = self
            .global_leases
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| ApiError::unavailable("Sandbox capacity is unavailable"))?;
        let slot = self.slot_for(&doc_id);
        let mut guard = slot.lock().await;

        if let Some(handle) = guard.idle_pause_task.take() {
            handle.abort();
        }

        let mut conn = None;
        if let Some(existing) = &guard.conn {
            if self.health(existing).await {
                conn = Some(existing.clone());
            } else {
                guard.conn = None;
                guard.repo_ready = false;
                guard.git_auth_token.clear();
            }
        }

        if conn.is_none() && !record.sandbox_id.is_empty() {
            if let Some(resumed) = self.connect_sandbox(&record.sandbox_id).await? {
                record.domain = resumed.domain.clone();
                record.envd_access_token = resumed.access_token.clone();
                record.updated_at = now_ms();
                let _ = self.firestore.upsert_workspace(&record).await;
                conn = Some(resumed);
            }
        }

        if conn.is_none() {
            let created = self.create_sandbox(user_id, &workspace.uri).await?;
            record.sandbox_id = created.sandbox_id.clone();
            record.domain = created.domain.clone();
            record.envd_access_token = created.access_token.clone();
            record.updated_at = now_ms();
            self.firestore
                .upsert_workspace(&record)
                .await
                .map_err(ApiError::internal)?;
            guard.repo_ready = false;
            guard.git_auth_token.clear();
            conn = Some(created);
        }

        let conn = conn.expect("sandbox connection resolved");
        if guard.git_auth_token != token {
            let git_name = if account.name.trim().is_empty() {
                account.login.as_str()
            } else {
                account.name.as_str()
            };
            self.configure_git_auth(&conn, &token, git_name, &account.email)
                .await?;
            guard.git_auth_token = token;
        }
        if !guard.repo_ready {
            self.ensure_repo_cloned(&conn, workspace).await?;
            guard.repo_ready = true;
        }

        guard.conn = Some(conn.clone());
        guard.user_id = user_id.to_string();
        guard.github_account_id = account.github_id.clone();
        guard.active_leases += 1;

        Ok(SandboxLease {
            manager: self.clone(),
            conn,
            _inner: Arc::new(LeaseInner {
                manager: self.clone(),
                doc_id,
                user_id: user_id.to_string(),
                _permit: permit,
                _global_permit: global_permit,
            }),
        })
    }

    async fn clear_git_token(&self, conn: &SandboxConn) {
        let _ = self
            .run_oneshot(
                conn,
                "/bin/bash",
                &["-c", "rm -f /home/user/.orch-git-token"],
                None,
                None,
                5,
            )
            .await;
    }

    pub async fn invalidate_github_account(&self, user_id: &str, github_account_id: &str) {
        let slots: Vec<Arc<Mutex<ManagedSandbox>>> =
            self.slots.iter().map(|e| e.value().clone()).collect();
        for slot in slots {
            let mut guard = slot.lock().await;
            if guard.user_id == user_id && guard.github_account_id == github_account_id {
                guard.git_auth_token.clear();
                if let Some(conn) = guard.conn.clone() {
                    self.clear_git_token(&conn).await;
                }
            }
        }
    }

    pub async fn destroy_workspace(&self, doc_id: &str, stored_sandbox_id: &str) -> ApiResult<()> {
        let mut active_sandbox_id = stored_sandbox_id.to_string();
        if let Some((_, slot)) = self.slots.remove(doc_id) {
            let mut guard = slot.lock().await;
            if let Some(handle) = guard.idle_pause_task.take() {
                handle.abort();
            }
            if let Some(conn) = guard.conn.take() {
                active_sandbox_id = conn.sandbox_id;
            }
            guard.repo_ready = false;
            guard.git_auth_token.clear();
        }
        if !active_sandbox_id.is_empty() {
            self.delete_sandbox(&active_sandbox_id).await?;
        }
        Ok(())
    }

    async fn release_lease(&self, doc_id: &str, user_id: &str) {
        self.user_leases.remove_if(user_id, |_, sem| {
            Arc::strong_count(sem) == 1
                && sem.available_permits() == config::MAX_SANDBOX_LEASES_PER_USER
        });

        let Some(slot) = self.slots.get(doc_id).map(|e| e.value().clone()) else {
            return;
        };
        let mut guard = slot.lock().await;
        guard.active_leases = guard.active_leases.saturating_sub(1);
        if guard.active_leases > 0 {
            return;
        }
        if let Some(prev) = guard.idle_pause_task.take() {
            prev.abort();
        }
        let Some(conn) = guard.conn.clone() else {
            return;
        };
        let manager = self.clone();
        let doc = doc_id.to_string();
        guard.idle_pause_task = Some(tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(config::E2B_IDLE_PAUSE_SECS)).await;
            let Some(slot) = manager.slots.get(&doc).map(|e| e.value().clone()) else {
                return;
            };
            let mut remove_slot = false;
            {
                let mut guard = slot.lock().await;
                if guard.active_leases == 0 {
                    manager.clear_git_token(&conn).await;
                    if let Err(err) = manager.pause_sandbox(&conn.sandbox_id).await {
                        tracing::warn!(sandbox_id = %conn.sandbox_id, error = %err.message(), "failed to pause idle E2B sandbox");
                    }
                    guard.conn = None;
                    guard.repo_ready = false;
                    guard.git_auth_token.clear();
                    guard.idle_pause_task = None;
                    remove_slot = Arc::strong_count(&slot) == 2;
                }
            }
            if remove_slot {
                manager
                    .slots
                    .remove_if(&doc, |_, existing| Arc::ptr_eq(existing, &slot));
            }
        }));
    }

    pub async fn pause_all_active(&self) {
        let slots: Vec<Arc<Mutex<ManagedSandbox>>> =
            self.slots.iter().map(|e| e.value().clone()).collect();
        let mut conns = Vec::new();
        for slot in slots {
            let mut guard = slot.lock().await;
            if let Some(handle) = guard.idle_pause_task.take() {
                handle.abort();
            }
            if let Some(conn) = guard.conn.take() {
                guard.repo_ready = false;
                guard.git_auth_token.clear();
                conns.push(conn);
            }
        }
        let mut tasks = tokio::task::JoinSet::new();
        for conn in conns {
            let manager = self.clone();
            tasks.spawn(async move {
                let _ = tokio::time::timeout(Duration::from_secs(15), async {
                    manager.clear_git_token(&conn).await;
                    let _ = manager.pause_sandbox(&conn.sandbox_id).await;
                })
                .await;
            });
        }
        while tasks.join_next().await.is_some() {}
    }

    async fn configure_git_auth(
        &self,
        conn: &SandboxConn,
        token: &str,
        git_name: &str,
        git_email: &str,
    ) -> ApiResult<()> {
        let helper_script = "#!/bin/sh\necho username=x-access-token\nprintf 'password='\ncat /home/user/.orch-git-token\nprintf '\\n'\n";
        self.write_bytes(conn, "/home/user/.orch-git-token", token.as_bytes())
            .await?;
        self.write_bytes(conn, "/home/user/.orch-git-cred", helper_script.as_bytes())
            .await?;
        let mut envs = HashMap::new();
        envs.insert("GIT_AUTHOR_NAME".to_string(), git_name.to_string());
        envs.insert("GIT_AUTHOR_EMAIL".to_string(), git_email.to_string());
        let script = r#"chmod 600 /home/user/.orch-git-token && chmod 700 /home/user/.orch-git-cred && git config --global credential.https://github.com.helper /home/user/.orch-git-cred && git config --global user.name "$GIT_AUTHOR_NAME" && ([ -z "$GIT_AUTHOR_EMAIL" ] || git config --global user.email "$GIT_AUTHOR_EMAIL")"#;
        let (code, _out, err) = self
            .run_oneshot(conn, "/bin/bash", &["-c", script], None, Some(envs), 30)
            .await?;
        if code != 0 {
            return Err(ApiError::bad_gateway(format!(
                "Failed to configure GitHub credentials in sandbox: {}",
                err.trim()
            )));
        }
        Ok(())
    }

    async fn ensure_repo_cloned(
        &self,
        conn: &SandboxConn,
        workspace: &CloudWorkspace,
    ) -> ApiResult<()> {
        let git_dir = format!("{}/.git", workspace.repo_dir);
        if self.stat(conn, &git_dir).await?.is_some() {
            let _ = self.make_dir(conn, config::UPLOAD_DIR).await;
            return Ok(());
        }
        let mut envs = HashMap::new();
        envs.insert("REPO_URL".to_string(), workspace.repo_url.clone());
        envs.insert("REPO_DIR".to_string(), workspace.repo_dir.clone());
        envs.insert("WS_ROOT".to_string(), config::WORKSPACE_ROOT.to_string());
        envs.insert("UPLOAD_DIR".to_string(), config::UPLOAD_DIR.to_string());
        envs.insert("GIT_TERMINAL_PROMPT".to_string(), "0".to_string());
        let script = r#"mkdir -p "$WS_ROOT" "$UPLOAD_DIR" && git clone --depth 1 "$REPO_URL" "$REPO_DIR""#;
        let (code, _out, err) = self
            .run_oneshot(conn, "/bin/bash", &["-c", script], None, Some(envs), 120)
            .await?;
        if code != 0 {
            let detail = err.trim();
            return Err(ApiError::bad_request(if detail.is_empty() {
                format!("Failed to clone repository {}", workspace.repo_url)
            } else {
                format!("Failed to clone repository {}: {detail}", workspace.repo_url)
            }));
        }
        Ok(())
    }

    pub async fn inspect_environment(&self, conn: &SandboxConn, repo_dir: &str) -> String {
        let mut envs = HashMap::new();
        envs.insert("REPO_DIR".to_string(), repo_dir.to_string());
        let script = r#"cd "$REPO_DIR" 2>/dev/null || exit 0; echo "Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"; ls -1A --group-directories-first | head -n 40"#;
        match self
            .run_oneshot(conn, "/bin/bash", &["-c", script], Some(repo_dir), Some(envs), 10)
            .await
        {
            Ok((0, out, _)) if !out.trim().is_empty() => format!(
                "Sandbox Environment (Linux / E2B)\nUploads directory: {}\n{}",
                config::UPLOAD_DIR,
                out.trim()
            ),
            _ => format!(
                "Sandbox Environment (Linux / E2B)\nUploads directory: {}",
                config::UPLOAD_DIR
            ),
        }
    }

    async fn create_sandbox(&self, user_id: &str, workspace_uri: &str) -> ApiResult<SandboxConn> {
        let resp = self
            .http
            .post(format!("{}/sandboxes", config::E2B_API_BASE))
            .header("X-API-Key", &self.config.e2b_api_key)
            .json(&json!({
                "templateID": self.config.e2b_template_id,
                "timeout": config::E2B_SANDBOX_TIMEOUT_SECS,
                "autoPause": true,
                "metadata": {
                    "userId": user_id,
                    "workspace": workspace_uri,
                }
            }))
            .timeout(Duration::from_secs(config::E2B_REQUEST_TIMEOUT_SECS))
            .send()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let status = resp.status();
        if !status.is_success() {
            let detail = resp.text().await.unwrap_or_default();
            return Err(ApiError::upstream_failure(
                E2B_SERVICE,
                status.as_u16(),
                &detail,
            ));
        }
        let body: Value = resp
            .json()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let sandbox_id = body
            .get("sandboxID")
            .and_then(Value::as_str)
            .ok_or_else(|| ApiError::bad_gateway("E2B create response missing sandboxID"))?
            .to_string();
        let domain = body
            .get("domain")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or(&self.config.e2b_domain)
            .to_string();
        let access_token = body
            .get("envdAccessToken")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        Ok(SandboxConn {
            sandbox_id,
            domain,
            access_token,
        })
    }

    async fn connect_sandbox(&self, sandbox_id: &str) -> ApiResult<Option<SandboxConn>> {
        let resp = self
            .http
            .post(format!(
                "{}/sandboxes/{sandbox_id}/connect",
                config::E2B_API_BASE
            ))
            .header("X-API-Key", &self.config.e2b_api_key)
            .json(&json!({ "timeout": config::E2B_SANDBOX_TIMEOUT_SECS }))
            .timeout(Duration::from_secs(config::E2B_REQUEST_TIMEOUT_SECS))
            .send()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let status = resp.status();
        if status == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !status.is_success() {
            let detail = resp.text().await.unwrap_or_default();
            return Err(ApiError::upstream_failure(
                E2B_SERVICE,
                status.as_u16(),
                &detail,
            ));
        }
        let body: Value = resp
            .json()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let domain = body
            .get("domain")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or(&self.config.e2b_domain)
            .to_string();
        let access_token = body
            .get("envdAccessToken")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        Ok(Some(SandboxConn {
            sandbox_id: sandbox_id.to_string(),
            domain,
            access_token,
        }))
    }

    async fn pause_sandbox(&self, sandbox_id: &str) -> ApiResult<()> {
        let resp = self
            .http
            .post(format!(
                "{}/sandboxes/{sandbox_id}/pause",
                config::E2B_API_BASE
            ))
            .header("X-API-Key", &self.config.e2b_api_key)
            .timeout(Duration::from_secs(config::E2B_REQUEST_TIMEOUT_SECS))
            .send()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let status = resp.status();
        if status.is_success()
            || status == StatusCode::NOT_FOUND
            || status == StatusCode::CONFLICT
        {
            return Ok(());
        }
        let detail = resp.text().await.unwrap_or_default();
        Err(ApiError::upstream_failure(
            E2B_SERVICE,
            status.as_u16(),
            &detail,
        ))
    }

    async fn delete_sandbox(&self, sandbox_id: &str) -> ApiResult<()> {
        let resp = self
            .http
            .delete(format!(
                "{}/sandboxes/{sandbox_id}",
                config::E2B_API_BASE
            ))
            .header("X-API-Key", &self.config.e2b_api_key)
            .timeout(Duration::from_secs(config::E2B_REQUEST_TIMEOUT_SECS))
            .send()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let status = resp.status();
        if status.is_success() || status == StatusCode::NOT_FOUND {
            return Ok(());
        }
        let detail = resp.text().await.unwrap_or_default();
        Err(ApiError::upstream_failure(
            E2B_SERVICE,
            status.as_u16(),
            &detail,
        ))
    }

    fn envd_request(
        &self,
        client: &reqwest::Client,
        method: Method,
        conn: &SandboxConn,
        path: &str,
    ) -> reqwest::RequestBuilder {
        let mut req = client.request(method, conn.envd_url(path));
        if !conn.access_token.is_empty() {
            req = req.header("X-Access-Token", &conn.access_token);
        }
        req
    }

    pub async fn health(&self, conn: &SandboxConn) -> bool {
        matches!(
            self.envd_request(&self.http, Method::GET, conn, "/health")
                .timeout(Duration::from_secs(5))
                .send()
                .await,
            Ok(resp) if resp.status().is_success()
        )
    }

    async fn rpc_unary(&self, conn: &SandboxConn, procedure: &str, body: Value) -> ApiResult<Value> {
        let resp = self
            .envd_request(&self.http, Method::POST, conn, procedure)
            .header("Connect-Protocol-Version", "1")
            .json(&body)
            .timeout(Duration::from_secs(config::E2B_REQUEST_TIMEOUT_SECS))
            .send()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(ApiError::upstream_failure(
                E2B_SERVICE,
                status.as_u16(),
                &text,
            ));
        }
        if text.trim().is_empty() {
            return Ok(json!({}));
        }
        serde_json::from_str(&text)
            .map_err(|e| ApiError::bad_gateway(format!("E2B RPC invalid JSON: {e}")))
    }

    pub async fn stat(&self, conn: &SandboxConn, path: &str) -> ApiResult<Option<EnvdStat>> {
        let resp = self
            .envd_request(&self.http, Method::POST, conn, "/filesystem.Filesystem/Stat")
            .header("Connect-Protocol-Version", "1")
            .json(&json!({ "path": path }))
            .timeout(Duration::from_secs(config::E2B_REQUEST_TIMEOUT_SECS))
            .send()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if status == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let body: Value = if text.trim().is_empty() {
            Value::Null
        } else {
            serde_json::from_str(&text)
                .map_err(|e| ApiError::bad_gateway(format!("E2B stat invalid JSON: {e}")))?
        };
        if !status.is_success() {
            if body.get("code").and_then(Value::as_str) == Some("not_found") {
                return Ok(None);
            }
            return Err(ApiError::upstream_failure(
                E2B_SERVICE,
                status.as_u16(),
                &text,
            ));
        }
        Ok(body.get("entry").map(parse_entry))
    }

    pub async fn list_dir(
        &self,
        conn: &SandboxConn,
        path: &str,
        depth: u32,
    ) -> ApiResult<Vec<EnvdStat>> {
        let body = self
            .rpc_unary(
                conn,
                "/filesystem.Filesystem/ListDir",
                json!({ "path": path, "depth": depth }),
            )
            .await?;
        Ok(body
            .get("entries")
            .and_then(Value::as_array)
            .map(|items| items.iter().map(parse_entry).collect())
            .unwrap_or_default())
    }

    pub async fn make_dir(&self, conn: &SandboxConn, path: &str) -> ApiResult<()> {
        let resp = self
            .envd_request(
                &self.http,
                Method::POST,
                conn,
                "/filesystem.Filesystem/MakeDir",
            )
            .header("Connect-Protocol-Version", "1")
            .json(&json!({ "path": path }))
            .timeout(Duration::from_secs(config::E2B_REQUEST_TIMEOUT_SECS))
            .send()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let status = resp.status();
        if status.is_success() {
            return Ok(());
        }
        let text = resp.text().await.unwrap_or_default();
        if let Ok(val) = serde_json::from_str::<Value>(&text) {
            if val.get("code").and_then(Value::as_str) == Some("already_exists") {
                return Ok(());
            }
        }
        Err(ApiError::upstream_failure(
            E2B_SERVICE,
            status.as_u16(),
            &text,
        ))
    }

    pub async fn read_bytes(&self, conn: &SandboxConn, path: &str) -> ApiResult<Vec<u8>> {
        let resp = self
            .envd_request(&self.http, Method::GET, conn, "/files")
            .query(&[("path", path), ("username", ENVD_USER)])
            .timeout(Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let status = resp.status();
        if status == StatusCode::NOT_FOUND {
            return Err(ApiError::not_found(format!("not found: {path}")));
        }
        if !status.is_success() {
            let detail = resp.text().await.unwrap_or_default();
            return Err(ApiError::upstream_failure(
                E2B_SERVICE,
                status.as_u16(),
                &detail,
            ));
        }
        resp.bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))
    }

    pub async fn read_bytes_prefix(
        &self,
        conn: &SandboxConn,
        path: &str,
        max_bytes: usize,
    ) -> ApiResult<(Vec<u8>, bool)> {
        let resp = self
            .envd_request(&self.http, Method::GET, conn, "/files")
            .query(&[("path", path), ("username", ENVD_USER)])
            .timeout(Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let status = resp.status();
        if status == StatusCode::NOT_FOUND {
            return Err(ApiError::not_found(format!("not found: {path}")));
        }
        if !status.is_success() {
            let detail = resp.text().await.unwrap_or_default();
            return Err(ApiError::upstream_failure(
                E2B_SERVICE,
                status.as_u16(),
                &detail,
            ));
        }
        let mut stream = resp.bytes_stream();
        let mut buf = Vec::new();
        let mut truncated = false;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
            buf.extend_from_slice(&chunk);
            if buf.len() > max_bytes {
                truncated = true;
                break;
            }
        }
        Ok((buf, truncated))
    }

    pub async fn write_bytes(&self, conn: &SandboxConn, path: &str, bytes: &[u8]) -> ApiResult<()> {
        if let Some((parent, _)) = path.rsplit_once('/') {
            if !parent.is_empty() {
                self.make_dir(conn, parent).await?;
            }
        }
        let filename = path.rsplit('/').next().unwrap_or("file").to_string();
        let form = Form::new().part("file", Part::bytes(bytes.to_vec()).file_name(filename));
        let resp = self
            .envd_request(&self.http, Method::POST, conn, "/files")
            .query(&[("path", path), ("username", ENVD_USER)])
            .multipart(form)
            .timeout(Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let status = resp.status();
        if !status.is_success() {
            let detail = resp.text().await.unwrap_or_default();
            return Err(ApiError::upstream_failure(
                E2B_SERVICE,
                status.as_u16(),
                &detail,
            ));
        }
        Ok(())
    }

    pub async fn start_process_stream(
        &self,
        conn: &SandboxConn,
        cmd: &str,
        args: &[&str],
        cwd: Option<&str>,
        envs: Option<HashMap<String, String>>,
        pty_size: Option<(u16, u16)>,
        stdin: bool,
    ) -> ApiResult<reqwest::Response> {
        let mut process = json!({
            "cmd": cmd,
            "args": args,
        });
        if let Some(dir) = cwd {
            process["cwd"] = json!(dir);
        }
        if let Some(env_map) = envs {
            process["envs"] = json!(env_map);
        }
        let mut payload = json!({
            "process": process,
            "stdin": stdin,
        });
        if let Some((cols, rows)) = pty_size {
            payload["pty"] = json!({ "size": { "cols": cols, "rows": rows } });
        }
        let json_bytes = serde_json::to_vec(&payload)
            .map_err(|e| ApiError::internal(format!("serialize process start failed: {e}")))?;
        let mut framed = Vec::with_capacity(5 + json_bytes.len());
        framed.push(0);
        framed.extend_from_slice(&(json_bytes.len() as u32).to_be_bytes());
        framed.extend_from_slice(&json_bytes);

        let resp = self
            .envd_request(
                &self.streaming_http,
                Method::POST,
                conn,
                "/process.Process/Start",
            )
            .header("Connect-Protocol-Version", "1")
            .header("Content-Type", "application/connect+json")
            .body(framed)
            .send()
            .await
            .map_err(|e| ApiError::unreachable(E2B_SERVICE, e))?;
        let status = resp.status();
        if !status.is_success() {
            let detail = resp.text().await.unwrap_or_default();
            return Err(ApiError::upstream_failure(
                E2B_SERVICE,
                status.as_u16(),
                &detail,
            ));
        }
        Ok(resp)
    }

    pub async fn send_signal(&self, conn: &SandboxConn, pid: u64, signal: &str) -> ApiResult<()> {
        let _ = self
            .rpc_unary(
                conn,
                "/process.Process/SendSignal",
                json!({ "process": { "pid": pid }, "signal": signal }),
            )
            .await?;
        Ok(())
    }

    pub async fn send_input_pty(&self, conn: &SandboxConn, pid: u64, data: &[u8]) -> ApiResult<()> {
        let _ = self
            .rpc_unary(
                conn,
                "/process.Process/SendInput",
                json!({
                    "process": { "pid": pid },
                    "input": { "pty": STANDARD.encode(data) }
                }),
            )
            .await?;
        Ok(())
    }

    pub async fn update_pty(
        &self,
        conn: &SandboxConn,
        pid: u64,
        cols: u16,
        rows: u16,
    ) -> ApiResult<()> {
        let _ = self
            .rpc_unary(
                conn,
                "/process.Process/Update",
                json!({
                    "process": { "pid": pid },
                    "pty": { "size": { "cols": cols, "rows": rows } }
                }),
            )
            .await?;
        Ok(())
    }

    pub async fn run_oneshot(
        &self,
        conn: &SandboxConn,
        cmd: &str,
        args: &[&str],
        cwd: Option<&str>,
        envs: Option<HashMap<String, String>>,
        timeout_secs: u64,
    ) -> ApiResult<(i32, String, String)> {
        let resp = self
            .start_process_stream(conn, cmd, args, cwd, envs, None, false)
            .await?;
        let mut stream = resp.bytes_stream();
        let mut decoder = ConnectFrameDecoder::default();
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let mut exit_code: Option<i32> = None;
        let mut pid: Option<u64> = None;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(timeout_secs);

        loop {
            tokio::select! {
                _ = tokio::time::sleep_until(deadline) => {
                    if let Some(p) = pid {
                        let _ = self.send_signal(conn, p, "SIGNAL_SIGKILL").await;
                    }
                    return Err(ApiError::gateway_timeout(format!(
                        "sandbox command timed out after {timeout_secs}s"
                    )));
                }
                next = stream.next() => {
                    match next {
                        None => break,
                        Some(Err(e)) => return Err(ApiError::unreachable(E2B_SERVICE, e)),
                        Some(Ok(chunk)) => {
                            decoder.push(&chunk);
                            loop {
                                match decoder.next_frame() {
                                    Ok(None) => break,
                                    Ok(Some(ConnectFrame::EndStream(Some(err)))) => {
                                        return Err(ApiError::bad_gateway(err));
                                    }
                                    Ok(Some(ConnectFrame::EndStream(None))) => {}
                                    Ok(Some(ConnectFrame::Message(val))) => {
                                        if let Some(process_event) = parse_process_event(&val) {
                                            match process_event {
                                                EnvdProcessEvent::Start { pid: process_pid } => {
                                                    pid = Some(process_pid);
                                                }
                                                EnvdProcessEvent::Data { stdout: out, stderr: err, .. } => {
                                                    if let Some(out) = out {
                                                        stdout.extend_from_slice(&out);
                                                    }
                                                    if let Some(err) = err {
                                                        stderr.extend_from_slice(&err);
                                                    }
                                                }
                                                EnvdProcessEvent::End { exit_code: code } => {
                                                    exit_code = Some(code);
                                                }
                                            }
                                        }
                                    }
                                    Err(e) => return Err(ApiError::bad_gateway(e)),
                                }
                            }
                            if exit_code.is_some() {
                                break;
                            }
                        }
                    }
                }
            }
        }

        Ok((
            exit_code.unwrap_or(0),
            String::from_utf8_lossy(&stdout).into_owned(),
            String::from_utf8_lossy(&stderr).into_owned(),
        ))
    }
}

pub struct CloudWorkspaceOps {
    pub lease: Arc<SandboxLease>,
    pub repo_dir: String,
    pub cmd_mgr: Arc<CloudCommandManager>,
}

fn map_api_err(e: ApiError) -> AppError {
    AppError::other(e.message().to_string())
}

#[async_trait]
impl WorkspaceOps for CloudWorkspaceOps {
    fn root(&self) -> Option<String> {
        Some(self.repo_dir.clone())
    }

    fn resolve_in_workspace(&self, input: &str) -> AppResult<String> {
        normalize_workspace_subpath(&self.repo_dir, input)
    }

    fn display_relative(&self, path: &str) -> String {
        display_relative_str(&self.repo_dir, path)
    }

    async fn stat(&self, abs_path: &str) -> AppResult<PathStat> {
        let Some(entry) = self
            .lease
            .manager
            .stat(&self.lease.conn, abs_path)
            .await
            .map_err(map_api_err)?
        else {
            return Ok(PathStat::default());
        };
        Ok(PathStat {
            exists: true,
            is_file: entry.is_file,
            is_dir: entry.is_dir,
            size: entry.size,
        })
    }

    async fn read_bytes(&self, abs_path: &str, max_bytes: Option<u64>) -> AppResult<Vec<u8>> {
        if let Some(limit) = max_bytes {
            let (bytes, truncated) = self
                .lease
                .manager
                .read_bytes_prefix(&self.lease.conn, abs_path, limit as usize)
                .await
                .map_err(map_api_err)?;
            if truncated {
                return Err(AppError::other(format!(
                    "file too large (over {} bytes): {abs_path}",
                    limit
                )));
            }
            return Ok(bytes);
        }
        self.lease
            .manager
            .read_bytes(&self.lease.conn, abs_path)
            .await
            .map_err(map_api_err)
    }

    async fn write_bytes(&self, abs_path: &str, bytes: &[u8]) -> AppResult<()> {
        self.lease
            .manager
            .write_bytes(&self.lease.conn, abs_path, bytes)
            .await
            .map_err(map_api_err)
    }

    async fn list_dir(&self, abs_dir: &str) -> AppResult<Vec<String>> {
        let Some(st) = self
            .lease
            .manager
            .stat(&self.lease.conn, abs_dir)
            .await
            .map_err(map_api_err)?
        else {
            return Err(AppError::other(format!("path file://{abs_dir} does not exist")));
        };
        if !st.is_dir {
            return Err(AppError::other(format!("path file://{abs_dir} is not a directory")));
        }
        let mut entries = self
            .lease
            .manager
            .list_dir(&self.lease.conn, abs_dir, 1)
            .await
            .map_err(map_api_err)?;
        entries.sort_by(|a, b| a.name.cmp(&b.name));
        let mut lines = Vec::new();
        for entry in entries {
            if entry.is_dir && hconfig::SKIP_DIRS.contains(&entry.name.as_str()) {
                continue;
            }
            if lines.len() >= hconfig::MAX_DIR_ENTRIES {
                lines.push("... (truncated, too many entries)".to_string());
                break;
            }
            if entry.is_dir {
                lines.push(format!("{}/", entry.name));
            } else {
                lines.push(entry.name);
            }
        }
        Ok(lines)
    }

    async fn search_workspace(
        &self,
        abs_path: &str,
        query: &str,
        max_hits: usize,
    ) -> AppResult<String> {
        let rel_path = abs_path
            .strip_prefix(&format!("{}/", self.repo_dir))
            .or_else(|| abs_path.strip_prefix(&self.repo_dir))
            .unwrap_or(abs_path)
            .trim_start_matches('/');

        let search_target = if rel_path.is_empty() || rel_path == "." {
            "."
        } else {
            rel_path
        };

        let mut args = vec![
            "--no-heading".to_string(),
            "--with-filename".to_string(),
            "--line-number".to_string(),
            "--ignore-case".to_string(),
            "--hidden".to_string(),
            "--color=never".to_string(),
        ];
        for skipped in hconfig::SKIP_DIRS {
            args.push("--glob".to_string());
            args.push(format!("!{skipped}/**"));
        }
        args.push("--".to_string());
        args.push(query.to_string());
        args.push(search_target.to_string());

        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let (code, stdout, stderr) = self
            .lease
            .manager
            .run_oneshot(
                &self.lease.conn,
                "rg",
                &arg_refs,
                Some(&self.repo_dir),
                None,
                60,
            )
            .await
            .map_err(map_api_err)?;
        if code != 0 && code != 1 {
            return Err(AppError::other(stderr.trim().to_string()));
        }

        let mut lines = Vec::new();
        let mut total_chars = 0usize;
        let mut truncated = false;
        for raw in stdout.lines() {
            let Some((path, rest)) = raw.split_once(':') else {
                continue;
            };
            let Some((line_number, text)) = rest.split_once(':') else {
                continue;
            };
            let relative = path
                .strip_prefix("./")
                .unwrap_or(path)
                .strip_prefix(&format!("{}/", self.repo_dir))
                .unwrap_or_else(|| path.strip_prefix("./").unwrap_or(path));
            let trimmed = text.trim();
            let shown = orchharness::util::truncate_chars(trimmed, hconfig::MAX_SEARCH_LINE_CHARS);
            let suffix = if shown.len() < trimmed.len() { " …" } else { "" };
            let rendered = format!("{relative}:{line_number}: {shown}{suffix}");
            if lines.len() >= max_hits
                || total_chars + rendered.chars().count() + 1 > hconfig::MAX_SEARCH_OUTPUT_CHARS
            {
                truncated = true;
                break;
            }
            total_chars += rendered.chars().count() + 1;
            lines.push(rendered);
        }
        if lines.is_empty() {
            return Ok(format!("No matches found for pattern: '{query}'"));
        }
        let mut output = lines.join("\n");
        if truncated || lines.len() >= max_hits {
            output.push_str("\n\n[results limited; narrow the pattern or pass path to search a subdirectory]");
        }
        Ok(output)
    }

    async fn execute_bash(
        &self,
        command: &str,
        cwd: &str,
        wait_ms: u64,
        timeout_secs: u64,
        run_id: &str,
    ) -> AppResult<CommandResult> {
        let st = self.stat(cwd).await?;
        if !st.is_dir {
            return Err(AppError::other(format!("cwd is not a directory: {cwd}")));
        }
        let (task_id, done) = self.cmd_mgr.spawn_task(
            self.lease.clone(),
            command,
            cwd,
            run_id,
            timeout_secs,
        );
        let notified = done.notified();
        tokio::pin!(notified);
        if tokio::time::timeout(Duration::from_millis(wait_ms), notified)
            .await
            .is_err()
        {
            self.cmd_mgr.mark_background(&task_id);
            let partial = self.cmd_mgr.get_status(&task_id);
            return Ok(CommandResult {
                status: CommandStatus::Running,
                exit_code: None,
                stdout: partial.as_ref().map(|s| s.stdout.clone()).unwrap_or_default(),
                stderr: partial.as_ref().map(|s| s.stderr.clone()).unwrap_or_default(),
                background_task_id: Some(task_id),
            });
        }
        let status = self
            .cmd_mgr
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
        self.cmd_mgr
            .get_status(task_id)
            .ok_or_else(|| AppError::other(format!("task_id '{task_id}' not found")))
    }

    async fn stop_command(&self, task_id: &str) -> AppResult<bool> {
        Ok(self.cmd_mgr.kill_task(task_id))
    }

    async fn cancel_run_commands(&self, run_id: &str) {
        self.cmd_mgr.kill_for_run(run_id);
    }

    async fn cleanup_foreground_commands(&self, run_id: &str) {
        self.cmd_mgr.kill_foreground_for_run(run_id);
    }
}
