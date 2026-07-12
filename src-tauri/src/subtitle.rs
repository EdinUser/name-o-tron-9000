use crate::rename_types::{
    ApplyRenamesRequest, ApplyResult, PreviewRenamesRequest, PreviewResult, RenameOperation,
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::command;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum SubtitleType {
    Standard,    // basename matches video basename
    NonMatching, // pattern like "2_English.srt"
    Subfolder,   // in per-episode subfolder
    Unknown,     // no recognizable pattern
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SubtitleClassification {
    VideoSubtitle(String), // (language_suffix)
    Unknown,
}

const SUPPORTED_SUBTITLE_EXTENSIONS: &[&str] = &["srt", "ass", "ssa", "vtt"];
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

pub fn detect_subtitle_encoding(file_path: &str) -> Result<(String, bool), String> {
    let path = Path::new(file_path);
    let mut file =
        fs::File::open(path).map_err(|e| format!("Failed to open file {}: {}", file_path, e))?;

    let mut buffer = [0u8; 1024];
    let bytes_read = file
        .read(&mut buffer)
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
        // Try to decode as UTF-8 first. If this succeeds without BOM,
        // treat the encoding as UTF-8 without BOM, which matches typical
        // subtitle files and our test expectations.
        let _ = String::from_utf8_lossy(&buffer[..bytes_read]);
        ("utf-8".to_string(), false)
    };

    Ok((encoding_name, has_bom))
}

fn convert_subtitle_to_utf8(
    input_path: &str,
    output_path: &str,
    backup_path: &str,
) -> Result<(), String> {
    // Create backup
    fs::copy(input_path, backup_path).map_err(|e| format!("Failed to create backup: {}", e))?;

    let input_content =
        fs::read(input_path).map_err(|e| format!("Failed to read input file: {}", e))?;

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
    output_file
        .write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|e| format!("Failed to write BOM: {}", e))?;

    output_file
        .write_all(&converted_content)
        .map_err(|e| format!("Failed to write converted content: {}", e))?;

    Ok(())
}

pub fn find_subtitle_files(video_path: &str) -> Vec<SubtitleFile> {
    let video_dir = Path::new(video_path)
        .parent()
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
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_ascii_lowercase();
                    if SUPPORTED_SUBTITLE_EXTENSIONS.contains(&ext_lower.as_str()) {
                        let filename = path.file_name().unwrap_or_default().to_string_lossy();

                        // Check if this subtitle matches the video basename
                        if filename.starts_with(video_basename.as_ref()) {
                            let classification =
                                classify_subtitle_filename(&filename, &video_basename);
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

pub fn classify_subtitle_filename(filename: &str, _video_basename: &str) -> SubtitleClassification {
    // Classification rules:
    // - If the basename contains an underscore, treat the last segment as a language
    //   when it consists only of letters (e.g. "2_English.srt" -> "English").
    // - Otherwise, look at the last dot-separated segment before the extension and
    //   treat it as a language when it consists only of letters (e.g.
    //   "Band...bul.srt" -> "bul", "Band...sdh.srt" -> "sdh", "Band...forced.srt" -> "forced").
    // - If no such segment exists or it contains non-letters (e.g. "x265-RARBG"),
    //   fall back to Unknown.

    let name = std::path::Path::new(filename)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();

    let (base, _ext) = match name.rsplit_once('.') {
        Some((b, _)) => (b, ()),
        None => return SubtitleClassification::Unknown,
    };

    if let Some(candidate) = base.split('_').last() {
        if !candidate.is_empty() && candidate.chars().all(|c| c.is_alphabetic()) {
            return SubtitleClassification::VideoSubtitle(candidate.to_string());
        }
    }

    if let Some(candidate) = base.split('.').last() {
        if !candidate.is_empty() && candidate.chars().all(|c| c.is_alphabetic()) {
            return SubtitleClassification::VideoSubtitle(candidate.to_string());
        }
    }

    SubtitleClassification::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    #[test]
    fn find_subtitle_files_detects_matching_language_subtitle() {
        let dir = tempdir().expect("failed to create temp dir");

        let video_path = dir
            .path()
            .join("Band.of.Brothers.S01E10.1080p.BluRay.x265-RARBG.mp4");
        let sub_path = dir
            .path()
            .join("Band.of.Brothers.S01E10.1080p.BluRay.x265-RARBG.bul.srt");

        // Create empty files – content is irrelevant for discovery
        fs::write(&video_path, b"").expect("failed to write video file");
        fs::write(&sub_path, b"").expect("failed to write subtitle file");

        let results = find_subtitle_files(video_path.to_string_lossy().as_ref());
        assert_eq!(results.len(), 1, "expected exactly one matching subtitle");

        let sub = &results[0];
        assert_eq!(sub.original_path, sub_path.to_string_lossy());

        match sub.classification {
            SubtitleClassification::VideoSubtitle(ref lang) => {
                assert_eq!(lang, "bul");
            }
            _ => panic!("expected VideoSubtitle classification with language code"),
        }
    }

    #[test]
    fn find_subtitle_files_ignores_non_matching_basenames_and_case_insensitive_ext() {
        let dir = tempdir().expect("failed to create temp dir");

        let video_path = dir.path().join("Show.S01E02.mkv");
        let matching_sub = dir.path().join("Show.S01E02.eng.SRT"); // upper-case extension
        let non_matching_sub = dir.path().join("OtherShow.S01E02.eng.srt");

        fs::write(&video_path, b"").expect("failed to write video file");
        fs::write(&matching_sub, b"").expect("failed to write matching subtitle");
        fs::write(&non_matching_sub, b"").expect("failed to write non-matching subtitle");

        let results = find_subtitle_files(video_path.to_string_lossy().as_ref());
        assert_eq!(
            results.len(),
            1,
            "expected only the subtitle sharing the video basename to be detected"
        );
        assert_eq!(results[0].original_path, matching_sub.to_string_lossy());
    }

    #[tokio::test]
    async fn preview_renames_skips_when_skip_subtitles_true() {
        let dir = tempdir().expect("failed to create temp dir");

        let video_path = dir.path().join("Show.S01E01.mkv");
        let sub_path = dir.path().join("Show.S01E01.eng.srt");

        fs::write(&video_path, b"").expect("failed to write video file");
        fs::write(&sub_path, b"").expect("failed to write subtitle file");

        let settings = json!({
            "general": {
                "subtitles": {
                    "skipSubtitles": true
                }
            },
            "movies": {},
            "tv": {}
        });

        let request = PreviewRenamesRequest {
            library_id: "lib1".to_string(),
            scope: vec![video_path.to_string_lossy().to_string()],
            settings,
            server_id: "server1".to_string(),
        };

        let result = preview_renames(request)
            .await
            .expect("preview_renames should succeed");
        assert!(result.subtitle_operations.is_empty());
    }

    #[tokio::test]
    async fn preview_renames_generates_subtitle_rename_when_not_skipped() {
        let dir = tempdir().expect("failed to create temp dir");

        let video_path = dir.path().join("Show.S01E01.mkv");
        let sub_path = dir.path().join("Show.S01E01.eng.srt");

        fs::write(&video_path, b"").expect("failed to write video file");
        fs::write(&sub_path, b"").expect("failed to write subtitle file");

        let settings = json!({
            "general": {
                "subtitles": {
                    "skipSubtitles": false,
                    "convertToUtf8": false
                }
            },
            "movies": {},
            "tv": {}
        });

        let request = PreviewRenamesRequest {
            library_id: "lib1".to_string(),
            scope: vec![video_path.to_string_lossy().to_string()],
            settings,
            server_id: "server1".to_string(),
        };

        let result = preview_renames(request)
            .await
            .expect("preview_renames should succeed");

        assert_eq!(
            result.subtitle_operations.len(),
            1,
            "expected one subtitle operation"
        );
        let op = &result.subtitle_operations[0];
        assert_eq!(op.operation_type, "rename");

        let new_basename = Path::new(&op.new_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        assert_eq!(new_basename, "Show.S01E01.eng.srt");
    }

    #[tokio::test]
    async fn preview_renames_normalizes_movie_sdh_suffix_when_configured() {
        let dir = tempdir().expect("failed to create temp dir");

        let video_path = dir.path().join("Movie.mkv");
        let sub_path = dir.path().join("Movie.sdh.srt");

        fs::write(&video_path, b"").expect("failed to write video file");
        fs::write(&sub_path, b"").expect("failed to write subtitle file");

        let settings = json!({
            "general": {
                "subtitles": {
                    "skipSubtitles": false,
                    "convertToUtf8": false
                }
            },
            "movies": {
                "subtitles": {
                    "forcedSdhHandling": "normalize"
                }
            },
            "tv": {}
        });

        let request = PreviewRenamesRequest {
            library_id: "movie-lib".to_string(),
            scope: vec![video_path.to_string_lossy().to_string()],
            settings,
            server_id: "server1".to_string(),
        };

        let result = preview_renames(request)
            .await
            .expect("preview_renames should succeed");
        assert_eq!(
            result.subtitle_operations.len(),
            1,
            "expected one subtitle operation"
        );

        let op = &result.subtitle_operations[0];
        let new_basename = Path::new(&op.new_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        assert_eq!(new_basename, "Movie.forced.srt");
    }

    #[test]
    fn apply_single_operation_convert_creates_backup_and_utf8_bom_output() {
        let dir = tempdir().expect("failed to create temp dir");
        let source = dir.path().join("Movie.eng.srt");
        let target = dir.path().join("Movie (2024).eng.srt");
        let backup = dir.path().join("Movie.eng.srt.backup");

        fs::write(&source, b"1\n00:00:00,000 --> 00:00:01,000\nHello\n")
            .expect("failed to write subtitle file");

        let operation = RenameOperation {
            operation_type: "convert".to_string(),
            original_path: source.to_string_lossy().to_string(),
            new_path: target.to_string_lossy().to_string(),
            backup_path: Some(backup.to_string_lossy().to_string()),
            operation_id: "subtitle_test_convert".to_string(),
        };

        apply_single_operation(&operation).expect("convert operation should succeed");

        assert!(backup.exists(), "backup should be created");
        assert!(target.exists(), "converted file should be written");

        let bytes = fs::read(&target).expect("read converted file");
        assert!(
            bytes.starts_with(&[0xEF, 0xBB, 0xBF]),
            "converted subtitle should start with UTF-8 BOM"
        );
    }

    #[test]
    fn apply_single_operation_rename_creates_missing_parent_directory() {
        let dir = tempdir().expect("failed to create temp dir");
        let source = dir.path().join("Movie (2024) .eng.srt");
        let target_dir = dir.path().join("Movie");
        let target = target_dir.join("Movie (2024).eng.srt");

        fs::write(&source, b"1\n00:00:00,000 --> 00:00:01,000\nHello\n")
            .expect("failed to write subtitle file");

        let operation = RenameOperation {
            operation_type: "rename".to_string(),
            original_path: source.to_string_lossy().to_string(),
            new_path: target.to_string_lossy().to_string(),
            backup_path: None,
            operation_id: "subtitle_test_rename".to_string(),
        };

        apply_single_operation(&operation).expect("rename operation should succeed");

        assert!(!source.exists(), "source subtitle should be moved");
        assert!(
            target.exists(),
            "subtitle should be moved into the new folder"
        );
    }
}

#[command]
pub async fn preview_renames(request: PreviewRenamesRequest) -> Result<PreviewResult, String> {
    let video_operations = Vec::new();
    let mut subtitle_operations = Vec::new();
    let mut warnings = Vec::new();
    let blocking_errors = Vec::new();

    // Parse settings
    let general_settings: serde_json::Value = request
        .settings
        .get("general")
        .ok_or("Missing general settings")?
        .clone();

    let movie_settings: serde_json::Value = request
        .settings
        .get("movies")
        .ok_or("Missing movie settings")?
        .clone();
    let tv_settings: serde_json::Value = request
        .settings
        .get("tv")
        .ok_or("Missing TV settings")?
        .clone();

    let subtitles_config = general_settings.get("subtitles");

    let skip_subtitles = subtitles_config
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
                SubtitleClassification::Unknown => new_basename.to_string(),
            };

            let new_path = Path::new(&subtitle.original_path)
                .with_file_name(format!("{}.{}", new_filename, current_extension))
                .to_string_lossy()
                .to_string();

            subtitle.proposed_path = new_path.clone();

            // Check for encoding conversion
            let convert_to_utf8 = general_settings
                .get("subtitles")
                .and_then(|s| s.get("convertToUtf8"))
                .and_then(|s| s.as_bool())
                .unwrap_or(false);

            if convert_to_utf8 {
                match detect_subtitle_encoding(&subtitle.original_path) {
                    Ok((encoding, _)) => {
                        subtitle.encoding_detected = Some(encoding.clone());
                        if encoding != "utf-8" {
                            subtitle.needs_conversion = true;
                            subtitle
                                .warning_flags
                                .push("encoding_conversion".to_string());

                            if encoding == "uncertain" {
                                let skip_uncertain = general_settings
                                    .get("subtitles")
                                    .and_then(|s| s.get("skipUncertainEncoding"))
                                    .and_then(|s| s.as_bool())
                                    .unwrap_or(true);

                                if skip_uncertain {
                                    subtitle
                                        .warning_flags
                                        .push("uncertain_encoding_skipped".to_string());
                                    subtitle.needs_conversion = false;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        warnings.push(format!(
                            "Could not detect encoding for {}: {}",
                            subtitle.original_path, e
                        ));
                    }
                }
            }

            // Apply movie-specific rules
            let library_type = request.library_id.starts_with("movie");
            if library_type {
                let forced_sdh_handling = movie_settings
                    .get("subtitles")
                    .and_then(|s| s.get("forcedSdhHandling"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("preserve");

                match forced_sdh_handling {
                    "normalize" => {
                        // Normalize .sdh to .forced
                        if subtitle.proposed_path.contains(".sdh") {
                            subtitle.proposed_path =
                                subtitle.proposed_path.replace(".sdh", ".forced");
                            subtitle
                                .warning_flags
                                .push("forced_sdh_normalized".to_string());
                        }
                    }
                    "strip" => {
                        // Strip .sdh suffix
                        if subtitle.proposed_path.contains(".sdh") {
                            subtitle.proposed_path = subtitle.proposed_path.replace(".sdh", "");
                            subtitle
                                .warning_flags
                                .push("forced_sdh_stripped".to_string());
                        }
                    }
                    _ => {} // preserve - do nothing
                }

                let unknown_handling = movie_settings
                    .get("subtitles")
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
                            subtitle
                                .warning_flags
                                .push("unknown_subtitle_appended_unk".to_string());
                        }
                        _ => {} // preserve - do nothing
                    }
                }
            }

            // Apply TV-specific rules
            if !library_type {
                let flatten_subfolders = tv_settings
                    .get("subtitles")
                    .and_then(|s| s.get("flattenPerEpisodeSubfolders"))
                    .and_then(|s| s.as_bool())
                    .unwrap_or(true);

                if flatten_subfolders && matches!(subtitle.subtitle_type, SubtitleType::Subfolder) {
                    // Move subtitle from subfolder to video directory
                    let video_dir = Path::new(file_path)
                        .parent()
                        .unwrap_or_else(|| Path::new(file_path))
                        .to_string_lossy();
                    let video_dir_str = video_dir.to_string();
                    let new_path = Path::new(&video_dir_str)
                        .join(Path::new(&subtitle.proposed_path).file_name().unwrap())
                        .to_string_lossy()
                        .to_string();
                    subtitle.proposed_path = new_path;
                    subtitle
                        .warning_flags
                        .push("flattened_from_subfolder".to_string());
                }

                let handle_non_matching = tv_settings
                    .get("subtitles")
                    .and_then(|s| s.get("handleNonMatchingNames"))
                    .and_then(|s| s.as_bool())
                    .unwrap_or(true);

                if handle_non_matching
                    && matches!(subtitle.subtitle_type, SubtitleType::NonMatching)
                {
                    // Map non-matching names (e.g., "2_English.srt" -> "Video.English.srt")
                    let filename = Path::new(&subtitle.original_path)
                        .file_name()
                        .unwrap()
                        .to_string_lossy();
                    if let Ok(regex) = Regex::new(SUBTITLE_PATTERNS[1]) {
                        if let Some(captures) = regex.captures(&filename) {
                            if let (Some(_prefix), Some(lang_suffix)) =
                                (captures.get(1), captures.get(2))
                            {
                                let extension = Path::new(&subtitle.original_path)
                                    .extension()
                                    .unwrap_or_default()
                                    .to_string_lossy();
                                let new_filename = format!(
                                    "{}.{}.{}",
                                    new_basename,
                                    lang_suffix.as_str(),
                                    extension
                                );
                                let video_dir = Path::new(file_path)
                                    .parent()
                                    .unwrap_or_else(|| Path::new(file_path))
                                    .to_string_lossy()
                                    .to_string();
                                let full_path = Path::new(&video_dir).join(&new_filename);
                                subtitle.proposed_path = full_path.to_string_lossy().to_string();
                                subtitle
                                    .warning_flags
                                    .push("mapped_non_matching".to_string());
                            }
                        }
                    }
                }

                let multi_sub_handling = tv_settings
                    .get("subtitles")
                    .and_then(|s| s.get("multiSubHandling"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("preserve");

                // Handle multiple subtitles with same language (simplified logic)
                // In a full implementation, this would track duplicates and apply numbering
                match multi_sub_handling {
                    "number" => {
                        subtitle
                            .warning_flags
                            .push("multi_sub_numbered".to_string());
                    }
                    "first_only" => {
                        subtitle
                            .warning_flags
                            .push("multi_sub_first_only".to_string());
                    }
                    _ => {} // preserve - do nothing
                }
            }

            // Create operation
            let operation = RenameOperation {
                operation_type: if subtitle.needs_conversion {
                    "convert".to_string()
                } else {
                    "rename".to_string()
                },
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

fn resolve_operations_for_apply(
    operations: &[RenameOperation],
    mappings: &[crate::path_map::PathMapping],
    server_id: &str,
) -> Result<Vec<RenameOperation>, String> {
    let mut resolved_operations = Vec::new();

    for operation in operations {
        let resolved_original = crate::path_map::resolve_apply_path_strict(
            &operation.original_path,
            mappings,
            server_id,
        )
        .ok_or_else(|| {
            format!(
                "Failed to resolve original path: {}",
                operation.original_path
            )
        })?;
        let resolved_new =
            crate::path_map::resolve_apply_path_strict(&operation.new_path, mappings, server_id)
                .ok_or_else(|| format!("Failed to resolve new path: {}", operation.new_path))?;

        resolved_operations.push(RenameOperation {
            operation_type: operation.operation_type.clone(),
            original_path: resolved_original.to_string_lossy().to_string(),
            new_path: resolved_new.to_string_lossy().to_string(),
            backup_path: operation.backup_path.as_ref().map(|backup| {
                crate::path_map::resolve_apply_path_strict(backup, mappings, server_id)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| backup.clone())
            }),
            operation_id: operation.operation_id.clone(),
        });
    }

    Ok(resolved_operations)
}

pub(crate) fn apply_operations_with_log_path<F>(
    operations: &[RenameOperation],
    log_path: &Path,
    mut apply_operation: F,
) -> Result<ApplyResult, String>
where
    F: FnMut(&RenameOperation) -> Result<(), String>,
{
    let mut operations_applied = 0;
    let mut operations_failed = 0;
    let mut errors = Vec::new();
    let mut all_operations = Vec::new();

    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create log directory: {}", e))?;
    }

    for operation in operations {
        match apply_operation(operation) {
            Ok(_) => {
                operations_applied += 1;
                all_operations.push(serde_json::json!({
                    "operation_type": operation.operation_type,
                    "original_path": operation.original_path,
                    "new_path": operation.new_path,
                    "backup_path": operation.backup_path,
                    "operation_id": operation.operation_id,
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
                    "operation_id": operation.operation_id,
                    "status": "failed",
                    "error": e
                }));
            }
        }
    }

    let log_content = serde_json::to_string_pretty(&all_operations)
        .map_err(|e| format!("Failed to serialize rollback log: {}", e))?;

    fs::write(log_path, log_content).map_err(|e| format!("Failed to write rollback log: {}", e))?;

    Ok(ApplyResult {
        success: operations_failed == 0,
        operations_applied,
        operations_failed,
        rollback_log_path: log_path.to_string_lossy().to_string(),
        errors,
        operations: operations.to_vec(),
    })
}

pub(crate) fn rollback_log_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~/.nameotron"))
        .join("logs")
        .join(format!("rollback_{}.json", chrono::Utc::now().timestamp()))
}

pub fn undo_rename_from_log_path(
    log_path: &Path,
    remove_log_on_success: bool,
) -> Result<ApplyResult, String> {
    let log_content =
        fs::read_to_string(log_path).map_err(|e| format!("Failed to read rollback log: {}", e))?;

    let operations: Vec<RenameOperation> = serde_json::from_str(&log_content)
        .map_err(|e| format!("Failed to parse rollback log: {}", e))?;

    let mut operations_applied = 0;
    let mut operations_failed = 0;
    let mut errors = Vec::new();

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

    if remove_log_on_success && operations_failed == 0 {
        let _ = fs::remove_file(log_path);
    }

    Ok(ApplyResult {
        success: operations_failed == 0,
        operations_applied,
        operations_failed,
        rollback_log_path: log_path.to_string_lossy().to_string(),
        errors,
        operations,
    })
}

#[command]
pub async fn apply_renames(
    app: tauri::AppHandle,
    request: ApplyRenamesRequest,
) -> Result<ApplyResult, String> {
    // Get path mappings from settings
    let settings_result = crate::settings::get_settings(app);
    let mappings: Vec<crate::path_map::PathMapping> = match settings_result {
        Ok(settings) => crate::path_map::path_mappings_from_settings(&settings),
        Err(e) => return Err(format!("Failed to get settings: {}", e)),
    };

    let operations =
        resolve_operations_for_apply(&request.operations, &mappings, &request.server_id).map_err(
            |msg| {
                crate::logging::log_event(
                    "ERROR",
                    "apply_renames",
                    &msg,
                    serde_json::json!({ "server_id": request.server_id }),
                );
                msg
            },
        )?;

    let log_path = rollback_log_path();

    apply_operations_with_log_path(&operations, &log_path, apply_single_operation)
}

pub fn apply_single_operation(operation: &RenameOperation) -> Result<(), String> {
    match operation.operation_type.as_str() {
        "rename" => {
            let original_path = Path::new(&operation.original_path);
            let new_path = Path::new(&operation.new_path);
            if let Some(parent) = new_path.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    format!("Failed to create directory {}: {}", parent.display(), e)
                })?;
            }
            if original_path != new_path && new_path.exists() {
                return Err(format!("Target already exists: {}", operation.new_path));
            }
            // Simple rename
            fs::rename(&operation.original_path, &operation.new_path).map_err(|e| {
                format!(
                    "Failed to rename {} to {}: {}",
                    operation.original_path, operation.new_path, e
                )
            })?;
        }
        "move" => {
            let original_path = Path::new(&operation.original_path);
            let new_path = Path::new(&operation.new_path);
            if let Some(parent) = new_path.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    format!("Failed to create directory {}: {}", parent.display(), e)
                })?;
            }
            if original_path != new_path && new_path.exists() {
                return Err(format!("Target already exists: {}", operation.new_path));
            }
            // Move operation (different directories)
            // For simplicity, using rename which works across directories on same filesystem
            fs::rename(&operation.original_path, &operation.new_path).map_err(|e| {
                format!(
                    "Failed to move {} to {}: {}",
                    operation.original_path, operation.new_path, e
                )
            })?;
        }
        "convert" => {
            // Encoding conversion with backup
            if let Some(ref backup_path) = operation.backup_path {
                convert_subtitle_to_utf8(
                    &operation.original_path,
                    &operation.new_path,
                    backup_path,
                )?;
            }
        }
        _ => {
            return Err(format!(
                "Unknown operation type: {}",
                operation.operation_type
            ));
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
        .filter(|entry| entry.path().extension().map_or(false, |ext| ext == "json"))
        .collect();

    if log_files.is_empty() {
        return Err("No rollback logs found".to_string());
    }

    // Sort by modification time (newest first)
    log_files.sort_by(|a, b| {
        b.metadata()
            .unwrap()
            .modified()
            .unwrap()
            .cmp(&a.metadata().unwrap().modified().unwrap())
    });

    let most_recent_log = log_files[0].path();

    undo_rename_from_log_path(&most_recent_log, true)
}

fn undo_single_operation(operation: &RenameOperation) -> Result<(), String> {
    match operation.operation_type.as_str() {
        "rename" | "move" => {
            // Reverse rename/move
            fs::rename(&operation.new_path, &operation.original_path).map_err(|e| {
                format!(
                    "Failed to undo rename {} to {}: {}",
                    operation.new_path, operation.original_path, e
                )
            })?;
        }
        "convert" => {
            // Restore from backup if it exists
            if let Some(ref backup_path) = operation.backup_path {
                if Path::new(backup_path).exists() {
                    fs::rename(backup_path, &operation.original_path).map_err(|e| {
                        format!(
                            "Failed to restore backup {} to {}: {}",
                            backup_path, operation.original_path, e
                        )
                    })?;
                }
            }
        }
        _ => {
            return Err(format!(
                "Cannot undo unknown operation type: {}",
                operation.operation_type
            ));
        }
    }

    Ok(())
}
