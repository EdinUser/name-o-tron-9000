use keyring::Entry;

const SERVICE: &str = "name-o-tron-9000";
const USERNAME: &str = "plex-token";

#[tauri::command]
pub fn secure_save_token(token: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, USERNAME).map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secure_get_token() -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, USERNAME).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secure_clear_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE, USERNAME).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

