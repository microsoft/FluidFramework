# Iteration 0002: reference-model-faults Instructions

Derived from iteration: 0001
Status: planned
Owner: GitHub Copilot reference/model agent

## Approved Scope

Own the iteration `0002` shared conformance evolution: add a small deterministic reference model, position-codec conformance, and fault tests for ambiguous append responses, interrupted reads, independent readers, and snapshot recovery. Do not add production persistence or transport behavior. Scope was approved in [iteration 0001 Phase 3](../phase-3-report.md#next-iteration-scope) and uses [Decision 0005](../../../decisions/0005-opaque-position-codec.md).

## Prior Evidence

[Reference iteration evidence](../phase-2/reference-conformance.md) established reusable direct/wrapper tests but lacks model comparison and deterministic operation faults. [Durable](../phase-2/durable-log.md) and [Fluid](../phase-2/fluid-sequencer.md) reports identified ambiguous outcomes that cannot be tested by the current harness. Memory's Phase 3 codec tests cover only one implementation.

## Hypothesis and Discriminating Check

Hypothesis: a deterministic sequential model plus injectable operation outcomes can express ordering, finite-read, generation, snapshot, codec, and ambiguous-response laws without implementation-specific hooks. The cheapest disproof is one model-generated trace or codec test that requires observing hidden implementation state or changing a shared semantic law.

## Ownership and Dependencies

Writable: `rust-service/crates/conformance/`, `rust-service/crates/memory/`, and this workstream's iteration `0002` report. Read-only: core, storage, wrappers, clients, workspace manifests, decisions, and other reports. This workstream owns conformance semantics; additions must identify the law and capability applicability. It may propose but not independently edit shared core traits.

## Deliverables and Validation

Deliver model traces with deterministic seeds, codec round-trip/malformed/foreign-generation tests, explicit ambiguous-response expectations, and results against every applicable integrated implementation. Run package format, strict Clippy, focused tests, and report the conformance commit consumed by other workstreams. Stop and escalate on a test that changes accepted semantics or needs implementation-private access. Retain machine-readable failing traces where practical and follow the coordination skill's checkout/lockfile evidence rules.
