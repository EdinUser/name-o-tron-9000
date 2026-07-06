use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameOperation {
    pub operation_type: String,
    pub original_path: String,
    pub new_path: String,
    pub backup_path: Option<String>,
    pub operation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewResult {
    pub video_operations: Vec<RenameOperation>,
    pub subtitle_operations: Vec<RenameOperation>,
    pub warnings: Vec<String>,
    pub blocking_errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyResult {
    pub success: bool,
    pub operations_applied: usize,
    pub operations_failed: usize,
    pub rollback_log_path: String,
    pub errors: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct PreviewRenamesRequest {
    pub library_id: String,
    pub scope: Vec<String>,
    pub settings: serde_json::Value,
    pub server_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ApplyRenamesRequest {
    pub operations: Vec<RenameOperation>,
    pub server_id: String,
    pub _settings: serde_json::Value,
}
