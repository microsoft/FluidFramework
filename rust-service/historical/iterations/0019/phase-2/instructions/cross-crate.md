# Iteration 0019: cross-crate Instructions

Status: active
Branch: `rust-service-iteration-0019-cross-crate`
Iteration source commit: `575b77e825e598b15b7740f56956fe433a6153d8`
Owner: cross-crate later-wave workstream agent
Report: `rust-service/historical/iterations/0019/phase-2/cross-crate.md`
Required environment: Rust 1.98.1; isolated worktree from the common kickoff commit; process tasks assigned after worktree creation.

## Assignment

Remain read-only in Wave 1. After the five crate owners report, reconcile
cross-owner candidates and test whether correctness actually requires semantic
agreement under one owner or whether similarity is coincidental.
Only coordinator-selected cross-crate repairs may proceed, and the total
iteration repair budget remains four.

## Ownership

No implementation path is writable until the coordinator records one selected
candidate, exact paths, authoritative owner, dependencies, and integration
order. This report is always writable.
Do not create shared helpers, edit manifests or lockfiles, move public
contracts, or modify generated files speculatively. No shared fixture is
authorized at kickoff.

## Terminal Access

Loaded workspace is recorded after worktree creation. No validation or
formatter task is assigned until exact selected paths are known.
No shared-terminal ownership is delegated.

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

A reconciliation table for every reported cross-owner candidate: copies,
owners/consumers, required agreement or independent evolution, dependency
direction, authoritative owner, cheapest disproof, displaced complexity,
integration order, and disposition.
A selected repair must remove competing responsibility rather than add
indirection, preserve independent regression expectations, and provide focused
evidence in every changed production crate. No measurements requested.

## Validation

Wave 1 has no command requirement. After selection, the coordinator assigns
guarded tasks and formatter-write scoped to the exact approved paths.
Run focused checks for each changed owner and verify all shared lockfiles
unchanged unless a separately approved manifest repair explicitly owns them.

## Escalation and Stopping Conditions

Reject or defer false sharing, dependency inversion, public/API/protocol or
generated effects, ambiguous ownership, and changes that merely move
complexity. Ask before any implementation. A no-cross-crate-change result is a
valid outcome.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
