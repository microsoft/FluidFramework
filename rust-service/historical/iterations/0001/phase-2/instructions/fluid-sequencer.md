# Iteration 0001: fluid-sequencer Instructions

Status: active
Branch: `rust-service/iteration-0001/fluid-sequencer`
Base commit: `59f5069b43a6f2ede193f5affa8cda3a267628ff`
Owner: GitHub Copilot Fluid sequencing feasibility agent
Report: `rust-service/iterations/0001/phase-2/fluid-sequencer.md`

## Assignment

Determine whether final sequence metadata, writer identity/local order, reference stream positions, and minimum-reference tracking can be modeled above opaque appends. The hypothesis is that deterministic final ordering can be derived after commit without conditional or service-side sequencing primitives; a counterexample is an acceptable spike result.

## Ownership

Writable: `rust-service/crates/fluid-sequencer/` and this workstream report. Read-only: core, cited Fluid precedents, workspace files, conformance, and decisions. Do not modify Fluid TypeScript code, core traits, or shared manifests.

## Expected Evidence

Deliver framed message types and deterministic model tests for multi-writer local order, final sequence assignment, reference validation, and minimum-reference calculation. State whether the kernel is sufficient and minimize any missing primitive. Performance measurements are not required beyond source/dependency size.

## Validation

- `cargo test -p fluid-sequencer --all-features`
- `cargo clippy -p fluid-sequencer --all-targets --all-features -- -D warnings`
- `cargo test --workspace --all-targets --all-features` after integration

## Escalation and Stopping Conditions

Escalate any requirement for conditional append, payload knowledge in storage, mutation of committed records, or shared core changes. Stop at a deterministic counterexample rather than adding a hidden coordinator contract. A precise feasibility limitation is useful.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
