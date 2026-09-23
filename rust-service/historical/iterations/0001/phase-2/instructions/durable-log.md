# Iteration 0001: durable-log Instructions

Status: active
Branch: `rust-service/iteration-0001/durable-log`
Base commit: `59f5069b43a6f2ede193f5affa8cda3a267628ff`
Owner: GitHub Copilot durable-log spike agent
Report: `rust-service/iterations/0001/phase-2/durable-log.md`

## Assignment

Test whether checksummed length-framed records, stable ordinal positions, tail truncation recovery, and explicit sync-before-receipt fit the current position, receipt, and error contracts. A small prototype or a minimized failing contract requirement is acceptable; snapshots and retention are out of scope until recovery is credible.

## Ownership

Writable: `rust-service/crates/spikes/durable-log/` and this workstream report. Read-only: core, conformance, file-simple, workspace files, and decisions. Do not alter shared traits, dependencies, or conformance semantics.

## Expected Evidence

Deliver a prototype or focused experiment for checksums, partial-record handling, reopen, and acknowledgment timing; test corruption/truncation deterministically; state exact durability and unsupported features; record persisted bytes, source/dependencies, and timing procedure. Stop once the hypothesis is supported or a precise missing primitive is demonstrated.

## Validation

- `cargo test -p snapshotted-stream-durable-log-spike --all-features`
- `cargo clippy -p snapshotted-stream-durable-log-spike --all-targets --all-features -- -D warnings`
- `cargo test --workspace --all-targets --all-features` after integration

## Escalation and Stopping Conditions

Escalate any need for conditional append, richer receipt phases, position serialization, or shared recovery metadata. Stop after three failed format/recovery approaches or before making unverified crash guarantees. A failing test and exact contract amendment are useful outcomes.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
