# Iteration 0019: persistence Instructions

Status: active
Branch: `rust-service-iteration-0019-persistence`
Iteration source commit: `575b77e825e598b15b7740f56956fe433a6153d8`
Owner: persistence workstream agent
Report: `rust-service/historical/iterations/0019/phase-2/persistence.md`
Required environment: Rust 1.98.1; isolated worktree from the common kickoff commit; process tasks assigned after worktree creation.

## Assignment

Perform Wave 1 Conservative discovery and assessment across all `sea-file`
responsibilities and all six enabled categories. Test each hypothesis about
duplicated storage policy, recovery state, worker ownership, journal/checkpoint
logic, fixtures, explanations, organization, or naming against distinct
buffered/durable and platform guarantees.
Record the 0018 contract and discriminating test for every candidate and
evidence-backed no-change result. Do not edit during Wave 1.

## Ownership

Wave 1 writes only this report. After explicit Wave 2 selection, writable paths
are `rust-service/crates/sea-file` and this report.
Core contracts, manifests, lockfiles, other crates, generated files, and shared
fixtures are read-only. Cross-owner opportunities go to the coordinator.

## Terminal Access

Loaded workspace and exact task IDs will be recorded after worktree creation.
Tasks must include guarded sea-file tests and formatter-write scoped to
`crates/sea-file`. No shared-terminal ownership is delegated.

Follow the coordination skill's Terminal Coordination and Execution Isolation Recovery sections.
Separate worktrees and execution-subagent IDs do not provide terminal isolation.

- Verify actual delegate tool discovery (`tool_search` when required) and assigned registered-task invocation through `run_task` before promising autonomous edit/test loops.
- If only the coordinator has task access, use parallel file audit/edit batches; return required checks immediately after each edit batch and pause further edits until the coordinator runs task validation, returns attributable results, and re-dispatches. This does not require delegate foreground-terminal access or whole-workstream serialization.

Use assigned process tasks through `run_task` for focused checks and file tools for searches and edits.
Do not edit shared task configuration, run the same task concurrently, or treat an already-running task as a new check.
Return independent batch-ready commands to the coordinator for compound tasks with parallel dependencies; do not defer required immediate post-edit validation to make a batch.
Retain fresh attributable results for each invocation; completed-task output retrieval alone may be blank.

Do not call `run_in_terminal`, including through execution subagents, without exclusive shared-terminal ownership across the parent chat and all descendants.
If task access is unavailable, request a coordinated command turn and record unverified requirements rather than claiming validation passed.
Do not return shared-terminal ownership while a one-shot command remains unresolved.
Record asynchronous server terminal IDs separately and never reuse them for workstream commands.

Use command-local paths and environment, execution-time cwd assertions, and expected branch, HEAD, and status guards.
On foreign output, unexplained exit 130, or ambiguous completion, stop the affected execution route, preserve evidence, and return control to the coordinator for recovery.
Do not retry concurrently, cancel an unverified terminal owner, or report an inconclusive check as passing.

## Expected Evidence

Complete responsibility/category coverage, candidate evidence, cheapest
disproof, distinct guarantee analysis, displaced complexity, and dispositions.
For selected repairs, preserve buffered/durable, Unix/non-Unix, recovery,
invalidation, resource lifetime, diagnostics, and performance characteristics;
provide focused owner tests or justify existing evidence. No benchmark or
machine-readable evidence is requested.

## Validation

Wave 1 is read-only. Selected repairs begin with exact sea-file test selectors
and package Clippy/doc checks assigned as guarded process tasks.
Formatter-write is crate-scoped; verify `Cargo.lock` unchanged.
Any liveness mutation requires a named owning test, passing baseline, external
deadline, bounded owned-process termination, restoration, and focused rerun.

## Escalation and Stopping Conditions

Escalate ambiguous durability, synchronization, cancellation, recovery, or
platform semantics; core contract changes; dependency effects; performance
risk; and cross-owner sharing. Do not infer dead code from platform gates.
Do not repair before Wave 2 selection.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
