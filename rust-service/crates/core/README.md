# Snapshotted Stream Core

`snapshotted-stream-core` defines transport- and storage-independent contracts for an ordered append-only stream and its latest client-authored snapshot.

## Contracts

- Each successful append preserves one payload boundary and returns an opaque, generation-scoped position plus the durability completed before acknowledgement.
- `read` returns a finite, backpressured view ending at the head captured when the call begins. Its optional position is exclusive.
- Positions are implementation values. Callers compare them for equality but must not infer ordering or construct them.
- `SnapshotStore::publish` uses an expected parent for optimistic concurrency and requires snapshot positions to remain in the same generation and not regress.
- `ErrorKind` exposes stable client decisions while each implementation retains its detailed error type.

Optional behavior is advertised through `Capabilities`. In particular, only implementations with `PositionSerialization` support opaque position tokens.

## Relationships and Limits

The `memory` and `file-simple` packages implement these contracts. The `conformance` package tests their shared semantic laws. This crate defines no persistence, retention, recovery, or live-tailing policy beyond the guarantees expressed by its traits.

See [`src/lib.rs`](src/lib.rs) for the complete API contract.

## Validation

From `rust-service/`:

```bash
cargo test -p snapshotted-stream-core
RUSTDOCFLAGS='-D warnings' cargo doc -p snapshotted-stream-core --no-deps
```