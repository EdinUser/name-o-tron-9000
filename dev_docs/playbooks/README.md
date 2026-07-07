# Playbooks

These playbooks are the working layer between the reference docs and the codebase. Use them when you are doing active work, not just reading architecture or API reference material.

## When to use

- Read the relevant playbook before substantial work in that segment.
- Follow `dev_docs/work-log.md` to leave a dated trace for audits, implementations, and follow-up items.
- Update the playbook itself when the team's working method changes, not for one-off task details.

## Available playbooks

- [project-audit-playbook.md](project-audit-playbook.md) - inventory the repo, compare docs to code, and produce an audit.
- [frontend-playbook.md](frontend-playbook.md) - change React/Tauri UI flows without breaking shared conventions.
- [backend-playbook.md](backend-playbook.md) - modify Rust/Tauri commands, logging, filesystem behavior, and persistence safely.
- [rename-safety-playbook.md](rename-safety-playbook.md) - full renaming playbook for preview/apply behavior, rollback guarantees, path mapping, and refactor guardrails.
- [testing-playbook.md](testing-playbook.md) - run the right checks, interpret known noise, and add regressions.
- [docs-and-release-playbook.md](docs-and-release-playbook.md) - keep public docs, contributor docs, and release notes aligned.
- [repo-governance-playbook.md](repo-governance-playbook.md) - keep branch strategy, workflow triggers, runner labels, and protection rules coherent.
- [work-tracking-playbook.md](work-tracking-playbook.md) - record work consistently in the repo so future sessions have context.
