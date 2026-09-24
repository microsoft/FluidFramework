# Sea Encryption

`sea-encryption` transparently encrypts event payloads and blob leaves through `EncryptionSession<S, K, N>` using AES-256-GCM-SIV.
Each payload has an independent authenticated envelope; the wrapped session continues to own positions, blob-tree identities, snapshot lineage, operation recovery, cancellation, and backpressure.

## Envelope And Errors

The envelope authenticates its magic, format/algorithm versions, event-or-blob context, non-secret key identifier, nonce, and ciphertext.
The distinct contexts prevent swapping a stored event with a blob.
`ENVELOPE_OVERHEAD` is the fixed overhead; ciphertext length equals plaintext length.

| Failure | Classification |
| --- | --- |
| Malformed, truncated, context-swapped, or authentication-failing envelope | `CorruptEnvelope` / `Corrupt` |
| Missing key or nonce-source failure | `Unavailable` |
| Encryption failure | `Rejected` |
| Underlying session error | Original classification |

Historical-key lookup precedes authentication.
A structurally valid envelope naming an unavailable key returns `Unavailable`, including when that identifier was tampered with.
If the key is available, authentication rejects a changed identifier even when it resolves to the same key bytes.

## Keys And Nonces

`KeyProvider::active_key` selects new-write keys; `key_for_id` must retain all historical keys needed for reads.
`KeyId` is public; `EncryptionKey` redacts debug output and zeroizes on drop.
`OsNonceSource` uses the operating system's cryptographically secure random generator.
Injected sources must provide a fresh nonce per payload/key; deterministic sources are for tests only.
Each submission encrypts independently with a fresh nonce and is admitted under the current author membership.
Equal plaintext submissions are distinct events; the wrapper performs no committed-event lookup or ciphertext reuse.
Author operations are serialized across wrapper clones.
An append error or cancellation leaves the wrapper terminal; a later append cannot bypass that state even when the inner session never received the cancelled request.
Close, or the next attempted append, drives inner closure and its durable departure barrier.
Uncertain writes are never blindly resubmitted to storage, and a rejection never triggers a retry.

The wrapper buffers one complete payload with no size limit; untrusted inputs need an outer limit.
Reads decrypt on poll without a background task or extra stream buffer.

Directories, event metadata, and snapshot metadata remain visible so the server can validate ordering and reachability.
For compression plus encryption, wrap an `EncryptionSession` in `CompressionSession` so compression processes plaintext first.
Snapshot handles and publisher participation/fences pass through unchanged, and loads decrypt the direct live suffix.
Blob identities and handles identify stored ciphertext; directory references remain in that stored identity space.
Dropping a forwarded coordination stream revokes its underlying registration.

## Validation

From `rust-service/`:

```console
cargo test -p sea-encryption --all-targets --all-features
cargo clippy -p sea-encryption --all-targets --all-features -- -D warnings
RUSTDOCFLAGS="-D warnings" cargo doc -p sea-encryption --all-features --no-deps
```

Tests cover session conformance, compression composition, nonce use, key rotation, terminal append failures, envelope corruption/context separation, and key redaction.
