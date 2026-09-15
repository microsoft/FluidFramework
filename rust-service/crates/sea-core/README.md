# Sea Core

`sea-core` defines transport- and storage-independent contracts for an ordered append-only stream, its latest client-authored snapshot, and service-level storage composition.

## Contracts

- Each successful append preserves one payload boundary and returns an opaque, implementation-defined position plus the durability completed before acknowledgement.
- `read` returns a finite, backpressured view ending at the head captured when the call begins. Its optional position is exclusive.
- Positions are implementation values. Callers compare them for equality but must not infer ordering or construct them.
- `SnapshotStore::publish` uses an expected parent for optimistic concurrency and requires snapshot positions to be committed in the associated stream and not regress.
- `ErrorKind` exposes stable client decisions while each implementation retains its detailed error type.

Optional behavior is advertised through `Capabilities`. In particular, only implementations with `PositionSerialization` support opaque position tokens.

The `storage` module defines focused object-safe contracts for document factories, document streams, and immutable content.
`ServiceStorage` composes those contracts without requiring the service to know concrete backends.
`DocumentStorageAdapter` type-erases implementations of the kernel append, snapshot, and position-codec traits.

## Relationships and Limits

The memory, file-simple, and durable-log packages implement the kernel contracts.
The conformance package tests their shared semantic laws.
This crate defines no persistence, filesystem layout, retention, recovery, or live-tailing policy beyond the guarantees expressed by its traits.

See [`src/lib.rs`](src/lib.rs) for the complete API contract.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-core
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-core --no-deps
```