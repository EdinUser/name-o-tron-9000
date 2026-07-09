use chrono::Utc;
use regex::{Captures, Regex};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use zip::{write::FileOptions, CompressionMethod, ZipWriter};

const RECENT_ROLLBACK_LIMIT: usize = 5;
const RECENT_PREVIEW_LIMIT: usize = 2;
const ERROR_LOG_LINE_LIMIT: usize = 200;

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::path::BaseDirectory;

    app.path()
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

fn log_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~/.nameotron"))
        .join("logs")
}

#[derive(Default)]
struct StableTokens {
    server: HashMap<String, String>,
    server_id: HashMap<String, String>,
    url: HashMap<String, String>,
}

struct BundleSanitizer {
    ip_re: Regex,
    url_re: Regex,
    windows_path_re: Regex,
    unix_path_re: Regex,
    tokens: StableTokens,
}

impl BundleSanitizer {
    fn new() -> Result<Self, String> {
        Ok(Self {
            ip_re: Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b").map_err(|e| e.to_string())?,
            url_re: Regex::new(r#"https?://[^\s"'<>]+"#).map_err(|e| e.to_string())?,
            windows_path_re: Regex::new(r#"(?i)\b[a-z]:[\\/][^:*?"<>|\r\n]+"#)
                .map_err(|e| e.to_string())?,
            unix_path_re: Regex::new(r#"(?P<path>/[^\s"'<>]+)"#).map_err(|e| e.to_string())?,
            tokens: StableTokens::default(),
        })
    }

    fn sanitize_settings(&mut self, mut settings: Value) -> Value {
        if let Some(obj) = settings.as_object_mut() {
            obj.remove("templateHistory");
            obj.remove("templateFavorites");

            if let Some(auth) = obj.get_mut("auth") {
                if let Some(auth_obj) = auth.as_object_mut() {
                    auth_obj.remove("plexToken");
                    auth_obj.remove("lastServer");
                }
            }
        }

        self.anonymize_value(&mut settings, None);
        settings
    }

    fn anonymize_log_file(&mut self, path: &Path) -> Option<Value> {
        let file_name = path.file_name()?.to_str()?.to_string();
        let txt = fs::read_to_string(path).ok()?;

        match serde_json::from_str::<Value>(&txt) {
            Ok(mut v) => {
                self.anonymize_value(&mut v, None);
                Some(serde_json::json!({
                    "file": file_name,
                    "entries": v,
                }))
            }
            Err(_) => Some(serde_json::json!({
                "file": file_name,
                "raw": self.sanitize_generic_string(&txt),
            })),
        }
    }

    fn anonymize_value(&mut self, value: &mut Value, current_key: Option<&str>) {
        match value {
            Value::String(s) => {
                *s = self.sanitize_string_for_key(current_key, s);
            }
            Value::Array(arr) => {
                for v in arr.iter_mut() {
                    self.anonymize_value(v, current_key);
                }
            }
            Value::Object(map) => {
                for (key, v) in map.iter_mut() {
                    if matches!(key.as_str(), "cachedPosterUrl" | "posterUrl" | "thumb") {
                        *v = Value::String("<image-redacted>".to_string());
                        continue;
                    }

                    if key == "library" {
                        self.sanitize_library_object(v);
                        continue;
                    }

                    self.anonymize_value(v, Some(key.as_str()));
                }
            }
            _ => {}
        }
    }

    fn sanitize_library_object(&mut self, value: &mut Value) {
        let Some(obj) = value.as_object_mut() else {
            self.anonymize_value(value, Some("library"));
            return;
        };

        if let Some(title) = obj.get_mut("title") {
            *title = Value::String("<library>".to_string());
        }

        for (key, child) in obj.iter_mut() {
            if key != "title" {
                self.anonymize_value(child, Some(key.as_str()));
            }
        }
    }

    fn sanitize_string_for_key(&mut self, key: Option<&str>, value: &str) -> String {
        match key.unwrap_or_default() {
            "original_path" | "new_path" | "backup_path" | "local_root" | "plex_root"
            | "filePath" | "file" | "plexPath" | "location" => Self::sanitize_path(value),
            "server" | "address" | "serverUrl" | "url" | "lastServer" => {
                Self::token_for(&mut self.tokens.server, "server", value)
            }
            "server_id" | "machineIdentifier" | "client_id" | "clientIdentifier" => {
                Self::token_for(&mut self.tokens.server_id, "server-id", value)
            }
            _ => self.sanitize_generic_string(value),
        }
    }

    fn sanitize_generic_string(&mut self, value: &str) -> String {
        let url_re = self.url_re.clone();
        let windows_path_re = self.windows_path_re.clone();
        let unix_path_re = self.unix_path_re.clone();

        let with_urls = url_re
            .replace_all(value, |caps: &Captures| {
                Self::token_for(&mut self.tokens.url, "url", &caps[0])
            })
            .into_owned();

        let with_windows_paths = windows_path_re
            .replace_all(&with_urls, |caps: &Captures| Self::sanitize_path(&caps[0]))
            .into_owned();

        let with_unix_paths = unix_path_re
            .replace_all(&with_windows_paths, |caps: &Captures| {
                Self::sanitize_path(&caps["path"])
            })
            .into_owned();

        self.ip_re
            .replace_all(&with_unix_paths, "xxx.xxx.xxx.xxx")
            .into_owned()
    }

    fn sanitize_path(value: &str) -> String {
        let normalized = value.replace('\\', "/");
        let trimmed = normalized.trim_end_matches('/');
        if trimmed.is_empty() {
            return "<redacted>".to_string();
        }

        let parts: Vec<&str> = trimmed
            .split('/')
            .filter(|part| !part.is_empty() && *part != "." && *part != "..")
            .collect();

        let basename = parts.last().copied().unwrap_or("");
        let depth = parts.len();

        if basename.is_empty() {
            format!("<path:{}>", depth)
        } else {
            format!("<path:{}>/{}", depth, basename)
        }
    }

    fn token_for(map: &mut HashMap<String, String>, prefix: &str, original: &str) -> String {
        if let Some(existing) = map.get(original) {
            return existing.clone();
        }

        let next = format!("<{}:{}>", prefix, map.len() + 1);
        map.insert(original.to_string(), next.clone());
        next
    }
}

fn recent_matching_files(dir: &Path, prefix: &str, limit: usize) -> Vec<PathBuf> {
    let mut entries: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();

    if let Ok(read_dir) = fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !file_name.starts_with(prefix)
                || path.extension().and_then(|e| e.to_str()) != Some("json")
            {
                continue;
            }

            let modified = entry
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            entries.push((path, modified));
        }
    }

    entries.sort_by(|a, b| b.1.cmp(&a.1));
    entries
        .into_iter()
        .take(limit)
        .map(|(path, _)| path)
        .collect()
}

fn load_recent_logs_from_dir(
    dir: &Path,
    sanitizer: &mut BundleSanitizer,
) -> (Vec<Value>, Vec<Value>) {
    let rollback_logs = recent_matching_files(dir, "rollback_", RECENT_ROLLBACK_LIMIT)
        .into_iter()
        .filter_map(|path| sanitizer.anonymize_log_file(&path))
        .collect();

    let preview_snapshots = recent_matching_files(dir, "preview_snapshot_", RECENT_PREVIEW_LIMIT)
        .into_iter()
        .filter_map(|path| sanitizer.anonymize_log_file(&path))
        .collect();

    (rollback_logs, preview_snapshots)
}

fn load_error_excerpt_from_dir(dir: &Path, sanitizer: &mut BundleSanitizer) -> Vec<Value> {
    let path = dir.join("error.log");
    let txt = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return Vec::new(),
    };

    let mut lines: Vec<&str> = txt.lines().filter(|l| !l.trim().is_empty()).collect();
    let total = lines.len();
    if total > ERROR_LOG_LINE_LIMIT {
        lines = lines[total - ERROR_LOG_LINE_LIMIT..].to_vec();
    }

    let mut out = Vec::new();
    for line in lines {
        if let Ok(mut v) = serde_json::from_str::<Value>(line) {
            sanitizer.anonymize_value(&mut v, None);
            out.push(v);
        } else {
            out.push(serde_json::json!({
                "raw": sanitizer.sanitize_generic_string(line)
            }));
        }
    }

    out
}

fn build_diagnostic_payload(
    app: &tauri::AppHandle,
) -> Result<(Value, Vec<Value>, Vec<Value>, Vec<Value>), String> {
    let mut sanitizer = BundleSanitizer::new()?;
    let settings = load_settings(app)?;
    let anonymized_settings = sanitizer.sanitize_settings(settings);
    let dir = log_dir();
    let (rollback_logs, preview_snapshots) = load_recent_logs_from_dir(&dir, &mut sanitizer);
    let error_excerpt = load_error_excerpt_from_dir(&dir, &mut sanitizer);

    Ok((
        anonymized_settings,
        rollback_logs,
        preview_snapshots,
        error_excerpt,
    ))
}

#[tauri::command]
pub fn export_diagnostic_bundle(app: tauri::AppHandle) -> Result<String, String> {
    let (settings, rollback_logs, preview_snapshots, error_excerpt) =
        build_diagnostic_payload(&app)?;

    let bundle = serde_json::json!({
        "schema_version": 2,
        "bundle_kind": "support_bundle",
        "privacy_mode": "environment_redacted",
        "app_version": env!("CARGO_PKG_VERSION"),
        "generated_at": Utc::now().to_rfc3339(),
        "environment": {
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        },
        "settings": settings,
        "rollback_logs": rollback_logs,
        "preview_snapshots": preview_snapshots,
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
pub fn export_diagnostic_bundle_zip(
    app: tauri::AppHandle,
    targetPath: String,
) -> Result<String, String> {
    let (settings, rollback_logs, preview_snapshots, error_excerpt) =
        build_diagnostic_payload(&app)?;

    let summary = serde_json::json!({
        "schema_version": 2,
        "bundle_kind": "support_bundle",
        "privacy_mode": "environment_redacted",
        "app_version": env!("CARGO_PKG_VERSION"),
        "generated_at": Utc::now().to_rfc3339(),
        "environment": {
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        },
        "collection_policy": {
            "rollback_logs_limit": RECENT_ROLLBACK_LIMIT,
            "preview_snapshots_limit": RECENT_PREVIEW_LIMIT,
            "error_log_line_limit": ERROR_LOG_LINE_LIMIT,
            "included_json_prefixes": ["rollback_", "preview_snapshot_"],
            "excluded_json_prefixes": ["diagnostic_bundle_"],
        },
        "settings": settings,
    });

    let rollback_logs_json = serde_json::to_string_pretty(&rollback_logs)
        .map_err(|e| format!("Failed to serialize rollback logs: {}", e))?;
    let preview_snapshots_json = serde_json::to_string_pretty(&preview_snapshots)
        .map_err(|e| format!("Failed to serialize preview snapshots: {}", e))?;
    let errors_json = serde_json::to_string_pretty(&error_excerpt)
        .map_err(|e| format!("Failed to serialize error excerpt: {}", e))?;

    let path = PathBuf::from(&targetPath);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    let file = fs::File::create(&path).map_err(|e| format!("Failed to create zip file: {}", e))?;
    let mut zip = ZipWriter::new(file);
    let options = FileOptions::default().compression_method(CompressionMethod::Deflated);

    let summary_str = serde_json::to_string_pretty(&summary)
        .map_err(|e| format!("Failed to serialize bundle summary: {}", e))?;
    zip.start_file("bundle.json", options)
        .map_err(|e| format!("Failed to add bundle.json to zip: {}", e))?;
    use std::io::Write as _;
    zip.write_all(summary_str.as_bytes())
        .map_err(|e| format!("Failed to write bundle.json to zip: {}", e))?;

    zip.start_file("logs/rollback_logs.json", options)
        .map_err(|e| format!("Failed to add rollback_logs.json to zip: {}", e))?;
    zip.write_all(rollback_logs_json.as_bytes())
        .map_err(|e| format!("Failed to write rollback_logs.json to zip: {}", e))?;

    zip.start_file("logs/preview_snapshots.json", options)
        .map_err(|e| format!("Failed to add preview_snapshots.json to zip: {}", e))?;
    zip.write_all(preview_snapshots_json.as_bytes())
        .map_err(|e| format!("Failed to write preview_snapshots.json to zip: {}", e))?;

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
    let mut sanitizer = BundleSanitizer::new()?;
    let mut payload = snapshot;
    sanitizer.anonymize_value(&mut payload, None);

    let bundle = serde_json::json!({
        "schema_version": 2,
        "kind": "preview_snapshot",
        "privacy_mode": "environment_redacted",
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
    use tempfile::tempdir;

    #[test]
    fn anonymize_value_keeps_titles_and_redacts_environment() {
        let mut sanitizer = BundleSanitizer::new().unwrap();
        let mut v = json!({
            "server": "http://plex.local:32400",
            "server_id": "my-plex-server",
            "library": { "key": "2", "title": "Kids Movies", "type": "movie" },
            "original_path": "/share/CACHEDEV1_DATA/Series/Show/ep01.mkv",
            "message": "Failed to reach http://plex.local:32400 while reading /mnt/Movies/Inception.mkv",
            "title": "Inception",
            "proposed": "Inception (2010).mkv"
        });

        sanitizer.anonymize_value(&mut v, None);

        let obj = v.as_object().unwrap();
        assert_eq!(
            obj.get("server").and_then(|s| s.as_str()),
            Some("<server:1>")
        );
        assert_eq!(
            obj.get("server_id").and_then(|s| s.as_str()),
            Some("<server-id:1>")
        );
        assert_eq!(
            obj.get("original_path").and_then(|s| s.as_str()),
            Some("<path:5>/ep01.mkv")
        );
        assert_eq!(obj.get("title").and_then(|s| s.as_str()), Some("Inception"));
        assert_eq!(
            obj.get("proposed").and_then(|s| s.as_str()),
            Some("Inception (2010).mkv")
        );

        let library = obj.get("library").and_then(|v| v.as_object()).unwrap();
        assert_eq!(
            library.get("title").and_then(|s| s.as_str()),
            Some("<library>")
        );
        assert_eq!(library.get("key").and_then(|s| s.as_str()), Some("2"));

        let message = obj.get("message").and_then(|s| s.as_str()).unwrap();
        assert!(message.contains("<url:1>"));
        assert!(message.contains("<path:3>/Inception.mkv"));
        assert!(!message.contains("plex.local"));
    }

    #[test]
    fn load_recent_logs_only_includes_allowed_prefixes() {
        let dir = tempdir().unwrap();
        fs::write(
            dir.path().join("rollback_1.json"),
            r#"[{"original_path":"/a/b/Movie.mkv","new_path":"/a/b/Movie (2010).mkv"}]"#,
        )
        .unwrap();
        fs::write(
            dir.path().join("preview_snapshot_1.json"),
            r#"{"payload":{"server":{"address":"http://plex.local:32400"},"preview":{"rows":[]}}}"#,
        )
        .unwrap();
        fs::write(
            dir.path().join("diagnostic_bundle_1.json"),
            r#"{"settings":{"library":"should-not-be-included"}}"#,
        )
        .unwrap();

        let mut sanitizer = BundleSanitizer::new().unwrap();
        let (rollback_logs, preview_snapshots) =
            load_recent_logs_from_dir(dir.path(), &mut sanitizer);

        assert_eq!(rollback_logs.len(), 1);
        assert_eq!(preview_snapshots.len(), 1);

        let rollback_file = rollback_logs[0].get("file").and_then(|v| v.as_str());
        let preview_file = preview_snapshots[0].get("file").and_then(|v| v.as_str());
        assert_eq!(rollback_file, Some("rollback_1.json"));
        assert_eq!(preview_file, Some("preview_snapshot_1.json"));
    }
}
