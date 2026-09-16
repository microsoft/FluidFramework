# Sea Benchmark Harness

This workspace crate provides deterministic fixtures, correctness smoke workloads, and newline-delimited JSON measurements for the storage and transformation layers.

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

Latency and throughput use a monotonic process clock. The distribution reports minimum, median, p95, maximum, mean, sample standard deviation, and coefficient of variation. Results are procedure observations, not capacity claims.

For periodic snapshot workloads, commit throughput includes snapshot publication wall time and `snapshot_publish_microseconds` is the sum across all publications in the repetition.

## Backends

The `memory` and `file` cells measure trusted backend operations directly through `SeaStorage`.
Compression, stateful compression, encryption, and the composed compression-before-encryption cell measure `SeaSession` decorators over a common `LocalSequencer<FileStream>`.
Their payload facets use decorated cloned handles, while snapshot coordination uses the undecorated handle for the same logical session.
Their commit measurements therefore include sequencing and author-session work and are not directly comparable with schema-version-2 raw-stream decorator results.
File-backed cells report recursive persisted size; decorator cells report process CPU used by the submit/read/snapshot workload.
The benchmark key is a fixed non-production key used only in memory and is never emitted; encryption nonces come from the operating system.
