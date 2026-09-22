//! Independent internal recovery state owned by an exclusive document opening.

use async_trait::async_trait;
use bytes::Bytes;

use super::StorageSurface;

/// Atomic persistence of opaque internal state, independent of all document archives.
///
/// Implementations retain the document opening and its mutation/failure discipline.
/// The payload owns its logical replay boundary; storage neither interprets it nor rebuilds
/// historical lookup structures when publishing it.
#[async_trait]
pub trait CheckpointStore: StorageSurface + std::fmt::Debug {
    /// Reads the latest published state, or `None` before the first publication.
    async fn checkpoint(&self) -> Result<Option<Bytes>, Self::Error>;

    /// Atomically replaces the nonempty state after preceding mutations have settled.
    /// Success has the document's advertised durability. Uncertain publication invalidates
    /// further mutations until recovery; cancellation requires the same settlement discipline
    /// as archive appends. This operation does not publish an application snapshot.
    async fn publish_checkpoint(&self, checkpoint: Bytes) -> Result<(), Self::Error>;
}
