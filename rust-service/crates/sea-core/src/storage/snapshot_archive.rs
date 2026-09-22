//! Independent snapshot publication storage.
//!
//! Snapshots carry blob and event availability handles at this API boundary.
//! The archive owns publication history, while [`super::SeaView`] establishes that referenced
//! content and events are available before publication.

use async_trait::async_trait;
use bytes::Bytes;

use crate::{BlobTreeId, EventPosition};

use super::{Archive, Snapshot, StorageHandle};

/// An independently useful ordered archive of immutable snapshot publications.
///
/// Snapshot positions are unique and increase with the event history they summarize. The archive
/// may therefore be read sparsely using any [`EventPosition`] bound, while exact lookup succeeds
/// only at a position containing a publication.
/// Like every [`Archive`], snapshot archives do not support pruning.
/// A snapshot's archive position is the identity of its event handle.
/// The initial empty state has no snapshot publication.
///
/// Lookups and reads provide handles compatible with the associated blob and event
/// stores; an implementation must establish that evidence or return an error.
/// A missing dependency of an existing publication is a consistency failure, not an absent snapshot.
/// Handles are API values; this contract prescribes no persisted representation.
#[async_trait]
pub trait SnapshotArchive:
    Archive<
        Position = EventPosition,
        Item = Snapshot<Self::BlobHandle, Self::EventHandle>,
        Append = Snapshot<Self::BlobHandle, Self::EventHandle>,
        AppendResult = (),
    >
{
    /// Availability handle for a snapshot's complete state tree.
    type BlobHandle: StorageHandle<Id = BlobTreeId>;

    /// Availability handle for the event boundary represented by a snapshot.
    type EventHandle: StorageHandle<Id = EventPosition>;

    /// Returns the last atomically published internal checkpoint, independently of application snapshots.
    /// An empty document may already have an internal checkpoint, for example an identity reservation.
    async fn checkpoint(&self) -> Result<Option<Bytes>, Self::Error>;

    /// Atomically replaces the nonempty internal checkpoint after preceding mutations have settled.
    /// The payload owns its replay boundary; replacing it does not publish an application snapshot.
    /// A successful result has the document's advertised durability and survives reopening accordingly.
    /// An uncertain publication is ambiguous and invalidates further mutations until recovery.
    /// Cancellation requires the same settlement discipline as archive appends.
    async fn publish_checkpoint(&self, checkpoint: Bytes) -> Result<(), Self::Error>;

    /// Returns the snapshot at this exact archive position, or `None` if no publication exists there.
    ///
    /// Because at most one snapshot occupies a position, callers can use this lookup after an
    /// ambiguous append outcome to determine which snapshot, if any, occupies that position.
    async fn get_snapshot_at(
        &self,
        position: EventPosition,
    ) -> Result<Option<Snapshot<Self::BlobHandle, Self::EventHandle>>, Self::Error>;

    /// Returns the newest snapshot within an optional inclusive event-position bound.
    ///
    /// `Some(position)` selects the newest snapshot at or before that position.
    /// `None` selects the newest available snapshot without an upper bound.
    /// Returns `None` when no publication qualifies.
    async fn latest_at_or_before(
        &self,
        position: Option<EventPosition>,
    ) -> Result<Option<Snapshot<Self::BlobHandle, Self::EventHandle>>, Self::Error>;
}
