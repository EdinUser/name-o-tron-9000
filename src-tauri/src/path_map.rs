use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct PathMapping {
    pub server_id: String,
    pub plex_root: String,
    pub local_root: String,
    pub platform: Option<String>,
}

// Path resolution utilities for mapping Plex server paths to local filesystem paths
// Note: The main path resolution is now handled in the frontend, but these utilities
// are available for backend operations that need path mapping functionality.

/// Normalize path separators to forward slashes and trim trailing slashes.
fn normalize_slashes(s: &str) -> String {
    let mut out = s.replace('\\', "/");
    while out.ends_with('/') && out.len() > 1 {
        out.pop();
    }
    out
}

/// Produce a normalized string for comparisons, with optional case-insensitive mode.
fn norm_for_compare(s: &str, case_insensitive: bool) -> String {
    let mut out = normalize_slashes(s);
    if case_insensitive {
        out = out.to_ascii_lowercase();
    }
    out
}

fn is_windows(platform: Option<&str>) -> bool {
    match platform.map(|p| p.to_ascii_lowercase()) {
        // Explicit hint wins
        Some(ref p) => p.contains("win"),
        // No hint: fall back to compile-time target
        None => cfg!(target_os = "windows"),
    }
}

fn server_ids_match(mapping_id: &str, server_id: &str) -> bool {
    if mapping_id == server_id {
        return true;
    }

    fn host_only(id: &str) -> &str {
        let without_scheme = if let Some(idx) = id.find("://") {
            &id[idx + 3..]
        } else {
            id
        };
        if let Some(idx) = without_scheme.find(':') {
            &without_scheme[..idx]
        } else {
            without_scheme
        }
    }

    host_only(mapping_id) == host_only(server_id)
}

fn join_relative_path_components(base: &Path, relative_path: &str) -> PathBuf {
    let mut joined = base.to_path_buf();
    for segment in relative_path
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty())
    {
        joined.push(segment);
    }
    joined
}

fn path_starts_with_equivalent(path: &Path, root: &Path, case_insensitive: bool) -> bool {
    let path_cmp = norm_for_compare(&path.to_string_lossy(), case_insensitive);
    let root_cmp = norm_for_compare(&root.to_string_lossy(), case_insensitive);
    if path_cmp == root_cmp || path_cmp.starts_with(&(root_cmp + "/")) {
        return true;
    }

    let Ok(path_canonical) = fs::canonicalize(path) else {
        return false;
    };
    let Ok(root_canonical) = fs::canonicalize(root) else {
        return false;
    };

    let path_cmp = norm_for_compare(&path_canonical.to_string_lossy(), case_insensitive);
    let root_cmp = norm_for_compare(&root_canonical.to_string_lossy(), case_insensitive);
    path_cmp == root_cmp || path_cmp.starts_with(&(root_cmp + "/"))
}

pub fn path_mappings_from_settings(settings: &serde_json::Value) -> Vec<PathMapping> {
    settings
        .get("pathMappings")
        .and_then(|pm| pm.as_array())
        .map(|mappings_array| {
            mappings_array
                .iter()
                .filter_map(|mapping| {
                    let obj = mapping.as_object()?;
                    Some(PathMapping {
                        server_id: obj.get("server_id")?.as_str()?.to_string(),
                        plex_root: obj.get("plex_root")?.as_str()?.to_string(),
                        local_root: obj.get("local_root")?.as_str()?.to_string(),
                        platform: obj
                            .get("platform")
                            .and_then(|value| value.as_str())
                            .map(|value| value.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn mappings_for_server(settings: &serde_json::Value, server_id: &str) -> Vec<PathMapping> {
    filter_mappings_for_server(&path_mappings_from_settings(settings), server_id)
}

pub fn filter_mappings_for_server(mappings: &[PathMapping], server_id: &str) -> Vec<PathMapping> {
    mappings
        .iter()
        .filter(|mapping| server_ids_match(&mapping.server_id, server_id))
        .cloned()
        .collect()
}

pub fn extract_library_root_from_path(
    resolved_path: &Path,
    mappings: &[PathMapping],
) -> Option<PathBuf> {
    let mut best_root: Option<&str> = None;
    let mut best_len = 0;

    for mapping in mappings {
        let local_root = &mapping.local_root;
        let case_insensitive = mapping
            .platform
            .as_deref()
            .map(|platform| platform.eq_ignore_ascii_case("windows"))
            .unwrap_or_else(|| is_windows(None));
        if path_starts_with_equivalent(resolved_path, Path::new(local_root), case_insensitive)
            && local_root.len() > best_len
        {
            best_root = Some(local_root);
            best_len = local_root.len();
        }
    }

    best_root.map(PathBuf::from)
}

pub fn resolve_apply_path_strict(
    path: &str,
    mappings: &[PathMapping],
    server_id: &str,
) -> Option<PathBuf> {
    resolve_plex_path(path, mappings, server_id, None)
}

pub fn resolve_apply_path_allow_local(
    path: &str,
    mappings: &[PathMapping],
    server_id: &str,
) -> Option<PathBuf> {
    if is_already_local_path(path, mappings, server_id, None) {
        Some(PathBuf::from(path))
    } else {
        resolve_plex_path(path, mappings, server_id, None)
    }
}

pub fn resolve_apply_path_allow_local_or_relative(
    path: &str,
    mappings: &[PathMapping],
    server_id: &str,
    resolved_original_path: &Path,
) -> Option<PathBuf> {
    if let Some(resolved) = resolve_apply_path_allow_local(path, mappings, server_id) {
        return Some(resolved);
    }

    extract_library_root_from_path(resolved_original_path, mappings)
        .map(|library_root| join_relative_path_components(&library_root, path))
}

/// Check if a path is already resolved to a local filesystem path.
/// Returns true if the path starts with any local root in the mappings.
pub fn is_already_local_path(
    path: &str,
    mappings: &[PathMapping],
    server_id: &str,
    platform_hint: Option<&str>,
) -> bool {
    let case_insensitive = is_windows(platform_hint);
    let path_norm_cmp = norm_for_compare(path, case_insensitive);

    for m in mappings {
        if !server_ids_match(&m.server_id, server_id) {
            continue;
        }

        let ci = m
            .platform
            .as_deref()
            .map(|p| p.eq_ignore_ascii_case("windows"))
            .unwrap_or(case_insensitive);
        let local_root_norm_cmp = norm_for_compare(&m.local_root, ci);

        if path_norm_cmp == local_root_norm_cmp
            || path_norm_cmp.starts_with(&(local_root_norm_cmp.clone() + "/"))
            || path_starts_with_equivalent(Path::new(path), Path::new(&m.local_root), ci)
        {
            return true;
        }
    }

    false
}

pub fn resolve_plex_path(
    plex_path: &str,
    mappings: &[PathMapping],
    server_id: &str,
    platform_hint: Option<&str>,
) -> Option<PathBuf> {
    let case_insensitive = is_windows(platform_hint);
    // Original-case, slash-normalized path from Plex.
    let plex_raw = normalize_slashes(plex_path);

    let mut best: Option<&PathMapping> = None;
    let mut best_len = 0usize;

    for m in mappings {
        if !server_ids_match(&m.server_id, server_id) {
            continue;
        }

        let ci = m
            .platform
            .as_deref()
            .map(|p| p.eq_ignore_ascii_case("windows"))
            .unwrap_or(case_insensitive);

        let root_raw = normalize_slashes(&m.plex_root);
        let plex_cmp = norm_for_compare(&plex_raw, ci);
        let root_cmp = norm_for_compare(&root_raw, ci);

        if plex_cmp == root_cmp || plex_cmp.starts_with(&(root_cmp.clone() + "/")) {
            if root_raw.len() > best_len {
                best = Some(m);
                best_len = root_raw.len();
            }
        }
    }

    let m = best?;
    let root_raw = normalize_slashes(&m.plex_root);
    let rest = &plex_raw[root_raw.len()..];

    // Build local path using OS separator rules, preserving original case from plex_path.
    let local_root = PathBuf::from(&m.local_root);
    let rest_components = rest
        .trim_start_matches('/')
        .split('/')
        .filter(|s| !s.is_empty());

    let mut out = local_root;
    for c in rest_components {
        out.push(c);
    }
    Some(out)
}

#[derive(Debug, Serialize)]
pub struct TestMappingResult {
    pub ok: bool,
    pub exists: bool,
    pub writable: bool,
    pub details: String,
}

#[tauri::command]
pub fn test_mapping(
    _server_id: String,
    _plex_root: String,
    local_root: String,
) -> Result<TestMappingResult, String> {
    let path = Path::new(&local_root);
    let exists = path.exists();
    let mut writable = false;
    let mut details = String::new();

    if exists {
        match path.metadata() {
            Ok(meta) => {
                // Best-effort: directory exists and not readonly → assume writable
                #[allow(unused_mut)]
                let mut ro = meta.permissions().readonly();
                // On Unix, refine by checking execute bit for owner/group/others to enter dir; omit deep ACL checks
                #[cfg(unix)]
                {
                    use std::os::unix::fs::MetadataExt;
                    let mode = meta.mode();
                    // require any write bit as heuristic
                    ro = ro || (mode & 0o222 == 0);
                }
                writable = !ro;
            }
            Err(e) => {
                details = format!("metadata error: {}", e);
            }
        }
    } else {
        details = "local_root does not exist".into();
    }

    let ok = exists && writable;
    Ok(TestMappingResult {
        ok,
        exists,
        writable,
        details,
    })
}
