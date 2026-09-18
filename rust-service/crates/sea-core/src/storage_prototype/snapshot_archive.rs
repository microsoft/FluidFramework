//! Independent snapshot publication storage.
//!
//! Snapshot roots and event positions are opaque references at this boundary. The archive owns
//! retained history, while [`super::SeaView`] establishes that referenced content and events are
//! available before publication.

use async_trait::async_trait;

use crate::EventPosition;
use crate::snapshot::{Snapshot, SnapshotPosition};

use super::Archive;

/// An independently useful ordered archive of immutable snapshot publications.
///
/// Snapshot positions are unique and increase with the event history they summarize. The archive
/// may therefore be read sparsely using any [`SnapshotPosition`] bound, while exact lookup succeeds
/// only at a position containing a retained publication.
#[async_trait]
pub trait SnapshotArchive:
    Archive<Position = SnapshotPosition, Item = Snapshot, Append = Snapshot, AppendResult = Snapshot>
{
    /// Returns the snapshot at this exact archive position, when retained.
    ///
    /// Because at most one snapshot occupies a position, callers can use this lookup after an
    /// ambiguous append outcome to determine which snapshot, if any, occupies that position.
    async fn get_snapshot_at(
        &self,
        position: SnapshotPosition,
    ) -> Result<Option<Snapshot>, Self::Error>;

    /// Returns the newest retained snapshot at or before an event position.
    async fn get_snapshot_at_or_before(
        &self,
        position: EventPosition,
    ) -> Result<Option<Snapshot>, Self::Error>;
}
