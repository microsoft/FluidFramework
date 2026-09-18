# Iteration 0011: transformation-wrappers-quality Instructions

Status: active
Branch: `rust-service-iteration-0011-transformation-wrappers-quality`
Iteration source commit: `0d2c7e367767978b267831ca34aba6e398948bdf`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0011/phase-2/transformation-wrappers-quality.md`

## Assignment

Audit compression, encryption, and stateful-compression wrappers for transparent contract preservation, bounded resource behavior, corruption/truncation handling, cancellation, and documentation. Hypothesis: round-trip and adversarial boundary tests can find or close gaps without changing wrapper contracts or encoded formats.

## Ownership

Writable: `rust-service/crates/wrappers/compression/`, `encryption/`, `stateful-compression/`, and this report. Read-only: core/storage crates, network/transports, manifests/lockfiles, and decisions. Do not change shared traits, encoded formats, dependencies, or other wrappers.

## Expected Evidence

- Inventory of wrapper guarantees and current tests.
- Focused empty/small/large round trips, chunk boundaries, truncated/corrupt input, cancellation/backpressure, and state restoration tests as applicable.
- Local docs describing format assumptions, resource bounds, error behavior, and composition limits.
- Regression-backed fixes only; benchmark any change plausibly affecting boundedness or throughput.

## Validation

Print checkout identity and tool versions. Run formatting, strict Clippy, all features, and tests for the three owned wrappers, plus applicable conformance tests and `git diff --check`. Verify root/Rust lockfiles are unchanged and record exact outcomes.

## Escalation and Stopping Conditions

Stop before shared-contract, encoded-format, dependency, or cross-wrapper composition changes. Escalate security-sensitive ambiguity rather than weakening validation. If expensive property/fuzz coverage is impractical, retain deterministic regression cases and document the residual risk.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
