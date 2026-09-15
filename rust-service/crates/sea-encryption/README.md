# Encryption Wrapper

`snapshotted-stream-encryption` transparently encrypts every record and snapshot
with AES-256-GCM-SIV. Each payload has an independent authenticated envelope;
the wrapped store continues to own positions, snapshot lineage, capabilities,
cancellation, and backpressure.

## Envelope And Errors

The envelope authenticates its magic value, format and algorithm versions,
record-or-snapshot context, non-secret key identifier, nonce, and ciphertext.
The distinct contexts prevent swapping a stored record with a snapshot.
`ENVELOPE_OVERHEAD` is the fixed number of bytes added before accounting for
ciphertext, whose length equals the plaintext length.

Malformed, truncated, tampered, wrongly keyed, or context-swapped envelopes use
the single `CorruptEnvelope` error and classify as `ErrorKind::Corrupt`. Missing
active or historical keys and nonce-source failure classify as `Unavailable`.
Underlying errors preserve their classification, and encryption failure is
`Rejected`.

## Keys And Nonces

`KeyProvider::active_key` selects the key for new writes, while `key_for_id`
must retain every historical key needed to read stored envelopes. `KeyId` is
non-secret; `EncryptionKey` redacts debug output and zeroizes its bytes on drop.
The default `OsNonceSource` uses the operating-system CSPRNG. An injected
`NonceSource` must return a fresh nonce for every payload written under a key;
deterministic sources are only appropriate for tests.

The wrapper buffers one complete payload for encryption or decryption and has
no payload-size limit. Reads decrypt one record when polled and do not add a
background task or stream buffer.

For compression plus encryption, use
`CompressionStream<EncryptionStream<...>>`: the outer compression wrapper
compresses plaintext before the inner encryption wrapper persists it.

## Validation

From `rust-service/`:

```console
cargo test -p snapshotted-stream-encryption --all-targets --all-features
cargo clippy -p snapshotted-stream-encryption --all-targets --all-features -- -D warnings
RUSTDOCFLAGS="-D warnings" cargo doc -p snapshotted-stream-encryption --all-features --no-deps
```

The test suite covers shared stream, snapshot, and position-codec conformance;
key rotation and reopen; missing and wrong keys; nonce failure without writes;
truncation, tampering, and context separation; lazy decryption; redaction; and
compression-before-encryption composition.