use regex::Regex;
use std::collections::HashMap;

pub(super) type TemplateContext = HashMap<String, String>;

pub(super) fn render_template(template: &str, context: &TemplateContext) -> String {
    if template.is_empty() {
        return String::new();
    }

    let with_groups =
        Regex::new(r"\[(.+?)\]")
            .unwrap()
            .replace_all(template, |caps: &regex::Captures| {
                let group = &caps[1];
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
                                if let Ok(num) = value.parse::<i32>() {
                                    return format!("{:0width$}", num, width = fmt_width);
                                }
                            }
                            return value.clone();
                        }
                        String::new()
                    });

                if Regex::new(r"[a-zA-Z0-9]").unwrap().is_match(&resolved) {
                    resolved.to_string()
                } else {
                    String::new()
                }
            });

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
                    if let Ok(num) = value.parse::<i32>() {
                        return format!("{:0width$}", num, width = fmt_width);
                    }
                }
                return value.clone();
            }
            String::new()
        });

    replaced
        .replace("//", "/")
        .replace("  ", " ")
        .trim()
        .to_string()
}
