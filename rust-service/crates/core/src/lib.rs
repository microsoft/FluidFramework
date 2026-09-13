#![doc = "Core contracts for an opaque, client-snapshotted append stream."]

use std::{error::Error, fmt::Debug, pin::Pin};

use async_trait::async_trait;
use bytes::Bytes;
use futures_core::Stream;

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
    pub position: P,
    pub durability: Durability,
}

/// One append returned by a reader. Append boundaries are preserved.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReadRecord<P> {
    pub position: P,
    pub payload: Bytes,
}

/// Stable classes used by clients without erasing implementation details.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ErrorKind {
    InvalidPosition,
    StalePosition,
    Conflict,
    Rejected,
    Ambiguous,
    Unavailable,
    Corrupt,
}

/// Optional behavior that callers must discover before relying on it.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Capability {
    LiveTailing,
    PositionSerialization,
    Retention,
    IdempotentAppend,
}

/// A compact set of optional capabilities.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Capabilities(u8);

impl Capabilities {
    pub const NONE: Self = Self(0);

    #[must_use]
    pub const fn with(self, capability: Capability) -> Self {
        Self(self.0 | capability_mask(capability))
    }

    #[must_use]
    pub const fn supports(self, capability: Capability) -> bool {
        self.0 & capability_mask(capability) != 0
    }
}

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
    fn kind(&self) -> ErrorKind;
}

/// A finite, backpressured read of data committed when `read` begins.
pub type StreamReader<P, E> = Pin<Box<dyn Stream<Item = Result<ReadRecord<P>, E>> + Send>>;

#[async_trait]
/// An ordered append-only stream with opaque, generation-scoped positions.
pub trait AppendStream: Send + Sync {
    type Position: StreamPosition;
    type Error: ClassifiedError;

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

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SnapshotPosition<P> {
    Initial,
    At(P),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Snapshot<P> {
    pub includes_through: SnapshotPosition<P>,
    pub payload: Bytes,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct SnapshotId(Bytes);

impl SnapshotId {
    #[must_use]
    pub fn from_bytes(value: Bytes) -> Self {
        Self(value)
    }

    #[must_use]
    pub fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublishedSnapshot<P> {
    pub id: SnapshotId,
    pub snapshot: Snapshot<P>,
}

#[async_trait]
/// A latest-snapshot register coupled to an append-stream position domain.
pub trait SnapshotStore: Send + Sync {
    type Position: StreamPosition;
    type Error: ClassifiedError;

    /// Returns the latest successfully published snapshot.
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
