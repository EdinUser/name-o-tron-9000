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

    #[test]
    fn resolve_plex_path_matches_host_only_server_ids() {
        let mappings = vec![sample_mapping()];
        let plex_path = "/share/CACHEDEV1_DATA/Series/Show/E01.mkv";

        // Use host-only server_id (no scheme / port) and ensure mapping still applies
        let resolved = resolve_plex_path(plex_path, &mappings, "192.168.1.132", None)
            .expect("expected host-only server_id to match mapping");

        assert_eq!(
            resolved.to_string_lossy(),
            "/mnt/Series/Show/E01.mkv"
        );
    }

    #[test]
    fn resolve_plex_path_is_case_insensitive_on_windows_platform() {
        let mappings = vec![PathMapping {
            server_id: "server1".to_string(),
            plex_root: "D:/Media/TV".to_string(),
            local_root: "/mnt/tv".to_string(),
            platform: Some("windows".to_string()),
        }];

        // Mixed-case Plex path should still resolve under Windows semantics
        let plex_path = "d:/media/tv/Show/EP01.mkv";

        let resolved = resolve_plex_path(plex_path, &mappings, "server1", Some("windows"))
            .expect("expected Windows-style mapping to resolve case-insensitively");

        assert_eq!(
            resolved.to_string_lossy(),
            "/mnt/tv/Show/EP01.mkv"
        );
    }
}
