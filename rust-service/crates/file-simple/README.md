# Snapshotted Stream File Simple

`snapshotted-stream-file-simple` is a minimal single-process filesystem implementation of the append-stream and snapshot-store contracts.

## Persistence Model

Each store directory contains `stream.log` and `snapshots.log`. Both files begin with fixed magic and a shared generation, followed by big-endian length-framed records. Writes are flushed through `BufWriter` but are not synchronized with `fsync`, so successful appends and snapshots provide `Durability::Buffered`, not crash durability.

Opening an existing store validates complete headers, frames, snapshot IDs, generation agreement, and monotonic snapshot positions. Invalid or incomplete bytes produce `ErrorKind::Corrupt`; the crate intentionally performs no truncation or repair. A clean close and reopen preserves records, positions, and the latest snapshot.

## Limits

Only cloned handles coordinate access. Independently opening the same directory concurrently is unsupported. The implementation has no retention, live tailing, position serialization, idempotent append identity, crash-recovery protocol, or production locking.

See [`src/lib.rs`](src/lib.rs) for the format implementation and corruption tests. Shared laws come from [`../conformance`](../conformance/README.md).

## Validation

From `rust-service/`:

```bash
cargo test -p snapshotted-stream-file-simple --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p snapshotted-stream-file-simple --all-features --no-deps
```