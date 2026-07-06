use regex::Regex;

use super::basename;

fn format_episode_range_value(start_episode: i32, end_episode: i32, width: Option<usize>) -> String {
    let start = if let Some(width) = width {
        format!("{:0width$}", start_episode, width = width)
    } else {
        start_episode.to_string()
    };

    if end_episode <= start_episode {
        return start;
    }

    let end = if let Some(width) = width {
        format!("{:0width$}", end_episode, width = width)
    } else {
        end_episode.to_string()
    };

    format!("{}-{}", start, end)
}

fn format_prefixed_episode_range_value(
    prefix: &str,
    start_episode: i32,
    end_episode: i32,
    width: Option<usize>,
) -> String {
    let start = if let Some(width) = width {
        format!("{:0width$}", start_episode, width = width)
    } else {
        start_episode.to_string()
    };

    if end_episode <= start_episode {
        return format!("{}{}", prefix, start);
    }

    let end = if let Some(width) = width {
        format!("{:0width$}", end_episode, width = width)
    } else {
        end_episode.to_string()
    };

    format!("{}{}-{}{}", prefix, start, prefix, end)
}

pub(super) fn detect_multi_episode_range(file_path: &str) -> Option<(i32, i32)> {
    let filename = basename(file_path);
    let re = Regex::new(r"[sS](\d{1,2})[eE](\d{1,2})(?:-[eE]?(\d{1,2})|[eE](\d{1,2}))").ok()?;
    let captures = re.captures(&filename)?;

    let start_episode = captures.get(2)?.as_str().parse::<i32>().ok()?;
    let end_episode = captures
        .get(3)
        .or_else(|| captures.get(4))?
        .as_str()
        .parse::<i32>()
        .ok()?;

    if end_episode <= start_episode || end_episode - start_episode > 10 {
        return None;
    }

    Some((start_episode, end_episode))
}

pub(super) fn detect_split_part_suffix(file_path: &str) -> Option<String> {
    let filename = basename(file_path);
    let stem = filename.rsplit_once('.').map(|(name, _)| name).unwrap_or(&filename);
    let tail_token = stem
        .split(|c: char| matches!(c, ' ' | '.' | '_' | '-'))
        .filter(|segment| !segment.is_empty())
        .last()?
        .to_ascii_lowercase();
    let re = Regex::new(r"^(cd\d+|disc\d+|disk\d+|dvd\d+|part\d+|pt\d+)$").ok()?;
    if re.is_match(&tail_token) {
        Some(tail_token)
    } else {
        None
    }
}

pub(super) fn render_episode_template_with_plex_tokens(
    template: &str,
    start_episode: i32,
    end_episode: i32,
) -> String {
    if end_episode <= start_episode {
        return template.to_string();
    }

    let with_prefixed = Regex::new(r"([eE])\{(episode|index)(?::(\d+))?\}")
        .unwrap()
        .replace_all(template, |caps: &regex::Captures| {
            let prefix = caps.get(1).map(|m| m.as_str()).unwrap_or("E");
            let width = caps.get(3).and_then(|m| m.as_str().parse::<usize>().ok());
            format_prefixed_episode_range_value(prefix, start_episode, end_episode, width)
        })
        .to_string();

    Regex::new(r"\{(episode|index)(?::(\d+))?\}")
        .unwrap()
        .replace_all(&with_prefixed, |caps: &regex::Captures| {
            let width = caps.get(2).and_then(|m| m.as_str().parse::<usize>().ok());
            format_episode_range_value(start_episode, end_episode, width)
        })
        .to_string()
}

pub(super) fn append_split_part_suffix(
    proposed: &str,
    ext: &str,
    split_part_suffix: Option<&str>,
) -> String {
    let Some(split_part_suffix) = split_part_suffix else {
        return proposed.to_string();
    };

    let lower_proposed = proposed.to_ascii_lowercase();
    let lower_suffix = if ext.is_empty() {
        format!(" - {}", split_part_suffix)
    } else {
        format!(" - {}{}", split_part_suffix, ext.to_ascii_lowercase())
    };

    if lower_proposed.ends_with(&lower_suffix) {
        return proposed.to_string();
    }

    if !ext.is_empty() && proposed.to_ascii_lowercase().ends_with(&ext.to_ascii_lowercase()) {
        let base = &proposed[..proposed.len() - ext.len()];
        return format!("{} - {}{}", base, split_part_suffix, ext);
    }

    format!("{} - {}", proposed, split_part_suffix)
}
