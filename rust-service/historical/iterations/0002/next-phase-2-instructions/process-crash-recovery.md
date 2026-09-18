# Iteration 0003: process-crash-recovery Instructions

Derived from iteration: 0002
Status: planned
Owner: GitHub Copilot process-crash-recovery agent

## Approved Scope

Strengthen durable append and snapshot evidence with real child-process termination and reopen tests. Cover process exit around write, file sync, rename, directory sync, and acknowledgment while preserving the existing framing and lineage contracts. This scope was approved in [iteration 0002 Phase 3](../phase-3-report.md#next-iteration-scope). Power-loss, dishonest storage, retention, and multi-writer support remain out of scope.

## Prior Evidence

The [durable snapshots report](../phase-2/durable-snapshots.md) supports every injected frame prefix, corruption byte, and snapshot publication boundary, but explicitly does not test actual process termination or power loss. The [integration conformance adaptation](../phase-2/integration.md#conflict-resolution-and-adaptation) also found a snapshot error-classification defect missed by the isolated crash suite.

## Hypothesis and Discriminating Check

The `SDLOG002` log and atomic snapshot protocol recover to a valid acknowledged prefix or old/new snapshot lineage member after abrupt child-process termination at externally observable operation boundaries. The cheapest disproof is one kill/reopen trace that loses an acknowledged record or snapshot, accepts a corrupt complete artifact, or recovers a lineage state outside the old/new alternatives.

## Ownership and Dependencies

- Writable paths: `crates/spikes/durable-log/` and this workstream's iteration `0003` report.
- Dependencies: the integrated durable snapshot implementation and expanded public-trait conformance suite.
- The workstream may add crate-local test helpers or binaries and owned dependencies, but must leave the shared lockfile unchanged and report integration requirements.
- Do not edit core semantics, conformance laws, Fluid sequencing, network transport, decisions, or another report. Do not present process termination as equivalent to hardware power loss.

## Deliverables and Validation

- Build a deterministic parent/child crash harness with explicit readiness markers and bounded timeouts; never use timing-only sleeps as correctness synchronization.
- Exercise append and snapshot termination before and after each externally meaningful durability boundary, reopen without injection, and verify records, receipts, snapshot lineage, and replay start.
- Retain the existing byte-corruption and injected-fault suites, run the expanded shared conformance directly, and report filesystem/environment limitations.
- Run focused tests, strict package Clippy, workspace formatting, and an unchanged-lockfile check with checkout identity.
- Stop on flaky timing dependence, an acknowledged-data loss, or an invalid lineage recovery; preserve the smallest reproducible artifact and do not add undocumented repair heuristics.
