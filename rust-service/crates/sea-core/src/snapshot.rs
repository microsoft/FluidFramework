//! Snapshot publisher participation policy.

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
