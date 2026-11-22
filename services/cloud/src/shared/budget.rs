use std::time::Duration;

use axum::extract::State;
use axum::http::StatusCode;
use axum::{Extension, Json};
use chrono::{Datelike, Utc};
use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::shared::auth::VerifiedUser;
use crate::shared::config;
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::firestore::{fields, FirestoreClient, Precondition};
use crate::state::ServerState;

const BUDGET_COLLECTION: &str = "budget";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetStatus {
    pub cost_usd: f64,
    pub limit_usd: f64,
    pub remaining: f64,
    pub period: String,
    pub resets_on: String,
    pub allowed: bool,
}

impl BudgetStatus {
    fn new(cost_usd: f64, limit_usd: f64, period: &Period) -> Self {
        let remaining = (limit_usd - cost_usd).max(0.0);
        Self {
            cost_usd,
            limit_usd,
            remaining,
            period: period.id.clone(),
            resets_on: period.resets_on.clone(),
            allowed: remaining > 0.0,
        }
    }

    pub fn exceeded_error(&self) -> ApiError {
        ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            format!(
                "Monthly budget of ${:.2} reached. Used: ${:.2}. Resets {}.",
                self.limit_usd, self.cost_usd, self.resets_on
            ),
        )
        .with_code("BUDGET_EXCEEDED")
        .with_field("cost_usd", self.cost_usd)
        .with_field("limit_usd", self.limit_usd)
        .with_field("period", self.period.clone())
        .with_field("resets_on", self.resets_on.clone())
    }
}

struct Period {
    id: String,
    resets_on: String,
}

fn current_period() -> Period {
    let today = Utc::now().date_naive();
    let (next_year, next_month) = if today.month() == 12 {
        (today.year() + 1, 1)
    } else {
        (today.year(), today.month() + 1)
    };
    Period {
        id: format!("{:04}-{:02}", today.year(), today.month()),
        resets_on: format!("{next_year:04}-{next_month:02}-01"),
    }
}

fn firestore_budget_limit(stored: &Value) -> Result<f64, String> {
    if stored.get("limitUsd").is_none() {
        return Err("Firebase budget document has no limitUsd".to_string());
    }
    let limit = fields::read_f64(stored, "limitUsd");
    if !limit.is_finite() || limit < 0.0 {
        return Err("Firebase budget limitUsd must be a finite non-negative number".to_string());
    }
    Ok(limit)
}

impl FirestoreClient {
    async fn budget_cost(&self, user_id: &str, period: &Period) -> Result<(f64, f64), String> {
        let path = format!("{BUDGET_COLLECTION}/{user_id}");
        for _ in 0..config::BUDGET_WRITE_ATTEMPTS {
            let existing = self.get_document(&path).await?;
            let Some(document) = &existing else {
                return Err("Firebase budget document is missing".to_string());
            };
            let stored = document.get("fields").unwrap_or(&Value::Null);
            let limit = firestore_budget_limit(stored)?;
            if fields::read_string(stored, "period") == period.id {
                return Ok((fields::read_f64(stored, "costUsd"), limit));
            }

            let update_time = document
                .get("updateTime")
                .and_then(Value::as_str)
                .ok_or_else(|| "Firebase budget document has no updateTime".to_string())?;
            let mut reset = Map::new();
            reset.insert("costUsd".to_string(), fields::double(0.0));
            reset.insert("limitUsd".to_string(), fields::double(limit));
            reset.insert("period".to_string(), fields::string(&period.id));
            let reply = self
                .write_document(
                    &path,
                    &reset,
                    false,
                    Precondition::UpdateTime(update_time),
                )
                .await?;
            if reply.status.is_success() {
                return Ok((0.0, limit));
            }
            if !reply.is_precondition_failure() {
                return Err(reply.error("budget reset"));
            }
        }
        Err("Firestore budget reset kept conflicting".to_string())
    }

    async fn add_budget_cost(
        &self,
        user_id: &str,
        period: &Period,
        cost_usd: f64,
    ) -> Result<f64, String> {
        self.budget_cost(user_id, period).await?;
        let path = format!("{BUDGET_COLLECTION}/{user_id}");
        let committed = self
            .commit(vec![json!({
                "update": { "name": self.document_name(&path) },
                "updateMask": { "fieldPaths": [] },
                "updateTransforms": [{
                    "fieldPath": "costUsd",
                    "increment": { "doubleValue": cost_usd },
                }],
            })])
            .await?;
        committed
            .pointer("/writeResults/0/transformResults/0")
            .map(fields::read_number)
            .ok_or_else(|| "Firestore budget increment returned no result".to_string())
    }
}

pub async fn handle(
    State(state): State<ServerState>,
    Extension(user): Extension<VerifiedUser>,
) -> ApiResult<Json<BudgetStatus>> {
    Ok(Json(state.budget(&user.id).await?))
}

impl ServerState {
    pub async fn budget(&self, user_id: &str) -> ApiResult<BudgetStatus> {
        if let Some(cached) = self.budget_cache.get(user_id).await {
            return Ok(cached);
        }
        let period = current_period();
        let (cost, limit) = self.firestore.budget_cost(user_id, &period).await?;
        let status = BudgetStatus::new(cost, limit, &period);
        self.budget_cache
            .insert(user_id.to_string(), status.clone())
            .await;
        Ok(status)
    }

    pub async fn require_budget(&self, user_id: &str) -> ApiResult<BudgetStatus> {
        let status = self.budget(user_id).await?;
        if status.allowed {
            Ok(status)
        } else {
            Err(status.exceeded_error())
        }
    }

    pub async fn record_cost(&self, user_id: &str, cost_usd: f64) -> Option<f64> {
        if cost_usd <= 0.0 {
            return None;
        }
        let period = current_period();
        let mut outcome = None;
        for attempt in 1..=config::BUDGET_WRITE_ATTEMPTS {
            match self.firestore.add_budget_cost(user_id, &period, cost_usd).await {
                Ok(total) => {
                    outcome = Some(total);
                    break;
                }
                Err(error) => {
                    tracing::error!(user = user_id, attempt, %error, "failed to record usage cost");
                    if attempt < config::BUDGET_WRITE_ATTEMPTS {
                        tokio::time::sleep(Duration::from_millis(200 * u64::from(attempt))).await;
                    }
                }
            }
        }
        self.budget_cache.invalidate(user_id).await;
        outcome
    }
}
