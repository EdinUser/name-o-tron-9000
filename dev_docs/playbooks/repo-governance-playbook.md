# Repo Governance Playbook

Use this playbook when you are changing branch strategy, workflow triggers, branch protection, or release flow.

## Expected branch model

- `develop` is the integration branch for active work.
- `main` is the protected release branch.
- Feature work branches from `develop` using names like `feat/*`, `fix/*`, or `chore/*`.
- Releases are cut by tagging `main` with `v*`.

## Workflow expectations

- CI should run on pull requests targeting `develop` and `main`.
- Release/build workflows should run only after a PR is merged into `main`, plus optional manual dispatches.
- Self-hosted Linux jobs must target the labels the real runner exposes.

## GitHub settings checklist

- Create and publish `develop` if it does not exist on origin.
- Set the default branch to `develop` if you want day-to-day PRs to land there by default.
- Protect `main` with a ruleset or branch protection rule.
- Require pull requests before merging to `main`.
- Require at least one review on `main`.
- Require the CI checks you actually trust before merging to `main`.
- Block force-pushes and branch deletion on `main`.

## Plan limitations

- If the repository is private on a plan that does not include private-repo branch protection or rulesets, GitHub will reject those settings with `403`.
- In that case, you can still use `develop` as the default branch, run CI on PRs, and build only after merged PRs to `main`, but you cannot hard-enforce branch locking until you upgrade the plan or make the repository public.

## Operating rule

- Merge feature branches into `develop`.
- Open pull requests into `main` only from `develop`.
- Merge `develop` into `main` only when you are intentionally preparing a release.
- Tag releases from `main`, not from feature branches or `develop`.

## Current live policy

- `develop`
- Required status checks: `validate-pr-route`, `test-linux`
- Linear history required
- Force-push and deletion blocked
- Conversation resolution required
- No mandatory review count

- `main`
- Required status checks: `validate-pr-route`, `test-linux`, `test-windows`
- Pull request review required: 1 approval
- Linear history required
- Force-push and deletion blocked
- Conversation resolution required
- Admins are not forced through the same restrictions, so the repository owner can still bypass in emergencies
