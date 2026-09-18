# Iteration 0013: sea-encryption Instructions

Status: active
Branch: `rust-service-iteration-0013-sea-encryption`
Iteration source commit: `52ad0aa3b4b28498e609d3fe41d9eabcf5f23bd2`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0013/phase-2/sea-encryption.md`
Required environment: pinned Rust toolchain; no dependency or lockfile changes

## Assignment

Audit `sea-encryption` for low-risk documentation, code, and test improvements. Inventory functions and methods against tests, then inspect the first nontrivial cryptographic-boundary or error-path gap.

## Ownership

Writable: `rust-service/crates/sea-encryption/` and this report. Read-only: all other paths. Do not change cryptographic semantics, encoded formats, public APIs, dependencies, manifests, lockfiles, or generated files.

## Expected Evidence

Report the audit, focused changes, exact commits and checks, Notable Events, retained reproducers, and deferred opportunities. No machine-readable artifact is required.

## Validation

Guard checkout identity. Run workspace format check plus strict Clippy, warning-denied rustdoc, and tests for `sea-encryption`; run affected README commands, `git diff --check`, and scope/lockfile checks.

## Escalation and Stopping Conditions

Stop at cryptographic, format, architectural, or forbidden shared changes. A validated no-change audit is acceptable.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
