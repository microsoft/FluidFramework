# Iteration 0003: process-isolated-transport Instructions

Derived from iteration: 0002
Status: planned
Owner: GitHub Copilot process-isolated-transport agent

## Approved Scope

Prototype a bounded framed process-isolated transport for append, finite reads, snapshots, and opaque positions. Use real IPC or loopback sockets and explicit reconnect; preserve raw semantics without hidden retry or live tailing. The user approved this scope while explicitly deferring a shared asynchronous `PositionCodec` change in [iteration 0002 Phase 3](../phase-3-report.md#next-iteration-scope).

## Prior Evidence

[Decision 0005](../../../decisions/0005-opaque-position-codec.md) accepts implementation-owned opaque tokens. The [network report](../phase-2/network-transport.md) proves bounded local channels and composition, but delegates synchronous codec calls through a cloned backend and therefore is not process isolated. The [integration findings](../phase-2/integration.md#cross-workstream-findings) identify this as the remaining transport abstraction question.

## Hypothesis and Discriminating Check

A process-isolated protocol can expose client positions as validated opaque token values, perform backend encode/decode while handling asynchronous requests, and implement the existing traits without changing `PositionCodec`. The cheapest disproof is a two-process capacity-one read/reconnect trace that cannot round-trip and resume from a returned position without local backend access, hidden retry, duplication, loss, or an unbounded queue.

## Ownership and Dependencies

- Writable paths: `crates/wrappers/network/` and this workstream's iteration `0003` report.
- Dependencies: bounded local transport behavior, Decision 0005, memory and conformance fixtures, and optional compression composition.
- The workstream may add network-crate dependencies and test helpers, but must leave the shared lockfile unchanged and report integration regeneration.
- Do not edit core, `PositionCodec`, conformance, durable storage, Fluid sequencing, decisions, or another report. If the current API cannot express the protocol, stop with the smallest failing design/test and propose alternatives for Phase 3 instead of changing it.

## Deliverables and Validation

- Define deterministic versioned frames and limits for requests, records, errors, positions, and snapshots; reject malformed or oversized frames with stable classifications.
- Test process isolation, capacity-one backpressure, finite-read boundaries, disconnect, explicit reconnect/resume, foreign/stale tokens, snapshots, and compression-before-transport ordering.
- Measure wire bytes and queue peaks under the same documented payload used by the local transport where comparison is valid.
- Run focused tests, strict package Clippy, workspace formatting, and an unchanged-lockfile check with checkout identity.
- Stop before authentication, encryption, live subscriptions, automatic reconnect, or broad protocol optimization.
