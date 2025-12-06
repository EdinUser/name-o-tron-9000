use once_cell::sync::Lazy;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Deserialize)]
pub struct PlexLibraryDto {
    pub key: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub title: String,
    #[serde(default)]
    pub roots: Vec<String>,
}





fn with_plex_headers(
    builder: reqwest::RequestBuilder,
    client_id: &str,
) -> reqwest::RequestBuilder {
    builder
        .header("X-Plex-Client-Identifier", client_id)
        .header("X-Plex-Product", "Name-o-tron 9000")
        .header("X-Plex-Version", "1.0.0")
        .header("X-Plex-Device-Name", "Name-o-tron 9000")
        .header("X-Plex-Device", "Name-o-tron 9000")
        .header("X-Plex-Platform", std::env::consts::OS)
        .header("X-Plex-Platform-Version", "1.0.0")
        .header("X-Plex-Provides", "controller")
        .header("Accept", "application/json")
}


fn current_client_id() -> String {
    if let Some(s) = crate::plex_auth::LOGIN.lock().unwrap().as_ref() {
        return s.client_id.clone();
    }
    static FALLBACK: Lazy<String> = Lazy::new(|| uuid::Uuid::new_v4().to_string());
    FALLBACK.clone()
}

async fn fetch_server_access_token(
    account_token: &str,
    client_id: &str,
    server_base: &str,
) -> Option<String> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(15)).build().ok()?;
    let url = "https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1";
    let resp = with_plex_headers(client.get(url), client_id)
        .header("X-Plex-Token", account_token)
        .header("Accept", "application/json")
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() { return None; }
    let text = resp.text().await.ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    let arr = v.as_array()?;
    let target = server_base.trim_end_matches('/').to_ascii_lowercase();
    for dev in arr {
        if dev.get("product").and_then(|x| x.as_str()).unwrap_or("") != "Plex Media Server" { continue; }
        let access = dev.get("accessToken").and_then(|x| x.as_str());
        let conns = dev.get("connections").and_then(|x| x.as_array()).cloned().unwrap_or_default();
        for c in conns {
            let uri = c.get("uri").and_then(|x| x.as_str()).unwrap_or("").to_ascii_lowercase();
            if !uri.is_empty() && (target == uri.trim_end_matches('/') || uri.trim_end_matches('/').ends_with(&target)) {
                if let Some(tok) = access { return Some(tok.to_string()); }
            }
        }
    }
    None
}

#[tauri::command]
pub async fn fetch_library_content(
    server: String,
    library_key: String,
    token: Option<String>,
    start: Option<usize>,
    size: Option<usize>,
) -> Result<serde_json::Value, String> {
    let start = start.unwrap_or(0);
    let size = size.unwrap_or(200);
    // Build a robust HTTP client similar to list_libraries
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(8))
        .http1_only() // PMS often speaks HTTP/1.1 on 32400
        .pool_max_idle_per_host(0)
        .danger_accept_invalid_certs(true)
        .user_agent(format!("Name-o-Tron-9000/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| {
            let msg = format!("http client error: {e:?}");
            crate::logging::log_event(
                "ERROR",
                "fetch_library_content",
                &msg,
                serde_json::json!({ "server": server, "library_key": library_key }),
            );
            msg
        })?;

    // Normalize bases and try both http/https like list_libraries
    let base_in = server.trim_end_matches('/');
    let mut bases: Vec<String> = vec![if base_in.starts_with("http://") || base_in.starts_with("https://") {
        base_in.to_string()
    } else {
        format!("http://{}", base_in)
    }];
    if base_in.starts_with("http://") {
        bases.push(base_in.replacen("http://", "https://", 1));
    } else if base_in.starts_with("https://") {
        bases.push(base_in.replacen("https://", "http://", 1));
    } else {
        bases.push(format!("https://{}", base_in));
    }
    bases.sort();
    bases.dedup();

    // Simplified URL construction - try most common patterns first
    let mut urls: Vec<String> = Vec::new();
    let paging = format!("X-Plex-Container-Start={}&X-Plex-Container-Size={}", start, size);

    for b in &bases {
        // Try most common patterns first (allLeaves with token in header)
        if let Some(t) = token.as_ref() {
            let tok = urlencoding::encode(t);
            urls.push(format!("{}/library/sections/{}/allLeaves?{}&X-Plex-Token={}", b, library_key, paging, tok));
        } else {
            urls.push(format!("{}/library/sections/{}/allLeaves?{}", b, library_key, paging));
        }

        // Fallback to 'all' if 'allLeaves' fails
        if let Some(t) = token.as_ref() {
            let tok = urlencoding::encode(t);
            urls.push(format!("{}/library/sections/{}/all?{}&X-Plex-Token={}", b, library_key, paging, tok));
        } else {
            urls.push(format!("{}/library/sections/{}/all?{}", b, library_key, paging));
        }
    }

    // Prepare common headers
    let client_id = current_client_id();

    // Try reqwest first across candidates
    let mut last_reqwest_err: Option<String> = None;
    let mut response_opt = None;
    for (_i, url) in urls.iter().enumerate() {
        let mut req = with_plex_headers(client.get(url), &client_id)
            .header("Accept", "application/json, application/xml;q=0.9")
            .header("Accept-Encoding", "identity")
            .header("Connection", "close");
        if let Some(t) = token.as_ref() {
            req = req.header("X-Plex-Token", t);
        }
        match req.send().await {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    response_opt = Some(resp);
                    break;
                } else {
                    let _body_len = resp.text().await.unwrap_or_default().len();
                    last_reqwest_err = Some(format!("HTTP {} @ {}", status, url));
                    continue;
                }
            }
            Err(e) => {
                let mut kind = "send error".to_string();
                if e.is_timeout() { kind = "timeout".into(); }
                else if e.is_connect() { kind = "connect".into(); }
                else if e.is_request() { kind = "request".into(); }
                last_reqwest_err = Some(format!("{} @ {}", kind, url));
            }
        }
        if response_opt.is_some() {
            break;
        }
    }

    let response = match response_opt {
        Some(r) => r,
        None => {
            // Fallback to ureq (simple blocking client) for tricky servers
            let product = "Name-o-Tron 9000";
            let version = env!("CARGO_PKG_VERSION");
            let platform = std::env::consts::OS;
            let agent = ureq::AgentBuilder::new()
                .timeout(Duration::from_secs(30))
                .build();
            for (i, url) in urls.iter().enumerate() {
                let mut r = agent
                    .get(url)
                    .set("Accept", "application/json, application/xml;q=0.9")
                    .set("Accept-Encoding", "identity")
                    .set("Connection", "close")
                    .set("User-Agent", &format!("{product}/{version}"))
                    .set("X-Plex-Product", product)
                    .set("X-Plex-Version", version)
                    .set("X-Plex-Client-Identifier", &client_id)
                    .set("X-Plex-Platform", platform)
                    .set("X-Plex-Device", platform)
                    .set("X-Plex-Device-Name", &whoami::devicename());
                if let Some(t) = token.as_ref() { r = r.set("X-Plex-Token", t); }
                match r.call() {
                    Ok(resp) => {
                        let status = resp.status();
                        if (200..=299).contains(&status) {
                            let ct = resp.header("content-type").unwrap_or("").to_ascii_lowercase();
                            if ct.contains("application/json") {
                                let v: serde_json::Value = resp
                                    .into_json()
                                    .map_err(|e| format!("read json error: {e}"))?;
                                return Ok(v);
                            } else {
                                let body = resp.into_string().map_err(|e| format!("read body error: {e}"))?;
                                return Ok(serde_json::Value::String(body));
                            }
                        } else {
                            let _len = resp.into_string().unwrap_or_default().len();
                            continue;
                        }
                    }
                    Err(e) => {
                        crate::logging::log_event(
                            "ERROR",
                            "fetch_library_content",
                            &format!("ureq error: {e}"),
                            serde_json::json!({ "url": url, "attempt": i }),
                        );
                    }
                }
            }
            let msg = format!(
                "fetch_library_content failed: {} | ureq fallback also failed",
                last_reqwest_err.clone().unwrap_or_else(|| "unknown".into())
            );
            crate::logging::log_event(
                "ERROR",
                "fetch_library_content",
                &msg,
                serde_json::json!({ "server": server, "library_key": library_key }),
            );
            return Err(msg);
        }
    };

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let msg = format!("HTTP {}: {}", status, body);
        crate::logging::log_event(
            "ERROR",
            "fetch_library_content",
            &msg,
            serde_json::json!({ "server": server, "library_key": library_key }),
        );
        return Err(msg);
    }

    let text = response.text().await.map_err(|e| {
        let msg = format!("read response error: {e}");
        crate::logging::log_event(
            "ERROR",
            "fetch_library_content",
            &msg,
            serde_json::json!({ "server": server, "library_key": library_key }),
        );
        msg
    })?;
    let trimmed = text.trim();
    // Prefer JSON if possible
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        match serde_json::from_str::<serde_json::Value>(trimmed) {
            Ok(v) => return Ok(v),
            Err(e) => {
                let msg = format!("JSON parse error: {}", e);
                crate::logging::log_event(
                    "ERROR",
                    "fetch_library_content",
                    &msg,
                    serde_json::json!({ "server": server, "library_key": library_key }),
                );
                return Err(msg);
            }
        }
    }

    // Try minimal XML → JSON adapter for MediaContainer/Video/Part.file
    if trimmed.starts_with('<') {
        if let Some(json) = xml_media_to_json(&text) {
            return Ok(json);
        } else {
            crate::logging::log_event(
                "ERROR",
                "fetch_library_content",
                "XML parse fallback failed",
                serde_json::json!({ "server": server, "library_key": library_key }),
            );
        }
    }

    // As last resort, return raw text
    Ok(serde_json::Value::String(text))
}

// XML parser for collections
fn xml_collections_to_json(xml: &str) -> Option<serde_json::Value> {
    use quick_xml::events::Event;
    use quick_xml::Reader;
    use serde_json::{json, Value};

    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);
    let mut buf = Vec::new();

    #[derive(Default, Debug)]
    struct Collection {
        rating_key: Option<String>,
        title: Option<String>,
    }

    let mut collections: Vec<Collection> = Vec::new();
    let mut current: Option<Collection> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if e.name().as_ref() == b"Directory" {
                    current = Some(Collection::default());
                    for a in e.attributes().flatten() {
                        let k = a.key.as_ref();
                        let v = a.unescape_value().unwrap_or_default();
                        if let Some(curr) = current.as_mut() {
                            if k == b"ratingKey" { curr.rating_key = Some(v.to_string()); }
                            else if k == b"title" { curr.title = Some(v.to_string()); }
                        }
                    }
                }
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"Directory" {
                    if let Some(curr) = current.take() {
                        collections.push(curr);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => {
                return None;
            }
            _ => {}
        }
        buf.clear();
    }

    let meta: Vec<Value> = collections.into_iter().map(|c| {
        let mut obj = json!({});
        if let Some(rk) = c.rating_key { obj["ratingKey"] = json!(rk); }
        if let Some(title) = c.title { obj["title"] = json!(title); }
        obj
    }).collect();

    Some(json!({
        "MediaContainer": { "Metadata": meta }
    }))
}

// XML parser for collection items
fn xml_collection_items_to_json(xml: &str) -> Option<serde_json::Value> {
    use quick_xml::events::Event;
    use quick_xml::Reader;
    use serde_json::{json, Value};

    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);
    let mut buf = Vec::new();

    #[derive(Default, Debug)]
    struct Item {
        rating_key: Option<String>,
    }

    let mut items: Vec<Item> = Vec::new();
    let mut current: Option<Item> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if e.name().as_ref() == b"Video" || e.name().as_ref() == b"Directory" {
                    current = Some(Item::default());
                    for a in e.attributes().flatten() {
                        let k = a.key.as_ref();
                        let v = a.unescape_value().unwrap_or_default();
                        if let Some(curr) = current.as_mut() {
                            if k == b"ratingKey" { curr.rating_key = Some(v.to_string()); }
                        }
                    }
                }
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"Video" || e.name().as_ref() == b"Directory" {
                    if let Some(curr) = current.take() {
                        items.push(curr);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => {
                return None;
            }
            _ => {}
        }
        buf.clear();
    }

    let meta: Vec<Value> = items.into_iter().map(|item| {
        let mut obj = json!({});
        if let Some(rk) = item.rating_key { obj["ratingKey"] = json!(rk); }
        obj
    }).collect();

    Some(json!({
        "MediaContainer": { "Metadata": meta }
    }))
}

// Minimal XML parser that extracts <Video> nodes with <Media><Part file=.../>
fn xml_media_to_json(xml: &str) -> Option<serde_json::Value> {
    use quick_xml::events::Event;
    use quick_xml::Reader;
    use serde_json::{json, Value};

    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);
    let mut buf = Vec::new();

    #[derive(Default, Debug)]
    struct Item {
        rating_key: Option<String>,
        title: Option<String>,
        year: Option<i64>,
        index: Option<i64>, // episode index
        media_files: Vec<String>,
        // Additional fields for template support
        edition: Option<String>,
        edition_title: Option<String>,
        genre: Option<String>,
        content_rating: Option<String>,
        studio: Option<String>,
        director: Option<String>,
        writer: Option<String>,
        country: Option<String>,
        tagline: Option<String>,
        summary: Option<String>,
        grandparent_title: Option<String>,
        parent_title: Option<String>,
        parent_index: Option<i64>,
        // ID fields for template support
        guid: Option<String>,
        _imdb_id: Option<String>,
        _thetvdb_id: Option<String>,
    }

    let mut items: Vec<Item> = Vec::new();
    let mut current: Option<Item> = None;
    let mut in_video = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = e.name();
                if name.as_ref() == b"Video" {
                    in_video = true;
                    let mut it = Item::default();
                    for a in e.attributes().flatten() {
                        let k = a.key.as_ref();
                        let v = a.unescape_value().unwrap_or_default();
                        if k == b"ratingKey" { it.rating_key = Some(v.to_string()); }
                        else if k == b"title" { it.title = Some(v.to_string()); }
                        else if k == b"year" { if let Ok(n) = v.parse::<i64>() { it.year = Some(n); } }
                        else if k == b"index" { if let Ok(n) = v.parse::<i64>() { it.index = Some(n); } }
                        else if k == b"edition" { it.edition = Some(v.to_string()); }
                        else if k == b"editionTitle" { it.edition_title = Some(v.to_string()); }
                        else if k == b"genre" { it.genre = Some(v.to_string()); }
                        else if k == b"contentRating" { it.content_rating = Some(v.to_string()); }
                        else if k == b"studio" { it.studio = Some(v.to_string()); }
                        else if k == b"director" { it.director = Some(v.to_string()); }
                        else if k == b"writer" { it.writer = Some(v.to_string()); }
                        else if k == b"country" { it.country = Some(v.to_string()); }
                        else if k == b"tagline" { it.tagline = Some(v.to_string()); }
                        else if k == b"summary" { it.summary = Some(v.to_string()); }
                        else if k == b"grandparentTitle" { it.grandparent_title = Some(v.to_string()); }
                        else if k == b"parentTitle" { it.parent_title = Some(v.to_string()); }
                        else if k == b"parentIndex" { if let Ok(n) = v.parse::<i64>() { it.parent_index = Some(n); } }
                        else if k == b"guid" { it.guid = Some(v.to_string()); }
                    }
                    current = Some(it);
                } else if in_video && name.as_ref() == b"Part" {
                    // capture file attr
                    if let Some(cur) = current.as_mut() {
                        for a in e.attributes().flatten() {
                            if a.key.as_ref() == b"file" {
                                let v = a.unescape_value().unwrap_or_default();
                                cur.media_files.push(v.to_string());
                            }
                        }
                    }
                }
            }
            Ok(Event::Empty(e)) => {
                // handle self-closing <Directory .../> or <Part .../>
                let name = e.name();
                if name.as_ref() == b"Video" {
                    // Rare, but handle self-closing Video without parts
                    let mut it = Item::default();
                    for a in e.attributes().flatten() {
                        let k = a.key.as_ref();
                        let v = a.unescape_value().unwrap_or_default();
                        if k == b"ratingKey" { it.rating_key = Some(v.to_string()); }
                        else if k == b"title" { it.title = Some(v.to_string()); }
                        else if k == b"year" { if let Ok(n) = v.parse::<i64>() { it.year = Some(n); } }
                        else if k == b"index" { if let Ok(n) = v.parse::<i64>() { it.index = Some(n); } }
                        else if k == b"edition" { it.edition = Some(v.to_string()); }
                        else if k == b"editionTitle" { it.edition_title = Some(v.to_string()); }
                        else if k == b"genre" { it.genre = Some(v.to_string()); }
                        else if k == b"contentRating" { it.content_rating = Some(v.to_string()); }
                        else if k == b"studio" { it.studio = Some(v.to_string()); }
                        else if k == b"director" { it.director = Some(v.to_string()); }
                        else if k == b"writer" { it.writer = Some(v.to_string()); }
                        else if k == b"country" { it.country = Some(v.to_string()); }
                        else if k == b"tagline" { it.tagline = Some(v.to_string()); }
                        else if k == b"summary" { it.summary = Some(v.to_string()); }
                        else if k == b"grandparentTitle" { it.grandparent_title = Some(v.to_string()); }
                        else if k == b"parentTitle" { it.parent_title = Some(v.to_string()); }
                        else if k == b"parentIndex" { if let Ok(n) = v.parse::<i64>() { it.parent_index = Some(n); } }
                        else if k == b"guid" { it.guid = Some(v.to_string()); }
                    }
                    items.push(it);
                } else if name.as_ref() == b"Part" {
                    if let Some(cur) = current.as_mut() {
                        for a in e.attributes().flatten() {
                            if a.key.as_ref() == b"file" {
                                let v = a.unescape_value().unwrap_or_default();
                                cur.media_files.push(v.to_string());
                            }
                        }
                    }
                }
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"Video" {
                    in_video = false;
                    if let Some(it) = current.take() { items.push(it); }
                }
            }
            Ok(Event::Eof) => break,
            Err(_e) => break,
            _ => {}
        }
        buf.clear();
    }

    let mut meta: Vec<Value> = Vec::new();
    for it in items {
        // Build Media/Part array resembling Plex JSON
        let parts: Vec<Value> = it.media_files.into_iter().map(|f| json!({"file": f})).collect();
        let media = if parts.is_empty() { Vec::new() } else { vec![json!({"Part": parts})] };
        let mut obj = json!({
            "title": it.title.unwrap_or_default(),
            "Media": media,
        });
        if let Some(rk) = it.rating_key { obj["ratingKey"] = json!(rk); }
        if let Some(y) = it.year { obj["year"] = json!(y); }
        if let Some(idx) = it.index { obj["index"] = json!(idx); }
        if let Some(edition) = it.edition { obj["edition"] = json!(edition); }
        if let Some(edition_title) = it.edition_title { obj["editionTitle"] = json!(edition_title); }
        if let Some(genre) = it.genre { obj["genre"] = json!(genre); }
        if let Some(content_rating) = it.content_rating { obj["contentRating"] = json!(content_rating); }
        if let Some(studio) = it.studio { obj["studio"] = json!(studio); }
        if let Some(director) = it.director { obj["director"] = json!(director); }
        if let Some(writer) = it.writer { obj["writer"] = json!(writer); }
        if let Some(country) = it.country { obj["country"] = json!(country); }
        if let Some(tagline) = it.tagline { obj["tagline"] = json!(tagline); }
        if let Some(summary) = it.summary { obj["summary"] = json!(summary); }
        if let Some(grandparent_title) = it.grandparent_title { obj["grandparentTitle"] = json!(grandparent_title); }
        if let Some(parent_title) = it.parent_title { obj["parentTitle"] = json!(parent_title); }
        if let Some(parent_index) = it.parent_index { obj["parentIndex"] = json!(parent_index); }
        if let Some(guid) = &it.guid { obj["guid"] = json!(guid); }
        meta.push(obj);
    }

    Some(json!({
        "MediaContainer": { "Metadata": meta }
    }))
}

// Parse XML that consists of <Directory .../> entries (e.g., shows list)
fn xml_directory_to_json(xml: &str) -> Option<serde_json::Value> {
    use quick_xml::events::Event;
    use quick_xml::Reader;
    use serde_json::{json, Value};

    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);
    let mut buf = Vec::new();
    let mut dirs: Vec<Value> = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) if e.name().as_ref() == b"Directory" => {
                let mut rating_key: Option<String> = None;
                let mut key: Option<String> = None;
                let mut title: Option<String> = None;
                for a in e.attributes().flatten() {
                    let k = a.key.as_ref();
                    let v = a.unescape_value().unwrap_or_default();
                    if k == b"ratingKey" { rating_key = Some(v.to_string()); }
                    else if k == b"key" { key = Some(v.to_string()); }
                    else if k == b"title" { title = Some(v.to_string()); }
                }
                if title.is_some() || rating_key.is_some() || key.is_some() {
                    let mut obj = json!({
                        "title": title.unwrap_or_default(),
                    });
                    if let Some(r) = rating_key { obj["ratingKey"] = json!(r); }
                    if let Some(k) = key { obj["key"] = json!(k); }
                    dirs.push(obj);
                }
            }
            Ok(Event::Empty(e)) if e.name().as_ref() == b"Directory" => {
                let mut rating_key: Option<String> = None;
                let mut key: Option<String> = None;
                let mut title: Option<String> = None;
                for a in e.attributes().flatten() {
                    let k = a.key.as_ref();
                    let v = a.unescape_value().unwrap_or_default();
                    if k == b"ratingKey" { rating_key = Some(v.to_string()); }
                    else if k == b"key" { key = Some(v.to_string()); }
                    else if k == b"title" { title = Some(v.to_string()); }
                }
                if title.is_some() || rating_key.is_some() || key.is_some() {
                    let mut obj = json!({
                        "title": title.unwrap_or_default(),
                    });
                    if let Some(r) = rating_key { obj["ratingKey"] = json!(r); }
                    if let Some(k) = key { obj["key"] = json!(k); }
                    dirs.push(obj);
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    Some(json!({"MediaContainer": {"Directory": dirs}}))
}

// -- Additional helpers for TV-specific flows --

async fn http_get_with_variants(
    urls: &[String],
    token: Option<&str>,
    client_id: &str,
) -> Result<reqwest::Response, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(8))
        .http1_only()
        .pool_max_idle_per_host(0)
        .danger_accept_invalid_certs(true)
        .user_agent(format!("Name-o-Tron-9000/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("http client error: {e:?}"))?;

    let mut last_err: Option<String> = None;
    for url in urls {
        let mut req = with_plex_headers(client.get(url), client_id)
            .header("Accept", "application/json, application/xml;q=0.9")
            .header("Accept-Encoding", "identity")
            .header("Connection", "close");
        if let Some(t) = token { req = req.header("X-Plex-Token", t); }
        match req.send().await {
            Ok(r) => {
                return Ok(r)
            },
            Err(e) => {
                last_err = Some(format!("{e}"));
            }
        }
    }
    Err(format!(
        "all attempts failed{}",
        last_err.map(|e| format!(": {e}")).unwrap_or_default()
    ))
}

#[tauri::command]
pub async fn fetch_tv_shows(
    server: String,
    library_key: String,
    token: Option<String>,
    start: Option<usize>,
    size: Option<usize>,
    query: Option<String>,
) -> Result<serde_json::Value, String> {
    let start = start.unwrap_or(0);
    let size = size.unwrap_or(200);

    let base_in = server.trim_end_matches('/');
    let mut bases: Vec<String> = vec![if base_in.starts_with("http://") || base_in.starts_with("https://") {
        base_in.to_string()
    } else { format!("http://{}", base_in) }];
    if base_in.starts_with("http://") {
        bases.push(base_in.replacen("http://", "https://", 1));
    } else if base_in.starts_with("https://") {
        bases.push(base_in.replacen("https://", "http://", 1));
    } else {
        bases.push(format!("https://{}", base_in));
    }
    bases.sort();
    bases.dedup();

    let paging = format!("X-Plex-Container-Start={}&X-Plex-Container-Size={}", start, size);
    let mut urls: Vec<String> = Vec::new();
    for b in &bases {
        let details = "&includeDetails=1";
        if let Some(q) = query.as_ref().filter(|s| !s.trim().is_empty()) {
            let qenc = urlencoding::encode(q.trim());
            if let Some(t) = token.as_ref() {
                let tok = urlencoding::encode(t);
                urls.push(format!("{}/library/sections/{}/search?type=2&query={}&{}{}&X-Plex-Token={}", b, library_key, qenc, paging, details, tok));
                urls.push(format!("{}/library/sections/{}/search?type=2&query={}{}&X-Plex-Token={}", b, library_key, qenc, details, tok));
            }
            urls.push(format!("{}/library/sections/{}/search?type=2&query={}&{}{}", b, library_key, qenc, paging, details));
            urls.push(format!("{}/library/sections/{}/search?type=2&query={}{}", b, library_key, qenc, details));
        } else {
            if let Some(t) = token.as_ref() {
                let tok = urlencoding::encode(t);
                urls.push(format!("{}/library/sections/{}/all?{}&type=2{}&X-Plex-Token={}", b, library_key, paging, details, tok));
                urls.push(format!("{}/library/sections/{}/all?type=2{}&X-Plex-Token={}", b, library_key, details, tok));
            }
            urls.push(format!("{}/library/sections/{}/all?{}&type=2{}", b, library_key, paging, details));
            urls.push(format!("{}/library/sections/{}/all?type=2{}", b, library_key, details));
        }
    }

    let client_id = current_client_id();
    let resp = http_get_with_variants(&urls, token.as_deref(), &client_id).await?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, text));
    }
    let trimmed = text.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
            // Normalize to MediaContainer.Directory array
            if let Some(mc) = v.get("MediaContainer").cloned() {
                let mut dirs: Vec<serde_json::Value> = Vec::new();
                if let Some(arr) = mc.get("Directory").and_then(|d| d.as_array()) {
                    dirs.extend(arr.iter().cloned());
                } else if let Some(obj) = mc.get("Directory").and_then(|d| d.as_object()) {
                    dirs.push(serde_json::Value::Object(obj.clone()));
                } else if let Some(arr) = mc.get("Metadata").and_then(|m| m.as_array()) {
                    for it in arr {
                        // Preserve all metadata fields for TV shows
                        dirs.push(it.clone());
                    }
                }
                let out = serde_json::json!({"MediaContainer": {"Directory": dirs}});
                return Ok(out);
            }
            return Ok(v);
        }
    }
    if trimmed.starts_with('<') {
        if let Some(v) = xml_directory_to_json(&text) { return Ok(v); }
    }
    // minimal pass-through if we cannot parse
    Ok(serde_json::json!({"_raw": text}))
}

#[tauri::command]
pub async fn search_content(
    server: String,
    query: String,
    section_id: Option<i32>,
    limit: Option<usize>,
    token: Option<String>,
) -> Result<serde_json::Value, String> {
    let limit = limit.unwrap_or(3); // Default limit per hub type

    let base_in = server.trim_end_matches('/');
    let mut bases: Vec<String> = vec![if base_in.starts_with("http://") || base_in.starts_with("https://") {
        base_in.to_string()
    } else { format!("http://{}", base_in) }];
    if base_in.starts_with("http://") {
        bases.push(base_in.replacen("http://", "https://", 1));
    } else if base_in.starts_with("https://") {
        bases.push(base_in.replacen("https://", "http://", 1));
    } else {
        bases.push(format!("https://{}", base_in));
    }
    bases.sort();
    bases.dedup();

    let mut urls: Vec<String> = Vec::new();
    for b in &bases {
        let mut url = format!("{}/hubs/search?query={}", b, urlencoding::encode(&query));

        if let Some(section_id) = section_id {
            url.push_str(&format!("&sectionId={}", section_id));
        }

        if limit != 3 {
            url.push_str(&format!("&limit={}", limit));
        }

        if let Some(t) = token.as_ref() {
            url.push_str(&format!("&X-Plex-Token={}", urlencoding::encode(t)));
        }

        urls.push(url);
    }

    let client_id = current_client_id();
    let resp = http_get_with_variants(&urls, token.as_deref(), &client_id).await?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, text));
    }
    let trimmed = text.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) { return Ok(v); }
    }
    if trimmed.starts_with('<') {
        if let Some(v) = xml_search_to_json(&text) { return Ok(v); }
    }
    // Debug: return raw response for investigation
    Ok(serde_json::json!({"_raw": text}))
}

fn xml_search_to_json(xml_text: &str) -> Option<serde_json::Value> {
    // Parse XML response from /hubs/search and convert to JSON structure
    // For now, return a basic structure - in a real implementation, this would need proper XML parsing
    if xml_text.contains("MediaContainer") {
        // Return a basic structure that matches what we expect
        Some(serde_json::json!({
            "MediaContainer": {
                "Hub": []
            }
        }))
    } else {
        None
    }
}

#[tauri::command]
pub async fn fetch_collections(
    server: String,
    library_key: String,
    token: Option<String>,
) -> Result<serde_json::Value, String> {
    let start = 0;
    let size = 1000; // Fetch all collections
    let paging = format!("?X-Plex-Container-Start={}&X-Plex-Container-Size={}", start, size);

    let base_urls = [
        format!("http://{}/library/sections/{}/collection", server, library_key),
        format!("https://{}/library/sections/{}/collection", server, library_key),
    ];

    let client_id = current_client_id();

    for url in &base_urls {
        let url_with_paging = format!("{}{}", url, paging);
        let mut req = with_plex_headers(reqwest::Client::new().get(&url_with_paging), &client_id)
            .header("Accept", "application/json, application/xml;q=0.9")
            .header("Accept-Encoding", "identity")
            .header("Connection", "close");
        if let Some(t) = token.as_ref() {
            req = req.header("X-Plex-Token", t);
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    let text = resp.text().await.map_err(|e| format!("read response error: {e}"))?;
                    let trimmed = text.trim();

                    if trimmed.starts_with('{') || trimmed.starts_with('[') {
                        match serde_json::from_str::<serde_json::Value>(trimmed) {
                            Ok(v) => return Ok(v),
                            Err(e) => return Err(format!("JSON parse error: {}", e)),
                        }
                    }

                    if trimmed.starts_with('<') {
                        if let Some(json) = xml_collections_to_json(&text) {
                            return Ok(json);
                        }
                    }

                    return Ok(serde_json::Value::String(text));
                }
            }
            Err(e) => return Err(format!("reqwest error on {}: {}", url, e)),
        }
    }

    Err("fetch_collections failed on all URLs".to_string())
}

#[tauri::command]
pub async fn fetch_collection_items(
    server: String,
    collection_rating_key: String,
    token: Option<String>,
) -> Result<serde_json::Value, String> {
    let base_urls = [
        format!("http://{}/library/collections/{}/items", server, collection_rating_key),
        format!("https://{}/library/collections/{}/items", server, collection_rating_key),
    ];

    let client_id = current_client_id();

    for url in &base_urls {
        let mut req = with_plex_headers(reqwest::Client::new().get(url), &client_id)
            .header("Accept", "application/json, application/xml;q=0.9")
            .header("Accept-Encoding", "identity")
            .header("Connection", "close");
        if let Some(t) = token.as_ref() {
            req = req.header("X-Plex-Token", t);
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    let text = resp.text().await.map_err(|e| format!("read response error: {e}"))?;
                    let trimmed = text.trim();

                    if trimmed.starts_with('{') || trimmed.starts_with('[') {
                        match serde_json::from_str::<serde_json::Value>(trimmed) {
                            Ok(v) => return Ok(v),
                            Err(e) => return Err(format!("JSON parse error: {}", e)),
                        }
                    }

                    if trimmed.starts_with('<') {
                        if let Some(json) = xml_collection_items_to_json(&text) {
                            return Ok(json);
                        }
                    }

                    return Ok(serde_json::Value::String(text));
                }
            }
            Err(e) => return Err(format!("reqwest error on {}: {}", url, e)),
        }
    }

    Err("fetch_collection_items failed on all URLs".to_string())
}

#[tauri::command]
pub async fn fetch_show_episodes(
    server: String,
    show_rating_key: String,
    token: Option<String>,
    start: Option<usize>,
    size: Option<usize>,
) -> Result<serde_json::Value, String> {
    let start = start.unwrap_or(0);
    let size = size.unwrap_or(200);
    let base_in = server.trim_end_matches('/');
    let mut bases: Vec<String> = vec![if base_in.starts_with("http://") || base_in.starts_with("https://") {
        base_in.to_string()
    } else { format!("http://{}", base_in) }];
    if base_in.starts_with("http://") {
        bases.push(base_in.replacen("http://", "https://", 1));
    } else if base_in.starts_with("https://") {
        bases.push(base_in.replacen("https://", "http://", 1));
    } else {
        bases.push(format!("https://{}", base_in));
    }
    bases.sort();
    bases.dedup();

    let paging = format!("X-Plex-Container-Start={}&X-Plex-Container-Size={}", start, size);
    let mut urls: Vec<String> = Vec::new();
    for b in &bases {
        if let Some(t) = token.as_ref() {
            let tok = urlencoding::encode(t);
            urls.push(format!("{}/library/metadata/{}/allLeaves?{}&X-Plex-Token={}", b, show_rating_key, paging, tok));
            urls.push(format!("{}/library/metadata/{}/allLeaves?X-Plex-Token={}", b, show_rating_key, tok));
        }
        urls.push(format!("{}/library/metadata/{}/allLeaves?{}", b, show_rating_key, paging));
        urls.push(format!("{}/library/metadata/{}/allLeaves", b, show_rating_key));
    }

    let client_id = current_client_id();
    let resp = http_get_with_variants(&urls, token.as_deref(), &client_id).await?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, text));
    }
    let trimmed = text.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) { return Ok(v); }
    }
    if trimmed.starts_with('<') {
        if let Some(v) = xml_media_to_json(&text) { return Ok(v); }
    }
    Ok(serde_json::json!({"_raw": text}))
}

#[tauri::command]
pub async fn list_libraries(server: String, token: Option<String>) -> Result<Vec<PlexLibraryDto>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .http1_only()
        .pool_max_idle_per_host(0)
        .danger_accept_invalid_certs(true)
        .user_agent(format!("Name-o-Tron-9000/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| {
            let msg = format!("http client error: {e:?}");
            crate::logging::log_event(
                "ERROR",
                "list_libraries",
                &msg,
                serde_json::json!({ "server": server }),
            );
            msg
        })?;

    let base = server.trim_end_matches('/');
    // Build HTTP and HTTPS candidates (Self-signed certs accepted).
    let mut bases: Vec<String> = vec![base.to_string()];
    if base.starts_with("http://") {
        bases.push(base.replacen("http://", "https://", 1));
    } else if base.starts_with("https://") {
        bases.push(base.replacen("https://", "http://", 1));
    }
    bases.sort();
    bases.dedup();

    let mut urls: Vec<String> = Vec::new();
    for b in &bases {
        if let Some(t) = token.as_ref() {
            urls.push(format!("{}/library/sections?X-Plex-Token={}", b, urlencoding::encode(t)));
            urls.push(format!("{}/library/sections/?X-Plex-Token={}", b, urlencoding::encode(t)));
        } else {
            urls.push(format!("{}/library/sections", b));
            urls.push(format!("{}/library/sections/", b));
        }
    }

    let client_id = current_client_id();
    let mut last_err: Option<String> = None;
    let mut resp_opt = None;
    for url in urls.iter() {
        let mut req = with_plex_headers(client.get(url), &client_id);
        if let Some(t) = token.as_ref() {
            req = req.header("X-Plex-Token", t);
        }
        req = req
            .header("Accept", "application/json, application/xml;q=0.9")
            .header("Accept-Encoding", "identity")
            .header("Connection", "close");
        match req.send().await {
            Ok(r) => { resp_opt = Some(r); break; }
            Err(e) => {
                let msg = format!("{e:?} @ {}", url);
                crate::logging::log_event(
                    "ERROR",
                    "list_libraries",
                    &msg,
                    serde_json::json!({ "server": server }),
                );
                last_err = Some(msg);
            }
        }
    }
    // If all HTTP attempts failed with reqwest, try a ureq fallback
    let response = match resp_opt {
        Some(resp) => resp,
        None => {
            if let Ok(out) = fetch_sections_with_ureq(&bases[0], &urls, token.as_deref(), &client_id) {
                return Ok(out);
            }
            let msg = format!(
                "libraries request error: {} | ureq fallback also failed",
                last_err.clone().unwrap_or_else(|| "unknown".into())
            );
            crate::logging::log_event(
                "ERROR",
                "list_libraries",
                &msg,
                serde_json::json!({ "server": server }),
            );
            return Err(msg);
        }
    };

    let status = response.status();
    let response_text = match response.text().await {
        Ok(text) => text,
        Err(e) => {
            let error = format!("Failed to read response text: {}", e);
            crate::logging::log_event(
                "ERROR",
                "list_libraries",
                &error,
                serde_json::json!({ "server": server }),
            );
            return Err(error);
        }
    };


    if status.as_u16() == 401 {
        if let Some(acc_tok) = token.as_deref() {
            if let Some(server_tok) = fetch_server_access_token(acc_tok, &client_id, &bases[0]).await {
                let mut retry_urls: Vec<String> = Vec::new();
                for b in &bases {
                    retry_urls.push(format!("{}/library/sections?X-Plex-Token={}", b, urlencoding::encode(&server_tok)));
                    retry_urls.push(format!("{}/library/sections/?X-Plex-Token={}", b, urlencoding::encode(&server_tok)));
                }
                for u in retry_urls.iter() {
                    let req = with_plex_headers(client.get(u), &client_id)
                        .header("Accept", "application/json, application/xml;q=0.9")
                        .header("Accept-Encoding", "identity")
                        .header("Connection", "close")
                        .header("X-Plex-Token", &server_tok);
                    match req.send().await {
                        Ok(r) => {
                            if r.status().is_success() {
                                let body = r.text().await.unwrap_or_default();
                                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                                    let dirs = json.get("MediaContainer").and_then(|m| m.get("Directory")).and_then(|x| x.as_array()).cloned().unwrap_or_default();
                                    let mut out = Vec::new();
                                    for d in dirs {
                                        let key = d.get("key").and_then(|x| x.as_str()).unwrap_or("").to_string();
                                        let typ = d.get("type").and_then(|x| x.as_str()).unwrap_or("").to_string();
                                        let title = d.get("title").and_then(|x| x.as_str()).unwrap_or("").to_string();
                                        if !key.is_empty() && !title.is_empty() { out.push(PlexLibraryDto { key, r#type: typ, title, roots: vec![] }); }
                                    }
                                    return Ok(out);
                                }
                            } else {
                            }
                        }
                        Err(_) => {}
                    }
                }
            } else {
            }
        }
    }

    if !status.is_success() {
        let error = format!("HTTP {}: {}", status, response_text);
        crate::logging::log_event(
            "ERROR",
            "list_libraries",
            &error,
            serde_json::json!({ "server": server }),
        );
        return Err(error);
    }

    // Try to parse as JSON first
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&response_text) {
        if let Some(media_container) = json.get("MediaContainer") {
            if let Some(dirs_val) = media_container.get("Directory") {
                let dirs_slice: Vec<&serde_json::Value> = match dirs_val {
                    serde_json::Value::Array(a) => a.iter().collect(),
                    _ => vec![dirs_val],
                };
                let mut dirs: Vec<PlexLibraryDto> = Vec::new();
                for d in dirs_slice {
                    let key = d.get("key").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let typ = d.get("type").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let title = d.get("title").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    if key.is_empty() || title.is_empty() { continue; }
                    let mut roots: Vec<String> = parse_roots_from_directory_json(d);
                    if roots.is_empty() {
                        // Fallback to per-section request if locations not present in this payload
                        if let Ok(r) = fetch_section_roots(&bases, &key, token.as_deref(), &client_id).await { roots = r; }
                    }
                    dirs.push(PlexLibraryDto { key, r#type: typ, title, roots });
                }
                return Ok(dirs);
            } else {
            }
        } else {
        }
    } else {
    }

    // Fallback to XML parsing
    let mut reader = Reader::from_str(&response_text);
    reader.trim_text(true);
    let mut buf = Vec::new();
    let mut out: Vec<PlexLibraryDto> = Vec::new();
    let mut in_dir = false;
    let mut cur_key = String::new();
    let mut cur_type = String::new();
    let mut cur_title = String::new();
    let mut cur_roots: Vec<String> = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) if e.name().as_ref() == b"Directory" => {
                in_dir = true;
                cur_key.clear(); cur_type.clear(); cur_title.clear(); cur_roots.clear();
                for a in e.attributes().flatten() {
                    let k = a.key.as_ref();
                    let v = a.unescape_value().unwrap_or_default();
                    if k == b"key" { cur_key = v.to_string(); }
                    else if k == b"type" { cur_type = v.to_string(); }
                    else if k == b"title" { cur_title = v.to_string(); }
                }
            }
            Ok(Event::Empty(e)) if e.name().as_ref() == b"Directory" => {
                // Self-closing Directory without nested Locations
                let mut key = String::new();
                let mut typ = String::new();
                let mut title = String::new();
                for a in e.attributes().flatten() {
                    let k = a.key.as_ref();
                    let v = a.unescape_value().unwrap_or_default();
                    if k == b"key" { key = v.to_string(); }
                    else if k == b"type" { typ = v.to_string(); }
                    else if k == b"title" { title = v.to_string(); }
                }
                if !key.is_empty() && !title.is_empty() {
                    out.push(PlexLibraryDto { key, r#type: typ, title, roots: Vec::new() });
                }
            }
            Ok(Event::Start(e)) if e.name().as_ref() == b"Location" && in_dir => {
                for a in e.attributes().flatten() {
                    if a.key.as_ref() == b"path" {
                        let v = a.unescape_value().unwrap_or_default();
                        if !v.is_empty() { cur_roots.push(v.to_string()); }
                    }
                }
            }
            Ok(Event::Empty(e)) if e.name().as_ref() == b"Location" && in_dir => {
                for a in e.attributes().flatten() {
                    if a.key.as_ref() == b"path" {
                        let v = a.unescape_value().unwrap_or_default();
                        if !v.is_empty() { cur_roots.push(v.to_string()); }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Ok(Event::End(e)) if e.name().as_ref() == b"Directory" => {
                if !cur_key.is_empty() && !cur_title.is_empty() {
                    out.push(PlexLibraryDto { key: cur_key.clone(), r#type: cur_type.clone(), title: cur_title.clone(), roots: cur_roots.clone() });
                }
                in_dir = false;
                cur_roots.clear();
            }
            Ok(Event::End(_)) => {
                // Handle other end tags (like Location)
            }
            Ok(_) => {
                // Handle other event types (Text, Comment, etc.)
            }
            Err(_) => {
                break;
            }
        }
        buf.clear();
    }

    if !out.is_empty() {
        return Ok(out);
    }

    // If we get here, neither JSON nor XML parsing worked
    let error = format!("Failed to parse libraries from response. Response: {}", response_text);
    Err(error)
}

fn fetch_sections_with_ureq(
    base: &str,
    urls: &[String],
    token: Option<&str>,
    client_id: &str,
) -> Result<Vec<PlexLibraryDto>, String> {
    let product = "Name-o-Tron 9000";
    let version = env!("CARGO_PKG_VERSION");
    let platform = std::env::consts::OS;
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(20))
        .build();

    let mut last_err: Option<String> = None;
    for url in urls {
        let mut req = agent
            .get(url)
            .set("Accept", "application/json, application/xml;q=0.9")
            .set("Accept-Encoding", "identity")
            .set("Connection", "close")
            .set("User-Agent", &format!("{product}/{version}"))
            .set("X-Plex-Product", product)
            .set("X-Plex-Version", version)
            .set("X-Plex-Client-Identifier", client_id)
            .set("X-Plex-Platform", platform)
            .set("X-Plex-Device", platform)
            .set("X-Plex-Device-Name", &whoami::devicename());
        if let Some(t) = token { req = req.set("X-Plex-Token", t); }

        match req.call() {
            Ok(resp) => {
                let ct = resp.header("content-type").unwrap_or("").to_ascii_lowercase();
                if ct.contains("application/json") {
                    let v: serde_json::Value = resp
                        .into_json()
                        .map_err(|e| format!("libraries json parse error: {e}"))?;
                    let dirs = v
                        .get("MediaContainer")
                        .and_then(|m| m.get("Directory"))
                        .and_then(|d| d.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let mut out = Vec::new();
                    for d in dirs {
                        let key = d.get("key").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        let typ = d.get("type").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        let title = d.get("title").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        if !key.is_empty() && !title.is_empty() {
                            out.push(PlexLibraryDto { key, r#type: typ, title, roots: Vec::new() });
                        }
                    }
                    return Ok(out);
                } else {
                    let body = resp.into_string().map_err(|e| format!("libraries read error: {e}"))?;
                    let mut reader = Reader::from_str(&body);
                    reader.trim_text(true);
                    let mut buf = Vec::new();
                    let mut out = Vec::new();
                    loop {
                        match reader.read_event_into(&mut buf) {
                            Ok(Event::Start(e)) if e.name().as_ref() == b"Directory" => {
                                let mut key = String::new();
                                let mut typ = String::new();
                                let mut title = String::new();
                                for a in e.attributes().flatten() {
                                    let k = a.key.as_ref();
                                    let v = a.unescape_value().unwrap_or_default();
                                    if k == b"key" { key = v.to_string(); }
                                    else if k == b"type" { typ = v.to_string(); }
                                    else if k == b"title" { title = v.to_string(); }
                                }
                                if !key.is_empty() && !title.is_empty() {
                                    out.push(PlexLibraryDto { key, r#type: typ, title, roots: Vec::new() });
                                }
                            }
                            Ok(Event::Eof) => break,
                            Err(_e) => break,
                            _ => {}
                        }
                        buf.clear();
                    }
                    return Ok(out);
                }
            }
            Err(e) => { last_err = Some(e.to_string()); }
        }
    }
    Err(format!("ureq libraries request error: {} — server {}", last_err.unwrap_or_else(|| "unknown".into()), base))
}

// Fetch roots for a single section key by querying /library/sections/{key}
async fn fetch_section_roots(
    bases: &[String],
    key: &str,
    token: Option<&str>,
    client_id: &str,
) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .http1_only()
        .pool_max_idle_per_host(0)
        .danger_accept_invalid_certs(true)
        .user_agent(format!("Name-o-Tron-9000/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("http client error: {e:?}"))?;

    let mut urls: Vec<String> = Vec::new();
    for b in bases {
        if let Some(t) = token {
            urls.push(format!("{}/library/sections/{}?X-Plex-Token={}", b, key, urlencoding::encode(t)));
            urls.push(format!("{}/library/sections/{}/?X-Plex-Token={}", b, key, urlencoding::encode(t)));
        } else {
            urls.push(format!("{}/library/sections/{}", b, key));
            urls.push(format!("{}/library/sections/{}/", b, key));
        }
    }

    let mut last_err: Option<String> = None;
    for url in &urls {
        let mut req = with_plex_headers(client.get(url), client_id)
            .header("Accept", "application/json, application/xml;q=0.9")
            .header("Accept-Encoding", "identity")
            .header("Connection", "close");
        if let Some(t) = token { req = req.header("X-Plex-Token", t); }
        match req.send().await {
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                if !status.is_success() { last_err = Some(format!("HTTP {} @ {}", status, url)); continue; }
                // JSON first
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                    if let Some(roots) = parse_roots_from_json(&json) { return Ok(roots); }
                }
                // XML fallback
                if let Some(roots) = parse_roots_from_xml(&body) { return Ok(roots); }
                // As a fallback, return empty to avoid hard-fail
                return Ok(Vec::new());
            }
            Err(e) => { last_err = Some(format!("{e:?} @ {}", url)); }
        }
    }
    Err(last_err.unwrap_or_else(|| "unknown error fetching section roots".into()))
}

fn parse_roots_from_json(v: &serde_json::Value) -> Option<Vec<String>> {
    let mc = v.get("MediaContainer")?;
    let dir = mc.get("Directory")?;
    // Directory can be object or array with single object
    let dirs: Vec<&serde_json::Value> = match dir {
        serde_json::Value::Array(a) => a.iter().collect(),
        _ => vec![dir],
    };
    let mut out: Vec<String> = Vec::new();
    for d in dirs {
        match d.get("Location") {
            Some(serde_json::Value::Array(locs)) => {
                for loc in locs {
                    if let Some(path) = loc.get("path").and_then(|x| x.as_str()) {
                        if !path.is_empty() { out.push(path.to_string()); }
                    }
                }
            }
            Some(obj @ serde_json::Value::Object(_)) => {
                if let Some(path) = obj.get("path").and_then(|x| x.as_str()) {
                    if !path.is_empty() { out.push(path.to_string()); }
                }
            }
            _ => {}
        }
    }
    Some(out)
}

fn parse_roots_from_directory_json(d: &serde_json::Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    match d.get("Location") {
        Some(serde_json::Value::Array(locs)) => {
            for loc in locs {
                if let Some(path) = loc.get("path").and_then(|x| x.as_str()) {
                    if !path.is_empty() { out.push(path.to_string()); }
                }
            }
        }
        Some(obj @ serde_json::Value::Object(_)) => {
            if let Some(path) = obj.get("path").and_then(|x| x.as_str()) {
                if !path.is_empty() { out.push(path.to_string()); }
            }
        }
        _ => {}
    }
    out
}

fn parse_roots_from_xml(xml: &str) -> Option<Vec<String>> {
    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);
    let mut buf = Vec::new();
    let mut in_directory = false;
    let mut out: Vec<String> = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if e.name().as_ref() == b"Directory" { in_directory = true; }
                else if in_directory && e.name().as_ref() == b"Location" {
                    for a in e.attributes().flatten() {
                        if a.key.as_ref() == b"path" {
                            let v = a.unescape_value().unwrap_or_default();
                            if !v.is_empty() { out.push(v.to_string()); }
                        }
                    }
                }
            }
            Ok(Event::Empty(e)) => {
                if e.name().as_ref() == b"Location" {
                    for a in e.attributes().flatten() {
                        if a.key.as_ref() == b"path" {
                            let v = a.unescape_value().unwrap_or_default();
                            if !v.is_empty() { out.push(v.to_string()); }
                        }
                    }
                }
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"Directory" { in_directory = false; }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    Some(out)
}

/// Sanitize a filename according to Windows rules and user preferences
pub fn sanitize_filename(filename: &str, settings: &CharacterReplacement) -> String {
    let mut result = filename.to_string();

    // 1. Handle separators (:)
    match settings.separators.as_str() {
        "-" => result = result.replace(':', "-"),
        "_" => result = result.replace(':', "_"),
        "remove" => result = result.replace(':', ""),
        _ => {}
    }

    // 2. Handle quotes (")
    match settings.quotes.as_str() {
        "'" => result = result.replace('"', "'"),
        "`" => result = result.replace('"', "`"),
        "remove" => result = result.replace('"', ""),
        _ => {}
    }

    // 3. Handle wildcards (* ?)
    match settings.wildcards.as_str() {
        "-" => {
            result = result.replace('*', "-");
            result = result.replace('?', "-");
        }
        "remove" => {
            result = result.replace('*', "");
            result = result.replace('?', "");
        }
        _ => {}
    }

    // 4. Handle brackets (< >)
    match settings.brackets.as_str() {
        "()" => {
            result = result.replace('<', "(");
            result = result.replace('>', ")");
        }
        "[]" => {
            result = result.replace('<', "[");
            result = result.replace('>', "]");
        }
        "remove" => {
            result = result.replace('<', "");
            result = result.replace('>', "");
        }
        _ => {}
    }

    // 5. Handle general characters (\ / |)
    match settings.general.as_str() {
        "-" => {
            result = result.replace('\\', "-");
            result = result.replace('/', "-");
            result = result.replace('|', "-");
        }
        "_" => {
            result = result.replace('\\', "_");
            result = result.replace('/', "_");
            result = result.replace('|', "_");
        }
        "remove" => {
            result = result.replace('\\', "");
            result = result.replace('/', "");
            result = result.replace('|', "");
        }
        _ => {}
    }

    // 6. Strip control characters (0x00–0x1F, 0x7F)
    result = result.chars()
        .filter(|&c| !c.is_ascii_control() || c == '\n' || c == '\r' || c == '\t')
        .collect();

    // 7. Strip trailing dots and spaces
    result = result.trim_end_matches(|c: char| c == '.' || c == ' ').to_string();

    // 8. Handle reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
    let base = result.replace('.', "");
    let reserved_names = [
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
    ];

    if reserved_names.iter().any(|&name| base.to_uppercase() == name) {
        result.push_str("_file");
    }

    result
}

#[derive(Deserialize)]
pub struct CharacterReplacement {
    pub separators: String,
    pub quotes: String,
    pub wildcards: String,
    pub brackets: String,
    pub general: String,
}

#[tauri::command]
pub fn sanitize_filename_cmd(filename: String, settings: CharacterReplacement) -> String {
    sanitize_filename(&filename, &settings)
}
