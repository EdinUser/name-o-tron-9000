# Project Audit Playbook

## Goal

Produce a current-state audit that separates:

- what the docs claim
- what the code actually implements
- what verification says right now
- what risks or drift need follow-up

## Inputs

- `README.md`
- `docs/`
- `dev_docs/`
- `AGENTS.md`
- `package.json`
- `src-tauri/Cargo.toml`
- representative files in `src/` and `src-tauri/src/`

## Audit loop

1. Inventory the repo surface.
   - list `docs/`, `dev_docs/`, `src/`, `src-tauri/src/`
   - capture dirty working tree state before making assumptions
2. Read the current docs tree.
   - public docs in `docs/`
   - contributor docs in `dev_docs/`
   - repo operating guidance in `AGENTS.md`
3. Compare docs to code.
   - check whether referenced files still exist
   - confirm major features against implementation
   - note stale paths, renamed commands, or removed concepts
4. Verify baseline health.
   - `npm run test:types`
   - `npm test`
   - `npm run test:rust`
5. Record findings in `dev_docs/work-log.md`.

## Deliverable format

- short architecture summary
- docs vs code drift findings
- verification results
- prioritized follow-ups
- exact commands run

## Exit criteria

- all major doc layers were reviewed
- at least one frontend and one backend implementation path was spot-checked
- baseline verification status is recorded
- new risks or stale docs are logged for future work
