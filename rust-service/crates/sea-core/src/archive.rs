//! Final archive and individual-session contracts.

use std::pin::Pin;

use async_trait::async_trait;
use bytes::Bytes;
use futures_core::Stream;

use crate::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, Durability, Event,
    EventPosition, SnapshotId,
};

/// Stable caller-provided identity for an operation whose result may be ambiguous.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct OperationId(Bytes);

impl OperationId {
    /// Creates a nonempty operation identity.
    ///
    /// # Errors
    ///
    /// Returns an error when `value` is empty.
    pub fn new(value: impl Into<Bytes>) -> Result<Self, ValueError> {
        let value = value.into();
        if value.is_empty() {
            return Err(ValueError::EmptyOperationId);
        }
        Ok(Self(value))
    }

    /// Returns the opaque identity bytes.
    #[must_use]
    pub const fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

/// Stable identity of one event author within an archive.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct AuthorId(Bytes);

impl AuthorId {
    /// Creates a nonempty author identity.
    ///
    /// # Errors
    ///
    /// Returns an error when `value` is empty.
    pub fn new(value: impl Into<Bytes>) -> Result<Self, ValueError> {
        let value = value.into();
        if value.is_empty() {
            return Err(ValueError::EmptyAuthorId);
        }
        Ok(Self(value))
    }

    /// Returns the opaque identity bytes.
    #[must_use]
    pub const fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

/// Fresh identity of one logical connection by an author.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct SessionId(Bytes);

impl SessionId {
    /// Creates a nonempty session identity.
    ///
    /// # Errors
    ///
    /// Returns an error when `value` is empty.
    pub fn new(value: impl Into<Bytes>) -> Result<Self, ValueError> {
        let value = value.into();
        if value.is_empty() {
            return Err(ValueError::EmptySessionId);
        }
        Ok(Self(value))
    }

    /// Returns the opaque identity bytes.
    #[must_use]
    pub const fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

#[cfg(test)]
mod identity_tests {
    use bytes::Bytes;

    use super::{AuthorId, OperationId, SessionId, ValueError};

    #[test]
    fn caller_identities_preserve_nonempty_bytes_and_reject_empty_values() {
        let value = Bytes::from_static(b"identity");

        assert_eq!(
            OperationId::new(value.clone())
                .expect("nonempty operation identity")
                .as_bytes(),
            &value
        );
        assert_eq!(
            AuthorId::new(value.clone())
                .expect("nonempty author identity")
                .as_bytes(),
            &value
        );
        assert_eq!(
            SessionId::new(value.clone())
                .expect("nonempty session identity")
                .as_bytes(),
            &value
        );

        assert_eq!(
            OperationId::new(Bytes::new()),
            Err(ValueError::EmptyOperationId)
        );
        assert_eq!(AuthorId::new(Bytes::new()), Err(ValueError::EmptyAuthorId));
        assert_eq!(
            SessionId::new(Bytes::new()),
            Err(ValueError::EmptySessionId)
        );
    }
}

/// Invalid caller-created Sea values.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ValueError {
    /// An operation identity was empty.
    EmptyOperationId,
    /// An author identity was empty.
    EmptyAuthorId,
    /// A session identity was empty.
    EmptySessionId,
}

/// The event boundary represented by a snapshot.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum SnapshotPosition {
    /// State before the first committed event.
    Initial,
    /// State including every event through this position.
    At(EventPosition),
}

/// One immutable snapshot publication value.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Snapshot {
    /// Latest event reflected in the snapshot.
    pub at_event: SnapshotPosition,
    /// Root of the immutable state tree.
    pub root: BlobTreeId,
}

/// A snapshot paired with its publication identity and lineage.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublishedSnapshot {
    /// Identity of this publication, distinct from its content root.
    pub id: SnapshotId,
    /// Parent publication required when this snapshot was accepted.
    pub parent: Option<SnapshotId>,
    /// Published state and event boundary.
    pub snapshot: Snapshot,
}

/// An idempotent conditional snapshot-publication request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotPublication {
    /// Stable identity reused to retry or resolve this publication.
    pub operation_id: OperationId,
    /// Latest snapshot expected by the publisher.
    pub expected_parent: Option<SnapshotId>,
    /// State being published.
    pub snapshot: Snapshot,
}

/// Latest accepted snapshot and this session's current publication authority.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotCoordination {
    /// Latest accepted snapshot, if any.
    pub latest: Option<PublishedSnapshot>,
    /// Current fencing token when this session is nominated.
    pub fence: Option<u64>,
}

/// One committed application event returned through Sea interfaces.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommittedEvent {
    /// Stable position assigned when the event committed.
    pub position: EventPosition,
    /// Opaque payload and optional content root supplied by the author.
    pub event: Event,
}

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

/// Trusted backend operations for one archive.
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
    /// Finite catch-up completed through this captured head.
    CaughtUp(Option<EventPosition>),
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

/// One committed event with the sequencing metadata exposed to session consumers.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionCommittedEvent {
    /// Storage commitment and application event.
    pub committed: CommittedEvent,
    /// Stable author identity supplied when the session opened.
    pub author_id: AuthorId,
    /// Connection identity that submitted the event.
    pub session_id: SessionId,
    /// Stable operation identity used for retry resolution.
    pub operation_id: OperationId,
    /// Event position referenced by the author, or initial state.
    pub reference: Option<EventPosition>,
    /// Minimum position still referenced by an active author, when any event exists.
    pub minimum_reference: Option<EventPosition>,
}

#[cfg(not(target_arch = "wasm32"))]
/// Session stream on native targets.
pub type SessionStream<T, E> = Pin<Box<dyn Stream<Item = Result<T, E>> + Send + 'static>>;

#[cfg(target_arch = "wasm32")]
/// Session stream on browser targets.
pub type SessionStream<T, E> = Pin<Box<dyn Stream<Item = Result<T, E>> + 'static>>;

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

/// Archive-scoped content, historical reads, and snapshot lookup.
///
/// This surface owns no author membership or live subscription.
/// Dropping an archive handle therefore requires no asynchronous teardown.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaArchive: SeaService {
    /// Reads committed application events strictly after `after` through `through`.
    async fn read(
        &self,
        after: Option<EventPosition>,
        through: Option<EventPosition>,
    ) -> Result<SessionStream<SessionCommittedEvent, Self::Error>, Self::Error>;

    /// Publishes or deduplicates one immutable blob.
    async fn put_blob(&self, payload: Bytes) -> Result<BlobId, Self::Error>;

    /// Fetches one authorized immutable blob.
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error>;

    /// Publishes or deduplicates one immutable directory.
    async fn put_directory(&self, directory: BlobDirectory)
    -> Result<BlobDirectoryId, Self::Error>;

    /// Fetches one authorized immutable directory.
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error>;

    /// Returns one retained snapshot by publication identity.
    async fn snapshot(&self, id: &SnapshotId) -> Result<Option<PublishedSnapshot>, Self::Error>;
}

/// Gap-free snapshot, catch-up, and live event delivery.
///
/// Each returned stream owns its cursor and subscription.
/// Dropping the stream cancels that subscription without closing other session facets.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaEventSubscription: SeaService {
    /// Starts a gap-free snapshot, catch-up, and live event stream.
    async fn load(
        &self,
        required: Option<EventPosition>,
    ) -> Result<SessionStream<LoadEvent, Self::Error>, Self::Error>;
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

/// How one snapshot stream participates in publication authority.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SnapshotParticipation {
    /// Receives coordination updates but cannot publish snapshots.
    ReadOnly,
    /// Publishes only while selected and fenced by Sea.
    SeaSelected,
    /// Publishes under application-managed selection without a Sea fence.
    ClientSelected,
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
