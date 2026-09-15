# Iteration 0002: network-transport Instructions

Status: planned
Branch: `rust-service-iteration-0002-network-transport`
Iteration source commit: `57b0028ff9061087b522c8dd652ca9b8b2179e50`
Owner: GitHub Copilot network transport agent
Report: `rust-service/iterations/0002/phase-2/network-transport.md`

## Assignment

Implement a minimal local client/server wrapper exposing append, finite reads, head, snapshots, and `PositionCodec` over a bounded asynchronous transport. Hypothesis: the raw traits remain transparent without unbounded buffering or implied live subscription. Test historical reconnect and backpressure; do not add live-tail semantics.

## Ownership

Writable: `rust-service/crates/wrappers/network/` and `rust-service/iterations/0002/phase-2/network-transport.md`. Read-only: core, memory, conformance, workspace files, other wrappers, decisions, and reports. Consume reference codec/conformance additions when available. Do not alter shared traits or transport-independent semantics.

## Expected Evidence

Deliver a bounded protocol, server adapter over memory, client implementing applicable public traits, codec forwarding, disconnect/error classification, slow-reader backpressure, reconnect/resume, stale-generation, snapshot recovery, and compression-order integration tests. Measure wire bytes and peak queued records for deterministic payloads and record source/dependencies/environment.

## Validation

- Print the absolute worktree and `git branch --show-current` with retained results.
- `cargo fmt --all -- --check`
- `cargo test -p snapshotted-stream-network --all-features`
- `cargo clippy -p snapshotted-stream-network --all-targets --all-features -- -D warnings`
- Validate manifest changes in an exact disposable copy and run `git diff --exit-code -- rust-service/Cargo.lock` in the assigned worktree.
- Integration: applicable shared conformance, compression composition, and workspace tests.

## Escalation and Stopping Conditions

Escalate a historical/live race, unrepresentable transport error, codec instability, or any need for shared API change. Stop rather than adding unbounded buffering, hidden retries, or live subscription. A minimized slow-reader or reconnect failure is useful evidence.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
