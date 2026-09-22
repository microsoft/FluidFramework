//! Document storage contracts built from independently usable components and exclusive views.
//!
//! The storage architecture has three layers:
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
//!
//! [`SeaStorage::create_view`] and [`SeaStorage::open_view`] compose document views directly.
//! A sequencer can own one view and multiplex it into concurrent client sessions.
//! Lazy document allocation, active sequencer ownership, and session lifecycle policy belong to
//! higher-level runtime management, not this storage API.
//!
//! # Publication and recovery law
//!
//! Component writes are ordered dependencies: complete blob trees precede events that reference
//! them, and those events precede snapshots that reference their positions. After reopening or
//! recovery, a storage implementation exposes only a self-consistent event prefix and snapshots
//! closed over that prefix. Every blob tree referenced by an exposed event or snapshot is
//! available and valid.
//! Every snapshot position identifies an event in the exposed prefix.
//! Corruption within the required prefix fails recovery rather than producing a gap.
//!
//! These storage contracts do not support event or snapshot pruning.
//! Archives retain every committed entry, and recovered event prefixes start with the first event.
//! This retention requirement does not strengthen the backend's durability guarantees.
//!
//! This law is distinct from [`crate::Durability`]. Durability remains descriptive metadata about
//! memory, orderly storage, or crash-resistant persistence and is not a runtime policy mechanism.
//! Buffered acknowledgment may precede operating-system writes.
//! Use [`SeaStorage::flush`] before orderly reopening and [`SeaStorage::shutdown`] before stopping
//! a persistence runtime; dropping components is not an asynchronous persistence barrier.
//! A buffered crash or background write failure may lose acknowledged history or make opening fail.

mod blob_store;
mod checkpoint;
mod event_archive;
mod ordered_archive;
mod referenceable_store;
mod snapshot_archive;
mod storage_surface;

use async_trait::async_trait;
use bytes::Bytes;

use crate::{ClassifiedError, Durability, Event, EventPosition};

pub use blob_store::BlobStore;
pub use checkpoint::CheckpointStore;
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
pub struct StorageComponents<Blobs: StorageSurface, Events, Snapshots> {
    /// Content-addressed blob store for this document.
    pub blobs: Blobs,
    /// Ordered event archive for this document.
    pub events: Events,
    /// Snapshot publication archive for this document.
    pub snapshots: Snapshots,
    /// Internal state owned by the document opening, independent of application snapshots.
    pub checkpoints: Box<dyn CheckpointStore<Error = Blobs::Error>>,
}

/// A newly created document identity and its open storage components.
#[derive(Debug)]
pub struct CreatedDocument<Blobs: StorageSurface, Events, Snapshots> {
    /// Stable identity allocated according to backend requirements.
    pub id: DocumentId,
    /// Empty storage components created for the identity.
    pub components: StorageComponents<Blobs, Events, Snapshots>,
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
/// Before granting a new opening, the backend must prevent the invalidated opening from
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
    type Snapshots: SnapshotArchive<
            Error = Self::Error,
            BlobHandle = <Self::Blobs as ReferenceableStore>::Handle,
            EventHandle = <Self::Events as ReferenceableStore>::Handle,
        >;

    /// Persistence class of documents created by this backend.
    fn durability(&self) -> Durability;

    /// Waits for mutations accepted before this call to reach the backend's persistence boundary.
    ///
    /// Buffered persistence means completed operating-system writes, not synchronization.
    /// Call this before dropping the last opening when an orderly reopen must retain its history.
    /// Cancellation does not stop accepted writes or establish completion.
    async fn flush(&self) -> Result<(), Self::Error> {
        Ok(())
    }

    /// Completes backend-specific orderly shutdown and reports unwritten accepted work.
    ///
    /// Persistent backends stop admission before draining their accepted mutations.
    /// The default suits backends without asynchronous persistence or owned workers.
    async fn shutdown(&self) -> Result<(), Self::Error> {
        self.flush().await
    }

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

    /// Creates a backend-identified document and its exclusive writable view.
    async fn create_view(
        &self,
    ) -> Result<
        (
            DocumentId,
            SeaView<Self::Blobs, Self::Events, Self::Snapshots>,
        ),
        Self::Error,
    > {
        let created = self.create_document().await?;
        Ok((created.id, SeaView::new(created.components)))
    }

    /// Opens an existing document with exclusive writer ownership, or returns `None` if unknown.
    async fn open_view(
        &self,
        id: &DocumentId,
    ) -> Result<Option<SeaView<Self::Blobs, Self::Events, Self::Snapshots>>, Self::Error> {
        let Some(components) = self.open_document(id).await? else {
            return Ok(None);
        };
        Ok(Some(SeaView::new(components)))
    }
}

/// Materialized state through a committed event, with availability evidence for both dependencies.
///
/// The same value is used for snapshot lookup, loading, and publication.
/// Every snapshot references a committed event; the initial empty state needs no snapshot.
/// An archive may also contain events without any snapshot having been published.
#[derive(Clone, Debug)]
pub struct Snapshot<BlobHandle, EventHandle> {
    /// Complete materialized state tree's availability handle.
    pub root: BlobHandle,
    /// Availability handle for the latest event reflected in the state.
    pub at_event: EventHandle,
}

/// Starting-point policy shared by [`SeaView::get_snapshot`] and [`SeaView::load`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LoadStart {
    /// Selects no snapshot, so loading replays events from the beginning of the archive.
    Beginning,
    /// Selects the newest snapshot at or before this exclusive event cursor.
    ///
    /// Selects no snapshot when no compatible snapshot exists.
    /// Loading then streams every event after the selected snapshot, or from the beginning without one.
    /// The stream's initial progress cursor is `None` or at most this position,
    /// so every event after this cursor is replayed, possibly along with earlier events.
    ReplayAtLeastAllAfter(EventPosition),
    /// Selects the newest snapshot, if one exists.
    ///
    /// Selects no snapshot when none exists, so loading starts at the beginning.
    LatestSnapshot,
}

/// A snapshot selection and live event stream returned by [`SeaView::load`].
pub struct ViewLoad<BlobHandle, EventHandle, Error> {
    /// Newest compatible snapshot, when one exists.
    pub snapshot: Option<Snapshot<BlobHandle, EventHandle>>,
    /// Monitored events strictly after the selected snapshot, or from the beginning without one.
    ///
    /// The stream catches up and then waits for new events, even for an initially empty archive.
    /// Dropping the stream cancels its read or subscription work.
    pub events: EventArchiveStream<Error>,
}

/// Exclusive concrete reader/writer view of one snapshotted event archive.
///
/// The view is intentionally not `Clone`; the backend enforces the exclusive writable authority
/// established by [`SeaStorage`], including when the view is shared through an `Arc`.
/// Its methods take shared references so independent operations, such as blob persistence, may overlap.
/// Each component implementation linearizes its own mutations, while
/// composed methods establish dependency order by awaiting availability before publishing an owner
/// record.
///
/// Through its components, the view owns or locks its resources and shares the necessary ownership
/// with streams returned by [`Self::read`] and [`Self::load`].
/// Dropping the view alone does not invalidate those streams or release ownership they still need.
/// Streams need not survive events that invalidate the opening, such as an outage or failover;
/// callers must recreate the view and streams in that case.
pub struct SeaView<Blobs, Events, Snapshots>
where
    Blobs: BlobStore,
    Events: EventArchive<Error = Blobs::Error>,
    Snapshots: SnapshotArchive<
            Error = Blobs::Error,
            BlobHandle = Blobs::Handle,
            EventHandle = Events::Handle,
        >,
{
    blobs: Blobs,
    events: Events,
    snapshots: Snapshots,
    checkpoints: Box<dyn CheckpointStore<Error = Blobs::Error>>,
}

impl<Blobs, Events, Snapshots> SeaView<Blobs, Events, Snapshots>
where
    Blobs: BlobStore,
    Events: EventArchive<Error = Blobs::Error>,
    Snapshots: SnapshotArchive<
            Error = Blobs::Error,
            BlobHandle = Blobs::Handle,
            EventHandle = Events::Handle,
        >,
{
    /// Composes the components of one exclusive document opening.
    fn new(components: StorageComponents<Blobs, Events, Snapshots>) -> Self {
        Self {
            blobs: components.blobs,
            events: components.events,
            snapshots: components.snapshots,
            checkpoints: components.checkpoints,
        }
    }

    /// Borrows the blob store for content access and availability-handle resolution.
    ///
    /// The view retains ownership of the component.
    /// Event and snapshot publication still go through the view's availability checks.
    #[must_use]
    pub const fn blobs(&self) -> &Blobs {
        &self.blobs
    }

    /// Loads independently published internal recovery state.
    ///
    /// # Errors
    /// Returns storage failures, including an invalidated exclusive opening.
    pub async fn checkpoint(&self) -> Result<Option<Bytes>, Blobs::Error> {
        self.checkpoints.checkpoint().await
    }

    /// Atomically publishes internal recovery state without changing application snapshots.
    ///
    /// # Errors
    /// Returns publication failures; ambiguous outcomes require reopening before mutation.
    pub async fn publish_checkpoint(&self, checkpoint: Bytes) -> Result<(), Blobs::Error> {
        self.checkpoints.publish_checkpoint(checkpoint).await
    }

    /// Resolves an event position to availability evidence suitable for snapshot publication.
    ///
    /// # Errors
    /// Returns the event archive's resolution error; a missing position returns `None`.
    pub async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<Events::Handle>, Blobs::Error> {
        self.events.resolve(position).await
    }

    /// Appends an event after establishing availability of its optional content tree.
    ///
    /// This method does not retry the append or deduplicate equal events.
    /// After an ambiguous result, applications can reconcile a bounded event range before deciding
    /// whether to resubmit; see [`EventArchive`] for identity and ordering requirements.
    /// Dropping this future does not imply rollback or settlement; see [`Archive::append`].
    ///
    /// # Errors
    /// Propagates tree availability failures and event append errors, including ambiguous outcomes.
    pub async fn append(
        &self,
        payload: Bytes,
        tree: Option<&Blobs::Handle>,
    ) -> Result<Events::Handle, Blobs::Error> {
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

    /// Appends a dependency-checked prefix using the archive's batch settlement contract.
    ///
    /// Each input carries its optional tree capability. A dependency failure still publishes
    /// the checked prefix; its error is returned only if every preceding append succeeds.
    /// Missing results are unattempted inputs. Cancellation follows [`Archive::append_batch`].
    pub async fn append_batch(
        &self,
        values: Vec<(Bytes, Option<Blobs::Handle>)>,
    ) -> Vec<Result<Events::Handle, Blobs::Error>> {
        let mut events = Vec::with_capacity(values.len());
        let mut dependency_error = None;
        for (payload, tree) in values {
            if let Some(handle) = &tree
                && let Err(error) = self.blobs.ensure_available(handle).await
            {
                dependency_error = Some(error);
                break;
            }
            events.push(Event {
                payload,
                blob_tree: tree.as_ref().map(StorageHandle::id),
            });
        }
        let checked = events.len();
        let mut results = self.events.append_batch(events).await;
        if results.len() == checked
            && results.iter().all(Result::is_ok)
            && let Some(error) = dependency_error
        {
            results.push(Err(error));
        }
        results
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
    ) -> EventArchiveStream<Blobs::Error> {
        self.events.read(after, stop_after)
    }

    /// Returns the latest committed event position.
    ///
    /// A successful result bounds appends that returned before this operation began, including
    /// ambiguous results, as specified by [`Archive::head`].
    /// It does not by itself settle cancelled calls or requests still in flight upstream.
    ///
    /// # Errors
    /// Returns the event archive's error when an authoritative head cannot be established.
    pub async fn head(&self) -> Result<Option<EventPosition>, Blobs::Error> {
        self.events.head().await
    }

    /// Selects a snapshot using `start`, with handles compatible with this view's stores.
    ///
    /// [`LoadStart::Beginning`] returns `None` without a snapshot lookup.
    /// [`LoadStart::ReplayAtLeastAllAfter`] selects the newest snapshot at or before the supplied position,
    /// including an exact match when available; [`LoadStart::LatestSnapshot`] selects the newest snapshot.
    /// Both return `None` when no qualifying snapshot exists, even if the archive contains events.
    ///
    /// To reconstruct state through a target position, select with `ReplayAtLeastAllAfter(target)` and use
    /// [`Self::read`] from the returned snapshot's event position (or `None`) through `Some(target)`.
    /// For exact-publication reconciliation, compare the returned event handle's identity with the
    /// requested position: an older snapshot or `None` means no publication at that position was observed.
    ///
    /// # Errors
    /// Propagates snapshot archive lookup failures, except when `Beginning` skips lookup.
    pub async fn get_snapshot(
        &self,
        start: LoadStart,
    ) -> Result<Option<Snapshot<Blobs::Handle, Events::Handle>>, Blobs::Error> {
        match start {
            LoadStart::Beginning => Ok(None),
            LoadStart::ReplayAtLeastAllAfter(position) => {
                self.snapshots.latest_at_or_before(Some(position)).await
            }
            LoadStart::LatestSnapshot => self.snapshots.latest_at_or_before(None).await,
        }
    }

    /// Publishes a snapshot after establishing both referenced dependencies.
    ///
    /// The snapshot's root is the complete materialized state through its referenced event.
    /// The initial empty state is not created through publication; every published snapshot requires
    /// an event handle.
    /// Success acknowledges publication; the supplied handles already identify the snapshot.
    ///
    /// # Errors
    /// Propagates dependency availability failures and snapshot append errors, including rejected
    /// ordering, conflicting roots, and ambiguous publication outcomes.
    pub async fn publish_snapshot(
        &self,
        snapshot: &Snapshot<Blobs::Handle, Events::Handle>,
    ) -> Result<(), Blobs::Error> {
        self.blobs.ensure_available(&snapshot.root).await?;
        self.events.ensure_available(&snapshot.at_event).await?;
        self.snapshots.append(snapshot.clone()).await
    }

    /// Selects a compatible snapshot and starts a live event stream in one operation.
    ///
    /// This is the combined fast path for [`Self::get_snapshot`] followed by [`Self::read`],
    /// avoiding an extra caller round trip to start reading after the selected snapshot.
    /// The read cursor is the snapshot's event position, or `None` when no snapshot is selected;
    /// its `stop_after` is `None`, so the stream catches up and then waits for new events.
    /// Selection semantics follow [`Self::get_snapshot`]; stream behavior and cancellation follow [`Self::read`].
    /// This method does not capture an event head or an atomic snapshot-and-event read.
    /// Snapshot lookup failures are returned here; event initialization and runtime failures are
    /// yielded by the stream.
    ///
    /// # Errors
    /// Returns snapshot selection errors from [`Self::get_snapshot`].
    pub async fn load(
        &self,
        start: LoadStart,
    ) -> Result<ViewLoad<Blobs::Handle, Events::Handle, Blobs::Error>, Blobs::Error> {
        let snapshot = self.get_snapshot(start).await?;
        let after = snapshot.as_ref().map(|value| value.at_event.id());
        let events = self.read(after, None);
        Ok(ViewLoad { snapshot, events })
    }
}
