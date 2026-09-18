# Encryption Wrapper

`sea-encryption` transparently encrypts event payloads and blob leaves through `EncryptionSession<S, K, N>` using AES-256-GCM-SIV.
Each payload has an independent authenticated envelope; the wrapped session continues to own positions, blob-tree identities, snapshot lineage, operation recovery, cancellation, and backpressure.

## Envelope And Errors

The envelope authenticates its magic value, format and algorithm versions,
event-or-blob context, non-secret key identifier, nonce, and ciphertext.
The distinct contexts prevent swapping a stored event with a blob.
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
An exact retry of an already committed operation reuses its original ciphertext without requesting another nonce, while changed plaintext, tree, or reference conflicts.
On the replacement path the wrapper verifies the committed plaintext, then asks the inner session to validate the original ciphertext under the current author membership.
This preserves author checks across reconnects and key rotation instead of returning a receipt solely from a visible operation identity.
If concurrent encodings race, a definitive rejection may reconcile an already committed matching operation; uncertain writes are never blindly resubmitted to storage.

The wrapper buffers one complete payload for encryption or decryption and has
no payload-size limit. Reads decrypt one event when polled and do not add a
background task or stream buffer.

Directories, event metadata, and snapshot metadata remain visible so the server can validate ordering and reachability.
For compression plus encryption, wrap an `EncryptionSession` in `CompressionSession` so compression processes plaintext first.
The replacement `sea_core::next::session` facets are implemented directly on `EncryptionSession`.
Snapshot handles and publisher participation/fences pass through unchanged, and loads decrypt the direct live suffix.
Blob identities and handles identify stored ciphertext; directory references remain in that stored identity space.
Dropping a forwarded coordination stream revokes its underlying registration.
Old session-trait implementations remain for benchmark consumers until checkpoint 5; only those old facets require undecorated snapshot coordination.

## Validation

From `rust-service/`:

```console
cargo test -p sea-encryption --all-targets --all-features
cargo clippy -p sea-encryption --all-targets --all-features -- -D warnings
RUSTDOCFLAGS="-D warnings" cargo doc -p sea-encryption --all-features --no-deps
```

The test suite covers session conformance and stable retries, empty payloads,
key rotation and unavailability, nonce failure and retry cardinality, malformed
and truncated envelopes, tampering, context separation, and key redaction.
Replacement tests additionally cover shared session conformance, compression-over-encryption, reconnect/key-rotation retry cardinality, and cross-author conflict rejection.
