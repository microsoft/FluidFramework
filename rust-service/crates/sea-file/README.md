# Sea File

`sea-file` is a buffered single-process filesystem implementation of `SeaStorage`.

## Persistence Model

The backend persists events, snapshot history, stable publication results, blobs, and directories.
Writes are flushed through buffered files but are not synchronized with `fsync`, so successful events and snapshots provide `Durability::Buffered`, not crash durability.

Opening an existing store validates framing, identities, snapshot lineage, content closure, and position ordering.
Invalid or incomplete bytes produce `ErrorKind::Corrupt`; the crate intentionally performs no crash-tail repair.
A clean close and reopen preserves events, content, snapshots, and stable publication resolution.

## Limits

Only cloned handles coordinate access.
Independently opening the same directory concurrently is unsupported.
The backend retains all values and does not claim crash durability or production locking.

See [`src/lib.rs`](src/lib.rs) for the format implementation and corruption tests. Shared laws come from [`../sea-conformance`](../sea-conformance/README.md).

## Validation

From `rust-service/`:

```bash
cargo test -p sea-file --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-file --all-features --no-deps
```
