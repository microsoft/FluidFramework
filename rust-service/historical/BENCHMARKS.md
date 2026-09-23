# Benchmark Specification

Historical procedure for the initial iteration, not the current benchmark specification.
Use the [current harness guide](../crates/sea-benchmarks/README.md) for supported workloads and commands.

Iteration `0001` measurements answer contract and cost questions; they are not production capacity claims.

## Workloads

Run each applicable implementation with deterministic payload bytes for payload sizes 0, 64, 1024, and 65536 bytes. Measure streams of 10,000 appends with these scenarios:

1. One writer, no reader.
2. Four concurrent writers, no reader.
3. One writer and one reader consuming every record.
4. Four writers and four readers consuming every record.
5. Counter recovery after snapshots every 1,000 appends.

The file implementations also measure reopening a 10,000-record stream. The durable-log spike records acknowledgment policy with every result. Compression uses both repeated and deterministic pseudo-random payloads.

## Procedure

- Build with `cargo build --workspace --release` from a clean checkout.
- Run one unmeasured warmup and at least ten measured repetitions per case.
- Report median, p95, minimum, maximum, and sample standard deviation for throughput and operation latency.
- Record peak resident memory where available, startup/recovery time, persisted bytes, source lines, and direct dependency count.
- Retain machine-readable JSON or CSV beside each workstream report.
- Compare only equivalent payloads and guarantees. Label durability or semantic differences instead of normalizing them away.

## Required Metadata

Every result records source commit, Rust toolchain, Cargo profile and features, operating system and kernel, CPU model and logical CPU count, memory, storage device and filesystem, runtime configuration, payload distribution, stream size, writer and reader counts, snapshot frequency, warmup, repetitions, and measurement tool/version. Unknown values are recorded as `unknown`.

Initial Phase 1 establishes this protocol but does not claim baseline performance; iteration `0001` workstreams collect the first comparable measurements.
