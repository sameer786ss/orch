pub use orchharness::util::{fast_hash_hex, looks_binary, now_ms, safe_file_name};

pub fn non_empty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(i64::MAX)
}
