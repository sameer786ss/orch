use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy)]
pub struct Rates {
    pub input_per_mtok: f64,
    pub output_per_mtok: f64,
}

impl Rates {
    pub fn cost_usd(&self, input_tokens: u64, output_tokens: u64) -> f64 {
        (input_tokens as f64 * self.input_per_mtok + output_tokens as f64 * self.output_per_mtok)
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
    pub rates: Rates,
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

const FLASH_RATES: Rates = Rates {
    input_per_mtok: 5.0,
    output_per_mtok: 15.0,
};

pub static VERTEX_MODELS: [StaticModelInfo; 1] = [StaticModelInfo {
    id: "gemini-3.8-flash-high",
    name: "Swift",
    provider: "vertex",
    context_window: 1_000_000,
    max_tokens: 65_536,
    capabilities: CAPABILITIES,
    badge: Some("Value"),
    rates: FLASH_RATES,
}];

pub fn resolve_static_model(id: &str) -> Option<&'static StaticModelInfo> {
    VERTEX_MODELS.iter().find(|model| model.id == id)
}

pub fn vertex_models_dto() -> Vec<ModelInfo> {
    VERTEX_MODELS.iter().map(StaticModelInfo::to_model_info).collect()
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GeminiUsage {
    prompt_token_count: u64,
    tool_use_prompt_token_count: u64,
    candidates_token_count: u64,
    thoughts_token_count: u64,
}

impl GeminiUsage {
    pub fn from_response(response: &Value) -> Result<Option<Self>, serde_json::Error> {
        response
            .get("usageMetadata")
            .map(Self::deserialize)
            .transpose()
    }

    pub fn cost_usd(&self, rates: &Rates) -> f64 {
        rates.cost_usd(
            self.prompt_token_count + self.tool_use_prompt_token_count,
            self.candidates_token_count + self.thoughts_token_count,
        )
    }
}
