# Iteration 0019: persistence Report

Status: Wave 1 discovery and assessment complete; no repair selected or started
Branch: `rust-service-iteration-0019-persistence`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0019-persistence`
Kickoff commit: `7b56e89cc3d79a861ed708c8d9d4b1fe7d9ff475`
Iteration-approved source commit: `575b77e825e598b15b7740f56956fe433a6153d8`
Final commit: none; Wave 1 was read-only and commits were prohibited
Agent or owner: Copilot persistence discovery agent
Model and tool version: unknown
Instruction source: [persistence instructions](instructions/persistence.md), whose recorded iteration source is `575b77e825e598b15b7740f56956fe433a6153d8`
Session or transcript reference: none
Started and finished: 2026-09-24; exact times unknown
Assigned task labels: `rs0019 persistence test`; `rs0019 persistence format`

## Outcome

Completed Wave 1 Conservative discovery and assessment for the full `sea-file`
crate across documentation, tests, implementation, abstractions, code
organization, and naming.
The review covered every source module, the package manifest and guide, and the
cross-process lock test.
It preserved the distinction between buffered admission and durable
settlement, Unix and non-Unix namespace handling, framing and semantic
recovery, read and mutation workers, cancellation, poisoning, and error-suffix
semantics.

Two localized candidates are credible:

1. `PERSIST-IMPL-001` can give snapshot bytes one encoder instead of maintaining
   matching buffered and durable encoders.
2. `PERSIST-ORG-001` can make `atomic_file` and `journal` direct crate modules
   instead of nesting them under `common` and immediately re-exporting them
   back to the crate root.

Both remain proposed for coordinator reconciliation; neither is selected or
implemented.
The first has the stronger correctness and maintenance benefit.
Other apparent duplication either expresses distinct guarantees or would
replace small local code with broader coupling.
Confidence is high for the responsibility map and dispositions because the
current contracts and the complete 0018 owner-local evidence were inspected
together.

## Inputs And Constraints

- Scope and profile: broad current-state review of all `sea-file`
  responsibilities, Conservative in all six categories, with no discovery
  cutoff.
- Inherited evidence: [iteration 0018 quality inventory](../../0018/quality-inventory.md)
  and its [persistence report](../../0018/phase-2/persistence.md).
- Current contracts: [`sea-file` guide](../../../../crates/sea-file/README.md),
  [`DEVELOPMENT.md`](../../../../DEVELOPMENT.md), and
  [`KNOWN_ISSUES.md`](../../../../KNOWN_ISSUES.md).
- Prohibited changes: public API, dependency, persisted format, protocol,
  generated binding, supported-platform, or performance changes.
- Wave 1 writes only this report.
- `FileStorage` means the buffered testing/demonstration policy;
  `DurableStorage` means synchronized acknowledgement subject to the qualified
  power-loss model.
- `P`, `O`, `C`, and `L` below mean the guide's
  [Persistence Model](../../../../crates/sea-file/README.md#persistence-model),
  [Ownership And Reads](../../../../crates/sea-file/README.md#ownership-and-reads),
  [Cancellation And Failures](../../../../crates/sea-file/README.md#cancellation-and-failures),
  and [Limits](../../../../crates/sea-file/README.md#limits).
- Test prefixes are exact modules: `A` = `atomic_file::tests`, `J` =
  `journal::tests`, `M` = `common::tests`, `B` = `buffered::tests`, `D` =
  `durable::tests`, and `S` = `storage::tests`.

## Full Responsibility Coverage

| Responsibility area | Consumers and platforms | Contract and nearest discriminating evidence | Category assessment | Result |
| --- | --- | --- | --- | --- |
| Public factories, reexports, manifest, and lifecycle | Direct storage users and composed views; all supported platforms | `common::file_factory!` preserves policy-specific durability, defaults, lifecycle, and worker configuration. `S::factory_identity_shutdown_and_sticky_failure_are_opening_independent`, `S::worker_limits_are_shared_and_policy_specific`, and `S::worker_limits_reject_invalid_configuration_before_namespace_creation` distinguish lifecycle and defaults. | Documentation and public naming are explicit. Macro delegation removes real duplication without hiding policy. Dependencies are all used by owned responsibilities. | Already proportionate. Public `FileStorage` naming is imperfect but cannot be changed under this run's API constraint; the guide prominently identifies it as buffered and non-production. |
| Namespace creation and synchronization | Durable factory users; Unix mount-boundary behavior and non-Unix ancestor behavior remain distinct | `P` requires durable creation barriers and says Unix synchronization stops at a different filesystem. `sync_namespace` gates device checks with `cfg(unix)` and otherwise walks ancestors. `S::namespace_sync_stops_at_filesystem_boundary` and `S::namespace_sync_is_bottom_up_and_propagates_failure` discriminate the Unix boundary, ordering, and error propagation. | Platform branching is required, not dead code. The known native timeout documents why synchronous construction and bounded-worker isolation matter. | Already proportionate. Revisit only with a supported-platform policy change or causal initialization failure. |
| Whole-value atomic publication and internal checkpoints | Content and checkpoint callers; buffered and durable publication have different barriers | `P` requires old-or-new selection, unpublished replacement rejection, independent checkpoint state, poisoning on uncertainty, and durable file plus directory synchronization. `A::torn_unpublished_values_never_replace_the_published_state`, `S::checkpoint_failure_poisoning_and_recovery_are_document_owned`, and `S::direct_reopen_keeps_history_lazy_and_checkpoint_size_independent` discriminate these decisions. | `atomic_file::{stage,write,read}` is a small coherent owner. Its appended `.pending` naming and journal creation's replaced extension are deliberately different path contracts. | Already proportionate; `PERSIST-ABST-002` rejects merging atomic-value and journal publication. |
| Journal framing, stable locks, cursors, and physical recovery | Event and snapshot journals; both policies; cross-process users | `P`, `O`, and `C` require checksummed frames, stable sidecar ownership, cursor-bounded recovery, durable incomplete-tail truncation, buffered incomplete-tail rejection, complete-corruption rejection, and poisoned uncertainty. `J::checked_boundaries_and_prefix_probes_match_persisted_frames`, `J::recovery_repairs_every_incomplete_tail_but_rejects_complete_corruption`, `J::reopening_settles_once_and_only_replaces_changed_cursors`, `J::recovery_from_boundary_never_reads_older_payloads`, `J::exclusive_journal_round_trip_and_tail_policies`, and process test `append_keeps_exclusive_lock_across_processes` are nearest. | Shared framing is already centralized. The `durable` flag branches only at required synchronization/recovery decisions. Locking, cursor, and recovery helpers have separate reasons to exist. | Already proportionate, apart from the module-placement candidate `PERSIST-ORG-001`. |
| Semantic recovery and dependency closure | Raw components, composed views, reopened buffered/durable documents | `P` requires complete suffix frames to satisfy event position/predecessor/root and snapshot order/event/root dependencies; raw event roots remain opaque until recovery. `S::recovery_validates_semantics_after_framing_has_succeeded`, `S::recovery_rejects_records_from_other_storage_surfaces`, and `S::raw_event_dependencies_fail_recovery_and_foreign_handles_are_rejected` discriminate framing from semantic validity. | `State::recover_event` and `recover_snapshot` are intentionally separate from `journal::recover_tail`; combining them would couple generic bytes to storage policy and weaken diagnostic ownership. | Already proportionate. |
| Immutable blob and directory content | Blob and directory users; both policies | `P` requires typed-hash identity, transitive directory closure, writer-independent deduplication, and durable recheck in mutation order. `S::directory_publication_preserves_closure_and_failed_deduplication_is_rejected`, `S::directory_sync_failure_does_not_publish_parent`, `S::directory_deduplication_does_not_wait_for_writer`, and `S::direct_reopen_keeps_history_lazy_and_checkpoint_size_independent` distinguish these guarantees. | Buffered encoding before admission and durable encoding within ordered worker execution are distinct lifetime/ownership paths. Small tag construction does not justify a new general content-codec layer. | Already proportionate; `PERSIST-IMPL-002` is rejected. |
| Event encoding, batch reservation, publication, and error suffixes | Event appenders/readers and sequencer composition; both policies | `P` requires literal frame offsets, a shared event encoding, buffered all-at-admission visibility, durable post-sync visibility, no empty-batch I/O, and a full `Ambiguous` suffix after uncertain durable writes. `S::event_batch_positions_are_frame_offsets_with_one_journal_sync`, `S::buffered_admission_reads_capacity_and_shutdown_precede_reopen`, `S::blocked_batch_allows_executor_admission_and_published_reads`, and `S::uncertain_batch_reports_every_entry_without_publishing_to_readers` are nearest. | `encode_event` is already the authoritative codec. Repeated construction of full ambiguous result vectors is explicit at each failure boundary and avoids hiding whether an error is one rejection or an uncertain whole suffix. | Already proportionate; no extraction proposed. |
| Snapshot encoding, order, lookup, and streams | Snapshot appenders/readers and recovery; both policies | `P` and `O` require monotonically advancing event positions, compatible handles, one persisted layout, private physical offsets, logarithmic bounded lookup, and linear streaming. `S::fixed_snapshot_layout_matches_encoding_and_checks_ordinal_arithmetic`, `S::snapshots_reject_foreign_dependencies_and_nonadvancing_positions`, `S::snapshot_post_sync_ambiguity_recovers_without_duplicate_publication`, and `S::snapshot_reads_are_linear_and_bounded_lookups_are_logarithmic` are nearest. | Buffered and durable publication must remain distinct, but their byte encoder must agree. The current two hand-written encoders are a material drift opportunity. | Candidate `PERSIST-IMPL-001`. Cursor and lookup abstractions themselves are already proportionate. |
| Typed record access and event/snapshot cursor selection | Lazy historical reads; variable-width event and fixed-width snapshot formats | `P`, `O`, and `L` require typed address spaces, predecessor traversal for sparse event bounds, ordinal snapshot traversal, lazy initialization, and bounded read complexity. `S::byte_offset_bounds_and_snapshot_lookup_survive_reopen_without_checkpoint`, `S::fixed_snapshot_layout_matches_encoding_and_checks_ordinal_arithmetic`, `S::read_bounds_use_the_lazy_initialization_head_for_both_archives`, and `S::snapshot_reads_are_linear_and_bounded_lookups_are_logarithmic` discriminate the mechanisms. | `Record`, `FixedSize`, `RecordArchive`, `EventCursor`, and `SnapshotCursor` share only valid mechanics while retaining layout-specific traversal. Removing layers would duplicate checked arithmetic or collapse distinct address semantics. | Already proportionate; `PERSIST-ABST-003` is rejected. |
| Lazy read state, progress, wake relay, and opening lifetime | Event and snapshot stream consumers; all platforms | `O` requires lazy registration, exclusive-lower/inclusive-upper bounds, coherent progress, wake on commit/failure, and opening retention by unpolled and completed streams. `S::completed_streams_retain_exclusive_opening_until_dropped`, `S::read_bounds_use_the_lazy_initialization_head_for_both_archives`, `S::progress_stays_coherent_when_live_reader_discovers_new_backlog`, `S::live_readers_wake_on_commit_and_uncertain_write`, and `M::blocking_read_preserves_a_wake_racing_with_pending_completion` are nearest. | The long `read` closure keeps one state machine visible; its explicit `too_many_lines` rationale is supported by coupled initialization, progress, selection, and wake ordering. `BlockingRead` is a necessary executor boundary. | Already proportionate. Splitting either state machine would displace rather than remove complexity. |
| Buffered admission, pending overlay, drain, coalescing, flush, and failure | Buffered test/demo users; process-local acknowledgement only | `P`, `C`, and `L` require atomic admission visibility, pending reads, bounded FIFO waiters, finite drain turns, event-only coalescing, captured-prefix flush, background-failure poisoning, and no durability promise. `B::event_coalescing_preserves_records_and_control_order`, `B::flush_waits_for_its_prefix_not_later_admission`, `B::hot_document_yields_worker_capacity_to_cold_document`, `B::shutdown_wakes_bounded_waiters_before_worker_settlement`, and `B::bounded_waiting_cancellation_shutdown_and_failure_wake_admission` discriminate these decisions. | Queue state and short-lived drain ownership are not duplicates of durable ordering. Their additional accepted/written prefixes and pending overlay are required by acknowledgement-before-write semantics. | Already proportionate; `PERSIST-ABST-001` rejects executor unification. |
| Durable admission, FIFO order, settlement, flush, and cancellation | Durable users; synchronized acknowledgement under the qualified model | `P`, `C`, and `L` require order registration before worker capacity, synchronous bounded reservation, retained detached work, synchronized acknowledgement, and prefix barriers. `D::admission_limits_reject_without_running_and_release_after_settlement`, `D::queued_document_mutations_leave_workers_for_reads_and_other_documents`, `D::flush_captures_prefix_before_later_admission`, `D::accepted_waiter_survives_cancellation_and_shutdown_drains_it`, and `S::cancelled_batch_retains_opening_until_worker_settles` are nearest. | The mutex-order chain and detached task are required by cancellation semantics. Sharing buffered queue mechanics would add modes and weaken local reasoning. | Already proportionate; `PERSIST-ABST-001` is rejected. |
| Preparation and factory worker budgets | Content encoders, mutations, reads, recovery, and factory clones; both policies | `L` defines independent 128-request/16-MiB preparation and mutation budgets, policy-specific factory defaults, and worker permits retained through cancellation. `M::preparation_limits_reject_excess_and_retain_worker_owned_charges`, `M::blocking_capacity_is_retained_until_cancelled_callers_work_settles`, `D::admission_limits_reject_without_running_and_release_after_settlement`, and the worker-limit storage tests are nearest. | Equal numeric limits are not one responsibility: preprocessing, buffered waiters, buffered accepted work, and durable accepted work have independent ownership and may evolve independently. | Already proportionate; `PERSIST-ABST-004` rejects shared limit constants/state. |
| Poisoning, invalidation, panic, and authoritative observations | All component and stream users; both policies | `C` requires uncertainty and worker panic to poison all authoritative observations, notify readers, remain sticky at the factory, and require reopen. `S::journal_faults_preserve_prefix_and_block_uncertain_observations`, `S::worker_panic_poisons_observations_and_wakes_readers_even_after_cancellation`, `S::independent_invalidation_covers_poison_shutdown_and_late_registration`, and `S::factory_identity_shutdown_and_sticky_failure_are_opening_independent` are nearest. | `Opening::failed`, journal failure, and factory failure are separate scopes, not redundant flags. Their checks prevent observation through different ownership paths. | Already proportionate. |
| Tests and fixtures | Owner-local regression diagnosis plus cross-process OS behavior | The 0018 inventory maps every consequential boundary to a focused discriminator; conformance remains composition evidence and `tests/locking.rs` uniquely proves process isolation. Tests commonly loop over both policies while policy-specific executor tests remain separate. | Existing helpers already share setup where it does not hide the policy. More table-driven consolidation would obscure failure phase, policy, or retained-owner diagnosis and could couple expected bytes to production encoders. | Already proportionate; `PERSIST-TEST-001` is rejected. |
| Guide and known-issue qualification | Direct users, maintainers, and deployment owners | The guide locally states persistence, ownership, cancellation, limits, validation, and power-loss assumptions. `KNOWN_ISSUES.md#rs-003-durable-storage-has-qualified-guarantees` explicitly withholds production durability pending platform power-cut qualification; RS-015 separately records unbounded retention. | Repeated-looking qualifications serve different readers and prevent `DurableStorage` from being mistaken for a production claim. The validation catalog supplies current local context rather than requiring historical reconstruction. | Already proportionate; `PERSIST-DOC-001` is rejected. |

## Category Coverage

| Category | Conservative assessment |
| --- | --- |
| Documentation | Reviewed crate-level/module documentation, public item docs, validation guidance, and known-issue qualifications. No safe wording deletion was found; local qualifications are consequential. |
| Tests | Reviewed owner-local, policy-looped, journal/atomic, executor, storage, conformance, and process-isolation layers against the 0018 map. No material fixture consolidation preserves diagnosis better than the present organization. |
| Implementation | Reviewed codecs, publication, recovery, queues, reads, bounds, poisoning, and platform synchronization. Snapshot encoding is the one confirmed small duplicate whose copies must agree. |
| Abstractions | Tested executor, record/cursor, atomic/journal, and budget-sharing hypotheses. Each apparent pairing has distinct persistence, address, failure, cancellation, or lifetime semantics. |
| Code organization | Reviewed all seven source files, the test target, exports, and dependency placement. One private module-parent indirection is plausibly removable; splitting `storage.rs` is too disruptive for Conservative scope without a clearer ownership seam. |
| Naming | Reviewed public factories and internal ownership names at call sites. Public naming is constrained; internal event-specific names could improve precision but the broad rename has low benefit relative to review noise. |

## Candidate Assessments

### `PERSIST-IMPL-001` — Authoritative snapshot encoder

- **Primary category/profile:** Implementation, Conservative.
- **Responsibility/owner:** Snapshot persisted codec in `storage.rs`.
- **Consumers/platforms:** Buffered snapshot admission, durable snapshot append,
  semantic recovery, lookup, and all supported platforms.
- **Evidence:** `FileSnapshots::append` and
  `FileSnapshots::append_blocking` separately construct tag `4`, event-position
  bytes, and the tree identity. `SnapshotRecord::decode` and
  `FixedSize::ENCODED_SIZE` already own the inverse layout and width.
- **Exact preserved contract/test:** `P` says snapshot positions remain event
  positions and physical offsets belong only to storage. Preserve byte-for-byte
  layout, monotonic advancement, handle compatibility, and publication timing.
  Nearest tests:
  `S::fixed_snapshot_layout_matches_encoding_and_checks_ordinal_arithmetic`,
  `S::snapshots_reject_foreign_dependencies_and_nonadvancing_positions`,
  `S::buffered_resident_dependencies_and_checkpoint_keep_order_without_workers`,
  and `S::snapshot_post_sync_ambiguity_recovers_without_duplicate_publication`.
- **Falsifiable hypothesis:** A single private `SnapshotRecord::encode` used by
  both publication policies removes a format-drift opportunity without
  combining admission or settlement behavior.
- **Cheapest disproof:** Compare both current byte constructions and their
  inputs. Reject if either includes policy-specific bytes or if using the
  helper would move validation, state mutation, or I/O ordering.
  Inspection found identical bytes and policy-independent inputs.
- **Benefit:** One authoritative snapshot codec beside its decoder and width;
  future format edits cannot update only one policy.
- **Displaced complexity/supporting edits:** One small helper and two call-site
  replacements; no test expectation may derive its expected bytes from the new
  helper. No documentation, API, dependency, or format edit is needed.
- **Proposed disposition/ranking:** **Deferred pending Wave 2 selection; rank
  1.** Strongest local candidate because correctness requires agreement and
  focused independent byte-layout evidence exists.
- **Revisit trigger:** Snapshot layout, root variants, or either publication
  path changes; or coordinator repair selection.

### `PERSIST-ORG-001` — Direct ownership for journal modules

- **Primary category/profile:** Code organization, Conservative.
- **Responsibility/owner:** Private crate module topology in `lib.rs` and
  `common.rs`.
- **Consumers/platforms:** All `sea-file` modules; no external API or platform
  distinction.
- **Evidence:** `common.rs` path-declares `atomic_file` and `journal`, while
  `lib.rs` immediately re-exports both privately so every caller uses
  `crate::atomic_file` or `crate::journal`. Their implementation files are
  physical siblings of `common.rs`, and neither depends on `common`.
- **Exact preserved contract/test:** Preserve all `P` framing, cursor,
  publication, recovery, and error contracts. The nearest discriminators are
  the complete `A` and `J` module tests, with `S::checkpoint_failure_poisoning_and_recovery_are_document_owned`
  and the cross-process lock test protecting consumers.
- **Falsifiable hypothesis:** Declaring the two modules directly in `lib.rs`
  and removing path declarations plus private reexports removes a false parent
  layer with no visibility or behavior change.
- **Cheapest disproof:** Check for `super` dependencies, paths relying on
  `common::journal`/`common::atomic_file`, or rustdoc/public visibility changes.
  Current callers use crate-root paths and the files import one another through
  crate-root paths; neither implementation uses a `common` parent facility.
- **Benefit:** Module ownership matches source layout and call-site paths;
  removes two path attributes and one reexport indirection.
- **Displaced complexity/supporting edits:** Mechanical `mod` declaration move
  only. Review must compare module docs and test names because historical
  inventory abbreviations currently describe `common::journal::tests` and
  `common::atomic_file::tests`; no historical record should be rewritten.
- **Proposed disposition/ranking:** **Deferred pending Wave 2 selection; rank
  2.** Safe but lower value than codec ownership.
- **Revisit trigger:** Module topology changes, a rustdoc-path consumer is
  found, or coordinator repair selection.

### `PERSIST-NAME-001` — Event-specific internal names

- **Primary category/profile:** Naming, Conservative.
- **Responsibility/owner:** `Opening::journal`, `Opening::writer`, and
  `State::reader` in `storage.rs`.
- **Consumers/platforms:** Internal event publication, recovery, tests, and
  readers; all platforms.
- **Evidence:** These generic names mean the event journal/cursor while adjacent
  `snapshots` and `snapshot_reader` are explicit.
- **Exact preserved contract/test:** Preserve all event publication, lazy
  history, recovery, and failure behavior. Nearest evidence is
  `S::event_batch_positions_are_frame_offsets_with_one_journal_sync`,
  `S::recovery_validates_semantics_after_framing_has_succeeded`, and
  `J::recovery_from_boundary_never_reads_older_payloads`.
- **Falsifiable hypothesis:** Renaming to event-specific terms reduces
  event/snapshot ambiguity at call sites without logic changes.
- **Cheapest disproof:** Inspect whether call sites are actually ambiguous in
  their local context and count the mechanical test churn.
  Most `writer()` calls occur in explicitly event-named functions, while the
  rename would touch many white-box tests.
- **Benefit:** Modest local precision.
- **Displaced complexity/supporting edits:** Broad mechanical production and
  test churn; no mechanism removed.
- **Proposed disposition/ranking:** **Excluded; rank 5.** Below Conservative
  value threshold.
- **Revisit trigger:** A substantive event/snapshot ownership edit already
  touches these fields or a maintainer error demonstrates ambiguity.

### `PERSIST-TEST-001` — Broader shared policy fixture

- **Primary category/profile:** Tests, Conservative.
- **Responsibility/owner:** `storage::tests` setup and paired buffered/durable
  assertions.
- **Consumers/platforms:** Test maintainers; both persistence policies.
- **Evidence:** Several tests use `for durable in [false, true]`, while executor,
  recovery-tail, synchronization, and process-lock tests remain intentionally
  policy-specific.
- **Exact preserved contract/test:** Every 0018 persistence row must retain its
  named case, discriminating assertion, policy execution, independence, and
  failure locality.
- **Falsifiable hypothesis:** A larger generic factory/fixture could remove
  repeated setup without hiding which policy or failure phase regressed.
- **Cheapest disproof:** Compare the assertions inside existing policy loops
  and identify whether the same setup and expected result truly apply.
  Existing shared-policy cases are already looped; remaining repetition
  surrounds distinct queue, sync, recovery, or process behavior.
- **Benefit:** Little beyond fewer setup lines.
- **Displaced complexity/supporting edits:** Generic fixture types, callback
  plumbing, and weaker failure labels; risk of sharing expected persisted bytes
  with production codecs.
- **Proposed disposition/ranking:** **Rejected; rank 6.** Similar syntax does
  not establish identical evidence.
- **Revisit trigger:** Three or more new tests repeat the same policy-neutral
  setup and assertions, or diagnosis demonstrates a common helper would be
  clearer.

### `PERSIST-DOC-001` — Shorten guide validation and qualifications

- **Primary category/profile:** Documentation, Conservative.
- **Responsibility/owner:** Crate guide validation summary, persistence warning,
  and power-loss qualification.
- **Consumers/platforms:** Direct users, maintainers, deployment owners, and
  Unix/non-Unix operators.
- **Evidence:** Some guarantees recur in the opening warning, detailed model,
  limits, power-loss model, validation summary, and RS-003.
- **Exact preserved contract/test:** Preserve the explicit distinction between
  buffered admission, flush, durable sync, and actual power-loss qualification;
  preserve local commands and current evidence descriptions. RS-003 must remain
  the deployment-level warning.
- **Falsifiable hypothesis:** Removing repeated prose would retain all
  qualifications while improving navigation.
- **Cheapest disproof:** Assign each occurrence an audience and question.
  The opening prevents immediate misuse, detailed sections define contracts,
  validation maps executable evidence, and RS-003 tracks qualification status.
- **Benefit:** Word reduction only; no demonstrated maintenance reduction.
- **Displaced complexity/supporting edits:** More cross-document navigation and
  a greater chance that generated crate docs omit the deployment caveat.
- **Proposed disposition/ranking:** **Rejected; rank 7.**
- **Revisit trigger:** A concrete contradiction/staleness incident or an
  authoritative replacement that remains visible in generated crate docs.

### `PERSIST-ABST-001` — One executor for buffered and durable writes

- **Primary category/profile:** Abstractions, Conservative.
- **Responsibility/owner:** `buffered::Executor` and `durable::Executor`.
- **Consumers/platforms:** All mutations, flush/shutdown, cancellation, and
  worker scheduling under both policies.
- **Evidence:** Both expose bounded ordered work, but buffered success occurs at
  admission and needs pending visibility, accepted/written prefixes,
  capacity-wait cancellation, background drain/coalescing, and sticky
  background failure. Durable success awaits a detached ordered task and
  synchronization, rejects saturation, and needs no pending overlay.
- **Exact preserved contract/test:** All `C` and `L` distinctions listed in the
  responsibility map. Nearest disproof is the combined `B` and `D` executor
  suites plus `S::buffered_admission_reads_capacity_and_shutdown_precede_reopen`
  and `S::cancelled_batch_retains_opening_until_worker_settles`.
- **Falsifiable hypothesis:** A shared queue/order abstraction could remove
  duplicated limits and flush mechanics without policy flags or weaker
  cancellation semantics.
- **Cheapest disproof:** Compare acknowledgement point, saturation behavior,
  pending state, drain ownership, coalescing, and flush target.
  Each differs materially.
- **Benefit:** Superficial type-count reduction only.
- **Displaced complexity/supporting edits:** A modeful executor, optional state,
  additional branches, coupled tests, and harder failure diagnosis.
- **Proposed disposition/ranking:** **Rejected; rank 8.**
- **Revisit trigger:** The buffered acknowledgement contract changes to await
  settlement or a future owner supplies a genuinely identical ordering core
  with no policy configuration.

### `PERSIST-ABST-002` — One atomic publication implementation

- **Primary category/profile:** Abstractions, Conservative.
- **Responsibility/owner:** `atomic_file` whole-value replacement and `journal`
  creation/recovery publication.
- **Consumers/platforms:** Checkpoints/content versus event/snapshot journals;
  buffered and durable modes.
- **Evidence:** Both stage and rename files, but atomic values append
  `.pending`, include an internal checksum, overwrite a published value, and
  report uncertain publication. Journals replace extensions, require a stable
  sidecar lock, initialize magic, retain an append inode, remove interrupted
  staging, and settle recovery.
- **Exact preserved contract/test:** `P` old/new value selection and stable
  journal creation; `O` stable lock. Nearest evidence is
  `A::torn_unpublished_values_never_replace_the_published_state`,
  `J::interrupted_creation_does_not_publish_an_invalid_header`,
  `J::durable_append_reuses_inode_and_recovers_uncertain_prefix`, and the
  process lock test.
- **Falsifiable hypothesis:** A generic stage/publish helper can replace both
  implementations without flags or path-policy callbacks.
- **Cheapest disproof:** Compare path derivation, checksum ownership, overwrite
  permission, locking, and returned file ownership. They differ on each.
- **Benefit:** Small syscall-sequence deduplication.
- **Displaced complexity/supporting edits:** Generic configuration would hide
  crash semantics and couple independently evolving formats.
- **Proposed disposition/ranking:** **Rejected; rank 9.**
- **Revisit trigger:** A third publication owner with exactly one existing
  contract or evidence of the current two drifting in required barriers.

### `PERSIST-ABST-003` — Collapse record and cursor layers

- **Primary category/profile:** Abstractions, Conservative.
- **Responsibility/owner:** `Record`, `FixedSize`, `RecordArchive`, and
  `ArchiveCursor`.
- **Consumers/platforms:** Event and snapshot recovery, lookup, and streaming.
- **Evidence:** Events use variable-width byte positions and predecessor links;
  snapshots use fixed frame strides, ordered event identities, binary search,
  and a private ordinal.
- **Exact preserved contract/test:** `P`, `O`, and `L` address/bounds/complexity
  guarantees; nearest tests are the fixed-layout, byte-offset-bound,
  read-complexity, and lazy-bound storage tests.
- **Falsifiable hypothesis:** Fewer traits/types would preserve both algorithms
  with simpler local control flow.
- **Cheapest disproof:** Attempt to state one address and advancement rule.
  No such rule exists without branching on record type.
- **Benefit:** Fewer declarations only.
- **Displaced complexity/supporting edits:** Type switches, repeated checked
  arithmetic, or false equivalence between public event positions and snapshot
  offsets.
- **Proposed disposition/ranking:** **Rejected; rank 10.**
- **Revisit trigger:** Persisted layouts converge by an approved format change.

### `PERSIST-ABST-004` — Share all equal capacity limits

- **Primary category/profile:** Abstractions, Conservative.
- **Responsibility/owner:** Preparation, buffered waiting, buffered accepted,
  and durable accepted budgets.
- **Consumers/platforms:** Content preparation and mutation admission under
  both policies.
- **Evidence:** Several values are currently 128 requests and 16 MiB, but `L`
  explicitly calls these separate budgets with different acquisition,
  waiting/rejection, cancellation, and settlement ownership.
- **Exact preserved contract/test:** `M::preparation_limits_reject_excess_and_retain_worker_owned_charges`,
  `B::bounded_waiting_cancellation_shutdown_and_failure_wake_admission`, and
  `D::admission_limits_reject_without_running_and_release_after_settlement`.
- **Falsifiable hypothesis:** Shared constants or one budget object would
  prevent accidental numerical drift.
- **Cheapest disproof:** Ask whether changing one limit requires all others to
  change for correctness. The contract does not require equality and tuning may
  legitimately diverge.
- **Benefit:** Removes a few literals.
- **Displaced complexity/supporting edits:** False coupling across independent
  memory populations and policy semantics.
- **Proposed disposition/ranking:** **Rejected; rank 11.**
- **Revisit trigger:** A documented invariant requires numerical equality or a
  measured memory policy intentionally introduces one aggregate owner.

### `PERSIST-IMPL-002` — General content-record encoder

- **Primary category/profile:** Implementation, Conservative.
- **Responsibility/owner:** Blob and directory record construction in
  `FileBlobs`.
- **Consumers/platforms:** Buffered admission, durable publication, recovery,
  and all platforms.
- **Evidence:** Buffered and durable branches both prepend tags `1`/`2`, but
  blob identity derives from raw payload while directory identity derives from
  canonical encoding and closure validation differs before each policy's
  publication point.
- **Exact preserved contract/test:** `P` immutable typed hashes, one encoding
  for new directories, closure, and durable recheck. Nearest evidence is the
  three directory tests and
  `S::direct_reopen_keeps_history_lazy_and_checkpoint_size_independent`.
- **Falsifiable hypothesis:** Shared content encoding removes meaningful codec
  duplication without moving identity or closure policy.
- **Cheapest disproof:** Compare common bytes after excluding identity,
  preparation, closure, and admission behavior. Only a one-byte tag prepend
  remains.
- **Benefit:** Negligible.
- **Displaced complexity/supporting edits:** New helper/type selection and
  additional navigation for two trivial constructions.
- **Proposed disposition/ranking:** **Rejected; rank 12.**
- **Revisit trigger:** Content format gains additional shared framing or a
  third caller duplicates a nontrivial codec.

## Ranking And Reconciliation Notes

| Rank | Candidate | Confidence | Expected reduction | Risk and evidence strength | Proposed disposition |
| --- | --- | --- | --- | --- | --- |
| 1 | `PERSIST-IMPL-001` | High | Removes one required-to-agree persisted codec copy | Low behavioral risk; independent fixed-byte/layout tests exist | Wave 2 candidate |
| 2 | `PERSIST-ORG-001` | Medium-high | Removes false module-parent/reexport topology | Mechanical, but historical test paths and rustdoc identity need review | Wave 2 candidate |
| 3-4 | No additional qualifying repair | High | None demonstrated | Prefer no change to cosmetic or modeful abstractions | No-change result |
| 5 | `PERSIST-NAME-001` | Medium | Naming clarity only | Broad white-box test churn | Excluded |
| 6 | `PERSIST-TEST-001` | High | Minor fixture lines | Weaker policy/failure diagnosis | Rejected |
| 7 | `PERSIST-DOC-001` | High | Words only | Loses local qualifications/navigation | Rejected |
| 8-12 | `PERSIST-ABST-001` through `004`, `PERSIST-IMPL-002` | High | Superficial declarations/literals | Collapses distinct guarantees or adds indirection | Rejected |

The two credible candidates do not overlap behaviorally.
If the global four-repair budget is competitive, select
`PERSIST-IMPL-001` before `PERSIST-ORG-001`.
No cross-crate owner or shared-file edit is required.

## Validation Evidence

Wave 1 ran **no commands**.
No terminal command, task, test, formatter, linter, build, documentation check,
policy check, or Git command was run.
The registered labels `rs0019 persistence test` and
`rs0019 persistence format` are recorded for a possible Wave 2 only and were
not invoked.

No files other than this report were edited.
No production, test, guide, instruction, shared record, manifest, lockfile, or
generated file was changed.
No commit was created.

Assessment evidence came from direct read-only inspection of the assigned
instructions, charter, simplification inventory, `DEVELOPMENT.md`, `sea-file`
guide, known issues, inherited 0018 inventory/report, manifest, all source
modules, and the cross-process test.
The inherited 0018 passing results are historical safety evidence, not fresh
0019 validation.

For a selected `PERSIST-IMPL-001` repair, the first focused validation should
use exact selectors for
`storage::tests::fixed_snapshot_layout_matches_encoding_and_checks_ordinal_arithmetic`,
`storage::tests::snapshots_reject_foreign_dependencies_and_nonadvancing_positions`,
`storage::tests::buffered_resident_dependencies_and_checkpoint_keep_order_without_workers`,
and
`storage::tests::snapshot_post_sync_ambiguity_recovers_without_duplicate_publication`,
then the assigned full package test and format tasks.
For `PERSIST-ORG-001`, run the full package tests because module-local test
discovery and every consumer import are affected.

## Behavioral Contracts And Test Layers

- **Focused module/crate evidence:** The responsibility table names the nearest
  owner-local discriminators for framing, recovery, publication, reads,
  executors, lifecycle, and failure.
- **Shared conformance:** `S::file_conformance` remains composition evidence for
  both factories. It does not replace the named local tests for policy and
  failure decisions.
- **Cross-process evidence:** `tests/locking.rs::append_keeps_exclusive_lock_across_processes`
  uniquely protects OS process isolation and cannot be folded into unit
  fixtures.
- **Integration/generated/browser evidence:** None is needed for the two
  proposed private, byte-preserving/module-mechanical candidates unless review
  identifies a public rustdoc or generated consumer. Such boundaries remain
  owned outside this workstream.
- **Diagnostic locality:** No inherited test is proposed for removal. No
  expected persisted byte may be computed solely by a new production encoder.

## Hypothesis Results

- **Supported:** Snapshot publication has one small accidental duplicate whose
  copies must agree (`PERSIST-IMPL-001`).
- **Supported, lower value:** Private module topology does not match physical or
  call-site ownership (`PERSIST-ORG-001`).
- **Falsified:** Buffered and durable executors represent one responsibility.
  Their acknowledgement, capacity, queue, cancellation, and failure guarantees
  are materially different.
- **Falsified:** Equal budget values imply one budget owner.
- **Falsified:** Atomic values and journals share enough publication semantics
  for one abstraction.
- **Falsified:** Event and snapshot record/cursor layers can be collapsed
  without mode branches or lost type-level constraints.
- **Falsified:** Remaining content tag construction warrants a generalized
  codec helper.
- **Falsified:** Broader test factoring or shorter guide text would improve
  clarity without weakening local diagnosis or qualification.
- **Inconclusive but non-blocking:** The internal event-specific naming could be
  clearer, but no material maintenance problem justifies its churn.

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified sharing hypothesis | Compared buffered and durable executors | Different acknowledgement points, pending overlay, saturation, coalescing, cancellation, and flush targets; separate `B`/`D` tests | Prevented a modeful shared executor that would obscure guarantees | Rejected as `PERSIST-ABST-001` | Match ownership and failure semantics, not similarly named queue operations. |
| Confirmed duplication | Compared both snapshot append paths with the decoder and fixed-width contract | Both construct exactly tag `4` + event position + tree identity | Identified a bounded, byte-preserving Wave 2 candidate | Deferred as `PERSIST-IMPL-001` pending coordinator selection | A persisted codec is worth sharing only when correctness requires all writers to agree and expectations remain independent. |
| Platform guard retained | Compared Unix device boundary with non-Unix ancestor traversal and RS-003 | `cfg(unix)` controls device identity; production durability remains unqualified | Avoided treating platform code as dead or normalizing guarantees | Already proportionate | Platform branches require contract and qualification evidence before simplification. |

## Contract And Integration Friction

- The worktree kickoff supplied for this assignment is
  `7b56e89cc3d79a861ed708c8d9d4b1fe7d9ff475`, while the checked-in iteration
  records name approved source
  `575b77e825e598b15b7740f56956fe433a6153d8`.
  No Git command was permitted, so this report records both rather than
  asserting an unverified ancestry or exact checkout state.
- Historical 0018 inventory names journal tests as
  `common::journal::tests` and atomic tests as `common::atomic_file::tests`.
  `PERSIST-ORG-001` would intentionally change current test module paths; the
  append-only historical inventory must not be edited.
- No cross-workstream implementation dependency was found.

## Human Interventions

The user fixed the worktree, branch, kickoff, full-scope Conservative profile,
Wave 1 read-only boundary, sole writable report, task labels, and prohibition on
commands and commits.
No further human intervention occurred.

## Measurements

- Performance measurements: not applicable; no benchmark campaign requested or
  run.
- Size measurements: not taken; line reduction is not the selection criterion.
- Dependency measurements: manifest inspected; no candidate changes
  dependencies.
- Effort telemetry: unavailable; no timing, token, or cost values invented.
- Candidate activity: 10 stable candidate assessments, two plausible Wave 2
  repairs, one excluded low-value rename, and seven rejected false-sharing or
  low-value hypotheses.

## Proposed Decisions

No shared decision record is proposed.
The coordinator should reconcile `PERSIST-IMPL-001` and
`PERSIST-ORG-001` against other workstreams and the four-repair budget.
Wave 1 does not authorize either repair.

## Candidate Skills And Process Changes

None.
The existing instruction to test duplication against distinct persistence,
platform, recovery, worker, and failure guarantees directly prevented false
executor, publication, cursor, and budget consolidations.

## Remaining Work And Risks

- Coordinator reconciliation and explicit Wave 2 selection remain.
- If `PERSIST-IMPL-001` is selected, preserve independent fixed-byte test
  expectations and do not move validation or publication order into the codec.
- If `PERSIST-ORG-001` is selected, verify test discovery, private visibility,
  rustdoc paths, imports, and complete package behavior; do not rewrite
  historical records.
- RS-003 power-cut/filesystem qualification and RS-015 retention remain
  out-of-scope known issues, not simplification candidates.
- Buffered mode must remain explicitly non-production and must not acquire
  durable recovery semantics.
- Unix filesystem-boundary behavior and non-Unix compilation must remain
  distinct.
- No claim of validation is made for iteration 0019 because Wave 1 ran no
  commands.

Wave 1 stops here with full `sea-file` responsibility and category coverage
ready for full-scope coordinator reconciliation.
