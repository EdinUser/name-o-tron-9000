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

## 2026-07-09

- Summary: Added a user-facing `0.2.0` release summary to the MkDocs downloads/releases page so the website reflects the recent Plex refresh, template workflow, diagnostics, and large-library UX improvements.
- Files or areas: `docs/releases.md`.
- Verification:
  - `sed -n '1,80p' docs/releases.md`
- Follow-ups:
  - After the next release workflow run updates `release.json`, confirm the website shows both the new version metadata and the `0.2.0` summary text together.

- Summary: Moved the Linux release build job from the self-hosted Mint runner to `ubuntu-latest` so packaging artifacts come from a stable GitHub-hosted environment instead of the more drift-prone local machine.
- Files or areas: `.github/workflows/main.yml`.
- Verification:
  - workflow logic review only; not executed locally
- Follow-ups:
  - Re-run the release workflow and verify AppImage packaging succeeds on the hosted runner before relying on the new `v0.2.0` build artifacts.

- Summary: Realigned all release version sources to `0.2.0` after the Linux build exposed that Tauri bundle metadata was still pinned to `0.1.0` and the current branch manifests had drifted back to `0.1.2`.
- Files or areas: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
- Verification:
  - `sed -n '1,12p' package.json`
  - `sed -n '1,12p' src-tauri/Cargo.toml`
  - `sed -n '1,12p' src-tauri/tauri.conf.json`
- Follow-ups:
  - If the Linux AppImage build still fails after the version sources are aligned, capture the full `linuxdeploy` stderr because the stale version explains the wrong artifact names but not the AppImage execution failure itself.

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

## 2026-07-04

- Summary: Refreshed the Rust backend analysis note so it matches the current codebase and narrowed the recommendation from broad optimization to targeted refactoring of the largest maintenance hotspots.
- Files or areas: `_helpers/rust-codebase-analysis.md`, `src-tauri/src/video_rename.rs`, `src-tauri/src/plex_api.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/subtitle.rs`.
- Verification:
  - `wc -l src-tauri/src/*.rs` used to refresh file-size totals.
  - Reviewed current command boundaries and duplicated DTOs in Rust backend modules.
- Follow-ups:
  - If this work is resumed, start with shared rename/request/result DTO extraction before splitting `video_rename.rs`.

## 2026-07-04

- Summary: Added rename-regression tests around proposal generation, subtitle conversion, and apply-time filesystem behavior; expanded the rename safety note into a concrete renaming playbook with current implementation invariants and refactor guardrails.
- Files or areas: `src-tauri/src/video_rename.rs`, `src-tauri/src/subtitle.rs`, `dev_docs/playbooks/rename-safety-playbook.md`, `dev_docs/playbooks/README.md`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename` passed after fixing extension handling in rename proposals.
  - `cargo test --manifest-path src-tauri/Cargo.toml subtitle` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml path_map` passed.
  - `npm run test:rust` still fails in sandboxed integration tests that try to bind wiremock ports; all unit tests and rename-focused tests passed.
- Follow-ups:
  - If full Rust integration verification is needed, rerun `npm run test:rust` outside the sandbox so wiremock can bind local ports.
  - Add higher-level preview/apply parity tests once the rename DTOs and path-resolution helpers are easier to exercise without a full Tauri app handle.

## 2026-07-04

- Summary: Closed the next rename-safety backend gaps by testing mixed video+subtitle apply batches, rollback-log contents, current overwrite behavior on existing targets, empty-folder cleanup rules, and relative target resolution under path mappings.
- Files or areas: `src-tauri/src/video_rename.rs`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml subtitle` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml path_map` passed.
- Follow-ups:
  - Full `npm run test:rust` is still expected to hit sandbox limits in wiremock-based integration tests unless rerun with port-binding permission.
  - Preview/apply parity through the public `apply_video_renames(...)` Tauri command still deserves a higher-level harness if we want contract coverage above helper-level behavior.

## 2026-07-05

- Summary: Tightened the renaming playbook with explicit extraction rules for helper-based refactoring and documented the remaining post-refactor test backlog for command-level parity, undo, and consolidation work.
- Files or areas: `dev_docs/playbooks/rename-safety-playbook.md`.
- Verification:
  - Documentation-only change.
  - No tests run.
- Follow-ups:
  - Use the helper-extraction rules as the contract during the Rust refactor.
  - Treat the post-refactor backlog as the next rename-safety tranche after structural consolidation.

## 2026-07-05

- Summary: Started the Rust rename refactor by consolidating mapping-selection logic in `preview_video_renames(...)` and converting `subtitle::apply_renames(...)` to the same thin-wrapper-plus-helper pattern already used in the video rename path.
- Files or areas: `src-tauri/src/video_rename.rs`, `src-tauri/src/subtitle.rs`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml subtitle` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml path_map` passed.
- Follow-ups:
  - Continue consolidating duplicated rename/path-resolution code onto shared implementation points instead of adding parallel helpers.
  - Next likely target is unifying mapping selection and apply-time path resolution across `preview_video_renames(...)`, `apply_video_renames(...)`, and `subtitle::apply_renames(...)`.

## 2026-07-05

- Summary: Consolidated rollback-log execution onto one shared helper and one shared log-path builder, leaving the video path responsible only for its mixed video-versus-subtitle dispatch.
- Files or areas: `src-tauri/src/subtitle.rs`, `src-tauri/src/video_rename.rs`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml subtitle` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml path_map` passed.
- Follow-ups:
  - Mapping selection and apply-time path resolution are still intentionally separate because video and subtitle apply semantics differ today.
  - Next safe consolidation target is shared mapping-loading primitives, but only if they preserve the current hostname/exact-match behavior in the video path.

## 2026-07-05

- Summary: Moved path-mapping JSON loading and server filtering into `path_map.rs`, so subtitle and video rename flows now share the same parsing and hostname-match behavior instead of re-implementing it locally.
- Files or areas: `src-tauri/src/path_map.rs`, `src-tauri/src/path_map_tests.rs`, `src-tauri/src/subtitle.rs`, `src-tauri/src/video_rename.rs`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml subtitle` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml path_map` passed.
- Follow-ups:
  - Apply-time path resolution is still intentionally split because the video path accepts already-local and library-root-relative targets while subtitle apply does not.
  - If we consolidate resolution next, it needs explicit mode differences rather than one flattened helper.

## 2026-07-05

- Summary: Consolidated apply-time path resolution into shared `path_map.rs` helpers with explicit modes for strict mapped paths, already-local acceptance, and library-root-relative targets; updated subtitle and video apply paths to delegate to those helpers.
- Files or areas: `src-tauri/src/path_map.rs`, `src-tauri/src/path_map_tests.rs`, `src-tauri/src/subtitle.rs`, `src-tauri/src/video_rename.rs`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml subtitle` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml path_map` passed.
- Follow-ups:
  - Backup-path handling is still intentionally fallback-tolerant and remains string-preserving when strict resolution fails.
  - The next consolidation target should be cleanup path resolution, which still repeats the allow-local-or-mapped branch inline.

## 2026-07-05

- Summary: Moved empty-folder cleanup path resolution onto the shared allow-local apply helper so cleanup now uses the same mapped-versus-local decision path as the rest of the video apply flow.
- Files or areas: `src-tauri/src/video_rename.rs`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml subtitle` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml path_map` passed.
- Follow-ups:
  - The remaining cleanup-specific logic is now the upward directory walk and mapped-root boundary checks rather than path resolution itself.

## 2026-07-05

- Summary: Extracted shared rename DTOs into a dedicated backend module and rewired subtitle and video rename flows to depend on it directly instead of duplicating shapes or routing through `subtitle.rs` for shared request/result types.
- Files or areas: `src-tauri/src/rename_types.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/subtitle.rs`, `src-tauri/src/video_rename.rs`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml subtitle` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml path_map` passed.
- Follow-ups:
  - `video_rename.rs` still remains the largest maintenance hotspot even after the DTO extraction.
  - Re-audit the Rust backend analysis note so it reflects the reduced rename-path duplication and the remaining true hotspots.

## 2026-07-05

- Summary: Expanded the dedicated mock-Plex harness note into an implementation handoff with concrete file layout, phase-by-phase steps, first-slice deliverables, and rules for a fresh agent to continue without re-planning.
- Files or areas: `_helpers/work/mock-plex-harness-design-2026-07-05.md`.
- Verification:
  - reviewed the existing design note and filled the missing handoff details: target files, scenario manifests, builder script, initial Rust test names, and phase stop conditions.
- Follow-ups:
  - the next agent should be able to start directly from the “First Implementation Slice” and “Handoff Checklist” sections.

## 2026-07-05

- Summary: Added a dedicated mock-Plex harness design note that consolidates the existing Plex payload examples, prior mock-server guide, and generated test-media approach into one focused plan for API mock plus generated filesystem plus backend integration tests.
- Files or areas: `_helpers/work/mock-plex-harness-design-2026-07-05.md`.
- Verification:
  - inspected `_helpers/full_plex_examples/*.json`, `_helpers/mock-plex-server-implementation-guide.md`, `_helpers/tests/MOCK_SERVER_README.md`, and `_helpers/tests/setup-test-media-ultimate.sh`.
- Follow-ups:
  - the recommended architecture is a three-part harness, not a single giant fake Plex server.
  - next concrete step is to define the manifest contract for generated fixtures and Plex payload generation.

## 2026-07-05

- Summary: Implemented the first mergeable mock-Plex harness wave with richer tracked API fixtures, a manifest-driven filesystem builder, a backend integration suite, and a safer existing-target failure path for apply-time rename tests.
- Files or areas: `tests/mock-plex/*`, `src-tauri/tests/fixtures/mock_plex/*`, `src-tauri/tests/fixtures/bin/build_fixture_tree.sh`, `src-tauri/tests/mock_plex_harness_tests.rs`, `src-tauri/src/video_rename.rs`, `src-tauri/src/video_rename/apply.rs`, `src-tauri/src/video_rename/tests.rs`, `src-tauri/src/subtitle.rs`.
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` passed.
  - `node --check tests/mock-plex/mock-plex-server.cjs` passed.
  - `bash -n src-tauri/tests/fixtures/bin/build_fixture_tree.sh` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml --test mock_plex_harness_tests -- --nocapture` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename -- --nocapture` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml subtitle -- --nocapture` passed.
- Follow-ups:
  - The tracked mock server is still intentionally static; it does not mutate state after apply/undo.
  - The next harness slice should add TV-first manifests and, if needed, explicit contract coverage for conflict-policy variants beyond the new safe default failure path.

## 2026-07-05

- Summary: Consolidated the supported mock-Plex setup flow under `tests/mock-plex/` by adding tracked media/setup/verify shell scripts, wiring package scripts to them, updating the README, and turning the old `_helpers/tests` mock-server/path-mapping entrypoints into compatibility wrappers.
- Files or areas: `tests/mock-plex/README.md`, `tests/mock-plex/bin/*`, `package.json`, `.gitignore`, `_helpers/tests/mock-plex-server.cjs`, `_helpers/tests/setup-mock-path-mappings.sh`, `_helpers/tests/README.txt`, `_helpers/tests/MOCK_SERVER_README.md`.
- Verification:
  - `bash -n tests/mock-plex/bin/setup-test-media.sh` passed.
  - `bash -n tests/mock-plex/bin/write-path-mappings.sh` passed.
  - `bash -n tests/mock-plex/bin/verify-mock-plex.sh` passed.
  - `node --check tests/mock-plex/mock-plex-server.cjs` passed.
  - `npm run mock:setup` printed the expected setup output, but the `ctx-wire` wrapper did not preserve the created files for follow-up inspection in this environment.
  - Direct runs of `bash tests/mock-plex/bin/setup-test-media.sh --out ./test_media` and `bash tests/mock-plex/bin/write-path-mappings.sh --media-root ./test_media --out ./tests/mock-plex/generated/mock-path-mappings.json` produced the expected files.
  - Live localhost verification passed outside the sandbox: `bash tests/mock-plex/bin/verify-mock-plex.sh --base-url http://localhost:32400 --media-root ./test_media`.
- Follow-ups:
  - The tracked scripts now cover the current mock bundle, while `_helpers/tests/setup-test-media-ultimate.sh` remains the larger local-only torture-tree generator rather than the default tracked setup path.

## 2026-07-05

- Summary: Created a focused next-steps backlog note under `_helpers/work` covering dependency updates, mock Plex replacement strategy, blocks-view thumbnail audit, template live-update defects, and per-library template history.
- Files or areas: `_helpers/work/next-steps-backlog-2026-07-05.md`.
- Verification:
  - inspected `package.json`, `src-tauri/Cargo.toml`, `tests/mock-plex/`, and Preview/template-related frontend/backend files to ground the plan in current code.
- Follow-ups:
  - the note recommends doing template correctness/history first, then the real rename integration harness, then poster pagination, then dependency updates.

## 2026-07-05

- Summary: Continued the `video_rename` split by extracting common path/name helpers, template rendering, edition parsing, organization helpers, and sanitization into dedicated submodules while keeping the existing command and test surface stable.
- Files or areas: `src-tauri/src/video_rename.rs`, `src-tauri/src/video_rename/common.rs`, `src-tauri/src/video_rename/template.rs`, `src-tauri/src/video_rename/editions.rs`, `src-tauri/src/video_rename/organize.rs`, `src-tauri/src/video_rename/sanitize.rs`, `_helpers/rust-codebase-analysis.md`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml subtitle` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml path_map` passed.
- Follow-ups:
  - `video_rename.rs` is now down to 888 lines, but still owns preview/apply orchestration and the very large `has_non_latin(...)` helper.
  - `plex_api.rs` remains the clearest backend monolith at 2,184 lines.

## 2026-07-05

- Summary: Rewrote the Rust backend analysis note against the current codebase after the rename-path cleanup, updating file sizes, resolved findings, and next-step recommendations.
- Files or areas: `_helpers/rust-codebase-analysis.md`, `src-tauri/src/*.rs`.
- Verification:
  - `wc -l src-tauri/src/*.rs` used to refresh file-size totals.
  - `rg -n "TODO|FIXME|TODO:" src-tauri/src` used to refresh explicit behavior-debt markers.
- Follow-ups:
  - The refreshed audit now points at `video_rename.rs` and `plex_api.rs` as the real remaining hotspots.
  - If refactoring continues, the next structural step should be splitting `video_rename.rs`, not another round of minor helper extraction.

## 2026-07-06

- Summary: Reworked the movie-edition fixtures so the mock library now contains sibling entries for the same movie title/year with different editions, covering theatrical vs director's cut and theatrical vs extended handling.
- Files or areas: `tests/mock-plex/fixtures/movies_all.json`, `tests/mock-plex/fixtures/search_movies.json`, `tests/mock-plex/bin/setup-test-media.sh`, `tests/mock-plex/bin/verify-mock-plex.sh`, `tests/mock-plex/README.md`.
- Verification:
  - `jq empty tests/mock-plex/fixtures/movies_all.json tests/mock-plex/fixtures/search_movies.json` passed.
  - `bash -n tests/mock-plex/bin/setup-test-media.sh tests/mock-plex/bin/verify-mock-plex.sh` passed.
  - `node --check tests/mock-plex/mock-plex-server.cjs` passed.
  - `npm run mock:setup` passed.
  - `npm run mock:verify` passed against a fresh mock server process outside the sandbox because localhost socket verification is blocked in the sandbox.
- Follow-ups:
  - If we want to stress collection workflows further, the next step should be adding collection payloads that explicitly group these sibling editions.

## 2026-07-06

- Summary: Expanded the TV side of the tracked mock Plex bundle to a multi-show library with generated season lists, multi-season and limited-series examples, and aggregated episode fixtures that now behave more like a real Plex server.
- Files or areas: `tests/mock-plex/fixtures/shows_all.json`, `tests/mock-plex/fixtures/tv_all_leaves.json`, `tests/mock-plex/fixtures/search_tv.json`, `tests/mock-plex/mock-plex-server.cjs`, `tests/mock-plex/bin/setup-test-media.sh`, `tests/mock-plex/bin/verify-mock-plex.sh`, `tests/mock-plex/README.md`.
- Verification:
  - `jq empty tests/mock-plex/fixtures/shows_all.json tests/mock-plex/fixtures/tv_all_leaves.json tests/mock-plex/fixtures/search_tv.json` passed.
  - `node --check tests/mock-plex/mock-plex-server.cjs` passed.
  - `bash -n tests/mock-plex/bin/setup-test-media.sh tests/mock-plex/bin/verify-mock-plex.sh` passed.
  - `npm run mock:setup` passed.
  - direct endpoint check for `GET /library/metadata/201/children` returned the expected season directories.
  - `npm run mock:verify` passed against a fresh mock server process outside the sandbox because localhost socket verification is blocked in the sandbox.
- Follow-ups:
  - If we want even broader TV realism, the next additions should be one long-running sitcom-style catalog and one show with alternate version/cut naming on episode files.

## 2026-07-06

- Summary: Fixed two mock-Plex frontend regressions by preventing `ShowSelection` loads from leaving the spinner latched after short-circuit/overlap cases and by resetting movie reload fetches to offset `0` instead of reusing stale Preview pagination state.
- Files or areas: `src/pages/ShowSelection/ShowSelectionContainer.tsx`, `src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx`, `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`.
- Verification:
  - `npm run test -- src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx` passed.
  - `npm run test -- src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx` passed.
  - `npm run test:types` passed.
- Follow-ups:
  - Preview movie pagination still has overlapping initial-load and load-more paths; if more paging bugs appear, that state machine should be simplified instead of patched incrementally.

## 2026-07-06

- Summary: Expanded the tracked mock Plex bundle with richer movie edition cases, TV multi-episode and specials cases, matching local media generation, filtered hub search behavior, and updated mock verification/docs.
- Files or areas: `tests/mock-plex/fixtures/movies_all.json`, `tests/mock-plex/fixtures/shows_all.json`, `tests/mock-plex/fixtures/show_200_children.json`, `tests/mock-plex/fixtures/show_200_all_leaves.json`, `tests/mock-plex/fixtures/search_movies.json`, `tests/mock-plex/fixtures/search_tv.json`, `tests/mock-plex/fixtures/metadata_200.json`, `tests/mock-plex/mock-plex-server.cjs`, `tests/mock-plex/bin/setup-test-media.sh`, `tests/mock-plex/bin/verify-mock-plex.sh`, `tests/mock-plex/README.md`.
- Verification:
  - `jq empty tests/mock-plex/fixtures/*.json` passed.
  - `node --check tests/mock-plex/mock-plex-server.cjs` passed.
  - `bash -n tests/mock-plex/bin/setup-test-media.sh tests/mock-plex/bin/write-path-mappings.sh tests/mock-plex/bin/verify-mock-plex.sh` passed.
  - `npm run mock:setup` passed.
  - `npm run mock:verify` passed outside the sandbox because localhost socket access is blocked inside the sandbox.
- Follow-ups:
  - The next mock-fixture wave should add more than one TV show and separate collection payload coverage for edition-heavy movie cases if we want broader collection-scope workflow testing.

## 2026-07-06

- Summary: Adjusted Home discovery persistence so remembered Plex servers survive a fresh Discover run, added per-server removal in the discovered list, and covered the new behavior with focused HomeContainer tests.
- Files or areas: `src/pages/Home/HomeContainer.tsx`, `src/pages/Home/HomeTemplate.tsx`, `src/pages/Home/__tests__/HomeContainer.test.tsx`.
- Verification:
  - `npm run test -- src/pages/Home/__tests__/HomeContainer.test.tsx` passed.
  - `npm run test:types` passed.
- Follow-ups:
  - If we want automatic stale cleanup later, add a lightweight reachability flag or failed-interaction counter rather than deleting servers on a single missed discovery pass.

## 2026-07-06

- Summary: Fixed Home restore logic so saved `http://localhost:32400` entries are no longer treated as removable legacy mock servers and now persist across navigation back to Home.
- Files or areas: `src/pages/Home/HomeContainer.tsx`, `src/pages/Home/__tests__/HomeContainer.test.tsx`.
- Verification:
  - `npm run test -- src/pages/Home/__tests__/HomeContainer.test.tsx` passed.
  - `npm run test:types` passed.
- Follow-ups:
  - If the legacy mock cleanup is still needed, it should key off explicit mock metadata rather than the generic localhost address.

## 2026-07-05

- Summary: Started the structural split of the `video_rename` module by extracting types, apply/cleanup helpers, destination helpers, and the main test block into `src-tauri/src/video_rename/` submodules while keeping the public command surface stable.
- Files or areas: `src-tauri/src/video_rename.rs`, `src-tauri/src/video_rename/types.rs`, `src-tauri/src/video_rename/apply.rs`, `src-tauri/src/video_rename/destinations.rs`, `src-tauri/src/video_rename/tests.rs`, `src-tauri/src/lib.rs`, `_helpers/rust-codebase-analysis.md`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml subtitle` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml path_map` passed.
- Follow-ups:
  - The root `video_rename.rs` file is smaller now but still owns proposal generation, sanitization, and preview orchestration.
  - The next extractions should target template/sanitize/movie/episode/preview logic inside the remaining root module.

## 2026-07-05

- Summary: Continued the `video_rename` split by moving movie and episode proposal builders into dedicated submodules and finishing the migration of stray root-level tests into `video_rename/tests.rs`.
- Files or areas: `src-tauri/src/video_rename.rs`, `src-tauri/src/video_rename/movies.rs`, `src-tauri/src/video_rename/episodes.rs`, `src-tauri/src/video_rename/tests.rs`, `_helpers/rust-codebase-analysis.md`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml subtitle` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml path_map` passed.
- Follow-ups:
  - `video_rename.rs` is now down to 1,296 lines, but still owns preview orchestration plus the remaining helper/sanitization layer.
  - The next extractions should target the helper layer and then preview orchestration so the root becomes mostly command wiring.
  - A temporary unused `helpers.rs` extraction was intentionally removed in the same pass so the module split does not leave a shadow implementation behind.

## 2026-07-05

- Summary: Fixed mock-Plex library loading for full server URLs by centralizing Plex base-URL normalization in `plex_api.rs` and extracting shared library JSON parsing that is now covered directly by the tracked `tests/mock-plex/fixtures/libraries.json` payload.
- Files or areas: `src-tauri/src/plex_api.rs`.
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --check` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml build_base_variants -- --nocapture` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml parse_libraries_from_mock_fixture_preserves_roots -- --nocapture` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml test_list_libraries_with_mock_plex_server -- --nocapture` could not complete in the sandbox because wiremock could not bind a local port.
- Follow-ups:
  - If we want end-to-end regression coverage for the Libraries flow, rerun the mock-server integration test outside the sandbox so the local listener can bind normally.

## 2026-07-06

- Summary: Normalized TV episode rename tokens to Plex-style multi-episode output, preserved supported split-part suffixes, and extracted the token parsing/rendering rules into dedicated frontend and backend helpers instead of expanding the existing proposal files.
- Files or areas: `src/pages/Preview/episodeProposal.ts`, `src/pages/Preview/episodeTokens.ts`, `src/pages/Preview/__tests__/tv-episode-token-normalization.test.ts`, `src/pages/Settings/TV.tsx`, `src/components/TemplateHelpModal.tsx`, `src/state/settings.tsx`, `docs/features.md`, `docs/settings.md`, `docs/tips.md`, `src-tauri/src/video_rename/episode_tokens.rs`, `src-tauri/src/video_rename/episodes.rs`, `src-tauri/src/video_rename/tests.rs`.
- Verification:
  - `npm run test -- src/pages/Preview/__tests__/tv-episode-token-normalization.test.ts src/pages/Preview/__tests__/tv-extras-detection.test.ts` passed.
  - `npm run test:types` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml video_rename::tests -- --nocapture` passed.
- Follow-ups:
  - Split-part handling now preserves suffixes on individual files, but full multi-part episode support still depends on loading every Plex `Part` entry end-to-end in the TV browsing flow.

## 2026-07-06

- Summary: Fixed TV season pagination so page 2 triggers a real episode fetch instead of getting stuck on the loading placeholder, and corrected exhausted/page-count logic so grouped episode rows do not leave phantom extra pages.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`.
- Verification:
  - `npm run test -- src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx` passed.
  - `npm run test:types` passed.
- Follow-ups:
  - TV pagination now has its own incremental fetch path; if we later support “all seasons” paging in Preview, it should reuse the same fetch/exhaustion rules instead of adding another parallel path.

## 2026-07-06

- Summary: Relaxed the Preview page-transition loading gate so TV page 2 renders already-built episode rows instead of showing the loading placeholder indefinitely when background recompute flags lag behind the actual row state.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`.
- Verification:
  - `npm run test -- src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx` passed.
  - `npm run test:types` passed.
- Follow-ups:
  - If TV proposal generation gets more async work later, keep the page-transition gate keyed to page-row availability rather than broad global loading flags.

## 2026-07-07

- Summary: Fixed Windows-sensitive rename-path handling by joining relative apply targets component-wise under the mapped library root, and updated empty-folder cleanup assertions to use path-aware suffix checks instead of hardcoded `/` separators.
- Files or areas: `src-tauri/src/path_map.rs`, `src-tauri/src/video_rename/tests.rs`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml path_mapped_apply_uses_library_root_for_relative_new_paths -- --exact` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml cleanup_empty_folders_removes_empty_directories_but_keeps_non_empty_ones -- --exact` passed.
- Follow-ups:
  - The backend still returns native filesystem paths in cleanup/apply results; keep tests and any future UI string matching path-aware rather than slash-specific.

## 2026-07-07

- Summary: Added delete controls for saved Preview template favorites so users can remove persistent favorites directly from the shared recent/saved dropdown without affecting template history.
- Files or areas: `src/state/settings.tsx`, `src/state/__tests__/settings-load-save.test.tsx`, `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/PreviewTemplate.tsx`, `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`.
- Verification:
  - `npm run test:types` passed.
  - `npm test -- src/state/__tests__/settings-load-save.test.tsx src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx` passed.
- Follow-ups:
  - The Preview recompute path still emits duplicate-key warnings in the movie pagination integration harness; delete/favorites behavior is covered, but the row-key warning remains a separate cleanup item.

## 2026-07-07

- Summary: Added per-library saved template favorites alongside recent template history, with a single Preview dropdown that lets users promote recent entries into persistent saved templates and reapply either section directly.
- Files or areas: `src/state/settings.tsx`, `src/state/__tests__/test-utils/settings-setup.tsx`, `src/state/__tests__/settings-load-save.test.tsx`, `src/state/__tests__/settings-deep-merge.test.tsx`, `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/PreviewTemplate.tsx`, `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`, `src/pages/Settings/__tests__/general-diagnostics.test.tsx`, `docs/faq.md`.
- Verification:
  - `npm run test:types` passed.
  - `npm test -- src/state/__tests__/settings-load-save.test.tsx src/state/__tests__/settings-deep-merge.test.tsx src/pages/Settings/__tests__/general-diagnostics.test.tsx src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx` passed.
- Follow-ups:
  - The Preview recompute path still emits duplicate-key warnings in the movie pagination integration harness when template changes cause duplicate row ids; favorites/history work correctly, but that row-key issue should be audited separately.

## 2026-07-07

- Summary: Added per-server/per-library Preview template history with capped dedupe persistence in UI settings, plus a recent-template dropdown on the Preview input so users can restore one of the last 5 templates without leaving the screen.
- Files or areas: `src/state/settings.tsx`, `src/state/__tests__/test-utils/settings-setup.tsx`, `src/state/__tests__/settings-load-save.test.tsx`, `src/state/__tests__/settings-deep-merge.test.tsx`, `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/PreviewTemplate.tsx`, `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`, `src/pages/Settings/__tests__/general-diagnostics.test.tsx`, `docs/faq.md`.
- Verification:
  - `npm run test:types` passed.
  - `npm test -- src/state/__tests__/settings-load-save.test.tsx src/state/__tests__/settings-deep-merge.test.tsx src/pages/Settings/__tests__/general-diagnostics.test.tsx src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx` passed.
- Follow-ups:
  - The TV mock Plex bundle still lacks external ID tags for show-level template coverage; add `guid` / provider IDs there before writing dedicated TV token-history or TV-token template tests.
  - Preview still emits duplicate-key warnings in the movie pagination integration harness when the template changes; the history feature works, but the row recompute path should be audited separately if we want to eliminate that noise.

## 2026-07-07

- Summary: Promoted Plex ID placeholders to first-class token fields by adding `{imdbToken}` / `{tvdbToken}` / `{tmdbToken}` plus `{plexIds}`, then aligned frontend preview, Rust template rendering, help copy, and tests around Plex-style `{provider-id}` output while keeping legacy raw ID placeholders available.
- Files or areas: `src/utils/template.ts`, `src/pages/Preview/movieProposal.ts`, `src/pages/Preview/episodeProposal.ts`, `src/pages/Preview/musicProposal.ts`, `src/components/TemplateHelpModal.tsx`, `src/pages/Settings/TV.tsx`, `src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts`, `src-tauri/src/video_rename/movies.rs`, `src-tauri/src/video_rename/episodes.rs`, `src-tauri/src/video_rename/tests.rs`, `docs/faq.md`, `docs/tips.md`.
- Verification:
  - `npm test -- src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml movie_template_imdb_token_renders_as_plex_tag -- --exact` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml movie_template_plex_ids_renders_available_provider_tags -- --exact` passed.
- Follow-ups:
  - Existing raw placeholders `{imdb}`, `{tvdb}` / `{thetvdb}`, and `{tmdb}` still resolve for backward compatibility; if we want to fully deprecate them later, the Settings UI should surface a migration note for saved custom templates.

## 2026-07-07

- Summary: Expanded the tracked mock Plex bundle with external-ID-bearing GUIDs, added a flat-layout TV fixture with subtitle sidecars, and broadened the anime-special coverage so `{imdb}`/`{tmdb}`/`{tvdb}` template paths and Season 00 subtitle flows can be exercised without touching a real Plex server.
- Files or areas: `tests/mock-plex/fixtures/`, `tests/mock-plex/bin/setup-test-media.sh`, `tests/mock-plex/bin/verify-mock-plex.sh`, `src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts`, `src/pages/Preview/__tests__/subtitle-mapping.test.ts`.
- Verification:
  - `npm test -- src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts src/pages/Preview/__tests__/subtitle-mapping.test.ts` passed.
  - `npm run mock:setup` passed.
  - `npm run mock:verify` passed against the local tracked mock server.
- Follow-ups:
  - If we later want full Plex-shape fidelity for multi-provider IDs, the frontend preview path should eventually consume the `Guid[]` array in addition to the single `guid` field.

## 2026-07-08

- Summary: Fixed CI PR-route enforcement so retargeting a pull request triggers a fresh validation run instead of reusing stale base-branch event data.
- Files or areas: `.github/workflows/ci.yml`.
- Verification:
  - Documentation/config-only change.
  - Live GitHub inspection confirmed the stale failure was a rerun of an older `base_ref=main` pull_request event while PR `#52` now targets `develop`.
- Follow-ups:
  - GitHub rulesets still cannot enforce “only `develop -> main`” by source branch; keep `validate-pr-route` as the policy gate.
  - If you also want “no direct pushes to main,” add that separately through ruleset update restrictions or branch protection push restrictions.

- Summary: Resolved the open Dependabot transitive alerts by refreshing the npm lockfile onto `express@5.2.1`, `body-parser@2.3.0`, and an explicit `qs@6.15.3` override, and by updating the Rust lockfile from `rand 0.8.5` to `0.8.6`.
- Files or areas: `package.json`, `package-lock.json`, `src-tauri/Cargo.lock`.
- Verification:
  - `npm ls express body-parser qs` shows `express@5.2.1`, `body-parser@2.3.0`, and `qs@6.15.3`.
  - `npm run test:types` passed locally.
  - `npm test` passed locally.
  - `cargo test --manifest-path src-tauri/Cargo.toml` passed locally.
- Follow-ups:
  - The npm `qs` alert tied to `express` may take GitHub a short time to recalculate because upstream still declares `^6.14.0`; the repo now forces the patched resolved version.

- Summary: Bumped GitHub Actions Node.js runtime pins from 20 to 24 across CI and post-merge build workflows because Node 20 is EOL and GitHub was warning on the older runtime during Linux and Windows jobs.
- Files or areas: `.github/workflows/ci.yml`, `.github/workflows/main.yml`.
- Verification:
  - `npm run test:types` passed locally under Node `v22.19.0`.
  - `npm test -- src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx` passed locally.
  - `cargo test --manifest-path src-tauri/Cargo.toml --test mock_plex_harness_tests` passed locally.
- Follow-ups:
  - I could not run the suite under Node 24 locally in this environment; the authoritative validation is the refreshed GitHub Actions run on PR `#51`.

- Summary: Hardened CI after the repaired `develop -> main` promotion exposed a ShowSelection pagination regression in the test harness and deterministic Windows fixture-harness failures caused by the Rust tests shelling out to implicit WSL `bash` instead of Git Bash.
- Files or areas: `src/pages/ShowSelection/ShowSelectionContainer.tsx`, `src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx`, `src-tauri/tests/mock_plex_harness_tests.rs`.
- Verification:
  - `npm test -- src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx` passed locally.
  - `npm test -- src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx -t "loads the next backend page from pagination controls without showing Load more"` passed 5 consecutive local runs.
  - `cargo test --manifest-path src-tauri/Cargo.toml --test mock_plex_harness_tests` passed locally on Linux after the harness change.
- Follow-ups:
  - The Windows CI runner still depends on Git for Windows shipping `bash.exe` at the standard path unless `GIT_BASH_EXE` is set explicitly.
  - If the ShowSelection pagination test flakes again in CI, the next step should be instrumenting the page-transition state in the container rather than just extending test waits further.

- Summary: Fixed movie blocks-view poster loading for later paginated pages by reusing the same poster-enrichment step for incremental movie loads, and added a regression test that exercises page 3 in blocks view.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`.
- Verification:
  - `npm test -- src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`
  - `npm run test:types`
- Follow-ups:
  - Poster loading is still tied to the Preview row lifecycle rather than a viewport-aware image loader; that is acceptable for now, but if blocks view grows much larger we should consider visible-row-driven loading to reduce up-front image work.

- Summary: Fixed TV multi-episode preview proposals to stop joining episode titles with `/`, which produced OS-invalid filenames, and added a regression test around the Battlestar-style combined-episode case.
- Files or areas: `src/pages/Preview/episodeProposal.ts`, `src/pages/Preview/__tests__/tv-episode-token-normalization.test.ts`, `src/components/TemplateHelpModal.tsx`.
- Verification:
  - `npm test -- src/pages/Preview/__tests__/tv-episode-token-normalization.test.ts`
- Follow-ups:
  - Several Preview tests still mock `sanitize_filename_cmd` as a no-op with empty `characterReplacement` settings; if more filename-safety regressions show up, it would be worth centralizing a realistic sanitizer mock for the Preview test suite.

- Summary: Added a temporary movie-only Plex item refresh button in Preview so a real PMS can be tested against `plex_refresh_metadata_item` before wiring any automatic post-rename behavior.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/PreviewTemplate.tsx`.
- Verification:
  - `npm run test:types`
- Follow-ups:
  - This is a manual test hook only and should be removed or replaced when the final Plex refresh flow is implemented.

- Summary: Extended the temporary Preview Plex test hooks to cover TV episode-item refresh, TV show-item refresh, and comma-joined multi-ID movie refresh requests for empirical API validation before finalizing the automatic ping design.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/PreviewTemplate.tsx`.
- Verification:
  - `npm run test:types`
- Follow-ups:
  - Multi-ID behavior is intentionally empirical here because the Plex OpenAPI names the path parameter `ids` but does not document the delimiter/encoding semantics for multiple IDs.

- Summary: Updated the Plex API client to prefer the caller-provided scheme first when probing server base URLs, and stopped placing the Plex token in metadata/section refresh URLs so refresh logs no longer leak it.
- Files or areas: `src-tauri/src/plex_api.rs`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml build_base_variants -- --nocapture`
- Follow-ups:
  - Metadata multi-ID refresh still returned `404` against PMS even after path encoding was corrected, so the final automatic movie refresh flow should send one refresh per item.

- Summary: Re-enabled automatic post-rename Plex refreshes in Preview using differentiated metadata-item strategies: movies refresh one item at a time, TV refreshes episodes individually for small batches, and TV batches over two episodes try a season refresh first with fallback to show refresh and then episode refresh if needed.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/PreviewTemplate.tsx`.
- Verification:
  - `npm run test:types`
- Follow-ups:
  - Undo still uses the older no-refresh path; if undo must mirror apply, the next step is to carry or reconstruct the same refresh-target strategy for rollback-driven operations.

- Summary: Replaced the new automatic post-rename metadata refresh with targeted Plex section path refreshes because metadata refresh left renamed files marked Unavailable in Plex, and fixed the apply summary modal reopen bug by collapsing the summary state update to a single write after refresh completes.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`.
- Verification:
  - `npm run test:types`
- Follow-ups:
  - The temporary metadata-refresh test hooks remain useful for probing Plex behavior, but the real automatic rename path should now be evaluated against path refresh only.

- Summary: Fixed GitHub Actions shell selection for Linux/container workflow steps that use `set -euo pipefail` by forcing those steps to run under `bash` instead of `/bin/sh`.
- Files or areas: `.github/workflows/ci.yml`, `.github/workflows/main.yml`, `.github/workflows/docs-site.yml`.
- Verification:
  - workflow logic review only; not executed locally
- Follow-ups:
  - Re-run the Linux CI job to confirm the self-hosted container step no longer fails with `Illegal option -o pipefail`.

- Summary: Tightened diagnostic bundle export policy by switching from “any recent JSON” collection to explicit rollback/preview file allowlists, keeping rename-relevant item names while redacting environment identifiers, and excluding prior diagnostic bundles from re-export. Added focused Rust tests for the sanitizer and recent-file selection behavior.
- Files or areas: `src-tauri/src/diagnostics.rs`, `README.md`, `docs/settings.md`, `docs/faq.md`.
- Verification:
  - `cargo test diagnostics --manifest-path src-tauri/Cargo.toml`
- Follow-ups:
  - If users want a stronger privacy mode later, add a separate strict-anonymous export that pseudonymizes item names as well.

- Summary: Disabled the newly added automatic post-rename Plex ping after real-PMS testing showed that section path refresh still triggered a full movie-library rescan, which makes it unsafe for normal rename flow.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`.
- Verification:
  - based on real PMS behavior from manual rename + refresh testing
- Follow-ups:
  - Keep the temporary manual refresh test hooks for further exploration, but do not auto-trigger Plex refresh again until a server-safe strategy is confirmed.

- Summary: Removed the temporary per-row Plex refresh test controls from Preview, added a deliberate header-level `Force Plex Scan` action for manual full-library rescans, and changed the empty-folder summary modal so the destructive cleanup button disappears after the first cleanup run, leaving only Close.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/PreviewTemplate.tsx`.
- Verification:
  - `npm run test:types`
- Follow-ups:
  - Undo still has no Plex integration. The new `Force Plex Scan` is intentionally explicit and manual because the tested automatic refresh options were unsafe.

- Summary: Added back a temporary per-movie path-scan test button in Preview so the no-`force` section-path refresh variant can be tested directly from a movie row without using the broad header-level `Force Plex Scan`.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/PreviewTemplate.tsx`.
- Verification:
  - `npm run test:types`
- Follow-ups:
  - This button is only for the current PMS behavior experiment and should be removed again once the path-scan result is confirmed.

- Summary: Re-enabled automatic movie-only post-rename Plex path refreshes using the confirmed working no-`force` section-path scan, and restored temporary TV episode/show row buttons to test the same path-scan strategy for TV folders.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/PreviewTemplate.tsx`.
- Verification:
  - `npm run test:types`
- Follow-ups:
  - TV path-scan behavior is still exploratory and should not be made automatic until real PMS testing confirms it remains scoped and reconciles renamed files correctly.

- Summary: Enabled automatic post-rename TV Plex path refreshes using the confirmed working section-path scan strategy, with episode-folder refresh for small batches and show-folder refresh when more than two episodes were renamed; also converted the Preview TV episode control to the same compact icon-only rescan trigger used for movies and restored an icon-only manual show rescan action in the TV Show Selection list.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/PreviewTemplate.tsx`, `src/pages/ShowSelection/ShowSelectionContainer.tsx`, `src/pages/ShowSelection/ShowSelectionTemplate.tsx`.
- Verification:
  - `npm run test:types`
- Follow-ups:
  - Undo still does not trigger a matching Plex path rescan, so rollback-driven file moves can still require a manual rescan until that path is implemented.

- Summary: Hooked successful `Undo Last Rename` runs into the targeted Plex section-path refresh flow by returning rollback operations from the backend, reconstructing Plex paths from saved mappings on the frontend, and surfacing undo-time Plex refresh warnings in the UI. Added regression coverage for refresh target selection, Preview undo-triggered refresh calls, TV Show Selection scoped rescans, and the backend rollback payload contract. Extended the tracked mock Plex server with refresh-recording endpoints and documented that they record requests without emulating real Plex rescans.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/PreviewTemplate.tsx`, `src/pages/Preview/plexRefresh.ts`, `src/pages/Preview/__tests__/plex-refresh.test.ts`, `src/pages/Preview/__tests__/preview-plex-refresh.integration.test.tsx`, `src/pages/ShowSelection/ShowSelectionContainer.tsx`, `src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx`, `src-tauri/src/rename_types.rs`, `src-tauri/src/subtitle.rs`, `src-tauri/tests/mock_plex_harness_tests.rs`, `tests/mock-plex/mock-plex-server.cjs`, `tests/mock-plex/README.md`, `dev_docs/playbooks/rename-safety-playbook.md`, `dev_docs/playbooks/testing-playbook.md`, `docs/features.md`.
- Verification:
  - `npm run test:types`
  - `npm test`
  - `npm run test:rust` reached the known sandbox limit in the wiremock port-binding integration tests
  - `cargo test --manifest-path src-tauri/Cargo.toml --test mock_plex_harness_tests`
  - `node -c tests/mock-plex/mock-plex-server.cjs`
- Follow-ups:
  - Real PMS validation is still required for any future change to refresh semantics because the mock refresh routes are observational only.

- Summary: Fixed the self-hosted Linux GitHub Actions workspace cleanup failure by restoring ownership after the containerized CI job and by repairing workspace permissions before the Linux build workflow checks out code. This addresses the `EACCES` unlink failure on `.git/FETCH_HEAD` caused by root-owned files left behind in the shared runner workspace.
- Files or areas: `.github/workflows/ci.yml`, `.github/workflows/main.yml`.
- Verification:
  - Workflow logic review only; not executed locally
- Follow-ups:
  - Re-run the `CI` and `Build Name-o-Tron 9000 App (Cross-Platform)` workflows on the Mint runner to confirm the workspace can now be cleaned across jobs.

- Summary: Updated GitHub Actions majors to Node 24-capable releases and removed npm/Rust dependency cache writes from the post-merge build workflow so release builds stop emitting cache-scope warnings on GitHub-hosted runners. Artifact download/upload steps were upgraded as part of the same runtime migration.
- Files or areas: `.github/workflows/ci.yml`, `.github/workflows/main.yml`, `.github/workflows/docs-site.yml`.
- Verification:
  - Workflow logic review only; not executed locally
- Follow-ups:
  - Re-run `Build Name-o-Tron 9000 App (Cross-Platform)` and confirm the Node 20 deprecation warnings and Windows cache warning are gone.
