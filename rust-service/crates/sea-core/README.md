# Sea Core

`sea-core` defines transport- and storage-independent contracts for snapshotted event archives.

## Contracts

- `EventPosition` is an ordered `u64` newtype with a canonical eight-byte encoding. Ordering is meaningful only within one archive; adjacency and a starting value are not part of the contract.
- `BlobId` and `BlobDirectoryId` use domain-separated identities, while `BlobTreeId` preserves the leaf-or-directory kind.
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

## Validation

From `rust-service/`:

```bash
cargo test -p sea-core
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-core --no-deps
```
