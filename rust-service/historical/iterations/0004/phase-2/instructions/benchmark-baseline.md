# Iteration 0004: benchmark-baseline Instructions

Status: planned
Branch: `rust-service-iteration-0004-benchmark-baseline`
Iteration source commit: `a577eda313ebe68f6e8ba3e33e99ea0822a50d9a`
Owner: GitHub Copilot benchmark-baseline coding agent
Report: `rust-service/iterations/0004/phase-2/benchmark-baseline.md`

## Assignment

Create reproducible startup, append, finite-read, snapshot/recovery, reconnect, memory, storage-amplification, and wire-byte workloads. Hypothesis: seeded fixtures plus an environment manifest produce repeatable within-host measurements while making guarantee differences explicit. Disprove with five baseline repetitions whose variance or uncontrolled setup prevents interpretation. Optimization and leaderboard claims are excluded.

## Ownership

- Wave 1 may define deterministic fixtures/output schema; Wave 3 runs the integrated matrix after service, clients, transports, and wrappers land.
- Writable: new `rust-service/benches/` or `rust-service/crates/benchmarks/`, benchmark scripts/docs, and `rust-service/iterations/0004/phase-2/benchmark-baseline.md`.
- Implementation crates are read-only. Instrument public APIs and request narrowly scoped counters rather than forking code.
- Do not commit generated result dumps, keys, root membership, or lockfile changes.

## Expected Evidence

- Seeded compressible/incompressible, small/large, empty, snapshot, warm/cold restart, and bounded-concurrency workloads.
- Report median/tail latency, throughput, peak resident memory where available, persisted/wire bytes, recovery time, iteration count, variance, build profile, environment, and active guarantees.
- One correctness-smoke command and one non-CI measurement command; no timing assertions in tests.

## Validation

Print checkout identity and consumed integration commits. Validate fixture determinism, output schema, smoke workloads, strict Clippy, and rustfmt with isolated outputs. Use a disposable exact copy for temporary workspace registration and verify no assigned-worktree root manifest/lockfile diff. Retain five-run raw summaries in the report, not generated files.

## Escalation and Stopping Conditions

Stop before comparing unlike durability/security/compression guarantees as equivalent, adding timing-based test failures, or tuning implementation code. Report environmental instability or missing counters as limitations rather than manufacturing precision.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
