//! Independent snapshot publication storage.
//!
//! Snapshot roots and event positions are opaque references at this boundary. The archive owns
//! publication identity, lineage, retry resolution, and retained-history lookup; [`super::SeaView`]
//! establishes that referenced content and events are available before publication.

use async_trait::async_trait;

use crate::snapshot::SnapshotPosition;
use crate::{EventPosition, OperationId, PublishedSnapshot, SnapshotId, SnapshotPublication};

use super::Archive;

/// An independently useful ordered archive of immutable snapshot publications.
///
/// Snapshot positions are unique and increase with the event history they summarize. The archive
/// may therefore be read sparsely using any [`SnapshotPosition`] bound, while exact lookup succeeds
/// only at a position containing a retained publication.
#[async_trait]
pub trait SnapshotArchive:
    Archive<
        Position = SnapshotPosition,
        Item = PublishedSnapshot,
        Append = SnapshotPublication,
        AppendResult = PublishedSnapshot,
    >
{
    /// Returns one retained snapshot by publication identity.
    async fn snapshot(&self, id: &SnapshotId) -> Result<Option<PublishedSnapshot>, Self::Error>;

    /// Returns the snapshot at this exact archive position, when retained.
    async fn snapshot_at(
        &self,
        position: SnapshotPosition,
    ) -> Result<Option<PublishedSnapshot>, Self::Error>;

    /// Returns the newest retained snapshot at or before an event position.
    async fn snapshot_at_or_before(
        &self,
        position: EventPosition,
    ) -> Result<Option<PublishedSnapshot>, Self::Error>;

    /// Resolves a possibly ambiguous publication by stable operation identity.
    async fn resolve_snapshot_publication(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<PublishedSnapshot>, Self::Error>;
}
