# Decision 0018: Session Prefix Submission Identity

Status: accepted
Date: 2026-09-20
Iteration: lightweight direct work
Owners: Craig Macomber, GitHub Copilot
Supersedes: operation-ID lookup and exact event retry behavior in earlier experimental session APIs
Superseded by: none

## Context

The terminal append contract already requires accepted application events to form a prefix of each session's submissions.
An announced session's departure follows all accepted work and prevents further acceptance.
The separate operation-ID API and historical deduplication map add state, wire fields, and encryption lookups without being required for this recovery contract.

## Decision Drivers

- Simplify the session API and its implementations.
- Preserve terminal-prefix recovery, immutable event positions, and Fluid support.
- Remove per-submission historical lookup overhead without redesigning storage or adding a performance campaign.

## Options and Evidence

Keeping opaque operation IDs preserves exact retries but retains the API, historical map, and decorator complexity.
Replacing IDs with a server-maintained ordinal index would reproduce unnecessary indexing state.
Ordered session history already provides application ordinals, while archive positions identify committed events.
The [terminal append decision](0015-terminal-append-authority.md) supplies the required finality barrier.

## Decision

Remove operation IDs, event deduplication, and submission-resolution methods from core, transport, generated bindings, and TypeScript surfaces.
Every submit invocation is a new submission, including equal inputs.
Clients recognize their accepted prefix by session and application-event order through the terminal departure.
Applications own suffix transformation and may carry identifiers inside opaque payloads.
The Fluid driver verifies its ordered attempt prefix using Fluid client sequence numbers from those payloads; Sea does not interpret them.
Adapter-owned summary acknowledgments are excluded from the Fluid runtime attempt ledger.
Direct Tree clients count their own ordered acknowledgments.

## Consequences

The sequencer no longer retains a submission-deduplication map, and encryption no longer looks up previous ciphertext before each submission.
This does not bound the remaining retained history or change durable-file persistence.
Blob content deduplication, snapshot position/root reconciliation, and membership announcement idempotence are unchanged.
Persisted application and membership formats become `SEAQ4` and `SEAM3`; the network protocol becomes version 9.
Earlier experimental formats are rejected, with no compatibility shim or implicit migration.
Clients and servers must be rebuilt together.
These packages expose internal-only APIs, so the repository changeset guidance excludes a customer release changeset.

## Validation and Follow-Up

Focused sequencer and conformance tests require equal submissions to produce distinct positions and preserve cancellation, ambiguity, and terminal leave behavior.
Codec tests explicitly reject prior format markers.
Decorator, transport, generated-WASM, and composition tests cover the shared boundary.
Fluid recovery tests cover lost receipts, missing departure, incomplete accepted prefix, and transformation of only the unaccepted suffix.
The canonical workspace gates and Sea-backed Fluid integration tests remain required before completion.
Reconsider this decision only if a new consumer requires a contract that cannot be expressed through ordered session history and application-owned identifiers.