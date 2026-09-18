# Iteration 0009 Charter

Status: active
Source commit: `cc34c4ea1c2e7b6b1a9bed3edf8f6ac948dae565`
Coordinator: GitHub Copilot

## Questions and Hypotheses

- **Fair full-driver workload:** A single Fluid writer can issue a large fixed count of real SharedTree edits while a second full Fluid container observes convergence, producing one application-level operations/second metric across Rust storage modes, TypeScript local service, and Tinylicious. The cheapest disproof is a 100-operation smoke run whose final writer/observer values or counted edits differ.
- **Rust storage substitution:** The native service can select memory, buffered-file, or durable operation storage without changing FSP4, Fluid projection, subscription, ambiguity, or shutdown semantics. The cheapest disproof is the existing service contract suite instantiated against each mode; a position, fence, or reopen law that cannot be represented ends substitution work before measurement.
- **Capacity rather than round-trip latency:** Issuing all measured edits from client 0 before waiting for client 1 should expose sustained single-writer throughput rather than the existing edit-and-converge latency ceiling. The cheapest disproof is telemetry or final-state evidence that Fluid coalesced, dropped, or failed to sequence the requested logical edits.

## Active Workstreams

| Workstream | Owner | Dependencies | Writable paths | Expected evidence | Stopping condition |
| --- | --- | --- | --- | --- | --- |
| `full-driver-single-writer-capacity` | GitHub Copilot | Iteration `0008` FSP4 v2 subscription, minimal WASM `IDocumentServiceFactory`, Fluid local driver, Tinylicious client | Native service/configuration and wrapper launch surfaces; minimal-driver benchmark harness/package/docs; iteration `0009` report; new retained benchmark evidence | One single-writer SharedTree workload, correctness smoke for every backend, repeated large-operation raw artifacts, environment/resource metadata, explicit guarantee labels, and comparison report | Stop on semantic inequivalence, unverifiable edit count, unbounded memory, required production-membership change, or inability to preserve existing durable behavior |

## Deferred Scope

Production membership and default read-to-write identity are deferred because one writer with one observer does not require multi-writer membership. Multi-writer, multi-document, multi-node, power-loss, retention, batching optimization, Routerlicious/ODSP, authentication, and publication are deferred. The benchmark measures application-level logical SharedTree edits and convergence, not production capacity or packet-level bandwidth.

## Shared Validation

- `cargo fmt --all -- --check`
- strict Clippy and tests for every touched Rust crate, including WASM with `RUSTFLAGS='--cfg=web_sys_unstable_apis'`
- minimal-driver format, lint, typecheck, unit tests, and benchmark bundle builds under nvm Node `22.23.2` where dependency engines require it
- 100-operation correctness smoke for every backend before large runs
- repeated clean-source large single-writer runs with identical operation/warmup/repetition counts and retained JSON
- `git diff --check` and root lockfile review
- `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0009 phase-2`

## Risks and Escalation

- Repeated scalar assignments may be batched while remaining distinct SharedTree edits; the report must distinguish logical edit throughput from sequenced message throughput and retain a count check.
- Memory and buffered-file operation logs have weaker guarantees than durable storage. Do not rank them without visible guarantee labels.
- The existing Rust Fluid driver uses synthetic membership and force-write mode. If one-writer correctness requires production membership, stop rather than expanding scope silently.
- A full matrix may run long. Use a calibrated operation count large enough for stable throughput and record it identically across backends; do not silently lower only a slow backend.
- If the native service cannot abstract operation storage without changing accepted cursor or receipt semantics, retain the minimized failing contract and move to Phase 3.
