# Sea Architecture

## Purpose

This document records the current durable architecture and ownership rules for
Sea APIs, WebTransport, generated bindings, and application adapters.
Use it when changing these surfaces.
The completed [Sea API cleanup plan](SEA_API_CLEANUP_PLAN.md) remains the
historical execution record and rationale for the migration that produced this
architecture.

## Core Responsibilities

`sea-core` defines the application-independent storage, archive, author,
event-subscription, snapshot-coordination, monitored-stream, and error
contracts. Keep these contracts focused by ownership rather than collecting
unrelated capabilities into one broad trait.

`SeaStorage` is the trusted archive backend contract. Storage implementations
own retained events, immutable content, snapshot selection, and atomic catch-up
boundaries. They do not own author membership, transport framing, or application
policy.

`sea-sequencer` owns authoritative multi-user behavior over an archive:

- author and session identity;
- stable operation identity and ambiguity resolution;
- reference validation and minimum-reference state;
- event ordering and live delivery;
- snapshot participation, nomination, and fencing; and
- connection-independent session semantics.

`sea-conformance` expresses observable laws shared by implementations of these
contracts. A conformance law establishes substitutability; focused tests in an
implementation crate should still localize defects in behavior that crate owns
when practical.

## Client and Server Boundary

`sea-webtransport` owns the versioned Sea wire values, bounded frame codec, one
transport-independent client implementation, native client transport, and thin
browser and injected-transport bindings. Native and browser clients share
framing, correlation, ordering, logical-stream state machines, recovery, and
lifecycle behavior.

Target-specific code should be limited to operations that genuinely differ by
environment, such as opening a connection or stream, adapting byte I/O, native
`Send` and `Sync` bounds, and exporting WASM-facing values. Do not create
parallel native and browser implementations of client semantics.

`sea-webtransport-server` owns native endpoint binding, connection acceptance,
logical-stream dispatch, archive routing, transport liveness, measurements,
TLS, shutdown, and the deployable binary. It consumes shared protocol code from
`sea-webtransport`; the client crate must not depend on server, sequencer, or
storage implementation code for its production WASM build.

## Protocol and Streams

Every frame uses the shared bounded length-delimited envelope with an explicit
numeric message kind, a stream-scoped correlation ID, and a kind-specific
payload. Encoding must not depend on Rust declaration order or an implicit
serializer enum representation. Unknown kinds, unsupported protocol versions,
excessive lengths, invalid correlation, and messages on the wrong logical
stream are classified protocol errors.

One archive-bound connection uses persistent logical streams with distinct
responsibilities:

1. The event stream establishes the logical session and carries atomic snapshot
   selection, catch-up, monitored progress, and live events.
2. The author stream carries ordered submissions, receipts, ambiguity
   resolution, and author lifecycle.
3. The snapshot stream carries latest accepted snapshots, participation,
   nomination, and fenced publication.
4. Content-role streams carry correlated history, blob, directory, and snapshot
   lookup operations.

Opening a logical stream uses a WebTransport bidirectional stream, but known
operations must not silently fall back to a per-operation transport path.
Cancellation or failure belongs to the narrowest owning stream or connection
boundary defined by its contract.

Network message identifiers belong only to the Sea network protocol. Durable
sequencer records, encrypted payloads, blob directories, and other persisted
formats use independent encoding domains and versioning.

## Session and Snapshot Lifecycle

An archive is retained state. A logical session is connection-bound author
membership in one archive. A logical stream is a persistent transport stream
with one role. A client owns one transport connection and shared state for its
logical streams.

Creating an archive and opening an existing archive are explicit operations.
Content, author, and snapshot operations cannot create missing archive state as
a side effect.

Active I/O deadlines are separate from healthy idle-stream lifetime.
Connection loss, explicit close, replacement, liveness failure, and server
shutdown release the membership and snapshot authority owned by that
connection. Restart does not restore connection-scoped sessions or nomination
as active. Stale session or snapshot fencing authority cannot commit after
replacement or failover.

Snapshot participation is immutable for one snapshot stream:

- `ReadOnly` observes accepted snapshots and cannot publish.
- `SeaSelected` publishes only while holding Sea's current nomination fence.
- `ClientSelected` uses application-owned election and publishes without a Sea
  fence.

Any active client-selected publisher suppresses Sea selection. Nomination
selects publication authority; it does not request or schedule snapshot
generation. See [Decision 0012](decisions/0012-fluid-snapshot-election-integration.md).

## Generated Bindings and Application Adapters

The WASM adapter is a target-specific module of `sea-webtransport`, not a
separate implementation of the protocol client. Generated web and Node
packages come from the same crate target and are build artifacts; never edit
them by hand.

Generated TypeScript APIs should expose closed representations for finite Sea
cases and structured entries instead of stringly typed discriminators,
conditionally valid bags of fields, or `any`. Keep internal network message
kinds and framing out of application-facing TypeScript APIs.

Application adapters such as `SeaDriver` own only application-specific
projection and policy. For Fluid, this includes sequence-number conversion,
pending-operation identity and recovery, message serialization, summary and
blob-tree mapping, and translation to Fluid interfaces. Adapters should call
documented generated-client behavior directly where no real adaptation or
invariant is required.

## Change and Evidence Rules

When changing this architecture:

- document behavior at the contract consumers rely on;
- test owned behavior in the responsible module or crate when practical;
- use conformance tests for laws shared by multiple implementations;
- use native integration tests for crate, process, or transport composition;
- reserve generated-binding and browser tests for evidence that crosses those
  boundaries; and
- preserve broader tests only when they prove something distinct from focused
  coverage.

Follow the full documentation and behavioral test policy in
[DEVELOPMENT.md](DEVELOPMENT.md). Record a decision when a change alters shared
semantics, public contracts, protocol behavior, crate responsibilities, or
application integration policy.
