# Iteration 0020: sessions Report

Status: complete; frozen for coordinator integration and independent review
Branch: `rust-service-iteration-0020-sessions`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0020-sessions`
Base commit: `b06b46be6b88723ea64f4ef1a77a5895781c21bc` (actual kickoff; approved source `8a3889518d537d6a85bd55cc31a1b7404eee78e7`).
Final commit: None; coordinator owns validation and commit of the frozen uncommitted patch.
Agent or owner: sessions workstream agent.
Model and tool version: Model unknown; probe reports `rustc 1.98.1 (48a229cea 2026-09-01)`.
Instruction source: [sessions instructions](instructions/sessions.md) at kickoff.
Session or transcript reference: Coordinator evidence session `181f92e1-5a08-499a-a256-9487a2adb7ff`.
Started and finished: Started 2026-09-29T19:02:47Z; source frozen after the 2026-09-29T19:08:53Z validation; report finish timestamp unknown.

Provenance recorded before substantive edits.
Guarded task `sea-0020-sessions-probe` verified the exact branch, kickoff HEAD, clean status, and pinned compiler.
Its log and incremental patch are in coordinator session files under
`2026-09-29T19-02-53.256Z-sessions-probe-34cd5678-e147-4f87-988c-2d4622223268`.
Scope is every consequential changed boundary since `8bd1e64ebfa` in the four assigned crates, plus applicable inherited triggers; no fixed sample.
Initial hypothesis: changed owning decisions may lack precise contracts or discriminating owner-local evidence.
Planned checks: guarded package-scoped formatter, all-target/all-feature strict Clippy, complete all-feature tests and strict rustdoc for all four packages; coordinator-owned integrated canonical gates.

## Outcome

Completed full incremental coverage of all four assigned crates.
The probe identified 18 changed files since `8bd1e64ebfa`; the coverage map below accounts for their consequential boundaries and applicable inherited triggers.
Five localized evidence gaps were repaired with three new tests and two extensions to existing tests.
Production behavior, public contracts, manifests, lockfiles, and dependencies are unchanged.
No semantic decision or cross-owner repair is required.
The final four-crate task passed 118 unit tests, one compression doctest, formatting, strict all-target/all-feature Clippy, and strict rustdoc.
Integrated canonical gates and fresh independent review remain coordinator-owned acceptance work, not claimed complete here.

## Hypothesis Results

Confirmed localized evidence gap in the new cache-pressure action:
`lagged_shedding_rechecks_targets_and_preserves_siblings_and_history` only makes one reader eligible at each revocation.
It proves target rechecks and exclusions, but cannot discriminate oldest-unread selection from arbitrary eligible-reader selection.
The public `LiveCachePressure::revoke_lagging` contract explicitly promises the oldest unread cursor.
Repair: a synchronous owner-local test with three differently lagged live readers, deliberately placing the oldest cursor between the other registration identities.

Confirmed localized evidence gap in the replaced encryption admission gate:
the existing cancellation test starts after admission, while the FIFO test does not cancel a queued caller.
The documented admitted-only terminal rule requires a cancelled gate waiter to leave authority and nonce state untouched.
Repair: a deterministic wrapper-local test cancelling a polled gate waiter, then admitting its successor and checking nonce count and continued authority.

Confirmed localized evidence gap at the extracted `Runtime::require_recovery` boundary:
baseline reconciliation tests assert mutation poison, while cache tests inject `Terminal` directly or invalidate through the backend observer.
Neither diagnoses an omitted cache termination call when application/control reconciliation itself fails.
Repair: exercise both owner paths through the cache-enabled fault seam and inspect retention and pressure termination before polling the reader.

Clarified read-lifetime promises also exposed two precise assertion gaps.
Existing direct-close coverage exercised live reads, not a finite read with undispatched data.
Existing never-polled cache-registration cleanup exercised shutdown, not membership closure.
Strengthened the existing owning tests with those states; no implementation or semantics changed.

## Deliverables and Commits

Frozen uncommitted patch against `b06b46be6b88723ea64f4ef1a77a5895781c21bc`:

- `rust-service/crates/sea-encryption/src/session.rs`: pre-admission cancellation regression.
- `rust-service/crates/sea-sequencer/src/live_cache.rs`: oldest-unread selection regression.
- `rust-service/crates/sea-sequencer/src/live_cache_tests.rs`: failed-reconciliation termination regression and never-polled membership-close assertions.
- `rust-service/crates/sea-sequencer/src/session.rs`: initialized finite-read closure assertions.
- This report.

No untracked deliverables, commits, temporary source mutations, dependency installs, or pushes were made.
The coordinator must capture/hash this frozen diff before integration and record its accepted commit mapping.
The probe's `incremental.patch` is comparison evidence for the audit window, **not** this repair patch.

## Validation Evidence

All tasks were invoked directly with workspace `/workspaces/FluidFramework`, through the assigned guarded external runner.
Its actual cwd was `/workspaces/FluidFramework-rust-service-iteration-0020-sessions/rust-service`.
Every run checked branch, kickoff HEAD, status, and unchanged Cargo/pnpm lockfiles.
Evidence is retained under `/home/node/.copilot/session-state/181f92e1-5a08-499a-a256-9487a2adb7ff/files/`, in the following nonempty `output.log` files:

| Run directory | Result |
| --- | --- |
| `2026-09-29T19-02-53.256Z-sessions-probe-34cd5678-e147-4f87-988c-2d4622223268` | Clean kickoff, pinned compiler, and complete incremental diff. |
| `2026-09-29T19-05-32.673Z-sessions-format-737063d4-5c91-49cd-b835-6b8a46889c80` | First repair batch formatted. |
| `2026-09-29T19-05-43.411Z-sessions-check-c0c78cd5-d715-4628-b5b6-4c9fdc855c3d` | First batch passed all four-package checks; 117 unit tests plus one doctest. |
| `2026-09-29T19-07-29.061Z-sessions-format-86412785-6a15-4515-a99c-49580d9938fe` | Second batch formatted. |
| `2026-09-29T19-07-33.676Z-sessions-check-463f42ce-97ef-47e9-98c5-54395950c23d` | Exit 101: strict Clippy requested `LiveCacheStats::default()` rather than `Default::default()` in the new assertion; no tests ran. |
| `2026-09-29T19-07-48.002Z-sessions-format-fa9cfc28-6fe4-4e73-8f3b-cf3b41015f24` | Explicit default type formatted. |
| `2026-09-29T19-07-52.662Z-sessions-check-2b1a3348-b754-4554-a3b0-347fee13738e` | Second batch passed all four-package checks. |
| `2026-09-29T19-08-48.179Z-sessions-format-5350b3f9-569a-4722-a145-daadfd18579b` | Final read-lifetime assertions formatted. |
| `2026-09-29T19-08-53.239Z-sessions-check-c5ac3d3f-c684-41a6-ac15-8615b258c17b` | Final source passed every assigned check; 7 compression, 19 encryption, 81 sequencer, and 11 signals unit tests plus one compression doctest. |
| `2026-09-29T19-17-43.075Z-sessions-check-3e0c20ec-0e1a-4316-b384-d36848b4ff77` | Revalidated the unchanged frozen source after coordinator added command-local `TMPDIR`; all checks and the same 118 unit tests plus one doctest passed. |

The final revalidation runner creates and uses
`/workspaces/FluidFramework-rust-service-iteration-0020-sessions/rust-service/target/quality-fixtures`
as `TMPDIR` for every subprocess.
Runner source and retained log were inspected.
This resolves the sibling-reported fixture-path concern without changing any session source or task ownership.

Exact commands executed by the formatter/check tasks:

```text
cargo fmt -p sea-sequencer -p sea-signals -p sea-compression -p sea-encryption
cargo fmt -p sea-sequencer -p sea-signals -p sea-compression -p sea-encryption -- --check
cargo clippy -p sea-sequencer -p sea-signals -p sea-compression -p sea-encryption --all-targets --all-features -- -D warnings
cargo test -p sea-sequencer -p sea-signals -p sea-compression -p sea-encryption --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-sequencer -p sea-signals -p sea-compression -p sea-encryption --all-features --no-deps
git diff --exit-code -- Cargo.lock ../pnpm-lock.yaml
```

Closest exact selectors for the repaired boundaries, all executed as part of the complete package suites:

```text
cargo test -p sea-encryption --all-features session::tests::cancelled_gate_waiter_preserves_authority_and_does_not_encrypt -- --exact
cargo test -p sea-sequencer --all-features session::live_cache::tests::lagged_shedding_selects_the_oldest_unread_cursor_not_registration_order -- --exact
cargo test -p sea-sequencer --all-features session::fault_tests::live_cache_tests::failed_reconciliation_terminates_cache_pressure_and_unpolled_retention -- --exact
cargo test -p sea-sequencer --all-features session::fault_tests::live_cache_tests::revocation_drop_close_and_stale_capabilities_reclaim_without_polling -- --exact
cargo test -p sea-sequencer --all-features session::tests::direct_reads_close_with_membership_and_load_policies_preserve_replay -- --exact
```

No mutation experiment was needed or run.
The new tests discriminate their decisions through contradictory state assertions: the middle registration must be selected first; a cancelled gate waiter must consume no nonce and leave authority usable; failed reconciliation must synchronously erase retention and expose `RecoveryRequired` before a reader poll; close must suppress buffered finite delivery and remove never-polled cache registration.
These checks do not rely on conformance or downstream normalization.
No JSON evidence was retained; JSON parsing/domain validation is not applicable.
Coordinator still owns the documentation checker, repository policy, final workspace gates, and extended lifecycle/consumer validation.

## Behavioral Contracts and Test Layers

### Coverage map and inherited triggers

| Crate | Incremental surfaces and completed review |
| --- | --- |
| `sea-sequencer` | New factory; pressure observer and shedding; maintained accounting; extracted recovery termination; renamed floor/reference/fence state; checkpoint/codec documentation; fixture consolidation; clarified read and snapshot lifecycle. Covered below, including all affected existing fault/cache tests. |
| `sea-encryption` | FIFO author gate and target-specific Tokio dependency; fixed-size cipher construction; header-buffer/name simplification; key/nonce/lookup contracts; preparation ownership; adapter/fixture consolidation and policy composition. Covered below. Native validation passed; generated WASM composition belongs to coordinator integration. |
| `sea-compression` | Documentation-only window: application/control distinction, error classification, wrapper removal, and relocation of adapter prose into included crate README. Current focused transform/forwarding/error tests rechecked; no repair needed. |
| `sea-signals` | Conflict-error documentation and removal of a redundant room-isolation assertion. Existing receive conflict and full same-identity cross-room matrix rechecked; no repair needed. |

Priority was pressure/ownership and admission cancellation, then publication/recovery, then facade and documentation preservation.
The [0018 inventory](../../0018/quality-inventory.md), [0019 manifest](../../0019/manifest.json), [sequential audit](../../../QUALITY_AUDIT_REPORT.md), and [known issues](../../../../KNOWN_ISSUES.md) informed triggers.
The new pressure policy triggers reassessment of prior cache lifetime, handoff, and driving rows; the FIFO gate triggers author-cancellation reassessment.
Fixture and naming simplifications trigger assertion-preservation checks, not wholesale re-testing of unchanged implementation details.
No inherited unresolved semantic decision applies within these four owners.

### Boundary dispositions

Source/test abbreviations:
[S](../../../../crates/sea-sequencer/src/session.rs) = `session::tests`;
[F](../../../../crates/sea-sequencer/src/fault_tests.rs) = `session::fault_tests`;
[L](../../../../crates/sea-sequencer/src/live_cache_tests.rs) = `session::fault_tests::live_cache_tests`;
[C](../../../../crates/sea-sequencer/src/live_cache.rs) = `session::live_cache::tests`.
All tests below are in the owning crate unless explicitly described as composition evidence.
Each adequate row identifies a particular owner decision and a test assertion that fails when that decision alone regresses.
The common revisit trigger is a change to that decision, its documented promise, or the named discriminator; more specific triggers appear below.
Validation for every row is the final four-crate task, except explicit scope exclusions.

| Boundary / disposition | Precise contract and consumers | Owning decision and closest discriminating evidence |
| --- | --- | --- |
| `sequencer-factory-allocation`: already adequate | [Factory module](../../../../crates/sea-sequencer/src/factory.rs): “Factory construction and cloning retain the document without allocating a membership.” Consumers: typed local factories/hosts. | `LocalSessionFactory::open_session` passes the reference to the existing allocator and returns that session's ID. `factory::tests::factory_construction_and_cloning_do_not_open_memberships` checks invalid-reference rejection, exact returned ID equality, and consecutive IDs across construction/clone; generic helper enforces no `Storage: Clone` requirement. Cancellation adds no independent owner or await after allocation; reservation cancellation remains owned/tested by the sequencer, below. |
| `sequencer-factory-facet-composition`: already adequate | [Runtime guide](../../../../crates/sea-sequencer/README.md#runtime): pass-through preserves “concrete availability handles and all session facets”; dropping a handle is not automatic cleanup. Consumers: decorated session hosts. | `factory::tests::pass_through_forwards_all_facets_with_local_capabilities_and_shared_close` checks concrete blob/directory/position handles, snapshot boundary/root, live load suffix, bounded read, clone continuation after factory/other handle drop, idempotent close, and independent sibling admission. This local typed composition test is distinct from shared session conformance. |
| `sequencer-admission-order-and-prefix`: already adequate | [Ordered append](../../../../crates/sea-sequencer/README.md#ordered-append-and-recovery): “submissions first polled in sequence keep that order across capacity waits”; cancellation before admission preserves membership, after admission ends its prefix. Consumers: cloned authors. | Pipeline admission, failed-state checks and suffix discard remain unchanged by fixture consolidation. F::`buffered_submissions_preserve_first_poll_order_with_exhausted_budget` checks receipt and stored payload order with exhausted cooperative budget; F::`capacity_wait_preserves_same_session_order_and_failure_prefix` prevents smaller bypass and checks exact append counts; F::`capacity_wait_cancellation_preserves_authority_and_close_needs_no_admission_lock` proves cancellation and close do not retain an admission lock; F::`same_session_batch_rejects_invalid_entry_and_suffix_but_settles_prepared_prefix` preserves the accepted prefix. |
| `sequencer-admission-bounds-and-backing`: already adequate | [Runtime guide](../../../../crates/sea-sequencer/README.md#runtime): bounded 256-entry/4-MiB admitted ring and compact backing; receipts follow application of committed metadata. Consumers: memory-budgeted hosts. | F::`delayed_persistence_admits_a_bounded_ring_and_publishes_only_after_commit` measures occupancy before release and rejects early visibility; `byte_bound_backpressures_before_the_entry_limit` isolates byte capacity; `admitted_inputs_do_not_retain_oversized_caller_backing` observes weak backing release; `idle_ready_submissions_apply_before_receipts_and_rejection_ends_authority` checks renamed `recent_positions` at receipt and no retry after rejection. No allocation-policy change was made. |
| `sequencer-retained-work-and-terminal-prefix`: already adequate | [Settlement](../../../../crates/sea-sequencer/README.md#submission-identity-and-settlement): “Dropping a caller future does not drop that backend future or treat cancellation as settlement”; never resubmit. Consumers: recovering authors. | F::`cancelling_before_or_after_commit_retains_the_same_backend_future_until_settlement` gates before/after persistence and checks one backend invocation plus exact history; `failed_append_and_cancelled_ack_end_announced_prefix_before_later_work` checks final departure order; `failed_reconciliation_prevents_terminal_leave_until_recovery` checks no false leave or released unresolved view. Documentation correctly excludes internal checkpoint publication from retained-future settlement. |
| `sequencer-recovery-cache-termination`: repaired evidence | [Cache guide](../../../../crates/sea-sequencer/README.md#experimental-shared-live-cache): failure terminates the opening with a classified error and ownership is released without another subscriber poll; [`require_recovery`](../../../../crates/sea-sequencer/src/session.rs) stops mutation and terminates cached delivery without settling pending work. Consumers: cached readers/policy observers. | New L::`failed_reconciliation_terminates_cache_pressure_and_unpolled_retention` exercises application and membership-control reconciliation failure, checks runtime poison, zero retained ownership before polling, synchronous pressure error, no buffered delivery, and no later append/leave. An omitted cache call in the extracted helper now fails locally even though baseline mutation-poison tests would pass. |
| `sequencer-checkpoint-and-reservation`: already adequate | [Internal checkpoints](../../../../crates/sea-sequencer/README.md#internal-checkpoints): exact applied prefix/reservation, threshold before the next batch/control, failure/cancellation requires reopening. Consumers: recovering runtimes. | Checkpoint codec tests retain exact applied/floor/reservation values, nonempty announcements, every truncation and invalid bounds. F::`checkpoint_failure_stops_tail_growth_before_next_submission` checks zero append beyond threshold; `cancelled_reservations_require_recovery_before_allocating_again` and `failed_reservations_expose_no_authority_and_recovery_skips_committed_ranges` distinguish pre/post-write outcomes and expose no membership; S::`allocation_reserves_before_exposure_and_skips_unused_ids_after_restart` covers persisted reservation, restart skip and numeric exhaustion. |
| `sequencer-codec-replay-and-membership`: already adequate | [Codec module](../../../../crates/sea-sequencer/src/codec.rs): malformed marker/identity/position/trailing bytes are corrupt; [Runtime](../../../../crates/sea-sequencer/README.md#runtime) restores departures before fresh authority. Consumers: replay and recovery. | `codec::tests::submission_round_trip_rejects_every_truncation_and_trailing_bytes` isolates zero ID/unknown tag and legacy format; `membership_encoding_preserves_kind_and_rejects_malformed_records` checks control kinds. S::`recovery_rejects_inconsistent_floor_reservation_and_membership_metadata` asserts each exact corruption reason; S::`announced_membership_orders_departure_on_close_and_recovery` and F::`interrupted_recovery_departures_are_not_duplicated_on_reopen` retain exact retry/immutable metadata/departure order. Fixture extraction still creates a distinct view and runtime each time. |
| `sequencer-reference-floor`: already adequate | [Minimum reference floor](../../../../crates/sea-sequencer/README.md#minimum-reference-floor): durable nondecreasing committed floor, 1024-entry lag window, 64-entry debounce, opaque positions, only final batch candidate advances. Consumers: writers and snapshot replay. | Renames to `declared_reference`/`recent_positions` preserve the actual inputs. S::`floor_debounce_counts_events_not_numeric_position_units` checks nonuniform positions; `idle_members_cannot_pin_the_debounced_reference_window` pins exact 64/128 advances; F::`floor_advances_only_with_the_committed_event` separates rejection/ambiguity; `batch_floor_does_not_invalidate_a_prepared_lower_reference` catches speculative batch advance; S::`checkpoint_at_head_recovers_without_live_policy_history` checks historical resolution after clearing the window. |
| `sequencer-snapshot-authority-and-lineage`: already adequate | [Snapshots](../../../../crates/sea-sequencer/README.md#snapshots): expected parent and advancing position, exact root retry, lowest numeric eligible ID, fresh checked fences, old registration cannot revoke replacement. Consumers: snapshot publishers. | `Publishers` and publication checks are preserved by `last_issued_fence` rename. S::`snapshot_parent_position_and_publisher_fences_are_session_policy` checks unauthorized/missing/stale fences, client suppression, parent, exact retry and root conflict plus old-lease drop; `closing_the_nominee_transfers_snapshot_authority_with_a_fresh_fence` checks first/second nomination and increasing fence. S::`membership_positions_resolve_and_publish_snapshot_boundaries` separately protects Joined/Left boundary resolution. |
| `sequencer-snapshot-settlement`: already adequate | [Snapshots](../../../../crates/sea-sequencer/README.md#snapshots): returned ambiguity resolves only on exact lookup; revoked registration cannot cancel an admitted publication. Consumers: publishers recovering lost receipts. | F::`snapshot_cancellation_and_ambiguity_preserve_publication_order` checks retained future order, one backend call, committed/absent/failed lookup cases; `revoking_publisher_does_not_cancel_an_admitted_snapshot` drops registration during blocked persistence, then checks the stored root and rejection of later publication. The extracted helper preserves failure poisoning. |
| `sequencer-storage-read-lifetime`: repaired evidence | [Delivery](../../../../crates/sea-sequencer/README.md#delivery): close terminates “initialized storage-backed reads, including finite reads”; lazy reads preserve progress/error classifications. Consumers: bounded and live replay. | Strengthened S::`direct_reads_close_with_membership_and_load_policies_preserve_replay` initializes a finite source without consuming its event, then requires close to suppress delivery and leave the cursor unchanged. The same test retains load-policy and peer independence checks. S::`concurrent_sessions_deliver_each_submission_once_with_lazy_errors_and_progress` independently checks direct source progress and lazy invalid bounds. No change to `StorageRead` was needed. |
| `cache-maintained-ownership-accounting`: already adequate | [Cache guide](../../../../crates/sea-sequencer/README.md#experimental-shared-live-cache): counts/bytes maintained on ownership changes, no scan when sampling; required entries retained, no claims means no entries/capacity; downstream handles excluded. Consumers: pressure policy. | `State::stats/reclaim`, subscribe/attach/remove/close/terminate update counters. C::`maintained_counts_cover_historical_handoff_and_session_cleanup` independently recounts successful/failed/idempotent handoff and cleanup; `pressure_targets_are_soft_and_dequeue_does_not_wake_sibling_readers` checks byte retention across multiple claims and downstream handles; `publication_and_readers_share_decoded_backing_without_another_payload_copy` checks exact backing and final reclamation. Constant-time sampling is established by direct inspection of field reads, not timing assertions. |
| `cache-pressure-thresholds-and-waits`: already adequate | [`LiveCachePressure`](../../../../crates/sea-sequencer/src/live_cache.rs): above means either count strictly exceeds, below means both at/below; register before sampling, cancellation removes only the wait; pressure wakeups separate from reader readiness. Consumers: resource-policy waiters. | `wait_for` subscribes before `current()` and uses one complementary predicate. C::`pressure_targets_are_soft_and_dequeue_does_not_wake_sibling_readers` tests equality and each independent count, zero targets and no reader notification on dequeue; `pressure_wakes_all_waiters_and_cancellation_removes_registration` checks actual wake count and registration removal; `pressure_registration_racing_publication_cannot_strand_a_waiter` bounds a registration/publication race. L::`soft_pressure_does_not_block_accepted_writes_and_drains_on_dequeue` proves the API does not become write admission. |
| `cache-pressure-weak-lifetime-and-terminal`: already adequate, supplemented by repaired runtime wiring above | [Cache guide](../../../../crates/sea-sequencer/README.md#experimental-shared-live-cache): observer retains no storage/cache entries, stays opening-local, reports classified failure/closure, terminal is not pressure relief. Consumers: independently held observers. | Weak upgrade is not held across an await. C::`pressure_waits_do_not_retain_the_cache_and_termination_is_not_readiness` checks strong count, cache destruction while waiting, each terminal variant, first-cause stickiness and zero ownership. `cache_is_opt_in_and_requires_independent_invalidation` checks no observer on default openings. These tests localize observer mechanics; the new reconciliation test supplies the distinct real-runtime wiring evidence. |
| `cache-oldest-reader-shedding`: repaired evidence | [`revoke_lagging`](../../../../crates/sea-sequencer/src/live_cache.rs): atomically recheck targets and revoke one live claim with “the oldest unread cursor”; leave historical and caught-up readers alone. Consumers: policy shedding. | New C::`lagged_shedding_selects_the_oldest_unread_cursor_not_registration_order` creates three distinct lagging cursors with the oldest in the middle registration, checks each successive victim, surviving claims and exact reclaimed entries/bytes. Choosing first/last registration or greatest cursor fails. Existing `lagged_shedding_rechecks_targets_and_preserves_siblings_and_history` still owns target equality, byte-only excess, historical and caught-up exclusions. Selection remains under the cache lock and notifications after unlock by direct inspection. |
| `cache-subscription-isolation-and-close`: repaired evidence | [Cache guide](../../../../crates/sea-sequencer/README.md#experimental-shared-live-cache): cached unbounded reads register at creation; membership closure terminates even never-polled subscriptions; neutral revocation cannot close authors/siblings/publisher authority. Consumers: cached readers. | Strengthened L::`revocation_drop_close_and_stale_capabilities_reclaim_without_polling` checks an additional never-polled registration is removed by membership close and reports `Closed` immediately, while sibling author still works. Existing assertions retain stale-capability and independent-drop coverage. `snapshot_load_handoff_and_subscription_revocation_leave_publisher_and_author_intact` separately checks surviving snapshot authority. |
| `cache-publication-handoff-progress-and-driving`: already adequate | [Cache guide](../../../../crates/sea-sequencer/README.md#experimental-shared-live-cache): committed publication only, exact delivered cursor, gap-free missed handoff, progress does not advance cursor, no archive polling after catch-up, retained work driveable without parked runtime/lifecycle guards. Consumers: live readers. | Revisited because pressure changes ownership/reclamation. L::`historical_finite_load_and_missed_handoff_preserve_exact_delivered_cursor` interleaves replay with reclaimed publication; `cached_progress_discovers_retained_and_new_frontiers_before_delivering_items` pins frontier/drain order; `caught_up_live_delivery_never_polls_archive_and_shares_exact_payload_backing` checks source poll counts/pointers; `cancellation_retained_append_is_driven_only_by_live_reader_after_ack` checks wake/commit/guard release; `parked_control_driver_releases_guards_and_survives_another_cancelled_drainer` preserves control wake transfer. No extra duplicated progress tests added. |
| `signals-receive-conflict`: already adequate | [`SignalError::Conflict`](../../../../crates/sea-signals/src/lib.rs): duplicate identity **or another pending receive**; [core signals](../../../../crates/sea-core/src/signals.rs) owns single pending receive, cancellation safety and close wake. Consumers: room connections. | `next_signal` uses `try_lock` and terminal-first selection. `tests::cancelled_receive_preserves_messages_and_close_wakes_receive` directly checks `Conflict`, cancellation without message loss and close wake. The changed error documentation now matches this existing discriminator. |
| `signals-document-isolation-and-test-consolidation`: rejected missing-coverage hypothesis | [Relay contract](../../../../crates/sea-signals/README.md#contract): document-bound live routing, missing target is no-op, no replay. Consumers: hosted rooms. | Removed assertion sent only to a nonexistent target, so it was weaker than `tests::document_scoped_routing_preserves_recipients_and_envelopes`, which uses matching identities in two rooms and checks exact recipients/envelopes for both delivery modes and broadcast/existing/missing targets. Renamed `payload_limits_missing_target_and_drop` retains size and drop checks. Production routing, admission, backing and overflow code is unchanged; no queue/lifetime trigger justifies repeating accepted 0018 repairs. |
| `compression-transform-contract-relocation`: already adequate | [Behavior](../../../../crates/sea-compression/README.md#behavior): application payloads/blob leaves transformed; membership/directory/snapshot metadata pass unchanged; encoded identity space; source errors/progress preserved; complete frames with no decoded bound. Consumers: compressed sessions. | `session::tests::payload_transforms_preserve_control_metadata_and_stored_tree_identities` compares raw encoded blob/event with decoded values and unchanged control/directory data; `load_and_coordination_forward_handles_fences_and_registration_lifetime` checks selected handles, direct suffix, fence/drop/revoke and close forwarding; `malformed_stored_frames_are_corrupt_and_advance_delivery_progress` distinguishes codec corruption from source `InvalidPosition`. `tests::rejects_truncated_and_extended_frames` guards exact-frame parsing. Removed module prose remains discoverable via its crate-doc link; no contract was weakened. |
| `encryption-envelope-and-lookup`: already adequate | [Envelope and errors](../../../../crates/sea-encryption/README.md#envelope-and-errors) and [`KeyProvider`/`NonceSource`](../../../../crates/sea-encryption/src/lib.rs): authenticate header/context/key ID/nonce/payload; lookup precedes authentication; missing keys/nonces unavailable; fresh nonce per payload/key. Consumers: stored ciphertext readers/writers. | Fixed-size cipher construction and shared header buffer preserve AAD. `tests::key_identifier_is_authenticated_even_when_two_identifiers_resolve_to_the_same_key` isolates AAD from key lookup; `wrong_key_tampering_and_context_share_corruption_errors` retains every consolidated case; truncation/header tests guard parser validation; rotation and missing-active/historical-key tests check key availability. Zeroize derives and dependency are unchanged; no unsafe freed-memory test added. |
| `encryption-transform-and-forwarding`: already adequate | [Reads and composition](../../../../crates/sea-encryption/README.md#reads-and-composition): application/blob contexts, visible control metadata, ciphertext handles, on-poll decrypt without rewinding delivery, snapshot/fence forwarding. Consumers: encrypted local/composed sessions. | `session::tests::encrypted_payloads_preserve_control_metadata_and_stored_tree_identities` checks raw ciphertext identities/context and exactly two nonce calls for blob+application, none for metadata; `load_and_coordination_forward_handles_fences_and_registration_lifetime` checks handle/fence/suffix/drop/revoke against raw session; `malformed_stored_envelopes_preserve_error_kind_and_delivery_progress` checks local corruption versus underlying source error. Moving the submission after encryption instead of cloning preserves metadata, checked by full decoded event equality. |
| `encryption-fifo-and-pre-admission-cancellation`: repaired evidence | [Submission and recovery](../../../../crates/sea-encryption/README.md#submission-and-recovery): first-poll FIFO across clones/outer policy; only an **admitted** cancelled append leaves terminal authority. Consumers: concurrent decorated authors. | Existing `session::tests::policy_handoff_preserves_encryption_waiter_order` holds the gate, registers the first caller, releases it, and requires a later caller not to overtake. New `cancelled_gate_waiter_preserves_authority_and_does_not_encrypt` drops a queued caller before admission, requires zero nonce use, then immediately admits its successor and a later submission. The Tokio target dependency supports the FIFO primitive; no dependency changes made by this audit. |
| `encryption-admitted-terminal-and-recovery`: already adequate | [Submission and recovery](../../../../crates/sea-encryption/README.md#submission-and-recovery): admitted failure/cancellation terminalizes all clones even before inner submission; close/next append drives announced departure; never reuse committed ciphertext. Consumers: recovering authors. | `session::tests::cancelled_preparation_terminates_clones_before_inner_append` takes the actual wrapper guard and checks clone rejection plus exact Joined/Left history; `failed_key_preparation_closes_inner_author_and_wrapper_clones` also checks the raw inner author is closed; `equal_submissions_encrypt_independently_and_recheck_authority` observes distinct positions, nonce calls and closed-original rejection across key rotation. These tests guard the wrapper, not only the inner sequencer. |

### Scope exclusions and layer ownership

Two additional inherited boundaries were rechecked because their tests or surrounding ownership code changed:

- **Content capabilities and publication dependencies — already adequate.**
  The [settlement contract](../../../../crates/sea-sequencer/README.md#submission-identity-and-settlement) requires resolving submitted blob identities through the current view before publication.
  `LocalSession::view` also enforces live membership.
  S::`content_facade_resolves_stored_identities_and_requires_live_membership` checks raw blob/directory identities, absent resolution, rejected closed-session operations, and surviving peer access.
  F::`unavailable_tree_rejects_singleton_and_batch_before_storage_append` checks no invalid dependency reaches the backend for either append path.
  These remain local guards after fixture consolidation; revisit on facade guards or dependency preparation changes.
- **Independent cache invalidation — already adequate.**
  The [cache contract](../../../../crates/sea-sequencer/README.md#experimental-shared-live-cache) promises synchronous ownership release without a subscriber poll, original failure classification, and no rejoin.
  L::`independent_invalidation_releases_unpolled_claims_and_wakes_active_read` checks registry/payload release, actual wake count, original error kind, and unchanged archive-poll count.
  L::`recovery_never_retains_history_and_invalidated_openings_cannot_rejoin` separately checks the restored-history path and sticky late-read rejection.
  This is backend-observer wiring evidence, distinct from the newly repaired runtime-reconciliation wiring.
  Revisit on callback installation, terminal precedence, or opening identity changes.

- Unchanged relay queue/admission/backing implementation is outside the incremental repair scope after verifying the diff and the retained 0018 dispositions.
  Revisit on dispatch/admission/retention changes or a concrete incident; this is not a fresh full relay reassessment.
- Persistent storage retention/GC, authentication/tenant policy, visible encryption topology, decoded-size limits, production qualification and platform power-loss testing remain known limitations without a newly satisfied trigger.
  The pressure observer does not promise a hard process memory bound or collection.
  No artificial runtime test can establish those excluded guarantees.
- Shared session conformance remains a substitutability check for baseline/cache/compression/encryption combinations.
  It is not used as any row's only owner-local discriminator.
  The encryption-plus-compression conformance mode protects composition, while raw-wrapper tests protect each transform owner's decisions.
- Browser/generated-binding validation owns target-specific Tokio/WASM compatibility and end-to-end transport resource behavior.
  Native package checks do not substitute for that coordinator gate.
- This repair changes no production crate behavior or user-facing API, so no changeset or contract rewrite is needed.
  Existing precise contract text is cited above rather than duplicated into new documentation.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Provenance | Assigned process-task probe | Recorded kickoff, clean status and Rust 1.98.1 | Autonomous edit/check route available | No shared shell used | Verify actual delegate task invocation. |
| Hypothesis confirmed | Existing shedding test had only one eligible victim | New three-cursor test | Practical oldest-selection gap repaired | Final task passes | A single eligible item cannot prove selection priority. |
| Hypothesis confirmed | Existing encryption cancellation test began after admission | New queued-cancellation test | Distinguishes waiting from accepted work | Final task passes | Test both sides of the admission boundary. |
| Hypothesis confirmed | Direct cache terminal injection did not prove runtime reconciliation wiring | New application/control failure test | Immediate release/error wiring now diagnosed locally | Final task passes | Testing a terminal primitive is not testing all owning callers. |
| Hypothesis confirmed | Clarified finite/unpolled read close states lacked exact assertions | Extended existing read/cache tests | Captures both clarified states without new fixtures | Final task passes | Prefer a discriminating state in the current fixture. |
| Validation repair | Second-batch strict Clippy rejected inferred default type | Preserved exit-101 run above | Tests did not run in that attempt | Explicit `LiveCacheStats::default()`; rerun passed | Preserve the first failure and validate the correction. |
| Hypothesis rejected | Removed signals room assertion might lose isolation coverage | Same-identity two-room routing matrix | No code/test churn | Already stronger retained evidence | Compare exact discriminators, not test names. |

## Contract and Integration Friction

None requiring a shared decision.
The coordinator owns integrated validation, snapshot/hash capture, inventory reconciliation and commit.
Task route worked without shell ownership, cancellation interference or checkout mismatch.

## Human Interventions

None after the user's approved full incremental scope and task delegation.

## Measurements

Environment: Linux worktree, pinned Rust 1.98.1, task-local `CARGO_BUILD_JOBS=4`, workspace-local Cargo target.
Reviewed comparison: 18 files across four crates.
Repairs: three added tests and two existing-test extensions; no production or dependency changes.
Final unit-test total: 118; compression doctests: 1.
Performance, benchmark, token-use and exact elapsed-effort measurements: not collected.
No performance claim follows from correctness-test execution.

## Proposed Decisions

No shared decision proposed; existing promises and semantics preserved.

## Candidate Skills and Process Changes

No new skill proposed.
The five gaps support the existing quality skill's requirement to name an owning decision and a test that fails if only that decision regresses.
No reusable workflow change is necessary.

## Remaining Work and Risks

Assigned full incremental review is complete; no localized repair is deferred and no assigned area remains unreviewed.
Source and report are frozen for coordinator snapshot/integration.
Remaining acceptance work: capture frozen patch identity; reconcile inventory; run applicable documentation, policy and integrated/extended gates; obtain fresh independent review; commit accepted changes.
No blocker exists in the workstream execution route.
Native results do not certify all concurrent schedules, target/browser compatibility, hard memory bounds, cryptographic implementation correctness or physical durability.
Do not remove the worktree until its frozen patch is preserved and mapped to an accepted commit.
