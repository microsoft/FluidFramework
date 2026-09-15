# Snapshotted Stream Conformance

`sea-conformance` provides implementation-independent checks for the contracts in `sea-core`.

## Coverage

`run_conformance` checks append ordering and boundaries, contiguous concurrent commits, finite independent readers, committed position ranges, snapshot lineage and monotonicity, snapshot recovery, and a deterministic reference-model trace. `run_position_codec_conformance` additionally checks token round trips and malformed-token rejection.

Factories must return a fresh, empty stream for each call. The suite panics on a contract violation and is intended to be invoked from an implementation's async tests.

## Relationships and Limits

The `memory` and `file-simple` packages run the shared suite. Implementation-specific persistence, corruption, durability, and fault behavior still require local tests; passing this package does not establish those properties.

See [`src/lib.rs`](src/lib.rs) for generic bounds and panic conditions.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-conformance
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-conformance --no-deps
```