use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy)]
pub struct ModelRates {
    pub input_per_mtok: f64,
    pub cached_input_per_mtok: f64,
    pub output_per_mtok: f64,
}

impl ModelRates {
    pub fn cost_usd(self, input_tokens: u64, cached_input_tokens: u64, output_tokens: u64) -> f64 {
        let cached = cached_input_tokens.min(input_tokens);
        let uncached = input_tokens.saturating_sub(cached);
        (uncached as f64 * self.input_per_mtok
            + cached as f64 * self.cached_input_per_mtok
            + output_tokens as f64 * self.output_per_mtok)
            / 1_000_000.0
    }
}

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
    #[serde(default)]
    pub thinking_efforts: Vec<String>,
}

impl ModelInfo {
    pub fn supports_images(&self) -> bool {
        self.capabilities.iter().any(|c| c == "images")
    }

    pub fn default_thinking_effort(&self) -> &str {
        self.thinking_efforts
            .first()
            .map(String::as_str)
            .unwrap_or(THINKING_EFFORTS[0])
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
    pub thinking_efforts: &'static [&'static str],
    pub rates: ModelRates,
}

impl StaticModelInfo {
    pub fn to_model_info(&self) -> ModelInfo {
        ModelInfo {
            id: self.id.to_string(),
            name: self.name.to_string(),
            provider: self.provider.to_string(),
            context_window: self.context_window,
            max_tokens: self.max_tokens,
            capabilities: self.capabilities.iter().map(|s| (*s).to_string()).collect(),
            badge: self.badge.map(str::to_string),
            thinking_efforts: self.thinking_efforts.iter().map(|s| (*s).to_string()).collect(),
        }
    }
}

const CAPABILITIES: &[&str] = &["tools", "streaming", "thinking", "images"];
const THINKING_EFFORTS: &[&str] = &["low", "medium", "high"];

pub static VERTEX_MODELS: [StaticModelInfo; 1] = [StaticModelInfo {
    id: "gemini-4-hydrogen-sonar",
    name: "Swift",
    provider: "vertex",
    context_window: 1_000_000,
    max_tokens: 65_536,
    capabilities: CAPABILITIES,
    badge: Some("Value"),
    thinking_efforts: THINKING_EFFORTS,
    rates: ModelRates {
        input_per_mtok: 5.0,
        cached_input_per_mtok: 0.5,
        output_per_mtok: 15.0,
    },
}];

pub fn resolve_static_model(id: &str) -> Option<&'static StaticModelInfo> {
    VERTEX_MODELS.iter().find(|model| model.id == id)
}

pub fn vertex_models_dto() -> Vec<ModelInfo> {
    VERTEX_MODELS.iter().map(StaticModelInfo::to_model_info).collect()
}
