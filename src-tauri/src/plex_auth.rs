use once_cell::sync::Lazy;
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
pub enum LoginStatus { Pending, Authorized, Error, Expired, Idle }

#[derive(Deserialize)]
struct PinCreateResp { id: i64, code: String, #[serde(default, rename = "expiresIn")] expires_in: i64 }

pub static LOGIN: Lazy<Mutex<Option<LoginState>>> = Lazy::new(|| Mutex::new(None));

fn with_plex_headers(builder: reqwest::RequestBuilder, client_id: &str) -> reqwest::RequestBuilder {
    builder
        .header("X-Plex-Client-Identifier", client_id)
        .header("X-Plex-Product", "Name-o-Tron 9000")
        .header("X-Plex-Version", env!("CARGO_PKG_VERSION"))
        .header("X-Plex-Device-Name", "Name-o-Tron 9000")
        .header("X-Plex-Device", std::env::consts::OS)
        .header("X-Plex-Platform", std::env::consts::OS)
        .header("Accept", "application/json")
}

async fn create_pin(client: &reqwest::Client, client_id: &str) -> Result<PinCreateResp, String> {
    let url = "https://plex.tv/api/v2/pins?strong=true";
    let resp = with_plex_headers(client.post(url), client_id).send().await.map_err(|e| format!("create pin error: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() { return Err(format!("create pin http {}: {}", status, text)); }
    serde_json::from_str(&text).map_err(|e| format!("create pin parse error: {e}"))
}

// Poll the PIN: returns (authToken, expired)
async fn poll_pin(client: &reqwest::Client, client_id: &str, pin_id: i64) -> Result<(Option<String>, bool), String> {
    let url = format!("https://plex.tv/api/v2/pins/{}", pin_id);
    let resp = with_plex_headers(client.get(&url), client_id).send().await.map_err(|e| format!("poll pin error: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if status.as_u16() == 404 { return Ok((None, true)); }
    if !status.is_success() { return Err(format!("poll pin http {}: {}", status, text)); }
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("poll pin parse error: {e}"))?;
    let token = v.get("authToken").and_then(|x| x.as_str()).or_else(|| v.get("auth_token").and_then(|x| x.as_str())).map(|s| s.to_string());
    Ok((token, false))
}

#[derive(Serialize)]
pub struct LoginStartResult { pub status: LoginStatus, pub code: String, pub client_id: String, pub auth_url: String }

#[tauri::command]
pub async fn plex_login(app: tauri::AppHandle) -> Result<LoginStartResult, String> {
    println!("Starting Plex login process...");
    if let Some(state) = LOGIN.lock().unwrap().as_ref() {
        if state.status == LoginStatus::Pending {
            return Ok(LoginStartResult {
                status: state.status,
                code: state.code.clone(),
                client_id: state.client_id.clone(),
                auth_url: format!(
                    "https://app.plex.tv/auth#?clientID={}&code={}",
                    urlencoding::encode(&state.client_id),
                    urlencoding::encode(&state.code)
                ),
            });
        }
    }
    let client_id = uuid::Uuid::new_v4().to_string();
    let client = reqwest::Client::builder().timeout(Duration::from_secs(30)).build().map_err(|e| format!("Failed to create HTTP client: {e}"))?;
    println!("Creating Plex PIN...");
    let pin = create_pin(&client, &client_id).await?;
    println!("Created PIN with ID: {}", pin.id);
    let auth_url = format!("https://app.plex.tv/auth#?clientID={}&code={}", urlencoding::encode(&client_id), urlencoding::encode(&pin.code));
    { *LOGIN.lock().unwrap() = Some(LoginState { client_id: client_id.clone(), pin_id: pin.id, code: pin.code.clone(), started_at: Instant::now(), expires_in: if pin.expires_in > 0 { pin.expires_in } else { 120 }, token: None, status: LoginStatus::Pending }); }
    println!("Auth URL: {}", auth_url);
    println!("Saving login state...");
    println!("Opening browser for authentication...");
    app.opener().open_url(auth_url.clone(), Option::<String>::None).map_err(|e| format!("Failed to open browser: {e}"))?;
    let poll_client_id = client_id.clone();
    let poll_pin_id = pin.id;
    tokio::spawn(async move {
        println!("Starting background poller for PIN {}...", poll_pin_id);
        let poll_client = match reqwest::Client::builder().timeout(Duration::from_secs(30)).build() { Ok(c) => c, Err(e) => { println!("Failed to create poll client: {}", e); return; } };
        let deadline = Instant::now() + Duration::from_secs(300);
        let mut status = LoginStatus::Pending; let mut token: Option<String> = None; let mut poll_count = 0;
        while Instant::now() < deadline && status == LoginStatus::Pending {
            tokio::time::sleep(Duration::from_secs(1)).await; poll_count += 1;
            println!("Polling attempt {} for PIN {}...", poll_count, poll_pin_id);
            match poll_pin(&poll_client, &poll_client_id, poll_pin_id).await {
                Ok((maybe_token, expired)) => {
                    println!("Poll response {}: expired={}, has_token={}", poll_count, expired, maybe_token.is_some());
                    if expired { status = LoginStatus::Expired; break; }
                    if let Some(t) = maybe_token { token = Some(t); status = LoginStatus::Authorized; break; }
                }
                Err(e) => { println!("Poll error {}: {}", poll_count, e); tokio::time::sleep(Duration::from_secs(2)).await; }
            }
        }
        if status == LoginStatus::Pending { status = LoginStatus::Expired; }
        if let Some(login) = LOGIN.lock().unwrap().as_mut() { login.status = status; login.token = token.clone(); println!("Updated login state: status={:?}, has_token={}, poll_count={}", status, token.is_some(), poll_count); }
    });
    Ok(LoginStartResult { status: LoginStatus::Pending, code: pin.code, client_id, auth_url })
}

#[derive(Serialize)]
pub struct LoginStatusResult { pub status: LoginStatus, pub token: Option<String> }

#[tauri::command]
pub fn plex_login_status() -> Result<LoginStatusResult, String> {
    println!("Checking login status...");
    let guard = LOGIN.lock().map_err(|e| e.to_string())?;
    if let Some(state) = &*guard { println!("Current login status: {:?}, has_token: {}", state.status, state.token.is_some()); Ok(LoginStatusResult { status: state.status, token: state.token.clone() }) }
    else { println!("No active login session found"); Ok(LoginStatusResult { status: LoginStatus::Idle, token: None }) }
}

#[tauri::command]
pub fn plex_logout() -> Result<(), String> {
    let mut guard = LOGIN.lock().unwrap();
    if let Some(state) = guard.as_mut() { state.token = None; state.status = LoginStatus::Idle; }
    else { *guard = Some(LoginState { client_id: uuid::Uuid::new_v4().to_string(), pin_id: 0, code: String::new(), started_at: Instant::now(), expires_in: 0, token: None, status: LoginStatus::Idle }); }
    Ok(())
}

