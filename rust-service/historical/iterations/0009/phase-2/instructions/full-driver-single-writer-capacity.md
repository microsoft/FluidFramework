# Iteration 0009: full-driver-single-writer-capacity Instructions

Status: active
Branch: `rust-service-iteration-0009-full-driver-single-writer-capacity`
Iteration source commit: `cc34c4ea1c2e7b6b1a9bed3edf8f6ac948dae565`
Owner: GitHub Copilot
Report: `rust-service/iterations/0009/phase-2/full-driver-single-writer-capacity.md`

## Assignment

Measure sustained single-writer throughput for real SharedTree edits through full Fluid driver surfaces for: Rust local memory, Rust WebTransport memory, Rust WebTransport buffered file without durable sync, Rust WebTransport durable file, TypeScript local service, and Tinylicious. Use one writer container and one observer container, issue a large identical number of logical edits without per-edit convergence waits, then wait for authoritative final convergence. Hypothesis: storage/transport differences can be isolated behind unchanged Fluid semantics and produce repeatable application-level throughput distributions. Disprove first with a 100-edit count/final-state smoke on every backend.

## Ownership

Writable: `rust-service/crates/service/`, relevant native/browser wrapper launch configuration, `rust-service/tests/minimal-fluid-driver/`, `rust-service/benchmarks/shared-tree/`, this workstream report, and a decision record only if a shared storage-mode contract changes. Read-only: kernel semantic laws, accepted decisions, previous iteration records, unrelated Fluid packages, generated API reports, and root lockfiles except resolver-generated changes explicitly approved during integration. Do not weaken durable defaults, cursor authority, explicit ambiguity, bounded subscriptions, or shutdown ownership. Do not substitute mock DDS operations or a partial driver.

## Expected Evidence

- Backend-selectable native operation storage with durable mode remaining the default, or a retained counterexample proving this cannot preserve contracts.
- A full Fluid local-driver benchmark arm and the existing Tinylicious/full Rust driver arms sharing one workload.
- Fixed writer index `0`, observer index `1`, real SharedTree edits, exact requested/final logical edit counts, no per-edit convergence wait, and final convergence validation.
- At least one 100-edit smoke per backend, followed by identical large-operation count, warmup, and repetition settings selected after calibration.
- Raw per-run startup, submit, convergence, end-to-end throughput, latency-to-final-state, browser, source, server CPU/RSS where available, bytes/queue counters where available, and guarantee metadata. Missing metrics remain `null`.
- A retained comparison report that separates local from network transport and memory, buffered, and durable acknowledgements; no production-capacity claim.

## Validation

Print absolute checkout, branch, commit, and final exit status with every delegated command. Run focused service storage-mode tests immediately after the first implementation edit. Run Rust format, strict Clippy, service/native/browser tests, generated WASM tests, minimal-driver format/lint/typecheck/tests, browser smoke for all six arms, and clean-source repeated measurements. Use nvm Node `22.23.2` for constrained Fluid dependency builds. Verify root `Cargo.lock`, `pnpm-lock.yaml`, and package lockfiles after each resolver/build step; do not hand-edit generated API reports.

## Escalation and Stopping Conditions

Stop and report if storage substitution changes opaque position/cursor laws, if a backend cannot run through an actual `IDocumentServiceFactory`, if logical edit count cannot be verified, if memory grows without a declared bound, or if one backend requires a different workload. Preserve partial smoke results and exact failures. Escalate any production-membership, batching-policy, public API, or accepted-decision change rather than folding it into benchmark plumbing.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
