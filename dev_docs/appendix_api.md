# API Reference & Configuration

This document provides detailed technical reference for the Tauri IPC commands and configuration schema used by Name-o-Tron 9000.

## API Reference

### Tauri Command Interface

#### Plex Integration Commands
```typescript
// Server Discovery
plex_discover(hints?: string[]): Promise<Array<{
  name: string;
  address: string;
  machineIdentifier?: string;
  owned?: boolean;
}>>

advanced_scan(args: {
  port?: number;
  hosts?: string[];
  run_id: string;
}): Promise<void>

// Authentication
plex_login(): Promise<{
  status: string;
  code: string;
  client_id: string;
  auth_url: string;
}>

plex_login_status(): Promise<{
  status: 'idle' | 'pending' | 'authorized' | 'expired' | 'error';
  token?: string;
}>

plex_logout(): Promise<void>

// Library Access
list_libraries(server: string, token?: string): Promise<PlexLibraryDto[]>

fetch_library_content(args: {
  server: string;
  library_key: string;
  token?: string;
  start?: number;
  size?: number;
}): Promise<any>

fetch_tv_shows(args: {
  server: string;
  library_key: string;
  token?: string;
  start?: number;
  size?: number;
}): Promise<any>

fetch_show_seasons(args: {
  server: string;
  show_rating_key: string;
  token?: string;
}): Promise<any>

fetch_show_episodes(args: {
  server: string;
  show_rating_key: string;
  token?: string;
  start?: number;
  size?: number;
}): Promise<any>

// Search
search_content(args: {
  server: string;
  query: string;
  section_id?: string;
  limit?: number;
  token?: string;
}): Promise<any>
```

#### File Operations Commands
```typescript
// Path Mapping
test_mapping(args: {
  server_id: string;
  plex_root: string;
  local_root: string;
}): Promise<{
  ok: boolean;
  exists: boolean;
  writable: boolean;
  details: string;
}>

// Subtitle-only preview/apply (used by video pipeline)
preview_renames(args: {
  libraryId: string;
  scope: string;
  settings: any;
}): Promise<PreviewResult>

apply_renames(args: {
  operations: any[];
  settings: any;
}): Promise<ApplyResult>

// Main video + subtitles rename operations used by the Preview UI
preview_video_renames(args: PreviewRenamesRequest): Promise<PreviewResult>

apply_video_renames(args: ApplyRenamesRequest): Promise<ApplyResult>

undo_last_rename(): Promise<ApplyResult>
```

#### Settings & Security Commands
```typescript
// Settings Management
get_settings(): Promise<any>
save_settings(settings: any): Promise<void>

// Credential Storage
secure_save_token(token: string): Promise<void>
secure_get_token(): Promise<string | null>
secure_clear_token(): Promise<void>

// Diagnostics & Logs
export_diagnostic_bundle(): Promise<string>           // JSON bundle on disk, returns path
export_diagnostic_bundle_zip(targetPath: string): Promise<string> // Creates anonymized ZIP bundle for bug reports
export_preview_snapshot(snapshot: any): Promise<string>           // Saves anonymized preview snapshot JSON, returns path
```

## Configuration Deep Dive

### Settings Schema

#### General Settings Structure
```typescript
interface GeneralSettings {
  // Preview & Logging
  preview: boolean;                    // Always show preview (default: true)
  logging: boolean;                    // Export logs after operations (default: true)
  rollback: boolean;                   // Enable rollback logs (default: true)

  // Filename Encoding
  encoding: {
    mode: 'unicode' | 'transliterate' | 'ascii'; // Default: 'unicode'
    highlightNonLatin: boolean;        // Default: true
  };

  // Conflict Handling
  conflictHandling: 'skip' | 'overwrite' | 'suffix'; // Default: 'skip'

  // Safety Checks
  safety: {
    pathLengthCheck: boolean;          // Default: true
    reservedNamesCheck: boolean;       // Default: true
    permissionsCheck: boolean;         // Default: true
  };

  // Authentication
  authPersistence: 'memory' | 'file' | 'secure'; // Default: 'secure'

  // Subtitles
  subtitles: {
    enabled: boolean;                  // Default: true
    encodingConversion: boolean;       // Default: true
    backupOriginal: boolean;           // Default: false
  };
}
```

#### Media-Specific Settings
```typescript
interface MovieSettings {
  collections: {
    enabled: boolean;                  // Default: true
    mode: 'always' | 'if2plus';       // Default: 'always'
    naming: 'original' | 'prefix_underscore' | 'prefix_collection' | 'suffix_collection';
  };

  folderStructure: 'none' | 'alpha' | 'alpha_ranges' | 'genre' | 'year_decade';

  ownFolderPerMovie: boolean;          // Default: true

  editions: {
    preserveTokens: boolean;           // Default: true
    expandToHuman: boolean;            // Default: false
    detectFromFilename: boolean;       // Default: true
  };

  versions: {
    appendVersion: boolean;            // Default: true
  };

  ids: 'none' | 'preserve' | 'append'; // Default: 'preserve'
}

interface TVSettings {
  seasonFolders: boolean;              // Default: true
  detectOVAsSeason00: boolean;         // Default: true
  normalizeMultiEpisode: boolean;      // Default: true
  ids: 'none' | 'preserve' | 'append'; // Default: 'preserve'
}

interface MusicSettings {
  format: 'artist_album_track' | 'various';
  discSubfolders: boolean;             // Default: true
  normalizeTrackNumbers: boolean;      // Default: true
}
```

## Getting Help & Contributing

### Reporting Bugs
1. **Gather information**:
   - App version and platform
   - Steps to reproduce the issue
   - Relevant log files from `~/.nameotron/logs/`
   - Plex server version

2. **Check existing issues** on GitHub to see if already reported

3. **Create new issue** with complete details and log excerpts

### Contributing & Feature Requests
- **Feature requests**: GitHub issues with "enhancement" label
- **Bug reports**: GitHub issues with "bug" label
- **Contributing code**: See [roadmap.md](roadmap.md) and [AGENTS.md](../AGENTS.md)

For developer-focused information, see the [AGENTS.md](../AGENTS.md) file in the repository root. For user-focused guidance, refer to the main [user guide](index.md).
