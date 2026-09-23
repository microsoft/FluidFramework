//! Authenticated-encryption adapters for session facets.
//!
//! Event payloads and blob leaves use independent AES-256-GCM-SIV envelopes with distinct record
//! and blob contexts. Directories, snapshots, positions, and opaque availability handles pass
//! through in the ciphertext store's identity space. Reads decrypt lazily and preserve monitored
//! progress and underlying error classifications.
//!
//! Each submission is encrypted independently. Ambiguous outcomes terminate append authority;
//! clients recover the accepted prefix through the session's terminal departure before resubmission.

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
    /// Each stream retains a key-provider clone and forwards delivery progress without reinterpretation.
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
            let mut encoded = submission.clone();
            encoded.event.payload = encrypt_payload(
                &self.keys,
                &self.nonces,
                &submission.event.payload,
                PayloadContext::Record,
            )?;
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
    use sea_core::{Event, MonitoredStreamItem, storage::SeaStorage};
    use sea_memory::MemoryStorage;
    use sea_sequencer::session::LocalSequencer;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    #[tokio::test]
    async fn compression_encryption_conformance() {
        for compress in [false, true] {
            let storage = MemoryStorage::new();
            let (_, view) = storage.create_view().await.unwrap();
            let runtime = LocalSequencer::<MemoryStorage>::recover(view)
                .await
                .unwrap();
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

    #[tokio::test]
    async fn equal_submissions_encrypt_independently_and_recheck_authority() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
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

    #[tokio::test]
    async fn cancelled_preparation_terminates_clones_before_inner_append() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let session =
            EncryptionSession::new(runtime.open_session(None).await.unwrap(), TestKeys::new());
        session.announce_membership(Bytes::new()).await.unwrap();
        let clone = session.clone();
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
