# Iteration 0020: consumers Report

Status: audit complete; frozen source ready for coordinator integration
Branch: `rust-service-iteration-0020-consumers`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0020-consumers`
Base commit: kickoff `b06b46be6b88723ea64f4ef1a77a5895781c21bc`; incremental comparison `8bd1e64ebfa`.
Final commit: None; coordinator accepts and commits the frozen patch.
Agent or owner: consumers workstream, Copilot.
Model and tool version: model unknown; Rust `1.98.1 (48a229cea 2026-09-01)`.
Instruction source: [consumers instructions](instructions/consumers.md) at kickoff.
Session or transcript reference: coordinator session `181f92e1-5a08-499a-a256-9487a2adb7ff`.
Started and finished: started 2026-09-29T19:02:47Z; source validation completed in the run recorded below; exact finish time unknown.

## Outcome

Scope is all incremental consequential boundaries in sea-wasm, sea-benchmarks, sea-integration-tests, and sea-counter since `8bd1e64ebfa`, plus applicable inherited revisit triggers.
No fixed review or localized-repair cutoff; no benchmark campaign, shared semantic changes, or nested delegation.
Inspected all four members' changed consequential boundaries and directly affected dependencies.
Three localized evidence gaps were repaired: the actual streamed writer, the actual acknowledgment-paced writer, and the new local factory's replay verifier.
No service defect, shared semantic choice, or user-facing API change was established.
The measurement definitions remain unchanged.
Native checks pass; generated/platform and integrated acceptance remain coordinator responsibilities, not results inferred from native compilation.

## Hypothesis Results

Initial hypothesis: changed binding ownership, typed composition, benchmark accounting, and executable consumers may lack precise contracts or discriminating owner-local evidence.
Review prioritizes new measurement modes and lifecycle ownership before mechanical typed composition and the example.

Confirmed localized evidence gap: `streamed::tests::write_capacity_not_receipts_controls_production` exercises only `transport_write`, not the actual `write` loop.
Adding acknowledgment pacing to `write`, removing its record limit, or changing complete-frame accounting would leave that test passing.
The README promises transport-capacity pacing, a bounded timing history, and complete-frame accounting separately from commitment.
The repair exercises the real writer with bounded in-memory transport capacity and no acknowledgments, preserving the production protocol encoder and tracking.
No service guarantee or measurement definition changes.

Continued inspection found the analogous closed-loop ownership gap: statistics tests did not execute the writer's acknowledgment wait, first-error stop, deadline, reader-error stop, or admission cap.
Extracted that existing loop into `closed_loop_writer` without changing its decisions; deterministic completion channels now distinguish one outstanding operation from premature admission and retry.
The new local factory verifier had only successful replay evidence.
Added direct wrong-identity, payload, membership-kind, and additional-history cases; each supplies valid storage records so benchmark-owned validation, not a backend rejection, rejects the mismatch.
The additional-history case does not independently isolate the position comparison from the count comparison; no such claim is made.
The hypothesis was rejected for the affected adapter contracts, composition wiring, existing measurement-window arithmetic, and counter behavior after inspecting their precise assertions.

## Deliverables and Commits

No commits, merges, pushes, dependency changes, generated outputs, or cross-owner edits.
Freeze these tracked changes against kickoff `b06b46be6b88723ea64f4ef1a77a5895781c21bc`:

- `crates/sea-benchmarks/src/bin/presentation-native.rs`: extract the existing closed-loop admission/acknowledgment loop behind a borrowed submit callback; test acknowledgment waiting, failed-prefix stop, reader-error stop, record cap, and deadline.
- `crates/sea-benchmarks/src/bin/presentation-native/streamed.rs`: use the existing send stream's `AsyncWrite` implementation through a generic writer seam; replace helper-only pacing evidence with actual writer evidence; test partial-write failure, deadline, and descending/duplicate receipts without counter mutation.
- `crates/sea-benchmarks/src/bin/session-factory.rs`: negative replay-verifier evidence with real local records.
- This report.

The generic streamed seam uses Tokio's `AsyncWriteExt::write_all` rather than the concrete stream's inherent convenience method.
It retains complete-write/error propagation and cancellation ownership, but does not promise byte-identical third-party error diagnostics.
It adds no dynamic dispatch, boxed future, or per-operation allocation.
The closed-loop callback borrows the existing session; it does not clone an `Arc` for each operation.
Coordinator must retain the final binary diff and calculate its frozen-patch identity before acceptance; no patch checksum is fabricated here.
No changeset is needed for these private benchmark test seams and regression tests: user-facing behavior and APIs are unchanged.

## Validation Evidence

Before substantive edits, the assigned `sea-0020-consumers-probe` task passed.
Guarded output recorded the exact worktree, expected branch and kickoff HEAD, clean initial status, Rust version, incremental diff command, and unchanged Cargo/pnpm lockfiles.
Evidence directory: `/home/node/.copilot/session-state/181f92e1-5a08-499a-a256-9487a2adb7ff/files/2026-09-29T19-02-59.509Z-consumers-probe-c489adc5-4813-4413-9074-bb4eed7daf4d`.
`output.log` and `incremental.patch` are retained outside the worktree.
All checks use the same guarded runner with four Cargo build jobs and the worktree-local target.
Each invocation verifies the expected branch and kickoff, logs initial status and exact commands, and checks Cargo/pnpm lockfiles at success.
No shared foreground terminal was used.

Exact check commands, from the guarded worktree's `rust-service/`:

```text
cargo fmt -p sea-wasm -p sea-benchmarks -p sea-integration-tests -p sea-counter -- --check
cargo clippy -p sea-wasm -p sea-benchmarks -p sea-integration-tests -p sea-counter --all-targets --all-features -- -D warnings
cargo test -p sea-wasm -p sea-benchmarks -p sea-integration-tests -p sea-counter --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-wasm -p sea-benchmarks -p sea-integration-tests -p sea-counter --all-features --no-deps
git diff --exit-code -- Cargo.lock ../pnpm-lock.yaml
```

Formatter task uses `cargo fmt` with those four `-p` selectors.
Observed changed paths stayed within the three benchmark source files and this report.
Evidence directories are beneath `/home/node/.copilot/session-state/181f92e1-5a08-499a-a256-9487a2adb7ff/files/`; every row retains `output.log`.

| Run | Exact observed outcome |
| --- | --- |
| `2026-09-29T19-05-58.691Z-consumers-check-767a175e-0299-456a-ac75-e6380181dda2` | First writer-seam batch: all commands exit 0. |
| `2026-09-29T19-08-43.584Z-consumers-check-0027b0c8-3c47-4faa-9a2a-b51ac65d4d7d` | Clippy exit 101 on new exact floating-zero comparison; changed test to compare bits. Not product evidence. |
| `2026-09-29T19-09-19.402Z-consumers-check-548ed5e0-5623-45c0-9e19-167bd2dab213` | Tests exit 101: attempted empty-history fixture was rejected by storage's upper-bound validation before the benchmark verifier. Removed that unsuitable case rather than claiming it covered the benchmark's incomplete-history decision. |
| `2026-09-29T19-09-49.055Z-consumers-check-6a6657b7-6b8e-4bad-9ac9-78f6cee5cdfe` | Corrected batch: all commands exit 0; 59 tests pass. |
| `2026-09-29T19-11-42.854Z-consumers-check-c5476a6c-2a4b-4aec-b15a-290fd92d2fa3` | Strengthened partial-write-failure case: all commands exit 0; 59 tests pass. |
| `2026-09-29T19-13-34.795Z-consumers-check-b7ffe4a6-7927-4aef-9379-10025ba3e917` | Clippy compilation exit 101: lending async callback did not satisfy `tokio::spawn`'s Send inference. Replaced it with an ordinary callback returning a concrete future over a stable borrowed session, without an allocation workaround. |
| `2026-09-29T19-14-01.342Z-consumers-check-f419d63a-8a9d-4498-9d2f-a7fff276e6f3` | Complete repaired source: all commands exit 0; 61 tests pass. Final test-name-only clarification is followed by the final validation entry below. |
| `2026-09-29T19-18-02.928Z-consumers-check-f426fbb6-11fb-4ada-9d85-5677dc910e86` | Final frozen source: formatting, strict all-target/all-feature Clippy, all 61 tests, strict rustdoc, and lockfile checks exit 0. Guarded status lists only the three owned source files and this report. |
| `2026-09-29T19-20-23.896Z-consumers-check-f5472cd6-b48a-40c7-89a1-16306de432a6` | Authoritative final rerun after coordinator configured worktree-local `TMPDIR`: all check commands exit 0, all 61 tests pass, including the 13 composition tests. Same frozen source and unchanged lockfiles. |

The coordinator updated the external runner at 19:20 to create `rust-service/target/quality-fixtures` and set that absolute path as command-local `TMPDIR` for every subprocess.
The worker read the updated runner and reran the complete assigned check immediately.
Earlier successful logs remain historical results; their effective inherited temporary-directory location was not verified.
The final 19:20 run supersedes that execution-environment uncertainty without rewriting earlier evidence.

The final suite consists of benchmark library 6, no-reader 2, native worker 14, source spans 1, general benchmark 12, factory benchmark 2, storage pipeline 2, counter 6, composition 13, and native binding adapter 3.
The two supported doc-test targets contain zero tests; rustdoc passes, but zero doctests are not runtime evidence.
Logs and the baseline patch are nonempty and their command/status records were read directly.
There is no retained benchmark JSON dataset to parse or qualify.
No deliberate liveness mutation was run.
The writer tests discriminate failed admission/cap decisions by explicit single polls, not sleeps or elapsed-time thresholds.

## Behavioral Contracts and Test Layers

### Coverage Map

The probe identifies 17 changed files in the assigned area.
This is an incremental audit, not a declaration inventory or an unchanged-code full reassessment.
All changed consequential boundaries were reviewed; unchanged dependencies were read only where needed to distinguish responsibility.

| Member | Inspected incremental scope and disposition |
| --- | --- |
| `sea-benchmarks` | All seven changed source files, Cargo feature change, and README: new streamed and closed-loop modes; acknowledgment/read-window arithmetic; shedding and drain; timing caps, partial writes, task cleanup and summaries; local session-factory churn and verification; no-reader factory composition; general workload helper inlining, timing names, and snapshot/replay verification; storage-pipeline timing wording; clock wording. Three localized evidence gaps repaired. Unchanged fixture/schema/source-span mechanics retain 0018 evidence and were not re-audited as new behavior. |
| `sea-wasm` | README and all changed binding/session/signal documentation, plus renamed memory runtime map: capability erasure, classification, input conversion, load bounds and ordering, cancellation borrows, signal ownership, independent namespace lookup, feature/decorator placement. Matched new text against implementation and inherited raw-generated/package assertions. No runtime changes required. |
| `sea-integration-tests` | Entire incremental composition patch: typed network factory scenario, production typed host setup, authority binding, rebuilt stack helper reuse, fresh-author names, and rejection/terminal-prefix documentation. Checked helper assertions and matrix callers. Existing 12 stack configurations plus new factory test pass; no additional composition rewrite justified. |
| `sea-counter` | Complete small executable and README: value versus event-position clarification, storage/session construction, signed fixed-width decoding, snapshot replacement, replay suffix/live-boundary termination and output assertion. Comment-only incremental change accurately describes existing behavior; all six focused tests pass. |

### Reviewed Boundary Dispositions

All relative crate links below identify current contract and implementation owners.
`native` means the complete affected-package task, not a conformance-only invocation.
Generated tests cited below were inspected, not executed by this workstream.

| Boundary | Precise contract and owning decision | Discriminating evidence, layer, and disposition |
| --- | --- | --- |
| `consumers-closed-loop-admission` | [Closed-loop guide](../../../../crates/sea-benchmarks/README.md#closed-loop-throughput): “Each writer submits immediately after its previous acknowledgment, with one outstanding operation per document”; reaching the timing cap fails instead of throttling; writes are never retried. `closed_loop_writer` owns admission before await, acknowledgment after success, and stopping. | **Repaired.** `closed_loop_waits_for_each_acknowledgment_and_stops_after_failure` holds the first and second completions separately, checks exactly one admission per acknowledgment, then verifies the failed second operation has no acknowledgment/retry/suffix. `closed_loop_honors_record_cap_deadline_and_reader_failure` checks no third call beyond cap, no expired-window call, and no call after a reader error. Native owner-local tests; service sequencing cannot satisfy these callback/count assertions on the writer's behalf. |
| `consumers-streamed-production` | [Streamed guide](../../../../crates/sea-benchmarks/README.md#streamed-throughput): “waits only for transport write capacity”; `transportWritten` counts complete request frames; pending telemetry excludes unfinished/failed calls; begun frames finish before successful drain. | **Repaired.** `writer_pipelines_until_transport_capacity_and_enforces_record_limit` invokes actual `write`, fills exactly one frame of capacity, sees a second begun frame with zero acknowledgments, drains capacity and verifies exact second bytes, cap failure, written count, outstanding peak, and one completed pending call. Removing the cap returns Pending instead of the asserted Ready error; acknowledgment pacing prevents the asserted second admission. `writer_deadline_and_transport_failure_do_not_report_complete_frames` checks an expired window and a one-byte partial frame followed by receiver failure: no complete-write or pending-success telemetry, and only the expired case is done. Native owner-local; QUIC flow control itself remains platform/transport evidence, not proven by duplex. |
| `consumers-streamed-receipts` | [Streamed guide](../../../../crates/sea-benchmarks/README.md#streamed-throughput): “Transport write completion is not application commitment”; missing acknowledgments and out-of-order data fail. `Tracking::receipt` owns count and strictly increasing receipt checks separately from send completion. | **Repaired focused evidence.** `receipt_count_and_order_are_checked_independently_of_send_completion` rejects unsolicited, duplicate, descending, and excess receipts; descending/equal rejections now assert unchanged acknowledgment count, last receipt, and timestamps before the next valid receipt. The test deliberately has no completed writes, preserving separation from transport completion. |
| `consumers-completion-windows` | [Closed-loop guide](../../../../crates/sea-benchmarks/README.md#closed-loop-throughput): acknowledgments and each validated reader receipt count in the same half-open completion window, including warmup submissions; legacy observer counter remains submission-window-based. `State::acknowledge/observe` own window tests and recipient distinction. | **Already adequate.** `acknowledgments_use_completion_window_not_submission_window` checks start, inclusive lower bound, just-before upper bound, and excluded upper bound. `observation_separates_writer_warmup_window_and_drain` checks both recipients, warmup-received-in-window, observer-only epoch/latency arrays, and exact drain exclusion. `observation_rejects_wrong_order_corruption_and_unsubmitted_deliveries` ensures rejection does not advance counts. Native local tests, not just parent summary tests. |
| `consumers-shedding-and-drain` | [Closed-loop guide](../../../../crates/sea-benchmarks/README.md#closed-loop-throughput): “Only an explicit subscription-revoked response counts as reader shedding”; active readers and acknowledgments must drain exactly. `subscription_was_shed`, `State::drained`, and final result assembly distinguish shedding, errors, and missing data. | **Already adequate for the local classification/drain decision.** `shedding_does_not_hide_other_errors_or_missing_acknowledgments` distinguishes exact Rejected diagnostics from Closed/other messages/Ambiguous; a missing active reader prevents drain, explicit shedding permits that reader only, and missing acknowledgment still prevents drain. Streamed `drain_override_remains_bounded_and_preserves_default` checks 30-second default and 1–120 range endpoints. Parent [benchmark gates](../../../../scripts/benchmark-gates.mjs) separately reject incomplete results; its tests are coordinator checks, not native writer evidence. |
| `consumers-streamed-protocol-and-cleanup` | [Streamed guide](../../../../crates/sea-benchmarks/README.md#streamed-throughput): production pinned defaults, independent receipt/read tasks, frame completion before done, task-error preservation, bounded drain and external wall-clock guard. `open`, `Responses`, task join/drain and aggregation wire shared codecs and telemetry. | **Reviewed, no new semantic promise.** The new real-writer tests protect the responsible transmission decisions; receipt/observation tests protect local counters. Codec validity, certificate pinning and QUIC transport belong to `sea-webtransport`/wtransport; source inspection verifies shared encoder/decoder and default limits are reused, not a competing codec. Task results propagate through `completed_tasks` and cancellation drains remaining errors. No native helper test is claimed to prove a running server, sustainable memory, end-to-end TLS, or transport statistics accuracy. Coordinator integrated gates remain required; no timed campaign was run. |
| `consumers-factory-churn-verification` | [Factory guide](../../../../crates/sea-benchmarks/README.md#local-session-factory-churn): 32 cached runtimes, concrete dispatch, separate verification opens, exact one-event replay, no allocator counts or physical-durability claim. `select/measure/verify_factory/verify_replay` own controls and acceptance. | **Repaired.** `both_modes_verify_exact_churn_counts_errors_and_sibling_closure` runs direct and pass-through with two opens per document and verifies exact per-document totals, check counts, shutdown and cache-array cardinality. New `finite_replay_rejects_wrong_identity_payload_kind_and_additional_history` isolates identity, payload and application-kind rejection using otherwise valid records; the additional-history case exercises combined position/count rejection, not each guard independently. Source review verifies measurement excludes verification and shutdown, includes its documented bookkeeping, and reports `allocation_count: null`. |
| `consumers-no-reader-factory-composition` | [No-reader guide](../../../../crates/sea-benchmarks/README.md#aligned-checkpoint-measurements) and factory paragraphs: same 32-document generic workload, no subscriptions during writes, explicit factory modes require cache build, exact replay after timing. `exercise` retains each `OpenedSession.id` alongside its session instead of assuming concrete `session_id`. | **Already adequate for changed identity/replay composition.** `replay_checks_identity_receipts_payloads_and_complete_history` directly discriminates wrong identity, receipt sequence/count, and repeated payload. Factory direct/pass-through construction is also compiled and exercised by the churn test. The full 13-second external sampler/handshake is not a unit-test guarantee and was not rerun as a performance campaign. Selector/default/control flow was inspected; no duplicate transport/storage behavior test added. |
| `consumers-general-benchmark-accounting` | [Result schema/backends](../../../../crates/sea-benchmarks/README.md#result-schema): commit throughput includes periodic snapshots; general harness flush is outside timer; storage reads bounded, session reads collect configured acknowledged count; snapshot position is final replayed position, not record count. `run_session/run_storage` helper inlining retains exact payload multiset checks. | **Already adequate.** `concurrent_writers_complete_before_measurement_returns` checks latency and record counts for both storage and sessions. `payload_verification_rejects_duplicate_wrong_payloads`, reopened stale/corrupt snapshot tests, `snapshot_verification_uses_receipt_positions_not_record_counts`, and `file_backend_recovers_without_snapshots` protect the affected validation. No test asserts a hardware elapsed time or mistakes a count-limited session read for a full-tail absence proof. The rename from append to commit measurements changes no emitted schema. |
| `consumers-pipeline-clock-contracts` | [Pipeline guide](../../../../crates/sea-benchmarks/README.md#local-storage-pipeline): throughput includes final flush; [clock](../../../../crates/sea-benchmarks/src/measurement.rs) converts epoch microseconds without float conversion. Only wording changed. | **Already adequate; no new behavior.** `bounded_single_session_replays_in_order` exercises the pipeline; `timestamps_preserve_the_anchored_elapsed_microseconds` pins exact anchor arithmetic and `monotonic_clock_and_output_shape` checks integer output. Source inspection verifies final flush precedes throughput elapsed sampling. Historical measurements are not requalified by these tests; unchanged recursive-size regression remains passing. |
| `wasm-availability-erasure` | [Adapter guide](../../../../crates/sea-wasm/README.md#session-adapter-and-bindings): “Handles from incompatible implementations are rejected rather than converted into availability claims”; original classification and handles are preserved. Incremental changes clarify the existing contract. | **Already adequate.** Native `shared_adapter_rejects_incompatible_snapshot_capabilities` independently changes root/event evidence types, checks Rejected and unchanged snapshot, then succeeds with original handles; `shared_adapter_preserves_error_classification` checks the adapter's category; `shared_adapter_supports_memory_and_compression` proves exact payload and snapshot forwarding through both stacks. No conformance-only locality claim. |
| `wasm-generated-values-and-ownership` | [Bindings](../../../../crates/sea-wasm/src/bindings.rs) now explicitly document malformed directories, exclusive/inclusive read bounds, snapshot-first loads, concurrent-read rejection, cancellation settlement, signal-first close and signal-close failure order; [signal ownership](../../../../crates/sea-wasm/README.md#signals-and-ownership) requires pending borrows to settle before free. | **Already adequate for affected existing decisions; generated execution is a distinct gate.** Inspected raw [wasmBindings tests](../../../../tests/sea-integration-tests/src/test/wasmBindings.spec.ts): malformed raw directory inputs, concurrent raw reads/cancelled pending borrow, and session-owned signal close without peer close bypass wrapper guards. Existing package snapshot replacement/cancellation and signal message tests supply generated conversion/registration evidence. The memory-map rename preserves existing document lookup/open behavior checked by package independent-document/session tests. No fresh generated run is claimed here; native `sea-wasm` tests do not compile `bindings.rs` or `signals.rs`. |
| `consumers-typed-network-factory` | [Network factory contract](../../../../crates/sea-webtransport/src/factory.rs): opens one existing document on a fresh connection; dropping factory does not close returned sessions. [Pass-through contract](../../../../crates/sea-core/src/factory.rs): all facets forward without changing handles/streams/classified errors or adding cleanup ownership. | **Already adequate integration evidence.** `network_factory_opens_independent_sessions_and_forwards_facets` checks missing document and invalid reference rejection, independent IDs/document identity, use after factory drop, shared snapshot/history, foreign-client handle rejection, ordered joins/departures, and continued sibling submission. Exact `PassThroughSession<NativeSeaClient>` signatures also prove concrete handle composition. This test is intentionally cross-crate/real loopback; core forwarding and transport ownership still require their owning-crate tests from other workstreams. |
| `consumers-composition-rebuild` | [Matrix guide](../../../../crates/sea-integration-tests/README.md#session-composition-matrix): rejected hop terminates submission stream without commitment/deeper traffic; rebuilt stack restores submission. Reconnect is fresh memberships/connections over retained memory, not durable recovery. | **Already adequate.** All 12 configurations invoke `verify_transport_path` and expected-hop checks; transport configurations probe each hop, test terminal rejection, rebuild through the same `build` helper, and verify empty history then restored submission. `repeated_stress` retains three-hop reconnect/collaboration. Renames and shared construction preserve identity generation and assertions. Real-hop evidence cannot be replaced by a local decorator unit test. |
| `consumers-counter-recovery` | [Counter guide](../../../../examples/sea-counter/README.md): snapshots the value 5 at a committed event, then recovers snapshot plus tail; fixed eight-byte payloads; no persistence/network claim. `recover` replaces initial value from the snapshot and stops at AwaitingNewItems. | **Already adequate.** `later_snapshot_replaces_prior_event_state_before_tail_replay` uses snapshot 20 after delta 2 to discriminate replacement rather than accidentally recomputing history. `replays_without_a_snapshot_and_stops_at_the_live_boundary`, `recovers_from_committed_initial_state`, malformed delta/snapshot tests, and `runs_snapshot_and_replay_demo` protect exact executable behavior. Only contract wording changed since baseline; no new output/persistence promise. |

Unchanged source-span parsing, deterministic fixture schema, percentile conventions, browser hosting, allocation instrumentation, durable power-cut qualification, and sustained performance campaigns are excluded from new repair work unless their existing revisit triggers fire.
The changed benchmark telemetry explicitly does not claim allocator counts, synchronized global peak memory, server-global maximum throughput, or physical durability.
No inherited production limitation is closed by this audit.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Evidence gap | Helper-only writer test passed without exercising production admission. | Old `write_capacity_not_receipts_controls_production` invoked only `transport_write`. | Could miss accidental acknowledgment pacing or cap removal. | Replaced with actual writer/capacity test; analogous closed-loop driver covered. | Name the owning decision, not the helper's topic. |
| Fixture correction | Empty finite-read fixture attempted an uncommitted bound. | 19:09:19 run returned storage `read bound is beyond the committed head`. | Did not reach intended benchmark count check. | Removed case and retained valid-record discriminators; no false owner-local claim. | Check whether an earlier layer can satisfy a rejection assertion. |
| Toolchain correction | Lending async closure in a spawned task. | 19:13:34 Send-inference compilation error. | Test seam would not compile in production caller. | Ordinary concrete-future callback; no boxing workaround. | Validate the real call site, not only isolated callback tests. |
| Coordination | Assigned process tasks were directly available and guarded logs persisted. | Probe and all formatter/check outputs. | No terminal serialization or nested execution agent required. | Used only assigned tasks. | Native task completion still does not prove generated/platform execution. |
| Coordination | Siblings flagged inherited temporary-directory uncertainty. | Runner originally inherited environment; coordinator's 19:20 update explicitly sets worktree-local `TMPDIR`. | Prior test fixture locations were unverified. | Complete 19:20:23 check rerun passes with corrected runner. | Make fixture-directory ownership explicit before validation. |

## Contract and Integration Friction

No shared contract change or cross-owner repair requested.
Generated WASM, JavaScript loader borrowing, and browser transport are centrally owned validation surfaces.
Native adapter tests and the new duplex writer fixture do not replace those gates.
The parent benchmark result gate owns accepting a worker result, including drain totals; Rust worker metrics alone are not accepted throughput evidence.

## Human Interventions

The existing explicit authorization set full incremental coverage, localized repairs, parallel ownership, and no benchmark campaigns.
The coordinator supplied the worktree-local `TMPDIR` runner correction and clarified that ending a turn delivers requests/results through idle notifications.

## Measurements

Performance, allocation, binary-size, and throughput measurements: not applicable; no campaign run.
Dependencies and lockfiles: unchanged.
Toolchain: pinned Rust 1.98.1; native Linux process tasks with four Cargo jobs.
Model, token use, and total elapsed effort: unknown.
Test counts are validation observations, not coverage percentages.

## Proposed Decisions

None.
All changes are local benchmark regression evidence and test seams preserving existing contracts.

## Candidate Skills and Process Changes

No new skill proposed.
The existing quality skill already requires checking the actual owning decision and distinguishing wrapper/consumer evidence.
This run supports that existing rule through the helper-only writer and invalid-bound fixture findings.

## Remaining Work and Risks

No selected member or incremental consequential boundary remains unreviewed.
No confirmed localized product repair remains outstanding.
Source edits are frozen for coordinator snapshot, fresh independent review, and integrated acceptance.

Coordinator follow-up:

1. Retain and hash the exact four-file patch against kickoff, reconcile these rows into the inventory, and map acceptance to the checkpoint commit.
2. Run documentation and policy checks, integrated workspace gates, and fresh generated/platform checks required by the combined iteration diff.
3. Run `node --test scripts/benchmark-gates.test.mjs` in the integrated `rust-service/` checkout to retain the distinct worker-output consumer gate; the worker JSON schema is unchanged.
4. If checking the streamed transport executable end to end, treat a bounded correctness smoke as protocol/transport evidence only, not a performance campaign or capacity measurement.

Revisit these rows when pacing, record limits, acknowledgment/read windows, error classification, result schemas, factory identity handling, binding lifetimes, or composition construction changes.
Unattributed native/browser timeouts, CI restoration limits, power-loss qualification, retention and authentication remain owned by their existing known-issue records.
No servers, symlinks, shared settings, or intentionally untracked source files were created.
Worktree-local Cargo outputs and external task logs remain for coordinator disposition.
