# Decision 0001: Byte and Reader Contract

Status: accepted
Date: 2026-09-12
Iteration: foundation
Owners: interactive user and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

The kernel needs an append value and a backpressured historical-read shape without introducing event framing, lifetime coupling, or live-subscription races.

## Decision Drivers

Opaque payloads should be cheap to clone, append boundaries must remain visible, readers must not buffer an unbounded stream, and local and future transport implementations need the same contract.

## Options and Evidence

Borrowed byte slices complicate asynchronous ownership. Generic append types make wrappers and conformance harder to compose. A live stream combines historical catch-up with race-sensitive subscription semantics. The counter example and memory conformance suite compile using owned `Bytes` records and a finite `Stream` reader.

## Decision

Append accepts immutable owned `Bytes`. Each successful append produces one `ReadRecord`, including zero-length appends. `read` returns records strictly after an optional opaque position and ends at the head captured when the call begins. Dropping the reader cancels delivery; live tailing remains an optional capability.

## Consequences

Implementations preserve record boundaries and can expose demand-driven reads without kernel framing. Applications needing live updates perform explicit repeated reads or use a later capability. Payload ownership may require a copy at API boundaries that cannot produce `Bytes` directly.

## Validation and Follow-Up

The memory tests and shared conformance suite cover boundaries, zero-length payloads, strict-after behavior, finite completion, and generation scoping. Iteration `0001` file, compression, and transport research may justify reconsideration.
