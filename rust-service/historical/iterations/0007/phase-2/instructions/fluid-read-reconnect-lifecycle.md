# Iteration 0007: fluid-read-reconnect-lifecycle Instructions

Status: planned
Branch: `rust-service-iteration-0007-fluid-read-reconnect-lifecycle`
Iteration source commit: `9c65ff3e7b6439a844461d215826491b36bb15e1`
Owner: GitHub Copilot implementation agent
Report: `rust-service/iterations/0007/phase-2/fluid-read-reconnect-lifecycle.md`

## Assignment

Replace the SharedTree fixture's `Fluid.Container.ForceWriteConnection` gate with a correct default Fluid read-to-write lifecycle while preserving opaque DDS payloads and explicit caller-owned ambiguity recovery.

Hypothesis: document-service-owned state containing the projected cursor/checkpoint, stable logical writer/session identity, pending submissions, and explicit membership projection is sufficient for Fluid to replace a read connection with a write connection without duplicate replay or hidden reconnect.

Disprove first by removing the force-write gate, loading a second SharedTree container in read mode, delivering one remote edit, mutating that second view, and asserting within a bounded trace that Fluid replaces the stream, submits exactly once, and both views converge. Preserve the iteration `0006` disconnected-before-commit recovery and cold-replay checks.

## Ownership

Writable: `rust-service/tests/minimal-fluid-driver/**` and `rust-service/iterations/0007/phase-2/fluid-read-reconnect-lifecycle.md`.

Read-only: kernel, sequencer, protocol, content store, native wrapper/server, root Cargo files, root pnpm workspace/lockfile, decisions, prior iteration records, and the native shutdown workstream.

Use one generated client per document service. Do not add automatic retry, decode DDS payloads, broaden into Routerlicious/ODSP, implement live projected streaming, or claim production membership.

## Expected Evidence

- A default-mode Chromium trace with initial read connection, remote delivery, read-to-write replacement, one edit per client, convergence, explicit disconnected submission resolution/resubmission, and cold replay.
- Actual generated-WASM Node coverage for shared reconnect state, stable identity, cursor/checkpoint transfer, local acknowledgment, and remote monotonicity.
- Exact connection modes, client/session counts, projected sequences, submission/resolution counts, FSP4 bytes, peak response size, elapsed time, and before/after benchmark results.
- A complete workstream report containing all failed hypotheses, unsupported interfaces, commits, and evidence.

## Validation

- Print the absolute worktree path, branch, and HEAD with every delegated validation result.
- Generate fresh Node and web wasm-bindgen output from this checkout using the required `web_sys_unstable_apis` cfg.
- From `rust-service/tests/minimal-fluid-driver/`: `pnpm run check:format`; `pnpm run lint`; `pnpm run typecheck`; `pnpm run typecheck:shared-tree`; `pnpm run build`; `pnpm test`; `pnpm run build:shared-tree`; `pnpm run build:benchmarks`.
- Run the default-mode Chromium lifecycle trace and the existing SharedTree regression without insecure browser flags.
- Run the committed Rust SharedTree benchmark configuration for before/after evidence.
- Run `git diff --check` and immediately prove `Cargo.lock` and the root `pnpm-lock.yaml` are unchanged.

## Escalation and Stopping Conditions

Stop if correct behavior requires synthetic sequence reuse, private FSQ2 decoding, hidden retry, unbounded polling, production server-generated join/leave semantics absent from FSP4, or a shared FSP4/kernel/sequencer change. Record the smallest missing contract and retain a failing generated-WASM or Chromium check. If default lifecycle succeeds but still requires projected-read polling, report streaming requirements for Phase 3 rather than expanding scope.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
