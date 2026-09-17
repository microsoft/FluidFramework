# Sea Content Addressed

`sea-content-addressed` stores immutable BLAKE3-addressed blobs and canonical blob directories on a local filesystem.

`ContentStore` uses `BlobDirectory` and the typed blob and directory identities from `sea-core`.
Blob and directory data occupy separate namespaces below the store root.

## Publication and Verification

Blob and directory publication writes a same-directory temporary file, synchronizes it, atomically hard-links it to its identity path without replacing existing content, removes the temporary link, and synchronizes the destination directory before acknowledgement.
Repeated publication verifies and reuses an existing immutable object only when its bytes match.

Directory encoding and identity validation are delegated to `sea-core`.
Reads enforce configured byte limits and verify that stored bytes match the requested identity before returning data.

Publication removes its temporary file after ordinary failures when possible.
An interrupted process can leave a temporary file, which the store does not currently collect.

## Limits

The store has no garbage collection, recursive closure verification, mutation, remote replication, or access control.
Durability claims depend on the host filesystem honoring file and directory synchronization.
Store paths are implementation details except for diagnostics and tests.

See [`src/lib.rs`](src/lib.rs) for the API and its integrity and error-path tests.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-content-addressed --all-targets --all-features
cargo clippy -p sea-content-addressed --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-content-addressed --all-features --no-deps
```
