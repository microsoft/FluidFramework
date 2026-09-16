//! Transparent authenticated encryption for Sea event archives.
//!
//! Each record and snapshot is encrypted independently with AES-256-GCM-SIV.
//! The stored envelope contains a magic value, format and algorithm versions,
//! a record-or-snapshot context, a non-secret key identifier, a 96-bit nonce,
//! ciphertext, and a 128-bit authentication tag. The header is authenticated,
//! and the distinct contexts prevent swapping records with snapshots. Positions,
//! capabilities, and underlying error classifications pass through unchanged.
//!
//! [`OsNonceSource`] is the production default. Custom [`NonceSource`]
//! implementations must provide a fresh nonce for every payload written with a
//! given key; deterministic sources are suitable only for tests. A [`KeyProvider`]
//! must retain every historical key needed by stored envelopes and protect key
//! material outside this wrapper. Missing keys are unavailable, while malformed
//! or unauthenticated envelopes are corrupt without exposing authentication detail.
//!
//! Encryption and decryption allocate one complete payload-sized buffer and do
//! not impose a payload-size limit. A returned reader decrypts only the item being
//! polled and adds no stream buffer or background task; dropping it cancels further
//! wrapper work. Compression should wrap encryption so plaintext is compressed
//! before encryption; encrypting first generally prevents useful compression.

use std::fmt;

use aes_gcm_siv::{
    Aes256GcmSiv, Nonce, Tag,
    aead::{AeadInPlace, KeyInit},
};
use async_trait::async_trait;
use bytes::Bytes;
use futures_util::StreamExt;
use rand_core::{OsRng, RngCore};
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, Capabilities, ClassifiedError, CommittedEvent,
    ErrorKind, EventReceipt, EventStream, PositionCodec, PublishedSnapshot, Snapshot, SnapshotId,
    SnapshotStore, StreamReader,
    archive::{
        EventReceipt as SessionEventReceipt, EventSubmission, LoadEvent, OperationId,
        PublishedSnapshot as SessionPublishedSnapshot, SeaSession, SessionStream,
        SnapshotPublication,
    },
};
use thiserror::Error;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Identifies an encrypted envelope before version and algorithm parsing.
const MAGIC: &[u8; 4] = b"SSE1";
/// Current envelope format version.
const VERSION: u8 = 1;
/// Envelope algorithm identifier for AES-256-GCM-SIV.
const ALGORITHM_AES_256_GCM_SIV: u8 = 1;
/// Fixed byte width of a non-secret key identifier.
const KEY_ID_LENGTH: usize = 16;
/// Fixed AES-GCM-SIV nonce width.
const NONCE_LENGTH: usize = 12;
/// Fixed AES-GCM-SIV authentication tag width.
const TAG_LENGTH: usize = 16;
/// Authenticated envelope header width before ciphertext.
const HEADER_LENGTH: usize = MAGIC.len() + 3 + KEY_ID_LENGTH + NONCE_LENGTH;

/// The encoded bytes added to every encrypted payload.
pub const ENVELOPE_OVERHEAD: usize = HEADER_LENGTH + TAG_LENGTH;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
enum PayloadContext {
    /// Domain separator for append-stream records.
    Record = 1,
    /// Domain separator for snapshot payloads.
    Snapshot = 2,
    /// Domain separator for immutable blob leaves.
    Blob = 3,
}

/// A non-secret identifier for a 256-bit encryption key.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct KeyId([u8; KEY_ID_LENGTH]);

impl KeyId {
    /// Creates a fixed-width key identifier.
    #[must_use]
    pub const fn new(value: [u8; KEY_ID_LENGTH]) -> Self {
        Self(value)
    }

    /// Returns the non-secret identifier bytes.
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; KEY_ID_LENGTH] {
        &self.0
    }
}

/// Secret key bytes. Debug output and public accessors never expose the value.
#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct EncryptionKey([u8; 32]);

impl EncryptionKey {
    /// Takes ownership of an AES-256 key.
    #[must_use]
    pub const fn new(value: [u8; 32]) -> Self {
        Self(value)
    }
}

impl fmt::Debug for EncryptionKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("EncryptionKey([REDACTED])")
    }
}

/// A key selected for new writes.
#[derive(Clone, Debug)]
pub struct ActiveKey {
    /// The public identity encoded into the authenticated envelope.
    pub id: KeyId,
    /// The secret key material.
    pub key: EncryptionKey,
}

/// Resolves the active write key and historical read keys.
pub trait KeyProvider: Send + Sync {
    /// Returns the key used for a new record or snapshot.
    fn active_key(&self) -> Option<ActiveKey>;

    /// Resolves key material by its non-secret envelope identity.
    fn key_for_id(&self, id: &KeyId) -> Option<EncryptionKey>;
}

/// Supplies a fresh 96-bit nonce for each envelope.
pub trait NonceSource: Send + Sync {
    /// Generates one nonce or reports that the source is unavailable.
    ///
    /// # Errors
    ///
    /// Returns [`NonceUnavailable`] when a nonce cannot be generated securely.
    fn generate_nonce(&self) -> Result<[u8; NONCE_LENGTH], NonceUnavailable>;
}

/// Failure of a nonce source. It intentionally carries no source detail.
#[derive(Clone, Copy, Debug, Error)]
#[error("secure nonce source is unavailable")]
pub struct NonceUnavailable;

/// A nonce source backed by the operating system CSPRNG.
#[derive(Clone, Copy, Debug, Default)]
pub struct OsNonceSource;

impl NonceSource for OsNonceSource {
    fn generate_nonce(&self) -> Result<[u8; NONCE_LENGTH], NonceUnavailable> {
        let mut nonce = [0_u8; NONCE_LENGTH];
        OsRng
            .try_fill_bytes(&mut nonce)
            .map_err(|_| NonceUnavailable)?;
        Ok(nonce)
    }
}

/// An error produced by encryption or by the underlying store.
#[derive(Debug, Error)]
pub enum EncryptionError<E> {
    /// The underlying store rejected the operation.
    #[error("underlying store error: {0}")]
    Store(#[source] E),
    /// Required key material is unavailable. Key bytes are never retained.
    #[error("encryption key is unavailable for key identifier {key_id:?}")]
    KeyUnavailable {
        /// Requested historical key, or `None` when no active write key exists.
        key_id: Option<KeyId>,
    },
    /// The secure nonce source failed.
    #[error(transparent)]
    NonceUnavailable(#[from] NonceUnavailable),
    /// Encryption rejected the payload.
    #[error("payload encryption failed")]
    EncryptionFailed,
    /// Authentication, parsing, version, algorithm, or context validation failed.
    #[error("encrypted payload is corrupt")]
    CorruptEnvelope,
}

impl<E> ClassifiedError for EncryptionError<E>
where
    E: ClassifiedError,
{
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Store(error) => error.kind(),
            Self::KeyUnavailable { .. } | Self::NonceUnavailable(_) => ErrorKind::Unavailable,
            Self::EncryptionFailed => ErrorKind::Rejected,
            Self::CorruptEnvelope => ErrorKind::Corrupt,
        }
    }
}

/// Encrypts every record and snapshot independently over an underlying store.
#[derive(Clone, Debug)]
pub struct EncryptionStream<S, K, N = OsNonceSource> {
    /// Store that receives encrypted envelopes and owns positions and capabilities.
    inner: S,
    /// Provider for active and historical encryption keys.
    keys: K,
    /// Source of per-envelope nonces.
    nonces: N,
}

impl<S, K> EncryptionStream<S, K, OsNonceSource> {
    /// Wraps a store using operating-system-generated nonces.
    pub const fn new(inner: S, keys: K) -> Self {
        Self {
            inner,
            keys,
            nonces: OsNonceSource,
        }
    }
}

impl<S, K, N> EncryptionStream<S, K, N> {
    /// Wraps a store using an injected nonce source.
    pub const fn with_nonce_source(inner: S, keys: K, nonces: N) -> Self {
        Self {
            inner,
            keys,
            nonces,
        }
    }

    /// Returns the underlying store, key provider, and nonce source.
    pub fn into_parts(self) -> (S, K, N) {
        (self.inner, self.keys, self.nonces)
    }
}

/// Encrypts event payloads and blob leaves through an individual Sea session.
#[derive(Clone, Debug)]
pub struct EncryptionSession<S, K, N = OsNonceSource> {
    inner: S,
    keys: K,
    nonces: N,
}

impl<S, K> EncryptionSession<S, K, OsNonceSource> {
    /// Wraps a session using operating-system-generated nonces.
    pub const fn new(inner: S, keys: K) -> Self {
        Self {
            inner,
            keys,
            nonces: OsNonceSource,
        }
    }
}

impl<S, K, N> EncryptionSession<S, K, N> {
    /// Wraps a session using an injected nonce source.
    pub const fn with_nonce_source(inner: S, keys: K, nonces: N) -> Self {
        Self {
            inner,
            keys,
            nonces,
        }
    }

    /// Returns the underlying session, key provider, and nonce source.
    pub fn into_parts(self) -> (S, K, N) {
        (self.inner, self.keys, self.nonces)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S, K, N> SeaSession for EncryptionSession<S, K, N>
where
    S: SeaSession,
    K: KeyProvider + Clone + 'static,
    N: NonceSource,
{
    type Error = EncryptionError<S::Error>;

    async fn load(
        &self,
        required: Option<sea_core::EventPosition>,
    ) -> Result<SessionStream<LoadEvent, Self::Error>, Self::Error> {
        let stream = self
            .inner
            .load(required)
            .await
            .map_err(EncryptionError::Store)?;
        let keys = self.keys.clone();
        Ok(Box::pin(stream.map(move |item| {
            item.map_err(EncryptionError::Store).and_then(|mut item| {
                if let LoadEvent::Event(event) = &mut item {
                    event.committed.event.payload = decrypt_payload(
                        &keys,
                        &event.committed.event.payload,
                        PayloadContext::Record,
                    )?;
                }
                Ok(item)
            })
        })))
    }

    async fn read(
        &self,
        after: Option<sea_core::EventPosition>,
        through: Option<sea_core::EventPosition>,
    ) -> Result<SessionStream<sea_core::archive::SessionCommittedEvent, Self::Error>, Self::Error>
    {
        let stream = self
            .inner
            .read(after, through)
            .await
            .map_err(EncryptionError::Store)?;
        let keys = self.keys.clone();
        Ok(Box::pin(stream.map(move |item| {
            item.map_err(EncryptionError::Store).and_then(|mut event| {
                event.committed.event.payload = decrypt_payload(
                    &keys,
                    &event.committed.event.payload,
                    PayloadContext::Record,
                )?;
                Ok(event)
            })
        })))
    }

    async fn submit(
        &self,
        mut submission: EventSubmission,
    ) -> Result<SessionEventReceipt, Self::Error> {
        submission.event.payload = encrypt_payload(
            &self.keys,
            &self.nonces,
            &submission.event.payload,
            PayloadContext::Record,
        )?;
        self.inner
            .submit(submission)
            .await
            .map_err(EncryptionError::Store)
    }

    async fn resolve_submission(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<SessionEventReceipt>, Self::Error> {
        self.inner
            .resolve_submission(operation_id)
            .await
            .map_err(EncryptionError::Store)
    }

    async fn put_blob(&self, payload: Bytes) -> Result<BlobId, Self::Error> {
        let payload = encrypt_payload(&self.keys, &self.nonces, &payload, PayloadContext::Blob)?;
        self.inner
            .put_blob(payload)
            .await
            .map_err(EncryptionError::Store)
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        let payload = self
            .inner
            .get_blob(id)
            .await
            .map_err(EncryptionError::Store)?;
        decrypt_payload(&self.keys, &payload, PayloadContext::Blob)
    }

    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<BlobDirectoryId, Self::Error> {
        self.inner
            .put_directory(directory)
            .await
            .map_err(EncryptionError::Store)
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.inner
            .get_directory(id)
            .await
            .map_err(EncryptionError::Store)
    }

    async fn snapshot(
        &self,
        id: &SnapshotId,
    ) -> Result<Option<SessionPublishedSnapshot>, Self::Error> {
        self.inner
            .snapshot(id)
            .await
            .map_err(EncryptionError::Store)
    }

    async fn latest_snapshot(&self) -> Result<Option<SessionPublishedSnapshot>, Self::Error> {
        self.inner
            .latest_snapshot()
            .await
            .map_err(EncryptionError::Store)
    }

    async fn publish_snapshot(
        &self,
        publication: SnapshotPublication,
    ) -> Result<SessionPublishedSnapshot, Self::Error> {
        self.inner
            .publish_snapshot(publication)
            .await
            .map_err(EncryptionError::Store)
    }

    async fn resolve_snapshot_publication(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<SessionPublishedSnapshot>, Self::Error> {
        self.inner
            .resolve_snapshot_publication(operation_id)
            .await
            .map_err(EncryptionError::Store)
    }

    async fn subscribe_snapshots(
        &self,
    ) -> Result<SessionStream<SessionPublishedSnapshot, Self::Error>, Self::Error> {
        let stream = self
            .inner
            .subscribe_snapshots()
            .await
            .map_err(EncryptionError::Store)?;
        Ok(Box::pin(
            stream.map(|item| item.map_err(EncryptionError::Store)),
        ))
    }

    async fn close(&self) -> Result<(), Self::Error> {
        self.inner.close().await.map_err(EncryptionError::Store)
    }
}

/// Builds and authenticates one record or snapshot envelope.
fn encrypt_payload<E, K, N>(
    keys: &K,
    nonces: &N,
    payload: &Bytes,
    context: PayloadContext,
) -> Result<Bytes, EncryptionError<E>>
where
    K: KeyProvider,
    N: NonceSource,
{
    let active = keys
        .active_key()
        .ok_or(EncryptionError::KeyUnavailable { key_id: None })?;
    let nonce = nonces.generate_nonce()?;
    let mut header = Vec::with_capacity(HEADER_LENGTH);
    header.extend_from_slice(MAGIC);
    header.extend_from_slice(&[VERSION, ALGORITHM_AES_256_GCM_SIV, context as u8]);
    header.extend_from_slice(active.id.as_bytes());
    header.extend_from_slice(&nonce);

    let cipher = Aes256GcmSiv::new_from_slice(&active.key.0)
        .map_err(|_| EncryptionError::EncryptionFailed)?;
    let mut ciphertext = payload.to_vec();
    let tag = cipher
        .encrypt_in_place_detached(Nonce::from_slice(&nonce), &header, &mut ciphertext)
        .map_err(|_| EncryptionError::EncryptionFailed)?;
    header.append(&mut ciphertext);
    header.extend_from_slice(tag.as_slice());
    Ok(Bytes::from(header))
}

/// Validates and decrypts one envelope for the expected payload context.
fn decrypt_payload<E, K>(
    keys: &K,
    envelope: &Bytes,
    context: PayloadContext,
) -> Result<Bytes, EncryptionError<E>>
where
    K: KeyProvider,
{
    if envelope.len() < ENVELOPE_OVERHEAD
        || &envelope[..MAGIC.len()] != MAGIC
        || envelope[MAGIC.len()] != VERSION
        || envelope[MAGIC.len() + 1] != ALGORITHM_AES_256_GCM_SIV
        || envelope[MAGIC.len() + 2] != context as u8
    {
        return Err(EncryptionError::CorruptEnvelope);
    }

    let key_start = MAGIC.len() + 3;
    let nonce_start = key_start + KEY_ID_LENGTH;
    let key_id = KeyId(
        envelope[key_start..nonce_start]
            .try_into()
            .map_err(|_| EncryptionError::CorruptEnvelope)?,
    );
    let key = keys
        .key_for_id(&key_id)
        .ok_or(EncryptionError::KeyUnavailable {
            key_id: Some(key_id),
        })?;
    let nonce_end = nonce_start + NONCE_LENGTH;
    let ciphertext_end = envelope.len() - TAG_LENGTH;
    let mut plaintext = envelope[HEADER_LENGTH..ciphertext_end].to_vec();
    let cipher =
        Aes256GcmSiv::new_from_slice(&key.0).map_err(|_| EncryptionError::CorruptEnvelope)?;
    cipher
        .decrypt_in_place_detached(
            Nonce::from_slice(&envelope[nonce_start..nonce_end]),
            &envelope[..HEADER_LENGTH],
            &mut plaintext,
            Tag::from_slice(&envelope[ciphertext_end..]),
        )
        .map_err(|_| EncryptionError::CorruptEnvelope)?;
    Ok(Bytes::from(plaintext))
}

#[async_trait]
impl<S, K, N> EventStream for EncryptionStream<S, K, N>
where
    S: EventStream,
    K: KeyProvider + Clone + 'static,
    N: NonceSource,
{
    type Position = S::Position;
    type Error = EncryptionError<S::Error>;

    /// Reports the underlying store's capabilities unchanged.
    fn capabilities(&self) -> Capabilities {
        self.inner.capabilities()
    }

    /// Encrypts and appends one record without changing its receipt.
    async fn append(&self, value: Bytes) -> Result<EventReceipt<Self::Position>, Self::Error> {
        let envelope = encrypt_payload::<S::Error, _, _>(
            &self.keys,
            &self.nonces,
            &value,
            PayloadContext::Record,
        )?;
        self.inner
            .append(envelope)
            .await
            .map_err(EncryptionError::Store)
    }

    /// Opens an underlying reader that decrypts each record when polled.
    async fn read(
        &self,
        after: Option<&Self::Position>,
    ) -> Result<StreamReader<Self::Position, Self::Error>, Self::Error> {
        let reader = self
            .inner
            .read(after)
            .await
            .map_err(EncryptionError::Store)?;
        let keys = self.keys.clone();
        Ok(Box::pin(reader.map(move |result| {
            result.map_err(EncryptionError::Store).and_then(|record| {
                decrypt_payload::<S::Error, _>(&keys, &record.payload, PayloadContext::Record).map(
                    |payload| CommittedEvent {
                        position: record.position,
                        payload,
                    },
                )
            })
        })))
    }

    /// Returns the underlying stream head unchanged.
    async fn head(&self) -> Result<Option<Self::Position>, Self::Error> {
        self.inner.head().await.map_err(EncryptionError::Store)
    }
}

impl<S, K, N> PositionCodec for EncryptionStream<S, K, N>
where
    S: PositionCodec,
    K: KeyProvider + Clone + 'static,
    N: NonceSource,
{
    /// Delegates position encoding without encrypting the opaque token.
    fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error> {
        self.inner
            .encode_position(position)
            .map_err(EncryptionError::Store)
    }

    /// Delegates position decoding without interpreting the opaque token.
    fn decode_position(&self, token: &[u8]) -> Result<Self::Position, Self::Error> {
        self.inner
            .decode_position(token)
            .map_err(EncryptionError::Store)
    }
}

#[async_trait]
impl<S, K, N> SnapshotStore for EncryptionStream<S, K, N>
where
    S: SnapshotStore,
    K: KeyProvider,
    N: NonceSource,
{
    type Position = S::Position;
    type Error = EncryptionError<S::Error>;

    /// Returns the latest snapshot after authenticating and decrypting its payload.
    async fn latest(&self) -> Result<Option<PublishedSnapshot<Self::Position>>, Self::Error> {
        self.inner
            .latest()
            .await
            .map_err(EncryptionError::Store)?
            .map(|published| {
                decrypt_payload::<S::Error, _>(
                    &self.keys,
                    &published.snapshot.payload,
                    PayloadContext::Snapshot,
                )
                .map(|payload| PublishedSnapshot {
                    id: published.id,
                    snapshot: Snapshot {
                        at_event: published.snapshot.at_event,
                        payload,
                    },
                })
            })
            .transpose()
    }

    /// Encrypts a snapshot with the snapshot domain before delegating publication.
    async fn publish(
        &self,
        snapshot: Snapshot<Self::Position>,
        expected_parent: Option<&SnapshotId>,
    ) -> Result<SnapshotId, Self::Error> {
        let envelope = encrypt_payload::<S::Error, _, _>(
            &self.keys,
            &self.nonces,
            &snapshot.payload,
            PayloadContext::Snapshot,
        )?;
        self.inner
            .publish(
                Snapshot {
                    at_event: snapshot.at_event,
                    payload: envelope,
                },
                expected_parent,
            )
            .await
            .map_err(EncryptionError::Store)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use futures_util::{StreamExt, TryStreamExt};
    use sea_compression::CompressionStream;
    use sea_core::{
        ClassifiedError, ErrorKind, EventStream, Snapshot, SnapshotPosition, SnapshotStore,
        archive::{AuthorId, EventSubmission, LoadEvent, OperationId, SeaSession, SessionId},
    };
    use sea_memory::{MemoryError, MemoryStream};
    use sea_sequencer::session::LocalSequencer;

    use super::*;

    const FIRST_ID: KeyId = KeyId::new([1; KEY_ID_LENGTH]);
    const SECOND_ID: KeyId = KeyId::new([2; KEY_ID_LENGTH]);
    /// Mutable active-key identity and retained test key material.
    type TestKeyState = (KeyId, Vec<(KeyId, [u8; 32])>);

    /// Rotatable in-memory key provider used to exercise key lifecycle behavior.
    #[derive(Clone, Debug)]
    struct TestKeys {
        state: Arc<Mutex<TestKeyState>>,
    }

    impl TestKeys {
        /// Creates a provider with the first key active.
        fn new() -> Self {
            Self {
                state: Arc::new(Mutex::new((FIRST_ID, vec![(FIRST_ID, [7; 32])]))),
            }
        }

        /// Creates a provider whose key identifier matches but key material does not.
        fn wrong() -> Self {
            Self {
                state: Arc::new(Mutex::new((FIRST_ID, vec![(FIRST_ID, [9; 32])]))),
            }
        }

        /// Retains the first key and makes a second key active.
        fn rotate(&self) {
            let mut state = self.state.lock().unwrap();
            state.1.push((SECOND_ID, [8; 32]));
            state.0 = SECOND_ID;
        }
    }

    impl KeyProvider for TestKeys {
        fn active_key(&self) -> Option<ActiveKey> {
            let state = self.state.lock().unwrap();
            let (id, bytes) = state.1.iter().find(|(id, _)| *id == state.0)?;
            Some(ActiveKey {
                id: *id,
                key: EncryptionKey::new(*bytes),
            })
        }

        fn key_for_id(&self, id: &KeyId) -> Option<EncryptionKey> {
            self.state
                .lock()
                .unwrap()
                .1
                .iter()
                .find(|(candidate, _)| candidate == id)
                .map(|(_, bytes)| EncryptionKey::new(*bytes))
        }
    }

    /// Deterministic nonce source for reproducible envelope tests.
    #[derive(Clone, Debug)]
    struct FixedNonce([u8; NONCE_LENGTH]);

    impl NonceSource for FixedNonce {
        fn generate_nonce(&self) -> Result<[u8; NONCE_LENGTH], NonceUnavailable> {
            Ok(self.0)
        }
    }

    /// Nonce source that always reports secure randomness as unavailable.
    #[derive(Clone, Copy, Debug)]
    struct UnavailableNonce;

    impl NonceSource for UnavailableNonce {
        fn generate_nonce(&self) -> Result<[u8; NONCE_LENGTH], NonceUnavailable> {
            Err(NonceUnavailable)
        }
    }

    /// Builds the standard deterministic encrypted memory stream fixture.
    fn stream() -> EncryptionStream<MemoryStream, TestKeys, FixedNonce> {
        EncryptionStream::with_nonce_source(
            MemoryStream::new(),
            TestKeys::new(),
            FixedNonce([3; 12]),
        )
    }

    #[tokio::test]
    async fn session_decorator_round_trips_events_and_blobs() {
        let sequencer = LocalSequencer::recover(Arc::new(MemoryStream::new()))
            .await
            .unwrap();
        let session = sequencer
            .open_session(
                AuthorId::new(Bytes::from_static(b"author")).unwrap(),
                SessionId::new(Bytes::from_static(b"session")).unwrap(),
                None,
            )
            .await
            .unwrap();
        let encrypted =
            EncryptionSession::with_nonce_source(session, TestKeys::new(), FixedNonce([3; 12]));
        let blob = encrypted
            .put_blob(Bytes::from_static(b"secret blob"))
            .await
            .unwrap();
        assert_eq!(
            encrypted.get_blob(blob).await.unwrap(),
            Bytes::from_static(b"secret blob")
        );
        let receipt = encrypted
            .submit(EventSubmission {
                operation_id: OperationId::new(Bytes::from_static(b"operation")).unwrap(),
                reference: None,
                event: sea_core::Event {
                    payload: Bytes::from_static(b"secret event"),
                    blob_tree: None,
                },
            })
            .await
            .unwrap();
        let mut load = encrypted.load(None).await.unwrap();
        let LoadEvent::Event(event) = load.next().await.unwrap().unwrap() else {
            panic!("load should begin with the event");
        };
        assert_eq!(event.committed.position, receipt.position);
        assert_eq!(
            event.committed.event.payload,
            Bytes::from_static(b"secret event")
        );
    }

    #[tokio::test]
    async fn passes_shared_conformance() {
        sea_conformance::run_conformance(stream).await;
    }

    #[tokio::test]
    async fn passes_position_codec_conformance() {
        sea_conformance::run_position_codec_conformance(stream, b"malformed").await;
    }

    #[tokio::test]
    async fn empty_and_large_records_round_trip() {
        let stream = stream();
        let large = Bytes::from(vec![0x5a; 1024 * 1024]);
        stream.append(Bytes::new()).await.unwrap();
        stream.append(large.clone()).await.unwrap();
        let records = stream
            .read(None)
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(records[0].payload, Bytes::new());
        assert_eq!(records[1].payload, large);
    }

    #[tokio::test]
    async fn snapshots_round_trip_with_separate_context() {
        let stream = stream();
        let position = stream
            .append(Bytes::from_static(b"record"))
            .await
            .unwrap()
            .position;
        stream
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::At(position.clone()),
                    payload: Bytes::from_static(b"snapshot"),
                },
                None,
            )
            .await
            .unwrap();
        let latest = stream.latest().await.unwrap().unwrap();
        assert_eq!(latest.snapshot.payload, Bytes::from_static(b"snapshot"));
        assert_eq!(latest.snapshot.at_event, SnapshotPosition::At(position));
    }

    #[tokio::test]
    async fn corrupted_snapshot_has_the_common_corruption_error() {
        let inner = MemoryStream::new();
        inner
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::Initial,
                    payload: Bytes::from_static(b"not an encrypted envelope"),
                },
                None,
            )
            .await
            .unwrap();
        let stream =
            EncryptionStream::with_nonce_source(inner, TestKeys::new(), FixedNonce([0; 12]));
        let error = stream.latest().await.unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Corrupt);
        assert_eq!(error.to_string(), "encrypted payload is corrupt");
    }

    #[tokio::test]
    async fn wrong_key_has_one_corruption_error() {
        let inner = MemoryStream::new();
        EncryptionStream::with_nonce_source(inner.clone(), TestKeys::new(), FixedNonce([4; 12]))
            .append(Bytes::from_static(b"secret"))
            .await
            .unwrap();
        let wrong =
            EncryptionStream::with_nonce_source(inner, TestKeys::wrong(), FixedNonce([5; 12]));
        let error = wrong
            .read(None)
            .await
            .unwrap()
            .next()
            .await
            .unwrap()
            .unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Corrupt);
        assert_eq!(error.to_string(), "encrypted payload is corrupt");
    }

    #[tokio::test]
    async fn unavailable_key_is_distinguishable_without_key_material() {
        let inner = MemoryStream::new();
        EncryptionStream::with_nonce_source(inner.clone(), TestKeys::new(), FixedNonce([4; 12]))
            .append(Bytes::from_static(b"secret"))
            .await
            .unwrap();
        let missing = TestKeys {
            state: Arc::new(Mutex::new((SECOND_ID, vec![(SECOND_ID, [8; 32])]))),
        };
        let reader = EncryptionStream::with_nonce_source(inner, missing, FixedNonce([5; 12]));
        let error = reader
            .read(None)
            .await
            .unwrap()
            .next()
            .await
            .unwrap()
            .unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Unavailable);
        assert!(!format!("{error:?}").contains("7, 7, 7"));
    }

    #[tokio::test]
    async fn rotation_reads_old_and_new_envelopes() {
        let keys = TestKeys::new();
        let stream = EncryptionStream::with_nonce_source(
            MemoryStream::new(),
            keys.clone(),
            FixedNonce([6; 12]),
        );
        stream.append(Bytes::from_static(b"old")).await.unwrap();
        keys.rotate();
        stream.append(Bytes::from_static(b"new")).await.unwrap();
        let payloads = stream
            .read(None)
            .await
            .unwrap()
            .map_ok(|record| record.payload)
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(
            payloads,
            [Bytes::from_static(b"old"), Bytes::from_static(b"new")]
        );
    }

    #[tokio::test]
    async fn cloned_store_can_be_reopened_with_the_same_keys() {
        let inner = MemoryStream::new();
        let keys = TestKeys::new();
        EncryptionStream::with_nonce_source(inner.clone(), keys.clone(), FixedNonce([7; 12]))
            .append(Bytes::from_static(b"persisted"))
            .await
            .unwrap();
        let reopened = EncryptionStream::with_nonce_source(inner, keys, FixedNonce([8; 12]));
        let record = reopened
            .read(None)
            .await
            .unwrap()
            .next()
            .await
            .unwrap()
            .unwrap();
        assert_eq!(record.payload, Bytes::from_static(b"persisted"));
    }

    #[tokio::test]
    async fn truncation_and_bit_flips_share_one_error() {
        let raw = MemoryStream::new();
        let writer =
            EncryptionStream::with_nonce_source(raw.clone(), TestKeys::new(), FixedNonce([9; 12]));
        writer
            .append(Bytes::from_static(b"authenticated"))
            .await
            .unwrap();
        let encoded = raw
            .read(None)
            .await
            .unwrap()
            .next()
            .await
            .unwrap()
            .unwrap()
            .payload;

        for corrupted in [
            encoded.slice(..encoded.len() - 1),
            {
                let mut value = encoded.to_vec();
                value[HEADER_LENGTH] ^= 1;
                Bytes::from(value)
            },
            {
                let mut value = encoded.to_vec();
                value[MAGIC.len()] ^= 1;
                Bytes::from(value)
            },
        ] {
            let inner = MemoryStream::new();
            inner.append(corrupted).await.unwrap();
            let reader =
                EncryptionStream::with_nonce_source(inner, TestKeys::new(), FixedNonce([0; 12]));
            let error = reader
                .read(None)
                .await
                .unwrap()
                .next()
                .await
                .unwrap()
                .unwrap_err();
            assert_eq!(error.kind(), ErrorKind::Corrupt);
            assert_eq!(error.to_string(), "encrypted payload is corrupt");
        }
    }

    #[test]
    fn every_truncated_envelope_is_corrupt() {
        let keys = TestKeys::new();
        let encoded = encrypt_payload::<MemoryError, _, _>(
            &keys,
            &FixedNonce([12; NONCE_LENGTH]),
            &Bytes::from_static(b"complete payload"),
            PayloadContext::Record,
        )
        .unwrap();

        for end in 0..encoded.len() {
            let error = decrypt_payload::<MemoryError, _>(
                &keys,
                &encoded.slice(..end),
                PayloadContext::Record,
            )
            .unwrap_err();
            assert_eq!(error.kind(), ErrorKind::Corrupt, "prefix length {end}");
        }
    }

    #[tokio::test]
    async fn nonce_failure_rejects_records_and_snapshots_without_writing() {
        let inner = MemoryStream::new();
        let stream =
            EncryptionStream::with_nonce_source(inner.clone(), TestKeys::new(), UnavailableNonce);

        let append_error = stream
            .append(Bytes::from_static(b"record"))
            .await
            .unwrap_err();
        assert_eq!(append_error.kind(), ErrorKind::Unavailable);
        assert_eq!(inner.head().await.unwrap(), None);

        let publish_error = stream
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::Initial,
                    payload: Bytes::from_static(b"snapshot"),
                },
                None,
            )
            .await
            .unwrap_err();
        assert_eq!(publish_error.kind(), ErrorKind::Unavailable);
        assert!(inner.latest().await.unwrap().is_none());
    }

    #[tokio::test]
    async fn decrypts_records_lazily_at_poll_boundary() {
        let inner = MemoryStream::new();
        EncryptionStream::with_nonce_source(
            inner.clone(),
            TestKeys::new(),
            FixedNonce([13; NONCE_LENGTH]),
        )
        .append(Bytes::from_static(b"first"))
        .await
        .unwrap();
        inner
            .append(Bytes::from_static(b"corrupt second envelope"))
            .await
            .unwrap();
        let stream = EncryptionStream::with_nonce_source(
            inner,
            TestKeys::new(),
            FixedNonce([14; NONCE_LENGTH]),
        );
        let mut reader = stream.read(None).await.unwrap();

        assert_eq!(
            reader.next().await.unwrap().unwrap().payload,
            Bytes::from_static(b"first")
        );
        assert_eq!(
            reader.next().await.unwrap().unwrap_err().kind(),
            ErrorKind::Corrupt
        );
    }

    #[tokio::test]
    async fn key_id_and_context_are_authenticated() {
        let raw = MemoryStream::new();
        let keys = TestKeys::new();
        keys.rotate();
        let writer =
            EncryptionStream::with_nonce_source(raw.clone(), keys.clone(), FixedNonce([10; 12]));
        writer.append(Bytes::from_static(b"value")).await.unwrap();
        let encoded = raw
            .read(None)
            .await
            .unwrap()
            .next()
            .await
            .unwrap()
            .unwrap()
            .payload;
        let mut changed_id = encoded.to_vec();
        changed_id[MAGIC.len() + 3..MAGIC.len() + 3 + KEY_ID_LENGTH]
            .copy_from_slice(FIRST_ID.as_bytes());
        let inner = MemoryStream::new();
        inner.append(Bytes::from(changed_id)).await.unwrap();
        let reader = EncryptionStream::with_nonce_source(inner, keys, FixedNonce([0; 12]));
        assert_eq!(
            reader
                .read(None)
                .await
                .unwrap()
                .next()
                .await
                .unwrap()
                .unwrap_err()
                .kind(),
            ErrorKind::Corrupt
        );
    }

    #[tokio::test]
    async fn deterministic_nonce_reuse_fixture_preserves_authentication() {
        let stream = stream();
        stream.append(Bytes::from_static(b"first")).await.unwrap();
        stream.append(Bytes::from_static(b"second")).await.unwrap();
        let payloads = stream
            .read(None)
            .await
            .unwrap()
            .map_ok(|record| record.payload)
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(
            payloads,
            [Bytes::from_static(b"first"), Bytes::from_static(b"second")]
        );
    }

    #[tokio::test]
    async fn compression_is_inside_encryption() {
        let raw = MemoryStream::new();
        let encrypted =
            EncryptionStream::with_nonce_source(raw.clone(), TestKeys::new(), FixedNonce([11; 12]));
        let stream = CompressionStream::new(encrypted);
        let payload = Bytes::from(vec![b'a'; 16 * 1024]);
        stream.append(payload.clone()).await.unwrap();
        let stored = raw
            .read(None)
            .await
            .unwrap()
            .next()
            .await
            .unwrap()
            .unwrap()
            .payload;
        assert_eq!(&stored[..MAGIC.len()], MAGIC);
        assert!(stored.len() < payload.len() / 4);
        let record = stream
            .read(None)
            .await
            .unwrap()
            .next()
            .await
            .unwrap()
            .unwrap();
        assert_eq!(record.payload, payload);
    }

    #[test]
    fn reports_envelope_overhead_and_redacts_keys() {
        println!(
            "encryption-envelope header={HEADER_LENGTH} tag={TAG_LENGTH} overhead={ENVELOPE_OVERHEAD}"
        );
        assert_eq!(HEADER_LENGTH, 35);
        assert_eq!(ENVELOPE_OVERHEAD, 51);
        assert_eq!(
            format!("{:?}", EncryptionKey::new([0x41; 32])),
            "EncryptionKey([REDACTED])"
        );
    }

    #[test]
    fn operating_system_nonce_source_produces_fresh_nonces() {
        let first = OsNonceSource.generate_nonce().unwrap();
        let second = OsNonceSource.generate_nonce().unwrap();
        assert_ne!(first, second);
    }
}
