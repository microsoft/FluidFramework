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
