# Sea Benchmark Harness

This workspace crate provides deterministic fixtures, correctness smoke workloads, and measurements for storage, transformations, and client transports.

## Transport and Source Measurement Tools

`presentation-native` is a benchmark-only, single-core generator for the existing native session client over WebTransport and a local WebSocket adapter.
The [collection harness](../../scripts/README.md) owns server startup, CPU affinity, start synchronization, resource sampling, deadlines, and result retention.
The worker checks exact payload and per-document order at writer and observer, bounds outstanding operations, and drains deliveries before reporting.
It uses one ordered submission queue per document for both transports and does not introduce a production client API.
Local WebSocket is unencrypted; WebTransport includes QUIC/TLS with certificate pinning.

`presentation-test-spans` parses Rust source with `syn` and emits outer test-module/function line spans for the source inventory.
It recognizes explicit `#[cfg(test)]` modules and attributes ending in `test`, including `#[tokio::test]`; it does not evaluate complex conditional compilation expressions.
The Node collector combines those spans with test-path classification and cloc counts.

Build and stage the tools with `CARGO_TARGET_DIR=/path/to/source-specific-target bash scripts/build-benchmark-artifacts.sh` from `rust-service/`.
The script requires an explicit target directory and copies only final executables to this worktree's `target/release` directory.
Test their local fixtures with `cargo test -p sea-benchmarks --bins`.

### Aligned Checkpoint Measurements

Native worker results include all successful application-observer delivery timestamps, including warmup and drain, anchored once to the host epoch with a monotonic clock.
`benchmark-stress.mjs` brackets each CPU sample and counts deliveries in the exact half-open interval between the first and last measured CPU sample midpoints.
Only `aligned.serviceCpuSecondsPerDeliveredOperation` uses that aligned denominator.
Raw throughput, latency, backlog, and generator CPU remain separate observations.
The runner rejects missing timestamp schemas, clock discrepancies or sample brackets above 2 ms, and endpoint ambiguity above 1% of aligned deliveries.
Optional `serverBinary` and `generatorBinary` configuration paths select validated executable files from independently built source snapshots.
`liveCache` controls and checks the experimental server marker.

`checkpoint-no-reader` is a local fixture with 32 documents, no subscriptions during writes, four generator-equivalent shards, serial writes per document, and exact finite replay after measurement.
It offers 1,000 64-byte operations/s for 3 seconds warmup and 10 seconds measurement, with at most 10 seconds to drain.
The baseline build uses default APIs; the candidate build enables the benchmark-only `checkpoint-live-cache` feature.
The same source, pacing, acknowledgment timestamps, and replay checks apply to both builds.
`benchmark-no-reader.mjs` samples the complete fixture process on the eight service CPUs; identical pacing overhead is included on both sides, unlike the separate network generators.
It applies the same aligned CPU interval, 120-second deadline, 250-ms RSS sampler, and 4-GiB guard.
Candidate no-reader allocation observations report exact `LiveCacheStats` fields, not inferred allocation counts.
`checkpoint1-pairs.mjs ARTIFACT_DIRECTORY CELL` runs three alternating pairs and stops on a blocking gate; controls require a passed primary summary.
The cumulative implementation report freezes the comparison source, commands, complete matrix, and unchanged acceptance thresholds.

For factory comparisons, build with `--features checkpoint-live-cache` and select `direct` or `pass-through` using the optional third binary argument or `SEA_SESSION_FACTORY_MODE`.
Explicit factory modes require the cached build, so both sides use the same 32 cached runtimes.
The environment variable lets the existing `benchmark-no-reader.mjs` runner select the mode without changing its arguments.
Both modes instantiate the same generic workload with concrete session types; only opening differs.
The `ready`, `timed-result`, and `result` protocol, including the `liveCache` marker, is unchanged.

## Local Session Factory Churn

`session-factory memory|buffered-file|durable-file direct|pass-through NEW_DIRECTORY` emits one JSON row for a 320-open warmup and one for a fresh 3,200-open measured sample.
Each sample retains 32 cached document runtimes and concrete factories, with one unannounced open/close at a time and no live subscriptions.
`direct` uses `LocalSessionFactory`; `pass-through` uses `PassThroughFactory<LocalSessionFactory<_>>`.
Mode selection is outside the common generic measurement loop.
Before timing, each document checks an invalid-reference rejection, a closed-session error, sibling independence, and exact finite replay of one 64-byte application event.
Those checks add 64 successful opens and closes per sample, reported separately from churn.

Rows report `open_seconds`, `close_seconds`, `drop_seconds`, `churn_seconds` (including identical timing and count bookkeeping), `verification_seconds`, and `shutdown_seconds`; successful/requested open and close counts; `opens_per_document`; verified error, sibling, and replay counts; and exact `cache_before`/`cache_after` ownership fields.
`allocation_count` is `null`: cache slots and payload bytes are not counts of heap allocations.
The separate `sea-core` test `close_returns_the_source_future_and_preserves_poll_and_drop_boundaries` checks source-future pointer identity, not total allocations or factory-open allocation cost.
No allocator instrumentation, dependencies, or unsafe allocator are added.
Shutdown and resource drops follow each sample; the newly created directory is removed before successful exit.
The directory must not exist and its parent must exist.
Use an external deadline; replay, storage guarantees, and these local timings do not establish crash durability or network performance.

From `rust-service/`:

```bash
cargo test -p sea-benchmarks --bin session-factory --bin checkpoint-no-reader --features checkpoint-live-cache
cargo build --release -p sea-benchmarks --bin session-factory --bin checkpoint-no-reader --features checkpoint-live-cache
timeout 180s target/release/session-factory memory direct target/factory-direct-data
timeout 180s target/release/session-factory memory pass-through target/factory-wrapped-data
SEA_SESSION_FACTORY_MODE=direct node scripts/benchmark-no-reader.mjs target/release/checkpoint-no-reader memory true target/no-reader-direct
SEA_SESSION_FACTORY_MODE=pass-through node scripts/benchmark-no-reader.mjs target/release/checkpoint-no-reader memory true target/no-reader-wrapped
```

Repeat the paired commands with `buffered-file` and `durable-file` for their native storage guarantees.

## Local Storage Pipeline

`storage-pipeline` measures native `LocalSequencer` submissions from one session over `memory`, `buffered-file`, or `durable-file`.
It accepts payload sizes 64 or 8192 and an in-flight window of 1 or 128, preserves initial submit polling order, and verifies exact receipts and finite replay.
Replay verifies session identity and a sequential counter encoded in the opaque payload, without Sea operation IDs or submission deduplication.
Each invocation emits separate JSON rows for a 128-operation warmup and a fresh 4096-operation measured document, then deletes its newly created data directory.
Its `persisted_bytes` sums file lengths recursively through the document namespace, excluding directory metadata.
Creation, replay, and shutdown are outside the submission timer; measured latency starts at each future's first poll.
Throughput includes final factory flush, with admission duration and final-drain duration reported separately.
Submit latency reports p50/p95/p99; replay and shutdown have separate durations, and Linux output includes whole-process peak RSS across warmup, writes, and replay.
Buffered latency measures process-local publication, whereas durable latency includes required synchronization.
Tokio uses one async worker, with blocking workers available for file I/O; no CPU affinity is imposed.
The output is specific to this binary, not the general harness schema below.

```bash
CARGO_TARGET_DIR=/path/to/source-specific-target bash scripts/build-benchmark-artifacts.sh
timeout 180s target/release/storage-pipeline durable-file 64 128 target/storage-pipeline-data
```

The directory must not already exist, and its parent must exist.
The window bounds live futures, not guaranteed storage batch size.
Submit futures use ordinary `buffered` polling without an `unconstrained` wrapper; the sequencer preserves their actual first-poll order at its admission gate.
The older storage-optimization measurements used the earlier whole-submission `unconstrained` workaround and were not rerun after the admission fix.
Their source hash describes the measured version, not the final benchmark source.
Successful replay is not proof of physical durability or absence of early acknowledgment under faults.
The [storage optimization report](../../historical/STORAGE_OPTIMIZATION.md) retains comparable baseline observations and focused fault-test evidence.
The [file execution refactor report](../../historical/FILE_STORAGE_EXECUTION_REFACTOR.md) records the newer three-repetition matrix, final draining, process memory, syscall observations, and guarantee differences.

## Commands

From `rust-service/`:

```bash
cargo run -p sea-benchmarks -- measure --help
bash scripts/validate-benchmarks.sh
bash scripts/measure-benchmarks.sh --backend memory --fixture small-compressible --records 10000 --writers 1 --warmups 1 --repetitions 5
bash scripts/measure-benchmarks.sh --backend file --fixture small-compressible --records 10000 --writers 1 --warmups 1 --repetitions 5
```

The validation command runs formatting, unit tests, strict Clippy, and correctness smoke workloads for every retained benchmark backend.
Measurements have no timing assertions and write results only to standard output.

For a smallest local measurement that does not retain evidence or require an external service, run:

```bash
cargo run -p sea-benchmarks -- measure --backend memory --fixture small-incompressible --records 8 --writers 2 --snapshot-frequency 0 --warmups 0 --repetitions 1
```

Help exits successfully. Unknown options, missing values, zero records/writers/repetitions, and options supplied to `smoke` exit unsuccessfully with a diagnostic. A successful measurement emits one JSON line per measured repetition; a successful smoke emits one human-readable summary line. Treat any other standard output shape as a harness failure rather than benchmark evidence.

## Fixtures

`FixtureGenerator` is dependency-independent and stable for a `(seed, fixture, record_index)` tuple. It provides empty, 64-byte and 65,536-byte compressible/incompressible payloads plus an eight-byte snapshot payload. The default seed is recorded in every result. Writer concurrency is bounded by `--writers`.

## Result Schema

Each JSON output line is one schema-version-3 `BenchmarkResult`.
It includes the measured API boundary, repetition number, source/environment metadata, workload parameters, active guarantees, commit latency distribution, throughput, startup/read/snapshot/recovery duration, process CPU time and peak resident memory where `/proc` exposes them, and logical and persisted bytes.
Unavailable counters are `null`; they are never inferred.

Latency and throughput use a monotonic process clock.
The general harness distribution reports minimum, median, p95, maximum, mean, sample standard deviation, and coefficient of variation.
Its median and p95 select the upper sample at zero-based rank `ceil((samples - 1) * percentile)` without interpolation; this is not the nearest-rank convention used by the presentation workers.
Results are procedure observations, not capacity claims.

For periodic snapshot workloads, commit throughput includes snapshot publication wall time and `snapshot_publish_microseconds` is the sum across all publications in the repetition.
The general harness measures acknowledgment throughput; its later orderly file flush is outside that timer.
Use `storage-pipeline` for drain-inclusive buffered throughput rather than interpreting acknowledgment-only measurements as sustained file-write capacity.

## Backends

The `memory` and `file` cells measure trusted backend operations through a factory-created `SeaView`.
The `compression` and `encryption` cells measure `SeaSession` decorators over a common `LocalSequencer<FileStorage>`.
Their payload and snapshot facets use the decorated session, retaining publisher registration for the publication workload.
File recovery reopens the backend-assigned document ID after releasing the prior opening.
Snapshot verification compares the selected snapshot with the final replayed event position, not the record count: positions can be byte offsets.
It also fetches the snapshot blob and checks its exact final counter payload.
Storage reads use an explicit committed upper bound; session reads collect the configured number of acknowledged submissions.
Sequenced-session commit measurements include sequencing and author-session work and are not directly comparable with schema-version-2 raw-stream decorator results.
File-backed cells report recursive persisted size.
Whole-process CPU sampling spans backend construction, the workload, and file flush/recovery where applicable; it is not a commit-only observation.
The benchmark key is a fixed non-production key used only in memory and is never emitted; encryption nonces come from the operating system.
