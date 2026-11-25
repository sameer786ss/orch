use std::io;
use std::sync::Arc;

use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use futures::stream::{self, StreamExt, TryStreamExt};
use gcp_auth::TokenProvider;
use orchharness::backend::SessionStore;
use orchharness::error::{AppError, AppResult};
use orchharness::persistence::{
    ChatEvent, HistoryUserPart, SessionRecord, SessionRecordPage, SessionSnapshot, SessionSummary,
    TurnUsage,
};
use reqwest::StatusCode;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Map, Value};
use tokio::sync::Mutex;

use crate::shared::config;
use crate::shared::firestore::{fields, FirestoreClient, Precondition};
use crate::shared::util::{fast_hash_hex, non_empty, now_ms};

const SESSIONS: &str = "orch_cloud_sessions";
const ENTRIES: &str = "entries";
const WORKSPACES: &str = "orch_cloud_workspaces";
const GITHUB_ACCOUNTS: &str = "orch_github_accounts";
const OAUTH_STATES: &str = "orch_oauth_states";
const MAX_HYDRATED_MEDIA_BYTES: usize = 24 * 1024 * 1024;

fn session_path(id: &str) -> String {
    format!("{SESSIONS}/{id}")
}

fn entry_path(session_id: &str, seq: i64) -> String {
    format!("{SESSIONS}/{session_id}/{ENTRIES}/{seq:012}")
}

fn workspace_path(doc_id: &str) -> String {
    format!("{WORKSPACES}/{doc_id}")
}

fn github_account_path(doc_id: &str) -> String {
    format!("{GITHUB_ACCOUNTS}/{doc_id}")
}

fn oauth_state_path(state_id: &str) -> String {
    format!("{OAUTH_STATES}/{state_id}")
}

fn id_from_name(name: &str) -> &str {
    name.rsplit('/').next().unwrap_or(name)
}

fn encode_component(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(*byte as char);
        } else {
            use std::fmt::Write;
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}

pub fn workspace_doc_id(user_id: &str, workspace_uri: &str) -> String {
    fast_hash_hex(&format!("{user_id}\0{workspace_uri}"))
}

fn image_ext_for_mime(mime: &str) -> &'static str {
    match mime.trim().to_ascii_lowercase().as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

#[derive(Debug, Clone)]
pub struct CloudWorkspaceRecord {
    pub doc_id: String,
    pub user_id: String,
    pub name: String,
    pub workspace_uri: String,
    pub repo_url: String,
    pub repo_dir: String,
    pub is_private: bool,
    pub sandbox_id: String,
    pub domain: String,
    pub envd_access_token: String,
    pub created_at: i64,
    pub updated_at: i64,
}

impl CloudWorkspaceRecord {
    fn from_fields(doc_id: &str, stored: &Value) -> Self {
        Self {
            doc_id: doc_id.to_string(),
            user_id: fields::read_string(stored, "user_id"),
            name: fields::read_string(stored, "name"),
            workspace_uri: fields::read_string(stored, "workspace_uri"),
            repo_url: fields::read_string(stored, "repo_url"),
            repo_dir: fields::read_string(stored, "repo_dir"),
            is_private: fields::read_bool(stored, "is_private"),
            sandbox_id: fields::read_string(stored, "sandbox_id"),
            domain: fields::read_string(stored, "domain"),
            envd_access_token: fields::read_string(stored, "envd_access_token"),
            created_at: fields::read_i64(stored, "created_at"),
            updated_at: fields::read_i64(stored, "updated_at"),
        }
    }

    fn from_document(document: &Value) -> Option<Self> {
        let name = document.get("name")?.as_str()?;
        let stored = document.get("fields")?;
        Some(Self::from_fields(id_from_name(name), stored))
    }

    pub fn to_fields(&self) -> Map<String, Value> {
        let mut map = Map::new();
        map.insert("user_id".into(), fields::string(&self.user_id));
        map.insert("name".into(), fields::string(&self.name));
        map.insert("workspace_uri".into(), fields::string(&self.workspace_uri));
        map.insert("repo_url".into(), fields::string(&self.repo_url));
        map.insert("repo_dir".into(), fields::string(&self.repo_dir));
        map.insert("is_private".into(), fields::boolean(self.is_private));
        map.insert("sandbox_id".into(), fields::string(&self.sandbox_id));
        map.insert("domain".into(), fields::string(&self.domain));
        map.insert(
            "envd_access_token".into(),
            fields::string(&self.envd_access_token),
        );
        map.insert("created_at".into(), fields::integer(self.created_at));
        map.insert("updated_at".into(), fields::integer(self.updated_at));
        map
    }
}

#[derive(Debug, Clone)]
pub struct GithubAccountRecord {
    pub doc_id: String,
    pub user_id: String,
    pub github_id: String,
    pub login: String,
    pub name: String,
    pub avatar_url: String,
    pub email: String,
    pub token_ciphertext: String,
    pub updated_at: i64,
}

impl GithubAccountRecord {
    fn from_fields(doc_id: &str, stored: &Value) -> Self {
        Self {
            doc_id: doc_id.to_string(),
            user_id: fields::read_string(stored, "user_id"),
            github_id: fields::read_string(stored, "github_id"),
            login: fields::read_string(stored, "login"),
            name: fields::read_string(stored, "name"),
            avatar_url: fields::read_string(stored, "avatar_url"),
            email: fields::read_string(stored, "email"),
            token_ciphertext: fields::read_string(stored, "token_ciphertext"),
            updated_at: fields::read_i64(stored, "updated_at"),
        }
    }

    fn from_document(document: &Value) -> Option<Self> {
        let name = document.get("name")?.as_str()?;
        let stored = document.get("fields")?;
        Some(Self::from_fields(id_from_name(name), stored))
    }

    pub fn to_fields(&self) -> Map<String, Value> {
        let mut map = Map::new();
        map.insert("user_id".into(), fields::string(&self.user_id));
        map.insert("github_id".into(), fields::string(&self.github_id));
        map.insert("login".into(), fields::string(&self.login));
        map.insert("name".into(), fields::string(&self.name));
        map.insert("avatar_url".into(), fields::string(&self.avatar_url));
        map.insert("email".into(), fields::string(&self.email));
        map.insert(
            "token_ciphertext".into(),
            fields::string(&self.token_ciphertext),
        );
        map.insert("updated_at".into(), fields::integer(self.updated_at));
        map
    }
}

#[derive(Debug, Clone)]
pub struct OAuthStateRecord {
    pub state: String,
    pub user_id: String,
    pub platform: String,
    pub expires_at: i64,
}

impl OAuthStateRecord {
    fn from_document(document: &Value) -> Option<Self> {
        let name = document.get("name")?.as_str()?;
        let stored = document.get("fields")?;
        Some(Self {
            state: id_from_name(name).to_string(),
            user_id: fields::read_string(stored, "user_id"),
            platform: fields::read_string(stored, "platform"),
            expires_at: fields::read_i64(stored, "expires_at"),
        })
    }

    fn to_fields(&self) -> Map<String, Value> {
        let mut map = Map::new();
        map.insert("user_id".into(), fields::string(&self.user_id));
        map.insert("platform".into(), fields::string(&self.platform));
        map.insert("expires_at".into(), fields::integer(self.expires_at));
        map
    }
}

#[derive(Debug, Clone)]
pub struct CloudSessionRecord {
    pub id: String,
    pub title: String,
    pub workspace_path: String,
    pub user_id: String,
    pub repo_url: String,
    pub updated_at: i64,
    pub next_seq: i64,
    pub context_tokens: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cached_tokens: i64,
    pub reasoning_tokens: i64,
    pub run_status: String,
    pub run_id: String,
    pub run_heartbeat: i64,
    pub cancel_requested: bool,
}

impl CloudSessionRecord {
    fn from_fields(id: &str, stored: &Value) -> Self {
        Self {
            id: id.to_string(),
            title: fields::read_string(stored, "title"),
            workspace_path: fields::read_string(stored, "workspace_path"),
            user_id: fields::read_string(stored, "user_id"),
            repo_url: fields::read_string(stored, "repo_url"),
            updated_at: fields::read_i64(stored, "updated_at"),
            next_seq: fields::read_i64(stored, "next_seq").max(1),
            context_tokens: fields::read_i64(stored, "context_tokens"),
            input_tokens: fields::read_i64(stored, "input_tokens"),
            output_tokens: fields::read_i64(stored, "output_tokens"),
            cached_tokens: fields::read_i64(stored, "cached_tokens"),
            reasoning_tokens: fields::read_i64(stored, "reasoning_tokens"),
            run_status: fields::read_string(stored, "run_status"),
            run_id: fields::read_string(stored, "run_id"),
            run_heartbeat: fields::read_i64(stored, "run_heartbeat"),
            cancel_requested: fields::read_bool(stored, "cancel_requested"),
        }
    }

    fn from_document(document: &Value) -> Option<Self> {
        let name = document.get("name")?.as_str()?;
        let stored = document.get("fields")?;
        Some(Self::from_fields(id_from_name(name), stored))
    }

    fn initial(id: &str, workspace_path: &str, user_id: &str, repo_url: &str, now: i64) -> Self {
        Self {
            id: id.to_string(),
            title: String::new(),
            workspace_path: workspace_path.to_string(),
            user_id: user_id.to_string(),
            repo_url: repo_url.to_string(),
            updated_at: now,
            next_seq: 1,
            context_tokens: 0,
            input_tokens: 0,
            output_tokens: 0,
            cached_tokens: 0,
            reasoning_tokens: 0,
            run_status: String::new(),
            run_id: String::new(),
            run_heartbeat: 0,
            cancel_requested: false,
        }
    }

    fn to_fields(&self) -> Map<String, Value> {
        let mut map = Map::new();
        map.insert("title".into(), fields::string(&self.title));
        map.insert("workspace_path".into(), fields::string(&self.workspace_path));
        map.insert("user_id".into(), fields::string(&self.user_id));
        map.insert("repo_url".into(), fields::string(&self.repo_url));
        map.insert("updated_at".into(), fields::integer(self.updated_at));
        map.insert("next_seq".into(), fields::integer(self.next_seq));
        map.insert("context_tokens".into(), fields::integer(self.context_tokens));
        map.insert("input_tokens".into(), fields::integer(self.input_tokens));
        map.insert("output_tokens".into(), fields::integer(self.output_tokens));
        map.insert("cached_tokens".into(), fields::integer(self.cached_tokens));
        map.insert(
            "reasoning_tokens".into(),
            fields::integer(self.reasoning_tokens),
        );
        map.insert("run_status".into(), fields::string(&self.run_status));
        map.insert("run_id".into(), fields::string(&self.run_id));
        map.insert("run_heartbeat".into(), fields::integer(self.run_heartbeat));
        map.insert(
            "cancel_requested".into(),
            fields::boolean(self.cancel_requested),
        );
        map
    }

    pub fn is_running(&self, now_ms: i64) -> bool {
        self.run_status == "running"
            && now_ms.saturating_sub(self.run_heartbeat) < config::RUN_LEASE_SECS * 1000
    }

    fn to_summary(&self) -> SessionSummary {
        SessionSummary {
            id: self.id.clone(),
            title: non_empty(self.title.clone()),
            workspace_path: non_empty(self.workspace_path.clone()),
            updated_at: self.updated_at,
            context_tokens: self.context_tokens,
            input_tokens: self.input_tokens,
            output_tokens: self.output_tokens,
            cached_tokens: self.cached_tokens,
            reasoning_tokens: self.reasoning_tokens,
            running: self.is_running(now_ms()),
        }
    }
}

pub enum Beat {
    Gone,
    Alive { owned: bool, cancel_requested: bool },
}

pub enum Acquire {
    Acquired,
    Busy,
}

fn equals_filter(field: &str, value: &str) -> Value {
    json!({
        "fieldFilter": {
            "field": { "fieldPath": field },
            "op": "EQUAL",
            "value": { "stringValue": value },
        }
    })
}

impl FirestoreClient {
    pub async fn get_workspace(
        &self,
        doc_id: &str,
    ) -> Result<Option<CloudWorkspaceRecord>, String> {
        let Some(document) = self.get_document(&workspace_path(doc_id)).await? else {
            return Ok(None);
        };
        CloudWorkspaceRecord::from_document(&document)
            .map(Some)
            .ok_or_else(|| format!("workspace document {doc_id} is malformed"))
    }

    pub async fn upsert_workspace(&self, record: &CloudWorkspaceRecord) -> Result<(), String> {
        let fields = record.to_fields();
        self.write_document(
            &workspace_path(&record.doc_id),
            &fields,
            false,
            Precondition::Unconditional,
        )
        .await?
        .into_result("upsert workspace")
        .map(|_| ())
    }

    pub async fn list_workspaces(
        &self,
        user_id: &str,
    ) -> Result<Vec<CloudWorkspaceRecord>, String> {
        let documents = self
            .run_query(
                "",
                json!({
                    "from": [{ "collectionId": WORKSPACES }],
                    "where": equals_filter("user_id", user_id),
                    "orderBy": [
                        { "field": { "fieldPath": "updated_at" }, "direction": "DESCENDING" }
                    ],
                    "limit": config::SESSION_PAGE_SIZE,
                }),
            )
            .await?;
        documents
            .iter()
            .map(|document| {
                CloudWorkspaceRecord::from_document(document)
                    .ok_or_else(|| "workspace document is malformed".to_string())
            })
            .collect()
    }

    pub async fn delete_workspace(&self, doc_id: &str) -> Result<(), String> {
        self.delete_document(&workspace_path(doc_id)).await
    }

    pub async fn get_github_account(
        &self,
        user_id: &str,
    ) -> Result<Option<GithubAccountRecord>, String> {
        let Some(document) = self.get_document(&github_account_path(user_id)).await? else {
            return Ok(None);
        };
        GithubAccountRecord::from_document(&document)
            .map(Some)
            .ok_or_else(|| format!("github account document {user_id} is malformed"))
    }

    pub async fn upsert_github_account(
        &self,
        record: &GithubAccountRecord,
    ) -> Result<(), String> {
        let fields = record.to_fields();
        self.write_document(
            &github_account_path(&record.user_id),
            &fields,
            false,
            Precondition::Unconditional,
        )
        .await?
        .into_result("upsert github account")
        .map(|_| ())
    }

    pub async fn delete_github_account(&self, user_id: &str) -> Result<(), String> {
        self.delete_document(&github_account_path(user_id)).await
    }

    pub async fn put_oauth_state(&self, record: &OAuthStateRecord) -> Result<(), String> {
        let fields = record.to_fields();
        self.write_document(
            &oauth_state_path(&record.state),
            &fields,
            false,
            Precondition::Exists(false),
        )
        .await?
        .into_result("store oauth state")
        .map(|_| ())
    }

    pub async fn take_oauth_state(&self, state: &str) -> Result<Option<OAuthStateRecord>, String> {
        let path = oauth_state_path(state);
        let Some(document) = self.get_document(&path).await? else {
            return Ok(None);
        };
        let reply = self
            .commit_reply(vec![json!({
                "delete": self.document_name(&path),
                "currentDocument": { "exists": true },
            })])
            .await?;
        if reply.is_precondition_failure() || reply.status == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        reply.into_result("consume oauth state")?;
        Ok(OAuthStateRecord::from_document(&document))
    }

    pub async fn list_all_session_ids_for_workspace(
        &self,
        user_id: &str,
        workspace_path: &str,
    ) -> Result<Vec<String>, String> {
        let filter = json!({
            "compositeFilter": {
                "op": "AND",
                "filters": [
                    equals_filter("user_id", user_id),
                    equals_filter("workspace_path", workspace_path),
                ]
            }
        });
        let documents = self
            .run_query(
                "",
                json!({
                    "from": [{ "collectionId": SESSIONS }],
                    "where": filter,
                    "select": { "fields": [{ "fieldPath": "__name__" }] },
                    "limit": config::FIRESTORE_BATCH_LIMIT,
                }),
            )
            .await?;
        Ok(documents
            .iter()
            .filter_map(|doc| doc.get("name").and_then(Value::as_str))
            .map(|name| id_from_name(name).to_string())
            .collect())
    }

    pub async fn get_session(&self, id: &str) -> Result<Option<CloudSessionRecord>, String> {
        let Some(document) = self.get_document(&session_path(id)).await? else {
            return Ok(None);
        };
        CloudSessionRecord::from_document(&document)
            .map(Some)
            .ok_or_else(|| format!("session document {id} is malformed"))
    }

    pub async fn ensure_session(
        &self,
        id: &str,
        workspace_path: &str,
        user_id: &str,
        repo_url: &str,
        model: &str,
    ) -> Result<(CloudSessionRecord, bool), String> {
        let now = now_ms();
        for _ in 0..2 {
            if let Some(mut record) = self.get_session(id).await? {
                if record.workspace_path != workspace_path {
                    return Err("session belongs to a different workspace".to_string());
                }
                let mut update = Map::new();
                update.insert("updated_at".into(), fields::integer(now));
                update.insert("model".into(), fields::string(model));
                record.updated_at = now;
                self.patch_session(id, update).await?;
                return Ok((record, false));
            }

            let record = CloudSessionRecord::initial(id, workspace_path, user_id, repo_url, now);
            let mut document = record.to_fields();
            document.insert("model".into(), fields::string(model));
            document.insert("created_at".into(), fields::integer(now));
            let reply = self
                .write_document(
                    &session_path(id),
                    &document,
                    false,
                    Precondition::Exists(false),
                )
                .await?;
            if reply.status.is_success() {
                return Ok((record, true));
            }
            if !reply.is_precondition_failure() {
                return Err(reply.error("create session"));
            }
        }
        Err(format!("session {id} creation kept conflicting"))
    }

    pub async fn patch_session(&self, id: &str, update: Map<String, Value>) -> Result<bool, String> {
        let reply = self
            .write_document(&session_path(id), &update, true, Precondition::Exists(true))
            .await?;
        if reply.status == StatusCode::NOT_FOUND {
            return Ok(false);
        }
        reply.into_result("patch session")?;
        Ok(true)
    }

    pub async fn set_session_title(&self, id: &str, title: &str) -> Result<(), String> {
        let mut update = Map::new();
        update.insert("title".into(), fields::string(title));
        self.patch_session(id, update).await.map(|_| ())
    }

    pub async fn release_run(&self, id: &str, run_id: &str) -> Result<(), String> {
        let Some(record) = self.get_session(id).await? else {
            return Ok(());
        };
        if record.run_id != run_id {
            return Ok(());
        }
        let mut update = Map::new();
        update.insert("run_status".into(), fields::string("idle"));
        update.insert("cancel_requested".into(), fields::boolean(false));
        update.insert("updated_at".into(), fields::integer(now_ms()));
        self.patch_session(id, update).await.map(|_| ())
    }

    pub async fn request_cancel(&self, id: &str) -> Result<(), String> {
        let mut update = Map::new();
        update.insert("cancel_requested".into(), fields::boolean(true));
        self.patch_session(id, update).await.map(|_| ())
    }

    pub async fn heartbeat(&self, id: &str, run_id: &str) -> Result<Beat, String> {
        let mut update = Map::new();
        update.insert("run_heartbeat".into(), fields::integer(now_ms()));
        let reply = self
            .write_document(&session_path(id), &update, true, Precondition::Exists(true))
            .await?;
        if reply.status == StatusCode::NOT_FOUND {
            return Ok(Beat::Gone);
        }
        let document = reply.into_result("heartbeat")?;
        let stored = document.get("fields").unwrap_or(&Value::Null);
        Ok(Beat::Alive {
            owned: fields::read_string(stored, "run_id") == run_id,
            cancel_requested: fields::read_bool(stored, "cancel_requested"),
        })
    }

    pub async fn acquire_run(&self, id: &str, run_id: &str) -> Result<Acquire, String> {
        let document = self
            .get_document(&session_path(id))
            .await?
            .ok_or_else(|| format!("session {id} disappeared before the run started"))?;
        let update_time = document
            .get("updateTime")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("session {id} has no updateTime"))?
            .to_string();
        let record = CloudSessionRecord::from_document(&document)
            .ok_or_else(|| format!("session document {id} is malformed"))?;

        let now = now_ms();
        if record.run_status == "running" && record.is_running(now) {
            return Ok(Acquire::Busy);
        }

        let mut update = Map::new();
        update.insert("run_status".into(), fields::string("running"));
        update.insert("run_id".into(), fields::string(run_id));
        update.insert("run_heartbeat".into(), fields::integer(now));
        update.insert("cancel_requested".into(), fields::boolean(false));
        update.insert("updated_at".into(), fields::integer(now));
        let reply = self
            .write_document(
                &session_path(id),
                &update,
                true,
                Precondition::UpdateTime(&update_time),
            )
            .await?;
        if reply.status.is_success() {
            return Ok(Acquire::Acquired);
        }
        if reply.is_precondition_failure() {
            return Ok(Acquire::Busy);
        }
        Err(reply.error("acquire run"))
    }

    pub async fn list_sessions(
        &self,
        user_id: &str,
        workspace_path: Option<&str>,
    ) -> Result<Vec<SessionSummary>, String> {
        let mut filters = vec![equals_filter("user_id", user_id)];
        if let Some(workspace_path) = workspace_path {
            filters.push(equals_filter("workspace_path", workspace_path));
        }
        let filter = if filters.len() == 1 {
            filters.remove(0)
        } else {
            json!({ "compositeFilter": { "op": "AND", "filters": filters } })
        };

        let documents = self
            .run_query(
                "",
                json!({
                    "from": [{ "collectionId": SESSIONS }],
                    "where": filter,
                    "orderBy": [
                        { "field": { "fieldPath": "updated_at" }, "direction": "DESCENDING" },
                        { "field": { "fieldPath": "__name__" }, "direction": "DESCENDING" }
                    ],
                    "limit": config::SESSION_PAGE_SIZE,
                }),
            )
            .await?;
        documents
            .iter()
            .map(|document| {
                CloudSessionRecord::from_document(document)
                    .map(|record| record.to_summary())
                    .ok_or_else(|| "session document is malformed".to_string())
            })
            .collect()
    }

    pub async fn delete_session_and_entries(&self, id: &str) -> Result<(), String> {
        loop {
            let docs = self
                .run_query(
                    &session_path(id),
                    json!({
                        "from": [{ "collectionId": ENTRIES }],
                        "select": { "fields": [{ "fieldPath": "__name__" }] },
                        "limit": config::FIRESTORE_BATCH_LIMIT,
                    }),
                )
                .await?;
            if docs.is_empty() {
                break;
            }
            let deletes: Vec<Value> = docs
                .iter()
                .filter_map(|doc| doc.get("name").and_then(Value::as_str))
                .map(|name| json!({ "delete": name }))
                .collect();
            if deletes.is_empty() {
                break;
            }
            self.commit_chunked(deletes).await?;
        }
        self.delete_document(&session_path(id)).await
    }
}

#[derive(Clone)]
pub struct StorageClient {
    http: reqwest::Client,
    auth: Arc<dyn TokenProvider>,
    bucket: Arc<str>,
    session_id: Arc<str>,
}

impl StorageClient {
    pub fn new(
        http: reqwest::Client,
        auth: Arc<dyn TokenProvider>,
        bucket: impl Into<String>,
        session_id: impl Into<String>,
    ) -> Self {
        Self {
            http,
            auth,
            bucket: Arc::from(bucket.into()),
            session_id: Arc::from(session_id.into()),
        }
    }

    fn object_name(&self, key: &str) -> String {
        format!("sessions/{}/{key}", self.session_id)
    }

    fn object_url(&self, object: &str) -> String {
        format!(
            "{}/storage/v1/b/{}/o/{}",
            config::GCS_STORAGE_BASE,
            encode_component(&self.bucket),
            encode_component(object)
        )
    }

    fn upload_url(&self) -> String {
        format!(
            "{}/upload/storage/v1/b/{}/o",
            config::GCS_STORAGE_BASE,
            encode_component(&self.bucket)
        )
    }

    async fn bearer(&self) -> AppResult<String> {
        let token = self
            .auth
            .token(&[config::GCS_SCOPE])
            .await
            .map_err(|e| AppError::other(format!("GCS authentication failed: {e}")))?;
        Ok(token.as_str().to_string())
    }

    pub async fn read_bytes(&self, key: &str) -> AppResult<Option<Vec<u8>>> {
        let obj = self.object_name(key);
        let token = self.bearer().await?;
        let resp = self
            .http
            .get(self.object_url(&obj))
            .query(&[("alt", "media")])
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| AppError::Io(io::Error::other(format!("GCS read failed: {e}"))))?;
        if resp.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !resp.status().is_success() {
            let status = resp.status();
            let detail = resp.text().await.unwrap_or_default();
            return Err(AppError::other(format!(
                "GCS read {obj} failed ({status}): {detail}"
            )));
        }
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| AppError::Io(io::Error::other(format!("GCS body read failed: {e}"))))?;
        Ok(Some(bytes.to_vec()))
    }

    pub async fn write_bytes(&self, key: &str, bytes: &[u8]) -> AppResult<()> {
        let obj = self.object_name(key);
        let token = self.bearer().await?;
        let resp = self
            .http
            .post(self.upload_url())
            .query(&[("uploadType", "media"), ("name", obj.as_str())])
            .bearer_auth(token)
            .header(reqwest::header::CONTENT_TYPE, "application/octet-stream")
            .body(bytes.to_vec())
            .send()
            .await
            .map_err(|e| AppError::Io(io::Error::other(format!("GCS upload failed: {e}"))))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let detail = resp.text().await.unwrap_or_default();
            return Err(AppError::other(format!(
                "GCS upload {obj} failed ({status}): {detail}"
            )));
        }
        Ok(())
    }

    pub async fn read_json<T: DeserializeOwned>(&self, key: &str) -> AppResult<Option<T>> {
        let Some(bytes) = self.read_bytes(key).await? else {
            return Ok(None);
        };
        let parsed = serde_json::from_slice(&bytes)
            .map_err(|e| AppError::other(format!("GCS JSON {key} invalid: {e}")))?;
        Ok(Some(parsed))
    }

    pub async fn write_json<T: Serialize>(&self, key: &str, value: &T) -> AppResult<()> {
        let bytes = serde_json::to_vec(value)
            .map_err(|e| AppError::other(format!("GCS JSON serialize failed: {e}")))?;
        self.write_bytes(key, &bytes).await
    }

    pub async fn delete_prefix(&self) -> Result<(), String> {
        let prefix = format!("sessions/{}/", self.session_id);
        let list_url = format!(
            "{}/storage/v1/b/{}/o",
            config::GCS_STORAGE_BASE,
            encode_component(&self.bucket)
        );
        let mut page_token: Option<String> = None;
        loop {
            let token = self
                .auth
                .token(&[config::GCS_SCOPE])
                .await
                .map_err(|e| format!("GCS auth failed: {e}"))?;
            let mut query: Vec<(&str, String)> = vec![("prefix", prefix.clone())];
            if let Some(pt) = &page_token {
                query.push(("pageToken", pt.clone()));
            }
            let resp = self
                .http
                .get(&list_url)
                .query(&query)
                .bearer_auth(token.as_str())
                .send()
                .await
                .map_err(|e| format!("GCS list failed: {e}"))?;
            if !resp.status().is_success() {
                let status = resp.status();
                let detail = resp.text().await.unwrap_or_default();
                return Err(format!("GCS list {prefix} failed ({status}): {detail}"));
            }
            let body: Value = resp
                .json()
                .await
                .map_err(|e| format!("GCS list response invalid: {e}"))?;
            if let Some(items) = body.get("items").and_then(Value::as_array) {
                let delete_token = self
                    .auth
                    .token(&[config::GCS_SCOPE])
                    .await
                    .map_err(|e| format!("GCS auth failed: {e}"))?
                    .as_str()
                    .to_string();
                let objects: Vec<(String, String)> = items
                    .iter()
                    .filter_map(|item| {
                        let name = item.get("name").and_then(Value::as_str)?.to_string();
                        Some((name.clone(), self.object_url(&name)))
                    })
                    .collect();
                let http = self.http.clone();
                stream::iter(objects)
                    .map(|(name, url)| {
                        let http = http.clone();
                        let token = delete_token.clone();
                        async move {
                            let del_resp = http
                                .delete(url)
                                .bearer_auth(token)
                                .send()
                                .await
                                .map_err(|e| format!("GCS delete failed: {e}"))?;
                            if !del_resp.status().is_success()
                                && del_resp.status() != StatusCode::NOT_FOUND
                            {
                                let status = del_resp.status();
                                let detail = del_resp.text().await.unwrap_or_default();
                                return Err(format!("GCS delete {name} failed ({status}): {detail}"));
                            }
                            Ok::<_, String>(())
                        }
                    })
                    .buffer_unordered(8)
                    .try_collect::<Vec<_>>()
                    .await?;
            }
            page_token = body
                .get("nextPageToken")
                .and_then(Value::as_str)
                .map(str::to_string);
            if page_token.is_none() {
                break;
            }
        }
        Ok(())
    }
}

#[derive(Clone)]
pub struct CloudSessionStore {
    firestore: FirestoreClient,
    storage: StorageClient,
    next_seq: Arc<Mutex<i64>>,
}

impl CloudSessionStore {
    pub fn new(
        firestore: FirestoreClient,
        http: reqwest::Client,
        bucket: &str,
        session_id: &str,
        next_seq: i64,
    ) -> Self {
        let storage = StorageClient::new(http, firestore.auth_provider(), bucket, session_id);
        Self {
            firestore,
            storage,
            next_seq: Arc::new(Mutex::new(next_seq.max(1))),
        }
    }

    async fn externalize_media(&self, records: &[ChatEvent]) -> AppResult<Vec<ChatEvent>> {
        let storage = self.storage.clone();
        stream::iter(records.iter().cloned())
            .map(|record| {
                let storage = storage.clone();
                async move {
                    match record {
                        ChatEvent::User { content } => {
                            let next_content = stream::iter(content)
                                .map(|part| {
                                    let storage = storage.clone();
                                    async move {
                                        match part {
                                            HistoryUserPart::Image {
                                                mime_type,
                                                data: Some(b64),
                                                uri: None,
                                            } => match STANDARD.decode(&b64) {
                                                Ok(bytes) => {
                                                    let ext = image_ext_for_mime(&mime_type);
                                                    let hash = fast_hash_hex(&b64);
                                                    let key = format!("blobs/{hash}.{ext}");
                                                    storage.write_bytes(&key, &bytes).await?;
                                                    Ok::<HistoryUserPart, AppError>(HistoryUserPart::Image {
                                                        mime_type,
                                                        data: None,
                                                        uri: Some(format!("gcs://{key}")),
                                                    })
                                                }
                                                Err(_) => Ok(HistoryUserPart::Image {
                                                    mime_type,
                                                    data: Some(b64),
                                                    uri: None,
                                                }),
                                            },
                                            other => Ok(other),
                                        }
                                    }
                                })
                                .buffered(8)
                                .try_collect::<Vec<_>>()
                                .await?;
                            Ok(ChatEvent::User { content: next_content })
                        }
                        other => Ok(other),
                    }
                }
            })
            .buffered(8)
            .try_collect()
            .await
    }

    async fn hydrate_media(
        &self,
        record: &mut ChatEvent,
        budget_remaining: &std::sync::atomic::AtomicUsize,
    ) -> AppResult<()> {
        let ChatEvent::User { content } = record else {
            return Ok(());
        };
        let keys: Vec<(usize, String)> = content
            .iter()
            .enumerate()
            .filter_map(|(index, part)| match part {
                HistoryUserPart::Image {
                    data: None,
                    uri: Some(uri),
                    ..
                } => uri.strip_prefix("gcs://").map(|key| (index, key.to_string())),
                _ => None,
            })
            .collect();
        if keys.is_empty()
            || budget_remaining.load(std::sync::atomic::Ordering::Relaxed) == 0
        {
            return Ok(());
        }
        let results = stream::iter(keys)
            .map(|(index, key)| {
                let storage = self.storage.clone();
                async move { Ok::<_, AppError>((index, storage.read_bytes(&key).await?)) }
            })
            .buffered(8)
            .try_collect::<Vec<_>>()
            .await?;
        for (index, bytes) in results {
            let Some(bytes) = bytes else {
                continue;
            };
            let size = bytes.len();
            let mut cur = budget_remaining.load(std::sync::atomic::Ordering::Relaxed);
            let allowed = loop {
                if size > cur {
                    break false;
                }
                match budget_remaining.compare_exchange_weak(
                    cur,
                    cur - size,
                    std::sync::atomic::Ordering::AcqRel,
                    std::sync::atomic::Ordering::Relaxed,
                ) {
                    Ok(_) => break true,
                    Err(actual) => cur = actual,
                }
            };
            if !allowed {
                continue;
            }
            if let HistoryUserPart::Image { data, uri, .. } = &mut content[index] {
                *data = Some(STANDARD.encode(&bytes));
                *uri = None;
            }
        }
        Ok(())
    }
}

#[async_trait]
impl SessionStore for CloudSessionStore {
    async fn load_snapshot(&self, _session_id: &str) -> AppResult<SessionSnapshot> {
        Ok(self
            .storage
            .read_json::<SessionSnapshot>("conversation.json")
            .await?
            .unwrap_or_default())
    }

    async fn save_snapshot(&self, _session_id: &str, snapshot: &SessionSnapshot) -> AppResult<()> {
        self.storage.write_json("conversation.json", snapshot).await
    }

    async fn append_history(&self, session_id: &str, records: &[ChatEvent]) -> AppResult<()> {
        if records.is_empty() {
            return Ok(());
        }
        let prepared = self.externalize_media(records).await?;
        let payloads: Vec<String> = prepared
            .iter()
            .map(|record| {
                serde_json::to_string(record)
                    .map_err(|e| AppError::other(format!("serialize history record failed: {e}")))
            })
            .collect::<AppResult<Vec<_>>>()?;

        let mut next_seq_guard = self.next_seq.lock().await;
        for attempt in 0..2 {
            let mut seq = (*next_seq_guard).max(1);
            let mut writes = Vec::with_capacity(payloads.len() + 1);
            for payload in &payloads {
                writes.push(json!({
                    "update": {
                        "name": self.firestore.document_name(&entry_path(session_id, seq)),
                        "fields": {
                            "seq": fields::integer(seq),
                            "record": fields::string(payload),
                        }
                    },
                    "currentDocument": { "exists": false }
                }));
                seq += 1;
            }
            writes.push(json!({
                "update": {
                    "name": self.firestore.document_name(&session_path(session_id)),
                    "fields": {
                        "next_seq": fields::integer(seq),
                        "updated_at": fields::integer(now_ms()),
                    }
                },
                "updateMask": {
                    "fieldPaths": ["next_seq", "updated_at"]
                }
            }));

            if writes.len() <= config::FIRESTORE_BATCH_LIMIT {
                let reply = self
                    .firestore
                    .commit_reply(writes)
                    .await
                    .map_err(AppError::other)?;
                if reply.status.is_success() {
                    *next_seq_guard = seq;
                    return Ok(());
                }
                if reply.is_precondition_failure() && attempt == 0 {
                    if let Ok(Some(fresh)) = self.firestore.get_session(session_id).await {
                        *next_seq_guard = fresh.next_seq.max(seq);
                        continue;
                    }
                }
                return Err(AppError::other(reply.error("append history")));
            }

            self.firestore
                .commit_chunked(writes)
                .await
                .map_err(AppError::other)?;
            *next_seq_guard = seq;
            return Ok(());
        }
        Err(AppError::other("append history seq conflict persisted"))
    }

    async fn get_history(
        &self,
        session_id: &str,
        limit: usize,
        before_seq: Option<i64>,
    ) -> AppResult<SessionRecordPage> {
        let mut query = json!({
            "from": [{ "collectionId": ENTRIES }],
            "orderBy": [{ "field": { "fieldPath": "seq" }, "direction": "DESCENDING" }],
            "limit": (limit + 1) as i64,
        });
        if let Some(before) = before_seq {
            query["where"] = json!({
                "fieldFilter": {
                    "field": { "fieldPath": "seq" },
                    "op": "LESS_THAN",
                    "value": { "integerValue": before.to_string() },
                }
            });
        }
        let mut docs = self
            .firestore
            .run_query(&session_path(session_id), query)
            .await
            .map_err(AppError::other)?;
        let has_more = docs.len() > limit;
        docs.truncate(limit);
        docs.reverse();

        let parsed = docs
            .into_iter()
            .map(|doc| {
                let stored = doc.get("fields").unwrap_or(&Value::Null);
                let seq = fields::read_i64(stored, "seq");
                let raw = fields::read_string(stored, "record");
                serde_json::from_str::<ChatEvent>(&raw)
                    .map(|record| (seq, record))
                    .map_err(|e| {
                        AppError::other(format!("corrupt session entry {session_id}/{seq}: {e}"))
                    })
            })
            .collect::<AppResult<Vec<_>>>()?;
        let media_budget = Arc::new(std::sync::atomic::AtomicUsize::new(MAX_HYDRATED_MEDIA_BYTES));
        let records = stream::iter(parsed)
            .map(|(seq, mut record)| {
                let budget = media_budget.clone();
                async move {
                    self.hydrate_media(&mut record, &budget).await?;
                    Ok::<_, AppError>(SessionRecord { seq, record })
                }
            })
            .buffered(8)
            .try_collect::<Vec<_>>()
            .await?;
        let earliest_seq = records.first().map(|r| r.seq);
        Ok(SessionRecordPage {
            records,
            has_more,
            earliest_seq,
        })
    }

    async fn set_context_tokens(&self, session_id: &str, tokens: u64) -> AppResult<()> {
        let mut update = Map::new();
        update.insert(
            "context_tokens".into(),
            fields::integer(i64::try_from(tokens).unwrap_or(i64::MAX)),
        );
        update.insert("updated_at".into(), fields::integer(now_ms()));
        self.firestore
            .patch_session(session_id, update)
            .await
            .map(|_| ())
            .map_err(AppError::other)
    }

    async fn record_usage(&self, session_id: &str, usage: &TurnUsage) -> AppResult<()> {
        let path = session_path(session_id);
        let increments = [
            ("input_tokens", usage.input_tokens),
            ("output_tokens", usage.output_tokens),
            ("cached_tokens", usage.cached_tokens),
            ("reasoning_tokens", usage.reasoning_tokens),
        ];
        let field_transforms: Vec<Value> = increments
            .into_iter()
            .map(|(field_path, value)| {
                json!({
                    "fieldPath": field_path,
                    "increment": { "integerValue": i64::try_from(value).unwrap_or(i64::MAX).to_string() }
                })
            })
            .collect();
        let mut fields = Map::new();
        fields.insert(
            "context_tokens".into(),
            fields::integer(i64::try_from(usage.context_tokens).unwrap_or(i64::MAX)),
        );
        fields.insert("updated_at".into(), fields::integer(now_ms()));
        self.firestore
            .commit(vec![json!({
                "update": {
                    "name": self.firestore.document_name(&path),
                    "fields": fields,
                },
                "updateMask": { "fieldPaths": ["context_tokens", "updated_at"] },
                "updateTransforms": field_transforms,
            })])
            .await
            .map_err(AppError::other)?;
        Ok(())
    }
}
