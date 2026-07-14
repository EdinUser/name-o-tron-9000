---
description: "Feature overview for Name-o-Tron 9000: Plex metadata access, preview safety, templates, folder organization, subtitles, path mapping, logging, and rollback."
---

# Features Overview

Name-o-Tron 9000 is a safety-first Plex file renamer and media-library organizer. It uses existing Plex matches to create safer, clearer filenames, folders, subtitle sidecars, and rollback-ready filesystem operations for Movies, TV Shows, and Music.

At its core, Name-o-Tron provides a safety-first Plex file renaming workflow, but it also reorganizes folders, subtitles, and related library structures. The broader goal is a clean, portable filesystem library whose organization does not exist only inside one media-server database.

## Plex Integration

### Server Discovery & Authentication
- **Automatic Discovery**: Finds accessible Plex servers on your local network
- **Remembered Server List**: Home keeps discovered and manually added servers until you remove them
- **Manual Removal**: Remove stale server entries directly from Home instead of rediscovering everything every session
- **Manual Server Addition**: Add servers manually by IP address or hostname
- **Advanced Network Scanning**: Custom port scanning and manual host specification for complex networks
- **PIN Authentication**: Secure Plex account authentication via browser-based PIN flow
- **Token Management**: Secure token storage with optional encryption
 - **Plex library rename focus**: Everything downstream is optimized for Plex metadata-driven renaming.

### Library Access
- **Multi-Library Support**: Access Movies, TV Shows, and Music libraries
- **Metadata Fetching**: Retrieves complete Plex metadata including titles, years, ratings, and artwork
- **Real-time Search**: Search Plex database when local file filtering yields no results
- **Remote search fallback**: When preview filtering returns zero local matches, the app calls Plex `/hubs/search`; returned rows are flagged as `remote-search` to distinguish them from local items
- **Remote result enrichment**: Remote search rows use the same block-view poster fetching and subtitle-operation detection as normal preview rows

## Preview & Safety System

### Startup Risk Acknowledgement
- **First-run Gate**: The app requires an explicit file-rename risk acknowledgement before normal workflows are available
- **Beta Warning**: The acknowledgement highlights that the app is beta software and should be tested on small library portions first
- **Exit on Decline**: Users who do not accept the acknowledgement can exit before any library operations are available
- **Versioned Acceptance**: The acknowledgement is stored locally and can be shown again when the acknowledgement text version changes

### Traffic-Light Status System
- **🟩 Green**: Proposed names are already safe and consistent with the active template/settings
- **🟨 Yellow**: Warnings for review, such as missing metadata, guessed editions, long paths, or character compatibility concerns under the active settings
- **🟥 Red**: Blocking errors that must be resolved, such as unsafe destination names, path limits, duplicate targets, or permission problems
- **❌ Unmatched**: Items not resolved to usable Plex metadata and an accessible local path

### Status-Based Filtering
- **Filter by Status**: Dropdown filter to show only specific status types (all, good, warning, error, unmatched)
- **Quick Overview**: Focus on problematic items or review only compliant files
- **Combined Search**: Status filtering works with search functionality for precise item selection
- **Per-Page Select All**: Header toggle selects or deselects all rows on the current page without affecting other pages

### View Modes
- **Table View**: Traditional spreadsheet-style layout with sortable columns and detailed information
- **Blocks View**: Card-based layout with poster thumbnails, optimized for visual browsing
- **Per-Library Settings**: Choose your preferred view mode separately for Movies and TV Shows
- **Select All in Blocks**: Left-aligned toggle in blocks view for selecting all visible items on the current page

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
- **Template Integration**: Edited metadata flows through the template system for consistent, media-server-friendly naming

### Pre-Flight Validation
- **Permission Checks**: Verify read/write access before operations
- **Path Length Validation**: Warn or block when proposed filenames or full paths exceed configured safety thresholds or detected platform limits
- **Reserved Name Detection**: Flag Windows reserved names (CON, AUX, etc.)
- **Duplicate Detection**: Prevent filename conflicts within batch

## Rename Engine

### Template System
- **Customizable Templates**: Per-media-type templates with placeholder support
- **Movie Templates**: `{title}[ ({year})]` with optional collections and editions; the real file extension is preserved automatically
- **TV Templates**: `{showTitle} - S{season:02}E{episode:02} - {title}` with automatic Plex-style multi-episode and split-part handling; the real file extension is preserved automatically
- **Music Templates**: Artist/Album/Track formatting with disc subfolder support
- **Conditional Groups**: Use `[ (optional text) ]` for content that appears only when placeholders have values
- **Nested Optionals**: Support for complex conditional formatting with nested optional groups
- **Template Help Modal**: Interactive examples and documentation for all template features

### Advanced Features
- **Edition Detection**: Automatically detect Extended, IMAX, Director's Cut, etc. from filenames
- **Collection Handling**: Group movies by Plex collections with customizable naming
- **Multi-Episode Normalization**: Normalize compact or dashed input to Plex-style `E01-E02` output
- **Split-Part Preservation**: Keep Plex-style single-episode part suffixes such as `pt1`, `part2`, `cd1`, and `disc1`
- **Special Episodes**: Handle OVAs and specials in Season 00 folders

### TV Preview Pagination
- **Season Paging**: TV preview loads additional episode batches when later pages need more rows
- **Grouped Row Counting**: Final TV page counts follow the grouped preview rows, so multi-episode files do not create phantom pages

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
- **One-Click Undo**: Restore supported files from the latest rename batch when sources, destinations, mounts, and permissions still allow it
- **Plex reconciliation after apply/undo**: Successful rename and undo flows request focused Plex section-path rescans where supported; Plex may still decide to scan a broader path or library section
- **Export Capabilities**: Export logs as TXT, CSV, or JSON formats based on General settings
- **Backup Files**: Optional `filenames_backup.json` before operations
- **Diagnostic Bundles**: Export anonymized diagnostic ZIP bundles (settings + recent logs) from the Settings → General tab for bug reports

### Plex Rescan Strategy
- **Movies**: Follow-up requests prefer the affected movie folder when enough path information is available
- **TV episodes**: Small batches can request episode-folder updates
- **TV shows**: Larger TV batches can request show-folder updates to avoid excessive per-episode requests
- **Manual controls**: Preview rows and the TV Show Selection list expose compact manual rescan actions when you want to request a Plex update yourself
- **Explicit full scan only**: Broad library rescans stay manual via the header action because automatic full-library scans were proven too disruptive

## Safety Model

### Before Execution
- Generate rename and folder proposals from Plex metadata and active templates
- Resolve Plex paths to local filesystem paths through path mapping
- Detect target collisions, inaccessible sources, unsafe names, path-length risks, and permission problems
- Classify blocking errors separately from warnings

### During Execution
- Process selected items only
- Keep related subtitle operations tied to the selected media item
- Record attempted operations and report successes, failures, and skipped items

### After Execution
- Display results and retain operation logs
- Provide rollback for the latest supported rename batch
- Request Plex reconciliation where supported by the current library, path mapping, and Plex response behavior

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
 - **Show mapping cache aware**: Cache invalidates automatically when path mappings change.

For detailed guidance on setting up and troubleshooting path mappings, see [Path Mapping](tips.md#path-mapping) in the Tips & Best Practices guide.

### Show Mapping Cache & Posters
- **TV show mapping cache**: Caches mapping status and enriched metadata per server/library; checksum validation keeps it aligned with current path mappings.
- **Poster hover cards**: Preview rows surface Plex metadata popovers with thumbnail caching for fast repeat hovers.
- **Cache maintenance**: Cache rebuilds automatically when mappings change; backend supports manual invalidation when needed.

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
- **Pagination**: Configurable per-page limits with automatic incremental loading when later pages need more rows
- **Season Filtering**: For TV libraries, filter preview rows by season (or view all seasons) while browsing episodes
- **Real-time Updates**: Immediate preview recalculation when settings change
- **Progress Indicators**: Visual feedback during long operations
- **TV Show Caching**: Automatic caching of TV show mapping status and metadata for improved browsing performance
- **Search Persistence**: Search queries and scroll positions saved across sessions for seamless navigation

## Testing & Quality Assurance

### Comprehensive Test Coverage
- **Frontend Tests**: 33+ tests covering React components, state management, and error handling
- **Backend Tests**: 15+ tests covering Rust backend, settings persistence, and deep merge logic
- **Mock-Backed Integration Tests**: Plex-shaped fixture tests for settings/templates, path mappings, real filesystem rename/apply, subtitle moves, rollback logs, undo, collection/year folders, multilingual titles, and conflict handling
- **Error Scenarios**: Extensive coverage of edge cases, malformed data, and system failures

### Test Categories
- **Settings Load/Save**: localStorage integration, persistence, error recovery (12 tests)
- **Deep Merge**: Complex nested object merging and array handling (7 tests)
- **Manual Fixes**: CRUD operations for metadata overrides and cleanup (8 tests)
- **Settings Provider**: React hooks, Tauri backend integration, state management (6 tests)
- **Error Recovery**: localStorage failures, quota exceeded, corrupted data handling
- **Type Safety**: Settings validation, migration, and version compatibility

### Development Testing
- **Mock Plex Server**: Tracked Movies, TV Shows, and Music fixtures served from `tests/mock-plex/mock-plex-server.cjs`
- **Mock Server Harness**: `npm run mock:reset`, `npm run mock:start`, `npm run mock:verify`, and `npm run mock:stop` manage generated media, HTTP readiness, endpoint checks, and stale PID state
- **Mock HTTP Test**: `npm run test:mock:http` runs the reset/start/verify/stop path and is included in `npm run test:all`
- **Unicode Fixtures**: Chinese, Japanese, Thai, Armenian, and decomposed-accent examples exercise non-Latin titles, normalization, subtitles, and search behavior
- **Associated File Fixtures**: Mock-backed tests can seed subtitles, Kodi-style metadata/artwork, and residual leftover files to validate apply, cleanup, rollback, and undo behavior
- **TV Fixture Integrity**: Selectable mock TV shows, including pagination filler shows, include episode leaves so show selection and preview flows remain testable
- **Mock-Backed Rename Suite**: `cargo test --manifest-path src-tauri/Cargo.toml --test mock_plex_harness_tests`
- **Automated CI/CD**: TypeScript checks, linting, and test execution
- **Cross-Platform**: Testing on Windows, macOS, and Linux environments
