# Iteration 0018: sessions Instructions

Status: active
Branch: `rust-service-iteration-0018-sessions`
Iteration source commit: `73aae4414baff2e635f6ccdcbd2b4cb507d62bfd`
Owner: sessions implementation agent.
Report: `rust-service/historical/iterations/0018/phase-2/sessions.md`
Required environment: Rust 1.98.1; tools otherwise as pinned.

## Assignment

Fully reassess `sea-sequencer`, `sea-signals`, `sea-compression`, and `sea-encryption` under the [charter](../../charter.md).
Cover ordering/reconciliation, membership/election, cache/cursors, routing/overflow, transformation composition, malformed data, and every other consequential responsibility.
Recheck unchanged/previously accepted code and refine the complete map.
Confirm or falsify missing contract/local-evidence hypotheses and repair confirmed localized gaps.

## Ownership

Writable: those four crate directories and your report.
Read dependencies; do not change shared manifests/lockfiles or other ownership.
Escalate shared semantics, API changes, or redesigns.

## Terminal Access

Loaded workspace: `/workspaces/FluidFramework`.
Assigned worktree: `/workspaces/FluidFramework-rust-service-iteration-0018-sessions`.
Assigned process task: `rust-quality-0018-sessions`, registered before dispatch.
Discover `runTask` through tool search and invoke assigned probe.
Only coordinator owns shell execution; no delegate bash/terminal or nested execution agents.
Fallback is file-only edit batches with immediate coordinator validation and pause until results.
Retain fresh checkout/command/exit evidence, never already-running output.

## Expected Evidence

Account for all four crates with inventory rows naming exact promises, owning decisions, discriminating tests, dispositions, and revisit triggers.
Conformance is shared-law evidence, not a replacement for practical focused tests.
Use practical regression/mutation checks for repairs, removing mutations afterward.

## Validation

Run `cargo test -p sea-sequencer -p sea-signals -p sea-compression -p sea-encryption --all-targets --all-features`, focused strict Clippy, and formatting.
Coordinator runs integration gates.
Verify unchanged lockfiles and retain exact command/identity/results.

## Escalation and Stopping Conditions

No review cutoff; complete inspection even when a repair requires a shared decision.
Escalate blockers without silently reducing approved coverage.

## Reporting Requirements

Complete generated report sections; record provenance before edits and events as they occur.
Do not commit; request coordinator validation/commit when ready.
