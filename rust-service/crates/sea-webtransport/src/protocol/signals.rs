//! Wire values for ephemeral messaging; no archive positions or durable receipts.

use bytes::Bytes;
use sea_core::signals::{
    SignalDelivery, SignalEvent, SignalMember, SignalMessage, SignalSubmission,
};
use serde::{Deserialize, Serialize};

/// Signal-only connection handshake, authorized by the receiving host.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct OpenSignals {
    /// Required protocol version.
    pub version: u16,
    /// Existing document routing identity.
    pub document: Vec<u8>,
    /// Connection identity and public metadata.
    pub member: Member,
    /// Whether this endpoint can receive best-effort datagrams.
    pub datagrams: bool,
}

/// Public live connection information.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Member {
    /// Document-scoped connection identity.
    pub id: Vec<u8>,
    /// Opaque public metadata.
    pub metadata: Vec<u8>,
}

/// Explicit message routing and delivery semantics.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Submission {
    /// One destination, or a sender-inclusive broadcast.
    pub target: Option<Vec<u8>>,
    /// Opaque application bytes.
    pub payload: Vec<u8>,
    /// Permits loss and reordering, even when reliable fallback is used.
    pub best_effort: bool,
}

/// Membership control and application messages share a reliable fallback stream.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum Event {
    /// Atomic initial membership snapshot.
    Members(Vec<Member>),
    /// Newly available participant.
    Joined(Member),
    /// Departed participant.
    Left(Vec<u8>),
    /// Application message with host-bound sender.
    Message {
        /// Sender connection identity.
        sender: Vec<u8>,
        /// Original message fields.
        submission: Submission,
    },
}

impl From<SignalMember> for Member {
    fn from(value: SignalMember) -> Self {
        Self {
            id: value.id.to_vec(),
            metadata: value.metadata.to_vec(),
        }
    }
}
impl From<Member> for SignalMember {
    fn from(value: Member) -> Self {
        Self {
            id: Bytes::from(value.id),
            metadata: Bytes::from(value.metadata),
        }
    }
}
impl From<SignalSubmission> for Submission {
    fn from(value: SignalSubmission) -> Self {
        Self {
            target: value.target.map(|target| target.to_vec()),
            payload: value.payload.to_vec(),
            best_effort: value.delivery == SignalDelivery::BestEffort,
        }
    }
}
impl From<Submission> for SignalSubmission {
    fn from(value: Submission) -> Self {
        Self {
            target: value.target.map(Bytes::from),
            payload: Bytes::from(value.payload),
            delivery: if value.best_effort {
                SignalDelivery::BestEffort
            } else {
                SignalDelivery::Reliable
            },
        }
    }
}
impl From<SignalEvent> for Event {
    fn from(value: SignalEvent) -> Self {
        match value {
            SignalEvent::Members(members) => {
                Self::Members(members.into_iter().map(Into::into).collect())
            }
            SignalEvent::Joined(member) => Self::Joined(member.into()),
            SignalEvent::Left(id) => Self::Left(id.to_vec()),
            SignalEvent::Message(message) => Self::Message {
                sender: message.sender.to_vec(),
                submission: message.submission.into(),
            },
        }
    }
}
impl From<Event> for SignalEvent {
    fn from(value: Event) -> Self {
        match value {
            Event::Members(members) => Self::Members(members.into_iter().map(Into::into).collect()),
            Event::Joined(member) => Self::Joined(member.into()),
            Event::Left(id) => Self::Left(Bytes::from(id)),
            Event::Message { sender, submission } => Self::Message(SignalMessage {
                sender: Bytes::from(sender),
                submission: submission.into(),
            }),
        }
    }
}
