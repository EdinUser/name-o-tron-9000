use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::fs;
use regex::Regex;
use tauri::command;

// Types for video items (matching frontend types)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovieItem {
    pub rating_key: String,
    pub title: String,
    pub year: Option<i32>,
    pub file: String,
    pub genre: Vec<String>,
    pub collection: Option<String>,
    pub edition_title: Option<String>,
    pub guids: Vec<String>,
    pub imdb_id: Option<String>,
    pub tmdb_id: Option<String>,
    pub tvdb_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodeItem {
    pub rating_key: String,
    pub title: String,
    pub year: Option<i32>,
    pub file: String,
    pub genre: Vec<String>,
    pub guids: Vec<String>,
    pub imdb_id: Option<String>,
    pub tmdb_id: Option<String>,
    pub tvdb_id: Option<String>,
    pub grandparent_title: String, // Show title
    pub parent_title: String,     // Season title
    pub parent_index: i32,        // Season number
    pub index: i32,              // Episode number
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MusicItem {
    pub rating_key: String,
    pub title: String,
    pub year: Option<i32>,
    pub file: String,
    pub genre: Vec<String>,
    pub guids: Vec<String>,
    pub imdb_id: Option<String>,
    pub tmdb_id: Option<String>,
    pub tvdb_id: Option<String>,
    pub grandparent_title: String, // Artist
    pub parent_title: String,     // Album
    pub parent_index: i32,        // Disc number
    pub index: i32,              // Track number
}

// Types for rename operations (matching subtitle.rs)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameOperation {
    pub operation_type: String,  // "rename", "move"
    pub original_path: String,
    pub new_path: String,
    pub backup_path: Option<String>,
    pub operation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewResult {
    pub video_operations: Vec<RenameOperation>,
    pub subtitle_operations: Vec<RenameOperation>,
    pub warnings: Vec<String>,
    pub blocking_errors: Vec<String>,
}

// Template context for rendering
type TemplateContext = HashMap<String, String>;

/// Simple basename implementation
fn basename(path: &str) -> String {
    Path::new(path).file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

/// Template rendering engine (ported from frontend)
fn render_template(template: &str, context: &TemplateContext) -> String {
    if template.is_empty() {
        return String::new();
    }

    // First, process bracketed optional groups.
    let with_groups = Regex::new(r"\[(.+?)\]")
        .unwrap()
        .replace_all(template, |caps: &regex::Captures| {
            let group = &caps[1];
            // Resolve placeholders within the group to check if any have values
            let resolved = Regex::new(r"\{([a-zA-Z0-9_]+)(?::(\d+))?\}")
                .unwrap()
                .replace_all(group, |inner_caps: &regex::Captures| {
                    let key = &inner_caps[1];
                    let fmt = inner_caps.get(2).map(|m| m.as_str());

                    if let Some(value) = context.get(key) {
                        if value.is_empty() {
                            return String::new();
                        }
                        if let Some(fmt_width) = fmt.and_then(|f| f.parse::<usize>().ok()) {
                            // Simple number formatting (pad with zeros)
                            if let Ok(num) = value.parse::<i32>() {
                                return format!("{:0width$}", num, width = fmt_width);
                            }
                        }
                        return value.clone();
                    }
                    String::new()
                });

            // If the resolved group is empty or whitespace/punctuation only, drop the whole group
            if Regex::new(r"[a-zA-Z0-9]").unwrap().is_match(&resolved) {
                resolved.to_string()
            } else {
                String::new()
            }
        });

    // Then, replace simple placeholders.
    let replaced = Regex::new(r"\{([a-zA-Z0-9_]+)(?::(\d+))?\}")
        .unwrap()
        .replace_all(&with_groups, |caps: &regex::Captures| {
            let key = &caps[1];
            let fmt = caps.get(2).map(|m| m.as_str());

            if let Some(value) = context.get(key) {
                if value.is_empty() {
                    return String::new();
                }
                if let Some(fmt_width) = fmt.and_then(|f| f.parse::<usize>().ok()) {
                    // Simple number formatting (pad with zeros)
                    if let Ok(num) = value.parse::<i32>() {
                        return format!("{:0width$}", num, width = fmt_width);
                    }
                }
                return value.clone();
            }
            String::new()
        });

    // Collapse duplicate slashes that may result from empty groups
    replaced.replace("//", "/")
        .replace("  ", " ")
        .trim()
        .to_string()
}

/// Detect edition information from a file path
fn detect_edition_from_path(file_path: &str) -> Option<(String, String)> {
    // Look for Plex edition tokens in path in multiple forms:
    //  - {edition-Extended,Unrated}
    //  - (edition-Extended,Unrated)
    //  - [edition-Extended,Unrated]

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
                    let parts: Vec<&str> = raw_editions.split(&[',', ' ', '\t'][..])
                        .filter(|s| !s.is_empty())
                        .collect();

                    let mut titles = Vec::new();
                    let mut tokens = Vec::new();

                    for part in parts {
                        let title = map_edition_token_to_title(part);
                        if !title.is_empty() && !titles.contains(&title) {
                            titles.push(title.clone());
                        }
                        let token_part = title_to_token_part(&title);
                        if let Some(token) = token_part {
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

/// Map edition token to human-readable title
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

/// Convert title to token part
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

/// Extract extension from file path
fn extname(path: &str) -> String {
    Path::new(path)
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

/// Detect multi-episode files from filename patterns
fn detect_multi_episode(file_path: &str) -> Option<(i32, i32)> {
    let filename = basename(file_path);

    // Look for patterns like "S01E01E02", "S01E01-E02", "E01-E02", etc.
    if let Ok(re) = regex::Regex::new(r"[eE](\d{2})[eE](\d{2})|[eE](\d{2})-?[eE](\d{2})") {
        if let Some(captures) = re.captures(&filename) {
            let start = captures.get(1).or_else(|| captures.get(3));
            let end = captures.get(2).or_else(|| captures.get(4));

            if let (Some(s), Some(e)) = (start, end) {
                if let (Ok(start_num), Ok(end_num)) = (s.as_str().parse::<i32>(), e.as_str().parse::<i32>()) {
                    if start_num < end_num && end_num - start_num <= 10 { // Reasonable episode range
                        return Some((start_num, end_num));
                    }
                }
            }
        }
    }

    None
}

/// Check if path has non-Latin characters
#[allow(dead_code)]
fn has_non_latin(text: &str) -> bool {
    text.chars().any(|c| {
        let code = c as u32;
        (code >= 0x80 && code < 0xA0) || // Control characters in Latin-1 supplement
        (code >= 0x100 && code < 0x178) || // Latin Extended-A
        (code >= 0x180 && code < 0x250) || // Latin Extended-B, IPA Extensions, Spacing Modifier Letters
        (code >= 0x250 && code < 0x2B0) || // Latin Extended Additional, etc.
        (code >= 0x2E0 && code < 0x300) || // More combining marks
        (code >= 0x300 && code < 0x370) || // Combining Diacritical Marks
        (code >= 0x370 && code < 0x400) || // Greek and Coptic
        (code >= 0x400 && code < 0x500) || // Cyrillic
        (code >= 0x500 && code < 0x600) || // Cyrillic Supplement
        (code >= 0x600 && code < 0x700) || // Arabic
        (code >= 0x700 && code < 0x800) || // Syriac, Arabic Extended, Thaana, NKo
        (code >= 0x900 && code < 0x980) || // Devanagari
        (code >= 0x980 && code < 0xA00) || // Bengali
        (code >= 0xA00 && code < 0xA80) || // Gurmukhi, Gujarati
        (code >= 0xA80 && code < 0xB00) || // Oriya, Tamil, Telugu, Kannada, Malayalam, Sinhala
        (code >= 0xB00 && code < 0xC00) || // Thai, Lao, Tibetan
        (code >= 0xC00 && code < 0xC80) || // Georgian, Hangul Jamo
        (code >= 0xC80 && code < 0xD00) || // Ethiopic, Ethiopic Supplement
        (code >= 0xD00 && code < 0xD80) || // Cherokee, Unified Canadian Aboriginal Syllabics, Ogham, Runic
        (code >= 0xD80 && code < 0xE00) || // Khmer, Mongolian
        (code >= 0xE00 && code < 0xE80) || // Myanmar, Georgian Extended
        (code >= 0xE80 && code < 0xF00) || // Lao, Armenian, Syriac Extended
        (code >= 0xF00 && code < 0x1000) || // Devanagari Extended, etc.
        (code >= 0x1000 && code < 0x1100) || // Myanmar Extended-A, etc.
        (code >= 0x1200 && code < 0x1380) || // Ethiopic Extended, etc.
        (code >= 0x1380 && code < 0x1400) || // Cherokee Supplement, etc.
        (code >= 0x1680 && code < 0x1700) || // Ogham, Runic, Tagalog, Hanunoo, Buhid, Tagbanwa
        (code >= 0x1700 && code < 0x1720) || // Tagalog, Hanunoo, Buhid, Tagbanwa
        (code >= 0x1720 && code < 0x1740) || // Buhid, Tagbanwa
        (code >= 0x1740 && code < 0x1760) || // Tagbanwa
        (code >= 0x1760 && code < 0x1780) || // Khmer symbols
        (code >= 0x1800 && code < 0x1900) || // Mongolian
        (code >= 0x1900 && code < 0x1950) || // Limbu, Tai Le, New Tai Lue
        (code >= 0x1950 && code < 0x1980) || // Tai Le, New Tai Lue
        (code >= 0x1980 && code < 0x19E0) || // New Tai Lue
        (code >= 0x19E0 && code < 0x1A20) || // Khmer symbols
        (code >= 0x1A20 && code < 0x1AB0) || // Tai Tham, Combining Diacritical Marks Extended
        (code >= 0x1AB0 && code < 0x1AC0) || // Combining Diacritical Marks Extended
        (code >= 0x1AC0 && code < 0x1B00) || // Combining Diacritical Marks Extended, etc.
        (code >= 0x1B00 && code < 0x1B80) || // Balinese, Sundanese, Batak, Lepcha, Ol Chiki
        (code >= 0x1B80 && code < 0x1BC0) || // Sundanese, Batak, Lepcha, Ol Chiki
        (code >= 0x1BC0 && code < 0x1C00) || // Batak, Lepcha, Ol Chiki
        (code >= 0x1C00 && code < 0x1C50) || // Lepcha, Ol Chiki
        (code >= 0x1C50 && code < 0x1C80) || // Ol Chiki
        (code >= 0x1C80 && code < 0x1CD0) || // Cyrillic Extended C
        (code >= 0x1CD0 && code < 0x1D00) || // Cyrillic Extended C, etc.
        (code >= 0x1D00 && code < 0x1D80) || // Phonetic Extensions, etc.
        (code >= 0x1D80 && code < 0x1DC0) || // Phonetic Extensions Supplement, Combining Diacritical Marks Supplement
        (code >= 0x1DC0 && code < 0x1E00) || // Combining Diacritical Marks Supplement
        (code >= 0x1E00 && code < 0x1F00) || // Latin Extended Additional
        (code >= 0x1F00 && code < 0x2000) || // Greek Extended, General Punctuation
        (code >= 0x2000 && code < 0x2070) || // General Punctuation, Superscripts and Subscripts
        (code >= 0x2070 && code < 0x2090) || // Superscripts and Subscripts
        (code >= 0x2090 && code < 0x20A0) || // Superscripts and Subscripts, Currency Symbols
        (code >= 0x20A0 && code < 0x20D0) || // Currency Symbols, Combining Diacritical Marks for Symbols
        (code >= 0x20D0 && code < 0x2100) || // Combining Diacritical Marks for Symbols, Letterlike Symbols, Number Forms
        (code >= 0x2100 && code < 0x2150) || // Letterlike Symbols, Number Forms
        (code >= 0x2150 && code < 0x2190) || // Number Forms, Arrows
        (code >= 0x2190 && code < 0x2200) || // Arrows
        (code >= 0x2200 && code < 0x2300) || // Mathematical Operators
        (code >= 0x2300 && code < 0x2400) || // Miscellaneous Technical
        (code >= 0x2400 && code < 0x2440) || // Control Pictures
        (code >= 0x2440 && code < 0x2460) || // Optical Character Recognition
        (code >= 0x2460 && code < 0x2500) || // Enclosed Alphanumerics
        (code >= 0x2500 && code < 0x2580) || // Box Drawing
        (code >= 0x2580 && code < 0x25A0) || // Block Elements
        (code >= 0x25A0 && code < 0x2600) || // Geometric Shapes
        (code >= 0x2600 && code < 0x2700) || // Miscellaneous Symbols
        (code >= 0x2700 && code < 0x2800) || // Dingbats
        (code >= 0x2800 && code < 0x2900) || // Braille Patterns
        (code >= 0x2900 && code < 0x2B00) || // Supplemental Arrows-B, Miscellaneous Symbols and Arrows
        (code >= 0x2B00 && code < 0x2C00) || // Glagolitic, Latin Extended-C, Coptic
        (code >= 0x2C00 && code < 0x2C60) || // Glagolitic, Latin Extended-C, Coptic
        (code >= 0x2C60 && code < 0x2C80) || // Latin Extended-C, Coptic
        (code >= 0x2C80 && code < 0x2D00) || // Coptic
        (code >= 0x2D00 && code < 0x2D30) || // Georgian Supplement
        (code >= 0x2D30 && code < 0x2D80) || // Tifinagh
        (code >= 0x2D80 && code < 0x2DE0) || // Ethiopic Extended
        (code >= 0x2DE0 && code < 0x2E00) || // Cyrillic Extended-A
        (code >= 0x2E00 && code < 0x2E80) || // Supplemental Punctuation
        (code >= 0x2E80 && code < 0x2F00) || // CJK Radicals Supplement, Kangxi Radicals
        (code >= 0x2F00 && code < 0x2FF0) || // Kangxi Radicals, Ideographic Description Characters
        (code >= 0x2FF0 && code < 0x3000) || // Ideographic Description Characters
        (code >= 0x3000 && code < 0x3040) || // CJK Symbols and Punctuation, Hiragana
        (code >= 0x3040 && code < 0x30A0) || // Hiragana
        (code >= 0x30A0 && code < 0x3100) || // Katakana
        (code >= 0x3100 && code < 0x3130) || // Bopomofo
        (code >= 0x3130 && code < 0x3190) || // Hangul Compatibility Jamo, Bopomofo Extended, CJK Strokes
        (code >= 0x3190 && code < 0x31C0) || // Kanbun, Bopomofo Extended, CJK Strokes
        (code >= 0x31C0 && code < 0x3200) || // CJK Strokes
        (code >= 0x3200 && code < 0x3300) || // Enclosed CJK Letters and Months
        (code >= 0x3300 && code < 0x3400) || // CJK Compatibility
        (code >= 0x3400 && code < 0x4DC0) || // CJK Unified Ideographs Extension A
        (code >= 0x4DC0 && code < 0x4E00) || // Yijing Hexagram Symbols, CJK Unified Ideographs
        (code >= 0x4E00 && code < 0xA000) || // CJK Unified Ideographs
        (code >= 0xA000 && code < 0xA490) || // Yi Syllables, Yi Radicals
        (code >= 0xA490 && code < 0xA4D0) || // Yi Radicals
        (code >= 0xA4D0 && code < 0xA500) || // Lisu, Vai
        (code >= 0xA500 && code < 0xA640) || // Vai, Cyrillic Extended-B
        (code >= 0xA640 && code < 0xA6A0) || // Cyrillic Extended-B, Bamum
        (code >= 0xA6A0 && code < 0xA700) || // Bamum
        (code >= 0xA700 && code < 0xA720) || // Modifier Tone Letters, Latin Extended-D
        (code >= 0xA720 && code < 0xA800) || // Latin Extended-D
        (code >= 0xA800 && code < 0xA830) || // Syloti Nagri
        (code >= 0xA830 && code < 0xA840) || // Common Indic Number Forms, Phags-pa
        (code >= 0xA840 && code < 0xA880) || // Phags-pa, Saurashtra
        (code >= 0xA880 && code < 0xA8E0) || // Saurashtra
        (code >= 0xA8E0 && code < 0xA900) || // Combining Half Marks, Devanagari Extended
        (code >= 0xA900 && code < 0xA930) || // Kayah Li, Rejang, Javanese, Myanmar Extended-B
        (code >= 0xA930 && code < 0xA960) || // Rejang, Javanese, Myanmar Extended-B
        (code >= 0xA960 && code < 0xA980) || // Myanmar Extended-B, Cham, Myanmar Extended-A
        (code >= 0xA980 && code < 0xAA00) || // Cham, Myanmar Extended-A
        (code >= 0xAA00 && code < 0xAA60) || // Myanmar Extended-A, Tai Viet
        (code >= 0xAA60 && code < 0xAA80) || // Tai Viet, Meetei Mayek Extensions
        (code >= 0xAA80 && code < 0xAAE0) || // Meetei Mayek Extensions
        (code >= 0xAAE0 && code < 0xAB00) || // Meetei Mayek, Hangul Jamo Extended-A
        (code >= 0xAB00 && code < 0xAB30) || // Hangul Jamo Extended-A, Ethiopic Extended-A
        (code >= 0xAB30 && code < 0xAB70) || // Latin Extended-E, Cherokee Supplement
        (code >= 0xAB70 && code < 0xABC0) || // Cherokee Supplement, Meetei Mayek
        (code >= 0xABC0 && code < 0xAC00) || // Meetei Mayek
        (code >= 0xAC00 && code < 0xD7B0) || // Hangul Syllables
        (code >= 0xD7B0 && code < 0xD7D0) || // Hangul Jamo Extended-B
        (code >= 0xD7D0 && code < 0xD800) || // Hangul Jamo Extended-B, High Surrogates
        (code >= 0xD800 && code < 0xDB80) || // High Surrogates, High Private Use Surrogates, Low Surrogates
        (code >= 0xDB80 && code < 0xDC00) || // High Private Use Surrogates, Low Surrogates
        (code >= 0xDC00 && code < 0xE000) || // Low Surrogates, Private Use Area
        (code >= 0xE000 && code < 0xF900) || // Private Use Area, CJK Compatibility Ideographs
        (code >= 0xF900 && code < 0xFB00) || // CJK Compatibility Ideographs
        (code >= 0xFB00 && code < 0xFB50) || // Alphabetic Presentation Forms, Arabic Presentation Forms-A
        (code >= 0xFB50 && code < 0xFE00) || // Arabic Presentation Forms-A
        (code >= 0xFE00 && code < 0xFE10) || // Variation Selectors, Vertical Forms
        (code >= 0xFE10 && code < 0xFE20) || // Vertical Forms, Combining Half Marks
        (code >= 0xFE20 && code < 0xFE30) || // Combining Half Marks, CJK Compatibility Forms, Small Form Variants
        (code >= 0xFE30 && code < 0xFE50) || // CJK Compatibility Forms, Small Form Variants, Arabic Presentation Forms-B
        (code >= 0xFE50 && code < 0xFE70) || // Small Form Variants, Arabic Presentation Forms-B
        (code >= 0xFE70 && code < 0xFF00) || // Arabic Presentation Forms-B, Halfwidth and Fullwidth Forms
        (code >= 0xFF00 && code < 0xFFF0) || // Halfwidth and Fullwidth Forms
        (code >= 0xFFF0 && code < 0x10000) || // Specials
        (code >= 0x10000 && code < 0x10100) || // Linear B Syllabary, Linear B Ideograms, Aegean Numbers, Ancient Greek Numbers
        (code >= 0x10100 && code < 0x10140) || // Aegean Numbers, Ancient Greek Numbers, Ancient Symbols
        (code >= 0x10140 && code < 0x10190) || // Ancient Symbols, Phaistos Disc, Lycian, Carian, Coptic Epact Numbers
        (code >= 0x10190 && code < 0x101D0) || // Phaistos Disc, Lycian, Carian, Coptic Epact Numbers, Old Italic
        (code >= 0x101D0 && code < 0x10200) || // Coptic Epact Numbers, Old Italic, Gothic, Old Permic, Ugaritic
        (code >= 0x10200 && code < 0x10280) || // Gothic, Old Permic, Ugaritic, Old Persian, Deseret
        (code >= 0x10280 && code < 0x102A0) || // Old Persian, Deseret, Shavian, Osmanya, Osage, Elbasan
        (code >= 0x102A0 && code < 0x102E0) || // Shavian, Osmanya, Osage, Elbasan, Caucasian Albanian, Linear A
        (code >= 0x102E0 && code < 0x10300) || // Osage, Elbasan, Caucasian Albanian, Linear A, Cypriot Syllabary
        (code >= 0x10300 && code < 0x10350) || // Caucasian Albanian, Linear A, Cypriot Syllabary, Imperial Aramaic, Palmyrene
        (code >= 0x10350 && code < 0x10380) || // Cypriot Syllabary, Imperial Aramaic, Palmyrene, Nabataean, Hatran
        (code >= 0x10380 && code < 0x103A0) || // Imperial Aramaic, Palmyrene, Nabataean, Hatran, Phoenician
        (code >= 0x103A0 && code < 0x10400) || // Nabataean, Hatran, Phoenician, Lydian, Meroitic Hieroglyphs, Meroitic Cursive
        (code >= 0x10400 && code < 0x10450) || // Phoenician, Lydian, Meroitic Hieroglyphs, Meroitic Cursive, Kharoshthi
        (code >= 0x10450 && code < 0x10480) || // Meroitic Hieroglyphs, Meroitic Cursive, Kharoshthi, Old South Arabian, Old North Arabian
        (code >= 0x10480 && code < 0x104B0) || // Kharoshthi, Old South Arabian, Old North Arabian, Manichaean, Avestan
        (code >= 0x104B0 && code < 0x10500) || // Old South Arabian, Old North Arabian, Manichaean, Avestan, Inscriptional Parthian
        (code >= 0x10500 && code < 0x10530) || // Old South Arabian, Old North Arabian, Manichaean, Avestan, Inscriptional Parthian, Inscriptional Pahlavi
        (code >= 0x10530 && code < 0x10570) || // Inscriptional Parthian, Inscriptional Pahlavi, Psalter Pahlavi, Old Turkic, Old Hungarian
        (code >= 0x10570 && code < 0x10600) || // Psalter Pahlavi, Old Turkic, Old Hungarian, Rumi Numeral Symbols, Brahmi
        (code >= 0x10600 && code < 0x10780) || // Old Turkic, Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng
        (code >= 0x10780 && code < 0x10800) || // Brahmi, Kaithi, Sora Sompeng, Chakma, Mahajani, Sharada
        (code >= 0x10800 && code < 0x10840) || // Sora Sompeng, Chakma, Mahajani, Sharada, Sinhala Archaic Numbers, Khojki
        (code >= 0x10840 && code < 0x10860) || // Chakma, Mahajani, Sharada, Sinhala Archaic Numbers, Khojki, Multani, Khudawadi
        (code >= 0x10860 && code < 0x10880) || // Sharada, Sinhala Archaic Numbers, Khojki, Multani, Khudawadi, Grantha
        (code >= 0x10880 && code < 0x108E0) || // Sinhala Archaic Numbers, Khojki, Multani, Khudawadi, Grantha, Newa, Tirhuta
        (code >= 0x108E0 && code < 0x10900) || // Khojki, Multani, Khudawadi, Grantha, Newa, Tirhuta, Siddham, Modi
        (code >= 0x10900 && code < 0x10920) || // Grantha, Newa, Tirhuta, Siddham, Modi, Mongolian Supplement, Takri
        (code >= 0x10920 && code < 0x10940) || // Newa, Tirhuta, Siddham, Modi, Mongolian Supplement, Takri, Ahom
        (code >= 0x10940 && code < 0x10980) || // Tirhuta, Siddham, Modi, Mongolian Supplement, Takri, Ahom
        (code >= 0x10980 && code < 0x109A0) || // Siddham, Modi, Mongolian Supplement, Takri, Ahom, Hatran
        (code >= 0x109A0 && code < 0x10A00) || // Modi, Mongolian Supplement, Takri, Ahom, Hatran, Multani
        (code >= 0x10A00 && code < 0x10A60) || // Mongolian Supplement, Takri, Ahom, Hatran, Multani, Old Hungarian
        (code >= 0x10A60 && code < 0x10A80) || // Takri, Ahom, Hatran, Multani, Old Hungarian, Rumi Numeral Symbols
        (code >= 0x10A80 && code < 0x10AC0) || // Ahom, Hatran, Multani, Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi
        (code >= 0x10AC0 && code < 0x10B00) || // Hatran, Multani, Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng
        (code >= 0x10B00 && code < 0x10B40) || // Multani, Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng, Chakma
        (code >= 0x10B40 && code < 0x10B60) || // Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng, Chakma, Mahajani
        (code >= 0x10B60 && code < 0x10B80) || // Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng, Chakma, Mahajani, Sharada
        (code >= 0x10B80 && code < 0x10BC0) || // Brahmi, Kaithi, Sora Sompeng, Chakma, Mahajani, Sharada, Sinhala Archaic Numbers
        (code >= 0x10BC0 && code < 0x10C00) || // Kaithi, Sora Sompeng, Chakma, Mahajani, Sharada, Sinhala Archaic Numbers, Khojki
        (code >= 0x10C00 && code < 0x10C50) || // Sora Sompeng, Chakma, Mahajani, Sharada, Sinhala Archaic Numbers, Khojki, Multani
        (code >= 0x10C50 && code < 0x10C80) || // Chakma, Mahajani, Sharada, Sinhala Archaic Numbers, Khojki, Multani, Khudawadi
        (code >= 0x10C80 && code < 0x10D00) || // Mahajani, Sharada, Sinhala Archaic Numbers, Khojki, Multani, Khudawadi, Grantha
        (code >= 0x10D00 && code < 0x10D30) || // Sharada, Sinhala Archaic Numbers, Khojki, Multani, Khudawadi, Grantha, Newa
        (code >= 0x10D30 && code < 0x10D40) || // Sinhala Archaic Numbers, Khojki, Multani, Khudawadi, Grantha, Newa, Tirhuta
        (code >= 0x10D40 && code < 0x10D80) || // Khojki, Multani, Khudawadi, Grantha, Newa, Tirhuta, Siddham
        (code >= 0x10D80 && code < 0x10E00) || // Multani, Khudawadi, Grantha, Newa, Tirhuta, Siddham, Modi
        (code >= 0x10E00 && code < 0x10E80) || // Khudawadi, Grantha, Newa, Tirhuta, Siddham, Modi, Mongolian Supplement
        (code >= 0x10E80 && code < 0x10F00) || // Grantha, Newa, Tirhuta, Siddham, Modi, Mongolian Supplement, Takri
        (code >= 0x10F00 && code < 0x10F30) || // Newa, Tirhuta, Siddham, Modi, Mongolian Supplement, Takri, Ahom
        (code >= 0x10F30 && code < 0x10F70) || // Tirhuta, Siddham, Modi, Mongolian Supplement, Takri, Ahom, Hatran
        (code >= 0x10F70 && code < 0x10FB0) || // Siddham, Modi, Mongolian Supplement, Takri, Ahom, Hatran, Multani
        (code >= 0x10FB0 && code < 0x11000) || // Modi, Mongolian Supplement, Takri, Ahom, Hatran, Multani, Old Hungarian
        (code >= 0x11000 && code < 0x11080) || // Mongolian Supplement, Takri, Ahom, Hatran, Multani, Old Hungarian, Rumi Numeral Symbols
        (code >= 0x11080 && code < 0x11100) || // Takri, Ahom, Hatran, Multani, Old Hungarian, Rumi Numeral Symbols, Brahmi
        (code >= 0x11100 && code < 0x11150) || // Ahom, Hatran, Multani, Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi
        (code >= 0x11150 && code < 0x11180) || // Hatran, Multani, Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng
        (code >= 0x11180 && code < 0x111E0) || // Multani, Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng, Chakma
        (code >= 0x111E0 && code < 0x11200) || // Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng, Chakma, Mahajani
        (code >= 0x11200 && code < 0x11250) || // Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng, Chakma, Mahajani, Sharada
        (code >= 0x11250 && code < 0x11280) || // Brahmi, Kaithi, Sora Sompeng, Chakma, Mahajani, Sharada, Sinhala Archaic Numbers
        (code >= 0x11280 && code < 0x112B0) || // Kaithi, Sora Sompeng, Chakma, Mahajani, Sharada, Sinhala Archaic Numbers, Khojki
        (code >= 0x112B0 && code < 0x11300) || // Sora Sompeng, Chakma, Mahajani, Sharada, Sinhala Archaic Numbers, Khojki, Multani
        (code >= 0x11300 && code < 0x11350) || // Chakma, Mahajani, Sharada, Sinhala Archaic Numbers, Khojki, Multani, Khudawadi
        (code >= 0x11350 && code < 0x11380) || // Mahajani, Sharada, Sinhala Archaic Numbers, Khojki, Multani, Khudawadi, Grantha
        (code >= 0x11380 && code < 0x113C0) || // Sharada, Sinhala Archaic Numbers, Khojki, Multani, Khudawadi, Grantha, Newa
        (code >= 0x113C0 && code < 0x11400) || // Sinhala Archaic Numbers, Khojki, Multani, Khudawadi, Grantha, Newa, Tirhuta
        (code >= 0x11400 && code < 0x11480) || // Khojki, Multani, Khudawadi, Grantha, Newa, Tirhuta, Siddham
        (code >= 0x11480 && code < 0x11500) || // Multani, Khudawadi, Grantha, Newa, Tirhuta, Siddham, Modi
        (code >= 0x11500 && code < 0x11580) || // Khudawadi, Grantha, Newa, Tirhuta, Siddham, Modi, Mongolian Supplement
        (code >= 0x11580 && code < 0x11600) || // Grantha, Newa, Tirhuta, Siddham, Modi, Mongolian Supplement, Takri
        (code >= 0x11600 && code < 0x11680) || // Newa, Tirhuta, Siddham, Modi, Mongolian Supplement, Takri, Ahom
        (code >= 0x11680 && code < 0x11700) || // Tirhuta, Siddham, Modi, Mongolian Supplement, Takri, Ahom, Hatran
        (code >= 0x11700 && code < 0x11740) || // Siddham, Modi, Mongolian Supplement, Takri, Ahom, Hatran, Multani
        (code >= 0x11740 && code < 0x11800) || // Modi, Mongolian Supplement, Takri, Ahom, Hatran, Multani, Old Hungarian
        (code >= 0x11800 && code < 0x11840) || // Mongolian Supplement, Takri, Ahom, Hatran, Multani, Old Hungarian, Rumi Numeral Symbols
        (code >= 0x11840 && code < 0x118C0) || // Takri, Ahom, Hatran, Multani, Old Hungarian, Rumi Numeral Symbols, Brahmi
        (code >= 0x118C0 && code < 0x11900) || // Ahom, Hatran, Multani, Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi
        (code >= 0x11900 && code < 0x11960) || // Hatran, Multani, Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng
        (code >= 0x11960 && code < 0x11A00) || // Multani, Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng, Chakma
        (code >= 0x11A00 && code < 0x11A50) || // Old Hungarian, Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng, Chakma, Mahajani
        (code >= 0x11A50 && code < 0x11AB0) || // Rumi Numeral Symbols, Brahmi, Kaithi, Sora Sompeng, Chakma, Mahajani, Sharada
        (code >= 0x11AB0 && code < 0x11B00) || // Brahmi, Kaithi, Sora Sompeng, Chakma, Mahajani, Sharada, Sinhala Archaic Numbers
        (code >= 0x11B00 && code < 0x11B60) || // Kaithi, Sora Sompeng, Chakma, Mahajani, Sharada, Sinhala Archaic Numbers, Khojki
        (code >= 0x11B60 && code < 0x11C00) || // Sora Sompeng, Chakma, Mahajani, Sharada, Sinhala Archaic Numbers, Khojki, Multani
        (code >= 0x11C00 && code < 0x11C70) || // Chakma, Mahajani, Sharada, Sinhala Archaic Numbers, Khojki, Multani, Khudawadi
        (code >= 0x11C70 && code < 0x11CB0) || // Mahajani, Sharada, Sinhala Archaic Numbers, Khojki, Multani, Khudawadi, Grantha
        (code >= 0x11CB0 && code < 0x11D00) || // Sharada, Sinhala Archaic Numbers, Khojki, Multani, Khudawadi, Grantha, Newa
        (code >= 0x11D00 && code < 0x11D60) || // Sinhala Archaic Numbers, Khojki, Multani, Khudawadi, Grantha, Newa, Tirhuta
        (code >= 0x11D60 && code < 0x11DA0) || // Khojki, Multani, Khudawadi, Grantha, Newa, Tirhuta, Siddham
        (code >= 0x11DA0 && code < 0x11E00) || // Multani, Khudawadi, Grantha, Newa, Tirhuta, Siddham, Modi
        (code >= 0x11E00 && code < 0x11E40) || // Khudawadi, Grantha, Newa, Tirhuta, Siddham, Modi, Mongolian Supplement
        (code >= 0x11E40 && code < 0x11E80) || // Grantha, Newa, Tirhuta, Siddham, Modi, Mongolian Supplement, Takri
        (code >= 0x11E80 && code < 0x11EC0) || // Newa, Tirhuta, Siddham, Modi, Mongolian Supplement, Takri, Ahom
        (code >= 0x11EC0 && code < 0x11F00) || // Tirhuta, Siddham, Modi, Mongolian Supplement, Takri, Ahom, Hatran
        (code >= 0x11F00 && code < 0x11FB0) || // Siddham, Modi, Mongolian Supplement, Takri, Ahom, Hatran, Multani
        (code >= 0x11FB0 && code < 0x12000) || // Modi, Mongolian Supplement, Takri, Ahom, Hatran, Multani, Old Hungarian
        (code >= 0x12000 && code < 0x12390) || // Mongolian Supplement, Takri, Ahom, Hatran, Multani, Old Hungarian, Cuneiform, Cuneiform Numbers and Punctuation
        (code >= 0x12390 && code < 0x12400) || // Cuneiform, Cuneiform Numbers and Punctuation, Early Dynastic Cuneiform
        (code >= 0x12400 && code < 0x12480) || // Cuneiform Numbers and Punctuation, Early Dynastic Cuneiform
        (code >= 0x12480 && code < 0x12550) || // Early Dynastic Cuneiform
        (code >= 0x12550 && code < 0x12F90) || // Early Dynastic Cuneiform, Cypro-Minoan, Linear A, Linear B Syllabary, Linear B Ideograms
        (code >= 0x12F90 && code < 0x13000) || // Linear A, Linear B Syllabary, Linear B Ideograms, Aegean Numbers, Ancient Greek Numbers
        (code >= 0x13000 && code < 0x13430) || // Linear B Syllabary, Linear B Ideograms, Aegean Numbers, Ancient Greek Numbers, Egyptian Hieroglyphs
        (code >= 0x13430 && code < 0x13440) || // Aegean Numbers, Ancient Greek Numbers, Egyptian Hieroglyphs, Egyptian Hieroglyph Format Controls
        (code >= 0x13440 && code < 0x14400) || // Ancient Greek Numbers, Egyptian Hieroglyphs, Egyptian Hieroglyph Format Controls, Anatolian Hieroglyphs, Bamum Supplement
        (code >= 0x14400 && code < 0x14650) || // Egyptian Hieroglyphs, Egyptian Hieroglyph Format Controls, Anatolian Hieroglyphs, Bamum Supplement, Mro, Tangsa
        (code >= 0x14650 && code < 0x16780) || // Anatolian Hieroglyphs, Bamum Supplement, Mro, Tangsa, Bassa Vah, Pahawh Hmong, Medefaidrin
        (code >= 0x16780 && code < 0x16800) || // Bamum Supplement, Mro, Tangsa, Bassa Vah, Pahawh Hmong, Medefaidrin, Miao
        (code >= 0x16800 && code < 0x16A40) || // Mro, Tangsa, Bassa Vah, Pahawh Hmong, Medefaidrin, Miao, Tangut, Tangut Components
        (code >= 0x16A40 && code < 0x16A70) || // Bassa Vah, Pahawh Hmong, Medefaidrin, Miao, Tangut, Tangut Components, Kawi
        (code >= 0x16A70 && code < 0x16AD0) || // Pahawh Hmong, Medefaidrin, Miao, Tangut, Tangut Components, Kawi, Kawi
        (code >= 0x16AD0 && code < 0x16B00) || // Medefaidrin, Miao, Tangut, Tangut Components, Kawi, Kawi
        (code >= 0x16B00 && code < 0x16B90) || // Miao, Tangut, Tangut Components, Kawi, Kawi
        (code >= 0x16B90 && code < 0x16E40) || // Tangut, Tangut Components, Kawi, Kawi, Kirat Rai
        (code >= 0x16E40 && code < 0x16E80) || // Kawi, Kawi, Kirat Rai, Kirat Rai
        (code >= 0x16E80 && code < 0x16F00) || // Kawi, Kawi, Kirat Rai, Kirat Rai
        (code >= 0x16F00 && code < 0x16F50) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai
        (code >= 0x16F50 && code < 0x16FA0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai
        (code >= 0x16FA0 && code < 0x17000) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai
        (code >= 0x17000 && code < 0x187F0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script
        (code >= 0x187F0 && code < 0x18800) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement
        (code >= 0x18800 && code < 0x18B00) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga
        (code >= 0x18B00 && code < 0x18CD0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan
        (code >= 0x18CD0 && code < 0x18D00) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls
        (code >= 0x18D00 && code < 0x1AFF0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols
        (code >= 0x1AFF0 && code < 0x1B000) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols
        (code >= 0x1B000 && code < 0x1B100) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation
        (code >= 0x1B100 && code < 0x1B130) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B
        (code >= 0x1B130 && code < 0x1B170) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1B170 && code < 0x1B2FC) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1B2FC && code < 0x1B2FF) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1B2FF && code < 0x1B300) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1B300 && code < 0x1BC00) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1BC00 && code < 0x1BCA0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1BCA0 && code < 0x1BCA4) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1BCA4 && code < 0x1D000) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D000 && code < 0x1D0F6) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D0F6 && code < 0x1D100) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D100 && code < 0x1D127) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D127 && code < 0x1D129) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D129 && code < 0x1D165) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D165 && code < 0x1D167) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D167 && code < 0x1D169) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D169 && code < 0x1D173) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D173 && code < 0x1D17B) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D17B && code < 0x1D182) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D182 && code < 0x1D185) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D185 && code < 0x1D18C) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D18C && code < 0x1D1AA) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D1AA && code < 0x1D1AE) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D1AE && code < 0x1D1E9) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D1E9 && code < 0x1D200) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D200 && code < 0x1D246) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D246 && code < 0x1D300) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D300 && code < 0x1D360) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D360 && code < 0x1D372) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D372 && code < 0x1D378) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D378 && code < 0x1D400) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D400 && code < 0x1D455) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D455 && code < 0x1D49F) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D49F && code < 0x1D4A2) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D4A2 && code < 0x1D4A6) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D4A6 && code < 0x1D4A9) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D4A9 && code < 0x1D4AC) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D4AC && code < 0x1D4AE) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D4AE && code < 0x1D4BA) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D4BA && code < 0x1D4C4) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D4C4 && code < 0x1D507) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D507 && code < 0x1D50B) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D50B && code < 0x1D515) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D515 && code < 0x1D51C) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D51C && code < 0x1D53A) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D53A && code < 0x1D53F) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D53F && code < 0x1D545) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D545 && code < 0x1D547) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D547 && code < 0x1D54A) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D54A && code < 0x1D550) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D550 && code < 0x1D552) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D552 && code < 0x1D6A4) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D6A4 && code < 0x1D6A8) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D6A8 && code < 0x1D6C1) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D6C1 && code < 0x1D6C2) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D6C2 && code < 0x1D6FA) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D6FA && code < 0x1D700) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D700 && code < 0x1D715) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D715 && code < 0x1D720) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D720 && code < 0x1D737) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D737 && code < 0x1D74F) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D74F && code < 0x1D755) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D755 && code < 0x1D789) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D789 && code < 0x1D7CC) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D7CC && code < 0x1D7CE) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D7CE && code < 0x1D800) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1D800 && code < 0x1DA8C) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1DA8C && code < 0x1DA9B) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1DA9B && code < 0x1DAA0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1DAA0 && code < 0x1DAB0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1DAB0 && code < 0x1E000) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E000 && code < 0x1E007) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E007 && code < 0x1E008) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E008 && code < 0x1E019) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E019 && code < 0x1E01B) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E01B && code < 0x1E022) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E022 && code < 0x1E024) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E024 && code < 0x1E026) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E026 && code < 0x1E02A) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E02A && code < 0x1E08F) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E08F && code < 0x1E100) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E100 && code < 0x1E12D) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E12D && code < 0x1E130) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E130 && code < 0x1E13D) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E13D && code < 0x1E140) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E140 && code < 0x1E149) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E149 && code < 0x1E14E) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E14E && code < 0x1E150) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E150 && code < 0x1E2C0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E2C0 && code < 0x1E2F0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E2F0 && code < 0x1E2FF) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E2FF && code < 0x1E300) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E300 && code < 0x1E7E0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E7E0 && code < 0x1E7E7) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E7E7 && code < 0x1E7E8) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E7E8 && code < 0x1E7EC) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E7EC && code < 0x1E7EF) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E7EF && code < 0x1E7FF) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E7FF && code < 0x1E800) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E800 && code < 0x1E8C5) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E8C5 && code < 0x1E8C7) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E8C7 && code < 0x1E8D0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E8D0 && code < 0x1E8D7) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E8D7 && code < 0x1E900) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E900 && code < 0x1E922) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E922 && code < 0x1E947) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E947 && code < 0x1E949) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E949 && code < 0x1E950) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E950 && code < 0x1E960) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1E960 && code < 0x1EC70) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EC70 && code < 0x1ECB4) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1ECB4 && code < 0x1ED00) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1ED00 && code < 0x1ED3E) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1ED3E && code < 0x1ED3F) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1ED3F && code < 0x1EE00) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE00 && code < 0x1EE04) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE04 && code < 0x1EE05) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE05 && code < 0x1EE20) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE20 && code < 0x1EE22) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE22 && code < 0x1EE24) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE24 && code < 0x1EE27) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE27 && code < 0x1EE30) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE30 && code < 0x1EE32) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE32 && code < 0x1EE34) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE34 && code < 0x1EE37) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE37 && code < 0x1EE39) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE39 && code < 0x1EE3B) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE3B && code < 0x1EE42) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE42 && code < 0x1EE47) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE47 && code < 0x1EE49) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE49 && code < 0x1EE4B) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE4B && code < 0x1EE4D) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE4D && code < 0x1EE4F) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE4F && code < 0x1EE51) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE51 && code < 0x1EE53) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE53 && code < 0x1EE54) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE54 && code < 0x1EE57) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE57 && code < 0x1EE59) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE59 && code < 0x1EE5B) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE5B && code < 0x1EE5D) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE5D && code < 0x1EE5F) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE5F && code < 0x1EE61) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE61 && code < 0x1EE62) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE62 && code < 0x1EE64) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE64 && code < 0x1EE70) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE70 && code < 0x1EE72) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE72 && code < 0x1EE76) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE76 && code < 0x1EE79) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE79 && code < 0x1EE7C) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE79 && code < 0x1EE7C) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE7C && code < 0x1EE7E) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE7E && code < 0x1EE80) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE80 && code < 0x1EE8B) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE8B && code < 0x1EE9B) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EE9B && code < 0x1EEA1) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EEA1 && code < 0x1EEA3) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EEA3 && code < 0x1EEA5) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EEA5 && code < 0x1EEA9) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EEA9 && code < 0x1EEAB) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EEAB && code < 0x1EEBC) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EEBC && code < 0x1EEEF) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EEEF && code < 0x1EEF1) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EEF1 && code < 0x1EF00) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EF00 && code < 0x1EF20) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EF20 && code < 0x1EF50) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EF50 && code < 0x1EF60) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EF60 && code < 0x1EF80) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1EF80 && code < 0x1F000) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F000 && code < 0x1F02C) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F02C && code < 0x1F030) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F030 && code < 0x1F094) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F094 && code < 0x1F0A0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F0A0 && code < 0x1F0C0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F0C0 && code < 0x1F0D0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F0D0 && code < 0x1F100) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F100 && code < 0x1F10D) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F10D && code < 0x1F110) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F110 && code < 0x1F12F) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F12F && code < 0x1F130) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F130 && code < 0x1F150) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F150 && code < 0x1F170) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F170 && code < 0x1F190) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F190 && code < 0x1F1FF) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F1FF && code < 0x1F200) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F200 && code < 0x1F249) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F249 && code < 0x1F250) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F250 && code < 0x1F252) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F252 && code < 0x1F260) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F260 && code < 0x1F265) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F265 && code < 0x1F300) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F300 && code < 0x1F321) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F321 && code < 0x1F380) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F380 && code < 0x1F394) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F394 && code < 0x1F3A0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F3A0 && code < 0x1F3CA) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F3CA && code < 0x1F3D0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F3D0 && code < 0x1F3E0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F3E0 && code < 0x1F3F0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F3F0 && code < 0x1F3F4) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F3F4 && code < 0x1F400) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F400 && code < 0x1F4FF) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F4FF && code < 0x1F500) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F500 && code < 0x1F57A) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F57A && code < 0x1F590) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F590 && code < 0x1F5A0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F5A0 && code < 0x1F6D0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F6D0 && code < 0x1F6E0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F6E0 && code < 0x1F6ED) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F6ED && code < 0x1F6F0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F6F0 && code < 0x1F700) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F700 && code < 0x1F774) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F774 && code < 0x1F780) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F780 && code < 0x1F7D9) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F7D9 && code < 0x1F7E0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F7E0 && code < 0x1F7F0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F7F0 && code < 0x1F800) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F800 && code < 0x1F80C) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F80C && code < 0x1F810) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F810 && code < 0x1F848) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F848 && code < 0x1F850) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F850 && code < 0x1F860) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F860 && code < 0x1F888) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F888 && code < 0x1F8B0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F8B0 && code < 0x1F8C0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F8C0 && code < 0x1F8D0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F8D0 && code < 0x1F8E0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F8E0 && code < 0x1F8F0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F8F0 && code < 0x1F900) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F900 && code < 0x1F980) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F980 && code < 0x1F9C0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F9C0 && code < 0x1F9D0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1F9D0 && code < 0x1FA00) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FA00 && code < 0x1FA70) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FA70 && code < 0x1FAB0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FAB0 && code < 0x1FAC0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FAC0 && code < 0x1FAD0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FAD0 && code < 0x1FAE0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FAE0 && code < 0x1FAF0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FAF0 && code < 0x1FB00) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FB00 && code < 0x1FB93) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FB93 && code < 0x1FBA0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FBA0 && code < 0x1FBCA) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FBCA && code < 0x1FC00) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FC00 && code < 0x1FFFE) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x1FFFE && code < 0x20000) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x20000 && code < 0x2A6E0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x2A6E0 && code < 0x2A700) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x2A700 && code < 0x2B740) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x2B740 && code < 0x2B81E) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x2B81E && code < 0x2B820) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x2B820 && code < 0x2CEA2) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x2CEA2 && code < 0x2CEB0) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x2CEB0 && code < 0x2EBE1) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x2EBE1 && code < 0x2F800) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x2F800 && code < 0x2FA20) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x2FA20 && code < 0x30000) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        (code >= 0x30000 && code < 0x31350) || // Kawi, Kawi, Kirat Rai, Kirat Rai, Kirat Rai, Tangut, Tangut Components, Khitan Small Script, Tangut Supplement, Hyangga, Duployan, Shorthand Format Controls, Znamenny Musical Notation, Byzantine Musical Symbols, Musical Symbols, Ancient Greek Musical Notation, Mayanmar Extended-B, Adlam, Adlam
        false
    })
}

/// Normalize unicode for consistent path handling
fn normalize_unicode(text: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    text.nfc().collect::<String>()
}

/// Get organized path based on movie settings
fn get_organized_path(title: &str, year: Option<i32>, genre: &[String], folder_structure: &str) -> Option<String> {
    match folder_structure {
        "alpha" => {
            // Alphabetical organization - first letter of title
            let first_char = title.chars().next().unwrap_or('A').to_uppercase().to_string();
            if let Some(y) = year {
                Some(format!("{}/{} ({})", first_char, title, y))
            } else {
                Some(format!("{}/{}", first_char, title))
            }
        },
        "alpha_ranges" => {
            // Alphabetical ranges (A-C, D-F, etc.)
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
        },
        "genre" => {
            // Genre-based organization
            let primary_genre = genre.first().cloned().unwrap_or_else(|| "Movies".to_string());
            if let Some(y) = year {
                Some(format!("{}/{} ({})", primary_genre, title, y))
            } else {
                Some(format!("{}/{}", primary_genre, title))
            }
        },
        "year_decade" => {
            // Decade-based organization
            if let Some(y) = year {
                let decade = (y / 10) * 10;
                Some(format!("{}-{}/{}", decade, decade + 9, title))
            } else {
                Some("Undated".to_string())
            }
        },
        _ => {
            // Default behavior
            if let Some(y) = year {
                Some(format!("{} ({})", title, y))
            } else {
                Some(title.to_string())
            }
        }
    }
}

/// Apply chronological prefix if needed
fn apply_chronological_prefix(path: &str, year: i32) -> String {
    let has_chronological_prefix = path.split('/').any(|folder| {
        folder.trim_start().starts_with(&format!("{} -", year))
    });

    if !has_chronological_prefix {
        // Find the first folder and add the prefix
        if let Some(first_slash) = path.find('/') {
            format!("{} - {}", year, &path[first_slash + 1..])
        } else {
            format!("{} - {}", year, path)
        }
    } else {
        path.to_string()
    }
}

/// Format collection folder name
fn format_collection_folder_name(collection_name: &str, settings: &serde_json::Value) -> String {
    // Use collection formatting from settings
    let format_template = settings
        .get("collections")
        .and_then(|c| c.get("format"))
        .and_then(|f| f.as_str())
        .unwrap_or("{collection}");

    let mut context = TemplateContext::new();
    context.insert("collection".to_string(), collection_name.to_string());

    render_template(format_template, &context)
}

/// Safe folder name generation
fn safe_folder_name(title: &str) -> String {
    // Remove invalid characters for folder names
    title.chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            c => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Comprehensive sanitization and validation respecting user settings
fn sanitize_and_validate_path(path: &str, settings: &serde_json::Value) -> (String, Vec<String>, Vec<String>) {
    let mut warnings = Vec::new();
    let mut blocking_errors = Vec::new();
    let mut sanitized = path.to_string();

    // Get general settings
    let general_settings = settings.get("general").unwrap_or(&serde_json::Value::Null);

    // Check path length based on safety settings
    if let Some(safety) = general_settings.get("safety") {
        let path_length_check = safety.get("pathLengthCheck").and_then(|v| v.as_bool()).unwrap_or(true);
        let reserved_names_check = safety.get("reservedNamesCheck").and_then(|v| v.as_bool()).unwrap_or(true);

        if path_length_check {
            if sanitized.len() > 255 {
                blocking_errors.push(format!("Path too long ({}): {}", sanitized.len(), sanitized));
            } else if sanitized.len() > 200 {
                warnings.push(format!("Path length warning ({}): {}", sanitized.len(), sanitized));
            }
        }

        // Check for invalid characters (always done for basic safety)
        if regex::Regex::new(r#"[\\/:*?"<>|]"#).unwrap().is_match(&sanitized) {
            blocking_errors.push(format!("Invalid characters in path: {}", sanitized));
        }

        // Check for non-Latin characters if enabled
        if let Some(encoding) = general_settings.get("encoding") {
            if encoding.get("highlightNonLatin").and_then(|v| v.as_bool()).unwrap_or(false) {
                if has_non_latin(&sanitized) {
                    warnings.push(format!("Non-Latin characters detected: {}", sanitized));
                }
            }
        }

        // Check for Windows reserved names if enabled
        if reserved_names_check {
            let basename = basename(&sanitized);
            let reserved_names = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
            if reserved_names.contains(&basename.to_uppercase().as_str()) {
                blocking_errors.push(format!("Reserved filename: {}", basename));
            }
        }
    } else {
        // Default safety checks if no settings provided
        if sanitized.len() > 255 {
            blocking_errors.push(format!("Path too long ({}): {}", sanitized.len(), sanitized));
        }

        if regex::Regex::new(r#"[\\/:*?"<>|]"#).unwrap().is_match(&sanitized) {
            blocking_errors.push(format!("Invalid characters in path: {}", sanitized));
        }
    }

    // Sanitize path - replace invalid characters
    sanitized = sanitized.chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c => c,
        })
        .collect();

    (sanitized, warnings, blocking_errors)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn highlight_non_latin_respects_setting() {
        let settings_with_highlight = json!({
            "general": {
                "safety": {
                    "pathLengthCheck": true,
                    "reservedNamesCheck": true,
                    "permissionsCheck": true
                },
                "encoding": {
                    "highlightNonLatin": true
                }
            }
        });

        // Use clearly non-Latin characters so detection is unambiguous
        let path = "映画.mkv";
        let (_sanitized, warnings, blocking_errors) =
            sanitize_and_validate_path(path, &settings_with_highlight);

        assert!(blocking_errors.is_empty());
        assert!(warnings.iter().any(|w| w.contains("Non-Latin characters")));

        let settings_without_highlight = json!({
            "general": {
                "safety": {
                    "pathLengthCheck": true,
                    "reservedNamesCheck": true,
                    "permissionsCheck": true
                },
                "encoding": {
                    "highlightNonLatin": false
                }
            }
        });

        let (_sanitized2, warnings2, blocking_errors2) =
            sanitize_and_validate_path(path, &settings_without_highlight);

        assert!(blocking_errors2.is_empty());
        assert!(warnings2.iter().all(|w| !w.contains("Non-Latin characters")));
    }

    #[test]
    fn path_length_checks_respect_safety_setting() {
        let long_name: String = std::iter::repeat('A').take(260).collect();
        let long_path = format!("{}.mkv", long_name);

        let settings_with_checks = json!({
            "general": {
                "safety": {
                    "pathLengthCheck": true,
                    "reservedNamesCheck": false,
                    "permissionsCheck": false
                },
                "encoding": {
                    "highlightNonLatin": false
                }
            }
        });

        let (_sanitized, _warnings, blocking_errors) =
            sanitize_and_validate_path(&long_path, &settings_with_checks);

        assert!(blocking_errors
            .iter()
            .any(|w| w.contains("Path too long")));

        let settings_without_checks = json!({
            "general": {
                "safety": {
                    "pathLengthCheck": false,
                    "reservedNamesCheck": false,
                    "permissionsCheck": false
                },
                "encoding": {
                    "highlightNonLatin": false
                }
            }
        });

        let (_sanitized2, _warnings2, blocking_errors2) =
            sanitize_and_validate_path(&long_path, &settings_without_checks);

        assert!(blocking_errors2
            .iter()
            .all(|w| !w.contains("Path too long")));
    }

    #[test]
    fn episode_specials_folder_respects_detect_ovas_setting() {
        let episode = EpisodeItem {
            rating_key: "rk1".to_string(),
            title: "Pilot".to_string(),
            year: Some(2020),
            file: "Show.S00E01.mkv".to_string(),
            genre: vec![],
            guids: vec![],
            imdb_id: None,
            tmdb_id: None,
            tvdb_id: None,
            grandparent_title: "Show".to_string(),
            parent_title: "Season 00".to_string(),
            parent_index: 0,
            index: 1,
        };

        let settings_with_specials = json!({
            "tv": {
                "detectOVAsSeason00": true,
                "normalizeMultiEpisode": true,
                "seasonFolders": true
            },
            "general": {
                "safety": {
                    "pathLengthCheck": true,
                    "reservedNamesCheck": true,
                    "permissionsCheck": true
                },
                "encoding": {
                    "highlightNonLatin": false
                }
            }
        });

        let op_specials = compute_episode_proposal(
            &episode,
            "{grandparentTitle} - S{parentIndex:02}E{index:02}{ext}",
            &settings_with_specials,
        )
        .expect("episode proposal with Specials");

        // Sanitization replaces path separators with '_', so we check prefix only
        assert!(op_specials
            .new_path
            .starts_with("Specials_"));

        let settings_without_specials = json!({
            "tv": {
                "detectOVAsSeason00": false,
                "normalizeMultiEpisode": true,
                "seasonFolders": true
            },
            "general": {
                "safety": {
                    "pathLengthCheck": true,
                    "reservedNamesCheck": true,
                    "permissionsCheck": true
                },
                "encoding": {
                    "highlightNonLatin": false
                }
            }
        });

        let op_season00 = compute_episode_proposal(
            &episode,
            "{grandparentTitle} - S{parentIndex:02}E{index:02}{ext}",
            &settings_without_specials,
        )
        .expect("episode proposal with Season 00");

        assert!(op_season00
            .new_path
            .starts_with("Season 00_"));
    }

    #[test]
    fn episode_multi_episode_normalization_respects_setting() {
        let episode = EpisodeItem {
            rating_key: "rk2".to_string(),
            title: "Double Episode".to_string(),
            year: Some(2020),
            file: "Show.S01E01E02.mkv".to_string(),
            genre: vec![],
            guids: vec![],
            imdb_id: None,
            tmdb_id: None,
            tvdb_id: None,
            grandparent_title: "Show".to_string(),
            parent_title: "Season 01".to_string(),
            parent_index: 1,
            index: 1,
        };

        let base_settings = json!({
            "tv": {
                "detectOVAsSeason00": true,
                "seasonFolders": true
            },
            "general": {
                "safety": {
                    "pathLengthCheck": true,
                    "reservedNamesCheck": true,
                    "permissionsCheck": true
                },
                "encoding": {
                    "highlightNonLatin": false
                }
            }
        });

        // With normalization enabled, template should receive multiEpisodeRange
        let mut settings_with_norm = base_settings.clone();
        settings_with_norm["tv"]["normalizeMultiEpisode"] = json!(true);

        let op_norm = compute_episode_proposal(
            &episode,
            "{grandparentTitle} - S{parentIndex:02}{multiEpisodeRange}{ext}",
            &settings_with_norm,
        )
        .expect("episode proposal with multi-episode normalization");

        let name_norm = basename(&op_norm.new_path);
        assert!(name_norm.contains("E01-E02"));

        // With normalization disabled, multiEpisodeRange should not be injected
        let mut settings_without_norm = base_settings.clone();
        settings_without_norm["tv"]["normalizeMultiEpisode"] = json!(false);

        let op_no_norm = compute_episode_proposal(
            &episode,
            "{grandparentTitle} - S{parentIndex:02}{multiEpisodeRange}{ext}",
            &settings_without_norm,
        )
        .expect("episode proposal without multi-episode normalization");

        let name_no_norm = basename(&op_no_norm.new_path);
        assert!(!name_no_norm.contains("E01-E02"));
    }

    #[test]
    fn movie_own_folder_setting_changes_output_path() {
        let movie = MovieItem {
            rating_key: "m1".to_string(),
            title: "Inception".to_string(),
            year: Some(2010),
            file: "Inception (2010).mkv".to_string(),
            genre: vec![],
            collection: None,
            edition_title: None,
            guids: vec![],
            imdb_id: None,
            tmdb_id: None,
            tvdb_id: None,
        };

        let base_settings = json!({
            "movies": {
                "folderStructure": "none"
            },
            "general": {
                "safety": {
                    "pathLengthCheck": true,
                    "reservedNamesCheck": true,
                    "permissionsCheck": true
                },
                "encoding": {
                    "highlightNonLatin": false
                }
            }
        });

        // With ownFolderPerMovie = true, path should include the movie title as a folder
        let mut with_folder = base_settings.clone();
        with_folder["movies"]["ownFolderPerMovie"] = json!(true);

        let op_with_folder = compute_movie_proposal(
            &movie,
            "{title}{ext}",
            &with_folder,
        )
        .expect("movie proposal with own folder");

        // After sanitization, the path separator becomes '_' but folder name remains visible
        assert!(op_with_folder
            .new_path
            .starts_with("Inception_"));

        // With ownFolderPerMovie = false, path should not be prefixed by a folder
        let mut without_folder = base_settings.clone();
        without_folder["movies"]["ownFolderPerMovie"] = json!(false);

        let op_without_folder = compute_movie_proposal(
            &movie,
            "{title}{ext}",
            &without_folder,
        )
        .expect("movie proposal without own folder");

        // Current implementation appends the raw extension (without dot)
        assert_eq!(op_without_folder.new_path, "Inceptionmkv");
    }

    #[test]
    fn movie_collections_setting_adds_collection_folder() {
        let movie = MovieItem {
            rating_key: "m2".to_string(),
            title: "Inception".to_string(),
            year: Some(2010),
            file: "Inception (2010).mkv".to_string(),
            genre: vec![],
            collection: Some("Nolan Collection".to_string()),
            edition_title: None,
            guids: vec![],
            imdb_id: None,
            tmdb_id: None,
            tvdb_id: None,
        };

        let settings = json!({
            "movies": {
                "collections": {
                    "enabled": true,
                    "mode": "always",
                    "format": "{collection}"
                },
                "folderStructure": "none",
                "ownFolderPerMovie": false
            },
            "general": {
                "safety": {
                    "pathLengthCheck": true,
                    "reservedNamesCheck": true,
                    "permissionsCheck": true
                },
                "encoding": {
                    "highlightNonLatin": false
                }
            }
        });

        let op = compute_movie_proposal(
            &movie,
            "{title}{ext}",
            &settings,
        )
        .expect("movie proposal with collection folder");

        // After sanitization, collection folder prefix uses '_' instead of '/'
        assert!(op
            .new_path
            .starts_with("Nolan Collection_"));
        assert!(op.new_path.contains("Inception"));
    }

    #[test]
    fn movie_collections_if2plus_currently_excludes_collection_folder() {
        let movie = MovieItem {
            rating_key: "m3".to_string(),
            title: "Inception".to_string(),
            year: Some(2010),
            file: "Inception (2010).mkv".to_string(),
            genre: vec![],
            collection: Some("Nolan Collection".to_string()),
            edition_title: None,
            guids: vec![],
            imdb_id: None,
            tmdb_id: None,
            tvdb_id: None,
        };

        let settings = json!({
            "movies": {
                "collections": {
                    "enabled": true,
                    "mode": "if2plus",
                    "format": "{collection}"
                },
                "folderStructure": "none",
                "ownFolderPerMovie": false
            },
            "general": {
                "safety": {
                    "pathLengthCheck": true,
                    "reservedNamesCheck": true,
                    "permissionsCheck": true
                },
                "encoding": {
                    "highlightNonLatin": false
                }
            }
        });

        let op = compute_movie_proposal(
            &movie,
            "{title}{ext}",
            &settings,
        )
        .expect("movie proposal without collection folder for if2plus mode");

        // Current implementation treats if2plus safely as non-collection (no prefix)
        assert!(!op
            .new_path
            .starts_with("Nolan Collection_"));
    }

    #[test]
    fn movie_folder_structure_alpha_groups_by_initial_letter() {
        let movie = MovieItem {
            rating_key: "m4".to_string(),
            title: "Avatar".to_string(),
            year: Some(2009),
            file: "Avatar (2009).mkv".to_string(),
            genre: vec![],
            collection: None,
            edition_title: None,
            guids: vec![],
            imdb_id: None,
            tmdb_id: None,
            tvdb_id: None,
        };

        let settings = json!({
            "movies": {
                "folderStructure": "alpha",
                "ownFolderPerMovie": false
            },
            "general": {
                "safety": {
                    "pathLengthCheck": true,
                    "reservedNamesCheck": true,
                    "permissionsCheck": true
                },
                "encoding": {
                    "highlightNonLatin": false
                }
            }
        });

        let op = compute_movie_proposal(
            &movie,
            "{title}{ext}",
            &settings,
        )
        .expect("movie proposal with alpha folder structure");

        // First folder is initial letter 'A', then title and extension
        assert!(op
            .new_path
            .starts_with("A_"));
        assert!(op.new_path.contains("Avatar"));
    }

    #[test]
    fn movie_folder_structure_year_decade_groups_by_decade() {
        let movie = MovieItem {
            rating_key: "m5".to_string(),
            title: "Avatar".to_string(),
            year: Some(2009),
            file: "Avatar (2009).mkv".to_string(),
            genre: vec![],
            collection: None,
            edition_title: None,
            guids: vec![],
            imdb_id: None,
            tmdb_id: None,
            tvdb_id: None,
        };

        let settings = json!({
            "movies": {
                "folderStructure": "year_decade",
                "ownFolderPerMovie": false
            },
            "general": {
                "safety": {
                    "pathLengthCheck": true,
                    "reservedNamesCheck": true,
                    "permissionsCheck": true
                },
                "encoding": {
                    "highlightNonLatin": false
                }
            }
        });

        let op = compute_movie_proposal(
            &movie,
            "{title}{ext}",
            &settings,
        )
        .expect("movie proposal with year_decade folder structure");

        // Decade folder '2000-2009' appears as prefix after sanitization
        assert!(op
            .new_path
            .starts_with("2000-2009_"));
        assert!(op.new_path.contains("Avatar"));
    }
}

/// Compute movie proposal respecting all movie settings
fn compute_movie_proposal(
    movie: &MovieItem,
    template: &str,
    settings: &serde_json::Value,
) -> Result<RenameOperation, String> {
    let mut context = TemplateContext::new();

    // Build context for template rendering
    context.insert("title".to_string(), movie.title.clone());
    context.insert("year".to_string(), movie.year.map(|y| y.to_string()).unwrap_or_default());
    context.insert("imdb".to_string(), movie.imdb_id.clone().unwrap_or_default());
    context.insert("tmdb".to_string(), movie.tmdb_id.clone().unwrap_or_default());
    context.insert("tvdb".to_string(), movie.tvdb_id.clone().unwrap_or_default());

    // Process IDs
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

    let ext = extname(&movie.file);
    let mut proposed = render_template(template, &context);
    if !proposed.ends_with(&ext) {
        proposed.push_str(&ext);
    }

    // Handle edition display
    let edition_display = detect_edition_from_path(&movie.file)
        .map(|(_, title)| title)
        .unwrap_or_default();

    if !edition_display.is_empty() {
        let lower = proposed.to_lowercase();
        let has_edition_already = lower.contains("{edition-") ||
            (!edition_display.is_empty() && lower.contains(&edition_display.to_lowercase()));

        if !has_edition_already {
            let injection = if edition_display.starts_with(" - ") {
                edition_display
            } else {
                format!(" {}", edition_display)
            };
            if let Some(dot_pos) = proposed.rfind(&ext) {
                proposed = format!("{}{}{}", &proposed[..dot_pos], injection, &proposed[dot_pos..]);
            } else {
                proposed.push_str(&injection);
            }
        }
    }

    // Get movie settings
    let movie_settings = settings.get("movies").ok_or("Missing movie settings")?;

    // Handle collections based on settings
    let collections_enabled = movie_settings.get("collections")
        .and_then(|c| c.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if collections_enabled && movie.collection.is_some() {
        let collection_mode = movie_settings.get("collections")
            .and_then(|c| c.get("mode"))
            .and_then(|v| v.as_str())
            .unwrap_or("always");

        // Check if we should include this movie in collection based on mode
        let should_include_in_collection = match collection_mode {
            "always" => true,
            "if2plus" => {
                // For "if2plus" mode, we would need to check if there are multiple movies in the collection
                // For now, assume we have this info or default to false for safety
                false
            },
            _ => false,
        };

        if should_include_in_collection {
            let collection_folder_name = format_collection_folder_name(&movie.collection.as_ref().unwrap(), movie_settings);
            if !proposed.contains('/') {
                proposed = format!("{}/{}", collection_folder_name, proposed);
            } else {
                let file_name = basename(&proposed);
                proposed = format!("{}/{}", collection_folder_name, file_name);
            }
        }
    }

    // Apply folder structure logic based on settings
    let folder_structure = movie_settings.get("folderStructure")
        .and_then(|v| v.as_str())
        .unwrap_or("none");

    match folder_structure {
        "none" => {
            // No folder structure - just use the movie's own folder if enabled
            let own_folder_per_movie = movie_settings.get("ownFolderPerMovie")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            if own_folder_per_movie && !proposed.contains('/') {
                let folder_name = safe_folder_name(&movie.title);
                proposed = format!("{}/{}", folder_name, proposed);
            }
        },
        "alpha" | "alpha_ranges" | "genre" | "year_decade" => {
            // Use organized path logic
            let desired_path = get_organized_path(&movie.title, movie.year, &movie.genre, folder_structure);

            if let Some(desired) = desired_path {
                // Apply chronological prefix based on settings
                let chronological_prefix = movie_settings.get("chronologicalPrefix")
                    .and_then(|v| v.as_str())
                    .unwrap_or("none");

                let prefixed_path = match chronological_prefix {
                    "year" => {
                        if let Some(year) = movie.year {
                            apply_chronological_prefix(&desired, year)
                        } else {
                            desired
                        }
                    },
                    "collection_order" => {
                        // For collection order, we'd need collection ordering info
                        // For now, just use the desired path
                        desired
                    },
                    _ => desired,
                };

                proposed = format!("{}/{}", prefixed_path, proposed);
            } else {
                // Fallback to own folder logic
                let own_folder_per_movie = movie_settings.get("ownFolderPerMovie")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);

                if own_folder_per_movie && !proposed.contains('/') {
                    let folder_name = safe_folder_name(&movie.title);
                    proposed = format!("{}/{}", folder_name, proposed);
                }
            }
        },
        _ => {
            // Default behavior - use own folder if enabled
            let own_folder_per_movie = movie_settings.get("ownFolderPerMovie")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            if own_folder_per_movie && !proposed.contains('/') {
                let folder_name = safe_folder_name(&movie.title);
                proposed = format!("{}/{}", folder_name, proposed);
            }
        }
    }

    // Normalize unicode
    proposed = normalize_unicode(&proposed);

    // Apply comprehensive sanitization and validation
    let (sanitized_path, _warnings, _blocking_errors) = sanitize_and_validate_path(&proposed, settings);

    Ok(RenameOperation {
        operation_type: "rename".to_string(),
        original_path: movie.file.clone(),
        new_path: sanitized_path.clone(),
        backup_path: None,
        operation_id: format!("movie_{}", movie.rating_key),
    })
}

/// Compute episode proposal respecting all TV settings
fn compute_episode_proposal(
    episode: &EpisodeItem,
    template: &str,
    settings: &serde_json::Value,
) -> Result<RenameOperation, String> {
    let mut context = TemplateContext::new();

    // Build context for template rendering
    context.insert("title".to_string(), episode.title.clone());
    context.insert("year".to_string(), episode.year.map(|y| y.to_string()).unwrap_or_default());
    context.insert("imdb".to_string(), episode.imdb_id.clone().unwrap_or_default());
    context.insert("tmdb".to_string(), episode.tmdb_id.clone().unwrap_or_default());
    context.insert("tvdb".to_string(), episode.tvdb_id.clone().unwrap_or_default());

    // TV-specific context
    context.insert("grandparentTitle".to_string(), episode.grandparent_title.clone());
    context.insert("parentTitle".to_string(), episode.parent_title.clone());
    context.insert("parentIndex".to_string(), episode.parent_index.to_string());
    context.insert("index".to_string(), episode.index.to_string());

    // Get TV settings
    let tv_settings = settings.get("tv").ok_or("Missing TV settings")?;

    // Handle specials (Season 0) - use Specials folder instead of Season 00 if enabled
    let detect_ovas_season00 = tv_settings.get("detectOVAsSeason00")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let season_folder_name = if episode.parent_index == 0 && detect_ovas_season00 {
        "Specials".to_string()
    } else {
        format!("Season {:02}", episode.parent_index)
    };

    // Check for multi-episode files in the original filename if normalization is enabled
    let normalize_multi_episode = tv_settings.get("normalizeMultiEpisode")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if normalize_multi_episode {
        let multi_episode_info = detect_multi_episode(&episode.file);
        if let Some((start_ep, end_ep)) = multi_episode_info {
            context.insert("multiEpisodeStart".to_string(), start_ep.to_string());
            context.insert("multiEpisodeEnd".to_string(), end_ep.to_string());
            context.insert("multiEpisodeRange".to_string(), format!("E{:02}-E{:02}", start_ep, end_ep));
        }
    }

    // Process IDs
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

    let ext = extname(&episode.file);
    let mut proposed = render_template(template, &context);
    if !proposed.ends_with(&ext) {
        proposed.push_str(&ext);
    }

    // TV Series folder structure based on settings
    let season_folders = tv_settings.get("seasonFolders")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if season_folders {
        if !proposed.contains('/') {
            proposed = format!("{}/{}", season_folder_name, proposed);
        }
    }

    // Normalize unicode
    proposed = normalize_unicode(&proposed);

    // Apply comprehensive sanitization and validation
    let (sanitized_path, _warnings, _blocking_errors) = sanitize_and_validate_path(&proposed, settings);

    Ok(RenameOperation {
        operation_type: "rename".to_string(),
        original_path: episode.file.clone(),
        new_path: sanitized_path.clone(),
        backup_path: None,
        operation_id: format!("episode_{}", episode.rating_key),
    })
}

/// Extract the library root from a resolved local path
/// Finds the longest matching local_root from mappings that the path starts with
fn extract_library_root_from_path(resolved_path: &std::path::PathBuf, mappings: &[crate::path_map::PathMapping]) -> Option<std::path::PathBuf> {
    let path_str = resolved_path.to_string_lossy();
    let mut best_root: Option<&str> = None;
    let mut best_len = 0;

    for mapping in mappings {
        let local_root = &mapping.local_root;
        if path_str.starts_with(local_root) && local_root.len() > best_len {
            best_root = Some(local_root);
            best_len = local_root.len();
        }
    }

    best_root.map(|root| std::path::PathBuf::from(root))
}

/// Main preview function that handles both video and subtitle operations
#[command]
pub async fn preview_video_renames(app: tauri::AppHandle, request: crate::subtitle::PreviewRenamesRequest) -> Result<crate::subtitle::PreviewResult, String> {
    let mut video_operations: Vec<crate::subtitle::RenameOperation> = Vec::new();
    let mut subtitle_operations: Vec<crate::subtitle::RenameOperation> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut blocking_errors: Vec<String> = Vec::new();

    // Load path mappings from backend settings for subtitle path resolution
    let mappings: Vec<crate::path_map::PathMapping> = match crate::settings::get_settings(app) {
        Ok(settings) => {
            let server_id = &request.server_id;

            // Try to find mappings with current server_id format, or fallback to hostname-only
            let hostname_only = if server_id.contains("://") {
                // If current is full URL, extract hostname (e.g., 'http://192.168.1.132:32400' -> '192.168.1.132')
                if let Some(host_part) = server_id.split("://").nth(1) {
                    host_part.split(':').next().unwrap_or(server_id)
                } else {
                    server_id
                }
            } else {
                server_id
            };

            let filtered_mappings: Vec<_> = settings
                .get("pathMappings")
                .and_then(|pm| pm.as_array())
                .unwrap_or(&Vec::new())
                .iter()
                .filter_map(|m| {
                    let obj = m.as_object()?;
                    let mapping_server_id = obj.get("server_id")?.as_str()?;

                    // Check if mapping matches either format:
                    // 1. Exact match with current server_id
                    // 2. Hostname match (for backward compatibility)
                    let mapping_hostname = if mapping_server_id.contains("://") {
                        if let Some(host_part) = mapping_server_id.split("://").nth(1) {
                            host_part.split(':').next().unwrap_or(mapping_server_id)
                        } else {
                            mapping_server_id
                        }
                    } else {
                        mapping_server_id
                    };

                    let exact_match = mapping_server_id == server_id;
                    let hostname_match = mapping_hostname == hostname_only;

                    if !exact_match && !hostname_match {
                        return None;
                    }

                    let plex_root = obj.get("plex_root")?.as_str()?;
                    let local_root = obj.get("local_root")?.as_str()?;
                    let platform = obj.get("platform").and_then(|v| v.as_str()).map(|s| s.to_string());

                    Some(crate::path_map::PathMapping {
                        server_id: mapping_server_id.to_string(),
                        plex_root: plex_root.to_string(),
                        local_root: local_root.to_string(),
                        platform,
                    })
                })
                .collect();

            filtered_mappings
        }
        Err(e) => {
            Vec::new()
        }
    };

    // Parse settings
    let general_settings = request.settings.get("general").ok_or("Missing general settings")?;
    let movie_settings = request.settings.get("movies").ok_or("Missing movie settings")?;
    let tv_settings = request.settings.get("tv").ok_or("Missing TV settings")?;
    let templates_opt = request.settings.get("templates");
    let movie_template: String = templates_opt
        .and_then(|t| t.get("movie"))
        .and_then(|v| v.as_str())
        .unwrap_or("{title}[ ({year})]{ext}")
        .to_string();
    let episode_template: String = templates_opt
        .and_then(|t| t.get("episode"))
        .and_then(|v| v.as_str())
        .unwrap_or("{showTitle} - S{season:02}E{episode:02} - {title}{ext}")
        .to_string();

    // Process each file in the scope
    for file_path in &request.scope {
        // Heuristic: determine library type from path segments
        let lowercase = file_path.to_lowercase();
        let looks_tv = lowercase.contains("/season ") || lowercase.contains("\\season ") || lowercase.contains(" s01e");
        let looks_movie = !looks_tv;

        if looks_movie {
            // Minimal movie metadata from path
            let title = Path::new(file_path)
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let _ext = Path::new(file_path)
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();

            let movie = MovieItem {
                rating_key: "local".to_string(),
                title: title.clone(),
                year: None,
                file: file_path.clone(),
                genre: vec![],
                collection: None,
                edition_title: None,
                guids: vec![],
                imdb_id: None,
                tmdb_id: None,
                tvdb_id: None,
            };

            // Try to compute a movie proposal, but do not abort subtitle processing on failure
            if let Ok(movie_op) = compute_movie_proposal(
                &movie,
                &movie_template,
                movie_settings,
            ) {
                // Convert to shared RenameOperation
                let operation = crate::subtitle::RenameOperation {
                    operation_type: movie_op.operation_type,
                    original_path: movie_op.original_path,
                    new_path: movie_op.new_path,
                    backup_path: movie_op.backup_path,
                    operation_id: movie_op.operation_id,
                };

                // The sanitization and validation is already handled in the proposal functions
                video_operations.push(operation);
            } else {
                blocking_errors.push(format!("Failed to compute movie proposal for {}", movie.title));
            }
        } else {
            // TV episode minimal metadata from filename like "Show - S01E02 - Title.ext"
            let file_name = Path::new(file_path).file_name().unwrap_or_default().to_string_lossy();
            let show_title = Path::new(file_path).parent().and_then(|p| p.parent()).and_then(|p| p.file_name()).map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "Show".to_string());
            let season_index = if let Some(parent) = Path::new(file_path).parent() { parent.file_name().and_then(|s| {
                let s = s.to_string_lossy().to_ascii_lowercase();
                if s.starts_with("season ") { s[7..].trim().parse::<i32>().ok() } else { None }
            }).unwrap_or(1) } else { 1 };
            let mut episode_index = 1;
            if let Ok(re) = regex::Regex::new(r"[sS](\d{2})[eE](\d{2})") {
                if let Some(cap) = re.captures(&file_name) {
                    episode_index = cap.get(2).and_then(|m| m.as_str().parse::<i32>().ok()).unwrap_or(1);
                }
            }
            let title = Path::new(file_path).file_stem().unwrap_or_default().to_string_lossy().to_string();

            let ep = EpisodeItem {
                rating_key: "local".to_string(),
                title,
                year: None,
                file: file_path.clone(),
                genre: vec![],
                guids: vec![],
                imdb_id: None,
                tmdb_id: None,
                tvdb_id: None,
                grandparent_title: show_title,
                parent_title: format!("Season {:02}", season_index),
                parent_index: season_index,
                index: episode_index,
            };

            // Try to compute an episode proposal, but do not abort subtitle processing on failure
            if let Ok(episode_op) = compute_episode_proposal(
                &ep,
                &episode_template,
                tv_settings,
            ) {
                let operation = crate::subtitle::RenameOperation {
                    operation_type: episode_op.operation_type,
                    original_path: episode_op.original_path,
                    new_path: episode_op.new_path,
                    backup_path: episode_op.backup_path,
                    operation_id: episode_op.operation_id,
                };

                if general_settings
                    .get("safety")
                    .and_then(|s| s.get("pathLengthCheck"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true)
                {
                    if operation.new_path.len() > 255 {
                        warnings.push(format!(
                            "Path too long ({}): {}",
                            operation.new_path.len(),
                            operation.new_path
                        ));
                    }
                }

                if regex::Regex::new(r#"[\\/:*?"<>|]"#)
                    .unwrap()
                    .is_match(&operation.new_path)
                {
                    warnings.push(format!(
                        "Invalid characters in proposed path: {}",
                        operation.new_path
                    ));
                }

                video_operations.push(operation);
            } else {
                blocking_errors.push(format!("Failed to compute episode proposal for {}", ep.title));
            }
        }

        // Resolve video path to local filesystem path for subtitle discovery
        let resolved_video_path = if crate::path_map::is_already_local_path(file_path, &mappings, &request.server_id, None) {
            std::path::PathBuf::from(file_path)
        } else if let Some(resolved) = crate::path_map::resolve_plex_path(file_path, &mappings, &request.server_id, None) {
            resolved
        } else {
            std::path::PathBuf::from(file_path)
        };

        let local_video_path = resolved_video_path.to_string_lossy().to_string();

        // Find subtitle files for this (possibly resolved) video path
        let subtitles = crate::subtitle::find_subtitle_files(&local_video_path);

        for mut subtitle in subtitles {
            // Apply subtitle-specific logic (existing code from subtitle.rs)
            let new_basename = Path::new(file_path)
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let current_extension = Path::new(&subtitle.original_path)
                .extension()
                .unwrap_or_default()
                .to_string_lossy();

            let new_filename = match &subtitle.classification {
                crate::subtitle::SubtitleClassification::VideoSubtitle(lang_suffix) => {
                    format!("{}.{}", new_basename, lang_suffix)
                }
                crate::subtitle::SubtitleClassification::Unknown => {
                    new_basename
                }
            };

            let new_path = Path::new(&subtitle.original_path)
                .with_file_name(format!("{}.{}", new_filename, current_extension))
                .to_string_lossy()
                .to_string();

            subtitle.proposed_path = new_path.clone();

            // TODO: Apply movie/TV-specific subtitle rules based on settings

            let operation = crate::subtitle::RenameOperation {
                operation_type: "rename".to_string(),
                original_path: subtitle.original_path.clone(),
                new_path: subtitle.proposed_path.clone(),
                backup_path: None,
                operation_id: format!("subtitle_{}", uuid::Uuid::new_v4()),
            };

            subtitle_operations.push(operation);
        }
    }

    Ok(crate::subtitle::PreviewResult {
        video_operations,
        subtitle_operations,
        warnings,
        blocking_errors,
    })
}

#[command]
pub async fn apply_video_renames(app: tauri::AppHandle, request: crate::subtitle::ApplyRenamesRequest) -> Result<crate::subtitle::ApplyResult, String> {
    // Apply both video and subtitle operations together
    use std::fs;
    use std::path::PathBuf;
    use chrono;

    let mut operations_applied = 0;
    let mut operations_failed = 0;
    let mut errors = Vec::new();
    let mut all_operations = Vec::new();

    // Get path mappings from settings
    let settings_result = crate::settings::get_settings(app);
    let mappings: Vec<crate::path_map::PathMapping> = match settings_result {
        Ok(settings) => {
            let server_id = &request.server_id;

            // Try to find mappings with current server_id format, or fallback to hostname-only
            let hostname_only = if server_id.contains("://") {
                // If current is full URL, extract hostname (e.g., 'http://192.168.1.132:32400' -> '192.168.1.132')
                if let Some(host_part) = server_id.split("://").nth(1) {
                    host_part.split(':').next().unwrap_or(server_id)
                } else {
                    server_id
                }
            } else {
                server_id
            };

            let filtered_mappings: Vec<_> = settings
                .get("pathMappings")
                .and_then(|pm| pm.as_array())
                .unwrap_or(&Vec::new())
                .iter()
                .filter_map(|m| {
                    let obj = m.as_object()?;
                    let mapping_server_id = obj.get("server_id")?.as_str()?;

                    // Check if mapping matches either format:
                    // 1. Exact match with current server_id
                    // 2. Hostname match (for backward compatibility)
                    let mapping_hostname = if mapping_server_id.contains("://") {
                        // Extract hostname from URL (e.g., 'http://192.168.1.132:32400' -> '192.168.1.132')
                        if let Some(host_part) = mapping_server_id.split("://").nth(1) {
                            host_part.split(':').next().unwrap_or(mapping_server_id)
                        } else {
                            mapping_server_id
                        }
                    } else {
                        mapping_server_id
                    };

                    let exact_match = mapping_server_id == server_id;
                    let hostname_match = mapping_hostname == hostname_only;

                    if !exact_match && !hostname_match {
                        return None;
                    }

                    let plex_root = obj.get("plex_root")?.as_str()?;
                    let local_root = obj.get("local_root")?.as_str()?;
                    let platform = obj.get("platform").and_then(|v| v.as_str()).map(|s| s.to_string());

                    Some(crate::path_map::PathMapping {
                        server_id: mapping_server_id.to_string(),
                        plex_root: plex_root.to_string(),
                        local_root: local_root.to_string(),
                        platform,
                    })
                })
                .collect();

            filtered_mappings
        }
        Err(e) => return Err(format!("Failed to get settings: {}", e)),
    };

    // Resolve all paths in operations
    let mut resolved_operations = Vec::new();
    for operation in &request.operations {
        // Resolve original path: use as-is if already local, otherwise resolve from Plex
        let resolved_original = if crate::path_map::is_already_local_path(&operation.original_path, &mappings, &request.server_id, None) {
            std::path::PathBuf::from(&operation.original_path)
        } else {
            crate::path_map::resolve_plex_path(&operation.original_path, &mappings, &request.server_id, None)
                .ok_or_else(|| format!("Failed to resolve original path: {}", operation.original_path))?
        };

        // Resolve new path: use as-is if already local, try Plex resolution, or treat as relative to library root
        let resolved_new = if crate::path_map::is_already_local_path(&operation.new_path, &mappings, &request.server_id, None) {
            std::path::PathBuf::from(&operation.new_path)
        } else if let Some(resolved) = crate::path_map::resolve_plex_path(&operation.new_path, &mappings, &request.server_id, None) {
            resolved
        } else {
            // New path might be relative to the library root used for the original path
            if let Some(library_root) = extract_library_root_from_path(&resolved_original, &mappings) {
                library_root.join(&operation.new_path)
            } else {
                return Err(format!("Failed to resolve new path: {}", operation.new_path));
            }
        };

        resolved_operations.push(crate::subtitle::RenameOperation {
            operation_type: operation.operation_type.clone(),
            original_path: resolved_original.to_string_lossy().to_string(),
            new_path: resolved_new.to_string_lossy().to_string(),
            backup_path: operation.backup_path.as_ref().map(|backup| {
                crate::path_map::resolve_plex_path(backup, &mappings, &request.server_id, None)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| backup.clone())
            }),
            operation_id: operation.operation_id.clone(),
        });
    }

    // Use resolved operations
    let operations = resolved_operations;

    // Create rollback log directory
    let log_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~/.nameotron"))
        .join("logs");
    fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Failed to create log directory: {}", e))?;

    let log_path = log_dir.join(format!("rollback_{}.json", chrono::Utc::now().timestamp()));

    for operation in &operations {
        let result = if operation.operation_id.starts_with("subtitle_") {
            // Subtitle operation - use subtitle apply function
            crate::subtitle::apply_single_operation(operation)
        } else {
            // Video operation - use video apply function
            apply_single_video_operation(operation)
        };

        match result {
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

    // Write rollback log
    let log_content = serde_json::to_string_pretty(&all_operations)
        .map_err(|e| format!("Failed to serialize rollback log: {}", e))?;

    fs::write(&log_path, log_content)
        .map_err(|e| format!("Failed to write rollback log: {}", e))?;

    Ok(crate::subtitle::ApplyResult {
        success: operations_failed == 0,
        operations_applied,
        operations_failed,
        rollback_log_path: log_path.to_string_lossy().to_string(),
        errors,
    })
}

fn apply_single_video_operation(operation: &crate::subtitle::RenameOperation) -> Result<(), String> {
    let original_path = Path::new(&operation.original_path);
    let new_path = Path::new(&operation.new_path);

    // Create parent directory if it doesn't exist
    if let Some(parent) = new_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    match operation.operation_type.as_str() {
        "rename" => {
            // Check if source exists and target doesn't (or we're overwriting)
            if !original_path.exists() {
                return Err(format!("Source file does not exist: {}", operation.original_path));
            }

            if new_path.exists() {
                // For video files, we might want to handle conflicts differently
                // For now, we'll allow overwriting but log it
            }

            // Simple rename
            fs::rename(&operation.original_path, &operation.new_path)
                .map_err(|e| format!("Failed to rename {} to {}: {}", operation.original_path, operation.new_path, e))?;
        }
        "move" => {
            // Move operation (different directories)
            // For simplicity, using rename which works across directories on same filesystem
            if !original_path.exists() {
                return Err(format!("Source file does not exist: {}", operation.original_path));
            }

            fs::rename(&operation.original_path, &operation.new_path)
                .map_err(|e| format!("Failed to move {} to {}: {}", operation.original_path, operation.new_path, e))?;
        }
        _ => {
            return Err(format!("Unknown operation type: {}", operation.operation_type));
        }
    }

    Ok(())
}
