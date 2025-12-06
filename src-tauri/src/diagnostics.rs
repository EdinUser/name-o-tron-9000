use chrono::Utc;
use regex::Regex;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use zip::{write::FileOptions, CompressionMethod, ZipWriter};

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::path::BaseDirectory;

    app
        .path()
        .resolve("settings.json", BaseDirectory::AppConfig)
        .map_err(|e| e.to_string())
}

fn load_settings(app: &tauri::AppHandle) -> Result<Value, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let txt = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if txt.trim().is_empty() {
        return Ok(serde_json::json!({}));
    }
    serde_json::from_str::<Value>(&txt).map_err(|e| e.to_string())
}

fn anonymize_settings(mut settings: Value, ip_re: &Regex) -> Value {
    if let Some(obj) = settings.as_object_mut() {
        if let Some(auth) = obj.get_mut("auth") {
            if let Some(auth_obj) = auth.as_object_mut() {
                auth_obj.remove("plexToken");
                auth_obj.remove("lastServer");
            }
        }
    }

    anonymize_value(&mut settings, ip_re);
    settings
}

fn log_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~/.nameotron"))
        .join("logs")
}

fn load_recent_logs(ip_re: &Regex) -> Vec<Value> {
    let dir = log_dir();
    let mut entries: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();

    if let Ok(read_dir) = fs::read_dir(&dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                let modified = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                entries.push((path, modified));
            }
        }
    }

    // Sort newest first
    entries.sort_by(|a, b| b.1.cmp(&a.1));

    // Limit to most recent 5 logs to keep bundle small
    entries
        .into_iter()
        .take(5)
        .filter_map(|(path, _)| anonymize_log_file(&path, ip_re))
        .collect()
}

fn load_error_excerpt(ip_re: &Regex) -> Vec<Value> {
    let dir = log_dir();
    let path = dir.join("error.log");
    let txt = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return Vec::new(),
    };

    let mut lines: Vec<&str> = txt.lines().filter(|l| !l.trim().is_empty()).collect();
    let total = lines.len();
    if total > 200 {
        lines = lines[total - 200..].to_vec();
    }

    let mut out = Vec::new();
    for line in lines {
        if let Ok(mut v) = serde_json::from_str::<Value>(line) {
            anonymize_value(&mut v, ip_re);
            out.push(v);
        } else {
            let redacted = ip_re.replace_all(line, "xxx.xxx.xxx.xxx").into_owned();
            out.push(serde_json::json!({ "raw": redacted }));
        }
    }

    out
}

fn anonymize_log_file(path: &Path, ip_re: &Regex) -> Option<Value> {
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();

    let txt = fs::read_to_string(path).ok()?;

    // Try to parse as JSON; if parsing fails, include redacted raw text
    match serde_json::from_str::<Value>(&txt) {
        Ok(mut v) => {
            anonymize_value(&mut v, ip_re);
            Some(serde_json::json!({
                "file": file_name,
                "entries": v,
            }))
        }
        Err(_) => {
            let redacted = ip_re.replace_all(&txt, "xxx.xxx.xxx.xxx").into_owned();
            Some(serde_json::json!({
                "file": file_name,
                "raw": redacted,
            }))
        }
    }
}

fn anonymize_value(value: &mut Value, ip_re: &Regex) {
    match value {
        Value::String(s) => {
            // Mask IP addresses in any string
            *s = ip_re.replace_all(s, "xxx.xxx.xxx.xxx").into_owned();
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                anonymize_value(v, ip_re);
            }
        }
        Value::Object(map) => {
            for (key, v) in map.iter_mut() {
                // Strip large or image-like payloads entirely
                if matches!(key.as_str(), "cachedPosterUrl" | "posterUrl" | "thumb") {
                    *v = Value::String("<image-redacted>".to_string());
                    continue;
                }

                // For path-like keys, redact parent directories but keep basename
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
                        let p = Path::new(s);
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
                    anonymize_value(v, ip_re);
                }
            }
        }
        _ => {}
    }
}

#[tauri::command]
pub fn export_diagnostic_bundle(app: tauri::AppHandle) -> Result<String, String> {
    // Compile IP regex once
    let ip_re = Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b").map_err(|e| e.to_string())?;

    let settings = load_settings(&app)?;
    let anonymized_settings = anonymize_settings(settings, &ip_re);
    let logs = load_recent_logs(&ip_re);
    let error_excerpt = load_error_excerpt(&ip_re);

    let bundle = serde_json::json!({
        "schema_version": 1,
        "app_version": env!("CARGO_PKG_VERSION"),
        "generated_at": Utc::now().to_rfc3339(),
        "environment": {
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        },
        "settings": anonymized_settings,
        "logs": logs,
        "error_log_excerpt": error_excerpt,
    });

    let dir = log_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create log directory: {}", e))?;
    let bundle_path = dir.join(format!("diagnostic_bundle_{}.json", Utc::now().timestamp()));

    let content = serde_json::to_string_pretty(&bundle)
        .map_err(|e| format!("Failed to serialize diagnostic bundle: {}", e))?;
    fs::write(&bundle_path, content)
        .map_err(|e| format!("Failed to write diagnostic bundle: {}", e))?;

    Ok(bundle_path.to_string_lossy().to_string())
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn export_diagnostic_bundle_zip(app: tauri::AppHandle, targetPath: String) -> Result<String, String> {
    let ip_re = Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b").map_err(|e| e.to_string())?;

    let settings = load_settings(&app)?;
    let anonymized_settings = anonymize_settings(settings, &ip_re);
    let logs = load_recent_logs(&ip_re);
    let error_excerpt = load_error_excerpt(&ip_re);

    let summary = serde_json::json!({
        "schema_version": 1,
        "app_version": env!("CARGO_PKG_VERSION"),
        "generated_at": Utc::now().to_rfc3339(),
        "environment": {
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        },
        "settings": anonymized_settings,
    });

    let logs_json = serde_json::to_string_pretty(&logs)
        .map_err(|e| format!("Failed to serialize logs: {}", e))?;
    let errors_json = serde_json::to_string_pretty(&error_excerpt)
        .map_err(|e| format!("Failed to serialize error excerpt: {}", e))?;

    let path = PathBuf::from(&targetPath);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    let file = fs::File::create(&path).map_err(|e| format!("Failed to create zip file: {}", e))?;
    let mut zip = ZipWriter::new(file);
    let options = FileOptions::default().compression_method(CompressionMethod::Deflated);

    // bundle.json (summary + settings only; logs in separate files)
    let summary_str = serde_json::to_string_pretty(&summary)
        .map_err(|e| format!("Failed to serialize bundle summary: {}", e))?;
    zip.start_file("bundle.json", options)
        .map_err(|e| format!("Failed to add bundle.json to zip: {}", e))?;
    use std::io::Write as _;
    zip.write_all(summary_str.as_bytes())
        .map_err(|e| format!("Failed to write bundle.json to zip: {}", e))?;

    // logs/rollback_logs.json
    zip.start_file("logs/rollback_logs.json", options)
        .map_err(|e| format!("Failed to add rollback_logs.json to zip: {}", e))?;
    zip.write_all(logs_json.as_bytes())
        .map_err(|e| format!("Failed to write rollback_logs.json to zip: {}", e))?;

    // logs/error_excerpt.json
    zip.start_file("logs/error_excerpt.json", options)
        .map_err(|e| format!("Failed to add error_excerpt.json to zip: {}", e))?;
    zip.write_all(errors_json.as_bytes())
        .map_err(|e| format!("Failed to write error_excerpt.json to zip: {}", e))?;

    zip.finish()
        .map_err(|e| format!("Failed to finish zip file: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_preview_snapshot(snapshot: Value) -> Result<String, String> {
    let ip_re = Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b").map_err(|e| e.to_string())?;

    let mut payload = snapshot;
    anonymize_value(&mut payload, &ip_re);

    let bundle = serde_json::json!({
        "schema_version": 1,
        "kind": "preview_snapshot",
        "app_version": env!("CARGO_PKG_VERSION"),
        "generated_at": Utc::now().to_rfc3339(),
        "payload": payload,
    });

    let dir = log_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create log directory: {}", e))?;
    let bundle_path = dir.join(format!("preview_snapshot_{}.json", Utc::now().timestamp()));

    let content = serde_json::to_string_pretty(&bundle)
        .map_err(|e| format!("Failed to serialize preview snapshot: {}", e))?;
    fs::write(&bundle_path, content)
        .map_err(|e| format!("Failed to write preview snapshot: {}", e))?;

    Ok(bundle_path.to_string_lossy().to_string())
}
use tauri::Manager;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn anonymize_value_masks_ips_and_paths() {
        let ip_re = Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b").unwrap();
        let mut v = json!({
            "server": "http://192.168.1.50:32400",
            "original_path": "/share/CACHEDEV1_DATA/Series/Show/ep01.mkv",
            "filePath": "/mnt/Movies/Inception.mkv",
            "location": "/some/other/path/sub.srt",
        });

        anonymize_value(&mut v, &ip_re);

        let obj = v.as_object().unwrap();
        let server = obj.get("server").and_then(|s| s.as_str()).unwrap();
        assert!(server.contains("xxx.xxx.xxx.xxx"));
        assert!(!server.contains("192.168.1.50"));

        assert_eq!(obj.get("original_path").and_then(|s| s.as_str()), Some("<redacted>/ep01.mkv"));
        assert_eq!(obj.get("filePath").and_then(|s| s.as_str()), Some("<redacted>/Inception.mkv"));
        assert_eq!(obj.get("location").and_then(|s| s.as_str()), Some("<redacted>/sub.srt"));
    }
}
