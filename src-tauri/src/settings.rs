use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
use tauri::Manager;

// TODO: These DTO structs are currently unused but may be needed for future settings validation and documentation

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PathMappingDto {
    pub server_id: String,
    pub plex_root: String,
    pub local_root: String,
    #[serde(default)]
    pub platform: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowMappingData {
    pub is_mapped: bool,
    pub location: String,
    pub last_checked: u64,
    #[serde(default)]
    pub poster_url: Option<String>,
    #[serde(default)]
    pub cached_poster_url: Option<String>,
    #[serde(default)]
    pub year: Option<u32>,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub studio: Option<String>,
    #[serde(default)]
    pub creators: Option<Vec<String>>,
    #[serde(default)]
    pub years_running: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowMappingCache {
    pub last_updated: u64,
    pub mappings_checksum: String,
    pub shows: std::collections::HashMap<String, ShowMappingData>, // ratingKey -> data
}

fn cache_path(
    app: &tauri::AppHandle,
    server_id: &str,
    library_id: &str,
) -> Result<PathBuf, String> {
    let cache_dir = app
        .path()
        .resolve("cache/show-mappings", BaseDirectory::AppConfig)
        .map_err(|e| e.to_string())?;

    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    Ok(cache_dir.join(format!("{}_{}.json", server_id, library_id)))
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
    app.path()
        .resolve("settings.json", BaseDirectory::AppConfig)
        .map_err(|e| e.to_string())
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
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
    serde_json::from_str::<Value>(&txt).map_err(|e| {
        let msg = format!("Failed to parse settings.json: {}", e);
        crate::logging::log_event("ERROR", "get_settings", &msg, serde_json::json!({}));
        msg
    })
}

// Test helper functions for unit testing
pub mod test_helpers {
    use super::*;
    use std::path::Path;

    pub fn get_settings_from_path(path: &Path) -> Result<Value, String> {
        if !path.exists() {
            return Ok(serde_json::json!({}));
        }
        let txt = fs::read_to_string(path).map_err(|e| e.to_string())?;
        if txt.trim().is_empty() {
            return Ok(serde_json::json!({}));
        }
        serde_json::from_str::<Value>(&txt).map_err(|e| e.to_string())
    }

    pub fn save_settings_to_path(path: &Path, settings: Value) -> Result<(), String> {
        ensure_parent(path)?;

        // Read existing settings (object) or start with empty object
        let mut current = if path.exists() {
            let txt = fs::read_to_string(path).map_err(|e| e.to_string())?;
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
        fs::write(path, txt).map_err(|e| e.to_string())
    }
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

// Show mapping cache management functions

pub fn generate_mappings_checksum(mappings: &[PathMappingDto]) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    for mapping in mappings {
        mapping.server_id.hash(&mut hasher);
        mapping.plex_root.hash(&mut hasher);
        mapping.local_root.hash(&mut hasher);
        mapping.platform.hash(&mut hasher);
    }
    format!("{:x}", hasher.finish())
}

pub fn generate_mappings_checksum_with_server(
    server_id: &str,
    mappings: &[PathMappingDto],
) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    server_id.hash(&mut hasher);
    for mapping in mappings {
        mapping.server_id.hash(&mut hasher);
        mapping.plex_root.hash(&mut hasher);
        mapping.local_root.hash(&mut hasher);
        mapping.platform.hash(&mut hasher);
    }
    format!("{:x}", hasher.finish())
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn load_show_mapping_cache(
    app: tauri::AppHandle,
    serverId: String,
    libraryId: String,
) -> Result<Option<ShowMappingCache>, String> {
    let path = cache_path(&app, &serverId, &libraryId)?;
    if !path.exists() {
        return Ok(None);
    }

    let txt = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if txt.trim().is_empty() {
        return Ok(None);
    }

    serde_json::from_str::<ShowMappingCache>(&txt)
        .map_err(|e| e.to_string())
        .map(Some)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn save_show_mapping_cache(
    app: tauri::AppHandle,
    serverId: String,
    libraryId: String,
    cache: ShowMappingCache,
) -> Result<(), String> {
    let path = cache_path(&app, &serverId, &libraryId)?;
    ensure_parent(&path)?;

    let txt = serde_json::to_string_pretty(&cache).map_err(|e| e.to_string())?;
    fs::write(&path, txt).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn invalidate_show_mapping_cache(
    app: tauri::AppHandle,
    serverId: String,
    libraryId: String,
) -> Result<(), String> {
    let path = cache_path(&app, &serverId, &libraryId)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn generate_mappings_checksum_cmd(serverId: String, mappings: Vec<PathMappingDto>) -> String {
    generate_mappings_checksum_with_server(&serverId, &mappings)
}

#[derive(Debug, Clone, Serialize)]
pub struct CacheClearResult {
    pub total_files_found: usize,
    pub files_removed: Vec<String>,
    pub cache_directory_exists: bool,
}

#[tauri::command]
pub fn clear_all_show_mapping_caches(app: tauri::AppHandle) -> Result<CacheClearResult, String> {
    let cache_dir = app
        .path()
        .resolve("cache/show-mappings", BaseDirectory::AppConfig)
        .map_err(|e| e.to_string())?;

    eprintln!("🔍 Cache directory path: {:?}", cache_dir);
    eprintln!("📁 Cache directory exists: {}", cache_dir.exists());

    let mut removed_files = Vec::new();
    let mut total_files = 0;

    if cache_dir.exists() {
        // List all cache files in the directory
        let entries = fs::read_dir(&cache_dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            total_files += 1;

            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                let file_name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                eprintln!("🗑️  Removing cache file: {}", file_name);
                fs::remove_file(&path).map_err(|e| e.to_string())?;
                removed_files.push(file_name);
            }
        }
        eprintln!("📊 Found {} total files in cache directory", total_files);
    } else {
        eprintln!("📁 Cache directory does not exist - no cache files to remove");
    }

    if removed_files.is_empty() {
        eprintln!("✅ No cache files found to remove");
    } else {
        eprintln!(
            "✅ Successfully removed {} cache files: {:?}",
            removed_files.len(),
            removed_files
        );
    }

    Ok(CacheClearResult {
        total_files_found: total_files,
        files_removed: removed_files,
        cache_directory_exists: cache_dir.exists(),
    })
}

#[tauri::command]
pub fn get_cache_directory_path(app: tauri::AppHandle) -> Result<String, String> {
    let cache_dir = app
        .path()
        .resolve("cache/show-mappings", BaseDirectory::AppConfig)
        .map_err(|e| e.to_string())?;

    Ok(cache_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_logs_directory_path() -> Result<String, String> {
    let dir = crate::logging::log_dir();
    Ok(dir.to_string_lossy().to_string())
}
