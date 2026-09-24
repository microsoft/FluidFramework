# Iteration 0018: persistence Instructions

Status: active
Branch: `rust-service-iteration-0018-persistence`
Iteration source commit: `73aae4414baff2e635f6ccdcbd2b4cb507d62bfd`
Owner: persistence implementation agent.
Report: `rust-service/historical/iterations/0018/phase-2/persistence.md`
Required environment: Rust 1.98.1; tools otherwise as pinned.

## Assignment

Fully reassess `sea-file` under the [charter](../../charter.md), covering buffered/durable storage, recovery, journals, checkpoints, workers/cancellation, namespace/locking, and all other consequential crate responsibilities.
Unchanged and previously accepted code remains eligible.
Test whether precise contracts and local evidence cover each owning decision; implement confirmed localized gaps.

## Ownership

Writable: `rust-service/crates/sea-file` and your report only.
Read dependencies as needed; do not edit shared manifests/lockfiles or other ownership.
Escalate shared semantic choices rather than making unilateral promises.

## Terminal Access

Loaded workspace: `/workspaces/FluidFramework`.
Assigned worktree: `/workspaces/FluidFramework-rust-service-iteration-0018-persistence`.
Assigned process task: `rust-quality-0018-persistence`, registered before dispatch.
Discover `runTask` through tool search and invoke the assigned probe.
Only coordinator owns shell execution; no delegate bash/terminal or nested execution agents.
If tasks unavailable, use file-only batches and pause after edits for immediate coordinator validation.
Retain fresh cwd/branch/HEAD/status/command/exit evidence.

## Expected Evidence

Refine the full responsibility map; provide quality inventory rows with precise contract, owning decision, exact discriminating tests, dispositions, and revisit triggers.
Shared conformance alone does not establish practical owner-local diagnosis.
Validate repairs and use practical defect/mutation checks without retaining mutations.

## Validation

Run `cargo test -p sea-file --all-targets --all-features`, focused strict Clippy, and formatting.
Coordinator owns workspace/integration gates.
Verify lockfiles unchanged and report exact checkout/command/results.

## Escalation and Stopping Conditions

No review cutoff; inspect the whole crate even when repair decisions are pending.
Do not attempt production or power-loss qualification.
Escalate semantic/design questions and blockers without silently reducing scope.

## Reporting Requirements

Complete every generated report section, provenance before implementation, and notable events while working.
Do not commit; request coordinator checks and commit when ready.
