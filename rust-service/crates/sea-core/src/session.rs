//! Client-session contracts composed above an exclusive replacement-storage view.
//!
//! The traits separate direct content and history access ([`crate::session::SeaArchive`]),
//! stable author submission identities ([`crate::session::SeaAuthorSession`]), and
//! conditional snapshot publication ([`crate::session::SeaSnapshotCoordinator`]).
//! [`crate::session::SeaSession`] is the convenience bound for implementations that provide
//! all three facets.
//!
//! Storage supplies ordered archives and availability-bearing handles, but it does not implement
//! membership, application-level deduplication, ambiguous-result reconciliation, or publisher
//! selection. Session implementations own those policies and must keep received identities distinct
//! from locally resolved [`crate::storage::StorageHandle`] values.
//!
//! Loads intentionally combine a selected snapshot with a live suffix without claiming an atomic
//! captured event head. Closing a membership ends that membership's reads and author authority;
//! backend resources retained by an already-created stream continue to follow the underlying
//! storage contract.

use async_trait::async_trait;
use bytes::Bytes;

use crate::storage::{ArchiveStream, LoadStart, Snapshot, StorageHandle};
use crate::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, EventPosition,
    archive::{
        EventSubmission, OperationId, SessionCommittedEvent, SessionStream, SnapshotParticipation,
    },
};

/// Selected state and a live stream of application events, without a captured event head.
pub struct SessionLoad<BlobHandle, EventHandle, Error> {
    /// Selected publication; its event position is its document-scoped version identity.
    pub snapshot: Option<Snapshot<BlobHandle, EventHandle>>,
    /// Ordered events after the selected snapshot, or from the beginning.
    pub events: ArchiveStream<SessionCommittedEvent, EventPosition, Error>,
}

/// Latest snapshot identity and this session's currently authorized publication fence.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SnapshotCoordination {
    /// Event position of the newest publication, if any.
    pub latest: Option<EventPosition>,
    /// Authority for the nominated Sea-selected publisher; absent for other sessions.
    pub fence: Option<u64>,
}

/// Content, snapshot selection, and direct monitored history for one logical session.
/// Native implementations are thread-safe; browser implementations may be locally owned.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaArchive: crate::SeaService {
    /// Complete-tree availability evidence, never a wire value.
    type BlobHandle: StorageHandle<Id = BlobTreeId>;
    /// Committed-event availability evidence, never a wire value.
    type EventHandle: StorageHandle<Id = EventPosition>;

    /// Reads an exclusive/inclusive bounded range, or live history without an upper bound.
    /// Initialization is lazy. Closing this membership ends its reads without closing other sessions.
    /// Bounds and backend-dependent read lifetimes follow the storage archive contract.
    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<SessionCommittedEvent, EventPosition, Self::Error>;
    /// Selects state and starts a live suffix using the same `LoadStart` policy as storage.
    /// Initial application state is an application event, not a special initial snapshot.
    async fn load(
        &self,
        start: LoadStart,
    ) -> Result<SessionLoad<Self::BlobHandle, Self::EventHandle, Self::Error>, Self::Error>;
    /// Selects a publication; exact lookup compares the returned event identity with the bound.
    async fn get_snapshot(
        &self,
        start: LoadStart,
    ) -> Result<Option<Snapshot<Self::BlobHandle, Self::EventHandle>>, Self::Error>;
    /// Publishes immutable content and returns its availability evidence.
    async fn put_blob(&self, payload: Bytes) -> Result<Self::BlobHandle, Self::Error>;
    /// Fetches one immutable blob.
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error>;
    /// Publishes a complete directory tree.
    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<Self::BlobHandle, Self::Error>;
    /// Fetches one immutable directory.
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error>;
    /// Resolves an available tree identity at the receiving boundary.
    async fn resolve_tree(&self, id: BlobTreeId) -> Result<Option<Self::BlobHandle>, Self::Error>;
    /// Resolves a committed application position for snapshot publication.
    async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::EventHandle>, Self::Error>;
}

/// Author ordering, stable submission identities, and logical membership lifecycle.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaAuthorSession: SeaArchive {
    /// Submits an event or resolves an exact retry by the same author, including after reconnect.
    /// Identity reuse with different payload, tree, reference, or author is rejected.
    /// Storage is never transparently retried. Returned ambiguity requires bounded reconciliation;
    /// cancellation does not establish settlement. Unsafe further mutations must wait or fail.
    async fn submit(&self, submission: EventSubmission) -> Result<EventPosition, Self::Error>;
    /// Resolves a submission after establishing settlement, or fails when its outcome remains unknown.
    async fn resolve_submission(
        &self,
        operation: &OperationId,
    ) -> Result<Option<EventPosition>, Self::Error>;
    /// Idempotently closes this membership and its clones, without invalidating other sessions.
    async fn close(&self) -> Result<(), Self::Error>;
}

/// Conditional publication and nominated publisher policy, owned above storage.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaSnapshotCoordinator: SeaArchive {
    /// Registers publisher participation and observes coalescible latest/fence updates.
    /// Dropping the stream revokes this registration. A new registration replaces the previous one.
    async fn coordinate_snapshots(
        &self,
        participation: SnapshotParticipation,
    ) -> Result<SessionStream<SnapshotCoordination, Self::Error>, Self::Error>;
    /// Publishes under client-selected or current Sea-selected authority.
    /// A new publication must match the expected parent and advance its event position.
    /// Exact position/root retries return the existing publication even after the parent advances;
    /// another root at that position conflicts. No independent publication operation ID is assigned.
    async fn publish_snapshot(
        &self,
        expected_parent: Option<EventPosition>,
        fence: Option<u64>,
        snapshot: Snapshot<Self::BlobHandle, Self::EventHandle>,
    ) -> Result<Snapshot<Self::BlobHandle, Self::EventHandle>, Self::Error>;
    /// Revokes this session's publisher registration without closing its author membership.
    async fn revoke_snapshot_publisher(&self) -> Result<(), Self::Error>;
}

/// Convenience marker for all replacement session facets.
pub trait SeaSession: SeaAuthorSession + SeaSnapshotCoordinator {}

impl<Implementation: SeaAuthorSession + SeaSnapshotCoordinator> SeaSession for Implementation {}
