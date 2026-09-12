# Iteration 0002: durable-snapshots Instructions

Derived from iteration: 0001
Status: planned
Owner: GitHub Copilot durable recovery agent

## Approved Scope

Extend the durable-log spike with crash-tested framing discrimination and snapshot publication/recovery coordinated with the stream. Do not implement retention, optimize throughput, or claim multi-process safety. Scope was approved in [iteration 0001 Phase 3](../phase-3-report.md#next-iteration-scope).

## Prior Evidence

[The durable report](../phase-2/durable-log.md) demonstrated sync-before-ack append/read but identified corrupted-length-versus-torn-tail ambiguity, missing directory durability, and intentionally absent snapshots. [Decision 0002](../../../decisions/0002-receipts-and-snapshots.md) requires snapshot lineage and usable publication under retention races; retention remains deferred.

## Hypothesis and Discriminating Check

Hypothesis: duplicated framing evidence plus an atomically published, synced snapshot record can distinguish incomplete tails from corrupt complete records and ensure every acknowledged snapshot remains recoverable with subsequent stream replay. The cheapest disproof is a deterministic crash point that either accepts corrupted framing or leaves the latest acknowledged snapshot unusable.

## Ownership and Dependencies

Writable: `rust-service/crates/spikes/durable-log/` and this workstream's iteration `0002` report. Read-only: core, shared conformance, workspace manifests/lockfile, other implementations, decisions, and other reports. Consume the reference/model conformance commit when available; independent framing and snapshot work may begin concurrently. Shared contract changes require a minimized failing test and Phase 3 escalation.

## Deliverables and Validation

Deliver deterministic fault injection at record/snapshot write, sync, rename/publication, and reopen boundaries; distinguish torn tails from checksum/length corruption; test snapshot lineage, non-regression, acknowledged-snapshot recovery, and replay. Record exact sync policy, persisted amplification, recovery timing procedure, source/dependencies, environment, and unsupported crash guarantees. Run package format, strict Clippy, tests, applicable conformance, and integrated workspace checks. Stop before retention or undocumented recovery heuristics.
