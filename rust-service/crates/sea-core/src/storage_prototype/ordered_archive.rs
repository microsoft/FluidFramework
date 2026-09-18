//! Ordered append-only archive storage.

use async_trait::async_trait;

use crate::BoxMonitoredStream;

use super::StorageSurface;

/// A monitored stream of entries from an [`Archive`].
pub type ArchiveStream<Item, Position, Error> = BoxMonitoredStream<Item, Position, Error>;

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
    ///
    /// One invocation may create at most one entry.
    /// Implementations must not transparently resubmit an append after an ambiguous outcome.
    /// Retrying is an application decision; equal values submitted separately remain distinct entries.
    /// An error that leaves commitment uncertain must be classified as [`crate::ErrorKind::Ambiguous`];
    /// other errors indicate that this invocation created no entry.
    /// After this future returns, even with an ambiguous error, a subsequent successful
    /// [`Self::head`] bounds any entry created by this invocation.
    ///
    /// Dropping the future does not imply rollback or that backend work has stopped.
    /// Unlike a returned result, cancellation alone does not make a subsequent head a reconciliation
    /// bound: callers must first establish through backend-documented settlement or recovery that
    /// the cancelled operation can no longer commit later.
    async fn append(&self, value: Self::Append) -> Result<Self::AppendResult, Self::Error>;

    /// Reads entries strictly after `after` in position order.
    ///
    /// `after` is an exclusive starting cursor; `None` starts before the first entry.
    /// `stop_after` is an inclusive upper bound.
    /// For bounds at or before the committed head observed during stream initialization,
    /// `Some(position)` creates a finite stream containing every entry in the requested range,
    /// whether or not an entry exists exactly at either supplied position.
    /// `None` creates an unbounded stream that waits for newly appended entries after catching up.
    ///
    /// When both bounds are present and `after >= stop_after`, the range is empty:
    /// the stream yields no entries and completes without waiting for appends.
    /// Otherwise, behavior for either supplied bound beyond the head observed during initialization
    /// is implementation-defined, including when the archive is empty and has no head.
    /// A backend must document its choice and may reject such bounds with
    /// [`crate::ErrorKind::InvalidPosition`]; callers must not rely on support for future positions.
    /// These allowances do not permit yielding entries outside the requested range or out of order.
    ///
    /// Calling this method performs no confirmed I/O. Initialization and runtime failures are
    /// yielded by the stream, and dropping the stream cancels its read or subscription work.
    /// An empty range may still report an initialization failure.
    /// The stream owns or shares the resources and locks needed to read independently of the
    /// Rust value on which this method was called; dropping that value alone does not invalidate it.
    /// For document components, this includes any dependency on the exclusive opening described
    /// by [`super::SeaStorage`].
    /// An outage, failover, or other event invalidating that opening may fail the stream;
    /// callers must reopen and create a new stream rather than rely on transparent continuation.
    /// A backend may keep an independent stream valid longer, but this is not required.
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
    ///
    /// For every append whose future returned before this future begins execution, including those
    /// returning an ambiguous error, a successful result bounds any entry that invocation created.
    /// Such an invocation must not commit beyond the returned head after this observation.
    /// `None` establishes that none of those invocations created an entry in this archive history.
    /// Implementations must wait for settlement or return an error if they cannot establish this bound.
    /// This guarantee does not cover append futures that are still pending or were dropped.
    async fn head(&self) -> Result<Option<Self::Position>, Self::Error>;
}
