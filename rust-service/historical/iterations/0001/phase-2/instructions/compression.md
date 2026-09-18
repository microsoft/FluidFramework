# Iteration 0001: compression Instructions

Status: active
Branch: `rust-service/iteration-0001/compression`
Base commit: `59f5069b43a6f2ede193f5affa8cda3a267628ff`
Owner: GitHub Copilot compression wrapper agent
Report: `rust-service/iterations/0001/phase-2/compression.md`

## Assignment

Test whether independent per-record compression can transparently implement both traits over an underlying store while preserving outer positions, append boundaries, errors, snapshots, and durability. The hypothesis is falsified if transparency requires shared trait changes or wrapper-specific position semantics.

## Ownership

Writable: `rust-service/crates/wrappers/compression/` and this workstream report. Read-only: core, conformance, memory, client, workspace files, and decisions. Memory may be a dev-dependency for integration tests. Do not edit dependencies outside the crate or shared contracts.

## Expected Evidence

Deliver a generic wrapper, applicable shared conformance over memory, snapshot/counter-equivalent recovery tests, corrupt-payload classification, and compressed-size evidence for repeated and deterministic pseudo-random records. Stop when transparency and limits are demonstrated.

## Validation

- `cargo test -p snapshotted-stream-compression --all-features`
- `cargo clippy -p snapshotted-stream-compression --all-targets --all-features -- -D warnings`
- `cargo test --workspace --all-targets --all-features` after integration

## Escalation and Stopping Conditions

Escalate inability to preserve underlying positions/errors, need for block state in snapshots, or a conformance behavior that cannot be delegated. Stop rather than changing core or adding block compression. A minimized transparency failure is useful.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
