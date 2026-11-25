use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use jsonwebtoken::DecodingKey;
use moka::future::Cache;
use orchharness::connectors::{ConnectorCatalogEntry, ConnectorSpecCache};

use crate::cloud::e2b::SandboxManager;
use crate::cloud::runs::LiveRun;
use crate::local::v1internal::VertexTokenPool;
use crate::shared::auth::CachedUser;
use crate::shared::budget::BudgetStatus;
use crate::shared::config::{self, Config};
use crate::shared::firestore::FirestoreClient;

const USER_AGENT: &str = concat!("OrchCloud/", env!("CARGO_PKG_VERSION"));

#[derive(Clone)]
pub struct ServerState {
    pub config: Arc<Config>,
    pub http: reqwest::Client,
    pub streaming_http: reqwest::Client,
    pub firestore: FirestoreClient,
    pub auth_cache: Cache<String, CachedUser>,
    pub auth_key_cache: Cache<String, Arc<DecodingKey>>,
    pub budget_cache: Cache<String, BudgetStatus>,
    pub connector_specs_cache: ConnectorSpecCache,
    pub connector_catalog_cache: Cache<(), Arc<Vec<ConnectorCatalogEntry>>>,
    pub vertex_pool: VertexTokenPool,
    pub sandbox_manager: SandboxManager,
    pub active_runs: Arc<DashMap<String, Arc<LiveRun>>>,
}

impl ServerState {
    pub async fn new(config: Config) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(config::HTTP_CONNECT_TIMEOUT_SECS))
            .timeout(Duration::from_secs(config::HTTP_REQUEST_TIMEOUT_SECS))
            .build()
            .expect("failed to build http client");
        let streaming_http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(config::HTTP_CONNECT_TIMEOUT_SECS))
            .tcp_nodelay(true)
            .build()
            .expect("failed to build streaming http client");
        let firestore = FirestoreClient::new(http.clone(), &config.project_id).await;
        let vertex_pool = VertexTokenPool::new(&config.antigravity, http.clone());
        let connector_specs_cache = moka::future::Cache::builder()
            .time_to_live(Duration::from_secs(300))
            .build();
        let connector_catalog_cache = moka::future::Cache::builder()
            .time_to_live(Duration::from_secs(300))
            .build();
        let config = Arc::new(config);
        let sandbox_manager = SandboxManager::new(
            config.clone(),
            http.clone(),
            streaming_http.clone(),
            firestore.clone(),
        );
        Self {
            config,
            http,
            streaming_http,
            firestore,
            auth_cache: Cache::builder()
                .time_to_live(Duration::from_secs(config::AUTH_CACHE_TTL_SECS))
                .max_capacity(config::AUTH_CACHE_CAPACITY)
                .build(),
            auth_key_cache: Cache::builder()
                .time_to_live(Duration::from_secs(3600))
                .max_capacity(16)
                .build(),
            budget_cache: Cache::builder()
                .time_to_live(Duration::from_secs(config::BUDGET_CACHE_TTL_SECS))
                .max_capacity(config::AUTH_CACHE_CAPACITY)
                .build(),
            connector_specs_cache,
            connector_catalog_cache,
            vertex_pool,
            sandbox_manager,
            active_runs: Arc::new(DashMap::new()),
        }
    }
}
