# Iteration 0013: sea-webtransport Instructions

Status: active
Branch: `rust-service-iteration-0013-sea-webtransport`
Iteration source commit: `52ad0aa3b4b28498e609d3fe41d9eabcf5f23bd2`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0013/phase-2/sea-webtransport.md`
Required environment: pinned Rust toolchain with installed WASM target; no dependency or lockfile changes

## Assignment

Audit `sea-webtransport` for low-risk documentation, code, and test improvements across native and WASM-specific source. Inventory functions and methods against tests, then inspect the first nontrivial lifecycle, cancellation, or error-path gap.

## Ownership

Writable: `rust-service/crates/sea-webtransport/` and this report. Read-only: all other paths. Do not change wire formats, generated bindings, public cross-crate APIs, dependencies, manifests, or lockfiles.

## Expected Evidence

Report the native/WASM audit, focused changes, exact commits and checks, Notable Events, retained reproducers, and deferred opportunities. No generated artifact is retained.

## Validation

Guard checkout identity. Run workspace format check, native strict Clippy/rustdoc/tests for `sea-webtransport`, and `env RUSTFLAGS=--cfg=web_sys_unstable_apis cargo check -p sea-webtransport --target wasm32-unknown-unknown --all-features`; run affected README commands, `git diff --check`, and scope/lockfile checks.

## Escalation and Stopping Conditions

Stop at wire format, generated binding, shared API, or dependency changes. A validated no-change audit is acceptable.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
