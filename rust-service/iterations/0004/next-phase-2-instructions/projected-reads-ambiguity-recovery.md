# Iteration 0005: projected-reads-ambiguity-recovery Instructions

Derived from iteration: 0004
Status: planned
Owner: assigned iteration `0005` implementation agent

## Approved Scope

Implement [Decision 0007](../../../decisions/0007-projected-reads-and-ambiguity-recovery.md): sequencer-owned projected accepted-operation reads and explicit live ambiguity resolution through FSP4. Preserve opaque cursors, bounded finite reads, stable submission identities, caller-owned retry, and the generic kernel unchanged.

## Prior Evidence

Iteration `0004` [integration](../phase-2/integration.md#cross-workstream-findings) found that service reads expose canonical records and that a live `RecoveryRequired` service has no FSP4 resolver. The [service report](../phase-2/service-assembly.md) observed administrative records in history; the [lifecycle report](../phase-2/native-client-lifecycle.md) proved disconnect-before/after-commit require explicit authoritative resolution.

## Hypothesis and Discriminating Check

Hypothesis: the sequencer can project accepted operations and resolve one stable ambiguous submission through versioned FSP4 without changing kernel traits or introducing hidden retry. Disprove first with a mixed session/operation page whose opaque resume skips or duplicates an operation, or a disconnect-after-commit trace that appends twice or cannot resolve while the service remains live.

## Ownership and Dependencies

Wave 1 protocol owner. Writable paths: `crates/fluid-sequencer`, `crates/protocol`, `crates/service`, focused `crates/client` adaptations, applicable tests/examples, and this workstream report. It provides the first shared FSP4 prerequisite to the blob, browser-package, and driver workstreams. Root workspace/lockfile changes belong to integration. Do not change core traits, expose position ordering, decode FSQ2 in clients, add automatic retry, or weaken fencing.

## Deliverables and Validation

Deliver projected operation types, bounded pagination semantics, protocol compatibility behavior, explicit recovery requests/results, and client events. Test administrative-only spans, exact resume, malformed/foreign cursors, accepted/duplicate submissions, disconnect before/after commit, lost resolution response, repeated resolution, restart, wrong ownership, and no duplicate append. Run focused format, strict Clippy, tests, service process traces, and applicable conformance in an isolated target. Stop and escalate if projection needs kernel payload knowledge, recovery needs hidden retry, or protocol authorization cannot prevent cross-writer resolution.
