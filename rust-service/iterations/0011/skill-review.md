# Iteration 0011 Skill Review

## Evidence Reviewed

Reviewed all six workstream notable-event tables, [Phase 2 integration](phase-2/integration.md), and the [retrospective](retrospective.md) against the coordination skill at kickoff `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`. Repeated evidence showed delegated commands and reviews operating in sibling or kickoff-state checkouts despite prose instructions to print identity.

## Candidate Skills or Changes

- **Absolute delegated-command guard:** Trigger when commands run in a repository with multiple worktrees. Require the command itself to use the assigned absolute path, print path/branch/HEAD/status, assert expected branch/base where applicable, and stop before work on mismatch. Reject summaries that omit guard output. Benefit: prevents plausible results from another checkout entering retained evidence.
- **Automatic generated-artifact integration gate:** Trigger when ignored generated packages are consumed downstream. Candidate procedure would discover and execute every consumer. Benefit is real, but artifact commands differ by package and existing instructions already require fresh generation where applicable.
- **Persistent-terminal cleanup rule:** Trigger when validation creates temporary symlinks/processes. Explicit cleanup is safer than shell exit traps. This is a useful practice but does not require a dedicated skill workflow.

## Decisions

- Absolute delegated-command guard: **accepted**. It strengthens an existing invariant with the exact mechanism proven necessary repeatedly.
- Automatic generated-artifact integration gate: **deferred**. The evidence supports integration execution, but not one generic script across native, Node, web, and TypeScript consumers.
- Persistent-terminal cleanup rule: **accepted as report guidance, no skill edit**. Existing terminal instructions already require explicit process cleanup; the retrospective records the symlink-specific lesson.

## Applied Changes

- Updated `.github/skills/rust-service-coordination/SKILL.md` to require absolute in-command checkout guards and reject summaries without their output. Validation: iteration `0011` complete artifact check and `git diff --check`.

## Next Review Triggers

- Another accepted result from the wrong worktree after the absolute guard is adopted.
- Repeated generated-artifact failures with a stable common command shape suitable for automation.
- Workstream conflicts despite exclusive writable paths, indicating ownership partitions are too coarse or shared contracts need a prerequisite wave.
