---
name: fluid-release
description: Run and guide Fluid Framework release preparation and execution tasks using flub and existing repo workflows.
argument-hint: [task]
---

Use this skill when the user asks for help with release prep, release execution, release timing, or type-test updates.

## Scope

- Plan and prepare client/server/build-tools releases
- Run or explain release-related `flub` commands
- Help with release checklists and communication artifacts

## References

- `references/release-schedule.md` for release timing and sequencing
- `references/minor-release-prep.md` for pre-release preparation
- `references/release-execution.md` for release-day execution flow
- `references/type-test-updates.md` for type-test/package compatibility updates

## Core workflow

1. Confirm release type and target (`client`, `server`, `build-tools`, patch/minor/major).
2. Validate repo readiness (changesets, branch state, CI status, approvals).
3. Run only the required commands for the requested task.
4. Summarize outcomes and next release actions clearly.
