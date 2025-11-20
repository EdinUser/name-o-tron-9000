#[cfg(test)]
mod tests {
    use crate::path_map::{is_already_local_path, resolve_plex_path, PathMapping};

    fn sample_mapping() -> PathMapping {
        PathMapping {
            server_id: "http://192.168.1.132:32400".to_string(),
            plex_root: "/share/CACHEDEV1_DATA/Series".to_string(),
            local_root: "/mnt/Series".to_string(),
            platform: None,
        }
    }

    #[test]
    fn resolve_plex_path_maps_share_to_mnt() {
        let mappings = vec![sample_mapping()];
        let plex_path =
            "/share/CACHEDEV1_DATA/Series/Band Of Brothers/Band.of.Brothers.S01E10.mkv";

        let resolved = resolve_plex_path(plex_path, &mappings, "http://192.168.1.132:32400", None)
            .expect("expected path to resolve");

        assert_eq!(
            resolved.to_string_lossy(),
            "/mnt/Series/Band Of Brothers/Band.of.Brothers.S01E10.mkv"
        );
    }

    #[test]
    fn is_already_local_path_detects_local_paths() {
        let mappings = vec![sample_mapping()];
        let local_path =
            "/mnt/Series/Band Of Brothers/Band.of.Brothers.S01E10.1080p.BluRay.x265-RARBG.mkv";

        assert!(
            is_already_local_path(local_path, &mappings, "http://192.168.1.132:32400", None),
            "expected local path to be recognized as already mapped"
        );
    }
}

