//! Type-erased session adapter preserving concrete availability capabilities.

use std::{any::Any, sync::Arc};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::StreamExt as _;
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, ErrorKind, EventPosition,
    SeaArchive, SeaAuthorSession, SeaService, SeaSession, SeaSnapshotCoordinator, SessionLoad,
    SnapshotCoordination,
    archive::{EventSubmission, SessionCommittedEvent, SessionStream, SnapshotParticipation},
    map_monitored_stream,
    storage::{ArchiveStream, LoadStart, Snapshot, StorageHandle},
};

/// Classified failure exposed independently of a stack's concrete Rust error type.
#[derive(Debug, thiserror::Error)]
#[error("{message}")]
pub struct BindingError {
    /// Original SEA failure classification.
    kind: ErrorKind,
    /// Human-readable diagnostic, without implementation-specific error ownership.
    message: String,
}

impl BindingError {
    /// Preserves the classification and diagnostic of a concrete stack failure.
    pub(crate) fn from_error(error: &impl ClassifiedError) -> Self {
        Self {
            kind: error.kind(),
            message: error.to_string(),
        }
    }

    /// Rejects a capability whose concrete implementation does not match this stack.
    fn incompatible_handle() -> Self {
        Self {
            kind: ErrorKind::Rejected,
            message: "snapshot handle belongs to an incompatible session implementation".to_owned(),
        }
    }
}

impl ClassifiedError for BindingError {
    fn kind(&self) -> ErrorKind {
        self.kind
    }
}

/// Concrete availability evidence retained without exposing its implementation type.
#[derive(Clone)]
pub struct BindingHandle<Identity: Copy + Send + Sync + 'static> {
    /// Serializable identity, which alone does not establish availability.
    id: Identity,
    /// Original handle retained for publication through its owning implementation.
    evidence: Arc<dyn Any + Send + Sync>,
}

impl<Identity: Copy + Send + Sync + 'static> BindingHandle<Identity> {
    /// Retains the concrete capability instead of manufacturing evidence from an identity.
    fn new<Handle: StorageHandle<Id = Identity>>(handle: Handle) -> Self {
        Self {
            id: handle.id(),
            evidence: Arc::new(handle),
        }
    }

    /// Restores the original capability for the matching session implementation.
    fn recover<Handle: StorageHandle<Id = Identity>>(&self) -> Result<Handle, BindingError> {
        self.evidence
            .downcast_ref::<Handle>()
            .cloned()
            .ok_or_else(BindingError::incompatible_handle)
    }
}

impl<Identity: Copy + Send + Sync + 'static> StorageHandle for BindingHandle<Identity> {
    type Id = Identity;
    fn id(&self) -> Identity {
        self.id
    }
}

/// Object-safe session surface shared by all generated stack configurations.
pub type BindingSession = dyn SeaSession<
        BlobHandle = BindingHandle<BlobTreeId>,
        EventHandle = BindingHandle<EventPosition>,
        Error = BindingError,
    >;

/// Adapts any existing session stack without duplicating its operations in WASM exports.
pub struct SessionAdapter<Session> {
    /// Concrete storage, transport, or decorator composition.
    inner: Session,
}

impl<Session: SeaSession> SessionAdapter<Session> {
    /// Wraps a concrete stack with the shared binding representation.
    pub const fn new(inner: Session) -> Self {
        Self { inner }
    }
}

impl<Session: SeaSession> SeaService for SessionAdapter<Session> {
    type Error = BindingError;
}

/// Retains both availability capabilities in a selected or published snapshot.
fn erase_snapshot<
    BlobHandle: StorageHandle<Id = BlobTreeId>,
    EventHandle: StorageHandle<Id = EventPosition>,
>(
    snapshot: Snapshot<BlobHandle, EventHandle>,
) -> Snapshot<BindingHandle<BlobTreeId>, BindingHandle<EventPosition>> {
    Snapshot {
        root: BindingHandle::new(snapshot.root),
        at_event: BindingHandle::new(snapshot.at_event),
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Session: SeaSession> SeaArchive for SessionAdapter<Session> {
    type BlobHandle = BindingHandle<BlobTreeId>;
    type EventHandle = BindingHandle<EventPosition>;

    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<SessionCommittedEvent, EventPosition, Self::Error> {
        map_monitored_stream(self.inner.read(after, stop_after), Ok, |error| {
            BindingError::from_error(&error)
        })
    }

    async fn load(
        &self,
        start: LoadStart,
    ) -> Result<SessionLoad<Self::BlobHandle, Self::EventHandle, Self::Error>, Self::Error> {
        let loaded = self
            .inner
            .load(start)
            .await
            .map_err(|error| BindingError::from_error(&error))?;
        Ok(SessionLoad {
            snapshot: loaded.snapshot.map(erase_snapshot),
            events: map_monitored_stream(loaded.events, Ok, |error| {
                BindingError::from_error(&error)
            }),
        })
    }

    async fn get_snapshot(
        &self,
        start: LoadStart,
    ) -> Result<Option<Snapshot<Self::BlobHandle, Self::EventHandle>>, Self::Error> {
        self.inner
            .get_snapshot(start)
            .await
            .map(|snapshot| snapshot.map(erase_snapshot))
            .map_err(|error| BindingError::from_error(&error))
    }

    async fn put_blob(&self, payload: Bytes) -> Result<Self::BlobHandle, Self::Error> {
        self.inner
            .put_blob(payload)
            .await
            .map(BindingHandle::new)
            .map_err(|error| BindingError::from_error(&error))
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        self.inner
            .get_blob(id)
            .await
            .map_err(|error| BindingError::from_error(&error))
    }

    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<Self::BlobHandle, Self::Error> {
        self.inner
            .put_directory(directory)
            .await
            .map(BindingHandle::new)
            .map_err(|error| BindingError::from_error(&error))
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.inner
            .get_directory(id)
            .await
            .map_err(|error| BindingError::from_error(&error))
    }

    async fn resolve_tree(&self, id: BlobTreeId) -> Result<Option<Self::BlobHandle>, Self::Error> {
        self.inner
            .resolve_tree(id)
            .await
            .map(|handle| handle.map(BindingHandle::new))
            .map_err(|error| BindingError::from_error(&error))
    }

    async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::EventHandle>, Self::Error> {
        self.inner
            .resolve_position(position)
            .await
            .map(|handle| handle.map(BindingHandle::new))
            .map_err(|error| BindingError::from_error(&error))
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Session: SeaSession> SeaAuthorSession for SessionAdapter<Session> {
    async fn announce_membership(&self, metadata: Bytes) -> Result<EventPosition, Self::Error> {
        self.inner
            .announce_membership(metadata)
            .await
            .map_err(|error| BindingError::from_error(&error))
    }
    async fn submit(&self, submission: EventSubmission) -> Result<EventPosition, Self::Error> {
        self.inner
            .submit(submission)
            .await
            .map_err(|error| BindingError::from_error(&error))
    }

    async fn close(&self) -> Result<(), Self::Error> {
        self.inner
            .close()
            .await
            .map_err(|error| BindingError::from_error(&error))
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Session: SeaSession> SeaSnapshotCoordinator for SessionAdapter<Session> {
    async fn coordinate_snapshots(
        &self,
        participation: SnapshotParticipation,
    ) -> Result<SessionStream<SnapshotCoordination, Self::Error>, Self::Error> {
        let stream = self
            .inner
            .coordinate_snapshots(participation)
            .await
            .map_err(|error| BindingError::from_error(&error))?;
        Ok(Box::pin(stream.map(|result| {
            result.map_err(|error| BindingError::from_error(&error))
        })))
    }

    async fn publish_snapshot(
        &self,
        expected_parent: Option<EventPosition>,
        fence: Option<u64>,
        snapshot: Snapshot<Self::BlobHandle, Self::EventHandle>,
    ) -> Result<Snapshot<Self::BlobHandle, Self::EventHandle>, Self::Error> {
        let snapshot = Snapshot {
            root: snapshot.root.recover()?,
            at_event: snapshot.at_event.recover()?,
        };
        self.inner
            .publish_snapshot(expected_parent, fence, snapshot)
            .await
            .map(erase_snapshot)
            .map_err(|error| BindingError::from_error(&error))
    }

    async fn revoke_snapshot_publisher(&self) -> Result<(), Self::Error> {
        self.inner
            .revoke_snapshot_publisher()
            .await
            .map_err(|error| BindingError::from_error(&error))
    }
}

#[cfg(all(test, feature = "memory", feature = "compression"))]
mod tests {
    use super::*;
    use sea_core::{AuthorId, Event, SessionId, storage::SeaStorage};
    use sea_memory::MemoryStorage;
    use sea_sequencer::session::{LocalSequencer, LocalSession};

    /// Opens a fresh independently owned local session for each test stack.
    async fn local_session() -> LocalSession<MemoryStorage> {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let sequencer = LocalSequencer::recover(view).await.unwrap();
        sequencer
            .open_session(
                AuthorId::new(Bytes::from_static(b"author")).unwrap(),
                SessionId::new(Bytes::from_static(b"session")).unwrap(),
                None,
            )
            .await
            .unwrap()
    }

    /// Exercises one object-safe session contract across concrete configurations.
    async fn round_trip(session: &BindingSession) {
        let payload = Bytes::from_static(b"shared binding payload");
        let blob = session.put_blob(payload.clone()).await.unwrap();
        let BlobTreeId::Blob(blob_id) = blob.id() else {
            panic!("expected blob")
        };
        assert_eq!(session.get_blob(blob_id).await.unwrap(), payload);
        let submission = EventSubmission {
            reference: None,
            event: Event {
                payload: payload.clone(),
                blob_tree: Some(blob.id()),
            },
        };
        let position = session.submit(submission.clone()).await.unwrap();
        let second = session.submit(submission).await.unwrap();
        assert!(second > position);
        let mut events = session.read(None, Some(second));
        let mut observed = Vec::new();
        while let Some(item) = events.next().await {
            if let sea_core::MonitoredStreamItem::Item(event) = item.unwrap() {
                assert_eq!(event.committed.event.payload, payload);
                observed.push(event.committed.position);
            }
        }
        assert_eq!(observed, vec![position, second]);
        let mut coordination = session
            .coordinate_snapshots(SnapshotParticipation::ClientSelected)
            .await
            .unwrap();
        coordination.next().await.unwrap().unwrap();
        let event = session.resolve_position(position).await.unwrap().unwrap();
        let published = session
            .publish_snapshot(
                None,
                None,
                Snapshot {
                    root: blob,
                    at_event: event,
                },
            )
            .await
            .unwrap();
        assert_eq!(published.at_event.id(), position);
        let loaded = session.load(LoadStart::LatestSnapshot).await.unwrap();
        assert_eq!(loaded.snapshot.unwrap().root.id(), published.root.id());
        session.close().await.unwrap();
    }

    #[tokio::test]
    async fn shared_adapter_supports_memory_and_compression() {
        round_trip(&SessionAdapter::new(local_session().await)).await;
        round_trip(&SessionAdapter::new(
            sea_compression::CompressionSession::new(local_session().await),
        ))
        .await;
    }

    #[tokio::test]
    async fn shared_adapter_preserves_error_classification() {
        let session = SessionAdapter::new(local_session().await);
        session.close().await.unwrap();
        assert_eq!(
            session
                .put_blob(Bytes::new())
                .await
                .err()
                .expect("closed session must reject writes")
                .kind(),
            ErrorKind::Rejected
        );
    }
}
