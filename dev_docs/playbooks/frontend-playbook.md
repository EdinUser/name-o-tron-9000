# Frontend Playbook

## Scope

Use this playbook for changes under `src/`, especially page flows, shared UI components, settings state, and Preview behavior.

## Conventions

- Keep the container/template split intact.
  - `*Container.tsx` owns data loading, state, and side effects.
  - `*Template.tsx` stays presentation-only.
- Reuse shared inputs.
  - use `src/components/Select.tsx` for dropdowns
  - use `src/components/Radio.tsx` for radio groups
- Keep settings changes aligned with `src/state/settings.tsx`.
- Treat Preview as a high-risk surface.
  - search, status calculation, row selection, subtitle mapping, and apply actions interact tightly

## Change protocol

1. Identify the user path being changed.
2. Identify state owners and Tauri commands involved.
3. Make the smallest change that preserves the existing screen model.
4. Add or update targeted tests near the changed feature.
5. Update `docs/` if the user-visible behavior changed.
6. Add a short `dev_docs/work-log.md` entry.

## Verification

- `npm run test:types`
- `npm test`
- run a targeted preview or page test if the change is localized

## Watch points

- Preview search and remote search fallback
- session storage behavior in Show Selection
- manual metadata edits in Preview
- settings persistence when running outside the Tauri shell
- theme-specific regressions
