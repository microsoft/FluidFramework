# Iteration 0006: direct-shared-tree-integration Instructions

Derived from iteration: 0005
Status: planned
Owner: GitHub Copilot implementation agent

## Approved Scope

Run a real SharedTree/Fluid container through the minimal WASM driver in two independent browser sessions. The user approved this as iteration `0006` Wave 2 in the [iteration 0005 Phase 3 report](../phase-3-report.md#next-iteration-scope). Keep the integration minimal and honest; do not claim Routerlicious, ODSP, production auth, offline merge, or complete Fluid driver support.

## Prior Evidence

Iteration `0005` proved the selected driver interfaces with actual WASM in Node and two logical clients over one Chromium transport session. See the [driver report](../phase-2/minimal-typescript-fluid-driver.md), [portable WASM decision](../../../decisions/0008-portable-wasm-client-boundary.md), and [projected recovery decision](../../../decisions/0007-projected-reads-and-ambiguity-recovery.md). The missing evidence is a real SharedTree consumer over two independent sessions after native connection concurrency is accepted.

## Hypothesis and Discriminating Check

Hypothesis: the implemented driver surface is sufficient for two real SharedTree clients to create/load one document, converge edits, summarize/reload content, reconnect, and resolve ambiguous submission outcomes without FSQ2 decoding or hidden retry. Disprove first with the smallest two-browser SharedTree fixture using one field or schema; if container creation/load invokes an unsupported mandatory driver method or two independently connected clients fail to converge one edit each, stop before broadening the adapter.

## Ownership and Dependencies

This workstream depends on the accepted `native-connection-concurrency` handoff and may only inspect APIs or prepare a fixture before that evidence exists. After handoff, own a new focused SharedTree integration package/harness under `rust-service/tests/`, narrow additions to `rust-service/tests/minimal-fluid-driver/`, and this workstream report. Integration owns root pnpm registration and lockfiles. Do not decode FSQ2, invent protocol variants, add automatic retry/reconnect, or modify kernel/sequencer semantics. Use the existing generated WASM API and actual Fluid/SharedTree packages already governed by the repository.

## Deliverables and Validation

- Build the exact Fluid and SharedTree package prerequisites needed by the fixture and record versions/declaration provenance.
- Add Node tests for any driver adapter additions through actual generated WASM; mocks may isolate Fluid orchestration but cannot replace package or browser evidence.
- Run repository-standard format, lint, typecheck, build, and tests for the focused package.
- Generate fresh browser WASM bindings and run Chromium without insecure flags using two independent `BrowserClient` sessions. Cover create/load, one edit per client, convergence, bounded projected history, full summary publication/reload, disconnect, authoritative resolution, and caller-owned resubmission only after `NotCommitted`.
- Report every unsupported interface reached by the real container, FSP4 bytes, peak response, session/client counts, projected sequences, summary/blob counts, reconnect timing, and whether both clients converge after reload.
- Stop and escalate if SharedTree requires private FSQ2 decoding, incompatible protocol semantics, hidden retry, retention guarantees, or broad implementation of unsupported production driver surfaces.
