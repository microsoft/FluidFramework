# Decision 0014: Ordered Session Membership

Status: accepted
Date: 2026-09-19
Iteration: lightweight integration-test assignment
Owners: user (scope authorization), integration-test workstream (implementation)
Supersedes: none
Superseded by: none

## Context

Configuration checkpoint `4d9c1906dab` runs the existing multi-driver tests against SEA without changing defaults.
Its lifecycle smoke exposed inconsistent invented quorums: each driver connection created two synthetic joins and collapsed all remote authors into one identity.
The user authorized extending the neutral session API and service bindings to implement authoritative membership.

## Decision Drivers

- All peers must replay the same member identities and event order.
- A client cannot reliably publish its own departure after abrupt disconnection.
- Fluid-specific messages belong in the driver, not neutral storage or session contracts.
- Existing unannounced sessions must retain submission-only history and retry semantics.
- Cancellation and storage ambiguity must use the sequencer's retained mutation mechanism.

## Options and Evidence

Suppressing synthetic members in the synchronization test hides the missing contract and was rejected.
Client-authored join/leave events cannot authoritatively handle disconnected peers.
A separate ephemeral presence stream cannot by itself reproduce the same ordering after reload or across snapshot boundaries.
Opt-in durable membership records share the existing archive order and recovery machinery without introducing another sequencer.

## Decision

`announce_membership(metadata)` publishes one joined record for the current membership.
Metadata is immutable public control data, like author/session identities; payload decorators neither compress nor encrypt it.
Exact retries return the original position; different metadata is rejected.
Close, same-author replacement, and shutdown settle a left record before ending announced membership authority.
Recovery scans outstanding announcements and appends their departures before admitting new sessions.
Connection-loss detection remains transport-owned; server cleanup invokes the same session close operation.
There is no immediate departure guarantee before transport failure detection.

`SessionEventKind` distinguishes application, joined, and left records.
The existing submission encoding remains readable; membership uses a separate `SEAM1` envelope, and does not occupy the application's operation-ID index.
Event payloads carry public joined metadata or empty departure bytes.
Neutral WASM/TypeScript bindings expose `eventType` and `announceMembership`.
The remote protocol version advances to 6 so old clients do not silently misinterpret membership records.

The neutral Fluid adapter projects session identities consistently, retains membership in dense history, and removes synthetic sequence slots.
Read-only records advance history without adding readers to the writer quorum.
Legacy injected benchmark clients retain their existing projection; they must not share documents with the new projection.
No data migration between those experimental document formats is provided.

## Consequences

Writer collaboration can satisfy the existing quorum-based synchronization contract without test-specific suppression.
Durable membership adds events only for clients that explicitly announce.
Readers must account for control records, and snapshot state must include the membership state at its chosen boundary.
Public metadata must not contain secrets; applications needing confidential member metadata require a separate design.
Signals, audience presence, automatic reconnect, minimum-sequence policy, and full Fluid integration conformance remain separate work.
The neutral package's internal-only API changes require coordination with ongoing ServiceClient work at integration.

## Validation and Follow-Up

Owning sequencer regressions cover encoding, malformed records, idempotence, shared event order, close, replacement, and recovery.
The existing composition matrix checks public metadata and protected application payloads through every compression, encryption, and repeated-transport configuration.
Generated Node coverage checks the neutral binding; driver coverage checks identical replay and actual writer identities.
The unchanged real-service lifecycle smoke passes.
Canonical Rust/browser and repository gates are required before the fix checkpoint.
Retain failures and justified exclusions in the [integration-test plan](../INTEGRATION_TEST_CONFIGURATION_PLAN.md); this decision does not claim the complete suite passes.