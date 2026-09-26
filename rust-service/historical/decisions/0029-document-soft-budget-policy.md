# Decision 0029: Document Policy With An Outgoing Soft Budget

Status: accepted
Date: 2026-09-26
Owners: user, coordinator
Supersedes: the proposed publication protocol and mandatory lifecycle machinery in [Decision 0028](0028-session-factory-ownership-probe.md)
Superseded by: none

## Context And Decision

The user clarified that required live-reader entries must be retained even when the outgoing queue exceeds its configured budget.
Storage should own inbound accounting, primarily for durable-file storage, while document-wide session policy can consume storage/output observations and choose admission, backpressure, and shedding.
The user authorized revising the plan and salvaging the existing factory work, stopping at a clean committed boundary.

Treat outgoing capacity as a soft target and pressure signal, not a hard bound.
Retain the existing shared cache, cursors, neutral revocation, and sequencing semantics.
Do not require policy completion between publications or restructure lifecycle gates to bound policy-scheduling overshoot.
Reuse current storage/sequence input bounds rather than introducing an aggregate accounting ledger.
Pressure observations do not replace authoritative storage admission under racing writers.

Use one per-document session factory contract for local and remote implementations.
Decorating factories can share a document policy among returned sessions.
Ordinary construction supplies observations; a separate generic service-factory hierarchy is unnecessary for the first implementation.
Factory/pass-through infrastructure adds no policy or automatic cleanup.
Future lifecycle mechanisms must be justified by specific promised actions and cancellation tests, not inherited wholesale from the earlier proposal.

## Consequences

Slow or stopped readers may cause arbitrary soft-budget overrun until policy acts.
Unmanaged writers/readers and delayed policy execution prevent a hard-memory guarantee.
This is intentional and must remain visible in documentation and tests.
Accepted writes, internal controls, reconciliation, and close must never wait for reader consumption.
Policy callbacks remain outside storage, cache, and sequencing locks.
Transport delivery ownership and bounded waiting payloads still require explicit contracts.

The [revised plan](../../SESSION_RESOURCE_POLICY_PLAN.md) replaces old future checkpoints with stages A through E.
The next stopping point is the validated, reviewed document-factory foundation, not resource-policy implementation.
The previous cache results and draft reviews remain historical evidence; they do not establish new performance acceptance.
