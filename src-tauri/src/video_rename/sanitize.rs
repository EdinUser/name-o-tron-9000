use super::{basename, has_non_latin};

pub(super) fn sanitize_and_validate_path(
    path: &str,
    settings: &serde_json::Value,
) -> (String, Vec<String>, Vec<String>) {
    let mut warnings = Vec::new();
    let mut blocking_errors = Vec::new();
    let mut sanitized = path.to_string();

    let general_settings = settings.get("general").unwrap_or(&serde_json::Value::Null);

    if let Some(safety) = general_settings.get("safety") {
        let path_length_check = safety
            .get("pathLengthCheck")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let reserved_names_check = safety
            .get("reservedNamesCheck")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        if path_length_check {
            if sanitized.len() > 255 {
                blocking_errors.push(format!(
                    "Path too long ({}): {}",
                    sanitized.len(),
                    sanitized
                ));
            } else if sanitized.len() > 200 {
                warnings.push(format!(
                    "Path length warning ({}): {}",
                    sanitized.len(),
                    sanitized
                ));
            }
        }

        if regex::Regex::new(r#"[\\:*?"<>|]"#)
            .unwrap()
            .is_match(&sanitized)
        {
            blocking_errors.push(format!("Invalid characters in path: {}", sanitized));
        }

        if let Some(encoding) = general_settings.get("encoding") {
            if encoding
                .get("highlightNonLatin")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
                && has_non_latin(&sanitized)
            {
                warnings.push(format!("Non-Latin characters detected: {}", sanitized));
            }
        }

        if reserved_names_check {
            let basename = basename(&sanitized);
            let reserved_names = [
                "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
                "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
                "LPT9",
            ];
            if reserved_names.contains(&basename.to_uppercase().as_str()) {
                blocking_errors.push(format!("Reserved filename: {}", basename));
            }
        }
    } else {
        if sanitized.len() > 255 {
            blocking_errors.push(format!(
                "Path too long ({}): {}",
                sanitized.len(),
                sanitized
            ));
        }

        if regex::Regex::new(r#"[\\:*?"<>|]"#)
            .unwrap()
            .is_match(&sanitized)
        {
            blocking_errors.push(format!("Invalid characters in path: {}", sanitized));
        }
    }

    sanitized = sanitized
        .split('/')
        .map(|segment| {
            segment
                .chars()
                .map(|c| match c {
                    '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
                    c => c,
                })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("/");

    (sanitized, warnings, blocking_errors)
}
