# Iteration 0001 Phase 3 Report

Status: complete
Phase 2 integration commit: `b9cabd08453`
Phase 3 commit: final record commit containing this file; its hash becomes the next iteration source

## Evidence Summary

- Reference/conformance was supported: reusable tests exercise concurrent ordering, independent finite readers, cancellation by drop, generation scoping, snapshot recovery, initial snapshots, and counter replay through public traits.
- Minimal file was supported for its stated guarantee: six tests cover shared conformance, clean reopen, malformed data, and 720,048 persisted bytes for 10,000 64-byte records without a crash-durability claim.
- Durable receipts and opaque positions were supported for append/read: five tests cover sync-before-ack, stable reopen, incomplete-tail truncation, checksum rejection, and 760,024 persisted bytes for the same record workload.
- Compression transparency was supported: six tests pass shared conformance and recovery while preserving positions, boundaries, snapshots, errors, and durability. Repeated 16 KiB data compressed to 40 bytes; pseudo-random data expanded to 16,395 bytes.
- Fluid sequencing was split by evidence: deterministic post-commit metadata needs no kernel change, but valid-only authoritative acceptance needs a fenced sequencer service or a future conditional append primitive.

## Implementation Defects

- Durable log treats a corrupted length extending beyond EOF as an incomplete tail; stronger framing evidence is needed before claiming arbitrary-corruption recovery.
- Compression has no decoded-size limit and allocates the complete output, so it is unsafe for untrusted compressed payloads without policy.
- File and durable stores use blocking file I/O in async methods and do not support independent concurrent opens of one directory.
- Fluid position lookup is linear and membership is in-memory; both are acceptable only for the feasibility spike.

## Shared Abstraction Findings

- Supported: immutable bytes, append-boundary preservation, opaque generation-scoped positions, finite readers, durability-qualified receipts, snapshot lineage, and classified errors compose across direct and wrapped implementations.
- Supported: per-record compression is transparent without wrapper positions or shared trait changes.
- Partially falsified: Fluid does not need conditional append to derive final metadata from committed order.
- Supported limitation: an authoritative valid-only Fluid service must reject before storage and serialize/fence sequencer ownership; plain `head` then `append` cannot coordinate multiple active sequencers.
- Resolved: position serialization is now a focused optional `PositionCodec`, not merely a capability flag.
- Inconclusive: snapshot durability, process fencing, arbitrary crash recovery, transport catch-up/live bridging, and conditional append remain research questions.

## Decisions

- [Decision 0004](../../decisions/0004-authoritative-fluid-sequencer.md) accepts a valid-only authoritative Fluid sequencer above the kernel and defers conditional append pending a fencing experiment.
- [Decision 0005](../../decisions/0005-opaque-position-codec.md) accepts an optional implementation-owned opaque position codec.
- Foundation [Decisions 0001-0003](../../decisions/README.md) remain accepted and are not superseded.

## Comparative Results

The minimal and durable file paths used the same 10,000-record, 64-byte deterministic payload for persisted-size accounting. Minimal framing used 720,048 bytes including empty snapshot metadata; durable append-only framing used 760,024 bytes, adding 4 checksum bytes per record but omitting snapshots. Their guarantees are not equivalent: minimal flushes buffered data, while durable calls `sync_data` before acknowledgment. Throughput and latency were not compared.

Minimal file uses 430 pre-test source lines and five runtime dependencies; durable uses 443 total source lines and six runtime dependencies but implements no snapshots, so source-size comparison is descriptive rather than equivalent. Compression adds `flate2` plus five transitive packages and shows workload-dependent size changes. Fluid and reference results are semantic tests, not performance comparisons.

## Learning and Process Findings

[The retrospective](retrospective.md) records branch-ref collisions, shared-lockfile validation friction, misleading multi-worktree command summaries, the host reboot recovery, and successful parallel dispatch. Durable findings are promoted to [LEARNINGS.md](../../../LEARNINGS.md).

## Skill Changes

[The skill review](skill-review.md) accepts parallel dispatch for independent workstreams, collision-safe branch naming, actual kickoff provenance, and checkout-marked lockfile-safe validation. The user approved all four changes; the repository skill and templates were updated in Phase 3.

## Next Iteration Scope

The user approved four iteration `0002` workstreams:

1. `reference-model-faults`: keep and deepen reference/conformance with model and deterministic ambiguous/interrupted-operation tests plus codec conformance.
2. `durable-snapshots`: expand durable recovery to coordinated snapshot publication, framing discrimination, and crash fault injection.
3. `network-transport`: add a backpressured client/server wrapper using `PositionCodec`, including reconnect and stale-generation behavior.
4. `authoritative-sequencer`: replace the projection-only spike with a valid-only sequencer service experiment covering stale rejection, reconnect/regeneration, fencing, and ambiguous append recovery.

File-simple and compression remain integrated fixtures rather than independent workstreams. Encryption, browser storage, caching, retention, block compression, full Fluid drivers, and broad optimization remain deferred.

## Convergence Assessment

The kernel has converged provisionally for direct storage and one transparent wrapper: no workstream required changing bytes, reads, snapshots, receipts, errors, or position identity. The optional codec closes the first transport-facing API gap. The project has not converged on crash-safe snapshot publication, network historical-to-live bridging, authoritative sequencer fencing, ambiguous retry/deduplication, or comparable performance. Iteration `0002` is justified because these gaps cannot be answered by the current evidence more cheaply.
