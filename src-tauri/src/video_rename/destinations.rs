use super::{
    safe_folder_name, MovieDestinationItem, MovieDestinationRequest, MovieDestinationResponseItem,
};

fn normalize_plex_path(path: &str) -> String {
    path.replace('\\', "/")
}

pub(super) fn compute_relative_dirs(original_path: &str, library_roots: &[String]) -> Vec<String> {
    let normalized = normalize_plex_path(original_path);

    let mut best_prefix_len: usize = 0;
    let mut best_root: Option<String> = None;

    for root in library_roots {
        let root_norm = normalize_plex_path(root).trim_end_matches('/').to_string();
        if !root_norm.is_empty()
            && normalized.starts_with(&root_norm)
            && root_norm.len() > best_prefix_len
        {
            best_prefix_len = root_norm.len();
            best_root = Some(root_norm);
        }
    }

    let relative = if let Some(root) = best_root {
        let mut tail = normalized[root.len()..].to_string();
        if tail.starts_with('/') {
            tail.remove(0);
        }
        tail
    } else {
        normalized.trim_start_matches('/').to_string()
    };

    let parts: Vec<&str> = relative.split('/').filter(|p| !p.is_empty()).collect();
    if parts.is_empty() {
        return Vec::new();
    }

    parts[..parts.len() - 1]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

fn compute_movie_destination_for_item(
    item: &MovieDestinationItem,
    relative_dirs: &[String],
    movie_settings: &serde_json::Value,
) -> String {
    let own_folder_per_movie = movie_settings
        .get("ownFolderPerMovie")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let mut segments: Vec<String> = Vec::new();

    if relative_dirs.is_empty() {
        if own_folder_per_movie {
            let folder = safe_folder_name(&item.title);
            segments.push(folder);
        }
    } else {
        segments.extend(relative_dirs.iter().cloned());
    }

    if segments.is_empty() {
        item.base_name.clone()
    } else {
        let mut path = segments.join("/");
        path.push('/');
        path.push_str(&item.base_name);
        path
    }
}

pub(super) fn compute_movie_destinations_impl(
    request: MovieDestinationRequest,
) -> Result<Vec<MovieDestinationResponseItem>, String> {
    let movie_settings = request
        .settings
        .get("movies")
        .ok_or("Missing movie settings")?;

    let mut results: Vec<MovieDestinationResponseItem> = Vec::new();

    for item in &request.items {
        let relative_dirs = compute_relative_dirs(&item.original_path, &request.library_roots);
        let proposed = compute_movie_destination_for_item(item, &relative_dirs, movie_settings);
        results.push(MovieDestinationResponseItem {
            rating_key: item.rating_key.clone(),
            proposed,
        });
    }

    Ok(results)
}
