use regex::Regex;

pub(super) fn detect_edition_from_path(file_path: &str) -> Option<(String, String)> {
    let patterns = [
        r"\{edition-([^}]+)\}",
        r"\(edition-([^)]+)\)",
        r"\[edition-([^\]]+)\]",
    ];

    for pattern in &patterns {
        if let Ok(regex) = Regex::new(pattern) {
            if let Some(captures) = regex.captures(file_path) {
                if let Some(raw) = captures.get(1) {
                    let raw_editions = raw.as_str();
                    let parts: Vec<&str> = raw_editions
                        .split(&[',', ' ', '\t'][..])
                        .filter(|s| !s.is_empty())
                        .collect();

                    let mut titles = Vec::new();
                    let mut tokens = Vec::new();

                    for part in parts {
                        let title = map_edition_token_to_title(part);
                        if !title.is_empty() && !titles.contains(&title) {
                            titles.push(title.clone());
                        }
                        if let Some(token) = title_to_token_part(&title) {
                            if !tokens.contains(&token) {
                                tokens.push(token);
                            }
                        }
                    }

                    if !titles.is_empty() || !tokens.is_empty() {
                        let token = if tokens.is_empty() {
                            None
                        } else {
                            Some(format!("{{edition-{}}}", tokens.join(",")))
                        };
                        let title = if titles.is_empty() {
                            None
                        } else {
                            Some(titles.join(" "))
                        };

                        return Some((token.unwrap_or_default(), title.unwrap_or_default()));
                    }
                }
            }
        }
    }

    None
}

fn map_edition_token_to_title(part: &str) -> String {
    let key = part.to_lowercase();
    match key.as_str() {
        "extended" | "uncut" => "Extended Edition".to_string(),
        "unrated" => "Unrated".to_string(),
        "remastered" | "restored" => "Remastered".to_string(),
        "theatrical" => "Theatrical Cut".to_string(),
        "imax" => "IMAX Edition".to_string(),
        "directors" | "dc" => "Director's Cut".to_string(),
        "special" | "se" => "Special Edition".to_string(),
        "collectors" | "ce" => "Collector's Edition".to_string(),
        "deluxe" | "de" => "Deluxe Edition".to_string(),
        "anniversary" | "ae" => "Anniversary Edition".to_string(),
        "ultimate" | "ue" => "Ultimate Edition".to_string(),
        "diamond" => "Diamond Edition".to_string(),
        "platinum" => "Platinum Edition".to_string(),
        "gold" => "Gold Edition".to_string(),
        "silver" => "Silver Edition".to_string(),
        "steelbook" => "Steelbook Edition".to_string(),
        "criterion" | "cc" => "Criterion Collection".to_string(),
        "4k" | "uhd" => "4K Edition".to_string(),
        "hdr" | "hdr10" | "dolby" => "HDR Edition".to_string(),
        "atmos" => "Dolby Atmos Edition".to_string(),
        "bluray" | "blu" | "bd" => "Blu-ray Edition".to_string(),
        "dvd" => "DVD Edition".to_string(),
        "web" => "Web Edition".to_string(),
        "hdtv" => "HDTV Edition".to_string(),
        _ => part.to_string(),
    }
}

fn title_to_token_part(title: &str) -> Option<String> {
    let t = title.to_lowercase();
    if t.contains("director") {
        Some("directors-cut".to_string())
    } else if t.contains("extended") {
        Some("extended".to_string())
    } else if t.contains("unrated") {
        Some("unrated".to_string())
    } else if t.contains("imax") {
        Some("imax".to_string())
    } else if t.contains("theatrical") {
        Some("theatrical".to_string())
    } else if t.contains("remaster") {
        Some("remastered".to_string())
    } else if t.contains("special") {
        Some("special".to_string())
    } else if t.contains("collector") {
        Some("collectors".to_string())
    } else if t.contains("deluxe") {
        Some("deluxe".to_string())
    } else if t.contains("anniversary") {
        Some("anniversary".to_string())
    } else if t.contains("ultimate") {
        Some("ultimate".to_string())
    } else if t.contains("diamond") {
        Some("diamond".to_string())
    } else if t.contains("platinum") {
        Some("platinum".to_string())
    } else if t.contains("gold") {
        Some("gold".to_string())
    } else if t.contains("silver") {
        Some("silver".to_string())
    } else if t.contains("steelbook") {
        Some("steelbook".to_string())
    } else if t.contains("criterion") {
        Some("criterion".to_string())
    } else if t.contains("4k") {
        Some("4k".to_string())
    } else if t.contains("uhd") {
        Some("uhd".to_string())
    } else if t.contains("hdr") {
        Some("hdr".to_string())
    } else if t.contains("atmos") {
        Some("atmos".to_string())
    } else if t.contains("blu") {
        Some("bluray".to_string())
    } else if t.contains("dvd") {
        Some("dvd".to_string())
    } else if t.contains("web") {
        Some("web".to_string())
    } else if t.contains("hdtv") || t == "hd edition" || t == "hd" {
        Some("hd".to_string())
    } else if t.contains("standard") {
        Some("sd".to_string())
    } else {
        None
    }
}
