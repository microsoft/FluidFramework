//! Replacement facets use independent bounded dictionary frames, never replay-global decoder state.

use crate::{StatefulCompressionError, StatefulCompressionSession, decompress_frame};
use async_trait::async_trait;
use bytes::Bytes;
use futures_util::StreamExt;
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, EventPosition,
    archive::{
        EventSubmission, OperationId, SessionCommittedEvent, SessionStream, SnapshotParticipation,
    },
    map_monitored_stream,
    next::{
        ArchiveStream, LoadStart, Snapshot,
        session::{
            SeaArchive, SeaAuthorSession, SeaSnapshotCoordinator, SessionLoad, SnapshotCoordination,
        },
    },
};

impl<Session: SeaArchive> StatefulCompressionSession<Session> {
    /// Captures immutable configuration so each stream owns independent decoding state.
    fn decode_next(
        &self,
        source: ArchiveStream<SessionCommittedEvent, EventPosition, Session::Error>,
    ) -> ArchiveStream<SessionCommittedEvent, EventPosition, StatefulCompressionError<Session::Error>>
    {
        let dictionary = self.dictionary.clone();
        let fingerprint = self.dictionary_fingerprint;
        let maximum = self.max_decoded_bytes;
        map_monitored_stream(
            source,
            move |mut event| {
                event.committed.event.payload = decompress_frame(
                    &event.committed.event.payload,
                    &dictionary,
                    fingerprint,
                    maximum,
                )
                .map_err(StatefulCompressionError::Corrupt)?;
                Ok(event)
            },
            StatefulCompressionError::Store,
        )
    }

    /// Rejects oversize plaintext before performing compression or calling the inner session.
    fn encode_next(
        &self,
        payload: &Bytes,
    ) -> Result<Bytes, StatefulCompressionError<Session::Error>> {
        if payload.len() > self.max_decoded_bytes {
            return Err(StatefulCompressionError::PayloadTooLarge {
                actual: payload.len(),
                maximum: self.max_decoded_bytes,
            });
        }
        self.compress(payload)
            .map_err(StatefulCompressionError::Encode)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Session: SeaArchive> SeaArchive for StatefulCompressionSession<Session> {
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
            .map_err(StatefulCompressionError::Store)?;
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
            .map_err(StatefulCompressionError::Store)
    }
    async fn put_blob(&self, payload: Bytes) -> Result<Self::BlobHandle, Self::Error> {
        self.inner
            .put_blob(self.encode_next(&payload)?)
            .await
            .map_err(StatefulCompressionError::Store)
    }
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        self.decompress(
            &self
                .inner
                .get_blob(id)
                .await
                .map_err(StatefulCompressionError::Store)?,
        )
        .map_err(StatefulCompressionError::Corrupt)
    }
    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<Self::BlobHandle, Self::Error> {
        self.inner
            .put_directory(directory)
            .await
            .map_err(StatefulCompressionError::Store)
    }
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.inner
            .get_directory(id)
            .await
            .map_err(StatefulCompressionError::Store)
    }
    async fn resolve_tree(&self, id: BlobTreeId) -> Result<Option<Self::BlobHandle>, Self::Error> {
        self.inner
            .resolve_tree(id)
            .await
            .map_err(StatefulCompressionError::Store)
    }
    async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::EventHandle>, Self::Error> {
        self.inner
            .resolve_position(position)
            .await
            .map_err(StatefulCompressionError::Store)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Session: SeaAuthorSession> SeaAuthorSession for StatefulCompressionSession<Session> {
    async fn submit(&self, mut submission: EventSubmission) -> Result<EventPosition, Self::Error> {
        submission.event.payload = self.encode_next(&submission.event.payload)?;
        self.inner
            .submit(submission)
            .await
            .map_err(StatefulCompressionError::Store)
    }
    async fn resolve_submission(
        &self,
        operation: &OperationId,
    ) -> Result<Option<EventPosition>, Self::Error> {
        self.inner
            .resolve_submission(operation)
            .await
            .map_err(StatefulCompressionError::Store)
    }
    async fn close(&self) -> Result<(), Self::Error> {
        self.inner
            .close()
            .await
            .map_err(StatefulCompressionError::Store)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Session: SeaSnapshotCoordinator> SeaSnapshotCoordinator
    for StatefulCompressionSession<Session>
{
    async fn coordinate_snapshots(
        &self,
        participation: SnapshotParticipation,
    ) -> Result<SessionStream<SnapshotCoordination, Self::Error>, Self::Error> {
        let source = self
            .inner
            .coordinate_snapshots(participation)
            .await
            .map_err(StatefulCompressionError::Store)?;
        Ok(Box::pin(
            source.map(|item| item.map_err(StatefulCompressionError::Store)),
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
            .map_err(StatefulCompressionError::Store)
    }
    async fn revoke_snapshot_publisher(&self) -> Result<(), Self::Error> {
        self.inner
            .revoke_snapshot_publisher()
            .await
            .map_err(StatefulCompressionError::Store)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_core::{
        ClassifiedError, ErrorKind, Event, MonitoredStreamItem,
        archive::{AuthorId, SessionId},
        next::SeaStorage,
    };
    use sea_memory::MemoryStorage;
    use sea_sequencer::next::LocalSequencer;

    /// Fixed test-only key provider for persisted wrapper-composition evidence.
    #[derive(Clone)]
    struct Keys;
    impl sea_encryption::KeyProvider for Keys {
        fn active_key(&self) -> Option<sea_encryption::ActiveKey> {
            Some(sea_encryption::ActiveKey {
                id: sea_encryption::KeyId::new([1; 16]),
                key: sea_encryption::EncryptionKey::new([7; 32]),
            })
        }
        fn key_for_id(&self, id: &sea_encryption::KeyId) -> Option<sea_encryption::EncryptionKey> {
            (*id == sea_encryption::KeyId::new([1; 16]))
                .then(|| sea_encryption::EncryptionKey::new([7; 32]))
        }
    }

    /// Constructs the documented dictionary-compression-over-encryption order.
    fn wrapped<Session>(
        session: Session,
    ) -> StatefulCompressionSession<sea_encryption::EncryptionSession<Session, Keys>> {
        StatefulCompressionSession::new(
            sea_encryption::EncryptionSession::new(session, Keys),
            Bytes::from_static(b"dictionary"),
            4096,
        )
        .unwrap()
    }

    #[tokio::test]
    async fn replacement_file_compositions_recover_snapshots_and_replay() {
        file_composition::<false>().await;
        file_composition::<true>().await;
    }

    /// Runs the same session workflow and post-shutdown recovery under each file durability policy.
    async fn file_composition<const DURABLE: bool>() {
        use sea_core::next::StorageHandle;
        let root = std::env::temp_dir().join(format!(
            "sea-next-composition-{}-{DURABLE}",
            std::process::id()
        ));
        let storage = sea_file::next::FileStorage::<DURABLE>::open(&root).unwrap();
        let (id, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<sea_file::next::FileStorage<DURABLE>>::recover(view)
            .await
            .unwrap();
        let first = wrapped(
            runtime
                .open_session(
                    AuthorId::new("first").unwrap(),
                    SessionId::new("first").unwrap(),
                    None,
                )
                .await
                .unwrap(),
        );
        let second = wrapped(
            runtime
                .open_session(
                    AuthorId::new("second").unwrap(),
                    SessionId::new("second").unwrap(),
                    None,
                )
                .await
                .unwrap(),
        );
        sea_conformance::next::run_session_conformance(&first, &second).await;
        let snapshot = second
            .get_snapshot(LoadStart::LatestSnapshot)
            .await
            .unwrap()
            .unwrap();
        runtime.shutdown().await.unwrap();
        let reopened = storage.open_view(&id).await.unwrap().unwrap();
        let recovered = LocalSequencer::<sea_file::next::FileStorage<DURABLE>>::recover(reopened)
            .await
            .unwrap();
        let session = wrapped(
            recovered
                .open_session(
                    AuthorId::new("recovered").unwrap(),
                    SessionId::new("recovered").unwrap(),
                    None,
                )
                .await
                .unwrap(),
        );
        let loaded = session.load(LoadStart::LatestSnapshot).await.unwrap();
        assert_eq!(loaded.snapshot.unwrap().root.id(), snapshot.root.id());
        let mut history = session.read(None, Some(snapshot.at_event.id()));
        let mut count = 0;
        while let Some(item) = history.next().await {
            if let MonitoredStreamItem::Item(event) = item.unwrap() {
                assert!(!event.committed.event.payload.is_empty());
                count += 1;
            }
        }
        assert!(count > 0);
        match snapshot.root.id() {
            BlobTreeId::Blob(id) => assert!(!session.get_blob(id).await.unwrap().is_empty()),
            BlobTreeId::Directory(id) => {
                session.get_directory(id).await.unwrap();
            }
        }
        drop((loaded.events, history));
        recovered.shutdown().await.unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn replacement_session_conformance() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = StatefulCompressionSession::new(
            runtime
                .open_session(
                    AuthorId::new("first").unwrap(),
                    SessionId::new("first").unwrap(),
                    None,
                )
                .await
                .unwrap(),
            Bytes::from_static(b"dictionary"),
            4096,
        )
        .unwrap();
        let second = StatefulCompressionSession::new(
            runtime
                .open_session(
                    AuthorId::new("second").unwrap(),
                    SessionId::new("second").unwrap(),
                    None,
                )
                .await
                .unwrap(),
            Bytes::from_static(b"dictionary"),
            4096,
        )
        .unwrap();
        sea_conformance::next::run_session_conformance(&first, &second).await;
    }

    #[tokio::test]
    async fn replacement_bounds_decode_errors_and_progress() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let raw = runtime
            .open_session(
                AuthorId::new("author").unwrap(),
                SessionId::new("session").unwrap(),
                None,
            )
            .await
            .unwrap();
        let wrapped = StatefulCompressionSession::new(raw.clone(), Bytes::new(), 8).unwrap();
        assert_eq!(
            wrapped
                .put_blob(Bytes::from_static(b"too large"))
                .await
                .unwrap_err()
                .kind(),
            ErrorKind::Rejected
        );
        let position = raw
            .submit(EventSubmission {
                operation_id: OperationId::new("raw").unwrap(),
                reference: None,
                event: Event {
                    payload: Bytes::from_static(b"not encoded"),
                    blob_tree: None,
                },
            })
            .await
            .unwrap();
        let mut loaded = wrapped.load(LoadStart::Beginning).await.unwrap();
        assert!(matches!(
            loaded.events.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        assert_eq!(
            loaded.events.next().await.unwrap().unwrap_err().kind(),
            ErrorKind::Corrupt
        );
        assert_eq!(loaded.events.progress().previous, Some(position));
        assert!(
            wrapped
                .read(None, Some(EventPosition::new(u64::MAX)))
                .next()
                .await
                .unwrap()
                .is_err()
        );
    }
}
