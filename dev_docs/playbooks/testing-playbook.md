# Testing Playbook

## Baseline sequence

Run these in order unless there is a good reason not to:

1. `npm run test:types`
2. `npm test`
3. `npm run test:rust`
4. `npm run test:mock:http`

## Current baseline notes

As of 2026-07-14:

- `npm run test:types` is expected to pass cleanly.
- `npm test` passes; remaining stderr output is mostly expected failure-path logging.
- `npm run test:rust` runs all Rust targets from the repo root, but integration tests that bind mock ports may fail in restricted sandboxes.
- `npm run test:mock:http` resets generated mock media, starts the tracked HTTP mock server, verifies important endpoints and local media files, then stops the server when it owns the process.
- `npm run test:all` runs the full baseline above, including the mock HTTP verification.
- GitHub CI keeps these as separate workflow steps instead of calling `npm run test:all`; keep `.github/workflows/ci.yml` in sync when changing the local baseline.
- Linux PR CI also runs `npm run build` to catch production Vite/PostCSS/asset bundling regressions. This is intentionally not part of `npm run test:all`, which remains test-focused.

## Mock Plex Workflow

Use the tracked mock bundle when testing UI flows or fixture-backed backend behavior:

1. `npm run mock:reset`
2. `npm run mock:start`
3. `npm run mock:verify`
4. `npm run mock:stop` when you are done

For automated HTTP fixture verification, use `npm run test:mock:http`. It wraps the same reset/start/verify/stop sequence and uses a `finally` path so a harness-started server is stopped after verification.

For manual foreground work, `npm run mock:plex` is still useful. The lifecycle helper tolerates manually managed servers: `mock:status` checks HTTP reachability and handles stale PID state more gracefully.

Reset guidance:

- use the app's `Undo Last Rename` for the most recent rename batch
- use `npm run mock:reset` for a full reset of the generated `./test_media` tree and sample path mappings
- do not restart the mock server after `mock:reset` unless fixture payloads or server code changed
- clear app-side show mapping caches when fixture paths or path mappings change; otherwise old red unmapped states can remain visible

Refresh-specific notes:

- The tracked mock now accepts `POST /library/sections/:id/refresh` and `PUT /library/metadata/:id/refresh`.
- These mock refresh routes are observational only. They record requests; they do not mutate fixture payloads or emulate Plex rescanning files.
- Use `GET /_debug/refresh-events` to inspect recorded refresh requests during local mock work.
- Use `DELETE /_debug/refresh-events` to clear the recorded request log between manual checks.

## Mock-Backed Rename Integration

Use the Rust mock-backed integration suite when a change crosses Plex payload parsing, settings/templates, path mapping, filesystem apply, rollback logs, and undo:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --test mock_plex_harness_tests
```

These tests use mock Plex fixtures as metadata input, then create real temporary media trees and run real filesystem apply/undo operations. They are the preferred layer for rename-rule combinations because they prove files, folders, subtitles, and cleanup artifacts actually move on disk without requiring a Tauri UI session for every case.

This suite currently covers generated rename operations from tracked mock fixtures for:

- multilingual movie and TV titles
- subtitle sidecar moves
- TV multi-episode files
- collection grouping
- year-decade folders
- explicit undo restoration for generated folders, videos, subtitles, and cleanup-related moves
- provisional loose-file handling for cleanup blockers; do not model random files as normal rename subjects
- existing-target conflicts

Keep this layer below desktop E2E. It should validate behavior with real filesystem mutations without driving the Tauri UI for every rename-rule combination.

## Interpreting frontend noise

These are worth cleaning up, but they are not the same as a failing suite:

- React `act(...)` warnings in some component tests
- jsdom `scrollTo()` warnings in Show Selection tests
- expected console noise from error-handling tests
- Tauri `invoke` noise in settings tests outside the app shell

## Adding regressions

- Add tests next to the changed feature when possible.
- Prefer narrow tests for parsing, status logic, and state transforms.
- Add integration-style tests when a change spans page state and backend payloads.
- For rename behavior, cover both frontend proposal generation and Rust apply-time behavior when the rule crosses the boundary.
- For template changes, include a regression where a legacy `{ext}` token is present. The expected behavior is that `{ext}` is ignored, the rendered stem is trimmed, and the original real extension is appended internally.
- For movie-folder changes, include subtitle cases. At minimum, cover a movie moved into a new child folder with a matching `.eng.srt` beside the source video.
- For associated file changes, distinguish media asset group files from residual leftovers:
- media asset group files include subtitles, Kodi-style `.nfo`, local artwork, and clearly attached trailers/posters that should follow the primary media item
- residual leftovers are cleanup blockers in folders touched by the current apply run; tests should cover `leave`, `_others` moves, rollback, and undo without treating those files as first-class rename rows
- For subtitle apply behavior, cover both paths:
- frontend integration that proves explicit subtitle operations can be sent in `apply_video_renames`
- Rust apply-time coverage where the frontend sends only the video operation and the backend discovers/moves the matching subtitle itself
- For Plex rename reconciliation, cover three levels when possible:
- pure helper tests for path-target selection
- frontend integration tests that assert the correct `plex_refresh_library_section_with_path` calls after apply or undo
- backend tests that keep rollback/undo payload contracts stable when operations are returned to the frontend
- For TV pagination regressions, prefer a Preview integration test that exercises season loading plus later-page fetches.
- For mock fixture changes, keep `shows_all.json`, `tv_all_leaves.json`, and generated local files in `tests/mock-plex/bin/mock-shared.mjs` aligned. A selectable show must have at least one matching episode leaf.

## Work log requirement

Record the verification result in `dev_docs/work-log.md` whenever you run a meaningful audit or land a non-trivial change.
