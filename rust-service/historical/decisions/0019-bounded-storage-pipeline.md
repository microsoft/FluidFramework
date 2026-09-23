# Decision 0019: Bounded Storage Pipeline

Status: accepted
Date: 2026-09-20
Iteration: none; lightweight isolated implementation
Owners: project author and implementation assistant
Supersedes: none
Superseded by: none

## Context

Per-operation durable journal replacement copies retained history and synchronizes both file and directory.
The sequencer previously awaited each storage append while holding its runtime mutex.
The project author approved a bounded pending ring and grouped persistence, with an explicit stronger filesystem integrity requirement.
This work proceeds independently of the session-sequence work and requires semantic integration afterward.

## Decision Drivers

Preserve ordered session prefixes, terminal leave barriers, bounded outstanding work, dependency availability, and completion-gated reader visibility.
Remove history-dependent write amplification and permit admission while application persistence is pending.
Do not introduce service-owned retries or application rebasing.

## Options and Evidence

Whole-journal replacement protects synchronized inodes but has quadratic cumulative write volume.
Append-only batches avoid that cost by relying on documented durable-prefix filesystem protection.
A shared internal journal implementation supports buffered and synchronized completion without exposing buffered completion through the durable backend.
See the [implementation evidence](../STORAGE_OPTIMIZATION.md) for bounded local measurements, regressions, and limitations.

## Decision

Use an entry- and byte-bounded sequencer ring with per-session admission ordering and retained cooperative batch execution.
Expose storage batch results in input order; an uncertain grouped write may retain any input prefix and requires ambiguous outcomes for every uncertain entry.
Never retry an uncertain batch.
The file engine appends new frames, synchronizes once per durable event batch, and publishes only after backend completion.
Event disk I/O runs in a retained blocking worker; cancellation alone does not release writer ownership or establish settlement.
Recovery synchronizes its retained valid prefix before exposure.

Durable operation requires the filesystem/device assumptions in the [durable backend contract](../../crates/sea-file-durable/README.md#power-loss-model).
In particular, later interrupted appends must not damage earlier synchronized bytes, and incomplete-tail recovery must not discard acknowledged history.
Checksums alone do not establish these properties.

## Consequences

Write volume is linear in new frames and synchronization can be amortized across a batch.
Queue bookkeeping and blocking-worker handoff add overhead, including measured memory and sequential buffered-file regressions.
The ring does not bound retained archive history or caller-owned requests waiting outside admission.
Lifecycle and snapshot operations remain exclusive draining barriers.
The network author stream still serializes requests; same-session wire pipelining is not implemented here.
The journal encoding remains unchanged, but the new durability assumptions are stronger and require deployment review.

## Validation and Follow-Up

Owning tests cover ring capacity, byte backpressure, same-session batching, admission ordering under executor budget exhaustion, cancellation, grouped ambiguity, leave barriers, and reader visibility.
File tests cover single-sync batches, incomplete tails, corruption rejection, cancellation-retained locks, worker panic, and nonblocking event observations.
Physical power-cut qualification remains outstanding.
Integration must reconcile the concurrent session-sequence changes and rerun the combined contracts and gates.