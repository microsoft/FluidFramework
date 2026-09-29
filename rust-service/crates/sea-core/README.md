# Sea Core

`sea-core` defines transport- and storage-independent contracts for snapshotted event archives.

## Contracts

- `EventPosition` is an ordered `u64` newtype with a canonical eight-byte encoding. Ordering is meaningful only within one archive; adjacency and a starting value are not part of the contract.
- `BlobId` and `BlobDirectoryId` use domain-separated BLAKE3 identities, while `BlobTreeId` preserves the leaf-or-directory kind.
- `storage::Snapshot` holds tree and committed-event availability handles; its version is the event position, not a separate publication identity.
- `storage::SeaStorage` allocates document IDs and exclusively opens blob, event, and snapshot components. `SeaView` composes their dependency checks and publication order.
- `session::{SeaArchive, SeaAuthorSession, SeaSnapshotCoordinator}` separate content/history, ordered authors, and conditional snapshot coordination. `SeaSession` is their convenience marker.
- Event and snapshot streams own their subscriptions and cancel on drop. The author facet owns idempotent logical-session close shared by cloned facets; archive handles require no asynchronous teardown.
- `ErrorKind` exposes stable caller decisions while implementations retain detailed error types.
- `signals::{SeaSignalService, SeaSignals}` separate ephemeral messaging from archive and author authority.

Signal connections receive an initial live membership snapshot, reliable membership changes, and opaque messages.
Broadcast includes self; targeting is document scoped, and missing targets are a successful no-op.
Signals have no event position, persistence, replay, or ordering relationship with archive events.
Reliable delivery is live-only and fails explicitly on receiver overflow; best effort permits loss and reordering.
The [`sea-signals`](../sea-signals/README.md) tests establish these contracts for the local relay;
remote composition is tested by the server and generated browser harness.

## Relationships and Limits

The memory, buffered-file, and durable-file backends implement `SeaStorage`; `sea-conformance` tests their shared laws.
See [`src/lib.rs`](src/lib.rs) for API contracts and [architecture](../../SEA_ARCHITECTURE.md) for layer responsibilities.

## Storage And Sessions

The [`storage`](src/storage/mod.rs) module defines blob, event, and snapshot components and their composed document view.
The sibling [`session`](src/session.rs) module adds multi-user policy above storage.
`SeaStorage::create_view` and `SeaStorage::open_view` compose exclusive document views directly from backend components.
The component bundle also carries `CheckpointStore`, whose two operations read and atomically replace opaque internal recovery state through `SeaView`.
It shares the document opening and failure discipline but is independent of `SnapshotArchive` and all historical lookup structures.
The host owns active-document caching and sequencer lifetime.
`SeaView::blobs()` borrows the underlying blob store for content access and handle resolution; event and snapshot publication remain composed operations on the view.
`Snapshot<BlobHandle, EventHandle>` carries availability handles and is shared by snapshot lookup, publication, and loading.
Snapshot archives use event positions as their positions; initial empty state has no snapshot publication.

### Loading

`get_snapshot` and `load` share these `LoadStart` policies:

| Policy | Snapshot selection |
| --- | --- |
| `Beginning` | None; replay from the beginning. |
| `ReplayAtLeastAllAfter(position)` | Newest at or before the cursor. |
| `LatestSnapshot` | Newest available. |

Selection returns `None` when no snapshot qualifies.
`load` combines selection with a gap-free live suffix, including for an empty archive, without capturing an event head.
Use a selected snapshot plus bounded `read` to reconstruct a fixed event position; drop streams to cancel.

### Append Outcomes

`Archive::append_batch` returns results for an input prefix; omitted inputs were not attempted.
Successful results precede errors, and any results after the first error must be ambiguous.
A definitive failure cannot precede a committed entry; grouped persistence can report every attempted entry ambiguous when any prefix may survive.
After settlement, a successful `head` bounds all returned outcomes; poisoned backends must return an error instead of an unsafe bound.
The default implementation appends sequentially and stops at its first error.
`SeaView::append_batch` checks tree capabilities in order and publishes the checked prefix even when a later dependency fails.
Its dependency error is returned only after all preceding entries succeed.

### Opening Invalidation

`Archive::observe_invalidation` is an optional independent terminal-opening capability, also exposed by `SeaView`.
Its default returns `None`, preserving compatibility for third-party archives and making unsupported observation explicit.
Supporting backends return a registration that unregisters on drop.
`InvalidationSource` provides sticky, classified-error-preserving notification, including registration racing or following invalidation.
Callbacks run synchronously outside the source lock and must only update their own state, never reenter storage or wait for I/O.
This lets a cache release ownership and wake live observers without an archive poll or a per-document task.
The capability does not change the normal archive error or lifetime contract.

### Sessions

The session facets add membership, author ordering/recovery, and conditional snapshot coordination using `SeaService`'s native/browser thread-safety bounds.
Initial application state is represented by an application event, not an initial storage snapshot.
Session publication checks expected parents and current client-selected/Sea-selected authority, with exact position/root reconciliation instead of a separate snapshot operation ID.
See [sequencer contracts](../sea-sequencer/README.md) for accepted prefixes and recovery; submissions are not deduplicated.

`SeaAuthorSession::announce_membership` opts into durable joined/left records sharing the application event order.
`SessionCommittedEvent::kind` distinguishes application submissions from service-authored membership transitions.
Snapshot publication and position resolution accept any committed session-event position, including `Joined` and `Left` membership transitions.
Metadata is immutable public control data; payload decorators do not protect it.
Close, replacement, and recovery settle a departure before later mutation, while unannounced sessions retain submission-only history.
See [the membership decision](../../historical/decisions/0014-ordered-session-membership.md) for recovery, compatibility, and security boundaries.

The [`factory`](src/factory.rs) module defines document-scoped session factories and their decorators.
`SessionFactory` returns the source-allocated identity and a session with concrete availability handles.
`PassThroughFactory` and `PassThroughSession` add no policy or cleanup ownership.
The decorator returns existing session futures and streams directly, without additional steady-state allocations.
Opening may allocate a future; pending-open cancellation remains the source's responsibility.
Clones retain the source's ownership model, and dropping a wrapper does not promise session closure.
Direct construction remains an explicit path without factory interception.

### Optional Document Policy

The [`policy`](src/policy.rs) module adds `PolicyFactory`, `PolicySession`, and `DocumentPolicy`.
Construction supplies one `Arc<Policy>` per document; factory and session clones share that policy without requiring the policy itself to be cloneable.
Direct session construction does not enable policy; hosts choose whether to compose `PolicyFactory`.
The [native server executable](../sea-webtransport-server/README.md) enables its resource policy by default, with an explicit opt-out.
`PolicyError` preserves concrete source errors and distinguishes policy refusals from terminal wrapper authority.
All facets preserve the source's concrete blob/event handles.

The policy admits sessions before source open, and admits live readers before constructing an unbounded `read` or a `load` suffix.
Reader admission synchronously reserves a policy-defined `ReaderPermit`, retained across source load creation and by the returned live stream.
This bounds pending loads as well as registered readers; cancellation, load failure, observed stream termination, or drop releases the permit.
Permits do not retain source/session capabilities or payloads.
Successful source open is wrapped without another suspension.
Bounded reads and standalone snapshot selection bypass reader admission.
Streams preserve progress and release the source on an observed error or end; an unpolled generic stream has no extra revocation mechanism.
Identity-scoped revocation and retention remain the source/cache's responsibility.
A source-revoked but unpolled stream can retain its admission permit until dropped, even when source/cache retention has already been released independently.

`acquire_write` synchronously reserves a policy-owned RAII permit before any ordering or pressure wait for `submit`, `put_blob`, or `put_directory`.
Policies must independently bound waiting requests and charged bytes and reject when either reservation is unavailable.
The borrowed `WriteRequest` exposes the input without requiring encoding or copying.
The policy defines its byte unit; visible `Bytes` lengths do not bound larger shared backing allocations, upstream buffers, or never-polled caller futures.
Permits cover both ordering and pressure waits and release on cancellation, refusal, or source entry.
They are not storage reservations or an accounting ledger for accepted writes.
`wait_write` can use host-supplied pressure observations; storage remains authoritative under racing writers.

Wrapper clones share FIFO submission ordering, established by first polling admission in the intended caller order.
The ordering turn lasts through the first source poll, not the storage receipt, so pending submissions can fill the source's bounded queue.
The cancellation/failure guard remains active through completion; the source owns ordering and settlement after entry.
The first failed submit makes subsequent wrapper submits terminal across clones.
Canceling before source entry releases waiting ownership without creating acceptance or ending authority.
Canceling after source entry ends wrapper authority while preserving source settlement semantics.
Close bypasses policy and wakes all pre-source writes to refuse; it does not cancel already-entered source work.
The caller or host still owns polling underlying close/reconciliation after rejection or cancellation.
Dropping any wrapper or close future does not promise durable departure, and no autonomous task is created.

Membership announcement, snapshot coordination/publication/revocation, reads of immutable content, and capability resolution bypass write pressure.
This keeps source control and cleanup paths independent of application backpressure.
Reader refusal alone neither terminates authors nor closes sibling subscriptions.
The module has no file-backend dependency, resource-observation network protocol, or second reader-retention registry.

Contributor validation commands are in [`DEV.md`](DEV.md).
