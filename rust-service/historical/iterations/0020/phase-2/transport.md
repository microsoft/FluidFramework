# Iteration 0020: transport Report

Status: full incremental audit complete; source frozen for integrated validation and independent review
Branch: `rust-service-iteration-0020-transport`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0020-transport`
Base commit: `b06b46be6b88723ea64f4ef1a77a5895781c21bc` (actual kickoff; incremental comparison `8bd1e64ebfa`)
Final commit: None; coordinator owns validation and commits of the frozen workstream patch.
Agent or owner: transport agent
Model and tool version: Model unknown; guarded probe reports Rust 1.98.1.
Instruction source: [transport instructions](instructions/transport.md) at kickoff `b06b46be6b88723ea64f4ef1a77a5895781c21bc`
Session or transcript reference: coordinator session `181f92e1-5a08-499a-a256-9487a2adb7ff`
Started and finished: Started 2026-09-29T19:02:47Z; finished 2026-09-29, exact finish time unknown.

## Outcome

Reviewed both assigned crates against the complete incremental comparison since `8bd1e64ebfa`, including the 0018 authority-incarnation and native-deadline deferrals.
The review covers typed hosting and composition, policy admission and pressure, pipelined receipts, protocol adaptation, scheduling, deadlines, client factories, configuration, and the changed browser helper/test organization.
No fixed boundary sample or time cutoff was used.

Confirmed one implementation defect: a failed cancellation can replace a mutating timeout and incorrectly lose its ambiguous classification.
The proposed fix and its new public error variants were experimentally validated, then explicitly deferred by the user on 2026-09-29.
The fix, helper, tests and associated client documentation are removed from the accepted patch; the defect remains present.
Added focused host lifecycle, concrete policy accounting, exact-threshold, and remote factory evidence; corrected stale sequential-author documentation.
Final affected-crate checks pass.
The original unrelated durable-file connection timeout remains unattributed and open.
Integrated workspace, generated/browser, documentation/policy gates and fresh independent review remain coordinator responsibilities; this report does not claim those gates passed.

## Hypothesis Results

Initial hypothesis: changed typed hosting, pipelined receipts, configuration, and lifecycle decisions may lack precise contracts or focused discriminating evidence.
Audit all changed consequential boundaries in both assigned crates, plus applicable inherited deferrals; no fixed sampling cutoff.

First confirmed gaps (2026-09-29):
- The server scheduling guide still said author requests were sequential, contradicting its bounded-admission contract and the production `FuturesOrdered` pipeline.
  Corrected only that stale sentence.
- `DocumentHost::flush` promises no initialization of unused storage; existing lifecycle tests initialized storage before flushing.
  Added `unused_lifecycle_operations_do_not_initialize_storage` with an initializer counter and closed-host admission checks.
- Concrete policy byte-admission tests exercised only `WriteRequest::Blob`.
  Added `every_write_kind_reserves_its_logical_bytes_before_source_admission` to isolate submit/directory charges, byte refusal, and permit reclamation without a source backend masking the decision.
  The existing output-pressure test now checks that equality at the entry target remains admissible before exceeding it.
- Rejected a possible complete-frame/pending-byte mismatch: `NetworkFrame::encoded_len` and the decoder both include the four-byte length prefix in the same configured bound.
  No implementation change is needed.
- Remote factory forwarding and independent connection lifetime had broad composition evidence but no focused owning-crate test.
  Added `factory::tests::opens_forward_document_and_reference_on_independent_connections` against a scripted QUIC peer that has no storage, sequencer, or document host to mask incorrect factory choices.

## Deliverables and Commits

The uncommitted patch is frozen against kickoff `b06b46be6b88723ea64f4ef1a77a5895781c21bc`.
Only these tracked paths are changed:

- `crates/sea-webtransport/src/factory.rs`
- `crates/sea-webtransport-server/README.md`
- `crates/sea-webtransport-server/src/host/tests.rs`
- `crates/sea-webtransport-server/src/resource_policy.rs`
- This workstream report.

There are no new tracked files, dependency changes, lockfile changes, commits, pushes, shared-guide edits, or nested agents.
The coordinator must capture the exact binary diff and checksum at handoff and map that frozen snapshot to accepted integration commits.
No worker-shell or Git write authority was assigned.
Generated Cargo outputs and fixture directories remain under the ignored worktree `rust-service/target`; they are not deliverables.
The final five-path patch contains only tests and documentation, with no production behavior or public API change.
The coordinator preserved the original ten-path proposal, including the deferred fix and reproduction, at `/home/node/.copilot/session-state/181f92e1-5a08-499a-a256-9487a2adb7ff/files/transport-frozen.patch`.
Its coordinator-supplied SHA256 is `97c5cf4a2df86c9f768631d7c3d3b16844be57a5ed81a67f5e4b19e8e1f45c72`.
That identity describes historical experimental evidence, not the revised accepted patch.
The revised patch requires a separate capture/checksum.

## Validation Evidence

Initial guarded task `sea-0020-transport-probe` passed.
Its output confirms the absolute worktree, expected branch, kickoff HEAD, clean initial status, and Rust 1.98.1.
Evidence directory: `/home/node/.copilot/session-state/181f92e1-5a08-499a-a256-9487a2adb7ff/files/2026-09-29T19-02-58.287Z-transport-probe-a6afdefe-976c-4eb4-93d4-b5acf0a42b08/`.
`incremental.patch` retains the exact assigned-crate comparison.
Planned checks: assigned crate-scoped format and check tasks after repair batches; coordinator owns integrated native, generated, and browser gates.

First formatter task passed, evidence `2026-09-29T19-08-39.168Z-transport-format-d3e55a95-a166-4ea5-a54d-0dd43fac4569/output.log` under the coordinator evidence root.
Check execution was initially paused pending a safe `TMPDIR` override in the guarded runner: existing tests use `std::env::temp_dir`, while this workstream may not perform file operations in `/tmp`.
The worker cannot edit shared task configuration or the external runner.
Coordinator command, after setting a worktree-owned fixture directory: run `sea-0020-transport-format`, then `sea-0020-transport-check`.
Focused selectors in `sea-webtransport-server`: `unused_lifecycle_operations_do_not_initialize_storage`, `every_write_kind_reserves_its_logical_bytes_before_source_admission`, and `output_pressure_refuses_admission_then_sheds_without_slow_reader_polling`.

The coordinator corrected the runner to create `rust-service/target/quality-fixtures` and set command-local `TMPDIR`.
The first full check now completed with an attributable failure:
`2026-09-29T19-10-53.930Z-transport-check-4686b16d-3548-499b-a6aa-e2cdf6fc0462/output.log`.
Formatting and strict all-target/all-feature Clippy passed; 48 client tests passed.
Server tests: 62 passed, one browser fixture ignored, one failed.
The existing `protocol::host::tests::native_client_round_trip_in_every_storage_mode` failed at `host.rs:1503` in durable-file connection opening after 5.008122613 seconds with `Transport(Timeout)`.
Measurements: wire bytes 9, active/peak connections 1, peak streams 1, cleanup 0, pending author requests/bytes 0.
This is preserved as an unattributed native connection failure, not assigned to the new tests or dismissed as overload.
Rustdoc and remaining test targets did not execute after exit 101.
All three newly added/strengthened server tests passed in that run.

Additional confirmed source-level discrepancy: `FramedStream::cancel_on_error` replaces an initiating timeout with a custom transport's cleanup error.
`AuthorStream::request` and `SnapshotStream::request` then cannot convert it to `AmbiguousTimeout`, contradicting the documented append/membership/publication timeout promise.
Added `cleanup_failure_does_not_hide_mutating_timeout_ambiguity`.
The coordinator's exact focused run executed one test and failed with `Err(Transport(Transport("injected cleanup failure")))` (exit 101, 48 filtered).
The retained red log is `2026-09-29T19-14-09.934Z-transport-timeout-regression-3d01f726-221f-48f0-a938-6fcb99f75308/output.log`.
The experimental repair retained both failures in explicit `Cleanup` errors and based recovery classification on the initiating operation.
Append, membership, and snapshot publication converted the retained timeout to ambiguous; cleanup details remained available in typed fields, display, and the initiating error source.
The exact focused test passed after repair: one passed, 48 filtered, exit 0, in `2026-09-29T19-15-52.381Z-transport-timeout-regression-2e438044-c744-484e-9972-537f39f6c9f0/output.log`.
Added a nonmutating content-timeout control to ensure cleanup failure does not manufacture ambiguity.
These tests and the experimental repair are now removed by the user's decision to defer the public API change and the bug fix together.
Their original red/green results remain evidence of the finding, not acceptance of the proposed representation.
Revisit when the user approves an error representation/API; the coordinator owns the known-issue and decision record.

Evidence correction: an earlier handoff mistyped the full-check run UUID as `499a`; the actual directory component is `499b`.
The corrected file was directly reread and contains:
```text
durable-file connection failed after 5.008122613s: Transport(Timeout);
server: TransportMeasurement { wire_bytes: 9, active_connections: 1,
peak_active_connections: 1, peak_active_streams: 1, connection_cleanups: 0,
peak_pending_author_requests: 0, peak_pending_author_bytes: 0 }
test result: FAILED. 62 passed; 1 failed; 1 ignored; 0 measured;
0 filtered out; finished in 42.64s
EXIT 101; SIGNAL null
```

### Historical proposed-patch checks

Passing run before the user's deferral:
`2026-09-29T19-17-59.568Z-transport-check-99c11425-ded0-4ca8-973f-0a1467bcc5c4/output.log`, under the evidence root given above.
Its first lines re-establish the absolute checkout, expected branch, kickoff HEAD, and the ten owned modified paths.
Each command exited zero:

```text
cargo fmt -p sea-webtransport -p sea-webtransport-server -- --check
cargo clippy -p sea-webtransport -p sea-webtransport-server --all-targets --all-features -- -D warnings
cargo test -p sea-webtransport -p sea-webtransport-server --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-webtransport -p sea-webtransport-server --all-features --no-deps
git diff --exit-code -- Cargo.lock ../pnpm-lock.yaml
```

Historical proposed-patch test results: 51 client unit tests; 63 server unit tests with one deliberately ignored real-browser fixture; six executable configuration tests; one typed-host integration test; three policy-injection integration tests; three server doctests.
The client doctest target contains zero tests; it is not browser evidence.
An optional editor `problems` request returned no response; no editor-diagnostic result is claimed.
The completed guarded Clippy/test/rustdoc logs, not that request, establish compiled validation.
The formerly failing native storage-mode round-trip passed in this run, but that does not attribute or close its original failure.
No liveness mutation was run.
The deterministic cleanup regression has an actual red/green assertion failure, not a timeout-only negative control.
Retained evidence is nonempty text, inspected directly; no JSON measurements are claimed.

The factory-test edit briefly placed a test module inside its implementation block.
Formatter run `2026-09-29T19-17-25.934Z-transport-format-f26a23f9-b8f7-4f52-876e-2922fa279d79` failed parsing, before compilation or tests.
The brace placement was corrected, and formatter run `2026-09-29T19-17-52.975Z-transport-format-cd392a43-f2d2-49e4-8115-1db5b08e7d2a` and the final check passed.

### Final accepted-patch checks after user deferral

Removed only the proposed hunks from client `mod.rs`, `framed.rs`, `deadline_tests.rs`, `native.rs`, and the client README using `apply_patch`.
The new guarded status contains only the five retained paths listed above, confirming those five reverted files match kickoff.
A source search finds none of the proposed `Cleanup`, `ambiguous_timeout`, `fail_cancel`, or `cleanup_failure` symbols.
No removed exact regression selector was run.

Formatter passed: `2026-09-29T20-06-02.693Z-transport-format-093f205a-7aad-4f3c-a3c6-a5ceb67e58b0/output.log`.
Complete affected-crate check passed: `2026-09-29T20-06-07.128Z-transport-check-1917f03d-37fa-403d-8ba5-1abaf049f42c/output.log`.
Both logs are retained under the evidence root above.
The check re-established absolute worktree, branch and kickoff HEAD; format, strict all-target/all-feature Clippy, tests, strict rustdoc and both lockfile guards each exited zero.
Results: **49 client unit tests**, **63 server unit tests and one ignored browser fixture**, six executable tests, one typed-host integration test, three policy-injection tests, zero client doctests and three server doctests.
The retained factory test and native storage-mode round-trip both passed.
The reduction from 51 to 49 client tests is precisely the removal of the deferred cleanup regressions, not skipped or filtered validation.
The original native connection failure remains open; this passing run does not establish its cause.
No source changed after this check; final report edits only reconcile the explicit user decision and actual evidence.

## Behavioral Contracts and Test Layers

The links below identify owning promises, not inferred implementation behavior.
Test names are relative to the linked module unless otherwise qualified.
“Adequate” covers the named decision, not every possible race or production deployment.
All assigned-crate tests named here passed in the final check unless explicitly described as a coordinator-owned platform gate.

### Typed host and executable configuration

| Boundary | Exact contract and owner | Discriminating evidence and disposition |
| --- | --- | --- |
| transport/typed-host-composition | [SessionDecorator and SessionSetup](../../../../crates/sea-webtransport-server/src/setup.rs): “Transforms a session factory once per recovered document, before any membership is opened”; “The returned factory is shared by every session and listener”; default enables caching and leaves sessions undecorated. | Adequate. `host::tests::retained_document_factory_intercepts_before_allocation_and_dispatches_all_opens` checks first ID 1, second ID 2, runtime identity, and independent close for direct/pass-through/policy/chained paths. `tests/policy_injection.rs::decorators_compose_once_in_order_without_cache_and_memory_hosts_are_independent` records actual inner/outer construction, context, second-document separation, and independent namespace rejection. These directly diagnose host composition rather than conformance. |
| transport/typed-storage-setup | [StorageSetup](../../../../crates/sea-webtransport-server/src/setup.rs): “File paths identify the storage namespace itself; no `documents` suffix is added”; successful initialization survives caller cancellation; no custom pressure is inferred. | Adequate. `tests/policy_injection.rs::injected_policy_preserves_readers_and_close_interrupts_waits` checks no storage observer for memory/buffered and a valid observer for durable, across reopen; `tests/document_host.rs::direct_sessions_preserve_typed_capabilities_and_errors_across_backends` checks typed handles, errors and durable reopening. Read-only inspection confirms executable layout explicitly adds `documents`, whereas recipes do not. |
| server/registry-and-worker-ownership | [DocumentHost and storage_worker](../../../../crates/sea-webtransport-server/src/host.rs): retained serialized initialization off the async executor; cancellation does not roll back creation; open shares an existing runtime without caching failures. | Adequate after the typed split. `slow_backend_initialization_preserves_executor_progress_and_cancellation_ownership`, `slow_document_initialization_preserves_executor_progress_and_cancellation_ownership`, `backend_initialization_failure_remains_retryable`, `document_registry_retries_failed_initialization`, and `document_registry_shares_concurrent_first_opens` block actual workers, cancel callers, inspect retained locks, count attempts and compare runtime pointer identities. Real filesystem latency remains a separate boundary. |
| transport/typed-host-lifecycle | [DocumentHost::flush/shutdown](../../../../crates/sea-webtransport-server/src/host.rs): “without ... initializing unused storage”; shutdown waits for admitted workers, including cancelled callers; pending operations cannot create/recover after shutdown completes. | Repaired evidence. New `unused_lifecycle_operations_do_not_initialize_storage` counts initializer invocations independently of storage effects and checks all three closed-host admission entrypoints. Existing `shutdown_rejects_document_admission_after_pending_backend_initialization` and `shutdown_waits_for_cancelled_callers_document_worker` discriminate the two shutdown races. `custom_storage_uses_generic_document_and_lifecycle_dispatch` records flush/shutdown forwarding. |
| transport/typed-host-errors | [HostError](../../../../crates/sea-webtransport-server/src/host.rs): initialization-worker failure is before classified storage construction; document-worker failure may follow mutation. Errors remain typed until protocol conversion. | Adequate. `worker_failures_keep_initialization_and_document_ambiguity_distinct` injects both worker panics and asserts `Unavailable` versus `Ambiguous`; typed-host integration asserts `NotFound`, `Closed`, nested policy/source rejection, and no consumed membership on refused opening. Ordinary classified-error routing remains direct, exhaustive matching. |
| transport/executable-defaults | [Server configuration](../../../../crates/sea-webtransport-server/README.md): strict booleans; live cache and resource policy default on; pass-through default off; policy requires caching and excludes pass-through; connection/author windows accept 1–4096. | Adequate. Six tests in `src/main.rs` assert defaults, malformed values, incompatible combinations, storage selection, 1/4096 boundaries, both override targets and preservation of unrelated defaults. Embedded defaults are separately covered by composition tests; process printing/listener wiring remain distinct integrated-harness responsibilities. |

### Resource policy

| Boundary | Exact contract and owner | Discriminating evidence and disposition |
| --- | --- | --- |
| transport/policy-input-accounting | [Server resource policy](../../../../crates/sea-webtransport-server/README.md): 128 pending writes and 16 MiB logical input charges; permits cover policy/FIFO waits and release before source invocation; larger backing allocations and never-polled futures are excluded. | Repaired concrete-owner evidence. `resource_policy::tests::every_write_kind_reserves_its_logical_bytes_before_source_admission` verifies submit, blob and multi-entry directory charges, exhausts remaining bytes, observes refusal without leaking the partially acquired request permit, and checks reclamation. Existing `admission_bounds_are_shared_and_release_on_drop` independently saturates request/byte/reader limits and oversized input. Core `PolicySession` owns source-entry release; the server policy's local test does not delegate its accounting assertion to that wrapper. |
| transport/policy-live-reader-scope | Same guide: 128 live-reader reservations cover pending loads and returned unbounded streams; finite reads and snapshot/control operations are outside these limits. | Adequate for concrete host sharing. `host::tests::policy_reader_permits_are_document_wide_and_refusal_does_not_register` saturates one membership, refuses a sibling read/load without adding cache subscriptions, and admits again after drop. Generic permit retention through pending load/source stream termination belongs to the core policy workstream, not the host or a browser test. |
| transport/policy-durable-readiness | Same guide: durable writes wait until both preparation and mutation budgets are at most 127 requests and 8 MiB each; readiness is advisory; terminal pre-source observations cannot make the refused operation ambiguous. | Adequate at this owner. `durable_pressure_wait_resumes_on_drain_or_fails_on_shutdown` blocks real durable preparation, proves the policy wait stays pending with its permit, then verifies drain wake or terminal failure. `terminal_observation_errors_are_definitive` and `failed_observations_release_permits_and_end_only_wrapper_append_authority` check classification/source diagnostics and retained independent source authority. The actual two-budget conjunction and notification registration are owned by [DurableWritePressure::wait_below](../../../../crates/sea-file/src/pressure.rs), not reimplemented here. |
| transport/policy-output-admission-and-shedding | Guide: “Above either target” refuse new sessions/readers but not existing authors; one coalesced task sheds without reader polling; no strong cache/document ownership; drop/termination ends the task; no hard total-memory guarantee. | Repaired exact-entry-target evidence; other decisions adequate. `output_pressure_refuses_admission_then_sheds_without_slow_reader_polling` now accepts at exactly 1,024 entries, refuses above it, keeps existing write admission available, observes slow-reader revocation and fast-reader survival, and checks termination. `byte_pressure_sheds_stopped_readers_and_monitor_does_not_own_the_document` independently exceeds bytes with only three entries, verifies revocation, abort-on-policy-drop, and observer closure after owners drop. Sequencer selection/recheck semantics remain the sequencer owner's boundary. |

### Server protocol, scheduling, and stream ownership

| Boundary | Exact contract and owner | Discriminating evidence and disposition |
| --- | --- | --- |
| transport/author-pipeline-order-and-bounds | [SeaConnectionService::author_request](../../../../crates/sea-webtransport-server/src/protocol/mod.rs): first-poll in receive order; calls may overlap; successful responses wait for commit. [Bounded admission](../../../../crates/sea-webtransport-server/README.md#bounded-author-admission): ordered response count and encoded input-byte limits include completed suffixes. | Adequate. `server::tests::author_pipeline_bounds_admission_and_preserves_both_orders` holds exact service receipts, completes suffix before prefix, independently exercises request/byte saturation, checks no early response/admission, and verifies wire order and high-water metrics. A storage implementation cannot mask this scripted service test. Corrected the contradictory scheduling sentence; no dispatch behavior changed. |
| transport/author-pipeline-barriers-and-failure | Bounded-admission guide: membership/close barriers drain earlier responses; clean EOF drains submissions; malformed input, output failure or service error releases pending futures. | Adequate. `author_pipeline_drains_before_controls_and_clean_eof` asserts call order, no close suffix and cleanup before send finish. `author_pipeline_errors_drop_pending_receipts_and_close_authority` isolates service/write/decode/truncation/cancellation paths and verifies dropped pending receipts. `author_receipts_do_not_restart_partial_frame_deadlines` confirms selecting a receipt does not restart the in-progress framed read. Connection cancellation retains its separate settlement owner. |
| server/event-authority-incarnation | [bind_session](../../../../crates/sea-webtransport-server/src/protocol/mod.rs): returned dispatcher keeps admitted incarnation for operations and cleanup; rejected opening cannot mutate current session. [Logical authority](../../../../crates/sea-webtransport-server/README.md#logical-stream-authority): replacement never retargets old streams. | Prior 0018 deferral is superseded by the kickoff implementation and is adequate on reinspection. `protocol::host::tests::bound_stream_operations_and_cleanup_cannot_reach_a_replacement_session` checks author/content/snapshot with same/different documents and stale cleanup/token revocation. `server::tests::logical_stream_dispatch_and_cleanup_keep_the_admitted_session` changes the fake current router behind already-open streams and checks exact identities for operation/failure/cleanup paths. The formerly ignored real-QUIC `replaced_event_authority_cannot_be_used_by_an_old_author_stream` is enabled and passes, proving distinct wire integration. |
| transport/protocol-adapter-conversion | [Protocol module](../../../../crates/sea-webtransport-server/src/protocol/mod.rs) owns wire/error conversion, version/token checks and cleanup; [SessionDispatcher](../../../../crates/sea-webtransport-server/src/protocol/dispatch.rs) operates on one already-open session and resolves dependencies before snapshot publication. | Adequate after moving dispatch out of the host. `dispatches_typed_role_operations`, `directory_wire_input_rejects_duplicate_and_invalid_names`, `snapshot_publication_rejects_unresolved_dependencies_before_publication`, `joined_and_left_positions_are_valid_snapshot_dependencies`, and `malformed_append_closes_authority_before_queued_submission` protect actual conversion/admission choices. `tests/policy_injection.rs::direct_and_protocol_sessions_share_policy_and_lifecycle` separately proves that direct and adapted sessions share one injected policy rather than competing registries. |
| transport/protocol-signal-ownership | [Ephemeral signals](../../../../crates/sea-webtransport-server/README.md#ephemeral-signals): one room per existing document across cloned adapters/listeners; signals are independent of author membership; one registration per physical connection lifetime. | Adequate for moved ownership. `signal_admission_requires_existing_document_and_one_registration_per_connection` exercises missing/version/duplicate/reopen/fresh-connection decisions. `signals_cross_native_connections_without_archive_events` is distinct relay/wire composition. Existing client queue/datagram policy did not change in this window; no duplicate signal implementation audit is claimed. |
| transport/connection-scheduling-and-cleanup | [Connection lifecycle](../../../../crates/sea-webtransport-server/README.md#connection-lifecycle): independent server-owned tasks, pending handshakes consume capacity, shutdown joins cancellation, completed tasks are not cleaned twice. | Adequate. `connections_run_in_independent_owned_tasks` asserts actual distinct task IDs, not merely eventual completion. `cancellation_joins_tasks_and_does_not_repeat_completed_cleanup` races completed/unjoined work with abort; `cancellation_reports_panics_and_releases_their_services` checks panic propagation and cleanup. Existing failed-admission/shutdown-admission tests assert no-grace callback arguments and retained listener capacity. |
| transport/response-scheduling-fairness | Same guide: ready response streams spend cooperative task budget so cache delivery cannot run indefinitely without yielding. | Adequate. `ready_responses_yield_to_other_work` uses immediately ready fake writes and observes sibling work before all 1,024 responses; removing the production budget consumption defeats the exact assertion. This is scheduling evidence, not a throughput claim. |
| server/framed-io-and-idle-cancellation | [TransportConfig](../../../../crates/sea-webtransport-server/src/server.rs): one admission deadline and per-operation framed I/O timeout; guide distinguishes idle subscriptions from active I/O. | Adequate for directly affected shared loop. Paused-time `idle_stream_outlives_operation_deadline`, `partial_frame_expires_after_operation_deadline`, and `invalid_first_length_fails_without_waiting_for_more_bytes` isolate server read decisions. `idle_content_read_releases_its_stream_when_peer_cancels` isolates stopped-notification selection. Do not infer the native client's stricter absolute request budget from these server tests. |
| transport/udp-receive-buffer | [Connection lifecycle](../../../../crates/sea-webtransport-server/README.md#connection-lifecycle): requests 2 MiB only if current buffer is smaller; OS may cap/adjust it; no host-wide changes, flow-window changes, or overload guarantee. | Reviewed exclusion from new deterministic behavioral assertions: a platform-selected effective buffer is not a portable correctness oracle, and no performance campaign is approved. Code inspection confirms socket-local query/increase/diagnostic before endpoint binding; real QUIC tests cover successful binding, not exact kernel sizing. Revisit on target-platform socket errors or an approved throughput investigation. |
| transport/websocket-listener-and-byte-adapter | [Optional listener](../../../../crates/sea-webtransport-server/README.md#optional-websocket-listener): exact origin/subprotocol, group/child lifetime, bounded DATA records and directional FIN. | Adequate for changed host-construction wiring; byte-adapter implementation is unchanged. Existing `originless_clients_require_explicit_loopback_opt_in`, `admission_checks_origins_protocol_groups_and_streams`, `owner_loss_revokes_children_and_token_and_shutdown_cleans_once`, and socket adapter cancellation/backpressure tests run in the affected crate. Shared author dispatch has its own pipeline tests; actual browser stream backpressure remains a separate integrated platform boundary. |

### Shared client and wire contracts

| Boundary | Exact contract and owner | Discriminating evidence and disposition |
| --- | --- | --- |
| transport/native-timeout-ownership | [Client lifecycle](../../../../crates/sea-webtransport/README.md#lifecycle-and-ownership): opening covers admission/write/handshake/initial state; finite requests have one budget including interleaved frames; idle subscriptions wait indefinitely; observed partial-frame expiry survives cancellation. | Prior 0018 deadline deferral is superseded by implemented native deadlines. Adequate: `every_logical_opening_and_snapshot_initial_state_have_a_deadline`, `opening_send_and_finish_are_bounded_and_cancelled`, `idle_receives_survive_cancellation_but_partial_frames_do_not_reset_the_clock`, `finite_requests_reset_between_exchanges_but_not_between_write_and_read`, `interleaved_snapshot_notifications_cannot_extend_publication_budget`, and `interleaved_signals_cannot_extend_request_budget` directly control primitive calls and virtual time. `configured_native_client_times_out_and_resets_a_stalled_content_request` separately proves real QUIC reset against a peer without server deadlines. |
| transport/timeout-cleanup-classification | Lifecycle: “Append, membership-append, and snapshot-publication timeouts report `Ambiguous`”; no automatic retries. Cleanup cannot determine whether the original operation committed. | **Deferred by explicit user decision**, not accepted or repaired in the final patch. The historical red/green `cleanup_failure_does_not_hide_mutating_timeout_ambiguity` covered all three mutations, exact write count, classification and cleanup retention; `cleanup_failure_retains_nonmutating_timeout_without_adding_ambiguity` supplied the content control. Proposed `ClientError::Cleanup` and `SeaClientError::Cleanup` variants retained both errors but were declined with the fix; all associated source/test/doc hunks are removed and preserved externally. Current `cancel_on_error` can still replace a timeout with cancellation failure before author/snapshot conversion. Native cancellation currently succeeds; supported custom transports with failing cancellation can expose the defect. Revisit on an approved error representation/API; coordinator owns known-issue and decision records. |
| transport/finite-completion-and-subscription-lifetime | Lifecycle and [ContentStream](../../../../crates/sea-webtransport/src/client/mod.rs): first monitored-read response ends request budget; finite content waits for `ResponseComplete`; complete buffered subscription frames do not expire during consumer idle; close uses protocol ACK. | Adequate after deadline adaptation. `content_requires_completion_within_one_budget`, `buffered_subscription_frames_do_not_expire_while_the_consumer_is_idle`, `event_and_content_read_subscriptions_remain_idle_after_admission`, and `author_close_uses_protocol_ack_without_waiting_for_transport_finish` isolate their distinct completion decisions. Existing cancellation/receipt-kind tests still run; server responsiveness is not their oracle. |
| transport/native-submit-first-poll-order | Lifecycle: concurrent submissions reserve author FIFO on first poll, including an exhausted native cooperative budget. | Adequate. `native::tests::submission_reserves_fifo_even_when_cooperative_budget_is_exhausted` drains the budget, polls submission under a held mutex, releases the prior owner, and requires the queued submission to retain its reserved turn until cancellation. It does not depend on eventual persisted event order. |
| transport/remote-session-factory | [WebTransportSessionFactory](../../../../crates/sea-webtransport/src/factory.rs): fresh connection per open to the same existing document; clones contain settings, not connections; dropping factory does not close returned sessions; reference forwarded; no retry/background-open owner. | Repaired owning-crate evidence. New `opens_forward_document_and_reference_on_independent_connections` has a scripted QUIC peer assert exact document, `Open` intent and distinct references, return nontrivial session IDs, and accept independent closes after both factories drop. It has a ten-second outer bound. The existing `sea-integration-tests::network_factory_opens_independent_sessions_and_forwards_facets` separately checks real host rejection/history/content/decorator composition; it is retained, not duplicated as the factory's only evidence. |
| transport/wire-codec-preservation | [Protocol](../../../../crates/sea-webtransport/src/protocol.rs): complete bounded envelopes, exact payload consumption, stable message kinds, no-blob forms and varint identities. | Adequate for the incremental documentation/test-loop edits. Inspection confirms the moved loop still covers each session varint boundary for responses while avoiding duplicate identical request checks. `decoder_read_sizes_stop_at_one_frame_and_validate_before_allocation`, exact-payload, wrong-role and golden-length tests remain; `encoded_len` agrees with actual complete-frame lengths, rejecting the proposed pending-budget mismatch. No wire-format change. |
| transport/browser-private-helper-preservation | [Browser lifecycle/fallback](../../../../crates/sea-webtransport/README.md): retained promises survive cancelled Rust waiters; final owners cancel directions; fallback is explicit; strict streaming and ordinary sockets differ in backpressure. | Reviewed no-change disposition for behavior: incremental edits rename the terminal-error check and move the identical `call_method` next to its sole consumer. The receiver and argument-array application are preserved. Native tests cannot execute these JavaScript paths. Existing generated ordinary-socket/fallback/lifecycle fixtures remain required coordinator evidence, including the ignored physical-release server fixture; no new browser behavior or silent fallback is introduced. |

### Unchanged boundaries and inherited risks

Both manifests, exported modules, guides and the full 29-file incremental path set were inspected for relevance.
Client `signals.rs`, `websocket.rs` envelope, browser WebTransport RAII, server `stream.rs` and `websocket_io.rs` contain no incremental implementation change; changed consumers of those boundaries are addressed above.
Their previously accepted independent datagram admission, signal queue overflow, content-handle provenance, snapshot-registration ownership and DATA/FIN tests remain in the passing suites.
This is an incremental disposition, not a new exhaustive reassessment of unchanged code.

The two applicable 0018 deferrals, mutable session routing and missing native post-opening deadlines, were rechecked against their now-implemented owners and concrete tests.
The unattributed native connection timeout remains open after this run's recurrence; preserving its first log and checking future failing-stage/worker timing is the revisit trigger.
Authentication/tenant policy, retention/GC, power-cut qualification, target-kernel throughput tuning and logged-out public forwarding remain excluded by the charter or unchanged known limitations.
No claim of total-memory bounds, production security, physical durability, or overload resilience follows from these tests.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Confirmed defect | Cancellation error replaced a mutating timeout. | Exact red test and historical green experiment retained above. | Could mislead recovery into treating an uncertain mutation as unavailable. | User deferred fix and public variants; original behavior restored, proposed patch preserved externally. | Check initiating failure and cleanup failure independently; representation needs approval. |
| Validation incident | Existing durable-file opening timed out. | Original 5.008122613-second failure, measurements and exit 101 retained above. | First full run failed. | Later current-state run passes; cause remains open. | Passing reruns are not causal attribution. |
| Tooling | Runner lacked a fixture-path override. | Initial task definition/runner inspection and coordinator update. | Checks paused rather than writing outside permitted paths. | Worktree-owned `TMPDIR` configured; task route passed. | Configure subprocess fixture roots before tests. |
| Evidence correction | Full-check UUID was mistyped. | Direct directory and log inspection corrected `499a` to `499b`. | Coordinator initially could not open the evidence. | Corrected path plus actual failure excerpt preserved. | Copy identities exactly and reread retained evidence. |
| Edit validation | New test module briefly landed inside its impl. | Formatter parser failure described above. | No test execution on malformed source. | Corrected, formatter and complete checks pass. | Validate after every edit batch. |

## Contract and Integration Friction

No shared trait, public API or production behavior change remains in the accepted patch.
The user declined the proposed `Cleanup` enum variants and deferred the timeout fix with them; representation/API approval is the revisit trigger.
No changeset is needed for the retained behavior-preserving test/documentation work, as directed by the coordinator.
The coordinator owns the deferral decision record, known-issue entry and root architecture-guide reconciliation.
Requested manifest facts were supplied: server production workspace dependencies are `sea-core`, `sea-file`, `sea-memory`, `sea-sequencer`, `sea-signals`, and `sea-webtransport`; `sea-conformance` is dev-only.
The client production workspace dependency is `sea-core` only; `sea-memory` and `sea-sequencer` are dev-only.
Core policy source-entry/permit semantics and file/sequencer pressure mechanisms stay with their assigned owners.
Consumers retains the real session-factory composition test and generated/browser gates.

## Human Interventions

The user had already authorized full incremental coverage and localized repairs.
Coordinator interventions supplied the safe runner fixture root and exact focused red-test task, confirmed the expected failure, and requested preservation of both cleanup and initiating outcomes.
The user then explicitly deferred the proposed public API and timeout fix together while retaining the finding and all other audit repairs.
The five specified files were restored without reducing audit coverage or removing historical failure/experiment evidence.
No nested delegation or shell ownership transfer occurred.

## Measurements

No performance campaign, throughput claim, dependency delta or lockfile change.
Before user deferral, the formatter recorded nine source/guide paths plus this report: 451 insertions and 21 deletions including the report as it existed then.
That is not the final frozen-patch size; the coordinator's capture owns final counts.
The revised accepted patch has five changed paths and no production changes.
Elapsed effort and model/token measurements are unknown.
Environment: Linux, pinned Rust 1.98.1, isolated assigned worktree, guarded tasks with four Cargo build jobs and worktree-local fixture root.

## Proposed Decisions

The coordinator will record the explicit decision to defer the timeout fix and public error representation.
The confirmed ambiguity-contract violation remains unresolved until representation/API approval; the experiment is not accepted implementation.

## Candidate Skills and Process Changes

Use coordinator-owned task runners with explicit fixture roots and retained exact checkout guards.
For failure-path audits, test a cleanup failure in addition to the initiating failure; otherwise a recovery-classification promise can be lost despite nominal timeout coverage.
These are concrete observations for coordinator reconciliation, not edits to shared skills.

## Remaining Work and Risks

The approved assigned incremental boundary review and retained localized test/documentation repairs are complete; source is frozen after the explicit fix deferral.
Remaining coordinator actions:

1. Capture the revised frozen diff/checksum and reconcile the five retained paths with this report; keep the original proposal as separate historical evidence.
2. Run applicable integrated workspace, generated/WASM, browser/extended, documentation and policy gates for the combined accepted iteration patch.
3. Independently review the retained tests/documentation and full coverage dispositions, including the explicit cleanup-defect deferral and factory-test scope.
4. Record the original native timeout recurrence without closing it based on the passing rerun; capture failing-stage and storage/worker timing on recurrence.
5. Add the deferred timeout defect's known-issue and decision record, and record accepted checkpoint mapping before removing the worktree; no changeset is needed for this retained patch.

There are no unreviewed assigned incremental areas.
One confirmed localized source repair is intentionally deferred by the user: cleanup failure losing the initiating mutating-timeout ambiguity.
The native timeout's causal investigation and platform/integrated qualification remain open responsibilities, not evidence of a proven overload defect.
Do not discard the intentionally dirty frozen worktree until its patch is preserved, reviewed and mapped by the coordinator.
