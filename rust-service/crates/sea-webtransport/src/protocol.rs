//! Bounded versioned wire values for Sea sessions.

use serde::{Deserialize, Serialize, de::DeserializeOwned};
use thiserror::Error;

/// Current Sea logical-stream opening version.
pub const PROTOCOL_VERSION: u16 = 2;

/// Explicit wire identity of every Sea network message.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(u8)]
pub enum MessageKind {
    CreateArchive = 1,
    OpenSession = 2,
    Submit = 3,
    ResolveSubmission = 4,
    Read = 5,
    PutBlob = 6,
    GetBlob = 7,
    PutDirectory = 8,
    GetDirectory = 9,
    GetSnapshot = 10,
    LatestSnapshot = 11,
    PublishSnapshot = 12,
    ResolveSnapshot = 13,
    Load = 14,
    SubscribeSnapshots = 15,
    Close = 16,
    Acknowledged = 128,
    EventCommitted = 129,
    SubmissionResolved = 130,
    BlobStored = 131,
    Blob = 132,
    DirectoryStored = 133,
    Directory = 134,
    Snapshot = 135,
    LoadSnapshot = 136,
    LoadEvent = 137,
    CaughtUp = 138,
    Error = 255,
}

impl TryFrom<u8> for MessageKind {
    type Error = ProtocolError;

    fn try_from(value: u8) -> Result<Self, ProtocolError> {
        match value {
            1 => Ok(Self::CreateArchive),
            2 => Ok(Self::OpenSession),
            3 => Ok(Self::Submit),
            4 => Ok(Self::ResolveSubmission),
            5 => Ok(Self::Read),
            6 => Ok(Self::PutBlob),
            7 => Ok(Self::GetBlob),
            8 => Ok(Self::PutDirectory),
            9 => Ok(Self::GetDirectory),
            10 => Ok(Self::GetSnapshot),
            11 => Ok(Self::LatestSnapshot),
            12 => Ok(Self::PublishSnapshot),
            13 => Ok(Self::ResolveSnapshot),
            14 => Ok(Self::Load),
            15 => Ok(Self::SubscribeSnapshots),
            16 => Ok(Self::Close),
            128 => Ok(Self::Acknowledged),
            129 => Ok(Self::EventCommitted),
            130 => Ok(Self::SubmissionResolved),
            131 => Ok(Self::BlobStored),
            132 => Ok(Self::Blob),
            133 => Ok(Self::DirectoryStored),
            134 => Ok(Self::Directory),
            135 => Ok(Self::Snapshot),
            136 => Ok(Self::LoadSnapshot),
            137 => Ok(Self::LoadEvent),
            138 => Ok(Self::CaughtUp),
            255 => Ok(Self::Error),
            _ => Err(ProtocolError::UnknownMessageKind(value)),
        }
    }
}

impl From<MessageKind> for u8 {
    fn from(value: MessageKind) -> Self {
        value as Self
    }
}

/// Logical stream on which a message is valid.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StreamRole {
    Control,
    Event,
    Author,
    Snapshot,
    Content,
}

impl MessageKind {
    /// Every assigned message kind in numeric order.
    pub const ALL: [Self; 28] = [
        Self::CreateArchive,
        Self::OpenSession,
        Self::Submit,
        Self::ResolveSubmission,
        Self::Read,
        Self::PutBlob,
        Self::GetBlob,
        Self::PutDirectory,
        Self::GetDirectory,
        Self::GetSnapshot,
        Self::LatestSnapshot,
        Self::PublishSnapshot,
        Self::ResolveSnapshot,
        Self::Load,
        Self::SubscribeSnapshots,
        Self::Close,
        Self::Acknowledged,
        Self::EventCommitted,
        Self::SubmissionResolved,
        Self::BlobStored,
        Self::Blob,
        Self::DirectoryStored,
        Self::Directory,
        Self::Snapshot,
        Self::LoadSnapshot,
        Self::LoadEvent,
        Self::CaughtUp,
        Self::Error,
    ];

    /// Returns whether this message kind is valid on `role`.
    #[must_use]
    pub const fn is_valid_on(self, role: StreamRole) -> bool {
        use MessageKind as Kind;
        match role {
            StreamRole::Control => {
                matches!(self, Kind::CreateArchive | Kind::Acknowledged | Kind::Error)
            }
            StreamRole::Event => matches!(
                self,
                Kind::OpenSession
                    | Kind::Load
                    | Kind::LoadSnapshot
                    | Kind::LoadEvent
                    | Kind::CaughtUp
                    | Kind::Acknowledged
                    | Kind::Error
            ),
            StreamRole::Author => matches!(
                self,
                Kind::Submit
                    | Kind::ResolveSubmission
                    | Kind::EventCommitted
                    | Kind::SubmissionResolved
                    | Kind::Close
                    | Kind::Acknowledged
                    | Kind::Error
            ),
            StreamRole::Snapshot => matches!(
                self,
                Kind::SubscribeSnapshots
                    | Kind::LatestSnapshot
                    | Kind::PublishSnapshot
                    | Kind::ResolveSnapshot
                    | Kind::Snapshot
                    | Kind::Close
                    | Kind::Acknowledged
                    | Kind::Error
            ),
            StreamRole::Content => matches!(
                self,
                Kind::Read
                    | Kind::PutBlob
                    | Kind::GetBlob
                    | Kind::PutDirectory
                    | Kind::GetDirectory
                    | Kind::GetSnapshot
                    | Kind::BlobStored
                    | Kind::Blob
                    | Kind::DirectoryStored
                    | Kind::Directory
                    | Kind::Snapshot
                    | Kind::LoadEvent
                    | Kind::CaughtUp
                    | Kind::Error
            ),
        }
    }

    /// Rejects this message when it is invalid on `role`.
    ///
    /// # Errors
    ///
    /// Returns [`ProtocolError::WrongStream`] when the kind is not valid on `role`.
    pub fn validate_on(self, role: StreamRole) -> Result<(), ProtocolError> {
        self.is_valid_on(role)
            .then_some(())
            .ok_or(ProtocolError::WrongStream { kind: self, role })
    }
}

/// Marker identifying one Sea protocol frame.
pub const MAGIC: [u8; 4] = *b"SEA1";
/// Current Sea protocol version.
pub const VERSION: u8 = 1;
const HEADER_BYTES: usize = MAGIC.len() + 1;
const NETWORK_LENGTH_BYTES: usize = 4;
const NETWORK_HEADER_BYTES: usize = 1 + 8;

/// Maximum accepted encoded frame size.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Limits {
    /// Maximum header and payload bytes in one frame.
    pub max_frame_bytes: usize,
}

/// One explicitly identified and correlated network frame.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NetworkFrame {
    /// Explicit message kind encoded as one assigned byte.
    pub kind: MessageKind,
    /// Stream-scoped request/response identity, or zero for an unsolicited notification.
    pub correlation_id: u64,
    /// Message-kind-specific postcard payload without an outer enum discriminator.
    pub payload: Vec<u8>,
}

/// Encodes one complete bounded network envelope.
///
/// # Errors
///
/// Returns an error for an invalid opening correlation ID, length overflow, or configured limit.
pub fn encode_network_frame(
    frame: &NetworkFrame,
    limits: Limits,
) -> Result<Vec<u8>, ProtocolError> {
    validate_correlation(frame.kind, frame.correlation_id)?;
    let declared_length = NETWORK_HEADER_BYTES
        .checked_add(frame.payload.len())
        .ok_or(ProtocolError::FrameTooLarge)?;
    let complete_length = NETWORK_LENGTH_BYTES
        .checked_add(declared_length)
        .ok_or(ProtocolError::FrameTooLarge)?;
    if complete_length > limits.max_frame_bytes {
        return Err(ProtocolError::FrameTooLarge);
    }
    let declared_length =
        u32::try_from(declared_length).map_err(|_| ProtocolError::FrameTooLarge)?;
    let mut encoded = Vec::with_capacity(complete_length);
    encoded.extend_from_slice(&declared_length.to_be_bytes());
    encoded.push(frame.kind.into());
    encoded.extend_from_slice(&frame.correlation_id.to_be_bytes());
    encoded.extend_from_slice(&frame.payload);
    Ok(encoded)
}

fn validate_correlation(kind: MessageKind, correlation_id: u64) -> Result<(), ProtocolError> {
    if correlation_id == 0 && matches!(kind, MessageKind::CreateArchive | MessageKind::OpenSession)
    {
        Err(ProtocolError::InvalidCorrelationId)
    } else {
        Ok(())
    }
}

/// Incrementally decodes bounded network envelopes while retaining coalesced trailing bytes.
#[derive(Debug)]
pub struct NetworkFrameDecoder {
    buffered: Vec<u8>,
    limits: Limits,
}

impl NetworkFrameDecoder {
    /// Creates an empty decoder with a complete-frame byte limit.
    #[must_use]
    pub const fn new(limits: Limits) -> Self {
        Self {
            buffered: Vec::new(),
            limits,
        }
    }

    /// Adds one arbitrarily fragmented or coalesced input chunk.
    pub fn push(&mut self, bytes: &[u8]) {
        self.buffered.extend_from_slice(bytes);
    }

    /// Returns the next complete frame, retaining bytes for subsequent frames.
    ///
    /// # Errors
    ///
    /// Returns an error for malformed lengths, excessive frames, unknown kinds, or invalid
    /// opening correlations.
    pub fn next_frame(&mut self) -> Result<Option<NetworkFrame>, ProtocolError> {
        let Some(length_bytes) = self.buffered.get(..NETWORK_LENGTH_BYTES) else {
            return Ok(None);
        };
        let declared_length = usize::try_from(u32::from_be_bytes(
            length_bytes
                .try_into()
                .map_err(|_| ProtocolError::IncompleteFrame)?,
        ))
        .map_err(|_| ProtocolError::FrameTooLarge)?;
        if declared_length < NETWORK_HEADER_BYTES {
            return Err(ProtocolError::IncompleteFrame);
        }
        let complete_length = NETWORK_LENGTH_BYTES
            .checked_add(declared_length)
            .ok_or(ProtocolError::FrameTooLarge)?;
        if complete_length > self.limits.max_frame_bytes {
            return Err(ProtocolError::FrameTooLarge);
        }
        if self.buffered.len() < complete_length {
            return Ok(None);
        }
        let kind = MessageKind::try_from(self.buffered[NETWORK_LENGTH_BYTES])?;
        let correlation_start = NETWORK_LENGTH_BYTES + 1;
        let payload_start = NETWORK_LENGTH_BYTES + NETWORK_HEADER_BYTES;
        let correlation_id = u64::from_be_bytes(
            self.buffered[correlation_start..payload_start]
                .try_into()
                .map_err(|_| ProtocolError::IncompleteFrame)?,
        );
        validate_correlation(kind, correlation_id)?;
        let payload = self.buffered[payload_start..complete_length].to_vec();
        self.buffered.drain(..complete_length);
        Ok(Some(NetworkFrame {
            kind,
            correlation_id,
            payload,
        }))
    }

    /// Accepts clean frame-boundary EOF and rejects a truncated envelope.
    ///
    /// # Errors
    ///
    /// Returns [`ProtocolError::IncompleteFrame`] when buffered bytes remain.
    pub fn finish(&self) -> Result<(), ProtocolError> {
        if self.buffered.is_empty() {
            Ok(())
        } else {
            Err(ProtocolError::IncompleteFrame)
        }
    }
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

/// Whether opening an event session creates a new archive or requires an existing archive.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum ArchiveIntent {
    /// Create an archive that must not already exist.
    Create,
    /// Open an archive that must already exist.
    Open,
}

/// Explicitly encoded event durability on the Sea wire.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[repr(u8)]
#[serde(try_from = "u8", into = "u8")]
pub enum WireDurability {
    /// Visible only in process.
    Memory = 1,
    /// Flushed to operating-system-backed storage.
    Buffered = 2,
    /// Persisted according to the backend durability contract.
    Durable = 3,
}

impl TryFrom<u8> for WireDurability {
    type Error = ProtocolError;

    fn try_from(value: u8) -> Result<Self, ProtocolError> {
        match value {
            1 => Ok(Self::Memory),
            2 => Ok(Self::Buffered),
            3 => Ok(Self::Durable),
            _ => Err(ProtocolError::UnknownDurability(value)),
        }
    }
}

impl From<WireDurability> for u8 {
    fn from(value: WireDurability) -> Self {
        value as Self
    }
}

impl WireDurability {
    /// Returns the stable generated-client display name.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Memory => "memory",
            Self::Buffered => "buffered",
            Self::Durable => "durable",
        }
    }
}

/// One request on a Sea session control or operation stream.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum Request {
    /// Creates one archive without opening an author session.
    CreateArchive {
        /// Protocol version proposed before archive state is created.
        version: u16,
        /// Archive identity that must not already exist.
        archive: Vec<u8>,
    },
    /// Opens one archive-bound author session.
    OpenSession {
        /// Protocol version proposed before session state is created.
        version: u16,
        /// Archive selected for this session.
        archive: Vec<u8>,
        /// Explicit archive lifecycle intent.
        intent: ArchiveIntent,
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
        /// Explicit durability class.
        durability: WireDurability,
    },
    /// Submission resolution result.
    SubmissionResolved {
        /// Committed position, or `None` when definitively absent.
        position: Option<u64>,
        /// Original durability class when the submission committed.
        durability: Option<WireDurability>,
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
    /// A network message kind byte has no assigned meaning.
    #[error("unknown Sea message kind {0}")]
    UnknownMessageKind(u8),
    /// A durability byte has no assigned meaning.
    #[error("unknown Sea durability {0}")]
    UnknownDurability(u8),
    /// A known message kind is invalid on the selected logical stream.
    #[error("Sea message {kind:?} is invalid on {role:?} stream")]
    WrongStream { kind: MessageKind, role: StreamRole },
    /// A correlation ID violates envelope rules.
    #[error("Sea frame correlation ID is invalid")]
    InvalidCorrelationId,
    /// A length-delimited envelope ended before its declared boundary.
    #[error("Sea network frame is incomplete")]
    IncompleteFrame,
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
        Event, Frame, Limits, MAGIC, MessageKind, NetworkFrame, NetworkFrameDecoder, ProtocolError,
        Request, StreamRole, TreeId, VERSION, decode, encode, encode_network_frame,
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

    #[test]
    fn every_message_kind_has_one_explicit_byte() {
        for byte in 0_u8..=u8::MAX {
            let decoded = MessageKind::try_from(byte);
            if let Some(kind) = MessageKind::ALL
                .iter()
                .copied()
                .find(|kind| u8::from(*kind) == byte)
            {
                assert_eq!(decoded.expect("assigned message kind"), kind);
            } else {
                assert!(matches!(
                    decoded,
                    Err(ProtocolError::UnknownMessageKind(value)) if value == byte
                ));
            }
        }
    }

    #[test]
    fn network_frames_handle_fragmentation_and_coalescing() {
        let limits = Limits {
            max_frame_bytes: 64,
        };
        let first = NetworkFrame {
            kind: MessageKind::Submit,
            correlation_id: 7,
            payload: b"first".to_vec(),
        };
        let second = NetworkFrame {
            kind: MessageKind::Acknowledged,
            correlation_id: 7,
            payload: Vec::new(),
        };
        let mut bytes = encode_network_frame(&first, limits).expect("first frame");
        bytes.extend(encode_network_frame(&second, limits).expect("second frame"));
        let mut decoder = NetworkFrameDecoder::new(limits);
        decoder.push(&bytes[..2]);
        assert_eq!(decoder.next_frame().expect("partial length"), None);
        decoder.push(&bytes[2..11]);
        assert_eq!(decoder.next_frame().expect("partial frame"), None);
        decoder.push(&bytes[11..]);
        assert_eq!(decoder.next_frame().expect("first decoded"), Some(first));
        assert_eq!(decoder.next_frame().expect("second decoded"), Some(second));
        decoder.finish().expect("clean boundary");
    }

    #[test]
    fn network_frames_reject_limits_correlation_and_wrong_streams() {
        let opening = NetworkFrame {
            kind: MessageKind::OpenSession,
            correlation_id: 0,
            payload: Vec::new(),
        };
        assert!(matches!(
            encode_network_frame(&opening, Limits::default()),
            Err(ProtocolError::InvalidCorrelationId)
        ));
        let oversized = NetworkFrame {
            kind: MessageKind::Blob,
            correlation_id: 1,
            payload: vec![0; 16],
        };
        assert!(matches!(
            encode_network_frame(
                &oversized,
                Limits {
                    max_frame_bytes: 16,
                }
            ),
            Err(ProtocolError::FrameTooLarge)
        ));
        assert!(matches!(
            MessageKind::Submit.validate_on(StreamRole::Content),
            Err(ProtocolError::WrongStream { .. })
        ));
        assert!(MessageKind::Submit.validate_on(StreamRole::Author).is_ok());
    }

    #[test]
    fn network_decoder_rejects_declared_limit_before_payload_arrives() {
        let mut decoder = NetworkFrameDecoder::new(Limits {
            max_frame_bytes: 32,
        });
        decoder.push(&u32::MAX.to_be_bytes());
        assert!(matches!(
            decoder.next_frame(),
            Err(ProtocolError::FrameTooLarge)
        ));

        let mut truncated = NetworkFrameDecoder::new(Limits::default());
        truncated.push(&[0, 0, 0, 9, u8::from(MessageKind::Submit)]);
        assert!(matches!(
            truncated.finish(),
            Err(ProtocolError::IncompleteFrame)
        ));
    }
}
