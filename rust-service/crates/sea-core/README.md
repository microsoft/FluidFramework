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

## Replacement Core Model

The [`next`](src/next/mod.rs) module contains the replacement core contracts, starting with storage decomposed into blob, event, and snapshot components.
It is the target for migration of implementations and consumers; the existing APIs remain in place until their consumers are ported.
The namespace is temporary: replacement types will move to their intended public modules as the superseded APIs are removed.
Unchanged core primitives are shared rather than duplicated.
`SeaStorage::create_view` and `SeaStorage::open_view` compose exclusive document views directly from backend components.
Active document caching, sequencer ownership, and session lifecycle policy belong to higher-level runtime management, not a storage collection wrapper.
`SeaView::blobs()` borrows the underlying blob store for content access and handle resolution; event and snapshot publication remain composed operations on the view.
The replacement `Snapshot<BlobHandle, EventHandle>` carries availability handles and is shared by snapshot lookup, publication, and loading.
Snapshot archives use event positions as their positions; initial empty state has no snapshot publication.
These contracts do not define a persisted snapshot representation.
`SeaView::get_snapshot` and `SeaView::load` share a `LoadStart` policy: `Beginning` skips snapshots, `ReplayAtLeastAllAfter(position)` selects the newest snapshot at or before the cursor, and `LatestSnapshot` selects the newest available snapshot.
Snapshot selection returns `None` when no snapshot qualifies; callers can use the selected snapshot followed by a bounded `read` to reconstruct a particular event position.
The stream returned by `load` catches up and then waits for new events, including for an initially empty archive.
`load` combines `get_snapshot` and an unbounded `read` without an extra caller round trip; callers can drop the stream when done.
Loads do not capture an event head.

Contributor validation commands are in [`DEV.md`](DEV.md).
