# Sequencer Checkpoint Plan

Created: 2026-09-22.
Status: implemented and validated sequentially on the current branch, with the unrelated repository formatting blocker recorded below.

## Scope

Recover a document from independently published internal state and a bounded recent tail, without reading older event payloads during storage or sequencer initialization.
Application snapshots must not govern checkpoint frequency or be required for recovery.
Then introduce document-scoped, sequencer-allocated `u64` session identities with persisted reservations and no reuse.
Pruning is not a deliverable or validation requirement; avoid unnecessary dependencies that would obstruct it later.
Session reuse and further wire compression remain in the [network protocol plan](NETWORK_PROTOCOL_PLAN.md).

## Recovery Contract

A checkpoint represents an exact committed prefix through position P, not whatever state exists when publication finishes.
Persist its content before atomically publishing its discoverable pointer and boundary.
An uncertain publication must not allow continued mutation based on an assumed outcome.
Recovery restores the checkpoint, replays only the suffix after P, and commits departures for outstanding announced sessions before admitting clients.
Unannounced openings retain their existing membership semantics.

The storage opening must also avoid replaying its old journal to reconstruct event and content lookup state.
Measure reads at that boundary, not only calls to the sequencer's event iterator.
Keep historical lookup separate from live sequencer state; do not move an unbounded history set into a checkpoint and call that bounded recovery.
Define checkpoint cadence and backpressure so repeated publication failures cannot silently permit an unbounded recovery tail.

The checkpoint needs the applied position, durable minimum-reference floor, outstanding announcements, bounded reference-policy state, and allocation reservation.
Persist an allocation reservation before exposing any ID from it; restart skips its unused suffix.
Updating the reservation must not advance the checkpoint's applied event position.
Exhaustion rejects allocation instead of wrapping.

## Work

- [x] C1: Define and implement storage checkpoint publication, discovery, suffix recovery, and historical lookup without old-payload scans.
- [x] C2: Implement sequencer checkpoint state, automatic cadence, recovery, and outstanding-session departures.
- [x] C3: Introduce allocated numeric session IDs, persisted reservations, and native/WASM/application consumer migration.
- [x] C4: Validate atomic publication and crash boundaries, bounded old-history I/O, independence from application snapshots, and allocation across restart.
- [x] C5: Update contracts and generated APIs, run canonical Rust and repository gates, package/browser suites, and Fluid Sea end-to-end tests.

## Implemented Design

`SEAC2` stores the inclusive reservation high-water mark, durable minimum-reference floor, last 1088 positions, and outstanding announcement envelopes with their original committed positions.
The last retained position is the exact applied boundary P; an empty position window represents an empty archive.
No historical session-ID set or application snapshot is embedded.
Checkpoint size depends on the fixed policy window and outstanding announcements, including their public metadata, rather than total document history.

The sequencer publishes before the next batch or lifecycle event once 256 entries have been applied.
Its maximum 256-entry batch allows at most 511 entries after P.
Failure or cancellation during publication makes the runtime require recovery before further mutation.
Recovery restores the state, replays the suffix, and commits terminal departures for remaining announcements before exposing new session authority.
Interrupted recovery can resume without duplicating a previously committed departure.

The file backend's `.index` contains checksummed storage heads, opaque sequencer state, a journal byte boundary, and sorted fixed-width logical-key/address entries.
Opening reads the header and metadata, then seeks directly to the boundary and validates the journal suffix.
Historical dependency and payload lookups use logarithmic index reads; historical payloads are checked only when accessed.
Publication settles the journal first, writes `.index-pending`, synchronizes that file in durable mode, atomically renames it to `.index`, then synchronizes the containing directory before acknowledgment.
An unpublished replacement is ignored; after atomic rename, recovery selects a complete old or new index under the documented filesystem model.

The backend also publishes storage indexes independently at mutation boundaries after at least 256 new addresses.
Raw storage batches and individual payloads are not size-bounded, so this is not a universal byte bound for the generic storage API.
Index publication merges all retained address entries, with cost proportional to retained history, but never copies old journal payloads.
This is a deliberately simple recovery design, not a claim of constant-cost checkpoint publication or production filesystem qualification.
Memory storage keeps its existing resident-history consistency validation on reopen; the bounded historical I/O guarantee concerns persistent storage.

IDs are nonzero document-scoped `u64` values reserved in ranges of up to 256 before exposure.
Recovery skips every value through the persisted high-water mark, including unused values; exhaustion never wraps.
Reservation-only publication captures the existing applied boundary without creating an event.
Protocol 11 returns the allocated ID in the open response and encodes event IDs as varints.
`SEAQ6`/`SEAM5` persist fixed-width IDs; WASM/TypeScript expose eight big-endian bytes without JavaScript number precision loss.
The Fluid adapter maps these to `sea-` plus hexadecimal client IDs.
Earlier experimental protocols and persisted session formats are incompatible; no migration or identity reuse is implemented.

## Validation

| Boundary | Evidence |
| --- | --- |
| Storage publication | Every truncated unpublished replacement leaves the old index selected; a complete rename selects the replacement. Existing journal tests cover uncertainty, synchronization, and torn tails. |
| Bounded historical I/O | Seek-instrumented suffix recovery never reads before its boundary; indexed reopen retains only the tail and can serve historical reads lazily. Old payload corruption is detected on access, not by a full-history opening scan. |
| Sequencer state | Recovery beyond the policy window preserves the floor and closes checkpointed and tail announcements without any application snapshot. |
| Reservations | Rejection, ambiguity before/after commitment, cancellation before/after commitment, skipped unused ranges, and `u64::MAX` exhaustion are covered. |
| Terminal departures | Interrupted recovery after a committed departure resumes with exactly one departure per outstanding membership. |
| Native gates | Formatting, workspace Clippy with warnings denied, strict rustdoc, all-target build, and 215 tests passed; one browser-only test is ignored by Cargo and separately exercised by the browser harness. |
| Generated clients | All seven WASM configurations, neutral/driver/direct-client builds, regenerated API reports, and aggregate `test:all` passed. |
| Fluid integration | Main Sea WebSocket E2E: 691 passing, 493 pending, zero failures. |
| Repository gates | Documentation checker and `pnpm policy-check --path rust-service` passed. Root `pnpm build:fast` completed all tasks but failed the untouched historical JSON formatting check described below. |

The first aggregate integration run timed out in the Chromium runner launch/cleanup fixture; all nine fixture tests passed in isolation, then the full aggregate passed.
One final native run hit the previously recorded `native_client_round_trip_in_every_storage_mode` durable-file connection timeout; isolated and full-workspace reruns passed without a production change.
These remain timing risks, not checkpoint correctness failures established by those runs.

Root build remains blocked only by formatting in [`historical/measurements/browser-dds-comparison/websocket-summary.json`](historical/measurements/browser-dds-comparison/websocket-summary.json), unchanged by this task.
No unrelated historical evidence was reformatted.
Generated API differences were reviewed against the user-selected pre-task commit `bb0173b0439`; all changed declarations are `@internal`, with no customer-facing API or changeset requirement.
Compression/encryption and benchmark/example changes only migrate session construction; their existing composition, generated-client, and aggregate workload tests cover those call sites.
No pruning, identity reuse, further network compression, or new compatibility layer is included.

## Evidence and Decisions

- Starting implementation: `LocalSequencer::recover` scans from the beginning, and `Journal::open` reads the entire journal before recovering records.
  A sequencer-only checkpoint would not meet the storage I/O requirement.
- The directory-dedup worktree has concurrent storage work; preserve it and reconcile any incoming changes rather than overwrite them.