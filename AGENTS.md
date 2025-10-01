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
- **Settings Management**: All 5 tabs fully implemented with every setting option from specifications
- **Path Mapping**: Cross-platform path resolution with validation and UI for managing mappings
- **Template Engine**: Live template editing with placeholder support and validation
- **Security**: System keyring integration for secure token storage
- **Metadata Popovers + Posters**: Hover cards with Plex metadata and poster thumbnails via a backend image fetcher with caching

### 🔄 PARTIALLY IMPLEMENTED
- **Preview System**: Complete proposal generation and status checking, but uses mock filesystem operations

### ❌ MISSING (Critical Next Steps)
- **Rename Engine**: The actual filesystem operations (`preview_renames`, `apply_renames`, `undo_last_rename`)
- **Rollback Logging**: JSON log writing for undo functionality
- **Filesystem Safety**: Permission checks and atomic file operations

**The app can currently discover servers, authenticate, browse libraries, generate rename proposals with safety checks, and manage all settings - but cannot actually perform filesystem operations yet.**

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
  - **Components**: Custom SVG icons, PathMappingModal, LibraryMappingPanel, TemplateHelpModal, EditionParsersModal, PlexPopoverCard (metadata hover card)
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

Planned (not yet implemented; UI stubs present):
- `preview_renames({libraryId, scope, settings})` → [{old, new, status, flags}]
- `apply_renames({plan, settings})` → {summary, logPath}
- `undo_last_rename()` → summary
- `retry_skipped()` → new preview for skipped

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
- Preview enforces traffic‑light rules for template output (invalid chars, path length, non‑media ext, non‑Latin highlighting). Filesystem checks (perms/target exists) are pending with the rename engine.

Rollback log shape (example):
```json
[
  { "old": "Inception.1080p.mkv", "new": "Inception (2010).mkv", "status": "success" }
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

### 🔄 PARTIALLY COMPLETED
- **Renaming engine with dry‑run and safety checks** - Template application and safety validation complete, but actual filesystem operations pending

### ❌ PENDING
- **Apply rename + write rollback log** - Core filesystem operations and logging system needed

## Next Phases (high‑level)

**Immediate Priority (Complete MVP):**
1. **🔴 Rename Engine Implementation** - Core filesystem operations
   - Implement `preview_renames`, `apply_renames`, `undo_last_rename` commands
   - Add robust filesystem safety checks and atomic operations
   - Create rollback logging system (JSON logs to `~/.nameotron/logs/`)

**Enhancement Priorities (Post-MVP):**
2. **🟡 Auto‑Fix Reds heuristics** - Smart conflict resolution and path sanitization
3. **🟡 Retry Skipped flow** - Workflow for handling previously skipped items
4. **🟡 Unmatched workflows** - Better handling of files not in Plex database
5. **🟢 Advanced Features** - Webhook listener, enhanced UI modes, batch processing optimizations

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

Planned additions in the Rename Engine (apply‑time checks):
- 🟥 for target already exists, duplicate target within batch, insufficient permissions, invalid source path, cross‑device failure unrecoverable.

## Rename Engine Roadmap

Invariants:
- Never execute apply with any selected 🟥 items.
- Dry‑run first: compute mapping and statuses before touching disk.
- Atomic intent: prefer `rename` within the same filesystem; on cross‑device moves, copy + fsync + metadata + verified cleanup.
- Idempotent where possible: safe to re‑apply after partial failure using logs.

Operations:
- `preview_renames(...)`
  - Input: library scope + settings
  - Output: `{ old, new, status, flags }[]` using existing template engine and validation.
- `apply_renames({ plan, settings })`
  - Pre‑flight: check permissions, collisions, create parent dirs; block if any 🟥.
  - Execution: for each item
    - Same‑device: `std::fs::rename` to a temp name then final destination, or directly if safe
    - Cross‑device: copy to temp, fsync, set times/attrs where viable, then delete source
  - Logging: append per‑item result to rollback log (JSONL or array) as you go; fsync log file periodically.
  - Return `{ summary, logPath }`.
- `undo_last_rename()`
  - Read the most recent rollback log and reverse successful entries; skip missing files safely.

Rollback logging:
- Location: `~/.nameotron/logs/` in the OS app‑data dir (see `settings.rs`).
- Shape (JSON array):
  - `[ { "old": "Inception.1080p.mkv", "new": "Inception (2010).mkv", "status": "success" } ]`
- Always create a log for every apply run (even on dry‑run if configured, marked accordingly).

Failure handling:
- Stop‑on‑first‑fatal vs continue‑and‑report configurable post‑MVP; MVP may stop on fatal and report partials.
- On crash mid‑batch, log allows manual or automated resume/undo.

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

## Performance Notes

- Pagination defaults: movies `200`, shows `200`, music `200` (see `state/settings.tsx`).
- Preview page uses client‑side filtering with 500ms debounce; remote `/hubs/search` only if zero local matches.
- Search default `limit=3` hubs per type for responsiveness.
- HTTP clients disable connection pooling per host for finicky PMS and accept self‑signed certs; both HTTP/HTTPS tried.
- Poster fetcher caches base64 JPEGs under OS cache dir to reduce repeated network calls.
