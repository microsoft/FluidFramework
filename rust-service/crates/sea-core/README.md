# Sea Core

`sea-core` defines transport- and storage-independent contracts for snapshotted event archives.

## Contracts

- `EventPosition` is an ordered `u64` newtype with a canonical eight-byte encoding. Ordering is meaningful only within one archive; adjacency and a starting value are not part of the contract.
- `BlobId` and `BlobDirectoryId` use domain-separated identities, while `BlobTreeId` preserves the leaf-or-directory kind.
- `SnapshotPosition` represents initial state or state through one committed event. `SnapshotId` identifies a publication independently of its tree root.
- `SeaStorage` is the trusted backend contract. It atomically validates and records event and snapshot tree references and supports retained snapshot history.
- `SeaSession` is the archive-bound user contract. It adds authors, session and operation identities, submission recovery, gap-free load, subscriptions, and explicit close.
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