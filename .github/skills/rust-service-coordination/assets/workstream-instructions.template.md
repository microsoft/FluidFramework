# Iteration {{ITERATION}}: {{WORKSTREAM}} Instructions

Status: planned
Branch: `rust-service-iteration-{{ITERATION}}-{{WORKSTREAM}}`
Iteration source commit: <!-- TODO(required): record the approved prior Phase 3 or foundation commit -->
Owner: <!-- TODO(required): record the agent or owner -->
Report: `rust-service/historical/iterations/{{ITERATION}}/phase-2/{{WORKSTREAM}}.md`
Required environment: <!-- TODO(required): record tool/runtime versions and setup constraints, or none -->

## Assignment

<!-- TODO(required): define the research question, falsifiable hypothesis, and scope -->

For simplification work, edit first and return a frozen uncommitted patch with its base, snapshot identity, tracked and untracked contents, and focused check results.
The coordinator owns assembled checkpoint acceptance; do not commit candidate source changes or seek a separate per-worker approval.

## Ownership

<!-- TODO(required): list writable paths, read-only dependencies, and forbidden shared changes. For shared fixtures, name the owner and authoritative coordinator handoff (source path, commit, and interface), or state none. -->

## Terminal Access

<!-- TODO(required): record the loaded workspace folder, assigned process task IDs (including a checkout-guarded formatter-write task scoped to owned crates/files), per-run evidence paths, and any exclusive shared-terminal ownership or task-access blocker -->

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

<!-- TODO(required): list deliverables, tests, measurements, and evidence sufficient to stop. For each behavior change or bug fix, require the relied-upon contract, focused owning-module or owning-crate regression evidence for each changed production crate, shared conformance evidence where applicable, and broader integration evidence only for distinct boundaries. Require rationale when existing or differently owned evidence makes a local change unnecessary. For retained machine-readable output, define expected files, provenance, parse checks, and domain invariants. -->

## Validation

<!-- TODO(required): select checkpoint and integration commands from rust-service/DEVELOPMENT.md by affected surface, including its documentation-only path where applicable; require checkout identity, exact outcomes, direct execution or inspection of required fresh generated consumers, and a lockfile-diff check when Cargo resolution is outside ownership. If using liveness mutations, specify the owning-test selector and external deadline with bounded termination; follow the coordination skill's baseline, restoration, and rerun requirements. -->

## Escalation and Stopping Conditions

<!-- TODO(required): identify blockers that require coordinator or Phase 3 review and useful partial outcomes. If the work depends on an unproven runtime capability, name the cheap prerequisite probe that must pass before implementation. -->

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
