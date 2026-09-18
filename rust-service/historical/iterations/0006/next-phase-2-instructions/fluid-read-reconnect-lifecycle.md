# Iteration 0007: fluid-read-reconnect-lifecycle Instructions

Derived from iteration: 0006
Status: planned
Owner: GitHub Copilot implementation agent

## Approved Scope

Replace the SharedTree fixture's force-write host gate with a correct default Fluid read-to-write lifecycle. Preserve opaque DDS payloads and explicit caller-owned ambiguity recovery. Scope is approved by the [iteration 0006 Phase 3 next-scope review](../phase-3-report.md#next-iteration-scope).

## Prior Evidence

Iteration `0006` proved live convergence only after forcing write connections. Earlier runs showed that a read stream can receive remote sequence `3`, but replacement streams need preserved cursor/checkpoint/session and faithful audience/quorum behavior. See the [direct integration report](../phase-2/direct-shared-tree-integration.md#remaining-work-and-risks), [integration findings](../phase-2/integration.md#cross-workstream-findings), and [Decision 0007](../../../decisions/0007-projected-reads-and-ambiguity-recovery.md).

## Hypothesis and Discriminating Check

Hypothesis: a document-service-owned connection state containing the projected cursor/checkpoint, stable logical writer/session identity, and explicit membership projection is sufficient for Fluid's default read connection to upgrade to write without duplicate replay, hidden reconnect, or payload decoding.

Disprove first by removing `Fluid.Container.ForceWriteConnection`, loading a second SharedTree container in read mode, delivering one remote edit, mutating that second view, and asserting within a bounded trace that Fluid replaces the stream, submits exactly once, and both views converge. Stop before broad implementation if this requires synthetic sequence reuse, private FSQ2 decoding, or server-generated Fluid join/leave semantics absent from FSP4.

## Ownership and Dependencies

Writable: `rust-service/tests/minimal-fluid-driver/**` and the generated iteration `0007` workstream report. Read-only: kernel, sequencer, protocol, content store, native wrapper/server, root Cargo files, root pnpm workspace/lockfile, accepted decisions, and prior iteration records. This workstream depends only on iteration `0006` completion and is independent of `native-graceful-shutdown`.

Use one generated client per document service. Do not add automatic retry, decode DDS payloads, broaden into Routerlicious/ODSP, or claim production membership. Escalate if faithful lifecycle semantics require an FSP4 contract change; record the smallest missing field/operation before proposing one.

## Deliverables and Validation

- A default-mode Chromium trace with no force-write gate: initial read connection, remote delivery, read-to-write replacement, one edit per client, convergence, explicit disconnected submission resolution/resubmission, and cold replay.
- Actual generated-WASM Node coverage for shared reconnect state, stable identity, cursor/checkpoint transfer, local acknowledgement, and remote monotonicity.
- Exact connection modes, client/session counts, projected sequences, submission/resolution counts, FSP4 bytes, peak response, and elapsed time.
- Fresh dependency build, fresh Node/web wasm-bindgen output, format, lint, both typechecks/builds, focused tests, Chromium without insecure flags, `git diff --check`, and immediate proof that root lockfiles remain unchanged.
- Complete the generated report with all failed hypotheses and unsupported interfaces. Stop if success depends on hidden retry, unbounded polling, private payload decoding, or weakening authoritative ambiguity resolution.
