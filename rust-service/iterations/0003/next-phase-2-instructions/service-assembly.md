# Iteration 0004: service-assembly Instructions

Derived from iteration: 0003
Status: planned
Owner: GitHub Copilot service-assembly coding agent

## Approved Scope

Build the first runnable, single-host native service from the accepted durable stream and authoritative sequencer. Define a versioned transport-neutral byte protocol for document/session operations, append acknowledgement, finite reads, snapshots, position tokens, and stable errors; expose configuration, startup, graceful shutdown, and restart. The user approved this scope in the [iteration 0003 Phase 3 report](../phase-3-report.md#next-iteration-scope). Multi-host routing, authentication, blobs, retention, and a full Fluid driver are out of scope.

## Prior Evidence

[Decision 0006](../../../decisions/0006-scoped-deployment-boundaries.md) accepts a cooperating single-host deployment. [Process transport](../phase-2/process-isolated-transport.md) proves a bounded byte protocol over one IPC boundary, while [deployment fencing](../phase-2/deployment-fencing.md) proves the authority must span replay through append. The counter example and `fluid-sequencer` remain the semantic fixtures.

## Hypothesis and Discriminating Check

Hypothesis: the existing kernel, durable store, fence, and authoritative sequencer can be composed behind one transport-neutral protocol without a shared kernel API change. The cheapest disproof is a two-process create/open, submit, snapshot, stop, restart, recover, and stale-session trace that cannot preserve valid-only storage and stable acknowledgement/error semantics.

## Ownership and Dependencies

- Wave 1 and prerequisite for WebTransport and native-client integration.
- Writable: new `rust-service/crates/protocol/`, new `rust-service/crates/service/`, a new runnable example or binary under `rust-service/examples/`, and the eventual iteration `0004` service-assembly report.
- Existing core, sequencer, durable-log, and network crates are read-only unless a minimized integration defect requires coordinator approval.
- Crate-local manifests may change. Do not commit the shared `rust-service/Cargo.lock` or root workspace member list; report required root changes for integration.
- Protocol types own framing and limits but must not expose backend position structure or depend on Unix/WebTransport APIs.

## Deliverables and Validation

- Commit a runnable native binary with deterministic configuration and bounded request handling.
- Test fresh start, two documents, valid/invalid submissions, snapshot/replay, graceful restart, killed-process restart, stale fence/session, malformed/oversized frames, and clean shutdown.
- Run crate-focused tests, strict Clippy, rustfmt, and the binary smoke trace with an isolated `CARGO_TARGET_DIR`; integration runs workspace gates.
- Record protocol version, limits, deployment assumptions, exact commands, timings, dependencies, failures, and commit hashes in the workstream report.
- Stop with a minimized trace before changing kernel semantics, adding hidden retries, or claiming multi-host safety.
