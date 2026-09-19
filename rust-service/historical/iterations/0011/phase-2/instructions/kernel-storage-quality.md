# Iteration 0011: kernel-storage-quality Instructions

Status: active
Branch: `rust-service-iteration-0011-kernel-storage-quality`
Iteration source commit: `0d2c7e367767978b267831ca34aba6e398948bdf`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0011/phase-2/kernel-storage-quality.md`

## Assignment

Audit the kernel, conformance layer, and direct storage implementations for documented guarantees, boundary coverage, and reproducible defects. Hypothesis: append/read/snapshot, position validation, cancellation, corruption, and durability-mode behavior have concrete coverage or documentation gaps that can be fixed without changing public traits or persistence formats. Start by mapping guarantees to tests and use the cheapest missing boundary case to falsify each suspected defect.

## Ownership

Writable: `rust-service/crates/core/`, `conformance/`, `memory/`, `file-simple/`, `content-addressed/`, and this workstream report. Read-only: all other crates, root manifests/lockfiles, decisions, and iteration records. Do not change public traits, persisted formats, shared dependencies, or another stream's tests; report such needs for Phase 3.

## Expected Evidence

- A concise guarantee-to-test inventory in the report, including explicit residual gaps.
- Focused tests for the highest-risk uncovered boundaries, including malformed/stale positions, cancellation/end behavior, snapshot preconditions, truncation/corruption, and storage-mode guarantees where applicable.
- Local rustdoc or README corrections that state guarantees, errors, and runnable validation accurately.
- Every bug fix begins with a failing regression test or equivalent deterministic reproduction; no speculative refactors.

## Validation

Print absolute checkout, branch, HEAD, Rust versions, and exact exit statuses. Run `cargo fmt --all -- --check`; strict Clippy and tests for the five owned crates, including all features/targets that compile on the host; relevant conformance suites; and `git diff --check`. Verify `Cargo.toml` and `Cargo.lock` outside owned crate directories are unchanged. Record commands and outcomes in the report.

## Escalation and Stopping Conditions

Stop and report before public trait changes, persistence-format changes, dependency changes, or semantics that differ among implementations. If environment-specific durability cannot be tested, retain the deterministic subset and state the exact missing qualification. A no-defect result is acceptable only with the inventory and focused checks.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
