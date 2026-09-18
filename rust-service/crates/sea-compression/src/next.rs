//! Replacement facets preserve stored identities and capabilities while transforming payloads.

use crate::{CompressionError, CompressionSession, compress_payload, decompress_payload};
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

/// Decodes data while leaving the source's positions, progress, and error classification intact.
fn decode<Error: sea_core::ClassifiedError>(
    source: ArchiveStream<SessionCommittedEvent, EventPosition, Error>,
) -> ArchiveStream<SessionCommittedEvent, EventPosition, CompressionError<Error>> {
    map_monitored_stream(
        source,
        |mut event| {
            event.committed.event.payload = decompress_payload(&event.committed.event.payload)
                .map_err(CompressionError::Corrupt)?;
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
    async fn submit(&self, mut submission: EventSubmission) -> Result<EventPosition, Self::Error> {
        submission.event.payload =
            compress_payload(&submission.event.payload).map_err(CompressionError::Encode)?;
        self.inner
            .submit(submission)
            .await
            .map_err(CompressionError::Store)
    }
    async fn resolve_submission(
        &self,
        operation: &OperationId,
    ) -> Result<Option<EventPosition>, Self::Error> {
        self.inner
            .resolve_submission(operation)
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
        archive::{AuthorId, SessionId},
        next::SeaStorage,
    };
    use sea_memory::MemoryStorage;
    use sea_sequencer::next::LocalSequencer;

    #[tokio::test]
    async fn replacement_session_conformance() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = CompressionSession::new(
            runtime
                .open_session(
                    AuthorId::new("first").unwrap(),
                    SessionId::new("first").unwrap(),
                    None,
                )
                .await
                .unwrap(),
        );
        let second = CompressionSession::new(
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
    }
}
