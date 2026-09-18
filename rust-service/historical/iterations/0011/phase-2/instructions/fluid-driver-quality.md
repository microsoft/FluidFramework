# Iteration 0011: fluid-driver-quality Instructions

Status: active
Branch: `rust-service-iteration-0011-fluid-driver-quality`
Iteration source commit: `0d2c7e367767978b267831ca34aba6e398948bdf`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0011/phase-2/fluid-driver-quality.md`

## Assignment

Audit the minimal TypeScript Fluid driver for pending-submission ordering, streamed acknowledgements, reconnect/recovery/resubmit behavior, subscription cursor lifecycle, disposal, and package documentation. Hypothesis: injected deterministic transports can test the new streaming path and failure states that the existing unary contract tests do not cover, without changing Fluid public APIs or generated Rust bindings.

## Ownership

Writable: `rust-service/tests/minimal-fluid-driver/` except generated `pkg/` and `pkg-local/`, plus this report. Read-only: Rust crates, generated bindings, retained benchmark evidence, workspace packages, manifests/lockfiles outside the package, and accepted decisions. Do not change benchmark workloads, Fluid public APIs, protocol encoding, or dependency versions.

## Expected Evidence

- Lifecycle-to-test inventory covering queued writes, ordered responses, write/read failure, reconnect, `recoverPending`, `resubmitPending`, subscription restart, synchronization, and disposal.
- An injected submission-stream fixture and focused regression tests for material uncovered states.
- Package-level documentation for supported behavior, limitations, setup, and validation.
- Minimal bug fixes only when a deterministic test fails first; preserve unary fallback behavior.

## Validation

Print checkout identity and Node/pnpm versions. Run package format check, lint, build, unit tests, both typechecks where workspace dependencies resolve, and all benchmark bundle builds. Record unrelated dependency-resolution blockers precisely. Run `git diff --check` and verify lockfiles and generated packages are unchanged.

## Escalation and Stopping Conditions

Stop before Fluid API, protocol, generated binding, dependency, or benchmark-workload changes. Escalate behavior that requires transport changes. Do not hide rejected promises or weaken ambiguous-submission recovery merely to make reconnect tests pass.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
