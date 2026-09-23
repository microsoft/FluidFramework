//! Ordered event values and stable session identities.

use std::pin::Pin;

use bytes::Bytes;
use futures_core::Stream;

use crate::BlobTreeId;
pub use crate::SnapshotParticipation;

/// A stable event submission through an individual session.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventSubmission {
    /// Latest event incorporated by the author's local state.
    pub reference: Option<EventPosition>,
    /// Opaque event and optional content root.
    pub event: Event,
}

/// A stable event-order value within one archive.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct EventPosition(u64);

impl EventPosition {
    /// Creates a position from its implementation-assigned numeric value.
    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    /// Returns the implementation-assigned numeric value.
    #[must_use]
    pub const fn get(self) -> u64 {
        self.0
    }

    /// Encodes the position in canonical big-endian order.
    #[must_use]
    pub const fn to_bytes(self) -> [u8; 8] {
        self.0.to_be_bytes()
    }

    /// Decodes one canonical position.
    #[must_use]
    pub const fn from_bytes(bytes: [u8; 8]) -> Self {
        Self(u64::from_be_bytes(bytes))
    }
}

/// One application event before or after commitment.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Event {
    /// Opaque application bytes.
    pub payload: Bytes,
    /// Optional immutable content tree referenced by this event.
    pub blob_tree: Option<BlobTreeId>,
}

#[cfg(test)]
mod event_tests {
    use super::EventPosition;

    #[test]
    fn event_positions_use_canonical_ordered_bytes() {
        let positions = [
            EventPosition::new(0),
            EventPosition::new(1),
            EventPosition::new(u64::MAX),
        ];
        assert!(positions[0] < positions[1]);
        assert!(positions[1] < positions[2]);
        for position in positions {
            assert_eq!(EventPosition::from_bytes(position.to_bytes()), position);
        }
    }
}

/// Document-scoped identity allocated by the sequencer without reuse.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct SessionId(u64);

impl SessionId {
    /// Wraps a nonzero sequencer-assigned value.
    ///
    /// # Errors
    ///
    /// Returns an error when `value` is zero.
    pub const fn new(value: u64) -> Result<Self, ValueError> {
        if value == 0 {
            return Err(ValueError::ZeroSessionId);
        }
        Ok(Self(value))
    }

    /// Returns the allocated numeric value.
    #[must_use]
    pub const fn get(&self) -> u64 {
        self.0
    }

    /// Returns its fixed-width canonical big-endian encoding.
    #[must_use]
    pub const fn as_bytes(&self) -> [u8; 8] {
        self.0.to_be_bytes()
    }
}

#[cfg(test)]
mod identity_tests {
    use super::{SessionId, ValueError};

    #[test]
    fn numeric_identities_preserve_all_nonzero_values() {
        for value in [1, 256, u64::MAX] {
            let session = SessionId::new(value).unwrap();
            assert_eq!(session.get(), value);
            assert_eq!(session.as_bytes(), value.to_be_bytes());
        }
        assert_eq!(SessionId::new(0), Err(ValueError::ZeroSessionId));
    }
}

/// Invalid caller-created Sea values.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ValueError {
    /// Zero is reserved as the empty allocation high-water mark.
    ZeroSessionId,
}

/// One committed application event returned through Sea interfaces.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommittedEvent {
    /// Stable position assigned when the event committed.
    pub position: EventPosition,
    /// Opaque payload and optional content root supplied by the author.
    pub event: Event,
}

/// Origin of a session event, independent of its application-specific payload.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum SessionEventKind {
    /// An explicitly submitted application event.
    #[default]
    Application,
    /// An explicitly announced membership; payload contains caller-provided metadata.
    Joined,
    /// An announced membership's final sequencing barrier; payload is empty.
    /// All its accepted application events precede this record and none may follow it.
    Left,
}

/// One committed event with the sequencing metadata exposed to session consumers.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionCommittedEvent {
    /// Distinguishes submissions from service-authoritative membership records.
    pub kind: SessionEventKind,
    /// Storage commitment and application event.
    pub committed: CommittedEvent,

    /// Connection identity that submitted the event.
    pub session_id: SessionId,
    /// Sequenced history known when the author constructed this event, or initial state.
    /// Together with the session's preceding application events, this describes the submission context.
    pub reference: Option<EventPosition>,
    /// Durable, nondecreasing document admission floor at this event's boundary.
    /// Advances commit atomically with their carrying event and constrain subsequent submissions.
    /// `None` denotes initial context and is below every concrete position.
    pub minimum_reference: Option<EventPosition>,
}

#[cfg(not(target_arch = "wasm32"))]
/// Session stream on native targets.
pub type SessionStream<T, E> = Pin<Box<dyn Stream<Item = Result<T, E>> + Send + 'static>>;

#[cfg(target_arch = "wasm32")]
/// Session stream on browser targets.
pub type SessionStream<T, E> = Pin<Box<dyn Stream<Item = Result<T, E>> + 'static>>;
