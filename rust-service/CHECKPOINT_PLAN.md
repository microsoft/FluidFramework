# Sequencer Checkpoint Plan

Created: 2026-09-22.
Status: corrected storage and minimal checkpoint state implemented and validated; the unrelated root formatting blocker remains below.

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

The checkpoint needs the applied position, durable minimum-reference floor, outstanding announcements, and allocation reservation.
Lag-window history is runtime-only because recovery ends prior sessions before admitting fresh sessions.
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

`SEAC3` stores the inclusive reservation high-water mark, durable minimum-reference floor, explicit applied boundary P, and outstanding announcement envelopes with their original committed positions.
An absent applied boundary represents an empty archive.
No historical session-ID set or application snapshot is embedded.
The fixed portion is at most 35 bytes, plus outstanding announcements and their public metadata; no recent position window is serialized.
Recovery preserves the committed floor and resets the live lag window after settling all outstanding departures.

The sequencer publishes before the next batch or lifecycle event once 256 entries have been applied.
Its maximum 256-entry batch allows at most 511 entries after P.
Failure or cancellation during publication makes the runtime require recovery before further mutation.
Recovery restores the state, replays the suffix, and commits terminal departures for remaining announcements before exposing new session authority.
Interrupted recovery can resume without duplicating a previously committed departure.

File content is retrieved directly by typed hash, events use literal journal byte offsets, and snapshot lookup walks a separate fixed-width log backward within storage.
There is no persisted or reconstructed historical address table.
Each journal has a checksummed 48-byte settled-tail cursor, published independently after each event batch or snapshot append.
Opening validates the named tail records, seeks directly to the settled boundary, and validates only the suffix.
Durable cursor publication adds one file synchronization and directory synchronization per batch, independent of retained history.
Raw storage batches and individual payloads are not size-bounded, so this is not a universal recovery byte bound for the generic storage API.

The document's independent `CheckpointStore` capability reads and atomically replaces opaque internal state through `SeaView`; it is not part of `SnapshotArchive`.
Publication writes only the checkpoint payload plus its 32-byte checksum, synchronizes it in durable mode, atomically renames it, and synchronizes the parent directory.
An unpublished replacement is ignored; recovery selects a complete old or new value under the documented filesystem model.
Checkpoint publication neither reads nor rewrites content, journals, cursors, or any historical mapping.
The sequencer's floor policy counts committed entries rather than performing arithmetic on positions, including its 64-entry debounce.
Memory storage keeps its existing resident-history consistency validation on reopen; the bounded historical I/O guarantee concerns persistent storage.

IDs are nonzero document-scoped `u64` values reserved in ranges of up to 256 before exposure.
Recovery skips every value through the persisted high-water mark, including unused values; exhaustion never wraps.
Reservation-only publication captures the existing applied boundary without creating an event.
Protocol 11 returns the allocated ID in the open response and encodes event IDs as varints.
`SEAQ6`/`SEAM5` persist fixed-width IDs; WASM/TypeScript expose eight big-endian bytes without JavaScript number precision loss.
The Fluid adapter maps these to `sea-` plus hexadecimal client IDs.
Earlier experimental protocols and persisted session formats are incompatible; no migration or identity reuse is implemented.

## Validation

The correction removes the earlier history-sized `.index` design following user review.
Focused tests cover hash lookup, literal event offsets, non-record range bounds, backward snapshot selection without a sequencer checkpoint, and checkpoint size/history independence.
The existing journal crash, ambiguity, directory closure/deduplication, and cross-process locking tests continue to pass.
Sparse-position sequencer coverage verifies event-count floor debouncing.
No-tail checkpoint recovery verifies the independent applied boundary, preserved floor, storage-backed historical reference resolution, and an initially empty live policy window.
A real file-backed registry restart verifies persisted reservations, the floor, and outstanding departures after checkpointed recovery without application snapshots.
Formatting, strict workspace Clippy/rustdoc, all-target build, workspace tests, and the documentation checker pass on the correction.
The final native run passed 226 tests, with one browser-only test ignored by Cargo and exercised separately by the aggregate browser harness.
Repository policy and aggregate generated-client/Chromium `test:all` pass.
Fluid Sea WebSocket E2E passed with 691 passing, 493 pending, and no failures.
The root build completed the generated-client tasks but failed only on the unchanged historical JSON formatting issue recorded below.
The previously flaky native connection test passed in the corrected workspace run; this does not prove the earlier untraced timeout cannot recur.

Against the user-selected pre-checkpoint commit `bb0173b0439`, the core storage delta is only the two-method `CheckpointStore` capability, its component/view plumbing, and the required `StorageSurface` bounds on the component bundle.
Existing blob, event, referenceable, ordered, and snapshot archive traits and their recovery laws are unchanged.
The earlier numeric session-ID API change is retained separately from this storage correction.

### Earlier Implementation Evidence

The following records describe validation before the index-removal correction, not fresh evidence for the corrected file layout.

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

Integration reconciliation (2026-09-22): the incoming storage-initialization fix `9f22810a2f0` removes cross-filesystem ancestor synchronization and moves host initialization/create/recovery off the executor while retaining worker ownership after cancellation.
That reproduced stall mechanism is fixed, but the native timeout above was not traced and cannot be conclusively attributed to it.
Track remaining native failures under [unattributed connection timeouts](KNOWN_ISSUES.md#intermittent-native-connection-timeout), not as an outstanding initialization repair.
The [Chromium runner fixture timeout](KNOWN_ISSUES.md#intermittent-chromium-runner-fixture-timeout) remains a separate unresolved harness issue; neither passing retries nor the storage fix establish its resolution.

Merged-tree validation passed formatting, strict workspace Clippy/rustdoc, all-target build, and 223 Rust tests with one browser-only Cargo test ignored.
The generated-client build and aggregate `test:all` passed, including freshly executed Mocha runner fixtures and Chromium WebTransport, WebSocketStream, ordinary WebSocket, and shutdown scenarios.
Documentation and repository policy checks passed; the root build still failed only on the unchanged historical JSON formatting issue below.
This validation establishes compatibility of the combined changes, not a causal explanation for the earlier untraced failures.

Root build remains blocked only by formatting in [`historical/measurements/browser-dds-comparison/websocket-summary.json`](historical/measurements/browser-dds-comparison/websocket-summary.json), unchanged by this task.
No unrelated historical evidence was reformatted.
Generated API differences were reviewed against the user-selected pre-task commit `bb0173b0439`; all changed declarations are `@internal`, with no customer-facing API or changeset requirement.
Compression/encryption and benchmark/example changes only migrate session construction; their existing composition, generated-client, and aggregate workload tests cover those call sites.
No pruning, identity reuse, further network compression, or new compatibility layer is included.

## Evidence and Decisions

- Starting implementation: `LocalSequencer::recover` scans from the beginning, and `Journal::open` reads the entire journal before recovering records.
  A sequencer-only checkpoint would not meet the storage I/O requirement.
- The directory-dedup worktree supplied merged storage work; preserve it rather than overwrite it.
  The corrected writer-independent fast path checks hash-addressed membership and tests both recent and reopened content under both durability modes.
- The first checkpoint implementation unnecessarily rewrote a complete historical address index.
  User review rejected that growing write cost and the checkpoint methods on `SnapshotArchive`; the correction removes both rather than preserving a compatibility layer.