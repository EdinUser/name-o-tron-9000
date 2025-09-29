use once_cell::sync::Lazy;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone)]
pub struct LoginState {
    pub client_id: String,
    pub pin_id: i64,
    pub code: String,
    pub started_at: Instant,
    pub expires_in: i64,
    pub token: Option<String>,
    pub status: LoginStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LoginStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "authorized")]
    Authorized,
    #[serde(rename = "error")]
    Error,
    #[serde(rename = "expired")]
    Expired,
    #[serde(rename = "idle")]
    Idle,
}

#[derive(Deserialize)]
struct PinCreateResp {
    id: i64,
    code: String,
    #[serde(default, rename = "expiresIn")]
    expires_in: i64,
}

#[derive(Deserialize)]
struct PinPollResp {
    id: i64,
    code: String,
    #[serde(default, rename = "expiresIn")]
    expires_in: i64,
    #[serde(default, rename = "authToken")]
    auth_token: Option<String>,
}

static LOGIN: Lazy<Mutex<Option<LoginState>>> = Lazy::new(|| Mutex::new(None));

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

async fn create_pin(client: &reqwest::Client, client_id: &str) -> Result<PinCreateResp, String> {
    let url = "https://plex.tv/api/v2/pins?strong=true";
    let resp = with_plex_headers(client.post(url), client_id)
        .send()
        .await
        .map_err(|e| format!("create pin error: {e}"))?;
    
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    
    if !status.is_success() {
        return Err(format!("create pin http {}: {}", status, text));
    }
    
    serde_json::from_str(&text)
        .map_err(|e| format!("create pin parse error: {e}"))
}

async fn poll_pin(client: &reqwest::Client, client_id: &str, pin_id: i64) -> Result<PinPollResp, String> {
    let url = format!("https://plex.tv/api/v2/pins/{}", pin_id);
    let resp = with_plex_headers(client.get(url), client_id)
        .send()
        .await
        .map_err(|e| format!("poll pin error: {e}"))?;
        
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    
    if !status.is_success() {
        return Err(format!("poll pin http {}: {}", status, text));
    }
    
    serde_json::from_str(&text)
        .map_err(|e| format!("poll pin parse error: {e}"))
}

#[derive(Serialize)]
pub struct LoginStartResult {
    pub status: LoginStatus,
    pub code: String,
    pub client_id: String,
    pub auth_url: String,
}

#[tauri::command]
pub async fn plex_login(app: tauri::AppHandle) -> Result<LoginStartResult, String> {
    println!("Starting Plex login process...");
    
    let client_id = uuid::Uuid::new_v4().to_string();
    println!("Generated client ID: {}", client_id);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| {
            let error = format!("Failed to create HTTP client: {}", e);
            println!("{}", error);
            error
        })?;

    println!("Creating Plex PIN...");
    let pin = create_pin(&client, &client_id).await.map_err(|e| {
        let error = format!("Failed to create Plex PIN: {}", e);
        println!("{}", error);
        error
    })?;
    
    println!("Created PIN with ID: {}", pin.id);
    
    let auth_url = format!(
        "https://app.plex.tv/auth#?clientID={}&code={}",
        urlencoding::encode(&client_id),
        urlencoding::encode(&pin.code)
    );
    
    println!("Auth URL: {}", auth_url);

    // Save state
    let login_state = LoginState {
        client_id: client_id.clone(),
        pin_id: pin.id,
        code: pin.code.clone(),
        started_at: Instant::now(),
        expires_in: if pin.expires_in > 0 { pin.expires_in } else { 120 },
        token: None,
        status: LoginStatus::Pending,
    };
    
    println!("Saving login state...");
    {
        let mut guard = LOGIN.lock().map_err(|e| {
            let error = format!("Failed to acquire login state lock: {}", e);
            println!("{}", error);
            error
        })?;
        *guard = Some(login_state);
    }

    // Open browser via opener plugin
    println!("Opening browser for authentication...");
    if let Err(e) = app.opener().open_url(auth_url.clone(), Option::<String>::None) {
        let error = format!("Failed to open browser: {}", e);
        println!("{}", error);
        return Err(error);
    }

    // Clone values needed for background task
    let client_id_for_poller = client_id.clone();
    let pin_id = pin.id;

    // Start background poller using tokio::spawn for async operations
    tokio::spawn(async move {
        println!("Starting background poller for PIN {}...", pin_id);
        
        let poll_client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build() {
                Ok(client) => client,
                Err(e) => {
                    println!("Failed to create poll client: {}", e);
                    return;
                }
            };
            
        let deadline = Instant::now() + Duration::from_secs(300); // 5 minutes timeout
        let mut status = LoginStatus::Pending;
        let mut token: Option<String> = None;
        let mut last_error = None;

        while Instant::now() < deadline {
            match poll_pin(&poll_client, &client_id_for_poller, pin_id).await {
                Ok(r) => {
                    println!("Poll response: auth_token={:?}", r.auth_token.is_some());
                    if let Some(auth_token) = r.auth_token {
                        println!("Authentication successful!");
                        token = Some(auth_token);
                        status = LoginStatus::Authorized;
                        break;
                    }
                }
                Err(e) => {
                    println!("Poll error: {}", e);
                    last_error = Some(e);
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }

        if status != LoginStatus::Authorized {
            println!("Authentication failed or timed out");
            if let Some(err) = last_error {
                println!("Last error: {}", err);
            }
            return; // Just return without error since we're in a spawned task
        }

        let mut guard = match LOGIN.lock() {
            Ok(guard) => guard,
            Err(e) => {
                println!("Failed to acquire login state lock: {}", e);
                return;
            }
        };
        
        if let Some(login) = guard.as_mut() {
            login.status = status;
            login.token = token.clone();
            println!("Updated login state: status={:?}, has_token={}", status, token.is_some());
        }
    });

    let result = LoginStartResult {
        status: LoginStatus::Pending,
        code: pin.code,
        client_id,
        auth_url,
    };
    
    println!("Login process started successfully");
    Ok(result)
}

#[derive(Serialize)]
pub struct LoginStatusResult {
    pub status: LoginStatus,
    pub token: Option<String>,
}

#[tauri::command]
pub fn plex_login_status() -> Result<LoginStatusResult, String> {
    println!("Checking login status...");
    
    let guard = match LOGIN.lock() {
        Ok(guard) => guard,
        Err(e) => {
            let error = format!("Failed to acquire login state lock: {}", e);
            println!("{}", error);
            return Err(error);
        }
    };
    
    if let Some(state) = &*guard {
        println!("Current login status: {:?}, has_token: {}", state.status, state.token.is_some());
        Ok(LoginStatusResult {
            status: state.status,
            token: state.token.clone(),
        })
    } else {
        println!("No active login session found");
        Ok(LoginStatusResult {
            status: LoginStatus::Idle,
            token: None,
        })
    }
}

#[tauri::command]
pub fn plex_logout() -> Result<(), String> {
    let mut guard = LOGIN.lock().unwrap();
    if let Some(state) = guard.as_mut() {
        state.token = None;
        state.status = LoginStatus::Idle;
    } else {
        *guard = Some(LoginState {
            client_id: uuid::Uuid::new_v4().to_string(),
            pin_id: 0,
            code: String::new(),
            started_at: Instant::now(),
            expires_in: 0,
            token: None,
            status: LoginStatus::Idle,
        });
    }
    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct PlexLibraryDto {
    pub key: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub title: String,
    #[serde(default)]
    pub roots: Vec<String>,
}

fn current_client_id() -> String {
    if let Some(s) = LOGIN.lock().unwrap().as_ref() {
        return s.client_id.clone();
    }
    // Fallback stable id for non-login flows
    static FALLBACK: Lazy<String> = Lazy::new(|| uuid::Uuid::new_v4().to_string());
    FALLBACK.clone()
}

// Note: keep imports lean; unused imports trigger warnings in dev builds.

#[tauri::command]
pub async fn fetch_library_content(
    server: String,
    library_key: String,
    token: Option<String>,
 ) -> Result<serde_json::Value, String> {
    // Build a robust HTTP client similar to list_libraries
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(8))
        .http1_only() // PMS often speaks HTTP/1.1 on 32400
        .pool_max_idle_per_host(0)
        .danger_accept_invalid_certs(true)
        .user_agent(format!("Name-o-Tron-9000/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("http client error: {e:?}"))?;

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

    // Candidate URLs: combinations of base, leaf-or-all path, query paging, token in query, and optional type filter
    let mut urls: Vec<String> = Vec::new();
    let paging = "X-Plex-Container-Start=0&X-Plex-Container-Size=200"; // keep responses reasonable
    let type_opts = ["", "&type=1", "&type=2", "&type=4"]; // 1=movie, 2=show, 4=episode
    let paths = ["allLeaves", "all"]; // prefer leaves for TV to get episodes directly
    for b in &bases {
        for p in &paths {
            if let Some(t) = token.as_ref() {
                let tok = urlencoding::encode(t);
                for tparam in type_opts.iter() {
                    urls.push(format!("{}/library/sections/{}/{}?{}{}&X-Plex-Token={}", b, library_key, p, paging, tparam, tok));
                    urls.push(format!("{}/library/sections/{}/{}?X-Plex-Token={}{}", b, library_key, p, tok, tparam));
                }
            }
            for tparam in type_opts.iter() {
                urls.push(format!("{}/library/sections/{}/{}?{}{}", b, library_key, p, paging, tparam));
                urls.push(format!("{}/library/sections/{}/{}{}", b, library_key, p, tparam));
            }
        }
    }

    // Prepare common headers
    let client_id = current_client_id();

    // Try reqwest first across candidates
    let mut last_reqwest_err: Option<String> = None;
    let mut response_opt = None;
    for (i, url) in urls.iter().enumerate() {
        let mut req = with_plex_headers(client.get(url), &client_id)
            .header("Accept", "application/json, application/xml;q=0.9")
            .header("Accept-Encoding", "identity")
            .header("Connection", "close");
        if let Some(t) = token.as_ref() {
            req = req.header("X-Plex-Token", t);
        }
        println!("fetch_library_content: attempt {} → {}", i + 1, url);
        match req.send().await {
            Ok(resp) => { response_opt = Some(resp); break; }
            Err(e) => {
                let mut kind = "send error".to_string();
                if e.is_timeout() { kind = "timeout".into(); }
                else if e.is_connect() { kind = "connect".into(); }
                else if e.is_request() { kind = "request".into(); }
                println!("fetch_library_content: reqwest {} on {} → {}", kind, url, e);
                last_reqwest_err = Some(format!("{} @ {}", kind, url));
            }
        }
    }

    let response = match response_opt {
        Some(r) => r,
        None => {
            // Fallback to ureq (simple blocking client) for tricky servers
            println!("fetch_library_content: falling back to ureq");
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
                println!("fetch_library_content/ureq: attempt {} → {}", i + 1, url);
                match r.call() {
                    Ok(resp) => {
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
                    }
                    Err(e) => {
                        println!("fetch_library_content/ureq: error on {} → {}", url, e);
                    }
                }
            }
            return Err(format!(
                "fetch_library_content failed: {} | ureq fallback also failed",
                last_reqwest_err.unwrap_or_else(|| "unknown".into())
            ));
        }
    };

    let status = response.status();
    println!("fetch_library_content: response status {}", status);
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        println!("fetch_library_content: non-success {} body len {}", status, body.len());
        return Err(format!("HTTP {}: {}", status, body));
    }

    let text = response.text().await.map_err(|e| format!("read response error: {e}"))?;
    let trimmed = text.trim();
    // Prefer JSON if possible
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        match serde_json::from_str::<serde_json::Value>(trimmed) {
            Ok(v) => return Ok(v),
            Err(e) => println!("fetch_library_content: JSON parse error: {}", e),
        }
    }

    // Try minimal XML → JSON adapter for MediaContainer/Video/Part.file
    if trimmed.starts_with('<') {
        println!("fetch_library_content: attempting XML parse fallback");
        if let Some(json) = xml_media_to_json(&text) {
            println!("fetch_library_content: XML parsed into JSON-like value ({} items)", json["MediaContainer"]["Metadata"].as_array().map(|a| a.len()).unwrap_or(0));
            return Ok(json);
        } else {
            println!("fetch_library_content: XML parse fallback failed");
        }
    }

    // As last resort, return raw text
    Ok(serde_json::Value::String(text))
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
    for (i, url) in urls.iter().enumerate() {
        let mut req = with_plex_headers(client.get(url), client_id)
            .header("Accept", "application/json, application/xml;q=0.9")
            .header("Accept-Encoding", "identity")
            .header("Connection", "close");
        if let Some(t) = token { req = req.header("X-Plex-Token", t); }
        println!("http_get_with_variants: attempt {} → {}", i + 1, url);
        match req.send().await {
            Ok(r) => {
                println!("http_get_with_variants: success {} → {}", r.status(), url);
                return Ok(r)
            },
            Err(e) => {
                println!("http_get_with_variants: error on {} → {}", url, e);
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
        if let Some(q) = query.as_ref().filter(|s| !s.trim().is_empty()) {
            let qenc = urlencoding::encode(q.trim());
            if let Some(t) = token.as_ref() {
                let tok = urlencoding::encode(t);
                urls.push(format!("{}/library/sections/{}/search?type=2&query={}&{}&X-Plex-Token={}", b, library_key, qenc, paging, tok));
                urls.push(format!("{}/library/sections/{}/search?type=2&query={}&X-Plex-Token={}", b, library_key, qenc, tok));
            }
            urls.push(format!("{}/library/sections/{}/search?type=2&query={}&{}", b, library_key, qenc, paging));
            urls.push(format!("{}/library/sections/{}/search?type=2&query={}", b, library_key, qenc));
        } else {
            if let Some(t) = token.as_ref() {
                let tok = urlencoding::encode(t);
                urls.push(format!("{}/library/sections/{}/all?{}&type=2&X-Plex-Token={}", b, library_key, paging, tok));
                urls.push(format!("{}/library/sections/{}/all?type=2&X-Plex-Token={}", b, library_key, tok));
            }
            urls.push(format!("{}/library/sections/{}/all?{}&type=2", b, library_key, paging));
            urls.push(format!("{}/library/sections/{}/all?type=2", b, library_key));
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
        if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(trimmed) {
            // Normalize to MediaContainer.Directory array
            if let Some(mc) = v.get("MediaContainer").cloned() {
                let mut dirs: Vec<serde_json::Value> = Vec::new();
                if let Some(arr) = mc.get("Directory").and_then(|d| d.as_array()) {
                    dirs.extend(arr.iter().cloned());
                } else if let Some(obj) = mc.get("Directory").and_then(|d| d.as_object()) {
                    dirs.push(serde_json::Value::Object(obj.clone()));
                } else if let Some(arr) = mc.get("Metadata").and_then(|m| m.as_array()) {
                    for it in arr {
                        let title = it.get("title").cloned().unwrap_or(serde_json::Value::String(String::new()));
                        let rk = it.get("ratingKey").cloned();
                        let mut o = serde_json::json!({"title": title});
                        if let Some(r) = rk { o["ratingKey"] = r; }
                        dirs.push(o);
                    }
                }
                let out = serde_json::json!({"MediaContainer": {"Directory": dirs}});
                println!("fetch_tv_shows: normalized shows = {}", out["MediaContainer"]["Directory"].as_array().map(|a| a.len()).unwrap_or(0));
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
        .map_err(|e| format!("http client error: {e:?}"))?;

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
            Err(e) => { last_err = Some(format!("{e:?} @ {}", url)); }
        }
    }
    // If all HTTP attempts failed with reqwest, try a ureq fallback
    let response = match resp_opt {
        Some(resp) => resp,
        None => {
            if let Ok(out) = fetch_sections_with_ureq(&bases[0], &urls, token.as_deref(), &client_id) {
                return Ok(out);
            }
            return Err(format!(
                "libraries request error: {} | ureq fallback also failed",
                last_err.unwrap_or_else(|| "unknown".into())
            ));
        }
    };
    
    let status = response.status();
    let response_text = match response.text().await {
        Ok(text) => text,
        Err(e) => {
            let error = format!("Failed to read response text: {}", e);
            println!("{}", error);
            return Err(error);
        }
    };

    println!("Received response status: {}", status);
    
    if !status.is_success() {
        let error = format!("HTTP {}: {}", status, response_text);
        println!("Error response: {}", error);
        return Err(error);
    }

    // Try to parse as JSON first
    println!("Attempting to parse response as JSON...");
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&response_text) {
        println!("Successfully parsed JSON response");
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
                println!("Parsed {} libraries (JSON)", dirs.len());
                return Ok(dirs);
            } else {
                println!("No 'Directory' field found in MediaContainer");
            }
        } else {
            println!("No 'MediaContainer' field found in response");
        }
    } else {
        println!("Failed to parse response as JSON, trying XML...");
    }

    // Fallback to XML parsing
    println!("Attempting to parse response as XML...");
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
            Err(e) => {
                println!("XML parsing error: {}", e);
                break;
            },
            _ => {}
        }
        buf.clear();
    }
    
    if !out.is_empty() {
        println!("Successfully parsed {} libraries from XML", out.len());
        return Ok(out);
    }

    // If we get here, neither JSON nor XML parsing worked
    let error = format!("Failed to parse libraries from response. Response: {}", response_text);
    println!("{}", error);
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
