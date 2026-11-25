use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use orchharness::connector_tools::client::{
    AccountWire, ComposioError, ComposioTransport, ConnectorCatalogEntry, ExecuteWire, ToolWire,
};
pub use orchharness::connectors::ConnectorManager;
use orchharness::util::truncate_chars;
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::config;
use crate::gateway::TokenHandle;

const ACCOUNTS_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const TOOLS_TIMEOUT: Duration = Duration::from_secs(45);
const EXECUTE_TIMEOUT: Duration = Duration::from_secs(130);

#[derive(Deserialize)]
struct AccountsWire {
    accounts: Vec<AccountWire>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectWire {
    redirect_url: String,
}

#[derive(Deserialize)]
struct ToolsWire {
    tools: Vec<ToolWire>,
}

#[derive(Deserialize)]
struct FailureWire {
    error: Option<String>,
    code: Option<String>,
}

#[derive(Clone)]
pub struct GatewayComposioTransport {
    http: reqwest_middleware::ClientWithMiddleware,
    http_without_retries: reqwest::Client,
    token: TokenHandle,
}

impl GatewayComposioTransport {
    pub fn new(token: TokenHandle) -> Self {
        Self {
            http: orchharness::util::retry_http_client(),
            http_without_retries: orchharness::util::http_client(),
            token,
        }
    }

    fn bearer(&self) -> Result<SecretString, ComposioError> {
        self.token
            .load_full()
            .filter(|token| !token.expose_secret().is_empty())
            .map(|token| token.as_ref().clone())
            .ok_or(ComposioError::NoToken)
    }

    async fn decode_response<T: for<'de> Deserialize<'de>>(
        response: reqwest::Response,
    ) -> Result<T, ComposioError> {
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| ComposioError::Transport(e.to_string()))?;
        if !status.is_success() {
            let (code, message) = if let Ok(failure) = serde_json::from_str::<FailureWire>(&body) {
                (
                    failure.code,
                    failure
                        .error
                        .unwrap_or_else(|| format!("The connector service failed ({})", status.as_u16())),
                )
            } else {
                (
                    None,
                    format!("status {}: {}", status.as_u16(), truncate_chars(&body, 200)),
                )
            };
            return Err(ComposioError::Rejected {
                status: status.as_u16(),
                code,
                message,
            });
        }
        serde_json::from_str(&body)
            .map_err(|e| ComposioError::Malformed(format!("{e}: {}", truncate_chars(&body, 200))))
    }

    async fn send_retry<T: for<'de> Deserialize<'de>>(
        &self,
        request: reqwest_middleware::RequestBuilder,
        timeout: Duration,
    ) -> Result<T, ComposioError> {
        let response = request
            .bearer_auth(self.bearer()?.expose_secret().to_string())
            .timeout(timeout)
            .send()
            .await
            .map_err(|e| ComposioError::Transport(e.to_string()))?;
        Self::decode_response(response).await
    }

    async fn send_once<T: for<'de> Deserialize<'de>>(
        &self,
        request: reqwest::RequestBuilder,
        timeout: Duration,
    ) -> Result<T, ComposioError> {
        let response = request
            .bearer_auth(self.bearer()?.expose_secret().to_string())
            .timeout(timeout)
            .send()
            .await
            .map_err(|e| ComposioError::Transport(e.to_string()))?;
        Self::decode_response(response).await
    }
}

#[async_trait]
impl ComposioTransport for GatewayComposioTransport {
    async fn catalog(&self) -> Result<Vec<ConnectorCatalogEntry>, ComposioError> {
        self.send_retry(
            self.http.get(config::composio_url("/catalog")),
            ACCOUNTS_TIMEOUT,
        )
        .await
    }

    async fn accounts(&self) -> Result<Vec<AccountWire>, ComposioError> {
        let wire: AccountsWire = self
            .send_retry(self.http.get(config::composio_url("/accounts")), ACCOUNTS_TIMEOUT)
            .await?;
        Ok(wire.accounts)
    }

    async fn connect(&self, toolkit: &str) -> Result<String, ComposioError> {
        let wire: ConnectWire = self
            .send_once(
                self.http_without_retries
                    .post(config::composio_url("/connect"))
                    .json(&json!({ "toolkit": toolkit, "platform": "desktop" })),
                CONNECT_TIMEOUT,
            )
            .await?;
        Ok(wire.redirect_url)
    }

    async fn disconnect(&self, account_id: &str) -> Result<(), ComposioError> {
        let mut url = reqwest::Url::parse(&config::composio_url("/accounts"))
            .map_err(|e| ComposioError::Transport(e.to_string()))?;
        url.path_segments_mut()
            .map_err(|_| ComposioError::Transport("invalid composio accounts url".to_string()))?
            .push(account_id);
        let _: Value = self
            .send_once(self.http_without_retries.delete(url), ACCOUNTS_TIMEOUT)
            .await?;
        Ok(())
    }

    async fn toolkit_tools(&self, toolkit: &str) -> Result<Vec<ToolWire>, ComposioError> {
        let mut url = reqwest::Url::parse(&config::composio_url("/tools"))
            .map_err(|e| ComposioError::Transport(e.to_string()))?;
        url.query_pairs_mut().append_pair("toolkit", toolkit);
        let wire: ToolsWire = self.send_retry(self.http.get(url), TOOLS_TIMEOUT).await?;
        Ok(wire.tools)
    }

    async fn execute(
        &self,
        slug: &str,
        version: &str,
        arguments: Value,
    ) -> Result<ExecuteWire, ComposioError> {
        self.send_once(
            self.http_without_retries
                .post(config::composio_url("/execute"))
                .json(&json!({ "slug": slug, "version": version, "arguments": arguments })),
            EXECUTE_TIMEOUT,
        )
        .await
    }
}

pub fn new_connector_manager(token: TokenHandle) -> ConnectorManager {
    ConnectorManager::new(Arc::new(GatewayComposioTransport::new(token)))
}
