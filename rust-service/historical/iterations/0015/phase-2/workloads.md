# Iteration 0015: workloads Report

Status: complete
Branch: `rust-service-iteration-0015-workloads`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0015-workloads`
Base commit: `27bf6bde813606100a00bf180085e2a5ba3a0f08`
Final commit: implementation `7cf0946c1a3`; the report-only completion commit follows this report and is intentionally not self-referential
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [`instructions/workloads.md`](instructions/workloads.md) at kickoff `27bf6bde813606100a00bf180085e2a5ba3a0f08`
Session or transcript reference: none
Started and finished: `2026-09-17`; exact times unknown

## Outcome

Challenged all six inherited workload dispositions against the exact owning decision and a smallest wrong result. Repaired two test-evidence clusters without changing production behavior: reopened snapshot-disabled storage now has a direct wrong-payload rejection oracle, and counter recovery now independently proves later-snapshot replacement and malformed-snapshot rejection. The other four inherited decisions already had discriminating focused or executable evidence. Confidence is high because focused tests, both complete package suites, strict Clippy, warning-denied rustdoc, benchmark smoke, the counter executable, formatting, lockfile, and ownership checks passed.

## Hypothesis Results

- **Owning-decision evidence supported:** `file_backend_recovers_without_snapshots` could pass if reopened payload verification were removed because it asserted only the original workload's count and the presence of recovery timing. `reopened_storage_rejects_wrong_payloads_without_snapshots` now rejects the smallest same-count wrong reopened read.
- **Owning-decision evidence supported:** `rejects_malformed_delta` could pass if only snapshot decoding stopped enforcing fixed width. `rejects_malformed_snapshot` now isolates that branch.
- **Owning-decision evidence supported:** `runs_snapshot_and_replay_demo` could return `4` while ignoring its later snapshot because the preceding deltas already sum to the snapshot value `5`. `later_snapshot_replaces_prior_event_state_before_tail_replay` uses prior value `2`, replacement snapshot `20`, and tail `-1`, so event-only replay produces `1` while correct recovery produces `19`.
- **Convergence supported:** the remaining benchmark exact-multiset, writer-completion, counter executable, and shared decoder decisions already have direct checks that cannot be satisfied by another component while the owning decision is broken.
- **Proportionate repair supported:** three focused tests in two related clusters were sufficient; no production, API, manifest, schema, workload, or dependency change was needed.

## Deliverables and Commits

- Focused reopened-storage wrong-payload rejection evidence in `sea-benchmarks`.
- Focused later-snapshot replacement and malformed-snapshot evidence in `sea-counter`.
- Six proposed inventory rows with exact decision/oracle mappings.
- `7cf0946c1a3` `test(rust-service): strengthen workload oracles`.
- A report-only completion commit follows the implementation commit.

## Validation Evidence

- Guarded checkout identity passed for `/workspaces/FluidFramework-rust-service-iteration-0015-workloads`, branch `rust-service-iteration-0015-workloads`, kickoff `27bf6bde813606100a00bf180085e2a5ba3a0f08`.
- Focused `cargo test -p sea-counter tests::rejects_malformed_snapshot -- --exact`: one passed.
- Focused `cargo test -p sea-counter tests::later_snapshot_replaces_prior_event_state_before_tail_replay -- --exact`: one passed.
- Focused `cargo test -p sea-benchmarks tests::reopened_storage_rejects_wrong_payloads_without_snapshots -- --exact`: one passed.
- `cargo fmt --all -- --check`: passed.
- `cargo clippy -p sea-benchmarks -p sea-counter --all-targets --all-features -- -D warnings`: passed.
- `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-benchmarks -p sea-counter --all-features --no-deps`: passed.
- `cargo test -p sea-benchmarks -p sea-counter --all-targets --all-features`: passed, including all three new tests.
- `cargo run -p sea-benchmarks -- smoke`: passed and printed `correctness smoke passed: memory writers=2; memory,file snapshot-frequency=16 records=32; Wave 3 adapters snapshot-frequency=4 records=8`.
- `cargo run -p sea-counter`: passed and printed `recovered counter: 4`.
- `git diff --check`, unchanged `rust-service/Cargo.lock`, and writable-path guards passed.
- No machine-readable benchmark output was retained, as required.

## Behavioral Contracts and Test Layers

No production crate changed; only owning-package tests changed.

`sea-benchmarks` owns successful-result acceptance. `verify_payloads` decides that the finite read has the exact fixture multiset. `payload_verification_rejects_duplicate_wrong_payloads` fails if multiplicity is collapsed or payload identity is ignored. `verify_reopened_storage` decides that clean reopen verifies records even when snapshots are disabled. `reopened_storage_rejects_wrong_payloads_without_snapshots` fails if reopened payload validation is removed or reduced to count. The concurrent branches decide that all spawned writers complete successfully, produce exactly one latency per configured record, and pass finite-read verification before returning measurements. The two-writer smoke fails on a task error, count mismatch, or wrong final payload set; no backend can mask those harness-local guards. Smoke additionally proves backend composition, not the focused oracle decisions.

`sea-counter::recover` owns applying a selected snapshot as replacement state, replaying only its tail, and decoding both snapshots and deltas as signed eight-byte big-endian values. `recovers_from_initial_snapshot` discriminates initial snapshot plus tail. `later_snapshot_replaces_prior_event_state_before_tail_replay` discriminates later-snapshot replacement because ignoring the snapshot yields `1`, not `19`. `rejects_malformed_snapshot` and `rejects_malformed_delta` isolate the two call-site branches into the shared decoder. `run_demo` and `main` own the example value, assertion, and output; `runs_snapshot_and_replay_demo` fails if the bounded demonstration no longer returns `4`, while `cargo run -p sea-counter` additionally checks the executable assertion and exact user-facing output.

Shared conformance, generated-binding, and browser evidence are not applicable because these decisions belong to workload acceptance and example behavior rather than dependency laws or platform adapters. Existing READMEs already state exact verification, snapshot-plus-tail recovery, malformed payload rejection, and executable output; no contract prose changed.

### Proposed Quality Inventory Rows

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sea-benchmarks/finite-read-integrity` | `verify_payloads`; benchmark result consumers | A count or lossy aggregate can accept wrong payload multiplicity. | Successful output requires the exact fixture multiset, independent of concurrent order. | focused, integration-like smoke | Four identical wrong payloads must be rejected even when count and an XOR-style aggregate match. `payload_verification_rejects_duplicate_wrong_payloads` directly exercises the owning verifier. | already adequate | none | package tests and smoke passed | Payload validation becomes a measured bottleneck or streaming verification is introduced. |
| `sea-benchmarks/file-recovery-without-snapshots` | `verify_reopened_storage`; file workload users selecting snapshot frequency zero | The inherited test asserted original-run count and recovery timing, which survive removal of reopened payload verification. | Snapshot-disabled clean reopen verifies the exact retained records without requiring snapshot state. | focused, integration-like smoke | A reopened stream containing one expected-count wrong payload must fail. | repaired | Added `reopened_storage_rejects_wrong_payloads_without_snapshots`. | focused test, package tests, and smoke passed | Recovery semantics or snapshot defaults change. |
| `sea-benchmarks/concurrent-writer-completion` | Concurrent branches in `run_storage` and `run_session`; result consumers | Partial task completion could otherwise emit misleading throughput. | Every writer task and operation succeeds, exactly one latency exists per record, and exact finite-read verification precedes result return. | focused, integration-like smoke | A task error propagates through `result??`; missing operations fail the latency-count guard; wrong completed records fail `verify_payloads`. The two-writer smoke executes this chain. | already adequate | none | package tests and two-writer smoke passed | Writer scheduling, cancellation, or result streaming changes. |
| `sea-counter/snapshot-tail-recovery` | `recover`; example readers | The demo's pre-snapshot deltas sum to its snapshot value, masking an ignored later snapshot. | A selected initial or later snapshot replaces prior state before ordered tail replay, which stops at backlog catch-up. | focused, executable | Prior value `2`, later snapshot `20`, and tail `-1` must recover `19`; ignoring the snapshot yields `1`. | repaired | Added `later_snapshot_replaces_prior_event_state_before_tail_replay`. | focused and complete package tests plus executable passed | The example becomes persistent, remote, live, or multi-writer. |
| `sea-counter/fixed-width-payloads` | `decode_counter_value` call sites in `recover`; example readers | Delta-only malformed evidence could not detect bypass of snapshot decoding. | Both snapshot and delta branches require signed eight-byte big-endian values and return branch-specific diagnostic errors otherwise. | focused | Malformed bytes in each branch must return that branch's exact error. | repaired | Added `rejects_malformed_snapshot`; retained `rejects_malformed_delta`. | both focused tests and complete package tests passed | Snapshot and event encodings diverge or gain branch-specific behavior. |
| `sea-counter/executable-contract` | `run_demo` and `main`; command-line users | An example can compile while ceasing to demonstrate or print its advertised result. | The bounded demo returns `4`; the executable asserts it and prints `recovered counter: 4`. | focused, executable | `runs_snapshot_and_replay_demo` rejects a wrong demo result; direct execution rejects a failed assertion or different output path. | already adequate | none | package test and executable passed with exact output | Output becomes machine-consumed or CLI arguments are introduced. |

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified inherited evidence | The prior later-snapshot demo test was treated as proof that the snapshot replaces prior event state. | Its pre-snapshot deltas are `2 + 3 = 5`, equal to the published snapshot value; replaying all events without the snapshot still returns `4`. | The exact snapshot-selection decision lacked a discriminating oracle. | Added a non-equivalent replacement snapshot test that distinguishes `19` from event-only `1`. | Construct expected values so bypassing the decision cannot coincidentally produce the oracle. |
| Falsified inherited evidence | The prior malformed-delta test was treated as proof for both decoder call sites. | The snapshot and event branches separately invoke the helper; the delta test still passes if only the snapshot call is bypassed. | Snapshot branch wiring lacked direct evidence. | Added `rejects_malformed_snapshot`. | Shared-helper coverage does not prove every consequential call-site decision. |
| Falsified inherited evidence | The prior snapshot-disabled file test was treated as proof of reopened payload integrity. | Its assertions use the original run's `finite_read_records` and only require recovery timing. | Removing reopened payload verification would leave the test green. | Added a direct wrong-payload oracle against `verify_reopened_storage`. | Assert the recovered state itself, not metadata produced before reopen. |
| Execution isolation | Delegated and shared-terminal runs landed in sibling worktrees or were interrupted during concurrent iteration activity. | One guard reported the decorators branch; two guarded Cargo runs exited 130, and one terminal switched to core-session output. | Those outputs could not support workload validation. | Discarded them and accepted only absolute-path, branch-guarded runs bound to this worktree. | Multi-worktree evidence must include checkout identity and a normal exit before it is accepted. |
| Selector correction | The first exact counter selector used an unqualified name. | Cargo reported zero tests and four filtered out. | The command did not validate the new test. | Reran `tests::rejects_malformed_snapshot` and required one passing test. | An exit-zero test command is insufficient when the selected test count is zero. |

## Contract and Integration Friction

No shared API limitation or source dependency. Concurrent workstream command routing required absolute paths, branch guards, and rejection of interrupted or sibling-worktree output.

## Human Interventions

The coordinator supplied the authoritative worktree, branch, clean kickoff `27bf6bde813606100a00bf180085e2a5ba3a0f08`, writable scope, and requirement for benchmark smoke and counter execution. No mid-workstream semantic intervention was required.

## Measurements

Three focused tests were added across two packages; production code, dependencies, manifests, schemas, workloads, and lockfiles are unchanged. Performance and artifact-size measurements are not applicable because this workstream strengthened correctness oracles without changing measured behavior. Environment: Linux dev container; exact CPU, memory, elapsed time, Rust version, and token use unknown. No output artifact was retained.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

For workload audits, construct a wrong result that changes only the owning decision before accepting an oracle. In particular, avoid fixtures whose pre-decision and post-decision states are numerically equivalent, assert recovered content rather than pre-recovery metadata, and verify that exact test selectors execute a nonzero test count. These procedures specialize the existing quality skill and do not require a separate skill.

## Remaining Work and Risks

No workstream-owned implementation remains. Integration should reconcile the six proposed inventory rows and run canonical workspace, policy, and repository-build gates. Exceptional-failure temporary-directory cleanup remains excluded under the inherited trigger: revisit after repeated disk accumulation or a workload lifecycle change. Counter tree-root failures, external storage errors, and arithmetic overflow remain intentionally outside this bounded constructed example; revisit if external input or arbitrary deltas are introduced. Confidence is high for the owned workload decisions. No retained machine-readable output or temporary process remains.
