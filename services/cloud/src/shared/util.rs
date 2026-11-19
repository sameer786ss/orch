pub use orchharness::util::{fast_hash_hex, looks_binary, now_ms, safe_file_name};

pub fn non_empty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}
