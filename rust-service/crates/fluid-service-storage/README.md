# Fluid Service Storage

`fluid-service-storage` provides the built-in storage composition for the single-host native Fluid service.
It owns concrete backend selection, document filesystem layout, scope markers, content initialization, and fencing policy.

## Composition

`BuiltInServiceStorage` implements the central `ServiceStorage` contract from `snapshotted-stream-core`.
Its document factory opens memory, buffered-file, or durable-log streams and erases them through `DocumentStorageAdapter`.
Its content side selects the matching in-memory or durable content-addressed store.

`StorageMode::DurableFile` returns a persisted same-host fencing authority with each opened document.
Memory and buffered-file modes use process-local fencing.
These policies are built-in choices, not requirements imposed by the core contracts or `fluid-native-service`.

## Validation

From `rust-service/`:

```bash
cargo test -p fluid-service-storage
cargo clippy -p fluid-service-storage --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings -D missing_docs' cargo doc -p fluid-service-storage --no-deps
```