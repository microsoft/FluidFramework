//! Document factory adapter for an existing local sequencer.
//!
//! Factory construction and cloning retain the document without allocating a membership.
//! Opening delegates identity allocation and cancellation behavior to the sequencer.

use std::sync::Arc;

use async_trait::async_trait;
use sea_core::{
    EventPosition, SeaService,
    factory::{OpenedSession, SessionFactory},
    storage::SeaStorage,
};

use crate::session::{LocalSequencer, LocalSession, SessionError};

/// Retains one document runtime as a session-opening source.
pub struct LocalSessionFactory<Storage: SeaStorage> {
    /// Shared runtime remains the sole allocator of document-scoped memberships.
    sequencer: Arc<LocalSequencer<Storage>>,
}

impl<Storage: SeaStorage> LocalSessionFactory<Storage> {
    /// Retains the existing runtime without opening a membership.
    #[must_use]
    pub const fn new(sequencer: Arc<LocalSequencer<Storage>>) -> Self {
        Self { sequencer }
    }
}

impl<Storage: SeaStorage> Clone for LocalSessionFactory<Storage> {
    fn clone(&self) -> Self {
        Self {
            sequencer: self.sequencer.clone(),
        }
    }
}

impl<Storage: SeaStorage + 'static> SeaService for LocalSessionFactory<Storage> {
    type Error = SessionError<Storage::Error>;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Storage: SeaStorage + 'static> SessionFactory for LocalSessionFactory<Storage> {
    type Session = LocalSession<Storage>;

    async fn open_session(
        &self,
        reference: Option<EventPosition>,
    ) -> Result<OpenedSession<Self::Session>, Self::Error> {
        let session = self.sequencer.open_session(reference).await?;
        Ok(OpenedSession {
            id: session.session_id().clone(),
            session,
        })
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use bytes::Bytes;
    use futures_util::StreamExt;
    use sea_core::{
        BlobDirectory, BlobTreeId, Event, EventSubmission, MonitoredStreamItem, SeaArchive,
        SeaAuthorSession, SeaSession, SeaSnapshotCoordinator, SnapshotParticipation,
        factory::{PassThroughFactory, PassThroughSession},
        storage::{LoadStart, Snapshot, StorageHandle},
    };
    use sea_memory::MemoryStorage;

    use super::*;

    /// Creates one exclusively opened document for adapter tests.
    async fn sequencer() -> Arc<LocalSequencer<MemoryStorage>> {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap()
    }

    /// Compiles without requiring the storage implementation to implement `Clone`.
    fn clone_factory<Storage: SeaStorage>(
        factory: &LocalSessionFactory<Storage>,
    ) -> LocalSessionFactory<Storage> {
        factory.clone()
    }

    /// Compiles clone ownership and all dynamic facets with concrete backend handles.
    fn clone_session<Storage: SeaStorage + 'static>(
        session: &PassThroughSession<LocalSession<Storage>>,
    ) -> PassThroughSession<LocalSession<Storage>> {
        let _: &dyn SeaSession<
            Error = SessionError<Storage::Error>,
            BlobHandle = <LocalSession<Storage> as SeaArchive>::BlobHandle,
            EventHandle = <LocalSession<Storage> as SeaArchive>::EventHandle,
        > = session;
        session.clone()
    }

    /// Supplies a small application event with explicit reference state.
    fn submission(reference: Option<EventPosition>) -> EventSubmission {
        EventSubmission {
            reference,
            event: Event {
                payload: Bytes::from_static(b"application"),
                blob_tree: None,
            },
        }
    }

    #[tokio::test]
    async fn factory_construction_and_cloning_do_not_open_memberships() {
        let sequencer = sequencer().await;
        let first = sequencer.open_session(None).await.unwrap();
        let factory = LocalSessionFactory::new(sequencer.clone());
        let cloned = clone_factory(&factory);
        let object: &dyn SessionFactory<
            Error = SessionError<<MemoryStorage as SeaStorage>::Error>,
            Session = LocalSession<MemoryStorage>,
        > = &cloned;
        let failed = object
            .open_session(Some(EventPosition::new(u64::MAX)))
            .await;
        assert!(matches!(
            failed,
            Err(SessionError::Rejected("invalid session reference"))
        ));
        let second = object.open_session(None).await.unwrap();
        assert_eq!(second.id, *second.session.session_id());
        assert_eq!(second.id.get(), first.session_id().get() + 1);
        drop((factory, cloned));
        second.session.submit(submission(None)).await.unwrap();
        second.session.close().await.unwrap();
        first.close().await.unwrap();
    }

    #[tokio::test]
    async fn pass_through_forwards_all_facets_with_local_capabilities_and_shared_close() {
        let sequencer = sequencer().await;
        let factory = PassThroughFactory::new(LocalSessionFactory::new(sequencer.clone()));
        let opened = factory.open_session(None).await.unwrap();
        let author_id = opened.id;
        let author = opened.session;
        let clone = clone_session(&author);
        let observer = sequencer.open_session(None).await.unwrap();
        let joined = author
            .announce_membership(Bytes::from_static(b"member"))
            .await
            .unwrap();
        let position = author.submit(submission(Some(joined))).await.unwrap();
        let sibling = factory.open_session(Some(position)).await.unwrap().session;

        let payload = Bytes::from_static(b"snapshot state");
        let root = author.put_blob(payload.clone()).await.unwrap();
        let BlobTreeId::Blob(blob_id) = root.id() else {
            panic!("blob publication returned a directory");
        };
        assert_eq!(author.get_blob(blob_id).await.unwrap(), payload);
        assert_eq!(
            author.resolve_tree(root.id()).await.unwrap().unwrap().id(),
            root.id()
        );
        let directory =
            BlobDirectory::new([(String::from("child"), root.id())].into_iter().collect()).unwrap();
        let directory_handle = author.put_directory(directory.clone()).await.unwrap();
        let BlobTreeId::Directory(directory_id) = directory_handle.id() else {
            panic!("directory publication returned a blob");
        };
        assert_eq!(author.get_directory(directory_id).await.unwrap(), directory);
        let at_event = author.resolve_position(position).await.unwrap().unwrap();
        let mut coordination = author
            .coordinate_snapshots(SnapshotParticipation::SeaSelected)
            .await
            .unwrap();
        let initial = coordination.next().await.unwrap().unwrap();
        assert_eq!(initial.latest, None);
        assert!(initial.fence.is_some());
        let publication = author
            .publish_snapshot(None, initial.fence, Snapshot { root, at_event })
            .await
            .unwrap();
        assert_eq!(publication.at_event.id(), position);
        let selected = author
            .get_snapshot(LoadStart::LatestSnapshot)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(selected.root.id(), publication.root.id());
        assert_eq!(selected.at_event.id(), position);

        let mut loaded = author.load(LoadStart::LatestSnapshot).await.unwrap();
        assert_eq!(loaded.snapshot.as_ref().unwrap().at_event.id(), position);
        let next = author.submit(submission(Some(position))).await.unwrap();
        loop {
            if let MonitoredStreamItem::Item(event) = loaded.events.next().await.unwrap().unwrap() {
                assert_eq!(event.committed.position, next);
                assert_eq!(event.session_id, author_id);
                break;
            }
        }
        let mut bounded = author.read(Some(joined), Some(position));
        let mut delivered = Vec::new();
        while let Some(item) = bounded.next().await {
            if let MonitoredStreamItem::Item(event) = item.unwrap() {
                delivered.push(event.committed.position);
            }
        }
        assert_eq!(delivered, vec![position]);
        author.revoke_snapshot_publisher().await.unwrap();
        drop((loaded, bounded, coordination, author, factory));

        // Dropping the other owner does not close the shared membership.
        clone.submit(submission(Some(next))).await.unwrap();
        clone.close().await.unwrap();
        clone.close().await.unwrap();
        assert!(matches!(
            clone.submit(submission(Some(next))).await,
            Err(SessionError::Closed),
        ));
        // Closing this membership does not remove a separately opened membership.
        sibling.submit(submission(Some(next))).await.unwrap();
        sibling.close().await.unwrap();
        observer.close().await.unwrap();
    }
}
