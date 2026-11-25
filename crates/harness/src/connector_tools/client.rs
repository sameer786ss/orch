use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppError;

#[derive(Debug, thiserror::Error)]
pub enum ComposioError {
    #[error("You are signed out of Orch. Sign in again to use connectors.")]
    NoToken,
    #[error("{message}")]
    Rejected {
        status: u16,
        code: Option<String>,
        message: String,
    },
    #[error("The connector service could not be reached: {0}")]
    Transport(String),
    #[error("The connector service sent an unexpected response: {0}")]
    Malformed(String),
}

impl From<ComposioError> for AppError {
    fn from(error: ComposioError) -> Self {
        match error {
            ComposioError::NoToken => AppError::NoToken,
            other => AppError::Connector(other.to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorCatalogEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub icon_url: Option<String>,
    pub tool_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountWire {
    pub id: String,
    pub toolkit: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolWire {
    pub slug: String,
    pub description: String,
    pub version: String,
    pub is_deprecated: bool,
    pub tags: Vec<String>,
    pub input_parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteWire {
    pub data: Value,
    pub error: Option<String>,
    pub successful: bool,
}

#[async_trait]
pub trait ComposioTransport: Send + Sync {
    async fn catalog(&self) -> Result<Vec<ConnectorCatalogEntry>, ComposioError>;
    async fn accounts(&self) -> Result<Vec<AccountWire>, ComposioError>;
    async fn connect(&self, toolkit: &str) -> Result<String, ComposioError>;
    async fn disconnect(&self, account_id: &str) -> Result<(), ComposioError>;
    async fn toolkit_tools(&self, toolkit: &str) -> Result<Vec<ToolWire>, ComposioError>;
    async fn execute(
        &self,
        slug: &str,
        version: &str,
        arguments: Value,
    ) -> Result<ExecuteWire, ComposioError>;
}
