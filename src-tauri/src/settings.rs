use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
use tauri::Manager;

// TODO: These DTO structs are currently unused but may be needed for future settings validation and documentation

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PathMappingDto {
    #[serde(rename = "server_id")]
    pub server_id: String,
    #[serde(rename = "plex_root")]
    pub plex_root: String,
    #[serde(rename = "local_root")]
    pub local_root: String,
    #[serde(default)]
    pub platform: Option<String>,
}

// Settings file is a JSON object. Known sections are optional.
// Keep a DTO for path mappings for documentation and future validation.

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuthSection {
    #[serde(rename = "plexToken")]
    pub plex_token: Option<String>,
    #[serde(rename = "lastServer")]
    pub last_server: Option<String>,
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app
        .path()
        .resolve("settings.json", BaseDirectory::AppConfig)
        .map_err(|e| e.to_string())
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<Value, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let txt = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if txt.trim().is_empty() {
        return Ok(serde_json::json!({}));
    }
    serde_json::from_str::<Value>(&txt).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: Value) -> Result<(), String> {
    let path = settings_path(&app)?;
    ensure_parent(&path)?;

    // Read existing settings (object) or start with empty object
    let mut current = if path.exists() {
        let txt = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Value>(&txt).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Deep-merge: incoming keys override existing; nested objects merged recursively
    fn deep_merge(dest: &mut Value, src: &Value) {
        match (dest, src) {
            (Value::Object(d), Value::Object(s)) => {
                for (k, v) in s.iter() {
                    if let Some(existing) = d.get_mut(k) {
                        deep_merge(existing, v);
                    } else {
                        d.insert(k.clone(), v.clone());
                    }
                }
            }
            (d, s) => {
                *d = s.clone();
            }
        }
    }

    deep_merge(&mut current, &settings);

    let txt = serde_json::to_string_pretty(&current).map_err(|e| e.to_string())?;
    fs::write(&path, txt).map_err(|e| e.to_string())
}
