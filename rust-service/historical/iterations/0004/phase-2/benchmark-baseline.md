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
Started and finished: Wave 1 `2026-09-12T16:42:50+00:00` to `2026-09-12T16:57:18+00:00`; Wave 3 completed `2026-09-12T18:55:36+00:00`

## Outcome

Wave 1 implemented deterministic fixtures, schema, smoke workloads, and memory/buffered-file baselines. Wave 3 completed the integrated matrix using only public APIs: bounded local transport; independent and dictionary compression; encryption; compression-before-encryption; assembled native service; native lifecycle reconnect; and native HTTP/3 WebTransport. The final release run completed 26 cells and 130 measured repetitions after one warmup per cell. Browser Chromium evidence is consumed from the reviewed WebTransport workstream, but browser packet and queue metrics remain unavailable by browser API design and are not inferred.

## Hypothesis Results

Initial hypothesis: a dependency-independent crate can generate seeded fixtures and exercise the existing public `AppendStream` and `SnapshotStore` APIs for memory and buffered-file baselines, while a backend adapter boundary admits later service, transport, compression, and encryption implementations without copying implementation code. The cheapest disconfirming check is to compile and run fixture determinism, schema serialization, and correctness-smoke tests in an exact disposable workspace copy.

Supported for Wave 1: deterministic fixtures and schema round trips passed; correctness smoke passed for two-writer bounded memory appends and periodic memory/file snapshots; the generic runner used only public traits. Five-run append-throughput CV was 2.72% for memory and 0.50% for file. Partly falsified for all metrics: startup CV reached 74.52% for memory, and finite-read/recovery CV reached 25.99%/23.51% for file, so those short-duration observations are not precise baselines.

Supported for Wave 3: all 26 bounded cells produced five release repetitions; 21/26 throughput CVs were at most 5.40%, wrapper persisted sizes and transport counters were deterministic, and direct/native-WebTransport service paths used equivalent FSP4 requests and fixtures. Partly falsified: independent zlib small-compressible throughput CV was 31.91%; large stateful-compression and encryption CVs reached 15.17% and 10.20%; WebTransport startup/read/reconnect CVs were 55.29%/25.21%/47.63%. Those cells are observations, not stable rankings. The service read hypothesis was narrowed: public reads return canonical sequencer records, consistently 201 records for 200 acknowledged submissions, not a projected one-record-per-submission stream.

## Deliverables and Commits

- `crates/benchmarks`: deterministic dependency-free fixture generation, statistical/result schema, generic public-trait workload runner, memory/file adapters, correctness smoke command, and measurement command.
- `scripts/validate-benchmarks.sh`: exact disposable-copy format, test, strict-Clippy, and smoke gate with isolated target output.
- `scripts/measure-benchmarks.sh`: non-CI exact-copy release measurement command that emits JSON lines to standard output and leaves no generated results in the repository.
- `crates/benchmarks/README.md`: procedure, schema, guarantee comparison, and Wave 3 adapter guidance.
- `ce1fe2769ccbff78df8092905f1b81ccb7d4ca7e` - `feat(rust-service): add deterministic benchmark scaffold`.
- `cd8987cf1582e8c32f2f56518917747952ee2d90` - `docs(rust-service): record benchmark baseline evidence`.
- `8cf28d43fa69b74a1ac1b287f59a70a1b901c12a` - `feat(rust-service): benchmark integrated service paths`.
- `ff9556832630d9ed8f5ffc5d97c528559d14cf6f` - `fix(rust-service): report canonical service reads`.
- `cea3ac17adda6fedefb19873a6947150870c0cb7` - `fix(rust-service): bound protocol-valid benchmark matrix`.
- `60ee86cf4324839cac8709cc05ae1f23343f837a` - `docs(rust-service): clarify canonical benchmark reads`.
- Final Wave 3 evidence/report commit - this report; hash returned to the coordinator.

## Validation Evidence

- Pre-edit identity: branch `rust-service-iteration-0004-benchmark-baseline`, worktree `/workspaces/FluidFramework-rust-service-iteration-0004-benchmark-baseline`, HEAD `30c4a06d7b456e135e046905553dd23d14326a56`, clean status, and no diff in `rust-service/Cargo.toml` or `rust-service/Cargo.lock`.
- `CARGO_NET_OFFLINE=true bash rust-service/scripts/validate-benchmarks.sh` from the assigned worktree: exact disposable copy at HEAD `30c4a06d7b456e135e046905553dd23d14326a56`, temporary benchmark workspace registration, isolated target; rustfmt passed; 3 library tests passed; binary test target passed with 0 tests; strict Clippy passed with `-D warnings`; smoke printed `correctness smoke passed: memory writers=2; memory,file snapshot-frequency=16 records=32`.
- `CARGO_NET_OFFLINE=true bash rust-service/scripts/measure-benchmarks.sh --backend memory --fixture small-compressible --records 10000 --writers 1 --snapshot-frequency 1000 --warmups 1 --repetitions 5`: exit 0 at source `ce1fe2769ccbff78df8092905f1b81ccb7d4ca7e`; five JSON summaries retained below.
- Same command with `--backend file`: exit 0 at source `ce1fe2769ccbff78df8092905f1b81ccb7d4ca7e`; five JSON summaries retained below.
- Post-validation and post-measurement `git diff --exit-code HEAD -- rust-service/Cargo.toml rust-service/Cargo.lock`: exit 0. No result dump or key was added to the worktree.
- Wave 3 consumed prerequisite tip `f7f99e31f6666c799c3feb8965a82e14c010d846`: assembled service `b6bf5a0cc0b`, repair `28b5e4c0598`, encryption `04d7a6427c6`, dictionary compression `08083272f75` plus bound fix `52733953493`, WebTransport `b77fcbbe4a2`, and native lifecycle `f7f99e31f66`.
- Final `CARGO_NET_OFFLINE=true bash rust-service/scripts/validate-benchmarks.sh`: exact assigned worktree and branch at `ff9556832630d9ed8f5ffc5d97c528559d14cf6f`; rustfmt passed; 3 library tests passed; binary target passed with 0 tests; strict Clippy passed with `-D warnings`; expanded smoke passed for memory/file and all seven Wave 3 adapters.
- Final `CARGO_NET_OFFLINE=true bash rust-service/scripts/measure-wave3-benchmarks.sh`: exit 0 at source `cea3ac17adda6fedefb19873a6947150870c0cb7`; 26 cell markers, 130 valid schema-v2 JSON results, 26 distinct groups, exactly five repetitions per group.
- Final post-measurement root `rust-service/Cargo.toml` and `rust-service/Cargo.lock` diff: empty. Results remained in `/tmp/ff-wave3-results-complete.jsonl` and were not committed.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Validation routing failure | Two delegated validation summaries reported zero tests or tests from sibling iteration worktrees despite an absolute requested path. A shared terminal also displayed the encryption worktree branch and malformed in-progress manifest instead of the benchmark command. | The accepted capture must begin with this report's exact worktree, branch, and HEAD. No sibling output is used as evidence. | Several attempted checks and one pre-fix measurement were rejected; no sibling files were edited by this workstream. | Added self-locating scripts that print checkout identity and validate only an exact disposable copy. Final validation uses a dedicated terminal session. | In concurrent multi-worktree sessions, make the executable script establish identity and paths; reject summaries whose output lacks those markers. |
| Schema/workload correction | The initial harness recorded `snapshot_frequency=1000` but published only one final snapshot. | Source review after the first memory procedure run showed the mismatch. | The first five memory repetitions are superseded and excluded from final evidence. | Changed the single-writer snapshot path to publish at every configured interval with parent chaining; concurrency smoke is a separate no-snapshot workload. | Validate recorded workload metadata against the actual control flow before retaining performance output. |
| Canonical-read assumption falsified | The first assembled-service matrix attempt expected 200 submitted payloads but read 201 canonical records; a 10-submission no-snapshot probe read 11. | The reviewed service report states that no projected historical-operation API exists. | Two partial 23-cell/110-result and 26-cell/125-result runs were rejected. | Schema v2 reports `finite_read_records`; service correctness verifies acknowledgements, finite bounded reads, snapshots, and reconnect without claiming payload projection. | Benchmark the public semantic surface actually exposed; do not copy a private decoder into the benchmark. |
| Protocol-invalid matrix cell | Native WebTransport rejected the empty-payload cell with `ProtocolError::EmptyField`. | The first protocol-valid attempt completed 25 cells and failed before the final cell emitted results. | All 125 results were rejected as an incomplete matrix. | Omitted native-WebTransport empty payload with the exact protocol reason and replaced it with an empty buffered-file recovery cell. | A shared fixture is not equivalent when one transport contract rejects it; record the omission instead of substituting data. |

## Contract and Integration Friction

The generic traits are sufficient for exact payload, snapshot, wrapper-reopen, persisted-size, and bounded local transport workloads. Native service and WebTransport require protocol-specific adapters. Local transport bytes count payload/token bytes across a typed boundary; native WebTransport bytes count complete encoded FSP4 frames. Neither includes QUIC/TLS/IP overhead, and they are not byte-equivalent. `FileStream` remains buffered without `sync`; it is not equivalent to the durable service. Service historical reads are canonical sequencer records, not projected operations. Browser `WebTransport` exposes neither packet bytes nor internal queue depth. The benchmark crate remains absent from root membership; exact-copy scripts temporarily register it and leave the root lockfile unchanged.

## Human Interventions

The coordinator supplied the actual branch/worktree/kickoff, the reviewed prerequisite tip, and the requirement to consume browser evidence without fabricating packet metrics. No additional semantic intervention was required.

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

### Wave 3 Integrated Matrix

Procedure: release profile, default features, seed `5573589319906701683`, one warmup and five measured repetitions per cell. Small wrapper cells use 2,000 64-byte records and snapshots every 500; large cells use 32 65,536-byte records and snapshots every 8; bounded concurrency uses 5,000 records and four writers; service cells use 200 records and snapshots every 50. Environment matches Wave 1 except source `cea3ac17adda6fedefb19873a6947150870c0cb7`. CPU is process CPU from Linux clock ticks with 10 ms resolution, so zero and 10 ms values are coarse. Peak RSS is process high-water memory, not incremental allocation.

`records/writers/snapshots` identifies each workload. Throughput is median records/s with cross-run sample CV. Append is the median of each run's p95 microseconds. Remaining durations are cross-run medians. `wire/queue/active` is public instrumentation and remains `n/a` when unavailable.

| Implementation | Fixture / records / writers / snapshots | Throughput median (CV) | Append p95 us | Read us / records | Recovery us | Reconnect us | CPU us | Persisted bytes (x logical) | Wire / queue / active |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| file-simple | small-compressible / 2000 / 1 / 500 | 547145.17 (0.50%) | 1.643 | 94.817 / 2000 | 210.714 | n/a | 0 | 144176 (1.1264x) | n/a / n/a / n/a |
| file-compression | small-compressible / 2000 / 1 / 500 | 15623.51 (31.91%) | 76.583 | 11250.924 / 2000 | 11920.404 | n/a | 150000 | 84383 (0.6592x) | n/a / n/a / n/a |
| file-stateful-compression | small-compressible / 2000 / 1 / 500 | 161806.60 (0.52%) | 6.141 | 4115.586 / 2000 | 4680.642 | n/a | 20000 | 104296 (0.8148x) | n/a / n/a / n/a |
| file-encryption | small-compressible / 2000 / 1 / 500 | 256862.33 (0.07%) | 4.749 | 1693.853 / 2000 | 2295.397 | n/a | 10000 | 246380 (1.9248x) | n/a / n/a / n/a |
| file-stateful-compression-encryption | small-compressible / 2000 / 1 / 500 | 122456.47 (0.12%) | 8.175 | 5579.470 / 2000 | 6265.081 | n/a | 30000 | 206500 (1.6133x) | n/a / n/a / n/a |
| file-simple | small-incompressible / 2000 / 1 / 500 | 557018.35 (1.08%) | 1.643 | 94.977 / 2000 | 216.735 | n/a | 10000 | 144176 (1.1264x) | n/a / n/a / n/a |
| file-compression | small-incompressible / 2000 / 1 / 500 | 66023.63 (0.65%) | 16.321 | 5084.757 / 2000 | 5574.772 | n/a | 40000 | 166196 (1.2984x) | n/a / n/a / n/a |
| file-stateful-compression | small-incompressible / 2000 / 1 / 500 | 168170.08 (0.49%) | 6.432 | 3988.650 / 2000 | 4455.902 | n/a | 20000 | 204296 (1.5961x) | n/a / n/a / n/a |
| file-encryption | small-incompressible / 2000 / 1 / 500 | 264539.73 (0.74%) | 3.697 | 1624.034 / 2000 | 2093.260 | n/a | 10000 | 246380 (1.9248x) | n/a / n/a / n/a |
| file-stateful-compression-encryption | small-incompressible / 2000 / 1 / 500 | 125905.99 (0.37%) | 10.159 | 5437.876 / 2000 | 5950.423 | n/a | 30000 | 306500 (2.3945x) | n/a / n/a / n/a |
| file-simple | large-compressible / 32 / 1 / 8 | 7215.65 (0.44%) | 65.843 | 3.326 / 32 | 284.492 | n/a | 10000 | 2097584 (1.0002x) | n/a / n/a / n/a |
| file-compression | large-compressible / 32 / 1 / 8 | 3452.47 (0.36%) | 210.824 | 2873.006 / 32 | 11291.369 | n/a | 30000 | 4639 (0.0022x) | n/a / n/a / n/a |
| file-stateful-compression | large-compressible / 32 / 1 / 8 | 9096.26 (0.63%) | 24.276 | 1108.821 / 32 | 9444.259 | n/a | 20000 | 2056 (0.0010x) | n/a / n/a / n/a |
| file-encryption | large-compressible / 32 / 1 / 8 | 4362.17 (6.95%) | 154.749 | 2676.980 / 32 | 11929.531 | n/a | 30000 | 2099420 (1.0011x) | n/a / n/a / n/a |
| file-stateful-compression-encryption | large-compressible / 32 / 1 / 8 | 8898.17 (0.65%) | 23.685 | 1146.932 / 32 | 9486.468 | n/a | 20000 | 3892 (0.0019x) | n/a / n/a / n/a |
| file-simple | large-incompressible / 32 / 1 / 8 | 12554.13 (1.06%) | 49.522 | 3.106 / 32 | 264.584 | n/a | 10000 | 2097584 (1.0002x) | n/a / n/a / n/a |
| file-compression | large-incompressible / 32 / 1 / 8 | 642.03 (0.67%) | 1556.396 | 1240.688 / 32 | 8545.671 | n/a | 70000 | 2098272 (1.0005x) | n/a / n/a / n/a |
| file-stateful-compression | large-incompressible / 32 / 1 / 8 | 6871.13 (15.17%) | 125.485 | 1055.491 / 32 | 8513.450 | n/a | 20000 | 2098696 (1.0007x) | n/a / n/a / n/a |
| file-encryption | large-incompressible / 32 / 1 / 8 | 5800.01 (10.20%) | 151.453 | 2694.783 / 32 | 10181.506 | n/a | 20000 | 2099420 (1.0011x) | n/a / n/a / n/a |
| file-stateful-compression-encryption | large-incompressible / 32 / 1 / 8 | 4175.67 (2.16%) | 238.034 | 2834.985 / 32 | 10391.428 | n/a | 30000 | 2100532 (1.0016x) | n/a / n/a / n/a |
| memory | small-incompressible / 5000 / 4 / 0 | 1699405.14 (2.92%) | 6.327 | 365.593 / 5000 | n/a | n/a | 10000 | n/a | n/a / n/a / n/a |
| network-memory | small-incompressible / 5000 / 4 / 0 | 1078565.05 (2.08%) | 9.889 | 31770.167 / 5000 | n/a | n/a | 50000 | n/a | 640000 / 4 / n/a |
| native-service | small-compressible / 200 / 1 / 50 | 1568.26 (1.03%) | 1114.191 | 52.448 / 201 | 1117.658 | 1151.491 | 80000 | 40029 (3.1273x) | n/a / n/a / n/a |
| native-webtransport | small-compressible / 200 / 1 / 50 | 37.39 (1.12%) | 27452.935 | 52140.022 / 201 | n/a | 27607.909 | 230000 | 40029 (3.1273x) | 91098 / n/a / 1 |
| native-service | empty / 32 / 1 / 8 | 2496.89 (5.40%) | 396.792 | 9.989 / 33 | 303.166 | 340.065 | 0 | 4617 | n/a / n/a / n/a |
| file-simple | empty / 32 / 1 / 8 | 519522.69 (2.52%) | 1.864 | 1.844 / 32 | 39.684 | n/a | 0 | 432 | n/a / n/a / n/a |

Direct-service small-compressible raw throughput/reconnect pairs were `1563.97/1137.133`, `1572.42/1139.748`, `1568.26/1165.637`, `1597.42/1190.233`, and `1553.91/1151.491` (records/s and microseconds). Native-WebTransport pairs were `37.46/28274.589`, `37.39/27502.326`, `37.28/30189.746`, `38.08/27607.909`, and `36.93/3559.023`. WebTransport FSP4 bytes were exactly 91,098 and peak active streams exactly 1 in every run.

Selected cross-run summaries `(minimum / median / maximum; sample SD; CV)`: direct-service throughput `1553.910 / 1568.259 / 1597.416; 16.191; 1.03%`, read us `52.037 / 52.448 / 53.059; 0.482; 0.92%`, reconnect us `1137.133 / 1151.491 / 1190.233; 21.804; 1.88%`; native-WebTransport throughput `36.932 / 37.389 / 38.082; 0.418; 1.12%`, read us `25867.373 / 52140.022 / 53081.040; 11874.981; 25.21%`, reconnect us `3559.023 / 27607.909 / 30189.746; 11158.614; 47.63%`; local-network throughput `1062947.089 / 1078565.051 / 1120487.349; 22533.622; 2.08%`, read us `27591.934 / 31770.167 / 32688.926; 2043.324; 6.57%`.

Browser evidence from the reviewed WebTransport workstream used Chromium 152 on Linux and passed create/open, two submissions, finite reads, snapshot publish/latest, malformed resume token, explicit disconnect/reconnect, and opaque-token resume. Browser `WebTransport` exposes no HTTP/3, QUIC, UDP, TLS byte totals or internal queue depth; no browser packet, queue, throughput, CPU, or memory value is claimed. Native counters are encoded FSP4 bytes, not packet bytes.

## Proposed Decisions

No shared decision is proposed. Phase 3 should treat projected historical service reads as a future API question rather than decode canonical sequencer records inside clients or benchmarks.

## Candidate Skills and Process Changes

Candidate coordination procedure: workstream-owned validation and measurement scripts should print absolute checkout identity, use one disposable exact copy with an isolated target, and verify restricted root files afterward. Reject delegated summaries when identity or final exit status is absent. For long matrices, retain output outside the repository and validate expected cell/result counts before summarizing.

## Remaining Work and Risks

- Complete for assigned Wave 3 scope: implementation, exact-copy validation, 26-cell/130-result matrix, public transport counters, wrapper reopen/size/CPU observations, service lifecycle/reconnect, native WebTransport, report, and clean restricted root files.
- Intentionally omitted: native-WebTransport empty submissions because FSP4 rejects empty required payloads; browser packet and queue values because browser APIs do not expose them; cold-disk recovery because dropping host caches requires privileged environmental control; process-isolated Unix transport because Wave 3 prioritized the assembled native service and native WebTransport path.
- Browser throughput/latency was not rerun in this benchmark worktree. Existing Chromium correctness evidence is consumed only as correctness evidence, not as a performance measurement.
- CPU observations below 10 ms are quantized and sometimes zero; startup and several WebTransport/large-wrapper distributions remain too variable for rankings. Run longer isolated workloads and packet capture in a controlled host before capacity or network-overhead conclusions.
- Results compare only rows with equivalent active guarantees. Buffered file, encrypted/compressed wrappers, direct durable service, typed local transport, and HTTP/3 WebTransport are not a single leaderboard.
