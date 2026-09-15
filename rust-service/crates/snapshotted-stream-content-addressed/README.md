# Snapshotted Stream Content Addressed

`snapshotted-stream-content-addressed` stores immutable SHA-256 blobs and canonical summary manifests in memory or on a local filesystem.

Both `MemoryContentStore` and `ContentStore` implement the common `ContentStorage` contract from `snapshotted-stream-core`.
They share digest calculation, manifest validation, and canonical encoding.

## Publication and Verification

Blob input is copied and hashed with memory bounded by `StoreConfig::copy_buffer_bytes`. Blob and summary publication writes a same-filesystem pending file, synchronizes the file, atomically hard-links it to its digest path, and synchronizes the destination directory before acknowledgement. Repeated identical publication deduplicates against the existing immutable path and verifies the existing object.

Summary entries map nonempty, NUL-free paths to blob digests and must be strictly ordered by path. Publication verifies every referenced blob before encoding the manifest. Reads verify the requested digest, framing, canonical ordering, configured limits, and referenced blobs before returning data.

The `FaultInjector` is a focused test facility. Failures before publication are definitive; failures at or after the atomic link are classified as ambiguous because the object may already be visible. Reopening removes unpublished files from `pending/`.

## Limits

The store has no garbage collection, mutation, remote replication, access control, or cross-filesystem publication. Durability claims depend on the host filesystem honoring file and directory synchronization. Store paths should be treated as implementation details except for diagnostics and tests.

See [`src/lib.rs`](src/lib.rs) for the API, [`tests/core.rs`](tests/core.rs) for integrity and fault-boundary coverage, and [`tests/process_recovery.rs`](tests/process_recovery.rs) for process-restart evidence.

## Validation

From `rust-service/`:

```bash
cargo test -p snapshotted-stream-content-addressed --all-targets
cargo clippy -p snapshotted-stream-content-addressed --all-targets -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc -p snapshotted-stream-content-addressed --no-deps
```