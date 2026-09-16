# Sea Memory

`sea-memory` is the process-local reference implementation of `SeaStorage`.

## Behavior

- Cloned handles share ordered events, immutable content, and retained snapshot history.
- Appends become visible in process and report `Durability::Memory`.
- Event and snapshot publication validates the complete referenced blob-tree closure before commit.
- Readers are finite at their captured head; `load` atomically pairs snapshot selection with that head.
- Snapshot publication enforces expected-parent equality, committed positions, stable operation identity, and non-regression.

## Limits

All events, snapshots, and content are lost when the final handle is dropped.
The backend retains all committed and uploaded values while alive.
Live tailing and multi-user operation identities belong to `sea-sequencer`.
This implementation is suitable for tests, examples, and process-local state, not crash recovery.

See [`src/lib.rs`](src/lib.rs) for the API and focused fault-adapter tests. Shared laws come from [`../sea-conformance`](../sea-conformance/README.md).

## Validation

From `rust-service/`:

```bash
cargo test -p sea-memory --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-memory --all-features --no-deps
```
