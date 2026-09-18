//! Document-scoped implementations of the replacement storage contracts.

use std::{
    collections::{BTreeMap, HashMap},
    sync::{
        Arc, Mutex, Weak,
        atomic::{AtomicU64, Ordering},
    },
};

use async_trait::async_trait;
use bytes::Bytes;
use sea_core::next::{
    Archive, ArchiveStream, BlobStore, CreatedDocument, DocumentId, ReferenceableStore, SeaStorage,
    Snapshot, SnapshotArchive, StorageComponents, StorageHandle, StorageSurface,
};
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, CommittedEvent,
    Durability, ErrorKind, Event, EventPosition, map_monitored_stream,
};
use thiserror::Error;

use crate::memory_archive::{self, ArchiveData};

/// Process-wide allocation prevents accidental cross-factory document identity collisions.
static NEXT_DOCUMENT_ID: AtomicU64 = AtomicU64::new(1);

/// Failures from the replacement memory document store.
#[derive(Debug, Error)]
pub enum MemoryStorageError {
    /// A capability belongs to another document.
    #[error("availability handle belongs to another document")]
    ForeignHandle,
    /// A referenced content tree is not present.
    #[error("referenced content is unavailable")]
    MissingContent,
    /// Another component or stream still owns the document's writer opening.
    #[error("document is already open")]
    AlreadyOpen,
    /// A read bound is beyond the archive's initialization head.
    #[error("read bound is beyond the committed head")]
    InvalidPosition,
    /// A snapshot does not advance its archive's head.
    #[error("snapshot position must increase strictly")]
    SnapshotOrder,
    /// An identity counter cannot advance.
    #[error("numeric identity space is exhausted")]
    IdentityExhausted,
    /// Stored history has inconsistent positions or unavailable dependencies.
    #[error("document history has inconsistent positions or unavailable dependencies")]
    InconsistentHistory,
}

impl ClassifiedError for MemoryStorageError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::AlreadyOpen | Self::SnapshotOrder => ErrorKind::Conflict,
            Self::InvalidPosition => ErrorKind::InvalidPosition,
            Self::InconsistentHistory => ErrorKind::Corrupt,
            Self::ForeignHandle | Self::MissingContent | Self::IdentityExhausted => {
                ErrorKind::Rejected
            }
        }
    }
}

/// A leaf whose content identity is computed before acquiring the shared blob-data lock.
struct PrehashedBlob {
    /// Content identity of `payload`.
    id: BlobId,
    /// Immutable bytes associated with `id`.
    payload: Bytes,
}

impl PrehashedBlob {
    /// Hashes the immutable bytes without accessing shared storage.
    fn new(payload: Bytes) -> Self {
        Self {
            id: BlobId::for_bytes(&payload),
            payload,
        }
    }
}

/// Immutable blobs and directories retained for the lifetime of their document.
/// Event payloads are stored separately in the event archive.
///
/// Every tree reachable from a stored directory is also stored in these maps.
/// Publication preserves this invariant by requiring every direct child to be present before
/// inserting a directory; existing directories already guarantee their own descendants.
/// Entries are never removed or modified, so membership proves transitive availability.
#[derive(Debug, Default)]
struct BlobStorageData {
    /// Published leaf values keyed by their content hashes.
    blobs: BTreeMap<BlobId, Bytes>,
    /// Published directories whose direct and transitive children are present in these maps.
    directories: BTreeMap<BlobDirectoryId, BlobDirectory>,
}

impl BlobStorageData {
    /// Tests membership; the closure invariant makes a directory lookup sufficient for its whole tree.
    fn contains_tree(&self, id: BlobTreeId) -> bool {
        match id {
            BlobTreeId::Blob(id) => self.blobs.contains_key(&id),
            BlobTreeId::Directory(id) => self.directories.contains_key(&id),
        }
    }

    /// Publishes or deduplicates a prehashed leaf without hashing under the shared lock.
    fn put_blob(&mut self, blob: PrehashedBlob) -> BlobId {
        let PrehashedBlob { id, payload } = blob;
        self.blobs.entry(id).or_insert(payload);
        id
    }

    /// Publishes a directory only after all direct children exist, preserving transitive closure.
    /// Failure leaves both maps unchanged.
    fn put_directory(
        &mut self,
        directory: BlobDirectory,
    ) -> Result<BlobDirectoryId, MemoryStorageError> {
        if !directory
            .entries()
            .values()
            .all(|child| self.contains_tree(*child))
        {
            return Err(MemoryStorageError::MissingContent);
        }
        let id = directory
            .id()
            .map_err(|_| MemoryStorageError::MissingContent)?;
        self.directories.entry(id).or_insert(directory);
        Ok(id)
    }

    /// Checks closure when reopening potentially inconsistent history, not during ordinary lookups.
    /// Checking each stored directory's direct children also covers every transitive descendant.
    fn validate(&self) -> Result<(), MemoryStorageError> {
        if self.directories.values().any(|directory| {
            directory
                .entries()
                .values()
                .any(|child| !self.contains_tree(*child))
        }) {
            return Err(MemoryStorageError::InconsistentHistory);
        }
        Ok(())
    }
}

/// Retained state shared across successive exclusive openings.
#[derive(Debug, Default)]
struct Document {
    /// Blob-tree data shared by the components, but not their writer authority.
    blob_data: Mutex<BlobStorageData>,
    /// Complete opaque event history.
    events: Arc<Mutex<ArchiveData<CommittedEvent>>>,
    /// Snapshot identities without self-retaining availability handles.
    snapshots: Arc<Mutex<ArchiveData<StoredSnapshot>>>,
}

impl Document {
    /// Checks complete histories, matching archive positions, and dependency closure before reopening.
    fn validate(&self) -> Result<(), MemoryStorageError> {
        let content = self.blob_data.lock().expect("content lock");
        content.validate()?;
        let events = self.events.lock().expect("event lock");
        for (index, (position, event)) in events.entries.iter().enumerate() {
            if position.get() != index as u64 + 1
                || event.position != *position
                || event
                    .event
                    .blob_tree
                    .is_some_and(|root| !content.contains_tree(root))
            {
                return Err(MemoryStorageError::InconsistentHistory);
            }
        }
        for (position, snapshot) in &self.snapshots.lock().expect("snapshot lock").entries {
            if *position != snapshot.at_event
                || !events.entries.contains_key(&snapshot.at_event)
                || !content.contains_tree(snapshot.root)
            {
                return Err(MemoryStorageError::InconsistentHistory);
            }
        }
        Ok(())
    }
}

/// Snapshot records keep identities, avoiding a document-to-handle ownership cycle.
#[derive(Clone, Debug)]
struct StoredSnapshot {
    /// Complete state tree already validated at publication.
    root: BlobTreeId,
    /// Event included in the state and used as the archive position.
    at_event: EventPosition,
}

impl StoredSnapshot {
    /// Re-establishes both dependencies and mints handles compatible with the owning stores.
    fn resolve(
        &self,
        document: &Arc<Document>,
    ) -> Result<Snapshot<MemoryBlobHandle, MemoryEventHandle>, MemoryStorageError> {
        if !document
            .blob_data
            .lock()
            .expect("content lock")
            .contains_tree(self.root)
            || !document
                .events
                .lock()
                .expect("event lock")
                .entries
                .contains_key(&self.at_event)
        {
            return Err(MemoryStorageError::InconsistentHistory);
        }
        Ok(Snapshot {
            root: MemoryBlobHandle {
                document: document.clone(),
                id: self.root,
            },
            at_event: MemoryEventHandle {
                document: document.clone(),
                id: self.at_event,
            },
        })
    }
}

/// Shared token whose strong references prevent a new writer opening for the document.
#[derive(Debug)]
pub(crate) struct WriterLease;

/// Stored identity and weak writer lease for a document known by the factory.
#[derive(Debug)]
struct DocumentEntry {
    /// Data persists as long as the factory or a component/handle retains it.
    document: Arc<Document>,
    /// Does not keep an otherwise unused opening alive.
    opening: Weak<WriterLease>,
}

/// Process-local document factory implementing `sea_core::next::SeaStorage`.
///
/// Clones share identities and exclusive openings. Components and streams retain writer leases;
/// availability handles retain data only and remain compatible with later openings of this document.
/// There is no detached write work: an unpolled append has no effect, and a polled append settles
/// synchronously under its component lock before returning. No operation reports ambiguity.
#[derive(Clone, Debug, Default)]
pub struct MemoryStorage {
    /// Registry owns histories even while documents are closed.
    documents: Arc<Mutex<HashMap<DocumentId, DocumentEntry>>>,
}

impl MemoryStorage {
    /// Creates an independent empty registry.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Shares one exclusive lease among all three components.
    fn components(
        document: Arc<Document>,
        opening: Arc<WriterLease>,
    ) -> StorageComponents<MemoryBlobStore, MemoryEventArchive, MemorySnapshotArchive> {
        StorageComponents {
            blobs: MemoryBlobStore {
                document: document.clone(),
                _opening: opening.clone(),
            },
            events: MemoryEventArchive {
                document: document.clone(),
                opening: opening.clone(),
            },
            snapshots: MemorySnapshotArchive { document, opening },
        }
    }
}

#[async_trait]
impl SeaStorage for MemoryStorage {
    type Error = MemoryStorageError;
    type Blobs = MemoryBlobStore;
    type Events = MemoryEventArchive;
    type Snapshots = MemorySnapshotArchive;

    fn durability(&self) -> Durability {
        Durability::Memory
    }

    async fn create_document(
        &self,
    ) -> Result<CreatedDocument<Self::Blobs, Self::Events, Self::Snapshots>, Self::Error> {
        let ordinal = NEXT_DOCUMENT_ID
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
                current.checked_add(1)
            })
            .map_err(|_| MemoryStorageError::IdentityExhausted)?;
        let id = DocumentId::from_bytes(Bytes::copy_from_slice(&ordinal.to_be_bytes()));
        let document = Arc::new(Document::default());
        let opening = Arc::new(WriterLease);
        self.documents.lock().expect("registry lock").insert(
            id.clone(),
            DocumentEntry {
                document: document.clone(),
                opening: Arc::downgrade(&opening),
            },
        );
        Ok(CreatedDocument {
            id,
            components: Self::components(document, opening),
        })
    }

    async fn open_document(
        &self,
        id: &DocumentId,
    ) -> Result<Option<StorageComponents<Self::Blobs, Self::Events, Self::Snapshots>>, Self::Error>
    {
        let mut documents = self.documents.lock().expect("registry lock");
        let Some(entry) = documents.get_mut(id) else {
            return Ok(None);
        };
        if entry.opening.upgrade().is_some() {
            return Err(MemoryStorageError::AlreadyOpen);
        }
        entry.document.validate()?;
        let opening = Arc::new(WriterLease);
        entry.opening = Arc::downgrade(&opening);
        Ok(Some(Self::components(entry.document.clone(), opening)))
    }
}

/// Evidence of a complete memory-resident tree; does not retain writer ownership.
#[derive(Clone, Debug)]
pub struct MemoryBlobHandle {
    /// Owning document supplies unforgeable provenance and retained content.
    document: Arc<Document>,
    /// Stable content identity.
    id: BlobTreeId,
}

impl StorageHandle for MemoryBlobHandle {
    type Id = BlobTreeId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

/// Blob component of one exclusive opening; clones share the same writer lease.
#[derive(Clone, Debug)]
pub struct MemoryBlobStore {
    /// Data remains available across reopening through the factory.
    document: Arc<Document>,
    /// Shared lease held by every component and dependent stream.
    _opening: Arc<WriterLease>,
}

/// Availability evidence for an event in this document; does not retain writer ownership.
#[derive(Clone, Debug)]
pub struct MemoryEventHandle {
    /// Provenance and retained event data, independent of any opening lease.
    document: Arc<Document>,
    /// Committed position represented by this capability.
    id: EventPosition,
}

impl StorageHandle for MemoryEventHandle {
    type Id = EventPosition;
    fn id(&self) -> Self::Id {
        self.id
    }
}

/// Cloneable event component sharing one exclusive opening and append order.
#[derive(Clone, Debug)]
pub struct MemoryEventArchive {
    /// Owning document supplies history and handle provenance.
    document: Arc<Document>,
    /// Shared exclusive writer lease.
    opening: Arc<WriterLease>,
}

impl StorageSurface for MemoryEventArchive {
    type Error = MemoryStorageError;
}

#[async_trait]
impl ReferenceableStore for MemoryEventArchive {
    type Id = EventPosition;
    type Handle = MemoryEventHandle;

    async fn resolve(&self, id: Self::Id) -> Result<Option<Self::Handle>, Self::Error> {
        Ok(self
            .document
            .events
            .lock()
            .expect("event lock")
            .entries
            .contains_key(&id)
            .then(|| MemoryEventHandle {
                document: self.document.clone(),
                id,
            }))
    }

    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), Self::Error> {
        if !Arc::ptr_eq(&self.document, &handle.document) {
            return Err(MemoryStorageError::ForeignHandle);
        }
        if !self
            .document
            .events
            .lock()
            .expect("event lock")
            .entries
            .contains_key(&handle.id)
        {
            return Err(MemoryStorageError::InvalidPosition);
        }
        Ok(())
    }
}

#[async_trait]
impl Archive for MemoryEventArchive {
    type Position = EventPosition;
    type Item = CommittedEvent;
    type Append = Event;
    type AppendResult = MemoryEventHandle;

    async fn append(&self, event: Event) -> Result<Self::AppendResult, Self::Error> {
        let (position, readers) = {
            let mut events = self.document.events.lock().expect("event lock");
            let ordinal = events
                .head()
                .map_or(0, EventPosition::get)
                .checked_add(1)
                .ok_or(MemoryStorageError::IdentityExhausted)?;
            let position = EventPosition::new(ordinal);
            let readers = events.insert(position, CommittedEvent { position, event });
            (position, readers)
        };
        for reader in readers {
            reader.wake();
        }
        Ok(MemoryEventHandle {
            document: self.document.clone(),
            id: position,
        })
    }

    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<Self::Item, EventPosition, Self::Error> {
        memory_archive::read(
            self.document.events.clone(),
            self.opening.clone(),
            after,
            stop_after,
        )
    }

    async fn head(&self) -> Result<Option<EventPosition>, Self::Error> {
        Ok(self.document.events.lock().expect("event lock").head())
    }
}

/// Sparse snapshot component ordered strictly by the referenced event position.
#[derive(Clone, Debug)]
pub struct MemorySnapshotArchive {
    /// Owning document provides both publication dependencies.
    document: Arc<Document>,
    /// Shared exclusive writer lease.
    opening: Arc<WriterLease>,
}

impl StorageSurface for MemorySnapshotArchive {
    type Error = MemoryStorageError;
}

#[async_trait]
impl Archive for MemorySnapshotArchive {
    type Position = EventPosition;
    type Item = Snapshot<MemoryBlobHandle, MemoryEventHandle>;
    type Append = Self::Item;
    type AppendResult = ();

    async fn append(&self, snapshot: Self::Append) -> Result<(), Self::Error> {
        if !Arc::ptr_eq(&self.document, &snapshot.root.document)
            || !Arc::ptr_eq(&self.document, &snapshot.at_event.document)
        {
            return Err(MemoryStorageError::ForeignHandle);
        }
        let stored = StoredSnapshot {
            root: snapshot.root.id,
            at_event: snapshot.at_event.id,
        };
        stored.resolve(&self.document)?;
        let readers = {
            let mut snapshots = self.document.snapshots.lock().expect("snapshot lock");
            if snapshots.head().is_some_and(|head| head >= stored.at_event) {
                return Err(MemoryStorageError::SnapshotOrder);
            }
            snapshots.insert(stored.at_event, stored)
        };
        for reader in readers {
            reader.wake();
        }
        Ok(())
    }

    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<Self::Item, EventPosition, Self::Error> {
        let document = self.document.clone();
        map_monitored_stream(
            memory_archive::read(
                self.document.snapshots.clone(),
                self.opening.clone(),
                after,
                stop_after,
            ),
            move |snapshot| snapshot.resolve(&document),
            |error| error,
        )
    }

    async fn head(&self) -> Result<Option<EventPosition>, Self::Error> {
        Ok(self
            .document
            .snapshots
            .lock()
            .expect("snapshot lock")
            .head())
    }
}

#[async_trait]
impl SnapshotArchive for MemorySnapshotArchive {
    type BlobHandle = MemoryBlobHandle;
    type EventHandle = MemoryEventHandle;

    async fn get_snapshot_at(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::Item>, Self::Error> {
        let stored = self
            .document
            .snapshots
            .lock()
            .expect("snapshot lock")
            .entries
            .get(&position)
            .cloned();
        stored
            .map(|snapshot| snapshot.resolve(&self.document))
            .transpose()
    }

    async fn latest_at_or_before(
        &self,
        position: Option<EventPosition>,
    ) -> Result<Option<Self::Item>, Self::Error> {
        let stored = {
            let snapshots = self.document.snapshots.lock().expect("snapshot lock");
            match position {
                Some(position) => snapshots.entries.range(..=position).next_back(),
                None => snapshots.entries.last_key_value(),
            }
            .map(|(_, snapshot)| snapshot.clone())
        };
        stored
            .map(|snapshot| snapshot.resolve(&self.document))
            .transpose()
    }
}

impl StorageSurface for MemoryBlobStore {
    type Error = MemoryStorageError;
}

#[async_trait]
impl ReferenceableStore for MemoryBlobStore {
    type Id = BlobTreeId;
    type Handle = MemoryBlobHandle;

    async fn resolve(&self, id: Self::Id) -> Result<Option<Self::Handle>, Self::Error> {
        Ok(self
            .document
            .blob_data
            .lock()
            .expect("content lock")
            .contains_tree(id)
            .then(|| MemoryBlobHandle {
                document: self.document.clone(),
                id,
            }))
    }

    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), Self::Error> {
        if !Arc::ptr_eq(&self.document, &handle.document) {
            return Err(MemoryStorageError::ForeignHandle);
        }
        if !self
            .document
            .blob_data
            .lock()
            .expect("content lock")
            .contains_tree(handle.id)
        {
            return Err(MemoryStorageError::MissingContent);
        }
        Ok(())
    }
}

#[async_trait]
impl BlobStore for MemoryBlobStore {
    async fn put_blob(&self, payload: Bytes) -> Result<Self::Handle, Self::Error> {
        let blob = PrehashedBlob::new(payload);
        let id = self
            .document
            .blob_data
            .lock()
            .expect("content lock")
            .put_blob(blob);
        Ok(MemoryBlobHandle {
            document: self.document.clone(),
            id: BlobTreeId::Blob(id),
        })
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        self.document
            .blob_data
            .lock()
            .expect("content lock")
            .blobs
            .get(&id)
            .cloned()
            .ok_or(MemoryStorageError::MissingContent)
    }

    async fn put_directory(&self, directory: BlobDirectory) -> Result<Self::Handle, Self::Error> {
        let id = self
            .document
            .blob_data
            .lock()
            .expect("content lock")
            .put_directory(directory)?;
        Ok(MemoryBlobHandle {
            document: self.document.clone(),
            id: BlobTreeId::Directory(id),
        })
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.document
            .blob_data
            .lock()
            .expect("content lock")
            .directories
            .get(&id)
            .cloned()
            .ok_or(MemoryStorageError::MissingContent)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{
        FutureExt, StreamExt,
        task::{ArcWake, waker},
    };
    use sea_core::{MonitoredStreamItem, MonitoredStreamStatus, next::LoadStart};
    use std::{
        sync::atomic::AtomicUsize,
        task::{Context, Poll},
        time::Duration,
    };

    /// Collects the data of a finite read, preserving lazy errors for assertions.
    async fn collect_items<Item>(
        mut stream: ArchiveStream<Item, EventPosition, MemoryStorageError>,
    ) -> Result<Vec<Item>, MemoryStorageError> {
        let mut items = Vec::new();
        while let Some(item) = stream.next().await {
            if let MonitoredStreamItem::Item(item) = item? {
                items.push(item);
            }
        }
        Ok(items)
    }

    /// Counts actual executor notifications without relying on sleeps or scheduling races.
    #[derive(Default)]
    struct WakeCounter(AtomicUsize);

    impl ArcWake for WakeCounter {
        fn wake_by_ref(counter: &Arc<Self>) {
            counter.0.fetch_add(1, Ordering::Relaxed);
        }
    }

    #[tokio::test]
    async fn replacement_storage_conformance() {
        tokio::time::timeout(Duration::from_secs(5), async {
            sea_conformance::next::run_view_conformance(&MemoryStorage::new()).await;
            sea_conformance::next::run_snapshot_archive_conformance(&MemoryStorage::new()).await;
        })
        .await
        .expect("replacement conformance must finish");
    }

    #[tokio::test]
    async fn factory_identity_and_component_clone_lifetimes() {
        let storage = MemoryStorage::new();
        assert!(
            storage
                .open_document(&DocumentId::from_bytes(Bytes::new()))
                .await
                .unwrap()
                .is_none()
        );
        let created = storage.create_document().await.unwrap();
        let other = MemoryStorage::new().create_document().await.unwrap();
        assert_ne!(created.id, other.id);
        assert!(storage.open_document(&other.id).await.unwrap().is_none());
        let blob_clone = created.components.blobs.clone();
        let id = created.id;
        drop(created.components);
        assert!(matches!(
            storage.clone().open_document(&id).await,
            Err(MemoryStorageError::AlreadyOpen)
        ));
        drop(blob_clone);
        let (first, second) = tokio::join!(storage.open_document(&id), storage.open_document(&id));
        assert!(first.is_ok());
        assert!(matches!(second, Err(MemoryStorageError::AlreadyOpen)));
    }

    #[tokio::test]
    async fn availability_rejects_foreign_handles_before_view_publication() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let (_, other) = storage.create_view().await.unwrap();
        let root = view.blobs().put_blob(Bytes::new()).await.unwrap();
        let foreign_root = other.blobs().put_blob(Bytes::new()).await.unwrap();
        assert_eq!(root.id(), foreign_root.id());
        assert!(matches!(
            view.append(Bytes::new(), Some(&foreign_root)).await,
            Err(MemoryStorageError::ForeignHandle)
        ));
        assert_eq!(view.head().await.unwrap(), None);
        let event = view.append(Bytes::new(), None).await.unwrap();
        let foreign_event = other.append(Bytes::new(), None).await.unwrap();
        assert_eq!(event.id(), foreign_event.id());
        for snapshot in [
            Snapshot {
                root: foreign_root,
                at_event: event.clone(),
            },
            Snapshot {
                root: root.clone(),
                at_event: foreign_event,
            },
        ] {
            assert!(matches!(
                view.publish_snapshot(&snapshot).await,
                Err(MemoryStorageError::ForeignHandle)
            ));
        }
        assert!(
            view.get_snapshot(LoadStart::LatestSnapshot)
                .await
                .unwrap()
                .is_none()
        );
        view.publish_snapshot(&Snapshot {
            root,
            at_event: event,
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn read_bounds_are_lazy_empty_ranges_finish_and_drops_release_opening() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let future = EventPosition::new(1);
        let mut invalid = view.read(None, Some(future));
        assert_eq!(
            invalid.progress().status,
            MonitoredStreamStatus::StreamingBacklog
        );
        assert!(matches!(
            invalid.next().await,
            Some(Err(MemoryStorageError::InvalidPosition))
        ));
        assert!(invalid.next().await.is_none());
        let lazy = view.read(None, Some(future));
        view.append(Bytes::new(), None).await.unwrap();
        assert_eq!(collect_items(lazy).await.unwrap().len(), 1);
        let beyond = EventPosition::new(50);
        assert!(
            collect_items(view.read(Some(beyond), Some(future)))
                .await
                .unwrap()
                .is_empty()
        );
        assert!(
            collect_items(view.read(Some(beyond), Some(beyond)))
                .await
                .unwrap()
                .is_empty()
        );
        assert!(matches!(
            collect_items(view.read(Some(beyond), None)).await,
            Err(MemoryStorageError::InvalidPosition)
        ));
        let unpolled = view.read(None, None);
        drop(view);
        drop(invalid);
        assert!(matches!(
            storage.open_view(&id).await,
            Err(MemoryStorageError::AlreadyOpen)
        ));
        drop(unpolled);
        assert!(storage.open_view(&id).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn live_read_wakes_without_gaps_tracks_backlog_and_cancels_independently() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let mut live = view.read(None, None);
        let mut cancelled = view.read(None, None);
        let counter = Arc::new(WakeCounter::default());
        let wake = waker(counter.clone());
        let mut context = Context::from_waker(&wake);
        assert!(matches!(
            live.as_mut().poll_next(&mut context),
            Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(_))))
        ));
        assert!(live.as_mut().poll_next(&mut context).is_pending());
        assert!(matches!(
            cancelled.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        assert!(cancelled.next().now_or_never().is_none());
        drop(cancelled);
        let replacement_counter = Arc::new(WakeCounter::default());
        let replacement_wake = waker(replacement_counter.clone());
        let mut replacement_context = Context::from_waker(&replacement_wake);
        assert!(
            live.as_mut()
                .poll_next(&mut replacement_context)
                .is_pending()
        );
        let first = view.append(Bytes::new(), None).await.unwrap();
        let second = view.append(Bytes::new(), None).await.unwrap();
        assert_eq!(counter.0.load(Ordering::Relaxed), 0);
        assert!(replacement_counter.0.load(Ordering::Relaxed) > 0);
        assert_eq!(live.progress().previous, None);
        assert_eq!(live.progress().latest_known, Some(second.id()));
        assert_eq!(live.progress().status, MonitoredStreamStatus::FallenBehind);
        for position in [first.id(), second.id()] {
            assert!(
                matches!(live.next().await, Some(Ok(MonitoredStreamItem::Item(event))) if event.position == position)
            );
            assert_eq!(live.progress().previous, Some(position));
        }
        assert_eq!(
            live.progress().status,
            MonitoredStreamStatus::AwaitingNewItems
        );
        assert!(matches!(
            live.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        assert!(live.next().now_or_never().is_none());
    }

    #[tokio::test]
    async fn cancelled_appends_have_no_detached_work_and_concurrent_appends_are_distinct() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        drop(view.append(Bytes::new(), None));
        assert_eq!(view.head().await.unwrap(), None);
        assert!(
            view.append(Bytes::new(), None)
                .now_or_never()
                .unwrap()
                .is_ok()
        );
        let barrier = std::sync::Barrier::new(4);
        let handles = std::thread::scope(|scope| {
            let workers: Vec<_> = (0..4)
                .map(|_| {
                    let view = &view;
                    let barrier = &barrier;
                    scope.spawn(move || {
                        barrier.wait();
                        (0..8)
                            .map(|_| {
                                view.append(Bytes::new(), None)
                                    .now_or_never()
                                    .expect("memory append must settle synchronously")
                            })
                            .collect::<Vec<_>>()
                    })
                })
                .collect();
            workers
                .into_iter()
                .flat_map(|worker| worker.join().unwrap())
                .collect::<Vec<_>>()
        });
        let positions: std::collections::BTreeSet<_> = handles
            .into_iter()
            .map(|handle| handle.unwrap().id())
            .collect();
        assert_eq!(positions.len(), 32);
        assert_eq!(
            positions.iter().copied().collect::<Vec<_>>(),
            (2..=33).map(EventPosition::new).collect::<Vec<_>>()
        );
        let head = view.head().await.unwrap();
        assert_eq!(head, positions.last().copied());
        assert_eq!(
            collect_items(view.read(None, head)).await.unwrap().len(),
            33
        );
    }

    #[tokio::test]
    async fn exhausted_event_positions_reject_without_changing_history() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let events = created.components.events;
        let position = EventPosition::new(u64::MAX);
        let event = Event {
            payload: Bytes::from_static(b"retained"),
            blob_tree: None,
        };
        events.document.events.lock().unwrap().insert(
            position,
            CommittedEvent {
                position,
                event: event.clone(),
            },
        );

        let error = events
            .append(Event {
                payload: Bytes::new(),
                blob_tree: None,
            })
            .await
            .unwrap_err();
        assert!(matches!(error, MemoryStorageError::IdentityExhausted));
        assert_eq!(error.kind(), ErrorKind::Rejected);
        let archive = events.document.events.lock().unwrap();
        assert_eq!(archive.head(), Some(position));
        assert_eq!(archive.entries.len(), 1);
        assert_eq!(archive.entries[&position].event, event);
    }

    #[tokio::test]
    async fn raw_event_archive_keeps_blob_ids_opaque_but_reopen_checks_dependencies() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let missing = BlobTreeId::Blob(BlobId::for_bytes(b"missing"));
        let handle = created
            .components
            .events
            .append(Event {
                payload: Bytes::new(),
                blob_tree: Some(missing),
            })
            .await
            .unwrap();
        created
            .components
            .events
            .ensure_available(&handle)
            .await
            .unwrap();
        let id = created.id;
        drop(created.components);
        assert!(matches!(
            storage.open_document(&id).await,
            Err(MemoryStorageError::InconsistentHistory)
        ));
    }

    #[tokio::test]
    async fn missing_snapshot_dependencies_and_event_gaps_fail_instead_of_disappearing() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let components = created.components;
        let root = components.blobs.put_blob(Bytes::new()).await.unwrap();
        let first = components
            .events
            .append(Event {
                payload: Bytes::new(),
                blob_tree: None,
            })
            .await
            .unwrap();
        let second = components
            .events
            .append(Event {
                payload: Bytes::new(),
                blob_tree: None,
            })
            .await
            .unwrap();
        components
            .snapshots
            .append(Snapshot {
                root,
                at_event: first.clone(),
            })
            .await
            .unwrap();
        components
            .blobs
            .document
            .blob_data
            .lock()
            .unwrap()
            .blobs
            .clear();
        assert!(matches!(
            components.snapshots.get_snapshot_at(first.id()).await,
            Err(MemoryStorageError::InconsistentHistory)
        ));
        assert!(matches!(
            components.snapshots.latest_at_or_before(None).await,
            Err(MemoryStorageError::InconsistentHistory)
        ));
        assert!(matches!(
            collect_items(components.snapshots.read(None, Some(first.id()))).await,
            Err(MemoryStorageError::InconsistentHistory)
        ));
        drop(components);
        assert!(matches!(
            storage.open_document(&created.id).await,
            Err(MemoryStorageError::InconsistentHistory)
        ));
        first.document.snapshots.lock().unwrap().entries.clear();
        first
            .document
            .events
            .lock()
            .unwrap()
            .entries
            .remove(&first.id());
        assert_eq!(second.id(), EventPosition::new(2));
        assert!(matches!(
            storage.open_document(&created.id).await,
            Err(MemoryStorageError::InconsistentHistory)
        ));
    }

    #[tokio::test]
    async fn reopen_rejects_mismatched_snapshot_positions() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let components = created.components;
        let root = components.blobs.put_blob(Bytes::new()).await.unwrap();
        let event = components
            .events
            .append(Event {
                payload: Bytes::new(),
                blob_tree: None,
            })
            .await
            .unwrap();
        components
            .snapshots
            .append(Snapshot {
                root,
                at_event: event.clone(),
            })
            .await
            .unwrap();
        {
            let mut snapshots = components.snapshots.document.snapshots.lock().unwrap();
            let stored = snapshots.entries.remove(&event.id()).unwrap();
            snapshots.entries.insert(EventPosition::new(2), stored);
        }
        drop(components);
        assert!(matches!(
            storage.open_document(&created.id).await,
            Err(MemoryStorageError::InconsistentHistory)
        ));
    }

    #[tokio::test]
    async fn load_policies_replay_from_the_selected_snapshot_without_capturing_a_head() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let first = view.append(Bytes::new(), None).await.unwrap();
        assert!(
            view.get_snapshot(LoadStart::LatestSnapshot)
                .await
                .unwrap()
                .is_none()
        );
        let root = view.blobs().put_blob(Bytes::new()).await.unwrap();
        let second = view.append(Bytes::new(), None).await.unwrap();
        view.publish_snapshot(&Snapshot {
            root,
            at_event: second.clone(),
        })
        .await
        .unwrap();
        for (policy, selected, replay) in [
            (LoadStart::Beginning, None, first.id()),
            (
                LoadStart::ReplayAtLeastAllAfter(first.id()),
                None,
                first.id(),
            ),
            (
                LoadStart::ReplayAtLeastAllAfter(second.id()),
                Some(second.id()),
                EventPosition::new(3),
            ),
            (
                LoadStart::LatestSnapshot,
                Some(second.id()),
                EventPosition::new(3),
            ),
        ] {
            let mut loaded = view.load(policy).await.unwrap();
            assert_eq!(
                loaded
                    .snapshot
                    .as_ref()
                    .map(|snapshot| snapshot.at_event.id()),
                selected
            );
            assert_eq!(loaded.events.progress().previous, selected);
            if view.head().await.unwrap() == Some(second.id()) {
                view.append(Bytes::new(), None).await.unwrap();
            }
            loop {
                if let Some(Ok(MonitoredStreamItem::Item(event))) = loaded.events.next().await {
                    assert_eq!(event.position, replay);
                    break;
                }
            }
        }
    }

    #[tokio::test]
    async fn snapshot_stream_is_live_and_retains_opening_without_retaining_handle_cycles() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let components = created.components;
        let document = Arc::downgrade(&components.blobs.document);
        let root = components.blobs.put_blob(Bytes::new()).await.unwrap();
        let event = components
            .events
            .append(Event {
                payload: Bytes::new(),
                blob_tree: None,
            })
            .await
            .unwrap();
        let mut snapshots = components.snapshots.read(None, None);
        assert!(matches!(
            snapshots.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        assert!(snapshots.next().now_or_never().is_none());
        components
            .snapshots
            .append(Snapshot {
                root,
                at_event: event.clone(),
            })
            .await
            .unwrap();
        drop(components);
        assert!(matches!(
            storage.open_document(&created.id).await,
            Err(MemoryStorageError::AlreadyOpen)
        ));
        assert!(
            matches!(snapshots.next().await, Some(Ok(MonitoredStreamItem::Item(snapshot))) if snapshot.at_event.id() == event.id())
        );
        drop(snapshots);
        let reopened = storage.open_document(&created.id).await.unwrap().unwrap();
        reopened.events.ensure_available(&event).await.unwrap();
        drop((reopened, event, storage));
        assert!(
            document.upgrade().is_none(),
            "stored snapshots must not keep their own document alive"
        );
    }

    #[tokio::test]
    async fn view_appends_loads_and_reopens_with_compatible_handles() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        assert!(matches!(
            storage.open_view(&id).await,
            Err(MemoryStorageError::AlreadyOpen)
        ));
        let root = view
            .blobs()
            .put_blob(Bytes::from_static(b"state"))
            .await
            .unwrap();
        let first = view
            .append(Bytes::from_static(b"one"), Some(&root))
            .await
            .unwrap();
        view.publish_snapshot(&Snapshot {
            root: root.clone(),
            at_event: first.clone(),
        })
        .await
        .unwrap();
        let mut load = view.load(LoadStart::LatestSnapshot).await.unwrap();
        assert_eq!(load.snapshot.as_ref().unwrap().at_event.id(), first.id());
        let second = view.append(Bytes::from_static(b"two"), None).await.unwrap();
        while let Some(item) = load.events.next().await {
            if let MonitoredStreamItem::Item(event) = item.unwrap() {
                assert_eq!(event.position, second.id());
                break;
            }
        }
        drop(view);
        assert!(matches!(
            storage.open_view(&id).await,
            Err(MemoryStorageError::AlreadyOpen)
        ));
        drop(load);
        let reopened = storage.open_view(&id).await.unwrap().unwrap();
        reopened.blobs().ensure_available(&root).await.unwrap();
        assert_eq!(
            reopened
                .resolve_position(first.id())
                .await
                .unwrap()
                .unwrap()
                .id(),
            first.id()
        );
        assert_eq!(reopened.head().await.unwrap(), Some(second.id()));
    }

    #[test]
    fn content_publication_preserves_closure_and_deduplicates() {
        let mut content = BlobStorageData::default();
        let payload = Bytes::from_static(b"leaf");
        let leaf = BlobTreeId::Blob(content.put_blob(PrehashedBlob::new(payload.clone())));
        let child = BlobDirectory::new(BTreeMap::from([("leaf".to_owned(), leaf)])).unwrap();
        let child_id = content.put_directory(child.clone()).unwrap();
        let parent = BlobDirectory::new(BTreeMap::from([
            ("left".to_owned(), BlobTreeId::Directory(child_id)),
            ("right".to_owned(), BlobTreeId::Directory(child_id)),
        ]))
        .unwrap();
        let parent_id = content.put_directory(parent.clone()).unwrap();
        let empty = BlobDirectory::new(BTreeMap::new()).unwrap();
        let empty_id = content.put_directory(empty.clone()).unwrap();

        assert_eq!(
            leaf,
            BlobTreeId::Blob(content.put_blob(PrehashedBlob::new(payload.clone())))
        );
        assert_eq!(content.put_directory(child.clone()).unwrap(), child_id);
        assert_eq!(content.put_directory(parent.clone()).unwrap(), parent_id);
        assert_eq!(content.put_directory(empty.clone()).unwrap(), empty_id);
        assert_eq!(
            content.blobs,
            BTreeMap::from([(BlobId::for_bytes(&payload), payload)])
        );
        assert_eq!(
            content.directories,
            BTreeMap::from([(child_id, child), (parent_id, parent), (empty_id, empty),])
        );
        for id in [
            leaf,
            BlobTreeId::Directory(child_id),
            BlobTreeId::Directory(parent_id),
            BlobTreeId::Directory(empty_id),
        ] {
            assert!(content.contains_tree(id));
        }
        content.validate().unwrap();
    }

    #[test]
    fn content_publication_rejects_missing_children_without_mutation() {
        let mut content = BlobStorageData::default();
        let leaf = BlobTreeId::Blob(content.put_blob(PrehashedBlob::new(Bytes::new())));
        let missing_leaf = BlobTreeId::Blob(BlobId::for_bytes(b"missing"));
        let missing_directory =
            BlobDirectory::new(BTreeMap::from([("missing".to_owned(), missing_leaf)])).unwrap();
        let missing_directory_id = BlobTreeId::Directory(missing_directory.id().unwrap());
        let original_blobs = content.blobs.clone();
        let original_directories = content.directories.clone();

        for missing in [missing_leaf, missing_directory_id] {
            assert!(!content.contains_tree(missing));
            let directory = BlobDirectory::new(BTreeMap::from([
                ("available".to_owned(), leaf),
                ("missing".to_owned(), missing),
            ]))
            .unwrap();
            assert!(matches!(
                content.put_directory(directory),
                Err(MemoryStorageError::MissingContent)
            ));
            assert_eq!(content.blobs, original_blobs);
            assert_eq!(content.directories, original_directories);
            content.validate().unwrap();
        }
    }

    #[tokio::test]
    async fn reopening_rejects_missing_transitive_content() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let blobs = &created.components.blobs;
        let leaf = blobs.put_blob(Bytes::new()).await.unwrap();
        let child = blobs
            .put_directory(
                BlobDirectory::new(BTreeMap::from([("leaf".to_owned(), leaf.id())])).unwrap(),
            )
            .await
            .unwrap();
        let parent = blobs
            .put_directory(
                BlobDirectory::new(BTreeMap::from([("child".to_owned(), child.id())])).unwrap(),
            )
            .await
            .unwrap();
        created
            .components
            .events
            .append(Event {
                payload: Bytes::new(),
                blob_tree: Some(parent.id()),
            })
            .await
            .unwrap();
        blobs.document.blob_data.lock().unwrap().blobs.clear();

        drop(created.components);
        assert!(matches!(
            storage.open_document(&created.id).await,
            Err(MemoryStorageError::InconsistentHistory)
        ));
    }

    #[tokio::test]
    async fn shared_subtrees_remain_available_after_reopening() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let mut root = view.blobs().put_blob(Bytes::new()).await.unwrap();
        for _ in 0..8 {
            let directory = BlobDirectory::new(BTreeMap::from([
                ("left".to_owned(), root.id()),
                ("right".to_owned(), root.id()),
            ]))
            .unwrap();
            root = view.blobs().put_directory(directory).await.unwrap();
        }
        view.blobs().ensure_available(&root).await.unwrap();
        assert_eq!(
            view.blobs().resolve(root.id()).await.unwrap().unwrap().id(),
            root.id()
        );
        view.append(Bytes::new(), Some(&root)).await.unwrap();
        drop(view);
        assert!(storage.open_view(&id).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn blob_handles_check_document_provenance_and_closure() {
        let store = MemoryBlobStore {
            document: Arc::default(),
            _opening: Arc::new(WriterLease),
        };
        let other = MemoryBlobStore {
            document: Arc::default(),
            _opening: Arc::new(WriterLease),
        };
        let handle = store
            .put_blob(Bytes::from_static(b"content"))
            .await
            .unwrap();
        store.ensure_available(&handle).await.unwrap();
        assert_eq!(
            store.resolve(handle.id()).await.unwrap().unwrap().id(),
            handle.id()
        );
        assert!(matches!(
            other.ensure_available(&handle).await,
            Err(MemoryStorageError::ForeignHandle)
        ));
        assert!(other.resolve(handle.id()).await.unwrap().is_none());
        let directory =
            BlobDirectory::new(BTreeMap::from([("child".to_owned(), handle.id())])).unwrap();
        assert!(matches!(
            other.put_directory(directory.clone()).await,
            Err(MemoryStorageError::MissingContent)
        ));
        let tree = store.put_directory(directory.clone()).await.unwrap();
        let BlobTreeId::Directory(id) = tree.id() else {
            panic!("directory handle");
        };
        assert_eq!(store.get_directory(id).await.unwrap(), directory);
        let nested =
            BlobDirectory::new(BTreeMap::from([("nested".to_owned(), tree.id())])).unwrap();
        let nested_handle = store.put_directory(nested).await.unwrap();
        store.ensure_available(&nested_handle).await.unwrap();
        let BlobTreeId::Blob(blob_id) = handle.id() else {
            panic!("blob handle");
        };
        assert_eq!(
            store.get_blob(blob_id).await.unwrap(),
            Bytes::from_static(b"content")
        );
    }
}
