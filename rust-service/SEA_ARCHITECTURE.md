# Sea Architecture

## Purpose

This document records the current durable architecture and ownership rules for
Sea APIs, WebTransport, generated bindings, and application adapters.
Use it when changing these surfaces.
The [core migration plan](CORE_MIGRATION_PLAN.md) records the current storage/session migration and acceptance evidence.
The completed [Sea API cleanup plan](SEA_API_CLEANUP_PLAN.md) remains historical evidence for the earlier client and crate cleanup.

## Core Responsibilities

`sea-core::storage` defines document factories, blob stores, event archives, snapshot archives, and their composed `SeaView`.
The sibling `sea-core::session` defines archive, author, and snapshot-coordination facets above storage.
Identity, event, monitored-stream, and classified-error primitives are shared.

`SeaStorage` allocates opaque document IDs and exclusively opens the document's components.
`SeaView` establishes content and event availability before publishing dependent events or snapshots.
Availability handles prove locally resolved dependencies; they are neither serialized wire values nor independent writer authority.
Storage retains full committed histories with dependency-closed recovery, but does not own membership, application deduplication, or transparent append retry.

`LoadStart` selects no snapshot, a snapshot at or before a cursor, or the latest snapshot.
Loading returns the selected snapshot and a live event suffix without capturing an atomic event head.
For reconstruction through a known position, select a suitable snapshot and use a bounded read.

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

The runtime shares one exclusive view across memberships.
Membership and publisher selection are runtime-local; recovery restores committed submission identities, not active connections.
Cancelled mutation futures remain owned by the runtime until a subsequent operation drives settlement.
Returned append ambiguity is reconciled by a bounded scan, not automatic resubmission; failed reconciliation requires recovery.

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

The host caches one recovered sequencer per document, serializes first opening, and does not cache failed recovery.
Successful runtimes remain cached for the host lifetime; idle eviction is not implemented.

## Protocol and Streams

Every frame uses the shared bounded length-delimited envelope with an explicit
numeric message kind, a stream-scoped correlation ID, and a kind-specific
payload. Encoding must not depend on Rust declaration order or an implicit
serializer enum representation. Unknown kinds, unsupported protocol versions,
excessive lengths, invalid correlation, and messages on the wrong logical
stream are classified protocol errors.

One archive-bound connection uses persistent logical streams with distinct
responsibilities:

1. The event stream establishes the logical session and carries snapshot
  selection, catch-up, monitored progress, and live events without an atomic captured head.
2. The author stream carries ordered submissions, acknowledged event positions, ambiguity
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
Creation returns a backend-assigned opaque document ID that clients retain for reopening; no client-name mapping is provided.
Content, author, and snapshot operations cannot create missing archive state as
a side effect.

Every snapshot references a committed event and uses its event position as the document-scoped version.
There is no pre-event initial snapshot or separate snapshot-operation ID.
Applications represent nonempty initial state with an initialization event referencing uploaded content before publishing a snapshot.
The session checks expected parents and current publication authority; new publication advances the position, while an exact position/root retry returns the existing snapshot.
Transport receivers resolve received tree and event identities before constructing local availability handles.

Active I/O deadlines are separate from healthy idle-stream lifetime.
Connection loss, explicit close, replacement, liveness failure, and server
shutdown release the membership and snapshot authority owned by that
connection. Restart does not restore connection-scoped sessions or nomination
as active. Replaced membership and stale fences are rejected at mutation admission; revocation does not roll back an already admitted operation.
Cancelling a snapshot stream releases only its own registration, not a newer replacement registration.

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

The Fluid adapter stores the created document ID in the resolved URL, hides its initialization event, and reconstructs contiguous application sequence numbers by scanning retained history.
Snapshot handles encode event positions, and bounded snapshot lookup is checked for an exact match for Fluid version requests.
Reconnection resumes delivery from the consumed cursor, independently of the last submitted event position.

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
