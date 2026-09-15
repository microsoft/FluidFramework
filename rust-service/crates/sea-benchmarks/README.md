# Sea Benchmark Harness

This crate provides deterministic fixtures, correctness smoke workloads, and newline-delimited JSON measurements. It is intentionally absent from the root workspace membership during its workstream; the scripts register it only in an exact disposable copy.

## Commands

From `rust-service/`:

```bash
cargo run -p sea-benchmarks -- measure --help
bash scripts/validate-benchmarks.sh
bash scripts/measure-benchmarks.sh --backend memory --fixture small-compressible --records 10000 --writers 1 --warmups 1 --repetitions 5
bash scripts/measure-benchmarks.sh --backend file --fixture small-compressible --records 10000 --writers 1 --warmups 1 --repetitions 5
bash scripts/measure-wave3-benchmarks.sh
```

The validation command runs formatting, unit tests, strict Clippy, and correctness smoke workloads for every backend. Measurements have no timing assertions and write results only to standard output. The Wave 3 matrix builds once in an exact disposable copy, runs 26 bounded cells with one warmup and five measured repetitions each, and leaves no generated result file or key in the repository.

For a smallest local measurement that does not retain evidence or require an external service, run:

```bash
cargo run -p sea-benchmarks -- measure --backend memory --fixture small-incompressible --records 8 --writers 2 --snapshot-frequency 0 --warmups 0 --repetitions 1
```

Help exits successfully. Unknown options, missing values, zero records/writers/repetitions, and options supplied to `smoke` exit unsuccessfully with a diagnostic. A successful measurement emits one JSON line per measured repetition; a successful smoke emits one human-readable summary line. Treat any other standard output shape as a harness failure rather than benchmark evidence.

## Fixtures

`FixtureGenerator` is dependency-independent and stable for a `(seed, fixture, record_index)` tuple. It provides empty, 64-byte and 65,536-byte compressible/incompressible payloads plus an eight-byte snapshot payload. The default seed is recorded in every result. Writer concurrency is bounded by `--writers`.

## Result Schema

Each JSON output line is one schema-version-2 `BenchmarkResult`. It includes repetition number, source/environment metadata, workload parameters, active guarantees, append latency distribution, throughput, startup/read/snapshot/recovery/reconnect duration, process CPU time and peak resident memory where `/proc` exposes them, logical and persisted bytes, FSP4 or typed-boundary wire bytes, peak queued records, and peak active transport streams. Missing counters are `null`; they are never inferred. Lines beginning with `# cell:` identify matrix cells and are not JSON.

Latency and throughput use a monotonic process clock. The distribution reports minimum, median, p95, maximum, mean, sample standard deviation, and coefficient of variation. Results are procedure observations, not capacity claims.

For periodic snapshot workloads, append throughput includes snapshot publication wall time and `snapshot_publish_microseconds` is the sum across all publications in the repetition.

## Wave 3 Adapters and Matrix

The generic runner covers memory, buffered file, bounded local transport, independent zlib, immutable-dictionary zstd, AES-256-GCM-SIV, and dictionary-compression-before-encryption. File-backed cells report recursive persisted size; wrapper cells report process CPU used by the append/read/snapshot workload. The benchmark key is a fixed non-production key used only in memory and is never emitted; encryption nonces come from the operating system.

The service runner drives the public `NativeClient` against either direct `NativeService::handle` or the native HTTP/3 WebTransport client/server. Both use identical fixtures, FSP4 requests, durable service implementation, snapshot schedule, and explicit fresh-session reconnect. Direct service additionally measures clean lazy reopen; WebTransport reports encoded FSP4 bytes and peak active streams. These are equivalent application workloads, but direct calls and HTTP/3 transport are not equivalent transport guarantees.

The assembled service exposes canonical sequencer records rather than a projected stream of submitted application payloads. The harness therefore verifies every submission acknowledgement, reads through the bounded public API to its finite end, and reports `finite_read_records` without claiming one-to-one payload projection. The 200-submission matrix observes 201 canonical records in both direct and WebTransport paths.

The empty-payload case covers the generic buffered-file path and direct service dispatch. It is intentionally omitted for native WebTransport because FSP4 rejects an empty required submission payload with `ProtocolError::EmptyField`; substituting a nonempty payload would not be the same fixture.

The local bounded transport reports payload/token bytes and peak queued records. Its typed-boundary byte count excludes protocol framing and cannot be compared directly with FSP4 frame bytes. Native WebTransport counters include complete encoded FSP4 request and response frames but exclude QUIC, TLS, UDP, and IP overhead.

Browser-WASM behavior has separate headless Chromium evidence for the same create/open/submit/read/snapshot/reconnect protocol flow. Browser `WebTransport` exposes neither packet-byte totals nor internal queue depth, so the matrix does not fabricate browser packet or queue observations and does not treat native FSP4 frame bytes as browser packet bytes.

The matrix includes empty and small/large compressible/incompressible fixtures, periodic snapshots, four-writer bounded local transport, assembled-service startup, clean warm-cache restart, native lifecycle reconnect, and native WebTransport reconnect. Dropping operating-system caches requires privileges and is intentionally omitted, so recovery is labeled warm-cache rather than cold-disk. Peak RSS is process-wide high-water memory and process CPU has the host clock-tick resolution; neither isolates allocator or per-operation cost.