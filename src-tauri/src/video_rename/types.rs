use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovieItem {
    pub rating_key: String,
    pub title: String,
    pub year: Option<i32>,
    pub file: String,
    pub genre: Vec<String>,
    pub collection: Option<String>,
    pub edition_title: Option<String>,
    pub guids: Vec<String>,
    pub imdb_id: Option<String>,
    pub tmdb_id: Option<String>,
    pub tvdb_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodeItem {
    pub rating_key: String,
    pub title: String,
    pub year: Option<i32>,
    pub file: String,
    pub genre: Vec<String>,
    pub guids: Vec<String>,
    pub imdb_id: Option<String>,
    pub tmdb_id: Option<String>,
    pub tvdb_id: Option<String>,
    pub grandparent_title: String,
    pub parent_title: String,
    pub parent_index: i32,
    pub index: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MusicItem {
    pub rating_key: String,
    pub title: String,
    pub year: Option<i32>,
    pub file: String,
    pub genre: Vec<String>,
    pub guids: Vec<String>,
    pub imdb_id: Option<String>,
    pub tmdb_id: Option<String>,
    pub tvdb_id: Option<String>,
    pub grandparent_title: String,
    pub parent_title: String,
    pub parent_index: i32,
    pub index: i32,
}

#[derive(Debug, Deserialize)]
pub struct CleanupEmptyFoldersRequest {
    pub server_id: String,
    pub original_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct CleanupEmptyFoldersResult {
    pub removed_directories: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MovieDestinationItem {
    pub rating_key: String,
    pub original_path: String,
    pub base_name: String,
    pub title: String,
    pub year: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MovieDestinationRequest {
    pub settings: serde_json::Value,
    pub library_roots: Vec<String>,
    pub items: Vec<MovieDestinationItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MovieDestinationResponseItem {
    pub rating_key: String,
    pub proposed: String,
}
