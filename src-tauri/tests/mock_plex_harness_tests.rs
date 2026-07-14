use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use name_o_tron_9000_lib::path_map::PathMapping;
use name_o_tron_9000_lib::rename_types::RenameOperation;
use name_o_tron_9000_lib::video_rename::{
    apply_operations_with_mappings_to_log_path, cleanup_empty_folders_with_explicit_mappings,
    propose_episode_rename_operation, propose_movie_rename_operation,
    propose_non_media_file_operation, undo_operations_from_log_path, EpisodeItem, MovieItem,
};
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Deserialize)]
struct ResolvedFixture {
    server_id: String,
    path_mappings: Vec<ResolvedMapping>,
    libraries: Vec<ResolvedLibrary>,
    directories: Vec<ResolvedDirectory>,
    #[serde(default)]
    loose_files: Vec<ResolvedLooseFile>,
    conflicts: Vec<ResolvedConflict>,
    assertions: ResolvedAssertions,
}

#[derive(Debug, Deserialize)]
struct ResolvedMapping {
    server_id: String,
    plex_root: String,
    local_root: String,
    platform: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ResolvedLibrary {
    key: String,
    resolved_local_root: String,
    items: Vec<ResolvedItem>,
}

#[derive(Debug, Deserialize)]
struct ResolvedItem {
    resolved_local_path: String,
    subtitles: Vec<ResolvedSubtitle>,
}

#[derive(Debug, Deserialize)]
struct ResolvedSubtitle {
    resolved_local_path: String,
}

#[derive(Debug, Deserialize)]
struct ResolvedDirectory {
    relative_path: String,
    resolved_path: String,
}

#[derive(Debug, Deserialize)]
struct ResolvedLooseFile {
    relative_path: String,
    resolved_path: String,
}

#[derive(Debug, Deserialize)]
struct ResolvedConflict {
    resolved_path: String,
}

#[derive(Debug, Deserialize)]
struct ResolvedAssertions {
    operations: Vec<AssertionOperation>,
    cleanup_original_paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct AssertionOperation {
    operation_id: String,
    operation_type: String,
    original_path: String,
    new_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(bound(deserialize = "T: Deserialize<'de>"))]
struct PlexContainer<T> {
    #[serde(rename = "MediaContainer")]
    media_container: PlexMediaContainer<T>,
}

#[derive(Debug, Deserialize)]
#[serde(bound(deserialize = "T: Deserialize<'de>"))]
struct PlexMediaContainer<T> {
    #[serde(default, rename = "Metadata")]
    metadata: Vec<T>,
}

#[derive(Debug, Deserialize)]
struct PlexGuid {
    id: String,
}

#[derive(Debug, Deserialize)]
struct PlexTag {
    tag: String,
}

#[derive(Debug, Deserialize)]
struct PlexMedia {
    #[serde(default, rename = "Part")]
    part: Vec<PlexPart>,
}

#[derive(Debug, Deserialize)]
struct PlexPart {
    file: String,
}

#[derive(Debug, Deserialize)]
struct PlexMovie {
    #[serde(rename = "ratingKey")]
    rating_key: String,
    title: String,
    year: Option<i32>,
    #[serde(default, rename = "Guid")]
    guid: Vec<PlexGuid>,
    #[serde(default, rename = "Genre")]
    genre: Vec<PlexTag>,
    #[serde(default, rename = "Collection")]
    collection: Vec<PlexTag>,
    #[serde(default, rename = "Media")]
    media: Vec<PlexMedia>,
}

#[derive(Debug, Deserialize)]
struct PlexEpisode {
    #[serde(rename = "ratingKey")]
    rating_key: String,
    title: String,
    year: Option<i32>,
    #[serde(default, rename = "Guid")]
    guid: Vec<PlexGuid>,
    #[serde(default, rename = "Media")]
    media: Vec<PlexMedia>,
    #[serde(rename = "grandparentTitle")]
    grandparent_title: String,
    #[serde(rename = "parentTitle")]
    parent_title: String,
    #[serde(rename = "parentIndex")]
    parent_index: i32,
    index: i32,
}

struct MaterializedScenario {
    _tempdir: tempfile::TempDir,
    fixture: ResolvedFixture,
}

impl ResolvedFixture {
    fn mappings(&self) -> Vec<PathMapping> {
        self.path_mappings
            .iter()
            .map(|mapping| PathMapping {
                server_id: mapping.server_id.clone(),
                plex_root: mapping.plex_root.clone(),
                local_root: mapping.local_root.clone(),
                platform: mapping.platform.clone(),
            })
            .collect()
    }

    fn operations(&self) -> Vec<RenameOperation> {
        self.assertions
            .operations
            .iter()
            .map(|operation| RenameOperation {
                operation_type: operation.operation_type.clone(),
                original_path: operation.original_path.clone(),
                new_path: operation.new_path.clone(),
                backup_path: None,
                operation_id: operation.operation_id.clone(),
            })
            .collect()
    }

    fn library_root(&self, key: &str) -> &Path {
        Path::new(
            &self
                .libraries
                .iter()
                .find(|library| library.key == key)
                .expect("library should exist")
                .resolved_local_root,
        )
    }
}

fn build_fixture_shell() -> Command {
    #[cfg(target_os = "windows")]
    {
        if let Some(custom_bash) = std::env::var_os("GIT_BASH_EXE") {
            return Command::new(custom_bash);
        }

        for candidate in [
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files\Git\usr\bin\bash.exe",
        ] {
            if Path::new(candidate).exists() {
                return Command::new(candidate);
            }
        }
    }

    Command::new("bash")
}

fn materialize_scenario(name: &str) -> MaterializedScenario {
    let tempdir = tempfile::tempdir().expect("temp dir");
    let manifest_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("mock_plex")
        .join(format!("{name}.json"));
    let builder_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("bin")
        .join("build_fixture_tree.sh");

    let output = build_fixture_shell()
        .arg(&builder_path)
        .arg("--manifest")
        .arg(&manifest_path)
        .arg("--out")
        .arg(tempdir.path())
        .output()
        .expect("run fixture builder");

    if !output.status.success() {
        panic!(
            "fixture builder failed\nstdout:\n{}\nstderr:\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let resolved_path = tempdir.path().join("resolved-fixture.json");
    let fixture: ResolvedFixture =
        serde_json::from_slice(&fs::read(&resolved_path).expect("read resolved fixture"))
            .expect("parse resolved fixture");

    MaterializedScenario {
        _tempdir: tempdir,
        fixture,
    }
}

fn read_log_entries(log_path: &Path) -> Vec<serde_json::Value> {
    serde_json::from_slice(&fs::read(log_path).expect("read rollback log"))
        .expect("parse rollback log")
}

fn fixture_path(relative_path: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repo root")
        .join(relative_path)
}

fn load_plex_movies() -> Vec<PlexMovie> {
    let path = fixture_path("tests/mock-plex/fixtures/movies_all.json");
    let payload: PlexContainer<PlexMovie> =
        serde_json::from_slice(&fs::read(path).expect("read movies fixture"))
            .expect("parse movies fixture");
    payload.media_container.metadata
}

fn load_plex_movie(rating_key: &str) -> PlexMovie {
    load_plex_movies()
        .into_iter()
        .find(|movie| movie.rating_key == rating_key)
        .unwrap_or_else(|| panic!("movie fixture {rating_key} should exist"))
}

fn load_plex_episodes() -> Vec<PlexEpisode> {
    let path = fixture_path("tests/mock-plex/fixtures/tv_all_leaves.json");
    let payload: PlexContainer<PlexEpisode> =
        serde_json::from_slice(&fs::read(path).expect("read episodes fixture"))
            .expect("parse episodes fixture");
    payload.media_container.metadata
}

fn first_part_file(media: &[PlexMedia]) -> String {
    media
        .first()
        .and_then(|media| media.part.first())
        .map(|part| part.file.clone())
        .expect("fixture item should have a media part file")
}

fn provider_id(guids: &[PlexGuid], provider: &str) -> Option<String> {
    let prefix = format!("{provider}://");
    guids
        .iter()
        .find_map(|guid| guid.id.strip_prefix(&prefix).map(ToString::to_string))
}

fn movie_item_from_plex(movie: &PlexMovie) -> MovieItem {
    MovieItem {
        rating_key: movie.rating_key.clone(),
        title: movie.title.clone(),
        year: movie.year,
        file: first_part_file(&movie.media),
        genre: movie.genre.iter().map(|genre| genre.tag.clone()).collect(),
        collection: movie
            .collection
            .first()
            .map(|collection| collection.tag.clone()),
        edition_title: None,
        guids: movie.guid.iter().map(|guid| guid.id.clone()).collect(),
        imdb_id: provider_id(&movie.guid, "imdb"),
        tmdb_id: provider_id(&movie.guid, "tmdb"),
        tvdb_id: provider_id(&movie.guid, "tvdb"),
    }
}

fn episode_item_from_plex(episode: &PlexEpisode) -> EpisodeItem {
    EpisodeItem {
        rating_key: episode.rating_key.clone(),
        title: episode.title.clone(),
        year: episode.year,
        file: first_part_file(&episode.media),
        genre: vec![],
        guids: episode.guid.iter().map(|guid| guid.id.clone()).collect(),
        imdb_id: provider_id(&episode.guid, "imdb"),
        tmdb_id: provider_id(&episode.guid, "tmdb"),
        tvdb_id: provider_id(&episode.guid, "tvdb"),
        grandparent_title: episode.grandparent_title.clone(),
        parent_title: episode.parent_title.clone(),
        parent_index: episode.parent_index,
        index: episode.index,
    }
}

fn mapping_for_temp_root(server_id: &str, plex_root: &str, local_root: &Path) -> PathMapping {
    PathMapping {
        server_id: server_id.to_string(),
        plex_root: plex_root.to_string(),
        local_root: local_root.to_string_lossy().to_string(),
        platform: Some(std::env::consts::OS.to_string()),
    }
}

fn seed_mapped_file(
    plex_path: &str,
    plex_root: &str,
    local_root: &Path,
    contents: &[u8],
) -> PathBuf {
    let relative = plex_path
        .strip_prefix(plex_root)
        .expect("plex path should start with root")
        .trim_start_matches(['/', '\\']);
    let target = relative
        .split('/')
        .fold(local_root.to_path_buf(), |mut path, segment| {
            path.push(segment);
            path
        });
    fs::create_dir_all(target.parent().expect("seed parent dir")).expect("create seed parent");
    fs::write(&target, contents).expect("seed mapped file");
    target
}

fn current_relative_dirs(plex_path: &str, plex_root: &str) -> Vec<String> {
    let relative = plex_path
        .strip_prefix(plex_root)
        .expect("plex path should start with root")
        .trim_start_matches(['/', '\\']);
    let mut segments: Vec<String> = relative.split('/').map(ToString::to_string).collect();
    segments.pop();
    segments
}

fn rename_settings(overrides: serde_json::Value) -> serde_json::Value {
    let mut settings = json!({
        "general": {
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": true,
                "permissionsCheck": true
            },
            "encoding": {
                "mode": "unicode",
                "highlightNonLatin": true
            },
            "subtitles": {
                "renameWithVideo": true,
                "preserveLanguageCodes": true,
                "languageCodeHandling": "preserve",
                "skipSubtitles": false
            }
        },
        "movies": {
            "collections": {
                "enabled": false,
                "mode": "always",
                "naming": "original"
            },
            "chronologicalPrefix": "none",
            "folderStructure": "none",
            "ownFolderPerMovie": true,
            "ownFolderWithinSharedFolder": "add_movie_folder",
            "ids": "preserve"
        },
        "tv": {
            "seasonFolders": true,
            "detectOVAsSeason00": true,
            "normalizeMultiEpisode": true,
            "ids": "preserve"
        }
    });

    merge_json(&mut settings, &overrides);
    settings
}

fn merge_json(target: &mut serde_json::Value, source: &serde_json::Value) {
    match (target, source) {
        (serde_json::Value::Object(target), serde_json::Value::Object(source)) => {
            for (key, value) in source {
                merge_json(
                    target.entry(key.clone()).or_insert(serde_json::Value::Null),
                    value,
                );
            }
        }
        (target, source) => {
            *target = source.clone();
        }
    }
}

#[test]
fn apply_movie_basic_rename_round_trip() {
    let scenario = materialize_scenario("movie_basic_rename");
    let log_path = PathBuf::from(&scenario.fixture.library_root("1")).join("../logs/basic.json");

    let result = apply_operations_with_mappings_to_log_path(
        &scenario.fixture.operations(),
        &scenario.fixture.mappings(),
        &scenario.fixture.server_id,
        &log_path,
    )
    .expect("apply basic rename");

    assert!(result.success);
    assert_eq!(result.operations_applied, 1);
    assert_eq!(result.operations_failed, 0);
    assert_eq!(result.operations.len(), 1);
    assert_eq!(result.operations[0].operation_id, "video_101");

    let source_path = Path::new(&scenario.fixture.libraries[0].items[0].resolved_local_path);
    let target_path = scenario
        .fixture
        .library_root("1")
        .join("Interstellar (2014).mkv");
    assert!(!source_path.exists(), "source should be moved");
    assert!(target_path.exists(), "target should exist");

    let entries = read_log_entries(&log_path);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["status"], "success");

    let undo = undo_operations_from_log_path(&log_path).expect("undo basic rename");
    assert!(undo.success);
    assert_eq!(undo.operations.len(), 1);
    assert_eq!(undo.operations[0].operation_id, "video_101");
    assert!(source_path.exists(), "source should be restored");
    assert!(!target_path.exists(), "target should be removed by undo");
}

#[test]
fn apply_movie_with_subtitle_round_trip() {
    let scenario = materialize_scenario("movie_with_subtitle");
    let log_path = PathBuf::from(&scenario.fixture.library_root("1")).join("../logs/subtitle.json");

    let subtitle_source =
        PathBuf::from(&scenario.fixture.libraries[0].items[0].subtitles[0].resolved_local_path);
    let original_subtitle_contents =
        fs::read_to_string(&subtitle_source).expect("read original subtitle");

    let result = apply_operations_with_mappings_to_log_path(
        &scenario.fixture.operations(),
        &scenario.fixture.mappings(),
        &scenario.fixture.server_id,
        &log_path,
    )
    .expect("apply subtitle scenario");

    assert!(result.success);
    assert_eq!(result.operations_applied, 2);
    assert_eq!(result.operations_failed, 0);

    let video_target = scenario
        .fixture
        .library_root("1")
        .join("Arrival (2016).mkv");
    let subtitle_target = scenario
        .fixture
        .library_root("1")
        .join("Arrival (2016).eng.srt");
    assert!(video_target.exists(), "video target should exist");
    assert!(subtitle_target.exists(), "subtitle target should exist");
    assert_eq!(
        fs::read_to_string(&subtitle_target).expect("read renamed subtitle"),
        original_subtitle_contents
    );

    let entries = read_log_entries(&log_path);
    assert_eq!(entries.len(), 2);
    assert!(entries.iter().all(|entry| entry["status"] == "success"));

    let undo = undo_operations_from_log_path(&log_path).expect("undo subtitle scenario");
    assert!(undo.success);
    assert!(Path::new(&scenario.fixture.libraries[0].items[0].resolved_local_path).exists());
    assert!(
        subtitle_source.exists(),
        "subtitle source should be restored"
    );
    assert!(!video_target.exists());
    assert!(!subtitle_target.exists());
}

#[test]
fn undo_generated_movie_folder_removes_targets_and_restores_subtitles() {
    let scenario = materialize_scenario("movie_with_subtitle");
    let log_path =
        PathBuf::from(&scenario.fixture.library_root("1")).join("../logs/undo-folder.json");

    let source_path = PathBuf::from(&scenario.fixture.libraries[0].items[0].resolved_local_path);
    let subtitle_source =
        PathBuf::from(&scenario.fixture.libraries[0].items[0].subtitles[0].resolved_local_path);
    let folder_target = scenario.fixture.library_root("1").join("Arrival (2016)");
    let video_target = folder_target.join("Arrival (2016).mkv");
    let subtitle_target = folder_target.join("Arrival (2016).eng.srt");
    let operations = vec![
        RenameOperation {
            operation_type: "rename".to_string(),
            original_path: "/mount/server/HDD1/Movies/Staging/Arrival.2016.1080p.WEB-DL.mkv"
                .to_string(),
            new_path: "Arrival (2016)/Arrival (2016).mkv".to_string(),
            backup_path: None,
            operation_id: "video_102_folder".to_string(),
        },
        RenameOperation {
            operation_type: "rename".to_string(),
            original_path: "/mount/server/HDD1/Movies/Staging/Arrival.2016.1080p.WEB-DL.eng.srt"
                .to_string(),
            new_path: "Arrival (2016)/Arrival (2016).eng.srt".to_string(),
            backup_path: None,
            operation_id: "subtitle_102_en_folder".to_string(),
        },
    ];

    let result = apply_operations_with_mappings_to_log_path(
        &operations,
        &scenario.fixture.mappings(),
        &scenario.fixture.server_id,
        &log_path,
    )
    .expect("apply folder undo scenario");

    assert!(result.success);
    assert!(video_target.exists(), "video target should exist");
    assert!(subtitle_target.exists(), "subtitle target should exist");
    assert!(!source_path.exists(), "video source should be moved");
    assert!(!subtitle_source.exists(), "subtitle source should be moved");

    let undo = undo_operations_from_log_path(&log_path).expect("undo folder scenario");
    assert!(undo.success, "undo should succeed: {:?}", undo.errors);
    assert!(source_path.exists(), "video source should be restored");
    assert!(
        subtitle_source.exists(),
        "subtitle source should be restored"
    );
    assert!(!video_target.exists(), "video target should be removed");
    assert!(
        !subtitle_target.exists(),
        "subtitle target should be removed"
    );

    fs::remove_dir(&folder_target).expect("generated folder should be empty after undo");
}

#[test]
fn apply_existing_target_conflict_fails_cleanly() {
    let scenario = materialize_scenario("movie_conflict_existing_target");
    let log_path = PathBuf::from(&scenario.fixture.library_root("1")).join("../logs/conflict.json");

    let source_path = PathBuf::from(&scenario.fixture.libraries[0].items[0].resolved_local_path);
    let conflict_target = PathBuf::from(&scenario.fixture.conflicts[0].resolved_path);
    let conflict_contents = fs::read_to_string(&conflict_target).expect("read seeded conflict");

    let result = apply_operations_with_mappings_to_log_path(
        &scenario.fixture.operations(),
        &scenario.fixture.mappings(),
        &scenario.fixture.server_id,
        &log_path,
    )
    .expect("apply conflict scenario should return batch result");

    assert!(!result.success);
    assert_eq!(result.operations_applied, 0);
    assert_eq!(result.operations_failed, 1);
    assert!(result
        .errors
        .iter()
        .any(|error| error.contains("Target already exists")));
    assert!(source_path.exists(), "source should remain on conflict");
    assert_eq!(
        fs::read_to_string(&conflict_target).expect("read conflict target"),
        conflict_contents
    );

    let entries = read_log_entries(&log_path);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["status"], "failed");
}

#[test]
fn non_media_skip_leaves_loose_file_in_place() {
    let scenario = materialize_scenario("movie_basic_rename");
    let loose_file = scenario
        .fixture
        .loose_files
        .iter()
        .find(|file| file.relative_path == "Incoming/poster.jpg")
        .expect("poster loose file");
    let loose_path = PathBuf::from(&loose_file.resolved_path);

    let operation = propose_non_media_file_operation(
        &loose_path,
        scenario.fixture.library_root("1"),
        "skip",
        None,
    )
    .expect("non-media skip proposal");

    assert!(operation.is_none(), "skip should not create an operation");
    assert!(loose_path.exists(), "loose file should stay in place");
}

#[test]
fn non_media_move_extras_moves_loose_file_and_undo_restores_it() {
    let scenario = materialize_scenario("movie_basic_rename");
    let loose_file = scenario
        .fixture
        .loose_files
        .iter()
        .find(|file| file.relative_path == "Incoming/poster.jpg")
        .expect("poster loose file");
    let loose_path = PathBuf::from(&loose_file.resolved_path);
    let log_path =
        PathBuf::from(&scenario.fixture.library_root("1")).join("../logs/non-media-move.json");
    let operation = propose_non_media_file_operation(
        &loose_path,
        scenario.fixture.library_root("1"),
        "move_extras",
        None,
    )
    .expect("non-media move proposal")
    .expect("move_extras should create an operation");

    assert_eq!(operation.operation_type, "move");
    assert!(operation.new_path.ends_with("Extras/poster.jpg"));

    let result = apply_operations_with_mappings_to_log_path(
        &[operation],
        &scenario.fixture.mappings(),
        &scenario.fixture.server_id,
        &log_path,
    )
    .expect("apply non-media move");

    assert!(result.success, "move should succeed: {:?}", result.errors);
    let target = scenario.fixture.library_root("1").join("Extras/poster.jpg");
    assert!(!loose_path.exists(), "loose file should move");
    assert!(target.exists(), "extras target should exist");

    let undo = undo_operations_from_log_path(&log_path).expect("undo non-media move");
    assert!(undo.success, "undo should succeed: {:?}", undo.errors);
    assert!(loose_path.exists(), "loose file should be restored");
    assert!(!target.exists(), "extras target should be removed");
}

#[test]
fn non_media_delete_uses_backup_and_undo_restores_loose_file() {
    let scenario = materialize_scenario("movie_basic_rename");
    let loose_file = scenario
        .fixture
        .loose_files
        .iter()
        .find(|file| file.relative_path == "Incoming/movie.nfo")
        .expect("nfo loose file");
    let loose_path = PathBuf::from(&loose_file.resolved_path);
    let backup_root = scenario
        .fixture
        .library_root("1")
        .join(".nameotron-trash-test");
    let log_path =
        PathBuf::from(&scenario.fixture.library_root("1")).join("../logs/non-media-delete.json");
    let original_contents = fs::read(&loose_path).expect("read loose file");
    let operation = propose_non_media_file_operation(
        &loose_path,
        scenario.fixture.library_root("1"),
        "delete",
        Some(&backup_root),
    )
    .expect("non-media delete proposal")
    .expect("delete should create an operation");

    assert_eq!(operation.operation_type, "delete");
    assert!(operation.backup_path.is_some());

    let result = apply_operations_with_mappings_to_log_path(
        &[operation.clone()],
        &scenario.fixture.mappings(),
        &scenario.fixture.server_id,
        &log_path,
    )
    .expect("apply non-media delete");

    assert!(result.success, "delete should succeed: {:?}", result.errors);
    let backup_path = PathBuf::from(operation.backup_path.expect("backup path"));
    assert!(!loose_path.exists(), "loose file should be removed");
    assert!(backup_path.exists(), "backup should exist");
    assert_eq!(
        fs::read(&backup_path).expect("read backup"),
        original_contents
    );

    let undo = undo_operations_from_log_path(&log_path).expect("undo non-media delete");
    assert!(undo.success, "undo should succeed: {:?}", undo.errors);
    assert!(loose_path.exists(), "loose file should be restored");
    assert_eq!(
        fs::read(&loose_path).expect("read restored"),
        original_contents
    );
    assert!(!backup_path.exists(), "backup should be consumed by undo");
}

#[test]
fn cleanup_removes_empty_parent_dirs_only() {
    let scenario = materialize_scenario("movie_basic_rename");
    let log_path =
        PathBuf::from(&scenario.fixture.library_root("1")).join("../logs/cleanup-empty.json");

    apply_operations_with_mappings_to_log_path(
        &scenario.fixture.operations(),
        &scenario.fixture.mappings(),
        &scenario.fixture.server_id,
        &log_path,
    )
    .expect("apply before cleanup");

    let cleanup = cleanup_empty_folders_with_explicit_mappings(
        &scenario.fixture.mappings(),
        &scenario.fixture.server_id,
        &scenario.fixture.assertions.cleanup_original_paths,
    );

    assert!(cleanup.errors.is_empty(), "cleanup should not error");

    let removed_paths: Vec<&str> = cleanup
        .removed_directories
        .iter()
        .map(String::as_str)
        .collect();
    let empty_dir = scenario
        .fixture
        .directories
        .iter()
        .find(|directory| directory.relative_path == "Incoming/EmptyAfterMove")
        .expect("empty directory fixture");
    assert!(
        removed_paths
            .iter()
            .any(|path| path == &empty_dir.resolved_path),
        "empty fixture directory should be removed"
    );
}

#[test]
fn cleanup_preserves_non_empty_parent_dirs() {
    let scenario = materialize_scenario("movie_basic_rename");
    let log_path =
        PathBuf::from(&scenario.fixture.library_root("1")).join("../logs/cleanup-keep.json");

    apply_operations_with_mappings_to_log_path(
        &scenario.fixture.operations(),
        &scenario.fixture.mappings(),
        &scenario.fixture.server_id,
        &log_path,
    )
    .expect("apply before cleanup");

    let cleanup = cleanup_empty_folders_with_explicit_mappings(
        &scenario.fixture.mappings(),
        &scenario.fixture.server_id,
        &scenario.fixture.assertions.cleanup_original_paths,
    );

    assert!(cleanup.errors.is_empty(), "cleanup should not error");

    let keep_dir = scenario
        .fixture
        .directories
        .iter()
        .find(|directory| directory.relative_path == "Incoming/KeepMe")
        .expect("keep directory fixture");
    assert!(
        Path::new(&keep_dir.resolved_path).exists(),
        "non-empty directory should remain"
    );
    assert!(
        !cleanup
            .removed_directories
            .iter()
            .any(|removed| removed == &keep_dir.resolved_path),
        "non-empty directory should not be removed"
    );
}

#[test]
fn apply_with_relative_new_path_and_mapping_succeeds() {
    let scenario = materialize_scenario("movie_basic_rename");
    let log_path = PathBuf::from(&scenario.fixture.library_root("1")).join("../logs/relative.json");

    let result = apply_operations_with_mappings_to_log_path(
        &scenario.fixture.operations(),
        &scenario.fixture.mappings(),
        &scenario.fixture.server_id,
        &log_path,
    )
    .expect("apply relative target");

    assert!(result.success);
    let expected_target = scenario
        .fixture
        .library_root("1")
        .join("Interstellar (2014).mkv");
    assert!(
        expected_target.exists(),
        "relative target should resolve under library root"
    );
}

#[test]
fn mock_fixture_movie_generates_template_settings_apply_and_undo() {
    let tempdir = tempfile::tempdir().expect("temp dir");
    let server_id = "mock-server";
    let plex_root = "/mount/server/HDD1/Movies";
    let movie_root = tempdir.path().join("Movies");
    let log_path = tempdir.path().join("logs").join("movie-unicode.json");
    let mappings = vec![mapping_for_temp_root(server_id, plex_root, &movie_root)];
    let movie = load_plex_movie("131");
    let movie_item = movie_item_from_plex(&movie);
    let source = seed_mapped_file(&movie_item.file, plex_root, &movie_root, b"video");
    let subtitle_source = seed_mapped_file(
        "/mount/server/HDD1/Movies/World/Chinese/卧虎藏龙.2000.1080p.BluRay.zh.srt",
        plex_root,
        &movie_root,
        "1\n00:00:00,000 --> 00:00:01,500\n江湖很大。\n".as_bytes(),
    );
    let settings = rename_settings(json!({
        "movies": {
            "folderStructure": "genre",
            "ownFolderPerMovie": false,
            "ids": "auto_append_all"
        }
    }));
    let relative_dirs = current_relative_dirs(&movie_item.file, plex_root);

    let operation = propose_movie_rename_operation(
        &movie_item,
        "{title}[ ({year})][ {ids}]",
        &settings,
        Some(&relative_dirs),
    )
    .expect("movie proposal from Plex fixture");

    assert_eq!(operation.original_path, movie_item.file);
    assert!(operation.new_path.starts_with("Wuxia/卧虎藏龙 (2000)/"));
    assert!(operation.new_path.contains("{imdb-tt0190332}"));
    assert!(operation.new_path.contains("{tmdb-146}"));

    let result =
        apply_operations_with_mappings_to_log_path(&[operation], &mappings, server_id, &log_path)
            .expect("apply generated movie operation");

    assert!(result.success, "apply should succeed: {:?}", result.errors);
    assert_eq!(result.operations_applied, 2);
    assert_eq!(result.operations_failed, 0);

    let video_target = result
        .operations
        .iter()
        .find(|operation| operation.operation_id == "movie_131")
        .map(|operation| PathBuf::from(&operation.new_path))
        .expect("video operation result");
    let subtitle_target = result
        .operations
        .iter()
        .find(|operation| operation.operation_id.starts_with("subtitle_auto_"))
        .map(|operation| PathBuf::from(&operation.new_path))
        .expect("auto subtitle operation result");

    assert!(!source.exists(), "source video should move");
    assert!(!subtitle_source.exists(), "source subtitle should move");
    assert!(video_target.exists(), "video target should exist");
    assert!(subtitle_target.exists(), "subtitle target should exist");
    assert!(subtitle_target
        .file_name()
        .expect("subtitle target filename")
        .to_string_lossy()
        .contains(".zh.srt"));

    let entries = read_log_entries(&log_path);
    assert_eq!(entries.len(), 2);
    assert!(entries.iter().all(|entry| entry["status"] == "success"));

    let undo = undo_operations_from_log_path(&log_path).expect("undo generated movie operation");
    assert!(undo.success, "undo should succeed: {:?}", undo.errors);
    assert!(source.exists(), "source video should be restored");
    assert!(
        subtitle_source.exists(),
        "source subtitle should be restored"
    );
    assert!(!video_target.exists(), "video target should be removed");
    assert!(
        !subtitle_target.exists(),
        "subtitle target should be removed"
    );
}

#[test]
fn mock_fixture_tv_multi_episode_generates_template_settings_apply_and_undo() {
    let tempdir = tempfile::tempdir().expect("temp dir");
    let server_id = "mock-server";
    let plex_root = "/share/plex/Series";
    let tv_root = tempdir.path().join("TV");
    let log_path = tempdir.path().join("logs").join("tv-unicode-double.json");
    let mappings = vec![mapping_for_temp_root(server_id, plex_root, &tv_root)];
    let episode = load_plex_episodes()
        .into_iter()
        .find(|episode| episode.rating_key == "2243")
        .expect("multilingual double-episode fixture");
    let episode_item = episode_item_from_plex(&episode);
    let source = seed_mapped_file(&episode_item.file, plex_root, &tv_root, b"video");
    let thai_subtitle_source = seed_mapped_file(
        "/share/plex/Series/夜市食堂/Season 01/夜市食堂.S01E03E04.ตลาดกลางคืน.tha.srt",
        plex_root,
        &tv_root,
        "1\n00:00:00,000 --> 00:00:01,500\nตลาดยังไม่หลับ\n".as_bytes(),
    );
    let armenian_subtitle_source = seed_mapped_file(
        "/share/plex/Series/夜市食堂/Season 01/夜市食堂.S01E03E04.ตลาดกลางคืน.arm.srt",
        plex_root,
        &tv_root,
        "1\n00:00:00,000 --> 00:00:01,500\nԳիշերը դեռ տաք է։\n".as_bytes(),
    );
    let settings = rename_settings(json!({
        "tv": {
            "seasonFolders": true,
            "normalizeMultiEpisode": true
        }
    }));

    let operation = propose_episode_rename_operation(
        &episode_item,
        "{grandparentTitle} - S{parentIndex:02}E{index:02} - {title}",
        &settings,
    )
    .expect("episode proposal from Plex fixture");

    assert_eq!(operation.original_path, episode_item.file);
    assert_eq!(
        operation.new_path,
        "Season 01/夜市食堂 - S01E03-E04 - ตลาดกลางคืน.mkv"
    );

    let result =
        apply_operations_with_mappings_to_log_path(&[operation], &mappings, server_id, &log_path)
            .expect("apply generated episode operation");

    assert!(result.success, "apply should succeed: {:?}", result.errors);
    assert_eq!(result.operations_applied, 3);
    assert_eq!(result.operations_failed, 0);

    let video_target = result
        .operations
        .iter()
        .find(|operation| operation.operation_id == "episode_2243")
        .map(|operation| PathBuf::from(&operation.new_path))
        .expect("episode operation result");
    let subtitle_targets: Vec<PathBuf> = result
        .operations
        .iter()
        .filter(|operation| operation.operation_id.starts_with("subtitle_auto_"))
        .map(|operation| PathBuf::from(&operation.new_path))
        .collect();

    assert_eq!(subtitle_targets.len(), 2);
    assert!(!source.exists(), "source video should move");
    assert!(
        !thai_subtitle_source.exists(),
        "Thai subtitle source should move"
    );
    assert!(
        !armenian_subtitle_source.exists(),
        "Armenian subtitle source should move"
    );
    assert!(video_target.exists(), "video target should exist");
    assert!(subtitle_targets.iter().any(|path| path
        .file_name()
        .expect("subtitle filename")
        .to_string_lossy()
        .contains(".tha.srt")));
    assert!(subtitle_targets.iter().any(|path| path
        .file_name()
        .expect("subtitle filename")
        .to_string_lossy()
        .contains(".arm.srt")));

    let undo = undo_operations_from_log_path(&log_path).expect("undo generated episode operation");
    assert!(undo.success, "undo should succeed: {:?}", undo.errors);
    assert!(source.exists(), "source video should be restored");
    assert!(
        thai_subtitle_source.exists(),
        "Thai subtitle source should be restored"
    );
    assert!(
        armenian_subtitle_source.exists(),
        "Armenian subtitle source should be restored"
    );
    assert!(!video_target.exists(), "video target should be removed");
    for subtitle_target in subtitle_targets {
        assert!(
            !subtitle_target.exists(),
            "subtitle target should be removed"
        );
    }
}

#[test]
fn mock_fixture_movie_collection_grouping_generates_and_applies_folder_path() {
    let tempdir = tempfile::tempdir().expect("temp dir");
    let server_id = "mock-server";
    let plex_root = "/mount/server/HDD1/Movies";
    let movie_root = tempdir.path().join("Movies");
    let log_path = tempdir
        .path()
        .join("logs")
        .join("movie-collection-folder.json");
    let mappings = vec![mapping_for_temp_root(server_id, plex_root, &movie_root)];
    let movie = load_plex_movie("101");
    let movie_item = movie_item_from_plex(&movie);
    let source = seed_mapped_file(&movie_item.file, plex_root, &movie_root, b"video");
    let settings = rename_settings(json!({
        "movies": {
            "collections": {
                "enabled": true,
                "mode": "always",
                "format": "{collection}"
            },
            "folderStructure": "none",
            "ownFolderPerMovie": false
        }
    }));
    let relative_dirs = current_relative_dirs(&movie_item.file, plex_root);

    let operation = propose_movie_rename_operation(
        &movie_item,
        "{title}[ ({year})]",
        &settings,
        Some(&relative_dirs),
    )
    .expect("collection movie proposal from Plex fixture");

    assert_eq!(
        operation.new_path,
        "Incoming/Christopher Nolan Collection/Interstellar (2014).mkv"
    );

    let result =
        apply_operations_with_mappings_to_log_path(&[operation], &mappings, server_id, &log_path)
            .expect("apply collection operation");

    assert!(result.success, "apply should succeed: {:?}", result.errors);
    assert_eq!(result.operations_applied, 1);
    assert!(!source.exists(), "source video should move");

    let target = movie_root
        .join("Incoming")
        .join("Christopher Nolan Collection")
        .join("Interstellar (2014).mkv");
    assert!(target.exists(), "collection target should exist");

    let undo = undo_operations_from_log_path(&log_path).expect("undo collection operation");
    assert!(undo.success, "undo should succeed: {:?}", undo.errors);
    assert!(source.exists(), "source video should be restored");
    assert!(!target.exists(), "target should be removed");
}

#[test]
fn mock_fixture_movie_year_decade_generates_and_applies_folder_path() {
    let tempdir = tempfile::tempdir().expect("temp dir");
    let server_id = "mock-server";
    let plex_root = "/mount/server/HDD1/Movies";
    let movie_root = tempdir.path().join("Movies");
    let log_path = tempdir.path().join("logs").join("movie-decade-folder.json");
    let mappings = vec![mapping_for_temp_root(server_id, plex_root, &movie_root)];
    let movie = load_plex_movie("134");
    let movie_item = movie_item_from_plex(&movie);
    let source = seed_mapped_file(&movie_item.file, plex_root, &movie_root, b"video");
    let settings = rename_settings(json!({
        "movies": {
            "folderStructure": "year_decade",
            "ownFolderPerMovie": false,
            "collections": {
                "enabled": false
            }
        }
    }));
    let relative_dirs = current_relative_dirs(&movie_item.file, plex_root);

    let operation = propose_movie_rename_operation(
        &movie_item,
        "{title}[ ({year})]",
        &settings,
        Some(&relative_dirs),
    )
    .expect("year-decade movie proposal from Plex fixture");

    assert_eq!(
        operation.new_path,
        "1960-1969/Նռան գույնը/Նռան գույնը (1969).mkv"
    );

    let result =
        apply_operations_with_mappings_to_log_path(&[operation], &mappings, server_id, &log_path)
            .expect("apply decade operation");

    assert!(result.success, "apply should succeed: {:?}", result.errors);
    assert_eq!(result.operations_applied, 1);
    assert!(!source.exists(), "source video should move");

    let target = movie_root
        .join("1960-1969")
        .join("Նռան գույնը")
        .join("Նռան գույնը (1969).mkv");
    assert!(target.exists(), "decade target should exist");

    let undo = undo_operations_from_log_path(&log_path).expect("undo decade operation");
    assert!(undo.success, "undo should succeed: {:?}", undo.errors);
    assert!(source.exists(), "source video should be restored");
    assert!(!target.exists(), "target should be removed");
}

#[test]
fn mock_fixture_generated_movie_operation_reports_existing_target_conflict() {
    let tempdir = tempfile::tempdir().expect("temp dir");
    let server_id = "mock-server";
    let plex_root = "/mount/server/HDD1/Movies";
    let movie_root = tempdir.path().join("Movies");
    let log_path = tempdir.path().join("logs").join("movie-conflict.json");
    let mappings = vec![mapping_for_temp_root(server_id, plex_root, &movie_root)];
    let movie = load_plex_movie("103");
    let movie_item = movie_item_from_plex(&movie);
    let source = seed_mapped_file(&movie_item.file, plex_root, &movie_root, b"source-video");
    let settings = rename_settings(json!({
        "movies": {
            "folderStructure": "none",
            "ownFolderPerMovie": false,
            "collections": {
                "enabled": false
            }
        }
    }));
    let relative_dirs = current_relative_dirs(&movie_item.file, plex_root);

    let operation = propose_movie_rename_operation(
        &movie_item,
        "{title}[ ({year})]",
        &settings,
        Some(&relative_dirs),
    )
    .expect("conflict movie proposal from Plex fixture");

    assert_eq!(operation.new_path, "Conflicts/Conflict Movie (2020).mkv");
    let conflict_target = movie_root
        .join("Conflicts")
        .join("Conflict Movie (2020).mkv");
    fs::create_dir_all(conflict_target.parent().expect("conflict parent"))
        .expect("create conflict parent");
    fs::write(&conflict_target, b"existing-target").expect("seed existing target");

    let result =
        apply_operations_with_mappings_to_log_path(&[operation], &mappings, server_id, &log_path)
            .expect("conflict apply should return a batch result");

    assert!(!result.success, "conflict apply should fail");
    assert_eq!(result.operations_applied, 0);
    assert_eq!(result.operations_failed, 1);
    assert!(result
        .errors
        .iter()
        .any(|error| error.contains("Target already exists")));
    assert!(source.exists(), "source video should remain");
    assert_eq!(
        fs::read(&conflict_target).expect("read conflict target"),
        b"existing-target"
    );

    let entries = read_log_entries(&log_path);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["status"], "failed");
}
