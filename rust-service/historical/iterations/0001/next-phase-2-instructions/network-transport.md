# Iteration 0002: network-transport Instructions

Derived from iteration: 0001
Status: planned
Owner: GitHub Copilot network transport agent

## Approved Scope

Implement a minimal local client/server wrapper exposing append, finite reads, head, snapshots, and position codecs over a bounded asynchronous transport. Test historical reconnect and backpressure; live subscription remains optional and must not be implied. Scope was approved in [iteration 0001 Phase 3](../phase-3-report.md#next-iteration-scope) under [Decision 0005](../../../decisions/0005-opaque-position-codec.md).

## Prior Evidence

[Compression](../phase-2/compression.md) showed transparent wrappers can preserve the kernel contract. [Fluid sequencing](../phase-2/fluid-sequencer.md) found that generic adapters lacked a position codec; Phase 3 added it with memory tests. The plan still lacks evidence for end-to-end backpressure, disconnect classification, stale-generation tokens, and gap-free finite catch-up after reconnect.

## Hypothesis and Discriminating Check

Hypothesis: a bounded framed request/response protocol can implement the raw traits and `PositionCodec` transparently without unbounded buffering or live-tail semantics. The cheapest disproof is a slow-reader/disconnect/reconnect test that loses, duplicates, or buffers beyond the configured bound while reading strictly after the last decoded position.

## Ownership and Dependencies

Writable: `rust-service/crates/wrappers/network/` and this workstream's iteration `0002` report. Read-only: core, memory, conformance, workspace manifests/lockfile, other wrappers, decisions, and reports. The Phase 3 crate boundary and Tokio features are prerequisites. Consume codec/conformance additions from the reference owner; do not alter shared traits or invent live subscription semantics.

## Deliverables and Validation

Deliver a bounded protocol, server adapter over memory, client implementing applicable public traits, codec forwarding, disconnect/error classification, slow-reader backpressure, reconnect/resume, stale-generation, and snapshot recovery tests. Measure wire bytes and peak queued records for deterministic payloads; record source/dependencies and environment. Run package format, strict Clippy, tests, applicable conformance, and an integration test with compression in the approved order. Stop on a minimized historical/live race or missing transport-safe error/codec contract.
