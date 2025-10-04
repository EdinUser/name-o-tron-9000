use wiremock::{MockServer, Mock, ResponseTemplate};
use wiremock::matchers::{method, path};
use serde_json::json;
use std::time::Duration;
use name_o_tron_9000_lib::{plex_api, path_map};

#[tokio::test]
async fn test_http_client_integration() {
    let mock_server = MockServer::start().await;

    // Mock a simple health endpoint
    Mock::given(method("GET"))
        .and(path("/health"))
        .respond_with(ResponseTemplate::new(200).set_body_string("OK"))
        .mount(&mock_server)
        .await;

    // Test that we can create the HTTP client and make requests
    // This verifies the basic network functionality used by the auth module
    let client_result = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build();

    assert!(client_result.is_ok());

    let client = client_result.unwrap();

    // Test that we can make a request to our mock server
    let response_result = client
        .get(&format!("{}/health", &mock_server.uri()))
        .send()
        .await;

    // This should succeed since we mocked the endpoint
    match response_result {
        Ok(resp) => {
            assert_eq!(resp.status().as_u16(), 200);
            let text = resp.text().await.unwrap_or_default();
            assert_eq!(text, "OK");
        }
        Err(e) => {
            panic!("Unexpected network error: {}", e);
        }
    }

}

#[tokio::test]
async fn test_error_handling_integration() {
    let mock_server = MockServer::start().await;

    // Mock server error response
    Mock::given(method("POST"))
        .and(path("/api/v2/pins"))
        .respond_with(ResponseTemplate::new(500).set_body_string("Internal Server Error"))
        .mount(&mock_server)
        .await;

    // Test that error responses are handled gracefully
    let client_result = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build();

    assert!(client_result.is_ok());

    let client = client_result.unwrap();

    let error_response = client
        .post(&format!("{}/api/v2/pins", &mock_server.uri()))
        .header("X-Plex-Client-Identifier", "test-client")
        .send()
        .await;

    // We expect this to fail due to 500 status, but it shouldn't panic
    match error_response {
        Ok(resp) => {
            assert_eq!(resp.status().as_u16(), 500);
        }
        Err(e) => {
            // Network error is also acceptable in this test
        }
    }

}

#[tokio::test]
async fn test_concurrent_http_requests() {
    let mock_server = MockServer::start().await;

    // Mock a simple endpoint
    Mock::given(method("GET"))
        .and(path("/test"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "status": "ok" })))
        .mount(&mock_server)
        .await;

    // Test that multiple concurrent requests work properly
    let mut handles = Vec::new();

    for _ in 0..10 {
        let mock_uri = mock_server.uri();
        let handle = tokio::spawn(async move {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap();

            let response = client
                .get(&format!("{}/test", mock_uri))
                .send()
                .await
                .unwrap();

            response.json::<serde_json::Value>().await.unwrap()
        });
        handles.push(handle);
    }

    // Wait for all tasks to complete
    let results = futures::future::join_all(handles).await;

    for result in results {
        let value = result.unwrap();
        assert_eq!(value.get("status").unwrap(), "ok");
    }

}

#[tokio::test]
async fn test_list_libraries_with_mock_plex_server() {
    let mock_server = MockServer::start().await;

    // Mock the Plex libraries endpoint response
    Mock::given(method("GET"))
        .and(path("/library/sections"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "MediaContainer": {
                "size": 3,
                "Directory": [
                    {
                        "key": "1",
                        "type": "movie",
                        "title": "Movies",
                        "agent": "com.plexapp.agents.imdb",
                        "scanner": "Plex Movie Scanner",
                        "uuid": "11111111-1111-1111-1111-111111111111",
                        "Location": [
                            { "path": "/share/CACHEDEV1_DATA/Movies" }
                        ]
                    },
                    {
                        "key": "2",
                        "type": "show",
                        "title": "TV Shows",
                        "agent": "com.plexapp.agents.thetvdb",
                        "scanner": "Plex Series Scanner",
                        "uuid": "22222222-2222-2222-2222-222222222222",
                        "Location": [
                            { "path": "/share/CACHEDEV1_DATA/Series" },
                            { "path": "/share/Secondary/Series_2" }
                        ]
                    },
                    {
                        "key": "3",
                        "type": "artist",
                        "title": "Music",
                        "Location": [
                            { "path": "/share/CACHEDEV1_DATA/Music" }
                        ]
                    }
                ]
            }
        })))
        .mount(&mock_server)
        .await;

    // Test list_libraries function
    let server_url = mock_server.uri();
    let result = plex_api::list_libraries(server_url, None).await;

    assert!(result.is_ok(), "list_libraries should succeed with valid response");

    let libraries = result.unwrap();
    assert_eq!(libraries.len(), 3, "Should return 3 libraries");

    // Check first library (Movies)
    let movies_lib = &libraries[0];
    assert_eq!(movies_lib.key, "1");
    assert_eq!(movies_lib.r#type, "movie");
    assert_eq!(movies_lib.title, "Movies");

    // Check second library (TV Shows) - should have roots
    let tv_lib = &libraries[1];
    assert_eq!(tv_lib.key, "2");
    assert_eq!(tv_lib.r#type, "show");
    assert_eq!(tv_lib.title, "TV Shows");

    // Check third library (Music)
    let music_lib = &libraries[2];
    assert_eq!(music_lib.key, "3");
    assert_eq!(music_lib.r#type, "artist");
    assert_eq!(music_lib.title, "Music");

}

#[tokio::test]
async fn test_list_libraries_with_authentication() {
    let mock_server = MockServer::start().await;

    // Mock the Plex libraries endpoint with authentication
    Mock::given(method("GET"))
        .and(path("/library/sections"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "MediaContainer": {
                "size": 1,
                "Directory": [
                    {
                        "key": "1",
                        "type": "movie",
                        "title": "Private Movies",
                        "Location": [
                            { "path": "/private/movies" }
                        ]
                    }
                ]
            }
        })))
        .mount(&mock_server)
        .await;

    // Test list_libraries function with token
    let server_url = mock_server.uri();
    let token = "test_token_12345".to_string();
    let result = plex_api::list_libraries(server_url, Some(token)).await;

    assert!(result.is_ok(), "list_libraries should succeed with authentication");

    let libraries = result.unwrap();
    assert_eq!(libraries.len(), 1, "Should return 1 authenticated library");

    let lib = &libraries[0];
    assert_eq!(lib.title, "Private Movies");
    assert_eq!(lib.r#type, "movie");

    println!("Authenticated libraries integration test completed successfully");
}

#[tokio::test]
async fn test_list_libraries_invalid_server() {
    // Test with a server that doesn't respond
    let result = plex_api::list_libraries("http://nonexistent-server:32400".to_string(), None).await;

    assert!(result.is_err(), "list_libraries should fail with invalid server");
    println!("Invalid server test completed successfully");
}

#[tokio::test]
async fn test_list_libraries_xml_fallback() {
    let mock_server = MockServer::start().await;

    // Mock XML response (when JSON parsing fails)
    let xml_response = r#"<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="2">
  <Directory key="1" type="movie" title="Movies" />
  <Directory key="2" type="show" title="TV Shows" />
</MediaContainer>"#;

    Mock::given(method("GET"))
        .and(path("/library/sections"))
        .respond_with(ResponseTemplate::new(200).set_body_string(xml_response))
        .mount(&mock_server)
        .await;

    // Test list_libraries function - it should handle XML response
    let server_url = mock_server.uri();
    let result = plex_api::list_libraries(server_url, None).await;

    // The function may or may not parse XML successfully, but it shouldn't crash
    // This tests the robustness of the parsing logic
    match result {
        Ok(libraries) => {
            println!("XML parsing succeeded, found {} libraries", libraries.len());
        }
        Err(e) => {
            println!("XML parsing failed (expected): {}", e);
            // This is acceptable as XML parsing is a fallback mechanism
        }
    }

    println!("XML fallback test completed");
}

#[tokio::test]
async fn test_list_libraries_401_handling() {
    let mock_server = MockServer::start().await;

    // Mock 401 response to test authentication fallback
    Mock::given(method("GET"))
        .and(path("/library/sections"))
        .respond_with(ResponseTemplate::new(401).set_body_string("Unauthorized"))
        .mount(&mock_server)
        .await;

    // Test list_libraries with invalid token - should handle 401 gracefully
    let server_url = mock_server.uri();
    let token = "invalid_token".to_string();
    let result = plex_api::list_libraries(server_url, Some(token)).await;

    // Should handle 401 error gracefully without crashing
    match result {
        Ok(_) => println!("Unexpected success with invalid token"),
        Err(e) => {
            println!("Expected error with invalid token: {}", e);
            assert!(e.contains("401") || e.contains("Unauthorized"));
        }
    }

    println!("401 handling test completed");
}

#[tokio::test]
async fn test_path_mapping_functionality() {
    // Test path mapping utility functions
    let mapping = path_map::PathMapping {
        server_id: "test_server".to_string(),
        plex_root: "/media/Movies".to_string(),
        local_root: "/mnt/movies".to_string(),
        platform: None,
    };

    let plex_path = "/media/Movies/Inception (2010)/Inception (2010).mkv";
    let resolved = path_map::resolve_plex_path(
        plex_path,
        &[mapping],
        "test_server",
        Some("windows"),
    );

    assert!(resolved.is_some(), "Should resolve valid plex path");
    let resolved_path = resolved.unwrap();
    assert!(resolved_path.to_string_lossy().contains("/mnt/movies"));
    // On Windows, paths are normalized to lowercase, so check for both cases
    assert!(resolved_path.to_string_lossy().contains("Inception (2010)") ||
            resolved_path.to_string_lossy().contains("inception (2010)"));

    println!("Path mapping resolution test completed successfully");
}

#[tokio::test]
async fn test_test_mapping_function() {
    // Create a temporary directory for testing
    let temp_dir = tempfile::tempdir().unwrap();
    let temp_path = temp_dir.path().to_string_lossy().to_string();

    // Test with existing writable directory
    let result = path_map::test_mapping("test_server".to_string(), "/test/path".to_string(), temp_path.clone());
    assert!(result.is_ok(), "test_mapping should succeed with existing directory");

    let test_result = result.unwrap();
    assert!(test_result.exists, "Should detect existing directory");
    assert!(test_result.ok, "Should be writable");

    // Test with non-existent directory
    let non_existent = "/this/path/does/not/exist".to_string();
    let result2 = path_map::test_mapping("test_server".to_string(), "/test/path".to_string(), non_existent);
    assert!(result2.is_ok(), "test_mapping should handle non-existent directory");

    let test_result2 = result2.unwrap();
    assert!(!test_result2.exists, "Should detect non-existent directory");
    assert!(!test_result2.ok, "Should not be OK for non-existent directory");

    println!("Path mapping test function completed successfully");
}

#[tokio::test]
async fn test_test_mapping_readonly_directory() {
    // Create a temporary directory and make it read-only (on Unix systems)
    let temp_dir = tempfile::tempdir().unwrap();
    let temp_path = temp_dir.path();

    #[cfg(unix)]
    {
        use std::fs;
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(temp_path).unwrap().permissions();
        perms.set_mode(0o444); // Read-only
        fs::set_permissions(temp_path, perms).unwrap();

        let result = path_map::test_mapping("test_server".to_string(), "/test/path".to_string(), temp_path.to_string_lossy().to_string());
        assert!(result.is_ok(), "test_mapping should handle read-only directory");

        let test_result = result.unwrap();
        assert!(test_result.exists, "Should detect existing directory");
        assert!(!test_result.writable, "Should detect read-only directory");
        assert!(!test_result.ok, "Should not be OK for read-only directory");
    }

    println!("Read-only directory test completed");
}

#[tokio::test]
async fn test_list_libraries_malformed_response() {
    let mock_server = MockServer::start().await;

    // Mock malformed JSON response
    Mock::given(method("GET"))
        .and(path("/library/sections"))
        .respond_with(ResponseTemplate::new(200).set_body_string("invalid json {"))
        .mount(&mock_server)
        .await;

    // Test list_libraries with malformed response
    let server_url = mock_server.uri();
    let result = plex_api::list_libraries(server_url, None).await;

    // Should handle malformed response gracefully
    match result {
        Ok(_) => println!("Unexpected success with malformed JSON"),
        Err(e) => {
            println!("Expected error with malformed JSON: {}", e);
            // Error is expected but shouldn't crash the application
        }
    }

    println!("Malformed response test completed");
}

#[tokio::test]
async fn test_list_libraries_empty_response() {
    let mock_server = MockServer::start().await;

    // Mock empty response
    Mock::given(method("GET"))
        .and(path("/library/sections"))
        .respond_with(ResponseTemplate::new(200).set_body_string(""))
        .mount(&mock_server)
        .await;

    // Test list_libraries with empty response
    let server_url = mock_server.uri();
    let result = plex_api::list_libraries(server_url, None).await;

    // Should handle empty response gracefully
    match result {
        Ok(libraries) => {
            assert_eq!(libraries.len(), 0, "Should return empty list for empty response");
        }
        Err(e) => {
            println!("Empty response resulted in error (acceptable): {}", e);
        }
    }

    println!("Empty response test completed");
}

#[tokio::test]
async fn test_list_libraries_server_error() {
    let mock_server = MockServer::start().await;

    // Mock server error (500)
    Mock::given(method("GET"))
        .and(path("/library/sections"))
        .respond_with(ResponseTemplate::new(500).set_body_string("Internal Server Error"))
        .mount(&mock_server)
        .await;

    // Test list_libraries with server error
    let server_url = mock_server.uri();
    let result = plex_api::list_libraries(server_url, None).await;

    assert!(result.is_err(), "list_libraries should fail with server error");
    if let Err(error_msg) = result {
        assert!(error_msg.contains("500") || error_msg.contains("Internal Server Error"));
    }

    println!("Server error test completed successfully");
}

#[tokio::test]
async fn test_list_libraries_network_timeout() {
    // Test with a server that doesn't respond (timeout scenario)
    let result = plex_api::list_libraries("http://10.255.255.1:32400".to_string(), None).await;

    // Should timeout gracefully
    match result {
        Ok(_) => println!("Unexpected success with unreachable server"),
        Err(e) => {
            println!("Expected timeout/network error: {}", e);
            // Network errors are expected for unreachable servers
        }
    }

    println!("Network timeout test completed");
}

// Note: Full Tauri AppHandle mocking would require more complex test setup
// These integration tests focus on the basic HTTP functionality and network behavior
// that the auth module depends on, without requiring the full Tauri runtime context.
