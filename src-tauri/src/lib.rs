// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Serialize;
use plex_api::{list_libraries, plex_login, plex_login_status, plex_logout};
mod path_map;
mod settings;
mod plex_api;

// Re-export functions used by frontend
pub use plex_api::fetch_library_content;
pub use plex_api::fetch_tv_shows;
pub use plex_api::fetch_show_episodes;

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
            path_map::test_mapping,
            settings::get_settings,
            settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
