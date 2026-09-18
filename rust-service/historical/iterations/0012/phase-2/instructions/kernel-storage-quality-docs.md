# Iteration 0012: kernel-storage-quality-docs Instructions

Status: active
Branch: `rust-service-iteration-0012-kernel-storage-quality-docs`
Iteration source commit: `1625f1d161a8f1eca2e51c811bb6b29e15ac1fd5`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0012/phase-2/kernel-storage-quality-docs.md`
Required environment: pinned Rust toolchain; no new dependencies

## Assignment

Audit the kernel, conformance suite, and direct storage implementations against the charter's documentation contract. Hypothesis: complete rustdoc and package READMEs can explain contracts, positions, errors, durability, and recovery without changing behavior, while claim verification may expose focused test gaps or defects. Inventory declarations and READMEs first; use the first undocumented nontrivial guarantee as the cheapest discriminating check.

## Ownership

Writable: `rust-service/crates/core/`, `conformance/`, `memory/`, `file-simple/`, `content-addressed/`, and this report. Read-only: all other paths. Do not change public traits, persisted formats, dependencies, root manifests or lockfiles, generated files, decisions, or shared iteration records.

## Expected Evidence

- Before/after inventory of named declarations, members, documentation status, and explicit exemptions for each owned crate.
- Useful rustdoc for all in-scope declarations and a README for every owned Cargo package, with purpose, contracts, limitations, relationships, and verified commands.
- Claim-to-test mapping for append/read/snapshot, positions, cancellation, corruption, and durability; focused tests and regression-first fixes only where the audit demonstrates a gap.
- Exact commits, validation evidence, and residual risks in the report; no retained generated inventory is required.

## Validation

In every delegated command print and assert absolute checkout, branch, kickoff HEAD, and status. Run `cargo fmt --all -- --check`; `RUSTDOCFLAGS='-D warnings' cargo doc` and strict Clippy/tests for every owned crate with applicable targets/features; relevant conformance suites; `git diff --check`; and verify root `Cargo.toml`, `Cargo.lock`, and paths outside ownership are unchanged. Execute every command documented in new READMEs or explicitly identify a duplicate canonical command.

## Escalation and Stopping Conditions

Stop before public trait, persistence-format, dependency, or shared semantic changes. Report contradictory guarantees or documentation that cannot be supported by tests. A no-defect result is acceptable with complete inventories, documentation, validation, and residual risks.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
