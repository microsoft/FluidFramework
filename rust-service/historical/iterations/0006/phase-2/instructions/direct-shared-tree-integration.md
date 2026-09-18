# Iteration 0006: direct-shared-tree-integration Instructions

Status: planned
Branch: `rust-service-iteration-0006-direct-shared-tree-integration`
Iteration source commit: `3a72dfe57b8f3b9ee96befd18c85616440fea8e7`
Owner: GitHub Copilot implementation agent
Report: `rust-service/iterations/0006/phase-2/direct-shared-tree-integration.md`

## Assignment

After the native concurrency handoff, run a real SharedTree/Fluid container through the minimal WASM driver in two independent browser sessions. Hypothesis: the selected driver surface supports create/load, one edit per client, convergence, summary/reload, reconnect, and explicit ambiguity recovery without FSQ2 decoding or hidden retry. Disprove first with the smallest one-field or one-schema SharedTree fixture; stop if container creation/load invokes a mandatory unsupported method or independent clients fail to converge. Routerlicious, ODSP, production auth, offline merge, and complete driver support are excluded.

## Ownership

This workstream depends on the accepted `native-connection-concurrency` handoff. Before that handoff, only read-only API inspection and disjoint fixture preparation are allowed; do not implement around the serial server or claim browser completion. Writable after handoff: a new focused SharedTree package/harness under `rust-service/tests/`, narrow additions to `rust-service/tests/minimal-fluid-driver/`, and `rust-service/iterations/0006/phase-2/direct-shared-tree-integration.md`. Integration owns root pnpm registration and lockfiles. Kernel, sequencer, protocol, content store, native server, and generated WASM core are read-only. Do not decode FSQ2, invent protocol variants, or add automatic retry/reconnect.

## Expected Evidence

- A minimal real SharedTree/container fixture using repository Fluid packages and the accepted driver.
- Exact documentation of any narrow driver additions and every unsupported interface reached.
- Actual-WASM Node tests for adapter additions where deterministic transport injection is useful.
- A two-session Chromium trace covering create/load, one edit per client, convergence, bounded projected history, full summary publication/reload, disconnect, authoritative resolution, and caller-owned resubmission only after `NotCommitted`.
- Report dependency versions/declaration provenance, FSP4 bytes, peak response, session/client counts, projected sequences, summary/blob counts, reconnect timing, and convergence after reload.
- A coherent implementation commit and completed workstream report.

## Validation

Print absolute checkout, branch, HEAD, and protected root-file status. Build the exact Fluid and SharedTree dependency declarations required by the fixture. Run repository-standard Biome/ESLint as applicable, TypeScript typecheck, build, and focused tests; actual generated-WASM Node tests; fresh browser binding generation from the accepted Rust source; and Chromium without insecure flags using two independent sessions. Use checkout-specific Cargo targets. Verify root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `rust-service/Cargo.toml`, and `rust-service/Cargo.lock` remain unchanged outside integration ownership. Run `git diff --check`.

## Escalation and Stopping Conditions

Stop and escalate if the concurrency handoff is absent or regresses, SharedTree requires private FSQ2 decoding, incompatible FSP4 semantics, hidden retry, retention guarantees, or broad production-driver implementation. Preserve the smallest unsupported-method or convergence fixture and document the exact Fluid call path. Do not silently substitute two logical clients on one transport session for the required evidence.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
