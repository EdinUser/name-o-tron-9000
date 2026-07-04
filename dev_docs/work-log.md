# Work Log

Use this file for dated, high-signal traces of audits, implementation batches, and follow-up items. Keep entries short and factual.

## Entry Template

```md
## YYYY-MM-DD

- Summary:
- Files or areas:
- Verification:
- Follow-ups:
```

## 2026-07-04

- Summary: Initial repo audit completed and contributor playbook structure added to make future work traceable.
- Files or areas: `docs/`, `dev_docs/`, `AGENTS.md`, `src/`, `src-tauri/src/`, verification scripts in `package.json` and `src-tauri/Cargo.toml`.
- Verification:
  - `npm run test:ci` passed.
  - `npx vitest run --reporter=dot` passed with test-noise warnings.
  - `cargo test` failed in `src-tauri/src/logging.rs` on the path-redaction assertion.
- Follow-ups:
  - Reconcile `AGENTS.md` whenever doc paths or operating rules change.
  - Fix the Rust logging redaction test or the underlying log redaction behavior.
  - Reduce frontend test noise from `act(...)`, jsdom `scrollTo()`, and expected console spam where practical.

## 2026-07-04

- Summary: Fixed the Rust logging redaction unit test by isolating it from the sandboxed host log directory.
- Files or areas: `src-tauri/src/logging.rs`.
- Verification:
  - `cargo test logging::tests::log_event_masks_ips_and_redacts_paths -- --nocapture` passed.
  - `cargo test` now passes all unit tests and still fails only in integration tests that try to bind mock server ports under sandbox restrictions.
- Follow-ups:
  - If full Rust integration coverage is needed in this environment, rerun the integration tests with approval outside the sandbox.
  - Clean up frontend test warnings so audit output is easier to trust.

## 2026-07-04

- Summary: Reduced frontend test noise by gating debug logs, adding a shared `scrollTo` stub, tightening async tests, and narrowing fake Tauri runtime usage to the tests that actually need it.
- Files or areas: `src/state/settings.tsx`, `src/utils/cache.ts`, `src/test/setup.tsx`, `src/state/__tests__/test-utils/settings-setup.tsx`, `src/state/__tests__/settings-provider.test.tsx`, `src/components/__tests__/PathMappingModal.test.tsx`, related frontend tests.
- Verification:
  - `npm run test:ci` passed.
  - `npx vitest run --reporter=dot` passed with no unhandled errors.
- Follow-ups:
  - Remaining stderr output is mostly expected failure-path logging from cache/settings tests and one deliberate ShowSelection error-path test.
  - If desired, suppress expected console output inside those specific tests rather than globally.

## 2026-07-04

- Summary: Normalized root test scripts so the repo has one correct `test:all` entry and all Rust tests run via the `src-tauri` manifest instead of assuming Cargo lives at the root.
- Files or areas: `package.json`, `dev_docs/appendix_build.md`, `dev_docs/playbooks/*.md`.
- Verification:
  - `npm run test:types` passed.
  - `npm test` passed.
  - `npm run test:rust` still reflects sandbox limits on Rust integration tests that bind mock ports.
- Follow-ups:
  - Use `npm run test:all` as the canonical root test entry point.
  - If full Rust integration coverage is needed in restricted environments, rerun with approval outside the sandbox.

## 2026-07-04

- Summary: Updated GitHub Actions workflows to use the normalized root test scripts and made the Linux CI runner label explicit as self-hosted Linux Mint.
- Files or areas: `.github/workflows/ci.yml`, `.github/workflows/main.yml`.
- Verification:
  - Workflow references now match `package.json` test command names.
  - Linux CI and Linux release jobs now clearly target a self-hosted Linux runner with the `mint` label.
- Follow-ups:
  - If the repository no longer has an attached self-hosted runner labeled `mint`, Linux CI and Linux release builds will queue indefinitely or fail to start.
  - Hosted Windows and docs jobs remain subject to GitHub Actions minutes/storage rules for private repositories.

## 2026-07-04

- Summary: Re-established the intended repo governance model in-repo by documenting `develop -> main` flow and widening CI coverage to both branches.
- Files or areas: `.github/workflows/ci.yml`, `dev_docs/appendix_build.md`, `dev_docs/playbooks/README.md`, `dev_docs/playbooks/repo-governance-playbook.md`.
- Verification:
  - CI workflow now covers pull requests targeting `main` and `develop`.
  - Contributor docs now describe `develop` as integration and `main` as the protected release branch.
  - Local `develop` branch was created and published to `origin/develop`.
- Follow-ups:
  - Add a GitHub ruleset or branch protection for `main` and optionally make `develop` the default branch.

## 2026-07-04

- Summary: Switched the live repository default branch to `develop` and aligned builders to run only after merged PRs into `main`.
- Files or areas: `.github/workflows/main.yml`, `dev_docs/playbooks/repo-governance-playbook.md`.
- Verification:
  - `gh api -X PATCH repos/EdinUser/name-o-tron-9000 -f default_branch=develop` succeeded.
  - GitHub API now reports `default_branch: "develop"` for the repository.
  - GitHub API now reports `delete_branch_on_merge: true` for the repository.
  - Builder workflow now triggers on `pull_request.closed` for `main` and gates jobs on `github.event.pull_request.merged == true`.
  - CI now fails PRs into `main` unless the source branch is `develop`.
  - GitHub returned `403` for private-repo branch protection and ruleset endpoints on the current plan.
- Follow-ups:
  - If you need `main` to be technically locked, upgrade the GitHub plan for this private repository or make it public.
  - Once branch protection is available, require CI checks for PRs into both `develop` and `main`.

## 2026-07-04

- Summary: Enabled live branch protection now that the repository is public.
- Files or areas: GitHub branch settings for `develop` and `main`, `dev_docs/playbooks/repo-governance-playbook.md`.
- Verification:
  - `develop` protection now requires `validate-pr-route`, `test-linux`, and `test-windows`.
  - `main` protection now requires the same checks plus one approving review.
  - Both branches now require linear history, resolved conversations, and block force-pushes and deletions.
  - Admin enforcement remains off so the repository owner can bypass in emergencies.
- Follow-ups:
  - Run one feature PR into `develop` and one `develop -> main` PR to verify the required check names match exactly in the GitHub UI.

## 2026-07-04

- Summary: Relaxed `develop` gating for faster iteration by making Windows CI run only for PRs into `main`, while keeping the stricter release gate on `main`.
- Files or areas: `.github/workflows/ci.yml`, GitHub branch settings for `develop`, `dev_docs/playbooks/repo-governance-playbook.md`.
- Verification:
  - `test-windows` is now skipped unless the PR target branch is `main`.
  - `develop` branch policy is documented as requiring only `validate-pr-route` and `test-linux`.
- Follow-ups:
  - Update live branch protection on `develop` so it no longer requires `test-windows`.

## 2026-07-04

- Summary: Moved the public mock Plex server bundle into tracked `tests/mock-plex/`, tightened `.gitignore` for public-repo hygiene, and left `_helpers/` as local-only scratch/demo resources.
- Files or areas: `.gitignore`, `package.json`, `AGENTS.md`, `dev_docs/appendix_build.md`, `tests/mock-plex/*`.
- Verification:
  - `npm run test:types` passed.
  - `npm test` passed with the known expected stderr from failure-path tests.
  - Public repo references now point to `tests/mock-plex/mock-plex-server.cjs` instead of `_helpers/`.
- Follow-ups:
  - Keep future local-only demo media and personal helper scripts under `_helpers/` without wiring tracked repo scripts to that path.

## 2026-07-04

- Summary: Added a short implementation map for the current UI issue set under `_helpers/work`, covering likely change points and test follow-ups for TV pagination, movie search, collections, and hover-card behavior.
- Files or areas: `_helpers/work/ui-issues-map.md`.
- Verification:
  - Documentation-only change.
  - No tests run.
- Follow-ups:
  - Use the note as the working checklist when implementing fixes for the four analyzed issues.

## 2026-07-04

- Summary: Updated the `_helpers/work` issue note to reflect agreed directions for TV pagination, hybrid movie search, and hover-card behavior while leaving collections open for further design discussion.
- Files or areas: `_helpers/work/ui-issues-map.md`.
- Verification:
  - Documentation-only change.
  - No tests run.
- Follow-ups:
  - Finalize collection-folder precedence before implementation starts on point 3.

## 2026-07-04

- Summary: Implemented the agreed fixes for TV page-driven lazy pagination, hybrid movie search fallback/deduping, collection-first movie grouping, and hover-card anti-flicker behavior.
- Files or areas: `src/pages/ShowSelection/*`, `src/pages/Preview/*`, `src/components/PlexPopoverCard.tsx`, `src-tauri/src/plex_api.rs`, `_helpers/work/ui-issues-map.md`.
- Verification:
  - `npm run test:types` passed.
  - `npx vitest run src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml --lib -- --nocapture` passed.
- Follow-ups:
  - Add more targeted coverage for preview remote-search behavior and hover-card positioning if we want tighter regression protection around those flows.

## 2026-07-04

- Summary: Fixed the follow-up regressions by preventing movie remote search from re-running on page loads, syncing preview page size to saved pagination defaults, and broadening TV total-count parsing for Plex responses that omit `totalSize`.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/ShowSelection/ShowSelectionContainer.tsx`, `src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx`, `src/state/__tests__/settings-provider.test.tsx`.
- Verification:
  - `npm run test:types` passed.
  - `npx vitest run src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx src/state/__tests__/settings-provider.test.tsx src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml --lib -- --nocapture` passed.
- Follow-ups:
  - If TV page totals still read as `1/1` against a specific Plex server, capture the raw `fetch_tv_shows` payload from that server to extend the count-field fallback precisely instead of guessing.

## 2026-07-04

- Summary: Added regression coverage for preview movie search pagination stability and kept the expanded TV pagination coverage around capped and missing-total Plex responses.
- Files or areas: `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`, `src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx`.
- Verification:
  - `npm run test:types` passed.
  - `npx vitest run src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx` passed.
- Follow-ups:
  - Add a similar preview integration test for TV episode search if that flow starts getting the same local-plus-remote behavior as movies.
