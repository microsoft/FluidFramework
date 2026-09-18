# Stateful Compression Wrapper

`sea-stateful-compression` uses one immutable zstd dictionary to compress event payloads and blob leaves through [`StatefulCompressionSession`].
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

- [`MAX_DICTIONARY_BYTES`] is the hard maximum retained dictionary size.
- [`MAX_DECODED_BYTES`] is the hard ceiling for a configured decoded payload bound.
- [`StatefulCompressionSession::new`] rejects an empty bound, a bound above the
  hard ceiling, or a dictionary above its hard maximum.
- Event and blob payloads above the configured bound are rejected
  before writing. Reads reject a declared or actual decoded length outside the
  configured bound.

The zstd decoder's window is capped from the configured bound. The complete
stored frame and decoded payload are still held in memory. Reads decode one
record when polled and add no background task or stream buffer.

Directories and snapshot metadata remain visible.
For authenticated storage, wrap an encrypted session in `StatefulCompressionSession` so compression processes plaintext before encryption.
The replacement `sea_core::session` facets are implemented directly on `StatefulCompressionSession`.
Loads decode the selected snapshot's live suffix; snapshots, availability handles, stored-content identities, publisher fences, and registration lifetime pass through unchanged.
Exact retries use deterministic dictionary frames, while decoding errors preserve the source's delivered cursor.

## Validation

From `rust-service/`:

```console
cargo test -p sea-stateful-compression --all-targets --all-features
cargo clippy -p sea-stateful-compression --all-targets --all-features -- -D warnings
RUSTDOCFLAGS="-D warnings" cargo doc -p sea-stateful-compression --all-features --no-deps
```

The test suite covers session conformance, configured limits, and malformed,
truncated, false-length, and wrong-dictionary frames.
Replacement tests also cover shared session conformance, bounds before storage, decoding-error progress, and dictionary-compression-over-encryption on both buffered and durable file-backed sequencers.
That composition test publishes snapshots, shuts down, reopens, and verifies decoded replay and snapshot content through the same wrappers.
