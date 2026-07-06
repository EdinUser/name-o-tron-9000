#[cfg(test)]
mod tests {
    use crate::path_map::{
        extract_library_root_from_path, is_already_local_path, mappings_for_server,
        path_mappings_from_settings, resolve_apply_path_allow_local,
        resolve_apply_path_allow_local_or_relative, resolve_apply_path_strict, resolve_plex_path,
        PathMapping,
    };
    use std::path::Path;

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

    #[test]
    fn path_mappings_from_settings_parses_complete_entries() {
        let settings = serde_json::json!({
            "pathMappings": [
                {
                    "server_id": "http://192.168.1.132:32400",
                    "plex_root": "/share/CACHEDEV1_DATA/Series",
                    "local_root": "/mnt/Series",
                    "platform": "linux"
                },
                {
                    "server_id": "missing-fields"
                }
            ]
        });

        let mappings = path_mappings_from_settings(&settings);

        assert_eq!(mappings.len(), 1);
        assert_eq!(mappings[0].server_id, "http://192.168.1.132:32400");
        assert_eq!(mappings[0].plex_root, "/share/CACHEDEV1_DATA/Series");
        assert_eq!(mappings[0].local_root, "/mnt/Series");
        assert_eq!(mappings[0].platform.as_deref(), Some("linux"));
    }

    #[test]
    fn mappings_for_server_matches_by_hostname() {
        let settings = serde_json::json!({
            "pathMappings": [
                {
                    "server_id": "http://192.168.1.132:32400",
                    "plex_root": "/share/CACHEDEV1_DATA/Series",
                    "local_root": "/mnt/Series",
                    "platform": "linux"
                },
                {
                    "server_id": "http://other-host:32400",
                    "plex_root": "/share/Other",
                    "local_root": "/mnt/Other",
                    "platform": "linux"
                }
            ]
        });

        let mappings = mappings_for_server(&settings, "192.168.1.132");

        assert_eq!(mappings.len(), 1);
        assert_eq!(mappings[0].local_root, "/mnt/Series");
    }

    #[test]
    fn resolve_apply_path_strict_requires_mapped_plex_path() {
        let mappings = vec![sample_mapping()];

        let resolved = resolve_apply_path_strict(
            "/share/CACHEDEV1_DATA/Series/Show/E01.mkv",
            &mappings,
            "192.168.1.132",
        )
        .expect("plex path should resolve");

        assert_eq!(resolved.to_string_lossy(), "/mnt/Series/Show/E01.mkv");
        assert!(
            resolve_apply_path_strict("/mnt/Series/Show/E01.mkv", &mappings, "192.168.1.132")
                .is_none(),
            "strict mode should not accept already-local paths"
        );
    }

    #[test]
    fn resolve_apply_path_allow_local_accepts_local_paths() {
        let mappings = vec![sample_mapping()];

        let resolved = resolve_apply_path_allow_local(
            "/mnt/Series/Show/E01.mkv",
            &mappings,
            "http://192.168.1.132:32400",
        )
        .expect("already-local path should be accepted");

        assert_eq!(resolved.to_string_lossy(), "/mnt/Series/Show/E01.mkv");
    }

    #[test]
    fn resolve_apply_path_allow_local_or_relative_uses_library_root() {
        let mappings = vec![sample_mapping()];
        let resolved_original = Path::new("/mnt/Series/Show/Old.mkv");

        let library_root = extract_library_root_from_path(resolved_original, &mappings)
            .expect("library root");
        assert_eq!(library_root.to_string_lossy(), "/mnt/Series");

        let resolved = resolve_apply_path_allow_local_or_relative(
            "Grouped/New.mkv",
            &mappings,
            "http://192.168.1.132:32400",
            resolved_original,
        )
        .expect("relative target should resolve under library root");

        assert_eq!(resolved.to_string_lossy(), "/mnt/Series/Grouped/New.mkv");
    }
}
