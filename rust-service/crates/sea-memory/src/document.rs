//! Document-scoped in-memory storage components.

use std::{
    collections::{BTreeMap, HashMap},
    sync::{
        Arc, Mutex, Weak,
        atomic::{AtomicU64, Ordering},
    },
};

use async_trait::async_trait;
use bytes::Bytes;
use sea_core::storage::{
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

/// Failures from the in-memory document store.
#[derive(Debug, Error)]
pub enum MemoryStorageError {
    /// A capability belongs to another document.
    #[error("availability handle belongs to another document")]
    ForeignHandle,
    /// A referenced content tree is not present.
    #[error("referenced content is unavailable")]
    MissingContent,
    /// Another component still owns the document's writer opening.
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
    /// Independently published sequencer state and allocation reservations.
    checkpoint: Mutex<Option<Bytes>>,
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

/// An exclusive opening that owns access to its document until its last strong reference is dropped.
#[derive(Debug)]
struct DocumentOpening {
    /// Retained data accessed by all writable components of this opening.
    document: Arc<Document>,
}

/// Stored identity and weak exclusive opening for a document known by the factory.
#[derive(Debug)]
struct DocumentEntry {
    /// Data persists as long as the factory or a component/handle retains it.
    document: Arc<Document>,
    /// Does not keep an otherwise unused opening alive.
    opening: Weak<DocumentOpening>,
}

/// Process-local document factory implementing `sea_core::storage::SeaStorage`.
///
/// Clones share identities and exclusive openings. Only components retain their opening;
/// streams and availability handles retain data only and remain usable across reopening.
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

    /// Derives storage components and checkpoint authority from the same exclusive opening.
    fn components(
        opening: Arc<DocumentOpening>,
    ) -> StorageComponents<MemoryBlobStore, MemoryEventArchive, MemorySnapshotArchive> {
        StorageComponents {
            blobs: MemoryBlobStore {
                opening: opening.clone(),
            },
            events: MemoryEventArchive {
                opening: opening.clone(),
            },
            checkpoints: Box::new(MemoryCheckpoint(opening.clone())),
            snapshots: MemorySnapshotArchive { opening },
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
        let opening = Arc::new(DocumentOpening {
            document: document.clone(),
        });
        self.documents.lock().expect("registry lock").insert(
            id.clone(),
            DocumentEntry {
                document: document.clone(),
                opening: Arc::downgrade(&opening),
            },
        );
        Ok(CreatedDocument {
            id,
            components: Self::components(opening),
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
        let opening = Arc::new(DocumentOpening {
            document: entry.document.clone(),
        });
        entry.opening = Arc::downgrade(&opening);
        Ok(Some(Self::components(opening)))
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

/// Blob component of one exclusive opening; clones share the same document-owning opening.
#[derive(Clone, Debug)]
pub struct MemoryBlobStore {
    /// Owns access to the document and keeps its opening exclusive.
    opening: Arc<DocumentOpening>,
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
    /// Owns access to the document and keeps its opening exclusive.
    opening: Arc<DocumentOpening>,
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
            .opening
            .document
            .events
            .lock()
            .expect("event lock")
            .entries
            .contains_key(&id)
            .then(|| MemoryEventHandle {
                document: self.opening.document.clone(),
                id,
            }))
    }

    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), Self::Error> {
        if !Arc::ptr_eq(&self.opening.document, &handle.document) {
            return Err(MemoryStorageError::ForeignHandle);
        }
        if !self
            .opening
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
    fn observe_invalidation(
        &self,
        _callback: sea_core::storage::InvalidationCallback<Self::Error>,
    ) -> Option<sea_core::storage::InvalidationRegistration> {
        // Independent memory owners remain valid; factory shutdown does not invalidate them.
        Some(sea_core::storage::InvalidationRegistration::never_invalidates())
    }

    type Position = EventPosition;
    type Item = CommittedEvent;
    type Append = Event;
    type AppendResult = MemoryEventHandle;

    async fn append(&self, event: Event) -> Result<Self::AppendResult, Self::Error> {
        let (position, readers) = {
            let mut events = self.opening.document.events.lock().expect("event lock");
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
            document: self.opening.document.clone(),
            id: position,
        })
    }

    async fn append_batch(
        &self,
        values: Vec<Self::Append>,
    ) -> Vec<Result<Self::AppendResult, Self::Error>> {
        let mut results = Vec::with_capacity(values.len());
        let mut readers = Vec::new();
        {
            let mut events = self.opening.document.events.lock().expect("event lock");
            for event in values {
                let Some(ordinal) = events.head().map_or(0, EventPosition::get).checked_add(1)
                else {
                    results.push(Err(MemoryStorageError::IdentityExhausted));
                    break;
                };
                let position = EventPosition::new(ordinal);
                readers = events.insert(position, CommittedEvent { position, event });
                results.push(Ok(MemoryEventHandle {
                    document: self.opening.document.clone(),
                    id: position,
                }));
            }
        }
        for reader in readers {
            reader.wake();
        }
        results
    }

    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<Self::Item, EventPosition, Self::Error> {
        memory_archive::read(self.opening.document.events.clone(), after, stop_after)
    }

    async fn head(&self) -> Result<Option<EventPosition>, Self::Error> {
        Ok(self
            .opening
            .document
            .events
            .lock()
            .expect("event lock")
            .head())
    }
}

/// Sparse snapshot component ordered strictly by the referenced event position.
#[derive(Clone, Debug)]
pub struct MemorySnapshotArchive {
    /// Owns access to the document and keeps its opening exclusive.
    opening: Arc<DocumentOpening>,
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
        if !Arc::ptr_eq(&self.opening.document, &snapshot.root.document)
            || !Arc::ptr_eq(&self.opening.document, &snapshot.at_event.document)
        {
            return Err(MemoryStorageError::ForeignHandle);
        }
        let stored = StoredSnapshot {
            root: snapshot.root.id,
            at_event: snapshot.at_event.id,
        };
        stored.resolve(&self.opening.document)?;
        let readers = {
            let mut snapshots = self
                .opening
                .document
                .snapshots
                .lock()
                .expect("snapshot lock");
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
        let document = self.opening.document.clone();
        map_monitored_stream(
            memory_archive::read(document.snapshots.clone(), after, stop_after),
            move |snapshot| snapshot.resolve(&document),
            |error| error,
        )
    }

    async fn head(&self) -> Result<Option<EventPosition>, Self::Error> {
        Ok(self
            .opening
            .document
            .snapshots
            .lock()
            .expect("snapshot lock")
            .head())
    }
}

/// Checkpoint authority retained independently of the snapshot archive.
#[derive(Debug)]
struct MemoryCheckpoint(Arc<DocumentOpening>);

impl StorageSurface for MemoryCheckpoint {
    type Error = MemoryStorageError;
}

#[async_trait]
impl sea_core::storage::CheckpointStore for MemoryCheckpoint {
    async fn checkpoint(&self) -> Result<Option<Bytes>, Self::Error> {
        Ok(self
            .0
            .document
            .checkpoint
            .lock()
            .expect("checkpoint lock")
            .clone())
    }

    async fn publish_checkpoint(&self, checkpoint: Bytes) -> Result<(), Self::Error> {
        if checkpoint.is_empty() {
            return Err(MemoryStorageError::InconsistentHistory);
        }
        *self.0.document.checkpoint.lock().expect("checkpoint lock") = Some(checkpoint);
        Ok(())
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
            .opening
            .document
            .snapshots
            .lock()
            .expect("snapshot lock")
            .entries
            .get(&position)
            .cloned();
        stored
            .map(|snapshot| snapshot.resolve(&self.opening.document))
            .transpose()
    }

    async fn latest_at_or_before(
        &self,
        position: Option<EventPosition>,
    ) -> Result<Option<Self::Item>, Self::Error> {
        let stored = {
            let snapshots = self
                .opening
                .document
                .snapshots
                .lock()
                .expect("snapshot lock");
            match position {
                Some(position) => snapshots.entries.range(..=position).next_back(),
                None => snapshots.entries.last_key_value(),
            }
            .map(|(_, snapshot)| snapshot.clone())
        };
        stored
            .map(|snapshot| snapshot.resolve(&self.opening.document))
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
            .opening
            .document
            .blob_data
            .lock()
            .expect("content lock")
            .contains_tree(id)
            .then(|| MemoryBlobHandle {
                document: self.opening.document.clone(),
                id,
            }))
    }

    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), Self::Error> {
        if !Arc::ptr_eq(&self.opening.document, &handle.document) {
            return Err(MemoryStorageError::ForeignHandle);
        }
        if !self
            .opening
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
            .opening
            .document
            .blob_data
            .lock()
            .expect("content lock")
            .put_blob(blob);
        Ok(MemoryBlobHandle {
            document: self.opening.document.clone(),
            id: BlobTreeId::Blob(id),
        })
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        self.opening
            .document
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
            .opening
            .document
            .blob_data
            .lock()
            .expect("content lock")
            .put_directory(directory)?;
        Ok(MemoryBlobHandle {
            document: self.opening.document.clone(),
            id: BlobTreeId::Directory(id),
        })
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.opening
            .document
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
    use sea_core::{MonitoredStreamItem, MonitoredStreamStatus, storage::LoadStart};
    use std::{
        sync::atomic::AtomicUsize,
        task::{Context, Poll},
        time::Duration,
    };

    #[tokio::test]
    async fn batch_dependency_failure_preserves_only_the_available_prefix() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let (_, foreign) = storage.create_view().await.unwrap();
        let unavailable = foreign
            .blobs()
            .put_blob(Bytes::from_static(b"foreign"))
            .await
            .unwrap();
        let results = view
            .append_batch(vec![
                (Bytes::from_static(b"first"), None),
                (Bytes::from_static(b"invalid"), Some(unavailable)),
                (Bytes::from_static(b"suffix"), None),
            ])
            .await;
        assert_eq!(results.len(), 2);
        assert!(results[0].is_ok());
        assert!(matches!(results[1], Err(MemoryStorageError::ForeignHandle)));
        assert_eq!(view.head().await.unwrap(), Some(EventPosition::new(1)));
        let records = collect_items(view.read(None, Some(EventPosition::new(1))))
            .await
            .unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].event.payload, Bytes::from_static(b"first"));
        let results = view
            .append_batch(vec![
                (Bytes::from_static(b"second"), None),
                (Bytes::from_static(b"third"), None),
            ])
            .await;
        assert_eq!(
            results
                .into_iter()
                .map(|result| result.unwrap().id().get())
                .collect::<Vec<_>>(),
            vec![2, 3]
        );
    }

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

    /// Supplies an event without payload or content dependencies.
    fn empty_event() -> Event {
        Event {
            payload: Bytes::new(),
            blob_tree: None,
        }
    }

    #[test]
    fn errors_preserve_caller_recovery_classification() {
        for (error, expected) in [
            (MemoryStorageError::ForeignHandle, ErrorKind::Rejected),
            (MemoryStorageError::MissingContent, ErrorKind::Rejected),
            (MemoryStorageError::AlreadyOpen, ErrorKind::Conflict),
            (
                MemoryStorageError::InvalidPosition,
                ErrorKind::InvalidPosition,
            ),
            (MemoryStorageError::SnapshotOrder, ErrorKind::Conflict),
            (MemoryStorageError::IdentityExhausted, ErrorKind::Rejected),
            (MemoryStorageError::InconsistentHistory, ErrorKind::Corrupt),
        ] {
            assert_eq!(error.kind(), expected);
        }
    }

    #[tokio::test]
    async fn independent_opening_never_invalidates_on_factory_shutdown_or_drop() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let events = created.components.events;
        let count = Arc::new(AtomicUsize::new(0));
        let observed = count.clone();
        let registration = events
            .observe_invalidation(Arc::new(move |_| {
                observed.fetch_add(1, Ordering::Relaxed);
            }))
            .expect("memory declares independent opening validity");
        storage.shutdown().await.unwrap();
        drop(storage);
        events.append(empty_event()).await.unwrap();
        assert_eq!(events.head().await.unwrap(), Some(EventPosition::new(1)));
        drop(events);
        assert_eq!(count.load(Ordering::Relaxed), 0);
        drop(registration);
    }

    #[tokio::test]
    async fn snapshot_resolution_rejects_missing_event_dependency() {
        let storage = MemoryStorage::new();
        let components = storage.create_document().await.unwrap().components;
        let root = components.blobs.put_blob(Bytes::new()).await.unwrap();
        let event = components.events.append(empty_event()).await.unwrap();
        components
            .snapshots
            .append(Snapshot {
                root,
                at_event: event.clone(),
            })
            .await
            .unwrap();
        event.document.events.lock().unwrap().entries.clear();
        assert!(matches!(
            components.snapshots.get_snapshot_at(event.id()).await,
            Err(MemoryStorageError::InconsistentHistory)
        ));
        assert!(matches!(
            components.snapshots.latest_at_or_before(None).await,
            Err(MemoryStorageError::InconsistentHistory)
        ));
        assert!(matches!(
            collect_items(components.snapshots.read(None, Some(event.id()))).await,
            Err(MemoryStorageError::InconsistentHistory)
        ));
    }

    #[tokio::test]
    async fn replacement_storage_conformance() {
        tokio::time::timeout(Duration::from_secs(5), async {
            sea_conformance::run_view_conformance(&MemoryStorage::new()).await;
            sea_conformance::run_snapshot_archive_conformance(&MemoryStorage::new()).await;
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
    async fn read_bounds_are_lazy_and_readers_do_not_prevent_reopening() {
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
        let mut lazy = view.read(None, Some(future));
        view.append(Bytes::new(), None).await.unwrap();
        let mut delivered = 0;
        while let Some(item) = lazy.next().await {
            if let MonitoredStreamItem::Item(_) = item.unwrap() {
                delivered += 1;
            }
        }
        assert_eq!(delivered, 1);
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
        let mut unpolled = view.read(None, None);
        drop(view);
        let reopened = storage.open_view(&id).await.unwrap().unwrap();
        assert!(invalid.next().await.is_none());
        assert!(lazy.next().await.is_none());
        assert!(matches!(
            unpolled.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        assert!(matches!(
            unpolled.next().await,
            Some(Ok(MonitoredStreamItem::Item(event))) if event.position == future
        ));
        assert_eq!(reopened.head().await.unwrap(), Some(future));
    }

    #[tokio::test]
    async fn event_read_retains_only_its_archive_until_dropped() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let document = Arc::downgrade(&created.components.events.opening.document);
        let opening = Arc::downgrade(&created.components.events.opening);
        let archive = Arc::downgrade(&created.components.events.opening.document.events);
        let event = created
            .components
            .events
            .append(Event {
                payload: Bytes::from_static(b"retained"),
                blob_tree: None,
            })
            .await
            .unwrap();
        let mut stream = created.components.events.read(None, Some(event.id()));
        drop((event, created, storage));

        assert!(opening.upgrade().is_none());
        assert!(document.upgrade().is_none());
        assert!(archive.upgrade().is_some());
        let mut delivered = 0;
        while let Some(item) = stream.next().await {
            if let MonitoredStreamItem::Item(event) = item.unwrap() {
                assert_eq!(event.event.payload, Bytes::from_static(b"retained"));
                delivered += 1;
            }
        }
        assert_eq!(delivered, 1);
        assert!(archive.upgrade().is_some());
        drop(stream);
        assert!(archive.upgrade().is_none());
    }

    #[tokio::test]
    async fn live_read_wakes_across_reopening_tracks_backlog_and_cancels_independently() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
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
        drop(view);
        let view = storage.open_view(&id).await.unwrap().unwrap();
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
        events.opening.document.events.lock().unwrap().insert(
            position,
            CommittedEvent {
                position,
                event: event.clone(),
            },
        );

        let error = events.append(empty_event()).await.unwrap_err();
        assert!(matches!(error, MemoryStorageError::IdentityExhausted));
        assert_eq!(error.kind(), ErrorKind::Rejected);
        let archive = events.opening.document.events.lock().unwrap();
        assert_eq!(archive.head(), Some(position));
        assert_eq!(archive.entries.len(), 1);
        assert_eq!(archive.entries[&position].event, event);
    }

    #[tokio::test]
    async fn exhausted_batch_retains_and_notifies_only_its_successful_prefix() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let events = created.components.events;
        let preceding = EventPosition::new(u64::MAX - 1);
        let event = Event {
            payload: Bytes::from_static(b"prefix"),
            blob_tree: None,
        };
        events.opening.document.events.lock().unwrap().insert(
            preceding,
            CommittedEvent {
                position: preceding,
                event: event.clone(),
            },
        );
        let mut live = events.read(Some(preceding), None);
        let counter = Arc::new(WakeCounter::default());
        let wake = waker(counter.clone());
        let mut context = Context::from_waker(&wake);
        assert!(live.as_mut().poll_next(&mut context).is_ready());
        assert!(live.as_mut().poll_next(&mut context).is_pending());
        let results = events.append_batch(vec![event.clone(); 3]).await;
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].as_ref().unwrap().id().get(), u64::MAX);
        assert!(matches!(
            results[1],
            Err(MemoryStorageError::IdentityExhausted)
        ));
        assert!(counter.0.load(Ordering::Relaxed) > 0);
        assert!(matches!(
            live.next().await,
            Some(Ok(MonitoredStreamItem::Item(committed)))
                if committed.position.get() == u64::MAX && committed.event == event
        ));
        assert_eq!(
            events.head().await.unwrap(),
            Some(EventPosition::new(u64::MAX))
        );
        assert_eq!(
            events.opening.document.events.lock().unwrap().entries.len(),
            2
        );
        assert!(events.append_batch(Vec::new()).await.is_empty());
    }

    #[tokio::test]
    async fn checkpoints_replace_opaque_state_without_publishing_archive_entries() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let id = created.id;
        let StorageComponents {
            blobs,
            events,
            snapshots,
            checkpoints,
        } = created.components;
        assert_eq!(checkpoints.checkpoint().await.unwrap(), None);
        for payload in [b"first".as_slice(), b"replacement".as_slice()] {
            checkpoints
                .publish_checkpoint(Bytes::copy_from_slice(payload))
                .await
                .unwrap();
            assert_eq!(checkpoints.checkpoint().await.unwrap().unwrap(), payload);
        }
        assert!(checkpoints.publish_checkpoint(Bytes::new()).await.is_err());
        assert_eq!(
            checkpoints.checkpoint().await.unwrap(),
            Some(Bytes::from_static(b"replacement"))
        );
        assert_eq!(events.head().await.unwrap(), None);
        assert_eq!(snapshots.head().await.unwrap(), None);
        drop((blobs, events, snapshots));
        assert!(matches!(
            storage.open_document(&id).await,
            Err(MemoryStorageError::AlreadyOpen)
        ));
        drop(checkpoints);
        let reopened = storage.open_document(&id).await.unwrap().unwrap();
        assert_eq!(
            reopened.checkpoints.checkpoint().await.unwrap(),
            Some(Bytes::from_static(b"replacement"))
        );
    }

    #[tokio::test]
    async fn snapshot_component_enforces_provenance_order_and_sparse_lookup() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let components = created.components;
        let foreign = storage.create_document().await.unwrap().components;
        let root = components.blobs.put_blob(Bytes::new()).await.unwrap();
        let foreign_root = foreign.blobs.put_blob(Bytes::new()).await.unwrap();
        let mut positions = Vec::new();
        for _ in 0..3 {
            positions.push(components.events.append(empty_event()).await.unwrap());
        }
        let foreign_event = foreign.events.append(empty_event()).await.unwrap();
        for snapshot in [
            Snapshot {
                root: foreign_root,
                at_event: positions[0].clone(),
            },
            Snapshot {
                root: root.clone(),
                at_event: foreign_event,
            },
        ] {
            assert!(matches!(
                components.snapshots.append(snapshot).await,
                Err(MemoryStorageError::ForeignHandle)
            ));
        }
        assert_eq!(components.snapshots.head().await.unwrap(), None);
        for index in [0, 2] {
            components
                .snapshots
                .append(Snapshot {
                    root: root.clone(),
                    at_event: positions[index].clone(),
                })
                .await
                .unwrap();
        }
        for index in 0..3 {
            let exact = components
                .snapshots
                .get_snapshot_at(positions[index].id())
                .await
                .unwrap();
            assert_eq!(
                exact.map(|s| s.at_event.id()),
                (index != 1).then(|| positions[index].id())
            );
            let selected = components
                .snapshots
                .latest_at_or_before(Some(positions[index].id()))
                .await
                .unwrap()
                .unwrap();
            assert_eq!(
                selected.at_event.id(),
                positions[if index == 2 { 2 } else { 0 }].id()
            );
            assert_eq!(selected.root.id(), root.id());
            assert!(matches!(
                components
                    .snapshots
                    .append(Snapshot {
                        root: root.clone(),
                        at_event: positions[index].clone(),
                    })
                    .await,
                Err(MemoryStorageError::SnapshotOrder)
            ));
        }
        assert!(
            components
                .snapshots
                .latest_at_or_before(Some(EventPosition::new(0)))
                .await
                .unwrap()
                .is_none()
        );
        let retained = collect_items(components.snapshots.read(None, Some(positions[2].id())))
            .await
            .unwrap();
        assert_eq!(retained.len(), 2);
        assert_eq!(retained[0].at_event.id(), positions[0].id());
        assert_eq!(retained[1].at_event.id(), positions[2].id());
    }

    #[tokio::test]
    async fn event_handles_revalidate_membership_and_reopening_checks_item_positions() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let event = created
            .components
            .events
            .append(empty_event())
            .await
            .unwrap();
        let missing = MemoryEventHandle {
            document: event.document.clone(),
            id: EventPosition::new(99),
        };
        assert!(matches!(
            created.components.events.ensure_available(&missing).await,
            Err(MemoryStorageError::InvalidPosition)
        ));
        assert!(
            created
                .components
                .events
                .resolve(missing.id())
                .await
                .unwrap()
                .is_none()
        );
        event
            .document
            .events
            .lock()
            .unwrap()
            .entries
            .get_mut(&event.id())
            .unwrap()
            .position = missing.id();
        drop(created.components);
        assert!(matches!(
            storage.open_document(&created.id).await,
            Err(MemoryStorageError::InconsistentHistory)
        ));
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
        let first = components.events.append(empty_event()).await.unwrap();
        let second = components.events.append(empty_event()).await.unwrap();
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
            .opening
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
        let event = components.events.append(empty_event()).await.unwrap();
        components
            .snapshots
            .append(Snapshot {
                root,
                at_event: event.clone(),
            })
            .await
            .unwrap();
        {
            let mut snapshots = components
                .snapshots
                .opening
                .document
                .snapshots
                .lock()
                .unwrap();
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
    async fn snapshot_stream_survives_reopening_without_retaining_handle_cycles() {
        let storage = MemoryStorage::new();
        let created = storage.create_document().await.unwrap();
        let components = created.components;
        let document = Arc::downgrade(&components.blobs.opening.document);
        let root = components.blobs.put_blob(Bytes::new()).await.unwrap();
        let event = components.events.append(empty_event()).await.unwrap();
        let mut snapshots = components.snapshots.read(None, None);
        assert!(matches!(
            snapshots.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        assert!(snapshots.next().now_or_never().is_none());
        drop(components);
        let reopened = storage.open_document(&created.id).await.unwrap().unwrap();
        reopened
            .snapshots
            .append(Snapshot {
                root,
                at_event: event.clone(),
            })
            .await
            .unwrap();
        assert!(
            matches!(snapshots.next().await, Some(Ok(MonitoredStreamItem::Item(snapshot))) if snapshot.at_event.id() == event.id())
        );
        reopened.events.ensure_available(&event).await.unwrap();
        drop((reopened, event, storage));
        assert!(document.upgrade().is_some());
        drop(snapshots);
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
        let third = reopened
            .append(Bytes::from_static(b"three"), None)
            .await
            .unwrap();
        loop {
            if let Some(Ok(MonitoredStreamItem::Item(event))) = load.events.next().await {
                assert_eq!(event.position, third.id());
                break;
            }
        }
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
        blobs
            .opening
            .document
            .blob_data
            .lock()
            .unwrap()
            .blobs
            .clear();

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
        let storage = MemoryStorage::new();
        let store = storage.create_document().await.unwrap().components.blobs;
        let other = storage.create_document().await.unwrap().components.blobs;
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
