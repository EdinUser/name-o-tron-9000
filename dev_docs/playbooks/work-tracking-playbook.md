# Work Tracking Playbook

## Goal

Leave enough trace in the repo that a later session can answer:

- what changed
- why it changed
- how it was verified
- what still needs follow-up

## Where to record work

- use `dev_docs/work-log.md` for ongoing dated entries
- keep entries short and factual
- add follow-up bullets when work is incomplete or verification is noisy

## When to add an entry

- project audits
- multi-file implementation changes
- command-contract changes
- safety or rename-logic changes
- test baselines that reveal new failures or warnings

## Suggested entry shape

- date
- summary
- files or areas touched
- verification run
- open risks or follow-ups

## Escalate to a dedicated doc when needed

If a decision will affect future architecture or team workflow repeatedly, create or update a reference doc in `dev_docs/` instead of hiding the rationale only in the log.
