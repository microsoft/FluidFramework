//! Independent ordered event archive storage.
//!
//! An event archive persists opaque events in order. An event may contain a [`crate::BlobTreeId`],
//! but this component neither resolves nor validates that identity. Cross-component availability
//! is established by [`super::SeaView`].

use async_trait::async_trait;

use crate::{BoxMonitoredStream, CommittedEvent, Event, EventPosition};

use super::ReferenceableStore;

/// A monitored stream of raw committed events from an [`EventArchive`].
pub type EventArchiveStream<E> = BoxMonitoredStream<CommittedEvent, EventPosition, E>;

/// An independently useful single-writer ordered event archive.
///
/// Recovery exposes either a contiguous prefix of committed events or an error. It never silently
/// skips an unavailable event and resumes at a later position. Blob-tree identities are opaque
/// event data at this boundary.
#[async_trait]
pub trait EventArchive: ReferenceableStore<Id = EventPosition> {
    /// Appends one event and returns its stable committed position.
    async fn append(&self, event: Event) -> Result<Self::Handle, Self::Error>;

    /// Reads committed events strictly after `after`.
    ///
    /// `after` is an exclusive starting cursor; `None` starts before the first event.
    /// `stop_after` is an inclusive upper bound. `Some(position)` creates a finite stream that ends
    /// after returning that event, while `None` creates an unbounded stream that waits for newly
    /// committed events after catching up.
    ///
    /// Calling this method performs no confirmed I/O. Initialization and runtime failures are
    /// yielded by the stream, and dropping the stream cancels its read or subscription work.
    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> EventArchiveStream<Self::Error>;

    /// Returns the committed head observed at one instant during this operation.
    ///
    /// Every append completed before the returned future begins execution is reflected in the
    /// result. An append concurrent with this operation may or may not be reflected, and a later
    /// append may make the result stale before it is returned. This is an authoritative read,
    /// unlike the potentially lagging `latest_known` observation reported by a monitored stream.
    async fn head(&self) -> Result<Option<EventPosition>, Self::Error>;
}
