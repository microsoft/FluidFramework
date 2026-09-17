//! Event archive storage and client access contracts.
//!
//! An event archive holds an append-only ordered collection of events.
//! [`crate::SeaStorage`] defines the trusted backend contract and natively supports only a single writer;
//! `sea-sequencer` coordinates multiple writers and exposes the client-facing traits in this module.
//!
//! Archives use the content-addressed trees in [`crate::blob`] so events can reference immutable
//! content and [`Snapshot`]s can capture the state produced through a [`SnapshotPosition`].
//!
//! "Event Archive" is the "EA" in Sea: Snapshotted Event Archive.

use std::pin::Pin;

use async_trait::async_trait;
use bytes::Bytes;
use futures_core::Stream;

use crate::{BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId};

use crate::snapshot::SnapshotId;
pub use crate::snapshot::{
    PublishedSnapshot, Snapshot, SnapshotCoordination, SnapshotParticipation, SnapshotPosition,
    SnapshotPublication,
};
pub use crate::{
    ArchiveEventStream, ArchiveLoadStream, EventReceipt, EventSubmission, LoadEvent,
    SeaAuthorSession, SeaEventSubscription, SeaService, SeaSession, SeaSnapshotCoordinator,
    SeaSnapshotPublisher, SeaStorage, SessionBounds, StorageEventStream, StorageLoad,
};

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

/// Stable caller-provided identity for an operation whose result may be ambiguous.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct OperationId(Bytes);

impl OperationId {
    /// Creates a nonempty operation identity.
    ///
    /// # Errors
    ///
    /// Returns an error when `value` is empty.
    pub fn new(value: impl Into<Bytes>) -> Result<Self, ValueError> {
        let value = value.into();
        if value.is_empty() {
            return Err(ValueError::EmptyOperationId);
        }
        Ok(Self(value))
    }

    /// Returns the opaque identity bytes.
    #[must_use]
    pub const fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

/// Stable identity of one event author within an archive.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct AuthorId(Bytes);

impl AuthorId {
    /// Creates a nonempty author identity.
    ///
    /// # Errors
    ///
    /// Returns an error when `value` is empty.
    pub fn new(value: impl Into<Bytes>) -> Result<Self, ValueError> {
        let value = value.into();
        if value.is_empty() {
            return Err(ValueError::EmptyAuthorId);
        }
        Ok(Self(value))
    }

    /// Returns the opaque identity bytes.
    #[must_use]
    pub const fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

/// Fresh identity of one logical connection by an author.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct SessionId(Bytes);

impl SessionId {
    /// Creates a nonempty session identity.
    ///
    /// # Errors
    ///
    /// Returns an error when `value` is empty.
    pub fn new(value: impl Into<Bytes>) -> Result<Self, ValueError> {
        let value = value.into();
        if value.is_empty() {
            return Err(ValueError::EmptySessionId);
        }
        Ok(Self(value))
    }

    /// Returns the opaque identity bytes.
    #[must_use]
    pub const fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

#[cfg(test)]
mod identity_tests {
    use bytes::Bytes;

    use super::{AuthorId, OperationId, SessionId, ValueError};

    #[test]
    fn caller_identities_preserve_nonempty_bytes_and_reject_empty_values() {
        let value = Bytes::from_static(b"identity");

        assert_eq!(
            OperationId::new(value.clone())
                .expect("nonempty operation identity")
                .as_bytes(),
            &value
        );
        assert_eq!(
            AuthorId::new(value.clone())
                .expect("nonempty author identity")
                .as_bytes(),
            &value
        );
        assert_eq!(
            SessionId::new(value.clone())
                .expect("nonempty session identity")
                .as_bytes(),
            &value
        );

        assert_eq!(
            OperationId::new(Bytes::new()),
            Err(ValueError::EmptyOperationId)
        );
        assert_eq!(AuthorId::new(Bytes::new()), Err(ValueError::EmptyAuthorId));
        assert_eq!(
            SessionId::new(Bytes::new()),
            Err(ValueError::EmptySessionId)
        );
    }
}

/// Invalid caller-created Sea values.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ValueError {
    /// An operation identity was empty.
    EmptyOperationId,
    /// An author identity was empty.
    EmptyAuthorId,
    /// A session identity was empty.
    EmptySessionId,
}

/// One committed application event returned through Sea interfaces.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommittedEvent {
    /// Stable position assigned when the event committed.
    pub position: EventPosition,
    /// Opaque payload and optional content root supplied by the author.
    pub event: Event,
}

/// One committed event with the sequencing metadata exposed to session consumers.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionCommittedEvent {
    /// Storage commitment and application event.
    pub committed: CommittedEvent,
    /// Stable author identity supplied when the session opened.
    pub author_id: AuthorId,
    /// Connection identity that submitted the event.
    pub session_id: SessionId,
    /// Stable operation identity used for retry resolution.
    pub operation_id: OperationId,
    /// Event position referenced by the author, or initial state.
    pub reference: Option<EventPosition>,
    /// Minimum position still referenced by an active author, when any event exists.
    pub minimum_reference: Option<EventPosition>,
}

#[cfg(not(target_arch = "wasm32"))]
/// Session stream on native targets.
pub type SessionStream<T, E> = Pin<Box<dyn Stream<Item = Result<T, E>> + Send + 'static>>;

#[cfg(target_arch = "wasm32")]
/// Session stream on browser targets.
pub type SessionStream<T, E> = Pin<Box<dyn Stream<Item = Result<T, E>> + 'static>>;

/// Archive-scoped content, historical reads, and snapshot lookup.
///
/// This surface owns no author membership. Each read stream owns its finite read or live
/// subscription, and dropping that stream cancels its work without closing the archive handle.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaArchive: SeaService {
    /// Reads an ordered range of committed application events.
    ///
    /// `after` is an exclusive lower bound; `None` starts at the first event.
    /// `stop_after` is an inclusive upper bound; `None` continues waiting for new events.
    /// Calling this method performs no confirmed I/O; initialization failures are yielded by the
    /// returned stream.
    ///
    /// Event items retain strict archive order. Progress items are out-of-band observations and
    /// may cut ahead of buffered events without changing their order. Initial progress uses
    /// `after` for both `previous` and `latest_known` with `StreamingBacklog` until head discovery
    /// completes. `AwaitingNewItems` reports that an unbounded read has caught up, while
    /// `FallenBehind` reports known throughput-limited buffering.
    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveEventStream<Self::Error>;

    /// Publishes or deduplicates one immutable blob.
    async fn put_blob(&self, payload: Bytes) -> Result<BlobId, Self::Error>;

    /// Fetches one authorized immutable blob.
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error>;

    /// Publishes or deduplicates one immutable directory.
    async fn put_directory(&self, directory: BlobDirectory)
    -> Result<BlobDirectoryId, Self::Error>;

    /// Fetches one authorized immutable directory.
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error>;

    /// Returns one retained snapshot by publication identity.
    async fn snapshot(&self, id: &SnapshotId) -> Result<Option<PublishedSnapshot>, Self::Error>;
}
