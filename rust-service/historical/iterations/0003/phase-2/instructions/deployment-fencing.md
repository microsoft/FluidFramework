# Iteration 0003: deployment-fencing Instructions

Status: planned
Branch: `rust-service-iteration-0003-deployment-fencing`
Iteration source commit: `baa5900841161074a733f60ee424c20ed8d8c70f`
Owner: GitHub Copilot deployment-fencing agent
Report: `rust-service/iterations/0003/phase-2/deployment-fencing.md`

## Assignment

Prototype and fault-test a deployment-backed lease or epoch authority for the accepted authoritative sequencer. The authority must reject a stale owner and remain exclusive from fence validation through storage append. Hypothesis: two sequencer processes sharing the authority cannot both append successors under different ownership views. Disprove it by pausing the old owner after validation, rotating ownership, resuming both contenders, and observing an old-owner append or two accepted successors. Keep the kernel payload-agnostic; conditional append is a Phase 3 outcome only if a minimized trace proves it necessary.

## Ownership

- Writable: `rust-service/crates/fluid-sequencer/` and `rust-service/iterations/0003/phase-2/deployment-fencing.md`.
- Read-only: core, durable-log, conformance, decisions, charter, and all other workstream paths.
- Build on `AuthoritativeSequencer`, `SequencerStorage`, `KernelStream`, and Decision 0004.
- Crate-local manifest changes are allowed; do not commit `rust-service/Cargo.lock`. Report any required integration regeneration.
- Do not change shared APIs, accepted semantics, decisions, or another report.

## Expected Evidence

- A concrete authority adapter and deterministic cross-process test harness.
- Stale-owner, rotation-during-append, process-loss, replacement replay, ambiguity, and duplicate-submission traces.
- Exact statement of the authority/failure model and any same-host or filesystem limitation.
- Ownership handoff and append-overhead observations under a documented workload; do not generalize a single debug run as a benchmark.
- A completed report with commits, outcomes, failed approaches, dependencies, measurements, and candidate process improvements.

## Validation

- Print absolute checkout, branch, kickoff commit, and clean status before editing.
- `cargo test -p fluid-sequencer --all-features -- --nocapture`
- `cargo clippy -p fluid-sequencer --all-targets --all-features -- -D warnings`
- `cargo fmt --all -- --check`
- `git diff --exit-code baa5900841161074a733f60ee424c20ed8d8c70f -- rust-service/Cargo.lock`
- Use a workstream-specific `CARGO_TARGET_DIR`; retain exact test names/counts and reject output naming another checkout. Workspace validation belongs to integration.

## Escalation and Stopping Conditions

Stop and report if no available authority can preserve exclusivity through append, if the only solution requires a shared/kernel change, or if cross-process tests cannot be made deterministic. Preserve a smallest failing two-owner trace and specify whether the missing primitive is an atomic fenced append, stronger lease service, or storage integration. Do not weaken valid-only storage or silently serialize only inside one process.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
