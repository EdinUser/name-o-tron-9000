use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::io::{Read, Write};
use tauri::command;
use regex::Regex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleFile {
    pub original_path: String,
    pub proposed_path: String,
    pub subtitle_type: SubtitleType,
    pub classification: SubtitleClassification,
    pub needs_conversion: bool,
    pub backup_path: Option<String>,
    pub encoding_detected: Option<String>,
    pub warning_flags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SubtitleType {
    Standard,      // basename matches video basename
    NonMatching,   // pattern like "2_English.srt" 
    Subfolder,     // in per-episode subfolder
    Unknown,       // no recognizable pattern
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SubtitleClassification {
    VideoSubtitle(String),  // (language_suffix)
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameOperation {
    pub operation_type: String,  // "rename", "move", "convert"
    pub original_path: String,
    pub new_path: String,
    pub backup_path: Option<String>,
    pub operation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewResult {
    pub video_operations: Vec<RenameOperation>,
    pub subtitle_operations: Vec<RenameOperation>,
    pub warnings: Vec<String>,
    pub blocking_errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyResult {
    pub success: bool,
    pub operations_applied: usize,
    pub operations_failed: usize,
    pub rollback_log_path: String,
    pub errors: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct PreviewRenamesRequest {
    pub library_id: String,
    pub scope: Vec<String>,  // file paths to process
    pub settings: serde_json::Value,  // complete settings object
}

#[derive(Debug, Deserialize)]
pub struct ApplyRenamesRequest {
    pub operations: Vec<RenameOperation>,
    pub settings: serde_json::Value,
}

const SUPPORTED_SUBTITLE_EXTENSIONS: &[&str] = &[".srt", ".ass", ".ssa", ".vtt"];
const SUBTITLE_PATTERNS: &[&str] = &[
    // Standard patterns like "Movie.eng.srt", "Show.S01E01.eng.srt"
    r"^(.+)\.([a-zA-Z]{2,3}(\.\w+)?)\.([a-zA-Z0-9]+)$",
    // Numbered patterns like "2_English.srt", "5_Bulgarian.srt"
    r"^(\d+)_(.+)\.([a-zA-Z0-9]+)$",
    // Language only patterns like "Movie.eng.srt"
    r"^(.+)\.([a-zA-Z]{2,3})\.([a-zA-Z0-9]+)$",
    // Just basename like "Movie.srt"
    r"^(.+)\.([a-zA-Z0-9]+)$",
];

fn detect_subtitle_encoding(file_path: &str) -> Result<(String, bool), String> {
    let path = Path::new(file_path);
    let mut file = fs::File::open(path)
        .map_err(|e| format!("Failed to open file {}: {}", file_path, e))?;

    let mut buffer = [0u8; 1024];
    let bytes_read = file.read(&mut buffer)
        .map_err(|e| format!("Failed to read file {}: {}", file_path, e))?;

    if bytes_read == 0 {
        return Ok(("empty".to_string(), false));
    }

    // Try to detect BOM
    let (encoding_name, has_bom) = if buffer.starts_with(&[0xEF, 0xBB, 0xBF]) {
        ("utf-8".to_string(), true)
    } else if buffer.starts_with(&[0xFF, 0xFE]) {
        // UTF-16 LE
        return Ok(("utf-16le".to_string(), true));
    } else if buffer.starts_with(&[0xFE, 0xFF]) {
        // UTF-16 BE
        return Ok(("utf-16be".to_string(), true));
    } else {
        // Try to decode as UTF-8 first (simplified detection)
        let utf8_string = String::from_utf8_lossy(&buffer[..bytes_read]);
        if utf8_string.contains("subtitle") || utf8_string.contains("dialogue") {
            ("utf-8".to_string(), false)
        } else {
            // Uncertain detection - need more sophisticated heuristics
            return Ok(("uncertain".to_string(), false));
        }
    };

    Ok((encoding_name, has_bom))
}

fn convert_subtitle_to_utf8(input_path: &str, output_path: &str, backup_path: &str) -> Result<(), String> {
    // Create backup
    fs::copy(input_path, backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;

    let input_content = fs::read(input_path)
        .map_err(|e| format!("Failed to read input file: {}", e))?;

    // Detect encoding and convert
    let (encoding_name, _) = detect_subtitle_encoding(input_path)?;

    let converted_content = if encoding_name == "utf-8" {
        input_content
    } else {
        // For now, just copy as-is if not UTF-8 (simplified)
        // In a real implementation, you'd use proper encoding conversion
        input_content
    };

    // Write as UTF-8 with BOM
    let mut output_file = fs::File::create(output_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;

    // Write UTF-8 BOM
    output_file.write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|e| format!("Failed to write BOM: {}", e))?;

    output_file.write_all(&converted_content)
        .map_err(|e| format!("Failed to write converted content: {}", e))?;

    Ok(())
}

fn find_subtitle_files(video_path: &str) -> Vec<SubtitleFile> {
    let video_dir = Path::new(video_path).parent()
        .unwrap_or_else(|| Path::new(video_path))
        .to_string_lossy()
        .to_string();

    let video_basename = Path::new(video_path)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy();

    let mut subtitles = Vec::new();

    if let Ok(entries) = fs::read_dir(&video_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if SUPPORTED_SUBTITLE_EXTENSIONS.contains(&ext.to_string_lossy().as_ref()) {
                        let filename = path.file_name()
                            .unwrap_or_default()
                            .to_string_lossy();

                        // Check if this subtitle matches the video basename
                        if filename.starts_with(video_basename.as_ref()) {
                            let classification = classify_subtitle_filename(&filename, &video_basename);
                            subtitles.push(SubtitleFile {
                                original_path: path.to_string_lossy().to_string(),
                                proposed_path: path.to_string_lossy().to_string(), // Will be updated later
                                subtitle_type: SubtitleType::Standard,
                                classification,
                                needs_conversion: false,
                                backup_path: None,
                                encoding_detected: None,
                                warning_flags: Vec::new(),
                            });
                        }
                    }
                }
            }
        }
    }

    subtitles
}

fn classify_subtitle_filename(filename: &str, video_basename: &str) -> SubtitleClassification {
    // Extract language suffix from filename
    if let Ok(regex) = Regex::new(SUBTITLE_PATTERNS[0]) {
        if let Some(captures) = regex.captures(filename) {
            if let Some(lang_suffix) = captures.get(2) {
                return SubtitleClassification::VideoSubtitle(lang_suffix.as_str().to_string());
            }
        }
    }

    SubtitleClassification::Unknown
}

#[command]
pub async fn preview_renames(request: PreviewRenamesRequest) -> Result<PreviewResult, String> {
    let mut video_operations = Vec::new();
    let mut subtitle_operations = Vec::new();
    let mut warnings = Vec::new();
    let mut blocking_errors = Vec::new();

    // Parse settings
    let general_settings: serde_json::Value = request.settings.get("general")
        .ok_or("Missing general settings")?.clone();
    let movie_settings: serde_json::Value = request.settings.get("movies")
        .ok_or("Missing movie settings")?.clone();
    let tv_settings: serde_json::Value = request.settings.get("tv")
        .ok_or("Missing TV settings")?.clone();

    let skip_subtitles = general_settings.get("subtitles")
        .and_then(|s| s.get("skipSubtitles"))
        .and_then(|s| s.as_bool())
        .unwrap_or(false);

    if skip_subtitles {
        return Ok(PreviewResult {
            video_operations,
            subtitle_operations,
            warnings,
            blocking_errors,
        });
    }

    for file_path in &request.scope {
        // Find subtitle files for this video
        let subtitles = find_subtitle_files(file_path);

        for mut subtitle in subtitles {
            // Apply rename rules based on settings
            let new_basename = Path::new(file_path)
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy();

            // Update proposed path with new basename
            let current_extension = Path::new(&subtitle.original_path)
                .extension()
                .unwrap_or_default()
                .to_string_lossy();

            let new_filename = match &subtitle.classification {
                SubtitleClassification::VideoSubtitle(lang_suffix) => {
                    format!("{}.{}", new_basename, lang_suffix)
                }
                SubtitleClassification::Unknown => {
                    new_basename.to_string()
                }
            };

            let new_path = Path::new(&subtitle.original_path)
                .with_file_name(format!("{}.{}", new_filename, current_extension))
                .to_string_lossy()
                .to_string();

            subtitle.proposed_path = new_path.clone();

            // Check for encoding conversion
            let convert_to_utf8 = general_settings.get("subtitles")
                .and_then(|s| s.get("convertToUtf8"))
                .and_then(|s| s.as_bool())
                .unwrap_or(false);

            if convert_to_utf8 {
                match detect_subtitle_encoding(&subtitle.original_path) {
                    Ok((encoding, _)) => {
                        subtitle.encoding_detected = Some(encoding.clone());
                        if encoding != "utf-8" {
                            subtitle.needs_conversion = true;
                            subtitle.warning_flags.push("encoding_conversion".to_string());

                            if encoding == "uncertain" {
                                let skip_uncertain = general_settings.get("subtitles")
                                    .and_then(|s| s.get("skipUncertainEncoding"))
                                    .and_then(|s| s.as_bool())
                                    .unwrap_or(true);

                                if skip_uncertain {
                                    subtitle.warning_flags.push("uncertain_encoding_skipped".to_string());
                                    subtitle.needs_conversion = false;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        warnings.push(format!("Could not detect encoding for {}: {}", subtitle.original_path, e));
                    }
                }
            }

            // Apply movie-specific rules
            let library_type = request.library_id.starts_with("movie");
            if library_type {
                let forced_sdh_handling = movie_settings.get("subtitles")
                    .and_then(|s| s.get("forcedSdhHandling"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("preserve");

                match forced_sdh_handling {
                    "normalize" => {
                        // Normalize .sdh to .forced
                        if subtitle.proposed_path.contains(".sdh") {
                            subtitle.proposed_path = subtitle.proposed_path.replace(".sdh", ".forced");
                            subtitle.warning_flags.push("forced_sdh_normalized".to_string());
                        }
                    }
                    "strip" => {
                        // Strip .sdh suffix
                        if subtitle.proposed_path.contains(".sdh") {
                            subtitle.proposed_path = subtitle.proposed_path.replace(".sdh", "");
                            subtitle.warning_flags.push("forced_sdh_stripped".to_string());
                        }
                    }
                    _ => {} // preserve - do nothing
                }

                let unknown_handling = movie_settings.get("subtitles")
                    .and_then(|s| s.get("unknownSubtitleHandling"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("preserve");

                if matches!(subtitle.classification, SubtitleClassification::Unknown) {
                    match unknown_handling {
                        "append_unk" => {
                            let current_extension = Path::new(&subtitle.proposed_path)
                                .extension()
                                .unwrap_or_default()
                                .to_string_lossy();
                            let stem = Path::new(&subtitle.proposed_path)
                                .file_stem()
                                .unwrap_or_default()
                                .to_string_lossy();
                            subtitle.proposed_path = format!("{}.unk.{}", stem, current_extension);
                            subtitle.warning_flags.push("unknown_subtitle_appended_unk".to_string());
                        }
                        _ => {} // preserve - do nothing
                    }
                }
            }

            // Apply TV-specific rules
            if !library_type {
                let flatten_subfolders = tv_settings.get("subtitles")
                    .and_then(|s| s.get("flattenPerEpisodeSubfolders"))
                    .and_then(|s| s.as_bool())
                    .unwrap_or(true);

                if flatten_subfolders && matches!(subtitle.subtitle_type, SubtitleType::Subfolder) {
                    // Move subtitle from subfolder to video directory
                    let video_dir = Path::new(file_path).parent()
                        .unwrap_or_else(|| Path::new(file_path))
                        .to_string_lossy();
                    let video_dir_str = video_dir.to_string();
                    let new_path = Path::new(&video_dir_str)
                        .join(Path::new(&subtitle.proposed_path).file_name().unwrap())
                        .to_string_lossy()
                        .to_string();
                    subtitle.proposed_path = new_path;
                    subtitle.warning_flags.push("flattened_from_subfolder".to_string());
                }

                let handle_non_matching = tv_settings.get("subtitles")
                    .and_then(|s| s.get("handleNonMatchingNames"))
                    .and_then(|s| s.as_bool())
                    .unwrap_or(true);

                if handle_non_matching && matches!(subtitle.subtitle_type, SubtitleType::NonMatching) {
                    // Map non-matching names (e.g., "2_English.srt" -> "Video.English.srt")
                    let filename = Path::new(&subtitle.original_path).file_name().unwrap().to_string_lossy();
                    if let Ok(regex) = Regex::new(SUBTITLE_PATTERNS[1]) {
                        if let Some(captures) = regex.captures(&filename) {
                            if let (Some(prefix), Some(lang_suffix)) = (captures.get(1), captures.get(2)) {
                                let extension = Path::new(&subtitle.original_path).extension()
                                    .unwrap_or_default().to_string_lossy();
                                let new_filename = format!("{}.{}.{}", new_basename, lang_suffix.as_str(), extension);
                                let video_dir = Path::new(file_path).parent()
                                    .unwrap_or_else(|| Path::new(file_path))
                                    .to_string_lossy()
                                    .to_string();
                                let full_path = Path::new(&video_dir).join(&new_filename);
                                subtitle.proposed_path = full_path.to_string_lossy().to_string();
                                subtitle.warning_flags.push("mapped_non_matching".to_string());
                            }
                        }
                    }
                }

                let multi_sub_handling = tv_settings.get("subtitles")
                    .and_then(|s| s.get("multiSubHandling"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("preserve");

                // Handle multiple subtitles with same language (simplified logic)
                // In a full implementation, this would track duplicates and apply numbering
                match multi_sub_handling {
                    "number" => {
                        subtitle.warning_flags.push("multi_sub_numbered".to_string());
                    }
                    "first_only" => {
                        subtitle.warning_flags.push("multi_sub_first_only".to_string());
                    }
                    _ => {} // preserve - do nothing
                }
            }

            // Create operation
            let operation = RenameOperation {
                operation_type: if subtitle.needs_conversion { "convert".to_string() } else { "rename".to_string() },
                original_path: subtitle.original_path.clone(),
                new_path: subtitle.proposed_path.clone(),
                backup_path: if subtitle.needs_conversion {
                    let backup_path = format!("{}.backup", subtitle.original_path);
                    subtitle.backup_path = Some(backup_path.clone());
                    Some(backup_path)
                } else {
                    None
                },
                operation_id: format!("subtitle_{}", uuid::Uuid::new_v4()),
            };

            subtitle_operations.push(operation);
        }
    }

    Ok(PreviewResult {
        video_operations,
        subtitle_operations,
        warnings,
        blocking_errors,
    })
}

#[command]
pub async fn apply_renames(request: ApplyRenamesRequest) -> Result<ApplyResult, String> {
    let mut operations_applied = 0;
    let mut operations_failed = 0;
    let mut errors = Vec::new();
    let mut all_operations = Vec::new();

    // Combine video and subtitle operations
    let operations = request.operations;

    // Create rollback log directory
    let log_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~/.nameotron"))
        .join("logs");
    fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Failed to create log directory: {}", e))?;

    let log_path = log_dir.join(format!("rollback_{}.json", chrono::Utc::now().timestamp()));

    for operation in &operations {
        match apply_single_operation(operation) {
            Ok(_) => {
                operations_applied += 1;
                all_operations.push(serde_json::json!({
                    "operation_type": operation.operation_type,
                    "original_path": operation.original_path,
                    "new_path": operation.new_path,
                    "backup_path": operation.backup_path,
                    "status": "success"
                }));
            }
            Err(e) => {
                operations_failed += 1;
                errors.push(e.clone());
                all_operations.push(serde_json::json!({
                    "operation_type": operation.operation_type,
                    "original_path": operation.original_path,
                    "new_path": operation.new_path,
                    "backup_path": operation.backup_path,
                    "status": "failed",
                    "error": e
                }));
            }
        }
    }

    // Write rollback log
    let log_content = serde_json::to_string_pretty(&all_operations)
        .map_err(|e| format!("Failed to serialize rollback log: {}", e))?;

    fs::write(&log_path, log_content)
        .map_err(|e| format!("Failed to write rollback log: {}", e))?;

    Ok(ApplyResult {
        success: operations_failed == 0,
        operations_applied,
        operations_failed,
        rollback_log_path: log_path.to_string_lossy().to_string(),
        errors,
    })
}

fn apply_single_operation(operation: &RenameOperation) -> Result<(), String> {
    match operation.operation_type.as_str() {
        "rename" => {
            // Simple rename
            fs::rename(&operation.original_path, &operation.new_path)
                .map_err(|e| format!("Failed to rename {} to {}: {}", operation.original_path, operation.new_path, e))?;
        }
        "move" => {
            // Move operation (different directories)
            // For simplicity, using rename which works across directories on same filesystem
            fs::rename(&operation.original_path, &operation.new_path)
                .map_err(|e| format!("Failed to move {} to {}: {}", operation.original_path, operation.new_path, e))?;
        }
        "convert" => {
            // Encoding conversion with backup
            if let Some(ref backup_path) = operation.backup_path {
                convert_subtitle_to_utf8(&operation.original_path, &operation.new_path, backup_path)?;
            }
        }
        _ => {
            return Err(format!("Unknown operation type: {}", operation.operation_type));
        }
    }

    Ok(())
}

#[command]
pub async fn undo_last_rename() -> Result<ApplyResult, String> {
    // Find the most recent rollback log
    let log_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~/.nameotron"))
        .join("logs");

    if !log_dir.exists() {
        return Err("No rollback logs found".to_string());
    }

    let mut log_files: Vec<_> = fs::read_dir(&log_dir)
        .map_err(|e| format!("Failed to read log directory: {}", e))?
        .flatten()
        .filter(|entry| {
            entry.path().extension().map_or(false, |ext| ext == "json")
        })
        .collect();

    if log_files.is_empty() {
        return Err("No rollback logs found".to_string());
    }

    // Sort by modification time (newest first)
    log_files.sort_by(|a, b| {
        b.metadata().unwrap().modified().unwrap().cmp(&a.metadata().unwrap().modified().unwrap())
    });

    let most_recent_log = log_files[0].path();

    // Read and parse the rollback log
    let log_content = fs::read_to_string(&most_recent_log)
        .map_err(|e| format!("Failed to read rollback log: {}", e))?;

    let operations: Vec<RenameOperation> = serde_json::from_str(&log_content)
        .map_err(|e| format!("Failed to parse rollback log: {}", e))?;

    let mut operations_applied = 0;
    let mut operations_failed = 0;
    let mut errors = Vec::new();

    // Reverse each operation
    for operation in operations.iter().rev() {
        match undo_single_operation(operation) {
            Ok(_) => {
                operations_applied += 1;
            }
            Err(e) => {
                operations_failed += 1;
                errors.push(e);
            }
        }
    }

    // Remove the log file after successful undo
    if operations_failed == 0 {
        if let Err(e) = fs::remove_file(&most_recent_log) {
            eprintln!("Warning: Failed to remove rollback log: {}", e);
        }
    }

    Ok(ApplyResult {
        success: operations_failed == 0,
        operations_applied,
        operations_failed,
        rollback_log_path: most_recent_log.to_string_lossy().to_string(),
        errors,
    })
}

fn undo_single_operation(operation: &RenameOperation) -> Result<(), String> {
    match operation.operation_type.as_str() {
        "rename" | "move" => {
            // Reverse rename/move
            fs::rename(&operation.new_path, &operation.original_path)
                .map_err(|e| format!("Failed to undo rename {} to {}: {}", operation.new_path, operation.original_path, e))?;
        }
        "convert" => {
            // Restore from backup if it exists
            if let Some(ref backup_path) = operation.backup_path {
                if Path::new(backup_path).exists() {
                    fs::rename(backup_path, &operation.original_path)
                        .map_err(|e| format!("Failed to restore backup {} to {}: {}", backup_path, operation.original_path, e))?;
                }
            }
        }
        _ => {
            return Err(format!("Cannot undo unknown operation type: {}", operation.operation_type));
        }
    }

    Ok(())
}
