# Iteration 0009 Phase 3 Report

Status: complete
Phase 2 integration commit: `7b45ca206f1`
Phase 3 commit: the commit containing this completed report; its self-referential hash is reported after creation

## Evidence Summary

All three charter hypotheses are supported within the declared controlled-local scope. Six full-driver arms used the same one-writer, one-observer append-only SharedTree workload. All 100-edit smokes and all 60 retained 10,000-edit samples converged to exact requested counts and final values. The Rust service substituted memory, buffered-file, and durable-file operation storage without changing the tested Fluid behavior, while durable file remained the default. Burst submission followed by one final convergence wait measured application-level logical edit capacity rather than per-edit round-trip latency.

The retained [comparison and raw evidence](https://github.com/CraigMacomber/FluidFramework/blob/74f3736e4afea1aa78600636e8b45a47243a6095/rust-service/historical/benchmarks/shared-tree/4ce44213978/README.md) report clean provenance, environment, distributions, external service CPU/RSS where available, guarantee labels, and explicit limitations. They do not claim production, multi-writer, packet-level, or power-loss capacity.

## Implementation Defects

- Scalar replacement could not prove every requested edit survived; append-only numeric state with exact count and final-value checks replaced it.
- Browser WASM panicked when native scope generation used `SystemTime::now()`; target-local atomic scope generation fixed the runtime portability defect.
- The published TypeScript local server expected the Node `process` global; a standard injected shim fixed only that browser benchmark bundle.
- Benchmark output initially made the repository appear dirty; provenance now excludes only the retained output directory.

## Shared Abstraction Findings

- Supported: one native service/sequencer implementation can compose with memory, buffered-file, and durable-file operation logs while preserving the tested opaque-position, projection, subscription, and ambiguity behavior.
- Supported: the native service can run inside browser WASM through a raw FSP4 adapter, preserving the full Fluid `IDocumentServiceFactory` surface without a second sequencer implementation.
- Supported: application-level single-writer throughput on this host is tightly clustered across transport/storage arms; the three Rust WebTransport means span 1.1%.
- Falsified: a final scalar value is sufficient evidence for a large logical-operation workload. It cannot distinguish all edits from coalesced or lost intermediate updates.
- Inconclusive: production membership, multi-process notification, multi-node durability, power-loss recovery, offered-load saturation, multi-writer contention, and Routerlicious/ODSP equivalence.

## Decisions

No decision record was created. Durable file remains the service default; memory and buffered-file selection are internal benchmark/configuration options with visibly weaker guarantees.

## Comparative Results

Mean end-to-end logical edit throughput was Tinylicious 3,327.6 ops/s, TypeScript local service 3,293.4, Rust local memory 3,254.0, Rust WebTransport buffered file 3,247.4, Rust WebTransport memory 3,232.8, and Rust WebTransport durable file 3,210.9. The six-arm span was 3.6%; distributions overlap, so no statistical ranking is claimed. Durable Rust was 0.7% below Rust WebTransport memory, and the Rust transport modes used 0.51-0.61 external CPU seconds with approximately 15.8 MiB RSS over ten repetitions. Tinylicious used 3.46 CPU seconds and peaked near 164.7 MiB RSS, but architecture and guarantee differences make this diagnostic rather than a normalized efficiency result.

All arms proved the same logical workload and convergence condition, but guarantees are not equivalent: local and memory arms are volatile, buffered-file acknowledgements do not durable-sync the operation log, and only durable mode uses deployment authority. Tinylicious is a development service. Browser CPU/RSS and whole-system resources were not measured.

## Learning and Process Findings

The [retrospective](retrospective.md) records the user-directed workload correction, copied-worktree generated-output failure, WASM runtime issue, browser package shim, and provenance repair. The append-only count/final-convergence requirement is promoted to [LEARNINGS.md](../../LEARNINGS.md). The workstream report retains the full [notable-event table](phase-2/full-driver-single-writer-capacity.md#notable-events).

## Skill Changes

The [skill review](skill-review.md) accepts no coordination skill change. Existing rules already require falsifying checks, retained evidence, checkout identity, lockfile review, and honest validation limits. Benchmark provenance and copied-worktree diagnostics remain instruction/checklist guidance.

## Next Iteration Scope

Keep the full-driver append-only workload, exact final convergence, storage guarantee labels, durable default, and retained raw distributions. Replace earlier per-edit-wait and scalar-final-value capacity evidence with this study. No implementation is removed.

The user requested this fair single-writer remeasurement and did not request an additional iteration, so no next workstream is initialized automatically. Production membership, randomized/statistically powered reruns, multi-writer and multi-document load, multi-node service capacity, power-loss qualification, retention, batching optimization, Routerlicious/ODSP, authentication, and publication remain explicit future choices.

## Convergence Assessment

- Correctness converged: all six smoke arms and all 60 retained large samples reached exact writer/observer state.
- Composition converged for the scoped experiment: all arms use complete Fluid driver/container/SharedTree paths, and Rust modes share one native service semantics layer.
- Validation converged for touched code: formatting, 13 service tests, strict touched-package Clippy, WASM checks, package lint/typechecks, three Node tests, bundles, retained-data validation, and iteration artifact validation passed.
- Broader dependency-inclusive Clippy did not converge under Rust 1.98.1 because unchanged content-addressed and durable-log code triggers three `drop_non_drop` findings; this remains outside the workstream scope.
- Measurement converged only for the declared controlled-local workload. Missing production, multi-writer, multi-node, restart, power-loss, randomized-order, browser-resource, and packet-level evidence prevents a wider capacity claim.
