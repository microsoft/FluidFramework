# Iteration 0005: minimal-typescript-fluid-driver Instructions

Derived from iteration: 0004
Status: planned
Owner: assigned iteration `0005` implementation agent

## Approved Scope

Build the smallest TypeScript Fluid driver and browser application trace that uses projected operations, explicit ambiguity recovery, blobs/summaries, and the packaged WASM client. This is a vertical-slice validation, not Routerlicious or ODSP compatibility.

## Prior Evidence

The iteration `0004` [Phase 3 report](../phase-3-report.md#next-iteration-scope) identifies the driver as the consumer-level proof of the three preceding workstreams. [Decision 0007](../../../decisions/0007-projected-reads-and-ambiguity-recovery.md) defines read/recovery semantics and [Decision 0008](../../../decisions/0008-portable-wasm-client-boundary.md) defines the package/test boundary. Existing Fluid interfaces cited in `PLAN.md` separate bounded delta reads, live connection submission, and pending-state policy.

## Hypothesis and Discriminating Check

Hypothesis: a minimal Fluid application can create, load, submit, summarize, disconnect, reconnect, and recover through the packaged client without decoding canonical FSQ2 records or inventing retry policy. Disprove first with a two-client counter/shared-object trace where reconnect loses, duplicates, or reorders an acknowledged operation or reload cannot fetch its summary blobs.

## Ownership and Dependencies

Wave 3 consumer. Scaffolding and interface mapping may begin read-only, but meaningful implementation waits for integrated projected-read/recovery, blob/summary, and browser-package prerequisites. Writable paths are a new minimal TypeScript driver package/example, focused test harnesses, and this report. Do not alter shared Rust protocol semantics, copy FSQ2 decoding, bypass the WASM package, claim full Fluid-driver compatibility, or add automatic merge/offline-first behavior.

## Deliverables and Validation

Deliver the minimal required Fluid driver interfaces, create/load path, bounded historical reads, live submission, blob and summary storage, disconnect/reconnect, explicit pending recovery, and a real browser example. Validate unit contract tests in Node plus a two-client Chromium trace covering reload from summary, concurrent submissions, disconnect before/after commit, and no loss/duplication. Record unsupported Fluid interfaces explicitly. Stop if the driver requires private canonical decoding, environment-specific FSP4 semantics, hidden retry, or unimplemented blob/summary guarantees.
