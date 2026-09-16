# Stateful Compression Wrapper

`sea-stateful-compression` uses one immutable zstd dictionary to compress event payloads and blob leaves through `StatefulCompressionSession<S>`.
Despite the package name, decoding does not depend on mutable history: every stored payload is an independent frame with the metadata needed to restart from that item.

## Framing And Restart

Each payload is prefixed with a wrapper magic value, format version, dictionary
fingerprint, and declared decoded length. Reopening requires the same dictionary
and configured decoded-size bound, but no preceding records or codec state.
Positions, blob-tree identities, snapshot lineage, operation recovery, cancellation, and backpressure remain owned by the wrapped session.

The dictionary fingerprint detects accidental mismatch; it is not an
authentication mechanism. Malformed, truncated, extended, wrongly sized, or
wrong-dictionary frames classify as `ErrorKind::Corrupt`.

## Bounds

- `MAX_DICTIONARY_BYTES` is the hard maximum retained dictionary size.
- `MAX_DECODED_BYTES` is the hard ceiling for a configured decoded payload bound.
- `StatefulCompressionStream::new` rejects an empty bound, a bound above the
  hard ceiling, or a dictionary above its hard maximum.
- Event and blob payloads above the configured bound are rejected
  before writing. Reads reject a declared or actual decoded length outside the
  configured bound.

The zstd decoder's window is capped from the configured bound. The complete
stored frame and decoded payload are still held in memory. Reads decode one
record when polled and add no background task or stream buffer.

Directories and snapshot metadata remain visible.
For authenticated storage, wrap an encrypted session in `StatefulCompressionSession` so compression processes plaintext before encryption.

## Validation

From `rust-service/`:

```console
cargo test -p sea-stateful-compression --all-targets --all-features
cargo clippy -p sea-stateful-compression --all-targets --all-features -- -D warnings
RUSTDOCFLAGS="-D warnings" cargo doc -p sea-stateful-compression --all-features --no-deps
```

The test suite covers shared stream, snapshot, and position-codec conformance;
reopen and retained-record restart; configured limits; malformed, truncated,
extended, false-length, and wrong-dictionary frames; lazy decoding; snapshots;
and compression-before-encryption composition.