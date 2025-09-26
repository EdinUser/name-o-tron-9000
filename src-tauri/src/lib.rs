// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Serialize;

#[derive(Serialize)]
pub struct PlexServerDto {
    pub name: String,
    pub address: String,
    #[serde(rename = "machineIdentifier")]
    pub machine_identifier: Option<String>,
    pub owned: Option<bool>,
}

#[tauri::command]
fn plex_discover() -> Vec<PlexServerDto> {
    // Minimal, safe discovery:
    // 1) Always include localhost default Plex if reachable
    // 2) Optionally probe common LAN hostname `plex.home` quickly (non-blocking best-effort)
    let mut servers: Vec<PlexServerDto> = Vec::new();

    // Helper to check reachability by a short TCP connect to port 32400
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

    // localhost
    if is_reachable("127.0.0.1") || is_reachable("localhost") {
        servers.push(PlexServerDto {
            name: "Local Plex".to_string(),
            address: "http://localhost:32400".to_string(),
            machine_identifier: None,
            owned: Some(true),
        });
    }

    // Optional mDNS/hostname guess (very conservative)
    if is_reachable("plex") || is_reachable("plex.home") {
        servers.push(PlexServerDto {
            name: "Plex (LAN)".to_string(),
            address: "http://plex:32400".to_string(),
            machine_identifier: None,
            owned: None,
        });
    }

    servers
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![plex_discover])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
