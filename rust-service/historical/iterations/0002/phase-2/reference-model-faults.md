# Iteration 0002: reference-model-faults Report

Status: complete
Branch: `rust-service-iteration-0002-reference-model-faults`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0002-reference-model-faults`
Base commit: `d04c7aa44eb8720fee2242d98729e6916c0dcb02`
Final commit: `951d4557150939f85141a156f9e2148567da7d2c` (implementation; report completion follows as a documentation-only commit)
Agent or owner: GitHub Copilot reference/model agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: `rust-service/iterations/0002/phase-2/instructions/reference-model-faults.md` at kickoff commit `d04c7aa44eb8720fee2242d98729e6916c0dcb02`
Session or transcript reference: none
Started and finished: started `2026-09-12T15:09:44+00:00`; finished time and elapsed time unknown

## Outcome

Added a deterministic sequential reference model to the shared conformance runner, using seed `0x5eed0002d15ca11e` across 24 appends, four intermediate reads, two snapshot publications, and recovery from the latest snapshot. Added opt-in `PositionCodec` conformance for capability advertisement, round trip, an implementation-supplied malformed token, and foreign-generation encode/decode rejection.

Memory test-only wrappers inject both legal ambiguous append outcomes and interrupt one finite reader without affecting an independent reader. Tests reconcile ambiguous state and snapshot recovery only through public traits. No core, manifest, lockfile, production storage, transport, or accepted-semantic change was required. Confidence is high for the three integrated baseline consumers and the only currently applicable codec implementation.

## Hypothesis Results

Initial hypothesis: a pure deterministic sequential oracle plus fault wrappers implemented only through the public traits can express append ordering, ambiguous append outcomes, finite interrupted reads, independent readers, snapshot recovery, and position-codec laws without implementation-private hooks or accepted-semantic changes.

Cheapest disproof: a compiling deterministic trace whose expected state cannot be determined from public append receipts, finite reads, head, latest snapshot, and `PositionCodec`, or a fault wrapper that requires access to implementation-private state.

Planned checks: focused model unit tests with retained seeds/traces; ambiguous append reconciliation tests for both committed-response-lost and rejected-before-commit outcomes; interrupted and independent finite-reader tests; snapshot recovery comparison against the model; codec round-trip, malformed-token, and foreign-generation checks; exact package tests; strict package Clippy; workspace format check; and `git diff --exit-code -- rust-service/Cargo.lock`.

Result: supported. The public-trait fault wrapper exercised ambiguous-before-commit, ambiguous-after-commit, and a one-reader interruption without implementation-private access. Both ambiguous states were reconciled by finite reads, recovery from the latest snapshot observed the committed ambiguous append, and the seeded model passed unchanged over memory, file-simple, and compression. Memory's codec passed the exact accepted `InvalidPosition` classification for malformed and foreign-generation inputs.

## Deliverables and Commits

1. `951d4557150939f85141a156f9e2148567da7d2c` (`test(rust-service): add reference model fault conformance`) adds the seeded model trace, opt-in codec conformance, and memory-backed deterministic fault evidence.
2. This completed report in the documentation-only commit following the implementation commit.

## Validation Evidence

- Checkout identity before implementation: worktree `/workspaces/FluidFramework-rust-service-iteration-0002-reference-model-faults`, branch `rust-service-iteration-0002-reference-model-faults`, `HEAD` `d04c7aa44eb8720fee2242d98729e6916c0dcb02`, empty `git status --short`, and exit `0` from `git diff --exit-code -- rust-service/Cargo.lock`.
- `cargo test --manifest-path /workspaces/FluidFramework-rust-service-iteration-0002-reference-model-faults/rust-service/Cargo.toml -p snapshotted-stream-conformance -p snapshotted-stream-memory --all-features`: exit `0` in 0.97 seconds; memory ran 10 tests with 10 passed and 0 failed, and both crates' doc tests passed. Added evidence passed in `passes_shared_conformance`, `passes_position_codec_conformance`, `ambiguous_append_outcomes_are_reconciled_by_committed_state`, `interrupted_reader_does_not_affect_independent_reader`, and `snapshot_recovery_observes_committed_ambiguous_append`.
- `cargo test --manifest-path /workspaces/FluidFramework-rust-service-iteration-0002-reference-model-faults/rust-service/Cargo.toml -p snapshotted-stream-file-simple -p snapshotted-stream-compression --all-features tests::passes_shared_conformance -- --exact --nocapture`: exit `0` in 0.82 seconds; the exact shared-conformance test passed once in each package with 0 failures.
- `cargo clippy --manifest-path /workspaces/FluidFramework-rust-service-iteration-0002-reference-model-faults/rust-service/Cargo.toml -p snapshotted-stream-conformance -p snapshotted-stream-memory --all-targets --all-features -- -D warnings`: exit `0` in 3.23 seconds; no diagnostics.
- `cargo fmt --manifest-path /workspaces/FluidFramework-rust-service-iteration-0002-reference-model-faults/rust-service/Cargo.toml --all -- --check`: exit `0`; no formatter differences.
- `git -C /workspaces/FluidFramework-rust-service-iteration-0002-reference-model-faults diff --exit-code -- rust-service/Cargo.lock`: exit `0`; the lockfile remained unchanged. The same marked scope check showed only the two owned source files and this report modified before commits, and `git diff --check` exited `0`.
- `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0002 phase-2`: exit `1` as expected before integration completion; diagnostics named only the active manifest status and unresolved markers in durable-snapshots, network-transport, authoritative-sequencer, and integration reports. It reported no error for this completed report.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Validation routing | Delegated and shared-terminal Cargo requests were routed to or interrupted by concurrently active sibling worktrees. | Returned identity named `rust-service-iteration-0002-network-transport` or `rust-service-iteration-0002-authoritative-sequencer`; one marked reference Clippy run and one consumer run were interrupted before completion. | Several outputs were invalid for this workstream and were excluded; no assigned files were affected. | Used absolute manifests and accepted only uninterrupted results containing checkout-specific artifact paths or matching boundary markers. All required gates subsequently passed. | In concurrent worktrees, command text alone is insufficient provenance; retain identity and artifact paths in the same uninterrupted result. |

## Contract and Integration Friction

No shared API limitation or semantic change was required. Opaque token bytes prevent a generic harness from manufacturing a definitely malformed token, so `run_position_codec_conformance` accepts one implementation-documented malformed specimen while generating its own round-trip and foreign-generation cases. Memory is the only integrated `PositionCodec` implementation at this kickoff; file-simple and compression are applicable to the baseline model and both passed it unchanged.

Integration should cherry-pick `951d4557150939f85141a156f9e2148567da7d2c` before downstream workstreams consume the new conformance helper. Durable and network implementations should run the expanded baseline when integrated; codec-capable transports should call the opt-in helper with a known malformed token.

## Human Interventions

The user supplied the actual branch, worktree, and kickoff commit. No semantic, API, implementation, or corrective human intervention was required.

## Measurements

- Correctness: 10 memory tests passed; the shared seeded model also passed in the exact file-simple and compression conformance tests; strict Clippy and format passed.
- Deterministic trace: one fixed 64-bit seed, 24 appends, four intermediate suffix reads, two monotonic snapshots, and one recovery read.
- Source delta in the implementation commit: 401 insertions and 2 deletions across 2 files.
- Dependencies: no manifest or lockfile changes; direct and transitive dependency counts are unchanged.
- Environment: Debian GNU/Linux 13 dev container; `rustc 1.98.1 (48a229cea 2026-09-01)`; `cargo 1.98.1 (797e8a9bc 2026-08-05)`.
- Performance, throughput, allocation, and durable-size measurements: not applicable to this correctness-only workstream. Elapsed effort and token use are unknown.

## Proposed Decisions

No shared decision is proposed. The evidence exercises existing accepted semantics and Decision 0005 unchanged.

## Candidate Skills and Process Changes

Require a unique begin/end marker plus checkout-specific artifact paths for retained Cargo evidence when concurrent agents share terminals. Reject any output lacking both markers or naming a sibling worktree, even when the requested command text was correct.

## Remaining Work and Risks

- No assigned implementation work remains.
- Phase 2 integration must cherry-pick `951d4557150939f85141a156f9e2148567da7d2c`, run `cargo test --workspace --all-targets --all-features`, and record whether newly integrated durable and network implementations pass applicable model and codec conformance.
- Ambiguous append reconciliation remains observation-based: a unique payload can be found after an ambiguous response, but the kernel still provides no idempotent append identity. This test records both accepted outcomes and does not claim retry safety or change that contract.
- The deterministic model is intentionally sequential and correctness-focused; it does not model retention, live tailing, transport faults, crash durability, or performance.
