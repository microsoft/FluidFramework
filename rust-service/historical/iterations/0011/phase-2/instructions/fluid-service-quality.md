# Iteration 0011: fluid-service-quality Instructions

Status: active
Branch: `rust-service-iteration-0011-fluid-service-quality`
Iteration source commit: `0d2c7e367767978b267831ca34aba6e398948bdf`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0011/phase-2/fluid-service-quality.md`

## Assignment

Audit FSP4 protocol framing, Fluid sequencing/session rules, and service document routing for documented guarantees, malformed-input coverage, reconnect/retry correctness, and reproducible defects. Pay particular attention to document-bound submission streams, append-only local positions, duplicate resolution, local sequence ordering, and subscription catch-up. Hypothesis: deterministic boundary tests can expose or close gaps without wire or sequencing-semantic changes.

## Ownership

Writable: `rust-service/crates/protocol/`, `fluid-sequencer/`, `service/`, and this report. Read-only: kernel/storage implementations, clients/transports, drivers, root manifests/lockfiles, and accepted decisions. Do not change FSP4 kind values, wire encoding, public cross-crate contracts, or shared sequencing semantics without escalation.

## Expected Evidence

- Guarantee-to-test inventory covering framing limits, malformed/trailing data, session lifecycle, references, duplicate/ambiguous submissions, routing, subscription catch-up, and cancellation.
- Focused regression or property-style tests for material uncovered cases.
- Accurate local docs for protocol/service invariants, ownership, errors, and recovery behavior.
- Minimal fixes only for reproduced defects, with compatibility impact explicitly assessed.

## Validation

Print checkout identity and tool versions. Run formatting, strict Clippy, and all tests for `fluid-service-protocol`, `fluid-sequencer`, and `fluid-native-service`, plus relevant conformance or integration tests. Run `git diff --check` and verify root/Rust lockfiles are unchanged. Record exact commands, counts, and outcomes.

## Escalation and Stopping Conditions

Stop before wire-format, request-kind, compatibility, public API, persistence, or shared ordering changes. Escalate any finding that requires coordinated transport/driver edits. Preserve a minimized failing test and report if a defect cannot be fixed within ownership.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
