//! Ephemeral, document-scoped messaging independent of archive and author authority.
//!
//! Signals have no event position, persistence, replay, or ordering relation to archive events.
//! Reliable delivery applies only to a live connection: failures are observable, not retried.
//! Best-effort delivery permits loss and reordering, including fallback to a reliable transport.

use async_trait::async_trait;
use bytes::Bytes;

/// Requested delivery semantics, independent of the selected network transport.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum SignalDelivery {
    /// Use reliable transport; fail a receiver that cannot retain accepted messages.
    #[default]
    Reliable,
    /// Permit loss and reordering; reliable fallback is allowed.
    BestEffort,
}

/// A live connection identity and opaque application-supplied public metadata.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SignalMember {
    /// Identity scoped to a document and connection lifetime, admitted by the host.
    pub id: Bytes,
    /// Public membership information; not authenticated by the relay itself.
    pub metadata: Bytes,
}

/// An opaque outbound message; an absent target broadcasts, including to the sender.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SignalSubmission {
    /// Destination connection in the same document, or all current members.
    pub target: Option<Bytes>,
    /// Application bytes, subject to the service's payload limit.
    pub payload: Bytes,
    /// Delivery requested on both hops, independently of transport availability.
    pub delivery: SignalDelivery,
}

/// A signal with sender identity bound by the relay, never trusted from its payload.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SignalMessage {
    /// Connection that submitted the message.
    pub sender: Bytes,
    /// Original routing, payload, and delivery mode.
    pub submission: SignalSubmission,
}

/// Live signal traffic and reliable membership observations.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SignalEvent {
    /// First event: an atomic membership view with subsequent changes queued without a gap.
    Members(Vec<SignalMember>),
    /// A connection became available for routing.
    Joined(SignalMember),
    /// A connection is no longer available for routing.
    Left(Bytes),
    /// Application message, unrelated to the document event stream.
    Message(SignalMessage),
}

/// Document-bound registration factory, without storage or append authority.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaSignalService: crate::SeaService {
    /// Live connection returned by this document-bound service.
    type Connection: SeaSignals;
    /// Registers a connection identity and public metadata without append authority.
    async fn open_signals(
        &self,
        member: SignalMember,
    ) -> Result<std::sync::Arc<Self::Connection>, Self::Error>;
}

/// One live signal connection, without storage or append authority.
///
/// Exactly one receive operation may be pending at a time. Cancellation of a pending receive
/// must not consume a message. Close is idempotent and wakes pending receivers.
/// A successful send means admission only, not remote receipt or processing.
/// Missing targets are allowed and receive nothing. Signals are never replayed after reconnect.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaSignals: crate::SeaService {
    /// Submits an opaque message without waiting for document operations.
    async fn send_signal(&self, submission: SignalSubmission) -> Result<(), Self::Error>;
    /// Receives a live event, ends after close, or reports a terminal delivery failure.
    async fn next_signal(&self) -> Result<Option<SignalEvent>, Self::Error>;
    /// Releases only signal membership; does not close archive or author access.
    async fn close_signals(&self) -> Result<(), Self::Error>;
}
