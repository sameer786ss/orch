use serde::{Deserialize, Serialize};


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub context_window: u64,
    pub max_tokens: u64,
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub badge: Option<String>,
}

impl ModelInfo {
    pub fn supports_images(&self) -> bool {
        self.capabilities.iter().any(|c| c == "images")
    }
}

#[derive(Debug, Clone, Copy)]
pub struct StaticModelInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub provider: &'static str,
    pub context_window: u64,
    pub max_tokens: u64,
    pub capabilities: &'static [&'static str],
    pub badge: Option<&'static str>,
}

impl StaticModelInfo {
    pub fn supports_images(&self) -> bool {
        self.capabilities.contains(&"images")
    }

    pub fn to_model_info(&self) -> ModelInfo {
        ModelInfo {
            id: self.id.to_string(),
            name: self.name.to_string(),
            provider: self.provider.to_string(),
            context_window: self.context_window,
            max_tokens: self.max_tokens,
            capabilities: self.capabilities.iter().map(|s| (*s).to_string()).collect(),
            badge: self.badge.map(str::to_string),
        }
    }
}

const CAPABILITIES: &[&str] = &["tools", "streaming", "thinking", "images"];

pub static VERTEX_MODELS: [StaticModelInfo; 1] = [StaticModelInfo {
    id: "gemini-3.8-flash-high",
    name: "Swift",
    provider: "vertex",
    context_window: 1_000_000,
    max_tokens: 65_536,
    capabilities: CAPABILITIES,
    badge: Some("Value"),
}];

pub fn resolve_static_model(id: &str) -> Option<&'static StaticModelInfo> {
    VERTEX_MODELS.iter().find(|model| model.id == id)
}

pub fn vertex_models_dto() -> Vec<ModelInfo> {
    VERTEX_MODELS.iter().map(StaticModelInfo::to_model_info).collect()
}

