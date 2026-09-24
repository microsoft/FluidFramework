# Iteration 0018: transport Instructions

Status: active
Branch: `rust-service-iteration-0018-transport`
Iteration source commit: `73aae4414baff2e635f6ccdcbd2b4cb507d62bfd`
Owner: transport implementation agent.
Report: `rust-service/historical/iterations/0018/phase-2/transport.md`
Required environment: Rust 1.98.1; tools otherwise as pinned.

## Assignment

Fully reassess `sea-webtransport` and `sea-webtransport-server` under the [charter](../../charter.md).
Cover protocol/framing, correlations, stream lifecycle/backpressure, all transport implementations, server admission/host cleanup, and other consequential responsibilities.
Inspect unchanged and previously accepted code; prior deferrals are hypotheses to verify.
Refine the whole responsibility map and repair confirmed localized contract/evidence gaps.

## Ownership

Writable: those two crate directories and your report only.
Consumers owns shared `tests` and `scripts`; request cross-boundary fixture changes through coordinator.
No shared manifest/lockfile or semantic changes without approval.

## Terminal Access

Loaded workspace: `/workspaces/FluidFramework`.
Assigned worktree: `/workspaces/FluidFramework-rust-service-iteration-0018-transport`.
Assigned process task: `rust-quality-0018-transport`, registered before dispatch.
Discover `runTask` through tool search and invoke probe before command loops.
Only coordinator owns shell execution; no delegate bash/terminal or nested execution agents.
Fallback: file-only edit batches, immediate coordinator checks, pause until results.
Retain fresh cwd/branch/HEAD/status/command/exit evidence.

## Expected Evidence

Account for both crates and each consequential responsibility with precise contract, owning decision, exact discriminating tests, dispositions, and revisit triggers.
Assess owner-local diagnosis separately from composition/platform coverage.
Validate repaired regressions and practical mutations, restoring source afterward.

## Validation

Run `cargo test -p sea-webtransport -p sea-webtransport-server --all-targets --all-features`, focused strict Clippy, and formatting.
Coordinator runs browser/generated/integration gates; do not claim native checks execute browser implementations.
Verify lockfiles unchanged.

## Escalation and Stopping Conditions

No review cutoff; continue independent inspection while unresolved semantics await a decision.
Do not invent disconnect/recovery policy where consumers/contracts leave meaningful alternatives.
Escalate blockers rather than reducing coverage.

## Reporting Requirements

Complete all generated report sections and provenance; record failures and notable events as they occur.
Do not commit; request coordinator checks/commit when ready.
