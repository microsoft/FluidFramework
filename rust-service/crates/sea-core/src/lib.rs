#![doc = include_str!("../README.md")]

use std::{error::Error, pin::Pin};

use async_trait::async_trait;
use bytes::Bytes;
use futures_core::Stream;

pub mod archive;
pub mod blob;
pub mod monitored_stream;
#[doc(hidden)]
pub mod next;
pub mod snapshot;

pub use archive::{
    AuthorId, CommittedEvent, Event, EventPosition, OperationId, SeaArchive, SessionCommittedEvent,
    SessionId, SessionStream, ValueError,
};
pub use blob::{BlobDirectory, BlobDirectoryId, BlobId, BlobTreeError, BlobTreeId};
pub use monitored_stream::{
    BoxMonitoredStream, MonitoredStream, MonitoredStreamItem, MonitoredStreamProgress,
    MonitoredStreamStatus, boxed_monitored_stream, map_monitored_stream,
};
pub use snapshot::{
    PublishedSnapshot, SnapshotCoordination, SnapshotId, SnapshotParticipation, SnapshotPublication,
};

/// A monitored stream of ordered archive events.
pub type ArchiveEventStream<E> = BoxMonitoredStream<SessionCommittedEvent, EventPosition, E>;

/// A monitored snapshot load followed by ordered archive events.
pub type ArchiveLoadStream<E> = BoxMonitoredStream<LoadEvent, EventPosition, E>;

/// Receipt proving one event became visible at the reported durability.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventReceipt {
    /// Stable position assigned to the event.
    pub position: EventPosition,
    /// Persistence completed before acknowledgement.
    pub durability: Durability,
}

/// A storage load selected atomically with a finite catch-up head.
pub struct StorageLoad<E> {
    /// Newest compatible retained snapshot, when one exists.
    pub snapshot: Option<PublishedSnapshot>,
    /// Head captured with snapshot selection, or `None` for an empty archive.
    pub head: Option<EventPosition>,
    /// Events after the selected snapshot through `head`, in position order.
    pub events: StorageEventStream<E>,
}

/// A finite storage event stream.
pub type StorageEventStream<E> =
    Pin<Box<dyn Stream<Item = Result<CommittedEvent, E>> + Send + 'static>>;

#[cfg(not(target_arch = "wasm32"))]
/// Thread-safety required from native session implementations.
pub trait SessionBounds: Send + Sync {}

#[cfg(not(target_arch = "wasm32"))]
impl<T: Send + Sync> SessionBounds for T {}

#[cfg(target_arch = "wasm32")]
/// Marker allowing browser sessions to remain single-threaded.
pub trait SessionBounds {}

#[cfg(target_arch = "wasm32")]
impl<T> SessionBounds for T {}

/// Common classified error associated with one Sea service surface.
pub trait SeaService: SessionBounds {
    /// Classified service error.
    type Error: ClassifiedError;
}

/// Snapshotted Event Archive (Sea)
///
/// TODO:
/// This trait should be mostly concrete implementations built on top an `EventArchive`, Blob storage and snapshot archive.
/// In fact it might become entirely concrete, and stop being a trait and instead be a generic (or even non generic) struct.
/// As part of this we need to define the types which compose to create this.
#[async_trait]
pub trait SeaStorage: Send + Sync {
    /// Classified backend error.
    type Error: ClassifiedError;

    /// Durability established before this backend acknowledges an owner record.
    fn durability(&self) -> Durability;

    /// Publishes or deduplicates one immutable blob.
    async fn put_blob(&self, payload: Bytes) -> Result<BlobId, Self::Error>;

    /// Fetches and verifies one immutable blob.
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error>;

    /// Publishes or deduplicates one validated immutable directory.
    async fn put_directory(&self, directory: BlobDirectory)
    -> Result<BlobDirectoryId, Self::Error>;

    /// Fetches and verifies one immutable directory.
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error>;

    /// Atomically validates an event's optional tree and commits both event and reference.
    async fn append(&self, event: Event) -> Result<EventReceipt, Self::Error>;

    /// Reads committed application events strictly after `after` through `through`.
    async fn read(
        &self,
        after: Option<EventPosition>,
        through: Option<EventPosition>,
    ) -> Result<StorageEventStream<Self::Error>, Self::Error>;

    /// Returns the latest committed application-event position.
    async fn head(&self) -> Result<Option<EventPosition>, Self::Error>;

    /// Returns one retained snapshot by publication identity.
    async fn snapshot(&self, id: &SnapshotId) -> Result<Option<PublishedSnapshot>, Self::Error>;

    /// Returns the latest retained snapshot.
    async fn latest_snapshot(&self) -> Result<Option<PublishedSnapshot>, Self::Error>;

    /// Returns the newest retained snapshot at or before `position`.
    async fn snapshot_at_or_before(
        &self,
        position: EventPosition,
    ) -> Result<Option<PublishedSnapshot>, Self::Error>;

    /// Atomically validates the root and conditionally publishes one snapshot.
    async fn publish_snapshot(
        &self,
        publication: SnapshotPublication,
    ) -> Result<PublishedSnapshot, Self::Error>;

    /// Resolves a prior snapshot publication by its stable operation identity.
    async fn resolve_snapshot_publication(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<PublishedSnapshot>, Self::Error>;

    /// Selects a compatible snapshot and captures a finite catch-up stream atomically.
    async fn load(
        &self,
        required: Option<EventPosition>,
    ) -> Result<StorageLoad<Self::Error>, Self::Error>;
}

/// One item delivered by a gap-free session load.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LoadEvent {
    /// Snapshot selected for this load, when retained state is available.
    Snapshot(PublishedSnapshot),
    /// One subsequent committed event.
    Event(SessionCommittedEvent),
}

/// A stable event submission through an individual session.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventSubmission {
    /// Stable identity reused for retries and ambiguity resolution.
    pub operation_id: OperationId,
    /// Latest event incorporated by the author's local state.
    pub reference: Option<EventPosition>,
    /// Opaque event and optional content root.
    pub event: Event,
}

/// Gap-free snapshot, catch-up, and live event delivery.
///
/// Each returned stream owns its cursor and subscription.
/// Dropping the stream cancels that subscription without closing other session facets.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaEventSubscription: SeaService {
    /// Starts a gap-free snapshot, catch-up, and live event stream.
    ///
    /// Calling this method performs no confirmed I/O; initialization failures are yielded by the
    /// returned stream. A selected snapshot is yielded as [`LoadEvent::Snapshot`] without an event
    /// position, while monitored progress describes the subsequent event delivery. The selected
    /// snapshot position initializes both `previous` and `latest_known`; when no later event is
    /// captured, the stream reports [`MonitoredStreamStatus::AwaitingNewItems`] at that position.
    fn load(&self, required: Option<EventPosition>) -> ArchiveLoadStream<Self::Error>;
}

/// Ordered author submission, ambiguity resolution, and lifecycle.
///
/// The author surface owns logical-session teardown.
/// Closing one cloned facet is idempotent and invalidates every facet sharing that session.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaAuthorSession: SeaService {
    /// Submits one event under a stable retry identity.
    async fn submit(&self, submission: EventSubmission) -> Result<EventReceipt, Self::Error>;

    /// Resolves a possibly ambiguous event submission.
    async fn resolve_submission(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<EventReceipt>, Self::Error>;

    /// Explicitly closes this author session.
    async fn close(&self) -> Result<(), Self::Error>;
}

/// Snapshot lookup notifications, conditional publication, and ambiguity resolution.
///
/// Each returned notification stream owns its subscription and cancels on drop.
/// The coordinator shares the author session's logical lifetime and does not close it.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaSnapshotCoordinator: SeaService {
    /// Returns the latest retained snapshot.
    async fn latest_snapshot(&self) -> Result<Option<PublishedSnapshot>, Self::Error>;

    /// Conditionally publishes a snapshot under a stable retry identity.
    async fn publish_snapshot(
        &self,
        publication: SnapshotPublication,
    ) -> Result<PublishedSnapshot, Self::Error>;

    /// Resolves a possibly ambiguous snapshot publication.
    async fn resolve_snapshot_publication(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<PublishedSnapshot>, Self::Error>;

    /// Subscribes to latest-value snapshot updates.
    async fn subscribe_snapshots(
        &self,
    ) -> Result<SessionStream<PublishedSnapshot, Self::Error>, Self::Error>;
}

/// Snapshot participation, Sea selection, publication authority, and network lifecycle.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaSnapshotPublisher: SeaService {
    /// Registers this session's publisher capability and returns latest-value coordination state.
    async fn coordinate_snapshots(
        &self,
        participation: SnapshotParticipation,
    ) -> Result<SessionStream<SnapshotCoordination, Self::Error>, Self::Error>;

    /// Publishes under this stream's Sea-selected or client-selected authority.
    async fn publish_coordinated_snapshot(
        &self,
        fence: Option<u64>,
        publication: SnapshotPublication,
    ) -> Result<PublishedSnapshot, Self::Error>;

    /// Removes this session from publisher selection after stream loss or explicit close.
    async fn revoke_snapshot_publisher(&self) -> Result<(), Self::Error>;
}

/// Convenience marker for values implementing every current Sea responsibility.
pub trait SeaSession:
    SeaArchive + SeaAuthorSession + SeaEventSubscription + SeaSnapshotCoordinator
{
}

impl<S> SeaSession for S where
    S: SeaArchive + SeaAuthorSession + SeaEventSubscription + SeaSnapshotCoordinator
{
}

/// The durability completed before a successful append was acknowledged.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Durability {
    /// Visible to readers in this process, with no persistence guarantee.
    Memory,
    /// Submitted to an operating-system-backed store without a crash guarantee.
    Buffered,
    /// Persisted according to the implementation's documented crash guarantee.
    Durable,
}

/// Stable classes used by clients without erasing implementation details.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ErrorKind {
    /// A position or token is malformed, foreign, or beyond the committed head.
    InvalidPosition,
    /// A formerly valid position is no longer retained.
    StalePosition,
    /// The requested update conflicts with current committed state.
    Conflict,
    /// The implementation definitively refused the operation.
    Rejected,
    /// The operation may have committed even though no acknowledgement was returned.
    Ambiguous,
    /// The implementation cannot currently serve the operation.
    Unavailable,
    /// Persisted data failed structural or integrity validation.
    Corrupt,
}

/// An implementation error with a stable client-facing classification.
pub trait ClassifiedError: Error + Send + Sync + 'static {
    /// Returns the implementation-independent failure category.
    fn kind(&self) -> ErrorKind;
}
