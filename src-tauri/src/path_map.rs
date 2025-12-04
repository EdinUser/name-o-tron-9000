use serde::Serialize;
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
    Ok(TestMappingResult { ok, exists, writable, details })
}
