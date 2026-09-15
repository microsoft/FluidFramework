# Iteration 0004: native-client-lifecycle Instructions

Derived from iteration: 0003
Status: planned
Owner: GitHub Copilot native-client-lifecycle coding agent

## Approved Scope

Replace the counter-only native façade with an explicit service client lifecycle: connect, recover snapshot and tail, maintain session and submission identity, expose disconnect/ambiguity, reconnect as a fresh session, and let callers regenerate or abandon pending work. The [iteration 0003 Phase 3 report](../phase-3-report.md#next-iteration-scope) approves this native client scope. Offline-first storage, automatic conflict resolution, and a TypeScript Fluid driver are excluded.

## Prior Evidence

The current [client crate](../../../crates/client/src/lib.rs) only wraps a generic counter. [Decision 0004](../../../decisions/0004-authoritative-fluid-sequencer.md) requires fresh-session reconnect, regenerated pending operations, and distinct protocol acceptance. [Process transport](../phase-2/process-isolated-transport.md) established explicit reconnect and resume tokens without hidden retry.

## Hypothesis and Discriminating Check

Hypothesis: a small typed state machine can make connection, recovery, pending submissions, ambiguity, and resubmission explicit without transport-specific policy or hidden retry. The cheapest disproof is a deterministic disconnect-before-ack/disconnect-after-commit trace in which the API cannot distinguish safe regeneration from replay resolution.

## Ownership and Dependencies

- Wave 2: design may start against accepted sequencer semantics; transport-backed integration waits for the service protocol from service assembly.
- Writable: `rust-service/crates/client/` and the eventual iteration `0004` native-client-lifecycle report.
- Depend only on transport-neutral protocol/client traits; Unix and WebTransport adapters are fixtures, not lifecycle owners.
- Do not add background reconnect, automatic resubmission, payload-specific merge logic, or kernel API changes.
- Do not commit the shared lockfile. Report root/dependency changes for integration.

## Deliverables and Validation

- Define documented states and transitions for disconnected, connecting, recovering, connected, ambiguous, and closed behavior, with cancellation and shutdown.
- Test clean connect, recovery, invalid/stale submission, disconnect before/after commit, ambiguity resolved by replay, fresh-session reconnect, regenerated stable identity, duplicate acknowledgement, and caller abandonment.
- Run focused tests, strict Clippy, rustfmt, and a process-backed lifecycle trace with bounded timeouts and an isolated target directory.
- Report API examples, forbidden transitions, retry policy, exact tests, failures, dependencies, and commits.
- Stop if correctness requires hidden retries, comparing opaque positions, or assigning protocol acceptance to raw storage receipts.
