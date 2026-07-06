use std::path::Path;

pub(super) fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

pub(super) fn extname(path: &str) -> String {
    Path::new(path)
        .extension()
        .map(|ext| format!(".{}", ext.to_string_lossy()))
        .unwrap_or_default()
}

pub(super) fn normalize_unicode(text: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    text.nfc().collect::<String>()
}
