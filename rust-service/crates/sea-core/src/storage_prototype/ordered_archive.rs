//! Ordered append-only archive storage.

use async_trait::async_trait;

use crate::BoxMonitoredStream;

use super::StorageSurface;

/// A monitored stream of entries from an [`Archive`].
pub type ArchiveStream<T, P, E> = BoxMonitoredStream<T, P, E>;

/// An independently useful ordered append-only archive.
///
/// Every successful append creates one archive entry at a unique position. Positions increase
/// strictly in append order. Entry values are preserved independently even when multiple entries
/// contain equal values. If an append request proposes its position, the implementation rejects a
/// position that is not strictly greater than the current head.
///
/// This prototype does not support pruning: archives must retain every committed entry.
/// Recovery exposes a complete ordered prefix starting with the first entry, or an error,
/// subject to the backend's durability guarantees.
/// Corruption within the required prefix fails recovery rather than producing a gap.
#[async_trait]
pub trait Archive: StorageSurface {
    /// Ordered position of one entry in this archive.
    type Position: Clone + Ord + Send + Sync + 'static;

    /// Entry returned when reading the archive.
    type Item: Send + 'static;

    /// Archive-specific request used to append one entry.
    type Append: Send + 'static;

    /// Archive-specific result of a successful append.
    type AppendResult: Send + 'static;

    /// Appends one entry at a new position in archive order.
    async fn append(&self, value: Self::Append) -> Result<Self::AppendResult, Self::Error>;

    /// Reads entries strictly after `after` in position order.
    ///
    /// `after` is an exclusive starting cursor; `None` starts before the first entry.
    /// `stop_after` is an inclusive upper bound. `Some(position)` creates a finite stream containing
    /// every entry through that bound, whether or not an entry exists exactly at the supplied
    /// position. `None` creates an unbounded stream that waits for newly appended entries after
    /// catching up.
    ///
    /// Calling this method performs no confirmed I/O. Initialization and runtime failures are
    /// yielded by the stream, and dropping the stream cancels its read or subscription work.
    fn read(
        &self,
        after: Option<Self::Position>,
        stop_after: Option<Self::Position>,
    ) -> ArchiveStream<Self::Item, Self::Position, Self::Error>;

    /// Returns the committed head observed at one instant during this operation.
    ///
    /// Every append completed before the returned future begins execution is reflected in the
    /// result. An append concurrent with this operation may or may not be reflected, and a later
    /// append may make the result stale before it is returned. This is an authoritative read,
    /// unlike the potentially lagging `latest_known` observation reported by a monitored stream.
    async fn head(&self) -> Result<Option<Self::Position>, Self::Error>;
}
