use std::fmt::Display;

use axum::extract::rejection::{JsonRejection, PathRejection, QueryRejection};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{Map, Value};

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub body: Map<String, Value>,
}

impl ApiError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        let mut body = Map::new();
        body.insert("error".to_string(), Value::String(message.into()));
        Self { status, body }
    }

    pub fn with_code(self, code: impl Into<String>) -> Self {
        self.with_field("code", code.into())
    }

    pub fn with_field(mut self, key: &str, value: impl Into<Value>) -> Self {
        self.body.insert(key.to_string(), value.into());
        self
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, message)
    }

    pub fn payload_too_large(message: impl Into<String>) -> Self {
        Self::new(StatusCode::PAYLOAD_TOO_LARGE, message)
    }

    pub fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "Unauthorized").with_code("INVALID_TOKEN")
    }

    pub fn unavailable(message: impl Into<String>) -> Self {
        Self::new(StatusCode::SERVICE_UNAVAILABLE, message)
    }

    pub fn bad_gateway(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_GATEWAY, message)
    }

    pub fn gateway_timeout(message: impl Into<String>) -> Self {
        Self::new(StatusCode::GATEWAY_TIMEOUT, message).with_code("UPSTREAM_TIMEOUT")
    }

    pub fn internal(detail: impl Display) -> Self {
        tracing::error!(%detail, "internal error");
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
    }

    pub fn unreachable(service: &str, error: reqwest::Error) -> Self {
        let error = error.without_url();
        tracing::warn!(service, %error, "upstream request failed");
        if error.is_timeout() {
            Self::gateway_timeout(format!("{service} did not respond in time"))
        } else {
            Self::bad_gateway(format!("{service} is unreachable"))
        }
    }

    pub fn upstream_failure(service: &str, status: u16, detail: &str) -> Self {
        tracing::warn!(service, status, detail, "upstream returned an error");
        Self::upstream(status, format!("{service} returned an error"))
    }

    pub fn upstream(status: u16, message: impl Into<String>) -> Self {
        let mapped = match status {
            429 => StatusCode::TOO_MANY_REQUESTS,
            408 | 504 => StatusCode::GATEWAY_TIMEOUT,
            401 | 403 => StatusCode::BAD_GATEWAY,
            400..=499 => StatusCode::BAD_REQUEST,
            _ => StatusCode::BAD_GATEWAY,
        };
        Self::new(mapped, message)
    }

    pub fn message(&self) -> &str {
        self.body
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("Request failed")
    }
}

impl From<String> for ApiError {
    fn from(detail: String) -> Self {
        Self::internal(detail)
    }
}

macro_rules! from_rejection {
    ($($rejection:ty),*) => {
        $(
            impl From<$rejection> for ApiError {
                fn from(rejection: $rejection) -> Self {
                    Self::new(rejection.status(), rejection.body_text())
                }
            }
        )*
    };
}

from_rejection!(JsonRejection, QueryRejection, PathRejection);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(Value::Object(self.body))).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
