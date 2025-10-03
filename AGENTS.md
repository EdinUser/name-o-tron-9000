# AGENTS.md — Name‑o‑Tron 9000

This file guides AI/code agents working in this repository. It summarizes the app’s goals, architecture, conventions, and how to safely extend the project.

Relevant specs are in:
- `docs/name-o-tron-9000-first-commits.md:1`
- `docs/name-o-tron-9000-safety.md:1`
- `docs/plex-renamer-overview.md:1`
- `docs/plex-renamer-settings.md:1`
- `docs/plex-renamer-developer-guide.md:1`
- `docs/plex-path-mapping.md:1`
- `docs/name-templating.md:1`

## Current Implementation Status

**As of the current codebase scan, Name-o-Tron 9000 is substantially more complete than initially planned:**

### ✅ FULLY IMPLEMENTED (Frontend + Backend)
- **Complete UI Framework**: All 5 pages implemented (Home, Library Selection, Show Selection, Preview, Settings)
- **Plex Integration**: Full API integration with server discovery (SSDP multicast), PIN authentication, and metadata fetching
- **Safety Systems**: Traffic-light status system (🟩/🟨/🟥/❌) with comprehensive validation and batch guards
- **Settings Management**: All 5 tabs fully implemented with every setting option from specifications, using consistent custom Radio and Select components
- **Path Mapping**: Cross-platform path resolution with validation and UI for managing mappings
- **Template Engine**: Live template editing with placeholder support and validation
- **Security**: System keyring integration for secure token storage
- **Metadata Popovers + Posters**: Hover cards with Plex metadata and poster thumbnails via a backend image fetcher with caching

### ✅ FULLY IMPLEMENTED (Frontend + Backend)
- **Rename Engine**: Complete filesystem operations with atomic operations, comprehensive rollback logging, and safety checks
- **Subtitle Handling**: Full subtitle detection, classification, renaming, and encoding conversion with rollback support
- **Preview System**: Complete proposal generation with real filesystem validation and subtitle operations

**The app now provides end-to-end functionality: discover servers, authenticate, browse libraries, generate rename proposals with safety checks, preview subtitle operations, and perform actual filesystem renames with full rollback capabilities.**

## Scope
- This file applies to the entire repository tree.
- Prioritize safety-first behavior and minimal, focused changes.

## Purpose (What we’re building)
Name‑o‑Tron 9000 is a cross‑platform desktop app (Tauri + React) that renames local media files using Plex metadata while enforcing Plex naming conventions and strong safety/rollback guarantees.

Key goals:
- Preview before rename with traffic‑light statuses (🟩/🟨/🟥/❌)
- Skip/Auto‑fix blocking items; never proceed with selected 🟥
- Robust logs and one‑click rollback
- Balanced defaults for “normies”; deep settings for power users

## Architecture
- **Frontend (React/TypeScript) in `src/`**
  - **Pages**: Home (discovery/auth), LibrarySelection, ShowSelection, Preview, Settings (5 tabs)
  - **Components**: Custom SVG icons, PathMappingModal, LibraryMappingPanel, TemplateHelpModal, EditionParsersModal, PlexPopoverCard (metadata hover card), Select (shared styled dropdown)
  - **State Management**: Settings persistence (localStorage + Tauri backend)
  - **Utils**: Template rendering engine with placeholder support (see `docs/name-templating.md`); edition detection heuristics and ID extraction helpers
  - **Search Behavior (Movies/TV in Preview)**
    - Debounced input (500ms) filters the already loaded rows immediately
    - If the debounced query yields zero local matches and initial load is idle, the app invokes a backend search using Plex `/hubs/search`
    - Remote results are kept in a separate state to avoid UI flicker and are flagged with `remote-search`
    - For movies, search results are mapped to the same proposal pipeline as normal items (template + safety checks), using `{title}`, `{year}`, `{ext}` etc.
    - For TV, results are mapped using `grandparentTitle/parentTitle`, `parentIndex` (season) and `index` (episode) where available and run through the episode template pipeline
    - Current path for search results uses `Media[0].Part[0].file` when present; otherwise it is left empty (future enhancement: fetch item details to fill paths consistently)

- **Backend (Rust via Tauri) in `src-tauri/`**
  - **plex_api.rs** (1200+ lines): Complete Plex API integration (discovery, auth, metadata)
  - `search_content(server, query, section_id?, limit?, token?)`: queries Plex `/hubs/search` across HTTP/HTTPS variants
    - Accepts `X-Plex-Token` and includes it in both header and query string for robustness
    - Returns JSON when available and logs a trimmed raw response head when Plex replies in XML
    - Used by the Preview page when there are no local matches for a search query
  - **settings.rs**: Settings persistence with deep merge functionality
  - **path_map.rs**: Cross-platform path mapping and resolution
  - **secure.rs**: System keyring integration for token storage
  - **lib.rs**: Tauri command bindings and SSDP discovery implementation; includes image fetching with caching

IPC contract (current commands):
- `plex_discover({ hints? })` → [{ name, address, machineIdentifier?, owned? }]
- `plex_login()` / `plex_login_status()` / `plex_logout()`
- `list_libraries({ server, token? })` → libraries with roots
- `fetch_library_content({ server, library_key, token?, start?, size? })` → section items
- `fetch_tv_shows({ server, library_key, token?, start?, size? })` → normalized show list
- `fetch_show_episodes({ server, show_rating_key, token?, start?, size? })` → episode items
- `fetch_collections({ server, library_key, token? })` / `fetch_collection_items({ server, collection_rating_key, token? })`
- `search_content({ server, query, section_id?, limit?, token? })` → hubs-style search results
- `fetch_plex_image({ serverUrl, imagePath, token? })` → base64 data URL; cached under OS cache dir
- `test_mapping({ server_id, plex_root, local_root })` → mapping validation (exists/writable)
- `get_settings()` / `save_settings(settings)`
- `secure_save_token(token)` / `secure_get_token()` / `secure_clear_token()`
- `preview_renames({libraryId, scope, settings})` → {video_operations, subtitle_operations, warnings, blocking_errors}
- `apply_renames({operations, settings})` → {success, operations_applied, operations_failed, rollback_log_path, errors}
- `undo_last_rename()` → {success, operations_applied, operations_failed, rollback_log_path, errors}

**Planned for future enhancement:**
- `retry_skipped()` → new preview for skipped items

## Safety & Recovery (must‑haves)
Follow `docs/name-o-tron-9000-safety.md:1`.
- Preview table shows statuses:
  - 🟩 Green = compliant; no change
  - 🟨 Yellow = warning (non‑Latin, guessed edition, missing metadata, long path warn)
  - 🟥 Red = blocking (duplicates, invalid chars, perms, >255 path, target exists, unsupported type)
  - ❌ Unmatched = not in Plex DB
- Batch guard: cannot run with any selected 🟥
- Skip Reds and Auto‑Fix Reds options
- Dry‑run mode returns mapping only
- Every run writes rollback log; provide Undo Last Rename
- Export logs TXT/CSV/JSON; store at `~/.nameotron/logs/` (cross‑platform app‑data dir)

Current state in code:
- Preview enforces traffic‑light rules for template output (invalid chars, path length, non‑media ext, non‑Latin highlighting).
- Rename engine implements real filesystem operations with atomic operations, comprehensive safety checks, and full rollback logging.
- Subtitle operations are fully integrated with detection, classification, encoding conversion, and rollback support.

Rollback log shape (example):
```json
[
  {
    "operation_type": "rename",
    "original_path": "Inception.1080p.mkv",
    "new_path": "Inception (2010).mkv",
    "backup_path": null,
    "status": "success"
  },
  {
    "operation_type": "rename",
    "original_path": "Inception.eng.srt",
    "new_path": "Inception (2010).eng.srt",
    "backup_path": null,
    "status": "success"
  }
]
```

## Settings Model (tabs)
Mirror `docs/plex-renamer-settings.md:1`:
- General: preview, logging, rollback, encoding (Unicode vs transliteration), conflicts, safety checks
- Movies: collections, folder structure, editions, versions, IDs, extras handling
- TV: season folders, specials/OVAs, multi‑episode normalization, count checks
- Music: artist/album/track formatting, disc subfolders, track numbering
- Misc: unmatched/non‑media handling; advanced warnings

Default stance:
- Safe‑first, Unicode kept, non‑destructive by default. Destructive options require explicit confirmation.

## File/Folder Conventions
- **Rust Backend**: modules under `src-tauri/src/`
  - `plex_api.rs` - Complete Plex API integration (discovery, auth, metadata fetching)
  - `settings.rs` - Settings persistence with deep merge functionality
  - `path_map.rs` - Cross-platform path mapping and resolution
  - `secure.rs` - System keyring integration for secure token storage
  - `lib.rs` - Tauri command bindings and main application logic

- **React Frontend**: organized in `src/`
  - `pages/` - All 5 screen implementations (Home, LibrarySelection, ShowSelection, Preview, Settings)
  - `components/` - Reusable UI components (icons, modals, panels)
  - `state/` - Settings state management with TypeScript types
  - `types/` - TypeScript type definitions for Plex data structures
  - `utils/` - Utility functions (template rendering, validation)

- **Logs and Data**: Use OS‑appropriate app data directories (implemented in settings.rs)
- **Code Style**: TypeScript strict mode; comprehensive error handling; avoid one‑letter names
- **Build System**: Tailwind CSS v4 with PostCSS plugin required for styling
  - PostCSS config includes `@tailwindcss/postcss` and `autoprefixer` (see `postcss.config.cjs`)

## Development Workflow
Commands:
- **Dev with mock server**: `npm run mock:plex` (terminal A) then `npm run tauri dev` (terminal B)
- **Dev**: `npm run tauri dev`
- **Build**: `npm install && cargo build`
- **Install Tailwind**: `npm i -D @tailwindcss/postcss` (required for styling)

**Testing**: Mock Plex server available at `http://localhost:32400` with comprehensive test fixtures in `tests/` directory.
  - Start with `npm run mock:plex`. Fixtures include libraries and section JSONs.

Agent practices:
- Read and respect this file and `docs/` specs before changes
- Use small, focused patches tied to the docs
- Preserve public API expectations of Tauri commands
- If adding features, update related docs in `docs/` accordingly
  - Discovery specifics are documented in `docs/plex-discovery.md`.
  - UX conventions: window title reflects the current screen; the Discover action appears only on Home and the discovered servers are cached for the session.

### UI Conventions (important)
- Use the shared `Select` component in `src/components/Select.tsx` for ALL dropdowns. This ensures:
  - Consistent compact sizing, dark theme, and custom caret
  - Accessible focus styles and predictable behavior across platforms
  - Easy future updates to dropdown styling in a single place
- Use the shared `Radio` component in `src/components/Radio.tsx` for ALL radio button groups. This ensures:
  - Consistent pill-style segmented controls for multi-option selections
  - Proper keyboard navigation and accessibility
  - Unified styling that matches the app's dark theme
- Avoid native `<select>` or `<input type="radio">` styling directly in pages; if an exception is required, match the Select/Radio component styles.

**Theme System**:
- **Dark Mode**: Uses cyan accent color (#06b6d4) for optimal contrast and readability
- **Light Mode**: Uses orange accent color (#d88900) for a warm, modern appearance
- **Color Overrides**: Comprehensive CSS overrides ensure consistent theming across all components
- **Improved Grays**: Light mode uses blue-tinted gray backgrounds for better visual appeal and contrast

**Layout Improvements**:
- **Header Optimization**: Reload button moved from crowded header to logical position above table
- **Table Backgrounds**: Enhanced light mode table styling with pleasant blue-tinted grays instead of dull grays

Planning & messaging (for agent UIs):
- Maintain a short plan; one step in progress
- Group related shell actions under one brief preamble
- Provide concise progress updates; avoid verbosity

## MVP Checklist - Implementation Status

**From `docs/name-o-tron-9000-first-commits.md:1`:**

### ✅ COMPLETED
- **Plex discovery/auth + list libraries** - Fully implemented with SSDP multicast and PIN authentication
- **Preview table with statuses and actions (Skip/Auto‑Fix)** - Complete with traffic-light system and batch guards
- **Basic Settings page (General tab only)** - All 5 tabs fully implemented, far exceeding original scope
- **Rescan library via Plex API** - Implemented via reload functionality in Preview page

### ✅ COMPLETED
- **Renaming engine with dry‑run and safety checks** - Complete with atomic filesystem operations, comprehensive rollback logging, and subtitle handling

## Next Phases (high‑level)

**MVP Complete!** ✅
- All core functionality implemented: discovery, authentication, preview, rename engine, rollback, and subtitle handling

**Enhancement Priorities (Post-MVP):**
1. **🟡 Auto‑Fix Reds heuristics** - Smart conflict resolution and path sanitization
2. **🟡 Retry Skipped flow** - Workflow for handling previously skipped items
3. **🟡 Unmatched workflows** - Better handling of files not in Plex database
4. **🟢 Advanced Features** - Webhook listener, enhanced UI modes, batch processing optimizations

## Definition of Done
- Behavior aligns with `docs/` specs
- Safety guarantees enforced (no 🟥 allowed during apply)
- Logs/rollback implemented and verified
- Minimal, scoped changes with clear rationale
- Docs updated if behavior or options changed

---

## Backend IPC Reference

Signatures reflect current Rust Tauri commands in `src-tauri/src/`.

- `plex_discover(hints?: string[]) -> { name, address, machineIdentifier?, owned? }[]`
  - SSDP M-SEARCH for `urn:plex-media-server:device:1` + optional host hints; deduped by address.
- `plex_login() -> { status, code, client_id, auth_url }`
  - Starts Plex PIN auth, opens browser; background poller updates token.
- `plex_login_status() -> { status: 'idle'|'pending'|'authorized'|'expired'|'error', token? }`
- `plex_logout() -> void`
- `list_libraries(server: string, token?: string) -> PlexLibraryDto[]`
  - Returns `{ key, type, title, roots[] }`. Tries HTTP/HTTPS; accepts self-signed certs. Parses JSON then XML.
- `fetch_library_content(server, library_key, token?, start?, size?) -> any`
  - Section items; returns JSON or XML-normalized JSON.
- `fetch_tv_shows(server, library_key, token?, start?, size?) -> any`
  - Normalizes shows to `MediaContainer.Directory` array.
- `fetch_show_episodes(server, show_rating_key, token?, start?, size?) -> any`
  - Returns `MediaContainer.Metadata` with `Media[].Part[].file` when available.
- `fetch_collections(server, library_key, token?) -> any`
- `fetch_collection_items(server, collection_rating_key, token?) -> any`
- `search_content(server, query, section_id?, limit?, token?) -> any`
  - Queries `/hubs/search`. Includes token in header + query; supports JSON or XML fallback.
- `fetch_plex_image(serverUrl, imagePath, token?) -> string`
  - Returns a base64 `data:image/jpeg;base64,...`; caches under OS cache dir: `name-o-tron-9000/thumbnails/`.
- `test_mapping(server_id, plex_root, local_root) -> { ok, exists, writable, details }`
- `get_settings() -> any` / `save_settings(settings: any) -> void`
- `secure_save_token(token: string) -> void` / `secure_get_token() -> string|null` / `secure_clear_token() -> void`

Notes:
- All HTTP calls try both HTTP and HTTPS variants and may accept invalid certs for local PMS.
- When JSON parsing fails, commands attempt XML parsing with minimal extraction for robustness.

Planned (not implemented yet):
- `preview_renames({ libraryId, scope, settings }) -> { old, new, status, flags }[]`
- `apply_renames({ plan, settings }) -> { summary, logPath }`
- `undo_last_rename() -> { summary }`
- `retry_skipped() -> preview`

## Preview Status Matrix

Current Preview rules (from `src/pages/Preview.tsx`) determining status per proposed filename:

- 🟥 Red
  - Contains invalid characters: any of `\ / : * ? " < > |` in basename
  - Path length > 255 characters
- 🟨 Yellow
  - Non-media extension (not in: `.mkv .mp4 .avi .mov .iso .m4v`)
  - Path length > 200 and ≤ 255
  - Non‑Latin characters present AND `general.encoding.highlightNonLatin` enabled
- 🟩 Green
  - None of the above warnings/errors triggered
- ❌ Unmatched
  - Items not resolved to Plex metadata (reserved for unmatched cases; UI may show these when search/local load fails)

Examples:
- `Inception (2010).mkv` → 🟩
- `CON.mkv` (Windows reserved) → 🟥 (invalid/reserved checked at sanitize stage)
- `Movie.txt` → 🟨 (non‑media ext)
- `A…(very long)…Z.mkv` (length > 255) → 🟥
- `Amélie (2001).mkv` with highlightNonLatin = true → 🟨; otherwise 🟩

Implemented in Rename Engine (apply‑time checks):
- 🟥 for target already exists, duplicate target within batch, insufficient permissions, invalid source path, cross‑device failure unrecoverable.
- Comprehensive subtitle operation validation and rollback logging.

## Rename Engine Implementation ✅

**Status: FULLY IMPLEMENTED**

The rename engine provides complete filesystem operations with comprehensive safety and rollback capabilities.

**Invariants:**
- Never execute apply with any selected 🟥 items.
- Atomic operations: prefer `rename` within the same filesystem; cross‑device moves use copy + verified cleanup.
- Idempotent where possible: safe to re‑apply after partial failure using logs.
- Comprehensive subtitle operation support with encoding conversion and rollback.

**Operations (up-to-date):**
- `preview_video_renames({ libraryId, scope, settings })`
  - Input: library scope + complete settings (merged defaults + user overrides)
  - Output: `{ video_operations, subtitle_operations, warnings, blocking_errors }`
  - Behavior:
    - Generates proposed rename/move operations for video and associated subtitles
    - Applies all rule engines (templates, collections, season folders, specials, multi‑episode, sanitization)
    - Returns non‑fatal `warnings` and fatal `blocking_errors` for UI traffic‑light logic
- `apply_video_renames({ operations, settings })`
  - Pre‑flight: ensures parent folders exist, validates permissions, respects conflict policy
  - Execution: atomic `rename` within device; cross‑device move uses copy+cleanup strategy
  - Logging: writes rollback JSON with per‑operation status under `~/.nameotron/logs/`
  - Return: `{ success, operations_applied, operations_failed, rollback_log_path, errors }`
- `undo_last_rename()`
  - Reads most recent rollback log and reverses successful entries
  - Safely handles partial failures/missing files
  - Return: same format as `apply_video_renames`

**Rollback logging:**
- Location: `~/.nameotron/logs/` in the OS app‑data dir
- Shape (JSON array with operation details):
  ```json
  [
    {
      "operation_type": "rename",
      "original_path": "Inception.1080p.mkv",
      "new_path": "Inception (2010).mkv",
      "backup_path": null,
      "status": "success"
    }
  ]
  ```
- Includes subtitle operations, encoding conversions, and backup file paths
- Always created for every apply run with detailed operation metadata

**Failure handling:**
- Stops on blocking errors, continues with warnings where safe
- On crash mid‑batch, rollback log allows manual or automated recovery
- Encoding conversion failures skip the operation with detailed error logging

### Rename Rules and Pipelines (Detailed)

This section documents the full rename pipeline as implemented across the frontend (preview) and backend (Rust).

#### 1) Templates and Context
- Templates (configured under `settings.templates`) are rendered using a simple placeholder engine with optional groups:
  - Placeholders: `{title}`, `{year}`, `{ext}`, `{ids}`, `{showTitle}`, `{season}`, `{episode}`, `{grandparentTitle}`, `{parentTitle}`
  - Number formatting: `{episode:02}` → zero‑padded to 2 digits
  - Optional groups: text inside `[...]` is omitted if all placeholders in the group are empty
- Movie template example: `{title}[ ({year})]{ext}`
- Episode template example: `{showTitle} - S{season:02}E{episode:02} - {title}{ext}`

#### 2) Movie Rules
- Collections:
  - Controlled by `movies.collections.enabled` and `movies.collections.mode` (`always` | `if2plus`)
  - Collection folder name formatting draws from settings (naming/format where applicable)
- Folder structure (`movies.folderStructure`):
  - `none`: optional per‑movie folder if `movies.ownFolderPerMovie` is true
  - `alpha`: first‑letter folders (A/, B/…)
  - `alpha_ranges`: grouped ranges (A‑C/, D‑F/…)
  - `genre`: primary genre as top folder
  - `year_decade`: decade folders (e.g., `1990-1999/`)
- Chronology prefixing (`movies.chronologicalPrefix`):
  - `year`: prefix with year where applicable
  - `collection_order`: reserved for future ordering support
- Edition handling:
  - Edition tokens are detected from filenames (e.g., `{edition-Extended}`) and normalized to display titles (e.g., "Extended Edition")
  - Insertion occurs before the extension if not already present in the rendered name
- IDs:
  - `movies.ids` controls whether IDs are appended/preserved (integrated in the template context as `{ids}`)

#### 3) TV Rules
- Season folders:
  - Controlled by `tv.seasonFolders`
  - Season 0 uses `Specials` folder when `tv.detectOVAsSeason00` is true
- Multi‑episode normalization:
  - Controlled by `tv.normalizeMultiEpisode`
  - Detects patterns like `E01E02` or `E01-E02`; exposes `{multiEpisodeStart}`, `{multiEpisodeEnd}`, `{multiEpisodeRange}` to templates
- IDs:
  - `tv.ids` controls whether IDs are appended/preserved (available via `{ids}`)

#### 4) Sanitization & Validation (Preview + Apply)
- Respects `general.safety` and `general.encoding`:
  - Path length checks: 🟥 if >255; 🟨 if 200–255 (when enabled)
  - Reserved names (Windows): flagged when enabled
  - Invalid characters (`\\ / : * ? " < > |`): sanitized and flagged
  - Non‑Latin highlighting: 🟨 when `general.encoding.highlightNonLatin` is true
- Character replacement and normalization:
  - Unicode is normalized (NFC)
  - Invalid characters are replaced with `_` during sanitization

#### 5) Conflict Handling (Apply)
- Conflicts are resolved according to `general.conflictHandling`:
  - `skip`: skip operation when target exists
  - `overwrite`: allow overwrite when safe
  - `suffix2`: append numerical suffix to avoid collision (future enhancement in video path)
- Parent directories are created as needed; permissions checked when enabled

#### 6) Subtitles
- Subtitle operations are generated to match the finalized video basename and extension policy
- Encoding conversion to UTF‑8 is performed when enabled with optional backup
- Subtitle settings under `general.subtitles`, plus media‑type specifics under `movies.subtitles` and `tv.subtitles`

#### 7) Preview ↔ Apply Parity
- `preview_video_renames` produces operations that match `apply_video_renames` behavior:
  - Same sanitization rules, same directory structure, same conflict handling intent
  - Warnings and blocking errors surface to the UI to enforce traffic‑light rules

## Path Mapping Guide

How it works:
- Resolver uses longest‑prefix match for Plex roots per server: `resolve_plex_path(plex_path, mappings, server_id, platform_hint)`.
- `server_id` matches `machineIdentifier` when available; falls back to server address.
- Windows is treated case‑insensitive; path separators normalized.

Best practices:
- Map each Plex library root to an accurate local root; avoid trailing slashes.
- Ensure local roots exist and are writable; use `test_mapping(...)` to verify.
- Keep consistent slash styles in saved mappings; the resolver normalizes, but clean input reduces ambiguity.
- For remote shares/NAS, ensure the mount path is stable on the host running the app.

Pitfalls:
- Case differences on Windows/macOS can hide mismatches.
- Cross‑device moves (e.g., between mounts) require copy+delete fallback.
- Docker/VM paths won’t match host paths without additional mapping glue (out of scope here).

Examples:
- PMS root `/media/Movies` → local `/Volumes/RAID/Movies`
- PMS root `D:\Media\TV` → local `Z:\TV` (Windows case‑insensitive match)

## Testing Recipes

Local mock server:
- Start fixtures: `npm run mock:plex` (serves `tests/*.json` data)
- Run app: `npm run tauri dev`

Common flows:
- Discovery: Home → Discover; expect `Mock Plex (Local)` at `http://localhost:32400`.
- Login: Click Login; browser opens Plex auth; status polled via `plex_login_status`.
- Libraries: Select server → Libraries load via `list_libraries`; roots included; mapping status shows per library.
- Mapping: Open Map Paths; mappings persisted via `save_settings` and validated via `test_mapping`.
- Preview: Open a library → items fetched with paging; search invokes `search_content` when local filter yields zero.
- Posters: Hover a row; `PlexPopoverCard` calls `fetch_plex_image` and displays or falls back to placeholder.

Tips:
- To simulate token persistence, set `general.authPersistence` to `secure` (keyring) or `file` (localStorage + settings).
- Use settings modal to tweak templates and verify preview recalculations immediately.
- Test subtitle operations by creating test files with various naming patterns (e.g., `Movie.eng.srt`, `2_English.srt`).
- Verify rollback functionality by checking `~/.nameotron/logs/` for JSON logs after apply operations.

## Performance Notes

- Pagination defaults: movies `200`, shows `200`, music `200` (see `state/settings.tsx`).
- Preview page uses client‑side filtering with 500ms debounce; remote `/hubs/search` only if zero local matches.
- Search default `limit=3` hubs per type for responsiveness.
- HTTP clients disable connection pooling per host for finicky PMS and accept self‑signed certs; both HTTP/HTTPS tried.
- Poster fetcher caches base64 JPEGs under OS cache dir to reduce repeated network calls.
