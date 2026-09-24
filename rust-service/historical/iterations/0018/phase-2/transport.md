# Iteration 0018: transport Report

Status: inspected; localized native repairs validated; user decisions implemented; browser acceptance pending
Branch: `rust-service-iteration-0018-transport`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0018-transport`
Base commit: `37fa0c0e4a119f94844837818a810ef84f9f59f8` (kickoff); approved source `73aae4414baff2e635f6ccdcbd2b4cb507d62bfd`.
Final commit: none; coordinator owns commits.
Agent or owner: transport implementation agent.
Model and tool version: unknown.
Instruction source: [transport instructions](instructions/transport.md), kickoff commit above.
Session or transcript reference: coordinator `4cc33478-17d9-40d5-9640-a53d9778b2c5`.
Started and finished: started 2026-09-24T01:01:08Z; isolated native validation completed in run starting 2026-09-24T01:49:04Z; browser acceptance remains pending.

## Outcome

Inspected both complete crate responsibility maps, including unchanged code, production adapters, manifests, existing tests, and the previously deferred admission/browser/disconnect boundaries.
No boundary-count cutoff was used.
Eight localized behavior repairs cover exact payload consumption, author receipt matching, content completion, idle content cancellation, portable snapshot-pump cancellation, abandoned browser establishment, final browser-stream ownership, and datagram admission after logical disconnection.
Added owner-local evidence for handle provenance, signal receive/terminal policy, signal datagram filtering and native admission, directory wire validation, and host signal registration.
Native validation passes: 34 client tests, 38 server-library tests, and two server-binary tests.
Two tests are explicitly ignored: the existing browser harness entrypoint and a newly retained, experimentally failing cross-incarnation author-stream reproducer.
That ignored reproducer is a user-approved deferred defect, not passing coverage.
Browser-only repairs are not accepted based on native execution; consumers owns the requested platform fixtures.

## Hypothesis Results

Confirmed before repair:
- `BrowserTransport::connect` constructs its `Drop` owner only after awaiting `ready` and datagram setup.
  Cancelling establishment drops a raw JavaScript handle without calling `WebTransport.close`.
  The fallback deadline contract requires releasing the abandoned attempt; consumers has been asked for platform evidence.
- `SnapshotPump::start` drops its snapshot stream inside the aborted future rather than invoking the portable cancellation primitive.
  Native QUIC drop behavior does not establish browser stream cancellation; the contract makes the returned coordination stream own registration lifetime.
- `AuthorStream::request_inner` accepts any author-role response rather than matching receipts to the request.
  A submission answered by `Acknowledged` is rejected only by the typed caller, after the reusable stream has already been re-enabled.
- `decode_typed_payload` used postcard's permissive `from_bytes`, despite `ProtocolError::InvalidPayload` already promising rejection of trailing bytes.
  Exact-consumption tests failed on the old decoder.
- `ResponseStream::next` accepted content EOF without `ResponseComplete`, silently treating a truncated logical response as complete.
- `serve_content_stream` waited only for the next response, retaining an idle monitored read after the peer cancelled its receive direction.
- Final `BrowserStreamState` drop had no JavaScript direction cleanup, unlike the native transport's owned handles.
  A Rust handle drop is not evidence of browser stream cancellation.
- Generic datagram send/receive skipped lifecycle admission checks even after disconnect cleared logical authority.
  The new outer-client failing-disconnect regression exposed this inconsistency with the user-approved reject-later-requests policy; both paths now check state before invoking the transport.

Rejected historical hypotheses:
- Failed QUIC admission's no-reconnect-grace argument is now directly observed by `AdmissionService::closures`.
  Both current admission tests assert `false`, so the 0017 callback-evidence deferral no longer applies.
- The physical browser connection release fixture now exists as the ignored `server::tests::browser_disconnect_and_drop_release_capacity`.
  It checks four cleanups and recovered one-slot capacity; it must still be executed by the browser harness and does not prove abandonment during `ready`.

Shared semantic question resolved by the user:
`Client::disconnect` marks logical state disconnected and clears authority even when `ClientTransport::disconnect` returns an error.
At 2026-09-24T01:46:07Z the user explicitly approved retaining that conservative logical-state policy, propagating the physical error, rejecting later requests, and requiring explicit recovery.
The owning API/guide now document it and an outer-client failed-transport regression guards the policy and datagram admission.

Additional shared findings appear under Contract and Integration Friction.

## Deliverables and Commits

No commits made.
Changes are in the two owned crates, this report, and the coordinator-authorized supplemental Rust fixture seam:
- `sea-webtransport`: `README.md`, `src/client/mod.rs`, `src/lib.rs`, `src/native.rs`, `src/protocol.rs`, `src/signals.rs`, `src/transport/browser.rs`, `src/transport/native.rs`, `examples/support/lifecycle_controls.rs`.
- `sea-webtransport-server`: `README.md`, `src/dispatch.rs`, `src/host.rs`, `src/server.rs`.
- This report supplies the inventory rows and acceptance blockers.
- Supplemental seam: `tests/webtransport-browser/transport-lifecycle.rs`, in the transport worktree only; its final diff is the four-line module inclusion, with consumers owning the shared entrypoint and coordinator reconciling that inclusion centrally.
No manifest, lockfile, JavaScript/browser harness, or global record was edited.

## Validation Evidence

Before implementation, assigned `runTask` invocation succeeded in loaded workspace `/workspaces/FluidFramework`.
No tool-search tool was exposed; `runTask` was directly available.
Run `2026-09-24T01-01-18.572Z-797752` printed the expected absolute cwd, branch, kickoff HEAD, and clean status.
Fresh records are under coordinator session `files/transport/2026-09-24T01-01-18.572Z-797752`.
The task runs, in order:

```text
cargo fmt --all -- --check
cargo test -p sea-webtransport -p sea-webtransport-server --all-targets --all-features
cargo clippy -p sea-webtransport -p sea-webtransport-server --all-targets --all-features -- -D warnings
```

It asserts execution-time cwd, branch, and kickoff HEAD, records pre-command status, stops on first failure, and checks shared Cargo/pnpm lockfiles after a passing run.
The tool output sometimes exceeded its response limit; only durable workstream result files were subsequently read.
No delegate shell or nested agent was used.
The task did not print a Rust version; actual toolchain identity beyond the repository pin is not independently recorded here.
Canonical workspace and browser gates remain coordinator-owned.

All logs below are under `/home/node/.copilot/session-state/4cc33478-17d9-40d5-9640-a53d9778b2c5/files/transport/`.
Each run directory contains `result.json` and one numbered log per attempted command.
The JSON identities and result arrays were read directly and matched the assigned cwd/branch/HEAD.
The nonempty test and Clippy logs contain named tests or compilation summaries.
Successful formatting intentionally has an empty output log; its exit code is the evidence.
No independent machine JSON parse/nonzero-size check was available through the assigned task; coordinator artifact acceptance must perform that check, allowing the intentional empty format log.

| Run | Result and interpretation |
| --- | --- |
| `2026-09-24T01-01-18.572Z-797752` | Baseline formatting, tests, and strict Clippy exit 0; initially clean checkout. |
| `2026-09-24T01-06-59.664Z-822514` | First receipt/pump repairs: formatting/tests exit 0; Clippy exit 101 for newly redundant unit-result bindings after the pump future changed to unit. Fixed by spawning the unit future directly. |
| `2026-09-24T01-08-52.966Z-832688` | Mutation/reproduction setup stopped at formatting due to test insertion inside an impl and mutation formatting. No tests ran. |
| `2026-09-24T01-09-29.509Z-835544` | Formatting-only correction required; no tests ran. |
| `2026-09-24T01-10-10.090Z-837276` | Formatting exit 0. Restored old author acceptance and omitted pump cancellation; exact new tests failed. The unmodified permissive payload decoder also failed the trailing-byte test. Three expected failures, 23 passes. Mutation edits were then restored. |
| `2026-09-24T01-10-45.867Z-840045` | Client repairs pass 26 tests. New idle-content-cancellation regression fails against the old server loop; 33 other server tests pass, one browser test ignored. |
| `2026-09-24T01-12-42.607Z-845214` | New content-EOF regression fails against the old client implementation; 27 other client tests pass. |
| `2026-09-24T01-13-53.419Z-852350` | Native datagram test formatting correction; no tests ran. |
| `2026-09-24T01-14-27.309Z-856969` | Native datagram test compile error comparing `Bytes` to an array; corrected the assertion to compare its slice. |
| `2026-09-24T01-15-17.220Z-860342` | Cross-incarnation reproducer formatting correction; no tests ran. |
| `2026-09-24T01-15-49.607Z-861555` | Local repairs and datagram evidence pass. Cross-incarnation reproducer fails: `old session 1 author stream committed under replacement 2: EventCommitted { position: 1 }`. Retained as explicitly ignored pending shared decision, not deleted or treated as a flake. |
| `2026-09-24T01-16-58.450Z-864232` | Native batch: formatting/test/strict Clippy exits 0; 32 client + 36 server-library + 2 server-binary tests pass; existing browser entrypoint and known cross-incarnation reproducer ignored. Lockfile check completes in the task's passing path. |
| `2026-09-24T01-20-48.429Z-873716` | Snapshot-dependency regression formatting correction; no tests ran. |
| `2026-09-24T01-21-01.536Z-874046` | Final native batch, including exact missing-tree/missing-event dispatch errors: all three exits 0, 32 client + 37 server-library + 2 binary tests pass; two explicit ignores unchanged. Identity/status and result JSON read directly; final lockfile check completes. |
| `2026-09-24T01-28-16.791Z-900812` | Fresh isolated target `/workspaces/.cargo-target-quality-0018-transport`, runner configured with four build jobs. Identity/target/status/result JSON read directly. Formatting, 32 client + 37 server-library + 2 binary tests, and strict Clippy all exit 0. Two explicit ignores unchanged. This supersedes shared-target uncertainty for the current ordinary native batch, not browser execution or historical mutation runs. |
| `2026-09-24T01-31-04.972Z-908104` | Newly included browser support module required formatting corrections; no tests ran. |
| `2026-09-24T01-31-17.155Z-908285` | Isolated formatting/native tests/strict Clippy all exit 0 after Rust fixture inclusion; support source is now covered by rustfmt, but native cfg still excludes wasm compilation. Identity/status/target/results read from durable JSON. |
| `2026-09-24T01-32-33.766Z-909564` | All three isolated gates exit 0 after adapting the controls to consumers' final JS names; durable identity/target/status/results read directly. Native browser example still executes zero tests, as expected. |
| `2026-09-24T01-35-00.212Z-912839` | Approved membership-position evidence batch needed one formatting correction; no tests ran. |
| `2026-09-24T01-35-19.465Z-915120` | Both new membership tests pass (33 client, 38 server-library, 2 binary); strict Clippy finds two unnecessary test-only `TreeId` clones. Removed clones. |
| `2026-09-24T01-36-14.157Z-917184` | Final isolated membership batch: formatting, 73 native tests, and strict Clippy all exit 0. The two explicit ignores remain; durable result JSON and exact new test names read directly. |
| `2026-09-24T01-47-36.750Z-928049` | Disconnect-policy regression needed one formatting correction. Assigned task UI was blank; durable JSON/log showed format exit 1, no tests run. |
| `2026-09-24T01-48-04.834Z-929825` | Test compilation found assertions requiring an unimplemented `PartialEq` on `ClientStateError`; changed the tests to pattern matches rather than altering the production type. |
| `2026-09-24T01-48-30.943Z-931938` | New outer-client regression fails at datagram send after failed disconnect: the path still invokes the transport instead of rejecting disconnected state. Durable logs preserve the failure despite blank task UI. |
| `2026-09-24T01-49-04.591Z-935621` | Final isolated batch: formatting, 74 tests, strict Clippy all exit 0 after send/receive datagram admission guards. Two explicit ignores remain. Durable JSON records correct cwd/branch/HEAD/target/status and all exits. |

Editor diagnostics report no errors in either crate.
No native timeout incident was observed or explained by these runs; the unattributed timeout issue remains open.

## Behavioral Contracts and Test Layers

### Whole-Crate Responsibility Map

| Crate/source | Consequential responsibilities inspected |
| --- | --- |
| Client `lib.rs`, `transport/mod.rs`, manifests | Feature/target separation, native connection pinning and configuration, byte-stream and datagram admission primitives. |
| Client `protocol.rs`, `protocol/signals.rs`, `websocket.rs` | All message kinds, role/direction constraints, complete-frame limits, incremental parsing, postcard payloads, signal conversions, DATA/FIN envelope. |
| Client `client/mod.rs` | Opening authority, all five logical roles, ordered exchanges, interleaved notifications, cancellation poisoning, completion markers, connection state. |
| Client `native.rs` | Shared typed session, initial-load reuse, content/history/snapshot conversion, private handles, resolution, author close, snapshot pump and registration replacement. |
| Client `signals.rs` | Initial membership, datagram/reliable selection, bounded admission/delivery, overflow, cancellation-safe receive, terminal errors, final ownership. |
| Client `transport/native.rs`, `transport/browser.rs` | QUIC primitives, current datagram size, browser ready/setup lifetime, retained promises, independent directions, final-owner release. |
| Client `transport/browser_socket.rs`, `transport/websocket.rs`, `transport/ordinary_websocket.rs` | Explicit transport modes, endpoint trust/URL policy, deadlines/fallback, group/child lifetimes, shared pending reads, FIN, concurrent operation guards, receive queue overflow and upload throttling. |
| Server `lib.rs`, `main.rs`, manifests | Public composition, optional listener feature, strict runtime options, evidence output and coordinated binary shutdown. |
| Server `server.rs`, `stream.rs` | QUIC admission/liveness/capacity, frame read/write deadlines, role dispatch, author failure barriers, idle stream release, datagram routing, metrics, drain and storage flush. |
| Server `host.rs` | Lazy factory/registry ownership, cancellation-safe workers, retry/cache rules, document intent, authorities and replacement, signal rooms, reconnect grace and host shutdown. |
| Server `dispatch.rs` | Typed archive operations, directory input conversion, dependency resolution before snapshots, author errors and snapshot leases. |
| Server `websocket.rs`, `websocket_io.rs` | Upgrade origin/subprotocol/path policy, group tokens and capacities, heartbeats, cancellation/shutdown cleanup, bounded byte adaptation and directional EOF. |

### Inventory Rows

Test names below are relative to the named owning module unless a crate is stated.
`Already adequate` applies only to the named decision, not a declaration of exhaustive future-defect coverage.
Browser rows remain blocked until consumers supplies exact platform evidence.

| Boundary | Precise contract and owning decision | Discriminating local evidence and distinct broader layer | Disposition and revisit trigger |
| --- | --- | --- | --- |
| transport/frame-bounds-and-kind-routing | [Protocol](../../../../crates/sea-webtransport/src/protocol.rs): decoder validates excessive declared length before payload reading, retains coalesced bytes, rejects unknown kinds and wrong roles/directions. | `decoder_read_sizes_stop_at_one_frame_and_validate_before_allocation`, `network_frames_handle_fragmentation_and_coalescing`, `network_decoder_rejects_declared_limit_before_payload_arrives`, `network_frames_reject_limits_and_wrong_streams`, `typed_payloads_reject_wrong_direction_and_malformed_bytes`; server fault tests additionally prove connection isolation. | Already adequate for these codec decisions. Revisit on envelope/kind additions. |
| transport/exact-payload-consumption | Existing `ProtocolError::InvalidPayload`: “malformed or has trailing bytes”; one kind-specific value consumes the declared payload. | New `typed_payloads_reject_trailing_bytes_in_both_directions` rejects both empty/nonempty request and response payloads with suffixes; failed before `take_from_bytes` repair. Existing exhaustive roundtrips preserve wire values and no-blob/varint encodings. | Repaired; no protocol version change or new valid wire shape. Revisit on codec replacement. |
| transport/event-opening-and-load | [Client lifecycle](../../../../crates/sea-webtransport/README.md#lifecycle-and-ownership): first matching load consumes opening snapshot/replay/live stream; other reads use separate streams. `Client` retains opening authority before dependent stream admission. | `shared_client_decodes_fragmented_and_coalesced_event_responses`, `shared_author_stream_binds_authority_and_orders_receipts`, `matching_load_consumes_opening_prefix_and_continues_live_without_another_stream` exercise state retention, initial snapshot/no-snapshot, references, queued progress and live continuation. Server native roundtrip separately verifies transmitted authority against a real host. | Already adequate for opening reuse/admission and initial delivery. Revisit if stream ownership or opening metadata changes. |
| transport/ordered-exchange-state | [Client architecture](../../../../crates/sea-webtransport/README.md#architecture): cancelled response waits cannot complete later requests; unsolicited coordination/signal notifications do not complete exchanges. | `author_error_or_cancelled_receipt_prevents_later_requests`, `cancelled_exchanges_cannot_consume_stale_replies`, `signal_notifications_do_not_complete_ordered_requests`, `snapshot_notifications_do_not_complete_ordered_requests`; new `mismatched_author_receipts_make_the_stream_terminal` discriminates matching author receipt validation and cancellation. Mutation accepting any author response fails. | Repaired author mismatch; other exchange guards already adequate. Revisit on reusable role/request additions. |
| transport/content-completion | Architecture: bounded content responses end in `ResponseComplete`; EOF is not that marker. | New `content_eof_requires_explicit_completion_but_event_eof_does_not` failed before repair; checks content truncation, explicit completion, event EOF, and terminal repeat behavior. | Repaired. Revisit if completion framing changes. |
| transport/typed-content-and-handle-provenance | Lifecycle: private-provenance handles confirm availability “within the resolving client”; [core session](../../../../crates/sea-core/src/session.rs) separates wire identities from availability handles. | New `snapshot_handles_from_another_client_are_rejected_before_transport_access` separately corrupts tree and event provenance, expecting local rejection rather than missing-pump/network errors. `load_rejects_unexpected_response_kind` protects delivery conversion. Server native roundtrip proves content and snapshot composition; simple exhaustive enum/field conversions do not each need duplicate unit tests. | Repaired provenance evidence; direct typed conversion mechanics inspected, with low-value pass-through tests excluded. Revisit on new handle facets or error-category changes. |
| transport/snapshot-registration-pump | Lifecycle: subscription owns registration; cancellation/drop cannot revoke a newer registration; [snapshot stream](../../../../crates/sea-webtransport/src/client/mod.rs) now explicitly cancels both directions on pump completion. | New `snapshot_pump_explicitly_cancels_transport_on_drop_or_receive_failure` records the primitive call separately from stream-handle drop; removal of cancellation fails with `RecvError`. Server `closing_old_snapshot_stream_preserves_replacement` and native roundtrip prove distinct registration/fence composition. | Portable pump repaired and locally validated. Actual browser primitive effects remain platform-gated below. |
| transport/signal-queues-and-receive | [Signal delivery](../../../../crates/sea-webtransport/README.md#signal-delivery): 64 submissions/256 events; reliable/membership overflow observable; one pending receive; cancellation does not consume an event; close wakes receives. | Existing `client_overflow_drops_only_best_effort_messages`; new `receive_cancellation_preserves_events_and_close_wakes_the_pending_receiver` and `terminal_failure_is_not_hidden_by_queued_events` directly test receiver lock, queue retention, terminal priority and close admission. | Repaired local evidence without behavior changes. Revisit on pump/queue/terminal ownership changes. |
| transport/signal-datagram-decoding | Signal delivery: one complete best-effort message per datagram; reliable/control messages remain on reliable streams. | New `signal_datagrams_require_one_complete_best_effort_message` rejects reliable messages, membership, concatenated and truncated frames while accepting exact payload/sender/target. This tests the client's filter, not server routing. | Repaired local evidence. Revisit on datagram format or allowed-kind changes. |
| transport/native-datagram-admission | [ClientTransport](../../../../crates/sea-webtransport/src/transport/mod.rs): `false` only before admission permits fallback. Native adapter compares against current negotiated maximum and never retries an admitted datagram. | New `transport::native::tests::datagrams_fall_back_before_admission_and_preserve_admitted_payloads` uses an owning-crate real QUIC pair, proves oversized false with no peer datagram, exact bidirectional admitted payloads, capability reporting, and disconnect. Server `signals_cross_native_connections_without_archive_events` adds signal/relay composition, not proof of the primitive branch by itself. | Repaired owner-local evidence. Revisit on wtransport changes or admission policy. |
| transport/browser-establishment-and-final-stream-owner | [Browser lifetime contract](../../../../crates/sea-webtransport/README.md#lifecycle-and-ownership): failed/cancelled establishment closes before fallback; final stream clone cancels both directions and releases locks. | New RAII `BrowserConnection` exists before `ready`; final `BrowserStreamState::drop` initiates both cancellations and observes promises before releasing locks. Consumers requested ready-timeout/setup-failure/success and final-clone fixtures. Native compilation does not include this code. | Implemented, browser acceptance blocked. Consumers/coordinator must build wasm32 and run discriminating fixtures. |
| sea-webtransport/browser-disconnect-resource-release | Lifecycle: explicit disconnect closes underlying WebTransport; final connection owner also closes it. | Current ignored server fixture `browser_disconnect_and_drop_release_capacity` observes four cleanups, peak one active connection, and zero final connections; consumers must execute its generated fixture. The preexisting native zero-test cdylib run proves nothing about browsers. | Historical no-fixture hypothesis rejected; fresh execution pending. Revisit on connection wrapper/lifetime changes, including this repair. |
| transport/browser-read-and-socket-selection | [Fallback contract](../../../../crates/sea-webtransport/README.md#optional-websocketstream-fallback): explicit modes, trusted endpoints, per-attempt timeout, no mid-session switch/replay, pending reads survive waiter cancellation. | Production URL, fallback, retained-promise, group/child, send/receive guard and FIN paths inspected. Consumers independently reports `sea-typescript/src/test/websocket.spec.ts`, `ordinary WebSocket compatibility bounds queues and preserves stream lifecycle`, directly drives generated transport with `TestSocket`: cancelled pending reads, concurrent receive rejection, directional FIN, premature-close failure, both count/byte queue overflow, wrong protocol cleanup, and parent-disconnect cancellation. This is ordinary-socket evidence, not streaming-WebSocket backpressure evidence. Native tests cannot execute these JavaScript paths. | Fresh generated/platform acceptance pending coordinator execution. Ready/fallback and new WebTransport RAII distinctions still require fixture additions through consumers. |
| server/connection-establishment-timeout | [Connection lifecycle](../../../../crates/sea-webtransport-server/README.md#connection-lifecycle): one deadline spans admission, pending work owns capacity, admission failure has no grace and does not stop listener. | `failed_admissions_release_capacity_and_preserve_listener` and `shutdown_cancels_pending_admission_without_reconnect_grace` now directly assert callback arguments as well as counts/capacity on real QUIC. | Already adequate; prior 0017 missing-argument deferral is superseded. Revisit on admission/cleanup refactor. |
| server/framed-io-deadlines | Server lifecycle: active framed I/O deadlines do not expire healthy idle streams; invalid first length fails before payload allocation. | Paused-time `idle_stream_outlives_operation_deadline`, `partial_frame_expires_after_operation_deadline`, `invalid_first_length_fails_without_waiting_for_more_bytes`; network `server_survives_malformed_and_abandoned_response_streams` proves distinct listener isolation. | Already adequate for server decisions. Native client deadline documentation mismatch is separately escalated, not covered by these tests. |
| server/content-read-cancellation | [Document ownership](../../../../crates/sea-webtransport-server/README.md#document-ownership): ordinary cancellation is stream-local; idle monitored reads now release without a future document event. | New `idle_content_read_releases_its_stream_when_peer_cancels` first observes real read progress, then signals peer stop and requires the serving future to return immediately. Failed against the old response-only loop. | Repaired. Revisit on response pumping/backpressure changes. |
| server/author-and-snapshot-dispatch | [Connection lifecycle](../../../../crates/sea-webtransport-server/README.md#connection-lifecycle): first author decode/validation/receive/write failure ends append authority. Document ownership: old snapshot lease cleanup cannot revoke a replacement. | `malformed_append_closes_authority_before_queued_submission` checks no later application record; `closing_old_snapshot_stream_preserves_replacement` publishes under the replacement fence after old close/drop. `server_survives_malformed_and_abandoned_response_streams` additionally checks retained committed prefixes and snapshot publication after lost acknowledgements. | Already adequate for these dispatch/lease responsibilities. Replacement of the whole event session has a separate confirmed defect below. |
| server/directory-wire-validation | [DirectoryEntry](../../../../crates/sea-webtransport/src/protocol.rs): names are one UTF-8 path segment; [dispatch](../../../../crates/sea-webtransport-server/src/dispatch.rs) rejects duplicate wire names rather than silently overwriting. | New `directory_wire_input_rejects_duplicate_and_invalid_names` distinguishes adapter duplicate/name validation from downstream missing-child rejection by expecting `Invalid`, not `Rejected`. | Repaired local evidence. Revisit on directory input schema. |
| server/snapshot-wire-dependency-resolution | [dispatch contract](../../../../crates/sea-webtransport-server/src/dispatch.rs): “Resolves both dependency identities before invoking conditional publication.” | New `snapshot_publication_rejects_unresolved_dependencies_before_publication` distinguishes missing-tree and missing-event branches by exact adapter errors while holding a valid nomination, and verifies neither publishes a snapshot. Existing lease-replacement test separately proves successful conversion/publication. | Repaired focused evidence. Revisit on wire handles, dependency resolution or publication ordering. |
| transport/committed-membership-snapshot-positions | User-approved decision 0022 preserves any committed session-event position, including `Joined`/`Left`; both transport READMEs now state this explicitly. | Client-local `remote_resolution_accepts_joined_and_left_positions` feeds each actual wire kind through the remote resolver and checks the resulting position and private client provenance. Server-local `joined_and_left_positions_are_valid_snapshot_dependencies` commits actual membership/departure events, resolves their wire positions, and publishes successive snapshots at both under valid nomination. | Approved policy documented and focused evidence added; existing production behavior preserved. Browser bindings add no distinct kind restriction here, so no new browser fixture is necessary for this policy. Revisit if resolution/publication starts filtering session-event kinds. |
| server/registry-and-worker-ownership | [Document ownership](../../../../crates/sea-webtransport-server/README.md#document-ownership): serialize initialization/recovery, cache only success, retain locks/results across cancellation, offload synchronous storage, no idle eviction. | `slow_backend_initialization_preserves_executor_progress_and_cancellation_ownership`, `slow_document_initialization_preserves_executor_progress_and_cancellation_ownership`, `backend_initialization_failure_remains_retryable`, `document_registry_retries_failed_initialization`, `document_registry_shares_concurrent_first_opens` directly gate blocking work and compare retained runtime identities. | Already adequate. Revisit on registry eviction, recovery or worker changes. |
| server/document-intent-and-host-lifecycle | Document ownership: creation allocates ID; open requires an existing ID; custom storage is backend-independent; host shutdown stops admission. | `archive_create_and_open_intent_is_explicit`, `custom_storage_uses_generic_document_and_lifecycle_dispatch`, `experimental_file_registry_shutdown_releases_cache_without_subscriber_polling`, `file_registry_recovers_checkpointed_offsets_and_departures`. Owning host policy and retained-runtime effects are distinct from file durability qualification. | Already adequate. No power-loss inference. Revisit on identity, cache or storage lifecycle policy. |
| server/event-authority-incarnation | [OpenAuthorStream](../../../../crates/sea-webtransport/src/protocol.rs): authority binds to the established logical session; server README now documents the current same-connection replacement limitation. | Existing `event_stream_returns_distinct_authority_before_recovery` covers opening checks but not already-open streams. New real-QUIC `replaced_event_authority_cannot_be_used_by_an_old_author_stream` fails: old stream commits after session 1 is replaced by 2. | User explicitly deferred redesign. Keep the ignored reproducer; reopen on session-replacement/isolation work or any dispatcher ownership redesign, and enable it when repaired. Use fresh physical connections between logical incarnations meanwhile. |
| server/signal-admission-and-lifetime | [Ephemeral signals](../../../../crates/sea-webtransport-server/README.md#ephemeral-signals): existing document, independent archive authority, one registration per connection lifetime, no reconnect grace. | New `signal_admission_requires_existing_document_and_one_registration_per_connection` rejects missing document/version before successful admission, rejects reopening after signal close, and allows a fresh connection. `signals_cross_native_connections_without_archive_events` proves distinct relay/wire composition and sender/target payloads. | Repaired focused host evidence. Revisit on registration lifetime or authorization policy. |
| server/websocket-upgrade-and-group-lifetime | [Optional listener](../../../../crates/sea-webtransport-server/README.md#optional-websocket-listener): exact Origin, required subprotocol/path, default-off loopback-only missing-Origin exception, random group token, independent stream bounds, one cleanup. | `originless_clients_require_explicit_loopback_opt_in`, `admission_checks_origins_protocol_groups_and_streams`, `accepted_sockets_disable_nagle_before_upgrade`, `owner_loss_revokes_children_and_token_and_shutdown_cleans_once` inspect owning listener policy directly. | Already adequate for these decisions. Origin/token checks are not authentication. Revisit on admission/group policy. |
| server/websocket-byte-adapter | Optional listener: bounded DATA records/one-record queue, directional FIN, premature close/malformed data is failure, independently backpressured streams. | `records_require_bounded_data_or_exact_finish` tests shared envelope. Server `finish_preserves_reverse_direction_and_cancel_notifies_writer`, `unexpected_close_is_not_clean_eof`, `stalled_stream_is_bounded_independent_and_recovers_without_losing_bytes`, `malformed_and_oversized_records_fail_without_clean_eof` discriminate the adapter itself via in-memory sockets. | Already adequate. Ordinary browser queues still need their distinct platform evidence; server bounds are not total process bounds. |
| server/shutdown-and-cli | [Server guide](../../../../crates/sea-webtransport-server/README.md): accepted work drains or reports cancellation/storage error; shared host stops only after listeners; explicit connection range and strict cache flag. | `storage_flush_timeout_and_failure_never_report_drained`, `immediate_shutdown_releases_session_without_reconnect_grace`, `concurrent_close_is_idempotent_during_reconnect_grace`, binary `connection_override_preserves_defaults_and_rejects_invalid_limits`, `activation_is_default_on_with_explicit_off_and_strict_values`. | Already adequate for guarded lifecycle/config decisions. OS process/marker and mixed-listener composition remain coordinator integration gates. |
| transport/generic-disconnect-failure | User-approved conservative policy, now in `Client::disconnect` documentation and client README: propagate physical failure after abandoning logical authority, reject later requests, require explicit recovery/fresh handshake. | New `failed_physical_disconnect_abandons_authority_and_rejects_later_requests` invokes the outer method with a failing transport, checks the exact physical error, lost authority, zero subsequent transport calls for event/content/datagram operations, and re-enabled admission only after explicit reconnect without restoring authority. It failed before the added datagram guards. | Policy documented and localized datagram bypass repaired. Revisit on lifecycle/admission/reconnect refactors. |
| transport/native-timeout-ownership | Corrected `TransportConfig::operation_timeout`, `WebTransportError::Timeout`, and both READMEs: native timeout applies independently to connection and initial event/author opening; later native frames have no client-side deadline. Server framed-I/O deadlines remain separately owned. | Current `NativeSeaClient::connect` has the three explicit timeout wrappers; existing server deadline tests prove only their server-owned decisions. No per-frame native enforcement is claimed or added. | User-approved documentation correction; native per-frame timeout design deferred. Revisit when a stalled-peer consumer requires bounded post-opening native operations or client I/O ownership changes. |

### Reviewed Exclusions

- No extra tests for each trivial field copy, enum pass-through, measurement accessor, re-export, or constant when the owning codec table, typed boundary tests and actual transport composition already establish their purpose.
- No authentication, tenant quotas, total memory bound, automatic reconnect, garbage collection, or production power-loss guarantee was added; the guides explicitly exclude these deployment semantics.
- Native tests remain the narrowest useful evidence for Rust/QUIC server admission and native primitives.
  Browser tests are required for JavaScript promises, actual API cancellation, generated ownership, and browser networking; they are not substituted by a native test count.
- Prior implementation acceptance was not used to skip source inspection.
  The generic disconnect decision, browser platform evidence and cross-incarnation binding issue remain explicit, owned revisit items.

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Tool capability | Direct assigned process-task invocation succeeded; no tool-search tool exposed. | Baseline guarded task and durable logs. | Autonomous native edit/test loops available without shell. | Used only assigned task. | Probe delegate access rather than inferring it from coordinator access. |
| Regression discrimination | Restored permissive receipt behavior and omitted pump cancellation. | Run `01-10-10.090Z-837276` fails the exact new tests. | Separates explicit cancellation from incidental native stream drop. | Mutations restored; final native tests pass. | Record primitive calls, not only handle destruction. |
| Format-only iteration | Assigned task begins with check-only formatting; repeated surgical insertions needed indentation/line-break fixes. | Runs `01-08-52`, `01-09-29`, `01-13-53`, `01-15-17`. | No product tests ran on those attempts. | Corrected via file tools; final format passes. | Register an owned formatter process task alongside validation for file-only delegates. |
| Scope reassessment | Historical admission callback gap is closed in current source; native browser cdylib still runs zero tests. | Current assertion bodies and native task output. | Avoids duplicate admission tests and false browser confidence. | Admission accepted; platform gate retained. | Historical conclusions are hypotheses, not current truth. |
| Shared defect | An old author stream commits under a replaced event-session authority. | Run `01-15-49.607Z-861555` exact failure. | Requires stream-binding or replacement-policy design, not a local assertion tweak. | User explicitly deferred repair; ignored reproducer and README limitation retained. | Validate authority at the lifetime boundary, not only during opening. |
| Cross-workstream execution lesson | Coordinator reports that persistence's full-suite wake-suppression mutation hung unrelated unbounded tests; the positively identified owned child was stopped and restored source passed fresh validation. | Coordinator message at 2026-09-24T01:23:00Z; not independently reproduced in transport. | Transport full suites were safe for its completed receipt/pump mutations, but this does not generalize to wake suppression. | No transport mutation remains. Any additional potentially hanging mutation requires a coordinator-owned filtered command and bounded timeout. | Do not run a full suite under a mutation capable of starving unrelated tests. |

## Contract and Integration Friction

1. **Confirmed cross-incarnation authority defect.**
   `HostedConnection` stores one mutable `session`; opening another event stream replaces it.
   Existing author/content/snapshot transport handlers retain that `HostedConnection`, not the session selected by their handshake.
   Therefore a previously authorized author stream can submit to the replacement session; its later `Close` can also target the replacement.
   The retained reproducer demonstrates the append case over actual QUIC.
   The user explicitly deferred repair at 2026-09-24T01:46:07Z.
   Future alternatives remain rejection of replacement until a fresh physical connection, or binding every logical stream to its admitted session/authority generation.
   Revisit on session-replacement/isolation requirements or dispatcher ownership redesign; use a fresh physical connection for a fresh logical session meanwhile.
   Run the retained reproducer explicitly with `cargo test -p sea-webtransport-server replaced_event_authority_cannot_be_used_by_an_old_author_stream -- --ignored`.
2. **Generic disconnect error-state policy: resolved and guarded.**
   User approval preserves logical abandonment on physical failure, propagation of the physical error, and explicit recovery.
   Added outer-client failed-transport evidence and repaired the datagram paths that bypassed state checks.
3. **Client deadline documentation: corrected; enforcement redesign deferred.**
   Client `TransportConfig::operation_timeout` and both READMEs now accurately describe `NativeSeaClient::connect` applying the timeout to connection/event/author opening only.
   `NativeTransport` does not retain it and its later send/read methods directly await wtransport.
   Server deadlines and liveness do not establish a native client per-operation deadline against a stalled/custom server.
   The user approved correcting the promise to actual behavior, leaving native per-frame enforcement as a separate design.
   Revisit when bounded post-opening native operations are required; do not treat server timeout tests as native-client deadline evidence.
4. **Consumers-owned platform fixtures.**
   Requested ready-timeout/setup-failure cleanup, successful connection nonpremature closure, final stream clone lifetime, snapshot lease drop without closing archive access, pending read cancellation, socket selection/subprotocol and ordinary queue overflow evidence.
   These requests do not authorize transport edits to shared `tests`/`scripts`.
   Real browser physical release, generated packages, canonical workspace checks, repository policy and `pnpm build:fast` remain coordinator gates.
   Consumers independently inspected `browser-test.mjs::runLifecycle`: retained JavaScript WebTransport objects distinguish explicit Rust disconnect from final Rust-owner drop; replacement is blocked for 150ms before release and admitted within 3s afterward, without opening logical sessions.
   Its final flow retains the snapshot notification promise through cancellation and awaits rejection; signal close resolves the pending receive with `undefined`.
   These current fixtures do not yet discriminate the new abandoned-`ready` and final-stream-Rc cleanup repairs.
   Consumers confirms the snapshot fixture closes the archive immediately after the cancellation rejection, while an earlier cancellation is followed by replacement; either can mask missing registration release.
   Required additional browser discriminator: two live archive sessions both register `SeaSelected`; first has a fence and second has none; cancel/drop only the first coordination owner; second must receive a fence while both archives remain open and the first still completes a content operation.
   Memory-only registration tests cannot establish this browser transport lifetime.
   Consumers has not reported fresh browser/generated execution.
   At 2026-09-24T01:23:20Z the coordinator authorized the bounded fixture batch.
   Transport added crate-owned `examples/support/lifecycle_controls.rs` and, under the supplemental example-seam authorization, its `cfg(wasm32)` path-module inclusion in `tests/webtransport-browser/transport-lifecycle.rs`; consumers owns the JavaScript cases, runner and fixture README.
   The seam exports `LifecycleConnectAttempt` (constructor, retained result promise, cancellation, abort-on-drop), `LifecycleConnection` (raw stream opening and disconnect), and `LifecycleStream` (clone ownership, finish, receive, cancel, generated free).
   With the existing `websocket-stream` feature, `awaitSelectedConnect(url, hash, timeoutMilliseconds)` additionally calls the production strict-WebTransport selection deadline and retains successful connection ownership.
   The coordinator froze consumers on `awaitSelectedConnect(url, hash, timeoutMilliseconds)`, `LifecycleConnectAttempt` with `result`/`cancel`, `openStream` and `cloneOwner`.
   Removed the unused `connectWithTimeout`, `openBidirectional`, `cloneStream`, `LifecycleConnection.connect`, and `lifecycleConnectWithTimeout` aliases introduced during crossed delayed messages.
   The correct included source is `examples/support/lifecycle_controls.rs`; consumers' intermediate inclusion proposal omitted `/support/`.
   During integration retain transport's correct inclusion or correct consumers' include path; both workstreams touched this small Rust entrypoint after crossed coordination messages.
   These call existing production traits; no production API or dependency change is needed.
   Before acceptance, integrate both workstreams, run formatting with the included module, compile `browser_lifecycle` for `wasm32-unknown-unknown` with `websocket-stream`, regenerate its wasm-bindgen browser output, and execute the shared browser harness and server ignored entrypoint through canonical `test.sh`.
   The new support file is included and formatting-checked in the transport checkout; native cfg and editor diagnostics do not establish wasm compilation.
5. **Membership-position interpretation: resolved.**
   User approval at 2026-09-24T01:33:58Z explicitly permits any committed session-event position, including `Joined`/`Left`; coordinator owns accepted decision 0022 and foundations owns core wording.
   Sessions confirmed local resolution forwards storage resolution unfiltered and snapshot publication accepts the same storage handles; remote behavior is consistent.
   Added exact client-resolver and server-publication tests above, without introducing application-only filtering.
   Sessions also confirms cached `AwaitingNewItems` is emitted only at the delivered/discovered frontier, while the uncached path forwards conforming source progress; this supports remote `resolve_position` stopping on that explicit stream item.

## Human Interventions

The coordinator authorized coordinated, test-only browser controls and consumers-owned harness repairs at 2026-09-24T01:23:20Z.
This resolves fixture dispatch ownership, not the unrelated production semantic choices.
The user subsequently resolved committed snapshot positions at 2026-09-24T01:33:58Z; existing membership-inclusive behavior is preserved and now locally guarded on both sides of the wire.
At 2026-09-24T01:46:07Z the user deferred cross-incarnation dispatcher redesign, approved conservative logical disconnect failure, approved native timeout documentation correction with later enforcement deferred, and froze browser fixture names.
The user's approved full-scope reassessment and file ownership constraints were preserved.

## Measurements

No performance, binary-size, or dependency campaign requested or performed.
No dependencies changed.
Observed native test totals and timestamps are above; elapsed human effort, token usage, and model version are unknown.
The shared build-directory lock appeared in task logs; no foreign cwd/output was observed.
Sessions subsequently reported surprising cross-worktree results under shared `/workspaces/.cargo-target` and requested isolated target directories before acceptance.
Transport's own added test names, expected failures and owning-crate compilation paths are present in retained output, but that does not independently establish every dependency artifact's provenance.
Coordinator integration validation must use an isolated target directory or otherwise prove exact rebuilt dependency inputs; the absence of foreign log text is not that proof.
After coordinator clearance and runner reconfiguration, run `2026-09-24T01-28-16.791Z-900812` rebuilt and passed in the dedicated transport target.
No current native failure emerged from isolation.
The browser-only support seam is included and awaits the integrated wasm/browser gate.

## Proposed Decisions

The user resolved these questions; coordinator owns decision records 0023–0025 and integrated Known Issues entries.
Transport has implemented the approved policy/docs/tests and retained the explicitly deferred defect reproducer.
No decision record written here because global/shared records are outside this workstream's writable paths.

## Candidate Skills and Process Changes

Provide each command-restricted implementation delegate a registered formatter task in addition to test/check tasks.
The repeated check-only formatting loops above demonstrate the need; they do not justify granting shared foreground shell access.
Keep platform-specific cleanup proofs separate from generic tests that only prove invocation of a cancellation primitive.

## Remaining Work and Risks

All assigned production responsibility areas were inspected; platform-evidence acceptance remains pending, not a hidden review cutoff.
The ordinary native tests and strict Clippy pass after localized repairs.
The explicitly ignored cross-incarnation reproducer remains an intentional user-approved deferred artifact; do not report the whole crate defect-free or the defect repaired.
Consumers must supply and execute browser-only evidence, and the coordinator must compile the changed wasm32 code before acceptance.
Coordinator must run canonical workspace/documentation/policy/build/generated-consumer gates and independently validate durable evidence files.
No commits were made and the worktree intentionally contains only the enumerated deliverables.
