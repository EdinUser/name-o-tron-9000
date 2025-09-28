# AGENTS.md — Name‑o‑Tron 9000

This file guides AI/code agents working in this repository. It summarizes the app’s goals, architecture, conventions, and how to safely extend the project.

Relevant specs are in:
- `docs/name-o-tron-9000-first-commits.md:1`
- `docs/name-o-tron-9000-safety.md:1`
- `docs/plex-renamer-overview.md:1`
- `docs/plex-renamer-settings.md:1`
- `docs/plex-renamer-developer-guide.md:1`

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
- Frontend (React/TypeScript) in `src/`
  - Pages: Home, Preview, Settings, Logs
  - Components: `PreviewTable`, `SettingsTabs`, `LogsViewer`
- Backend (Rust via Tauri) in `src-tauri/`
  - Plex API connector: discovery + auth + library fetch
  - Renaming engine: template application + safety checks + dry‑run
  - Logging/rollback: JSON logs to user dir

IPC contract (suggested Tauri commands):
- `plex_discover({ hints? })` → [{ name, address, machineIdentifier?, owned? }]
- `plex_login()` / `plex_login_status()` / `plex_logout()`
- `list_libraries({ server, token? })` → libraries
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
- Rust: modules under `src-tauri/src/` (e.g., `plex_api.rs`, `rename_engine.rs`, `logs.rs`)
- React: `src/components/`, `src/pages/`, `src/hooks/`
- Logs: use OS‑appropriate app data dir; don’t hardcode home paths in code
- Keep code style consistent with existing files; TypeScript strict; avoid one‑letter names

## Development Workflow
Commands:
- Dev: `npm run tauri dev`
- Build: `npm install && cargo build`

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

## MVP Checklist
From `docs/name-o-tron-9000-first-commits.md:1`:
- Plex discovery/auth + list libraries
- Renaming engine with dry‑run and safety checks
- Preview table with statuses and actions (Skip/Auto‑Fix)
- Apply rename + write rollback log
- Basic Settings page (General tab only)
- Rescan library via Plex API

## Next Phases (high‑level)
- Full Movies/TV/Music/Misc settings
- Auto‑Fix Reds heuristics (replace invalids, truncate, conflict folder)
- Retry Skipped flow and Unmatched workflows
- Webhook listener (future), “Geek Slang” UI mode

## Definition of Done
- Behavior aligns with `docs/` specs
- Safety guarantees enforced (no 🟥 allowed during apply)
- Logs/rollback implemented and verified
- Minimal, scoped changes with clear rationale
- Docs updated if behavior or options changed
