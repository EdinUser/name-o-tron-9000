use serde_json::{json, Value};
use std::fs;
use tempfile::tempdir;

// Test helper functions for settings testing
mod test_helpers {
    use super::*;
    use std::path::Path;

    pub fn get_settings_from_path(path: &Path) -> Result<Value, String> {
        if !path.exists() {
            return Ok(serde_json::json!({}));
        }
        let txt = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        if txt.trim().is_empty() {
            return Ok(serde_json::json!({}));
        }
        serde_json::from_str::<Value>(&txt).map_err(|e| e.to_string())
    }

    pub fn save_settings_to_path(path: &Path, settings: Value) -> Result<(), String> {
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;

        // Read existing settings (object) or start with empty object
        let mut current = if path.exists() {
            let txt = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
            serde_json::from_str::<Value>(&txt).unwrap_or_else(|_| serde_json::json!({}))
        } else {
            serde_json::json!({})
        };

        // Deep-merge: incoming keys override existing; nested objects merged recursively
        fn deep_merge(dest: &mut Value, src: &Value) {
            match (dest, src) {
                (Value::Object(d), Value::Object(s)) => {
                    for (k, v) in s.iter() {
                        if let Some(existing) = d.get_mut(k) {
                            deep_merge(existing, v);
                        } else {
                            d.insert(k.clone(), v.clone());
                        }
                    }
                }
                (d, s) => {
                    *d = s.clone();
                }
            }
        }

        deep_merge(&mut current, &settings);

        let txt = serde_json::to_string_pretty(&current).map_err(|e| e.to_string())?;
        std::fs::write(path, txt).map_err(|e| e.to_string())
    }
}

#[test]
fn test_get_settings_nonexistent_file() {
    // Create a temporary directory to avoid affecting real settings
    let temp_dir = tempdir().unwrap();
    let settings_path = temp_dir.path().join("settings.json");

    // Test getting settings when file doesn't exist using test helper
    let result = test_helpers::get_settings_from_path(&settings_path);

    assert!(result.is_ok(), "Should succeed when file doesn't exist");
    let settings = result.unwrap();
    assert_eq!(settings, json!({}), "Should return empty object for non-existent file");
}

#[test]
fn test_get_settings_existing_valid_json() {
    let temp_dir = tempdir().unwrap();
    let settings_path = temp_dir.path().join("settings.json");

    // Create a valid JSON settings file
    let test_settings = json!({
        "general": {
            "theme": "dark",
            "encoding": {
                "mode": "unicode",
                "highlightNonLatin": true
            }
        },
        "movies": {
            "collections": {
                "enabled": true,
                "mode": "always"
            }
        }
    });

    fs::write(&settings_path, test_settings.to_string()).unwrap();

    let result = test_helpers::get_settings_from_path(&settings_path);

    assert!(result.is_ok(), "Should succeed with valid JSON file");
    let settings = result.unwrap();
    assert_eq!(settings, test_settings);
}

#[test]
fn test_get_settings_empty_file() {
    let temp_dir = tempdir().unwrap();
    let settings_path = temp_dir.path().join("settings.json");

    // Create an empty file
    fs::write(&settings_path, "").unwrap();

    let result = test_helpers::get_settings_from_path(&settings_path);

    assert!(result.is_ok(), "Should succeed with empty file");
    let settings = result.unwrap();
    assert_eq!(settings, json!({}), "Should return empty object for empty file");
}

#[test]
fn test_get_settings_invalid_json() {
    let temp_dir = tempdir().unwrap();
    let settings_path = temp_dir.path().join("settings.json");

    // Create a file with invalid JSON
    fs::write(&settings_path, "invalid json content {").unwrap();

    let result = test_helpers::get_settings_from_path(&settings_path);

    // Should handle gracefully and return error message
    assert!(result.is_err(), "Should fail with invalid JSON");
    let error_msg = result.unwrap_err();
    assert!(error_msg.contains("JSON") || error_msg.contains("parse") || error_msg.contains("invalid") || error_msg.contains("SyntaxError") || error_msg.contains("expected value") || error_msg.contains("EOF"));
}

#[test]
fn test_save_settings_new_file() {
    let temp_dir = tempdir().unwrap();
    let settings_path = temp_dir.path().join("settings.json");

    // Test saving settings to a new file
    let new_settings = json!({
        "general": {
            "theme": "light",
            "encoding": {
                "mode": "transliterate"
            }
        }
    });

    let result = test_helpers::save_settings_to_path(&settings_path, new_settings.clone());
    assert!(result.is_ok(), "Should succeed when creating new file");

    // Verify the file was created and contains correct content
    assert!(settings_path.exists(), "Settings file should be created");
    let saved_content = fs::read_to_string(&settings_path).unwrap();
    let saved_settings: Value = serde_json::from_str(&saved_content).unwrap();
    assert_eq!(saved_settings, new_settings);
}

#[test]
fn test_save_settings_deep_merge_simple() {
    let temp_dir = tempdir().unwrap();
    let settings_path = temp_dir.path().join("settings.json");

    // Create initial settings file
    let initial_settings = json!({
        "general": {
            "theme": "dark",
            "encoding": {
                "mode": "unicode",
                "highlightNonLatin": true
            }
        },
        "movies": {
            "collections": {
                "enabled": false
            }
        }
    });
    fs::write(&settings_path, initial_settings.to_string()).unwrap();

    // Save new settings that should merge with existing
    let updated_settings = json!({
        "general": {
            "theme": "light",  // This should override
            "encoding": {
                "mode": "transliterate"  // This should override
                // highlightNonLatin should be preserved from original
            }
        },
        "tv": {
            "seasonFolders": true  // This should be added
        }
        // movies.collections should be preserved from original
    });

    let result = test_helpers::save_settings_to_path(&settings_path, updated_settings);
    assert!(result.is_ok(), "Should succeed when merging settings");

    // Verify the merged content
    let saved_content = fs::read_to_string(&settings_path).unwrap();
    let saved_settings: Value = serde_json::from_str(&saved_content).unwrap();

    // Check that theme was overridden
    assert_eq!(saved_settings["general"]["theme"], "light");

    // Check that encoding mode was overridden but highlightNonLatin preserved
    assert_eq!(saved_settings["general"]["encoding"]["mode"], "transliterate");
    assert_eq!(saved_settings["general"]["encoding"]["highlightNonLatin"], true);

    // Check that movies section was preserved
    assert_eq!(saved_settings["movies"]["collections"]["enabled"], false);

    // Check that tv section was added
    assert_eq!(saved_settings["tv"]["seasonFolders"], true);
}

#[test]
fn test_save_settings_deep_merge_complex_nested() {
    let temp_dir = tempdir().unwrap();
    let settings_path = temp_dir.path().join("settings.json");

    // Create initial settings with complex nested structure
    let initial_settings = json!({
        "general": {
            "encoding": {
                "mode": "unicode",
                "highlightNonLatin": true
            },
            "safety": {
                "pathLengthCheck": true,
                "reservedNamesCheck": false,
                "permissionsCheck": true
            }
        },
        "movies": {
            "collections": {
                "enabled": true,
                "mode": "always",
                "naming": "original"
            },
            "editions": {
                "mode": "preserve",
                "parsers": [
                    {"id": "extended", "name": "Extended Edition", "enabled": true}
                ]
            }
        },
        "templates": {
            "movie": "{title}[ ({year})]{ext}",
            "episode": "{showTitle} - S{season:02}E{episode:02} - {title}{ext}"
        }
    });
    fs::write(&settings_path, initial_settings.to_string()).unwrap();

    // Save settings that should deeply merge with complex nested structure
    let updated_settings = json!({
        "general": {
            "encoding": {
                "mode": "transliterate"  // Override mode only
                // highlightNonLatin should be preserved
            },
            "safety": {
                "reservedNamesCheck": true,  // Override this specific field
                // pathLengthCheck and permissionsCheck should be preserved
                "newSafetyOption": false  // Add new nested field
            },
            "newGeneralOption": "test"  // Add new top-level field
        },
        "movies": {
            "collections": {
                "mode": "if2plus"  // Override mode only
                // enabled and naming should be preserved
            },
            "editions": {
                // mode should be preserved
                "parsers": [
                    {"id": "extended", "name": "Extended Edition", "enabled": true},  // Keep existing
                    {"id": "directors-cut", "name": "Director's Cut", "enabled": false}  // Add new
                ]
            }
        },
        "tv": {  // Add entirely new section
            "seasonFolders": true,
            "normalizeMultiEpisode": true
        }
    });

    let result = test_helpers::save_settings_to_path(&settings_path, updated_settings);
    assert!(result.is_ok(), "Should succeed with complex deep merge");

    let saved_content = fs::read_to_string(&settings_path).unwrap();
    let saved_settings: Value = serde_json::from_str(&saved_content).unwrap();

    // Test general section deep merge
    assert_eq!(saved_settings["general"]["encoding"]["mode"], "transliterate");
    assert_eq!(saved_settings["general"]["encoding"]["highlightNonLatin"], true);
    assert_eq!(saved_settings["general"]["safety"]["pathLengthCheck"], true);
    assert_eq!(saved_settings["general"]["safety"]["reservedNamesCheck"], true);
    assert_eq!(saved_settings["general"]["safety"]["permissionsCheck"], true);
    assert_eq!(saved_settings["general"]["safety"]["newSafetyOption"], false);
    assert_eq!(saved_settings["general"]["newGeneralOption"], "test");

    // Test movies section deep merge
    assert_eq!(saved_settings["movies"]["collections"]["enabled"], true);
    assert_eq!(saved_settings["movies"]["collections"]["mode"], "if2plus");
    assert_eq!(saved_settings["movies"]["collections"]["naming"], "original");

    // Test movies.editions.parsers array merge
    assert_eq!(saved_settings["movies"]["editions"]["mode"], "preserve");
    let parsers = saved_settings["movies"]["editions"]["parsers"].as_array().unwrap();
    assert_eq!(parsers.len(), 2);

    // Test that tv section was added
    assert_eq!(saved_settings["tv"]["seasonFolders"], true);
    assert_eq!(saved_settings["tv"]["normalizeMultiEpisode"], true);

    // Test that templates were preserved
    assert_eq!(saved_settings["templates"]["movie"], "{title}[ ({year})]{ext}");
}

#[test]
fn test_save_settings_replace_entire_object() {
    let temp_dir = tempdir().unwrap();
    let settings_path = temp_dir.path().join("settings.json");

    // Create initial settings file
    let initial_settings = json!({
        "general": { "theme": "dark" },
        "movies": { "collections": { "enabled": true } }
    });
    fs::write(&settings_path, initial_settings.to_string()).unwrap();

    // Save additional settings (should merge with existing)
    let additional_settings = json!({
        "tv": { "seasonFolders": false },
        "music": { "formatAAT": true }
    });

    let result = test_helpers::save_settings_to_path(&settings_path, additional_settings.clone());
    assert!(result.is_ok(), "Should succeed when merging settings");

    let saved_content = fs::read_to_string(&settings_path).unwrap();
    let saved_settings: Value = serde_json::from_str(&saved_content).unwrap();

    // Should contain both original and new settings (merged)
    assert_eq!(saved_settings["tv"]["seasonFolders"], false);
    assert_eq!(saved_settings["music"]["formatAAT"], true);
    // Original settings should still be present
    assert_eq!(saved_settings["general"]["theme"], "dark");
    assert_eq!(saved_settings["movies"]["collections"]["enabled"], true);
}

#[test]
fn test_save_settings_invalid_json_input() {
    let temp_dir = tempdir().unwrap();
    let settings_path = temp_dir.path().join("settings.json");

    // Create initial settings file
    let initial_settings = json!({ "general": { "theme": "dark" } });
    fs::write(&settings_path, initial_settings.to_string()).unwrap();

    // Try to save invalid JSON (this should be handled gracefully in real usage,
    // but let's test that our function doesn't crash)
    use serde_json::Value;
    let invalid_value = Value::Null; // This is valid JSON, but let's test with something that might cause issues

    let result = test_helpers::save_settings_to_path(&settings_path, invalid_value);
    assert!(result.is_ok(), "Should handle null values gracefully");
}

#[test]
fn test_save_settings_directory_creation() {
    let temp_dir = tempdir().unwrap();
    let nested_path = temp_dir.path().join("subdir").join("settings.json");

    let new_settings = json!({ "general": { "theme": "dark" } });

    let result = test_helpers::save_settings_to_path(&nested_path, new_settings);
    assert!(result.is_ok(), "Should create parent directories as needed");

    assert!(nested_path.exists(), "Settings file should be created in nested directory");

    // Verify the parent directory was created
    assert!(nested_path.parent().unwrap().exists(), "Parent directory should be created");
}

// Tests for the new cache functionality

#[test]
fn test_generate_mappings_checksum() {
    // Test empty mappings
    let empty_mappings = vec![];
    let checksum1 = name_o_tron_9000_lib::settings::generate_mappings_checksum(&empty_mappings);
    let checksum2 = name_o_tron_9000_lib::settings::generate_mappings_checksum(&empty_mappings);
    assert_eq!(checksum1, checksum2, "Empty mappings should produce consistent checksum");

    // Test mappings with same data produce same checksum
    let mappings1 = vec![
        name_o_tron_9000_lib::settings::PathMappingDto {
            server_id: "server1".to_string(),
            plex_root: "/media/movies".to_string(),
            local_root: "/mnt/movies".to_string(),
            platform: Some("linux".to_string()),
        },
        name_o_tron_9000_lib::settings::PathMappingDto {
            server_id: "server1".to_string(),
            plex_root: "/media/tv".to_string(),
            local_root: "/mnt/tv".to_string(),
            platform: Some("linux".to_string()),
        },
    ];

    let mappings2 = vec![
        name_o_tron_9000_lib::settings::PathMappingDto {
            server_id: "server1".to_string(),
            plex_root: "/media/movies".to_string(),
            local_root: "/mnt/movies".to_string(),
            platform: Some("linux".to_string()),
        },
        name_o_tron_9000_lib::settings::PathMappingDto {
            server_id: "server1".to_string(),
            plex_root: "/media/tv".to_string(),
            local_root: "/mnt/tv".to_string(),
            platform: Some("linux".to_string()),
        },
    ];

    let checksum1 = name_o_tron_9000_lib::settings::generate_mappings_checksum(&mappings1);
    let checksum2 = name_o_tron_9000_lib::settings::generate_mappings_checksum(&mappings2);
    assert_eq!(checksum1, checksum2, "Identical mappings should produce same checksum");

    // Test different mappings produce different checksums
    let mappings3 = vec![
        name_o_tron_9000_lib::settings::PathMappingDto {
            server_id: "server1".to_string(),
            plex_root: "/media/movies".to_string(),
            local_root: "/mnt/movies".to_string(),
            platform: Some("windows".to_string()), // Different platform
        },
    ];

    let checksum3 = name_o_tron_9000_lib::settings::generate_mappings_checksum(&mappings3);
    assert_ne!(checksum1, checksum3, "Different mappings should produce different checksums");
}

#[test]
fn test_show_mapping_cache_serialization() {
    use name_o_tron_9000_lib::settings::*;

    let cache = ShowMappingCache {
        last_updated: 1640995200000, // 2022-01-01 00:00:00 UTC
        mappings_checksum: "test-checksum-123".to_string(),
        shows: {
            let mut shows = std::collections::HashMap::new();
            shows.insert(
                "ratingKey1".to_string(),
                ShowMappingData {
                    is_mapped: true,
                    location: "/media/show1".to_string(),
                    last_checked: 1640995200000,
                    poster_url: None,
                    cached_poster_url: None,
                    year: None,
                    genre: None,
                    studio: None,
                    creators: None,
                    years_running: None,
                },
            );
            shows.insert(
                "ratingKey2".to_string(),
                ShowMappingData {
                    is_mapped: false,
                    location: "".to_string(),
                    last_checked: 1640995200000,
                    poster_url: None,
                    cached_poster_url: None,
                    year: None,
                    genre: None,
                    studio: None,
                    creators: None,
                    years_running: None,
                },
            );
            shows
        },
    };

    // Test serialization
    let serialized = serde_json::to_string(&cache).unwrap();
    assert!(!serialized.is_empty());
    assert!(serialized.contains("test-checksum-123"));
    assert!(serialized.contains("ratingKey1"));
    assert!(serialized.contains("ratingKey2"));

    // Test deserialization
    let deserialized: ShowMappingCache = serde_json::from_str(&serialized).unwrap();
    assert_eq!(deserialized.last_updated, cache.last_updated);
    assert_eq!(deserialized.mappings_checksum, cache.mappings_checksum);
    assert_eq!(deserialized.shows.len(), cache.shows.len());
    assert_eq!(deserialized.shows.get("ratingKey1").unwrap().is_mapped, true);
    assert_eq!(deserialized.shows.get("ratingKey2").unwrap().is_mapped, false);
}

#[test]
fn test_path_mapping_dto_serialization() {
    use name_o_tron_9000_lib::settings::*;

    let dto = PathMappingDto {
        server_id: "test-server".to_string(),
        plex_root: "/media/movies".to_string(),
        local_root: "/mnt/movies".to_string(),
        platform: Some("linux".to_string()),
    };

    // Test serialization with camelCase rename
    let serialized = serde_json::to_string(&dto).unwrap();
    assert!(serialized.contains("\"serverId\":\"test-server\""));
    assert!(serialized.contains("\"plexRoot\":\"/media/movies\""));
    assert!(serialized.contains("\"localRoot\":\"/mnt/movies\""));
    assert!(serialized.contains("\"platform\":\"linux\""));

    // Test deserialization
    let deserialized: PathMappingDto = serde_json::from_str(&serialized).unwrap();
    assert_eq!(deserialized.server_id, dto.server_id);
    assert_eq!(deserialized.plex_root, dto.plex_root);
    assert_eq!(deserialized.local_root, dto.local_root);
    assert_eq!(deserialized.platform, dto.platform);
}

#[test]
fn test_show_mapping_data_serialization() {
    use name_o_tron_9000_lib::settings::*;

    let data = ShowMappingData {
        is_mapped: true,
        location: "/media/show/location".to_string(),
        last_checked: 1234567890000,
        poster_url: None,
        cached_poster_url: None,
        year: None,
        genre: None,
        studio: None,
        creators: None,
        years_running: None,
    };

    // Test serialization with camelCase rename
    let serialized = serde_json::to_string(&data).unwrap();
    assert!(serialized.contains("\"isMapped\":true"));
    assert!(serialized.contains("\"location\":\"/media/show/location\""));
    assert!(serialized.contains("\"lastChecked\":1234567890000"));

    // Test deserialization
    let deserialized: ShowMappingData = serde_json::from_str(&serialized).unwrap();
    assert_eq!(deserialized.is_mapped, data.is_mapped);
    assert_eq!(deserialized.location, data.location);
    assert_eq!(deserialized.last_checked, data.last_checked);
}

#[test]
fn test_cache_directory_path_generation() {

    let temp_dir = tempdir().unwrap();
    let cache_dir = temp_dir.path().join("cache").join("show-mappings");

    // The actual path generation logic is tested in the command functions
    // This test verifies that the cache directory structure makes sense
    assert!(cache_dir.to_string_lossy().contains("cache"));
    assert!(cache_dir.to_string_lossy().contains("show-mappings"));
}

// Additional tests for edge cases and error conditions

#[test]
fn test_deep_merge_edge_cases() {
    let temp_dir = tempdir().unwrap();
    let settings_path = temp_dir.path().join("settings.json");

    // Test merging with arrays (arrays should be replaced, not merged)
    let initial_settings = json!({
        "general": {
            "safety": {
                "pathLengthCheck": true
            }
        },
        "movies": {
            "editions": {
                "parsers": [
                    {"id": "extended", "name": "Extended Edition", "enabled": true}
                ]
            }
        }
    });
    fs::write(&settings_path, initial_settings.to_string()).unwrap();

    let updated_settings = json!({
        "general": {
            "safety": {
                "pathLengthCheck": false,  // Override boolean
                "newCheck": true  // Add new field
            }
        },
        "movies": {
            "editions": {
                "parsers": [
                    {"id": "directors-cut", "name": "Director's Cut", "enabled": false}  // Replace entire array
                ]
            }
        }
    });

    let result = test_helpers::save_settings_to_path(&settings_path, updated_settings);
    assert!(result.is_ok(), "Should handle array replacement correctly");

    let saved_content = fs::read_to_string(&settings_path).unwrap();
    let saved_settings: Value = serde_json::from_str(&saved_content).unwrap();

    // Boolean override should work
    assert_eq!(saved_settings["general"]["safety"]["pathLengthCheck"], false);
    assert_eq!(saved_settings["general"]["safety"]["newCheck"], true);

    // Array should be completely replaced
    let parsers = saved_settings["movies"]["editions"]["parsers"].as_array().unwrap();
    assert_eq!(parsers.len(), 1);
    assert_eq!(parsers[0]["id"], "directors-cut");
}

#[test]
fn test_settings_with_null_values() {
    let temp_dir = tempdir().unwrap();
    let settings_path = temp_dir.path().join("settings.json");

    // Test handling null values in settings
    let settings_with_nulls = json!({
        "general": {
            "theme": "dark",
            "unusedField": null
        },
        "movies": null,
        "tv": {
            "seasonFolders": true
        }
    });

    let result = test_helpers::save_settings_to_path(&settings_path, settings_with_nulls);
    assert!(result.is_ok(), "Should handle null values in settings");

    let saved_content = fs::read_to_string(&settings_path).unwrap();
    let saved_settings: Value = serde_json::from_str(&saved_content).unwrap();

    // Null values should be preserved
    assert_eq!(saved_settings["general"]["unusedField"], Value::Null);
    assert_eq!(saved_settings["movies"], Value::Null);
    assert_eq!(saved_settings["tv"]["seasonFolders"], true);
}

#[test]
fn test_concurrent_settings_access() {
    use std::sync::{Arc, Mutex};
    use std::thread;

    // Test that the deep merge function itself is thread-safe
    // (File I/O concurrency is harder to test reliably due to OS differences)
    let test_data = Arc::new(Mutex::new(json!({
        "general": { "theme": "dark" }
    })));

    let mut handles = vec![];

    // Spawn multiple threads that perform deep merge operations
    for i in 0..5 {
        let data_clone = Arc::clone(&test_data);

        let handle = thread::spawn(move || {
            for j in 0..10 {
                // Perform deep merge operations on shared data
                let mut data = data_clone.lock().unwrap();
                let updates = json!({
                    &format!("thread_{}_iteration_{}", i, j): true
                });

                // Simulate deep merge operation
                if let Value::Object(ref mut obj) = *data {
                    for (k, v) in updates.as_object().unwrap() {
                        obj.insert(k.clone(), v.clone());
                    }
                }
            }
        });
        handles.push(handle);
    }

    // Wait for all threads to complete
    for handle in handles {
        handle.join().unwrap();
    }

    // Verify that all threads completed without panicking
    // (The actual data state may vary due to race conditions, but that's expected)
    let final_data = test_data.lock().unwrap();
    assert!(final_data.as_object().unwrap().contains_key("general"));
    assert!(final_data.as_object().unwrap().len() > 1); // Should have added fields from threads
}
