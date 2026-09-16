# Compression Wrapper

`sea-compression` transparently compresses event payloads and blob leaves through `CompressionSession<S>`.
The wrapped `SeaSession` continues to own event positions, blob-tree identities, snapshot lineage, operation recovery, cancellation, and backpressure.

## Behavior

- Each logical payload is stored as one complete zlib frame, so events and blobs can be decoded independently.
- Reads decode one event when that item is polled. Dropping the reader stops
  further wrapper work; no background task or additional stream buffer is used.
- Malformed, truncated, and extended frames produce `ErrorKind::Corrupt`.
- Compression and decompression buffer one complete payload and do not impose a
  decoded-size bound. Untrusted inputs therefore need a limit in another layer.
- Underlying store errors retain their original `ErrorKind`; local encoding
  failures are `Rejected`.

Directories and snapshot metadata remain visible so the server can validate reachability.
For compression plus encryption, wrap an encrypted session in `CompressionSession`; the outer compression layer processes plaintext before the inner encryption layer stores it.
Snapshot coordination is composed from the undecorated session handle because this decorator transforms no nomination, publication, or notification state.

## Use

```rust
use sea_compression::CompressionSession;

let compressed = CompressionSession::new(session);
```

## Validation

From `rust-service/`:

```console
cargo test -p sea-compression --all-targets --all-features
cargo clippy -p sea-compression --all-targets --all-features -- -D warnings
RUSTDOCFLAGS="-D warnings" cargo doc -p sea-compression --all-features --no-deps
```

The test suite covers session conformance and round trips, corrupt and truncated frames,
trailing bytes, and representative compression ratios.