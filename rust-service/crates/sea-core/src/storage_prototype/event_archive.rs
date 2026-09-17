//! Independent ordered event archive storage.
//!
//! An event archive persists opaque events in order. An event may contain a [`crate::BlobTreeId`],
//! but this component neither resolves nor validates that identity. Cross-component availability
//! is established by [`super::SeaView`].

use async_trait::async_trait;

use crate::{Event, EventPosition, StorageEventStream};

use super::ReferenceableStore;

/// An independently useful single-writer ordered event archive.
///
/// Recovery exposes either a contiguous prefix of committed events or an error. It never silently
/// skips an unavailable event and resumes at a later position. Blob-tree identities are opaque
/// event data at this boundary.
#[async_trait]
pub trait EventArchive: ReferenceableStore<Id = EventPosition> {
    /// Appends one event and returns its stable committed position.
    async fn append(&self, event: Event) -> Result<Self::Handle, Self::Error>;

    /// Reads committed events strictly after `after` through the inclusive `through` bound.
    async fn read(
        &self,
        after: Option<EventPosition>,
        through: Option<EventPosition>,
    ) -> Result<StorageEventStream<Self::Error>, Self::Error>;

    /// Returns the latest committed event position.
    async fn head(&self) -> Result<Option<EventPosition>, Self::Error>;
}
