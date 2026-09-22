#![doc = include_str!("../README.md")]

use std::error::Error;

pub mod archive;
pub mod blob;
pub mod monitored_stream;
/// Session contracts above document storage.
pub mod session;
pub mod signals;
pub mod snapshot;
pub mod storage;

pub use archive::{
    CommittedEvent, Event, EventPosition, EventSubmission, SessionCommittedEvent, SessionId,
    SessionStream, ValueError,
};
pub use blob::{BlobDirectory, BlobDirectoryId, BlobId, BlobTreeError, BlobTreeId};
pub use monitored_stream::{
    BoxMonitoredStream, MonitoredStream, MonitoredStreamItem, MonitoredStreamProgress,
    MonitoredStreamStatus, boxed_monitored_stream, map_monitored_stream,
};
pub use session::{
    SeaArchive, SeaAuthorSession, SeaSession, SeaSnapshotCoordinator, SessionLoad,
    SnapshotCoordination,
};
pub use snapshot::SnapshotParticipation;

/// A monitored stream of ordered archive events.
pub type ArchiveEventStream<E> = BoxMonitoredStream<SessionCommittedEvent, EventPosition, E>;

#[cfg(not(target_arch = "wasm32"))]
/// Thread-safety required from native session implementations.
pub trait SessionBounds: Send + Sync {}

#[cfg(not(target_arch = "wasm32"))]
impl<T: Send + Sync> SessionBounds for T {}

#[cfg(target_arch = "wasm32")]
/// Marker allowing browser sessions to remain single-threaded.
pub trait SessionBounds {}

#[cfg(target_arch = "wasm32")]
impl<T> SessionBounds for T {}

/// Common classified error associated with one Sea service surface.
pub trait SeaService: SessionBounds {
    /// Classified service error.
    type Error: ClassifiedError;
}

/// Persistence guarantees associated with successful publication.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Durability {
    /// Visible to readers in this process, with no persistence guarantee.
    Memory,
    /// Accepted by an operating-system-backed store, possibly in a process-local write buffer.
    /// Orderly persistence requires the backend's flush/shutdown contract; crashes or later
    /// write failures can lose acknowledged data and prevent recovery.
    Buffered,
    /// Persisted according to the implementation's documented crash guarantee.
    Durable,
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

/// An implementation error with a stable client-facing classification.
pub trait ClassifiedError: Error + Send + Sync + 'static {
    /// Returns the implementation-independent failure category.
    fn kind(&self) -> ErrorKind;
}
