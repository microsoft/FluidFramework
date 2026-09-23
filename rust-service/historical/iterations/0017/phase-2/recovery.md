# Iteration 0017: recovery Report

Status: bounded audit and scoped validation complete after formatting repair; canonical integration gates pending.
Branch: `rust-service-iteration-0017-recovery` (recorded by both coordinator checkout guards).
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0017-recovery` (recorded checkout; command cwd is its `rust-service/` directory).
Base commit: `cc2abb85cefb3a29e9b7d75e62986dff83e75680` (assigned kickoff and recorded HEAD in both check runs).
Final commit: none; coordinator owns staging and commits, including hooks.
Agent or owner: GitHub Copilot, recovery workstream.
Model and tool version: unknown; file tools, apply_patch, and editor diagnostics only.
Instruction source: [recovery instructions](instructions/recovery.md), assigned at the kickoff above; their committed provenance was not independently verified.
Session or transcript reference: none.
Started and finished: audit effort timestamps unknown; coordinator checks span `1789847965171` to `1789848087734` Unix milliseconds on 2026-09-19, with individual run times below.

The manifest records iteration source `41e9420cbba665bb4d9ad32f812eb1816a3fdea9`, not the kickoff.
Ancestry, toolchain version, and post-run Git status are not established by the supplied artifacts; actual branch, HEAD, and start status are recorded below.
The initial delegate task probe lacked `tool_search`; the coordinator launched compound task `rs17-parallel-checks` and then reran recovery after the formatting repair.
No delegate task execution or autonomous scheduling is claimed.
This documentation finalization only reads reports and their own evidence, edits reports, and requests editor diagnostics.
Pre-edit routing selected the two boundaries below and the exact focused filters in Validation Evidence; this report records that routing in the same edit batch as the test.

## Outcome

Reviewed exactly two incremental recovery boundaries across the shared file engine, durable specialization, and sequencer.
One test-only repair cluster adds local evidence for failed reconciliation blocking an announced session's terminal leave through close and shutdown.
No production implementation, API, contract, manifest, lockfile, shared inventory, or global documentation was changed.
The file boundary needs no edit based on decision-local evidence, now backed by fresh passing tests.
Both runs passed 7 file, 3 durable-file, and 23 sequencer tests and Clippy.
The initial run failed only formatting; the coordinator applied the exact rustfmt chain layout, and the rerun passed all three checks.
This is not exhaustive crate coverage or a production durability claim.

## Hypothesis Results

Initial hypothesis: current contracts may already have discriminating local evidence, but historical acceptance may describe replaced implementations.
The current file engine supports this hypothesis: its private fault controls and component assertions directly distinguish rejection, uncertainty, and reopen policy.
For the selected sequencer boundary, inspection found a limited evidence gap: the failed-reconciliation test uses an unannounced session, while the announced-prefix test does not inject failed reconciliation.
Neither directly checks whether close or shutdown can claim success or write a terminal leave after head/read reconciliation fails.
The added test addresses this conjunction using the existing fault fixture and passed by name in both coordinator runs.
Scoped validation supports the repair; canonical integration acceptance remains pending.
No product defect is claimed from this evidence gap.

The [0016 inventory](../../0016/quality-inventory.md) and [reconciliation](../../../DEFERRAL_RECONCILIATION.md) were used as hypotheses only.
The current durable module is an alias of `FileStorage<true>`; old public crash controls and snapshot operation registries are not the current owner.
Current sequencer settlement is owned by `append_once`, `Runtime::settle_pending`, `Runtime::settle`, and the close/shutdown entry points, not the retired runtime described by older rows.

## Deliverables and Commits

- [Sequencer fault tests](../../../../crates/sea-sequencer/src/fault_tests.rs): added `failed_reconciliation_prevents_terminal_leave_until_recovery`, one test with four cases (head/read failure crossed with close/shutdown).
- This report: two ranked assessments, proposed inventory rows, exact contracts, validation handoff, and remaining limits.
- No commits were made by the delegate; both files remain for coordinator integration and commit.
- The coordinator's exact rustfmt layout repair touched only the new test's observer/head chain; no production change was introduced.

## Validation Evidence

Read both nonempty `result.json` and `output.log` in each of these directories:

- `/workspaces/FluidFramework-rust-service-iteration-0017-recovery/rust-service/target/iteration-0017-evidence/recovery-check-1789847965170-3b0e23aa-962a-4281-8f0e-2c6bb0c398db/`
- `/workspaces/FluidFramework-rust-service-iteration-0017-recovery/rust-service/target/iteration-0017-evidence/recovery-check-1789848085438-b9ce5126-fd8e-4a86-8a8d-d3e6bbb4ce27/`

| Attempt / run ID | Runner PID | Start / finish (Unix ms) | Elapsed | Final exit |
| --- | --- | --- | --- | --- |
| Initial: `1789847965170-3b0e23aa-962a-4281-8f0e-2c6bb0c398db` | 450353 | 1789847965171 / 1789847984987 | 19,816 ms | 1; formatting only |
| Rerun: `1789848085438-b9ce5126-fd8e-4a86-8a8d-d3e6bbb4ce27` | 459631 | 1789848085439 / 1789848087734 | 2,295 ms | 0 |

Each result and its log agree on run identity, checkout, command starts, and final exit.
Per-command PIDs, finishes, and exits below come from the results; named outcomes and the formatting diff come from the logs.

| Attempt | Observed command | PID | Start / finish (Unix ms) | Exit / outcome |
| --- | --- | --- | --- | --- |
| Initial | `cargo test -p sea-file -p sea-file-durable -p sea-sequencer --all-features` | 450471 | 1789847965244 / 1789847979602 | 0; 7 + 3 + 23 passed, 0 failed |
| Initial | `cargo clippy -p sea-file -p sea-file-durable -p sea-sequencer --all-targets --all-features -- -D warnings` | 454247 | 1789847979602 / 1789847984663 | 0 |
| Initial | `cargo fmt --all -- --check` | 454734 | 1789847984663 / 1789847984987 | 1; one chain layout diff |
| Rerun | `cargo test -p sea-file -p sea-file-durable -p sea-sequencer --all-features` | 459664 | 1789848085501 / 1789848086872 | 0; 7 + 3 + 23 passed, 0 failed |
| Rerun | `cargo clippy -p sea-file -p sea-file-durable -p sea-sequencer --all-targets --all-features -- -D warnings` | 459961 | 1789848086872 / 1789848087420 | 0 |
| Rerun | `cargo fmt --all -- --check` | 459997 | 1789848087420 / 1789848087733 | 0 |

Both checkout guards record branch `rust-service-iteration-0017-recovery`, HEAD `cc2abb85cefb3a29e9b7d75e62986dff83e75680`, environment label `recovery`, and command cwd `/workspaces/FluidFramework-rust-service-iteration-0017-recovery/rust-service`.
Both start statuses list only modified `rust-service/crates/sea-sequencer/src/fault_tests.rs` and this report; no manifest or lockfile modification is listed.
The logs use local `target/debug/deps` executables.
No post-run status or explicit toolchain-version/environment dump is included; those checks are not established here.

Both logs name `session::fault_tests::failed_reconciliation_prevents_terminal_leave_until_recovery`, the adjacent settlement tests discussed below, `storage::tests::journal_faults_preserve_prefix_and_block_uncertain_observations`, `journal::tests::exclusive_journal_round_trip_and_tail_policies`, and `storage::tests::recovery_preserves_dependencies_discards_torn_tail_and_rejects_corruption` as `ok`.
Full selected-crate suites supplied this evidence, not the originally requested exact filters; no separate exact-filter run or mutation experiment is claimed.
Each crate reported zero doc-tests in both runs, which does not satisfy warnings-denied rustdoc.

The initial formatting diff at `fault_tests.rs:498` requested a multiline layout for `observer.view().await.unwrap().head().await.unwrap().unwrap()`.
The user supplies attribution for the coordinator's exact layout repair; the rerun directly confirms tests, Clippy, and formatting pass afterward.
The coordinator launched the initial check through `rs17-parallel-checks` after the delegate probe lacked `tool_search`, then reran `process: rs17-recovery-check`; no delegate task execution or autonomous scheduling occurred.

Warnings-denied rustdoc (`RUSTDOCFLAGS='-D warnings' cargo doc -p sea-sequencer --all-features --no-deps`), `node scripts/check-documentation.mjs`, record/policy checks, and workspace canonical integration gates remain integration-owned and pending.
Editor diagnostics for this report-only finalization are separate from executable behavior and link verification.

## Behavioral Contracts and Test Layers

### Ranked Boundaries and Proposed Inventory Rows

These are the only two reviewed boundaries; scoped dispositions are supported by the coordinator runs above, with integration acceptance pending.

| Rank and boundary | Owner and consumers | Risk and exact contract | Decision-local evidence and discriminating check | Proposed disposition | Revisit trigger |
| --- | --- | --- | --- | --- | --- |
| 1: `sea-sequencer/failed-reconciliation-terminal-leave` | `append_once`, `Runtime::settle_pending`/`settle`, `LocalSession::close`, `LocalSequencer::shutdown`; announced authors and independent readers reconciling an accepted prefix | A false terminal leave or successful shutdown can present unresolved work as final. The ordered-append contract says: "Unknown storage outcomes must block progress or require recovery, never produce a leave that falsely claims finality." The settlement contract says: "An unreconcilable runtime must be discarded and recovered; it cannot use `shutdown` to claim successful settlement." | New `failed_reconciliation_prevents_terminal_leave_until_recovery` uses separate fixtures for close and shutdown after `FailHead` and `FailRead`. It requires `RecoveryRequired`, exactly two backend append calls (join plus uncertain application), retained exclusive opening, and then exactly one recovery leave with replay `Joined, Application, Left` and recovered operation identity. | Test-evidence repair validated: named test passed in both 23-test sequencer runs; rerun Clippy/fmt passed. No behavior or contract change; integration acceptance pending. | Changes to reconciliation error propagation, close/shutdown ordering, retained ownership, or recovery departure handling. |
| 2: `sea-file/partial-io-failure-recovery` | `Journal::append`/`ready`/`recover`, `Opening::lock`, `FileEvents`; `SeaView`, sequencer reconciliation, and `DurableStorage` consumers | Stale heads could turn uncertainty into false absence; incorrect tail policy could discard valid history. The file contract says: "An I/O error after writing begins is `Ambiguous` and poisons the opening: later writes, heads, resolutions, and lookups fail until all opening owners are dropped and recovery succeeds." It also says: "Buffered recovery rejects incomplete tails; durable recovery truncates only an incomplete final frame." | `journal_faults_preserve_prefix_and_block_uncertain_observations` crosses `BeforeWrite`, `PartialWrite`, and `AfterSync` with both modes and checks returned classification, blocked head/resolution, and recovered prefix. `exclusive_journal_round_trip_and_tail_policies` checks strict buffered rejection and durable repair. Durable `recovery_preserves_dependencies_discards_torn_tail_and_rejects_corruption` checks exact restored journal bytes, dependent snapshot identity, and rejection of a complete checksum-corrupt frame. | Already adequate for this selected boundary: named local tests passed in both 7 + 3-test suites; no change. Integration acceptance pending. | Journal persistence order, poison guards, frame parser, mode policy, or a concrete I/O incident changes. |

### Contract Sources and Diagnostic Locality

The rank-1 quotations are existing promises in [Ordered Append and Recovery](../../../../crates/sea-sequencer/README.md#ordered-append-and-recovery) and [Retry Lookup and Settlement](../../../../crates/sea-sequencer/README.md#retry-lookup-and-settlement).
The latter also states: "A failed head or incomplete scan yields `RecoveryRequired` and prevents further mutations or claims of absence."
No new guarantee is inferred from the test fixture's behavior.
In [session implementation](../../../../crates/sea-sequencer/src/session.rs), reconciliation failure marks the runtime recovery-required, `settle` must return before draining failed memberships, and both close and shutdown must propagate that failure before departure or view release.
Removing an entry point's error propagation would fail the new error assertion; swallowing a failed settlement and appending a leave would fail the append counter; releasing the view would fail the exclusive-reopen assertion.
Fresh fixtures keep a preceding close attempt from masking a shutdown regression.
Recovery and bounded replay check the positive path so a runtime that simply never closes announcements is not accepted.

Existing `returned_ambiguity_is_scanned_and_rejection_requires_fresh_membership` distinguishes committed/absent/rejected results and rejects implicit resubmission using append-call counts.
`failed_reconciliation_blocks_mutation_and_absence_claims_until_recovery` diagnoses failed head/read reconciliation, blocks lookup and later mutation, and restores the operation after reopening.
`cancelling_before_or_after_commit_retains_the_same_backend_future_until_settlement` diagnoses retained work with deterministic gates and counts, without timing sleeps.
`failed_append_and_cancelled_ack_end_announced_prefix_before_later_work` diagnoses terminal ordering after rejection and caller cancellation, but not failed reconciliation through close/shutdown.
The new test fills that specific missing branch combination rather than duplicating shared session conformance.

Rank-2 contract text comes from [Cancellation and Failures](../../../../crates/sea-file/README.md#cancellation-and-failures), [Persistence Model](../../../../crates/sea-file/README.md#persistence-model), and the [journal module contract](../../../../crates/sea-file/src/journal.rs).
The durable guide states: "Recovery preserves complete checksummed frames, discards an incomplete final frame, and rejects corrupt required history or missing dependencies."
Clearing the poison bit prematurely or bypassing `Opening::lock` in head/resolution fails direct component assertions.
Accepting a buffered incomplete tail or discarding a complete post-write frame fails the mode-specific reopen assertions.
The durable test's exact-byte equality catches truncation to a wrong prefix; its checksum mutation must return corruption rather than a successful shortened archive.
These tests are local to the shared engine and its specialization, not merely broad conformance invocation.
`sea-file-durable` has no independent persistence algorithm to repair or duplicate: its public type aliases `FileStorage<true>`.
The `AfterSync` hook in buffered mode means a complete OS write with lost acknowledgment, not successful synchronization.

Only test code in `sea-sequencer` changed; the existing owning contract is sufficient, so no README or production-source documentation change is needed.
`sea-file` and `sea-file-durable` are unchanged because the inspected tests already discriminate the selected owning decisions.
Shared view/snapshot/session conformance checks substitutability; it does not substitute for the owner-local fault cases.
Integration tests prove composition across storage, session, and transport, while generated/browser checks prove their distinct consumers; none were executed or credited here.

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Human-directed execution constraint | Initial delegate probe lacked `tool_search` | User-supplied scheduling provenance and coordinator artifacts above | No delegate task execution | Coordinator launched compound checks and recovery rerun | Attribute execution to the actual coordinator; no autonomous scheduling or tool fix demonstrated. |
| Evidence gap | Reconciliation and announced-prefix tests cover different fault cases | Existing reconciliation fixture never announces membership; announced-prefix fixture omits `FailHead`/`FailRead` | False finality at close/shutdown lacks a direct local guard | One test-only cluster using existing fixture; named regression passed twice | Test lifecycle error entry points with the prerequisite state that makes their forbidden side effect observable. |
| Formatting failure and repair | Initial tests and Clippy passed; fmt requested one multiline chain | Initial output diff at `fault_tests.rs:498`; exit 1 | Scoped run not fully passing despite passing behavior | Coordinator applied exact rustfmt layout; rerun tests/Clippy/fmt exited 0 | Retain the failed attempt and verify the same cluster after the smallest repair. |
| Search limitation | Scoped text search in sibling worktree returned no results | Direct reads found the named fault tests | Empty workspace search was not treated as absence | Used absolute file reads, no shell workaround | Outside-workspace search results need confirmation with file tools. |

## Contract and Integration Friction

No shared semantic, API, recovery-format, or ownership change is required for this cluster.
The fault fixture is already local and deterministic; no new prerequisite facility or dependency is introduced.
Scoped execution evidence is recorded; final integration gates and inventory reconciliation remain coordinator-owned dependencies.
The test relies on the existing memory-backed fixture for ownership and committed records, while append-call counting and the public sequencer entry points isolate sequencer decisions.
This does not replace file-backend integration or establish filesystem durability.

## Human Interventions

The user set incremental scope, exactly two boundaries, at most one repair cluster, and supplied the kickoff identity.
The user prohibited terminal, shell/Git commit, and child-agent routes after unavailable delegate task discovery, assigning immediate isolated validation to the coordinator.
The coordinator supplied the exact rustfmt layout repair and reran the checks; no behavioral approval or scope expansion was needed.

## Measurements

Two boundaries reviewed; one test-only repair cluster; two intended edited files; no dependency changes.
One added test contains four deterministic cases; each coordinator run passed 7 file + 3 durable-file + 23 sequencer tests (33 total per run, not 66 distinct tests).
Performance, binary size, hardware durability, and throughput measurements are not applicable.
Run durations: 19,816 ms initial and 2,295 ms rerun; environment label `recovery`; PIDs and timestamps are recorded above.
Exact audit effort, model version, and toolchain version remain unknown; no terminal-fix or throughput claim is made.

## Proposed Decisions

No shared decision is proposed; the new assertions enforce existing explicit promises.
Scoped validation supports the test-evidence repair and unchanged file boundary; coordinator acceptance still depends on canonical integration gates.
Existing contract documentation is sufficient for these unchanged production contracts; no documentation addition is required to accept the test-only repair.
If validation exposes a shared settlement or recovery-policy choice, stop and escalate it rather than changing core contracts, file formats, or these promises to make the test pass.

## Candidate Skills and Process Changes

Candidate refinement to the existing quality audit skill, not a new skill: when a recovery test claims terminal-barrier coverage, check that the fixture has an announced membership and independently invokes each consequential close/shutdown error path.
The evidence-gap event supports this specific trigger; there is no measured process or throughput improvement.
No skill files were edited.

## Remaining Work and Risks

The coordinator must complete warnings-denied rustdoc, documentation/record/policy checks, and canonical integration gates, then reconcile the two inventory rows and verify final ownership and unchanged manifests/lockfiles before integration or commit.
The new regression, neighboring tests, Clippy, and formatting already have scoped passing evidence after the exact layout repair; separate exact-filter execution is not claimed.
No validation artifacts, temporary dependencies, task edits, or background processes were created by this delegate.
Run-start status lists only the two declared modified files; post-run status and ignored artifacts are not enumerated in these records, and must not be discarded.

Lower-ranked candidates were not separately audited:

- Snapshot publication ambiguity: related but distinct from terminal application-prefix finality; revisit when snapshot policy or journal encoding changes. Owner: file engine and sequencer owners.
- Read progress, wakeups, and retained-stream opening lifetime: distinct from authoritative settlement and history loss; revisit on reader lifecycle changes or a concrete blocked-reader incident. Owner: file engine owner.
- Malformed sequencer envelope and minimum-reference recovery matrices: potentially consequential, but a separate format/admission review beyond these two boundaries; revisit on encoding/floor policy changes or independent evidence of corruption acceptance. Owner: sequencer owner.
- Power-loss qualification, retention, authentication, broad redesign, CI feeds, and Fluid integration remain explicitly excluded, not accepted as adequate.

The bounded test-evidence gap is repaired and scoped validation passed; final integration acceptance remains pending.
Do not extrapolate this audit to all error categories, all malformed journals, all lifecycle interleavings, hardware failure, or production safety.
