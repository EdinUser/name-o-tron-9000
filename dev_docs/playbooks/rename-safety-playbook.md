# Rename Safety Playbook

## Goal

Preserve the app's core promise: preview first, block risky applies, and leave a reliable rollback path.

## Non-negotiable invariants

- do not apply selected red items
- preview and apply must agree on destination logic
- subtitle operations must stay aligned with final video basenames
- rollback logs must be written for apply runs
- path mapping must remain deterministic

## High-risk touch points

- `src/pages/Preview/PreviewContainer.tsx`
- `src/pages/Preview/*Proposal*.ts`
- `src/pages/Preview/subtitleMapping.ts`
- `src-tauri/src/video_rename.rs`
- `src-tauri/src/subtitle.rs`
- `src-tauri/src/path_map.rs`
- `src/state/settings.tsx`

## Required checks for rename logic changes

1. confirm status behavior in Preview
2. confirm generated target paths
3. confirm subtitle operations still match
4. confirm conflicts and existing-target handling
5. confirm rollback log output is still valid
6. update tests on both frontend and backend sides when behavior spans both

## Verification baseline

- `npm run test:types`
- `npm test`
- `npm run test:rust`

## Document when behavior changes

- `docs/features.md`
- `docs/settings.md`
- `dev_docs/appendix_api.md` if command payloads or semantics changed
- `dev_docs/work-log.md`
