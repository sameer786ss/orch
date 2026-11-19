use std::time::Duration;

use axum::extract::State;
use axum::Json;
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use reqwest::multipart::{Form, Part};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::shared::config;
use crate::shared::error::{ApiError, ApiResult};
use crate::shared::extract::ApiJson;
use crate::state::ServerState;

const SERVICE: &str = "Transcription service";
const REQUEST_TIMEOUT_SECS: u64 = 60;
const AUDIO_FORMATS: [&str; 10] = [
    "flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "ogg", "opus", "wav", "webm",
];

#[derive(Deserialize)]
pub struct TranscribeRequest {
    audio: String,
    format: String,
}

#[derive(Deserialize)]
struct Transcription {
    text: String,
}

pub async fn handle(
    State(state): State<ServerState>,
    ApiJson(request): ApiJson<TranscribeRequest>,
) -> ApiResult<Json<Value>> {
    if !AUDIO_FORMATS.contains(&request.format.as_str()) {
        return Err(ApiError::bad_request(format!(
            "Unsupported audio format. Use one of: {}",
            AUDIO_FORMATS.join(", ")
        )));
    }
    let audio = STANDARD
        .decode(&request.audio)
        .map_err(|_| ApiError::bad_request("Invalid base64 audio"))?;
    if audio.is_empty() {
        return Err(ApiError::bad_request("audio is required"));
    }

    let mime = mime_guess::from_ext(&request.format)
        .first()
        .ok_or_else(|| ApiError::internal(format!("no mime type for {}", request.format)))?;
    let part = Part::bytes(audio)
        .file_name(format!("audio.{}", request.format))
        .mime_str(mime.essence_str())
        .map_err(ApiError::internal)?;
    let form = Form::new()
        .part("file", part)
        .text("model", config::GROQ_TRANSCRIBE_MODEL);

    let response = state
        .http
        .post(config::GROQ_TRANSCRIBE_URL)
        .bearer_auth(&state.config.groq_api_key)
        .multipart(form)
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .send()
        .await
        .map_err(|error| ApiError::unreachable(SERVICE, error))?;

    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        return Err(ApiError::upstream_failure(SERVICE, status.as_u16(), &detail));
    }
    let transcription: Transcription = response
        .json()
        .await
        .map_err(|error| ApiError::unreachable(SERVICE, error))?;
    Ok(Json(json!({ "text": transcription.text })))
}
