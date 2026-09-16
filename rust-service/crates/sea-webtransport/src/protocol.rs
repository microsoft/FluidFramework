//! Bounded versioned wire values for Sea sessions.

use serde::{Deserialize, Serialize, de::DeserializeOwned};
use thiserror::Error;

/// Marker identifying one Sea protocol frame.
pub const MAGIC: [u8; 4] = *b"SEA1";
/// Current Sea protocol version.
pub const VERSION: u8 = 1;
const HEADER_BYTES: usize = MAGIC.len() + 1;

/// Maximum accepted encoded frame size.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Limits {
    /// Maximum header and payload bytes in one frame.
    pub max_frame_bytes: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_frame_bytes: 4 * 1024 * 1024,
        }
    }
}

/// A typed blob or directory identity on the wire.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum TreeId {
    /// Domain-separated immutable leaf identity.
    Blob([u8; 32]),
    /// Domain-separated immutable directory identity.
    Directory([u8; 32]),
}

/// One deterministic directory entry.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct DirectoryEntry {
    /// UTF-8 child name containing one path segment.
    pub name: String,
    /// Typed child identity.
    pub child: TreeId,
}

/// Initial state or one included event position.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum SnapshotPosition {
    /// State before the first event.
    Initial,
    /// State through the supplied event position.
    At(u64),
}

/// Snapshot metadata returned by the service.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Snapshot {
    /// Publication identity.
    pub id: Vec<u8>,
    /// Parent publication identity.
    pub parent: Option<Vec<u8>>,
    /// Included event boundary.
    pub at_event: SnapshotPosition,
    /// Immutable content-tree root.
    pub root: TreeId,
}

/// One event submission or committed event value.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Event {
    /// Opaque application payload.
    pub payload: Vec<u8>,
    /// Optional immutable content-tree root.
    pub blob_tree: Option<TreeId>,
}

/// One authored event delivered during catch-up or live continuation.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct StreamEvent {
    /// Stable event position.
    pub position: u64,
    /// Stable author identity.
    pub author: Vec<u8>,
    /// Connection identity that submitted the event.
    pub session: Vec<u8>,
    /// Stable operation identity.
    pub operation: Vec<u8>,
    /// Author reference position.
    pub reference: Option<u64>,
    /// Minimum active reference position.
    pub minimum_reference: Option<u64>,
    /// Opaque event value.
    pub event: Event,
}

/// One request on a Sea session control or operation stream.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum Request {
    /// Opens one archive-bound author session.
    OpenSession {
        /// Archive selected for this session.
        archive: Vec<u8>,
        /// Stable author identity.
        author: Vec<u8>,
        /// Fresh connection identity.
        session: Vec<u8>,
        /// Latest event incorporated by the author.
        reference: Option<u64>,
    },
    /// Submits one event under a stable operation identity.
    Submit {
        /// Stable retry identity.
        operation: Vec<u8>,
        /// Latest event incorporated by the author.
        reference: Option<u64>,
        /// Event to sequence.
        event: Event,
    },
    /// Resolves a possibly ambiguous event submission.
    ResolveSubmission {
        /// Stable retry identity.
        operation: Vec<u8>,
    },
    /// Reads a bounded range of committed application events.
    Read {
        /// Exclusive starting position.
        after: Option<u64>,
        /// Inclusive ending position.
        through: Option<u64>,
    },
    /// Publishes or deduplicates one blob.
    PutBlob {
        /// Exact stored bytes.
        payload: Vec<u8>,
    },
    /// Fetches one authorized blob.
    GetBlob {
        /// Domain-separated blob identity.
        id: [u8; 32],
    },
    /// Publishes or deduplicates one directory.
    PutDirectory {
        /// Canonically ordered directory entries.
        entries: Vec<DirectoryEntry>,
    },
    /// Fetches one authorized directory.
    GetDirectory {
        /// Domain-separated directory identity.
        id: [u8; 32],
    },
    /// Fetches one retained snapshot.
    GetSnapshot {
        /// Publication identity.
        id: Vec<u8>,
    },
    /// Fetches the latest retained snapshot.
    LatestSnapshot,
    /// Conditionally publishes one snapshot.
    PublishSnapshot {
        /// Stable retry identity.
        operation: Vec<u8>,
        /// Expected latest snapshot publication.
        expected_parent: Option<Vec<u8>>,
        /// Included event boundary.
        at_event: SnapshotPosition,
        /// Immutable content-tree root.
        root: TreeId,
    },
    /// Resolves a possibly ambiguous snapshot publication.
    ResolveSnapshot {
        /// Stable retry identity.
        operation: Vec<u8>,
    },
    /// Starts snapshot selection, finite catch-up, and live continuation.
    Load {
        /// Position that a selected snapshot must not exceed.
        required: Option<u64>,
    },
    /// Opens a latest-value snapshot subscription.
    SubscribeSnapshots,
    /// Explicitly closes the logical session.
    Close,
}

/// One response or streamed result from a Sea session.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum Response {
    /// The request completed without another value.
    Acknowledged,
    /// An event committed at this position and durability class.
    EventCommitted {
        /// Stable event position.
        position: u64,
        /// `memory`, `buffered`, or `durable`.
        durability: String,
    },
    /// Submission resolution result.
    SubmissionResolved {
        /// Committed position, or `None` when definitively absent.
        position: Option<u64>,
        /// Original durability class when the submission committed.
        durability: Option<String>,
    },
    /// Published blob identity.
    BlobStored {
        /// Domain-separated identity.
        id: [u8; 32],
    },
    /// Fetched blob bytes.
    Blob(Vec<u8>),
    /// Published directory identity.
    DirectoryStored {
        /// Domain-separated identity.
        id: [u8; 32],
    },
    /// Fetched directory entries.
    Directory(Vec<DirectoryEntry>),
    /// Snapshot lookup or publication result.
    Snapshot(Option<Snapshot>),
    /// One snapshot selected for a load.
    LoadSnapshot(Snapshot),
    /// One event delivered during catch-up or live continuation.
    LoadEvent(Box<StreamEvent>),
    /// Finite catch-up completed through this captured storage head.
    CaughtUp(Option<u64>),
    /// Stable classified failure without implementation details.
    Error {
        /// Machine-readable error category.
        kind: ErrorKind,
        /// Human-readable diagnostic.
        message: String,
    },
}

/// Stable wire error categories.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum ErrorKind {
    /// A position or identity is malformed or unavailable.
    Invalid,
    /// Required retained state is no longer available.
    Stale,
    /// Preconditions or stable identities conflict.
    Conflict,
    /// The operation was definitively rejected.
    Rejected,
    /// The operation may have committed.
    Ambiguous,
    /// The service cannot currently complete the operation.
    Unavailable,
    /// Persisted or received data is corrupt.
    Corrupt,
}

/// One correlated Sea protocol frame.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Frame<T> {
    /// Caller-selected request identity.
    pub request_id: u64,
    /// Typed request or response value.
    pub message: T,
}

/// Failure to encode or decode one bounded Sea protocol frame.
#[derive(Debug, Error)]
pub enum ProtocolError {
    /// The configured limit cannot contain a frame header.
    #[error("maximum frame size is smaller than the Sea protocol header")]
    InvalidLimit,
    /// An encoded or received frame exceeds the configured limit.
    #[error("Sea protocol frame exceeds its configured limit")]
    FrameTooLarge,
    /// The frame marker is absent or invalid.
    #[error("invalid Sea protocol frame marker")]
    InvalidMagic,
    /// The frame uses an unsupported protocol version.
    #[error("unsupported Sea protocol version {0}")]
    UnsupportedVersion(u8),
    /// The typed payload is malformed or has trailing bytes.
    #[error("invalid Sea protocol payload: {0}")]
    InvalidPayload(postcard::Error),
}

/// Encodes one bounded Sea protocol frame.
///
/// # Errors
///
/// Returns an error when the limit is invalid, serialization fails, or the result is too large.
pub fn encode<T: Serialize>(value: &T, limits: Limits) -> Result<Vec<u8>, ProtocolError> {
    if limits.max_frame_bytes < HEADER_BYTES {
        return Err(ProtocolError::InvalidLimit);
    }
    let payload = postcard::to_allocvec(value).map_err(ProtocolError::InvalidPayload)?;
    let frame_length = HEADER_BYTES
        .checked_add(payload.len())
        .ok_or(ProtocolError::FrameTooLarge)?;
    if frame_length > limits.max_frame_bytes {
        return Err(ProtocolError::FrameTooLarge);
    }
    let mut frame = Vec::with_capacity(frame_length);
    frame.extend_from_slice(&MAGIC);
    frame.push(VERSION);
    frame.extend_from_slice(&payload);
    Ok(frame)
}

/// Decodes one complete bounded Sea protocol frame.
///
/// # Errors
///
/// Returns an error for invalid bounds, marker, version, payload, or trailing bytes.
pub fn decode<T: DeserializeOwned>(bytes: &[u8], limits: Limits) -> Result<T, ProtocolError> {
    if limits.max_frame_bytes < HEADER_BYTES {
        return Err(ProtocolError::InvalidLimit);
    }
    if bytes.len() > limits.max_frame_bytes {
        return Err(ProtocolError::FrameTooLarge);
    }
    if bytes.len() < HEADER_BYTES || bytes[..MAGIC.len()] != MAGIC {
        return Err(ProtocolError::InvalidMagic);
    }
    if bytes[MAGIC.len()] != VERSION {
        return Err(ProtocolError::UnsupportedVersion(bytes[MAGIC.len()]));
    }
    postcard::from_bytes(&bytes[HEADER_BYTES..]).map_err(ProtocolError::InvalidPayload)
}

#[cfg(test)]
mod tests {
    use super::{
        Event, Frame, Limits, MAGIC, ProtocolError, Request, TreeId, VERSION, decode, encode,
    };

    #[test]
    fn request_round_trips() {
        let request = Frame {
            request_id: 7,
            message: Request::Submit {
                operation: b"operation".to_vec(),
                reference: Some(42),
                event: Event {
                    payload: b"payload".to_vec(),
                    blob_tree: Some(TreeId::Blob([3; 32])),
                },
            },
        };
        let encoded = encode(&request, Limits::default()).expect("encoding");
        assert_eq!(
            decode::<Frame<Request>>(&encoded, Limits::default()).expect("decoding"),
            request
        );
    }

    #[test]
    fn rejects_bounds_magic_and_version() {
        assert!(matches!(
            encode(
                &Frame {
                    request_id: 1,
                    message: Request::Close,
                },
                Limits { max_frame_bytes: 1 }
            ),
            Err(ProtocolError::InvalidLimit)
        ));
        assert!(matches!(
            decode::<Frame<Request>>(b"FSP4\0", Limits::default()),
            Err(ProtocolError::InvalidMagic)
        ));
        let mut encoded = encode(
            &Frame {
                request_id: 1,
                message: Request::Close,
            },
            Limits::default(),
        )
        .expect("encoding");
        encoded[MAGIC.len()] = VERSION + 1;
        assert!(matches!(
            decode::<Frame<Request>>(&encoded, Limits::default()),
            Err(ProtocolError::UnsupportedVersion(_))
        ));
    }
}
