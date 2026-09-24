# Iteration 0019: transport Instructions

Status: active
Branch: `rust-service-iteration-0019-transport`
Iteration source commit: `575b77e825e598b15b7740f56956fe433a6153d8`
Owner: transport workstream agent
Report: `rust-service/historical/iterations/0019/phase-2/transport.md`
Required environment: Rust 1.98.1; isolated worktree from the common kickoff commit; process tasks assigned after worktree creation.

## Assignment

Perform Wave 1 Conservative discovery and assessment for `sea-webtransport`
and `sea-webtransport-server` in all six categories. Test candidates about
framing, correlations, portable/native/browser adapters, stream state,
resource ownership, server runtime, fixtures, guides, organization, and names
against distinct transport and platform guarantees and 0018 evidence.
Do not edit in Wave 1.

## Ownership

Wave 1 writes only this report. After selection, writable paths are the two
assigned crate directories and this report.
Protocol changes, generated bindings, browser/shared harness fixtures, core
contracts, manifests, and lockfiles are forbidden without coordinator
reassignment. Report consumer fixture needs to the coordinator.

## Terminal Access

Loaded workspace and exact task IDs will be recorded after worktree creation.
Tasks must include guarded focused tests and formatter-write for the two owned
crates. No shared-terminal ownership is delegated.

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

Complete area/category accounting and candidate evidence, explicitly separating
similar syntax from shared semantics across native, browser, WebTransport,
WebSocketStream, and WebSocket paths.
Selected repairs require focused owner evidence and broader browser/generated
checks only for distinct affected boundaries. Preserve diagnostics,
backpressure, cancellation, and resource release. No measurements requested.

## Validation

Wave 1 is read-only. Selected repairs start with exact owning tests and package
checks in guarded tasks. Fresh browser/generated validation is required only
when the changed boundary demands it and is coordinator-run. Formatter-write is
crate-scoped; verify `Cargo.lock` unchanged.

## Escalation and Stopping Conditions

Escalate protocol or generated-binding effects, platform-specific ownership,
resource-lifetime ambiguity, consumer fixture changes, and known intermittent
failures. A passing retry cannot resolve an attributed failure.
Do not repair before Wave 2 selection.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
