# Iteration 0004: benchmark-baseline Report

Status: complete
Branch: `rust-service-iteration-0004-benchmark-baseline`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0004-benchmark-baseline`
Base commit: `30c4a06d7b456e135e046905553dd23d14326a56`
Final commit: final report commit containing this file; its hash is returned to the coordinator because a commit cannot contain its own hash
Agent or owner: GitHub Copilot benchmark-baseline coding agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [benchmark-baseline instructions](instructions/benchmark-baseline.md) at `30c4a06d7b456e135e046905553dd23d14326a56`
Session or transcript reference: none
Started and finished: `2026-09-12T16:42:50+00:00` to `2026-09-12T16:57:18+00:00`

## Outcome

Implemented the Wave 1 benchmark scaffold for deterministic empty, small/large compressible and incompressible, and snapshot fixtures; a versioned JSON result/environment schema; correctness smoke workloads; and release measurements against the existing memory and buffered-file implementations. Exact-copy formatting, tests, strict Clippy, smoke workloads, and five-run measurements passed. Confidence is high in fixture/schema determinism and correctness coverage, moderate in the procedure, and low in sub-millisecond startup/read/recovery estimates because their variance is high. The integrated Wave 3 service/transport/wrapper matrix is not complete and is not claimed here.

## Hypothesis Results

Initial hypothesis: a dependency-independent crate can generate seeded fixtures and exercise the existing public `AppendStream` and `SnapshotStore` APIs for memory and buffered-file baselines, while a backend adapter boundary admits later service, transport, compression, and encryption implementations without copying implementation code. The cheapest disconfirming check is to compile and run fixture determinism, schema serialization, and correctness-smoke tests in an exact disposable workspace copy.

Supported for Wave 1: deterministic fixtures and schema round trips passed; correctness smoke passed for two-writer bounded memory appends and periodic memory/file snapshots; the generic runner used only public traits. Five-run append-throughput CV was 2.72% for memory and 0.50% for file. Partly falsified for all metrics: startup CV reached 74.52% for memory, and finite-read/recovery CV reached 25.99%/23.51% for file, so those short-duration observations are not precise baselines. Integrated service, transport, reconnect, wire, compression, and encryption comparisons remain inconclusive until Wave 3.

## Deliverables and Commits

- `crates/benchmarks`: deterministic dependency-free fixture generation, statistical/result schema, generic public-trait workload runner, memory/file adapters, correctness smoke command, and measurement command.
- `scripts/validate-benchmarks.sh`: exact disposable-copy format, test, strict-Clippy, and smoke gate with isolated target output.
- `scripts/measure-benchmarks.sh`: non-CI exact-copy release measurement command that emits JSON lines to standard output and leaves no generated results in the repository.
- `crates/benchmarks/README.md`: procedure, schema, guarantee comparison, and Wave 3 adapter guidance.
- `ce1fe2769ccbff78df8092905f1b81ccb7d4ca7e` - `feat(rust-service): add deterministic benchmark scaffold`.
- Final evidence/report commit - this report; hash returned to the coordinator.

## Validation Evidence

- Pre-edit identity: branch `rust-service-iteration-0004-benchmark-baseline`, worktree `/workspaces/FluidFramework-rust-service-iteration-0004-benchmark-baseline`, HEAD `30c4a06d7b456e135e046905553dd23d14326a56`, clean status, and no diff in `rust-service/Cargo.toml` or `rust-service/Cargo.lock`.
- `CARGO_NET_OFFLINE=true bash rust-service/scripts/validate-benchmarks.sh` from the assigned worktree: exact disposable copy at HEAD `30c4a06d7b456e135e046905553dd23d14326a56`, temporary benchmark workspace registration, isolated target; rustfmt passed; 3 library tests passed; binary test target passed with 0 tests; strict Clippy passed with `-D warnings`; smoke printed `correctness smoke passed: memory writers=2; memory,file snapshot-frequency=16 records=32`.
- `CARGO_NET_OFFLINE=true bash rust-service/scripts/measure-benchmarks.sh --backend memory --fixture small-compressible --records 10000 --writers 1 --snapshot-frequency 1000 --warmups 1 --repetitions 5`: exit 0 at source `ce1fe2769ccbff78df8092905f1b81ccb7d4ca7e`; five JSON summaries retained below.
- Same command with `--backend file`: exit 0 at source `ce1fe2769ccbff78df8092905f1b81ccb7d4ca7e`; five JSON summaries retained below.
- Post-validation and post-measurement `git diff --exit-code HEAD -- rust-service/Cargo.toml rust-service/Cargo.lock`: exit 0. No result dump or key was added to the worktree.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Validation routing failure | Two delegated validation summaries reported zero tests or tests from sibling iteration worktrees despite an absolute requested path. A shared terminal also displayed the encryption worktree branch and malformed in-progress manifest instead of the benchmark command. | The accepted capture must begin with this report's exact worktree, branch, and HEAD. No sibling output is used as evidence. | Several attempted checks and one pre-fix measurement were rejected; no sibling files were edited by this workstream. | Added self-locating scripts that print checkout identity and validate only an exact disposable copy. Final validation uses a dedicated terminal session. | In concurrent multi-worktree sessions, make the executable script establish identity and paths; reject summaries whose output lacks those markers. |
| Schema/workload correction | The initial harness recorded `snapshot_frequency=1000` but published only one final snapshot. | Source review after the first memory procedure run showed the mismatch. | The first five memory repetitions are superseded and excluded from final evidence. | Changed the single-writer snapshot path to publish at every configured interval with parent chaining; concurrency smoke is a separate no-snapshot workload. | Validate recorded workload metadata against the actual control flow before retaining performance output. |

## Contract and Integration Friction

The existing `AppendStream` and `SnapshotStore` APIs are sufficient for startup, append, finite-read, snapshot, and clean file-reopen workloads. They expose no wire-byte, reconnect, queue-depth, encryption, or compression counters, so those observations remain `null` rather than inferred. `FileStream` reports buffered durability without `sync`; its results are not equivalent to a durable service. The crate intentionally remains absent from root workspace membership in this workstream. Integration must register it and regenerate the root lockfile after the Wave 1 commit is accepted.

## Human Interventions

The coordinator supplied the actual hyphenated branch, worktree, and kickoff commit in the assignment. No semantic intervention was required.

## Measurements

Procedure for both baselines: release profile, default features, seed `5573589319906701683`, 10,000 64-byte compressible records (640,000 logical bytes), one writer, one finite reader, snapshots every 1,000 records, one warmup, five measured repetitions. Throughput includes periodic snapshot wall time; snapshot time is the total for ten publications. Append median/p95 are per-operation microseconds. Peak RSS is the process high-water mark, not isolated incremental allocation.

Environment: scaffold source `ce1fe2769ccbff78df8092905f1b81ccb7d4ca7e`; `rustc 1.98.1 (48a229cea 2026-09-01)`; Linux `6.8.0-1064-azure` x86_64; AMD EPYC 7763; 32 logical CPUs; 135,064,977,408 bytes memory; `/dev/loop5`; reported filesystem `ext2/ext3`; measurement tool `snapshotted-stream-benchmarks/0.1.0`. Underlying storage hardware is unknown.

Memory raw summaries:

| Run | Throughput records/s | Append median/p95 us | Startup us | Finite read us | Snapshot total us | Peak RSS bytes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 4,008,869.22 | 0.081 / 0.101 | 0.681 | 910.621 | 2.947 | 5,636,096 |
| 2 | 4,267,546.12 | 0.090 / 0.101 | 0.241 | 676.754 | 2.255 | 5,644,288 |
| 3 | 4,272,660.70 | 0.090 / 0.101 | 0.130 | 671.745 | 2.205 | 5,648,384 |
| 4 | 4,240,982.82 | 0.090 / 0.101 | 0.261 | 669.430 | 2.392 | 5,652,480 |
| 5 | 4,273,027.67 | 0.090 / 0.100 | 0.171 | 655.805 | 2.134 | 5,652,480 |

Memory cross-run summaries `(minimum / median / maximum; sample SD; CV)`: throughput `4,008,869.22 / 4,267,546.12 / 4,273,027.67; 114,662.20; 2.72%`; startup us `0.130 / 0.241 / 0.681; 0.221; 74.52%`; finite-read us `655.805 / 671.745 / 910.621; 108.587; 15.15%`; snapshot-total us `2.134 / 2.255 / 2.947; 0.327; 13.71%`. Recovery, reconnect, persisted bytes, and wire bytes are not applicable or unavailable for this in-memory backend.

Buffered-file raw summaries:

| Run | Throughput records/s | Append median/p95 us | Startup us | Finite read us | Snapshot total us | Recovery us | Peak RSS bytes | Persisted bytes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 540,320.12 | 1.603 / 1.643 | 159.999 | 795.115 | 34.625 | 1,481.387 | 5,820,416 | 720,368 |
| 2 | 546,774.09 | 1.603 / 1.643 | 113.481 | 472.754 | 32.812 | 939.064 | 6,815,744 | 720,368 |
| 3 | 546,334.76 | 1.603 / 1.643 | 106.138 | 460.781 | 34.186 | 918.305 | 6,823,936 | 720,368 |
| 4 | 543,349.10 | 1.613 / 1.653 | 101.179 | 493.642 | 33.281 | 942.621 | 6,832,128 | 720,368 |
| 5 | 546,029.61 | 1.603 / 1.643 | 102.321 | 496.457 | 32.829 | 933.524 | 6,905,856 | 720,368 |

Buffered-file cross-run summaries `(minimum / median / maximum; sample SD; CV)`: throughput `540,320.12 / 546,029.61 / 546,774.09; 2,722.80; 0.50%`; startup us `101.179 / 106.138 / 159.999; 24.720; 21.20%`; finite-read us `460.781 / 493.642 / 795.115; 141.294; 25.99%`; snapshot-total us `32.812 / 33.281 / 34.625; 0.821; 2.45%`; clean-reopen recovery us `918.305 / 939.064 / 1,481.387; 245.253; 23.51%`. Persisted size was deterministic at 720,368 bytes, or 1.125575 persisted/logical amplification; this includes two 24-byte headers, 10,000 eight-byte record lengths, and ten 32-byte snapshot records. Wire bytes and reconnect are unavailable.

Guarantees differ materially: memory results acknowledge `Durability::Memory`; file results acknowledge `Durability::Buffered`, flush each append, do not call `sync`, and support only clean single-process reopen. They are not ranked as equivalent durability results. Encryption and compression are inactive in both.

## Proposed Decisions

No shared decision is proposed. The scaffold consumes existing public contracts and keeps unavailable observations explicit.

## Candidate Skills and Process Changes

Candidate coordination procedure: workstream-owned validation scripts should print absolute checkout identity and perform restricted-lockfile validation in a disposable copy. Reject delegated summaries when their identity marker does not match, even if the command reports success.

## Remaining Work and Risks

- Wave 3 must add the assembled service, native and browser WebTransport, native reconnect lifecycle, compression, and encryption adapters after their integration commits exist.
- Wave 3 must obtain public wire-byte, reconnect, queue-depth, and wrapper size/CPU observations; Wave 1 does not manufacture those counters.
- Wave 3 must run empty, incompressible, large, warm/cold restart, bounded multi-writer/reader, service startup, reconnect, storage-amplification, and transport/wrapper combinations with equivalent active guarantees. The complete matrix is not present here.
- Wave 1 measurements are procedure baselines only, not capacity or leaderboard claims. Short-duration startup/read/recovery metrics need longer workloads or external timing to reduce observed variance.
