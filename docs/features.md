# Features Overview

This section details the comprehensive capabilities of Name-o-Tron 9000, organized by major functional areas.

## Plex Integration

### Server Discovery & Authentication
- **Automatic Discovery**: Uses SSDP multicast to find Plex servers on your local network
- **Manual Server Addition**: Add servers manually by IP address or hostname
- **PIN Authentication**: Secure Plex account authentication via browser-based PIN flow
- **Token Management**: Secure token storage with optional encryption

### Library Access
- **Multi-Library Support**: Access Movies, TV Shows, and Music libraries
- **Metadata Fetching**: Retrieves complete Plex metadata including titles, years, ratings, and artwork
- **Real-time Search**: Search Plex database when local file filtering yields no results

## Preview & Safety System

### Traffic-Light Status System
- **🟩 Green**: Files already compliant with Plex naming conventions
- **🟨 Yellow**: Warnings for potential issues (non-Latin characters, missing metadata, guessed editions)
- **🟥 Red**: Blocking errors that must be resolved (invalid characters, path length >255, permission issues)
- **❌ Unmatched**: Files not found in Plex database

### Status-Based Filtering
- **Filter by Status**: Dropdown filter to show only specific status types (all, good, warning, error, unmatched)
- **Quick Overview**: Focus on problematic items or review only compliant files
- **Combined Search**: Status filtering works with search functionality for precise item selection

[traffic_light.png]

### Batch Safety Guards
- **Cannot proceed** with any selected red-flagged items
- **Skip All Reds**: Automatically unselect problematic items
- **Auto-Fix Reds**: Built-in sanitizers for common issues (invalid characters, long paths)

### Manual Metadata Fixes
- **Edit Metadata Modal**: Click the edit icon next to any item in preview to modify metadata
- **Persistent Fixes**: Manual changes are saved and applied consistently across sessions
- **Movie Fields**: Edit title, year, and edition information
- **TV Episode Fields**: Edit show title, episode title, season, and episode numbers
- **Template Integration**: Edited metadata flows through the template system for consistent naming

### Pre-Flight Validation
- **Permission Checks**: Verify read/write access before operations
- **Path Length Validation**: Warn at >200 characters, block at >255
- **Reserved Name Detection**: Flag Windows reserved names (CON, AUX, etc.)
- **Duplicate Detection**: Prevent filename conflicts within batch

## Rename Engine

### Template System
- **Customizable Templates**: Per-media-type templates with placeholder support
- **Movie Templates**: `{title}[ ({year})]{ext}` with optional collections and editions
- **TV Templates**: `{showTitle} - S{season:02}E{episode:02} - {title}{ext}` with multi-episode support
- **Music Templates**: Artist/Album/Track formatting with disc subfolder support
- **Conditional Groups**: Use `[ (optional text) ]` for content that appears only when placeholders have values
- **Nested Optionals**: Support for complex conditional formatting with nested optional groups
- **Template Help Modal**: Interactive examples and documentation for all template features

### Advanced Features
- **Edition Detection**: Automatically detect Extended, IMAX, Director's Cut, etc. from filenames
- **Collection Handling**: Group movies by Plex collections with customizable naming
- **Multi-Episode Normalization**: Convert `E01-E02` to `E01E02` format
- **Special Episodes**: Handle OVAs and specials in Season 00 folders

## Subtitles & Audio

### Detection & Classification
- **Automatic Detection**: Find subtitle files associated with video files
- **Language Identification**: Classify subtitles by language codes
- **Format Support**: Handle various subtitle formats (.srt, .ass, .vtt, etc.)

### Processing
- **Encoding Conversion**: Convert to UTF-8 with optional backup preservation
- **Filename Matching**: Rename subtitles to match video files
- **Rollback Support**: Include subtitle operations in rollback logs

## Rollback & Recovery

### Comprehensive Logging
- **Operation Logs**: Every rename operation recorded with before/after paths
- **Status Tracking**: Success, warning, error, and skipped operations
- **Timestamped Records**: Full audit trail of all changes

### Recovery Options
- **One-Click Undo**: Restore all files from the last rename operation
- **Selective Retry**: Re-run only skipped or failed items
- **Export Capabilities**: Export logs as TXT, CSV, or JSON formats
- **Backup Files**: Optional `filenames_backup.json` before operations

### Storage Locations
- **Cross-Platform**: OS-appropriate application data directories
- **Organized Structure**: Separate logs per operation with clear naming

[rollback.png]

## Path Mapping

Path mapping connects Plex's internal file paths to your actual folder locations, enabling cross-platform compatibility and network storage support.

**Key Features:**
- **Cross-Platform Resolution**: Automatic detection of Windows, macOS, Linux path formats
- **Longest-Prefix Matching**: Map Plex paths to local paths using intelligent prefix matching
- **Network Storage Support**: Handle NAS, SAN, and other network-attached storage
- **Visual Management**: GUI for creating, editing, and validating path mappings

For detailed guidance on setting up and troubleshooting path mappings, see [Path Mapping](tips.md#path-mapping) in the Tips & Best Practices guide.

## Advanced Features

### Unmatched File Handling
- **Multiple Options**: Leave in place, move to Unmatched/, Extras/, or delete
- **Confirmation Required**: Dangerous operations require explicit confirmation
- **Batch Processing**: Handle multiple unmatched files consistently

### Non-Media File Handling
- **Detection**: Identify .txt, .nfo, .jpg, and other non-media files
- **Processing Options**: Skip, move to Extras/, or delete with confirmation
- **Safe Defaults**: Conservative handling of unknown file types

### Performance & Usability
- **Debounced Search**: 500ms delay for responsive filtering
- **Pagination**: Efficient handling of large libraries (200 items per page)
- **Real-time Updates**: Immediate preview recalculation when settings change
- **Progress Indicators**: Visual feedback during long operations

## Testing & Quality Assurance

### Comprehensive Test Coverage
- **Frontend Tests**: 33+ tests covering React components, state management, and error handling
- **Backend Tests**: 15+ tests covering Rust backend, settings persistence, and deep merge logic
- **Integration Tests**: Full workflow testing with mock Plex servers
- **Error Scenarios**: Extensive coverage of edge cases, malformed data, and system failures

### Test Categories
- **Settings Load/Save**: localStorage integration, persistence, error recovery (12 tests)
- **Deep Merge**: Complex nested object merging and array handling (7 tests)
- **Manual Fixes**: CRUD operations for metadata overrides and cleanup (8 tests)
- **Settings Provider**: React hooks, Tauri backend integration, state management (6 tests)
- **Error Recovery**: localStorage failures, quota exceeded, corrupted data handling
- **Type Safety**: Settings validation, migration, and version compatibility

### Development Testing
- **Mock Plex Server**: Comprehensive test fixtures for all media types
- **Automated CI/CD**: TypeScript checks, linting, and test execution
- **Cross-Platform**: Testing on Windows, macOS, and Linux environments
