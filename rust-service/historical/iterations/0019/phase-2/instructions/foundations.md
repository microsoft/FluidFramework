# Iteration 0019: foundations Instructions

Status: active
Branch: `rust-service-iteration-0019-foundations`
Iteration source commit: `575b77e825e598b15b7740f56956fe433a6153d8`
Owner: foundations workstream agent
Report: `rust-service/historical/iterations/0019/phase-2/foundations.md`
Required environment: Rust 1.98.1; isolated worktree from the common kickoff commit; process tasks assigned after worktree creation.

## Assignment

Perform Wave 1 Conservative discovery and assessment across `sea-core`,
`sea-memory`, `sea-content-addressed`, and `sea-conformance` in all six enabled
categories. Determine whether specific layers, state, conversions, fixtures,
explanations, organization, or names are accidental complexity.
For each candidate, state what can be removed, the cheapest disproof, consumers,
platforms, the 0018 contract and discriminating test, benefit, and displaced
complexity. Account for every assigned member, including evidence-backed
no-change outcomes. Do not edit production, tests, or docs during Wave 1.

## Ownership

Wave 1 writes only this workstream report.
After explicit Wave 2 selection, writable implementation paths are
`rust-service/crates/sea-core`, `sea-memory`, `sea-content-addressed`, and
`sea-conformance`, plus this report.
All other paths are read-only. Shared manifests, lockfiles, generated files,
public contracts affecting other owners, and cross-crate helpers are forbidden.
Report cross-owner opportunities to the coordinator; no shared fixture is
authorized.

## Terminal Access

Loaded workspace and exact task IDs will be recorded after worktree creation.
Assigned tasks must include checkout-guarded focused tests and formatter-write
for the four owned crate paths. No shared-terminal ownership is delegated.

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

A complete area map and candidate table in the report, with primary category,
profile fit, precise complexity evidence, owner/consumers, contract/test links,
cheapest disproof, benefit, supporting edits, disposition proposal, and revisit
trigger. Stop Wave 1 only when all four members and six categories are
accounted for.
For a later selected repair, provide focused owning-crate tests and shared
conformance only where it protects a distinct law; explain unchanged test/docs.
No measurements or machine-readable output are requested.

## Validation

Wave 1 is read-only and requires no build.
For selected repairs, propose the smallest package/test selectors first, then
the coordinator assigns exact guarded tasks. Formatter-write is limited to
owned crates. Verify `Cargo.lock` unchanged. Canonical integration remains a
coordinator gate. No liveness mutation is authorized without a separately
specified owning test and deadline.

## Escalation and Stopping Conditions

Escalate missing contracts, unclear ownership, cross-owner consolidation,
public/API/serialization effects, test expectation sharing, or a candidate
exceeding Conservative scope. Do not repair before Wave 2 selection.
Return assessed rejections and already-proportionate results as useful outcomes.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
