# Snapshotted Stream Memory

`sea-memory` is the process-local reference implementation of the append-stream, snapshot-store, and position-codec contracts.

## Behavior

- Cloned handles share one generation, ordered records, and latest snapshot.
- Appends become visible in process and report `Durability::Memory`.
- Readers are finite at their captured head and can be dropped independently.
- Positions use one-based ordinals. Encoded tokens are opaque 8-byte ordinal values; malformed values and positions beyond the selected stream's committed head are rejected, while the same committed ordinal may be used with another stream.
- Snapshot publication enforces expected-parent equality, committed positions, and non-regression.

## Limits

All records and snapshots are lost when the final handle is dropped. There is no retention, live tailing, durable persistence, or idempotent append identity. This implementation is suitable for tests, examples, and process-local state, not crash recovery.

See [`src/lib.rs`](src/lib.rs) for the API and focused fault-adapter tests. Shared laws come from [`../sea-conformance`](../sea-conformance/README.md).

## Validation

From `rust-service/`:

```bash
cargo test -p sea-memory --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-memory --all-features --no-deps
```
