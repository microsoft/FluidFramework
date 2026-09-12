# Snapshotted Stream Benchmark Harness

This crate provides deterministic fixtures, correctness smoke workloads, and newline-delimited JSON measurements. It is intentionally absent from the root workspace membership during its workstream; the scripts register it only in an exact disposable copy.

## Commands

From `rust-service/`:

```bash
bash scripts/validate-benchmarks.sh
bash scripts/measure-benchmarks.sh --backend memory --fixture small-compressible --records 10000 --writers 1 --warmups 1 --repetitions 5
bash scripts/measure-benchmarks.sh --backend file --fixture small-compressible --records 10000 --writers 1 --warmups 1 --repetitions 5
```

The validation command runs formatting, unit tests, strict Clippy, and correctness smoke workloads for both existing backends. Measurements have no timing assertions and write results only to standard output.

## Fixtures

`FixtureGenerator` is dependency-independent and stable for a `(seed, fixture, record_index)` tuple. It provides empty, 64-byte and 65,536-byte compressible/incompressible payloads plus an eight-byte snapshot payload. The default seed is recorded in every result. Writer concurrency is bounded by `--writers`.

## Result Schema

Each output line is one schema-version-1 `BenchmarkResult`. It includes repetition number, source/environment metadata, workload parameters, active guarantees, append latency distribution, throughput, startup/read/snapshot/recovery duration, peak resident memory where `/proc` exposes it, logical bytes, and optional persisted/wire/reconnect observations. Missing counters are `null`; they are never inferred.

Latency and throughput use a monotonic process clock. The distribution reports minimum, median, p95, maximum, mean, sample standard deviation, and coefficient of variation. Results are procedure observations, not capacity claims.

## Wave 3 Adapters

The workload runner is generic over the public `AppendStream` and `SnapshotStore` traits. A later adapter adds its crate dependency and backend construction without copying implementation code. Service and transport adapters must supply reconnect and wire-byte observations from their public instrumentation. Compression and encryption adapters must report their ordering and active guarantees; the harness must not compare those results as equivalent to plaintext or uncompressed baselines.

The Wave 1 file adapter reports clean-reopen recovery and persisted bytes. The memory adapter reports neither persistence nor reconnect. Neither existing implementation exposes wire-byte counters.