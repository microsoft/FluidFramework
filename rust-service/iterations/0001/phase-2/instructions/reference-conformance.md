# Iteration 0001: reference-conformance Instructions

Status: active
Branch: `rust-service/iteration-0001/reference-conformance`
Base commit: `59f5069b43a6f2ede193f5affa8cda3a267628ff`
Owner: GitHub Copilot reference and conformance agent
Report: `rust-service/iterations/0001/phase-2/reference-conformance.md`

## Assignment

Determine whether the public traits and one reusable test function cover concurrent append ordering, real-time precedence, independent finite readers, drop cancellation, generation-scoped positions, initial and later snapshots, and counter recovery. The hypothesis is that these behaviors need no implementation-specific test copies or Fluid metadata. Expand the memory reference and public-trait client/example only where evidence requires it.

## Ownership

Writable: `rust-service/crates/memory/`, `rust-service/crates/conformance/`, `rust-service/crates/client/`, `rust-service/examples/counter/`, and this workstream report. Read-only: core traits, decisions, charter, and other crates. Do not change core semantics, workspace manifests, another report, or coordination records; minimize and report such needs.

## Expected Evidence

Deliver concurrent writer/reader coverage, cancellation-by-drop coverage, snapshot recovery coverage, and a counter that uses public traits. Report test commands and any behavior not expressible generically. Measurements are correctness-focused; record test count and dependency/source-size observations where cheap. Stop when the reusable suite passes memory and the example recovers from a published snapshot.

## Validation

- `cargo test -p snapshotted-stream-memory`
- `cargo test -p snapshotted-stream-client`
- `cargo run -p snapshotted-stream-counter`
- `cargo clippy -p snapshotted-stream-memory -p snapshotted-stream-conformance -p snapshotted-stream-client --all-targets --all-features -- -D warnings`

## Escalation and Stopping Conditions

Escalate any shared trait change, capability reinterpretation, or test that would make an existing compliant implementation fail. Stop with a minimized test when finite reads cannot express required cancellation/backpressure or snapshot recovery needs position serialization. A documented negative result or precise conformance gap is useful.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
