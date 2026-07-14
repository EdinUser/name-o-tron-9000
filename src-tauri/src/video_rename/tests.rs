use super::*;
use serde_json::json;
use std::path::Path;

#[test]
fn highlight_non_latin_respects_setting() {
    let settings_with_highlight = json!({
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": true
            }
        }
    });

    let path = "映画.mkv";
    let (_sanitized, warnings, blocking_errors) =
        sanitize_and_validate_path(path, &settings_with_highlight);

    assert!(blocking_errors.is_empty());
    assert!(warnings.iter().any(|w| w.contains("Non-Latin characters")));

    let settings_without_highlight = json!({
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let (_sanitized2, warnings2, blocking_errors2) =
        sanitize_and_validate_path(path, &settings_without_highlight);

    assert!(blocking_errors2.is_empty());
    assert!(warnings2
        .iter()
        .all(|w| !w.contains("Non-Latin characters")));
}

#[test]
fn path_length_checks_respect_safety_setting() {
    let long_name: String = std::iter::repeat('A').take(260).collect();
    let long_path = format!("{}.mkv", long_name);

    let settings_with_checks = json!({
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": false,
                "permissionsCheck": false
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let (_sanitized, _warnings, blocking_errors) =
        sanitize_and_validate_path(&long_path, &settings_with_checks);

    assert!(blocking_errors.iter().any(|w| w.contains("Path too long")));

    let settings_without_checks = json!({
        "general": {
            "safety": {
                "pathLengthCheck": false,
                "reservedNamesCheck": false,
                "permissionsCheck": false
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let (_sanitized2, _warnings2, blocking_errors2) =
        sanitize_and_validate_path(&long_path, &settings_without_checks);

    assert!(blocking_errors2
        .iter()
        .all(|w| !w.contains("Path too long")));
}

#[test]
fn episode_specials_folder_respects_detect_ovas_setting() {
    let episode = EpisodeItem {
        rating_key: "rk1".to_string(),
        title: "Pilot".to_string(),
        year: Some(2020),
        file: "Show.S00E01.mkv".to_string(),
        genre: vec![],
        guids: vec![],
        imdb_id: None,
        tmdb_id: None,
        tvdb_id: None,
        grandparent_title: "Show".to_string(),
        parent_title: "Season 00".to_string(),
        parent_index: 0,
        index: 1,
    };

    let settings_with_specials = json!({
        "tv": {
            "detectOVAsSeason00": true,
            "normalizeMultiEpisode": true,
            "seasonFolders": true
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let op_specials = compute_episode_proposal(
        &episode,
        "{grandparentTitle} - S{parentIndex:02}E{index:02}{ext}",
        &settings_with_specials,
    )
    .expect("episode proposal with Specials");

    assert!(op_specials.new_path.starts_with("Specials/"));

    let settings_without_specials = json!({
        "tv": {
            "detectOVAsSeason00": false,
            "normalizeMultiEpisode": true,
            "seasonFolders": true
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let op_season00 = compute_episode_proposal(
        &episode,
        "{grandparentTitle} - S{parentIndex:02}E{index:02}{ext}",
        &settings_without_specials,
    )
    .expect("episode proposal with Season 00");

    assert!(op_season00.new_path.starts_with("Season 00/"));
}

#[test]
fn episode_multi_episode_normalization_respects_setting() {
    let episode = EpisodeItem {
        rating_key: "rk2".to_string(),
        title: "Double Episode".to_string(),
        year: Some(2020),
        file: "Show.S01E01E02.mkv".to_string(),
        genre: vec![],
        guids: vec![],
        imdb_id: None,
        tmdb_id: None,
        tvdb_id: None,
        grandparent_title: "Show".to_string(),
        parent_title: "Season 01".to_string(),
        parent_index: 1,
        index: 1,
    };

    let base_settings = json!({
        "tv": {
            "detectOVAsSeason00": true,
            "seasonFolders": true
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let mut settings_with_norm = base_settings.clone();
    settings_with_norm["tv"]["normalizeMultiEpisode"] = json!(true);

    let op_norm = compute_episode_proposal(
        &episode,
        "{grandparentTitle} - S{parentIndex:02}E{index:02} - {title}{ext}",
        &settings_with_norm,
    )
    .expect("episode proposal with multi-episode normalization");

    let name_norm = basename(&op_norm.new_path);
    assert!(name_norm.contains("S01E01-E02 - Double Episode"));

    let mut settings_without_norm = base_settings.clone();
    settings_without_norm["tv"]["normalizeMultiEpisode"] = json!(false);

    let op_no_norm = compute_episode_proposal(
        &episode,
        "{grandparentTitle} - S{parentIndex:02}E{index:02} - {title}{ext}",
        &settings_without_norm,
    )
    .expect("episode proposal without multi-episode normalization");

    let name_no_norm = basename(&op_no_norm.new_path);
    assert!(!name_no_norm.contains("E01-E02"));
}

#[test]
fn episode_split_part_suffix_is_preserved() {
    let episode = EpisodeItem {
        rating_key: "rk3".to_string(),
        title: "A Hard Day's Night".to_string(),
        year: Some(2005),
        file: "Grey's Anatomy - S01E01 - pt1.mkv".to_string(),
        genre: vec![],
        guids: vec![],
        imdb_id: None,
        tmdb_id: None,
        tvdb_id: None,
        grandparent_title: "Grey's Anatomy".to_string(),
        parent_title: "Season 01".to_string(),
        parent_index: 1,
        index: 1,
    };

    let settings = json!({
        "tv": {
            "detectOVAsSeason00": true,
            "normalizeMultiEpisode": true,
            "seasonFolders": true
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let op = compute_episode_proposal(
        &episode,
        "{grandparentTitle} - S{parentIndex:02}E{index:02} - {title}{ext}",
        &settings,
    )
    .expect("episode proposal with split part suffix");

    let name = basename(&op.new_path);
    assert!(name.contains("S01E01 - A Hard Day's Night - pt1"));
}

#[test]
fn movie_own_folder_setting_changes_output_path() {
    let movie = MovieItem {
        rating_key: "m1".to_string(),
        title: "Inception".to_string(),
        year: Some(2010),
        file: "Inception (2010).mkv".to_string(),
        genre: vec![],
        collection: None,
        edition_title: None,
        guids: vec![],
        imdb_id: None,
        tmdb_id: None,
        tvdb_id: None,
    };

    let base_settings = json!({
        "movies": {
            "folderStructure": "none"
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let mut with_folder = base_settings.clone();
    with_folder["movies"]["ownFolderPerMovie"] = json!(true);

    let op_with_folder = compute_movie_proposal(&movie, "{title}{ext}", &with_folder, None)
        .expect("movie proposal with own folder");

    assert!(op_with_folder.new_path.starts_with("Inception/"));

    let mut without_folder = base_settings.clone();
    without_folder["movies"]["ownFolderPerMovie"] = json!(false);

    let op_without_folder = compute_movie_proposal(&movie, "{title}{ext}", &without_folder, None)
        .expect("movie proposal without own folder");

    assert_eq!(op_without_folder.new_path, "Inception.mkv");
}

#[test]
fn movie_collections_setting_adds_collection_folder() {
    let movie = MovieItem {
        rating_key: "m2".to_string(),
        title: "Inception".to_string(),
        year: Some(2010),
        file: "Inception (2010).mkv".to_string(),
        genre: vec![],
        collection: Some("Nolan Collection".to_string()),
        edition_title: None,
        guids: vec![],
        imdb_id: None,
        tmdb_id: None,
        tvdb_id: None,
    };

    let settings = json!({
        "movies": {
            "collections": {
                "enabled": true,
                "mode": "always",
                "format": "{collection}"
            },
            "folderStructure": "none",
            "ownFolderPerMovie": false
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let op = compute_movie_proposal(&movie, "{title}{ext}", &settings, None)
        .expect("movie proposal with collection folder");

    assert!(op.new_path.starts_with("Nolan Collection/"));
    assert!(op.new_path.contains("Inception"));
}

#[test]
fn movie_collections_if2plus_currently_excludes_collection_folder() {
    let movie = MovieItem {
        rating_key: "m3".to_string(),
        title: "Inception".to_string(),
        year: Some(2010),
        file: "Inception (2010).mkv".to_string(),
        genre: vec![],
        collection: Some("Nolan Collection".to_string()),
        edition_title: None,
        guids: vec![],
        imdb_id: None,
        tmdb_id: None,
        tvdb_id: None,
    };

    let settings = json!({
        "movies": {
            "collections": {
                "enabled": true,
                "mode": "if2plus",
                "format": "{collection}"
            },
            "folderStructure": "none",
            "ownFolderPerMovie": false
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let op = compute_movie_proposal(&movie, "{title}{ext}", &settings, None)
        .expect("movie proposal without collection folder for if2plus mode");

    assert!(!op.new_path.starts_with("Nolan Collection/"));
}

#[test]
fn movie_folder_structure_alpha_groups_by_initial_letter() {
    let movie = MovieItem {
        rating_key: "m4".to_string(),
        title: "Avatar".to_string(),
        year: Some(2009),
        file: "Avatar (2009).mkv".to_string(),
        genre: vec![],
        collection: None,
        edition_title: None,
        guids: vec![],
        imdb_id: None,
        tmdb_id: None,
        tvdb_id: None,
    };

    let settings = json!({
        "movies": {
            "folderStructure": "alpha",
            "ownFolderPerMovie": false
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let op = compute_movie_proposal(&movie, "{title}{ext}", &settings, None)
        .expect("movie proposal with alpha folder structure");

    assert!(op.new_path.starts_with("A/"));
    assert!(op.new_path.contains("Avatar"));
}

#[test]
fn movie_folder_structure_year_decade_groups_by_decade() {
    let movie = MovieItem {
        rating_key: "m5".to_string(),
        title: "Avatar".to_string(),
        year: Some(2009),
        file: "Avatar (2009).mkv".to_string(),
        genre: vec![],
        collection: None,
        edition_title: None,
        guids: vec![],
        imdb_id: None,
        tmdb_id: None,
        tvdb_id: None,
    };

    let settings = json!({
        "movies": {
            "folderStructure": "year_decade",
            "ownFolderPerMovie": false
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let op = compute_movie_proposal(&movie, "{title}{ext}", &settings, None)
        .expect("movie proposal with year_decade folder structure");

    assert!(op.new_path.starts_with("2000-2009/"));
    assert!(op.new_path.contains("Avatar"));
}

#[test]
fn movie_edition_tokens_are_injected_before_extension() {
    let movie = MovieItem {
        rating_key: "m6".to_string(),
        title: "Blade Runner".to_string(),
        year: Some(1982),
        file: "Blade Runner {edition-imax}.mkv".to_string(),
        genre: vec![],
        collection: None,
        edition_title: None,
        guids: vec![],
        imdb_id: None,
        tmdb_id: None,
        tvdb_id: None,
    };

    let settings = json!({
        "movies": {
            "folderStructure": "none",
            "ownFolderPerMovie": false
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let op = compute_movie_proposal(&movie, "{title}[ ({year})]{ext}", &settings, None)
        .expect("movie proposal with edition token");

    assert_eq!(op.new_path, "Blade Runner (1982) IMAX Edition.mkv");
}

#[test]
fn movie_template_imdb_token_renders_as_plex_tag() {
    let movie = MovieItem {
        rating_key: "m7".to_string(),
        title: "Interstellar".to_string(),
        year: Some(2014),
        file: "Interstellar.mkv".to_string(),
        genre: vec![],
        collection: None,
        edition_title: None,
        guids: vec![],
        imdb_id: Some("tt0816692".to_string()),
        tmdb_id: None,
        tvdb_id: None,
    };

    let settings = json!({
        "movies": {
            "folderStructure": "none",
            "ownFolderPerMovie": false
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let op = compute_movie_proposal(&movie, "{title} {imdbToken}{ext}", &settings, None)
        .expect("movie proposal with imdb token");

    assert_eq!(op.new_path, "Interstellar {imdb-tt0816692}.mkv");
}

#[test]
fn movie_template_plex_ids_renders_available_provider_tags() {
    let movie = MovieItem {
        rating_key: "m8".to_string(),
        title: "Dune".to_string(),
        year: Some(2021),
        file: "Dune.mkv".to_string(),
        genre: vec![],
        collection: None,
        edition_title: None,
        guids: vec![],
        imdb_id: Some("tt1160419".to_string()),
        tmdb_id: Some("438631".to_string()),
        tvdb_id: None,
    };

    let settings = json!({
        "movies": {
            "folderStructure": "none",
            "ownFolderPerMovie": false
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let op = compute_movie_proposal(&movie, "{title}[ {plexIds}]{ext}", &settings, None)
        .expect("movie proposal with plex ids");

    assert_eq!(op.new_path, "Dune {imdb-tt1160419} {tmdb-438631}.mkv");
}

#[test]
fn movie_template_ignores_deprecated_ext_token_and_trims_stem() {
    let movie = MovieItem {
        rating_key: "m8b".to_string(),
        title: "One Piece 3D- Straw Hat Chase".to_string(),
        year: Some(2011),
        file: "One Piece 3D- Straw Hat Chase (2011) .mkv".to_string(),
        genre: vec![],
        collection: None,
        edition_title: None,
        guids: vec![],
        imdb_id: None,
        tmdb_id: None,
        tvdb_id: None,
    };

    let settings = json!({
        "movies": {
            "folderStructure": "none",
            "ownFolderPerMovie": false
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let op = compute_movie_proposal(&movie, "{title}[ ({year})] {ext} ", &settings, None)
        .expect("movie proposal trims stem before appending real extension");

    assert_eq!(op.new_path, "One Piece 3D- Straw Hat Chase (2011).mkv");
}

#[test]
fn movie_proposal_respects_shared_folder_setting_in_backend_preview_path() {
    let movie = MovieItem {
        rating_key: "m9".to_string(),
        title: "One Piece Film Z".to_string(),
        year: Some(2012),
        file: "/media/Movies/J-R/One Piece/One Piece Film Z (2012).mkv".to_string(),
        genre: vec![],
        collection: None,
        edition_title: None,
        guids: vec![],
        imdb_id: None,
        tmdb_id: None,
        tvdb_id: None,
    };

    let add_settings = json!({
        "movies": {
            "folderStructure": "none",
            "ownFolderPerMovie": true,
            "ownFolderWithinSharedFolder": "add_movie_folder"
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let keep_settings = json!({
        "movies": {
            "folderStructure": "none",
            "ownFolderPerMovie": true,
            "ownFolderWithinSharedFolder": "keep_shared_folder"
        },
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "highlightNonLatin": false
            }
        }
    });

    let relative_dirs = vec!["J-R".to_string(), "One Piece".to_string()];
    let add_op = compute_movie_proposal(
        &movie,
        "{title}[ ({year})]{ext}",
        &add_settings,
        Some(&relative_dirs),
    )
    .expect("backend preview movie proposal with nested folder");
    let keep_op = compute_movie_proposal(
        &movie,
        "{title}[ ({year})]{ext}",
        &keep_settings,
        Some(&relative_dirs),
    )
    .expect("backend preview movie proposal keeping shared folder");

    assert_eq!(
        add_op.new_path,
        "J-R/One Piece/One Piece Film Z/One Piece Film Z (2012).mkv"
    );
    assert_eq!(
        keep_op.new_path,
        "J-R/One Piece/One Piece Film Z (2012).mkv"
    );
}

#[test]
fn compute_relative_dirs_preserves_grouping_under_library_root() {
    let library_roots = vec!["/media/Movies".to_string()];
    let original = "/media/Movies/A-D/Nolan/Inception (2010).mkv";
    let dirs = compute_relative_dirs(original, &library_roots);
    assert_eq!(dirs, vec!["A-D".to_string(), "Nolan".to_string()]);
}

#[test]
fn compute_movie_destinations_respects_existing_grouping_and_own_folder() {
    let settings = json!({
        "movies": {
            "ownFolderPerMovie": true,
            "ownFolderWithinSharedFolder": "add_movie_folder"
        }
    });

    let req1 = MovieDestinationRequest {
        settings: settings.clone(),
        library_roots: vec!["/media/Movies".to_string()],
        items: vec![MovieDestinationItem {
            rating_key: "rk1".to_string(),
            original_path: "/media/Movies/Inception (2010).mkv".to_string(),
            base_name: "Inception (2010).mkv".to_string(),
            title: "Inception".to_string(),
            year: Some(2010),
        }],
    };
    let resp1 = compute_movie_destinations(req1).expect("destinations");
    assert_eq!(resp1.len(), 1);
    assert_eq!(resp1[0].proposed, "Inception/Inception (2010).mkv");

    let req2 = MovieDestinationRequest {
        settings: settings.clone(),
        library_roots: vec!["/media/Movies".to_string()],
        items: vec![MovieDestinationItem {
            rating_key: "rk2".to_string(),
            original_path: "/media/Movies/A-D/Nolan/Inception (2010).mkv".to_string(),
            base_name: "Inception (2010).mkv".to_string(),
            title: "Inception".to_string(),
            year: Some(2010),
        }],
    };
    let resp2 = compute_movie_destinations(req2).expect("destinations");
    assert_eq!(resp2.len(), 1);
    assert_eq!(
        resp2[0].proposed,
        "A-D/Nolan/Inception/Inception (2010).mkv"
    );
}

#[test]
fn compute_movie_destinations_can_keep_existing_shared_folder_as_final_folder() {
    let settings = json!({
        "movies": {
            "ownFolderPerMovie": true,
            "ownFolderWithinSharedFolder": "keep_shared_folder"
        }
    });

    let req = MovieDestinationRequest {
        settings,
        library_roots: vec!["/media/Movies".to_string()],
        items: vec![MovieDestinationItem {
            rating_key: "rk2".to_string(),
            original_path: "/media/Movies/A-D/Nolan/Inception (2010).mkv".to_string(),
            base_name: "Inception (2010).mkv".to_string(),
            title: "Inception".to_string(),
            year: Some(2010),
        }],
    };
    let resp = compute_movie_destinations(req).expect("destinations");
    assert_eq!(resp.len(), 1);
    assert_eq!(resp[0].proposed, "A-D/Nolan/Inception (2010).mkv");
}

#[test]
fn apply_single_video_operation_creates_parent_directories_and_moves_file() {
    let dir = tempfile::tempdir().expect("temp dir");
    let source = dir.path().join("source").join("Movie.old.mkv");
    let target = dir
        .path()
        .join("dest")
        .join("nested")
        .join("Movie (2024).mkv");

    std::fs::create_dir_all(source.parent().expect("source parent")).expect("create source dir");
    std::fs::write(&source, b"video-bytes").expect("write source file");

    let operation = RenameOperation {
        operation_type: "rename".to_string(),
        original_path: source.to_string_lossy().to_string(),
        new_path: target.to_string_lossy().to_string(),
        backup_path: None,
        operation_id: "video_test_1".to_string(),
    };

    apply_single_video_operation(&operation).expect("video rename should succeed");

    assert!(!source.exists(), "source should be moved away");
    assert!(target.exists(), "target should exist after rename");
    assert_eq!(std::fs::read(&target).expect("read target"), b"video-bytes");
}

#[test]
fn apply_single_video_operation_rejects_missing_source() {
    let dir = tempfile::tempdir().expect("temp dir");
    let missing_source = dir.path().join("missing").join("Movie.old.mkv");
    let target = dir.path().join("dest").join("Movie (2024).mkv");

    let operation = RenameOperation {
        operation_type: "rename".to_string(),
        original_path: missing_source.to_string_lossy().to_string(),
        new_path: target.to_string_lossy().to_string(),
        backup_path: None,
        operation_id: "video_test_2".to_string(),
    };

    let err = apply_single_video_operation(&operation).expect_err("missing source should fail");
    assert!(err.contains("Source file does not exist"));
}

#[test]
fn apply_mixed_operations_writes_rollback_log_for_video_and_subtitle_batch() {
    let dir = tempfile::tempdir().expect("temp dir");
    let video_source = dir.path().join("Movie.old.mkv");
    let video_target = dir.path().join("Renamed").join("Movie (2024).mkv");
    let subtitle_source = dir.path().join("Movie.old.eng.srt");
    let subtitle_target = dir.path().join("Renamed").join("Movie (2024).eng.srt");
    let log_path = dir.path().join("logs").join("rollback.json");

    std::fs::write(&video_source, b"video-bytes").expect("write video source");
    std::fs::write(&subtitle_source, b"subtitle-bytes").expect("write subtitle source");

    let operations = vec![
        RenameOperation {
            operation_type: "rename".to_string(),
            original_path: video_source.to_string_lossy().to_string(),
            new_path: video_target.to_string_lossy().to_string(),
            backup_path: None,
            operation_id: "video_batch_1".to_string(),
        },
        RenameOperation {
            operation_type: "rename".to_string(),
            original_path: subtitle_source.to_string_lossy().to_string(),
            new_path: subtitle_target.to_string_lossy().to_string(),
            backup_path: None,
            operation_id: "subtitle_batch_1".to_string(),
        },
    ];

    let result = apply_mixed_operations_with_log_path(&operations, &log_path)
        .expect("batch apply should succeed");

    assert!(result.success);
    assert_eq!(result.operations_applied, 2);
    assert_eq!(result.operations_failed, 0);
    assert_eq!(result.rollback_log_path, log_path.to_string_lossy());
    assert!(video_target.exists());
    assert!(subtitle_target.exists());

    let log_value: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&log_path).expect("read rollback log"))
            .expect("parse rollback log");

    let entries = log_value.as_array().expect("rollback log array");
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0]["status"], "success");
    assert_eq!(entries[1]["status"], "success");
    assert_eq!(entries[0]["operation_id"], "video_batch_1");
    assert_eq!(entries[1]["operation_id"], "subtitle_batch_1");
}

#[test]
fn apply_single_video_operation_fails_when_target_exists() {
    let dir = tempfile::tempdir().expect("temp dir");
    let source = dir.path().join("Movie.old.mkv");
    let target = dir.path().join("Movie (2024).mkv");

    std::fs::write(&source, b"new-video").expect("write source");
    std::fs::write(&target, b"old-video").expect("write existing target");

    let operation = RenameOperation {
        operation_type: "rename".to_string(),
        original_path: source.to_string_lossy().to_string(),
        new_path: target.to_string_lossy().to_string(),
        backup_path: None,
        operation_id: "video_conflict_1".to_string(),
    };

    let error = apply_single_video_operation(&operation)
        .expect_err("rename should fail when target exists");

    assert!(error.contains("Target already exists"));
    assert!(source.exists(), "source should remain in place");
    assert_eq!(std::fs::read(&target).expect("read target"), b"old-video");
}

#[test]
fn path_mapped_apply_uses_library_root_for_relative_new_paths() {
    let dir = tempfile::tempdir().expect("temp dir");
    let library_root = dir.path().join("library");
    std::fs::create_dir_all(&library_root).expect("create library root");
    let old_path = library_root.join("Old.mkv");
    let log_path = dir.path().join("logs").join("relative-apply.json");
    std::fs::write(&old_path, b"video").expect("seed old video");

    let mappings = vec![crate::path_map::PathMapping {
        server_id: "server1".to_string(),
        plex_root: "/plex/Movies".to_string(),
        local_root: library_root.to_string_lossy().to_string(),
        platform: Some("linux".to_string()),
    }];

    let operations = vec![RenameOperation {
        operation_type: "rename".to_string(),
        original_path: "/plex/Movies/Old.mkv".to_string(),
        new_path: "Grouped/New.mkv".to_string(),
        backup_path: None,
        operation_id: "video_relative_1".to_string(),
    }];

    let resolved = resolve_video_operations_for_apply(&operations, &mappings, "server1")
        .expect("relative new path should resolve");

    assert_eq!(resolved.len(), 1);
    let expected_target = library_root.join("Grouped").join("New.mkv");
    assert_eq!(resolved[0].new_path, expected_target.to_string_lossy());

    let result = apply_mixed_operations_with_log_path(&resolved, &log_path)
        .expect("relative apply should succeed");
    assert!(result.success);
    assert!(!old_path.exists(), "original file should be moved");
    assert!(
        expected_target.exists(),
        "resolved relative target should exist"
    );
}

#[test]
fn cleanup_empty_folders_removes_empty_directories_but_keeps_non_empty_ones() {
    let dir = tempfile::tempdir().expect("temp dir");
    let library_root = dir.path().join("library");
    let empty_dir = library_root.join("A").join("Empty");
    let non_empty_dir = library_root.join("B").join("Keep");
    std::fs::create_dir_all(&empty_dir).expect("create empty dir");
    std::fs::create_dir_all(&non_empty_dir).expect("create non-empty dir");
    std::fs::write(library_root.join(".keep"), b"root").expect("keep root");
    std::fs::write(non_empty_dir.join("note.txt"), b"still here").expect("keep non-empty dir");

    let mappings = vec![crate::path_map::PathMapping {
        server_id: "server1".to_string(),
        plex_root: "/plex/Movies".to_string(),
        local_root: library_root.to_string_lossy().to_string(),
        platform: Some("linux".to_string()),
    }];

    let original_paths = vec![
        "/plex/Movies/A/Empty/Movie.mkv".to_string(),
        "/plex/Movies/B/Keep/Movie.mkv".to_string(),
    ];

    let result = cleanup_empty_folders_with_mappings(&mappings, "server1", &original_paths);

    assert!(result.errors.is_empty(), "cleanup should not error");
    assert!(result
        .removed_directories
        .iter()
        .any(|p| Path::new(p).ends_with(Path::new("A").join("Empty"))));
    assert!(result
        .removed_directories
        .iter()
        .any(|p| Path::new(p).ends_with(Path::new("A"))));
    assert!(!result
        .removed_directories
        .iter()
        .any(|p| Path::new(p).ends_with(Path::new("B").join("Keep"))));
    assert!(non_empty_dir.exists(), "non-empty directory should remain");
    assert!(!empty_dir.exists(), "empty directory should be removed");
}

#[test]
fn apply_video_rename_discovers_and_moves_matching_subtitles_when_frontend_omits_them() {
    let dir = tempfile::tempdir().expect("temp dir");
    let library_root = dir.path().join("library");
    std::fs::create_dir_all(&library_root).expect("create library root");

    let video_source = library_root.join("One Piece Film Red (2022).mkv");
    let subtitle_source = library_root.join("One Piece Film Red (2022).eng.srt");
    let video_target = library_root
        .join("One Piece Film Red")
        .join("One Piece Film Red (2022).mkv");
    let subtitle_target = library_root
        .join("One Piece Film Red")
        .join("One Piece Film Red (2022).eng.srt");
    let log_path = dir.path().join("rollback.json");

    std::fs::write(&video_source, b"video-bytes").expect("write video");
    std::fs::write(&subtitle_source, b"subtitle-bytes").expect("write subtitle");

    let mappings = vec![crate::path_map::PathMapping {
        server_id: "server1".to_string(),
        plex_root: "/plex/Movies".to_string(),
        local_root: library_root.to_string_lossy().to_string(),
        platform: Some("linux".to_string()),
    }];

    let operations = vec![RenameOperation {
        operation_type: "rename".to_string(),
        original_path: "/plex/Movies/One Piece Film Red (2022).mkv".to_string(),
        new_path: "One Piece Film Red/One Piece Film Red (2022).mkv".to_string(),
        backup_path: None,
        operation_id: "video_movie_1".to_string(),
    }];

    let result =
        apply_operations_with_mappings_to_log_path(&operations, &mappings, "server1", &log_path)
            .expect("apply should succeed");

    assert!(result.success, "apply should succeed: {:?}", result.errors);
    assert_eq!(result.operations_applied, 2);
    assert!(!video_source.exists(), "video source should move");
    assert!(!subtitle_source.exists(), "subtitle source should move");
    assert!(video_target.exists(), "video target should exist");
    assert!(subtitle_target.exists(), "subtitle target should exist");
}

#[test]
fn apply_mixed_operations_records_failed_entries_in_rollback_log() {
    let dir = tempfile::tempdir().expect("temp dir");
    let good_source = dir.path().join("Good.mkv");
    let good_target = dir.path().join("Done").join("Good.mkv");
    let missing_source = dir.path().join("Missing.eng.srt");
    let missing_target = dir.path().join("Done").join("Missing.eng.srt");
    let log_path = dir.path().join("logs").join("rollback-failed.json");

    std::fs::write(&good_source, b"video-bytes").expect("write good source");

    let operations = vec![
        RenameOperation {
            operation_type: "rename".to_string(),
            original_path: good_source.to_string_lossy().to_string(),
            new_path: good_target.to_string_lossy().to_string(),
            backup_path: None,
            operation_id: "video_success_1".to_string(),
        },
        RenameOperation {
            operation_type: "rename".to_string(),
            original_path: missing_source.to_string_lossy().to_string(),
            new_path: missing_target.to_string_lossy().to_string(),
            backup_path: None,
            operation_id: "subtitle_missing_1".to_string(),
        },
    ];

    let result = apply_mixed_operations_with_log_path(&operations, &log_path)
        .expect("batch apply should still return a result");

    assert!(!result.success);
    assert_eq!(result.operations_applied, 1);
    assert_eq!(result.operations_failed, 1);

    let log_value: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&log_path).expect("read rollback log"))
            .expect("parse rollback log");
    let entries = log_value.as_array().expect("rollback log array");
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0]["status"], "success");
    assert_eq!(entries[1]["status"], "failed");
    assert!(entries[1]["error"]
        .as_str()
        .unwrap_or_default()
        .contains("Failed"));
}
