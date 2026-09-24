# Iteration 0018: foundations Report

Status: complete; ready for coordinator integration review
Branch: `rust-service-iteration-0018-foundations`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0018-foundations`
Base commit: actual kickoff `37fa0c0e4a119f94844837818a810ef84f9f59f8`; approved source `73aae4414baff2e635f6ccdcbd2b4cb507d62bfd`.
Final commit: none; the coordinator owns commits.
Agent or owner: foundations implementation agent.
Model and tool version: unknown.
Instruction source: [foundations instructions](instructions/foundations.md) at kickoff `37fa0c0e4a119f94844837818a810ef84f9f59f8`.
Session or transcript reference: coordinator session `4cc33478-17d9-40d5-9640-a53d9778b2c5`.
Started and finished: started 2026-09-24T01:01:08Z; final isolated implementation validation completed 2026-09-24T01:35:03Z.

## Outcome

Inspected all source modules and crate guides in the four assigned crates, including unchanged code.
No crate, consequential boundary, or prior result was excluded by a review-count or elapsed-time limit.
The map below accounts for implementation, pure contracts, the shared test harness, and explicit qualification exclusions.
Repaired five localized behavior defects: boxed-stream progress coherence, content staging-file ownership, repeated-publication directory synchronization, missing-descendant classification during capability revalidation, and durable namespace initialization under approved Decision 0021.
Added 22 focused tests and strengthened existing boundary assertions.
Corrected conformance documentation that overstated its negative-path coverage.
Final isolated assigned checks pass: 65 tests, formatting, and strict package Clippy.
At handoff, the sessions workstream reported behavior inconsistent with its unchanged core source after foundations had built a repaired core dependency into the shared Cargo target.
The coordinator assigned a unique foundations target, and fresh compilation plus the follow-up checks below now establish worktree-specific dependency evidence.
The surprising earlier green remains a historical observation, not a proven Cargo defect.
The user resolved both previously escalated questions at 01:33:53.
The content constructor now owns bottom-up, filesystem-bounded namespace synchronization and propagates failures.
Core session contracts explicitly permit snapshots at any committed event, including `Joined`/`Left`, preserving existing local behavior under approved Decision 0022.
No commit, lockfile change, manifest change, or out-of-scope edit was made.

## Hypothesis Results

Confirmed owning-layer gaps: permissive core composition tests were absent; backend snapshot checks can mask a missing `SeaView` event-availability check.
Added owner-local component probes and demonstrated that removing only `SeaView::publish_snapshot`'s event check fails the new test (`2026-09-24T01-05-50.764Z-815999`, test exit 101); restored the check.
The memory reopening position-consistency guard also lacked a discriminating test.
Removing only `event.position != *position` fails the added memory test (`2026-09-24T01-08-06.022Z-829607`, test exit 101); restored the guard.
Current malformed-directory and numeric-position round-trip tests did not fully pin canonical bytes; added fixed encoding and malformed-case assertions.
Memory checkpoint replacement/ownership, raw snapshot ordering/selection, and exhausted batch notification now have focused tests.

Content publication audit identified a cleanup bug: a `create_new` collision enters cleanup and removes the already-existing temporary path, although this attempt never owned it.
A deterministic private publication-stage test fails with the original cleanup scope and passes after moving exclusive creation outside that cleanup scope.
Existing-target and racing publication now synchronize the object directory before acknowledgement, and an injected synchronization failure is propagated.
Capability revalidation now uses the same missing-root versus corrupt-descendant distinction as resolution.
The boxed monitored stream previously retained `FallenBehind` after delivering its last known item, violating the existing requirement `previous < latest_known`.
Delivery now maintains the latest-known lower bound and clears exhausted `FallenBehind` conservatively without inventing completed discovery.
Namespace creation previously synchronized the root but not its newly created ancestors.
After user approval of constructor-owned durability, initialization now synchronizes the canonical root and ancestors bottom-up, stopping at a different filesystem on Unix.
Owner-local constructor tests record exact synchronization order and propagated failure; a Linux `/proc` probe records traversal without actually synchronizing that filesystem.

## Deliverables and Commits

- `sea-core`: canonical position/directory encoding assertions, malformed directory cases, unlocked invalidation callback checks, permissive component probes for `SeaView` and default batching, and progress-wrapper repair/tests.
- `sea-memory`: checkpoint independence and lifetime, raw snapshot provenance/order/selection, missing event dependency, event item-position recovery, exhaustion-prefix wakeup, opening invalidation, and classified-error tests.
- `sea-content-addressed`: publication cleanup and synchronization repairs with deterministic failure injection, transitive availability classification, namespace-compatible handle/closure tests, and exact configured-bound checks.
- `sea-conformance`: README and module documentation now distinguish the actual successful-publication oracle from negative dependency/provenance checks owned by implementation tests.
- This report contains the complete ownership map, inventory rows, evidence, and two proposed decisions.
- Ordered commits: none; coordinator commit authority is preserved.

## Validation Evidence

Before substantive edits, assigned process task `process: rust-quality-0018-foundations` ran in loaded workspace `/workspaces/FluidFramework`.
No tool-search tool is exposed; the directly available `runTask` tool successfully invoked the assigned task.
Run `2026-09-24T01-01-15.737Z-796836` printed the absolute assigned Rust checkout, expected branch and full kickoff HEAD, and clean status.
`cargo fmt --all -- --check`, `cargo test -p sea-core -p sea-memory -p sea-content-addressed -p sea-conformance --all-targets --all-features`, and `cargo clippy -p sea-core -p sea-memory -p sea-content-addressed -p sea-conformance --all-targets --all-features -- -D warnings` each exited 0.
Baseline tests: core 12, memory 24, content-addressed 7, conformance 0 standalone tests.
Task output records logs under the coordinator session's `files/foundations/2026-09-24T01-01-15.737Z-796836/`.
The task successfully proves autonomous assigned-task invocation, not independent cancellation isolation.

Final code validation: run `2026-09-24T01-35-03.128Z-913011`, using the same task, cwd, branch, and full kickoff HEAD, with recorded target `/workspaces/.cargo-target-quality-0018-foundations`.
All three commands above exited 0, with no signal.
Final counts: core 21, memory 31, content-addressed 13; conformance has no standalone tests and is exercised through memory's bounded `replacement_storage_conformance`.
The retained evidence directory is `/home/node/.copilot/session-state/4cc33478-17d9-40d5-9640-a53d9778b2c5/files/foundations/2026-09-24T01-35-03.128Z-913011/`.
Its nonempty `result.json` was inspected for the matching run/cwd/branch/HEAD, three exact command records, exits, and log paths.
`1.log` contains the four test summaries and named tests; `2.log` contains completed Clippy output.
`0.log` may be empty because a successful format check emits no text.
The runner generates JSON through `JSON.stringify`; independent parse/size verification remains an integration acceptance check for the coordinator.
Every subsequent checkout guard showed only owned paths and no shared lockfile changes; the assigned runner additionally rejects a diff in `Cargo.lock` or `pnpm-lock.yaml` after successful checks.
The pinned toolchain file specifies 1.98.1; a separate `rustc --version` command was not exposed by the assigned task.
Editor diagnostics reported no errors for the changed implementation/test files.
The checkout-local content-test fixture directory was inspected after validation and was empty.
**Dependency-provenance caution:** all assigned tasks used `/workspaces/.cargo-target`.
At 01:23, the sessions owner reported new progress-coherence assertions passing against its old core source, while foundations had already compiled the corresponding core repair.
Shared-target artifact reuse is a hypothesis, not a proven Cargo defect.
The changed owning-core unit tests and deliberate mutation failures remain direct evidence for those local guards, but clean workstream-specific Cargo targets are required before accepting dependency/composition validation.
No task definitions or shared artifacts were modified by this workstream in response.
The sessions handoff also prompted a final test refinement: exercise data following an `AwaitingNewItems` observation and a subsequent changed, coherent source-progress snapshot.
Current code updates latest-known on data independently of the prior status; backward source progress is outside the documented coherent-source precondition.
No defensive rewriting of incoherent source observations or new shared semantics is proposed.
Coordinator clearance arrived at 01:26 after confirming no assigned checks remained active.
The runner now records the unique target and sets `CARGO_BUILD_JOBS=4`.
Fresh isolated-source run `2026-09-24T01-26-19.656Z-894435` passed all checks before further edits.
Then `delivery_after_awaiting_and_changed_source_progress_remain_coherent` was added and passed in isolated run `2026-09-24T01-27-02.694Z-896694`, alongside all then-current 63 tests, format and strict Clippy.
After the two approved decisions, final run `2026-09-24T01-35-03.128Z-913011` passed all 65 tests and the same checks.
The final log shows `sea-core` compiled from the assigned worktree and its test binary executed from the unique foundations target.
The dependency-provenance execution blocker is resolved for foundations; no more shared-target evidence is needed for its local acceptance.

| Discriminating experiment | Run | Observed result | Restoration |
| --- | --- | --- | --- |
| Remove only the core view's event-availability check | `2026-09-24T01-05-50.764Z-815999` | Test exit 101; only new `view_checks_dependencies_before_permissive_component_publication` fails in core | Check restored; subsequent full assigned checks pass |
| Remove only memory recovery's archive/item-position comparison | `2026-09-24T01-08-06.022Z-829607` | Test exit 101; new `event_handles_revalidate_membership_and_reopening_checks_item_positions` fails, 27 other memory tests pass | Comparison restored |
| Restore original staging creation inside cleanup scope | `2026-09-24T01-10-12.769Z-838022` | Test exit 101; unowned staging bytes disappear in `publication_cleanup_preserves_unowned_staging_files` | Exclusive creation restored outside cleanup scope; test cleans its directory before asserting |
| Skip synchronization on the existing-object branch | `2026-09-24T01-12-10.008Z-844459` | Test exit 101; injected sync failure is incorrectly acknowledged as success | Synchronization restored |
| Restore previous-only boxed-stream delivery update | `2026-09-24T01-13-03.561Z-848670` | Test exit 101; `delivered_items_keep_latest_and_backlog_status_coherent` observes invalid exhausted `FallenBehind` | Coherent delivery update restored |

Formatting-only failures were preserved in runs `01-03-54.492Z-807161`, `01-05-26.435Z-812623`, `01-06-42.054Z-822130`, `01-09-35.794Z-835820`, `01-11-57.636Z-844181`, `01-12-50.543Z-847157`, and `01-16-48.372Z-863979` on 2026-09-24.
Their rustfmt suggestions were applied before further validation.
The approved namespace follow-up also had a format-only failure in `2026-09-24T01-34-43.178Z-912555`; its single wrapping correction was applied before the final pass.
Run `2026-09-24T01-07-15.812Z-824780` passed tests but failed strict Clippy's 100-line test limit; a redundant snapshot-head assertion was removed while retained publication identities remain asserted.
These are retained development failures, not unexplained flaky tests or discarded product failures.
Workspace rustdoc/build/test, documentation checking, policy checking, generated consumers, repository build, and iteration validators remain coordinator-owned gates.

## Behavioral Contracts and Test Layers

### Complete Crate and Responsibility Map

| Crate | Inspected source responsibility | Coverage and exclusions |
| --- | --- | --- |
| `sea-core` | `archive.rs`, `blob.rs`, `monitored_stream.rs`, every `storage/*.rs`, `session.rs`, `signals.rs`, `snapshot.rs`, and `lib.rs` | Identity/encoding, progress, invalidation, composed dependency sequencing, batches, snapshot selection/live suffix, and all storage/session/signal contracts reviewed. Trait-only requirements are assigned to their implementation owners; derived value traits and forwarding accessors do not need redundant declaration tests. |
| `sea-memory` | All of `document.rs`, `memory_archive.rs`, and root exports | Registry/exclusive openings, components/handles/streams, immutable trees, events/batches, snapshots, recovery, checkpoints, lazy finite/live reads, wakeups, errors, and never-invalidating observation reviewed. Process-unique allocation exhaustion requires no global-counter mutation test: checked arithmetic is direct, and counter changes could interfere with unrelated concurrent tests. |
| `sea-content-addressed` | All of `lib.rs` and `storage.rs` | Namespace creation, canonical paths, content limits/identity checks, staged hard-link publication, retries, cleanup, sync acknowledgement, iterative closure, handle provenance/reopen, and error classification reviewed. Namespace durability is repaired under approved Decision 0021. Device power-cut qualification and concurrent external filesystem mutation are not claimed by unit tests. |
| `sea-conformance` | All three public suites and every private helper in `lib.rs` | Each assertion checked against core contracts, including sparse positions, compatible handles, snapshot policies, retained/live replay, exact session publication retry, and isolated close. No assumption of dense backend positions was added. Meta-testing standard assertion/`expect` mechanics is excluded as redundant; the suite is itself an oracle, not a backend implementation. |

Review order followed consequence: ownership/recovery and publication first, then archive/composition state transitions, parsing/progress, and the test harness.
Prior 0017 inventory and sequential-audit records were checked as inherited evidence after current-code inspection, not used to skip these crates.
No previous inventory supplied an accepted disposition for this complete four-crate map.

### Inventory Rows

All rows are owned by this foundations workstream/report.
Test names below resolve to the linked owning source module: memory tests are in `document.rs` unless `memory_archive::tests` is specified; core view tests are in `storage/tests.rs`.
Validation `final` means the final three passing assigned commands documented above.
`repaired` is proposed for integration acceptance, not a claim that Phase 3 has accepted the change.

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| foundations-core-identities | Core numeric values; storage/protocol/session users | A matching encoder/decoder bug can survive a round trip | [EventPosition and SessionId][identities]: canonical big-endian positions, nonzero session identities | Focused | `event_positions_use_canonical_ordered_bytes` now checks fixed non-symmetric bytes; `numeric_identities_preserve_all_nonzero_values` rejects zero and checks extrema | repaired | Numeric position assertions; session implementation unchanged | final | Identity encoding/allocation changes |
| foundations-core-content-codec | Core blob identities/directories; all stores and wire codecs | Malformed tags/order/UTF-8 and coordinated codec drift | [BlobDirectory][blob]: deterministic encoding; decoder rejects malformed, unsorted, duplicate, trailing data | Focused | `directory_encoding_has_stable_lengths_order_and_child_tags` pins bytes, every truncation, duplicate/descending names, invalid tags/UTF-8/names; existing versioned BLAKE3 golden vectors guard hash domains | repaired | Golden and malformed-case test | final | Format/domain changes |
| foundations-core-progress | Core stream adapter; sequencer/transports/decorators | Valid delivery produced `FallenBehind` with equal cursors | [MonitoredStream][progress]: `FallenBehind` requires `previous < latest_known`; latest names known in-range data | Focused | `delivered_items_keep_latest_and_backlog_status_coherent` rejects original behavior; `previous_advances_only_when_an_item_is_yielded` protects delivery timing | repaired | Local delivery normalization and source-precondition docs | final; mutation fails | Adapter or progress-source changes |
| foundations-core-stream-map | Core transform adapter; decorators and snapshot readers | Error/progress must not be mistaken for transformed data | [map_monitored_stream][progress]: preserve source progress; transformation failure does not rewind delivery | Focused | Existing transformation-error test plus `mapped_source_errors_and_progress_do_not_transform_data_or_advance_cursor` discriminate data/error/progress routing and completion | repaired | Source-error/progress test | final | Wrapper routing/cancellation changes |
| foundations-core-invalidation | Core source/registration; file openings and session caches | Locking, sticky terminal state, races, callback reentry hazards | [InvalidationSource][invalidation]: sticky first cause, synchronous callbacks outside source lock, unregister on drop | Focused | Existing sticky/unregister and registration-race tests; `callbacks_run_outside_the_source_lock` uses `try_lock` for both early and late callbacks | repaired | Lock-locality test | final | Observer dispatch/lifetime changes |
| foundations-core-view-publication | Core SeaView; all storage compositions | Backend validation can mask a missing core check | [SeaView append/publish_snapshot][view]: establish content, then event availability before owner publication | Focused plus conformance | New permissive components record exact call order; rejected capabilities never reach permissive append. Removing the core event check fails only the new focused guard | repaired | New owning-core fixture/test | final; mutation fails | Component composition changes |
| foundations-core-batches | Core Archive default and SeaView; grouped backends | Retry or incorrect dependency-error placement changes accepted prefix | [Archive default][archive] stops first error; [view batch][view] returns dependency failure only after complete preceding success | Focused plus conformance | `default_batch_stops_at_first_failure_without_retry` checks empty/success/first/middle failures; `view_batch_dependency_error_follows_only_a_fully_successful_prefix` distinguishes append failure from later dependency failure | repaired | New focused tests | final | Batch result/cancellation semantics change |
| foundations-core-load-selection | Core SeaView; sequencers/readers | Snapshot lookups, initialization errors and captured head are distinct | [get_snapshot/load][view]: Beginning skips lookup, optional inclusive/latest selection, no captured head, read errors lazy | Focused plus conformance | `load_selects_without_a_head_and_defers_read_errors` records lookup/cursors, panics on head access, distinguishes lookup failure from lazy stream error | repaired | New focused test | final | Load policy changes |
| foundations-core-contract-only | Core trait/value modules; implementation owners | Testing declarations as if they implement storage/session policy misassigns responsibility | [Session][sessions], [signals][signals], [storage surfaces][view], [checkpoint][checkpoint], [snapshot archive][snapshotarchive], root error/durability values | Contract inspection; implementation-owned tests | Inspected author accepted-prefix/close/retry, snapshot authority, signal delivery/cancellation, availability, durability/settlement, native/browser bounds. Core contains no implementations of those session/signal policies | excluded | No redundant runtime tests of trait declarations, derived markers, or trivial forwarding; implementation owners retain responsibility | Source review; coordinator tests concrete implementers | Contract edits or a concrete default implementation |
| foundations-core-session-snapshot-position | Core SeaArchive contract; local/remote/session decorator implementers | Local implementation accepts Joined/Left positions, but prior “application position” wording could exclude them | [SeaArchive::resolve_position and SeaSnapshotCoordinator::publish_snapshot][sessions]: any committed session event, explicitly including Joined/Left | Contract inspection; sessions/transport-owner implementation tests | User approved any committed position; core has no concrete session resolver, so concrete runtime evidence belongs to sessions/transport owners | repaired | Explicit core resolver/publication/load docs and core README under Decision 0022; existing local behavior preserved | final core checks; coordinator reconciles concrete implementation evidence | Any proposed restriction or membership-event behavior change |
| foundations-memory-ownership | Memory registry/components; local factory users | Leaked leases or accidental reopening can create competing writers | [Memory ownership][memoryguide]: component clones retain opening; streams/handles retain data only | Focused | `factory_identity_and_component_clone_lifetimes`, `event_read_retains_only_its_archive_until_dropped`, `snapshot_stream_survives_reopening_without_retaining_handle_cycles` directly check lease/data weak pointers and reopen results | already adequate | None; these tests fail on the exact ownership decisions | final | Retention/registry/component changes |
| foundations-memory-content | Memory immutable maps; local content users | Membership shortcuts require invariant preservation | [BlobStorageData][memory]: direct children exist before insert; immutable closure makes membership sufficient | Focused | `content_publication_preserves_closure_and_deduplicates`, `content_publication_rejects_missing_children_without_mutation`, `blob_handles_check_document_provenance_and_closure`, and shared-subtree reopen test inspect maps, identities and foreign handles | already adequate | None; no conformance substitute is used | final | Collection, mutation, provenance, hashing changes |
| foundations-memory-event-order | Memory event component; SeaView/sequencer | Cancellation and concurrency must not duplicate/detach appends | [Memory publication][memoryguide]: no internal suspension/detached work, increasing distinct positions, raw tree IDs opaque | Focused | `cancelled_appends_have_no_detached_work_and_concurrent_appends_are_distinct`, `exhausted_event_positions_reject_without_changing_history`, `raw_event_archive_keeps_blob_ids_opaque_but_reopen_checks_dependencies` guard exact append/storage decisions | already adequate | None | final | Async append, allocation, or storage changes |
| foundations-memory-batch-prefix | Memory batch append; composed view | Exhaustion can lose notification or append an invalid suffix | [Memory publication][memoryguide]: successful prefix retained; readers woken after archive lock; no ambiguity | Focused | `exhausted_batch_retains_and_notifies_only_its_successful_prefix` seeds MAX-1, checks MAX success/error count, actual wake, delivered payload, head and unchanged suffix | repaired | New owning-component test | final | Batch lock/notification/allocation changes |
| foundations-memory-snapshots | Memory raw snapshot component; view/recovery | View checks can mask component provenance; conformance alone lacked local diagnosis | [SnapshotArchive][snapshotarchive] and [memory guide][memoryguide]: exact/inclusive sparse selection, increasing positions, compatible dependencies | Focused plus conformance | `snapshot_component_enforces_provenance_order_and_sparse_lookup` bypasses the view and checks foreign root/event, exact holes, inclusive selection and rejection without history loss; missing-event and existing missing-root tests guard lookup/read consistency | repaired | Raw-component and missing-event tests | final | Snapshot lookup/publication/resolution changes |
| foundations-memory-recovery | Memory document validation; reopening clients | Required prefix/positions/dependencies must not silently disappear | [Document::validate][memory] and [storage recovery law][view]: matching positions, complete prefix and dependency-closed snapshots | Focused | Existing missing-tree/gap/snapshot-position tests plus `event_handles_revalidate_membership_and_reopening_checks_item_positions`; removing only item-position comparison fails the latter | repaired | Event-handle/recovery guard | final; mutation fails | Recovery or stored representation changes |
| foundations-memory-read-ranges | MemoryRead; event/snapshot consumers | Lazy initialization, sparse ranges and progress are easy to couple incorrectly | [Memory reads][memoryguide]: exclusive/inclusive bounds, lazy errors, empty future ranges, delivery-only cursor advancement | Focused | `memory_archive::tests::finite_reads_check_sparse_bounds_progress_and_completion` checks the explicit sparse/empty bound matrix and termination; `read_bounds_are_lazy_and_readers_do_not_prevent_reopening` checks initialization timing | already adequate | None; owning-reader assertions cannot be satisfied by another component | final | Cursor/bounds/progress changes |
| foundations-memory-live-read | Memory subscriptions; reopened live readers | Lost wakes, stale wakers, reader retention | [Memory reads][memoryguide]: live across reopen, backlog status, independent cancellation | Focused | `live_read_wakes_across_reopening_tracks_backlog_and_cancels_independently` replaces actual waker and checks exact counts/cursors; `memory_archive::tests::dropped_readers_are_pruned_without_retaining_their_wakers` checks weak registrations | already adequate | None | final | Subscription synchronization/lifetimes |
| foundations-memory-checkpoint | MemoryCheckpoint; sequencer recovery | Previously no owner-local state/lease evidence | [CheckpointStore][checkpoint]: nonempty atomic replacement independent of archives and retaining opening discipline | Focused | `checkpoints_replace_opaque_state_without_publishing_archive_entries` checks absent/replacement/rejected-empty/retained bytes, empty archives, exclusive lease and reopen | repaired | New component test | final | Checkpoint persistence or lease changes |
| foundations-memory-invalidation-errors | Memory observer/error taxonomy; recovery clients | Default no-observer behavior is not the explicit never-invalidating capability | [Memory ownership][memoryguide]: independent owners survive shutdown/drop; [core classification][core] stable caller decisions | Focused | `independent_opening_never_invalidates_on_factory_shutdown_or_drop` checks `Some` registration and live append after shutdown; `errors_preserve_caller_recovery_classification` checks every memory variant | repaired | Two focused tests | final | Shutdown or classification changes |
| foundations-content-integrity-bounds | ContentStore object reads/writes; filesystem users | Equality-at-limit, wrong config field, hash/encoding mismatch | [ContentStore][content]: enforce configured limits and verify requested identity | Focused | Existing blob/directory corruption, mismatch, absent-object and reopen tests; strengthened exact-limit and stored-directory upper-bound checks would fail wrong-limit/strictness regressions | repaired | Existing bound tests strengthened | final | Identity/limit/read changes |
| foundations-content-staging | ContentStore publication; competing/restarted writers | Failed create removed a path the attempt never owned | [Publication][contentguide]: removes its own staging file after ordinary failures | Focused | `publication_cleanup_preserves_unowned_staging_files` preserves a preexisting staging file, cleans owned failed/racing staging files and preserves immutable target | repaired | Ownership repair, helper and explicit contract sentence | final; original behavior fails | Publication naming or cleanup changes |
| foundations-content-ack-sync | ContentStore publication; durable-content callers | Existing/racing target could acknowledge before directory sync | [Publication][contentguide]: synchronize destination directory before acknowledgement | Focused with injected failure | `existing_and_racing_publications_propagate_directory_sync_failure` tests existing, race and new-target branches; skipped existing sync produces false success and fails guard | repaired | Shared local sync path and explicit repeated-publication docs | final; mutation fails | Sync/link/ack ordering changes |
| foundations-content-tree-availability | ContentStore trait implementation; availability consumers | Immediate-child checks miss transitive absence; ensure classified missing descendant as rejected | [ContentStore storage][contentstorage] and [guide][contentguide]: verify complete reachable trees; existing root with missing descendant is corrupt | Focused | `trait_publication_and_resolution_validate_transitive_content` checks missing grandchild before parent publication, no parent resolution, corruption classification on resolve/ensure, and corrupt descendant bytes | repaired | Reuse resolution classification during ensure; transitive test | final | Closure traversal or error classification changes |
| foundations-content-provenance | ContentHandle/canonical namespace; reopen callers | Equal identity does not grant foreign-namespace availability | [ContentStore storage][contentstorage]: canonical namespace evidence, compatible reopen, no writer lock | Focused | Existing `closure_provenance_reopen_and_missing_dependency` checks equal foreign content rejected/reopen accepted; new alias-path assertions prove canonical equivalent namespace accepted | repaired | Canonical alias evidence added | final | Namespace/path/handle changes |
| foundations-content-classification | StoreError; storage/service consumers | Recovery must distinguish corruption, unavailability and rejection | [ClassifiedError][core] and [StoreError][content] categories | Focused | `errors_preserve_caller_recovery_classification` checks IO, corruption, absence, incompatible handles and configured-limit errors | repaired | Focused taxonomy table | final | Error variants/classification changes |
| foundations-content-namespace-durability | ContentStore::open; standalone library consumers | `create_dir_all` created several unsynchronized ancestor names | [ContentStore::open][content] and [guide][contentguide]: constructor owns bottom-up namespace synchronization through its filesystem; errors propagate | Focused constructor/failure and filesystem-boundary tests | `namespace_creation_synchronizes_bottom_up_and_propagates_failure` injects the constructor's real synchronization boundary, checks canonical root, child namespaces, exact ancestor order, and parent failure; `namespace_sync_stops_before_another_filesystem` records only `/proc` on Linux | repaired | Local helper plus injectable constructor stage and explicit docs under approved Decision 0021; no shared extraction | final: 13 content tests, strict Clippy/fmt | Namespace layout, mount handling or platform qualification changes |
| foundations-conformance-oracle-scope | Conformance suites; backend/session test authors | Topical positive-path coverage was described as negative provenance/dependency coverage | [Conformance module][conformance] and [guide][conformanceguide] document actual assertions | Conformance; direct assertion inspection | All three suites/helpers reviewed. Storage suite checks successful publication/compatible reopened handles, not foreign/unavailable rejection. Documentation now says so; concrete implementations require owner-local guards | repaired | Coverage documentation only; executable assertions unchanged | final memory invocation; session consumers remain coordinator validation | Suite assertions or coverage claims change |
| foundations-platform-qualification | Filesystem/runtime platform owners; production adopters | Process reopen cannot prove device persistence or hostile external mutation safety | [Known issues][known]: power-cut qualification outstanding; storage synchronization assumptions | Platform qualification | No power-cut campaign, filesystem fault model redesign, GC, or external concurrent namespace attack model was authorized. Software sync-path injection proves branch/error propagation only | excluded | No production qualification claim | Scope review | Target deployment/power-loss qualification approval |

[identities]: ../../../../crates/sea-core/src/archive.rs
[blob]: ../../../../crates/sea-core/src/blob.rs
[progress]: ../../../../crates/sea-core/src/monitored_stream.rs
[invalidation]: ../../../../crates/sea-core/src/storage/invalidation.rs
[view]: ../../../../crates/sea-core/src/storage/mod.rs
[archive]: ../../../../crates/sea-core/src/storage/ordered_archive.rs
[sessions]: ../../../../crates/sea-core/src/session.rs
[signals]: ../../../../crates/sea-core/src/signals.rs
[checkpoint]: ../../../../crates/sea-core/src/storage/checkpoint.rs
[snapshotarchive]: ../../../../crates/sea-core/src/storage/snapshot_archive.rs
[core]: ../../../../crates/sea-core/src/lib.rs
[memory]: ../../../../crates/sea-memory/src/document.rs
[memoryguide]: ../../../../crates/sea-memory/README.md
[content]: ../../../../crates/sea-content-addressed/src/lib.rs
[contentstorage]: ../../../../crates/sea-content-addressed/src/storage.rs
[contentguide]: ../../../../crates/sea-content-addressed/README.md
[conformance]: ../../../../crates/sea-conformance/src/lib.rs
[conformanceguide]: ../../../../crates/sea-conformance/README.md
[known]: ../../../../KNOWN_ISSUES.md

### Layer Assessment

New [core probes](../../../../crates/sea-core/src/storage/tests.rs) are intentionally permissive: they localize the composing view's responsibility rather than letting backend checks satisfy its assertions.
Memory tests bypass the view where raw components own validation.
Content tests operate on the object/trait engine directly and inject synchronization failure only at the filesystem acknowledgement boundary.
Their filesystem fixtures use checkout-relative `target` paths and remove their owned directories; they do not depend on the host temporary directory.
Shared conformance retains substitutability evidence without being counted as owner-local negative-path diagnosis.
Generated/browser integration must still prove compiled consumer behavior and native/browser adapter composition; those checks cannot replace these local guards.
No new shared API or conformance law was introduced.
The namespace and session-position contract clarifications follow the explicit user-approved decisions, rather than unilateral policy changes.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Provenance | Direct assigned task invocation succeeded before implementation | Baseline run and clean checkout guard above | Autonomous task loop available | No delegate shell or nested agent used | Probe actual delegate access, not parent assumptions |
| Falsified adequacy | Backend validation could hide a missing core view check | Deliberate core mutation fails new permissive fixture | Prior composition evidence insufficient for core owner | Repaired | Use permissive dependencies to discriminate composing-owner behavior |
| Local bugs | Staging ownership, duplicate sync, missing-descendant classification and exhausted backlog state | Focused tests and five mutation/reproduction runs above | Real behavior gaps, not documentation counts | Repaired under existing contracts | Test failure/cancellation/ack branches and state immediately after delivery |
| Repeated friction | Check-only formatting task required multiple manual rustfmt-diff corrections | Seven recorded format-only failures | Extra edit/check round trips | Corrected without terminal ownership violation | Consider a separately assigned formatter process task |
| Lint | Snapshot test exceeded local line limit | Clippy run `01-07-15.812Z-824780` | Final check initially failed despite passing tests | Removed redundant assertion; final strict Clippy passes | Keep focused fixtures concise without disabling policy |
| Decision | Standalone namespace initialization durability was not established | Original `ContentStore::open` synchronized root only | Could not accept full namespace durability claim | User approved constructor ownership; implemented and validated under Decision 0021 | Separate an object's synchronized directory entry from its namespace ancestry |
| Coordination | Persistence reported a full-suite wake-suppression mutation hanging unrelated reads | Coordinator identified runner 834907, Cargo 834961 and test 835555, stopped only the test, and verified exit; persistence reports restored-source run `2026-09-24T01-18-47.395Z-868278` passed fmt, 59 unit plus 1 process test, Clippy and lockfile guard | Full-suite liveness mutations can block unrelated validation | Resolved; no active persistence task or mutation remains, and foundations took no cancellation/terminal action | Request a filtered, bounded coordinator command before a mutation that can prevent completion |
| Evidence escalation | Sessions observed new progress assertions passing against its unchanged core source after foundations compiled its core repair | Sessions handoff message at 01:23; both used `/workspaces/.cargo-target` | Earlier dependency binary provenance was uncertain despite correct checkout guards | Foundations resolved its validation blocker with fresh unique-target runs at 01:26 and 01:27; no Cargo defect inferred | Checkout identity alone does not settle cached dependency provenance |

## Contract and Integration Friction

Core stream repairs are consumed by sequencer/transports and generated WASM; integration must validate those consumers.
The sessions owner was notified about the source-progress precondition and the demonstrated exhausted-backlog violation.
The sessions owner separately identified a conversion concern: an ordinary `Stream` wrapper cannot observe a wrapped `MonitoredStream`'s synchronous `progress()` updates unless its caller forwards them.
That owner is checking the non-cached session conversion; the core exhausted-backlog fix does not claim to reconstruct observations absent from its ordinary-stream input.
The persistence owner was notified about content staging/synchronization findings and the namespace question.
Repository search found no non-content-crate Rust consumer of `ContentStore`; `sea-file` has its own namespace synchronization implementation.
No dependency on another owner's uncommitted changes was introduced.
The standalone namespace policy was escalated rather than silently assuming that `sea-file` initialization protects this independent store, then implemented under the user's explicit constructor-owned policy.
At handoff, the persistence owner confirmed that `sea-file` does not delegate publication to this crate and reported its own bottom-up, device-boundary-limited initialization tests: `namespace_sync_is_bottom_up_and_propagates_failure` and `namespace_sync_stops_at_filesystem_boundary`.
Those tests establish a file-backend responsibility, not a host guarantee for standalone `ContentStore`.

## Human Interventions

The user explicitly approved constructor-owned bottom-up filesystem-bounded namespace durability and any-committed-session-event snapshot positions at 01:33:53.
These approvals resolved the two escalated ambiguities; coordinator records accepted Decisions 0021 and 0022 in integration.
The existing authorization supplies full coverage, localized repair authority, no nested agents, coordinator-only shell access, and no delegate commits.

## Measurements

Linux checkout; pinned Rust 1.98.1; actual model/tool versions unknown.
Observed baseline/final test counts are 43/65, a consequence of focused boundary additions rather than a coverage metric.
No performance, binary-size, dependency-restoration, or throughput benchmark was performed; these measurements are not applicable.
Some Cargo calls reported waiting for the shared target-directory lock; task isolation and attributable logs remained intact.
Total human effort/token use is unknown; timestamps above are observed task timestamps, not a benchmark.

## Proposed Decisions

**Resolved — Decision 0021:** standalone `ContentStore::open` owns crash-durable namespace creation, including newly created ancestors.

The original API opened or created the root and described durable storage, but implementation synchronization stopped at that root.
Option A makes the constructor self-contained and needs an approved ancestor/mount-boundary rule plus a focused injected synchronization-order/failure test.
Option B introduces an explicit caller precondition and narrows the apparent constructor guarantee; it must not be inferred merely because a different crate has stronger initialization.
The user selected Option A: bottom-up synchronization through the namespace filesystem, stopping at its boundary and propagating errors.
Implemented entirely in the owned content crate, without extracting a shared helper.
The coordinator owns accepted Decision 0021's integration record.

**Resolved — Decision 0022:** session snapshots may resolve and reference any committed event, including `Joined`/`Left`.

Storage snapshots explicitly reference committed events; membership records share the session archive order.
`SeaArchive::resolve_position` previously said “committed application position” without defining whether it excluded those records.
The sessions owner reports that `LocalSession::resolve_position` forwards storage resolution without filtering and that publication fallback accepts those handles.
Option A preserves that behavior and clarifies the session contract to include committed membership positions.
Option B deliberately restricts the contract and requires consistent local, remote, and decorator validation with compatibility consequences.
The user selected Option A.
Core resolver, publication, load and README wording now explicitly includes membership events; sessions and transport owners were notified of the exact wording.
No runtime restriction was introduced in core; the coordinator owns the accepted Decision 0022 record and cross-implementation evidence.

## Candidate Skills and Process Changes

Candidate: register an ownership-scoped formatter task alongside check-only validation when delegates lack shell access.
This would remove repeated manual formatting correction without granting shared terminal ownership.
Do not modify reusable skills based only on this local observation.
For liveness-affecting mutations, use a coordinator-approved narrow test filter and bounded timeout rather than the full assigned suite.
The foundations mutations recorded here changed assertions, validation, or returned outcomes without deliberately suppressing wakeups or completion.
The established permissive-dependency mutation technique needs no new skill: it directly follows the existing quality skill's discriminating-owner requirement.

## Remaining Work and Risks

1. No assigned review or localized repair remains blocked; both semantic decisions are approved and implemented in owned paths.
2. Coordinator: inspect the owned diff, verify retained JSON artifacts independently, execute canonical workspace/rustdoc/build/documentation/policy checks, fresh generated consumers and root `pnpm build:fast`, and reconcile these inventory rows.
   Foundations has completed its isolated-target rerun and prior-Awaiting/changed-source-progress refinement; use independent integration-target evidence for the final composed gate.
3. Coordinator: decide the repository changeset entry for the user-visible core/content fixes under shared ownership rules, then create the coherent local commit after evidence review.
4. Preserve no mutation: all deliberately defective implementations were restored before the final passing run.
5. Intentional uncommitted artifacts are exactly the four owned crate changes and this report; no unknown or out-of-scope path appeared in checkout guards.
6. Physical power-loss qualification, external namespace modification, retention/GC, and broad redesign remain excluded rather than silently promised.

Convergence: this full reassessment found genuine local defects and previously masked owner-level gaps despite passing baseline tests.
The strengthened core and memory tests fail under isolated owner mutations, so they are not redundant topical coverage.
No further full iteration is justified solely by increased test count; complete independent integration review of the accepted decisions and localized repairs.
Assigned inspection, localized repair, and isolated dependency validation are complete; final acceptance is pending coordinator gates only.
