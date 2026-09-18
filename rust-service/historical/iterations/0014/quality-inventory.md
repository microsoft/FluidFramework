# Iteration 0014 Rust Quality Inventory

Status: complete
Source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Configured scope: All 14 Rust workspace packages, partitioned by crate in [the charter](charter.md).
Inherited inventory: Iteration `0013` workstream reports and Phase 3 synthesis; no prior quality-inventory file exists.
Budget and stopping conditions: At most two unrelated repair clusters per crate, with risk reranking and the materiality, ownership, and proportionality stops in [the charter](charter.md).

## Selection Rationale

Every Rust package receives one independent workstream because the run is
testing whether the reusable risk method can improve on a prior workspace-wide
audit without seeded findings. Within each crate, agents prioritize actual
consumer reliance, lifecycle and failure semantics, persistence or protocol
boundaries, state transitions, shared implementations, complexity, recent
change evidence, and weakness of existing focused tests. They compare selected
boundaries with iteration `0013` evidence before changing code. Non-Rust work,
format redesign, broad API changes, and volume-based documentation or testing
rank below these behavioral boundaries and are deferred by the charter.

## Reviewed Boundaries

Use stable identifiers where practical. Test layers are `focused`,
`conformance`, `integration`, `generated`, and `platform`.

| Boundary | Owner, contract, and risk | Layers | Disposition | Direct evidence | Revisit trigger |
| --- | --- | --- | --- | --- | --- |
| `sea-benchmarks/finite-read-integrity` | Benchmark result consumers require exact fixture multiplicity; XOR could accept repeated wrong payloads. | focused, integration | repaired | [Report](phase-2/sea-benchmarks.md); `payload_verification_rejects_duplicate_wrong_payloads`; smoke | Payload validation becomes a measured bottleneck or streaming verification is introduced. |
| `sea-benchmarks/file-recovery-without-snapshots` | The file runner accepts disabled snapshots and must reopen and verify records without requiring snapshot state. | focused, integration | repaired | [Report](phase-2/sea-benchmarks.md); `file_backend_recovers_without_snapshots` | Recovery semantics or snapshot defaults change. |
| `sea-benchmarks/concurrent-writer-completion` | Result consumers require every writer and operation to finish, one latency per record, and verified finite reads before output. | focused, integration | already adequate | [Report](phase-2/sea-benchmarks.md); two-writer smoke and exact payload test | Writer scheduling, cancellation, or result streaming changes. |
| `sea-conformance/session-monitored-progress-accessor` | All session implementations expose synchronous monitored progress consistent with initial state, progress items, and yielded data. | focused, conformance, integration, generated, platform | repaired | [Report](phase-2/sea-conformance.md); `local_session_matches_observable_behavior` | A new monitored-stream implementation or mapping layer bypasses the suite. |
| `sea-conformance/session-fallen-behind-recovery` | Implementations must report and recover from lag, but each implementation owns its threshold. | focused, conformance | already adequate | [Report](phase-2/sea-conformance.md); `configured_event_lag_reports_fallen_behind_and_recovers` | Another implementation exposes configurable lag or lacks owning-crate recovery evidence. |
| `sea-conformance/storage-fresh-state-and-atomic-load` | Storage implementations share fresh-state, finite-read, snapshot-selection, and captured-tail laws. | focused, conformance | already adequate | [Report](phase-2/sea-conformance.md); `storage_starts_empty`; `assert_captured_load` | Storage semantics change, a backend is added, or local persistence evidence exposes a shared-law omission. |
| `sea-content-addressed/publication-integrity` | Immutable publication may reuse an object only when existing bytes match. | focused | already adequate | [Report](phase-2/sea-content-addressed.md); `publication_verifies_existing_content` | Publication primitives or durability ordering change. |
| `sea-content-addressed/bounded-verified-reads` | Untrusted stored blobs must respect configured read limits and match their requested identity. | focused | repaired | [Report](phase-2/sea-content-addressed.md); `rejects_blob_bounds_and_corruption` | Read strategy, limit semantics, or error taxonomy changes. |
| `sea-content-addressed/directory-identity` | A decoded canonical directory must match the requested digest, not merely parse successfully. | focused | repaired | [Report](phase-2/sea-content-addressed.md); `rejects_directory_identity_mismatch` | Directory encoding or identity derivation changes. |
| `sea-core/monitored-stream-map-progress` | Decorators rely on source-relative progress; transformation failure cannot rewind an item already delivered by the source. | focused, conformance | repaired | [Report](phase-2/sea-core.md); `mapped_progress_preserves_source_delivery_after_transformation_error` | Mapping gains retry, filtering, or replacement semantics. |
| `sea-core/error-classification-contract` | Storage, decorator, sequencer, and transport callers rely on stable categories while implementations own detailed mappings. | focused, conformance, integration | already adequate | [Report](phase-2/sea-core.md); implementation mapping tests and storage conformance | A category, retry decision, or protocol representation changes. |
| `sea-core/caller-value-invariants` | IDs and event positions cross storage and transport boundaries and must remain nonempty, preserved, and canonically ordered. | focused, conformance, integration | already adequate | [Report](phase-2/sea-core.md); `identity_tests`; `event_tests` | Parsing, limits, canonicalization, or position representation changes. |
| `sea-file/validation-rejection-journal-atomicity` | Rejected directory, event, and snapshot operations must append no journal record and leave recovery state unchanged. | focused, conformance | repaired | [Report](phase-2/sea-file.md); `rejected_operations_leave_the_archive_unchanged_and_reopenable` | Validation and journal-write ordering changes. |
| `sea-file/clean-reopen-and-strict-corruption` | File consumers require clean reopen and strict rejection of incomplete or invalid framing. | focused, conformance | already adequate | [Report](phase-2/sea-file.md); successful reopen and malformed-framing tests | Record encoding, parser, or recovery policy changes. |
| `sea-file/partial-io-failure-recovery` | A write or flush failure may be partial; no stronger recovery promise exists and deterministic injection needs a writer seam. | none focused | deferred | [Report](phase-2/sea-file.md); write/flush/state ordering review | A writer abstraction is introduced, a real I/O incident occurs, or recovery policy is redesigned. |
| `sea-sequencer/snapshot-coordination-latest` | Local and transported publishers require every accepted snapshot path to refresh active latest-value coordination streams. | focused, conformance, integration, platform | repaired | [Report](phase-2/sea-sequencer.md); `direct_snapshot_publication_updates_coordination_streams` | Publication paths or coordination ownership change. |
| `sea-sequencer/monitored-load-progress` | Archive consumers require selected snapshots to initialize the cursor for subsequent ordered delivery. | focused, conformance, platform | already adequate | [Report](phase-2/sea-sequencer.md); snapshot-load conformance and lag-recovery tests | Cursor, progress, or buffering semantics change. |
| `sea-sequencer/session-replay-and-lifecycle` | Reconnecting authors rely on ordering, stable retry identity, replacement, close, and deterministic recovery. | focused, conformance | already adequate | [Report](phase-2/sea-sequencer.md); recovery, retry, replacement, close, and lag tests | Replay, identity, replacement, close, or recovery state transitions change. |
| `sea-sequencer/ambiguous-append-resolution` | Cancellation during backend append can leave an outcome callers cannot classify without a shared recovery contract. | focused, conformance | deferred | [Report](phase-2/sea-sequencer.md); existing retry and recovery tests define only settled outcomes | A shared ambiguous-append cancellation and resolution contract is selected. |
| `sea-memory/read-range` | The in-memory backend must implement the shared `(after, through]` range exactly. | focused, conformance | repaired | [Report](phase-2/sea-memory.md); `read_includes_through_and_excludes_later_events` | Position representation or range semantics change. |
| `sea-memory/snapshot-rejection-atomicity` | Failed snapshot validation must not retain history or bind an operation identity. | focused, conformance | repaired | [Report](phase-2/sea-memory.md); `rejected_snapshot_does_not_bind_operation_identity` | Validation ordering or operation-index storage changes. |
| `sea-memory/load-capture` | Concurrent consumers require one atomic snapshot, head, and finite-tail capture. | focused, conformance | already adequate | [Report](phase-2/sea-memory.md); `assert_captured_load` and mutex-scoped implementation | Load locking or stream materialization changes. |
| `sea-memory/append-tree-atomicity` | Event-tree closure must validate before append state mutates. | focused, conformance | already adequate | [Report](phase-2/sea-memory.md); `reject_missing_event_tree`; `append_accepts_nested_blob_tree` | Tree validation or append mutation ordering changes. |
| `sea-memory/reader-cancellation` | Dropping one finite reader must not affect another or retain shared mutable state. | conformance | already adequate | [Report](phase-2/sea-memory.md); `storage_readers_are_independent_and_cancellable` | Reads become live or borrow shared mutable state. |
| `sea-file-durable/append-crash-recovery` | Process interruption must discard incomplete frames while synced, unacknowledged appends remain recoverable but ambiguous. | focused, conformance | repaired | [Report](phase-2/sea-file-durable.md); `crash_recovery_distinguishes_incomplete_and_synced_appends` | A power-loss harness appears or append persistence changes. |
| `sea-file-durable/snapshot-ambiguity-resolution` | A synced unacknowledged snapshot must reopen and resolve by stable operation identity. | focused, conformance | repaired | [Report](phase-2/sea-file-durable.md); `reopen_resolves_snapshot_after_post_sync_ambiguity` | Snapshot journaling or operation-ID semantics change. |
| `sea-file-durable/stale-snapshot-crash-points` | Nine public fault-injection variants advertise retired snapshot-file boundaries and have no call sites. | none | deferred | [Report](phase-2/sea-file-durable.md); complete `CrashPoint`-to-call-site audit | A consumer uses them, the API changes, or persistence architecture work is authorized. |
| `sea-compression/frame-transform-and-malformed-input` | Each payload is one complete zlib frame; malformed, truncated, and extended data is corrupt, with no local decoded-size bound. | focused, conformance | already adequate | [Report](phase-2/sea-compression.md); malformed, truncation, trailing-byte, empty, and round-trip tests | Codec, format, decode strategy, or decoded-size policy changes. |
| `sea-compression/wrapper-transparency-and-errors` | Only payloads transform; metadata, progress, recovery, close, and underlying classifications pass through. | focused, conformance, integration | already adequate | [Report](phase-2/sea-compression.md); `passes_session_conformance` | Wrapped responsibilities, mapper behavior, or error conversion changes. |
| `sea-compression/reopen-and-stream-lifecycle` | Lazy synchronous mapping adds no background task or buffer; persistence and cancellation remain lower-layer responsibilities. | conformance, integration | already adequate | [Report](phase-2/sea-compression.md); `verify_reopened_session`; monitored-stream conformance | Async work, buffering, shared state, reconnect logic, or a reopen regression appears. |
| `sea-encryption/operation-replay-nonce` | Exact and conflicting retries must resolve before encryption so only a new write requests a nonce. | focused, conformance | repaired | [Report](phase-2/sea-encryption.md); `operation_retries_do_not_request_another_nonce` | Submit ordering, nonce invocation, or operation resolution changes. |
| `sea-encryption/envelope-validation` | Untrusted envelopes require authentication, format, context, truncation, and historical-key validation. | focused, conformance | already adequate | [Report](phase-2/sea-encryption.md); all 12 package tests | Parser, encoded format, context, or key resolution changes. |
| `sea-encryption/error-classification` | Local and wrapped errors must retain documented unavailable, conflict, corrupt, and underlying categories. | focused, conformance | already adequate | [Report](phase-2/sea-encryption.md); category assertions and direct delegation | Error variants, mappings, or wrapped conversion changes. |
| `sea-stateful-compression/malformed-event-replay` | Malformed stored events must be corrupt through `read` and `load`, never leak encoded bytes, and not poison a fresh independent replay. | focused, conformance, integration | repaired | [Report](phase-2/sea-stateful-compression.md); `corrupt_events_do_not_prevent_fresh_replay` | Decoding becomes history-dependent, buffered, or recoverable within one stream. |
| `sea-stateful-compression/frame-and-bound-validation` | Frames require hard dictionary and decoded bounds, exact length, version, and fingerprint checks. | focused | already adequate | [Report](phase-2/sea-stateful-compression.md); frame, metadata, dictionary, and bound tests | Frame version, dictionary, bound, or decoder reachability changes. |
| `sea-stateful-compression/pass-through-state-and-errors` | Ordering, progress, recovery, snapshots, lifecycle, and store classifications remain wrapped-service state. | conformance, integration | already adequate | [Report](phase-2/sea-stateful-compression.md); `passes_session_conformance` | Wrapper state, buffering, retry, cancellation, or transformed metadata is added. |
| `sea-webtransport/injected-optional-disconnect` | The generated JavaScript contract makes `disconnect` optional; omission must succeed and a present hook's failure must propagate. | generated | repaired | [Report](phase-2/sea-webtransport.md); generated Node `generated injected clients allow an omitted disconnect hook` | Optional hooks are generalized or generated runtime ownership moves. |
| `sea-webtransport/shared-correlation-lifecycle` | Native and WASM clients must complete or abandon pending IDs and block requests after disconnect until explicit reconnect. | focused, generated, integration | already adequate | [Report](phase-2/sea-webtransport.md); correlation, disconnect, and reconnect tests | Correlation concurrency or reconnect semantics change. |
| `sea-webtransport/protocol-validation` | Client and server must reject malformed, oversized, wrong-role, and invalid-correlation frames before typed use. | focused, integration, platform | already adequate | [Report](phase-2/sea-webtransport.md); protocol unit tests and transport suites | Protocol version, framing, message kinds, roles, or limits change. |
| `sea-webtransport/browser-disconnect-resource-release` | Browser clients promise disconnect, but the browser transport close boundary lacks a real-browser resource-release assertion. | platform | deferred | [Report](phase-2/sea-webtransport.md); current no-op `BrowserTransport::disconnect` review | A focused browser fixture can distinguish client close from stream close and observe connection release. |
| `sea-webtransport-server/snapshot-stream-cleanup` | Every acknowledged snapshot logical-stream exit must promptly revoke that publisher even while the connection remains alive. | focused, integration, platform | repaired | [Report](phase-2/sea-webtransport-server.md); `malformed_snapshot_stream_releases_publisher` | Participation becomes connection-scoped or multiple stream identities are introduced. |
| `sea-webtransport-server/immediate-shutdown-cleanup` | Shutdown must cancel owned connections and bypass reconnect grace while cleaning hosted services. | focused | already adequate | [Report](phase-2/sea-webtransport-server.md); `immediate_shutdown_releases_session_without_reconnect_grace` | Connection ownership, drain accounting, or cleanup concurrency changes. |
| `sea-webtransport-server/malformed-stream-isolation` | A malformed logical stream must fail locally while the listener and unrelated connections remain usable. | focused, integration, platform | already adequate | [Report](phase-2/sea-webtransport-server.md); `server_survives_malformed_and_abandoned_response_streams` | Stream failures begin propagating to connection tasks or endpoint acceptance. |
| `sea-webtransport-server/connection-establishment-timeout` | Pending unauthenticated handshakes count against the cap, but `incoming.await` is not bounded by the documented operation timeout. | none focused | deferred | [Report](phase-2/sea-webtransport-server.md); accept-future source audit | A deterministic stalled-handshake fixture exists or pending handshakes exhaust the configured cap. |
| `sea-counter/snapshot-tail-recovery` | The example must apply an initial or later snapshot before its ordered tail and stop after backlog catch-up. | focused, executable | already adequate | [Report](phase-2/sea-counter.md); `recovers_from_initial_snapshot`; `runs_snapshot_and_replay_demo` | The example becomes persistent, remote, live, or multi-writer. |
| `sea-counter/fixed-width-payloads` | Snapshot and delta payloads are signed eight-byte big-endian values; other lengths return a diagnostic error. | focused | already adequate | [Report](phase-2/sea-counter.md); `rejects_malformed_delta` and shared decoder | Snapshot and event encodings diverge or gain branch-specific behavior. |
| `sea-counter/executable-contract` | Command-line users rely on the demonstration asserting and printing `recovered counter: 4`. | focused, executable | already adequate | [Report](phase-2/sea-counter.md); `cargo run -p sea-counter` and demo test | Output becomes machine-consumed or CLI arguments are introduced. |

## Deferred Candidates

The table retains the five material unresolved boundaries: partial file I/O,
ambiguous sequencer append outcomes, stale durable crash points, browser
disconnect resource release, and server connection-establishment timeout.
Their triggers require a fault seam, shared semantic decision, API or
architecture authorization, or a deterministic platform fixture rather than
another same-scope audit.

Additional lower-ranked candidates were intentionally excluded rather than
treated as missing guarantees:

- `sea-benchmarks` exceptional-failure temporary-directory cleanup should be
	revisited after repeated disk accumulation or a workload lifecycle change.
- `sea-content-addressed` interrupted publication cleanup and acknowledgement
	classification should be revisited for multi-process writers or when callers
	require retry classification. Recursive closure, retention, collection, and
	authorization remain unsupported until a concrete consumer requires them.
- `sea-sequencer` exhaustive malformed-envelope tests should be reconsidered
	after a format change or corruption incident.
- `sea-file-durable` process-interruption tests do not prove power-loss or
	filesystem-failure durability. Revisit when such a harness is available.
- `sea-compression` intentionally has no decoded-size bound; revisit only when
	the shared threat model assigns that responsibility to the wrapper.
- `sea-encryption` key storage, rotation, uniqueness, and replay policy remain
	design responsibilities outside this audit. Revisit on policy or format
	change.
- `sea-counter` intentionally assumes constructed local storage and bounded
	arithmetic. Revisit its error model when it accepts external input or
	arbitrary deltas.

## Coverage Layer Review

Focused tests now diagnose crate-owned indexing, mutation ordering, corruption,
recovery, transformation, and lifecycle decisions. Shared conformance tests
remain limited to implementation-independent storage and session laws.
Integration and executable checks prove reopened compositions, server/client
protocol behavior, and example output. Generated Node coverage is the narrowest
practical evidence for JavaScript adapter optionality, while browser coverage
owns real browser and WebTransport lifecycle behavior.

No accepted repair relies only on broad coverage. Existing overlap is retained
where the layers observe different responsibilities, such as file journal
recovery versus live-state storage atomicity, wrapper transforms versus shared
session laws, and server publisher cleanup versus transport composition. The
only material broad/platform-only gap is browser connection resource release,
which remains deferred with a fixture-based trigger.

## Convergence Assessment

Iteration `0013` evidence prevented repeated work across every package and
supported many already-adequate dispositions. Iteration `0014` nevertheless
found material gaps at recently changed monitored-stream, snapshot,
generated-adapter, persistence, verification, and server-lifecycle boundaries.
The accepted changes are narrow contract or regression repairs, with no format,
dependency, or broad API churn. Independent review found no scope or churn
defect.

The run reached its per-crate budget and proportionality stops. Another audit
with the same scope and evidence is not justified. A later run should begin
only after a listed trigger occurs; its hypothesis should target the newly
enabled fault, platform, or shared-resolution boundary rather than repeat the
adequate inventory.
