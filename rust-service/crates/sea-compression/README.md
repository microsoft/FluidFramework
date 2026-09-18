# Compression Wrapper

`sea-compression` transparently compresses event payloads and blob leaves through `CompressionSession<S>`.
The wrapped session continues to own event positions, blob-tree identities, snapshot lineage, operation recovery, cancellation, and backpressure.

## Behavior

- Each logical payload is stored as one complete zlib frame, so events and blobs can be decoded independently.
- Reads decode one event when that item is polled.
  Dropping the reader stops further wrapper work; no background task or additional stream buffer is used.
- Malformed, truncated, and extended frames produce `ErrorKind::Corrupt`.
- Compression and decompression buffer one complete payload and do not impose a decoded-size bound.
  Untrusted inputs therefore need a limit in another layer.
- Underlying store errors retain their original `ErrorKind`; local encoding failures are `Rejected`.

Directories and snapshot metadata remain visible so the server can validate reachability.
For compression plus encryption, wrap an encrypted session in `CompressionSession`; the outer compression layer processes plaintext before the inner encryption layer stores it.
The replacement `sea_core::next::session` facets are implemented directly on `CompressionSession`.
Loads preserve the selected handle-based snapshot and decode its live suffix; read progress and source error classifications are preserved.
Content identities and availability handles are those of the encoded stored bytes, not plaintext hashes.
Directory references, handle resolution, snapshot publication, publisher participation/fences, and revocation pass through unchanged.
Deterministic frames preserve exact submission retries without a wrapper identity registry.
Dropping a forwarded coordination stream revokes its underlying registration.

Old session-trait implementations remain for benchmark consumers until checkpoint 5; only those old facets require an undecorated handle for snapshot coordination.
Replacement tests run shared session conformance, including initialization, snapshots, retries, replay, and independent close.

## Use

```rust
use sea_compression::CompressionSession;

# let session = ();
let compressed = CompressionSession::new(session);
```
