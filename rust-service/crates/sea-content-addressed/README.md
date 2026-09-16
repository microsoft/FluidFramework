# Sea Content Addressed

`sea-content-addressed` stores immutable SHA-256 blobs and canonical blob directories on a local filesystem.

`ContentStore` uses the `Blob`, `BlobDirectory`, and typed identity values from `sea-core`.

## Publication and Verification

Blob input is copied and hashed with memory bounded by `StoreConfig::copy_buffer_bytes`.
Blob and directory publication writes a same-filesystem pending file, synchronizes it, atomically hard-links it to its domain-separated identity path, and synchronizes the destination directory before acknowledgement.
Repeated identical publication verifies and reuses the existing immutable object.

Directory entries map one validated UTF-8 path segment to a typed blob or directory identity and must be in canonical order.
Publication recursively verifies the complete referenced closure.
Reads verify identity, framing, canonical ordering, configured limits, and referenced children before returning data.

The `FaultInjector` is a focused test facility. Failures before publication are definitive; failures at or after the atomic link are classified as ambiguous because the object may already be visible. Reopening removes unpublished files from `pending/`.

## Limits

The store has no garbage collection, mutation, remote replication, access control, or cross-filesystem publication.
Durability claims depend on the host filesystem honoring file and directory synchronization.
Store paths are implementation details except for diagnostics and tests.

See [`src/lib.rs`](src/lib.rs) for the API and its integrity, recursive-validation, and fault-boundary tests.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-content-addressed --all-targets
cargo clippy -p sea-content-addressed --all-targets -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-content-addressed --no-deps
```