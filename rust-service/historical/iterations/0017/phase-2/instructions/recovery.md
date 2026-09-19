# Iteration 0017: recovery Instructions

Status: active
Branch: `rust-service-iteration-0017-recovery`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0017-recovery`
Iteration source commit: `41e9420cbba665bb4d9ad32f812eb1816a3fdea9`
Owner: recovery delegate.
Report: `rust-service/historical/iterations/0017/phase-2/recovery.md`
Required environment: Pinned Rust 1.98.1 with rustfmt and Clippy; coordinator-provided tasks and worktree-local Cargo target.
Start from the forthcoming common kickoff commit and record actual initial HEAD before audit; the source commit is not the kickoff hash.

## Assignment

Audit current file and sequencer recovery incrementally under the [charter](../../charter.md).
Hypothesis: current contracts may already have discriminating local evidence, but historical conclusions may refer to replaced implementations or different responsibility boundaries.
Select and rank two exact boundaries across the owned scope; do not impose a quota per crate.
Identify each precise promise, consumers, owning decision, and nearest test that would fail if only that decision regressed, then use the cheapest discriminating check.
Treat [iteration 0016](../../../0016/quality-inventory.md) and [historical reconciliation](../../../../DEFERRAL_RECONCILIATION.md) as hypotheses, not proof or a prescribed repair/test list.

## Ownership

You own `rust-service/crates/sea-file/**`, `rust-service/crates/sea-file-durable/**`, `rust-service/crates/sea-sequencer/**`, and your [report](../recovery.md) in the assigned worktree, plus ignored local validation artifacts.
Shared core/contracts, all manifests and lockfiles, skills, global documentation, task configuration, runner, and shared inventory are coordinator-owned even within an otherwise owned path.
Everything else is read-only.
Request approval for necessary shared changes; return inventory rows in your report.
Do not edit another workstream, merge, rebase, push, or initialize a next iteration.

## Terminal Access

Use `run_task` in workspace `/workspaces/FluidFramework`: first `process: rs17-recovery-probe`, then assigned sequential checks through `process: rs17-recovery-check`.
Delegate task access must be verified before audit; if unavailable, stop and ask the coordinator.
The runner is `/workspaces/FluidFramework/rust-service/target/iteration-0017-tools/run.mjs`.
Results belong under `/workspaces/FluidFramework-rust-service-iteration-0017-recovery/rust-service/target/iteration-0017-evidence/<label>-<unique-run-id>/` with `result.json` and `output.log`.
Follow the charter's task/evidence protocol, including worktree-local Cargo targets and exact execution-time cwd, branch, HEAD, and status guards.

You MUST NOT call `run_in_terminal`, `execution_subagent`, `send_to_terminal`, or `kill_terminal`, including indirect Git-hook terminal execution.
Only the coordinator edits tasks or the runner.
Stage/commit tool operations require explicit coordinator ownership handoff covering hooks; otherwise return changes for coordinator commits.
Never run the same task concurrently or count an already-running task as a fresh check.
Return independent ready checks for coordinator compound task `rs17-parallel-checks`; do not delay immediate post-edit validation.
The coordinator owns overlap and disposable cancellation probes; do not cancel real checks or unrelated terminals.

## Expected Evidence

Return two ranked boundary assessments with exact owners, consumers, contract text, owning decisions, nearest discriminating tests, observed checks, dispositions, and inventory rows.
Explain why unselected candidates rank lower and give material deferrals an owner and revisit trigger.
For each changed production crate, provide focused evidence and contract changes or justify existing/differently owned evidence.
An `already adequate` result requires an exact decision-discriminating test or a defensible boundary exception.
Distinguish shared conformance laws from owning-implementation diagnosis and broader integration responsibilities.
Deterministic fault evidence does not establish hardware or power-loss qualification.

Verify both nonempty artifact files directly and parse `result.json`.
Check unique run identity, exact command/environment, absolute cwd, expected/actual checkout identity, before/after status, guard outcomes, PID, start/end, output path, completion, exit code, and test outcomes against the log.
Reject stale, mixed, missing, contradictory, or incomplete evidence; retain returned task output and report unknown metadata without inferred timing.

## Validation

Request focused filters through the assigned check task using `cargo test -p <owning-crate> --all-features <selected-filter>`, where the owning crate is sea-file, sea-file-durable, or sea-sequencer.
Confirm the intended tests actually ran; an empty filter result is not evidence.
Run the cheapest discriminating check immediately after a repair, then relevant crate lint/documentation checks.
If a finding depends on an unproven fault facility, first check that the existing owning-layer facility discriminates the selected decision; request approval before broader fixture work.
Verify manifest/lockfile diffs remain unchanged through guarded task evidence; stop on unexpected resolution changes.
The coordinator runs all [canonical integration gates](../../charter.md#shared-validation), including `./test.sh`, scoped policy, and root build when Rust/build inputs change.
Do not substitute package checks for those gates or claim unexecuted generated/browser checks.

## Escalation and Stopping Conditions

Stop after the initial two boundaries and at most one repair cluster; defer further discoveries or ask for expansion.
Ask the coordinator about shared semantics/APIs, ownership, format or recovery-policy choices, or required out-of-scope changes before editing.
Exclude broad rewrites, retention, authentication, production/power-loss qualification, CI-feed work, and Fluid integration ongoing elsewhere.
Pause after three similar failed attempts, substantial unexpected effort, or an unproven prerequisite requiring broader fixtures.
On guard mismatch, foreign output, unexplained exit 130, or ambiguous completion, preserve evidence and stop the affected route; do not retry through terminal tools.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
Before audit, record actual kickoff HEAD, branch/worktree, instruction and agent provenance, task-access result, hypothesis, and selected checks.
Record exact guards and per-run artifact paths, commands, outcomes, and observed timing only; unknown values stay unknown.
Account for all remaining changes/artifacts and proposed inventory rows when returning work.
Do not claim an upstream terminal fix or unmeasured throughput improvement.
