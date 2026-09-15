#![doc = "Core contracts for an opaque, client-snapshotted append stream."]

use std::{error::Error, fmt::Debug, pin::Pin};

use async_trait::async_trait;
use bytes::Bytes;
use futures_core::Stream;

pub mod storage;

/// An opaque position scoped to one stream generation.
pub trait StreamPosition: Clone + Debug + Eq + Send + Sync + 'static {}

impl<T> StreamPosition for T where T: Clone + Debug + Eq + Send + Sync + 'static {}

/// The durability completed before a successful append was acknowledged.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Durability {
    /// Visible to readers in this process, with no persistence guarantee.
    Memory,
    /// Submitted to an operating-system-backed store without a crash guarantee.
    Buffered,
    /// Persisted according to the implementation's documented crash guarantee.
    Durable,
}

/// The committed position and durability established by an append.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AppendReceipt<P> {
    /// The opaque position assigned to the appended record.
    pub position: P,
    /// The persistence guarantee completed before the append returned.
    pub durability: Durability,
}

/// One append returned by a reader. Append boundaries are preserved.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReadRecord<P> {
    /// The opaque position assigned when this record was committed.
    pub position: P,
    /// The exact bytes supplied by the corresponding append.
    pub payload: Bytes,
}

/// Stable classes used by clients without erasing implementation details.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ErrorKind {
    /// A position or token is malformed, foreign, or beyond the committed head.
    InvalidPosition,
    /// A formerly valid position is no longer retained.
    StalePosition,
    /// The requested update conflicts with current committed state.
    Conflict,
    /// The implementation definitively refused the operation.
    Rejected,
    /// The operation may have committed even though no acknowledgement was returned.
    Ambiguous,
    /// The implementation cannot currently serve the operation.
    Unavailable,
    /// Persisted data failed structural or integrity validation.
    Corrupt,
}

/// Optional behavior that callers must discover before relying on it.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Capability {
    /// Readers can remain open to observe appends committed after the read begins.
    LiveTailing,
    /// Positions can be encoded as opaque cross-process tokens.
    PositionSerialization,
    /// Committed records can be removed while preserving a readable suffix.
    Retention,
    /// Repeating an append identity cannot commit the payload more than once.
    IdempotentAppend,
}

/// A compact set of optional capabilities.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Capabilities(u8);

impl Capabilities {
    /// A capability set containing no optional behavior.
    pub const NONE: Self = Self(0);

    /// Returns this set with `capability` enabled.
    #[must_use]
    pub const fn with(self, capability: Capability) -> Self {
        Self(self.0 | capability_mask(capability))
    }

    /// Reports whether `capability` is enabled.
    #[must_use]
    pub const fn supports(self, capability: Capability) -> bool {
        self.0 & capability_mask(capability) != 0
    }
}

/// Returns the compact bit assigned to an optional capability.
const fn capability_mask(capability: Capability) -> u8 {
    match capability {
        Capability::LiveTailing => 1 << 0,
        Capability::PositionSerialization => 1 << 1,
        Capability::Retention => 1 << 2,
        Capability::IdempotentAppend => 1 << 3,
    }
}

/// An implementation error with a stable client-facing classification.
pub trait ClassifiedError: Error + Send + Sync + 'static {
    /// Returns the implementation-independent failure category.
    fn kind(&self) -> ErrorKind;
}

/// A finite, backpressured read of data committed when `read` begins.
pub type StreamReader<P, E> = Pin<Box<dyn Stream<Item = Result<ReadRecord<P>, E>> + Send>>;

#[async_trait]
/// An ordered append-only stream with opaque, generation-scoped positions.
pub trait AppendStream: Send + Sync {
    /// The opaque position type produced by this stream implementation.
    type Position: StreamPosition;
    /// The implementation-specific error type with a stable classification.
    type Error: ClassifiedError;

    /// Reports the optional behaviors supported by this implementation.
    fn capabilities(&self) -> Capabilities;

    /// Appends one record while preserving its boundary, including for an empty payload.
    ///
    /// A successful receipt means the record is visible to subsequent readers at the
    /// reported [`Durability`].
    async fn append(&self, value: Bytes) -> Result<AppendReceipt<Self::Position>, Self::Error>;

    /// Reads committed records strictly after `after`, or from the retained beginning.
    ///
    /// The returned reader is finite and ends at the head captured when this method begins.
    /// Dropping it does not affect the stream or other readers.
    ///
    /// # Errors
    ///
    /// Returns an invalid- or stale-position error when `after` is not readable in this stream
    /// generation.
    async fn read(
        &self,
        after: Option<&Self::Position>,
    ) -> Result<StreamReader<Self::Position, Self::Error>, Self::Error>;

    /// Returns the latest committed position, or `None` when the stream is empty.
    ///
    /// # Errors
    ///
    /// Returns an implementation-specific error when the head cannot be read.
    async fn head(&self) -> Result<Option<Self::Position>, Self::Error>;
}

/// Optional serialization for opaque positions that cross a process boundary.
///
/// Tokens are implementation-defined and remain scoped to one stream generation.
/// Consumers must not inspect, compare, or construct them.
pub trait PositionCodec: AppendStream {
    /// Encodes a position as an opaque resume or reference token.
    ///
    /// # Errors
    ///
    /// Returns an invalid-position error when the position is not owned by this stream.
    fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error>;

    /// Decodes an opaque token produced by this implementation.
    ///
    /// # Errors
    ///
    /// Returns an invalid-position error for malformed or foreign-generation tokens.
    fn decode_position(&self, token: &[u8]) -> Result<Self::Position, Self::Error>;
}

/// Identifies the stream state included in a snapshot.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SnapshotPosition<P> {
    /// The snapshot represents state before the first committed record.
    Initial,
    /// The snapshot includes every record through the specified position.
    At(P),
}

/// Client-defined state materialized through a stream position.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Snapshot<P> {
    /// The latest committed record reflected in `payload`.
    pub includes_through: SnapshotPosition<P>,
    /// Opaque state bytes interpreted by the snapshot producer and consumer.
    pub payload: Bytes,
}

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

/// A published snapshot paired with its assigned identity.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublishedSnapshot<P> {
    /// The identity used for optimistic parent checks.
    pub id: SnapshotId,
    /// The state and stream position supplied by the publisher.
    pub snapshot: Snapshot<P>,
}

#[async_trait]
/// A latest-snapshot register coupled to an append-stream position domain.
pub trait SnapshotStore: Send + Sync {
    /// The position type shared with the associated append stream.
    type Position: StreamPosition;
    /// The implementation-specific error type with a stable classification.
    type Error: ClassifiedError;

    /// Returns the latest successfully published snapshot.
    ///
    /// # Errors
    ///
    /// Returns an implementation-specific error when the snapshot cannot be read.
    async fn latest(&self) -> Result<Option<PublishedSnapshot<Self::Position>>, Self::Error>;

    /// Publishes a snapshot when its position and expected parent remain valid.
    ///
    /// `expected_parent` must equal the latest snapshot identifier, or be `None` when no
    /// snapshot exists. The included position must be committed in this generation and must not
    /// regress behind the latest snapshot.
    ///
    /// # Errors
    ///
    /// Returns a conflict for a parent mismatch or position regression, and an invalid- or
    /// stale-position error for an uncommitted or foreign position.
    async fn publish(
        &self,
        snapshot: Snapshot<Self::Position>,
        expected_parent: Option<&SnapshotId>,
    ) -> Result<SnapshotId, Self::Error>;
}
