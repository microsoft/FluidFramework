# Iteration 0002: authoritative-sequencer Instructions

Derived from iteration: 0001
Status: planned
Owner: GitHub Copilot authoritative Fluid sequencer agent

## Approved Scope

Replace the projection-only feasibility spike with a valid-only authoritative Fluid submission service over the opaque stream. Reject invalid operations before storage, require stale clients to reconnect under a new session and regenerate submissions, and test single-active-sequencer fencing plus ambiguous append recovery. Scope is defined by [Decision 0004](../../../decisions/0004-authoritative-fluid-sequencer.md).

## Prior Evidence

[The iteration 0001 Fluid report](../phase-2/fluid-sequencer.md) proved deterministic projection but showed that post-commit validation leaves rejected records in raw storage. The user selected behavior matching existing TypeScript Fluid sequencing: stale-reference rejection, reconnect, and regenerated resubmission. Conditional append remains unpromoted pending this experiment.

## Hypothesis and Discriminating Check

Hypothesis: one explicitly fenced sequencer can serialize validation and append so invalid operations never enter the canonical stream, and submission identity plus replay can resolve ambiguous append outcomes without a kernel conditional append. The cheapest disproof is a deterministic fencing-loss or ambiguous-response trace that permits two accepted successors, loses an accepted operation, or requires unsafe duplicate append.

## Ownership and Dependencies

Writable: `rust-service/crates/fluid-sequencer/` and this workstream's iteration `0002` report. Read-only: core, stores, conformance, workspace manifests/lockfile, decisions, and reports. Use `PositionCodec` tokens supplied by integration. Do not add conditional append, deduplication, or session semantics to the kernel; minimize and escalate any irreducible requirement.

## Deliverables and Validation

Deliver tests for valid-only storage, stale-reference rejection before append, writer gap/duplicate rejection, reconnect as a new session, regenerated resubmission, fencing loss, failover replay, ambiguous committed/not-committed outcomes, and submission deduplication. State precisely when the client receives protocol acceptance versus storage ambiguity. Run package format, strict Clippy, tests, and integrated workspace checks; compare behavior with cited Deli/PendingStateManager precedents. Stop with a minimized conditional-append requirement if fencing cannot preserve one authoritative successor.
