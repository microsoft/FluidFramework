//! Executable prototype of decomposed Sea storage contracts.
//!
//! This module captures a proposed replacement for the current monolithic storage API. It is
//! hidden from generated documentation while the contracts are evaluated and does not yet replace
//! existing traits.
//!
//! The architecture has four layers:
//!
//! 1. [`BlobStore`], [`EventArchive`], and [`SnapshotArchive`] are independently useful storage
//!    components. Blob and event storage share [`ReferenceableStore`] because their identities are
//!    persisted by another component; snapshots currently require no such external capability.
//! 2. [`SeaStorage`] creates and reopens one instance of each component for a [`DocumentId`]. Its
//!    contract supplies cross-component publication and recovery guarantees without requiring a
//!    distributed transaction.
//! 3. [`SeaView`] exclusively composes one component of each kind into the reader/writer view of a
//!    document. Availability-bearing handles enforce the order in which references are published.
//! 4. [`SeaCollection`] assigns document identities, controls exclusive open ownership, and builds
//!    views. A sequencer can own one view and multiplex it into concurrent client sessions.
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
mod referenceable_store;
mod snapshot_archive;

use async_trait::async_trait;
use bytes::Bytes;
use tokio::sync::Mutex;

use crate::snapshot::{Snapshot, SnapshotPosition};
use crate::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, Durability, Event,
    EventPosition, OperationId, PublishedSnapshot, SnapshotId, SnapshotPublication,
    StorageEventStream, StorageLoad,
};

pub use blob_store::BlobStore;
pub use event_archive::EventArchive;
pub use referenceable_store::{ReferenceableStore, StorageHandle};
pub use snapshot_archive::SnapshotArchive;

/// Stable identity assigned to one Sea document.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct DocumentId(Bytes);

impl DocumentId {
    /// Wraps collection-defined identity bytes.
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
#[derive(Debug)]
pub struct StorageComponents<B, E, S> {
    /// Content-addressed blob store for this document.
    pub blobs: B,
    /// Ordered event archive for this document.
    pub events: E,
    /// Snapshot publication archive for this document.
    pub snapshots: S,
}

/// Factory for the storage components of Sea documents.
///
/// Each document has exactly one blob store, event archive, and snapshot archive, all addressed by
/// the same [`DocumentId`]. The component traits remain independently useful, but this factory does
/// not expose alternate sharing or layout policies.
///
/// All components advertise the factory's durability. More importantly,
/// [`SeaStorage::open_document`] returns them only after enforcing this module's publication and
/// recovery law. An implementation must fail opening rather than return components containing an
/// event gap, an unavailable referenced blob tree, or a snapshot outside the recovered event
/// prefix.
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

    /// Persistence class advertised by every component created by this factory.
    fn durability(&self) -> Durability;

    /// Creates the three empty components for a newly assigned document identity.
    async fn create_document(
        &self,
        id: &DocumentId,
    ) -> Result<StorageComponents<Self::Blobs, Self::Events, Self::Snapshots>, Self::Error>;

    /// Opens and recovers a document, or returns `None` when its identity is unknown.
    async fn open_document(
        &self,
        id: &DocumentId,
    ) -> Result<Option<StorageComponents<Self::Blobs, Self::Events, Self::Snapshots>>, Self::Error>;
}

/// Exclusive-open authority retained for the lifetime of a [`SeaView`].
///
/// Most implementations need only an in-process registry entry or an operating-system file lock.
/// Persistent fencing is required only when stale owners could otherwise continue writing after
/// ownership transfer.
pub trait ViewLease: Send + 'static {}

impl<T> ViewLease for T where T: Send + 'static {}

/// Document identity allocation and exclusive-open policy used by [`SeaCollection`].
///
/// The catalog does not map documents to component identities. It allocates one identity for all
/// three components and retains only the ownership state needed to prevent concurrent views.
#[async_trait]
pub trait DocumentCatalog: Send + Sync {
    /// Classified catalog error.
    type Error: ClassifiedError;

    /// Exclusive ownership retained by an open view.
    type Lease: ViewLease;

    /// Assigns a fresh document identity and acquires its first exclusive lease.
    async fn create(&self) -> Result<(DocumentId, Self::Lease), Self::Error>;

    /// Acquires exclusive ownership for an identity, failing if it is already open.
    ///
    /// Document existence is determined by [`SeaStorage::open_document`].
    async fn open(&self, id: &DocumentId) -> Result<Self::Lease, Self::Error>;
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

/// Exclusive concrete reader/writer view of one snapshotted event archive.
///
/// The view is intentionally not `Clone`. Its internal async mutex serializes component access and
/// remains held across validation and owner-record publication. Consequently an append, snapshot
/// publication, or load cannot interleave with another operation through the same view after an
/// awaited component call yields.
pub struct SeaView<B, E, S, L>
where
    B: BlobStore,
    E: EventArchive<Error = B::Error>,
    S: SnapshotArchive<Error = B::Error>,
    L: ViewLease,
{
    state: Mutex<ViewState<B, E, S>>,
    _lease: L,
}

struct ViewState<B, E, S> {
    blobs: B,
    events: E,
    snapshots: S,
}

impl<B, E, S, L> SeaView<B, E, S, L>
where
    B: BlobStore,
    E: EventArchive<Error = B::Error>,
    S: SnapshotArchive<Error = B::Error>,
    L: ViewLease,
{
    fn new(components: StorageComponents<B, E, S>, lease: L) -> Self {
        Self {
            state: Mutex::new(ViewState {
                blobs: components.blobs,
                events: components.events,
                snapshots: components.snapshots,
            }),
            _lease: lease,
        }
    }

    /// Publishes or deduplicates one blob and returns its availability capability.
    pub async fn put_blob(&self, payload: Bytes) -> Result<B::Handle, B::Error> {
        self.state.lock().await.blobs.put_blob(payload).await
    }

    /// Publishes or deduplicates one complete directory tree.
    pub async fn put_directory(&self, directory: BlobDirectory) -> Result<B::Handle, B::Error> {
        self.state.lock().await.blobs.put_directory(directory).await
    }

    /// Fetches one immutable blob.
    pub async fn get_blob(&self, id: BlobId) -> Result<Bytes, B::Error> {
        self.state.lock().await.blobs.get_blob(id).await
    }

    /// Fetches one immutable directory.
    pub async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, B::Error> {
        self.state.lock().await.blobs.get_directory(id).await
    }

    /// Resolves a tree identity to availability evidence suitable for later publication.
    pub async fn resolve_tree(&self, id: BlobTreeId) -> Result<Option<B::Handle>, B::Error> {
        self.state.lock().await.blobs.resolve(id).await
    }

    /// Resolves an event position to availability evidence suitable for snapshot publication.
    pub async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<E::Handle>, B::Error> {
        self.state.lock().await.events.resolve(position).await
    }

    /// Appends an event after establishing availability of its optional content tree.
    pub async fn append(
        &self,
        payload: Bytes,
        tree: Option<&B::Handle>,
    ) -> Result<E::Handle, B::Error> {
        let state = self.state.lock().await;
        if let Some(handle) = tree {
            state.blobs.ensure_available(handle).await?;
        }
        state
            .events
            .append(Event {
                payload,
                blob_tree: tree.map(StorageHandle::id),
            })
            .await
    }

    /// Reads a finite ordered event range.
    pub async fn read(
        &self,
        after: Option<EventPosition>,
        through: Option<EventPosition>,
    ) -> Result<StorageEventStream<B::Error>, B::Error> {
        self.state.lock().await.events.read(after, through).await
    }

    /// Returns the latest committed event position.
    pub async fn head(&self) -> Result<Option<EventPosition>, B::Error> {
        self.state.lock().await.events.head().await
    }

    /// Returns one retained snapshot by identity.
    pub async fn snapshot(&self, id: &SnapshotId) -> Result<Option<PublishedSnapshot>, B::Error> {
        self.state.lock().await.snapshots.snapshot(id).await
    }

    /// Returns the latest retained snapshot.
    pub async fn latest_snapshot(&self) -> Result<Option<PublishedSnapshot>, B::Error> {
        self.state.lock().await.snapshots.latest_snapshot().await
    }

    /// Publishes a snapshot after establishing both referenced dependencies.
    pub async fn publish_snapshot(
        &self,
        publication: ViewSnapshotPublication<B::Handle, E::Handle>,
    ) -> Result<PublishedSnapshot, B::Error> {
        let state = self.state.lock().await;
        state.blobs.ensure_available(&publication.root).await?;
        let at_event = match &publication.at_event {
            ViewSnapshotPosition::Initial => SnapshotPosition::Initial,
            ViewSnapshotPosition::At(event) => {
                state.events.ensure_available(event).await?;
                SnapshotPosition::At(event.id())
            }
        };
        state
            .snapshots
            .publish_snapshot(SnapshotPublication {
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
        self.state
            .lock()
            .await
            .snapshots
            .resolve_snapshot_publication(operation_id)
            .await
    }

    /// Selects a compatible snapshot and captures a finite catch-up boundary.
    ///
    /// Exclusive mutable ownership prevents an append through this view while the snapshot and
    /// head are selected. Implementations that permit external writers must provide equivalent
    /// serialization beneath the component contracts.
    pub async fn load(
        &self,
        required: Option<EventPosition>,
    ) -> Result<StorageLoad<B::Error>, B::Error> {
        let state = self.state.lock().await;
        let snapshot = match required {
            Some(position) => state.snapshots.snapshot_at_or_before(position).await?,
            None => state.snapshots.latest_snapshot().await?,
        };
        let head = state.events.head().await?;
        let after = snapshot
            .as_ref()
            .and_then(|value| match value.snapshot.at_event {
                SnapshotPosition::Initial => None,
                SnapshotPosition::At(position) => Some(position),
            });
        let events = state.events.read(after, head).await?;
        Ok(StorageLoad {
            snapshot,
            head,
            events,
        })
    }
}

/// Document collection that composes storage components into exclusively owned views.
pub struct SeaCollection<S, C> {
    storage: S,
    catalog: C,
}

impl<S, C> SeaCollection<S, C> {
    /// Creates a collection from component storage and document catalog policy.
    #[must_use]
    pub const fn new(storage: S, catalog: C) -> Self {
        Self { storage, catalog }
    }

    /// Returns the underlying component factory for advanced sharing policies.
    #[must_use]
    pub const fn storage(&self) -> &S {
        &self.storage
    }
}

/// Failure while constructing or opening a document view.
#[derive(Debug)]
pub enum CollectionError<SE, CE> {
    /// Component creation or opening failed.
    Storage(SE),
    /// Document identity resolution or exclusive ownership failed.
    Catalog(CE),
}

impl<S, C> SeaCollection<S, C>
where
    S: SeaStorage,
    C: DocumentCatalog,
{
    /// Assigns an identity and creates one empty component of each kind for a document.
    ///
    /// If component creation fails after identity allocation, dropping the returned lease releases
    /// exclusive ownership. Backends may retain partial empty state for later cleanup or retry.
    pub async fn create(
        &self,
    ) -> Result<
        (
            DocumentId,
            SeaView<S::Blobs, S::Events, S::Snapshots, C::Lease>,
        ),
        CollectionError<S::Error, C::Error>,
    > {
        let (id, lease) = self
            .catalog
            .create()
            .await
            .map_err(CollectionError::Catalog)?;
        let components = self
            .storage
            .create_document(&id)
            .await
            .map_err(CollectionError::Storage)?;
        Ok((id, SeaView::new(components, lease)))
    }

    /// Opens an existing document with exclusive writer ownership.
    pub async fn open(
        &self,
        id: &DocumentId,
    ) -> Result<
        Option<SeaView<S::Blobs, S::Events, S::Snapshots, C::Lease>>,
        CollectionError<S::Error, C::Error>,
    > {
        let lease = self
            .catalog
            .open(id)
            .await
            .map_err(CollectionError::Catalog)?;
        let Some(components) = self
            .storage
            .open_document(id)
            .await
            .map_err(CollectionError::Storage)?
        else {
            return Ok(None);
        };
        Ok(Some(SeaView::new(components, lease)))
    }
}
