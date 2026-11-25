use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use futures::future::try_join_all;
use moka::future::Cache;
use rig::tool::DynamicTool;

pub use crate::connector_tools::client::ConnectorCatalogEntry;
use crate::connector_tools::client::{AccountWire, ComposioTransport};
use crate::connector_tools::tool::ToolSpec;
use crate::error::{AppError, AppResult};

const ACTIVE_STATUS: &str = "ACTIVE";
const DEFINITIONS_TTL: Duration = Duration::from_secs(300);

pub struct PreparedConnectors {
    pub tools: Vec<DynamicTool>,
    pub connectors: Vec<ConnectorCatalogEntry>,
}

pub type ConnectorSpecCache = Cache<String, Arc<Vec<ToolSpec>>>;

pub struct ConnectorManager {
    client: Arc<dyn ComposioTransport>,
    specs_cache: ConnectorSpecCache,
    accounts_cache: Cache<(), Arc<Vec<AccountWire>>>,
    catalog_cache: Cache<(), Arc<Vec<ConnectorCatalogEntry>>>,
}

impl ConnectorManager {
    pub fn new(client: Arc<dyn ComposioTransport>) -> Self {
        let specs_cache = Cache::builder().time_to_live(DEFINITIONS_TTL).build();
        Self::new_with_specs_cache(client, specs_cache)
    }

    pub fn new_with_specs_cache(
        client: Arc<dyn ComposioTransport>,
        specs_cache: ConnectorSpecCache,
    ) -> Self {
        let accounts_cache = Cache::builder()
            .time_to_live(Duration::from_secs(30))
            .build();
        let catalog_cache = Cache::builder()
            .time_to_live(DEFINITIONS_TTL)
            .build();
        Self {
            client,
            specs_cache,
            accounts_cache,
            catalog_cache,
        }
    }

    pub fn clear_cache(&self) {
        self.specs_cache.invalidate_all();
        self.accounts_cache.invalidate_all();
        self.catalog_cache.invalidate_all();
    }

    pub async fn catalog(&self) -> AppResult<Vec<ConnectorCatalogEntry>> {
        let client = self.client.clone();
        let cached = self
            .catalog_cache
            .try_get_with((), async move {
                client.catalog().await.map(Arc::new).map_err(AppError::from)
            })
            .await
            .map_err(|e| AppError::Connector(e.to_string()))?;
        Ok((*cached).clone())
    }

    async fn get_accounts(&self) -> AppResult<Arc<Vec<AccountWire>>> {
        let client = self.client.clone();
        self.accounts_cache
            .try_get_with((), async move {
                client.accounts().await.map(Arc::new).map_err(AppError::from)
            })
            .await
            .map_err(|e| AppError::Connector(e.to_string()))
    }

    pub async fn connected_ids(&self) -> AppResult<Vec<String>> {
        let accounts = self.get_accounts().await?;
        let mut seen = HashSet::new();
        Ok(accounts
            .iter()
            .filter(|account| account.status == ACTIVE_STATUS)
            .map(|account| account.toolkit.to_ascii_lowercase())
            .filter(|id| seen.insert(id.clone()))
            .collect())
    }

    pub async fn begin_connect(&self, id: &str) -> AppResult<String> {
        let toolkit = id.trim().to_ascii_lowercase();
        self.accounts_cache.invalidate_all();
        self.specs_cache.invalidate_all();
        Ok(self.client.connect(&toolkit).await?)
    }

    pub async fn disconnect(&self, id: &str) -> AppResult<()> {
        let toolkit = id.trim().to_ascii_lowercase();
        let accounts = self.client.accounts().await?;
        let account = accounts
            .iter()
            .find(|account| {
                account.toolkit.eq_ignore_ascii_case(&toolkit) && account.status == ACTIVE_STATUS
            })
            .ok_or_else(|| AppError::ConnectorNotConnected(toolkit.clone()))?;
        self.accounts_cache.invalidate_all();
        self.specs_cache.invalidate_all();
        Ok(self.client.disconnect(&account.id).await?)
    }

    pub async fn prepare(&self, ids: &[String]) -> AppResult<PreparedConnectors> {
        let mut seen = HashSet::new();
        let unique: Vec<String> = ids
            .iter()
            .map(|id| id.trim().to_ascii_lowercase())
            .filter(|id| !id.is_empty() && seen.insert(id.clone()))
            .collect();
        if unique.is_empty() {
            return Ok(PreparedConnectors {
                tools: Vec::new(),
                connectors: Vec::new(),
            });
        }

        let (catalog, accounts) = tokio::try_join!(self.catalog(), self.get_accounts())?;
        let mut selected = Vec::with_capacity(unique.len());
        for id in &unique {
            let entry = catalog
                .iter()
                .find(|entry| entry.id.eq_ignore_ascii_case(id))
                .cloned()
                .ok_or_else(|| AppError::ConnectorNotFound(id.clone()))?;
            if !is_connected(&accounts, &entry.id) {
                return Err(AppError::ConnectorNotConnected(entry.name));
            }
            selected.push(entry);
        }

        let sets = try_join_all(selected.iter().map(|entry| self.specs(entry))).await?;
        let mut tools = Vec::new();
        for set in sets {
            for spec in set.iter() {
                tools.push(spec.clone().into_tool(self.client.clone())?);
            }
        }
        Ok(PreparedConnectors {
            tools,
            connectors: selected,
        })
    }

    async fn specs(&self, entry: &ConnectorCatalogEntry) -> AppResult<Arc<Vec<ToolSpec>>> {
        let client = self.client.clone();
        let toolkit = entry.id.clone();
        let name = entry.name.clone();
        self.specs_cache
            .try_get_with(entry.id.clone(), async move {
                let wires = client.toolkit_tools(&toolkit).await?;
                let mut specs = Vec::with_capacity(wires.len());
                for wire in wires {
                    if wire.is_deprecated {
                        continue;
                    }
                    let slug = wire.slug.clone();
                    let spec = ToolSpec::from_wire(wire)
                        .map_err(|reason| AppError::Connector(format!("{slug}: {reason}")))?;
                    specs.push(spec);
                }
                if specs.is_empty() {
                    return Err(AppError::Connector(format!(
                        "No tools are available for {name}"
                    )));
                }
                Ok(Arc::new(specs))
            })
            .await
            .map_err(|e| AppError::Connector(e.to_string()))
    }
}

fn is_connected(accounts: &[AccountWire], toolkit: &str) -> bool {
    accounts
        .iter()
        .any(|account| account.toolkit.eq_ignore_ascii_case(toolkit) && account.status == ACTIVE_STATUS)
}
