#![doc = include_str!("../README.md")]

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
    ArchiveEventStream, ArchiveLoadStream, BlobDirectory, BlobDirectoryId, BlobId, ClassifiedError,
    ErrorKind, SnapshotId,
    archive::{
        EventReceipt as SessionEventReceipt, EventSubmission, LoadEvent, OperationId,
        PublishedSnapshot as SessionPublishedSnapshot, SeaArchive, SeaAuthorSession,
        SeaEventSubscription, SeaService,
    },
    map_monitored_stream,
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
    /// Domain separator for event records.
    Record = 1,
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
    /// A stable operation identity was reused with different plaintext input.
    #[error("operation identity is already bound to different input")]
    OperationConflict,
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
            Self::OperationConflict => ErrorKind::Conflict,
            Self::CorruptEnvelope => ErrorKind::Corrupt,
        }
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

impl<S, K, N> SeaService for EncryptionSession<S, K, N>
where
    S: SeaService,
    K: KeyProvider + Clone + 'static,
    N: NonceSource,
{
    type Error = EncryptionError<S::Error>;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S, K, N> SeaEventSubscription for EncryptionSession<S, K, N>
where
    S: SeaEventSubscription,
    K: KeyProvider + Clone + 'static,
    N: NonceSource,
{
    fn load(&self, required: Option<sea_core::EventPosition>) -> ArchiveLoadStream<Self::Error> {
        let keys = self.keys.clone();
        map_monitored_stream(
            self.inner.load(required),
            move |mut item| {
                if let LoadEvent::Event(event) = &mut item {
                    event.committed.event.payload = decrypt_payload(
                        &keys,
                        &event.committed.event.payload,
                        PayloadContext::Record,
                    )?;
                }
                Ok(item)
            },
            EncryptionError::Store,
        )
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S, K, N> SeaArchive for EncryptionSession<S, K, N>
where
    S: SeaArchive,
    K: KeyProvider + Clone + 'static,
    N: NonceSource,
{
    fn read(
        &self,
        after: Option<sea_core::EventPosition>,
        stop_after: Option<sea_core::EventPosition>,
    ) -> ArchiveEventStream<Self::Error> {
        let keys = self.keys.clone();
        map_monitored_stream(
            self.inner.read(after, stop_after),
            move |mut event| {
                event.committed.event.payload = decrypt_payload(
                    &keys,
                    &event.committed.event.payload,
                    PayloadContext::Record,
                )?;
                Ok(event)
            },
            EncryptionError::Store,
        )
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
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S, K, N> SeaAuthorSession for EncryptionSession<S, K, N>
where
    S: SeaArchive + SeaAuthorSession,
    K: KeyProvider + Clone + 'static,
    N: NonceSource,
{
    async fn submit(
        &self,
        mut submission: EventSubmission,
    ) -> Result<SessionEventReceipt, Self::Error> {
        if let Some(receipt) = self
            .inner
            .resolve_submission(&submission.operation_id)
            .await
            .map_err(EncryptionError::Store)?
        {
            let after = receipt
                .position
                .get()
                .checked_sub(1)
                .filter(|position| *position != 0)
                .map(sea_core::EventPosition::new);
            let mut events = self.inner.read(after, Some(receipt.position));
            let mut committed = loop {
                match events
                    .next()
                    .await
                    .ok_or(EncryptionError::OperationConflict)?
                    .map_err(EncryptionError::Store)?
                {
                    sea_core::MonitoredStreamItem::Item(event) => break event,
                    sea_core::MonitoredStreamItem::Progress(_) => {}
                }
            };
            committed.committed.event.payload = decrypt_payload(
                &self.keys,
                &committed.committed.event.payload,
                PayloadContext::Record,
            )?;
            if committed.operation_id == submission.operation_id
                && committed.reference == submission.reference
                && committed.committed.event == submission.event
            {
                return Ok(receipt);
            }
            return Err(EncryptionError::OperationConflict);
        }
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

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use futures_util::StreamExt;
    use sea_core::{
        ClassifiedError, ErrorKind,
        archive::{
            AuthorId, EventSubmission, LoadEvent, OperationId, SeaArchive, SeaAuthorSession,
            SeaEventSubscription, SessionId,
        },
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

        /// Creates a provider with no active or historical key material.
        fn empty() -> Self {
            Self {
                state: Arc::new(Mutex::new((FIRST_ID, Vec::new()))),
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
        let mut load = encrypted.load(None);
        let event = loop {
            match load.next().await.unwrap().unwrap() {
                sea_core::MonitoredStreamItem::Item(LoadEvent::Event(event)) => break event,
                sea_core::MonitoredStreamItem::Item(LoadEvent::Snapshot(_))
                | sea_core::MonitoredStreamItem::Progress(_) => {}
            }
        };
        assert_eq!(event.committed.position, receipt.position);
        assert_eq!(
            event.committed.event.payload,
            Bytes::from_static(b"secret event")
        );
    }

    #[tokio::test]
    async fn passes_session_conformance() {
        let sequencer = LocalSequencer::recover(Arc::new(MemoryStream::new()))
            .await
            .unwrap();
        let session = sequencer
            .open_session(
                AuthorId::new(Bytes::from_static(b"conformance-author")).unwrap(),
                SessionId::new(Bytes::from_static(b"conformance-session")).unwrap(),
                None,
            )
            .await
            .unwrap();
        let encrypted = EncryptionSession::new(session.clone(), TestKeys::new());
        sea_conformance::run_sea_responsibility_observable_behavior(&encrypted, &session).await;
    }

    #[test]
    fn envelope_round_trips_across_key_rotation() {
        let keys = TestKeys::new();
        let old = encrypt_payload::<MemoryError, _, _>(
            &keys,
            &FixedNonce([6; 12]),
            &Bytes::from_static(b"old"),
            PayloadContext::Record,
        )
        .unwrap();
        keys.rotate();
        let new = encrypt_payload::<MemoryError, _, _>(
            &keys,
            &FixedNonce([7; 12]),
            &Bytes::from_static(b"new"),
            PayloadContext::Record,
        )
        .unwrap();
        assert_eq!(
            decrypt_payload::<MemoryError, _>(&keys, &old, PayloadContext::Record).unwrap(),
            Bytes::from_static(b"old")
        );
        assert_eq!(
            decrypt_payload::<MemoryError, _>(&keys, &new, PayloadContext::Record).unwrap(),
            Bytes::from_static(b"new")
        );
    }

    #[test]
    fn empty_payload_round_trips() {
        let keys = TestKeys::new();
        let encoded = encrypt_payload::<MemoryError, _, _>(
            &keys,
            &FixedNonce([8; NONCE_LENGTH]),
            &Bytes::new(),
            PayloadContext::Record,
        )
        .unwrap();

        assert_eq!(encoded.len(), ENVELOPE_OVERHEAD);
        assert_eq!(
            decrypt_payload::<MemoryError, _>(&keys, &encoded, PayloadContext::Record).unwrap(),
            Bytes::new()
        );
    }

    #[test]
    fn missing_active_and_historical_keys_are_unavailable() {
        let missing_active = encrypt_payload::<MemoryError, _, _>(
            &TestKeys::empty(),
            &FixedNonce([8; NONCE_LENGTH]),
            &Bytes::from_static(b"plaintext"),
            PayloadContext::Record,
        )
        .unwrap_err();
        assert!(matches!(
            missing_active,
            EncryptionError::KeyUnavailable { key_id: None }
        ));

        let encoded = encrypt_payload::<MemoryError, _, _>(
            &TestKeys::new(),
            &FixedNonce([8; NONCE_LENGTH]),
            &Bytes::from_static(b"plaintext"),
            PayloadContext::Record,
        )
        .unwrap();
        let missing_historical =
            decrypt_payload::<MemoryError, _>(&TestKeys::empty(), &encoded, PayloadContext::Record)
                .unwrap_err();
        assert!(matches!(
            missing_historical,
            EncryptionError::KeyUnavailable {
                key_id: Some(FIRST_ID)
            }
        ));
    }

    #[test]
    fn wrong_key_tampering_and_context_share_corruption_errors() {
        let keys = TestKeys::new();
        let encoded = encrypt_payload::<MemoryError, _, _>(
            &keys,
            &FixedNonce([9; 12]),
            &Bytes::from_static(b"authenticated"),
            PayloadContext::Record,
        )
        .unwrap();
        let wrong_key =
            decrypt_payload::<MemoryError, _>(&TestKeys::wrong(), &encoded, PayloadContext::Record)
                .unwrap_err();
        assert_eq!(wrong_key.kind(), ErrorKind::Corrupt);
        let wrong_context =
            decrypt_payload::<MemoryError, _>(&keys, &encoded, PayloadContext::Blob).unwrap_err();
        assert_eq!(wrong_context.kind(), ErrorKind::Corrupt);
        let mut tampered = encoded.to_vec();
        tampered[HEADER_LENGTH] ^= 1;
        assert_eq!(
            decrypt_payload::<MemoryError, _>(
                &keys,
                &Bytes::from(tampered),
                PayloadContext::Record,
            )
            .unwrap_err()
            .kind(),
            ErrorKind::Corrupt
        );
    }

    #[test]
    fn invalid_fixed_header_fields_are_corrupt() {
        let keys = TestKeys::new();
        let encoded = encrypt_payload::<MemoryError, _, _>(
            &keys,
            &FixedNonce([10; NONCE_LENGTH]),
            &Bytes::from_static(b"authenticated"),
            PayloadContext::Record,
        )
        .unwrap();

        for offset in [0, MAGIC.len(), MAGIC.len() + 1] {
            let mut malformed = encoded.to_vec();
            malformed[offset] ^= u8::MAX;
            let error = decrypt_payload::<MemoryError, _>(
                &keys,
                &Bytes::from(malformed),
                PayloadContext::Record,
            )
            .unwrap_err();
            assert_eq!(error.kind(), ErrorKind::Corrupt, "header offset {offset}");
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

    #[test]
    fn nonce_failure_is_unavailable() {
        let error = encrypt_payload::<MemoryError, _, _>(
            &TestKeys::new(),
            &UnavailableNonce,
            &Bytes::from_static(b"record"),
            PayloadContext::Record,
        )
        .unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Unavailable);
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
