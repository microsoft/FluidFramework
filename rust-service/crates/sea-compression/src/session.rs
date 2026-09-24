//! Stateless compression adapters for session facets.
//!
//! Application-event payloads and blob leaves use independent deterministic zlib frames.
//! Membership metadata passes through unchanged.
//! Equal submissions remain distinct events; each read item decodes without replay-global state.
//! Directories, snapshots, positions, and availability
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
    use sea_core::{ClassifiedError, ErrorKind, Event, MonitoredStreamItem, storage::SeaStorage};
    use sea_core::{archive::SessionEventKind, storage::StorageHandle};
    use sea_memory::MemoryStorage;
    use sea_sequencer::session::LocalSequencer;

    /// Returns the next event without treating source progress as data.
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

    #[tokio::test]
    async fn payload_transforms_preserve_control_metadata_and_stored_tree_identities() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let raw = runtime.open_session(None).await.unwrap();
        let wrapped = CompressionSession::new(raw.clone());
        let payload = Bytes::from_static(b"application payload");
        let blob = wrapped.put_blob(payload.clone()).await.unwrap();
        let BlobTreeId::Blob(id) = blob.id() else {
            panic!("expected blob")
        };
        let stored = raw.get_blob(id).await.unwrap();
        assert_ne!(stored, payload);
        assert_eq!(decompress_payload(&stored).unwrap(), payload);
        assert_eq!(BlobId::for_bytes(&stored), id);
        assert_eq!(wrapped.get_blob(id).await.unwrap(), payload);
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
        assert_ne!(application.committed.event.payload, payload);
        assert_eq!(
            decompress_payload(&application.committed.event.payload).unwrap(),
            payload
        );
        application.committed.event.payload = payload;
        assert_eq!(next_event(&mut decoded).await, application);
        assert_eq!(decoded.progress().previous, Some(position));
    }

    #[tokio::test]
    async fn load_and_coordination_forward_handles_fences_and_registration_lifetime() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let raw = runtime.open_session(None).await.unwrap();
        let wrapped = CompressionSession::new(raw.clone());
        let root = wrapped
            .put_blob(Bytes::from_static(b"snapshot"))
            .await
            .unwrap();
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
            Err(CompressionError::Store(_))
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

    #[tokio::test]
    async fn session_conformance() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = CompressionSession::new(runtime.open_session(None).await.unwrap());
        let second = CompressionSession::new(runtime.open_session(None).await.unwrap());
        sea_conformance::run_session_conformance(&first, &second).await;
    }

    #[tokio::test]
    async fn malformed_stored_frames_are_corrupt_and_advance_delivery_progress() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let raw = runtime.open_session(None).await.unwrap();
        let malformed_blob = raw
            .put_blob(Bytes::from_static(b"not a zlib frame"))
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
        let BlobTreeId::Blob(id) = malformed_blob.id() else {
            panic!("expected blob")
        };
        assert_eq!(
            wrapped.get_blob(id).await.unwrap_err().kind(),
            ErrorKind::Corrupt
        );
        let mut invalid = wrapped.read(None, Some(EventPosition::new(u64::MAX)));
        assert_eq!(
            invalid.next().await.unwrap().unwrap_err().kind(),
            ErrorKind::InvalidPosition
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
        assert!(matches!(
            events.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        assert!(events.next().await.is_none());
    }
}
