# Sea Content Addressed

`sea-content-addressed` stores immutable BLAKE3-addressed blobs and canonical blob directories on a local filesystem.

`ContentStore` uses `BlobDirectory` and the typed blob and directory identities from `sea-core`.
Blob and directory data occupy separate namespaces below the store root.

## Replacement Blob Store

`ContentStore` implements `sea_core::next::BlobStore` and `ReferenceableStore` directly over the immutable object engine.
Use the trait methods to obtain `next::ContentHandle` availability evidence; the existing synchronous methods remain lower-level identity-based object primitives.
Replacement directory publication verifies every transitive child before publication.
Resolution and availability checks verify reachable bytes, visiting shared subtrees once; a stored root with a missing descendant is corrupt rather than absent.
Private handles record canonical namespace provenance, do not retain writer ownership, and can be revalidated by a reopened compatible store.
An equal identity from a different namespace does not establish availability.
No document factory, event archive, or snapshot policy is implied by this independently useful blob component.

## Publication and Verification

Blob and directory publication writes a same-directory temporary file, synchronizes it, atomically hard-links it to its identity path without replacing existing content, removes the temporary link, and synchronizes the destination directory before acknowledgement.
Repeated publication verifies and reuses an existing immutable object only when its bytes match.

Directory encoding and identity validation are delegated to `sea-core`.
Reads enforce configured byte limits and verify that stored bytes match the requested identity before returning data.

Publication removes its temporary file after ordinary failures when possible.
An interrupted process can leave a temporary file, which the store does not currently collect.

## Limits

The store has no garbage collection, mutation, remote replication, or access control.
Low-level synchronous directory publication validates encoding but does not promise closure; the replacement trait boundary performs that verification.
Durability claims depend on the host filesystem honoring file and directory synchronization.
Store paths are implementation details except for diagnostics and tests.

See [`src/lib.rs`](src/lib.rs) for the API and its integrity and error-path tests.
[`src/next.rs`](src/next.rs) covers replacement closure, provenance, reopening, and missing-dependency classification.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-content-addressed --all-targets --all-features
cargo clippy -p sea-content-addressed --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-content-addressed --all-features --no-deps
```
