# Iteration 0013: sea-conformance Instructions

Status: active
Branch: `rust-service-iteration-0013-sea-conformance`
Iteration source commit: `52ad0aa3b4b28498e609d3fe41d9eabcf5f23bd2`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0013/phase-2/sea-conformance.md`
Required environment: pinned Rust toolchain; no dependency or lockfile changes

## Assignment

Audit `sea-conformance` for low-risk documentation, code, and test improvements without changing the shared contracts it verifies. Inventory helpers and cases against covered invariants, then inspect the first nontrivial gap.

## Ownership

Writable: `rust-service/crates/sea-conformance/` and this report. Read-only: all other paths. Do not change cross-crate APIs, shared semantics, dependencies, formats, manifests, lockfiles, or generated files.

## Expected Evidence

Report the audit, focused changes, exact commits and checks, Notable Events, retained reproducers, and deferred opportunities. No machine-readable artifact is required.

## Validation

Guard checkout identity. Run workspace format check plus strict Clippy, warning-denied rustdoc, and tests for `sea-conformance`; run affected README commands, `git diff --check`, and scope/lockfile checks.

## Escalation and Stopping Conditions

Stop at shared-contract or forbidden cross-crate changes. A validated no-change audit is acceptable.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
