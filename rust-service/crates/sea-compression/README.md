# Compression Wrapper

`sea-compression` transparently applies independent zlib
compression to every record and snapshot in a snapshotted stream. The wrapped
store continues to own positions, snapshot lineage, capabilities, cancellation,
and backpressure.

## Behavior

- Each logical payload is stored as one complete zlib frame, so records and
  snapshots can be decoded independently.
- Reads decode one record when that item is polled. Dropping the reader stops
  further wrapper work; no background task or additional stream buffer is used.
- Malformed, truncated, and extended frames produce `ErrorKind::Corrupt`.
- Compression and decompression buffer one complete payload and do not impose a
  decoded-size bound. Untrusted inputs therefore need a limit in another layer.
- Underlying store errors retain their original `ErrorKind`; local encoding
  failures are `Rejected`.

For compression plus encryption, use
`CompressionStream<EncryptionStream<...>>`. The outer compression wrapper
compresses plaintext before the inner encryption wrapper stores it. Reversing
the order attempts to compress ciphertext and normally removes the size benefit.

## Use

```rust
use sea_compression::CompressionStream;
use sea_memory::MemoryStream;

let stream = CompressionStream::new(MemoryStream::new());
```

The wrapper implements `AppendStream` and implements `SnapshotStore` whenever
the underlying store does. `into_inner` returns the wrapped store.

## Validation

From `rust-service/`:

```console
cargo test -p sea-compression --all-targets --all-features
cargo clippy -p sea-compression --all-targets --all-features -- -D warnings
RUSTDOCFLAGS="-D warnings" cargo doc -p sea-compression --all-features --no-deps
```

The test suite covers shared stream and snapshot conformance, empty and large
round trips, position preservation, snapshot recovery, corrupt and truncated
frames, trailing bytes, lazy decoding, and underlying error classification.