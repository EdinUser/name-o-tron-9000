# Renaming Playbook

## Goal

Keep the rename pipeline behavior stable through bug fixes and refactors.

This playbook is the contract for the current rename implementation across:

- preview proposal generation
- subtitle proposal generation
- apply-time filesystem operations
- rollback compatibility
- path mapping resolution

If rename code changes, read this file before editing and update it when behavior or invariants change.

## Source Of Truth

Primary backend files:

- `src-tauri/src/video_rename.rs`
- `src-tauri/src/subtitle.rs`
- `src-tauri/src/path_map.rs`
- `src-tauri/src/settings.rs`

Primary frontend files:

- `src/pages/Preview/PreviewContainer.tsx`
- `src/pages/Preview/*Proposal*.ts`
- `src/pages/Preview/subtitleMapping.ts`
- `src/state/settings.tsx`

Supporting docs:

- `docs/features.md`
- `docs/settings.md`
- `dev_docs/appendix_api.md`

## Rename Pipeline Overview

### 1. Preview stage

`preview_video_renames(...)` is the main preview path for the current UI.

It is responsible for:

- reading backend settings and path mappings
- resolving Plex paths to local paths where needed
- building movie or episode rename proposals
- generating subtitle rename operations aligned to final video names
- surfacing warnings and blocking errors for the Preview table

Supporting behavior lives in:

- `compute_movie_proposal(...)`
- `compute_episode_proposal(...)`
- `sanitize_and_validate_path(...)`
- `subtitle::preview_renames(...)`

### 2. Apply stage

`apply_video_renames(...)` is the main apply path for the current UI.

It is responsible for:

- resolving original and target paths
- treating already-local paths as local
- treating unresolved `new_path` values as relative to the resolved library root when possible
- discovering matching subtitle files for selected video operations and appending missing subtitle operations before filesystem work
- dispatching subtitle operations to `subtitle::apply_single_operation(...)`
- dispatching video operations to `apply_single_video_operation(...)`
- writing rollback logs for the full batch
- triggering targeted Plex follow-up rescans from the frontend after successful filesystem work

### 3. Undo stage

`undo_last_rename()` reads the most recent rollback log and reverses operations in reverse order.

The log shape must remain compatible with `RenameOperation` deserialization even if extra metadata fields are present.

On successful undo, the frontend must trigger the same class of targeted Plex follow-up rescans using the undone operations plus the saved path mappings:

- movies: refresh the containing movie folder
- TV with 1-2 renamed episodes undone: refresh the episode folder(s)
- TV with more than 2 renamed episodes undone: refresh the show folder

This is required. Without it, Plex can keep showing stale `Unavailable` items after filesystem rollback.

## Current Invariants

These are the behaviors we must not silently break.

### Proposal invariants

- Templates define the visible path/name stem only. `{ext}` is deprecated and must be stripped if present.
- Movie, episode, and music proposals must append the original real file extension internally after rendering and trimming the template stem.
- Episode proposals must honor season-folder rules, including `Season 00` vs `Specials`.
- Edition tokens detected from filenames must be inserted before the file extension when not already present in the rendered output.
- Multi-episode detection must only affect output when `tv.normalizeMultiEpisode` is enabled.
- TV multi-episode output must normalize to Plex-style episode tokens such as `S01E01-E02`, even when the source filename used the compact `S01E01E02` form.
- Split-part TV files such as `pt1`, `part2`, `cd1`, and `disc1` must be preserved as split parts of a single episode and must not be reinterpreted as multi-episode ranges.
- Collection handling must remain explicit:
  - `always` currently adds the collection folder/prefix behavior.
  - `if2plus` currently behaves conservatively and does not inject collection grouping unless implemented with real collection cardinality data.
- Sanitization must remain deterministic for the same input/settings pair.

### Safety invariants

- Invalid path characters are replaced in the returned sanitized path.
- Path length checks warn above 200 and block above 255 when enabled.
- Windows reserved names are blocking when enabled.
- Non-Latin highlighting is warning-only and must respect the settings flag.

### Subtitle invariants

- Subtitle rename output must follow the final video basename, not the original subtitle basename.
- Movie subtitle moves must follow the final video folder. When a movie is moved into a newly created movie folder, matching subtitles must move into that folder too.
- Subtitle handling must not depend solely on frontend-attached subtitle operations. `apply_video_renames(...)` must discover matching subtitles from selected videos and add missing subtitle operations before applying the batch.
- Movie subtitle handling currently supports `forcedSdhHandling` adjustments on generated names.
- Subtitle convert operations must create a backup when `backup_path` is provided and write UTF-8 BOM output under the current implementation.
- Subtitle preview logic is more limited than the settings surface implies:
  - discovery currently finds subtitles that share the video basename
  - some branches for `NonMatching` and `Subfolder` handling exist in preview logic, but discovery/classification is not yet fully wired to produce those cases end-to-end

### Apply invariants

- Apply must create missing parent directories for target video paths.
- Apply must create missing parent directories for target subtitle paths.
- Apply must fail clearly when the source file is missing.
- Video operations and subtitle operations must both be recorded in the same rollback batch.
- Video-only apply payloads must still move matching subtitles when subtitles are present beside the original video and no explicit subtitle operation was supplied.
- Rollback logs must be written for every apply run, even when some operations fail.
- Successful apply runs must leave enough path information available for the frontend to trigger targeted Plex rescans without falling back to a full-library scan.
- Successful undo runs must return the undone operations so the frontend can reconstruct targeted Plex rescans from the rollback batch.

### Plex refresh invariants

- Do not use Plex metadata refresh as the rename-reconciliation path for filesystem renames; it can leave items marked `Unavailable`.
- Do not trigger full-library rescans automatically after normal rename or undo flows.
- Automatic Plex follow-up rescans must use section path refreshes only.
- Movies use per-movie folder rescans.
- TV uses per-episode folder rescans for small batches and show-folder rescans when more than two episodes were changed.
- Undo must mirror the same targeting rules after reversing filesystem operations.

### Path mapping invariants

- Mapping resolution uses longest-prefix matching.
- Server-id matching must continue to support both exact server IDs and hostname-only compatibility.
- Already-local paths must not be re-resolved into broken paths.

## Current Gaps And Cautions

Do not accidentally "document into existence" behavior that is not actually implemented.

Known gaps or partial implementations in current backend code:

- movie collection mode `if2plus` is intentionally conservative today
- subtitle conversion is simplified for non-UTF-8 inputs
- subtitle discovery/classification does not currently exercise every configured subtitle-handling branch
- apply-time subtitle fallback currently covers basename-matching subtitles beside the original video; non-matching and subfolder subtitle layouts still need separate explicit support
- some settings imply more advanced behavior than the current code fully enforces

When refactoring, preserve the real current behavior first. Improve behavior in a separate change with tests and doc updates.

## Required Regression Tests

At minimum, keep coverage for these cases:

### `video_rename.rs`

- non-Latin warning respects settings
- path length blocking respects settings
- season 0 / specials behavior
- multi-episode normalization toggle
- compact `S01E01E02` input normalizes to Plex-style `S01E01-E02`
- split-part episode suffix preservation (`pt1`/`part2`/`cd1`)
- movie own-folder behavior
- collection handling for `always`
- conservative behavior for collection mode `if2plus`
- folder-structure grouping
- edition insertion before extension
- deprecated `{ext}` tokens are stripped, the rendered stem is trimmed, and the real extension is appended internally
- apply-time rename creates parent directories
- apply-time rename fails on missing source
- destination computation preserves existing grouping under library roots
- apply-time video rename discovers and moves matching subtitles even when the frontend apply payload contains only the video operation

### `subtitle.rs`

- matching subtitle discovery
- non-matching basename exclusion
- skip-subtitles short circuit
- basic subtitle rename generation
- movie SDH/forced normalization behavior
- convert operation backup/output behavior
- rename/move operations create missing target parent directories

### Cross-module checks

- preview/apply parity for representative movie and TV examples
- frontend apply payloads may include subtitle operations, but backend apply must remain correct if they are absent
- rollback log compatibility for `undo_last_rename()`
- path mapping resolution for exact and hostname-only server IDs
- post-apply and post-undo Plex path refresh targeting for movies and TV

## Refactor Guardrails

If splitting `video_rename.rs` or `subtitle.rs`:

1. Move code without changing behavior first.
2. Preserve public Tauri command names and payload shapes.
3. Keep existing log shape compatible with undo.
4. Keep tests green before making behavior changes.
5. Add new tests before changing ambiguous rename rules.

These rules are mandatory for extractions in the rename pipeline:

1. Extract, do not rewrite.
2. If logic is extracted into a helper, the production command path must call that helper.
3. Do not leave a helper as a shadow implementation while the command keeps an older inline copy.
4. Prefer one implementation point for:
   - mapping selection
   - apply-time path resolution
   - rollback-log writing
   - empty-folder cleanup
5. Migrate sibling callers onto the same helper soon after extraction, or drift will reappear.
6. Run the rename-focused Rust tests after every meaningful extraction step.
7. Stop and reconcile immediately if helper-level behavior and command-level behavior diverge.

Recommended order:

1. extract shared DTOs
2. split proposal helpers
3. split apply helpers
4. consolidate path-resolution helpers
5. only then change behavior

Current guidance for this refactor phase:

- `apply_video_renames(...)` and `cleanup_empty_folders(...)` are already on the right extraction path: their production logic now delegates into internal helpers.
- `preview_video_renames(...)` still contains inline mapping-selection logic that should eventually move onto the same shared path.
- `subtitle::apply_renames(...)` still duplicates mapping extraction, path resolution, and rollback-log writing behavior that should be unified later.

## Post-Refactor Test Backlog

These are known remaining gaps. They are not blockers for starting the refactor, but they should be added after the structural work lands.

### Higher-level backend coverage

- command-level coverage through the public `apply_video_renames(...)` path, not only helper-level coverage
- command-level coverage through the public `cleanup_empty_folders(...)` path
- preview/apply parity for representative movie and TV batches through the Tauri command boundary

### Rollback and undo coverage

- direct `undo_last_rename()` assertions against rollback logs produced by current apply flows
- compatibility checks for rollback logs when successful and failed operations are mixed
- frontend coverage proving that successful undo triggers targeted Plex section-path refresh calls instead of a broad library refresh

### Remaining rename/cleanup edge cases

- cleanup behavior at mapped-root boundaries and maximum upward walk depth
- mixed batches where path-mapped relative targets, subtitle operations, and partial failures happen together
- mixed batches where frontend omits subtitle operations and backend discovers them during apply
- stronger conflict-policy coverage once overwrite/skip/suffix behavior is made explicit in the video path

### Consolidation follow-up

- migrate `preview_video_renames(...)` onto shared mapping-selection helpers
- unify `subtitle::apply_renames(...)` with shared mapping resolution and rollback-log helpers
- add tests at the new single implementation points after consolidation

## Verification Baseline

Use this sequence unless there is a narrow reason not to:

1. `npm run test:types`
2. `npm test`
3. `npm run test:rust`

When iterating specifically on rename logic, also run targeted Rust tests for:

- `video_rename`
- `subtitle`
- `path_map`

If a sandbox blocks integration tests that bind ports, record that explicitly in the work log.

## When Docs Must Change

Update these when rename behavior or supported settings semantics change:

- `docs/features.md`
- `docs/settings.md`
- `dev_docs/appendix_api.md`
- this playbook
- `dev_docs/work-log.md`
