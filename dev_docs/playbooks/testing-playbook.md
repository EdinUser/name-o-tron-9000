# Testing Playbook

## Baseline sequence

Run these in order unless there is a good reason not to:

1. `npm run test:types`
2. `npm test`
3. `npm run test:rust`

## Current baseline notes

As of 2026-07-04:

- `npm run test:types` is expected to pass cleanly.
- `npm test` passes; remaining stderr output is mostly expected failure-path logging.
- `npm run test:rust` runs all Rust targets from the repo root, but integration tests that bind mock ports may fail in restricted sandboxes.

## Mock Plex workflow

Use the tracked mock bundle when testing UI flows or fixture-backed backend behavior:

1. `npm run mock:setup`
2. `npm run mock:plex`
3. `npm run mock:verify` when you need to confirm the mock server and generated media tree still line up

Reset guidance:

- use the app's `Undo Last Rename` for the most recent rename batch
- use `npm run mock:setup` for a full reset of the generated `./test_media` tree
- do not restart `npm run mock:plex` after `mock:setup` unless fixture payloads or server code changed

Refresh-specific notes:

- The tracked mock now accepts `POST /library/sections/:id/refresh` and `PUT /library/metadata/:id/refresh`.
- These mock refresh routes are observational only. They record requests; they do not mutate fixture payloads or emulate Plex rescanning files.
- Use `GET /_debug/refresh-events` to inspect recorded refresh requests during local mock work.
- Use `DELETE /_debug/refresh-events` to clear the recorded request log between manual checks.

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
- For Plex rename reconciliation, cover three levels when possible:
- pure helper tests for path-target selection
- frontend integration tests that assert the correct `plex_refresh_library_section_with_path` calls after apply or undo
- backend tests that keep rollback/undo payload contracts stable when operations are returned to the frontend
- For TV pagination regressions, prefer a Preview integration test that exercises season loading plus later-page fetches.

## Work log requirement

Record the verification result in `dev_docs/work-log.md` whenever you run a meaningful audit or land a non-trivial change.
