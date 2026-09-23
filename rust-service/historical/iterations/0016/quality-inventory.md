# Iteration 0016 Rust Quality Inventory

Status: complete
Source commit: `69f0e22ed3a7e659bf9ed3af77ce08d22e96a156`
Configured scope: Every `already adequate` disposition in [iteration 0015](../0015/quality-inventory.md).
Inherited inventory: Iteration `0015` quality inventory and five Phase 2 reports.
Budget and stopping conditions: At most two unrelated repair clusters; stop when every adequate row has precise contract text and practical owner-local diagnosis or a justified boundary exception.

## Selection Rationale

Iteration `0015` repaired exact-decision evidence gaps but demonstrated that eventual failure of a shared assertion does not itself prove an explicit caller contract or local diagnosis. Every inherited adequate row is selected for this final neutral verification. Previously deferred semantic, platform, fault, and format work remains lower priority.

## Reviewed Boundaries

Use stable identifiers where practical. Test layers are `focused`,
`conformance`, `integration`, `generated`, and `platform`.

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sea-benchmarks/finite-read-integrity` | `verify_payloads`; benchmark result consumers | Lossy aggregates can accept wrong multiplicity. | `verify_payloads` promises the exact payload multiset without assuming append order. | focused, integration | Exact count and multiplicity; `payload_verification_rejects_duplicate_wrong_payloads` fails on duplicate wrong payloads. | already adequate | None. | Focused package test and smoke passed. | Verification becomes streaming or a bottleneck. |
| `sea-benchmarks/concurrent-writer-completion` | Concurrent `run_storage` and `run_session` branches; result consumers | A successful partial run could emit misleading throughput. | Successful runners require every operation, one latency sample per operation, and the exact finite-read fixture multiset. | focused, integration | The inherited smoke crossed backends and modes rather than diagnosing runner ownership locally. `concurrent_writers_complete_before_measurement_returns` exercises both two-writer branches and checks exact completion evidence. | repaired | Documented both runner success contracts and added the focused two-writer storage/session test. | Focused package test, workspace gates, and smoke passed. | Scheduling, cancellation, result streaming, or runner completion changes. |
| `sea-core/monitored-stream-map-progress` | `MappedMonitoredStream::progress`; decorators | Transform failure follows possible source advancement. | `map_monitored_stream` promises that a transformation error does not rewind the source cursor. | focused, conformance | Delegate progress to the source; `mapped_progress_preserves_source_delivery_after_transformation_error`. | already adequate | None. | Workspace tests passed. | Mapping gains retry, filtering, or replacement. |
| `sea-core/caller-value-invariants` | Identity constructors and `EventPosition`; storage/session callers | Noncanonical values cross persistence and transport boundaries. | Positions use canonical big-endian bytes; identity constructors require nonempty bytes. | focused, conformance, integration | Codec ordering and constructor validation; `event_positions_use_canonical_ordered_bytes` and `caller_identities_preserve_nonempty_bytes_and_reject_empty_values`. | already adequate | None. | Workspace tests passed. | Parsing, limits, canonicalization, or representation changes. |
| `sea-conformance/session-monitored-progress-accessor` | Observable suite; every session implementation | Correct data can mask wrong synchronous progress. | `MonitoredStream::progress` is the latest atomic snapshot and advances only on yielded data. | focused, conformance, integration, generated, platform | `LocalSession` owns cursor updates; local `local_session_matches_observable_behavior` invokes assertions for each state. | already adequate | None. | Workspace tests passed. | An implementation or mapper bypasses the suite. |
| `sea-conformance/session-fallen-behind-recovery` | `LocalSession::monitored_events`; lagging consumers | Broadcast lag requires ordered finite catch-up. | Accumulating unread known items eventually report `FallenBehind`. | focused, conformance | Detect lag and resume from `previous`; local `configured_event_lag_reports_fallen_behind_and_recovers`. | already adequate | None. | Workspace tests passed. | Another implementation exposes lag or lacks local evidence. |
| `sea-conformance/storage-fresh-state-and-atomic-load` | Storage suite and backend `load`; storage consumers | Snapshot, head, and tail can be captured inconsistently. | `SeaStorage::load` selects a compatible snapshot and atomically captures a finite catch-up stream. | focused, conformance | Each backend directly runs `storage_starts_empty` and `assert_captured_load`; assertions identify empty surfaces and captured-tail consistency. | already adequate | None. | Workspace tests passed. | Semantics change, a backend is added, or local evidence exposes an omitted law. |
| `sea-content-addressed/publication-integrity` | `publish` and `verify_existing`; immutable-object consumers | Collision reuse could accept different bytes. | Existing immutable objects are reused only when their bytes match. | focused | Shared collision verifier; `publication_verifies_existing_content`. | already adequate | None. | Workspace tests passed. | Publication, collision handling, or durability order changes. |
| `sea-content-addressed/bounded-verified-reads` | `read_bounded` and `get_blob`; untrusted-storage readers | Oversized or corrupt bytes can allocate or masquerade as an ID. | Reads enforce configured byte limits and requested identity. | focused | Pre-allocation bound and post-read identity; `rejects_blob_bounds_and_corruption`. | already adequate | None. | Workspace tests passed. | Read strategy, limits, or error taxonomy changes. |
| `sea-content-addressed/directory-identity` | `get_directory`; directory consumers | Canonical bytes for another directory can parse. | `SeaStorage::get_directory` fetches and verifies the requested immutable directory. | focused | Compare decoded canonical ID with requested ID; `rejects_directory_identity_mismatch`. | already adequate | None. | Workspace tests passed. | Encoding or identity derivation changes. |
| `sea-file/clean-reopen-and-strict-corruption` | `FileStream::open`; persistent users | Lenient framing could accept incomplete records. | Open validates framing, rejects invalid or incomplete bytes, and preserves state across clean reopen. | focused, conformance | Whole-archive parse and reconstruction; `clean_reopen_preserves_archive_state` and `open_rejects_incomplete_or_invalid_archive_framing`. | already adequate | None. | Workspace tests passed. | Encoding, parser, or recovery policy changes. |
| `sea-sequencer/snapshot-coordination-latest` | `LocalSession::publish_snapshot`; coordinated publishers | Publication could update storage but not watchers. | The snapshot coordinator subscribes to latest-value updates; intermediate values may coalesce. | focused, conformance, integration, platform | Direct publication updates snapshot and coordination watches; `direct_snapshot_publication_updates_coordination_streams`. | already adequate | None. | Workspace tests passed. | Publication paths or coordination ownership change. |
| `sea-sequencer/monitored-load-progress` | Load initialization; archive consumers | Snapshot selection can leave a stale cursor. | Load atomically selects snapshot/head, emits catch-up, and reports caught-up progress. | focused, conformance, platform | Initialize `previous` and `latest_known`; local `local_session_matches_observable_behavior` calls `assert_snapshot_load_progress`. | already adequate | None. | Workspace tests passed. | Cursor, progress, buffering, or selection changes. |
| `sea-memory/read-range` | `MemoryStream::read`; finite readers | Endpoint conversion can include wrong events. | `SeaStorage::read` returns events strictly after `after` through `through`. | focused, conformance | Implement `(after, through]`; `read_includes_through_and_excludes_later_events`. | already adequate | None. | Workspace tests passed. | Position representation or range semantics change. |
| `sea-memory/snapshot-rejection-atomicity` | `MemoryStream::publish_snapshot`; retrying publishers | Rejection could mutate history or operation identity. | Snapshot closure, parent, position, identity, and non-regression validate before commit. | focused, conformance | Validate before IDs, history, and operation index; `rejected_snapshot_does_not_bind_operation_identity`. | already adequate | None. | Workspace tests passed. | Validation order or operation-index representation changes. |
| `sea-memory/load-capture` | Mutex-scoped `MemoryStream::load`; concurrent readers | Snapshot/head/tail can span states. | Readers are finite at captured head and `load` atomically pairs selection with that head. | focused, conformance | Capture under one guard; directly instantiated `assert_captured_load` is the narrowest deterministic test. | already adequate | None. | Workspace tests passed. | Locking, materialization, or a concurrency incident changes risk. |
| `sea-memory/append-tree-atomicity` | `MemoryStream::append`; writers | Position assignment could precede complete validation. | `SeaStorage::append` atomically validates the optional tree and commits event/reference. | focused, conformance | Recursive closure before position assignment; `append_accepts_nested_blob_tree` and direct `reject_missing_event_tree`. | already adequate | None. | Workspace tests passed. | Tree validation or append ordering changes. |
| `sea-memory/reader-cancellation` | Owned finite vector streams; concurrent readers | Dropping one reader could affect another. | Each event stream owns its cursor; dropping it cancels only that subscription. | conformance | Direct `storage_readers_are_independent_and_cancellable` drops one reader and completes another. | already adequate | None. | Workspace tests passed. | Reads become live, share cursors, or borrow state. |
| `sea-file-durable/append-crash-recovery` | Durable frame write/reopen; persistent writers | Interrupted writes leave incomplete or ambiguous frames. | Checksummed framing, sync-before-acknowledgement, incomplete-tail recovery, and synced-unacknowledged recovery are promised. | focused, conformance | Truncate incomplete and retain synced complete frame; `crash_recovery_distinguishes_incomplete_and_synced_appends`. | already adequate | None. | Workspace tests passed. | Persistence sequence or power-loss harness changes. |
| `sea-file-durable/snapshot-ambiguity-resolution` | Durable snapshot journal/index; retrying publishers | Snapshot acknowledgement can be lost after sync. | Tests promise operation-based resolution of synced-but-unacknowledged snapshots. | focused, conformance | Replay operation identity after ambiguity; `reopen_resolves_snapshot_after_post_sync_ambiguity`. | already adequate | None. | Workspace tests passed. | Snapshot journaling or operation identity changes. |
| `sea-compression/frame-transform-and-malformed-input` | Compression helpers/readers; archive consumers | Untrusted frames require exact decoding. | One independent zlib frame is consumed completely; malformed, truncated, and extended frames are corrupt. | focused, conformance | Complete-frame decode and classification; `rejects_truncated_and_extended_frames` and `classifies_malformed_stored_payloads_as_corrupt`. | already adequate | None. | Workspace tests passed. | Codec, format, strategy, or decoded-size policy changes. |
| `sea-compression/wrapper-transparency-and-errors` | `CompressionSession`; generic session users | A payload wrapper can alter metadata or classifications. | Wrapped session owns positions, identities, snapshots, recovery, cancellation, and backpressure. | focused, conformance, integration | Transform payloads only and preserve errors; `session_decorator_round_trips_events_and_blobs` and local `passes_session_conformance`. | already adequate | None. | Workspace tests passed. | Wrapped responsibilities, mapper, or conversion changes. |
| `sea-compression/reopen-and-stream-lifecycle` | `read`, `load`, mapper; stream consumers | Lazy mapping could add task/buffer/cursor state. | Reads decode only when polled; dropping stops wrapper work; no task or extra buffer exists. | focused, conformance, integration | Core mapper diagnoses progress and local conformance diagnoses forwarding; structural rationale is valid while no wrapper state exists. | already adequate | None. | Workspace tests passed. | Async work, buffering, shared state, reconnect logic, or reopen changes. |
| `sea-encryption/operation-replay-nonce` | `EncryptionSession::submit`; retrying authors | Retry encryption can consume a fresh nonce. | Exact committed retry reuses its receipt without requesting another nonce. | focused, conformance | Resolve before encryption; `operation_retries_do_not_request_another_nonce`. | already adequate | None. | Workspace tests passed. | Submit ordering, nonce invocation, or resolution changes. |
| `sea-encryption/envelope-validation` | `decrypt_payload`; event/blob readers | Untrusted envelopes cross format/context/key/authentication boundaries. | Malformed, truncated, tampered, wrongly keyed, or context-swapped envelopes are corrupt; missing keys are unavailable. | focused, conformance | Direct tests isolate header, context, lookup, authentication, and truncation, beginning with `every_truncated_envelope_is_corrupt`. | already adequate | None. | Workspace tests passed. | Parser, format, context, or key resolution changes. |
| `sea-encryption/error-classification` | `EncryptionError::kind`; error consumers | Local and wrapped errors need stable categories. | Underlying classifications pass through; local corrupt, unavailable, and rejected categories are explicit. | focused, conformance | Local arms and `Store` delegation; focused failures plus local decorated post-close conformance. | already adequate | None. | Workspace tests passed. | Variants, mappings, or wrapped conversion changes. |
| `sea-stateful-compression/malformed-event-replay` | Decorated `read`/`load`; archive readers | Corrupt history could poison later reads. | Every stored payload is independent and malformed frames are corrupt. | focused, conformance, integration | Decode each item independently and permit fresh replay; `corrupt_events_do_not_prevent_fresh_replay`. | already adequate | None. | Workspace tests passed. | Decoding becomes history-dependent, buffered, or recoverable per stream. |
| `sea-stateful-compression/pass-through-state-and-errors` | Trait forwarding/mapper; generic users | Wrapper can add state or alter metadata/errors. | Wrapped session owns positions, lineage, recovery, cancellation, and backpressure; reads add no task/buffer. | focused, conformance, integration | Payload-only transform and error delegation; local `passes_session_conformance`, with core mapper owning failed-transform progress. | already adequate | None. | Workspace tests passed. | Wrapper state, buffering, retry, cancellation, or transformed metadata appears. |
| `sea-webtransport/injected-optional-disconnect` | `call_optional_method`; generated clients | Optional JavaScript lookup can become mandatory. | Optional JS methods preserve lookup and invocation failures. | generated | Missing member succeeds and throwing member propagates; generated Node `generated injected clients allow an omitted disconnect hook` is the narrowest practical JS boundary. | already adequate | None. | Workspace and generated validation passed. | Optional hooks generalize or generated ownership moves. |
| `sea-webtransport/shared-correlation-lifecycle` | `ClientState` and `PendingCorrelation`; platform clients | Cancellation/reconnect can leak or admit stale IDs. | Disconnect/reconnect are explicit and operations are never automatically retried. | focused, generated, integration | Drop removes correlation; disconnect abandons and blocks until reconnect; direct correlation and reconnect tests diagnose transitions. | already adequate | None. | Workspace tests passed. | Correlation concurrency or reconnect semantics change. |
| `sea-webtransport-server/snapshot-stream-cleanup` | `serve_snapshot_stream`; publishers/coordinators | Post-registration exit could bypass revocation. | Snapshot-stream loss removes its publisher while leaving the connection available. | focused, integration, platform | Cleanup revokes the stream publisher; `malformed_snapshot_stream_releases_publisher` keeps the parent connection alive. | already adequate | None. | Workspace tests passed. | Participation becomes connection-scoped or identities multiply. |
| `sea-webtransport-server/immediate-shutdown-cleanup` | Shutdown/service cleanup; hosted sessions | Reconnect grace could delay immediate cleanup. | The server owns graceful shutdown and connection lifecycle policy. | focused | Deadline cancellation removes owned connections and services without grace; `immediate_shutdown_releases_session_without_reconnect_grace`. | already adequate | None. | Workspace tests passed. | Ownership, drain accounting, or cleanup concurrency changes. |
| `sea-counter/executable-contract` | `run_demo` and `main`; CLI users | Compilation does not prove advertised output. | The example advertises exact output `recovered counter: 4`. | focused, executable | `runs_snapshot_and_replay_demo` diagnoses `run_demo`; direct execution proves the distinct assertion/output boundary. | already adequate | None. | Workspace tests passed. | Output becomes machine-consumed or arguments appear. |

## Deferred Candidates

The six material iteration `0015` deferrals remain outside this run's declared
scope and retain their evidence and triggers unchanged:

- `sea-file/partial-io-failure-recovery`: revisit when an injectable writer,
	real I/O incident, or selected recovery redesign makes partial write/flush
	failure deterministic.
- `sea-sequencer/ambiguous-append-resolution`: revisit when a shared
	cancellation and resolution contract is selected.
- `sea-file-durable/stale-snapshot-crash-points`: revisit when consumers use the
	crash controls or API/persistence-architecture work is authorized.
- `sea-webtransport/browser-disconnect-resource-release`: revisit when a real
	browser fixture can distinguish connection close from logical-stream close.
- `sea-webtransport/injected-disconnect-failure-state`: revisit when consumers
	require defined recovery or the contract states that hook failure still
	disconnects logically.
- `sea-webtransport-server/connection-establishment-timeout`: revisit when a
	deterministic stalled-handshake fixture exists or pending handshakes exhaust
	capacity.

Lower-ranked inherited exclusions also remain unchanged: benchmark exceptional
cleanup, content-addressed retention and interrupted publication, exhaustive
sequencer envelope matrices, power-loss qualification, compression decoded-size
policy, encryption key management, and counter external-input or overflow
behavior. None of their consumer, incident, format, or harness triggers occurred.

## Coverage Layer Review

Focused tests diagnose crate-owned decisions for 31 retained rows and the one
repair. Directly instantiated conformance is the narrowest practical reusable
evidence for backend-independent storage and session laws; duplicating the same
assertions in each backend would not prove another responsibility. Generated
Node evidence remains the narrowest practical boundary for optional JavaScript
members. Integration, executable, and platform evidence is retained only for
composition, exact output, or real transport lifecycle responsibilities.

The benchmark smoke remains useful composition evidence but no longer
substitutes for local runner completion evidence. No accepted row relies on a
broad test another component can satisfy while its owning decision is broken.
The six deferred findings remain explicit semantic, fault-seam, or platform
fixture gaps rather than being credited to topical broad coverage.

## Convergence Assessment

All 33 inherited adequate rows were challenged. Thirty-two remained adequate
under precise contract and practical locality review. One unrelated
`sea-benchmarks` concurrent completion contract/locality gap was repaired with
concise runner contracts and focused two-writer storage/session evidence. This
is positive generalization outside the motivating transport/session area, but
it is not a no-change convergence run.

The run stayed within its two-cluster limit, preserved all inherited deferrals,
and added no redundant broad coverage or documentation. A further full rerun of
the same inventory has diminishing value and is not justified. The final
serial-plan engineering backstop should proceed. Any future quality run should
be triggered by a changed reviewed boundary, a concrete inventory revisit
trigger, or a newly discovered systematic blind spot rather than another
unconditional replay of these 33 rows.
