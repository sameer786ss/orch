use serde_json::Value;

use crate::events::{ToolDisplayInfo, ToolIcon};

const MAX_TARGET_CHARS: usize = 160;

pub fn display_info(name: &str, args: &Value) -> Option<ToolDisplayInfo> {
    let (prefix, action) = name.split_once('_')?;
    if prefix.is_empty()
        || action.is_empty()
        || !prefix
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
    {
        return None;
    }
    let label = humanize(action);
    Some(ToolDisplayInfo {
        active_label: label.clone(),
        label,
        target_text: extract_target(args),
        icon: ToolIcon::Globe,
        connector: Some(prefix.to_ascii_lowercase()),
        ..Default::default()
    })
}

fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::String(text) if !text.trim().is_empty() => Some(text.trim().to_string()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn extract_target(args: &Value) -> Option<String> {
    let map = args.as_object()?;
    let text = map.values().find_map(scalar)?;
    Some(crate::util::truncate_chars(&text, MAX_TARGET_CHARS).to_string())
}

fn humanize(action: &str) -> String {
    let lowered = action.replace('_', " ").to_lowercase();
    let mut chars = lowered.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}
