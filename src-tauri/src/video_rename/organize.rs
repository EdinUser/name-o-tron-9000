use super::{render_template, TemplateContext};

pub(super) fn get_organized_path(
    title: &str,
    year: Option<i32>,
    genre: &[String],
    folder_structure: &str,
) -> Option<String> {
    match folder_structure {
        "alpha" => {
            let first_char = title
                .chars()
                .next()
                .unwrap_or('A')
                .to_uppercase()
                .to_string();
            if let Some(y) = year {
                Some(format!("{}/{} ({})", first_char, title, y))
            } else {
                Some(format!("{}/{}", first_char, title))
            }
        }
        "alpha_ranges" => {
            let first_char = title.chars().next().unwrap_or('A');
            let range = match first_char {
                'A'..='C' => "A-C",
                'D'..='F' => "D-F",
                'G'..='I' => "G-I",
                'J'..='L' => "J-L",
                'M'..='O' => "M-O",
                'P'..='R' => "P-R",
                'S'..='U' => "S-U",
                'V'..='Z' => "V-Z",
                _ => "Other",
            };
            if let Some(y) = year {
                Some(format!("{}/{} ({})", range, title, y))
            } else {
                Some(format!("{}/{}", range, title))
            }
        }
        "genre" => {
            let primary_genre = genre
                .first()
                .cloned()
                .unwrap_or_else(|| "Movies".to_string());
            if let Some(y) = year {
                Some(format!("{}/{} ({})", primary_genre, title, y))
            } else {
                Some(format!("{}/{}", primary_genre, title))
            }
        }
        "year_decade" => {
            if let Some(y) = year {
                let decade = (y / 10) * 10;
                Some(format!("{}-{}/{}", decade, decade + 9, title))
            } else {
                Some("Undated".to_string())
            }
        }
        _ => {
            if let Some(y) = year {
                Some(format!("{} ({})", title, y))
            } else {
                Some(title.to_string())
            }
        }
    }
}

pub(super) fn apply_chronological_prefix(path: &str, year: i32) -> String {
    let has_chronological_prefix = path
        .split('/')
        .any(|folder| folder.trim_start().starts_with(&format!("{} -", year)));

    if !has_chronological_prefix {
        if let Some(first_slash) = path.find('/') {
            format!("{} - {}", year, &path[first_slash + 1..])
        } else {
            format!("{} - {}", year, path)
        }
    } else {
        path.to_string()
    }
}

pub(super) fn format_collection_folder_name(
    collection_name: &str,
    settings: &serde_json::Value,
) -> String {
    let format_template = settings
        .get("collections")
        .and_then(|c| c.get("format"))
        .and_then(|f| f.as_str())
        .unwrap_or("{collection}");

    let mut context = TemplateContext::new();
    context.insert("collection".to_string(), collection_name.to_string());

    render_template(format_template, &context)
}

pub(super) fn safe_folder_name(title: &str) -> String {
    title
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            c => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}
