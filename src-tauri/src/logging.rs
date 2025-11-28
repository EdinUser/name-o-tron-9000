use chrono::Utc;
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

static IP_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b").expect("valid IP regex")
});

pub fn log_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~/.nameotron"))
        .join("logs")
}

fn sanitize_value(value: &mut Value) {
    match value {
        Value::String(s) => {
            // Mask IP addresses
            *s = IP_RE.replace_all(s, "xxx.xxx.xxx.xxx").into_owned();
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                sanitize_value(v);
            }
        }
        Value::Object(map) => {
            for (key, v) in map.iter_mut() {
                // Redact path-like fields; keep only basename
                if matches!(
                    key.as_str(),
                    "original_path"
                        | "new_path"
                        | "backup_path"
                        | "local_root"
                        | "plex_root"
                        | "filePath"
                        | "file"
                        | "plexPath"
                        | "location"
                ) {
                    if let Value::String(s) = v {
                        let p = std::path::Path::new(s);
                        let file_name = p
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("");
                        *s = if file_name.is_empty() {
                            "<redacted>".to_string()
                        } else {
                            format!("<redacted>/{}", file_name)
                        };
                    }
                } else {
                    sanitize_value(v);
                }
            }
        }
        _ => {}
    }
}

pub fn log_event(level: &str, component: &str, message: &str, mut context: Value) {
    // Best-effort logging; never panic or propagate errors
    sanitize_value(&mut context);

    let event = json!({
        "ts": Utc::now().to_rfc3339(),
        "level": level,
        "component": component,
        "message": message,
        "context": context,
    });

    let dir = log_dir();
    if let Err(_e) = fs::create_dir_all(&dir) {
        return;
    }
    let path = dir.join("error.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        if let Ok(line) = serde_json::to_string(&event) {
            let _ = writeln!(file, "{}", line);
        }
    }
}
