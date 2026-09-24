# Iteration 0018: persistence Report

Status: complete; ready for coordinator integration and independent review
Branch: `rust-service-iteration-0018-persistence`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0018-persistence`
Base commit: kickoff `37fa0c0e4a119f94844837818a810ef84f9f59f8`; approved source `73aae4414baff2e635f6ccdcbd2b4cb507d62bfd`
Final commit: none; coordinator owns commits.
Agent or owner: persistence implementation agent.
Model and tool version: unknown.
Instruction source: [persistence instructions](instructions/persistence.md) at kickoff `37fa0c0e4a119f94844837818a810ef84f9f59f8`.
Session or transcript reference: coordinator session `4cc33478-17d9-40d5-9640-a53d9778b2c5`.
Started and finished: started 2026-09-24T01:01:08Z; completed 2026-09-24T01:18:57Z.

## Outcome

Reviewed all consequential responsibilities in `sea-file`, including unchanged and previously accepted boundaries.
The responsibility map below accounts for every source module and the cross-process test target.
Found one implementation defect: completed file streams released exclusive opening ownership contrary to the documented lifetime.
Repaired that decision and added eleven focused tests for it and previously nondiscriminating local evidence.
The final nonmutated source passed formatting, 59 unit tests, one process test, and strict package Clippy.
No public API, file format, shared contract, dependency, or lockfile was changed.

One optional negative-control run deliberately suppressed the pending-read wake relay and stalled the full test task.
The mutation was restored, and the coordinator verified runner `834907` → Cargo `834961` → owned test process `835555`, sent TERM only to `835555`, and verified all three exited.
Fresh restored-source run `2026-09-24T01-18-47.395Z-868278` passed formatting, 59 unit tests, one process test, strict Clippy, and the lockfile guard.
The incident remains inconclusive negative-control evidence, not an outstanding blocker.
No shell, nested agent, or commit was used.

## Hypothesis Results

Initial hypothesis: every consequential `sea-file` responsibility needs an accurate contract and discriminating owner-local test.
Full reassessment includes unchanged and previously accepted boundaries, without a review cutoff.
Planned checks are the assigned guarded task (formatting, all-target/all-feature `sea-file` tests, strict package Clippy), with coordinator-owned workspace gates.
No substantive implementation changes preceded this provenance record.

Full source inspection found that `common::BlockingRead` drops its source on `Ready(None)`.
This contradicts the existing README promise that “even unpolled or completed streams must be dropped before reopening.”
Added `storage::tests::completed_streams_retain_exclusive_opening_until_dropped` before changing production behavior.
It drops all components, completes both event and snapshot streams, and checks `Busy` until each stream is dropped, under both policies.
This directly discriminates source ownership in the blocking adapter, unlike the existing live-stream lock test.
Red run `2026-09-24T01-03-55.558Z-807218` passed formatting, then exited 101 with exactly the new completed-stream test failing at its post-completion `Busy` assertion (48 existing tests passed).
Repaired the blocking adapter to retain the completed source and remember completion without dispatching another worker.

Other supported evidence gaps were owner-local guards for preparation and durable-admission bounds, blocking-worker cancellation ownership, snapshot provenance/advancement, lazy read bounds, factory lifecycle/sticky failures, semantic recovery, buffered coalescing/prefix flush, and a wake racing with a pending blocking poll.
These tests exercise the relevant decision directly, rather than counting conformance invocation or another component's success.
Existing contracts were sufficient; no new persistence guarantee was invented.

The inherited `sea-file/partial-io-failure-recovery` conclusion from [0017](../../0017/quality-inventory.md) was rechecked against the current separate buffered/durable policies and journal implementation.
Its fault, poisoning, and tail-policy evidence remains adequate.
Its deferred read-lifetime and wakeup areas were inspected, not excluded.
The [reconciliation](../../../DEFERRAL_RECONCILIATION.md) references retired durable-module locations; current ownership was established from current source, not those old paths.

## Deliverables and Commits

- `src/common.rs`: retain completed sources and stop dispatch after completion; localized preparation, worker-capacity/cancellation, and pending-wake tests.
- `src/storage.rs`: local opening-lifetime, factory lifecycle, semantic recovery, lazy bounds, and snapshot provenance/order tests.
- `src/durable.rs`: bounded-admission and detached-settlement test.
- `src/buffered.rs`: event coalescing/control ordering and captured-prefix flush tests.
- `README.md`: document the added executable evidence and completion's no-extra-worker property.
- This report: complete boundary inventory, observed evidence, and precise outstanding execution cleanup.
- No commits; all six modified paths are owned by this workstream.

## Validation Evidence

Assigned `runTask` discovery and direct invocation succeeded in loaded workspace `/workspaces/FluidFramework`.
Baseline run `2026-09-24T01-01-17.052Z-797224` asserted cwd `/workspaces/FluidFramework-rust-service-iteration-0018-persistence/rust-service`, branch above, full kickoff HEAD above, and clean status.
`cargo fmt --all -- --check`, `cargo test -p sea-file --all-targets --all-features`, and `cargo clippy -p sea-file --all-targets --all-features -- -D warnings` each exited 0.
Tests: 48 unit tests and one cross-process lock test passed.
Task-reported evidence directory: coordinator session `files/persistence/2026-09-24T01-01-17.052Z-797224`.
No shell or nested agent was used.

All task invocations reported the same absolute cwd, expected branch, and full kickoff HEAD.
Status listed only the crate files and this report.
Successful task completion includes the script's final shared-lockfile-diff guard.

| Run identifier | Result |
| --- | --- |
| `2026-09-24T01-01-17.052Z-797224` | Baseline: format 0; 48 unit + 1 process tests, exit 0; Clippy 0; clean checkout. |
| `2026-09-24T01-03-55.558Z-807218` | Red ownership regression: format 0; test 101, only `completed_streams_retain_exclusive_opening_until_dropped` failed after completion; 48 passed. |
| `2026-09-24T01-04-13.829Z-809485` | Ownership repair: all gates 0, 49 unit + 1 process tests. |
| `2026-09-24T01-05-09.268Z-811565` | Preparation/admission additions: all gates 0, 51 unit + 1 process tests. |
| `2026-09-24T01-06-08.554Z-818945` | Bounds/provenance/blocking additions: all gates 0, 54 unit + 1 process tests. |
| `2026-09-24T01-07-09.379Z-824087` | Factory/semantic-recovery additions: all gates 0, 56 unit + 1 process tests. |
| `2026-09-24T01-08-27.230Z-830390` | Buffered ordering/flush additions: all gates 0, 58 unit + 1 process tests. |
| `2026-09-24T01-09-11.875Z-833521` | Final nonmutated source: all gates 0, 59 unit + 1 process tests. |
| `2026-09-24T01-09-27.779Z-834907` | Optional wake-relay mutation: format 0; test output/completion unavailable; **inconclusive**, not a passing or accepted failing test. Mutation restored without starting another command. |
| `2026-09-24T01-18-47.395Z-868278` | Coordinator rerun after verified owned-process cleanup: all gates 0, 59 unit + 1 process tests, lockfile guard passed on restored source. |

Formatting-only attempts `2026-09-24T01-05-58.259Z-817161`, `2026-09-24T01-06-54.220Z-822309`, `2026-09-24T01-08-13.475Z-830106`, and `2026-09-24T01-09-02.235Z-832953` exited 1 before tests.
Applied exactly the returned rustfmt layouts and immediately reran the assigned task.
These were formatting failures, not product failures.

The task owns machine-local evidence below `/home/node/.copilot/session-state/4cc33478-17d9-40d5-9640-a53d9778b2c5/files/persistence/<run>/`.
For the last passing run, directly inspected the nonempty `result.json`: correct run/cwd/branch/HEAD, exactly three command entries, exit 0 and null signal for each, and attributable `0.log`/`1.log`/`2.log` paths.
The returned task output contained the unit/process counts and explicit final `PASS`.
Coordinator acceptance must additionally parse JSON and check the retained files' sizes; format-success logs may legitimately be empty.
At incident inspection, the incomplete mutation directory had only `0.log` and `result.json`, with no completed test entry.
`getTaskOutput` returned blank and was not treated as evidence.
After coordinator cleanup, directly inspected the new run's nonempty `result.json`: expected run/cwd/branch/HEAD and owned modified paths, exactly three correctly specified command entries, all exit 0 with null signal.
The coordinator supplied explicit confirmation of test counts, final lockfile guard, and termination of all three owned processes.
At 2026-09-24T01:22:31Z the sessions owner reported a surprising passing dependency-sensitive test and noted that assigned tasks share `/workspaces/.cargo-target`.
Its cause is not established; a shared target alone does not establish stale artifacts.
Persistence's own regression failed before repair and its added test names/counts appeared in subsequent runs, which identifies the changed top-level test artifact but does not independently establish dependency isolation.
Coordinator should use an isolated integration target for canonical acceptance while investigating the sessions owner's evidence.
Editor diagnostics reported no errors in the checked Rust files; Cargo/Clippy, not editor diagnostics, is the executable evidence.

For the actual ownership defect, the unmodified implementation failed the new test and the repair passed it.
Other new tests discriminate with isolated state/capacity/ordering assertions as detailed below.
The optional wake mutation supplied no completed negative-control result and is not claimed as such.
Canonical workspace gates, rustdoc, documentation/policy checks, and integration are coordinator-owned and not replaced by these package checks.

## Behavioral Contracts and Test Layers

### Responsibility map

The review owner for all rows is persistence; consumers are direct storage callers, composed `SeaView`, sequencer recovery, and host lifecycle management.
Risk ordered the review, not eligibility: persistence/recovery and cancellation first, followed by publication/ownership, bounds/limits, and deterministic layout/complexity.

| Surface inspected | Consequential responsibilities |
| --- | --- |
| [journal.rs](../../../../crates/sea-file/src/journal.rs) | Stable locks; creation; frame boundaries/checksums; tail policy; in-place batch synchronization; uncertainty; cursors; historical checked reads; error classification. |
| [atomic_file.rs](../../../../crates/sea-file/src/atomic_file.rs) | Checksummed whole values; pending versus published names; synchronized rename publication; old/new checkpoint selection. |
| [common.rs](../../../../crates/sea-file/src/common.rs) | Factory wrappers; preparation budgets; shared blocking capacity; cancellation ownership; read task/wake/progress forwarding; completed stream ownership. |
| [buffered.rs](../../../../crates/sea-file/src/buffered.rs) | Bounded FIFO waiting/admission; atomic process-local visibility; record coalescing; bounded turns/fairness; failure wakeup; prefix flush and shutdown drain. |
| [durable.rs](../../../../crates/sea-file/src/durable.rs) | Synchronous reservation/FIFO registration; bounded retained inputs; document-before-worker ordering; detached work; prefix barriers and shutdown admission. |
| [storage.rs](../../../../crates/sea-file/src/storage.rs) | Factory identities/canonical namespaces/lifecycle; openings and poison/invalidation; handles; content closure/deduplication; event/snapshot/checkpoint publication and recovery; pending overlay; typed record codecs/cursors; lazy bounds/progress/wakes. |
| [lib.rs](../../../../crates/sea-file/src/lib.rs), [Cargo.toml](../../../../crates/sea-file/Cargo.toml), [locking.rs](../../../../crates/sea-file/tests/locking.rs) | Reexports/build composition and the distinct cross-process OS-lock boundary. No extra behavioral implementation is hidden in the entrypoint or manifest. |

### Inventory rows

Contract abbreviations link precise current owning text:
[P](../../../../crates/sea-file/README.md#persistence-model) is Persistence Model;
[O](../../../../crates/sea-file/README.md#ownership-and-reads) is Ownership And Reads;
[C](../../../../crates/sea-file/README.md#cancellation-and-failures) is Cancellation And Failures;
[L](../../../../crates/sea-file/README.md#limits) is Limits.
Test abbreviations are exact module paths: `S` = `storage::tests`, `J` = `common::journal::tests`, `A` = `common::atomic_file::tests`, `B` = `buffered::tests`, `D` = `durable::tests`, `M` = `common::tests`.
All listed focused tests ran in the final successful task.
“Repaired (test)” means a confirmed local evidence gap was repaired without changing that behavior.
The common revisit trigger is a change to the named owning decision/contract or a concrete failing incident; special triggers appear where needed.

| Boundary | Precise relied-upon contract | Owning decision and discriminating local evidence | Disposition |
| --- | --- | --- | --- |
| sea-file/partial-io-failure-recovery | [C]: “An I/O error after writing begins is `Ambiguous` and poisons the opening”; [P]: buffered recovery rejects incomplete tails, durable recovery truncates an incomplete final frame. | `Journal::append_batch` sets uncertainty before I/O; `Opening::lock` blocks observations. `S::journal_faults_preserve_prefix_and_block_uncertain_observations` independently injects pre/partial/post-write faults under both policies and checks classification, blocked observations, and recovered head. `J::exclusive_journal_round_trip_and_tail_policies` directly distinguishes incomplete-tail policies. | already adequate; inherited boundary rechecked |
| sea-file/frame-validation | [P]: “Frames contain a length, its complement, a BLAKE3 content hash, and the record bytes”; [L]: “Malformed lengths and complete checksum failures are errors, including at the final frame.” | `recover_tail` distinguishes incomplete bytes from complete invalid frames. `J::recovery_repairs_every_incomplete_tail_but_rejects_complete_corruption` tests every truncation and flips every byte in a final complete frame; `J::checked_boundaries_and_prefix_probes_match_persisted_frames` checks overflow/probes. | already adequate |
| sea-file/stable-lock-and-creation | [O]: “The sidecar is never replaced or removed”; [P]: “An unpublished creation `.pending` file is discarded even if it contains valid frames.” | `lock_journal`, `staging_file`, and `publish` preserve ownership and select the published name. `J::interrupted_creation_does_not_publish_an_invalid_header`, `J::durable_append_reuses_inode_and_recovers_uncertain_prefix`, and process test `append_keeps_exclusive_lock_across_processes` fail independently on wrong creation/lock decisions. | already adequate; process test remains necessary for OS process isolation |
| sea-file/cursor-and-reopen-settlement | [P]: “This settlement happens once after tail recovery”; “An unchanged validated cursor is reused.” | `Journal::open` synchronizes selected recovery once; `remember_tail` skips unchanged cursor values. `J::reopening_settles_once_and_only_replaces_changed_cursors` asserts actual barrier/cursor counters and uncertain-tail selection. | already adequate |
| sea-file/lazy-history | [P]: “Opening validates the named tail records and recovers only the suffix after that boundary”; “There is no historical address table to load or rewrite.” | Cursor-driven `recover_tail` seeks only the suffix. `J::recovery_from_boundary_never_reads_older_payloads` instruments actual bytes read; `J::storage_cursor_skips_old_frames_without_a_sequencer_checkpoint` checks cursor size and addressed old data; `S::direct_reopen_keeps_history_lazy_and_checkpoint_size_independent` checks independent content/history. | already adequate |
| sea-file/semantic-recovery | [P]: “Complete corrupt suffix frames or missing required dependencies fail recovery rather than producing gaps”; “Each journal rejects record types belonging to another storage surface.” | `State::recover_event` validates physical position, predecessor, and root; `recover_snapshot` checks increasing position and both dependencies. New `S::recovery_validates_semantics_after_framing_has_succeeded` supplies correctly encoded records with wrong links/positions/missing roots and valid controls, so framing cannot mask missing semantic checks. Existing `S::recovery_rejects_records_from_other_storage_surfaces` verifies factory dispatch to the correct decoder. | repaired (test) |
| sea-file/atomic-values-and-checkpoints | [P]: “An unpublished replacement is ignored by recovery; atomic rename selects the complete old or new value”; “Checkpoint publication neither reads nor rewrites content, journals, or storage cursors.” | `atomic_file::read/write`, `Opening::write_value`, and checkpoint publication own old/new selection and poison. `A::torn_unpublished_values_never_replace_the_published_state` enumerates every incomplete replacement; `S::checkpoint_failure_poisoning_and_recovery_are_document_owned` injects four phases independently of journal failures; `S::direct_reopen_keeps_history_lazy_and_checkpoint_size_independent` compares unchanged history/cursor/content bytes. | already adequate |
| sea-file/content-closure-and-deduplication | [P]: “directory publication checks child availability before publishing its hash-addressed file”; “Reusing a stored directory checks membership without taking the journal writer lock.” | `FileBlobs::put_directory` fast path and `put_directory_blocking` closure check; `Opening::publish_content` fence. `S::directory_publication_preserves_closure_and_failed_deduplication_is_rejected`, `S::directory_sync_failure_does_not_publish_parent`, and `S::directory_deduplication_does_not_wait_for_writer` cover missing children, failure, no duplicate sync, and a deliberately held writer in both policies and reopened state. Blob payload identity/readback and corrupt content are checked in `S::direct_reopen_keeps_history_lazy_and_checkpoint_size_independent`. | already adequate |
| sea-file/event-batch-publication | [P]: “Buffered event batches become visible together at admission; durable batches become visible only after journal and cursor synchronization”; “Empty batches perform no I/O.” | `FileEvents::append_batch` reserves offsets/pending state; `append_batch_blocking` publishes only after settlement. `S::buffered_admission_reads_capacity_and_shutdown_precede_reopen` checks pending reads/final offsets; `S::blocked_batch_allows_executor_admission_and_published_reads` blocks durable synchronization and checks the old head; `S::event_batch_positions_are_frame_offsets_with_one_journal_sync` tests duplicate payloads, all offsets, empty batch, and exact sync count. | already adequate |
| sea-file/batch-error-suffix | [P]: “An uncertain durable batch returns `Ambiguous` for every submitted entry”; “pre-write rejection attempts no entries.” | `append_batch_blocking` returns a full ambiguous suffix but a single pre-write rejection. `S::uncertain_batch_reports_every_entry_without_publishing_to_readers` checks exact cardinality, every classification, invisible state, reader errors, and recovered prefix under all four fault phases. | already adequate |
| sea-file/snapshot-provenance-and-order | [O]: “foreign-document handles are rejected even for equal identities”; [P]: “snapshots must advance their event position.” | Buffered `FileSnapshots::append` and durable `append_blocking` each call compatibility and advancement checks. New `S::snapshots_reject_foreign_dependencies_and_nonadvancing_positions` uses equal blob and event identities from another document, tests both dependency handles independently, then rejects duplicate/older positions with unchanged head under both policies. | repaired (test) |
| sea-file/snapshot-ambiguity | [C]: uncertain writes poison lookups until recovery. | Snapshot journal publication must not expose a lost acknowledgment as safe absence. `S::snapshot_post_sync_ambiguity_recovers_without_duplicate_publication` injects snapshot-only `AfterSync`, requires lookup failure, and observes the one recovered snapshot. | already adequate |
| sea-file/snapshot-index-and-layout | [L]: “A bounded snapshot lookup takes logarithmic frame reads, and streaming the full snapshot history takes linear frame reads with constant cursor space.” | `FixedSize`, checked ordinal arithmetic, snapshot `floor/upper_bound`, and `SnapshotCursor` separate physical offsets from event identities. `S::fixed_snapshot_layout_matches_encoding_and_checks_ordinal_arithmetic`, `S::snapshot_reads_are_linear_and_bounded_lookups_are_logarithmic`, and `S::byte_offset_bounds_and_snapshot_lookup_survive_reopen_without_checkpoint` check widths/overflow, actual frame-read counts, sparse nonrecord bounds, and reopen. | already adequate |
| sea-file/handle-and-raw-event-separation | [P]: “Raw event components treat tree identities as opaque, while the view establishes availability before publication”; [O]: handles have provenance but no writer ownership. | `FileBlobs::ensure_available` rejects foreign paths; raw missing-dependency writes do not advance trusted recovery past the bad event. `S::raw_event_dependencies_fail_recovery_and_foreign_handles_are_rejected` checks the buffered raw path and foreign equal identities; semantic recovery test checks the common missing-root decision directly. Existing directory reopen test revalidates a retained compatible handle. | already adequate |
| sea-file/completed-stream-ownership | [O]: “even unpolled or completed streams must be dropped before reopening.” | `BlockingRead::poll_next` previously dropped `source` on `Ready(None)`. New `finished` state retains it and bypasses workers. `S::completed_streams_retain_exclusive_opening_until_dropped` checks unpolled/completed event and snapshot owners independently under both modes, plus synchronous repeated completion with all workers held. Red/green proves the exact regression. | repaired (implementation and test) |
| sea-file/lazy-read-bounds | [O]: “Nonempty ranges reject bounds beyond their initialization head; reversed/equal ranges complete without waiting”; “Reads initialize lazily.” | `storage::read` checks bounds only at first poll. New `S::read_bounds_use_the_lazy_initialization_head_for_both_archives` constructs streams before append, then validates later initialization and independently rejects upper/lower future bounds for both archives/policies. Equal empty bounds beyond head are covered by the completed-owner test; sparse selection remains covered by existing snapshot tests. | repaired (test) |
| sea-file/read-progress-and-notification | [O]: “Progress advances only with delivery, reports backlog, and remains coherent when discovering new appends”; “Normal commits and uncertain writes wake readers outside the state lock.” | `observe`, `FileRead`, and reader registrations determine coherent delivery/progress. `S::progress_stays_coherent_when_live_reader_discovers_new_backlog` checks the exact delivered/head/status tuple; `S::live_readers_wake_on_commit_and_uncertain_write` checks wake/error termination. New `M::blocking_read_preserves_a_wake_racing_with_pending_completion` exercises the adapter's pending-result race without archive logic. | repaired (wake-race test); progress evidence already adequate; optional negative control inconclusive and execution settled |
| sea-file/preparation-budget | [L]: “Content preparation has a separate 128-request/16-MiB budget acquired before encoding or metadata waits; worker-owned validation retains its charge after caller cancellation.” | `PreparationBudget::reserve` acquires independent request/byte permits and an `Arc` retains both. New `M::preparation_limits_reject_excess_and_retain_worker_owned_charges` isolates each limit, overflow, retained clone, and complete reclamation; it does not rely on mutation queue saturation to reject excess preparation. | repaired (test) |
| sea-file/blocking-worker-budget | [Common factory contract](../../../../crates/sea-file/src/common.rs): “Waiting operations do not occupy blocking workers; in-flight work retains its permit through cancellation.” | `common::blocking` waits before spawning and moves the permit into the worker. New `M::blocking_capacity_is_retained_until_cancelled_callers_work_settles` cancels a waiting call without execution, then aborts a caller after worker entry and checks occupied capacity until release. `S::worker_limits_are_shared_and_policy_specific` and `S::worker_limits_reject_invalid_configuration_before_namespace_creation` discriminate shared/default/invalid limits. | repaired (test) |
| sea-file/durable-admission-and-order | [C]: “Durable requests preserve FIFO admission through cancellation, acquiring document order before factory worker capacity”; [L]: “Durable saturation rejects before acceptance.” | `Executor::enqueue/register_order` reserves synchronously and detaches accepted work. New `D::admission_limits_reject_without_running_and_release_after_settlement` isolates request/byte saturation, oversized/unpolled no-op, detached completion, and returned capacity. `D::queued_document_mutations_leave_workers_for_reads_and_other_documents` holds document order while allowing cold work. | repaired (limit test); ordering evidence already adequate |
| sea-file/durable-flush-and-cancellation | [C]: “Factory flush waits for accepted work; shutdown stops admission and drains it, including work whose callers were cancelled.” | `Executor::flush` registers a FIFO barrier independently of later admissions. `D::flush_captures_prefix_before_later_admission` blocks later work while earlier flush completes; `D::accepted_waiter_survives_cancellation_and_shutdown_drains_it` checks detached admitted work and shutdown rejection. `S::cancelled_batch_retains_opening_until_worker_settles` protects the actual document lock, not just semaphore accounting. | already adequate |
| sea-file/buffered-admission-and-fairness | [L]: “Buffered callers wait FIFO for queue capacity, with a separate limit of 128 waiting calls and 16 MiB”; bounded drain turns yield capacity. | `Executor::admit/publish/turn` checks limits before publication and drains bounded work. `B::bounded_waiting_cancellation_shutdown_and_failure_wake_admission`, `B::shutdown_wakes_bounded_waiters_before_worker_settlement`, and `B::hot_document_yields_worker_capacity_to_cold_document` directly check byte/waiter pressure, cancelled no-op, terminal wakeup, and cold-document execution before the hot backlog ends. | already adequate |
| sea-file/buffered-coalescing-and-prefix-flush | [C]: “Buffered workers coalesce consecutive event jobs without a timer and drain finite turns”; [buffered `flush` contract](../../../../crates/sea-file/src/buffered.rs): “Captures and waits for the accepted prefix.” | New `B::event_coalescing_preserves_records_and_control_order` holds worker capacity, queues event/event/control/event, and asserts exact groups, sequence, and released accounting. New `B::flush_waits_for_its_prefix_not_later_admission` blocks later work while captured-prefix flush must return. | repaired (tests) |
| sea-file/buffered-dependency-and-checkpoint-order | [C]: “acceptance atomically publishes state and transfers ownership to the queue”; [L]: checkpoints await their own write and participate in mutation order. | Pending overlay and buffered tasks establish resident closure before OS writes. `S::buffered_resident_dependencies_and_checkpoint_keep_order_without_workers` holds every worker, publishes resident nested content/event/snapshot, checks exact variable offsets and checkpoint wait, then drains/reopens the same closure. | already adequate |
| sea-file/factory-lifecycle-and-sticky-failure | [C]: “Buffered background failure ... poisons ... flush, and shutdown”; “shutdown stops admission and drains it.” | `Factory::create_blocking/open_blocking`, shared `closed`, and `failed` retain identity/admission/failure authority independently of weak openings. New `S::factory_identity_shutdown_and_sticky_failure_are_opening_independent` checks distinct allocations, malformed/absent identities, clone create/open and all mutation rejection after shutdown, then drops a poisoned opening before checking flush/shutdown ambiguity. | repaired (test) |
| sea-file/invalidation-and-panic | [O]: “Notification is sticky, covers racing and late registrations, and runs without another archive poll”; [C]: “Worker panics and join failures also poison the opening and wake readers, even after caller cancellation.” | `Opening::poison/lock` and `FileEvents::observe_invalidation` register/emit independent failure. `S::independent_invalidation_covers_poison_shutdown_and_late_registration` tests both policies/reasons and late callbacks; `S::worker_panic_poisons_observations_and_wakes_readers_even_after_cancellation` injects worker unwind with and without caller cancellation, checking head/resolve/read errors and recovery. Shared registration race/removal implementation belongs to `sea-core`, not a duplicate file-owned implementation. | already adequate |
| sea-file/namespace-synchronization | [P]: “On Unix, namespace synchronization stops when the parent belongs to a different filesystem”; synchronization is bottom-up. | `sync_namespace` checks each ancestor's device before synchronization and propagates errors. `S::namespace_sync_stops_at_filesystem_boundary` uses `/proc` without writing to it; `S::namespace_sync_is_bottom_up_and_propagates_failure` records exact visited paths and fails the parent callback. | already adequate |
| sea-file/qualification-and-trivial-composition | [power-loss model](../../../../crates/sea-file/README.md#power-loss-model): “Actual power-cut qualification remains outstanding”; checksums cannot prove hardware durability. | Reviewed limits, reexports, factory macro delegation, manifest, error classification, and retired-format disclaimer. Thin delegation/classification needs no duplicate tests beyond callers; hardware durability, migration, retention, and external namespace modification are not promised or qualified by the local tests. | excluded from additional repair; production qualification requires a separately approved platform campaign |

### Layer ownership and coverage

Every new test is in the responsible module or owning crate; no broad integration assertion was added to substitute for practical local evidence.
`file_conformance` and `durable_conformance` still check shared substitutability of view/sparse-archive laws, not local diagnosis.
The cross-process locking test remains because an in-process lock test cannot establish process isolation.
Browser, generated-binding, and transport suites do not own file-policy decisions and belong to coordinator integration.
The README's existing lifetime promise justified the only production change; it did not require a new shared semantic decision.
No media integrity, latency, total-process memory, or production power-loss guarantee is inferred from these tests.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Confirmed defect | Compared completed-source lifetime with the existing ownership promise | New test failed at the post-completion `Busy` assertion before the fix and passed afterward | Previously reopening could succeed while completed streams remained alive | Retain source plus explicit completion state | Exercise every documented lifetime state; a live-stream test does not cover completed ownership |
| Local evidence gaps | Compared precise owner decisions against existing tests and conformance | Eleven added tests listed above; final passing run reports 59 unit tests versus 48 baseline | Limits, flush prefix, semantic validation, and lifecycle decisions now fail diagnostically near their owner | Test-only repairs preserve existing contracts | A queue or parser at another layer must not be allowed to satisfy the assertion |
| Process friction | Assigned task only checks formatting | Four format-only failures, then exact returned rustfmt changes | Extra task invocations; no product failure | All final formatting checks passed | An assigned formatter task would avoid manual application of format-only output |
| Inconclusive negative control | Temporarily suppressed the adapter's pending-wake relay and ran the full package task | `2026-09-24T01-09-27.779Z-834907` stopped returning attributable completion after test start; output retrieval blank | Other existing unbounded live-read tests may hang | Mutation restored; coordinator verified runner 834907 → Cargo 834961 → test 835555, terminated only 835555, verified all exited, and completed fresh passing run 868278 | Mutation checks that can stop progress need a narrow filter and a coordinator-provided process deadline |

## Contract and Integration Friction

No new shared API or format decision.
The source repair affects only the file adapter's existing ownership contract.
Coordinator owns release-note/changeset applicability and any shared-path change; this workstream did not write those paths.
Task execution is available and guarded, but optional mutation cancellation had no delegate tool path; coordinator-owned cleanup resolved the incident.
Attempted parent messaging through the known session failed because it resolves to the current chat; the root session identifier is not a `write_agent` target.
A sibling broadcast retained the precise execution warning.

## Human Interventions

No new human semantic decisions were required.
The supplied full-coverage, all-local-repairs scope and process-task-only execution policy were preserved.
Coordinator intervention settled the optional mutation execution through a verified process tree and a fresh successful validation task.

## Measurements

Pinned Rust environment: 1.98.1 per assigned instructions; task commands used the repository toolchain.
Linux worktree and branch guards are recorded above.
Baseline 48 unit tests; final successful run 59 unit plus one process test, unit runtime 0.49 seconds in returned output.
No benchmark, power-cut experiment, dependency change, or size claim.
Exact active effort, model identity, and tokens: unknown.

## Proposed Decisions

No shared semantic decision proposed.
The completed-stream repair restores an existing explicit promise.
A future task-runner change to support narrow filtered mutation checks and deadlines is coordinator-owned, not an implementation prerequisite.

## Candidate Skills and Process Changes

Before mutation-testing liveness code, ensure the assigned task can filter to a watchdog-bounded owner-local test and has an external process deadline.
Do not use an unbounded complete suite as a negative control when disabling wakeups may intentionally prevent unrelated tests from finishing.
Retain blank-output/incomplete evidence as inconclusive, never infer a failure/passing result from a still-running task.
No skill/configuration file was edited.

## Remaining Work and Risks

Full assigned source inspection is complete; there is no unreviewed crate/module slice and no deferred localized implementation repair.
All production edits and eleven new tests passed in the final nonmutated run.
The transient mutation has been restored; intentional worktree artifacts are exactly the six modified paths listed above.
No unknown/generated file, dependency, or lockfile modification appeared in successful guarded task status.

No current execution blocker remains.
Coordinator verified and settled the mutation task's exact process tree, then successfully reran `rust-quality-0018-persistence` on restored source.
The optional negative control remains inconclusive; no further mutations or production edits are planned or needed for this handoff.
Actual ownership red/green evidence is complete.
Coordinator must perform machine-readable evidence verification, canonical integration/documentation/policy gates, changeset assessment, independent review, and commit.
Resolve the subsequently reported shared-target provenance concern with isolated integration evidence; no additional persistence mutation or package command was launched in response.
The known filesystem/power-loss qualification risk remains explicitly outside this iteration's repair scope.

Closeout supplement: the coordinator found the late shared-target observation above still uncommitted during clean-worktree verification and preserved it in a separate report-only commit.
Canonical integration run `native-2026-09-24T01-54-33.207Z-952386` used the integration checkout's own `rust-service/target` and passed all seven gates.
The coordinator directly verified that result's identity and exits, and the complete integration suite later passed on `314248a7fb6`.
This resolves acceptance provenance without claiming the earlier shared target caused a Cargo defect.
