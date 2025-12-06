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

    // Mask IPs in message as well
    let message_sanitized = IP_RE
        .replace_all(message, "xxx.xxx.xxx.xxx")
        .into_owned();

    let event = json!({
        "ts": Utc::now().to_rfc3339(),
        "level": level,
        "component": component,
        "message": message_sanitized,
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value as JsonValue;
    use std::fs;

    fn read_last_log_line(path: &PathBuf) -> Option<String> {
        let txt = fs::read_to_string(path).ok()?;
        txt.lines().filter(|l| !l.trim().is_empty()).last().map(|s| s.to_string())
    }

    #[test]
    fn log_event_masks_ips_and_redacts_paths() {
        let dir = log_dir();
        let _ = fs::create_dir_all(&dir);
        let log_path = dir.join("error.log");
        let _ = fs::remove_file(&log_path);

        log_event(
            "ERROR",
            "test_component",
            "failed to reach 192.168.1.50",
            json!({
                "server": "http://192.168.1.50:32400",
                "original_path": "/share/CACHEDEV1_DATA/Series/Show/ep01.mkv",
                "filePath": "/mnt/Movies/Inception.mkv",
                "location": "/some/other/path/sub.srt",
            }),
        );

        let line = read_last_log_line(&log_path).expect("log line");
        let v: JsonValue = serde_json::from_str(&line).expect("valid json");

        // message and context.server should have masked IPs
        let msg = v.get("message").and_then(|m| m.as_str()).unwrap_or("");
        assert!(msg.contains("xxx.xxx.xxx.xxx"));
        assert!(!msg.contains("192.168.1.50"));

        let ctx = v.get("context").and_then(|c| c.as_object()).unwrap();
        let server = ctx.get("server").and_then(|s| s.as_str()).unwrap_or("");
        assert!(server.contains("xxx.xxx.xxx.xxx"));
        assert!(!server.contains("192.168.1.50"));

        // Paths should be redacted to <redacted>/basename
        assert_eq!(ctx.get("original_path").and_then(|s| s.as_str()), Some("<redacted>/ep01.mkv"));
        assert_eq!(ctx.get("filePath").and_then(|s| s.as_str()), Some("<redacted>/Inception.mkv"));
        assert_eq!(ctx.get("location").and_then(|s| s.as_str()), Some("<redacted>/sub.srt"));
    }
}
