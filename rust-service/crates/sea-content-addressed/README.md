# Sea Content Addressed

`sea-content-addressed` stores immutable BLAKE3-addressed blobs and canonical blob directories on a local filesystem.

`ContentStore` uses `BlobDirectory` and the typed blob and directory identities from `sea-core`.
Blob and directory data occupy separate namespaces below the store root.
The constructor owns durable namespace creation.
It synchronizes namespace bindings bottom-up from the canonical root through its filesystem before returning, including newly created ancestor names.
On Unix, synchronization stops before an ancestor on a different device; mount configuration remains outside the store's guarantee.
Initialization propagates creation, metadata, canonicalization, and synchronization failures rather than returning an incompletely initialized store.

## Blob Store

`ContentStore` implements `sea_core::storage::BlobStore` and `ReferenceableStore` directly over the immutable object engine.
Use the trait methods to obtain `storage::ContentHandle` availability evidence; the existing synchronous methods remain lower-level identity-based object primitives.
Trait-based directory publication verifies every transitive child before publication.
Resolution and availability checks verify reachable bytes, visiting shared subtrees once; a stored root with a missing descendant is corrupt rather than absent.
Private handles record canonical namespace provenance, do not retain writer ownership, and can be revalidated by a reopened compatible store.
An equal identity from a different namespace does not establish availability.

## Publication and Verification

Blob and directory publication writes a same-directory temporary file, synchronizes it, atomically hard-links it to its identity path without replacing existing content, removes the temporary link, and synchronizes the destination directory before acknowledgement.
Repeated publication verifies and reuses an existing immutable object only when its bytes match.
It synchronizes the containing directory before acknowledgement, including when a concurrent publisher installed the object.

Directory encoding and identity validation are delegated to `sea-core`.
Reads enforce configured byte limits and verify that stored bytes match the requested identity before returning data.

Publication removes its temporary file after ordinary failures when possible.
If a staging path already exists, publication fails without removing another attempt's file.
An interrupted process can leave a temporary file, which the store does not currently collect.

## Limits

The store retains all content; hosts own access control.
Low-level synchronous directory publication validates encoding but not closure; the trait boundary verifies closure.
Durability claims depend on the host filesystem honoring file and directory synchronization.
Store paths are implementation details except for diagnostics and tests.

See [`src/lib.rs`](src/lib.rs) for the API and its integrity and error-path tests.
[`src/storage.rs`](src/storage.rs) covers closure, provenance, reopening, and missing-dependency classification.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-content-addressed --all-targets --all-features
cargo clippy -p sea-content-addressed --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-content-addressed --all-features --no-deps
```
