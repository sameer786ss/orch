use std::sync::Arc;
use std::time::Duration;

use gcp_auth::TokenProvider;
use reqwest::{Method, StatusCode};
use serde_json::{json, Map, Value};

use crate::shared::config;

pub mod fields {
    use serde_json::{json, Value};

    pub fn string(value: &str) -> Value {
        json!({ "stringValue": value })
    }

    pub fn integer(value: i64) -> Value {
        json!({ "integerValue": value.to_string() })
    }

    pub fn boolean(value: bool) -> Value {
        json!({ "booleanValue": value })
    }

    pub fn double(value: f64) -> Value {
        json!({ "doubleValue": value })
    }

    pub fn read_string(fields: &Value, key: &str) -> String {
        fields
            .get(key)
            .and_then(|value| value.get("stringValue"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    }

    pub fn read_i64(fields: &Value, key: &str) -> i64 {
        fields
            .get(key)
            .and_then(|value| value.get("integerValue"))
            .and_then(Value::as_str)
            .and_then(|text| text.parse().ok())
            .unwrap_or_default()
    }

    pub fn read_bool(fields: &Value, key: &str) -> bool {
        fields
            .get(key)
            .and_then(|value| value.get("booleanValue"))
            .and_then(Value::as_bool)
            .unwrap_or_default()
    }

    pub fn read_f64(fields: &Value, key: &str) -> f64 {
        fields.get(key).map(read_number).unwrap_or_default()
    }

    pub fn read_number(value: &Value) -> f64 {
        value
            .get("doubleValue")
            .and_then(Value::as_f64)
            .or_else(|| {
                value
                    .get("integerValue")
                    .and_then(Value::as_str)
                    .and_then(|text| text.parse().ok())
            })
            .unwrap_or_default()
    }
}

pub struct Reply {
    pub status: StatusCode,
    pub body: Value,
}

impl Reply {
    pub fn is_precondition_failure(&self) -> bool {
        self.status == StatusCode::CONFLICT
            || self
                .body
                .get("error")
                .and_then(|error| error.get("status"))
                .and_then(Value::as_str)
                .is_some_and(|status| {
                    matches!(status, "ALREADY_EXISTS" | "FAILED_PRECONDITION" | "ABORTED")
                })
    }

    pub fn error(&self, context: &str) -> String {
        format!(
            "Firestore {context} failed with HTTP {}: {}",
            self.status, self.body
        )
    }

    pub fn into_result(self, context: &str) -> Result<Value, String> {
        if self.status.is_success() {
            Ok(self.body)
        } else {
            Err(self.error(context))
        }
    }
}

pub enum Precondition<'a> {
    Exists(bool),
    UpdateTime(&'a str),
    Unconditional,
}

#[derive(Clone)]
pub struct FirestoreClient {
    http: reqwest::Client,
    auth: Arc<dyn TokenProvider>,
    documents_name: String,
    documents_url: String,
}

impl FirestoreClient {
    pub async fn new(http: reqwest::Client, project_id: &str) -> Self {
        let auth = gcp_auth::provider()
            .await
            .expect("failed to initialise GCP authentication");
        let documents_name = format!("projects/{project_id}/databases/(default)/documents");
        Self {
            http,
            auth,
            documents_url: format!("https://firestore.googleapis.com/v1/{documents_name}"),
            documents_name,
        }
    }

    pub fn auth_provider(&self) -> Arc<dyn TokenProvider> {
        self.auth.clone()
    }

    pub fn document_url(&self, path: &str) -> String {
        format!("{}/{path}", self.documents_url)
    }

    pub fn document_name(&self, path: &str) -> String {
        format!("{}/{path}", self.documents_name)
    }

    pub async fn send(
        &self,
        method: Method,
        url: &str,
        query: &[(&str, &str)],
        body: Option<&Value>,
    ) -> Result<Reply, String> {
        let mut attempt = 0u32;
        let response = loop {
            let token = self
                .auth
                .token(&[config::FIRESTORE_SCOPE])
                .await
                .map_err(|error| format!("Firestore authentication failed: {error}"))?;
            let mut request = self
                .http
                .request(method.clone(), url)
                .bearer_auth(token.as_str())
                .query(query)
                .timeout(Duration::from_secs(config::FIRESTORE_TIMEOUT_SECS));
            if let Some(body) = body {
                request = request.json(body);
            }
            match request.send().await {
                Ok(response)
                    if (response.status() == StatusCode::TOO_MANY_REQUESTS
                        || response.status().is_server_error())
                        && attempt < config::FIRESTORE_RETRY_ATTEMPTS =>
                {
                    attempt += 1;
                    tokio::time::sleep(Duration::from_millis(100 * u64::from(attempt))).await;
                }
                Ok(response) => break response,
                Err(_) if attempt < config::FIRESTORE_RETRY_ATTEMPTS => {
                    attempt += 1;
                    tokio::time::sleep(Duration::from_millis(100 * u64::from(attempt))).await;
                }
                Err(error) => {
                    return Err(format!(
                        "Firestore {method} request failed: {}",
                        error.without_url()
                    ));
                }
            }
        };
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|error| format!("Firestore response read failed: {}", error.without_url()))?;
        let body = if text.is_empty() {
            Value::Null
        } else {
            serde_json::from_str(&text)
                .map_err(|error| format!("Firestore response was not JSON (HTTP {status}): {error}"))?
        };
        Ok(Reply { status, body })
    }

    pub async fn get_document(&self, path: &str) -> Result<Option<Value>, String> {
        let reply = self
            .send(Method::GET, &self.document_url(path), &[], None)
            .await?;
        if reply.status == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        reply.into_result(&format!("get {path}")).map(Some)
    }

    pub async fn delete_document(&self, path: &str) -> Result<(), String> {
        let reply = self
            .send(Method::DELETE, &self.document_url(path), &[], None)
            .await?;
        if reply.status == StatusCode::NOT_FOUND {
            return Ok(());
        }
        reply.into_result(&format!("delete {path}")).map(|_| ())
    }

    pub async fn write_document(
        &self,
        path: &str,
        document_fields: &Map<String, Value>,
        masked: bool,
        precondition: Precondition<'_>,
    ) -> Result<Reply, String> {
        let mut query: Vec<(&str, &str)> = Vec::new();
        if masked {
            query.extend(
                document_fields
                    .keys()
                    .map(|key| ("updateMask.fieldPaths", key.as_str())),
            );
        }
        match precondition {
            Precondition::Exists(true) => query.push(("currentDocument.exists", "true")),
            Precondition::Exists(false) => query.push(("currentDocument.exists", "false")),
            Precondition::UpdateTime(time) => query.push(("currentDocument.updateTime", time)),
            Precondition::Unconditional => {}
        }
        self.send(
            Method::PATCH,
            &self.document_url(path),
            &query,
            Some(&json!({ "fields": document_fields })),
        )
        .await
    }

    pub async fn commit_reply(&self, writes: Vec<Value>) -> Result<Reply, String> {
        self.send(
            Method::POST,
            &format!("{}:commit", self.documents_url),
            &[],
            Some(&json!({ "writes": writes })),
        )
        .await
    }

    pub async fn commit(&self, writes: Vec<Value>) -> Result<Value, String> {
        self.commit_reply(writes).await?.into_result("commit")
    }

    pub async fn commit_chunked(&self, mut writes: Vec<Value>) -> Result<(), String> {
        while !writes.is_empty() {
            let take = writes.len().min(config::FIRESTORE_BATCH_LIMIT);
            let batch: Vec<Value> = writes.drain(..take).collect();
            self.commit(batch).await?;
        }
        Ok(())
    }

    pub async fn run_query(
        &self,
        parent_path: &str,
        structured_query: Value,
    ) -> Result<Vec<Value>, String> {
        let url = if parent_path.is_empty() {
            format!("{}:runQuery", self.documents_url)
        } else {
            format!("{}/{parent_path}:runQuery", self.documents_url)
        };
        let rows = self
            .send(
                Method::POST,
                &url,
                &[],
                Some(&json!({ "structuredQuery": structured_query })),
            )
            .await?
            .into_result("runQuery")?;
        Ok(rows
            .as_array()
            .map(|rows| {
                rows.iter()
                    .filter_map(|row| row.get("document").cloned())
                    .collect()
            })
            .unwrap_or_default())
    }
}
