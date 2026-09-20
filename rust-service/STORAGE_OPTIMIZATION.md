# Storage Optimization Evidence

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
See [Decision 0018](historical/decisions/0018-bounded-storage-pipeline.md) for the approved storage assumptions and API boundary.