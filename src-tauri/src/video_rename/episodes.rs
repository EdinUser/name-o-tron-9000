use super::{
    extname, normalize_unicode, render_template, sanitize_and_validate_path, EpisodeItem,
    RenameOperation, TemplateContext,
};
use super::episode_tokens::{
    append_split_part_suffix, detect_multi_episode_range, detect_split_part_suffix,
    render_episode_template_with_plex_tokens,
};

pub(super) fn compute_episode_proposal(
    episode: &EpisodeItem,
    template: &str,
    settings: &serde_json::Value,
) -> Result<RenameOperation, String> {
    let mut context = TemplateContext::new();
    let ext = extname(&episode.file);
    let split_part_suffix = detect_split_part_suffix(&episode.file);

    context.insert("title".to_string(), episode.title.clone());
    context.insert(
        "year".to_string(),
        episode.year.map(|y| y.to_string()).unwrap_or_default(),
    );
    context.insert(
        "imdb".to_string(),
        episode.imdb_id.clone().unwrap_or_default(),
    );
    context.insert(
        "tmdb".to_string(),
        episode.tmdb_id.clone().unwrap_or_default(),
    );
    context.insert(
        "tvdb".to_string(),
        episode.tvdb_id.clone().unwrap_or_default(),
    );
    context.insert("ext".to_string(), ext.clone());

    context.insert(
        "grandparentTitle".to_string(),
        episode.grandparent_title.clone(),
    );
    context.insert("parentTitle".to_string(), episode.parent_title.clone());
    context.insert("parentIndex".to_string(), episode.parent_index.to_string());
    context.insert("index".to_string(), episode.index.to_string());

    let tv_settings = settings.get("tv").ok_or("Missing TV settings")?;

    let detect_ovas_season00 = tv_settings
        .get("detectOVAsSeason00")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let season_folder_name = if episode.parent_index == 0 && detect_ovas_season00 {
        "Specials".to_string()
    } else {
        format!("Season {:02}", episode.parent_index)
    };

    let normalize_multi_episode = tv_settings
        .get("normalizeMultiEpisode")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let mut range_end = episode.index;
    if normalize_multi_episode {
        if let Some((start_ep, end_ep)) = detect_multi_episode_range(&episode.file) {
            range_end = end_ep;
            context.insert("multiEpisodeStart".to_string(), start_ep.to_string());
            context.insert("multiEpisodeEnd".to_string(), end_ep.to_string());
            context.insert(
                "multiEpisodeRange".to_string(),
                format!("E{:02}-E{:02}", start_ep, end_ep),
            );
        }
    }

    let mut processed_ids = Vec::new();
    if let Some(imdb) = &episode.imdb_id {
        processed_ids.push(format!("imdb:{}", imdb));
    }
    if let Some(tmdb) = &episode.tmdb_id {
        processed_ids.push(format!("tmdb:{}", tmdb));
    }
    if let Some(tvdb) = &episode.tvdb_id {
        processed_ids.push(format!("tvdb:{}", tvdb));
    }
    context.insert("ids".to_string(), processed_ids.join(","));

    let rendered_template =
        render_episode_template_with_plex_tokens(template, episode.index, range_end);
    let mut proposed = render_template(&rendered_template, &context);
    if !proposed.ends_with(&ext) {
        proposed.push_str(&ext);
    }
    proposed = append_split_part_suffix(&proposed, &ext, split_part_suffix.as_deref());

    let season_folders = tv_settings
        .get("seasonFolders")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if season_folders && !proposed.contains('/') {
        proposed = format!("{}/{}", season_folder_name, proposed);
    }

    proposed = normalize_unicode(&proposed);

    let (sanitized_path, _warnings, _blocking_errors) =
        sanitize_and_validate_path(&proposed, settings);

    Ok(RenameOperation {
        operation_type: "rename".to_string(),
        original_path: episode.file.clone(),
        new_path: sanitized_path.clone(),
        backup_path: None,
        operation_id: format!("episode_{}", episode.rating_key),
    })
}
