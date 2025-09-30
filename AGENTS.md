# AGENTS.md — Name‑o‑Tron 9000

This file guides AI/code agents working in this repository. It summarizes the app’s goals, architecture, conventions, and how to safely extend the project.

Relevant specs are in:
- `docs/name-o-tron-9000-first-commits.md:1`
- `docs/name-o-tron-9000-safety.md:1`
- `docs/plex-renamer-overview.md:1`
- `docs/plex-renamer-settings.md:1`
- `docs/plex-renamer-developer-guide.md:1`

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
  - **Components**: Custom SVG icons, PathMappingModal, LibraryMappingPanel
  - **State Management**: Settings persistence (localStorage + Tauri backend)
  - **Utils**: Template rendering engine with placeholder support
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
  - **lib.rs**: Tauri command bindings and SSDP discovery implementation

IPC contract (suggested Tauri commands):
- `plex_discover({ hints? })` → [{ name, address, machineIdentifier?, owned? }]
- `plex_login()` / `plex_login_status()` / `plex_logout()`
- `list_libraries({ server, token? })` → libraries
- `search_content({ server, query, section_id?, limit?, token? })` → hubs-style search results
- `preview_renames({libraryId, scope, settings})` → [{old, new, status, flags}]
- `apply_renames({plan, settings})` → {summary, logPath}
- `undo_last_rename()` → summary
- `retry_skipped()` → new preview for skipped
- `get_settings()` / `save_settings(settings)`

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

## Development Workflow
Commands:
- **Dev with mock server**: `npm run mock:plex` (terminal A) then `npm run tauri dev` (terminal B)
- **Dev**: `npm run tauri dev`
- **Build**: `npm install && cargo build`
- **Install Tailwind**: `npm i -D @tailwindcss/postcss` (required for styling)

**Testing**: Mock Plex server available at `http://localhost:32400` with comprehensive test fixtures in `tests/` directory.

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
