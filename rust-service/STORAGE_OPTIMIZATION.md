# Storage Optimization Evidence

## Focused Overhead Pass on the Merged Baseline

This section supersedes the older comparisons below for the focused performance pass.
The starting checkout was clean at `32ee6e92c87b82c23948d23d52db4c94670743c3` on `rust-service-storage-optimization`.
That merge includes storage checkpoint `47159ea46be` and session-sequence checkpoint `7753aba04ac`; the earlier unresolved-merge status below is historical.
No other worktree, branch, commit, public API, storage format, dependency, or lockfile was changed by this pass.

### Hypothesis and Kept Change

An idle append that completes in its first poll does not need a completion channel, shared driver, or batch vectors.
The pipeline now prepares and polls that append while holding lifecycle admission and runtime state locks.
The empty charged queue is checked under those same locks, so a lifecycle writer or another admission cannot cross the check and dispatch.
A ready result is applied to runtime metadata before its receipt returns; the session guard revokes authority on rejection or cancellation.
A pending append retains the exact polled future in the existing shared driver, charges one entry and its input bytes, and releases both admission locks before waiting.
The existing driver-slot identity check prevents an old completed driver from clearing a newer pending driver.
Queued submissions still use the bounded batching path, frozen reference floor, and accepted-prefix failure handling.
The completion loop also uses stack pinning instead of allocating two boxes per selection.
One boxed backend future remains on the ready path; this is not an allocation-free implementation or an RSS measurement.

Only one production candidate was tested and retained, in `sea-sequencer/src/pipeline.rs`.
The new `idle_ready_submissions_apply_before_receipts_and_rejection_ends_authority` regression verifies first-poll completion, distinct receipts for equal inputs, applied metadata, released charges, and no accepted suffix after immediate rejection.
The existing deterministic gated tests cover pending-future retention before/after commit, cancellation, bounded admission, same-session capacity ordering, grouped ambiguity, batching, and terminal leave ordering.
All 35 sequencer tests passed.
The ordinary cooperative storage benchmark regression also passed; the benchmark source is unchanged and contains no whole-submission `unconstrained` wrapper.
No public behavioral contract changed, so no API report or changeset is needed.

### Collection and Provenance

The exact clean HEAD was built with `cargo build --manifest-path rust-service/Cargo.toml -p sea-benchmarks --bin storage-pipeline --release --locked` before any production edit.
Its executable was copied to the owned temporary path `/tmp/sea-storage-overhead-N5913w/baseline` and retained for alternating comparisons.
The candidate was rebuilt at `rust-service/target/release/storage-pipeline` with the same command and toolchain.
The dataset was `rust-service/target/storage-overhead-data`, created fresh and removed by each successful invocation.
No dataset remains after collection.

Raw structured evidence is retained in [storage-overhead](measurements/2026-09-20/storage-overhead/baseline.json):

- [baseline.json](measurements/2026-09-20/storage-overhead/baseline.json): 36 exact-HEAD cells collected before production edits, three rounds with reversed cell order in round two.
- [candidate.json](measurements/2026-09-20/storage-overhead/candidate.json): 72 alternating baseline/candidate cells, three samples per version for every backend/payload/window combination.
  Version order is baseline/candidate, candidate/baseline, baseline/candidate by round; the middle round also reverses the cell order.
- [durable-repeat.json](measurements/2026-09-20/storage-overhead/durable-repeat.json): seven additional alternating pairs for the suspicious durable 8192-byte/window-128 cell, with no source changes.
- [summary.json](measurements/2026-09-20/storage-overhead/summary.json): per-cell sample counts, medians, minima, and maxima for throughput, elapsed time, and p50/p99 submit latency.
- [validation.json](measurements/2026-09-20/storage-overhead/validation.json): exact validation commands, cwd, environment overrides, timestamps, exit status, and temporary log paths/hashes.

Every collection file embeds its collector source, exact invocation arguments, UTC timestamps, source SHA-256 values, baseline/candidate executable hashes, kernel, Rust toolchain, and relevant environment variables.
Reproduction uses the embedded collector with its recorded paths and fresh output names; its clean-checkout baseline mode must run before editing production sources.
The source hashes cover the benchmark, pipeline, session runtime, fault tests, and Cargo lockfile.
The baseline executable hash must match between all three collections.
Each cell uses the unchanged 128-operation warmup followed by 4096 measured operations, verifies every receipt and ordered replay, and records both phase rows.
All 122 measured cells and 122 warmups passed their delivery/order checks without timeout.
The dataset, payload, receipt, latency, and physical-durability limitations described below still apply, except that these new runs use the integrated session-local sequence rules and ordinary cooperative submissions.
Shared-host contention, filesystem caches, CPU migration, and storage integrity were not controlled or qualified.

### Head-to-Head Results

These are the three-pair comparison medians, not ratios against the obsolete pre-storage identities.
Throughput is operations/second; brackets give the full three-sample min/max range, rounded to whole operations.
Latency columns give median p50/p99 microseconds across processes, baseline then candidate; these are not pooled percentiles.

| Backend | Bytes | Window | Baseline ops/s [range] | Candidate ops/s [range] | Change | Baseline p50/p99 us | Candidate p50/p99 us |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| memory | 64 | 1 | 207092 [204941, 209101] | 325755 [323237, 326871] | +57.3% | 4.54 / 9.04 | 2.81 / 6.63 |
| memory | 64 | 128 | 240799 [238616, 240951] | 297947 [294338, 301344] | +23.7% | 549.71 / 596.79 | 445.21 / 490.72 |
| memory | 8192 | 1 | 95155 [92333, 96310] | 119151 [118795, 120461] | +25.2% | 9.52 / 24.27 | 7.55 / 17.22 |
| memory | 8192 | 128 | 100332 [99012, 100582] | 108779 [106861, 108875] | +8.4% | 1284.12 / 1391.66 | 1180.14 / 1309.22 |
| buffered-file | 64 | 1 | 28276 [27745, 28806] | 28629 [27881, 29074] | +1.3% | 33.48 / 57.94 | 33.02 / 56.73 |
| buffered-file | 64 | 128 | 336439 [332077, 336554] | 342645 [340853, 346579] | +1.8% | 340.86 / 526.01 | 321.87 / 570.95 |
| buffered-file | 8192 | 1 | 17022 [14208, 17259] | 17438 [17138, 18005] | +2.4% | 56.00 / 84.44 | 54.78 / 82.85 |
| buffered-file | 8192 | 128 | 56262 [56255, 58254] | 54408 [54286, 56101] | -3.3% | 2097.74 / 2446.27 | 2219.46 / 2617.90 |
| durable-file | 64 | 1 | 1272 [1251, 1312] | 1302 [1288, 1304] | +2.4% | 796.50 / 1396.92 | 796.39 / 1311.19 |
| durable-file | 64 | 128 | 41362 [40182, 42664] | 41861 [41026, 44123] | +1.2% | 3050.18 / 3452.74 | 2900.05 / 3437.37 |
| durable-file | 8192 | 1 | 789 [700, 925] | 923 [751, 935] | +17.0% | 1135.31 / 1613.28 | 1029.99 / 1556.61 |
| durable-file | 8192 | 128 | 6846 [6819, 6985] | 4346 [3796, 7149] | -36.5% | 17414.70 / 28219.60 | 28968.33 / 31940.39 |

Memory gains are consistent across all three samples in each cell, with nonoverlapping throughput ranges.
The memory 64-byte/window-1 median submit phase fell from 19.779 ms to 12.574 ms; 8192-byte/window-1 fell from 43.046 ms to 34.377 ms.
These short microbenchmarks do not establish sustained capacity or allocator-memory reductions.
Buffered sequential gains are small and overlap baseline variation; the earlier singleton regression is not solved.
Buffered 8192-byte/window-128 throughput and some buffered p99 values worsened in this matrix; this is not an across-the-board speedup.

The durable 8192-byte/window-128 regression prompted the bounded seven-pair repeat.
That repeat gave baseline median 7200 [6861, 7322] ops/s and candidate 7304 [3711, 7307] ops/s (+1.5%), with median p50/p99 16916.58/31264.86 us versus 16822.25/31017.87 us.
Six candidate repeats were near 7241-7307 ops/s, but one was again slow; candidate tail variation remains unresolved and must not be erased by the favorable repeat median.
The initial three-pair regression remains in the table and raw evidence.
No stable durable speedup is claimed, and neither these runs nor the existing sync-count regressions qualify physical power-loss behavior.

### Buffered Residual and Scope Limit

`FileEvents::append` still wraps a singleton in `append_batch`, which hands work to Tokio's blocking pool.
The retained worker owns the opening, serializes journal writes, and publishes only after the required sync; no event file I/O moved onto async workers.
This handoff is consistent with the measured singleton overhead, but no isolated scheduler/syscall profile attributes an exact fraction of that cost.
A permanent writer thread per document is unacceptable because document count would create an unbounded thread count.
A shared bounded dedicated pool could avoid some handoffs, but would add queue admission, document fairness, shutdown/drain, panic poisoning, and cancellation-ownership contracts.
That is disproportionate to this focused pass and was not implemented.
File code is unchanged; pipelined batching, backpressure, and durability tests remain the relevant safeguards.

### Validation and Handoff

Workspace formatting, strict all-target/all-feature Clippy, warning-free rustdoc, all-target build, strict WASM library Clippy, documentation links, and scoped pnpm policy passed.
The first workspace test run failed the unchanged `native_client_round_trip_in_every_storage_mode` with `Transport(Timeout)`.
Its isolated rerun passed in 0.43 seconds without a code change, and the full native retry passed.
The failed invocation remains recorded in `validation.json` and its original temporary log.
The initial candidate also exceeded Clippy's function-line limit; extracting the completion loop repaired it, and strict checks and all sequencer regressions passed afterward.
Root `pnpm build:fast` passed in 80.011 seconds after formatting the evidence with the repository's Biome formatter.
The complete `./test.sh` passed, including the native workspace, generated WASM/Node, integration smoke/comparator, and Chromium transport/lifecycle scenarios.
No non-Rust test changes or exclusions were needed.

The final source changes are the pipeline and its focused fault test; this report and the five JSON evidence files retain the result.
Nothing is staged or committed by this pass.
Temporary baseline binary, collectors, and validation logs remain under the exclusively owned `/tmp/sea-storage-overhead-N5913w` directory for parent review.
That exact directory is safe to remove after review; no other temporary directory or worktree should be cleaned as part of this pass.

## Scope and Result

Native local `SeaAuthorSession::submit` measurements compare the existing copy-journal HEAD with the uncommitted storage ring, in-place journal, and batched-sync implementation.
No network, remote client, presentation harness, compression, encryption, or snapshot workload is involved.
This is focused evidence, not an iteration or a production capacity claim.

Optimized pipelining versus optimized sequential submission improved median durable-file throughput by 28.0 times for 64-byte payloads and 7.6 times for 8192-byte payloads.
The optimized 64-byte durable sequential cell also improved over the one completed baseline sequential cell, but that comparison combines journal replacement removal and other implementation changes; it does not isolate batching.
Memory throughput regressed versus HEAD, and sequential buffered-file throughput also regressed.
Do not describe the change as an across-the-board speedup.

The 8192-byte baseline durable sequential invocation exceeded its 180-second process timeout.
It is censored, not a completed throughput sample, and no speedup ratio is inferred from it.
Further baseline durable repetitions and its large-payload pipelined cell were skipped to keep execution bounded.

## Revisions and Environment

- Worktree and branch: `/workspaces/rust-service-storage-optimization`, `rust-service-storage-optimization`.
- Baseline HEAD: `354fc17264f157897ef4ff674569de2af51adf44`.
- Baseline extracted with `git archive HEAD rust-service`, not a new branch or worktree.
  Only the exact new benchmark source was copied into that archive.
  HEAD's durable journal copies the published prefix to staging, synchronizes it, renames it, and synchronizes the parent directory for each append.
- Optimized: same HEAD plus the existing uncommitted production edits in `sea-core`, `sea-memory`, `sea-file`, and `sea-sequencer`.
  These edits were not made by this benchmark task.
- UTC measurement interval: 2026-09-20 09:17:12 through 09:24:06, including the timed-out invocation and restart.
- Debian 13 dev container; Linux `6.8.0-1064-azure`, x86_64; AMD EPYC 7763 64-Core Processor; 32 visible logical CPUs, 16 visible cores, two threads/core.
- Cgroup `cpu.max`: `max 100000`; no explicit CPU affinity; one Tokio current-thread async worker per process, additional blocking I/O workers permitted.
- Dataset path: `/workspaces/rust-service-storage-optimization/rust-service/target/storage-evidence-20260920/data/{warmup,measured}`.
- Filesystem: `/dev/loop4[/codespacemount/workspace]`, ext4, `rw,nodev,relatime`.
  This development host is **not qualified for storage-integrity or power-loss guarantees**.
  Host/device cache behavior and truthful physical persistence were not established.
- `rustc 1.98.1 (48a229cea 2026-09-01)`; `cargo 1.98.1 (797e8a9bc 2026-08-05)`; Cargo release profile, `--locked`.
  No `RUST*`, `CARGO*`, or `TOKIO*` environment overrides were present during measurements, except the explicit baseline build target directory.
- Shared-host contention, page cache, CPU migration, and run order were not controlled.
  No process CPU-time or isolated disk-bandwidth measurement was collected.

SHA-256 provenance at measurement time:

| Artifact | SHA-256 |
| --- | --- |
| Benchmark source, identical in both builds | `3d4fe2edfcf6fc94c5f8204256275ac2698ac8abea8d02fc38afb5fcdfd684a5` |
| Cargo.lock, unchanged from HEAD | `5cdd9609daca107174264a073f175c6d01b2785d3f8e91752c6937c58afd363c` |
| Optimized pipeline.rs, untracked at measurement | `4d39072d00a0b1c3fac5bbf557dbd208f4269bc0486214f25122b217b19394b3` |
| Optimized executable | `d2774f0fb261c871ba4f4859c35cafb3d2682c6aa09143aaddf6a611aedf4b74` |
| Baseline executable | `bf2aa7343a6d2a6fa0172bdd266e48fbdc17162bfb8338602bf276c3847d2628` |
| Tracked production diff, command below | `934eed263888735508d8f01fbc417a9ead98d2a2ef8591481b5b080e274da937` |

The final source differs from measurement-time source: a later sequencer admission fix allowed removal of the benchmark's whole-submission `unconstrained` wrapper.
The source, executable, and production-diff hashes above describe measurement-time artifacts, not the final repaired sources or their builds.
Performance measurements were not rerun after this correction; the retained data still measures the workaround-enabled version.
The tracked diff hash excludes the untracked pipeline source, whose hash is recorded separately.

```bash
git diff HEAD -- rust-service/crates/sea-core/src/storage rust-service/crates/sea-file rust-service/crates/sea-memory rust-service/crates/sea-sequencer | sha256sum
```

## Dataset and Verification

Every process runs a separate 128-operation warmup document, deletes it, then measures a fresh 4096-operation document.
Payloads are exactly 64 or 8192 bytes: a big-endian operation ordinal followed by `0x5a` bytes.
There are no blobs, membership announcements, snapshots, retries, or reference advancement; submission references are `None`.
One session uses `buffered(1)` or `buffered(128)` with initially ordered polling.
During measurement, each submit future used `tokio::task::unconstrained` because the first ordinary-buffered test exposed cooperative-budget yields ahead of membership admission, causing reordered receipts.
The later focused regression deliberately exhausted the cooperative budget before the first submission in `buffered(128)`.
It failed before the fix with receipt positions 128 then 127, and passed after constraining the exemption to `tokio::task::unconstrained(self.admission.lock()).await` in `LocalSession::submit`.
The benchmark wrapper was removed only after that regression passed.
The benchmark's existing 257-operation regression then passed without the wrapper for windows 1 and 128 and payload sizes 64 and 8192.
This confirms actual sequential first-poll order, not construction order, arbitrary spawned-task order, or executor fairness.

Submission wall time includes payload construction, receipt collection, and ordering checks, but excludes document creation, session opening, finite replay, close, and shutdown.
Latency starts at a submission future's first poll and ends when `submit` returns; it excludes time waiting outside the bounded window.
Replay checks every application event's author, session, operation ID, payload, and exact receipt position, plus total count and strictly increasing receipts.
All 62 completed measured cells verified 4096 deliveries; their 62 separate warmups each verified 128 deliveries.
No success is recorded for the timed-out cell.

Largest completed journal size after shutdown was 34,037,768 bytes (about 32.5 MiB).
Only one document is active at a time; baseline durable staging can temporarily duplicate its journal, remaining below 256 MiB for this dataset.
The timeout left about 24 MiB of partial data, explicitly removed before continuing.
No dataset or spawned process was retained after collection.

## Retained Measurements

Each entry lists raw ops/s for repetitions 1, 2, and 3, rounded to one decimal.
The 64-byte baseline durable rows have only one completed sample.
All rows have exactly 4096 measured operations, so elapsed seconds are `4096 / ops_per_second` (subject to displayed rounding).
Version order was baseline then optimized in repetitions 1 and 3, reversed in repetition 2; cells ran serially.
After the timeout, already completed cells were skipped and all remaining baseline durable cells were omitted.

| Backend | Bytes | Version | Window | Operations/second, raw repetitions |
| --- | ---: | --- | ---: | --- |
| memory | 64 | baseline | 1 | 228843.3, 230875.9, 230670.2 |
| memory | 64 | baseline | 128 | 226647.6, 230880.6, 232501.9 |
| memory | 64 | optimized | 1 | 148402.0, 151415.2, 152497.3 |
| memory | 64 | optimized | 128 | 161341.8, 163698.3, 164945.0 |
| memory | 8192 | baseline | 1 | 73112.6, 73051.0, 74237.6 |
| memory | 8192 | baseline | 128 | 68723.1, 71806.1, 73325.9 |
| memory | 8192 | optimized | 1 | 56855.9, 62927.9, 63672.5 |
| memory | 8192 | optimized | 128 | 59311.0, 64003.7, 66317.8 |
| buffered-file | 64 | baseline | 1 | 102068.8, 97967.2, 101230.1 |
| buffered-file | 64 | baseline | 128 | 96907.0, 94769.6, 94650.4 |
| buffered-file | 64 | optimized | 1 | 25384.7, 20578.1, 27712.2 |
| buffered-file | 64 | optimized | 128 | 165587.6, 264646.0, 266254.2 |
| buffered-file | 8192 | baseline | 1 | 24773.2, 26482.2, 29001.9 |
| buffered-file | 8192 | baseline | 128 | 27515.8, 27507.4, 28922.5 |
| buffered-file | 8192 | optimized | 1 | 15252.1, 15425.5, 16065.0 |
| buffered-file | 8192 | optimized | 128 | 46172.1, 47303.4, 46747.3 |
| durable-file | 64 | baseline | 1 | 37.2 |
| durable-file | 64 | baseline | 128 | 80.1 |
| durable-file | 64 | optimized | 1 | 1346.6, 1440.3, 1343.9 |
| durable-file | 64 | optimized | 128 | 12103.9, 37706.7, 38382.8 |
| durable-file | 8192 | optimized | 1 | 787.6, 776.5, 893.9 |
| durable-file | 8192 | optimized | 128 | 4661.7, 6012.4, 7404.8 |

Durable baseline 64-byte submission phases took 110.240091 seconds sequentially and 51.146401 seconds with window 128.
These are single observations under variable host conditions, not evidence that the synchronous baseline groups fsync.
Optimized durable 64-byte pipelined times were 0.338402, 0.108628, and 0.106714 seconds.
Optimized durable 8192-byte pipelined times were 0.878653, 0.681255, and 0.553157 seconds.
The durations and fixed dataset allow many batches rather than measuring only one batch.
Short memory and buffered-file cells are overhead-sensitive, not sustained saturation tests.

Pipelining trades per-operation waiting for throughput: optimized durable p99 submit latency was 18,501/4,016/3,897 microseconds for 64 bytes and 34,958/41,059/19,457 microseconds for 8192 bytes.
Corresponding sequential p99 values were 1,217/1,290/1,398 and 1,920/1,832/1,607 microseconds.
The benchmark does not directly count syscalls or infer a fixed batch size from throughput.

## Fsync and Acknowledgment Evidence

Existing focused production tests were rerun without editing their implementation:

- `journal::tests::durable_batch_syncs_once_and_empty_batch_does_not_sync`: three records share exactly one counted journal sync, empty batch adds none, reopening recovers all three.
- `storage::tests::event_batch_publishes_dense_history_with_one_sync`: two events receive dense positions and share exactly one sync, empty batch adds none, readers and reopening see the committed prefix.
- `storage::tests::uncertain_batch_reports_every_entry_without_publishing_to_readers`: before-write, partial-write, before-sync, and after-sync faults do not falsely publish successful results to readers; ambiguous entries remain errors.
- `session::fault_tests::delayed_persistence_admits_a_bounded_ring_and_publishes_only_after_commit`: admitted submissions remain pending behind gated persistence, no early reader visibility, all settle only after release; batching occurs.
- The file `batch` filter also covers blocked-worker executor admission and cancellation-retained opening ownership.

Together these are localized evidence for amortized synchronization and commit-gated publication/receipts.
Successful benchmark replay alone is not evidence of no early acknowledgment under faults.
These tests do not qualify this host's ext4/device stack against physical power loss.

## Reproduction and Validation

From the worktree root, assert cwd, branch, and HEAD before commands:

The commands below record the original collection procedure.
Copying the final benchmark source now uses ordinary cooperative submissions and does not reproduce the recorded measurement-source hash or scheduling workaround.

```bash
cd /workspaces/rust-service-storage-optimization
[[ "$PWD" == /workspaces/rust-service-storage-optimization && "$(git branch --show-current)" == rust-service-storage-optimization && "$(git rev-parse HEAD)" == 354fc17264f157897ef4ff674569de2af51adf44 ]] || exit 1
cargo build --manifest-path rust-service/Cargo.toml -p sea-benchmarks --bin storage-pipeline --release --locked
mkdir rust-service/target/storage-evidence-20260920
git archive HEAD rust-service | tar -x -C rust-service/target/storage-evidence-20260920
cp rust-service/crates/sea-benchmarks/src/bin/storage-pipeline.rs rust-service/target/storage-evidence-20260920/rust-service/crates/sea-benchmarks/src/bin/storage-pipeline.rs
CARGO_TARGET_DIR="$PWD/rust-service/target/storage-evidence-20260920/baseline-target" cargo build --manifest-path rust-service/target/storage-evidence-20260920/rust-service/Cargo.toml -p sea-benchmarks --bin storage-pipeline --release --locked
```

The collection command used Node `spawnSync(binary, [backend, String(bytes), String(window), directory], { encoding: "utf8", timeout: 180000 })` for each cell.
It retained both stdout JSON rows with `version`, `repetition`, and UTC `started` metadata, and rejected any nonzero status.
Exact per-cell executable arguments can also be run with a shell timeout:

```bash
timeout 180s rust-service/target/release/storage-pipeline durable-file 64 128 rust-service/target/storage-evidence-20260920/data
timeout 180s rust-service/target/storage-evidence-20260920/baseline-target/release/storage-pipeline durable-file 64 128 rust-service/target/storage-evidence-20260920/data
```

To reproduce the matrix, loop repetitions `1 2 3`, backends `memory buffered-file durable-file`, bytes `64 8192`, windows `1 128`, then versions in the order stated above.
The first collection stopped at the timed-out baseline durable 8192/window-1 cell.
The resumed collection skipped completed cells and every remaining baseline durable cell.
Do not rerun timed-out workloads without a cap; remove only the owned partial `data` directory after a timeout.
Full compact JSON was inspected for 124 successful phase rows; the table above retains all completed measured throughput samples.
Disposable archive, baseline target, and raw collection file were removed after transcription; no historical measurements were changed.

Focused checks passed: source formatting, strict Clippy for all benchmark targets, all 16 benchmark tests, five file batch tests, and the delayed-persistence sequencer test.
The initial type-check failure was a benchmark-only identity-error formatting mismatch, repaired using the existing constant-identity pattern.
The initial ordered-poll test failure and its temporary scheduling workaround are described above.
The later admission repair passed all 34 sequencer tests, the no-workaround benchmark regression, scoped formatting, strict native sequencer and benchmark Clippy, and strict `wasm32-unknown-unknown` sequencer library Clippy.
An initial WASM check showed that Tokio's sync-only feature set does not expose `task::unconstrained`; the final fix uses the exemption only on native builds and retains ordinary mutex acquisition on WASM without changing dependencies.
Workspace-wide gates remain the parent task's responsibility.

```bash
rustfmt --edition 2024 --check rust-service/crates/sea-benchmarks/src/bin/storage-pipeline.rs
cargo clippy --manifest-path rust-service/Cargo.toml -p sea-benchmarks --all-targets --locked -- -D warnings
cargo test --manifest-path rust-service/Cargo.toml -p sea-benchmarks --all-targets --locked
cargo test --manifest-path rust-service/Cargo.toml -p sea-file --lib batch --locked
cargo test --manifest-path rust-service/Cargo.toml -p sea-sequencer --lib delayed_persistence_admits_a_bounded_ring_and_publishes_only_after_commit --locked
```

The original benchmark task changed no dependencies, manifests, lockfiles, default-run setting, production sources, or presentation reports.
The later focused repair changed only sequencer admission, its regression and contract documentation, and the benchmark workaround and related documentation.
No commits, branches, extra worktrees, or delegates were created.

## Implementation Validation and Integration

The implementation remains isolated on `rust-service-storage-optimization` from base `354fc17264f157897ef4ff674569de2af51adf44`.
The primary checkout and concurrent session-sequence worktree were not modified.
The benchmark-task statement above refers only to collection; the overall implementation used delegated crate work and correctness review.

Final Rust workspace tests (`--workspace --all-targets --all-features`), workspace build, formatting, warning-free rustdoc, and documentation link checks passed.
Focused strict Clippy passed for every changed crate, and sequencer/core/memory WASM compilation passed.
Full-workspace strict Clippy remains blocked by the unchanged server entrypoint's 102-line `main` exceeding its 100-line limit.
The scoped repository policy check passed after a frozen offline dependency installation.
The repository `pnpm build:fast` passed all 1,857 tasks in 494.099 seconds, without unrelated tracked changes or lockfile updates.
Physical power-cut testing and the full non-Rust/browser test suite were not performed.

The bounded queue includes admitted and in-flight application work, with per-session ordering across byte-capacity waits.
Additional regressions cover a smaller successor trying to overtake a waiting larger operation, cancellation before admission, and exhausted executor budgets before admission registration.
Event I/O uses retained blocking workers; archive head and read polling do not wait behind event disk I/O.
Document creation/recovery, blob writes, membership changes, and snapshot publication retain synchronous or exclusive barrier paths.
The network client and server still serialize each author stream, so same-session wire batching is not enabled by this change.
The benchmark directly exercises concurrent local session submissions.

The session-sequence branch still needs semantic integration, particularly submission identity, accepted-prefix failure handling, cancellation, and terminal leave ordering.
No merge was attempted while that independent work remained in progress.
See [Decision 0019](historical/decisions/0019-bounded-storage-pipeline.md) for the approved storage assumptions and API boundary.

## Session-Sequence Merge Integration

The merge combines storage checkpoint `47159ea46be` with incoming `7753aba04ac` in the storage worktree only.
The incoming [Decision 0018](historical/decisions/0018-session-prefix-submission-identity.md) is preserved unchanged; the independently numbered storage decision is renumbered to 0019.
This integration adds no performance optimization or new measurements.

The pipeline no longer uses operation IDs, historical deduplication, or submission lookup.
Each call, including equal inputs in one batch, is a new submission.
Clients count ordered application events within a session; membership records do not consume that count.
The benchmark verifies this order using its own opaque payload counter and immutable receipt positions.

Cancellation of an admitted call revokes its membership but does not cancel an already dispatched storage batch.
That retained batch may commit multiple already dispatched entries from the session, in order.
Undispatched entries are rejected, and authoritative leave is written only after the accepted prefix settles.
Ambiguous grouped outcomes still require recovery and cannot produce a false leave barrier.
Entry/byte bounds, per-session capacity ordering, cooperative polling, and frozen batch reference-floor validation are preserved.

Initial focused validation found eight compile errors from operation-ID fields in auto-merged fault tests.
Those fixtures now use payload ordinals or equal submissions; the rerun passed all 34 sequencer tests.
The storage benchmark regression passed all four payload/window combinations.
The existing same-session batch regression also now requires equal inputs to receive distinct ordered positions before an invalid entry terminates the suffix.

Final validation used the pinned Rust 1.98.1 toolchain:

- All 34 sequencer tests and 16 benchmark tests passed with all targets and features.
- Workspace formatting and strict Clippy passed; the earlier server `main` length failure is fixed in the incoming branch.
- Strict WASM library Clippy passed for `sea-sequencer` and `sea-wasm`, with all features and `RUSTFLAGS='--cfg=web_sys_unstable_apis'`.
- Warning-free workspace rustdoc, all-target workspace build, and documentation checks passed.
- The complete `./test.sh` retry passed: 201 native tests, package-owned Node/WASM tests, integration smoke cases including Tinylicious, and Chromium WebTransport/WebSocket/lifecycle scenarios.
  The one normally ignored native browser fixture was explicitly run and passed by the browser harness.
- `pnpm policy-check --path rust-service` passed.
- Repository `pnpm build:fast` passed in 110.602 seconds; output is retained at `/tmp/sea-storage-merge-root.log`.
- Lockfiles are unchanged, the incoming session-prefix decision is byte-for-byte preserved, and the storage decision differs only in its number.

Retained failed attempts are not superseded as evidence:

- Formatting initially reported two import layouts and later one assertion layout; both were repaired and checked again.
- The first combined WASM check omitted the required unstable web-sys configuration and failed on WebTransport imports.
  A follow-up command stopped at a nonexistent script glob before running checks; the corrected package-script lookup and configured check passed.
- The first full native suite failed `native_client_round_trip_in_every_storage_mode` with `Transport(Timeout)`.
  The isolated rerun passed in 1.80 seconds without code changes, and both complete-suite invocations subsequently passed the native matrix.
- The first complete suite passed the Rust and browser checks but failed its Tinylicious comparator because this worktree lacked Routerlicious dependencies.
  A worktree-local `pnpm install --offline --frozen-lockfile` succeeded in 8.2 seconds, and the complete suite retry passed.
- Two patch-tool deletions reported success while leaving the old decision path on disk.
  Direct removal of that exact obsolete path completed the rename; filesystem and content checks verified it.

Logs are retained under `/tmp/sea-storage-merge-`: `clippy.log`, `doc.log`, `build.log`, `test.log`, `policy.log`, `root.log`, `complete-test.log`, `routerlicious-install.log`, and `complete-test-retry.log`.
The original native timeout and missing-dependency failures remain in their original logs.

No resolution was staged or committed, and no other worktree was modified.
Git intentionally retains the three unmerged index stages for `session.rs` until the parent reviews and stages the resolved file.
The working file has no conflict markers; the decision deletion and new 0019 path also require staging.
The semantic integration is ready for parent review and commit after staging, with physical power-cut qualification still outside this validation.