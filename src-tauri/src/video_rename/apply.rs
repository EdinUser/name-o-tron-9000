use super::{ApplyResult, CleanupEmptyFoldersResult, RenameOperation};
use std::fs;
use std::path::Path;

pub(super) fn resolve_video_operations_for_apply(
    operations: &[RenameOperation],
    mappings: &[crate::path_map::PathMapping],
    server_id: &str,
) -> Result<Vec<RenameOperation>, String> {
    let mut resolved_operations = Vec::new();

    for operation in operations {
        let resolved_original = crate::path_map::resolve_apply_path_allow_local(
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

        let resolved_new = crate::path_map::resolve_apply_path_allow_local_or_relative(
            &operation.new_path,
            mappings,
            server_id,
            &resolved_original,
        )
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

pub(super) fn apply_mixed_operations_with_log_path(
    operations: &[RenameOperation],
    log_path: &std::path::Path,
) -> Result<ApplyResult, String> {
    crate::subtitle::apply_operations_with_log_path(operations, log_path, |operation| {
        if operation.operation_id.starts_with("subtitle_") {
            crate::subtitle::apply_single_operation(operation)
        } else {
            apply_single_video_operation(operation)
        }
    })
}

pub(super) fn cleanup_empty_folders_with_mappings(
    mappings: &[crate::path_map::PathMapping],
    server_id: &str,
    original_paths: &[String],
) -> CleanupEmptyFoldersResult {
    use std::path::PathBuf;

    let mut removed_directories = Vec::new();
    let mut errors = Vec::new();

    let mut candidate_dirs: Vec<PathBuf> = Vec::new();
    for original in original_paths {
        let resolved = if let Some(resolved) =
            crate::path_map::resolve_apply_path_allow_local(original, mappings, server_id)
        {
            resolved
        } else {
            errors.push(format!(
                "Failed to resolve path for empty-folder check: {}",
                original
            ));
            continue;
        };

        if let Some(parent) = resolved.parent() {
            candidate_dirs.push(parent.to_path_buf());
        }
    }

    candidate_dirs.sort();
    candidate_dirs.dedup();

    for dir in candidate_dirs {
        let mut current = dir.clone();

        for _ in 0..4 {
            if !current.exists() || !current.is_dir() {
                break;
            }

            let is_under_mapped_root = mappings.iter().any(|m| {
                let root = PathBuf::from(&m.local_root);
                current.starts_with(&root)
            });
            if !is_under_mapped_root {
                break;
            }

            match std::fs::read_dir(&current) {
                Ok(mut entries) => {
                    if entries.next().is_some() {
                        break;
                    }
                }
                Err(e) => {
                    errors.push(format!(
                        "Failed to read directory {}: {}",
                        current.to_string_lossy(),
                        e
                    ));
                    break;
                }
            }

            match std::fs::remove_dir(&current) {
                Ok(_) => removed_directories.push(current.to_string_lossy().to_string()),
                Err(e) => {
                    errors.push(format!(
                        "Failed to remove directory {}: {}",
                        current.to_string_lossy(),
                        e
                    ));
                    break;
                }
            }

            if let Some(parent) = current.parent() {
                current = parent.to_path_buf();
            } else {
                break;
            }
        }
    }

    CleanupEmptyFoldersResult {
        removed_directories,
        errors,
    }
}

pub(super) fn apply_single_video_operation(operation: &RenameOperation) -> Result<(), String> {
    let original_path = Path::new(&operation.original_path);
    let new_path = Path::new(&operation.new_path);

    if let Some(parent) = new_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    match operation.operation_type.as_str() {
        "rename" => {
            if !original_path.exists() {
                return Err(format!(
                    "Source file does not exist: {}",
                    operation.original_path
                ));
            }
            if original_path != new_path && new_path.exists() {
                return Err(format!("Target already exists: {}", operation.new_path));
            }

            fs::rename(&operation.original_path, &operation.new_path).map_err(|e| {
                format!(
                    "Failed to rename {} to {}: {}",
                    operation.original_path, operation.new_path, e
                )
            })?;
        }
        "move" => {
            if !original_path.exists() {
                return Err(format!(
                    "Source file does not exist: {}",
                    operation.original_path
                ));
            }
            if original_path != new_path && new_path.exists() {
                return Err(format!("Target already exists: {}", operation.new_path));
            }

            fs::rename(&operation.original_path, &operation.new_path).map_err(|e| {
                format!(
                    "Failed to move {} to {}: {}",
                    operation.original_path, operation.new_path, e
                )
            })?;
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
