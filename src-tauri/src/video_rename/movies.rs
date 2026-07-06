use super::{
    apply_chronological_prefix, basename, detect_edition_from_path, extname,
    format_collection_folder_name, get_organized_path, normalize_unicode, render_template,
    safe_folder_name, sanitize_and_validate_path, MovieItem, RenameOperation, TemplateContext,
};

pub(super) fn compute_movie_proposal(
    movie: &MovieItem,
    template: &str,
    settings: &serde_json::Value,
) -> Result<RenameOperation, String> {
    let mut context = TemplateContext::new();
    let ext = extname(&movie.file);

    context.insert("title".to_string(), movie.title.clone());
    context.insert(
        "year".to_string(),
        movie.year.map(|y| y.to_string()).unwrap_or_default(),
    );
    context.insert(
        "imdb".to_string(),
        movie.imdb_id.clone().unwrap_or_default(),
    );
    context.insert(
        "tmdb".to_string(),
        movie.tmdb_id.clone().unwrap_or_default(),
    );
    context.insert(
        "tvdb".to_string(),
        movie.tvdb_id.clone().unwrap_or_default(),
    );
    context.insert("ext".to_string(), ext.clone());

    let mut processed_ids = Vec::new();
    if let Some(imdb) = &movie.imdb_id {
        processed_ids.push(format!("imdb:{}", imdb));
    }
    if let Some(tmdb) = &movie.tmdb_id {
        processed_ids.push(format!("tmdb:{}", tmdb));
    }
    if let Some(tvdb) = &movie.tvdb_id {
        processed_ids.push(format!("tvdb:{}", tvdb));
    }
    context.insert("ids".to_string(), processed_ids.join(","));

    let mut proposed = render_template(template, &context);
    if !proposed.ends_with(&ext) {
        proposed.push_str(&ext);
    }

    let edition_display = detect_edition_from_path(&movie.file)
        .map(|(_, title)| title)
        .unwrap_or_default();

    if !edition_display.is_empty() {
        let lower = proposed.to_lowercase();
        let has_edition_already =
            lower.contains("{edition-") || lower.contains(&edition_display.to_lowercase());

        if !has_edition_already {
            let injection = if edition_display.starts_with(" - ") {
                edition_display
            } else {
                format!(" {}", edition_display)
            };
            if let Some(dot_pos) = proposed.rfind(&ext) {
                proposed = format!(
                    "{}{}{}",
                    &proposed[..dot_pos],
                    injection,
                    &proposed[dot_pos..]
                );
            } else {
                proposed.push_str(&injection);
            }
        }
    }

    let movie_settings = settings.get("movies").ok_or("Missing movie settings")?;

    let collections_enabled = movie_settings
        .get("collections")
        .and_then(|c| c.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if collections_enabled && movie.collection.is_some() {
        let collection_mode = movie_settings
            .get("collections")
            .and_then(|c| c.get("mode"))
            .and_then(|v| v.as_str())
            .unwrap_or("always");

        let should_include_in_collection = match collection_mode {
            "always" => true,
            "if2plus" => false,
            _ => false,
        };

        if should_include_in_collection {
            let collection_folder_name =
                format_collection_folder_name(movie.collection.as_ref().unwrap(), movie_settings);
            if !proposed.contains('/') {
                proposed = format!("{}/{}", collection_folder_name, proposed);
            } else {
                let file_name = basename(&proposed);
                proposed = format!("{}/{}", collection_folder_name, file_name);
            }
        }
    }

    let folder_structure = movie_settings
        .get("folderStructure")
        .and_then(|v| v.as_str())
        .unwrap_or("none");

    match folder_structure {
        "none" => {
            let own_folder_per_movie = movie_settings
                .get("ownFolderPerMovie")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            if own_folder_per_movie && !proposed.contains('/') {
                let folder_name = safe_folder_name(&movie.title);
                proposed = format!("{}/{}", folder_name, proposed);
            }
        }
        "alpha" | "alpha_ranges" | "genre" | "year_decade" => {
            let desired_path =
                get_organized_path(&movie.title, movie.year, &movie.genre, folder_structure);

            if let Some(desired) = desired_path {
                let chronological_prefix = movie_settings
                    .get("chronologicalPrefix")
                    .and_then(|v| v.as_str())
                    .unwrap_or("none");

                let prefixed_path = match chronological_prefix {
                    "year" => {
                        if let Some(year) = movie.year {
                            apply_chronological_prefix(&desired, year)
                        } else {
                            desired
                        }
                    }
                    "collection_order" => desired,
                    _ => desired,
                };

                proposed = format!("{}/{}", prefixed_path, proposed);
            } else {
                let own_folder_per_movie = movie_settings
                    .get("ownFolderPerMovie")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);

                if own_folder_per_movie && !proposed.contains('/') {
                    let folder_name = safe_folder_name(&movie.title);
                    proposed = format!("{}/{}", folder_name, proposed);
                }
            }
        }
        _ => {
            let own_folder_per_movie = movie_settings
                .get("ownFolderPerMovie")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            if own_folder_per_movie && !proposed.contains('/') {
                let folder_name = safe_folder_name(&movie.title);
                proposed = format!("{}/{}", folder_name, proposed);
            }
        }
    }

    proposed = normalize_unicode(&proposed);

    let (sanitized_path, _warnings, _blocking_errors) =
        sanitize_and_validate_path(&proposed, settings);

    Ok(RenameOperation {
        operation_type: "rename".to_string(),
        original_path: movie.file.clone(),
        new_path: sanitized_path.clone(),
        backup_path: None,
        operation_id: format!("movie_{}", movie.rating_key),
    })
}
