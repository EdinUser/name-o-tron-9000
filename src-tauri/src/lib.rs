// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Serialize;
use plex_api::{list_libraries, plex_login, plex_login_status, plex_logout};
use base64::{Engine as _, engine::general_purpose};
use std::fs;
use dirs;
mod path_map;
mod settings;
mod plex_api;
mod secure;
mod subtitle;

// Re-export functions used by frontend
pub use plex_api::fetch_library_content;
pub use plex_api::fetch_tv_shows;
pub use plex_api::fetch_show_episodes;
pub use plex_api::search_content;
pub use plex_api::sanitize_filename_cmd;

#[derive(Serialize)]
pub struct PlexServerDto {
    pub name: String,
    pub address: String,
    #[serde(rename = "machineIdentifier")]
    pub machine_identifier: Option<String>,
    pub owned: Option<bool>,
}

#[tauri::command]
fn plex_discover(hints: Option<Vec<String>>) -> Vec<PlexServerDto> {
    // Realistic discovery with safe timeouts:
    // 1) SSDP multicast M-SEARCH for Plex devices
    // 2) Quick localhost probe as fallback
    let mut servers = Vec::new();

    // SSDP discovery (Plex announces urn:plex-media-server:device:1)
    fn ssdp_discover() -> Vec<PlexServerDto> {
        use std::net::UdpSocket;
        use std::time::{Duration, Instant};

        // Build M-SEARCH request
        let msg = [
            "M-SEARCH * HTTP/1.1",
            "HOST: 239.255.255.250:1900",
            "MAN: \"ssdp:discover\"",
            "MX: 1",
            "ST: urn:plex-media-server:device:1",
            "",
            "",
        ]
        .join("\r\n");

        let socket = match UdpSocket::bind(("0.0.0.0", 0)) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };

        // Short timeouts to keep UI snappy
        let _ = socket.set_read_timeout(Some(Duration::from_millis(1200)));
        let _ = socket.set_nonblocking(false);

        // Send query to SSDP multicast
        let _ = socket.send_to(msg.as_bytes(), ("239.255.255.250", 1900));

        let mut buf = [0u8; 2048];
        let deadline = Instant::now() + Duration::from_millis(1100);
        let mut out = Vec::new();

        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            if socket.set_read_timeout(Some(remaining)).is_err() {
                break;
            }
            match socket.recv_from(&mut buf) {
                Ok((n, _src)) => {
                    let text = String::from_utf8_lossy(&buf[..n]);
                    // Very lenient header parsing
                    let mut location: Option<String> = None;
                    let mut name: Option<String> = None;
                    let mut machine_id: Option<String> = None;
                    for line in text.lines() {
                        let lower = line.to_ascii_lowercase();
                        if lower.starts_with("location:") {
                            location = Some(line.splitn(2, ':').nth(1).unwrap_or("").trim().to_string());
                        } else if lower.starts_with("x-plex-machine-identifier:") {
                            machine_id = Some(line.splitn(2, ':').nth(1).unwrap_or("").trim().to_string());
                        } else if lower.starts_with("x-plex-name:") || lower.starts_with("friendlyname:") {
                            name = Some(line.splitn(2, ':').nth(1).unwrap_or("").trim().to_string());
                        }
                    }

                    if let Some(loc) = location {
                        // Expect http://HOST:32400 in LOCATION; Normalize name
                        let addr = loc.trim_end_matches('/').to_string();
                        let display = name
                            .filter(|s| !s.is_empty())
                            .unwrap_or_else(|| "Plex Media Server".to_string());
                        out.push(PlexServerDto {
                            name: display,
                            address: addr,
                            machine_identifier: machine_id,
                            owned: None,
                        });
                    }
                }
                Err(_) => break,
            }
        }

        // Dedup by address
        out.sort_by(|a, b| a.address.cmp(&b.address));
        out.dedup_by(|a, b| a.address.eq(&b.address));
        out
    }

    fn is_reachable(addr: &str) -> bool {
        use std::net::{TcpStream, ToSocketAddrs};
        use std::time::Duration;
        let timeout = Duration::from_millis(250);
        let addrs = format!("{}:32400", addr);
        if let Ok(mut iter) = addrs.to_socket_addrs() {
            if let Some(sockaddr) = iter.next() {
                return TcpStream::connect_timeout(&sockaddr, timeout).is_ok();
            }
        }
        false
    }

    // 1) SSDP scan
    servers.extend(ssdp_discover());

    // 2) localhost quick check
    if is_reachable("127.0.0.1") || is_reachable("localhost") {
        servers.push(PlexServerDto {
            name: "Local Plex".to_string(),
            address: "http://localhost:32400".to_string(),
            machine_identifier: None,
            owned: Some(true),
        });
    }

    // 3) Optional direct IP hints (e.g., 192.168.1.132)
    if let Some(list) = hints {
        for h in list {
            let host = h.trim();
            if host.is_empty() { continue; }
            // Allow full URLs or bare hosts
            let normalized = if host.starts_with("http://") || host.starts_with("https://") {
                host.to_string()
            } else {
                format!("http://{}:32400", host)
            };

            // Use reachability check on host part. Even if unreachable now, include as a candidate
            // so the user can still proceed (network flakiness/SSDP issues). UI can validate later.
            let host_for_check = host
                .trim_start_matches("http://")
                .trim_start_matches("https://")
                .trim_end_matches('/')
                .split(':')
                .next()
                .unwrap_or(host);
            let reachable = is_reachable(host_for_check);
            servers.push(PlexServerDto {
                name: format!("Plex ({})", host_for_check),
                address: normalized,
                machine_identifier: None,
                owned: None,
            });
            if !reachable {
                // keep, but don't add duplicates; the subsequent dedup will handle it
            }
        }
    }

    // Dedup final
    servers.sort_by(|a, b| a.address.cmp(&b.address));
    servers.dedup_by(|a, b| a.address.eq(&b.address));
    servers
}

#[tauri::command]
async fn fetch_plex_image(server_url: String, image_path: String, token: Option<String>) -> Result<String, String> {
    // Create a cache key from the server URL and image path
    let cache_key = format!("{}_{}", server_url.replace(['/', ':', '.'], "_"), image_path.replace(['/', '.'], "_"));
    let cache_dir = dirs::cache_dir()
        .map(|dir| dir.join("name-o-tron-9000").join("thumbnails"));

    // Check if we have a cached version first (if cache dir exists)
    if let Some(ref cache_dir) = cache_dir {
        let cache_file = cache_dir.join(format!("{}.jpg", cache_key));
        if cache_file.exists() {
            match fs::read(&cache_file) {
                Ok(cached_data) => {
                    return Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&cached_data)));
                }
                Err(e) => {
                    eprintln!("Failed to read cached image: {}", e);
                }
            }
        }
    }

    // Try to fetch from Plex server (accept self-signed certs as Plex local certs may be custom)
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    // For Plex metadata thumb URLs, try multiple approaches
    let mut attempts = Vec::new();

    if image_path.starts_with("/library/metadata/") && image_path.contains("/thumb/") {
        // This is a Plex metadata thumb URL - try multiple approaches and protocol variants
        let mut bases: Vec<String> = vec![server_url.clone()];
        if server_url.starts_with("http://") {
            bases.push(server_url.replacen("http://", "https://", 1));
        } else if server_url.starts_with("https://") {
            bases.push(server_url.replacen("https://", "http://", 1));
        }

        for base in bases.clone() {
            // Direct URL access (token will be appended later)
            attempts.push(format!("{}/{}", base.trim_end_matches('/'), image_path.trim_start_matches('/')));

            // Transcoder URL - include token inside nested url param per OpenAPI docs
            if let Some(rating_key) = image_path.strip_prefix("/library/metadata/").and_then(|s| s.split('/').next()) {
                // Build nested URL with token (e.g., /library/metadata/1234/thumb/0?X-Plex-Token=...)
                let nested = if let Some(ref token) = token { format!("/library/metadata/{}/thumb/0?X-Plex-Token={}", rating_key, token) } else { format!("/library/metadata/{}/thumb/0", rating_key) };
                let nested_enc = urlencoding::encode(&nested);
                attempts.push(format!("{}/photo/:/transcode?width=300&height=450&url={}", base.trim_end_matches('/'), nested_enc));
            }
        }
    } else {
        // For other image paths, use direct approach
        let mut bases: Vec<String> = vec![server_url.clone()];
        if server_url.starts_with("http://") {
            bases.push(server_url.replacen("http://", "https://", 1));
        } else if server_url.starts_with("https://") {
            bases.push(server_url.replacen("https://", "http://", 1));
        }
        for base in bases {
            attempts.push(format!("{}/{}", base.trim_end_matches('/'), image_path.trim_start_matches('/')));
        }
    }

    // Clone the token so we can use it multiple times
    let auth_token = token.as_ref().map(|t| t.as_str());

    let mut last_error = None;

    for (i, base_url) in attempts.iter().enumerate() {
        // Append token as query param as some PMS builds require it even if header is present
        let url_with_token = if let Some(token_str) = auth_token {
            if base_url.contains('?') {
                format!("{}&X-Plex-Token={}", base_url, token_str)
            } else {
                format!("{}?X-Plex-Token={}", base_url, token_str)
            }
        } else {
            base_url.clone()
        };

        println!("Trying image URL {}: {}", i + 1, url_with_token);

        let mut request = client.get(&url_with_token);

        // Add Plex-specific headers
        request = request
            .header("X-Plex-Client-Identifier", "Name-o-tron-9000")
            .header("X-Plex-Product", "Name-o-tron 9000")
            .header("X-Plex-Version", "1.0.0")
            .header("X-Plex-Device-Name", "Name-o-tron 9000")
            .header("X-Plex-Device", "Name-o-tron 9000")
            .header("X-Plex-Platform", std::env::consts::OS)
            .header("X-Plex-Platform-Version", "1.0.0")
            .header("Accept", "image/*");

        if let Some(token_str) = auth_token {
            request = request.header("X-Plex-Token", token_str);
        }

        match request.send().await {
            Ok(response) => {
                if response.status().is_success() {
                    let image_data = response.bytes().await.map_err(|e| format!("Failed to read image data: {}", e))?;

                    // Cache the image for future use (if cache dir exists)
                    if let Some(ref cache_dir) = cache_dir {
                        let cache_file = cache_dir.join(format!("{}.jpg", cache_key));
                        if let Err(e) = fs::write(&cache_file, &image_data) {
                            eprintln!("Failed to cache image: {}", e);
                        }
                    }

                    return Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&image_data)));
                } else {
                    last_error = Some(format!("Image request failed with status: {}", response.status()));
                    println!("Attempt {} failed: {}", i + 1, response.status());
                }
            }
            Err(e) => {
                last_error = Some(format!("Failed to fetch image: {}", e));
                println!("Attempt {} error: {}", i + 1, e);
            }
        }
    }

    // If all attempts failed, return the last error
    Err(last_error.unwrap_or_else(|| "All image fetch attempts failed".to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            plex_discover,
            plex_login,
            plex_login_status,
            plex_logout,
            list_libraries,
            plex_api::fetch_library_content,
            plex_api::fetch_tv_shows,
            plex_api::fetch_show_episodes,
            plex_api::fetch_collections,
            plex_api::fetch_collection_items,
            plex_api::search_content,
            plex_api::sanitize_filename_cmd,
            fetch_plex_image,
            path_map::test_mapping,
            settings::get_settings,
            settings::save_settings,
            secure::secure_save_token,
            secure::secure_get_token,
            secure::secure_clear_token,
            subtitle::preview_renames,
            subtitle::apply_renames,
            subtitle::undo_last_rename,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
