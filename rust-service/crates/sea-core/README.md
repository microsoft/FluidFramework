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
`get_snapshot` and `load` share these `LoadStart` policies:

| Policy | Snapshot selection |
| --- | --- |
| `Beginning` | None; replay from the beginning. |
| `ReplayAtLeastAllAfter(position)` | Newest at or before the cursor. |
| `LatestSnapshot` | Newest available. |

Selection returns `None` when no snapshot qualifies.
`load` combines selection with a gap-free live suffix, including for an empty archive, without capturing an event head.
Use a selected snapshot plus bounded `read` to reconstruct a fixed event position; drop streams to cancel.

`Archive::append_batch` returns results for an input prefix; omitted inputs were not attempted.
Successful results precede errors, and any results after the first error must be ambiguous.
A definitive failure cannot precede a committed entry; grouped persistence can report every attempted entry ambiguous when any prefix may survive.
After settlement, a successful `head` bounds all returned outcomes; poisoned backends must return an error instead of an unsafe bound.
The default implementation appends sequentially and stops at its first error.
`SeaView::append_batch` checks tree capabilities in order and publishes the checked prefix even when a later dependency fails.
Its dependency error is returned only after all preceding entries succeed.

The session facets add membership, author ordering/recovery, and conditional snapshot coordination using `SeaService`'s native/browser thread-safety bounds.
Initial application state is represented by an application event, not an initial storage snapshot.
Session publication checks expected parents and current client-selected/Sea-selected authority, with exact position/root reconciliation instead of a separate snapshot operation ID.
See [sequencer contracts](../sea-sequencer/README.md) for accepted prefixes and recovery; submissions are not deduplicated.

`SeaAuthorSession::announce_membership` opts into durable joined/left records sharing the application event order.
`SessionCommittedEvent::kind` distinguishes application submissions from service-authored membership transitions.
Metadata is immutable public control data; payload decorators do not protect it.
Close, replacement, and recovery settle a departure before later mutation, while unannounced sessions retain submission-only history.
See [the membership decision](../../historical/decisions/0014-ordered-session-membership.md) for recovery, compatibility, and security boundaries.

Contributor validation commands are in [`DEV.md`](DEV.md).
