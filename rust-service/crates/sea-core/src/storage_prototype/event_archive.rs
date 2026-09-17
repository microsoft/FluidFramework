//! Independent ordered event archive storage.
//!
//! An event archive persists opaque events in order. An event may contain a [`crate::BlobTreeId`],
//! but this component neither resolves nor validates that identity. Cross-component availability
//! is established by [`super::SeaView`].

use async_trait::async_trait;

use crate::{ClassifiedError, Event, EventPosition, StorageEventStream};

/// Evidence that an event position belongs to and is available from a compatible archive.
///
/// Implementations choose the concrete handle type so only that archive can mint evidence of a
/// committed position.
pub trait EventHandle: Clone + Send + Sync + 'static {
    /// Returns the committed event position represented by this handle.
    fn position(&self) -> EventPosition;
}

/// An independently useful single-writer ordered event archive.
///
/// Recovery exposes either a contiguous prefix of committed events or an error. It never silently
/// skips an unavailable event and resumes at a later position. Blob-tree identities are opaque
/// event data at this boundary.
#[async_trait]
pub trait EventArchive: Send + Sync {
    /// Classified backend error.
    type Error: ClassifiedError;

    /// Backend-defined capability for one available committed position.
    type Handle: EventHandle;

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

    /// Verifies that a handle identifies an event available from this archive instance.
    async fn verify_handle(&self, handle: &Self::Handle) -> Result<(), Self::Error>;

    /// Resolves a retained position to archive-specific availability evidence.
    async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::Handle>, Self::Error>;
}
