# Iteration 0012: protocol-service-quality-docs Instructions

Status: active
Branch: `rust-service-iteration-0012-protocol-service-quality-docs`
Iteration source commit: `1625f1d161a8f1eca2e51c811bb6b29e15ac1fd5`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0012/phase-2/protocol-service-quality-docs.md`
Required environment: pinned Rust toolchain; no new dependencies

## Assignment

Audit protocol, sequencing, and service assembly against the charter's documentation contract. Hypothesis: complete rustdoc and package READMEs can state framing, session, ordering, recovery, limits, and deployment boundaries without changing behavior, and cross-checking claims will expose any focused missing coverage. Inventory first and test the first unsupported nontrivial claim.

## Ownership

Writable: `rust-service/crates/protocol/`, `fluid-sequencer/`, `service/`, and this report. Core and all other paths are read-only. Do not change wire compatibility, public APIs, sequencing semantics, dependencies, root manifests or lockfiles, generated files, decisions, or shared iteration records.

## Expected Evidence

- Before/after declaration and README inventory with all exemptions.
- Complete useful rustdoc and one README per owned crate covering wire/session/service semantics, errors, limits, lifecycle, relationships, and verified commands.
- Claim-to-test map for malformed input, ordering, ambiguity, reconnect/recovery, shutdown, and storage selection; focused regression-first fixes for demonstrated defects only.
- Exact commits, validation, contradictions, and residual risks in the report.

## Validation

Print and assert absolute checkout, branch, kickoff HEAD, and status. Run workspace format; `RUSTDOCFLAGS='-D warnings' cargo doc` and strict Clippy/tests for the three crates with all applicable targets/features; relevant service examples or process tests; `git diff --check`; and verify root manifests, lockfiles, and non-owned paths are unchanged. Execute documented README commands or identify canonical duplicates.

## Escalation and Stopping Conditions

Stop before wire, public API, sequencing semantic, dependency, or storage-contract changes. Escalate Rust/TypeScript contract contradictions. A no-defect result is acceptable with complete documentation evidence and residual risks.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
