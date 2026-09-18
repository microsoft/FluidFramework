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

## Relationships and Limits

The memory, buffered-file, and durable-file packages implement `SeaStorage`.
The conformance package tests their shared semantic laws.
This crate defines no persistence layout, authentication policy, retention policy, or replication mechanism beyond the guarantees expressed by its traits.

See [`src/lib.rs`](src/lib.rs) for the complete API contract.

## Storage And Sessions

The [`storage`](src/storage/mod.rs) module defines blob, event, and snapshot components and their composed document view.
The sibling [`session`](src/session.rs) module adds multi-user policy above storage.
`SeaStorage::create_view` and `SeaStorage::open_view` compose exclusive document views directly from backend components.
Active document caching, sequencer ownership, and session lifecycle policy belong to higher-level runtime management, not a storage collection wrapper.
`SeaView::blobs()` borrows the underlying blob store for content access and handle resolution; event and snapshot publication remain composed operations on the view.
`Snapshot<BlobHandle, EventHandle>` carries availability handles and is shared by snapshot lookup, publication, and loading.
Snapshot archives use event positions as their positions; initial empty state has no snapshot publication.
These contracts do not define a persisted snapshot representation.
`SeaView::get_snapshot` and `SeaView::load` share a `LoadStart` policy: `Beginning` skips snapshots, `ReplayAtLeastAllAfter(position)` selects the newest snapshot at or before the cursor, and `LatestSnapshot` selects the newest available snapshot.
Snapshot selection returns `None` when no snapshot qualifies; callers can use the selected snapshot followed by a bounded `read` to reconstruct a particular event position.
The stream returned by `load` catches up and then waits for new events, including for an initially empty archive.
`load` combines `get_snapshot` and an unbounded `read` without an extra caller round trip; callers can drop the stream when done.
Loads do not capture an event head.

The session facets put membership, author ordering, stable event retries, and conditional snapshot coordination above storage.
They reuse `SeaService` and its native/browser thread-safety bounds, the existing identity/event primitives, and handle-based `Snapshot` values.
Loads return a selected snapshot and a direct live session-event stream; snapshots use document-scoped event positions as version identities.
Initial application state is represented by an application event, not an initial storage snapshot.
Session publication checks expected parents and current client-selected/Sea-selected authority, with exact position/root reconciliation instead of a separate snapshot operation ID.
Behavioural evidence for these composition contracts is in `sea-conformance::run_session_conformance` and the owning `sea-sequencer::session` tests.

Contributor validation commands are in [`DEV.md`](DEV.md).
