# Sea Conformance

`sea-conformance` provides implementation-independent checks for `sea-core` storage contracts.

## Coverage

`run_sea_storage_conformance` checks blob and directory identity, missing-tree rejection, event ordering, initial and historical snapshots, conditional and idempotent snapshot publication, publication resolution, and snapshot-plus-tail load.
The older `run_conformance` and `run_position_codec_conformance` suites continue to cover the experimental append-stream traits used by benchmarks.

Factories must return a fresh, empty stream for each call. The suite panics on a contract violation and is intended to be invoked from an implementation's async tests.

## Relationships and Limits

The memory, buffered-file, and durable-file packages run the Sea storage suite.
Implementation-specific persistence, corruption, durability, and fault behavior still require local tests; passing this package does not establish those properties.

See [`src/lib.rs`](src/lib.rs) for generic bounds and panic conditions.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-conformance
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-conformance --no-deps
```