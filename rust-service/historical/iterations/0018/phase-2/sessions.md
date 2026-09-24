# Iteration 0018: sessions Report

Status: complete and frozen for coordinator commit; isolated local gates passed; approved membership-position semantics covered locally
Branch: `rust-service-iteration-0018-sessions`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0018-sessions`
Base commit: kickoff `37fa0c0e4a119f94844837818a810ef84f9f59f8`; approved source `73aae4414baff2e635f6ccdcbd2b4cb507d62bfd`.
Final commit: none; coordinator owns commits.
Agent or owner: sessions implementation agent.
Model and tool version: unknown.
Instruction source: [sessions instructions](instructions/sessions.md), kickoff commit above.
Session or transcript reference: coordinator session `4cc33478-17d9-40d5-9640-a53d9778b2c5`.
Started and finished: started 2026-09-24T01:01:08Z; implementation validation completed in isolated run started 2026-09-24T01:35:02Z; documentation follow-up validated in isolated run started 2026-09-24T01:47:19Z.

## Outcome

Completed full reassessment of all four assigned crates, including their entire production source, crate guides, manifests, owner-local tests, and the relevant shared contracts.
There was no review-count or time cutoff.
Confirmed localized signal-memory defect: validating `Bytes::len()` did not bound the backing retained by membership and receiver queues.
The existing relay README promises bounded queued payload memory; admission now owns compact backing before fanout.
Two focused regressions first failed against unchanged production code, then the localized repair was applied.
The same inspection found oversized input backing retained by the sequencer's charged admission ring.
An owning fault-fixture regression first failed during a gated singleton append; the repair compacts payloads at both idle and queued admission, not while waiting for capacity.
Focused evidence now also protects transformation, capability forwarding, encryption preparation/authentication, signal admission and cascading overflow, recovered metadata, and sequencer dependency resolution.
All localized findings are repaired, including the post-handoff non-cache progress-preservation finding described below.
Canonical workspace, generated-consumer, policy, and independent-review acceptance remain coordinator responsibilities, not claims of this workstream.

## Hypothesis Results

Initial hypothesis: consequential responsibilities may lack precise promises or practical owner-local regression diagnosis.
Full reassessment includes all four assigned crates, unchanged and previously accepted boundaries, without a review cutoff.
Review priority: sequencer persistence/reconciliation and lifecycle, signal membership/overflow, then transformation and malformed-input boundaries.
Planned checks: assigned process task for identity, formatting, all-feature/all-target four-crate tests, and strict Clippy; coordinator owns canonical integration gates.
The missing-local-evidence hypothesis was supported for wrappers, admission bounds, dependency resolution, and malformed recovery metadata.
Existing owner-local evidence falsified the need for additional general lifecycle, ordering, reconciliation, election, and live-cache tests in the reviewed areas.
Final contract reconciliation did identify narrowly missing assertions for admitted publication surviving publisher revocation, exact membership descriptors, and malformed submission tags; those were added locally.
Post-handoff cross-workstream hypothesis (foundations agent `75580946-cb84-4ac7-b3a2-353bf91056c8`): `boxed_monitored_stream` updates only the delivered cursor on data, so the non-cache read adapter may preserve a stale `FallenBehind` status even when the backend's current observation is coherent.
The cached path explicitly normalizes that transition and has focused evidence; the non-cache path is being checked separately before any repair.
Adding post-data coherence assertions to `concurrent_sessions_deliver_each_submission_once_with_lazy_errors_and_progress` unexpectedly passed in run `2026-09-24T01-21-37.545Z-876083`.
The inspected memory source yields newly appended data before a new progress item, while the inspected core wrapper changes only `previous`; the observed success therefore does not match the inspected implementation.
The assigned runner shares `/workspaces/.cargo-target` across worktrees, making cross-worktree dependency reuse a hypothesis requiring isolated-target validation by the coordinator.
No new production repair was applied on this unverified basis.
Foundations subsequently confirmed an owner-local core defect and repair: the positioned wrapper now advances `latest_known` on newly delivered positions and changes exhausted `FallenBehind` to conservative `StreamingBacklog`.
That repair is not present in this worktree's inspected core source, but could explain the unexpectedly passing downstream assertion through the shared target directory.
The sessions assertion is retained as integration evidence; no duplicate core change or downstream normalization was introduced.
At 2026-09-24T01:24:10Z the coordinator paused further checks pending a unique per-worktree `CARGO_TARGET_DIR` in the assigned runner and explicit clearance.
No stale-artifact defect is confirmed; the surprising-green observation and exact source comparison are preserved without treating the shared target alone as proof.
Further read-only tracing isolates a separate caller responsibility not fixed by core: non-cache `LocalSession::read` converts its monitored backend into an ordinary `stream::unfold`, forwarding only yielded progress events and never consulting `source.progress()`.
The owning README promises preservation of backend progress.
For example, after initial empty discovery and later appends while the reader is unpolled, `sea-memory::MemoryRead::progress()` discovers the new frontier and backlog, but the session wrapper retains its earlier empty observation.
Core cannot recover this hidden synchronous observation from an ordinary stream.
After clearance at 01:25:01Z, isolated run `2026-09-24T01-25-05.139Z-888692` failed the new post-data assertion `latest_known >= previous`, unlike the earlier shared-target run.
The stronger between-polls assertion then failed in isolated run `2026-09-24T01-26-16.613Z-893388`: latest was `None` instead of `Some(EventPosition(32))`.
The localized repair introduces `storage_read.rs`, preserving the initialized monitored source through lazy membership-scoped opening and termination.
It delegates progress to `map_monitored_stream`, preserves source cursor on transformation error, and releases the source on close/error/end while freezing the terminal observation.
Run `2026-09-24T01-27-16.932Z-898232` then passed all 104 tests, format, and strict Clippy against this worktree's unchanged core and memory dependencies.
The source/result discrepancy is resolved for acceptance by isolated red/green evidence; the exact mechanism behind the earlier shared-target success was not independently reproduced.
The inherited sequential audit, iteration 0017 inventory, and deferral reconciliation were read and rechecked against current owners rather than accepted as exemptions.

## Deliverables and Commits

- `sea-sequencer`: compact retained admission payloads, preserve synchronous storage-read progress through lazy initialization and membership closure, clarify contracts, and add focused retained-backing, tree-dependency, content-facade, recovered-metadata, checkpoint-announcement, codec, admitted-publication, and progress assertions.
- `sea-signals`: compact retained membership/message fields, document admission limits, and add allocation, limits, public descriptor, stale-sender, and cascading membership-overflow tests.
- `sea-compression`: add raw-versus-decoded payload, stored identity, metadata, load, coordination, error, and closure evidence; remove misleading retry wording.
- `sea-encryption`: add equivalent focused adapter evidence, local key-failure closure, and authenticated key-identifier regression coverage; clarify lookup-before-authentication and event/blob key documentation.
- This report supplies the complete responsibility map and inventory rows for integration.

No commit was created, as instructed.
Only the four owned crate directories and this report were modified.
No dependency, manifest, lockfile, shared contract, or generated artifact changed.

## Validation Evidence

Initial process-task invocation succeeded through `runTask` with workspace `/workspaces/FluidFramework`, ID `process: rust-quality-0018-sessions`.
Tool search is not exposed; the assigned task tool is directly available.
Run `2026-09-24T01-01-18.568Z-797750` recorded the exact worktree, expected branch, kickoff HEAD, and clean initial status.
Its nonempty `result.json` records three commands, each exit 0 with no signal:
`cargo fmt --all -- --check`;
`cargo test -p sea-sequencer -p sea-signals -p sea-compression -p sea-encryption --all-targets --all-features`;
`cargo clippy -p sea-sequencer -p sea-signals -p sea-compression -p sea-encryption --all-targets --all-features -- -D warnings`.
Evidence root: `/home/node/.copilot/session-state/4cc33478-17d9-40d5-9640-a53d9778b2c5/files/sessions/2026-09-24T01-01-18.568Z-797750/`.
The baseline logs were read directly: 5 compression, 12 encryption, 63 sequencer, and 6 signal tests passed.

Latest validation run: `2026-09-24T01-47-19.101Z-926519`, under the same evidence root with that run directory.
The runner now records and supplies isolated target `/workspaces/.cargo-target-quality-0018-sessions` and sets `CARGO_BUILD_JOBS=4`.
All three exact commands above exited 0 with no signal.
Tests passed: 7 compression, 17 encryption, 70 sequencer, and 11 signals (105 total).
The nonempty JSON and test/Clippy logs were read directly.
The JSON has the expected object structure, unique run ID, absolute cwd, expected branch and kickoff HEAD, owned-only status paths, and three command/result records whose log paths share the same run directory.
Successful format logs are intentionally empty because rustfmt prints nothing on success; the manifest records its exit 0.
The assigned entry point checks shared Cargo/pnpm lockfile diffs after the command gates; no shared lockfile appears in the recorded status.
No already-running invocation was accepted as new evidence.
Editor problem inspection of the four owned crate directories reported no errors.

Discriminating failure evidence is retained separately:

| Run | Expected observation | Result |
| --- | --- | --- |
| `2026-09-24T01-05-35.467Z-812930` | Original relay retains oversized identity/target backing | Two new tests fail, test exit 101 |
| `2026-09-24T01-11-11.918Z-841564` | Original sequencer retains oversized admitted backing | New fault-fixture test fails, 63 original sequencer tests pass, exit 101 |
| `2026-09-24T01-13-57.956Z-852864` | Deliberately omit envelope AAD in both directions | Only the new aliased-key test fails, exit 101 |
| `2026-09-24T01-14-08.338Z-854197` | Deliberately bypass blob compression | Only the new transformation test fails, exit 101 |
| `2026-09-24T01-14-25.466Z-856238` | Both deliberate mutations removed | Format, 100 then-current tests, and strict Clippy pass |
| `2026-09-24T01-15-47.642Z-860886` | Final additional content/dependency tests | Format, 102 tests, and strict Clippy pass |
| `2026-09-24T01-18-59.861Z-869380` | Updated documentation comments | Format, 102 tests, and strict Clippy pass |
| `2026-09-24T01-19-47.108Z-871275` | Final codec, membership descriptor, and admitted-publication evidence | Format, 104 tests, and strict Clippy pass |
| `2026-09-24T01-21-37.545Z-876083` | Non-cache post-data coherence assertion, shared target | Unexpectedly passes; preserved as observation, superseded for acceptance by isolated evidence |
| `2026-09-24T01-25-05.139Z-888692` | Same assertion, isolated target and unchanged core | Fails `latest_known >= previous`; 68 other sequencer tests pass |
| `2026-09-24T01-26-16.613Z-893388` | Backend progress preservation before subsequent read poll | Fails latest-known equality: `None` versus position 32 |
| `2026-09-24T01-27-16.932Z-898232` | Monitored-source-preserving adapter | Format, 104 tests, and strict Clippy pass in isolated target |
| `2026-09-24T01-34-24.816Z-911233` | Approved membership snapshot boundaries | All 105 tests pass; Clippy rejects similar test-variable names |
| `2026-09-24T01-35-02.428Z-912931` | Rename test receipt binding | Format, 105 tests, and strict Clippy pass in isolated target |
| `2026-09-24T01-47-19.101Z-926519` | Coordinator-requested private adapter documentation | Format, 105 tests, and strict Clippy pass in isolated target; no behavior changes |

Intermediate formatting failures stopped before tests and were repaired from rustfmt's exact suggestions.
The first signal repair also hit `needless_pass_by_value`; consuming and releasing the old backing in `retain_bytes` fixed that diagnostic without an API change.
Run `2026-09-24T01-06-32.259Z-821487` confirmed that repair with all three gates passing.
All failed attempts remain in separate run directories; none is treated as a successful gate.
Rust 1.98.1 is pinned by the checked-in toolchain; the task did not separately print `rustc --version`, so an independently observed compiler version is unknown.

## Behavioral Contracts and Test Layers

### Complete Responsibility Map

| Crate | Consequential responsibilities inspected | Implementation and evidence locations |
| --- | --- | --- |
| `sea-sequencer` | Persisted encoding and corruption; checkpoint bounds, cadence, reservations and recovery departures; ordering, queue capacity/backpressure and input ownership; cancellation and failed-prefix termination; singleton reconciliation and grouped ambiguity; reference/floor policy; membership/close/shutdown; content identity-to-handle resolution; lazy finite/live reads and snapshot loads; snapshot lineage and publisher fencing; cache opt-in, publication, retained work, cursor handoff, progress, reclamation, revocation, invalidation, and errors | All ten Rust files: [session][seq-code], [pipeline][pipeline], [checkpoint][checkpoint], [codec][codec], [cache][cache], [live reader][live-read], [fault tests][fault], [cache tests][cache-tests], `error.rs`, `lib.rs`; [crate contract][seq] |
| `sea-signals` | Limit/identity admission; atomic membership and replacement leases; room isolation, sender binding and routing; reliable/best-effort queues and eviction cascades; backing ownership; receive cancellation/single-consumer conflict; close/drop and terminal wake; service facade/error classification | Entire [module and tests][signals-code], manifest, [crate contract][signals], shared [signals contracts][signal-contract] |
| `sea-compression` | Complete-frame encode/decode, malformed/truncated/trailing input, empty/compressible/incompressible bytes; event/blob transformation, control-data bypass and stored identities; directory/handle/snapshot/coordination forwarding; live suffix/progress/error mapping; author failure/close forwarding; composition and deliberate unbounded decoded size | Entire [codec module][compression-code], [session module and tests][compression-session], manifest, README and DEV guide; [contract][compression] |
| `sea-encryption` | Envelope parser, authenticated context/header/ciphertext, key lookup/rotation and nonce use; redaction/zeroization delegation; event/blob transformation and stored identities; control bypass and capability forwarding; live suffix/progress/error mapping; serialized author fail-stop state and cancellation; composition and deliberate unbounded payload size | Entire [envelope module][encryption-code], [session module and tests][encryption-session], manifest, [contract][encryption] |

### Inventory Rows

The post-handoff reassessment also covers the complete new [storage-read adapter][storage-read]: lazy opening, close notification priority, source progress delegation, decode/error cursor semantics, terminal source release, and frozen final observations.
The snapshot-lineage/authority and content-capability rows additionally include `membership_positions_resolve_and_publish_snapshot_boundaries`, covering approved decision 0022.
It resolves both Joined and Left positions in an archive with no application submission, publishes snapshots with the correct parent, and verifies both returned and stored boundary/root identities.
Disposition: repaired focused evidence and clarified owning README/error wording; current acceptance policy is unchanged.
Revisit if snapshot-position validation or session-event kinds change.

All named tests below are in the owning crate.
`session::tests` names refer to its `src/session.rs`; sequencer `fault_tests` and `live_cache_tests` refer to the linked fault seam.
No `already adequate` row relies on a conformance invocation as its local discriminator.
Every row is owned by this sessions workstream; consumers are identified in the second column.
Validation for all rows is the passing four-crate task above; additional failing/mutation runs are noted where material.

| Boundary | Owner and consumers | Precise relied-upon promise | Owning decision and nearest discriminating focused evidence | Disposition and changed evidence | Revisit trigger |
| --- | --- | --- | --- | --- | --- |
| sequencer-admission-order-and-prefix | `Pipeline`, author clones | [Ordered append][seq-order]: accepted submissions form a prefix; first-polled order survives capacity waits; cancel before admission preserves authority, after admission revokes it | Gate acquisition/release and failed-member checks: `buffered_submissions_preserve_first_poll_order_with_exhausted_budget`, `capacity_wait_preserves_same_session_order_and_failure_prefix`, `capacity_wait_cancellation_preserves_authority_and_close_needs_no_admission_lock`, `same_session_batch_rejects_invalid_entry_and_suffix_but_settles_prepared_prefix` | already adequate; assertions observe admitted occupancy, archive order, append counts, and failed suffixes, not scheduler timing | Admission gates, driver scheduling, or batch preparation changes |
| sequencer-admission-bounds-and-backing | `Pipeline::submit` / retained `Entry`, runtime hosts | [Runtime][seq-runtime]: 256 queued/in-flight entries and 4 MiB charged input, with separately bounded overhead and caller-held waits | Count/byte charging: `delayed_persistence_admits_a_bounded_ring_and_publishes_only_after_commit`, `byte_bound_backpressures_before_the_entry_limit`; retained allocation: new `admitted_inputs_do_not_retain_oversized_caller_backing` checks weak owners before releasing persistence for idle and queued inputs | repaired; production compaction and precise README statement; original-code failure recorded | Charging, payload representation, or retained-entry changes; assess copy cost before changing the bound |
| sea-sequencer/failed-reconciliation-terminal-leave | `append_once`, `settle_pending`, lifecycle barriers; recovering authors | [Settlement][seq-settlement]: never resubmit; complete authoritative singleton scan may settle; failed head/incomplete scan blocks mutation and absence claims; [append contract][seq-order] forbids a false final departure | `returned_ambiguity_is_scanned_and_rejection_requires_fresh_membership` distinguishes committed/absent/rejected with call counts; `failed_reconciliation_prevents_terminal_leave_until_recovery` checks close and shutdown make no leave and retain the view; `grouped_ambiguity_poisoning_prevents_suffix_and_terminal_leave` checks batch ambiguity | already adequate; inherited 0017 result rechecked directly | Reconciliation, storage batch outcomes, or terminal barrier changes |
| sequencer-cancellation-retained-work | `Pipeline::driver`, `Runtime::pending`; cancelled authors and later operations | [Settlement][seq-settlement]: retain the same backend future; caller cancellation is not settlement; later operations drive it without a background task | `cancelling_before_or_after_commit_retains_the_same_backend_future_until_settlement`, `cancelled_dispatched_same_session_batch_settles_before_leave_without_queued_suffix`, `failed_append_and_cancelled_ack_end_announced_prefix_before_later_work` use explicit gates and backend call counts | already adequate | Retained future, cancellation, or close-drain changes |
| sequencer-codec-and-recovery-validation | `decode_committed`, `Runtime::apply` / `recover_inner`; reopened documents | [Runtime][seq-runtime] rejects malformed envelopes and invalid references; [floor][seq-floor] rejects decreasing, forward, context-inconsistent metadata | `submission_round_trip_rejects_every_truncation_and_trailing_bytes` now also checks zero identity and unknown position tag; `membership_encoding_preserves_kind_and_rejects_malformed_records`; new `recovery_rejects_inconsistent_floor_reservation_and_membership_metadata` discriminates future references, inconsistent/decreasing floors, unreserved IDs, duplicate joins, and orphan departures | repaired local evidence; unchanged production validation and existing precise promises | Envelope versions, replay validation, or membership encoding changes |
| sequencer-checkpoints-and-id-reservations | `Checkpoint`, `publish_checkpoint`, `open_session`; recovery and authors | [Checkpoints][seq-checkpoint]: exact applied boundary, outstanding announcements, reserved ID ceiling; publication failure/cancellation blocks tail growth; [Runtime][seq-runtime]: reserve before exposure, skip unused IDs, never wrap | `internal_checkpoints_recover_bounded_tail_and_outstanding_departures`, `checkpoint_at_head_recovers_without_live_policy_history`, `checkpoint_failure_stops_tail_growth_before_next_submission`, `failed_reservations_expose_no_authority_and_recovery_skips_committed_ranges`, `cancelled_reservations_require_recovery_before_allocating_again`, `allocation_reserves_before_exposure_and_skips_unused_ids_after_restart`; new `checkpoint_announcements_preserve_metadata_and_reject_invalid_bounds` checks nonempty encoding, truncations, applied bound and reservation | repaired nonempty checkpoint evidence; other owner-local tests already discriminate cadence, poison, recovery, and exhaustion | Checkpoint format/cadence, reservation arithmetic, or bounded replay changes |
| sequencer-reference-floor-policy | `known_reference`, `proposed_minimum`, `prepare_submission`, `apply`; writers and snapshot readers | [Floor][seq-floor]: durable nondecreasing admission floor, committed advances only, 1024-entry lag window/64-entry debounce, opaque positions, final batch candidate only | `committed_minimum_survives_new_members_and_recovery`, `floor_advances_only_with_the_committed_event`, `floor_debounce_counts_events_not_numeric_position_units`, `idle_members_cannot_pin_the_debounced_reference_window`, `batch_floor_does_not_invalidate_a_prepared_lower_reference`, `snapshot_boundary_retains_its_floor_after_recovery` | already adequate; tests inspect exact committed floor and nonuniform positions | Reference resolution, window/debounce, batch floor, or compaction changes |
| sequencer-membership-and-runtime-lifecycle | `announce_membership`, `close_member`, `shutdown`; independent sessions/readers | [Runtime and delivery][seq]: exact announcement retries, immutable metadata, durable departures on close/recovery, idempotent independent close, runtime owns view until shutdown | `announced_membership_orders_departure_on_close_and_recovery`, `interrupted_recovery_departures_are_not_duplicated_on_reopen`, `two_sessions_share_one_view_and_close_independently`, `repeated_close_ignores_an_unrelated_recovery_failure`, `shutdown_and_session_close_work_when_backend_streams_retain_writer_ownership` | already adequate; backend-retaining fixture diagnoses runtime-vs-stream ownership distinctly | Membership cleanup, replacement, shutdown or backend resource lifetime changes |
| sequencer-content-capabilities-and-dependencies | `LocalSession::view`, archive facade, `append_once` / `append_batch`; content callers and submitters | [Settlement][seq-settlement]: resolve blob identities through current view before publication; [core session][session-contract]: resolve locally available trees rather than fabricate handles | New `content_facade_resolves_stored_identities_and_requires_live_membership` checks content/directory identities, absence, closure and peer survival; new `unavailable_tree_rejects_singleton_and_batch_before_storage_append` checks zero invalid dependency writes and terminal authority at both append paths | repaired owner-local evidence; no production contract change | Content facade, view guard or dependency resolver changes |
| sequencer-storage-backed-read-and-load | `LocalSession::read` / `load`, `StorageRead`; replay/live clients | [Delivery][seq-delivery]: lazy reads preserve synchronous progress/error kinds; membership close terminates reads; selected handle snapshot plus direct live suffix, without atomic captured head | Strengthened `concurrent_sessions_deliver_each_submission_once_with_lazy_errors_and_progress` checks lazy invalid bound, exact positions, between-polls frontier/backlog, and post-data coherence; `direct_reads_close_with_membership_and_load_policies_preserve_replay` checks all load policies and independent close; existing shutdown/read-ownership fault tests protect resource release | repaired monitored-source preservation in [storage read adapter][storage-read]; isolated red/green recorded, without relying on core normalization | Read initialization, source mapping, load selection or close notification changes |
| sequencer-snapshot-lineage-and-authority | `Publishers`, lease drop and `publish_snapshot`; snapshot participants | [Snapshots][seq-snapshots]: parent/advancing version, exact root retry, client-selected suppression, fresh nomination fence, stale lease cannot revoke replacement, revocation does not undo admitted publication | `snapshot_parent_position_and_publisher_fences_are_session_policy`, `closing_the_nominee_transfers_snapshot_authority_with_a_fresh_fence`, `snapshot_cancellation_and_ambiguity_preserve_publication_order` check authority, parent/root conflict, stale fences, lease replacement and retained ambiguous publication; new `revoking_publisher_does_not_cancel_an_admitted_snapshot` gates backend publication, drops authority, and verifies settlement and stored root while subsequent publication is rejected | repaired revocation-after-admission evidence; other local assertions retained | Publisher registry, fence sequence, registration lifetime or snapshot retry changes |
| shared-cache-invalidation-and-subscription-isolation | `LiveCache`, recovery callback and stream registration; cached consumers | [Cache][seq-cache]: opt-in only with independent invalidation; synchronous ownership release without reader polling; subscription revocation cannot revoke author/siblings; no fallback/rejoin | `cache_is_opt_in_and_requires_independent_invalidation`, `independent_invalidation_releases_unpolled_claims_and_wakes_active_read`, `revocation_drop_close_and_stale_capabilities_reclaim_without_polling`, `recovery_never_retains_history_and_invalidated_openings_cannot_rejoin`, `snapshot_load_handoff_and_subscription_revocation_leave_publisher_and_author_intact` | already adequate; rechecked sequential-audit acceptance, including wake counters, no archive polls and registry state before poll | Callback wiring, terminal precedence, registration IDs, or backend invalidation changes |
| cached-historical-to-live-handoff-and-progress | `Reader::next`, `Subscription::attach`, `LiveReadStream`; replay/live clients | [Cache][seq-cache]: cursor advances only for delivered data; finite replay missed handoff retries gap-free; discover frontier then drain it; backlog uses entries, not position subtraction | `historical_finite_load_and_missed_handoff_preserve_exact_delivered_cursor`, `cached_progress_discovers_retained_and_new_frontiers_before_delivering_items`, `historical_and_cached_backlogs_report_fallen_behind_without_inconsistent_snapshots` | already adequate; exact cursors, finite storage construction, interleaved publication and progress snapshots localize each decision | Cursor, handoff, replay bounds or progress changes |
| sequencer-cache-publication-ownership-and-driving | `Runtime::apply`, cache reclamation and `drive_retained`; stalled/active readers and authors | [Cache][seq-cache]: publish after acknowledgement/apply; share exact decoded backing; reclaim after last claim; retained work remains drivable without archive polling and guards are not parked | `caught_up_live_delivery_never_polls_archive_and_shares_exact_payload_backing`, `publication_and_readers_share_decoded_backing_without_another_payload_copy`, `decoded_payload_has_exact_backing_and_does_not_retain_encoded_storage`, `advancing_reader_preserves_order_while_a_sibling_retains_the_prefix`, `cancelled_dispatched_batch_publishes_accepted_prefix_without_archive_polling`, `parked_control_driver_releases_guards_and_survives_another_cancelled_drainer`, `unpolled_cache_claims_do_not_gate_writes_reference_floor_controls_or_shutdown` | already adequate; tests separately observe pointer sharing, capacity/claims, backing weak owners, polling counts, guards and wake transfer | Cache storage, driver notifications, control locks, decoder allocations or resource policy changes |
| signals-admission-and-membership-snapshot | `SignalRoom::new/connect`, registration leases; host and live members | [Relay][signals]: unique live identity, atomic initial current-members snapshot including self; limits reject invalid registration; old handles cannot remove replacement | New `admission_rejects_invalid_limits_identity_metadata_and_capacity` checks zero limits, empty/oversize IDs, metadata, duplicate/capacity, targets and stale send; new `initial_snapshot_and_live_join_preserve_public_descriptors` checks exact identity/metadata in the initial snapshot and joined event; existing `old_handle_cannot_close_replacement_and_admission_snapshot_is_current` checks eviction during registration and stale drop | repaired admission/descriptor evidence and precise numeric documentation; existing atomic/replacement assertions retained | Limit fields, registration ordering, snapshot assembly or lease identity changes |
| signals-document-recipient-isolation | `send_signal` / `dispatch`; document-bound senders/receivers | [Relay][signals]: each room isolated; broadcast includes sender, target reaches only matching live member, missing target no-op; [message contract][signal-contract]: relay-bound sender and original envelope | `document_scoped_routing_preserves_recipients_and_envelopes` checks identical IDs in two live rooms, exact payload/target/delivery/sender and empty nonrecipient queues for both delivery modes | already adequate; inherited 0017 test directly rechecked | Routing, room ownership, envelope construction or factory changes |
| signals-slow-receiver-failure-isolation | `dispatch` / out-of-band terminal; all room members | [Relay][signals]: reliable overflow fails slow recipient without waiting, best effort may drop, membership changes never silently discarded | `best_effort_drops_but_reliable_overflow_fails_only_slow_receiver`; new `reliable_departure_overflow_evicts_each_affected_member` fills two receivers, causes reliable departure overflow in the second and checks both terminal causes plus surviving sender | repaired cascade evidence beyond inherited bounded audit; no production dispatch change | Queue semantics, membership fanout or recursive eviction changes |
| signals-retained-memory | Admission backing ownership; hosts bounding relay memory | [Relay][signals]: queued payload bound is queue capacity times payload limit plus bounded metadata/allocation overhead | New `retained_membership_does_not_pin_oversized_caller_allocations` and `queued_messages_do_not_pin_oversized_caller_allocations` observe weak backing release while membership/queued messages remain live, then verify byte values | repaired production, contract clarification and original-code failing tests | Bytes representation, zero-copy optimization, queue or membership retention changes |
| signals-receive-close-drop-and-no-replay | `next_signal`, `disconnect`, `Drop`; concurrent callers | [Core signals][signal-contract]: exactly one pending receive, cancellation cannot consume, idempotent close wakes; [relay][signals]: no persistence/replay | `cancelled_receive_preserves_messages_and_close_wakes_receive`, `broadcast_target_membership_and_no_replay`, `isolated_rooms_limits_missing_target_and_drop` check conflict, cancelled receive, close wake, queued membership, no replay and final-owner removal | already adequate; focused local tests directly exercise each owner | Receive lock, terminal priority, drop or connection lifetime changes |
| compression-codec-and-malformed-data | `compress_payload` / `decompress_payload`; stored event/blob consumers | [Compression][compression]: one complete zlib frame per payload; malformed/truncated/extended is Corrupt; full-payload buffering without decoded bound | `rejects_truncated_and_extended_frames`, `round_trips_an_empty_payload`, `reports_repeated_and_deterministic_pseudo_random_sizes`; extended `malformed_stored_frames_are_corrupt_and_advance_delivery_progress` now checks corrupt blobs and source InvalidPosition separately | repaired adapter error evidence; codec evidence already adequate | Codec/backend/version changes or introduction of a decoded-size policy |
| compression-transform-and-forwarding | `CompressionSession` facet adapters; wrapped session users | [Compression][compression]: encode payloads only; handles identify encoded bytes; directories/control metadata/snapshots and authority pass through; load decodes direct suffix, source progress/errors survive | New `payload_transforms_preserve_control_metadata_and_stored_tree_identities` and `load_and_coordination_forward_handles_fences_and_registration_lifetime`; raw storage observation, decoded event equality, snapshot handle IDs, live suffix, invalid fence, drop/revoke and source errors discriminate actual wrapper decisions | repaired; blob-bypass mutation fails only new local test while conformance still passes; misleading retry prose corrected | Any facet forwarding, transformation predicate, composition or stream mapping change |
| encryption-envelope-and-key-material | `encrypt_payload` / `decrypt_payload`, provider/nonce/key types; historical reads and new writes | [Encryption][encryption]: context/header/key ID/nonce/ciphertext authenticated, historical lookup precedes auth, unavailable keys/nonces retain Unavailable, key debug redacts; zeroize on drop | Existing truncation/header/context/wrong-key/rotation/nonce/redaction tests; new `key_identifier_is_authenticated_even_when_two_identifiers_resolve_to_the_same_key` isolates authenticated key ID from successful lookup and checks trailing-byte rejection | repaired local authentication guard and lookup precedence documentation; dual-AAD-bypass mutation proves the new test alone distinguishes omission | Envelope/AAD, key lookup, provider identity mapping, nonce source or zeroization dependency changes |
| encryption-transform-capabilities-and-errors | `EncryptionSession` facet adapters; local/decorated sessions | [Encryption][encryption]: independent event/blob contexts, control/directory metadata visible, ciphertext identity space, snapshot/fence forwarding, decrypt on poll preserving progress/errors | New `encrypted_payloads_preserve_control_metadata_and_stored_tree_identities`, `load_and_coordination_forward_handles_fences_and_registration_lifetime`, `malformed_stored_envelopes_preserve_error_kind_and_delivery_progress` inspect raw ciphertext, two nonce calls for blob+event but none for metadata, contexts, IDs, load suffix and registration/error paths | repaired practical owner-local evidence; composition conformance retained only as shared substitutability/composition evidence | Adapter method, context, cloned provider lifetime or capability forwarding changes |
| encryption-author-terminal-state | `begin_append` / `submit` / `announce_membership` / `close`; cloned authors | [Encryption][encryption]: serialize authors across clones, error/cancellation leaves wrapper terminal even before inner admission; close/next append drives inner closure and final departure, no blind retry | Existing `cancelled_preparation_terminates_clones_before_inner_append`, `equal_submissions_encrypt_independently_and_recheck_authority`; new `failed_key_preparation_closes_inner_author_and_wrapper_clones` proves local preparation failure closes both wrapper clones and raw inner author and emits only join/leave | repaired pre-inner failure evidence; no production state-machine change | Preparation awaits, terminal guard, clone semantics, error handling or close forwarding changes |

### Layer Ownership and Reviewed Exclusions

The sequencer fault seam uses the memory backend only as a fixture.
Its counters, admission occupancy, explicit pre/post-commit gates, retained locks, and exact terminal traces discriminate sequencer decisions without a server or browser.
Storage persistence/durability and handle provenance internals remain owned by storage/core; the local tests above test the sequencer's invocation and membership boundaries.
Shared session conformance remains useful for the common initialization/publication/replay/isolated-close laws, but demonstrably did not protect blob compression or envelope AAD.
No new integration/browser test is needed for these local changes; the coordinator's generated/native/browser gates cover distinct composition/platform boundaries.

Reviewed exclusions are not unreviewed areas:

- Exhaustive declaration comments, every forwarding spelling, and trivial constructors/error-display formatting are low-value separate tests once their consequential path is covered above.
- Compression's in-memory `Vec` encoder has no practical recoverable I/O-failure injection; allocation failure is not a promised recoverable state.
  Its defensive encoding-error close branch was inspected; manufacturing a public injectable codec solely to force that branch would be disproportionate.
- Zeroization implementation and AES/zlib algorithm internals belong to the pinned dependencies.
  The wrapper's derive configuration, debug redaction, key selection, contexts and authenticated-header invocation were inspected and tested without reading freed secret memory.
- Repeated decorator layers use the same generic adapters without a separate state machine; local raw/decoded evidence and existing compression/encryption conformance cover the consequential transformation/composition responsibilities.
- Unbounded decompression/encryption payload buffering and experimental live-cache retention are explicit limitations, not newly imposed resource guarantees.
  Hosts/outer layers own input limits; a redesigned decoded-size policy or subscriber shedding requires a separately approved shared decision.
- Subscriptions/fences use checked identity arithmetic.
  Exhausting all `u64` cache subscription identities panics as documented; manufacturing exhaustive lifetime execution is not practical.
  Session-ID exhaustion has focused deterministic coverage because it is persisted/recovered authority.

All four crates and their consequential responsibility groups are accounted for above.
No eligible crate or responsibility was left uninspected, and no confirmed localized repair is deferred.

[seq]: ../../../../crates/sea-sequencer/README.md
[seq-runtime]: ../../../../crates/sea-sequencer/README.md#runtime
[seq-delivery]: ../../../../crates/sea-sequencer/README.md#delivery
[seq-order]: ../../../../crates/sea-sequencer/README.md#ordered-append-and-recovery
[seq-floor]: ../../../../crates/sea-sequencer/README.md#minimum-reference-floor
[seq-checkpoint]: ../../../../crates/sea-sequencer/README.md#internal-checkpoints
[seq-settlement]: ../../../../crates/sea-sequencer/README.md#submission-identity-and-settlement
[seq-snapshots]: ../../../../crates/sea-sequencer/README.md#snapshots
[seq-cache]: ../../../../crates/sea-sequencer/README.md#experimental-shared-live-cache
[seq-code]: ../../../../crates/sea-sequencer/src/session.rs
[pipeline]: ../../../../crates/sea-sequencer/src/pipeline.rs
[checkpoint]: ../../../../crates/sea-sequencer/src/checkpoint.rs
[codec]: ../../../../crates/sea-sequencer/src/codec.rs
[cache]: ../../../../crates/sea-sequencer/src/live_cache.rs
[live-read]: ../../../../crates/sea-sequencer/src/live_read.rs
[storage-read]: ../../../../crates/sea-sequencer/src/storage_read.rs
[fault]: ../../../../crates/sea-sequencer/src/fault_tests.rs
[cache-tests]: ../../../../crates/sea-sequencer/src/live_cache_tests.rs
[signals]: ../../../../crates/sea-signals/README.md#contract
[signals-code]: ../../../../crates/sea-signals/src/lib.rs
[signal-contract]: ../../../../crates/sea-core/src/signals.rs
[session-contract]: ../../../../crates/sea-core/src/session.rs
[compression]: ../../../../crates/sea-compression/README.md#behavior
[compression-code]: ../../../../crates/sea-compression/src/lib.rs
[compression-session]: ../../../../crates/sea-compression/src/session.rs
[encryption]: ../../../../crates/sea-encryption/README.md
[encryption-code]: ../../../../crates/sea-encryption/src/lib.rs
[encryption-session]: ../../../../crates/sea-encryption/src/session.rs

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Confirmed defect | Feed small `Bytes::from_owner` slices backed by 4096-byte allocations into registration and targeted delivery | Run `2026-09-24T01-05-35.467Z-812930`: both new owning-module tests fail at retained identity/target backing assertions, exit 101 | Bounded visible lengths did not bound relay-retained memory | Compact the four admitted byte fields once before sharing | Resource promises must cover retained backing, not only visible slice length |
| Validation friction | First test-only batch failed rustfmt before tests | Run `2026-09-24T01-05-27.537Z-812680`, exit 1 | No behavioral evidence from that attempt | Applied exact rustfmt suggestion; next task produced the expected two regression failures | Keep formatting failures distinct from test evidence |
| Confirmed defect | Test admitted small slices under gated persistence before releasing the caller | Run `2026-09-24T01-11-11.918Z-841564`: `admitted_inputs_do_not_retain_oversized_caller_backing` fails; 63 original sequencer tests pass | Queue byte charges excluded arbitrarily large backing | Compact payloads at the two admission sites | The same ownership question applies separately to relay queues and sequencer admission |
| Evidence gap | Rechecked wrapper forwarding rather than counting shared conformance as local diagnosis | New transform and capability tests inspect raw stored bytes, unchanged control events, handle IDs, live suffixes, fences, registration drop, and local encryption preparation failure | Conformance could pass if transformation were bypassed on both write/read | Focused tests added in each owning wrapper module; no new production abstraction | Inspect wrapped and raw boundaries together to prevent symmetric defects from masking each other |
| Mutation check | Removed encryption header AAD on both encoding and decoding, then restored it | Run `2026-09-24T01-13-57.956Z-852864`: only the new aliased-key identifier test failed; other 16 encryption tests, including conformance, passed | Established a real local diagnostic gap, not duplicated conformance | Mutation removed immediately | Use two identifiers resolving to identical key material to isolate header authentication from key selection |
| Mutation check | Bypassed compression only in `put_blob`, then restored it | Run `2026-09-24T01-14-08.338Z-854197`: new raw/decoded transformation test alone failed at plaintext stored bytes; six other compression tests including conformance passed | Existing conformance did not protect the blob transformation decision | Mutation removed immediately | A raw stored-value observation distinguishes the wrapper's responsibility from the sequencer/storage fixture |

## Contract and Integration Friction

No shared API or semantics were changed.
The localized resource repairs add one compact payload allocation at sequencer admission and one compact copy of each relay-owned field before sharing; no per-recipient payload copy is added.
Any future zero-copy optimization must preserve the same bounded-backing guarantee.
The coordinator owns any required changeset outside this workstream's writable paths and all canonical workspace/policy/generated-consumer gates.
Task access was directly available, so fallback coordinator-only validation was unnecessary.
Some runs waited on the shared Cargo target lock; process isolation did not establish throughput improvement or independent cancellation behavior.
The non-cache progress repair adds a private lazy monitored adapter, not a new shared API or backend requirement; it preserves the existing backend observation rather than imposing new discovery or backlog semantics.

## Human Interventions

The user resolved the shared snapshot-position wording as decision 0022.
Coordinator inspection requested missing purpose/invariant documentation on the new storage-read adapter's named types, fields, variants, and functions; those comments were added without behavior changes and validated before freezing.
The approved scope, no-cutoff coverage, process-task restriction, and no-commit ownership were followed without reconfiguration.

## Measurements

Linux worktree and pinned Rust 1.98.1 configuration; no dependency changes.
Observed elapsed work from dispatch through final implementation validation was approximately 34 minutes; no token/model metadata is available.
Test fixture allocation probes use 4096-byte relay backing and 8192-byte sequencer backing with small visible slices.
They establish ownership release, not allocator RSS or throughput.
No performance benchmark, production workload, power-loss experiment, or comparative throughput claim was requested or performed.

## Proposed Decisions

No redesign or unresolved shared semantic choice was needed for the confirmed local resource repairs.
Transport's post-handoff question exposed a shared wording ambiguity: `SeaArchive::resolve_position` documents an “application position,” while local resolution forwards any storage event position, including membership records, and snapshot boundary validation accepts the same positions.
This may refer to the storage application-event archive rather than `SessionEventKind::Application`.
Foundations and transport were notified; no implementation independently filtered membership positions while awaiting the decision.
At 2026-09-24T01:33:58Z the user resolved this as ALLOW any committed session-event position, including Joined/Left, preserving current local semantics; coordinator owns accepted decision 0022 and foundations owns core documentation.
Before implementing supplemental evidence, the sessions plan is to resolve and publish snapshots at both membership kinds with no application event, verify returned/stored boundaries, and replace misleading snapshot-rejection wording without changing validation policy.
Completed: the new owning sequencer test passes; README and rejection wording describe committed session events.
Core documentation and decision 0022 remain coordinator/foundations-owned integration artifacts; there is no unresolved sessions semantic choice.

## Candidate Skills and Process Changes

Two supported techniques are worth retaining in the existing quality workflow rather than creating a new skill:
test backing ownership with weak owners when a contract bounds `Bytes`-based memory;
and inspect raw stored bytes or use same-key aliases to prevent lower-layer success from masking an omitted transformation/authentication decision.
The mutation evidence above shows both techniques discriminate decisions that existing conformance did not.
For task-only workstreams, a separately registered format-write task would reduce manual application of rustfmt output; this is a coordinator tooling improvement, not a reason to use a shared terminal.

## Remaining Work and Risks

Assigned inspection, initial resource repairs, and post-handoff progress-preservation repair are complete.
The coordinator supplied isolated task artifacts and clearance; isolated red/green now establishes the non-cache source defect and its local repair.
Earlier recorded commands and results remain actual observations, with the final isolated run superseding shared-target results for local acceptance.
The worktree intentionally remains uncommitted with the owned source/docs/tests and this report; coordinator owns commit and integration.
All mutations were removed and the assigned all-target/all-feature test and strict Clippy gates pass.
No shared lockfile or manifest change, temporary source file, helper process, or dependency installation remains.

Coordinator next steps:
reconcile these inventory rows, inspect the actual owned diff, add the appropriate user-facing changeset if required, run canonical workspace/rustdoc/build/documentation/policy/generated-consumer gates, and complete independent Phase 3 review.
Fresh process-task evidence remains machine-local in the coordinator's session-state directory and should be checked before acceptance.
The task evidence records entry status and exact child results; independent commit/diff and artifact reconciliation still belongs to integration.

The inherited accepted cache and reconciliation boundaries remain adequate under direct current inspection.
The broader reassessment found real resource-ownership defects and concrete wrapper diagnostic gaps outside the earlier bounded samples.
This supports the expanded scope, not indefinite repeated testing of unchanged adequate boundaries.
No further sessions-only iteration is recommended absent new changes, an independent-review finding, or the explicit revisit triggers above.
