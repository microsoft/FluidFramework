# Decision 0011: Document-Local Event Positions

Status: accepted
Date: 2026-09-13
Iteration: lightweight
Owners: interactive user and GitHub Copilot
Supersedes: Decision 0005 for the assembled Fluid service only
Superseded by: none

## Context

The assembled service wrapped each storage position in a 16-byte service scope and converted it to a one-based ordinal by searching a rebuilt position vector. The sequencer then recovered ordering with another position collection and hash index. Profiling showed that this translation and ranking dominated single-writer local throughput even though each document has one append-only canonical event log.

Document identities are allocated or reserved by the service and are never reused. A request is routed to one document before any position is interpreted, and a connection may bind to that document. The canonical event log is append-only and is never rewritten.

## Decision Drivers

- Position validation and ordering must be constant time.
- Canonical event positions and Fluid sequence numbers must remain distinct because administrative records occupy event positions.
- Position tokens must remain stable across restart.
- A future prefix-truncation scheme must not renumber retained events.
- Generic storage implementations still need generation-scoped opaque codecs at their independent boundaries.

## Options and Evidence

- Retain service-scope-prefixed backend positions and reconstruct ordinal rank maps. Profiling showed repeated position collection, linear ranking, and projected replay dominated Rust local throughput, so this option was rejected.
- Use document-local absolute event ordinals with cached authoritative sequencing and projected-read state. This was selected because document identities are never reused, routing establishes the document boundary, and the log is append-only. The paced comparison after implementation placed Rust local memory within 1.8% of TypeScript local service throughput. [Evidence](../benchmarks/shared-tree/8a1d4e690e4/README.md)
- Expose backend byte offsets directly. Absolute offsets can remain stable with a retained truncation base, but they are not a uniform representation for every backend and are unnecessary at the service protocol boundary. They remain an implementation option beneath the selected ordinal contract.

## Decision

The assembled Fluid service uses a one-based absolute `u64` event ordinal as its document-local canonical position. Its protocol representation is exactly eight big-endian bytes. Document identity is carried by the selected document or bound connection and is not repeated in each position token.

Storage adapters convert their private generation-scoped positions to and from the ordinal in constant time. The sequencer parses each token once and compares ordinals directly. It does not maintain a position vector, rank map, or service-scope prefix.

A sequencer reconstructs authoritative state once when it acquires a fence, then validates and applies successful appends to that state for the lifetime of the lease. Projected reads use a compact ordinal-indexed submission ID list built by the same recovery and apply paths; they do not reread and replay the log for each page. Failover and ambiguous-outcome resolution continue to replay durable storage under the current fence.

If prefix truncation is added, storage will retain an absolute base ordinal and surviving records will keep their original positions.

## Consequences

Tokens from different documents may have identical bytes and must not be interpreted outside the selected document. The service boundary, not the token, enforces document isolation. Malformed, zero, and beyond-head positions remain invalid.

The live sequencer retains one optional submission ID per canonical event in addition to its existing accepted-submission index. This linear metadata cost replaces repeated full-log scans and does not duplicate operation payloads.

Decision 0005 continues to govern generic `PositionCodec` implementations. Backend generations remain private and continue to reject foreign positions; only the assembled service specializes their positions into its stronger document-lifetime contract.

## Validation and Follow-Up

Service tests verify identical local ordinals for isolated documents, monotonic positions including session records, snapshot position stability across restart, and rejection of invalid positions. Performance validation compares the Rust local driver with the TypeScript local driver under the paced single-writer SharedTree workload.
