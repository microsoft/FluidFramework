# Iteration 0020: foundations Report

Status: complete; validated frozen patch awaiting coordinator acceptance
Branch: `rust-service-iteration-0020-foundations`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0020-foundations`
Base commit: kickoff `b06b46be6b88723ea64f4ef1a77a5895781c21bc`; incremental comparison `8bd1e64ebfa`
Final commit: none; coordinator owns acceptance and commits of the frozen patch.
Agent or owner: foundations agent
Model and tool version: model unknown; Rust `1.98.1 (48a229cea 2026-09-01)`.
Instruction source: [assigned instructions](instructions/foundations.md), kickoff commit above; user dispatch authorizes all localized repairs and full incremental coverage.
Session or transcript reference: coordinator session `181f92e1-5a08-499a-a256-9487a2adb7ff`; agent `96a8da67-8f08-463d-9f66-c4428427bd17`.
Started and finished: started 2026-09-29T19:02:47Z; completed after final check started at 2026-09-29T19:17:21.256Z; exact finish time unknown.

## Outcome

Inspected all five assigned members' incremental consequential boundaries, their applicable inherited findings, and directly relied-upon unchanged contracts and tests.
No production-code defect or shared semantic change was identified.
One documentation correction and four focused test repairs are complete and validated.
The first batch was paused for a coordinator-owned filesystem-fixture prerequisite; the coordinator resolved it, the first batch passed checks, and the second repair batch also passed.
Coverage and local repairs are complete; independent review and integrated acceptance remain coordinator-owned.

### Member Coverage

| Member | Incremental coverage | Result |
| --- | --- | --- |
| `sea-core` | All changed value/codec, monitored-stream, factory, policy, session-order, invalidation, and storage-composition surfaces; unchanged owning tests inspected | One README correction and graceful-completion regression added; remaining reviewed decisions adequate |
| `sea-file` | All changed pressure/admission/termination wiring, publication/recovery, cursor/snapshot specialization, content lookup, checkpoint, executor documentation, and test-helper changes | Terminal wake evidence strengthened; independent pressure ceilings and empty-checkpoint pre-dispatch evidence added; remaining reviewed decisions adequate |
| `sea-memory` | Registry ownership move; all changed contract prose and test-fixture substitutions, including content closure, publication, recovery, lifetime, sparse snapshots, and bounds | No change required; exact existing local assertions retained |
| `sea-content-addressed` | Encoded directory identity reuse, limit/validation precedence, test-root changes, and clarified trait traversal/publication contracts | No change required; local integrity, closure, provenance, and publication assertions remain discriminating |
| `sea-conformance` | All three suites and helpers compared with relocated/expanded README coverage statements | No change required; claims remain implementation-independent and explicitly exclude local failure/ownership responsibilities |

Risk order was policy cancellation and pressure lifetime first, then publication/recovery, then pure representation and documentation changes.
The ordering did not impose a boundary cutoff.

## Hypothesis Results

Confirmed five localized gaps, without a production-code defect:
normal policy-stream completion had no direct release/final-progress assertion;
terminal pressure tests manually repolled and did not isolate failure wakeup notification;
the core README's global “No production construction path enables it automatically” claim contradicted the executable's default-on resource policy;
every nonterminal pressure wait used zero request and byte ceilings, so the request predicate could mask a missing byte predicate;
and the simplified file checkpoint path's remaining empty-input rejection had no local regression test.
The frozen patch addresses all five, in two independently validated edit batches.
Existing contracts already promise both lifecycle behaviors, so neither requires a semantic decision.
Hypotheses of dropped storage recovery guarantees, capability erasure, codec drift, and memory ownership loss were rejected by direct comparison with the named owning assertions below.

## Deliverables and Commits

Frozen uncommitted source batch based on `b06b46be6b88723ea64f4ef1a77a5895781c21bc`:

- `crates/sea-core/README.md`: distinguish direct construction from the default-on executable policy.
- `crates/sea-core/src/factory/tests/policy_tests.rs`: extend the existing terminal-stream fixture and add `stream_end_releases_source_and_reader_permit_and_preserves_final_progress`.
- `crates/sea-file/src/pressure.rs`: strengthen `termination_wakes_waiters_and_remains_sticky_after_release` with an actual counted wake before repolling, and add `wait_below_checks_each_dimension_and_stage_inclusively`.
- `crates/sea-file/src/storage.rs`: add `empty_checkpoints_reject_before_worker_dispatch_without_replacing_state` for both storage policies.
- This report: provenance, coverage, dispositions, and validation handoff.

No production Rust implementation, manifest, lockfile, shared fixture, or other owner's path was edited.
No untracked deliverable was created.
Final formatter and check output record exactly these five tracked paths.
The coordinator must retain the frozen diff, compute its snapshot identity, validate, independently review, and map accepted changes to its checkpoint commit.
A checksum has not been fabricated; no shell or commit ownership was acquired.
No changeset is needed for test-only repairs and correction of stale construction documentation; behavior and APIs are unchanged.

## Validation Evidence

Before source edits, registered task `sea-0020-foundations-probe` passed.
The guarded output recorded the absolute Rust workspace above, expected branch and kickoff HEAD, initially empty `git status --short`, and pinned Rust version.
Evidence directory: `/home/node/.copilot/session-state/181f92e1-5a08-499a-a256-9487a2adb7ff/files/2026-09-29T19-03-00.093Z-foundations-probe-2bafbcca-b42e-4e7c-b4f8-ff1361eb364a`.
Its nonempty `output.log` and `incremental.patch` record the exact comparison of all five owned crates against `8bd1e64ebfa`.
Planned checks after each edit batch: assigned formatter followed by assigned five-package format, strict Clippy, complete tests, and strict rustdoc task.
No shared terminal, commits, dependency installation, or lockfile changes are authorized.

`sea-0020-foundations-format` passed at `2026-09-29T19:07:47.441Z`, including checkout identity guards, scoped `cargo fmt`, exact four-path diff stat, and unchanged-lockfile check.
Evidence directory: `/home/node/.copilot/session-state/181f92e1-5a08-499a-a256-9487a2adb7ff/files/2026-09-29T19-07-47.441Z-foundations-format-6e30a6b0-4099-4f39-865a-e1e7ff5550b3`.
Its `output.log` was inspected; all commands report exit 0, signal null.
Editor diagnostics reported no errors in the two changed Rust test files; that is not a substitute for compilation or tests.

The first check was initially paused because existing file tests use `std::env::temp_dir()`, while the runner did not explicitly establish an allowed worktree-local `TMPDIR`.
The coordinator updated the owned runner to create `/workspaces/FluidFramework-rust-service-iteration-0020-foundations/rust-service/target/quality-fixtures` and set command-local `TMPDIR` to that path for every subprocess.
The updated runner was inspected before invoking the check; no prohibited filesystem route was used.
Both check runs used `sea-0020-foundations-check` in loaded workspace `/workspaces/FluidFramework`.
That task runs sequentially with each of `-p sea-core -p sea-file -p sea-memory -p sea-content-addressed -p sea-conformance`:

1. `cargo fmt <packages> -- --check`
2. `cargo clippy <packages> --all-targets --all-features -- -D warnings`
3. `cargo test <packages> --all-features`
4. `RUSTDOCFLAGS='-D warnings' cargo doc <packages> --all-features --no-deps`
5. `git diff --exit-code -- Cargo.lock ../pnpm-lock.yaml`

First complete check passed with 151 unit/integration tests:
`/home/node/.copilot/session-state/181f92e1-5a08-499a-a256-9487a2adb7ff/files/2026-09-29T19-15-48.619Z-foundations-check-1a530165-ff1b-428a-a2c8-56d37b8aaf7e/output.log`.
Only after that pass were the two remaining focused tests added.
Second formatter passed:
`/home/node/.copilot/session-state/181f92e1-5a08-499a-a256-9487a2adb7ff/files/2026-09-29T19-17-10.565Z-foundations-format-5d79f227-56fe-478e-b30a-44e370ec4cad/output.log`.
Final complete check passed:
`/home/node/.copilot/session-state/181f92e1-5a08-499a-a256-9487a2adb7ff/files/2026-09-29T19-17-21.256Z-foundations-check-03b7e29e-5810-4e4f-9d5e-b8eb6b7fabf7/output.log`.
Each command exited 0 with signal null; guards show the expected worktree, branch, kickoff HEAD, and five owned modified paths.
Final test results: core 39; file 69 plus one cross-process lock integration test; memory 31; content-addressed 13; conformance zero standalone tests, with its suites exercised by implementing crates.
Total: 153 passed, zero failures/ignored/filtered; all five doctest groups completed successfully with zero examples.
Strict Clippy, formatting, strict rustdoc, and unchanged-lockfile checks passed.
Final editor diagnostics reported no errors in either second-batch Rust file.
The project-local fixture directory was inspected after checks and was empty.

New/strengthened focused selectors are:
`factory::tests::policy_tests::stream_end_releases_source_and_reader_permit_and_preserves_final_progress` in `sea-core`;
`pressure::tests::termination_wakes_waiters_and_remains_sticky_after_release`,
`pressure::tests::wait_below_checks_each_dimension_and_stage_inclusively`, and
`storage::tests::empty_checkpoints_reject_before_worker_dispatch_without_replacing_state` in `sea-file`.
All four appear as passing tests in the final log.
The lifecycle assertions are deterministic observations before another poll or wrapper drop can mask ownership/wakeup effects.
Removing the normal-end source/permit release or failing to capture final progress makes the new core assertions fail.
Omitting terminal `notify_waiters` makes the file assertion fail before a repoll can observe terminal state.
Deleting either pressure dimension or testing a sum instead of independent stages fails single-poll assertions; strict rather than inclusive comparisons fail equality assertions.
Removing or deferring the file empty-input check fails the synchronous rejection assertion while all worker permits are held; direct persisted bytes, archive heads, checkpoint readback and reopen independently verify preservation.
These are discriminating-check explanations, not claims of an executed mutation.

Documentation checker, policy checker, integrated gates, and independent review remain coordinator-owned and are not claimed passing here.
No product failure occurred; the initial filesystem-destination prerequisite is resolved.
There is no retained machine-readable benchmark evidence or JSON schema to validate.

## Behavioral Contracts and Test Layers

Paths below are relative to `rust-service/`.
“Adequate” means the inspected contract and local assertions are proportionate and the assigned suite passed.
“Repaired” records completed local validation; final independent acceptance remains coordinator-owned.

### Core

| Boundary and disposition | Precise promise and owner | Owning decision and discriminating evidence |
| --- | --- | --- |
| `foundations-core-content-codec`: adequate | [`BlobDirectory` and `BlobDirectoryId::for_encoded_bytes`](../../../../crates/sea-core/src/blob.rs): “Hashes bytes as provided, without validating that they encode a canonical directory”; deterministic lexical encoding and explicit invalid-name rules | Hash factoring and borrowed-name decoding preserve versioned domain/bytes and validation order. `content_identities_use_versioned_blake3_domains` fixes hashes, `directory_identity_hashes_encoded_bytes_without_validation` distinguishes hashing from decoding, and `directory_encoding_has_stable_lengths_order_and_child_tags` fixes bytes, truncation, tags, UTF-8, duplicate/order errors and precedence. These are direct core tests, not store round trips. |
| `foundations-core-values`: adequate | [`EventPosition`](../../../../crates/sea-core/src/archive.rs): ordering is archive-local, with no required adjacency/start; opaque `Event` and membership-qualified `SessionCommittedEvent` | Clarified comments do not change representations. `event_positions_use_canonical_ordered_bytes` fixes non-symmetric big-endian bytes; `numeric_identities_preserve_all_nonzero_values` guards zero rejection/extrema. Membership interpretation remains a concrete session owner's responsibility, not a new core runtime policy. |
| `foundations-core-stream-adapters`: adequate | [`boxed_monitored_stream` and `map_monitored_stream`](../../../../crates/sea-core/src/monitored_stream.rs): source remains pinned, delivery updates cursor/latest, mapping preserves source progress including transform failure | Inline callbacks/progress and unconditional wrapper `Unpin` do not structurally pin those fields; only the separately allocated source is pinned. `adapters_accept_pinned_sources_positions_and_callback_captures` exercises non-`Unpin` inputs/captures; `delivered_items_keep_latest_and_backlog_status_coherent`, `mapped_source_errors_and_progress_do_not_transform_data_or_advance_cursor`, and transformation-error assertions independently distinguish routing/cursor decisions. |
| `foundations-core-invalidation`: adequate | [`InvalidationSource`](../../../../crates/sea-core/src/storage/invalidation.rs): first cause sticky; callback outside lock; registration drop unregisters | Renaming the registration counter does not alter identity allocation. `invalidation_is_sticky_synchronous_and_unregisters`, `callbacks_run_outside_the_source_lock`, and `racing_registration_and_invalidation_never_miss_the_terminal_cause` directly inspect effects/races. The added observer-panic documentation describes propagation, not callback isolation. |
| `foundations-core-view`: adequate | [`SeaView::append_batch`, `publish_snapshot`, and `load`](../../../../crates/sea-core/src/storage/mod.rs): checked prefix, dependency before publication, lookup policy without captured head | Count rename and documentation moves preserve decisions. `view_checks_dependencies_before_permissive_component_publication` cannot be satisfied by backend checks; `view_batch_dependency_error_follows_only_a_fully_successful_prefix` distinguishes dependency from append failures; `default_batch_stops_at_first_failure_without_retry` and `load_selects_without_a_head_and_defers_read_errors` retain narrow ownership. |
| `foundations-core-declaration-forwarding`: excluded from redundant new tests | [`StorageSurface` and `SeaStorage::open_view`](../../../../crates/sea-core/src/storage/mod.rs): classified error surface and optional exclusive view | Moving an unchanged trait and replacing an explicit `Option` match with `.map(SeaView::new)` do not introduce a consequential independent policy. Core composition tests and memory/file exclusivity tests remain relevant, but are not mislabeled as a direct unit test of this trivial syntactic forwarding. |
| `foundations-factory-pass-through`: adequate | [`PassThroughFactory` and `PassThroughSession`](../../../../crates/sea-core/src/factory.rs): “No suspension occurs between source completion and wrapping”; same handles/streams/errors and no cleanup owner | `factory_and_dynamic_facets_preserve_identity_capabilities_and_errors` checks identity, original error allocation and facet inputs; `abandoning_an_open_cancels_only_the_source_operation`, `close_returns_the_source_future_and_preserves_poll_and_drop_boundaries`, and `reads_and_loads_return_the_same_subscription_and_capability_allocations` inspect source-future/subscription pointers and drop counts. No conformance proxy or server is needed. |
| `foundations-policy-session-and-reader-admission`: adequate | [`DocumentPolicy` / `PolicyFactory`](../../../../crates/sea-core/src/policy.rs): pre-source session/live-reader admission; bounded reads and snapshot lookup bypass reader policy; reader permit spans pending load | `factory_admission_precedes_source_and_open_has_no_post_source_suspension` checks no source calls after refusal, shared document budget, identity and pending-open cancellation. `reader_refusal_covers_load_but_not_bounded_history_or_snapshot_lookup` and `reader_permits_cover_pending_loads_owned_streams_and_cancellation` check no source allocation, pending-load ownership, cancellation/failure release and independent author authority. |
| `foundations-policy-write-admission-and-order`: adequate | [`PolicySession`](../../../../crates/sea-core/src/policy.rs) and [`SeaAuthorSession`](../../../../crates/sea-core/src/session.rs): ordered first polls; permit acquired before suspension; FIFO released after first source poll; cancellation/failure ends wrapper authority only after source entry or rejection | `bounded_wait_ownership_is_acquired_before_suspension_and_released_on_drop` separates request/byte limits. `ordered_submits_release_fifo_after_source_entry_and_preserve_cancellation` observes source calls and live charges. `canceling_a_pre_source_head_releases_the_next_turn_without_revoking_authority`, `rejected_submit_terminates_clones_without_autonomous_close`, `policy_wait_failure_is_terminal_but_does_not_touch_source`, and `source_failure_rejects_a_queued_suffix_and_close_does_not_cancel_entered_work` discriminate each exit. |
| `foundations-policy-control-and-errors`: adequate | [`policy` module](../../../../crates/sea-core/src/policy.rs): close bypasses policy; already-entered work is not cancelled; source errors/handles preserved; control facets bypass write pressure | `close_wakes_policy_waits_across_clones_and_never_waits_for_admission` counts actual wakes while source close stays pending; `all_facets_preserve_source_errors_and_control_bypasses_pressure` checks original error allocation/classification and zero policy acquisition on control reads/publication/revocation. Source settlement is intentionally not promised by wrapper drop. |
| `foundations-policy-stream-termination`: repaired test | [`DocumentPolicy::ReaderPermit` and `PolicyStream`](../../../../crates/sea-core/src/policy.rs): drop admission on “observed stream termination”; source released on error or end, final progress retained | Existing `stream_maps_progress_and_classified_failure_then_immediately_releases_source` covers error only. New `stream_end_releases_source_and_reader_permit_and_preserves_final_progress` observes zero reader charges and exactly one source destruction before wrapper drop, and a progress change on the terminal source poll. No production behavior changed. |
| `foundations-policy-construction-docs`: repaired documentation | [Core policy guide](../../../../crates/sea-core/README.md#optional-document-policy) and [server defaults](../../../../crates/sea-webtransport-server/src/main.rs) | The original absolute no-production-enablement sentence was false: `configured_resource_policy(None)` returns true and `resource_policy_is_default_on_with_explicit_off_and_strict_values` pins it. Corrected core prose describes explicit embedded composition and links executable defaults; no competing default is introduced. |

### File Storage

| Boundary and disposition | Precise promise and owner | Owning decision and discriminating evidence |
| --- | --- | --- |
| `foundations-file-pressure-reservations`: adequate | [Durable pressure contract](../../../../crates/sea-file/README.md#durable-write-pressure): separate existing preparation/mutation budgets, charges through actual worker completion, no retained opening/worker | [`PreparationBudget`](../../../../crates/sea-file/src/common.rs) and [`durable::Executor`](../../../../crates/sea-file/src/durable.rs) now retain notification-bearing real semaphore permits, not a parallel accounting ledger. `preparation_limits_reject_excess_and_retain_worker_owned_charges`, `admission_limits_reject_without_running_and_release_after_settlement`, and `pressure_retains_cancelled_admission_until_worker_completion` isolate capacity/overflow/cancellation. `pressure_observes_overlapping_stages_before_worker_and_wakes_on_completion` verifies actual component wiring and distinct overlapping charges. |
| `foundations-file-pressure-waits`: repaired test | [`wait_below`](../../../../crates/sea-file/src/pressure.rs): “both independent budgets ... at or below ... ceilings”; registration before checking; wait drop removes only registration | `release_wakes_every_registered_waiter_without_requiring_another_poll` checks two retained wakes and no cancelled wake; `release_racing_first_poll_cannot_leave_waiter_asleep` bounds a release race; `pressure_keeps_stages_separate_and_waits_for_actual_last_owner` checks last-owner retention and invalid ceilings. Former zero-ceiling waits allowed requests to mask a missing byte predicate. New `wait_below_checks_each_dimension_and_stage_inclusively` isolates each dimension in each stage, checks inclusive equality, and rejects incorrect summation by allowing two independently in-limit stages whose combined totals exceed the ceiling. Single polls fail promptly without liveness timeouts. |
| `foundations-file-pressure-terminal`: repaired test | [`Signal::terminate` and pressure guide](../../../../crates/sea-file/src/pressure.rs): first terminal cause sticky; terminal transition wakes current waiters even with retained capacity | Strengthened `termination_wakes_waiters_and_remains_sticky_after_release` asserts a real wake for both failure and closure before repoll. Existing tests already check classification/stickiness; they did not independently prove the failure wake. `cancelled_shutdown_terminates_pressure_before_initialization_drains` separately proves the factory fence, actual shutdown wake, cancelled shutdown, and late initialization. |
| `foundations-file-pressure-opening-lifetime`: adequate | [Pressure guide](../../../../crates/sea-file/README.md#durable-write-pressure): handle retains no document/OS lock, never follows replacement; buffered returns `None` | `pressure_handles_do_not_retain_openings_or_follow_replacements` retains the observer across real reopen and distinguishes old/replacement states. `pressure_waiters_receive_terminal_failure_and_shutdown_without_capacity` and worker-panic tests prove real `Opening` wiring; core pressure tests own the notification primitive. |
| `foundations-file-publication-and-batches`: adequate | [Persistence model](../../../../crates/sea-file/README.md#persistence-model): durable publish after journal/cursor synchronization, buffered publish on bounded admission; no retry/dedup; ambiguous result for every potentially attempted entry | Event/head renames and shared snapshot encoder preserve layouts/visibility. `event_codec_preserves_wire_layout_with_and_without_tree` fixes bytes; `event_batch_positions_are_frame_offsets_with_one_journal_sync` checks exact offsets and empty-batch no-I/O; `uncertain_batch_reports_every_entry_without_publishing_to_readers` distinguishes prewrite rejection from every ambiguity phase. `blocked_batch_allows_executor_admission_and_published_reads` and `buffered_admission_reads_capacity_and_shutdown_precede_reopen` distinguish the policies. |
| `foundations-file-cursor-recovery`: adequate | [`Journal::remember_tail`](../../../../crates/sea-file/src/journal.rs) and [persistence model](../../../../crates/sea-file/README.md#persistence-model): validate before advancing cursor; reuse unchanged cursor; only incomplete final frame repairable | `last_record_offset` is a clarification, and `?` preserves atomic-file ambiguity/poisoning. `reopening_settles_once_and_only_replaces_changed_cursors` counts exact settlement/cursor barriers; `storage_cursor_skips_old_frames_without_a_sequencer_checkpoint` and `recovery_from_boundary_never_reads_older_payloads` localize lazy recovery. Consolidated `durable_append_reuses_inode_and_recovers_uncertain_prefix` retains partial-write exact length/truncation assertions formerly in the removed duplicate test. |
| `foundations-file-semantic-recovery`: adequate | [`State::recover_event` / `recover_snapshot`](../../../../crates/sea-file/src/storage.rs): matching physical identity, predecessor, dependencies and increasing snapshot position | `recovery_validates_semantics_after_framing_has_succeeded` injects validly encoded wrong-position/link/tree records and valid controls, preventing framing from masking semantic decisions. `recovery_rejects_records_from_other_storage_surfaces` exercises decoder dispatch. Historical partial-I/O and ambiguity deferrals remain resolved for their documented software model, not power-loss qualification. |
| `foundations-file-snapshot-index`: adequate | [Storage bounds](../../../../crates/sea-file/README.md#storage-bounds): logarithmic sparse lookup, linear streaming, constant cursor space; snapshot offsets private | Specialization from `FixedSize` to `RecordArchive<SnapshotRecord>` preserves checked frame arithmetic and ordering. `fixed_snapshot_layout_matches_encoding_and_checks_ordinal_arithmetic` checks both tree tags, exact width, malformed lengths and overflow; `snapshot_reads_are_linear_and_bounded_lookups_are_logarithmic` counts actual frame reads; `byte_offset_bounds_and_snapshot_lookup_survive_reopen_without_checkpoint` distinguishes arbitrary public bounds from physical offsets. |
| `foundations-file-content-availability`: adequate | [Persistence model](../../../../crates/sea-file/README.md#persistence-model): immutable closure; existing directory membership avoids journal writer; raw events keep tree IDs opaque | `content_record` removes only unused event lookup; `all_pending` remains a pending-overlay query. `directory_publication_preserves_closure_and_failed_deduplication_is_rejected` checks missing children/no parent and compatible reopen; `directory_deduplication_does_not_wait_for_writer` holds the real writer in both modes/reopen states; `directory_sync_failure_does_not_publish_parent` checks the publication fence. `buffered_resident_dependencies_and_checkpoint_keep_order_without_workers` discriminates the pending-overlay fast path. |
| `foundations-file-checkpoints`: repaired test | [`CheckpointStore::publish_checkpoint`](../../../../crates/sea-core/src/storage/checkpoint.rs): nonempty atomic replacement after prior mutations; no application snapshot; [file guide](../../../../crates/sea-file/README.md#persistence-model) differentiates buffered write/rename from durable synchronization | `checkpoint_failure_poisoning_and_recovery_are_document_owned` injects all four value phases independently of healthy journals; `direct_reopen_keeps_history_lazy_and_checkpoint_size_independent` compares unchanged journal/cursor/content; `torn_unpublished_values_never_replace_the_published_state` checks atomic selection. The remaining public empty-input decision lacked file-local evidence. New `empty_checkpoints_reject_before_worker_dispatch_without_replacing_state` publishes nonempty state for both policies, holds all workers, requires synchronous empty rejection without changing persisted bytes or archive heads, then releases workers and verifies checkpoint readback and reopen. Memory's test is not used as a proxy. |
| `foundations-file-executor-and-read-preservation`: adequate | [Cancellation/ownership guide](../../../../crates/sea-file/README.md#cancellation-and-failures): no lost accepted work; ordering before workers; completed streams retain opening; lazy bounds | Changed executor comments/test helpers preserve underlying responsibilities. `completed_streams_retain_exclusive_opening_until_dropped`, `read_bounds_use_the_lazy_initialization_head_for_both_archives`, preparation/durable accounting tests, and cancelled worker tests still inspect their exact owners. No new runtime test is needed merely for the removed one-use helper or `const`-generic test parameter. |

### Memory, Standalone Content, and Conformance

| Boundary and disposition | Precise promise and owner | Owning decision and discriminating evidence |
| --- | --- | --- |
| `foundations-memory-ownership`: adequate | [Ownership](../../../../crates/sea-memory/README.md#ownership): registry retains closed documents; components retain exclusive opening, streams/handles retain data; never invalidates on factory shutdown | `create_document` moves the registry's already-owned `Arc` instead of cloning it. `factory_identity_and_component_clone_lifetimes`, `event_read_retains_only_its_archive_until_dropped`, `snapshot_stream_survives_reopening_without_retaining_handle_cycles`, and `independent_opening_never_invalidates_on_factory_shutdown_or_drop` inspect weak ownership, real reopen, and live post-shutdown use. |
| `foundations-memory-publication-and-recovery`: adequate | [Publication and reads](../../../../crates/sea-memory/README.md#publication-and-reads): immutable transitive closure, synchronous settled append, successful prefix on exhaustion, sparse increasing snapshots, fail inconsistent reopen | README simplification and `empty_event` fixture retain these promises. `content_publication_preserves_closure_and_deduplicates` and `content_publication_rejects_missing_children_without_mutation` inspect actual maps. `exhausted_batch_retains_and_notifies_only_its_successful_prefix` checks result count, payload, wake and unchanged suffix. `snapshot_component_enforces_provenance_order_and_sparse_lookup`, missing-event/root tests, `event_handles_revalidate_membership_and_reopening_checks_item_positions`, and `reopen_rejects_mismatched_snapshot_positions` bypass view checks and directly diagnose owners. |
| `foundations-memory-read-contracts`: adequate | [Read contract](../../../../crates/sea-memory/README.md#publication-and-reads): lazy exclusive/inclusive ranges, future-bound rejection except empty ranges, cursor only on delivery, live across reopen | `read_bounds_are_lazy_and_readers_do_not_prevent_reopening` and `live_read_wakes_across_reopening_tracks_backlog_and_cancels_independently` distinguish initialization, future bounds, waker replacement and subscriber cancellation. `memory_archive::finite_reads_check_sparse_bounds_progress_and_completion` covers sparse range matrix. Relocated BTreeMap optimization rationale changes no behavior and remains beside its field. |
| `foundations-content-encoded-identity`: adequate | [`ContentStore::put_directory/get_directory`](../../../../crates/sea-content-addressed/src/lib.rs): reject configured size before publication; validate canonical encoding and requested identity on reads | Reusing encoded bytes avoids recomputation without changing hash domain. `rejects_directory_bounds_and_corruption` checks exact actual/max, no created object on rejection, inclusive limit, stored upper bound and decode-first error; `rejects_directory_identity_mismatch` supplies valid foreign encoded bytes. Core golden vectors independently guard the delegated hash, avoiding a mutually agreeing round-trip oracle. |
| `foundations-content-publication-and-closure`: adequate | [Publication/trait guide](../../../../crates/sea-content-addressed/README.md): ordinary owned staging cleanup, destination sync including races, trait transitive verification, canonical provenance, low-level publication does not check closure | Clarified traversal and shortened duplicate limits prose preserve the interrupted-file limitation immediately above. `publication_cleanup_preserves_unowned_staging_files`, `existing_and_racing_publications_propagate_directory_sync_failure`, `closure_provenance_reopen_and_missing_dependency`, and `trait_publication_and_resolution_validate_transitive_content` inspect the exact staging/sync/closure/namespace owners. Isolated test-root changes alter no assertions. Namespace synchronization deferral stays closed under its software contract; deployment qualification remains excluded. |
| `foundations-conformance-oracle-scope`: adequate | [Conformance README](../../../../crates/sea-conformance/README.md): shared view, sparse snapshot and session laws; explicitly not local cancellation, corruption, fencing, ownership or durability evidence | All unchanged suite assertions and helpers were inspected against relocated prose. `run_view_conformance` tests ordered publication/reopen and compatible handles; `run_snapshot_archive_conformance` tests exact/inclusive sparse selection/order; `run_session_conformance` tests explicit initialization, exact publication retry, equal independent submissions, bounded/live replay and peer-close isolation. These remain substitutability evidence, not replacements for the local tests above. Session consumers run in coordinator integration. |

### Inherited Deferrals and Exclusions

The [0018 inventory](../../0018/quality-inventory.md), [sequential audit](../../../QUALITY_AUDIT_REPORT.md), [deferral reconciliation](../../../DEFERRAL_RECONCILIATION.md), and [known issues](../../../../KNOWN_ISSUES.md) were inspected.
The applicable partial-I/O, ambiguous append, cursor/recovery, namespace synchronization, and completed-stream ownership findings were rechecked against current local evidence above.
Old crash controls remain superseded; no new public fault-control interface was introduced.
Unattributed native connection timeout remains open; pressure changes do not supply causal evidence to close it.
Browser disconnect, generic client error-state and cache-reader lifetime findings belong to the other assigned owners; no competing edit was made.
Physical power-cut qualification, garbage collection/retention redesign, authentication and external namespace mutation remain explicitly excluded by the charter, not mislabeled as tested.
Revisit these exclusions only on the documented deployment/retention requirements or a new attributable failure.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Evidence gap | Audited policy completion and pressure termination assertions | `PolicyStream::poll_next` normal-end arm; `termination_wakes_waiters_and_remains_sticky_after_release` previously used `poll!` and direct await | Existing error/closure tests could pass with these distinct decisions broken | Added immediate source/permit drop, final progress, and actual pre-repoll wake assertions | Assert owner-local effects before another poll or drop can mask them |
| Documentation mismatch | Compared core policy construction prose with server defaults | Server `resource_policy_is_default_on_with_explicit_off_and_strict_values`; core README claimed no production enablement | Embedded construction and executable defaults were conflated | Narrowed core claim and linked authoritative server guide | Recheck consumer composition after default changes |
| Validation routing | Inspected guarded runner and registered task definitions | Initially neither explicitly set `TMPDIR`; existing file tests use `std::env::temp_dir()` | Paused source edits after first batch, continued read-only audit | Coordinator set worktree-local fixtures; first batch passed before resumed edits; final batch also passed; fixture directory empty afterward | Check filesystem destinations as well as checkout identity |
| Evidence gap | Continued full incremental audit during validation pause | All nonterminal pressure waits used zero ceilings; no file-local empty checkpoint test | Two additional exact owning decisions could regress without diagnostic local failures | Added single-poll dimension/stage/equality checks and pre-dispatch checkpoint rejection/preservation checks; complete assigned suite passed | Do not allow one predicate or a different backend to mask the owning decision |

## Contract and Integration Friction

No unresolved source/protocol semantic choice.
Core source-session ordering/settlement remains the sequencer/transport owner's responsibility after first source poll; pressure remains advisory, not an admission reservation.
The server default was inspected read-only solely to correct the owned core documentation.
The task environment prerequisite is resolved; no local implementation or validation blocker remains.

### Root-guide evidence for the coordinator

Root guides were inspected read-only and remain coordinator-owned.
`WORKSPACE_ARCHITECTURE.md` still lists retired `sea-file-durable` separately and calls `sea-file` buffered-only.
Current `sea-file` exports both `buffered::FileStorage` and `durable::DurableStorage`, each implementing `SeaStorage`; consolidation did not change journal bytes.
`SEA_ARCHITECTURE.md` describes snapshot lookup as backward traversal, but snapshots use fixed-width ordinal arithmetic and binary search, with the final ordinal for latest lookup and a private advancing stream cursor.
Event lookup still follows predecessor links over journal byte-offset positions.
Policy is implemented rather than merely proposed: `sea-webtransport-server/src/resource_policy.rs` composes `PolicyFactory` for `ReaderShedding`, and `src/main.rs` enables it by default with explicit opt-out.
`PassThroughFactory` remains available; it is not the only production composition.
The core README repair makes direct embedded construction distinct from executable defaults.

Inspected manifests establish these direct production dependencies:

| Crate | Direct production dependencies |
| --- | --- |
| `sea-core` | `async-trait`, `blake3`, `bytes`, `futures-core`, `futures-util`; wasm adds `blake3`'s `wasm32_simd` feature |
| `sea-file` | `sea-core`, `async-trait`, `bytes`, `futures-util`, `thiserror`, `tokio` |
| `sea-memory` | `sea-core`, `async-trait`, `bytes`, `futures-util`, `thiserror`, `tokio`; native Tokio is workspace-defined, wasm uses version `1.47.1` with `sync` |
| `sea-content-addressed` | `sea-core`, `async-trait`, `bytes`, `thiserror` |
| `sea-conformance` | `sea-core`, `bytes`, `futures-util` |

`sea-conformance` is dev-only for file/memory, and Tokio is dev-only for content-addressed.
No foundation implementation crate has a production dependency on another foundation implementation crate.

## Human Interventions

None beyond the already-approved charter and dispatch.
No configuration or semantic question was sent to the user.

## Measurements

Performance/benchmark and dependency measurements: not applicable; no performance or dependency change.
Final source formatter stat: core README 3 changed lines, core policy tests 61 changed lines, file pressure tests 29 changed lines, file storage tests 45 added lines; report size reflects the audit evidence.
Wall time, tokens and model identity: unknown.
Execution environment: Linux, pinned Rust 1.98.1, registered dedicated process tasks, default worktree-local Cargo target.

## Proposed Decisions

No shared decision is proposed.
Existing contracts authorize the focused test repairs and documentation correction.

## Candidate Skills and Process Changes

The existing quality procedure already requires exact owning-decision assertions; no new skill is needed.
A task-runner preparation checklist should establish project-local filesystem-test destinations when delegates are forbidden from writing outside the worktree.
This is a local routing lesson for coordinator evaluation, not an unilaterally changed coordination policy.

## Remaining Work and Risks

1. Coordinator retains and hashes the final frozen patch, including this completed report, against the recorded kickoff.
2. Coordinator performs directly affected dependent tests, applicable canonical documentation/policy/integration gates, and fresh independent review before acceptance.
3. Coordinator reconciles the reported root-guide facts and direct dependency graph without changing the foundation contracts.
4. Record every source-patch disposition and accepted checkpoint mapping before worktree cleanup.

The only intentional tracked artifacts are the five paths listed above.
No local commit, push, lockfile change, background process, installed dependency, or generated consumer was created.
Ignored Cargo build/rustdoc outputs remain under the worktree-local target; the fixture directory is empty.
Local execution validation passed, and no assigned incremental boundary or confirmed local repair remains blocked.
This is not a claim that independent review or integrated acceptance has occurred.
Future incremental review should revisit policy facets/lifecycle, pressure predicate/accounting changes, publication/cursor representation changes, or new failures—not repeat the unchanged full inventory without a trigger.
