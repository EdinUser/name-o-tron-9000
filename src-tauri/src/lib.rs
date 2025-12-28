// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Serialize;
use tauri::Emitter;
use plex_api::list_libraries;
mod plex_auth;
use plex_auth::{plex_login, plex_login_status, plex_logout};
use base64::{Engine as _, engine::general_purpose};
use std::fs;
use dirs;
pub mod path_map;
pub mod settings;
pub mod plex_api;
pub mod secure;
pub mod subtitle;
pub mod video_rename;
pub mod diagnostics;
pub mod logging;

// Re-export functions used by frontend
pub use plex_api::fetch_library_content;
pub use plex_api::fetch_tv_shows;
pub use plex_api::fetch_show_seasons;
pub use plex_api::fetch_show_episodes;
pub use plex_api::fetch_plex_metadata;
pub use plex_api::search_content;
pub use plex_api::sanitize_filename_cmd;
pub use plex_api::refresh_metadata_item;
pub use plex_api::refresh_library_section;
pub use path_map::test_mapping;
// video_rename module is already declared above

#[derive(Serialize)]
pub struct PlexServerDto {
    pub name: String,
    pub address: String,
    #[serde(rename = "machineIdentifier")]
    pub machine_identifier: Option<String>,
    pub owned: Option<bool>,
}

#[derive(Serialize, Clone)]
pub struct ScanResult {
    pub ip: String,
    pub address: String,
    pub reachable: bool,
    pub is_plex: bool,
    pub name: Option<String>,
    pub details: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct ScanProgress {
    pub run_id: Option<String>,
    pub result: ScanResult,
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

    // 3) Optional direct IP hints (e.g., 192.168.1.132) — only include when reachable
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

            let host_for_check = host
                .trim_start_matches("http://")
                .trim_start_matches("https://")
                .trim_end_matches('/')
                .split(':')
                .next()
                .unwrap_or(host);
            let reachable = is_reachable(host_for_check);
            if !reachable {
                continue;
            }
            servers.push(PlexServerDto {
                name: format!("Plex ({})", host_for_check),
                address: normalized,
                machine_identifier: None,
                owned: None,
            });
        }
    }

    // Dedup final
    servers.sort_by(|a, b| a.address.cmp(&b.address));
    servers.dedup_by(|a, b| a.address.eq(&b.address));
    servers
}

fn collect_gateway_hints(max: usize) -> Vec<String> {
    use local_ip_address::list_afinet_netifas;
    use std::collections::HashSet;
    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    if let Ok(list) = list_afinet_netifas() {
        for (_name, ip) in list {
            if let std::net::IpAddr::V4(v4) = ip {
                let octets = v4.octets();
                let is_private = octets[0] == 10
                    || octets[0] == 192 && octets[1] == 168
                    || octets[0] == 172 && (16..=31).contains(&octets[1]);
                if !is_private {
                    continue;
                }
                let base = (octets[0], octets[1], octets[2]);
                let self_host = octets[3];

                // Priority candidates: gateway-ish + self + near neighbors
                let mut priority: Vec<u8> = vec![
                    1,
                    2,
                    254,
                    self_host,
                    self_host.saturating_sub(1),
                    self_host.saturating_sub(2),
                    self_host.saturating_add(1),
                    self_host.saturating_add(2),
                ];
                priority.retain(|h| *h > 0 && *h < 255);
                priority.sort_unstable();
                priority.dedup();

                for host in priority {
                    let ip_str = format!("{}.{}.{}.{}", base.0, base.1, base.2, host);
                    if seen.insert(ip_str.clone()) {
                        out.push(ip_str);
                    }
                    if out.len() >= max { return out; }
                }

                // Fill remainder by sweeping the /24 to catch non-gateway hosts (e.g., 192.168.x.132)
                for host in 1u16..255 {
                    let h = host as u8;
                    let ip_str = format!("{}.{}.{}.{}", base.0, base.1, base.2, h);
                    if seen.insert(ip_str.clone()) {
                        out.push(ip_str);
                    }
                    if out.len() >= max { return out; }
                }
            }
        }
    }
    // Common fallbacks
    for ip in ["192.168.0.1", "192.168.1.1", "10.0.0.1"] {
        let s = ip.to_string();
        if seen.insert(s.clone()) {
            out.push(s);
        }
        if out.len() >= max { break; }
    }
    out.truncate(max);
    out
}

fn probe_identity(address: &str, timeout: std::time::Duration) -> (bool, Option<String>, Option<String>) {
    // returns (is_plex, name, details)
    let client = match reqwest::blocking::Client::builder()
        .timeout(timeout)
        .danger_accept_invalid_certs(true)
        .build()
    {
        Ok(c) => c,
        Err(e) => return (false, None, Some(format!("Client build failed: {e}"))),
    };

    let url = format!("{}/identity", address.trim_end_matches('/'));
    match client.get(&url).send() {
        Ok(resp) => {
            if !resp.status().is_success() {
                return (false, None, Some(format!("HTTP {}", resp.status())));
            }
            let headers = resp.headers().clone();
            let name = headers
                .get("X-Plex-Device-Name")
                .or_else(|| headers.get("X-Plex-Device"))
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            let text = resp.text().unwrap_or_default();
            let looks_like_plex = text.contains("MediaContainer")
                || text.contains("machineIdentifier")
                || headers.contains_key("X-Plex-Protocol");
            (looks_like_plex, name, None)
        }
        Err(e) => (false, None, Some(format!("Request failed: {e}"))),
    }
}

fn probe_host(ip: String, port: u16, timeout_ms: u64, include_https: bool) -> ScanResult {
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration;

    let timeout = Duration::from_millis(timeout_ms);
    let mut reachable = false;
    let mut details: Option<String> = None;
    let mut is_plex = false;
    let mut name: Option<String> = None;

    let addrs = format!("{}:{}", ip, port);
    let mut preferred_address = format!("http://{}", addrs);
    if let Ok(mut iter) = addrs.to_socket_addrs() {
        if let Some(sockaddr) = iter.next() {
            if TcpStream::connect_timeout(&sockaddr, timeout).is_ok() {
                reachable = true;
                let address_http = preferred_address.clone();
                let mut err: Option<String> = None;

                let (plex_http, found_name, err_http) = probe_identity(&address_http, timeout);
                is_plex = plex_http;
                name = found_name;
                if err_http.is_some() && !plex_http {
                    err = err_http;
                }

                if include_https && !is_plex {
                    let address_https = format!("https://{}", addrs);
                    let (plex_https, found_name_https, err_https) = probe_identity(&address_https, timeout);
                    if plex_https {
                        is_plex = true;
                        name = found_name_https.or(name);
                        preferred_address = address_https;
                        err = None;
                    } else if err_https.is_some() && !is_plex {
                        err = err_https;
                    }
                }

                if err.is_some() && !is_plex {
                    details = err;
                }
            }
        }
    }

    ScanResult {
        ip,
        address: preferred_address,
        reachable,
        is_plex,
        name,
        details,
    }
}

fn perform_scan(
    candidates: Vec<String>,
    timeout_ms: u64,
    include_https: bool,
    port: u16,
    emitter: Option<(&tauri::AppHandle, Option<String>)>,
) -> Vec<ScanResult> {
    use std::sync::{Arc, Mutex};
    let (tx, rx) = std::sync::mpsc::channel::<ScanResult>();
    let (work_tx, work_rx) = std::sync::mpsc::channel::<String>();

    let worker_count = std::cmp::min(std::cmp::max(1, candidates.len()), 64);
    let mut handles = Vec::with_capacity(worker_count);
    let shared_rx = Arc::new(Mutex::new(work_rx));

    for _ in 0..worker_count {
        let work_rx_clone = Arc::clone(&shared_rx);
        let tx_clone = tx.clone();
        let include_https = include_https;
        handles.push(std::thread::spawn(move || {
            loop {
                let ip_string = {
                    let guard = work_rx_clone.lock().unwrap();
                    match guard.recv() {
                        Ok(v) => v,
                        Err(_) => break,
                    }
                };
                let res = probe_host(ip_string, port, timeout_ms, include_https);
                let _ = tx_clone.send(res);
            }
        }));
    }


    for ip in candidates {
        let _ = work_tx.send(ip);
    }
    drop(work_tx);
    drop(tx);

    let mut results: Vec<ScanResult> = Vec::new();
    // Collect exactly the number of sent tasks to avoid hanging on channel close nuances.
    for res in rx {
        if let Some((app, run_id)) = emitter.as_ref() {
            let progress = ScanProgress { run_id: run_id.clone(), result: res.clone() };
            let _ = app.emit("scan_progress", progress);
        }
        results.push(res);
    }

    for h in handles {
        let _ = h.join();
    }

    // Dedup by IP (safety)
    results.sort_by(|a, b| a.ip.cmp(&b.ip));
    results.dedup_by(|a, b| a.ip == b.ip);
    results
}

#[tauri::command]
async fn plex_scan_subnet(
    app: tauri::AppHandle,
    timeout_ms: Option<u64>,
    max_hosts: Option<usize>,
    include_https: Option<bool>,
    run_id: Option<String>,
    hosts: Option<Vec<String>>,
    port: Option<u16>,
) -> Vec<ScanResult> {
    let timeout = timeout_ms.unwrap_or(250).clamp(50, 1500);
    let cap = max_hosts.unwrap_or(256).clamp(16, 512);
    let allow_https = include_https.unwrap_or(true);
    let port = port.unwrap_or(32400);
    let mut candidates = if let Some(list) = hosts {
        list.into_iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
    } else {
        collect_gateway_hints(cap)
    };
    candidates.truncate(cap);
    perform_scan(candidates, timeout, allow_https, port, Some((&app, run_id)))
}

// Helper for tests: deterministic scan without Tauri app handle
pub fn plex_scan_hosts_for_test(
    hosts: Vec<String>,
    timeout_ms: u64,
    include_https: bool,
    port: u16,
) -> Vec<ScanResult> {
    perform_scan(hosts, timeout_ms, include_https, port, None)
}

#[tauri::command]
async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    use std::fs;
    fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_plex_image(server_url: String, image_path: String, token: Option<String>) -> Result<String, String> {
    // Derive a stable cache filename:
    // Prefer: <host>_rk_<ratingKey>.jpg when image_path looks like /library/metadata/<rk>/thumb/...
    // Fallback (legacy): <server_url>_<image_path>.jpg with characters replaced.
    let host_part = {
        let mut s = server_url
            .trim_start_matches("http://")
            .trim_start_matches("https://")
            .split('/')
            .next()
            .unwrap_or("")
            .to_string();
        // strip port for brevity
        if let Some((h, _)) = s.split_once(':') { s = h.to_string(); }
        s.replace(|c: char| !c.is_ascii_alphanumeric(), "_")
    };

    let rating_key_opt = image_path
        .strip_prefix("/library/metadata/")
        .and_then(|s| s.split('/').next())
        .map(|s| s.to_string());

    let stable_key = match rating_key_opt.as_ref() {
        Some(rk) if !rk.is_empty() => format!("{}_rk_{}", host_part, rk),
        _ => format!(
            "{}_{}",
            server_url.replace(['/', ':', '.'], "_"),
            image_path.replace(['/', '.'], "_")
        ),
    };

    // Legacy key used previously (server_url + image_path). Keep for backward compatibility.
    let legacy_key = format!(
        "{}_{}",
        server_url.replace(['/', ':', '.'], "_"),
        image_path.replace(['/', '.'], "_")
    );

    let cache_dir = dirs::cache_dir()
        .map(|dir| dir.join("name-o-tron-9000").join("thumbnails"));

    // Check for an already cached file using either the new stable name or the legacy name
    if let Some(ref cache_dir) = cache_dir {
        let stable_file = cache_dir.join(format!("{}.jpg", &stable_key));
        let legacy_file = cache_dir.join(format!("{}.jpg", &legacy_key));

        // Prefer the stable file
        if stable_file.exists() {
            if let Ok(cached_data) = fs::read(&stable_file) {
                return Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&cached_data)));
            }
        }
        // Fallback to legacy file (and migrate to stable name for future hits)
        if legacy_file.exists() {
            if let Ok(cached_data) = fs::read(&legacy_file) {
                // Try to migrate to new filename; ignore errors
                if !stable_file.exists() {
                    let _ = std::fs::create_dir_all(cache_dir);
                    let _ = fs::write(&stable_file, &cached_data);
                }
                return Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&cached_data)));
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

    for base_url in attempts.iter() {
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

                    // Cache the image for future use (ensure directory exists). Use stable filename.
                    if let Some(ref cache_dir) = cache_dir {
                        let _ = std::fs::create_dir_all(cache_dir);
                        let cache_file = cache_dir.join(format!("{}.jpg", stable_key));
                        let _ = fs::write(&cache_file, &image_data);
                    }

                    return Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&image_data)));
                } else {
                    last_error = Some(format!("Image request failed with status: {}", response.status()));
                }
            }
            Err(e) => {
                last_error = Some(format!("Failed to fetch image: {}", e));
            }
        }
    }

    // If all attempts failed, return the last error
    Err(last_error.unwrap_or_else(|| "All image fetch attempts failed".to_string()))
}

#[tauri::command]
async fn plex_refresh_metadata_item(
    server: String,
    item_ids: String,
    token: Option<String>,
) -> Result<(), String> {
    refresh_metadata_item(server, item_ids, token).await
}

#[tauri::command]
async fn plex_refresh_library_section(
    server: String,
    section_id: i32,
    token: Option<String>,
) -> Result<(), String> {
    refresh_library_section(server, section_id, token).await
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
            plex_api::fetch_show_seasons,
            plex_api::fetch_show_episodes,
            plex_api::fetch_plex_metadata,
            plex_api::fetch_collections,
            plex_api::fetch_collection_items,
            plex_api::search_content,
            plex_api::sanitize_filename_cmd,
            fetch_plex_image,
            write_text_file,
            path_map::test_mapping,
            settings::get_settings,
            settings::save_settings,
            settings::load_show_mapping_cache,
            settings::save_show_mapping_cache,
            settings::invalidate_show_mapping_cache,
            settings::clear_all_show_mapping_caches,
            settings::get_cache_directory_path,
            settings::get_logs_directory_path,
            settings::generate_mappings_checksum_cmd,
            secure::secure_save_token,
            secure::secure_get_token,
            secure::secure_clear_token,
            subtitle::preview_renames,
            subtitle::apply_renames,
            subtitle::undo_last_rename,
            video_rename::preview_video_renames,
            video_rename::compute_movie_destinations,
            video_rename::apply_video_renames,
            video_rename::cleanup_empty_folders,
            diagnostics::export_diagnostic_bundle,
            diagnostics::export_diagnostic_bundle_zip,
            diagnostics::export_preview_snapshot,
            plex_refresh_metadata_item,
            plex_refresh_library_section,
            plex_scan_subnet,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
