# Iteration 0012: transformation-quality-docs Instructions

Status: active
Branch: `rust-service-iteration-0012-transformation-quality-docs`
Iteration source commit: `1625f1d161a8f1eca2e51c811bb6b29e15ac1fd5`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0012/phase-2/transformation-quality-docs.md`
Required environment: pinned Rust toolchain; no new dependencies

## Assignment

Audit compression, encryption, and stateful compression against the documentation contract. Hypothesis: complete rustdoc and READMEs can explain transparency, composition, framing, bounds, corruption, cancellation, and error behavior without changing contracts. Inventory first; use the first important undocumented composition or limit claim as the cheapest check.

## Ownership

Writable: `rust-service/crates/wrappers/compression/`, `encryption/`, `stateful-compression/`, and this report. Other paths are read-only. Do not change wrapper contracts, encoded formats, public limits, dependencies, root manifests or lockfiles, decisions, or shared records.

## Expected Evidence

- Before/after declaration and README inventory with exemptions.
- Complete useful rustdoc and package READMEs covering composition order, position preservation, buffering and bounds, corruption and truncation, cancellation, errors, limitations, and verified commands.
- Claim-to-test map and focused regression-first tests or fixes only for demonstrated gaps.
- Exact commits, validation, contradictions, and residual risks in the report.

## Validation

Print and assert absolute checkout, branch, kickoff HEAD, and status. Run workspace format; `RUSTDOCFLAGS='-D warnings' cargo doc` and strict Clippy/tests for all three crates with applicable targets/features; `git diff --check`; and verify root manifests, lockfiles, and non-owned paths are unchanged. Execute documented commands or identify canonical duplicates.

## Escalation and Stopping Conditions

Stop before encoded-format, wrapper-contract, public-limit, dependency, or shared semantic changes. Report unclear composition semantics for coordinator review rather than inventing them. A no-defect result is acceptable with complete evidence.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
