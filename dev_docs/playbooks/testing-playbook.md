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

## Work log requirement

Record the verification result in `dev_docs/work-log.md` whenever you run a meaningful audit or land a non-trivial change.
