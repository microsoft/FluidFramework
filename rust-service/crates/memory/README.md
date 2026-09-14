# Snapshotted Stream Memory

`snapshotted-stream-memory` is the process-local reference implementation of the append-stream, snapshot-store, and position-codec contracts.

## Behavior

- Cloned handles share one generation, ordered records, and latest snapshot.
- Appends become visible in process and report `Durability::Memory`.
- Readers are finite at their captured head and can be dropped independently.
- Positions use one-based ordinals scoped to a generated stream identity. Encoded tokens are opaque 16-byte generation/ordinal values and reject malformed or foreign input.
- Snapshot publication enforces expected-parent equality, committed positions, and non-regression.

## Limits

All records and snapshots are lost when the final handle is dropped. There is no retention, live tailing, durable persistence, or idempotent append identity. This implementation is suitable for tests, examples, and process-local state, not crash recovery.

See [`src/lib.rs`](src/lib.rs) for the API and focused fault-adapter tests. Shared laws come from [`../conformance`](../conformance/README.md).

## Validation

From `rust-service/`:

```bash
cargo test -p snapshotted-stream-memory --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p snapshotted-stream-memory --all-features --no-deps
```