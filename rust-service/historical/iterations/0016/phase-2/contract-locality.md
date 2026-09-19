# Iteration 0016: contract-locality Report

Status: complete
Branch: `rust-service-iteration-0016-contract-locality`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0016-contract-locality`
Base commit: `a9fe0f14864cf9f607f84ca427d126f629c2fd0d`
Final commit: the report-bearing workstream commit; its hash is returned to the coordinator because a commit cannot contain its own hash
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [`instructions/contract-locality.md`](instructions/contract-locality.md) at `a9fe0f14864cf9f607f84ca427d126f629c2fd0d`
Session or transcript reference: none
Started and finished: 2026-09-17; exact times unknown

## Outcome

Challenged all 33 iteration `0015` `already adequate` rows against precise owning contract text and practical local diagnosis. One material cluster was confirmed: the benchmark workload runners did not explicitly promise that success required every concurrent operation, one latency per operation, and an exact finite-read fixture multiset, while the inherited smoke was broader than practical owner-local diagnosis. Added concise runner contracts and one focused test covering both two-writer runner branches. The other 32 rows retain `already adequate`; direct evidence or a justified generated/conformance boundary is recorded below. No production behavior, public API, format, dependency, manifest, lockfile, generated artifact, platform fixture, or shared semantic changed.

## Hypothesis Results

- **Contract traceability: supported for one cluster.** The benchmark runners' comments said only
	that they ran workloads, while result consumers rely on success proving complete writer
	cardinality and exact finite-read contents.
- **Diagnostic locality: supported for one cluster.** The inherited smoke crossed multiple
	backends and workload modes; `concurrent_writers_complete_before_measurement_returns` now
	exercises both concurrent runner branches in the owning crate.
- **Convergence: supported.** Thirty-two inherited dispositions already had precise promise text
	and practical diagnosis. One focused repair, rather than another broad audit, closed the only
	material gap.

## Deliverables and Commits

- [`sea-benchmarks/src/main.rs`](../../../../crates/sea-benchmarks/src/main.rs) documents successful
	storage/session workload completion and adds the focused two-writer regression test.
- This report records all 33 inherited adequate-row dispositions and validation.
- One report-bearing workstream commit contains both deliverables.

## Validation Evidence

- Guarded checkout evidence: worktree
	`/workspaces/FluidFramework-rust-service-iteration-0016-contract-locality`, branch
	`rust-service-iteration-0016-contract-locality`, and base
	`a9fe0f14864cf9f607f84ca427d126f629c2fd0d` were verified before work and the focused run.
- `cargo test -p sea-benchmarks tests::concurrent_writers_complete_before_measurement_returns -- --exact --nocapture` passed with one selected, one passed, and zero failed.
- `cargo fmt --all -- --check` passed.
- `cargo clippy --workspace --all-targets --all-features -- -D warnings` passed.
- `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps` passed.
- `cargo test --workspace --all-targets --all-features` passed; the quiet evidence rerun reported
	111 tests passed across workspace targets and zero failed.
- `node scripts/check-documentation.mjs` passed: 24 roots, 31 READMEs, and 48 local links.
- `cargo run -p sea-benchmarks -- smoke` passed and reported the two-writer memory cell,
	memory/file snapshot cells with 32 records, and all Wave 3 adapter cells with eight records.
- `git diff --check`, unchanged `rust-service/Cargo.lock` and `pnpm-lock.yaml`, and writable-path
	guards passed. Only `sea-benchmarks/src/main.rs` and this report changed.
- No machine-readable output was required or retained.

## Behavioral Contracts and Test Layers

The changed production crate is `sea-benchmarks`, although only internal contract comments and its test module changed. Focused tests prove harness-owned acceptance decisions. Conformance tests below are credited only when the implementation is directly instantiated by its crate test and the shared assertion names the violated law. Generated Node evidence is retained only for JavaScript member optionality. Integration, executable, and platform evidence remains distinct composition evidence rather than a substitute for local decisions.

| Boundary | Precise contract text | Owning decision and nearest practical diagnosis | Disposition |
| --- | --- | --- | --- |
| `sea-benchmarks/finite-read-integrity` | [`verify_payloads`: “Verifies the exact payload multiset without assuming concurrent append order.”](../../../../crates/sea-benchmarks/src/main.rs#L883) | Exact count and multiplicity; `payload_verification_rejects_duplicate_wrong_payloads`. | already adequate |
| `sea-benchmarks/concurrent-writer-completion` | [`run_session` and `run_storage`: success requires every operation, one latency sample, and the exact fixture multiset.](../../../../crates/sea-benchmarks/src/main.rs#L539) | Join every writer and reject wrong cardinality/content; new `concurrent_writers_complete_before_measurement_returns` covers storage and session branches locally. | repaired |
| `sea-core/monitored-stream-map-progress` | [`map_monitored_stream`: “A data transformation error does not rewind the source cursor.”](../../../../crates/sea-core/src/monitored_stream.rs#L242) | Delegate `progress()` to the advanced source; `mapped_progress_preserves_source_delivery_after_transformation_error`. | already adequate |
| `sea-core/caller-value-invariants` | [`EventPosition` is canonical big-endian; identity constructors create nonempty identities.](../../../../crates/sea-core/src/archive.rs#L25) | Codec order/round-trip and three constructor decisions; `event_positions_use_canonical_ordered_bytes` and `caller_identities_preserve_nonempty_bytes_and_reject_empty_values`. | already adequate |
| `sea-conformance/session-monitored-progress-accessor` | [`MonitoredStream::progress` returns the latest atomic snapshot and advances only on yielded data.](../../../../crates/sea-core/src/monitored_stream.rs#L24) | `LocalSession` cursor updates; local `local_session_matches_observable_behavior` directly instantiates the suite, whose accessor assertions identify each state. | already adequate |
| `sea-conformance/session-fallen-behind-recovery` | [`FallenBehind` requires unread known items and must eventually be reported under accumulating pressure.](../../../../crates/sea-core/src/monitored_stream.rs#L50) | Detect broadcast lag and resume from `previous`; local `configured_event_lag_reports_fallen_behind_and_recovers`. | already adequate |
| `sea-conformance/storage-fresh-state-and-atomic-load` | [`SeaStorage::load` “selects a compatible snapshot and captures a finite catch-up stream atomically.”](../../../../crates/sea-core/src/lib.rs#L140) | Each backend supplies a fresh instance; local conformance invocations run `storage_starts_empty` and `assert_captured_load`, whose assertions name empty surfaces and captured tail. | already adequate |
| `sea-content-addressed/publication-integrity` | [“Repeated publication verifies and reuses an existing immutable object only when its bytes match.”](../../../../crates/sea-content-addressed/README.md#L11) | Shared collision verifier; `publication_verifies_existing_content`. | already adequate |
| `sea-content-addressed/bounded-verified-reads` | [“Reads enforce configured byte limits and verify that stored bytes match the requested identity.”](../../../../crates/sea-content-addressed/README.md#L14) | Pre-allocation bound and post-read identity; `rejects_blob_bounds_and_corruption`. | already adequate |
| `sea-content-addressed/directory-identity` | [`SeaStorage::get_directory` fetches and verifies one immutable directory.](../../../../crates/sea-core/src/lib.rs#L99) | Compare decoded canonical ID with requested ID; `rejects_directory_identity_mismatch`. | already adequate |
| `sea-file/clean-reopen-and-strict-corruption` | [Opening validates framing and invalid/incomplete bytes are corrupt; clean reopen preserves state.](../../../../crates/sea-file/README.md#L10) | Strict whole-archive parse and reconstruction; `clean_reopen_preserves_archive_state` and `open_rejects_incomplete_or_invalid_archive_framing`. | already adequate |
| `sea-sequencer/snapshot-coordination-latest` | [`SeaSnapshotCoordinator` subscribes to latest-value updates; sequencer snapshots may coalesce intermediate values.](../../../../crates/sea-core/src/lib.rs#L201) | Direct publication updates snapshot and coordination watches; `direct_snapshot_publication_updates_coordination_streams`. | already adequate |
| `sea-sequencer/monitored-load-progress` | [Load atomically selects snapshot/head, emits catch-up, and reports caught-up progress.](../../../../crates/sea-sequencer/README.md#L26) | Initialize `previous`/`latest_known` from selected snapshot; local `local_session_matches_observable_behavior`, specifically `assert_snapshot_load_progress`. | already adequate |
| `sea-memory/read-range` | [`SeaStorage::read` reads “strictly after `after` through `through`.”](../../../../crates/sea-core/src/lib.rs#L106) | Convert endpoints to `(after, through]`; `read_includes_through_and_excludes_later_events`. | already adequate |
| `sea-memory/snapshot-rejection-atomicity` | [Snapshot publication validates closure, parent, committed position, identity, and non-regression before commit.](../../../../crates/sea-memory/README.md#L9) | Validate before IDs/history/operation index; `rejected_snapshot_does_not_bind_operation_identity`, plus directly instantiated conflict laws. | already adequate |
| `sea-memory/load-capture` | [“Readers are finite at their captured head; `load` atomically pairs snapshot selection with that head.”](../../../../crates/sea-memory/README.md#L10) | Capture selection/head/tail under one guard; directly instantiated `assert_captured_load` is the narrowest deterministic boundary test. | already adequate |
| `sea-memory/append-tree-atomicity` | [`SeaStorage::append` atomically validates the optional tree and commits event/reference.](../../../../crates/sea-core/src/lib.rs#L103) | Recursive closure before position assignment; local `append_accepts_nested_blob_tree` and directly instantiated `reject_missing_event_tree`. | already adequate |
| `sea-memory/reader-cancellation` | [Each event stream owns its cursor; dropping it cancels only that subscription.](../../../../crates/sea-core/src/lib.rs#L165) | Return independent owned finite vectors; directly instantiated `storage_readers_are_independent_and_cancellable`. | already adequate |
| `sea-file-durable/append-crash-recovery` | [Checksummed framing, sync-before-acknowledgement, incomplete-tail recovery, and synced-unacknowledged append recovery.](../../../../crates/sea-file-durable/README.md#L3) | Truncate incomplete frame, retain synced complete frame; `crash_recovery_distinguishes_incomplete_and_synced_appends`. | already adequate |
| `sea-file-durable/snapshot-ambiguity-resolution` | [Tests promise operation-based resolution of synced-but-unacknowledged snapshot publications.](../../../../crates/sea-file-durable/README.md#L13) | Replay snapshot operation identity after sync ambiguity; `reopen_resolves_snapshot_after_post_sync_ambiguity`. | already adequate |
| `sea-compression/frame-transform-and-malformed-input` | [One independent zlib frame; malformed, truncated, and extended frames are corrupt.](../../../../crates/sea-compression/README.md#L8) | Complete-frame decode and public-path classification; `rejects_truncated_and_extended_frames` and `classifies_malformed_stored_payloads_as_corrupt`. | already adequate |
| `sea-compression/wrapper-transparency-and-errors` | [The wrapped session owns positions, identities, snapshots, recovery, cancellation, and backpressure.](../../../../crates/sea-compression/README.md#L3) | Transform payloads only and preserve store classifications; `session_decorator_round_trips_events_and_blobs` plus local `passes_session_conformance`. | already adequate |
| `sea-compression/reopen-and-stream-lifecycle` | [Reads decode only when polled; dropping stops wrapper work; no task or extra buffer.](../../../../crates/sea-compression/README.md#L9) | Synchronous mapper adds no lifecycle state; core mapper test diagnoses progress, local decorated conformance diagnoses forwarding. Structural rationale expires if state is added. | already adequate |
| `sea-encryption/operation-replay-nonce` | [An exact committed retry reuses its receipt “without requesting another nonce.”](../../../../crates/sea-encryption/README.md#L28) | Resolve/compare before encryption; `operation_retries_do_not_request_another_nonce`. | already adequate |
| `sea-encryption/envelope-validation` | [Malformed, truncated, tampered, wrongly keyed, or context-swapped envelopes are corrupt; missing keys are unavailable.](../../../../crates/sea-encryption/README.md#L14) | Fixed header, context, key lookup, authentication, truncation; four direct helper tests beginning with `every_truncated_envelope_is_corrupt`. | already adequate |
| `sea-encryption/error-classification` | [Underlying classifications pass through; corrupt, unavailable, and rejected local categories are explicit.](../../../../crates/sea-encryption/README.md#L14) | `EncryptionError::kind` local arms and `Store` delegation; focused failure tests plus local decorated post-close conformance. | already adequate |
| `sea-stateful-compression/malformed-event-replay` | [Every stored payload is independent; malformed frames are corrupt.](../../../../crates/sea-stateful-compression/README.md#L3) | Independently decode each read/load item and permit fresh replay; `corrupt_events_do_not_prevent_fresh_replay`. | already adequate |
| `sea-stateful-compression/pass-through-state-and-errors` | [Wrapped session owns positions, lineage, recovery, cancellation, and backpressure; reads add no task/buffer.](../../../../crates/sea-stateful-compression/README.md#L10) | Payload-only transform and store-error delegation; local `passes_session_conformance`, with the core mapper test owning failed-transform progress. | already adequate |
| `sea-webtransport/injected-optional-disconnect` | [`call_optional_method` calls an optional JS method while preserving lookup/invocation failures.](../../../../crates/sea-webtransport/src/wasm/mod.rs#L93) | Missing member succeeds; present throwing member propagates. Generated Node `generated injected clients allow an omitted disconnect hook` is the narrowest practical JS boundary. | already adequate |
| `sea-webtransport/shared-correlation-lifecycle` | [Disconnect/reconnect are explicit and operations are never automatically retried.](../../../../crates/sea-webtransport/README.md#L43) | Drop removes correlation; disconnect abandons/blocks until reconnect; `correlations_are_scoped_completed_and_abandoned` and `disconnect_abandons_requests_and_requires_explicit_recovery`. | already adequate |
| `sea-webtransport-server/snapshot-stream-cleanup` | [Snapshot-stream loss immediately removes its publisher while leaving the connection available.](../../../../crates/sea-webtransport-server/README.md#L23) | Cleanup funnel revokes per-stream publisher; `malformed_snapshot_stream_releases_publisher` keeps the parent connection alive. | already adequate |
| `sea-webtransport-server/immediate-shutdown-cleanup` | [The server owns graceful shutdown and connection lifecycle policy.](../../../../crates/sea-webtransport-server/README.md#L3) | Deadline cancellation removes owned connections and cleans services without reconnect grace; `immediate_shutdown_releases_session_without_reconnect_grace`. | already adequate |
| `sea-counter/executable-contract` | [The example advertises exact output `recovered counter: 4`.](../../../../examples/sea-counter/README.md#L15) | `run_demo` returns four and `main` asserts/prints it; `runs_snapshot_and_replay_demo` is local, while `cargo run -p sea-counter` proves the distinct executable boundary. | already adequate |

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Confirmed contract/locality gap | Benchmark runner comments promised only to run work; inherited evidence was multi-backend smoke. | Direct comments, result consumers, and absence of a focused concurrent runner test. | One material cluster. | Added exact success text and one local test for both runner branches. | Audit `Result` success semantics, not only failure branches. |
| Evidence extraction failure | Two delegated read-only attempts returned vague claims and then placeholder rows. | Neither named the 33 boundaries or source paths. | No disposition could rely on them. | Rejected their output and used guarded direct source reads and `rg`. | Require enumerated source evidence before accepting delegated audit summaries. |

## Contract and Integration Friction

Generated Node is the narrowest practical boundary for optional JavaScript members. Directly instantiated conformance is the narrowest practical reusable evidence for backend-independent storage laws; duplicating those assertions in each backend would reduce diagnostic consistency without testing a different owner. No shared API limitation or cross-workstream dependency blocked the repair.

## Human Interventions

The coordinator supplied the authoritative worktree, branch, clean kickoff, scope, validation requirements, and prohibition on external evaluator or hidden expected findings. No mid-workstream semantic decision was required.

## Measurements

- Scope: 33 inherited adequate rows; 32 retained and one repaired.
- Repair size: one crate, two internal contract comments, one focused async test, and this report.
- Production behavior, dependencies, manifests, lockfiles, formats, generated artifacts, and retained machine-readable outputs changed: zero.
- Environment: Debian Linux development container and repository-pinned Rust toolchain. Exact elapsed time, CPU, memory, token use, and tool version are unknown or not applicable.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

No skill change is proposed. Existing exact-contract and practical-locality rules exposed the benchmark gap. The failed delegated extraction reinforces existing evidence-provenance guidance rather than requiring a new procedure.

## Remaining Work and Risks

No owned implementation work remains. Integration should inspect the report-bearing commit, reconcile these 33 rows into the iteration inventory, and run `./test.sh`, repository policy, and `pnpm build:fast` because a Rust source consumed by registered build tasks changed. The six inherited deferrals and the injected-disconnect failure-state deferral remain outside scope with unchanged triggers. Confidence is high in the repaired benchmark cluster and direct mappings; no temporary artifact or process is intentionally retained.
