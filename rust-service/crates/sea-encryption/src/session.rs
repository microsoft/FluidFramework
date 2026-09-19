//! Authenticated-encryption adapters for session facets.
//!
//! Event payloads and blob leaves use independent AES-256-GCM-SIV envelopes with distinct record
//! and blob contexts. Directories, snapshots, positions, and opaque availability handles pass
//! through in the ciphertext store's identity space. Reads decrypt lazily and preserve monitored
//! progress and underlying error classifications.
//!
//! Encryption is randomized, so an exact retry cannot generate fresh ciphertext and rely on the
//! inner operation identity. The adapter resolves the committed operation, verifies its plaintext,
//! tree, and reference, then resubmits the original ciphertext so the inner session rechecks current
//! author authority. Missing settlement or ambiguous errors are never converted into blind retries.

use crate::{
    EncryptionError, EncryptionSession, KeyProvider, NonceSource, PayloadContext, decrypt_payload,
    encrypt_payload,
};
use async_trait::async_trait;
use bytes::Bytes;
use futures_util::StreamExt;
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, ErrorKind, EventPosition,
    MonitoredStreamItem,
    archive::{
        EventSubmission, OperationId, SessionCommittedEvent, SessionStream, SnapshotParticipation,
    },
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
    /// Resolves settled input, preserving ciphertext so the inner author policy can validate the retry.
    async fn committed_retry(
        &self,
        submission: &EventSubmission,
    ) -> Result<Option<EventSubmission>, EncryptionError<Session::Error>> {
        let Some(position) = self
            .inner
            .resolve_submission(&submission.operation_id)
            .await
            .map_err(EncryptionError::Store)?
        else {
            return Ok(None);
        };
        let after = position
            .get()
            .checked_sub(1)
            .filter(|value| *value != 0)
            .map(EventPosition::new);
        let mut events = self.inner.read(after, Some(position));
        while let Some(item) = events.next().await {
            let MonitoredStreamItem::Item(committed) = item.map_err(EncryptionError::Store)? else {
                continue;
            };
            let ciphertext = committed.committed.event.payload.clone();
            let plaintext = decrypt_payload(&self.keys, &ciphertext, PayloadContext::Record)?;
            if committed.committed.position != position
                || committed.operation_id != submission.operation_id
                || committed.reference != submission.reference
                || committed.committed.event.blob_tree != submission.event.blob_tree
                || plaintext != submission.event.payload
            {
                return Err(EncryptionError::OperationConflict);
            }
            let mut retry = submission.clone();
            retry.event.payload = ciphertext;
            return Ok(Some(retry));
        }
        Err(EncryptionError::OperationConflict)
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
        self.inner
            .announce_membership(metadata)
            .await
            .map_err(EncryptionError::Store)
    }
    async fn submit(&self, submission: EventSubmission) -> Result<EventPosition, Self::Error> {
        if let Some(retry) = self.committed_retry(&submission).await? {
            return self
                .inner
                .submit(retry)
                .await
                .map_err(EncryptionError::Store);
        }
        let mut encoded = submission.clone();
        encoded.event.payload = encrypt_payload(
            &self.keys,
            &self.nonces,
            &submission.event.payload,
            PayloadContext::Record,
        )?;
        match self.inner.submit(encoded).await {
            Ok(position) => Ok(position),
            Err(error) => {
                if matches!(error.kind(), ErrorKind::Conflict | ErrorKind::Rejected)
                    && let Some(retry) = self.committed_retry(&submission).await?
                {
                    return self
                        .inner
                        .submit(retry)
                        .await
                        .map_err(EncryptionError::Store);
                }
                Err(EncryptionError::Store(error))
            }
        }
    }
    async fn resolve_submission(
        &self,
        operation: &OperationId,
    ) -> Result<Option<EventPosition>, Self::Error> {
        self.inner
            .resolve_submission(operation)
            .await
            .map_err(EncryptionError::Store)
    }
    async fn close(&self) -> Result<(), Self::Error> {
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
    use sea_core::{
        Event,
        archive::{AuthorId, SessionId},
        storage::SeaStorage,
    };
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
            let first = EncryptionSession::new(
                runtime
                    .open_session(
                        AuthorId::new("first").unwrap(),
                        SessionId::new("first").unwrap(),
                        None,
                    )
                    .await
                    .unwrap(),
                TestKeys::new(),
            );
            let second = EncryptionSession::new(
                runtime
                    .open_session(
                        AuthorId::new("second").unwrap(),
                        SessionId::new("second").unwrap(),
                        None,
                    )
                    .await
                    .unwrap(),
                TestKeys::new(),
            );
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
    async fn retries_preserve_ciphertext_but_recheck_authority() {
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
            runtime
                .open_session(
                    AuthorId::new("author").unwrap(),
                    SessionId::new("first").unwrap(),
                    None,
                )
                .await
                .unwrap(),
            keys.clone(),
            nonces.clone(),
        );
        let submission = EventSubmission {
            operation_id: OperationId::new("stable").unwrap(),
            reference: None,
            event: Event {
                payload: Bytes::from_static(b"plaintext"),
                blob_tree: None,
            },
        };
        let position = first.submit(submission.clone()).await.unwrap();
        keys.rotate();
        let reconnected = EncryptionSession::with_nonce_source(
            runtime
                .open_session(
                    AuthorId::new("author").unwrap(),
                    SessionId::new("reconnected").unwrap(),
                    None,
                )
                .await
                .unwrap(),
            keys.clone(),
            nonces.clone(),
        );
        assert_eq!(
            reconnected.submit(submission.clone()).await.unwrap(),
            position
        );
        assert_eq!(calls.load(Ordering::Relaxed), 1);
        let other = EncryptionSession::with_nonce_source(
            runtime
                .open_session(
                    AuthorId::new("other").unwrap(),
                    SessionId::new("other").unwrap(),
                    None,
                )
                .await
                .unwrap(),
            keys,
            nonces,
        );
        assert!(other.submit(submission.clone()).await.is_err());
        let mut conflicting = submission;
        conflicting.event.payload = Bytes::from_static(b"changed");
        assert_eq!(
            reconnected.submit(conflicting).await.unwrap_err().kind(),
            ErrorKind::Conflict
        );
        assert!(
            first
                .submit(EventSubmission {
                    operation_id: OperationId::new("closed").unwrap(),
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
}
