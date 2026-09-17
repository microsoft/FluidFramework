//! Materialized archive state and its publication metadata.
//!
//! A snapshot identifies an immutable blob tree containing the state produced by composing the
//! archive's events through a specific position. Publication values add stable identity, lineage,
//! retry, and coordination information without changing that stored state.

use bytes::Bytes;

use crate::{BlobTreeId, EventPosition, archive::OperationId};

/// An opaque identity assigned to a published snapshot.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct SnapshotId(Bytes);

impl SnapshotId {
    /// Wraps implementation-defined identity bytes.
    #[must_use]
    pub fn from_bytes(value: Bytes) -> Self {
        Self(value)
    }

    /// Returns the opaque identity bytes without interpreting them.
    #[must_use]
    pub fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

/// The event boundary represented by a snapshot.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum SnapshotPosition {
    /// State before the first committed event.
    Initial,
    /// State including every event through this position.
    At(EventPosition),
}

/// One immutable snapshot publication value.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Snapshot {
    /// Latest event reflected in the snapshot.
    pub at_event: SnapshotPosition,
    /// Root of the immutable state tree.
    pub root: BlobTreeId,
}

/// A snapshot paired with its publication identity and lineage.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublishedSnapshot {
    /// Identity of this publication, distinct from its content root.
    pub id: SnapshotId,
    /// Parent publication required when this snapshot was accepted.
    pub parent: Option<SnapshotId>,
    /// Published state and event boundary.
    pub snapshot: Snapshot,
}

/// An idempotent conditional snapshot-publication request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotPublication {
    /// Stable identity reused to retry or resolve this publication.
    pub operation_id: OperationId,
    /// Latest snapshot expected by the publisher.
    pub expected_parent: Option<SnapshotId>,
    /// State being published.
    pub snapshot: Snapshot,
}

/// Latest accepted snapshot and this session's current publication authority.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotCoordination {
    /// Latest accepted snapshot, if any.
    pub latest: Option<PublishedSnapshot>,
    /// Current fencing token when this session is nominated.
    pub fence: Option<u64>,
}

/// How one snapshot stream participates in publication authority.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SnapshotParticipation {
    /// Receives coordination updates but cannot publish snapshots.
    ReadOnly,
    /// Publishes only while selected and fenced by Sea.
    SeaSelected,
    /// Publishes under application-managed selection without a Sea fence.
    ClientSelected,
}

#[cfg(test)]
mod tests {
    use super::SnapshotPosition;
    use crate::EventPosition;

    #[test]
    fn initial_snapshot_precedes_every_event_position() {
        assert!(SnapshotPosition::Initial < SnapshotPosition::At(EventPosition::new(0)));
    }
}
