# Docs and Release Playbook

## Goal

Keep user-facing docs, contributor docs, and repository operating guidance in sync with the codebase.

## Doc layers

- `docs/` is for public and user-facing behavior.
- `dev_docs/` is for contributor-facing reference and operating guides.
- `AGENTS.md` is the repository-specific execution guidance for coding agents.
- `dev_docs/work-log.md` is the running trace of meaningful work.

## Update rules

- If the UI or workflow changed, update the relevant page in `docs/`.
- If architecture, command contracts, or engineering process changed, update `dev_docs/`.
- If the repo operating rules or canonical doc paths changed, update `AGENTS.md`.
- If the work was substantial, add a dated log entry.

## Minimum docs to consider per change

- Preview, rename, rollback, or search changes:
  - `docs/features.md`
  - `docs/settings.md` if settings semantics changed
- New commands or payload changes:
  - `dev_docs/appendix_api.md`
- Structural or module-boundary changes:
  - `dev_docs/appendix_architecture.md`
- New work method or recurring procedure:
  - the relevant file in `dev_docs/playbooks/`

## Release notes

- Keep `docs/releases.md` aligned with actual shipped versions and download destinations.
- Summarize user-visible behavior, not internal refactors.
- Call out safety-impacting changes explicitly.
