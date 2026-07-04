# Backend Playbook

## Scope

Use this playbook for changes under `src-tauri/src/`, especially Tauri commands, Plex integration, logging, path mapping, diagnostics, and filesystem operations.

## Core rules

- Preserve public command names and argument shapes unless the change is explicitly breaking.
- Keep filesystem operations safety-first.
  - validate before apply
  - prefer reversible behavior
  - preserve rollback compatibility
- Treat logging and diagnostics as privacy-sensitive surfaces.
  - redact paths
  - mask server IPs and tokens
- Keep app-data and cache paths cross-platform.

## Change protocol

1. Identify which commands and modules are affected.
2. Trace the frontend caller before changing the backend contract.
3. Update the smallest backend surface that solves the issue.
4. Add or update Rust unit tests when behavior changes.
5. Update contributor docs if command contracts or invariants changed.
6. Add a short `dev_docs/work-log.md` entry.

## Verification

- `npm run test:rust`
- targeted Rust tests when iterating on a narrow module
- frontend verification if command shapes or payloads changed

## Watch points

- `src-tauri/src/lib.rs` command registration parity
- path mapping edge cases across platforms
- preview/apply rename parity
- rollback log shape compatibility
- logging redaction behavior
