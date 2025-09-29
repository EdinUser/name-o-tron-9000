use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
use tauri::Manager;

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    #[serde(default, rename = "pathMappings")]
    pub path_mappings: Vec<PathMappingDto>,
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
pub fn get_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let txt = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if txt.trim().is_empty() {
        return Ok(Settings::default());
    }
    serde_json::from_str::<Settings>(&txt).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let path = settings_path(&app)?;
    ensure_parent(&path)?;
    let txt = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, txt).map_err(|e| e.to_string())
}
