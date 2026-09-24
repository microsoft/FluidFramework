//! Authenticated-encryption adapters for session facets.
//!
//! Application-event payloads and blob leaves use independent AES-256-GCM-SIV envelopes with distinct record and blob contexts.
//! Membership metadata passes through unchanged.
//! Directories, snapshots, positions, and opaque availability handles pass through in the ciphertext store's identity space.
//! Reads decrypt lazily and preserve monitored progress and underlying error classifications.
//!
//! Each submission is encrypted independently.
//! Ambiguous outcomes terminate append authority.
//! Recovery follows [`SeaAuthorSession`]: replay through the terminal
//! departure before transforming the unaccepted suffix for submission under a fresh session.

use crate::{
    EncryptionError, EncryptionSession, KeyProvider, NonceSource, PayloadContext, decrypt_payload,
    encrypt_payload,
};
use async_trait::async_trait;
use bytes::Bytes;
use futures_util::StreamExt;
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, EventPosition,
    archive::{EventSubmission, SessionCommittedEvent, SessionStream, SnapshotParticipation},
    map_monitored_stream,
    session::{
        SeaArchive, SeaAuthorSession, SeaSnapshotCoordinator, SessionLoad, SnapshotCoordination,
    },
    storage::{ArchiveStream, LoadStart, Snapshot},
};

impl<Session: SeaArchive, Keys: KeyProvider + Clone + 'static, Nonces: NonceSource>
    EncryptionSession<Session, Keys, Nonces>
{
    /// Decrypts application events on poll and leaves membership records unchanged.
    ///
    /// Each stream retains a key-provider clone and forwards delivery progress without reinterpretation,
    /// including when decryption fails.
    fn decode_next(
        &self,
        source: ArchiveStream<SessionCommittedEvent, EventPosition, Session::Error>,
    ) -> ArchiveStream<SessionCommittedEvent, EventPosition, EncryptionError<Session::Error>> {
        let keys = self.keys.clone();
        map_monitored_stream(
            source,
            move |mut event| {
                if event.kind == sea_core::archive::SessionEventKind::Application {
                    event.committed.event.payload = decrypt_payload(
                        &keys,
                        &event.committed.event.payload,
                        PayloadContext::Record,
                    )?;
                }
                Ok(event)
            },
            EncryptionError::Store,
        )
    }
}

impl<Session: SeaAuthorSession, Keys: KeyProvider + Clone + 'static, Nonces: NonceSource>
    EncryptionSession<Session, Keys, Nonces>
{
    /// Serializes admission and leaves authority terminal unless the admitted operation succeeds.
    ///
    /// Hold the returned guard through preparation and the inner append, then clear the flag only on success.
    /// Leaving the flag set makes cancellation terminal even before the inner session receives a request.
    async fn begin_append(
        &self,
    ) -> Result<futures_util::lock::MutexGuard<'_, bool>, EncryptionError<Session::Error>> {
        let mut terminal = self.author_terminal.lock().await;
        if *terminal {
            let _ = self.inner.close().await;
            return Err(EncryptionError::Closed);
        }
        *terminal = true;
        Ok(terminal)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Session: SeaArchive, Keys: KeyProvider + Clone + 'static, Nonces: NonceSource> SeaArchive
    for EncryptionSession<Session, Keys, Nonces>
{
    type BlobHandle = Session::BlobHandle;
    type EventHandle = Session::EventHandle;
    fn read(
        &self,
        after: Option<EventPosition>,
        stop: Option<EventPosition>,
    ) -> ArchiveStream<SessionCommittedEvent, EventPosition, Self::Error> {
        self.decode_next(self.inner.read(after, stop))
    }
    async fn load(
        &self,
        start: LoadStart,
    ) -> Result<SessionLoad<Self::BlobHandle, Self::EventHandle, Self::Error>, Self::Error> {
        let loaded = self
            .inner
            .load(start)
            .await
            .map_err(EncryptionError::Store)?;
        Ok(SessionLoad {
            snapshot: loaded.snapshot,
            events: self.decode_next(loaded.events),
        })
    }
    async fn get_snapshot(
        &self,
        start: LoadStart,
    ) -> Result<Option<Snapshot<Self::BlobHandle, Self::EventHandle>>, Self::Error> {
        self.inner
            .get_snapshot(start)
            .await
            .map_err(EncryptionError::Store)
    }
    async fn put_blob(&self, payload: Bytes) -> Result<Self::BlobHandle, Self::Error> {
        self.inner
            .put_blob(encrypt_payload(
                &self.keys,
                &self.nonces,
                &payload,
                PayloadContext::Blob,
            )?)
            .await
            .map_err(EncryptionError::Store)
    }
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        decrypt_payload(
            &self.keys,
            &self
                .inner
                .get_blob(id)
                .await
                .map_err(EncryptionError::Store)?,
            PayloadContext::Blob,
        )
    }
    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<Self::BlobHandle, Self::Error> {
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
    async fn resolve_tree(&self, id: BlobTreeId) -> Result<Option<Self::BlobHandle>, Self::Error> {
        self.inner
            .resolve_tree(id)
            .await
            .map_err(EncryptionError::Store)
    }
    async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::EventHandle>, Self::Error> {
        self.inner
            .resolve_position(position)
            .await
            .map_err(EncryptionError::Store)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Session: SeaAuthorSession, Keys: KeyProvider + Clone + 'static, Nonces: NonceSource>
    SeaAuthorSession for EncryptionSession<Session, Keys, Nonces>
{
    async fn announce_membership(&self, metadata: Bytes) -> Result<EventPosition, Self::Error> {
        let mut terminal = self.begin_append().await?;
        let result = self
            .inner
            .announce_membership(metadata)
            .await
            .map_err(EncryptionError::Store);
        if result.is_ok() {
            *terminal = false;
        }
        result
    }
    async fn submit(&self, submission: EventSubmission) -> Result<EventPosition, Self::Error> {
        let mut terminal = self.begin_append().await?;
        let result = async {
            let payload = encrypt_payload(
                &self.keys,
                &self.nonces,
                &submission.event.payload,
                PayloadContext::Record,
            )?;
            let mut encoded = submission;
            encoded.event.payload = payload;
            self.inner
                .submit(encoded)
                .await
                .map_err(EncryptionError::Store)
        }
        .await;
        if result.is_err() {
            let _ = self.inner.close().await;
        } else {
            *terminal = false;
        }
        result
    }
    async fn close(&self) -> Result<(), Self::Error> {
        *self.author_terminal.lock().await = true;
        self.inner.close().await.map_err(EncryptionError::Store)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Session: SeaSnapshotCoordinator, Keys: KeyProvider + Clone + 'static, Nonces: NonceSource>
    SeaSnapshotCoordinator for EncryptionSession<Session, Keys, Nonces>
{
    async fn coordinate_snapshots(
        &self,
        participation: SnapshotParticipation,
    ) -> Result<SessionStream<SnapshotCoordination, Self::Error>, Self::Error> {
        let source = self
            .inner
            .coordinate_snapshots(participation)
            .await
            .map_err(EncryptionError::Store)?;
        Ok(Box::pin(
            source.map(|item| item.map_err(EncryptionError::Store)),
        ))
    }
    async fn publish_snapshot(
        &self,
        parent: Option<EventPosition>,
        fence: Option<u64>,
        snapshot: Snapshot<Self::BlobHandle, Self::EventHandle>,
    ) -> Result<Snapshot<Self::BlobHandle, Self::EventHandle>, Self::Error> {
        self.inner
            .publish_snapshot(parent, fence, snapshot)
            .await
            .map_err(EncryptionError::Store)
    }
    async fn revoke_snapshot_publisher(&self) -> Result<(), Self::Error> {
        self.inner
            .revoke_snapshot_publisher()
            .await
            .map_err(EncryptionError::Store)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{CountingNonce, TestKeys};
    use futures_util::FutureExt;
    use sea_core::{
        ClassifiedError, ErrorKind, Event, MonitoredStreamItem,
        archive::SessionEventKind,
        storage::{SeaStorage, StorageHandle},
    };
    use sea_memory::MemoryStorage;
    use sea_sequencer::session::LocalSequencer;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    /// Recovers a fresh in-memory document for each test or conformance mode.
    async fn new_runtime() -> Arc<LocalSequencer<MemoryStorage>> {
        let storage = MemoryStorage::new();
        let (_, view) = storage
            .create_view()
            .await
            .expect("create an isolated in-memory document");
        LocalSequencer::recover(view)
            .await
            .expect("recover the empty in-memory document")
    }

    /// Reads one data item while leaving progress assertions to each boundary test.
    async fn next_event<E: std::fmt::Debug>(
        events: &mut ArchiveStream<SessionCommittedEvent, EventPosition, E>,
    ) -> SessionCommittedEvent {
        while let Some(item) = events.next().await {
            if let MonitoredStreamItem::Item(event) = item.unwrap() {
                return event;
            }
        }
        panic!("expected an event");
    }

    /// Compares raw and decorated views of the same archive to distinguish encrypted payloads
    /// from public control data and ciphertext-based tree identities.
    #[tokio::test]
    async fn encrypted_payloads_preserve_control_metadata_and_stored_tree_identities() {
        let runtime = new_runtime().await;
        let raw = runtime.open_session(None).await.unwrap();
        let keys = TestKeys::new();
        let calls = Arc::new(AtomicUsize::new(0));
        let wrapped = EncryptionSession::with_nonce_source(
            raw.clone(),
            keys.clone(),
            CountingNonce {
                calls: calls.clone(),
            },
        );
        let payload = Bytes::from_static(b"application payload");
        let blob = wrapped.put_blob(payload.clone()).await.unwrap();
        let BlobTreeId::Blob(id) = blob.id() else {
            panic!("expected blob")
        };
        let stored = raw.get_blob(id).await.unwrap();
        assert_ne!(stored, payload);
        assert_eq!(BlobId::for_bytes(&stored), id);
        assert_eq!(wrapped.get_blob(id).await.unwrap(), payload);
        assert!(
            decrypt_payload::<sea_memory::MemoryStorageError, _>(
                &keys,
                &stored,
                PayloadContext::Record,
            )
            .is_err()
        );
        assert_eq!(
            wrapped.resolve_tree(blob.id()).await.unwrap().unwrap().id(),
            blob.id()
        );
        let directory =
            BlobDirectory::new([("leaf".to_owned(), blob.id())].into_iter().collect()).unwrap();
        let root = wrapped.put_directory(directory.clone()).await.unwrap();
        let BlobTreeId::Directory(directory_id) = root.id() else {
            panic!("expected directory")
        };
        assert_eq!(raw.get_directory(directory_id).await.unwrap(), directory);
        assert_eq!(
            wrapped.get_directory(directory_id).await.unwrap(),
            directory
        );
        let joined = wrapped
            .announce_membership(Bytes::from_static(b"public"))
            .await
            .unwrap();
        let position = wrapped
            .submit(EventSubmission {
                reference: Some(joined),
                event: Event {
                    payload: payload.clone(),
                    blob_tree: Some(root.id()),
                },
            })
            .await
            .unwrap();
        assert_eq!(calls.load(Ordering::Relaxed), 2);
        let mut encoded = raw.read(None, Some(position));
        let mut decoded = wrapped.read(None, Some(position));
        let control = next_event(&mut encoded).await;
        assert_eq!(control.kind, SessionEventKind::Joined);
        assert_eq!(
            control.committed.event.payload,
            Bytes::from_static(b"public")
        );
        assert_eq!(next_event(&mut decoded).await, control);
        let mut application = next_event(&mut encoded).await;
        assert_eq!(
            decrypt_payload::<sea_memory::MemoryStorageError, _>(
                &keys,
                &application.committed.event.payload,
                PayloadContext::Record,
            )
            .unwrap(),
            payload
        );
        application.committed.event.payload = payload;
        assert_eq!(next_event(&mut decoded).await, application);
        assert_eq!(decoded.progress().previous, Some(position));
    }

    /// Exercises both publisher-selection modes through the wrapper while checking authority
    /// against the raw session, including revocation by stream drop.
    #[tokio::test]
    async fn load_and_coordination_forward_handles_fences_and_registration_lifetime() {
        let runtime = new_runtime().await;
        let raw = runtime.open_session(None).await.unwrap();
        let wrapped = EncryptionSession::new(raw.clone(), TestKeys::new());
        let root = wrapped.put_blob(Bytes::new()).await.unwrap();
        let submission = EventSubmission {
            reference: None,
            event: Event {
                payload: Bytes::from_static(b"event"),
                blob_tree: Some(root.id()),
            },
        };
        let first = wrapped.submit(submission.clone()).await.unwrap();
        let snapshot = Snapshot {
            root: root.clone(),
            at_event: wrapped.resolve_position(first).await.unwrap().unwrap(),
        };
        let mut authority = wrapped
            .coordinate_snapshots(SnapshotParticipation::SeaSelected)
            .await
            .unwrap();
        let fence = authority.next().await.unwrap().unwrap().fence;
        assert!(fence.is_some());
        assert!(matches!(
            wrapped.publish_snapshot(None, None, snapshot.clone()).await,
            Err(EncryptionError::Store(_))
        ));
        let published = wrapped
            .publish_snapshot(None, fence, snapshot.clone())
            .await
            .unwrap();
        assert_eq!(published.root.id(), root.id());
        assert_eq!(published.at_event.id(), first);
        assert_eq!(
            wrapped
                .get_snapshot(LoadStart::LatestSnapshot)
                .await
                .unwrap()
                .unwrap()
                .root
                .id(),
            root.id()
        );
        let mut loaded = wrapped.load(LoadStart::LatestSnapshot).await.unwrap();
        assert_eq!(loaded.snapshot.unwrap().at_event.id(), first);
        let second = wrapped.submit(submission.clone()).await.unwrap();
        let suffix = next_event(&mut loaded.events).await;
        assert_eq!(suffix.committed.position, second);
        assert_eq!(suffix.committed.event, submission.event);
        assert_eq!(loaded.events.progress().previous, Some(second));
        drop(authority);
        assert!(
            raw.publish_snapshot(None, fence, snapshot.clone())
                .await
                .is_err()
        );
        let authority = wrapped
            .coordinate_snapshots(SnapshotParticipation::ClientSelected)
            .await
            .unwrap();
        wrapped.revoke_snapshot_publisher().await.unwrap();
        assert!(raw.publish_snapshot(None, None, snapshot).await.is_err());
        drop(authority);
        let missing = BlobId::for_bytes(b"missing");
        assert_eq!(
            wrapped.get_blob(missing).await.unwrap_err().kind(),
            raw.get_blob(missing).await.unwrap_err().kind()
        );
        wrapped.close().await.unwrap();
        assert!(raw.submit(submission).await.is_err());
    }

    /// Distinguishes decryption failures after delivery from errors reported by the source stream.
    #[tokio::test]
    async fn malformed_stored_envelopes_preserve_error_kind_and_delivery_progress() {
        let runtime = new_runtime().await;
        let raw = runtime.open_session(None).await.unwrap();
        let malformed_blob = raw
            .put_blob(Bytes::from_static(b"not an envelope"))
            .await
            .unwrap();
        let position = raw
            .submit(EventSubmission {
                reference: None,
                event: Event {
                    payload: Bytes::from_static(b"not an envelope"),
                    blob_tree: None,
                },
            })
            .await
            .unwrap();
        let wrapped = EncryptionSession::new(raw, TestKeys::new());
        let BlobTreeId::Blob(id) = malformed_blob.id() else {
            panic!("expected blob")
        };
        assert_eq!(
            wrapped.get_blob(id).await.unwrap_err().kind(),
            ErrorKind::Corrupt
        );
        let mut events = wrapped.read(None, Some(position));
        assert!(matches!(
            events.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        assert_eq!(
            events.next().await.unwrap().unwrap_err().kind(),
            ErrorKind::Corrupt
        );
        assert_eq!(events.progress().previous, Some(position));
        let mut invalid = wrapped.read(None, Some(EventPosition::new(u64::MAX)));
        assert_eq!(
            invalid.next().await.unwrap().unwrap_err().kind(),
            ErrorKind::InvalidPosition
        );
    }

    /// Verifies that a failure before the inner submit still produces an observable departure
    /// and prevents both raw-session and wrapper-clone submissions.
    #[tokio::test]
    async fn failed_key_preparation_closes_inner_author_and_wrapper_clones() {
        let runtime = new_runtime().await;
        let raw = runtime.open_session(None).await.unwrap();
        let observer = runtime.open_session(None).await.unwrap();
        let wrapped = EncryptionSession::new(raw.clone(), TestKeys::empty());
        wrapped.announce_membership(Bytes::new()).await.unwrap();
        let clone = wrapped.clone();
        let submission = EventSubmission {
            reference: None,
            event: Event {
                payload: Bytes::new(),
                blob_tree: None,
            },
        };
        assert!(matches!(
            wrapped.submit(submission.clone()).await,
            Err(EncryptionError::KeyUnavailable { .. })
        ));
        assert!(matches!(
            clone.submit(submission.clone()).await,
            Err(EncryptionError::Closed)
        ));
        assert!(raw.submit(submission).await.is_err());
        let mut history = observer.read(None, Some(EventPosition::new(2)));
        assert_eq!(
            next_event(&mut history).await.kind,
            SessionEventKind::Joined
        );
        assert_eq!(next_event(&mut history).await.kind, SessionEventKind::Left);
    }

    /// Applies the shared session contract to encryption alone and to compression of plaintext
    /// before encryption, without introducing a separate wrapper-specific contract.
    #[tokio::test]
    async fn compression_encryption_conformance() {
        for compress in [false, true] {
            let runtime = new_runtime().await;
            let first =
                EncryptionSession::new(runtime.open_session(None).await.unwrap(), TestKeys::new());
            let second =
                EncryptionSession::new(runtime.open_session(None).await.unwrap(), TestKeys::new());
            if compress {
                sea_conformance::run_session_conformance(
                    &sea_compression::CompressionSession::new(first),
                    &sea_compression::CompressionSession::new(second),
                )
                .await;
            } else {
                sea_conformance::run_session_conformance(&first, &second).await;
            }
        }
    }

    /// Checks that neither key rotation nor equal inputs across sessions revive closed authority
    /// or reuse an earlier committed submission.
    #[tokio::test]
    async fn equal_submissions_encrypt_independently_and_recheck_authority() {
        let runtime = new_runtime().await;
        let keys = TestKeys::new();
        let calls = Arc::new(AtomicUsize::new(0));
        let nonces = CountingNonce {
            calls: calls.clone(),
        };
        let first = EncryptionSession::with_nonce_source(
            runtime.open_session(None).await.unwrap(),
            keys.clone(),
            nonces.clone(),
        );
        let submission = EventSubmission {
            reference: None,
            event: Event {
                payload: Bytes::from_static(b"plaintext"),
                blob_tree: None,
            },
        };
        let position = first.submit(submission.clone()).await.unwrap();
        first.close().await.unwrap();
        keys.rotate();
        let reconnected = EncryptionSession::with_nonce_source(
            runtime.open_session(None).await.unwrap(),
            keys.clone(),
            nonces.clone(),
        );
        assert!(reconnected.submit(submission.clone()).await.unwrap() > position);
        assert_eq!(calls.load(Ordering::Relaxed), 2);
        let other = EncryptionSession::with_nonce_source(
            runtime.open_session(None).await.unwrap(),
            keys,
            nonces,
        );
        assert!(other.submit(submission.clone()).await.unwrap() > position);
        let mut conflicting = submission;
        conflicting.event.payload = Bytes::from_static(b"changed");
        assert!(reconnected.submit(conflicting).await.unwrap() > position);
        assert!(
            first
                .submit(EventSubmission {
                    reference: None,
                    event: Event {
                        payload: Bytes::new(),
                        blob_tree: None
                    }
                })
                .await
                .is_err()
        );
    }

    /// Cancels after wrapper admission but before any inner append, then checks that clone
    /// rejection drives the announced membership's terminal departure.
    #[tokio::test]
    async fn cancelled_preparation_terminates_clones_before_inner_append() {
        let runtime = new_runtime().await;
        let session =
            EncryptionSession::new(runtime.open_session(None).await.unwrap(), TestKeys::new());
        session.announce_membership(Bytes::new()).await.unwrap();
        let clone = session.clone();
        // Stop after wrapper admission so only the wrapper can remember the cancelled request.
        let preparation = async {
            let _terminal = session.begin_append().await.unwrap();
            std::future::pending::<()>().await;
        };
        assert!(preparation.now_or_never().is_none());
        let submission = EventSubmission {
            reference: None,
            event: Event {
                payload: Bytes::new(),
                blob_tree: None,
            },
        };
        assert!(matches!(
            clone.submit(submission).await,
            Err(EncryptionError::Closed)
        ));
        assert!(matches!(
            session.announce_membership(Bytes::new()).await,
            Err(EncryptionError::Closed)
        ));
        session.close().await.unwrap();
        let observer = runtime.open_session(None).await.unwrap();
        let mut events = observer.read(None, Some(EventPosition::new(2)));
        let mut kinds = Vec::new();
        while let Some(item) = events.next().await {
            if let MonitoredStreamItem::Item(event) = item.unwrap() {
                kinds.push(event.kind);
            }
        }
        assert_eq!(
            kinds,
            vec![
                sea_core::archive::SessionEventKind::Joined,
                sea_core::archive::SessionEventKind::Left
            ]
        );
    }
}
