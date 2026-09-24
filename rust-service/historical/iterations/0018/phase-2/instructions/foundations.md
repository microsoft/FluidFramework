# Iteration 0018: foundations Instructions

Status: active
Branch: `rust-service-iteration-0018-foundations`
Iteration source commit: `73aae4414baff2e635f6ccdcbd2b4cb507d62bfd`
Owner: foundations implementation agent.
Report: `rust-service/historical/iterations/0018/phase-2/foundations.md`
Required environment: Rust 1.98.1; tools otherwise as pinned.

## Assignment

Fully reassess `sea-core`, `sea-memory`, `sea-content-addressed`, and `sea-conformance` under the [charter](../../charter.md).
Inspect every consequential responsibility, including unchanged and previously accepted code.
Refine the responsibility map and test whether precise contracts and owner-local evidence cover each owning decision.
Implement confirmed localized gaps; do not manufacture changes.

## Ownership

Writable: those four crate directories and your report only.
Read dependencies as needed.
Do not edit shared manifests/lockfiles, other reports, or other crates; request coordinator ownership for cross-cutting changes.
Shared semantic choices require escalation, not unilateral new promises.

## Terminal Access

Loaded workspace: `/workspaces/FluidFramework`.
Assigned worktree: `/workspaces/FluidFramework-rust-service-iteration-0018-foundations`.
Assigned process task: `rust-quality-0018-foundations`, registered by the coordinator before dispatch.
Discover `runTask` through tool search and invoke the assigned probe before autonomous checks.
Only the coordinator owns shell execution; no delegate bash/terminal or nested execution agents.
If tasks are unavailable, use file-only audit/edit batches and pause after edits for immediate coordinator checks.
Retain attributable fresh output with cwd, branch, HEAD, status, command, and exit; never treat an existing task as a new run.

## Expected Evidence

Report all selected crates and consequential boundaries, exact promises, owning decisions, nearest discriminating tests, dispositions, and revisit triggers.
Provide quality inventory rows in the report.
For adequate evidence explain why regressing only the owner fails the named test; shared conformance alone is not local diagnosis.
For repairs validate focused tests and practical discriminating mutations, then remove mutations.

## Validation

Focused command: `cargo test -p sea-core -p sea-memory -p sea-content-addressed -p sea-conformance --all-targets --all-features`.
Use package-scoped strict Clippy and formatting for changed code; coordinator owns workspace/integration gates.
Verify lockfiles unchanged; report exact commands/results and checkout identity.

## Escalation and Stopping Conditions

No boundary-count or time cutoff.
Complete all assigned inspection even if a repair needs a decision.
Escalate design/semantic choices, ownership conflicts, and blockers; do not silently reduce coverage.

## Reporting Requirements

Complete every section of the generated report, recording provenance before substantive changes and notable events while working.
Do not commit; request coordinator checks and a coherent local commit after evidence is ready.
