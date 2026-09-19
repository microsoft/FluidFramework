# Iteration 0002: reference-model-faults Instructions

Status: planned
Branch: `rust-service-iteration-0002-reference-model-faults`
Iteration source commit: `57b0028ff9061087b522c8dd652ca9b8b2179e50`
Owner: GitHub Copilot reference/model agent
Report: `rust-service/iterations/0002/phase-2/reference-model-faults.md`

## Assignment

Own iteration `0002` shared conformance evolution: add a small deterministic reference model, position-codec conformance, and fault tests for ambiguous append responses, interrupted reads, independent readers, and snapshot recovery. Hypothesis: these laws can be expressed without implementation-private hooks. Do not add production persistence or transport behavior.

## Ownership

Writable: `rust-service/crates/conformance/`, `rust-service/crates/memory/`, and `rust-service/iterations/0002/phase-2/reference-model-faults.md`. Read-only: core, storage, wrappers, clients, workspace files, decisions, and other reports. This workstream owns conformance additions but may not change accepted semantics or shared traits independently.

## Expected Evidence

Deliver deterministic model traces/seeds, codec round-trip/malformed/foreign-generation tests, and explicit ambiguous/interrupted-operation expectations. Report results against every applicable integrated implementation and identify the conformance commit consumed downstream. A minimized case requiring hidden state or semantic change is sufficient evidence to stop.

## Validation

- Print the absolute worktree and `git branch --show-current` with retained results.
- `cargo fmt --all -- --check`
- `cargo test -p snapshotted-stream-conformance -p snapshotted-stream-memory --all-features`
- `cargo clippy -p snapshotted-stream-conformance -p snapshotted-stream-memory --all-targets --all-features -- -D warnings`
- `git diff --exit-code -- rust-service/Cargo.lock`
- Integration: `cargo test --workspace --all-targets --all-features`.

## Escalation and Stopping Conditions

Escalate any conformance change that alters an accepted semantic law, any need for implementation-private state, and any shared trait or dependency change. Stop after three materially similar failed model/fault shapes. A retained failing trace and precise missing observation are useful partial outcomes.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
