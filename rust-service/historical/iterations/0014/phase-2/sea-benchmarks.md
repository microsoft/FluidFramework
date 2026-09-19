# Iteration 0014: sea-benchmarks Report

Status: complete
Branch: `rust-service-iteration-0014-sea-benchmarks`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0014-sea-benchmarks`
Base commit: `122e48a57007da96d4941f1630e7a709224e5296`
Final commit: implementation `7b53ee0c5ed8c196f51e99a201507e1d06c3d5bf`; the report-only completion commit follows this report and is intentionally not self-referential
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [`instructions/sea-benchmarks.md`](instructions/sea-benchmarks.md) at kickoff `122e48a57007da96d4941f1630e7a709224e5296`
Session or transcript reference: none
Started and finished: `2026-09-17`; exact times unknown

## Outcome

Audited workload correctness, result emission, file recovery, concurrent writer completion, and command configuration against the implementation, consumers, and iteration `0013` evidence. Repaired two material crate-owned gaps: finite-read verification now checks the exact order-independent payload multiset instead of a collision-prone XOR digest, and file recovery now accepts configured snapshot-disabled workloads while verifying reopened payloads. Added two focused regression tests. Confidence is high because all package tests, strict Clippy, warning-denied rustdoc, smoke workloads, formatting, and repository hygiene checks passed.

## Hypothesis Results

Supported: risk-ranked inspection found material gaps not covered by iteration `0013`, which had focused on declaration documentation, percentile selection, and command configuration. The output-integrity hypothesis was confirmed because count plus XOR accepts any identical wrong payload repeated an even number of times for an even-record empty-fixture workload. `payload_verification_rejects_duplicate_wrong_payloads` proves the owning verifier now rejects that case.

Supported: `--snapshot-frequency 0` is accepted as disabling snapshots, but the plain file recovery path unconditionally required a snapshot. `file_backend_recovers_without_snapshots` now proves the configured workload completes recovery, retains exact payloads, and records recovery time.

Already adequate: concurrent storage and session writers propagate task and operation failures through `JoinSet`, require one latency per configured record, and verify the finite read before result emission. No additional failure-injection abstraction was justified after the exact payload repair.

## Deliverables and Commits

- Exact borrowed payload-multiset verification shared by storage and session finite reads.
- Configuration-aware plain-file recovery with exact reopened-payload verification.
- Focused regressions for duplicate wrong payloads and snapshot-disabled file recovery.
- `7b53ee0c5ed8c196f51e99a201507e1d06c3d5bf` `fix(sea-benchmarks): strengthen workload verification`
- A report-only completion commit follows the implementation commit.

## Validation Evidence

- Baseline `cargo test -p sea-benchmarks --all-targets --all-features` passed before implementation.
- The first post-edit package test found a stale smoke caller at `verify_reopened_storage(&reopened, snapshot.records)` and failed compilation with `E0308`; the caller was corrected to pass `&snapshot`.
- Focused `cargo test -p sea-benchmarks payload_verification_rejects_duplicate_wrong_payloads -- --exact` passed one test.
- Focused `cargo test -p sea-benchmarks file_backend_recovers_without_snapshots -- --exact` passed one test.
- Final `cargo test -q -p sea-benchmarks --all-targets --all-features` passed 10 tests: 4 library and 6 binary tests.
- `cargo fmt --all -- --check` passed after applying `cargo fmt -p sea-benchmarks`.
- `cargo clippy --manifest-path /workspaces/FluidFramework-rust-service-iteration-0014-sea-benchmarks/rust-service/Cargo.toml -p sea-benchmarks --all-targets --all-features -- -D warnings` passed.
- `RUSTDOCFLAGS='-D warnings' cargo doc --manifest-path /workspaces/FluidFramework-rust-service-iteration-0014-sea-benchmarks/rust-service/Cargo.toml -p sea-benchmarks --all-features --no-deps` passed.
- `cargo run --manifest-path /workspaces/FluidFramework-rust-service-iteration-0014-sea-benchmarks/rust-service/Cargo.toml -p sea-benchmarks -- smoke` passed every retained backend and printed `correctness smoke passed: memory writers=2; memory,file snapshot-frequency=16 records=32; Wave 3 adapters snapshot-frequency=4 records=8`.
- `git diff --check` passed; changed paths were limited to the owned package and report.
- `git diff --exit-code -- rust-service/Cargo.lock` passed; the lockfile is unchanged.
- No machine-readable benchmark output was retained, as required.

## Behavioral Contracts and Test Layers

`sea-benchmarks` owns the guarantee that a successful workload verifies every configured fixture payload before emitting a result. The narrow contract is `verify_payloads`, used by both storage and session finite-read verification. `payload_verification_rejects_duplicate_wrong_payloads` is focused owning-crate evidence for exact multiplicity; existing smoke workloads remain broader composition evidence across all supported backends.

The crate also owns the meaning of `Config::snapshot_frequency = None`: snapshots are disabled, including during clean file recovery. `verify_reopened_storage` now conditions snapshot preservation on that configuration and always checks exact reopened payloads. `file_backend_recovers_without_snapshots` is focused owning-crate evidence; smoke separately proves snapshot-enabled memory, file, and decorated compositions.

No shared conformance, generated-binding, or browser test was added because these repairs concern harness acceptance and reporting, not dependency laws or platform behavior. README and public schema documentation already state that zero disables snapshots and successful runs are harness-verified, so no documentation change was needed.

## Proposed Quality Inventory Rows

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sea-benchmarks/finite-read-integrity` | `sea-benchmarks` storage/session verification; benchmark result consumers | XOR aggregation loses even multiplicities and can accept an incorrect even-record empty-fixture read | Successful output follows exact fixture-payload verification independent of concurrent order | Focused schema/fixture tests; integration-like smoke | Four identical wrong payloads have the same zero XOR aggregate as four expected empty payloads; focused verifier test | repaired | Replaced digest XOR with borrowed exact multiset counts; added `payload_verification_rejects_duplicate_wrong_payloads` | 10 package tests, Clippy, rustdoc, smoke passed | Revisit if payload validation becomes a measured bottleneck or streaming verification is introduced |
| `sea-benchmarks/file-recovery-without-snapshots` | Plain file backend runner; callers selecting `--snapshot-frequency 0` | Parser accepts and documents disabled snapshots, but recovery unconditionally required one | Snapshot-disabled file workloads recover and verify records without requiring snapshot state | Focused configuration tests; snapshot-enabled smoke | Run the file backend with `snapshot_frequency: None` | repaired | Made snapshot verification conditional, added exact reopened-payload check and `file_backend_recovers_without_snapshots` | Focused test and complete package gates passed | Revisit if recovery semantics or snapshot defaults change |
| `sea-benchmarks/concurrent-writer-completion` | Storage/session workload runners; result consumers | Task cancellation or partial completion could otherwise emit misleading throughput | Every writer task and operation succeeds, one latency exists per configured record, and finite-read verification passes before output | Smoke with two memory writers; focused exact payload test | Trace `JoinSet` error propagation, latency-count guard, and post-read verification | already adequate | None; existing implementation became sufficient once exact payload verification replaced XOR | Package tests and two-writer smoke passed | Revisit if writer scheduling, cancellation, or result streaming changes |

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified probe | The first illustrative payload sets did not produce the proposed XOR collision. | Distinct aggregate values were observed for `[A, B, C, D]` and `[A, A, C, C]`. | The example was rejected before implementation. | Reframed the check around the configured empty fixture: any identical payload repeated an even number of times has a zero XOR aggregate, including both the expected empty payload and an incorrect replacement. | Use a workload-valid counterexample before accepting a benchmark-integrity finding. |
| Tooling discrepancy | A delegated collision probe correctly reported equal even-multiplicity XOR aggregates but mislabeled its calculation as the source `payload_digest` algorithm. | The output named SHA-256 word folding rather than the FNV-style per-payload digest in `main.rs`. | Only the algorithm-independent even-multiplicity property was accepted; implementation-specific output was discarded. | The production regression test directly exercises the crate verifier. | Treat delegated calculation details that contradict source as invalid and anchor acceptance to an executable owning-crate test. |
| Execution isolation | Several Cargo invocations were rebound to sibling worktrees or terminated with exit 130 during concurrent iteration activity. | Guards named `sea-encryption` or unrelated `sea-counter` output; later guarded benchmark commands completed normally. | Invalid outputs were discarded and validation was delayed. | Used absolute worktree and manifest paths, sentinels, branch guards, and accepted only normal exits naming this worktree. | Concurrent workstream validation must bind evidence to literal checkout identity and reject interrupted or cross-wired output. |
| Focused validation failure | Strengthening `verify_reopened_storage` changed its argument from a record count to `&Config`, but the smoke caller retained the old argument. | Package compilation failed with `E0308` at the smoke call. | No test ran in that attempt. | Updated the caller to pass `&snapshot`; reran the same package test successfully. | A shared private-helper signature change still requires every in-crate caller to compile before broader audit work resumes. |

## Contract and Integration Friction

No shared API limitation, semantic decision, or cross-workstream source dependency. Concurrent execution channels produced sibling-worktree output and interruptions, but guarded retries resolved validation without changing scope.

## Human Interventions

The coordinator supplied the authoritative branch, worktree, kickoff HEAD `122e48a57007da96d4941f1630e7a709224e5296`, clean status, and writable scope. No mid-workstream semantic intervention was required.

## Measurements

Performance measurements and retained output are not applicable because this workstream repaired correctness acceptance without changing workloads or result schemas. Test count increased from 8 to 10. Exact verification stores borrowed payload keys and counts rather than copying payload bodies. Dependencies, manifests, and lockfiles did not change. Environment: Linux; exact CPU, memory, elapsed time, Rust version, and token use unknown.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

No new skill change is proposed. The existing coordination rule to reject validation output whose path or branch differs from the assignment was necessary and sufficient. Absolute manifest paths were the reliable fallback when an executor omitted its requested working-directory change.

## Remaining Work and Risks

No workstream-owned implementation remains. Integration should reconcile the three proposed inventory rows and run canonical workspace, policy, and repository-build gates. Exact payload verification adds a hash table of borrowed payload references to the correctness phase; revisit only if measurements show that verification itself materially distorts process CPU or peak-memory observations. Temporary backend directories may remain after an exceptional mid-run failure; this was not selected within the two-cluster budget and should be revisited if repeated failures create disk accumulation. No retained reproducer or machine-readable output remains.
