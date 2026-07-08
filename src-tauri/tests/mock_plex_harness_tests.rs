use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use name_o_tron_9000_lib::path_map::PathMapping;
use name_o_tron_9000_lib::rename_types::RenameOperation;
use name_o_tron_9000_lib::video_rename::{
    apply_operations_with_mappings_to_log_path, cleanup_empty_folders_with_explicit_mappings,
    undo_operations_from_log_path,
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct ResolvedFixture {
    server_id: String,
    path_mappings: Vec<ResolvedMapping>,
    libraries: Vec<ResolvedLibrary>,
    directories: Vec<ResolvedDirectory>,
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
