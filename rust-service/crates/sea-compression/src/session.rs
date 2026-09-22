//! Stateless compression adapters for session facets.
//!
//! Event payloads and blob leaves are encoded as independent deterministic zlib frames. This keeps
//! exact submission retries stable without a wrapper-owned identity registry and allows each read
//! item to decode without replay-global state. Directories, snapshots, positions, and availability
//! handles pass through in the encoded store's identity space.
//!
//! Reads and loads decode only when an item is polled, preserve monitored progress, and add no
//! background task or buffering layer. Malformed frames are classified as corrupt; underlying
//! session errors retain their classification. This adapter imposes no decoded-size bound.

use crate::{CompressionError, CompressionSession, compress_payload, decompress_payload};
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

/// Decodes data while leaving the source's positions, progress, and error classification intact.
fn decode<Error: sea_core::ClassifiedError>(
    source: ArchiveStream<SessionCommittedEvent, EventPosition, Error>,
) -> ArchiveStream<SessionCommittedEvent, EventPosition, CompressionError<Error>> {
    map_monitored_stream(
        source,
        |mut event| {
            if event.kind == sea_core::archive::SessionEventKind::Application {
                event.committed.event.payload = decompress_payload(&event.committed.event.payload)
                    .map_err(CompressionError::Corrupt)?;
            }
            Ok(event)
        },
        CompressionError::Store,
    )
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Session: SeaArchive> SeaArchive for CompressionSession<Session> {
    type BlobHandle = Session::BlobHandle;
    type EventHandle = Session::EventHandle;
    fn read(
        &self,
        after: Option<EventPosition>,
        stop: Option<EventPosition>,
    ) -> ArchiveStream<SessionCommittedEvent, EventPosition, Self::Error> {
        decode(self.inner.read(after, stop))
    }
    async fn load(
        &self,
        start: LoadStart,
    ) -> Result<SessionLoad<Self::BlobHandle, Self::EventHandle, Self::Error>, Self::Error> {
        let loaded = self
            .inner
            .load(start)
            .await
            .map_err(CompressionError::Store)?;
        Ok(SessionLoad {
            snapshot: loaded.snapshot,
            events: decode(loaded.events),
        })
    }
    async fn get_snapshot(
        &self,
        start: LoadStart,
    ) -> Result<Option<Snapshot<Self::BlobHandle, Self::EventHandle>>, Self::Error> {
        self.inner
            .get_snapshot(start)
            .await
            .map_err(CompressionError::Store)
    }
    async fn put_blob(&self, payload: Bytes) -> Result<Self::BlobHandle, Self::Error> {
        self.inner
            .put_blob(compress_payload(&payload).map_err(CompressionError::Encode)?)
            .await
            .map_err(CompressionError::Store)
    }
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        decompress_payload(
            &self
                .inner
                .get_blob(id)
                .await
                .map_err(CompressionError::Store)?,
        )
        .map_err(CompressionError::Corrupt)
    }
    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<Self::BlobHandle, Self::Error> {
        self.inner
            .put_directory(directory)
            .await
            .map_err(CompressionError::Store)
    }
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.inner
            .get_directory(id)
            .await
            .map_err(CompressionError::Store)
    }
    async fn resolve_tree(&self, id: BlobTreeId) -> Result<Option<Self::BlobHandle>, Self::Error> {
        self.inner
            .resolve_tree(id)
            .await
            .map_err(CompressionError::Store)
    }
    async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::EventHandle>, Self::Error> {
        self.inner
            .resolve_position(position)
            .await
            .map_err(CompressionError::Store)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Session: SeaAuthorSession> SeaAuthorSession for CompressionSession<Session> {
    async fn announce_membership(&self, metadata: Bytes) -> Result<EventPosition, Self::Error> {
        self.inner
            .announce_membership(metadata)
            .await
            .map_err(CompressionError::Store)
    }
    async fn submit(&self, mut submission: EventSubmission) -> Result<EventPosition, Self::Error> {
        submission.event.payload = match compress_payload(&submission.event.payload) {
            Ok(payload) => payload,
            Err(error) => {
                let _ = self.inner.close().await;
                return Err(CompressionError::Encode(error));
            }
        };
        self.inner
            .submit(submission)
            .await
            .map_err(CompressionError::Store)
    }
    async fn close(&self) -> Result<(), Self::Error> {
        self.inner.close().await.map_err(CompressionError::Store)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Session: SeaSnapshotCoordinator> SeaSnapshotCoordinator for CompressionSession<Session> {
    async fn coordinate_snapshots(
        &self,
        participation: SnapshotParticipation,
    ) -> Result<SessionStream<SnapshotCoordination, Self::Error>, Self::Error> {
        let source = self
            .inner
            .coordinate_snapshots(participation)
            .await
            .map_err(CompressionError::Store)?;
        Ok(Box::pin(
            source.map(|item| item.map_err(CompressionError::Store)),
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
            .map_err(CompressionError::Store)
    }
    async fn revoke_snapshot_publisher(&self) -> Result<(), Self::Error> {
        self.inner
            .revoke_snapshot_publisher()
            .await
            .map_err(CompressionError::Store)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_core::{
        ClassifiedError, ErrorKind, Event, MonitoredStreamItem, archive::SessionId,
        storage::SeaStorage,
    };
    use sea_memory::MemoryStorage;
    use sea_sequencer::session::LocalSequencer;

    #[tokio::test]
    async fn session_conformance() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = CompressionSession::new(
            runtime
                .open_session(SessionId::new("first").unwrap(), None)
                .await
                .unwrap(),
        );
        let second = CompressionSession::new(
            runtime
                .open_session(SessionId::new("second").unwrap(), None)
                .await
                .unwrap(),
        );
        sea_conformance::run_session_conformance(&first, &second).await;
    }

    #[tokio::test]
    async fn malformed_stored_frames_are_corrupt_and_advance_delivery_progress() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let raw = runtime
            .open_session(SessionId::new("session").unwrap(), None)
            .await
            .unwrap();
        let position = raw
            .submit(EventSubmission {
                reference: None,
                event: Event {
                    payload: Bytes::from_static(b"not a zlib frame"),
                    blob_tree: None,
                },
            })
            .await
            .unwrap();
        let wrapped = CompressionSession::new(raw);
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
        assert!(matches!(
            events.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        assert!(events.next().await.is_none());
    }
}
