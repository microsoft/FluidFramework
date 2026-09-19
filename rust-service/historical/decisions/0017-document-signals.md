# Decision 0017: Independent Document Signals

Status: accepted
Date: 2026-09-19
Iteration: lightweight work on `sea-signals`
Owners: user and implementation agent
Supersedes: none
Superseded by: none

## Context

Live application state needs document-scoped messaging without sequenced operations, persistence, or replay.
The existing ordered membership remains necessary for writer authority and Fluid quorum, but is not the lifecycle for ephemeral routing.

## Decision Drivers

- Keep the core contract and relay independent of Fluid and storage.
- Preserve reliable live delivery for existing Fluid/Presence consumers.
- Make loss-tolerant datagrams explicit and interoperable with reliable-only recipients.
- Bound application queues and expose reliable overflow as failure.

## Options and Evidence

Persisting signals as events would couple transient traffic to archive ordering and recovery.
A datagram-only channel would exclude WebSocket consumers and change existing Fluid expectations.
Separate reliable membership and messages with opt-in datagrams provides both paths without introducing Presence interpretation in the server.
The native host test, generated memory regression, and mixed-transport Chromium test exercise distinct boundaries.
Fluid's existing `TestSignals` and `Targeted Signals` suites pass against the Rust service.

## Decision

`sea-core::signals` defines independent document factories, connections, membership events, and opaque messages.
`sea-signals` owns a bounded memory-only room; the host owns document lookup and identity admission.
Reliable is the default; best effort permits loss, reordering, and reliable fallback before datagram admission.
Inbound and outbound hops select transport independently, with no Sea retry after possible delivery.
Membership observations always use reliable transport and begin with a current snapshot.
Broadcast includes self, missing targets are successful no-ops, and routing never crosses rooms.
WASM and TypeScript expose the same connection separately from archive facets.
The Fluid adapter uses reliable messages and live audience membership while preserving ordered writer quorum records.

## Consequences

Protocol version 8 requires coordinated client/server rebuilds.
Signals do not advance archive positions or reference floors, and archive payload decorators do not transform them.
Close and connection loss end live membership; reconnect uses a fresh snapshot and never replays traffic.
The remote implementation currently admits one signal registration per physical connection lifetime to keep delayed datagrams bound to that registration.
Multiple independent registrations on one connection would require explicit datagram registration identifiers and lifecycle negotiation.
The built-in host is not authenticated; unique proposed identities and document existence checks are not authorization.
Rate limiting, tenant quotas, multi-host routing, and Presence-specific convergence testing remain separate work.

## Validation and Follow-Up

Owning relay tests cover routing, limits, no replay, slow consumers, stale handles, receive cancellation, and cleanup.
Transport tests cover signal payload codecs and client overflow policy.
The server test covers real QUIC and unchanged archive history; Chromium covers generated bindings and mixed transports.
The existing Fluid signal suites cover runtime broadcast and targeting over ordinary WebSocket.
See [Sea Signals](../../crates/sea-signals/README.md) and [Sea WebTransport](../../crates/sea-webtransport/README.md) for operational contracts and limits.