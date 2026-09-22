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

Build the tools with `cargo build --release -p sea-benchmarks --bins` and test their local fixtures with `cargo test -p sea-benchmarks --bins`.

## Local Storage Pipeline

`storage-pipeline` measures native `LocalSequencer` submissions from one session over `memory`, `buffered-file`, or `durable-file`.
It accepts payload sizes 64 or 8192 and an in-flight window of 1 or 128, preserves initial submit polling order, and verifies exact receipts and finite replay.
Replay verifies session identity and a sequential counter encoded in the opaque payload, without Sea operation IDs or submission deduplication.
Each invocation emits separate JSON rows for a 128-operation warmup and a fresh 4096-operation measured document, then deletes its newly created data directory.
Creation, replay, and shutdown are outside the submission timer; measured latency starts at each future's first poll.
Throughput includes final factory flush, with admission duration and final-drain duration reported separately.
Submit latency reports p50/p95/p99; replay and shutdown have separate durations, and Linux output includes whole-process peak RSS across warmup, writes, and replay.
Buffered latency measures process-local publication, whereas durable latency includes required synchronization.
Tokio uses one async worker, with blocking workers available for file I/O; no CPU affinity is imposed.
The output is specific to this binary, not the general harness schema below.

```bash
cargo build --release -p sea-benchmarks --bin storage-pipeline --locked
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

Latency and throughput use a monotonic process clock. The distribution reports minimum, median, p95, maximum, mean, sample standard deviation, and coefficient of variation. Results are procedure observations, not capacity claims.

For periodic snapshot workloads, commit throughput includes snapshot publication wall time and `snapshot_publish_microseconds` is the sum across all publications in the repetition.
The general harness measures acknowledgment throughput; its later orderly file flush is outside that timer.
Use `storage-pipeline` for drain-inclusive buffered throughput rather than interpreting acknowledgment-only measurements as sustained file-write capacity.

## Backends

The `memory` and `file` cells measure trusted backend operations through a factory-created `SeaView`.
The `compression` and `encryption` cells measure `SeaSession` decorators over a common `LocalSequencer<FileStorage>`.
Their payload and snapshot facets use the decorated session, retaining publisher registration for the publication workload.
File recovery reopens the backend-assigned document ID after releasing the prior opening.
Storage reads use an explicit committed upper bound; session reads collect the configured number of acknowledged submissions.
Their commit measurements therefore include sequencing and author-session work and are not directly comparable with schema-version-2 raw-stream decorator results.
File-backed cells report recursive persisted size; decorator cells report process CPU used by the submit/read/snapshot workload.
The benchmark key is a fixed non-production key used only in memory and is never emitted; encryption nonces come from the operating system.
