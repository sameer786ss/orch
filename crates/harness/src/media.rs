use base64::Engine;
use rig::message::ImageMediaType;

use crate::error::{AppError, AppResult};

pub const RASTER_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "heic", "heif"];

pub fn is_raster_extension(ext: &str) -> bool {
    RASTER_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str())
}

pub fn is_pdf_extension(ext: &str) -> bool {
    ext.eq_ignore_ascii_case("pdf")
}

fn extension_image_media_type(ext: &str) -> Option<ImageMediaType> {
    match ext.to_ascii_lowercase().as_str() {
        "png" => Some(ImageMediaType::PNG),
        "jpg" | "jpeg" => Some(ImageMediaType::JPEG),
        "webp" => Some(ImageMediaType::WEBP),
        "heic" => Some(ImageMediaType::HEIC),
        "heif" => Some(ImageMediaType::HEIF),
        _ => None,
    }
}

pub fn detect_image_media_type(bytes: &[u8], ext: &str) -> Option<ImageMediaType> {
    ImageMediaType::sniff(bytes).or_else(|| extension_image_media_type(ext))
}

pub fn encode_native_image_for_user(
    bytes: &[u8],
    ext: &str,
) -> AppResult<(String, ImageMediaType)> {
    let media = detect_image_media_type(bytes, ext)
        .filter(|m| {
            matches!(
                m,
                ImageMediaType::PNG
                    | ImageMediaType::JPEG
                    | ImageMediaType::WEBP
                    | ImageMediaType::HEIC
                    | ImageMediaType::HEIF
            )
        })
        .ok_or_else(|| {
            AppError::other(format!(
                "unsupported image format '{ext}' for Gemini native input (supported: png, jpg, webp, heic, heif)"
            ))
        })?;
    Ok((
        base64::engine::general_purpose::STANDARD.encode(bytes),
        media,
    ))
}

pub fn encode_native_image_for_tool(
    bytes: &[u8],
    ext: &str,
) -> AppResult<(String, ImageMediaType)> {
    let media = detect_image_media_type(bytes, ext)
        .filter(|m| {
            matches!(
                m,
                ImageMediaType::PNG | ImageMediaType::JPEG | ImageMediaType::WEBP
            )
        })
        .ok_or_else(|| {
            AppError::other(format!(
                "unsupported image format '{ext}' for tool image response (supported: png, jpg, webp)"
            ))
        })?;
    Ok((
        base64::engine::general_purpose::STANDARD.encode(bytes),
        media,
    ))
}
