# Iteration 0018: consumers Instructions

Status: active
Branch: `rust-service-iteration-0018-consumers`
Iteration source commit: `73aae4414baff2e635f6ccdcbd2b4cb507d62bfd`
Owner: consumers implementation agent.
Report: `rust-service/historical/iterations/0018/phase-2/consumers.md`
Required environment: Rust 1.98.1; repository-pinned Node/pnpm and wasm-bindgen when needed.

## Assignment

Fully reassess `sea-wasm`, `sea-integration-tests`, `sea-benchmarks`, and `examples/sea-counter` under the [charter](../../charter.md).
Cover binding conversions/lifetimes, cross-crate test responsibility, benchmark validity, example replay, and every other consequential responsibility.
Recheck unchanged/previously accepted code; refine the full map and repair confirmed localized contract/test gaps.
Inspect adjacent harnesses only as needed to validate these boundaries, not as a full TypeScript-package audit.

## Ownership

Writable: those four member directories, directly related consumer fixtures under `rust-service/tests` and `rust-service/scripts`, and your report.
Own shared browser fixtures if transport requests a justified change.
No shared manifests/lockfiles or other package/API changes without coordinator approval.

## Terminal Access

Loaded workspace: `/workspaces/FluidFramework`.
Assigned worktree: `/workspaces/FluidFramework-rust-service-iteration-0018-consumers`.
Assigned process task: `rust-quality-0018-consumers`, registered before dispatch.
Discover `runTask` through tool search and invoke probe.
Only coordinator owns shell execution; no delegate bash/terminal or nested execution agents.
Fallback is file-only edit batches and immediate coordinator validation, pausing edits until results.
Retain fresh checkout/command/exit evidence; do not assume ignored generated outputs exist.

## Expected Evidence

Map all four members with precise contracts, owning decisions, discriminating tests, dispositions, and revisit triggers.
Generated/platform/integration layers must prove distinct boundaries; explain cases where owner-local checks are impractical.
Validate repairs and practical regression mutations, restoring source afterward.

## Validation

Run `cargo test -p sea-wasm -p sea-integration-tests -p sea-benchmarks -p sea-counter --all-targets --all-features`, focused strict Clippy, and formatting.
Return exact extra Node/generated/browser checks to coordinator.
Coordinator owns full build/integration gates and fresh generated consumer evidence.
Verify shared lockfiles unchanged.

## Escalation and Stopping Conditions

No review cutoff; continue inspection while repair blockers await decisions.
Escalate shared semantics, design changes, or unavailable platform evidence.
Benchmark campaigns are excluded; focused correctness tests are in scope.

## Reporting Requirements

Complete every generated report section, initial provenance, and notable events during work.
Do not commit; request coordinator validation/commit when ready.
