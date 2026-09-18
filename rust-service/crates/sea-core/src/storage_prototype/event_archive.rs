//! Independent ordered event archive storage.
//!
//! An event archive persists opaque events in order. An event may contain a [`crate::BlobTreeId`],
//! but this component neither resolves nor validates that identity. Cross-component availability
//! is established by [`super::SeaView`].

use crate::{CommittedEvent, Event, EventPosition};

use super::{Archive, ArchiveStream, ReferenceableStore};

/// A monitored stream of raw committed events from an [`EventArchive`].
pub type EventArchiveStream<E> = ArchiveStream<CommittedEvent, EventPosition, E>;

/// An independently useful single-writer ordered event archive.
///
/// Blob-tree identities remain opaque event data at this boundary.
///
/// # Application-owned reconciliation
///
/// This archive does not assign application operation IDs or deduplicate equal events.
/// Neither the archive nor its composing view transparently retries ambiguous appends.
/// Applications own retry policy, including retries after failures upstream of storage.
///
/// Before submitting events, an application can retain a known preceding position as an exclusive
/// lower bound, or use `None` when no preceding position is known.
/// After the uncertain append calls have returned, it can obtain an inclusive upper bound with
/// [`Archive::head`] and read the bounded range with [`Archive::read`].
/// A head of `None` means the history is empty; it must not be passed as `stop_after`, where `None`
/// requests a live stream.
/// A failed read or incomplete scan is not evidence that an event is absent.
/// Cancelled or upstream requests that may still reach storage require settlement first;
/// the head guarantee covers only append calls that have returned at this boundary.
/// After recovery, bounds must refer to the recovered history, subject to backend durability.
///
/// If the application preserves submission order, it can scan the range once, matching each next
/// local event against successive stored events and advancing its local cursor on a match.
/// This tests for an ordered, not necessarily contiguous subsequence in linear time in the number
/// of stored and local events, apart from comparison costs.
/// Concurrent submissions without an ordering guarantee require identity-based matching instead.
/// A partial subsequence match alone does not establish that all remaining local events are absent.
///
/// Applications choose what constitutes a match and whether their opaque payloads contain a unique
/// event ID, a session ID and sequence number, or no identity metadata.
/// Unique identities can distinguish submissions; content equality alone proves only that equivalent
/// events occur in the log, not which submitter's calls committed.
/// Identity size, collision risk, and the consequences of treating equal submissions as equivalent
/// remain application decisions; storage imposes no per-event operation-ID overhead.
pub trait EventArchive:
    Archive<
        Position = EventPosition,
        Item = CommittedEvent,
        Append = Event,
        AppendResult = <Self as ReferenceableStore>::Handle,
    > + ReferenceableStore<Id = EventPosition>
{
}

impl<T> EventArchive for T where
    T: Archive<
            Position = EventPosition,
            Item = CommittedEvent,
            Append = Event,
            AppendResult = <T as ReferenceableStore>::Handle,
        > + ReferenceableStore<Id = EventPosition>
{
}
