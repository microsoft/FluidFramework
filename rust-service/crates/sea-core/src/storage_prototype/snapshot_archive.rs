//! Independent snapshot publication storage.
//!
//! Snapshot roots and event positions are opaque references at this boundary. The archive owns
//! publication identity, lineage, retry resolution, and retained-history lookup; [`super::SeaView`]
//! establishes that referenced content and events are available before publication.

use async_trait::async_trait;

use crate::{
    ClassifiedError, EventPosition, OperationId, PublishedSnapshot, SnapshotId, SnapshotPublication,
};

/// An independently useful archive of immutable snapshot publications.
#[async_trait]
pub trait SnapshotArchive: Send + Sync {
    /// Classified backend error.
    type Error: ClassifiedError;

    /// Returns one retained snapshot by publication identity.
    async fn snapshot(&self, id: &SnapshotId) -> Result<Option<PublishedSnapshot>, Self::Error>;

    /// Returns the latest retained snapshot.
    async fn latest_snapshot(&self) -> Result<Option<PublishedSnapshot>, Self::Error>;

    /// Returns the newest retained snapshot at or before an event position.
    async fn snapshot_at_or_before(
        &self,
        position: EventPosition,
    ) -> Result<Option<PublishedSnapshot>, Self::Error>;

    /// Conditionally publishes a snapshot without interpreting its external references.
    async fn publish_snapshot(
        &self,
        publication: SnapshotPublication,
    ) -> Result<PublishedSnapshot, Self::Error>;

    /// Resolves a possibly ambiguous publication by stable operation identity.
    async fn resolve_snapshot_publication(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<PublishedSnapshot>, Self::Error>;
}
