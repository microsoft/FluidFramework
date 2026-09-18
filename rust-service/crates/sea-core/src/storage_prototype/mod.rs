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
//! This prototype does not support event or snapshot pruning.
//! Archives retain every committed entry, and recovered event prefixes start with the first event.
//! This retention requirement does not strengthen the backend's durability guarantees.
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

use crate::snapshot::{Snapshot, SnapshotPosition};
use crate::{ClassifiedError, Durability, Event, EventPosition};

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
/// Components and dependent streams share ownership or locks for the resources they use.
/// Dropping the component set does not release ownership still needed by a dependent stream.
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
/// prefix. Creation and opening must also fail while another valid exclusive writable opening for
/// the same document remains owned by components or dependent streams and handles.
///
/// An outage, failover, or another backend-defined invalidating event may require a new opening.
/// Before granting a replacement opening, the backend must prevent the invalidated opening from
/// committing further writes, even if its Rust values remain live.
/// Streams are not required to survive such invalidation; callers must reopen and recreate them.
/// A backend may preserve an independent read stream when doing so preserves ordering and recovery
/// guarantees, without requiring it to retain exclusive writer ownership.
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
    /// The implementation must reject the operation while another valid writable opening remains owned.
    /// Ownership is released when all components, clones, streams, and availability handles that
    /// retain it have been dropped, or when the backend safely invalidates the opening as described
    /// by [`SeaStorage`].
    /// Independent streams and availability handles need not retain writer ownership;
    /// the backend must document which do.
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
    /// Event boundary represented by the snapshot.
    pub at_event: ViewSnapshotPosition<EH>,
    /// Complete materialized state tree.
    pub root: BH,
}

/// Starting-point policy for snapshot selection and event replay in [`SeaView::load`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LoadStart {
    /// Skips snapshots and replays events from the beginning of the archive.
    Beginning,
    /// Selects the newest snapshot at or before this exclusive event cursor.
    ///
    /// Falls back to the beginning when no compatible snapshot exists.
    /// The event stream's initial progress cursor is `None` or at most this position,
    /// so no event after this position is omitted.
    /// Replay may include earlier events as well.
    IncludeAllAfter(EventPosition),
    /// Selects the newest snapshot, if one exists.
    ///
    /// Falls back to the beginning when no compatible snapshot exists.
    LatestSnapshot,
}

/// A snapshot selection and live event stream returned by [`SeaView::load`].
pub struct ViewLoad<E> {
    /// Newest compatible snapshot, when one exists.
    pub snapshot: Option<Snapshot>,
    /// Monitored events strictly after the selected snapshot, or from the beginning without one.
    ///
    /// The stream catches up and then waits for new events, even for an initially empty archive.
    /// Dropping the stream cancels its read or subscription work.
    pub events: EventArchiveStream<E>,
}

/// Exclusive concrete reader/writer view of one snapshotted event archive.
///
/// The view is intentionally not `Clone`, preserving the exclusive writable authority established
/// by [`SeaStorage`]. Its methods take shared references so independent operations, such as blob
/// persistence, may overlap. Each component implementation linearizes its own mutations, while
/// composed methods establish dependency order by awaiting availability before publishing an owner
/// record.
///
/// Through its components, the view owns or locks its resources and shares the necessary ownership
/// with streams returned by [`Self::read`] and [`Self::load`].
/// Dropping the view alone does not invalidate those streams or release ownership they still need.
/// Streams need not survive events that invalidate the opening, such as an outage or failover;
/// callers must recreate the view and streams in that case.
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

    /// Borrows the blob store for content access and availability-handle resolution.
    ///
    /// The view retains ownership of the component.
    /// Event and snapshot publication still go through the view's availability checks.
    #[must_use]
    pub const fn blobs(&self) -> &B {
        &self.blobs
    }

    /// Resolves an event position to availability evidence suitable for snapshot publication.
    pub async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<E::Handle>, B::Error> {
        self.events.resolve(position).await
    }

    /// Appends an event after establishing availability of its optional content tree.
    ///
    /// This method does not retry the append or deduplicate equal events.
    /// After an ambiguous result, applications can reconcile a bounded event range before deciding
    /// whether to resubmit; see [`EventArchive`] for identity and ordering requirements.
    /// Dropping this future does not imply rollback or settlement; see [`Archive::append`].
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
    /// For bounds within the committed history, `stop_after: Some(position)` produces a finite stream.
    /// `stop_after: None` catches up and waits for newly committed events.
    /// Empty ranges, implementation-defined future bounds, lazy errors, and stream resource
    /// ownership follow [`Archive::read`].
    pub fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> EventArchiveStream<B::Error> {
        self.events.read(after, stop_after)
    }

    /// Returns the latest committed event position.
    ///
    /// A successful result bounds appends that returned before this operation began, including
    /// ambiguous results, as specified by [`Archive::head`].
    /// It does not by itself settle cancelled calls or requests still in flight upstream.
    pub async fn head(&self) -> Result<Option<EventPosition>, B::Error> {
        self.events.head().await
    }

    /// Returns the latest snapshot.
    pub async fn get_latest_snapshot(&self) -> Result<Option<Snapshot>, B::Error> {
        let Some(position) = self.snapshots.head().await? else {
            return Ok(None);
        };
        self.snapshots.get_snapshot_at(position).await
    }

    /// Publishes a snapshot after establishing both referenced dependencies.
    pub async fn publish_snapshot(
        &self,
        publication: ViewSnapshotPublication<B::Handle, E::Handle>,
    ) -> Result<Snapshot, B::Error> {
        self.blobs.ensure_available(&publication.root).await?;
        let at_event = match &publication.at_event {
            ViewSnapshotPosition::Initial => SnapshotPosition::Initial,
            ViewSnapshotPosition::At(event) => {
                self.events.ensure_available(event).await?;
                SnapshotPosition::At(event.id())
            }
        };
        self.snapshots
            .append(Snapshot {
                at_event,
                root: publication.root.id(),
            })
            .await
    }

    /// Selects a compatible snapshot and starts a live event stream in one operation.
    ///
    /// This combines snapshot selection and streaming startup so callers need no extra round trip
    /// to start reading after the selected snapshot.
    /// `start` determines the latest acceptable snapshot boundary.
    /// An initial snapshot starts event replay at the beginning, as does having no snapshot.
    /// `LoadStart::Beginning` skips snapshot lookup entirely.
    ///
    /// The stream catches up and then waits for new events, even when the archive is initially empty.
    /// Callers can drop it when done or use [`Self::read`] separately for bounded reads.
    /// This method does not capture an event head or an atomic snapshot-and-event read.
    /// Snapshot lookup failures are returned here; event initialization and runtime failures are
    /// yielded by the stream, and dropping the stream cancels its read or subscription work.
    pub async fn load(&self, start: LoadStart) -> Result<ViewLoad<B::Error>, B::Error> {
        let snapshot = match start {
            LoadStart::Beginning => None,
            LoadStart::IncludeAllAfter(position) => {
                self.snapshots.get_snapshot_at_or_before(position).await?
            }
            LoadStart::LatestSnapshot => self.get_latest_snapshot().await?,
        };
        let after = snapshot.as_ref().and_then(|value| match value.at_event {
            SnapshotPosition::Initial => None,
            SnapshotPosition::At(position) => Some(position),
        });
        let events = self.events.read(after, None);
        Ok(ViewLoad { snapshot, events })
    }
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
