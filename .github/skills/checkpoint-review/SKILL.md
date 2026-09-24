---
name: checkpoint-review
description: 'Coordinate fresh independent agent-to-agent change reviews before checkpoint commits, including fixed-base evidence, read-only reviewers, requested reproductions, and bounded repair/review cycles. Use when implementing a plan with checkpoint review gates or reviewing an agent-produced checkpoint; not for a general design assessment or interactive branch review.'
argument-hint: 'worktree, fixed checkpoint base, scope, and review depth'
---

# Independent Checkpoint Review

Use this workflow for a change set relative to a fixed checkpoint-start commit.
For ordinary interactive branch reviews use the [review skill](../../../.claude/skills/review/SKILL.md).
For a general design assessment without a comparison, use the relevant domain guidance instead.
This skill supplies checkpoint orchestration, not a second review methodology.
The coordinator and reviewer must read [shared review criteria](../../../.claude/skills/review/review-criteria.md).
Do not invoke the interactive review workflow's mode prompt, branch-base resolver, or nested review swarm for a checkpoint whose base and depth are already supplied.

## 1. Establish The Review Input

Use the plan's preselected depth; if absent, use `standard` and state that choice.
Here `standard` means reading the complete assigned diff and relevant surrounding implementations; `deep` additionally reads every changed reviewable file in the assignment in full.
Neither depth implies nested delegation.
Ask only when the comparison, authority, or scope is unresolved, not to reconfirm a settled plan choice.

Record:

- Exact absolute worktree, branch, current HEAD, checkpoint name, and fixed checkpoint-start commit.
- Full checkpoint scope, including staged, unstaged, and untracked changes, plus explicit exclusions and their reasons.
- An accessible fixed-base diff and complete content for untracked additions, with access to relevant baseline source and current source.
- Plan contracts, acceptance criteria, known incomplete paths, and applicable repository/domain instructions.
- Commands, outcomes, and attributable logs for completed validation; label them implementer-reported until the reviewer inspects evidence.
- Depth, permitted tools, execution owner, report destination, and remaining repair/review allowance.
- Review assignments, including an explicit reviewer owner for each changed area and relevant cross-assignment interaction.

Use exact commit comparisons, not a newly resolved merge base or only the latest repair diff.
Generated files and binary artifacts still belong in the inventory; verify provenance or relevant contracts rather than pretending to review binary content as source.
Default to one reviewer for the complete checkpoint.
For a larger checkpoint, the coordinator may partition review into assignments that collectively cover the complete diff and directly affected boundaries on the same fixed base and frozen snapshot.
Give each interaction owner responsibility for tracing both sides of its assigned boundary, not just one area's files.
If a tightly coupled transformation cannot be partitioned safely, use one reviewer or reduce checkpoint scope before review.
Missing ownership or coverage makes the checkpoint review incomplete.
Do not silently sample files and claim whole-checkpoint convergence.

## 2. Freeze And Delegate

Freeze implementation edits during review.
Capture the reviewed state with immutable diff/source artifacts or content hashes covering tracked and untracked scope; branch and HEAD alone do not identify a dirty worktree.
Verify that state again before accepting the review.
Unexpected changes invalidate the affected review coverage; do not revert them.

Launch one fresh read-only reviewer with separate context per assignment, explicitly supplying this skill, the shared criteria, the complete review input, and its assigned scope and interactions.
Every reviewer has access to the complete checkpoint diff and relevant baseline/current source; partitioning limits responsibility, not access to context.
Do not rely on the reviewer inheriting the coordinator's skills or prior reasoning.
Instruct it not to edit, stage, commit, or spawn further agents.
It may request additional context and focused reproductions in its returned report.
Keep shared terminal execution under one assigned owner; a separate agent or worktree does not isolate the shared foreground terminal.
Do not let reviewers run terminal commands concurrently with coordinator execution.
If this checkpoint belongs to an explicitly requested parallel iteration, also follow its [coordination](../rust-service-coordination/SKILL.md) rules; checkpoint review alone does not trigger that workflow.
By default the coordinator owns execution and runs requested checks after the reviewer returns.
Do not force a file-only reviewer to guess baseline content; supply it as an artifact.

Present the contracts and evidence without a suggested approval or the implementer's conclusions.
On repair reviews, include prior findings and dispositions, but require verification rather than accepting those dispositions as proof.

## 3. Review And Return Evidence

The reviewer applies the shared criteria across its complete assignment and directly affected boundaries.
Report uncovered interactions to the coordinator rather than assuming another reviewer owns them.
It must inspect the actual diff and enough baseline/current context to establish regressions or contract changes.
If it cannot access the diff, baseline, or required changed files, return `Incomplete` with the missing inputs.
Final-source inspection alone is not a completed change review.

Return findings first, followed by:

- Reviewed identity: checkpoint, assignment, fixed base, HEAD, snapshot identity, and depth.
- Concrete findings with severity, file/line, preconditions, mechanism, impact, and proposed correction/check.
- Coverage: files and important boundaries inspected, exclusions, and unresolved questions.
- Evidence: directly inspected source/logs, implementer-reported results, reviewer-executed checks if authorized, and requested reproductions.
- Assignment disposition: `No actionable findings`, `Changes requested`, or `Incomplete`.

Do not return broad assurances such as "all locking is safe" unless the inspected scope and evidence support that statement.
No actionable findings is not proof of correctness or performance, and does not by itself authorize a commit.
Reviewers return their report to the coordinator rather than writing into the worktree or a shared temporary report path.

## 4. Resolve And Re-Review

The coordinator checks each finding against code and contracts, runs useful requested reproductions, and records its disposition with evidence.
Reconcile all assignment reports against the declared coverage, including cross-assignment interactions, before deciding checkpoint acceptance.
Do not substitute several partial approvals for complete coverage; a second whole-diff review is not required when the assigned reviews establish that coverage.
Keep failed checks and rejected suggestions visible in the cumulative checkpoint record.
Do not dismiss a concrete finding solely because existing tests pass or a review-cycle limit is near.
Classify confirmed defects, material regressions, and missing required evidence as blocking regardless of review area, including performance and security.
Record whether each finding is blocking, resolved, rejected with evidence, or an optional nonblocking suggestion.
Missing required evidence blocks convergence; optional follow-up suggestions do not automatically block it.

For repairs, make the smallest grounded edit and immediately rerun the focused check, followed by required affected gates.
Request fresh reviewers for the declared assignments against the same checkpoint-start base and complete updated scope, updating interaction ownership as needed.
Default to at most two repair-and-review cycles after the initial review unless the approved plan specifies otherwise.
Assignments share the checkpoint's allowance and acceptance decision; they do not create separate repair loops.
If blocking findings in any review area or required coverage gaps remain, stop and ask for guidance instead of committing or silently increasing the allowance.

## 5. Record The Gate

Convergence requires completed review coverage, no unresolved blocking findings across any review area, and passing required validation or an explicitly accepted exception.
Record reviewer identity when available, reviewed snapshot, findings and dispositions, actual checks, limitations, and the final decision in the existing cumulative report.
Do not create a separate report for every agent invocation unless the plan requires it.
Substantive changes after final review require renewed affected validation and review; report-only bookkeeping does not.
Commit only when separately authorized, and only the reviewed checkpoint scope.
Do not merge, push, activate incomplete paths, or treat review as a substitute for performance experiments or architecture decisions.