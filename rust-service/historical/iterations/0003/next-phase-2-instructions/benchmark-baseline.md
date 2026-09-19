# Iteration 0004: benchmark-baseline Instructions

Derived from iteration: 0003
Status: planned
Owner: GitHub Copilot benchmark-baseline coding agent

## Approved Scope

Create a reproducible benchmark harness for startup, append latency/throughput, finite reads, snapshot publication/recovery, process reconnect, memory, storage amplification, and wire bytes. Compare only equivalent workloads and make guarantee differences visible, as approved in the [iteration 0003 Phase 3 report](../phase-3-report.md#next-iteration-scope). Optimization and leaderboard claims are excluded.

## Prior Evidence

Iterations `0001`-`0003` recorded useful but ad hoc debug timings and byte counts in their Phase 3 reports. [LEARNINGS.md](../../../../LEARNINGS.md#performance-and-operations) requires visible guarantee differences. The integrated service, Unix transport, WebTransport, encryption, and compression paths need one controlled workload model before optimization.

## Hypothesis and Discriminating Check

Hypothesis: deterministic payload sets and an explicit environment manifest can produce repeatable within-host measurements while preventing invalid cross-guarantee comparisons. The cheapest disproof is five repeated baseline runs whose reported variance or uncontrolled setup makes relative results unstable or irreproducible.

## Ownership and Dependencies

- Wave 3 for final matrices after service, client, transports, and wrappers integrate; wave 1 may define fixture generation and output schema without copying implementation code.
- Writable: new `rust-service/benches/` or `rust-service/crates/benchmarks/`, benchmark scripts/config, benchmark documentation, and the eventual iteration `0004` benchmark report.
- Treat implementation crates as read-only. Instrument through public APIs; request narrowly scoped counters from owners instead of forking implementations.
- Do not commit generated result dumps, private keys, the shared lockfile, or root workspace changes. Integration owns registration.

## Deliverables and Validation

- Include seeded compressible and incompressible payloads, small/large records, empty payloads, snapshots, warm/cold restart, and bounded concurrency.
- Report median and tail latency, throughput, peak resident memory where available, persisted bytes, wire bytes, recovery time, iteration count, variance, build profile, CPU/OS/toolchain, and durability/security/compression configuration.
- Supply one command for correctness smoke and one for non-CI measurement; benchmark tests must not make timing assertions.
- Validate fixture determinism, output schema, smoke workloads, strict Clippy, and rustfmt using an isolated target directory.
- Stop before comparing unlike acknowledgement guarantees as equivalent or tuning implementation code inside this workstream.
