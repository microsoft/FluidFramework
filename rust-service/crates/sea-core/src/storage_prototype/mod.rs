//! Executable prototype of decomposed Sea storage contracts.
//!
//! This module captures a proposed replacement for the current monolithic storage API. It is
//! hidden from generated documentation while the contracts are evaluated and does not yet replace
//! existing traits.
//!
//! The architecture has four layers:
//!
//! 1. [`BlobStore`], [`EventArchive`], and [`SnapshotArchive`] are independently useful storage
//!    components. Event and snapshot storage share the ordered [`Archive`] contract. Blob and event
//!    storage also share [`ReferenceableStore`] because their identities are persisted by another
//!    component; snapshots currently require no such external capability.
//! 2. [`SeaStorage`] assigns each [`DocumentId`] and creates or reopens one exclusive writable
//!    instance of each component for it. Its contract supplies cross-component publication and
//!    recovery guarantees without requiring a distributed transaction.
//! 3. [`SeaView`] exclusively composes one component of each kind into the reader/writer view of a
//!    document. Availability-bearing handles enforce the order in which references are published.
//! 4. [`SeaCollection`] uses storage to build document views. A sequencer can own one view and
//!    multiplex it into concurrent client sessions.
//!
//! # Publication and recovery law
//!
//! Component writes are ordered dependencies: complete blob trees precede events that reference
//! them, and those events precede snapshots that reference their positions. After reopening or
//! recovery, a storage implementation exposes only a self-consistent event prefix and snapshots
//! closed over that prefix. Every blob tree referenced by an exposed event or snapshot is
//! available and valid. Every non-initial snapshot position identifies an event in the exposed
//! prefix. Corruption within the required prefix fails recovery rather than producing a gap.
//!
//! This law is distinct from [`crate::Durability`]. Durability remains descriptive metadata about
//! memory, orderly storage, or crash-resistant persistence and is not a runtime policy mechanism.

mod blob_store;
mod event_archive;
mod ordered_archive;
mod referenceable_store;
mod snapshot_archive;
mod storage_surface;

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::stream;

use crate::snapshot::{Snapshot, SnapshotPosition};
use crate::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, CommittedEvent,
    Durability, Event, EventPosition, MonitoredStreamItem, MonitoredStreamProgress,
    MonitoredStreamStatus, OperationId, PublishedSnapshot, SnapshotId, SnapshotPublication,
    boxed_monitored_stream,
};

pub use blob_store::BlobStore;
pub use event_archive::{EventArchive, EventArchiveStream};
pub use ordered_archive::{Archive, ArchiveStream};
pub use referenceable_store::{ReferenceableStore, StorageHandle};
pub use snapshot_archive::SnapshotArchive;
pub use storage_surface::StorageSurface;

/// Stable backend-assigned identity of one Sea document.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct DocumentId(Bytes);

impl DocumentId {
    /// Wraps storage-defined identity bytes.
    #[must_use]
    pub fn from_bytes(value: Bytes) -> Self {
        Self(value)
    }

    /// Returns the opaque identity bytes.
    #[must_use]
    pub const fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

/// The three storage components belonging to one document.
///
/// A value returned by [`SeaStorage`] collectively represents one exclusive writable opening of
/// the document. Component types need not be `Clone`. If an implementation makes one cloneable,
/// every clone must preserve the same single-writer ordering and recovery guarantees rather than
/// create an independent writer.
#[derive(Debug)]
pub struct StorageComponents<B, E, S> {
    /// Content-addressed blob store for this document.
    pub blobs: B,
    /// Ordered event archive for this document.
    pub events: E,
    /// Snapshot publication archive for this document.
    pub snapshots: S,
}

/// A newly created document identity and its open storage components.
#[derive(Debug)]
pub struct CreatedDocument<B, E, S> {
    /// Stable identity allocated according to backend requirements.
    pub id: DocumentId,
    /// Empty storage components created for the identity.
    pub components: StorageComponents<B, E, S>,
}

/// Factory for the storage components of Sea documents.
///
/// Each document has exactly one blob store, event archive, and snapshot archive, all addressed by
/// the same [`DocumentId`]. The component traits remain independently useful, but this factory does
/// not expose alternate sharing or layout policies.
///
/// The factory advertises one durability class for the complete document. More importantly,
/// [`SeaStorage::open_document`] returns components only after enforcing this module's publication
/// and recovery law. An implementation must fail opening rather than return components containing
/// an event gap, an unavailable referenced blob tree, or a snapshot outside the recovered event
/// prefix. Creation and opening must also fail while another exclusive writable component set for
/// the same document remains live.
#[async_trait]
pub trait SeaStorage: Send + Sync {
    /// Classified error shared by this factory's components.
    type Error: ClassifiedError;

    /// Blob-store implementation created by this factory.
    type Blobs: BlobStore<Error = Self::Error>;

    /// Event-archive implementation created by this factory.
    type Events: EventArchive<Error = Self::Error>;

    /// Snapshot-archive implementation created by this factory.
    type Snapshots: SnapshotArchive<Error = Self::Error>;

    /// Persistence class of documents created by this backend.
    fn durability(&self) -> Durability;

    /// Allocates a fresh document identity and creates its exclusive writable components.
    ///
    /// Identity allocation is owned by the backend so it may satisfy persistence layout,
    /// uniqueness, locality, or external service requirements.
    async fn create_document(
        &self,
    ) -> Result<CreatedDocument<Self::Blobs, Self::Events, Self::Snapshots>, Self::Error>;

    /// Exclusively opens and recovers a document, or returns `None` when its identity is unknown.
    ///
    /// The implementation must reject the operation while another writable opening remains live.
    /// Dropping all returned component handles releases that ownership.
    async fn open_document(
        &self,
        id: &DocumentId,
    ) -> Result<Option<StorageComponents<Self::Blobs, Self::Events, Self::Snapshots>>, Self::Error>;
}

/// An event position accepted for snapshot publication through one view.
#[derive(Clone, Debug)]
pub enum ViewSnapshotPosition<H> {
    /// State before the first event.
    Initial,
    /// State through an event proven to belong to this view's event archive.
    At(H),
}

/// Snapshot publication carrying availability evidence for every external reference.
#[derive(Clone, Debug)]
pub struct ViewSnapshotPublication<BH, EH> {
    /// Stable identity reused for retries and ambiguity resolution.
    pub operation_id: OperationId,
    /// Latest publication expected by the publisher.
    pub expected_parent: Option<SnapshotId>,
    /// Event boundary represented by the snapshot.
    pub at_event: ViewSnapshotPosition<EH>,
    /// Complete materialized state tree.
    pub root: BH,
}

/// A snapshot selection and finite event catch-up captured by [`SeaView::load`].
pub struct ViewLoad<E> {
    /// Newest compatible retained snapshot, when one exists.
    pub snapshot: Option<PublishedSnapshot>,
    /// Event head captured after snapshot selection, or `None` for an empty archive.
    pub head: Option<EventPosition>,
    /// Monitored events after the selected snapshot through `head`, in position order.
    ///
    /// This stream is always finite even though [`Archive::read`] also supports live reads.
    pub events: EventArchiveStream<E>,
}

/// Exclusive concrete reader/writer view of one snapshotted event archive.
///
/// The view is intentionally not `Clone`, preserving the exclusive writable authority established
/// by [`SeaStorage`]. Its methods take shared references so independent operations, such as blob
/// persistence, may overlap. Each component implementation linearizes its own mutations, while
/// composed methods establish dependency order by awaiting availability before publishing an owner
/// record.
pub struct SeaView<B, E, S>
where
    B: BlobStore,
    E: EventArchive<Error = B::Error>,
    S: SnapshotArchive<Error = B::Error>,
{
    blobs: B,
    events: E,
    snapshots: S,
}

impl<B, E, S> SeaView<B, E, S>
where
    B: BlobStore,
    E: EventArchive<Error = B::Error>,
    S: SnapshotArchive<Error = B::Error>,
{
    fn new(components: StorageComponents<B, E, S>) -> Self {
        Self {
            blobs: components.blobs,
            events: components.events,
            snapshots: components.snapshots,
        }
    }

    /// Publishes or deduplicates one blob and returns its availability capability.
    pub async fn put_blob(&self, payload: Bytes) -> Result<B::Handle, B::Error> {
        self.blobs.put_blob(payload).await
    }

    /// Publishes or deduplicates one complete directory tree.
    pub async fn put_directory(&self, directory: BlobDirectory) -> Result<B::Handle, B::Error> {
        self.blobs.put_directory(directory).await
    }

    /// Fetches one immutable blob.
    pub async fn get_blob(&self, id: BlobId) -> Result<Bytes, B::Error> {
        self.blobs.get_blob(id).await
    }

    /// Fetches one immutable directory.
    pub async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, B::Error> {
        self.blobs.get_directory(id).await
    }

    /// Resolves a tree identity to availability evidence suitable for later publication.
    pub async fn resolve_tree(&self, id: BlobTreeId) -> Result<Option<B::Handle>, B::Error> {
        self.blobs.resolve(id).await
    }

    /// Resolves an event position to availability evidence suitable for snapshot publication.
    pub async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<E::Handle>, B::Error> {
        self.events.resolve(position).await
    }

    /// Appends an event after establishing availability of its optional content tree.
    pub async fn append(
        &self,
        payload: Bytes,
        tree: Option<&B::Handle>,
    ) -> Result<E::Handle, B::Error> {
        if let Some(handle) = tree {
            self.blobs.ensure_available(handle).await?;
        }
        self.events
            .append(Event {
                payload,
                blob_tree: tree.map(StorageHandle::id),
            })
            .await
    }

    /// Reads ordered events after a cursor, either through a position or as a live stream.
    ///
    /// `stop_after: Some(position)` produces a finite stream. `stop_after: None` catches up and
    /// waits for newly committed events.
    pub fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> EventArchiveStream<B::Error> {
        self.events.read(after, stop_after)
    }

    /// Returns the latest committed event position.
    pub async fn head(&self) -> Result<Option<EventPosition>, B::Error> {
        self.events.head().await
    }

    /// Returns one retained snapshot by identity.
    pub async fn snapshot(&self, id: &SnapshotId) -> Result<Option<PublishedSnapshot>, B::Error> {
        self.snapshots.snapshot(id).await
    }

    /// Returns the latest retained snapshot.
    pub async fn latest_snapshot(&self) -> Result<Option<PublishedSnapshot>, B::Error> {
        let Some(position) = self.snapshots.head().await? else {
            return Ok(None);
        };
        self.snapshots.snapshot_at(position).await
    }

    /// Publishes a snapshot after establishing both referenced dependencies.
    pub async fn publish_snapshot(
        &self,
        publication: ViewSnapshotPublication<B::Handle, E::Handle>,
    ) -> Result<PublishedSnapshot, B::Error> {
        self.blobs.ensure_available(&publication.root).await?;
        let at_event = match &publication.at_event {
            ViewSnapshotPosition::Initial => SnapshotPosition::Initial,
            ViewSnapshotPosition::At(event) => {
                self.events.ensure_available(event).await?;
                SnapshotPosition::At(event.id())
            }
        };
        self.snapshots
            .append(SnapshotPublication {
                operation_id: publication.operation_id,
                expected_parent: publication.expected_parent,
                snapshot: Snapshot {
                    at_event,
                    root: publication.root.id(),
                },
            })
            .await
    }

    /// Resolves a possibly ambiguous snapshot publication.
    pub async fn resolve_snapshot_publication(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<PublishedSnapshot>, B::Error> {
        self.snapshots
            .resolve_snapshot_publication(operation_id)
            .await
    }

    /// Selects a compatible snapshot and captures a finite catch-up boundary.
    ///
    /// The event archive linearizes concurrent appends. After snapshot selection, the captured head
    /// fixes the inclusive upper bound of the returned finite event stream; later appends are not
    /// included.
    pub async fn load(
        &self,
        required: Option<EventPosition>,
    ) -> Result<ViewLoad<B::Error>, B::Error> {
        let snapshot = match required {
            Some(position) => self.snapshots.snapshot_at_or_before(position).await?,
            None => self.latest_snapshot().await?,
        };
        let head = self.events.head().await?;
        let after = snapshot
            .as_ref()
            .and_then(|value| match value.snapshot.at_event {
                SnapshotPosition::Initial => None,
                SnapshotPosition::At(position) => Some(position),
            });
        let events = match head {
            Some(head) => self.events.read(after, Some(head)),
            None => empty_event_archive_stream(after),
        };
        Ok(ViewLoad {
            snapshot,
            head,
            events,
        })
    }
}

/// Constructs the completed event stream for a load whose captured archive head is empty.
fn empty_event_archive_stream<E: Send + 'static>(
    previous: Option<EventPosition>,
) -> EventArchiveStream<E> {
    boxed_monitored_stream(
        stream::empty::<Result<MonitoredStreamItem<CommittedEvent, EventPosition>, E>>(),
        MonitoredStreamProgress {
            previous,
            latest_known: previous,
            status: MonitoredStreamStatus::StreamingBacklog,
        },
        |event| Some(event.position),
    )
}

/// Document collection that asks storage to create or exclusively open document views.
pub struct SeaCollection<S> {
    storage: S,
}

impl<S> SeaCollection<S> {
    /// Creates a collection from one document storage backend.
    #[must_use]
    pub const fn new(storage: S) -> Self {
        Self { storage }
    }

    /// Returns the underlying document storage backend.
    #[must_use]
    pub const fn storage(&self) -> &S {
        &self.storage
    }
}

impl<S> SeaCollection<S>
where
    S: SeaStorage,
{
    /// Creates a backend-identified document and its exclusive writable view.
    pub async fn create(
        &self,
    ) -> Result<(DocumentId, SeaView<S::Blobs, S::Events, S::Snapshots>), S::Error> {
        let created = self.storage.create_document().await?;
        Ok((created.id, SeaView::new(created.components)))
    }

    /// Opens an existing document with exclusive writer ownership.
    pub async fn open(
        &self,
        id: &DocumentId,
    ) -> Result<Option<SeaView<S::Blobs, S::Events, S::Snapshots>>, S::Error> {
        let Some(components) = self.storage.open_document(id).await? else {
            return Ok(None);
        };
        Ok(Some(SeaView::new(components)))
    }
}
