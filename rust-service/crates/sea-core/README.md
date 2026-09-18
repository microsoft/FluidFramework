# Sea Core

`sea-core` defines transport- and storage-independent contracts for snapshotted event archives.

## Contracts

- `EventPosition` is an ordered `u64` newtype with a canonical eight-byte encoding. Ordering is meaningful only within one archive; adjacency and a starting value are not part of the contract.
- `BlobId` and `BlobDirectoryId` use domain-separated BLAKE3 identities, while `BlobTreeId` preserves the leaf-or-directory kind.
- `SnapshotPosition` represents initial state or state through one committed event. `SnapshotId` identifies a publication independently of its tree root.
- `SeaStorage` is the trusted backend contract. It atomically validates and records event and snapshot tree references and supports retained snapshot history.
- `SeaArchive`, `SeaAuthorSession`, `SeaEventSubscription`, and `SeaSnapshotCoordinator` separate content/history, ordered authors, event cursors, and snapshot coordination. `SeaSession` is only their convenience marker.
- Event and snapshot streams own their subscriptions and cancel on drop. The author facet owns idempotent logical-session close shared by cloned facets; archive handles require no asynchronous teardown.
- `ErrorKind` exposes stable caller decisions while implementations retain detailed error types.

## Relationships and Limits

The memory, buffered-file, and durable-file packages implement `SeaStorage`.
The conformance package tests their shared semantic laws.
This crate defines no persistence layout, authentication policy, retention policy, or replication mechanism beyond the guarantees expressed by its traits.

See [`src/lib.rs`](src/lib.rs) for the complete API contract.

## Storage Prototype

The experimental [`storage_prototype`](src/storage_prototype/mod.rs) module decomposes storage into blob, event, and snapshot components.
It does not replace the existing storage traits.
`SeaView::blobs()` borrows the underlying blob store for content access and handle resolution; event and snapshot publication remain composed operations on the view.
The prototype-local `Snapshot<BlobHandle, EventHandle>` carries availability handles and is shared by snapshot lookup, publication, and loading.
Snapshot archives use event positions as their positions; initial empty state has no snapshot publication.
This API prototype does not define a persisted snapshot representation.
`SeaView::load` accepts a `LoadStart` policy: replay from the beginning without a snapshot, include all events after a supplied cursor, or start at the latest compatible snapshot.
The returned stream catches up and then waits for new events, including for an initially empty archive.
Loading combines snapshot selection and streaming startup without an extra caller round trip; callers can drop the stream when done or use `read` separately for bounded reads.
Loads do not capture an event head.

Contributor validation commands are in [`DEV.md`](DEV.md).
