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

## 2026-07-13

- Summary: Repositioned the MkDocs site around Plex-metadata-powered media-library normalization, added SEO landing pages, Discord visibility, agent discovery files, and CI-friendly docs plugin dependencies.
- Files or areas: `docs/`, `mkdocs.yml`, `.github/workflows/docs-site.yml`, `requirements-docs.txt`, `README.md`.
- Verification:
  - `python -m mkdocs --version` confirmed MkDocs was not installed locally.
  - temporary venv install from `requirements-docs.txt` completed.
  - `mkdocs build --clean --site-dir /tmp/nameotron-site` passed.
  - generated output includes `sitemap.xml`, `robots.txt`, `llms.txt`, homepage JSON-LD, and FAQ JSON-LD.
- Follow-ups:
  - Validate rich results and Search Console after deployment.

- Summary: Applied a follow-up content refinement pass from the docs audit: clarified no-second-scraper positioning, target users, portable-library meaning, provider-ID examples, FAQ safety wording, rollback boundaries, and future SEO page candidates.
- Files or areas: `docs/index.md`, `docs/features.md`, `docs/faq.md`, `docs/tips.md`, `docs/what-is-name-o-tron.md`, `README.md`, `_helpers/work/future-seo-pages-2026-07-13.md`.
- Verification:
  - `rg` stale wording scan for old Plex-renamer/auth/path/rollback phrases returned no matches.
  - `git diff --check` passed.
  - `mkdocs build --clean --site-dir /tmp/nameotron-site` passed.
- Follow-ups:
  - Revisit the deferred SEO pages after the core pages are reviewed and accepted.

## 2026-07-04

## 2026-07-09

- Summary: Unified Linux packaging behind a repo-owned containerized build path so local and GitHub AppImage/RPM/DEB builds run through the same Docker image, while the linuxdeploy wrapper installer now force-refreshes cache state every build.
- Files or areas: `.github/workflows/main.yml`, `package.json`, `scripts/build-linux-bundles.sh`, `scripts/linux-packaging/`, `scripts/install-linuxdeploy-wrapper.sh`.
- Verification:
  - shell syntax review pending targeted script validation
- Follow-ups:
  - Build Linux artifacts through the shared script locally and on GitHub, then compare checksums and runtime behavior against the downloaded artifacts.

- Summary: Moved Linux packaging tools off the user home cache and into Tauri's repo-local tools directory so the wrapper runs as part of the build environment instead of patching `~/.cache/tauri`.
- Files or areas: `src-tauri/tauri.conf.json`, `scripts/install-linuxdeploy-wrapper.sh`, `scripts/linuxdeploy/linuxdeploy-wrapper.sh`.
- Verification:
  - shell syntax review only
- Follow-ups:
  - Confirm `src-tauri/target/.tauri/` is the exact tools path Tauri uses with `useLocalToolsDir = true` during the next Linux bundle run.

- Summary: Stopped trying to inject the wrapper into Tauri's own linuxdeploy tool slot and now use the repo-owned wrapper only as the final AppImage packaging step after Tauri generates the AppDir, while Tauri still produces the DEB and RPM.
- Files or areas: `scripts/linux-packaging/build-linux-bundles-in-container.sh`, `scripts/install-linuxdeploy-wrapper.sh`, `src-tauri/tauri.conf.json`.
- Verification:
  - direct wrapper run inside the Ubuntu builder container completed successfully and produced `name-o-tron-9000_0.2.0_amd64.AppImage`
- Follow-ups:
  - rerun the full shared Linux bundle script and compare the rebuilt downloaded AppImage/RPM/DEB artifacts against local outputs.

- Summary: Moved the Linux AppImage `linuxdeploy` wrapper out of local `~/.cache/tauri` state and into tracked repo scripts so GitHub Linux builds can use the same wrapper behavior as local Fedora builds.
- Files or areas: `.github/workflows/main.yml`, `scripts/install-linuxdeploy-wrapper.sh`, `scripts/linuxdeploy/`.
- Verification:
  - workflow logic review only; not executed locally
- Follow-ups:
  - Run the Linux release workflow and compare the rebuilt downloaded AppImage against the local Fedora build for size, bundled libraries, and runtime behavior on Fedora/Arch.

- Summary: Fixed Fedora-local Linux packaging by overriding Tauri's cached AppImage tooling, added Linux AppStream metadata and a custom desktop template for package-manager presentation, and documented bundle metadata needed for local installer smoke tests.
- Files or areas: `src-tauri/tauri.conf.json`, `src-tauri/linux/name-o-tron-9000.metainfo.xml`, `src-tauri/linux/name-o-tron-9000.desktop.hbs`, local `~/.cache/tauri/` linuxdeploy override.
- Verification:
  - `npx tauri build -v --bundles appimage`
  - `npm run bundle:linux`
  - `rpm -qip src-tauri/target/release/bundle/rpm/name-o-tron-9000-0.2.0-1.x86_64.rpm`
- Follow-ups:
  - Rebuild the Linux bundles after switching the local linuxdeploy override to no-op library stripping and confirm the generated AppImage no longer segfaults at loader startup on Fedora.
  - Recheck Discover with the rebuilt RPM/DEB to confirm the AppStream metadata removes the unknown author / missing icon presentation.

- Summary: Investigated Linux packaging/runtime failures, confirmed local Fedora AppImage builds fail inside `linuxdeploy` because its bundled `strip` cannot process RELR-based shared libraries, and added the Linux WebKitGTK DMABUF workaround to reduce blank-window/helper-process crashes in shipped builds.
- Files or areas: `src-tauri/src/lib.rs`, local AppImage bundle output under `src-tauri/target/debug/bundle/appimage/`.
- Verification:
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `env APPIMAGE_EXTRACT_AND_RUN=1 ~/.cache/tauri/linuxdeploy-x86_64.AppImage --appdir src-tauri/target/debug/bundle/appimage/name-o-tron-9000.AppDir --output appimage`
- Follow-ups:
  - Rebuild the GitHub Linux artifacts and retest the AppImage on Fedora to see whether disabling the DMABUF renderer removes the white-screen/WebKit helper crash.
  - If AppImage runtime failures persist, inspect whether the generated GTK AppRun hook or bundled WebKitGTK library set from `ubuntu-latest` is conflicting with Fedora host graphics/runtime expectations.

- Summary: Replaced placeholder Linux bundle metadata with real app metadata and added a local Linux installer build path so AppImage, `.deb`, and `.rpm` artifacts can be smoke-tested before GitHub release runs.
- Files or areas: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `package.json`, `README.md`, `dev_docs/appendix_build.md`.
- Verification:
  - `npm run test:types`
  - `npm run tauri build -- --bundles appimage --debug`
- Follow-ups:
  - Rebuild the Linux artifacts locally on Fedora and verify whether the AppImage white-screen reproduces outside GitHub Actions.
  - If the AppImage still aborts in `WebKitWebProcess`, inspect the generated `.desktop` file and the unpacked AppImage runtime contents to determine whether the issue is metadata-only or an AppImage runtime compatibility problem.

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

## 2026-07-10

- Summary: Converted the Preview mapping/safety test to use a tracked movie fixture for the mapped and unmatched path cases while leaving the synthetic long-path toggle case in place, so the file now mixes real fixture shape where it matters with focused synthetic input where fixtures add no value.
- Files or areas: `src/pages/Preview/__tests__/preview-proposals-unmatched-and-safety.test.ts`.
- Verification:
  - `npm test -- src/pages/Preview/__tests__/preview-proposals-unmatched-and-safety.test.ts` passed.
- Follow-ups:
  - Continue the fixture-backed Preview wave until the remaining conversions start being blocked by missing tracked datasets rather than by test helper shape.

- Summary: Converted the Preview undo-refresh integration test to tracked movie fixture data so the refresh target path now comes from the same mock Plex movie metadata used elsewhere in the harness instead of from a hand-built movie record.
- Files or areas: `src/testUtils/mockPlexFixtures.ts`, `src/pages/Preview/__tests__/preview-plex-refresh.integration.test.tsx`.
- Verification:
  - `npm test -- src/pages/Preview/__tests__/preview-plex-refresh.integration.test.tsx` passed.
- Follow-ups:
  - Continue the fixture-backed Preview wave before moving to dataset expansion for pagination-heavy scenarios.

- Summary: Extended the frontend mock-fixture helper to cover tracked library fixtures and converted the Library Selection tests to use `libraries.json` roots instead of hand-built library entries.
- Files or areas: `src/testUtils/mockPlexFixtures.ts`, `src/pages/__tests__/LibrarySelection.test.tsx`.
- Verification:
  - `npm test -- src/pages/__tests__/LibrarySelection.test.tsx` passed.
- Follow-ups:
  - Continue the fixture-backed wave with remaining non-pagination Preview and Home-adjacent tests that still hand-assemble Plex-shaped data.

- Summary: Added a frontend mock-fixture helper layer and used it to convert the first real fixture-backed test slice: Show Selection integration tests now derive TV show and episode data from the tracked mock Plex fixtures, and movie backend folder tests now use tracked movie fixtures for provider-tag proposal coverage.
- Files or areas: `src/testUtils/mockPlexFixtures.ts`, `src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx`, `src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts`.
- Verification:
  - `npm test -- src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx` passed.
  - `npm test -- src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx` passed.
- Follow-ups:
  - Keep the next enrichment wave focused on fixture-backed tests that benefit from tracked payload shape without needing live mock-server orchestration.
  - Pagination-heavy tests still need larger tracked fixture catalogs before a live mock-backed conversion is worthwhile.

- Summary: Finished the mock harness portability slice by replacing bash-only reset and verify flows with Node-based scripts, adding a preferred `mock:reset` entrypoint, and making the mock setup path usable from Windows-oriented automation as well as Linux.
- Files or areas: `tests/mock-plex/bin/mock-shared.mjs`, `tests/mock-plex/bin/mock-reset.mjs`, `tests/mock-plex/bin/mock-verify.mjs`, `tests/mock-plex/README.md`, `package.json`.
- Verification:
  - `node --check tests/mock-plex/bin/mock-shared.mjs` passed.
  - `node --check tests/mock-plex/bin/mock-reset.mjs` passed.
  - `node --check tests/mock-plex/bin/mock-verify.mjs` passed.
  - `npm run mock:reset` passed.
  - `node --check tests/mock-plex/bin/mock-harness.mjs` passed after the readiness fallback adjustment.
  - `npm run mock:start` created the expected state/log output, but detached child persistence could not be fully proven in this sandbox because the background process was reaped immediately after script exit.
  - `npm run mock:stop` handled the resulting stale state cleanly.
- Follow-ups:
  - The shell helpers can remain as compatibility scripts for now, but new automation should target the Node entrypoints.
  - Later orchestration should thread the chosen mock base URL into reset, verify, and test commands for non-default ports.
  - Full `mock:verify` should be exercised on a normal local machine or in CI where loopback HTTP and detached child persistence are not sandbox-restricted.

- Summary: Added a cross-platform Node lifecycle harness for the tracked mock Plex server, made the server bind host/port configurable via env, and exposed `mock:start` / `mock:stop` / `mock:status` package scripts so future mock-backed tests can depend on a stable start/stop flow instead of ad hoc backgrounding.
- Files or areas: `tests/mock-plex/mock-plex-server.cjs`, `tests/mock-plex/bin/mock-harness.mjs`, `tests/mock-plex/README.md`, `package.json`.
- Verification:
  - `node --check tests/mock-plex/mock-plex-server.cjs` passed.
  - `node --check tests/mock-plex/bin/mock-harness.mjs` passed.
  - `npm run mock:status` reported the expected non-running state before start.
- Follow-ups:
  - Mock media setup is still shell-based, so Windows-ready mock-backed suites still need a cross-platform reset/setup path.
  - `mock:verify` still defaults to `localhost:32400`; later orchestration should thread a chosen base URL through setup, verify, and test commands.

- Summary: Narrowed the RPM/Discover packaging path by removing the duplicate `.appdata.xml` install from the RPM bundle and aligning the AppStream component identity with the desktop file Tauri actually installs. This reduces conflicting metadata paths for KDE Discover while keeping the AppImage-specific AppStream alias in place for AppImage tooling.
- Files or areas: `src-tauri/tauri.conf.json`, `src-tauri/linux/com.lenivec.name-o-tron-9000.metainfo.xml`.
- Verification:
  - Reviewed `node_modules/@tauri-apps/cli/config.schema.json` to confirm Tauri exposes no RPM `vendor`/`packager` fields in config
  - Inspected the built RPM payload and confirmed it installs `name-o-tron-9000.desktop`
- Follow-ups:
  - Rebuild the RPM and re-check Discover's local-RPM preview.
  - If Discover still shows fallback package naming, investigate whether the local-file preview ignores embedded AppStream and depends on RPM `Vendor` / `Packager` fields that Tauri does not expose.

- Summary: Cleaned the AppStream source metadata by replacing the deprecated `developer_name` tag with a structured `developer` element and removing the screenshot block until a valid public image URL is available. This targets the remaining AppStream validation issues without changing the RPM build flow.
- Files or areas: `src-tauri/linux/com.lenivec.name-o-tron-9000.metainfo.xml`.
- Verification:
  - Source-only edit; rebuild and `appstreamcli validate` still pending
- Follow-ups:
  - Rebuild the RPM and validate the packaged metainfo file.
  - If needed, add screenshots back only after the hosted image returns a clean `200` and passes validation.
- Summary: Hardened the GitHub-hosted Linux release build by adding an explicit workflow preflight for the Tauri Linux packaging assets and normalizing the custom desktop template to use Tauri-provided metadata. This makes the hosted Linux job fail fast when `tauri.conf.json` references repo files that were not committed.
- Files or areas: `.github/workflows/main.yml`, `src-tauri/linux/name-o-tron-9000.desktop.hbs`, `src-tauri/linux/name-o-tron-9000.metainfo.xml`.
- Verification:
  - `git status --short src-tauri/linux .github/workflows/main.yml`
  - Reviewed the failing GitHub log against the tracked Linux workflow and Tauri bundle config
- Follow-ups:
  - Commit the `src-tauri/linux/` files so the GitHub-hosted runner can actually package with the custom desktop metadata.
  - Re-run `Build Name-o-Tron 9000 App (Cross-Platform)` and confirm the `.deb` step gets past desktop file creation.

- Summary: Updated the deploy job to create the remote versioned installer and metadata directories before `scp`, so artifact publication no longer depends on the VPS path already existing.
- Files or areas: `.github/workflows/main.yml`.
- Verification:
  - Workflow logic review against the deploy/upload section
- Follow-ups:
  - Re-run the release workflow and confirm the Linux/Windows installers land under `/downloads/<version>/` and `release.json` lands under both `/<version>/` and `/`.

- Summary: Switched release builds to run on `push` to `main` and added a dedicated fast-forward-only `develop -> main` promotion workflow so releases can advance `main` without PR merge commits or “merge main back into develop” churn. This keeps `develop` as the source branch while making `main` a promoted release pointer.
- Files or areas: `.github/workflows/main.yml`, `.github/workflows/promote-main.yml`.
- Verification:
  - Workflow logic review against the `main` release trigger and promotion-path checks
- Follow-ups:
  - Run `Promote develop to main` from the `develop` branch and confirm it fast-forwards `main`.
  - Confirm the resulting `push` to `main` triggers `Build Name-o-Tron 9000 App (Cross-Platform)` and uploads the generated installers.

- Summary: Expanded the tracked mock Plex movie HTTP fixtures so frontend-facing mock-server tests can move from synthetic pagination rows to realistic movie browsing and remote-search payloads. The existing edge-case movies remain stable, and the new slice adds enough volume for page 2/page 3 movie scenarios plus a 20-result movie search hub.
- Files or areas: `tests/mock-plex/fixtures/movies_all.json`, `tests/mock-plex/fixtures/search_movies.json`.
- Verification:
  - `node -e "..."` JSON parse/count check confirmed `movies_all.json` now exposes 30 items and `search_movies.json` now exposes 20 hub results.
  - `npm test -- src/pages/Preview/__tests__/preview-proposals-unmatched-and-safety.test.ts src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts src/pages/Preview/__tests__/preview-plex-refresh.integration.test.tsx` passed.
- Follow-ups:
  - Convert `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx` from synthetic `makeLibraryMovie` / `makeSearchMovie` arrays to the expanded tracked fixtures.
  - Expand `shows_all.json` and `search_tv.json` next so TV paging can move onto the same live mock-data path.

- Summary: Moved the movie-side pagination regression coverage onto tracked mock Plex fixtures instead of synthetic in-test movie/search row builders. The spec now slices `movies_all.json` and `search_movies.json` through shared test helpers, while the TV pagination cases remain synthetic until the TV fixture set is expanded.
- Files or areas: `src/testUtils/mockPlexFixtures.ts`, `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`.
- Verification:
  - `npm test -- src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx` passed.
- Follow-ups:
  - Expand `shows_all.json` and `search_tv.json`, then convert the TV-side pagination/search tests to the tracked mock dataset as well.

- Summary: Expanded the tracked TV HTTP fixtures from 4 to 24 shows and from 8 to 16 TV search hits, then moved the show-list pagination regressions onto tracked `shows_all.json` slices instead of synthetic show arrays. This keeps the keyed legacy TV fixtures intact while making the tracked dataset large enough for real page-2 behavior in `ShowSelection`.
- Files or areas: `tests/mock-plex/fixtures/shows_all.json`, `tests/mock-plex/fixtures/search_tv.json`, `src/testUtils/mockPlexFixtures.ts`, `src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx`.
- Verification:
  - `node -e "..."` JSON parse/count check confirmed `shows_all.json` now exposes 24 items and `search_tv.json` now exposes 16 hub results.
  - `npm test -- src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx` passed.
- Follow-ups:
  - Convert TV remote-search coverage to `getMockSearchTv(...)` once a targeted tracked-fixture TV search regression is added.
  - Decide whether to expand `tv_all_leaves.json` next so preview episode paging can move off the synthetic 50-episode batches.

- Summary: Expanded the tracked TV episode fixture so `Abyssal Gate` season 1 now spans 50 episodes, added season-filtered TV helper accessors, and moved the Preview episode-pagination regression onto that tracked dataset instead of synthetic 30/20 episode batches.
- Files or areas: `tests/mock-plex/fixtures/tv_all_leaves.json`, `tests/mock-plex/fixtures/show_200_all_leaves.json`, `src/testUtils/mockPlexFixtures.ts`, `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`.
- Verification:
  - `node -e "..."` JSON parse/count check confirmed `tv_all_leaves.json` now exposes 67 total episodes, with show `200` exposing 53 total and 50 in season 1.
  - `npm test -- src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx` passed.
- Follow-ups:
  - If we later want direct fixture parity for the legacy standalone `show_200_children.json`, it should be refreshed to reflect the expanded season counts as well.
  - TV remote-search regressions can now switch to `getMockSearchTv(...)` without needing additional HTTP fixture growth first.

- Summary: Finished the tracked TV search regression pass by aligning Preview's TV mock library roots with the mock Plex fixture paths, swapping ShowSelection's search assertions onto tracked show titles, and adding a Preview TV remote-search case that exercises `getMockSearchTv(...)` instead of synthetic rows.
- Files or areas: `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`, `src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx`.
- Verification:
  - `npm test -- src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx` passed.
  - `npm test -- src/pages/ShowSelection/__tests__/ShowSelection.integration.test.tsx` passed.
- Follow-ups:
  - The remaining gap is broader behavior coverage around rename/apply flows; current mock-backed search and pagination coverage now uses tracked fixture data on both movie and TV paths.
- Summary: Added a movie-folder sub-setting that controls what happens when a movie already lives inside a shared parent folder. The default now preserves the higher-level grouping while still inserting a dedicated movie folder beneath it, which fixes cases like `J-R/One Piece/<movie>.mkv` without removing the option to keep the shared folder as the final leaf. The Rust-side movie proposal path used by `preview_video_renames` was also aligned so the backend-only preview helper honors the same shared-folder rule.
- Files or areas: `src/state/settings.tsx`, `src/pages/Settings/Movies.tsx`, `src/pages/Preview/movieProposal.ts`, `src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts`, `src-tauri/src/video_rename/destinations.rs`, `src-tauri/src/video_rename/tests.rs`, `docs/settings.md`, `docs/tips.md`, `dev_docs/appendix_api.md`.
- Verification:
  - `npx vitest run src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx src/pages/Settings/__tests__/general-diagnostics.test.tsx src/state/__tests__/settings-provider.test.tsx` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml compute_movie_` passed.
- Follow-ups:
  - Revisit Plex refresh reporting after we decide whether path-refresh issues should surface only for non-2xx responses.
  - If we later want stronger end-to-end coverage for grouped movie folders in the mock Plex flow, add a tracked fixture case that mirrors the `One Piece` shared-folder layout.

- Summary: Adjusted the backend preview subtitle path generation so movie subtitles follow the newly created movie folder instead of staying in the original shared parent, and added a frontend regression that asserts movie subtitle targets inherit the nested movie folder path.
- Files or areas: `src-tauri/src/video_rename.rs`, `src/pages/Preview/__tests__/subtitle-mapping.test.ts`.
- Verification:
  - `npx vitest run src/pages/Preview/__tests__/subtitle-mapping.test.ts src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml compute_movie_` passed.
- Follow-ups:
  - If you still see a subtitle left behind, capture one exact video filename plus subtitle filename pair; the remaining likely gap would be subtitle discovery/matching rather than target-path generation.

- Summary: Hardened Preview subtitle attachment so backend-discovered subtitle operations are matched against both the local resolved video filename and the Plex filename, with a normalized fallback for separator/spacing drift. This covers cases where the movie move is applied but the subtitle is never queued because its basename only matches the local filename shape.
- Files or areas: `src/pages/Preview/subtitleMapping.ts`, `src/pages/Preview/__tests__/subtitle-mapping.test.ts`.
- Verification:
  - `npx vitest run src/pages/Preview/__tests__/subtitle-mapping.test.ts` passed.
- Follow-ups:
  - If the issue persists after this, the next place to inspect is the exact apply payload or rollback log to confirm whether the subtitle operation is being sent and whether it succeeds or fails at apply time.

- Summary: Removed `{ext}` from the template contract and made file extensions internal again. Frontend and Rust proposal builders now strip legacy `{ext}` tokens, normalize the rendered stem, append the real extension afterward, and normalize stored template settings/history/favorites so old saved templates are cleaned up automatically.
- Files or areas: `src/state/settings.tsx`, `src/components/TemplateHelpModal.tsx`, `src/pages/Preview/{PreviewTemplate.tsx,movieProposal.ts,episodeProposal.ts,musicProposal.ts,utils.ts}`, `src-tauri/src/video_rename/{template.rs,movies.rs,episodes.rs}.rs`, `src-tauri/src/video_rename.rs`, `docs/{features.md,faq.md,tips.md}`, `dev_docs/appendix_architecture.md`.
- Verification:
  - `npx vitest run src/pages/Preview/__tests__/preview-proposals-unmatched-and-safety.test.ts src/pages/Preview/__tests__/subtitle-mapping.test.ts src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts src/state/__tests__/settings-load-save.test.tsx src/pages/Settings/__tests__/general-diagnostics.test.tsx` passed.
  - `npx vitest run src/state/__tests__/settings-load-save.test.tsx src/state/__tests__/settings-deep-merge.test.tsx src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml compute_movie_` passed.
- Follow-ups:
  - Re-test the exact grouped-movie subtitle case in the live app. The basename/folder alignment bug is now fixed, but only a real apply run will confirm whether it fully eliminates the orphaned subtitle case.

- Summary: Fixed subtitle apply-time moves into new movie folders by creating the subtitle target directory before rename/move operations. Added a Rust regression for renaming a subtitle into a missing child folder and a Preview integration regression confirming subtitle operations are included in the apply payload.
- Files or areas: `src-tauri/src/subtitle.rs`, `src/pages/Preview/__tests__/preview-plex-refresh.integration.test.tsx`.
- Verification:
  - `npx vitest run src/pages/Preview/__tests__/preview-plex-refresh.integration.test.tsx` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml apply_single_operation_rename_creates_missing_parent_directory` passed.
- Follow-ups:
  - Re-run the exact `One Piece Film Red` case in the app. If a subtitle still stays behind after this patch, the next step is to inspect the rollback log for a failed subtitle operation record from that run.

- Summary: Added a backend apply fallback so `apply_video_renames` discovers matching subtitle files from each selected video's original folder and appends missing subtitle rename operations automatically. This covers the live failure mode where the movie operation is sent and succeeds, but no subtitle operation is attached by the frontend preview path.
- Files or areas: `src-tauri/src/video_rename/apply.rs`, `src-tauri/src/video_rename.rs`, `src-tauri/src/video_rename/tests.rs`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml apply_video_rename_discovers_and_moves_matching_subtitles_when_frontend_omits_them` passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml apply_video_rename_` passed.
  - `npx vitest run src/pages/Preview/__tests__/preview-plex-refresh.integration.test.tsx` passed.
- Follow-ups:
  - Re-run the `One Piece Film Red` case after rebuilding/restarting the Tauri app so the Rust backend changes are actually loaded.

- Summary: Updated rename-related playbooks to document the current template/subtitle contract: templates are stem-only, legacy `{ext}` is stripped, real extensions are appended internally, movie subtitles must follow newly created movie folders, and backend apply must discover/move matching subtitles even when the frontend omits subtitle operations.
- Files or areas: `dev_docs/playbooks/rename-safety-playbook.md`, `dev_docs/playbooks/testing-playbook.md`, `dev_docs/playbooks/frontend-playbook.md`, `dev_docs/playbooks/backend-playbook.md`.
- Verification:
  - `rg -n "\\{ext\\}|subtitle|extension|movie folder|own folder" dev_docs/playbooks` reviewed; remaining `{ext}` mentions are intentional legacy-token guidance.
- Follow-ups:
  - Keep `AGENTS.md` and broader architecture docs in sync if they continue to be used as active contributor contracts.

- Summary: Fixed remote Preview search rows so they run through the same subtitle-operation attachment and block-view poster enrichment as normally loaded rows. Remote movie block cards now prefetch cached poster data, and remote rows can show subtitle operation markers when backend preview discovers matching sidecars.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`.
- Verification:
  - `npx vitest run src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx --reporter=dot` passed.
- Follow-ups:
  - Re-check the live `City Slickers` remote search case in the Tauri app to confirm Plex metadata and local path mappings produce the expected poster and subtitle markers.
- Summary: Added a versioned startup risk acknowledgement gate before normal app workflows, with a prominent beta warning, required confirmation checkbox, and Exit action that closes the Tauri window when declined. Bumped app version metadata to `0.2.1` across npm, Tauri, Cargo, Cargo lock, and Linux metainfo release entries.
- Files or areas: `src/App.tsx`, `src/components/RiskAcknowledgementModal.tsx`, `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/linux/*.metainfo.xml`, `docs/features.md`.
- Verification:
  - `npm run test:types` passed.
  - `npx vitest run src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx --reporter=dot` passed.
  - `cargo metadata --manifest-path src-tauri/Cargo.toml --no-deps --format-version 1` reported `name-o-tron-9000@0.2.1`.
  - `npm run build` passed with existing Vite mixed dynamic/static import warnings.
- Follow-ups:
  - Create the GitHub release after the modal and version bump are verified.

- Summary: Audited the MkDocs-managed website source against the last month of `main` merge commits and updated public docs for the new startup risk acknowledgement, `0.2.1` release notes, remote-search poster/subtitle parity, beta small-batch guidance, and the correct downloads/GitHub release links.
- Files or areas: `docs/index.md`, `docs/features.md`, `docs/releases.md`, `docs/settings.md`, `docs/tips.md`, `docs/faq.md`.
- Verification:
  - `git log main --since='2026-06-12' --merges --date=short --pretty=format:'%h %ad %s'` reviewed recent merge commits.
  - `rg -n "your-repo|Risk Acknowledgement|What's New in 0\\.2\\.1|Remote row enrichment|Remote result enrichment|startup acknowledgement|0\\.2\\.1" docs` confirmed the placeholder release link is gone and new docs text is present.
  - `rg -n -- "Home: index.md|Downloads: releases.md|Features: features.md|Settings: settings.md|Tips & Best Practices: tips.md|FAQ: faq.md" mkdocs.yml` confirmed the updated files are in MkDocs navigation.
  - `mkdocs build --strict` could not run because `mkdocs` is not installed in this environment.
- Follow-ups:
  - Run `mkdocs build --strict` in the docs build environment or after installing MkDocs locally.

- Summary: Corrected live GitHub merge policy for the release path: repository merge commits are enabled, squash/rebase merges are disabled, and the active `main` ruleset now allows only merge commits. Updated the repo governance playbook to match the live settings and explicitly forbid squash/rebase for `develop -> main`.
- Files or areas: GitHub repository settings, GitHub ruleset `main`, `dev_docs/playbooks/repo-governance-playbook.md`.
- Verification:
  - `gh repo view --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed,deleteBranchOnMerge` reported merge commits enabled and squash/rebase disabled.
  - `gh api repos/EdinUser/name-o-tron-9000/rulesets/8630719 --jq '.rules[] | select(.type=="pull_request") | .parameters.allowed_merge_methods'` reported `["merge"]`.
  - `gh pr view 67 --json number,baseRefName,headRefName,mergeable,mergeStateStatus,statusCheckRollup,url` reported `mergeable: MERGEABLE`; required checks were running.
- Follow-ups:
  - Wait for `test-linux` and `test-windows` on PR #67 to finish, then merge with the merge-commit method.

- Summary: Fixed duplicate movie loading/redraws in Preview by sharing the movie prefetch in-flight/completed guards between the inline second-page prefetch and `loadMoreMovies`. This keeps remote search reload behavior and row poster/subtitle enrichment intact while preventing page 2 from being fetched twice.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`.
- Verification:
  - `npm run test -- src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx` passed.
  - `npm run test -- src/pages/Preview/__tests__/preview-plex-refresh.integration.test.tsx` passed.
  - `npm run build` passed with existing Vite mixed dynamic/static import warnings.
- Follow-ups:
  - Re-check Movies in the live Tauri app, especially reload while a search query is active and page 3 in blocks view.

- Summary: Fixed explicit `{ids}`, `{plexIds}`, and direct provider token placeholders by carrying all Plex GUID metadata from `Guid[]` into Preview rows and by letting explicit template ID placeholders render from metadata even when automatic ID handling is disabled. Movie and TV proposal contexts now prefer metadata-derived Plex ID tags for explicit placeholders while preserving existing fallback behavior for old filenames.
- Files or areas: `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/movieProposal.ts`, `src/pages/Preview/episodeProposal.ts`, `src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts`.
- Verification:
  - `npm run test -- src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts` passed.
  - `npm run test -- src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts src/pages/Preview/__tests__/tv-episode-token-normalization.test.ts` passed.
  - `npm run build` passed with existing Vite mixed dynamic/static import warnings.
- Follow-ups:
  - Re-check a real Plex movie whose primary `guid` is `plex://...` and external IDs are only present in `Guid[]`.

- Summary: Updated movie library paging to request Plex GUID/detail metadata in the existing section fetch (`includeDetails=1&includeGuids=1`) instead of doing per-movie hydration calls. Preview renders explicit ID placeholders from `Guid[]` returned on the section page and the regression test rejects `fetch_plex_metadata` calls for this path.
- Files or areas: `src-tauri/src/plex_api.rs`, `src/pages/Preview/PreviewContainer.tsx`, `src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx`.
- Verification:
  - `npm run test -- src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx -t "renders movie ID placeholders"` passed.
  - `npm run test -- src/pages/Preview/__tests__/preview-search-pagination.integration.test.tsx src/pages/Preview/__tests__/movie-backend-folder-integration.test.ts src/pages/Preview/__tests__/tv-episode-token-normalization.test.ts` passed.
  - `cargo check --manifest-path src-tauri/Cargo.toml` passed.
  - `npm run build` passed with existing Vite mixed dynamic/static import warnings.
- Follow-ups:
  - Re-test the live Movies blocks view with `{title}[ ({year})] {imdbToken}` after restarting the dev app so the updated frontend code is loaded.
