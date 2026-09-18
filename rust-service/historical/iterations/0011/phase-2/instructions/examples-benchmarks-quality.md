# Iteration 0011: examples-benchmarks-quality Instructions

Status: active
Branch: `rust-service-iteration-0011-examples-benchmarks-quality`
Iteration source commit: `0d2c7e367767978b267831ca34aba6e398948bdf`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0011/phase-2/examples-benchmarks-quality.md`

## Assignment

Audit benchmark infrastructure, the durable-log spike, and both examples for buildability, deterministic contract checks, reproducibility, failure reporting, and documentation accuracy. Hypothesis: setup and interpretation quality can improve without changing production semantics or conducting new performance optimization.

## Ownership

Writable: `rust-service/crates/benchmarks/`, `crates/spikes/durable-log/`, `examples/counter/`, `examples/native-service/`, `benchmarks/`, and this report. Read-only: production crates, root docs/manifests/lockfiles, retained iteration records, and Fluid driver. Existing benchmark evidence is append-only; add new validation artifacts only when necessary and never rewrite historical results.

## Expected Evidence

- Inventory of executable examples, benchmark contracts, spike assumptions, setup commands, and retained-evidence guarantees.
- Focused checks for invalid configuration, correctness assertions, deterministic smoke sizes, failure reporting, and stale documentation.
- Runnable local docs that distinguish measurements from guarantees and identify environment requirements.
- Regression-backed fixes only; no throughput tuning or large benchmark matrix is required.

## Validation

Print checkout identity and tool versions. Run formatting, strict Clippy, and tests for owned crates; build and execute both examples with bounded smoke inputs; run benchmark help/configuration and smallest correctness smokes that do not require another stream's uncommitted work. Run `git diff --check`, preserve historical evidence, and verify lockfiles are unchanged.

## Escalation and Stopping Conditions

Stop before production semantic changes, benchmark workload redesign, dependency changes, or edits to historical evidence. Record unavailable external services rather than substituting a different arm. Escalate any correctness issue located in a read-only production crate with a minimized reproduction.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
