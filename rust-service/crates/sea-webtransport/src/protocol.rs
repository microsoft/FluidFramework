//! Bounded versioned wire values for Sea sessions.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize, de::DeserializeOwned};
use thiserror::Error;

/// Current Sea logical-stream opening version.
pub const PROTOCOL_VERSION: u16 = 4;

/// Explicit wire identity of every Sea network message.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(u8)]
pub enum MessageKind {
    /// Event submission request.
    Submit = 3,
    /// Submission-resolution request.
    ResolveSubmission = 4,
    /// Bounded event-read request.
    Read = 5,
    /// Blob-publication request.
    PutBlob = 6,
    /// Blob-lookup request.
    GetBlob = 7,
    /// Directory-publication request.
    PutDirectory = 8,
    /// Directory-lookup request.
    GetDirectory = 9,
    /// Snapshot-lookup request.
    GetSnapshot = 10,
    /// Latest-snapshot request.
    LatestSnapshot = 11,
    /// Snapshot-publication resolution request.
    ResolveSnapshot = 13,
    /// Logical-session close request.
    Close = 16,
    /// Event-stream opening request.
    OpenEventStream = 17,
    /// Author-stream opening request.
    OpenAuthorStream = 18,
    /// Snapshot-stream opening request.
    OpenSnapshotStream = 19,
    /// Snapshot-publication request.
    PublishSnapshot = 20,
    /// Content-stream opening request.
    OpenContentStream = 21,
    /// Request acknowledgement response.
    Acknowledged = 128,
    /// Event-commit response.
    EventCommitted = 129,
    /// Submission-resolution response.
    SubmissionResolved = 130,
    /// Blob-publication response.
    BlobStored = 131,
    /// Blob-lookup response.
    Blob = 132,
    /// Directory-publication response.
    DirectoryStored = 133,
    /// Directory-lookup response.
    Directory = 134,
    /// Snapshot lookup or publication response.
    Snapshot = 135,
    /// Recovery snapshot item.
    LoadSnapshot = 136,
    /// Recovery or live event item.
    LoadEvent = 137,
    /// Out-of-band monitored-stream progress.
    StreamProgress = 138,
    /// Event-stream authority response.
    EventStreamOpened = 139,
    /// Snapshot coordination notification.
    SnapshotCoordination = 140,
    /// Bounded-response completion marker.
    ResponseComplete = 141,
    /// Classified service-error response.
    Error = 255,
}

impl TryFrom<u8> for MessageKind {
    type Error = ProtocolError;

    fn try_from(value: u8) -> Result<Self, ProtocolError> {
        match value {
            3 => Ok(Self::Submit),
            4 => Ok(Self::ResolveSubmission),
            5 => Ok(Self::Read),
            6 => Ok(Self::PutBlob),
            7 => Ok(Self::GetBlob),
            8 => Ok(Self::PutDirectory),
            9 => Ok(Self::GetDirectory),
            10 => Ok(Self::GetSnapshot),
            11 => Ok(Self::LatestSnapshot),
            13 => Ok(Self::ResolveSnapshot),
            16 => Ok(Self::Close),
            17 => Ok(Self::OpenEventStream),
            18 => Ok(Self::OpenAuthorStream),
            19 => Ok(Self::OpenSnapshotStream),
            20 => Ok(Self::PublishSnapshot),
            21 => Ok(Self::OpenContentStream),
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
            138 => Ok(Self::StreamProgress),
            139 => Ok(Self::EventStreamOpened),
            140 => Ok(Self::SnapshotCoordination),
            141 => Ok(Self::ResponseComplete),
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
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum StreamRole {
    /// Recovery and live event stream.
    Event,
    /// Ordered submission stream.
    Author,
    /// Latest-value snapshot coordination stream.
    Snapshot,
    /// Correlated content-operation stream.
    Content,
}

impl MessageKind {
    /// Every assigned message kind in numeric order.
    pub const ALL: [Self; 31] = [
        Self::Submit,
        Self::ResolveSubmission,
        Self::Read,
        Self::PutBlob,
        Self::GetBlob,
        Self::PutDirectory,
        Self::GetDirectory,
        Self::GetSnapshot,
        Self::LatestSnapshot,
        Self::ResolveSnapshot,
        Self::Close,
        Self::OpenEventStream,
        Self::OpenAuthorStream,
        Self::OpenSnapshotStream,
        Self::PublishSnapshot,
        Self::OpenContentStream,
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
        Self::StreamProgress,
        Self::EventStreamOpened,
        Self::SnapshotCoordination,
        Self::ResponseComplete,
        Self::Error,
    ];

    /// Returns whether this message kind is valid on `role`.
    #[must_use]
    pub const fn is_valid_on(self, role: StreamRole) -> bool {
        use MessageKind as Kind;
        match role {
            StreamRole::Event => matches!(
                self,
                Kind::OpenEventStream
                    | Kind::LoadSnapshot
                    | Kind::LoadEvent
                    | Kind::StreamProgress
                    | Kind::EventStreamOpened
                    | Kind::Acknowledged
                    | Kind::Error
            ),
            StreamRole::Author => matches!(
                self,
                Kind::OpenAuthorStream
                    | Kind::Submit
                    | Kind::ResolveSubmission
                    | Kind::EventCommitted
                    | Kind::SubmissionResolved
                    | Kind::Close
                    | Kind::Acknowledged
                    | Kind::Error
            ),
            StreamRole::Snapshot => matches!(
                self,
                Kind::OpenSnapshotStream
                    | Kind::PublishSnapshot
                    | Kind::LatestSnapshot
                    | Kind::ResolveSnapshot
                    | Kind::Snapshot
                    | Kind::SnapshotCoordination
                    | Kind::Close
                    | Kind::Acknowledged
                    | Kind::Error
            ),
            StreamRole::Content => matches!(
                self,
                Kind::Read
                    | Kind::OpenContentStream
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
                    | Kind::StreamProgress
                    | Kind::ResponseComplete
                    | Kind::Acknowledged
                    | Kind::Error
            ),
        }
    }

    /// Returns the owning role when this is a request kind.
    #[must_use]
    pub const fn request_role(self) -> Option<StreamRole> {
        match self {
            Self::OpenEventStream => Some(StreamRole::Event),
            Self::OpenAuthorStream | Self::Submit | Self::ResolveSubmission | Self::Close => {
                Some(StreamRole::Author)
            }
            Self::Read
            | Self::OpenContentStream
            | Self::PutBlob
            | Self::GetBlob
            | Self::PutDirectory
            | Self::GetDirectory
            | Self::GetSnapshot => Some(StreamRole::Content),
            Self::LatestSnapshot
            | Self::OpenSnapshotStream
            | Self::PublishSnapshot
            | Self::ResolveSnapshot => Some(StreamRole::Snapshot),
            _ => None,
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

const NETWORK_LENGTH_BYTES: usize = 4;
const NETWORK_HEADER_BYTES: usize = 1 + 8;
/// Smallest complete length-delimited network frame.
pub const MIN_FRAME_BYTES: usize = NETWORK_LENGTH_BYTES + NETWORK_HEADER_BYTES;

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
    if correlation_id == 0
        && !matches!(
            kind,
            MessageKind::LoadEvent | MessageKind::Snapshot | MessageKind::SnapshotCoordination
        )
    {
        Err(ProtocolError::InvalidCorrelationId)
    } else {
        Ok(())
    }
}

/// Stream-scoped active correlation IDs.
#[derive(Debug, Default)]
pub struct CorrelationTracker {
    active: BTreeSet<u64>,
}

impl CorrelationTracker {
    /// Marks a nonzero correlation ID active until its response completes.
    ///
    /// # Errors
    ///
    /// Returns an error for zero or an ID already active on this stream.
    pub fn begin(&mut self, correlation_id: u64) -> Result<(), ProtocolError> {
        if correlation_id == 0 {
            return Err(ProtocolError::InvalidCorrelationId);
        }
        if !self.active.insert(correlation_id) {
            return Err(ProtocolError::CorrelationInUse(correlation_id));
        }
        Ok(())
    }

    /// Completes one active request/response correlation.
    ///
    /// # Errors
    ///
    /// Returns an error when the response ID does not match an active request.
    pub fn complete(&mut self, correlation_id: u64) -> Result<(), ProtocolError> {
        if !self.active.remove(&correlation_id) {
            return Err(ProtocolError::UnknownCorrelation(correlation_id));
        }
        Ok(())
    }

    /// Returns whether `correlation_id` is currently active.
    #[must_use]
    pub fn is_active(&self, correlation_id: u64) -> bool {
        self.active.contains(&correlation_id)
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

    /// Returns whether bytes from an incomplete frame are buffered.
    #[must_use]
    pub fn has_partial_frame(&self) -> bool {
        !self.buffered.is_empty()
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

/// Explicit snapshot publication policy on the Sea wire.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[repr(u8)]
#[serde(try_from = "u8", into = "u8")]
pub enum SnapshotParticipation {
    /// Receives snapshot state but cannot publish.
    ReadOnly = 1,
    /// Publishes only while selected and fenced by Sea.
    SeaSelected = 2,
    /// Publishes under client-managed selection without a Sea fence.
    ClientSelected = 3,
}

/// Explicit monitored-stream delivery state on the Sea wire.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[repr(u8)]
#[serde(try_from = "u8", into = "u8")]
pub enum StreamStatus {
    /// Initial discovery is incomplete, or unread items are known to exist.
    StreamingBacklog = 1,
    /// Initial discovery is complete and the stream is waiting for a new item.
    AwaitingNewItems = 2,
    /// Items are known to be buffering because throughput is limiting delivery.
    FallenBehind = 3,
}

impl TryFrom<u8> for StreamStatus {
    type Error = ProtocolError;

    fn try_from(value: u8) -> Result<Self, ProtocolError> {
        match value {
            1 => Ok(Self::StreamingBacklog),
            2 => Ok(Self::AwaitingNewItems),
            3 => Ok(Self::FallenBehind),
            _ => Err(ProtocolError::UnknownStreamStatus(value)),
        }
    }
}

impl From<StreamStatus> for u8 {
    fn from(value: StreamStatus) -> Self {
        value as Self
    }
}

impl TryFrom<u8> for SnapshotParticipation {
    type Error = ProtocolError;

    fn try_from(value: u8) -> Result<Self, ProtocolError> {
        match value {
            1 => Ok(Self::ReadOnly),
            2 => Ok(Self::SeaSelected),
            3 => Ok(Self::ClientSelected),
            _ => Err(ProtocolError::UnknownSnapshotParticipation(value)),
        }
    }
}

impl From<SnapshotParticipation> for u8 {
    fn from(value: SnapshotParticipation) -> Self {
        value as Self
    }
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

/// Message-kind-specific payload structures encoded inside [`NetworkFrame`].
pub mod payload {
    use serde::{Deserialize, Serialize};

    use super::{
        ArchiveIntent, DirectoryEntry, ErrorKind, Event, Snapshot, SnapshotParticipation,
        SnapshotPosition, StreamStatus, TreeId, WireDurability,
    };

    /// Payload for a message with no fields.
    #[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct Empty;

    /// Archive-bound event-stream opening payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct OpenEventStream {
        /// Proposed protocol version.
        pub version: u16,
        /// Selected archive identity.
        pub archive: Vec<u8>,
        /// Requested archive lifecycle operation.
        pub intent: ArchiveIntent,
        /// Stable author identity.
        pub author: Vec<u8>,
        /// Fresh logical-session identity.
        pub session: Vec<u8>,
        /// Latest event already incorporated by the client.
        pub resume_after: Option<u64>,
    }

    /// Opaque authority returned when an event stream opens.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct EventStreamOpened {
        /// Capability used to bind the session's other logical streams.
        pub authority: Vec<u8>,
    }

    /// Opaque event-stream authority used to bind another logical stream.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct SessionAuthority {
        /// Capability returned by the event-stream opening handshake.
        pub authority: Vec<u8>,
    }

    /// Snapshot coordination stream opening payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct OpenSnapshotStream {
        /// Capability returned by the event-stream opening handshake.
        pub authority: Vec<u8>,
        /// Immutable publication policy for this stream.
        pub participation: SnapshotParticipation,
    }

    /// Snapshot publication payload with an optional Sea selection fence.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct PublishSnapshotRequest {
        /// Current Sea nomination fence, or none for client selection.
        pub fence: Option<u64>,
        /// Snapshot content and publication preconditions.
        pub publication: PublishSnapshot,
    }

    /// Latest accepted snapshot and nomination notification.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct SnapshotCoordination {
        /// Latest accepted snapshot, if one exists.
        pub latest: Option<Snapshot>,
        /// Current nomination fence when this client is selected.
        pub fence: Option<u64>,
    }

    /// Ordered event submission payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct Submit {
        /// Stable retry identity.
        pub operation: Vec<u8>,
        /// Latest event incorporated by the author.
        pub reference: Option<u64>,
        /// Event to sequence.
        pub event: Event,
    }

    /// Stable operation identity payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct Operation {
        /// Stable retry identity.
        pub operation: Vec<u8>,
    }

    /// Bounded historical read payload.
    #[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct Read {
        /// Exclusive starting position.
        pub after: Option<u64>,
        /// Inclusive ending position.
        pub stop_after: Option<u64>,
    }

    /// Immutable blob publication payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct PutBlob {
        /// Exact bytes to store.
        pub payload: Vec<u8>,
    }

    /// Immutable blob identity payload.
    #[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct BlobId {
        /// Domain-separated blob identity.
        pub id: [u8; 32],
    }

    /// Immutable directory publication payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct PutDirectory {
        /// Canonically ordered directory entries.
        pub entries: Vec<DirectoryEntry>,
    }

    /// Immutable directory identity payload.
    #[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct DirectoryId {
        /// Domain-separated directory identity.
        pub id: [u8; 32],
    }

    /// Snapshot publication identity payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct SnapshotId {
        /// Snapshot identity bytes.
        pub id: Vec<u8>,
    }

    /// Conditional snapshot publication payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct PublishSnapshot {
        /// Stable publication identity.
        pub operation: Vec<u8>,
        /// Expected latest publication.
        pub expected_parent: Option<Vec<u8>>,
        /// Included event boundary.
        pub at_event: SnapshotPosition,
        /// Immutable content root.
        pub root: TreeId,
    }

    /// Committed event receipt payload.
    #[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct EventCommitted {
        /// Assigned event position.
        pub position: u64,
        /// Achieved durability class.
        pub durability: WireDurability,
    }

    /// Stable submission resolution payload.
    #[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct SubmissionResolved {
        /// Committed position, or none when definitively absent.
        pub position: Option<u64>,
        /// Original durability, or none when definitively absent.
        pub durability: Option<WireDurability>,
    }

    /// Fetched blob bytes payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct Blob {
        /// Stored blob bytes.
        pub payload: Vec<u8>,
    }

    /// Fetched directory entries payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct Directory {
        /// Stored directory entries.
        pub entries: Vec<DirectoryEntry>,
    }

    /// Optional snapshot response or notification payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct OptionalSnapshot {
        /// Selected snapshot, if one exists.
        pub snapshot: Option<Snapshot>,
    }

    /// Selected recovery snapshot payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct LoadSnapshot {
        /// Snapshot selected for recovery.
        pub snapshot: Snapshot,
    }

    /// Authored event stream payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct LoadEvent {
        /// Authored event and sequencing metadata.
        pub event: super::StreamEvent,
    }

    /// One out-of-band monitored-stream progress snapshot.
    #[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct StreamProgress {
        /// Cursor immediately before the next unread event.
        pub previous: Option<u64>,
        /// Latest event position currently known to the service.
        pub latest_known: Option<u64>,
        /// Current monitored delivery state.
        pub status: StreamStatus,
    }

    /// Classified service failure payload.
    #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
    pub struct Error {
        /// Stable machine-readable error category.
        pub kind: ErrorKind,
        /// Human-readable diagnostic.
        pub message: String,
    }
}

/// One request on a Sea session control or operation stream.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum Request {
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
        stop_after: Option<u64>,
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
    /// Resolves a possibly ambiguous snapshot publication.
    ResolveSnapshot {
        /// Stable retry identity.
        operation: Vec<u8>,
    },
    /// Explicitly closes the logical session.
    Close,
    /// Opens the archive-bound recovery and live event stream.
    OpenEventStream {
        /// Protocol version proposed before archive state is created.
        version: u16,
        /// Archive selected for this logical connection.
        archive: Vec<u8>,
        /// Explicit archive lifecycle intent.
        intent: ArchiveIntent,
        /// Stable author identity used by the later author stream.
        author: Vec<u8>,
        /// Fresh logical session identity.
        session: Vec<u8>,
        /// Latest event already incorporated by this client.
        resume_after: Option<u64>,
    },
    /// Opens the ordered author stream for an established logical session.
    OpenAuthorStream {
        /// Authority returned by the event stream.
        authority: Vec<u8>,
    },
    /// Opens reusable content operations for an established logical session.
    OpenContentStream {
        /// Authority returned by the event stream.
        authority: Vec<u8>,
    },
    /// Opens latest-value snapshot coordination for an established session.
    OpenSnapshotStream {
        /// Authority returned by the event stream.
        authority: Vec<u8>,
        /// This stream's immutable publication participation policy.
        participation: SnapshotParticipation,
    },
    /// Publishes under Sea-selected or client-selected authority.
    PublishSnapshot {
        /// Current Sea fence, or none for client-selected publication.
        fence: Option<u64>,
        /// Stable publication identity.
        operation: Vec<u8>,
        /// Expected latest publication.
        expected_parent: Option<Vec<u8>>,
        /// Included event boundary.
        at_event: SnapshotPosition,
        /// Immutable content root.
        root: TreeId,
    },
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
    /// One out-of-band monitored-stream progress snapshot.
    StreamProgress {
        /// Cursor immediately before the next unread event.
        previous: Option<u64>,
        /// Latest event position currently known to the service.
        latest_known: Option<u64>,
        /// Current monitored delivery state.
        status: StreamStatus,
    },
    /// Stable classified failure without implementation details.
    Error {
        /// Machine-readable error category.
        kind: ErrorKind,
        /// Human-readable diagnostic.
        message: String,
    },
    /// The event stream opened with this opaque logical-session authority.
    EventStreamOpened {
        /// Capability required to bind later logical streams.
        authority: Vec<u8>,
    },
    /// Latest accepted snapshot and this client's nomination state.
    SnapshotCoordination {
        /// Latest accepted snapshot, if any.
        latest: Option<Snapshot>,
        /// Current fence when this client is nominated.
        fence: Option<u64>,
    },
    /// Marks the end of one bounded correlated response.
    ResponseComplete,
}

impl Request {
    /// Returns the explicit network kind for this request.
    #[must_use]
    pub const fn kind(&self) -> MessageKind {
        match self {
            Self::OpenEventStream { .. } => MessageKind::OpenEventStream,
            Self::OpenAuthorStream { .. } => MessageKind::OpenAuthorStream,
            Self::OpenContentStream { .. } => MessageKind::OpenContentStream,
            Self::OpenSnapshotStream { .. } => MessageKind::OpenSnapshotStream,
            Self::PublishSnapshot { .. } => MessageKind::PublishSnapshot,
            Self::Submit { .. } => MessageKind::Submit,
            Self::ResolveSubmission { .. } => MessageKind::ResolveSubmission,
            Self::Read { .. } => MessageKind::Read,
            Self::PutBlob { .. } => MessageKind::PutBlob,
            Self::GetBlob { .. } => MessageKind::GetBlob,
            Self::PutDirectory { .. } => MessageKind::PutDirectory,
            Self::GetDirectory { .. } => MessageKind::GetDirectory,
            Self::GetSnapshot { .. } => MessageKind::GetSnapshot,
            Self::LatestSnapshot => MessageKind::LatestSnapshot,
            Self::ResolveSnapshot { .. } => MessageKind::ResolveSnapshot,
            Self::Close => MessageKind::Close,
        }
    }

    /// Returns the logical stream that owns this request.
    #[must_use]
    pub const fn stream_role(&self) -> StreamRole {
        match self {
            Self::OpenEventStream { .. } => StreamRole::Event,
            Self::OpenAuthorStream { .. }
            | Self::Submit { .. }
            | Self::ResolveSubmission { .. }
            | Self::Close => StreamRole::Author,
            Self::Read { .. }
            | Self::OpenContentStream { .. }
            | Self::PutBlob { .. }
            | Self::GetBlob { .. }
            | Self::PutDirectory { .. }
            | Self::GetDirectory { .. }
            | Self::GetSnapshot { .. } => StreamRole::Content,
            Self::LatestSnapshot
            | Self::OpenSnapshotStream { .. }
            | Self::PublishSnapshot { .. }
            | Self::ResolveSnapshot { .. } => StreamRole::Snapshot,
        }
    }
}

impl Response {
    /// Returns the explicit network kind for this response.
    #[must_use]
    pub const fn kind(&self) -> MessageKind {
        match self {
            Self::Acknowledged => MessageKind::Acknowledged,
            Self::EventStreamOpened { .. } => MessageKind::EventStreamOpened,
            Self::SnapshotCoordination { .. } => MessageKind::SnapshotCoordination,
            Self::ResponseComplete => MessageKind::ResponseComplete,
            Self::EventCommitted { .. } => MessageKind::EventCommitted,
            Self::SubmissionResolved { .. } => MessageKind::SubmissionResolved,
            Self::BlobStored { .. } => MessageKind::BlobStored,
            Self::Blob(_) => MessageKind::Blob,
            Self::DirectoryStored { .. } => MessageKind::DirectoryStored,
            Self::Directory(_) => MessageKind::Directory,
            Self::Snapshot(_) => MessageKind::Snapshot,
            Self::LoadSnapshot(_) => MessageKind::LoadSnapshot,
            Self::LoadEvent(_) => MessageKind::LoadEvent,
            Self::StreamProgress { .. } => MessageKind::StreamProgress,
            Self::Error { .. } => MessageKind::Error,
        }
    }
}

fn encode_typed_payload<T: Serialize>(
    role: StreamRole,
    kind: MessageKind,
    correlation_id: u64,
    payload: &T,
    limits: Limits,
) -> Result<Vec<u8>, ProtocolError> {
    kind.validate_on(role)?;
    let payload = postcard::to_allocvec(payload).map_err(ProtocolError::InvalidPayload)?;
    encode_network_frame(
        &NetworkFrame {
            kind,
            correlation_id,
            payload,
        },
        limits,
    )
}

fn decode_typed_payload<T: DeserializeOwned>(frame: &NetworkFrame) -> Result<T, ProtocolError> {
    postcard::from_bytes(&frame.payload).map_err(ProtocolError::InvalidPayload)
}

/// Encodes a request without serializing the outer [`Request`] enum.
///
/// # Errors
///
/// Returns an error for a wrong-stream kind, zero request correlation, malformed payload, or size
/// limit violation.
#[allow(clippy::too_many_lines)]
pub fn encode_request_frame(
    role: StreamRole,
    correlation_id: u64,
    request: &Request,
    limits: Limits,
) -> Result<Vec<u8>, ProtocolError> {
    use payload as wire;
    match request {
        Request::OpenEventStream {
            version,
            archive,
            intent,
            author,
            session,
            resume_after,
        } => encode_typed_payload(
            role,
            request.kind(),
            correlation_id,
            &wire::OpenEventStream {
                version: *version,
                archive: archive.clone(),
                intent: *intent,
                author: author.clone(),
                session: session.clone(),
                resume_after: *resume_after,
            },
            limits,
        ),
        Request::OpenAuthorStream { authority } | Request::OpenContentStream { authority } => {
            encode_typed_payload(
                role,
                request.kind(),
                correlation_id,
                &wire::SessionAuthority {
                    authority: authority.clone(),
                },
                limits,
            )
        }
        Request::OpenSnapshotStream {
            authority,
            participation,
        } => encode_typed_payload(
            role,
            request.kind(),
            correlation_id,
            &wire::OpenSnapshotStream {
                authority: authority.clone(),
                participation: *participation,
            },
            limits,
        ),
        Request::PublishSnapshot {
            fence,
            operation,
            expected_parent,
            at_event,
            root,
        } => encode_typed_payload(
            role,
            request.kind(),
            correlation_id,
            &wire::PublishSnapshotRequest {
                fence: *fence,
                publication: wire::PublishSnapshot {
                    operation: operation.clone(),
                    expected_parent: expected_parent.clone(),
                    at_event: *at_event,
                    root: *root,
                },
            },
            limits,
        ),
        Request::Submit {
            operation,
            reference,
            event,
        } => encode_typed_payload(
            role,
            request.kind(),
            correlation_id,
            &wire::Submit {
                operation: operation.clone(),
                reference: *reference,
                event: event.clone(),
            },
            limits,
        ),
        Request::ResolveSubmission { operation } | Request::ResolveSnapshot { operation } => {
            encode_typed_payload(
                role,
                request.kind(),
                correlation_id,
                &wire::Operation {
                    operation: operation.clone(),
                },
                limits,
            )
        }
        Request::Read { after, stop_after } => encode_typed_payload(
            role,
            request.kind(),
            correlation_id,
            &wire::Read {
                after: *after,
                stop_after: *stop_after,
            },
            limits,
        ),
        Request::PutBlob { payload } => encode_typed_payload(
            role,
            request.kind(),
            correlation_id,
            &wire::PutBlob {
                payload: payload.clone(),
            },
            limits,
        ),
        Request::GetBlob { id } => encode_typed_payload(
            role,
            request.kind(),
            correlation_id,
            &wire::BlobId { id: *id },
            limits,
        ),
        Request::PutDirectory { entries } => encode_typed_payload(
            role,
            request.kind(),
            correlation_id,
            &wire::PutDirectory {
                entries: entries.clone(),
            },
            limits,
        ),
        Request::GetDirectory { id } => encode_typed_payload(
            role,
            request.kind(),
            correlation_id,
            &wire::DirectoryId { id: *id },
            limits,
        ),
        Request::GetSnapshot { id } => encode_typed_payload(
            role,
            request.kind(),
            correlation_id,
            &wire::SnapshotId { id: id.clone() },
            limits,
        ),
        Request::LatestSnapshot | Request::Close => {
            encode_typed_payload(role, request.kind(), correlation_id, &wire::Empty, limits)
        }
    }
}

/// Decodes a request from an explicitly identified payload.
///
/// # Errors
///
/// Returns an error for a wrong-stream or response kind, invalid correlation, or malformed payload.
#[allow(clippy::too_many_lines)]
pub fn decode_request_frame(
    role: StreamRole,
    frame: &NetworkFrame,
) -> Result<Request, ProtocolError> {
    use payload as wire;
    frame.kind.validate_on(role)?;
    validate_correlation(frame.kind, frame.correlation_id)?;
    Ok(match frame.kind {
        MessageKind::OpenEventStream => {
            let value: wire::OpenEventStream = decode_typed_payload(frame)?;
            Request::OpenEventStream {
                version: value.version,
                archive: value.archive,
                intent: value.intent,
                author: value.author,
                session: value.session,
                resume_after: value.resume_after,
            }
        }
        MessageKind::OpenAuthorStream => {
            let value: wire::SessionAuthority = decode_typed_payload(frame)?;
            Request::OpenAuthorStream {
                authority: value.authority,
            }
        }
        MessageKind::OpenContentStream => {
            let value: wire::SessionAuthority = decode_typed_payload(frame)?;
            Request::OpenContentStream {
                authority: value.authority,
            }
        }
        MessageKind::OpenSnapshotStream => {
            let value: wire::OpenSnapshotStream = decode_typed_payload(frame)?;
            Request::OpenSnapshotStream {
                authority: value.authority,
                participation: value.participation,
            }
        }
        MessageKind::PublishSnapshot => {
            let value: wire::PublishSnapshotRequest = decode_typed_payload(frame)?;
            Request::PublishSnapshot {
                fence: value.fence,
                operation: value.publication.operation,
                expected_parent: value.publication.expected_parent,
                at_event: value.publication.at_event,
                root: value.publication.root,
            }
        }
        MessageKind::Submit => {
            let value: wire::Submit = decode_typed_payload(frame)?;
            Request::Submit {
                operation: value.operation,
                reference: value.reference,
                event: value.event,
            }
        }
        MessageKind::ResolveSubmission | MessageKind::ResolveSnapshot => {
            let value: wire::Operation = decode_typed_payload(frame)?;
            if frame.kind == MessageKind::ResolveSubmission {
                Request::ResolveSubmission {
                    operation: value.operation,
                }
            } else {
                Request::ResolveSnapshot {
                    operation: value.operation,
                }
            }
        }
        MessageKind::Read => {
            let value: wire::Read = decode_typed_payload(frame)?;
            Request::Read {
                after: value.after,
                stop_after: value.stop_after,
            }
        }
        MessageKind::PutBlob => {
            let value: wire::PutBlob = decode_typed_payload(frame)?;
            Request::PutBlob {
                payload: value.payload,
            }
        }
        MessageKind::GetBlob => {
            let value: wire::BlobId = decode_typed_payload(frame)?;
            Request::GetBlob { id: value.id }
        }
        MessageKind::PutDirectory => {
            let value: wire::PutDirectory = decode_typed_payload(frame)?;
            Request::PutDirectory {
                entries: value.entries,
            }
        }
        MessageKind::GetDirectory => {
            let value: wire::DirectoryId = decode_typed_payload(frame)?;
            Request::GetDirectory { id: value.id }
        }
        MessageKind::GetSnapshot => {
            let value: wire::SnapshotId = decode_typed_payload(frame)?;
            Request::GetSnapshot { id: value.id }
        }
        MessageKind::LatestSnapshot => {
            let _: wire::Empty = decode_typed_payload(frame)?;
            Request::LatestSnapshot
        }
        MessageKind::Close => {
            let _: wire::Empty = decode_typed_payload(frame)?;
            Request::Close
        }
        _ => return Err(ProtocolError::UnexpectedMessageDirection(frame.kind)),
    })
}

/// Encodes a response without serializing the outer [`Response`] enum.
///
/// # Errors
///
/// Returns an error for a wrong-stream kind, invalid correlation, malformed payload, or size limit.
#[allow(clippy::too_many_lines)]
pub fn encode_response_frame(
    role: StreamRole,
    correlation_id: u64,
    response: &Response,
    limits: Limits,
) -> Result<Vec<u8>, ProtocolError> {
    use payload as wire;
    match response {
        Response::Acknowledged | Response::ResponseComplete => {
            encode_typed_payload(role, response.kind(), correlation_id, &wire::Empty, limits)
        }
        Response::EventStreamOpened { authority } => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::EventStreamOpened {
                authority: authority.clone(),
            },
            limits,
        ),
        Response::SnapshotCoordination { latest, fence } => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::SnapshotCoordination {
                latest: latest.clone(),
                fence: *fence,
            },
            limits,
        ),
        Response::EventCommitted {
            position,
            durability,
        } => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::EventCommitted {
                position: *position,
                durability: *durability,
            },
            limits,
        ),
        Response::SubmissionResolved {
            position,
            durability,
        } => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::SubmissionResolved {
                position: *position,
                durability: *durability,
            },
            limits,
        ),
        Response::BlobStored { id } => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::BlobId { id: *id },
            limits,
        ),
        Response::Blob(payload) => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::Blob {
                payload: payload.clone(),
            },
            limits,
        ),
        Response::DirectoryStored { id } => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::DirectoryId { id: *id },
            limits,
        ),
        Response::Directory(entries) => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::Directory {
                entries: entries.clone(),
            },
            limits,
        ),
        Response::Snapshot(snapshot) => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::OptionalSnapshot {
                snapshot: snapshot.clone(),
            },
            limits,
        ),
        Response::LoadSnapshot(snapshot) => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::LoadSnapshot {
                snapshot: snapshot.clone(),
            },
            limits,
        ),
        Response::LoadEvent(event) => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::LoadEvent {
                event: (**event).clone(),
            },
            limits,
        ),
        Response::StreamProgress {
            previous,
            latest_known,
            status,
        } => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::StreamProgress {
                previous: *previous,
                latest_known: *latest_known,
                status: *status,
            },
            limits,
        ),
        Response::Error { kind, message } => encode_typed_payload(
            role,
            response.kind(),
            correlation_id,
            &wire::Error {
                kind: *kind,
                message: message.clone(),
            },
            limits,
        ),
    }
}

/// Decodes a response from an explicitly identified payload.
///
/// # Errors
///
/// Returns an error for a wrong-stream or request kind, invalid correlation, or malformed payload.
#[allow(clippy::too_many_lines)]
pub fn decode_response_network_frame(
    role: StreamRole,
    frame: &NetworkFrame,
) -> Result<Response, ProtocolError> {
    use payload as wire;
    frame.kind.validate_on(role)?;
    validate_correlation(frame.kind, frame.correlation_id)?;
    Ok(match frame.kind {
        MessageKind::Acknowledged => {
            let _: wire::Empty = decode_typed_payload(frame)?;
            Response::Acknowledged
        }
        MessageKind::ResponseComplete => {
            let _: wire::Empty = decode_typed_payload(frame)?;
            Response::ResponseComplete
        }
        MessageKind::EventStreamOpened => {
            let value: wire::EventStreamOpened = decode_typed_payload(frame)?;
            Response::EventStreamOpened {
                authority: value.authority,
            }
        }
        MessageKind::SnapshotCoordination => {
            let value: wire::SnapshotCoordination = decode_typed_payload(frame)?;
            Response::SnapshotCoordination {
                latest: value.latest,
                fence: value.fence,
            }
        }
        MessageKind::EventCommitted => {
            let value: wire::EventCommitted = decode_typed_payload(frame)?;
            Response::EventCommitted {
                position: value.position,
                durability: value.durability,
            }
        }
        MessageKind::SubmissionResolved => {
            let value: wire::SubmissionResolved = decode_typed_payload(frame)?;
            Response::SubmissionResolved {
                position: value.position,
                durability: value.durability,
            }
        }
        MessageKind::BlobStored => {
            let value: wire::BlobId = decode_typed_payload(frame)?;
            Response::BlobStored { id: value.id }
        }
        MessageKind::Blob => {
            let value: wire::Blob = decode_typed_payload(frame)?;
            Response::Blob(value.payload)
        }
        MessageKind::DirectoryStored => {
            let value: wire::DirectoryId = decode_typed_payload(frame)?;
            Response::DirectoryStored { id: value.id }
        }
        MessageKind::Directory => {
            let value: wire::Directory = decode_typed_payload(frame)?;
            Response::Directory(value.entries)
        }
        MessageKind::Snapshot => {
            let value: wire::OptionalSnapshot = decode_typed_payload(frame)?;
            Response::Snapshot(value.snapshot)
        }
        MessageKind::LoadSnapshot => {
            let value: wire::LoadSnapshot = decode_typed_payload(frame)?;
            Response::LoadSnapshot(value.snapshot)
        }
        MessageKind::LoadEvent => {
            let value: wire::LoadEvent = decode_typed_payload(frame)?;
            Response::LoadEvent(Box::new(value.event))
        }
        MessageKind::StreamProgress => {
            let value: wire::StreamProgress = decode_typed_payload(frame)?;
            Response::StreamProgress {
                previous: value.previous,
                latest_known: value.latest_known,
                status: value.status,
            }
        }
        MessageKind::Error => {
            let value: wire::Error = decode_typed_payload(frame)?;
            Response::Error {
                kind: value.kind,
                message: value.message,
            }
        }
        _ => return Err(ProtocolError::UnexpectedMessageDirection(frame.kind)),
    })
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

/// Failure to encode or decode one bounded Sea protocol frame.
#[derive(Debug, Error)]
pub enum ProtocolError {
    /// A network message kind byte has no assigned meaning.
    #[error("unknown Sea message kind {0}")]
    UnknownMessageKind(u8),
    /// A durability byte has no assigned meaning.
    #[error("unknown Sea durability {0}")]
    UnknownDurability(u8),
    /// A snapshot participation byte has no assigned meaning.
    #[error("unknown snapshot participation policy {0}")]
    UnknownSnapshotParticipation(u8),
    /// A monitored-stream status byte has no assigned meaning.
    #[error("unknown monitored stream status {0}")]
    UnknownStreamStatus(u8),
    /// A known kind appeared on the wrong request/response side.
    #[error("Sea message {0:?} has the wrong request/response direction")]
    UnexpectedMessageDirection(MessageKind),
    /// A known message kind is invalid on the selected logical stream.
    #[error("Sea message {kind:?} is invalid on {role:?} stream")]
    WrongStream {
        /// Message kind received or requested.
        kind: MessageKind,
        /// Logical stream on which the message appeared.
        role: StreamRole,
    },
    /// A correlation ID violates envelope rules.
    #[error("Sea frame correlation ID is invalid")]
    InvalidCorrelationId,
    /// A request reused an active stream-scoped correlation ID.
    #[error("Sea correlation ID {0} is already active")]
    CorrelationInUse(u64),
    /// A response did not match an active stream-scoped correlation ID.
    #[error("Sea correlation ID {0} is not active")]
    UnknownCorrelation(u64),
    /// A length-delimited envelope ended before its declared boundary.
    #[error("Sea network frame is incomplete")]
    IncompleteFrame,
    /// An encoded or received frame exceeds the configured limit.
    #[error("Sea protocol frame exceeds its configured limit")]
    FrameTooLarge,
    /// The typed payload is malformed or has trailing bytes.
    #[error("invalid Sea protocol payload: {0}")]
    InvalidPayload(postcard::Error),
}

#[cfg(test)]
mod tests {
    use super::{
        ArchiveIntent, CorrelationTracker, DirectoryEntry, ErrorKind, Event, Limits, MessageKind,
        NetworkFrame, NetworkFrameDecoder, PROTOCOL_VERSION, ProtocolError, Request, Response,
        Snapshot, SnapshotParticipation, SnapshotPosition, StreamEvent, StreamRole, StreamStatus,
        TreeId, WireDurability, decode_request_frame, decode_response_network_frame,
        encode_network_frame, encode_request_frame, encode_response_frame,
    };

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
    fn snapshot_participation_rejects_unknown_values() {
        assert!(matches!(
            SnapshotParticipation::try_from(0),
            Err(ProtocolError::UnknownSnapshotParticipation(0))
        ));
        assert!(matches!(
            SnapshotParticipation::try_from(4),
            Err(ProtocolError::UnknownSnapshotParticipation(4))
        ));
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
            kind: MessageKind::OpenEventStream,
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

    #[test]
    fn network_decoder_rejects_unknown_kinds_and_invalid_correlations() {
        let mut unknown_kind = NetworkFrameDecoder::new(Limits::default());
        unknown_kind.push(&[0, 0, 0, 9, 12, 0, 0, 0, 0, 0, 0, 0, 1]);
        assert!(matches!(
            unknown_kind.next_frame(),
            Err(ProtocolError::UnknownMessageKind(12))
        ));

        let mut zero_correlation = NetworkFrameDecoder::new(Limits::default());
        zero_correlation.push(&[0, 0, 0, 9, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
        assert!(matches!(
            zero_correlation.next_frame(),
            Err(ProtocolError::InvalidCorrelationId)
        ));
    }

    #[test]
    fn correlations_reject_reuse_and_mismatched_completion() {
        let mut tracker = CorrelationTracker::default();
        tracker.begin(7).expect("first use");
        assert!(tracker.is_active(7));
        assert!(matches!(
            tracker.begin(7),
            Err(ProtocolError::CorrelationInUse(7))
        ));
        assert!(matches!(
            tracker.complete(8),
            Err(ProtocolError::UnknownCorrelation(8))
        ));
        tracker.complete(7).expect("matching response");
        tracker.begin(7).expect("reuse after completion");
        assert!(matches!(
            tracker.begin(0),
            Err(ProtocolError::InvalidCorrelationId)
        ));
    }

    #[test]
    fn zero_correlation_is_reserved_for_notifications() {
        assert!(
            encode_network_frame(
                &NetworkFrame {
                    kind: MessageKind::LoadEvent,
                    correlation_id: 0,
                    payload: Vec::new(),
                },
                Limits::default(),
            )
            .is_ok()
        );
        assert!(matches!(
            encode_network_frame(
                &NetworkFrame {
                    kind: MessageKind::Acknowledged,
                    correlation_id: 0,
                    payload: Vec::new(),
                },
                Limits::default(),
            ),
            Err(ProtocolError::InvalidCorrelationId)
        ));
    }

    #[test]
    #[allow(clippy::too_many_lines)]
    fn every_request_payload_round_trips_without_outer_enum_encoding() {
        let event = Event {
            payload: b"payload".to_vec(),
            blob_tree: Some(TreeId::Blob([3; 32])),
        };
        let entries = vec![DirectoryEntry {
            name: "leaf".to_owned(),
            child: TreeId::Blob([4; 32]),
        }];
        let cases = vec![
            (
                StreamRole::Event,
                Request::OpenEventStream {
                    version: PROTOCOL_VERSION,
                    archive: b"archive".to_vec(),
                    intent: ArchiveIntent::Open,
                    author: b"author".to_vec(),
                    session: b"session".to_vec(),
                    resume_after: Some(1),
                },
            ),
            (
                StreamRole::Author,
                Request::OpenAuthorStream {
                    authority: vec![7; 32],
                },
            ),
            (
                StreamRole::Content,
                Request::OpenContentStream {
                    authority: vec![7; 32],
                },
            ),
            (
                StreamRole::Snapshot,
                Request::OpenSnapshotStream {
                    authority: vec![7; 32],
                    participation: SnapshotParticipation::SeaSelected,
                },
            ),
            (
                StreamRole::Snapshot,
                Request::PublishSnapshot {
                    fence: Some(3),
                    operation: b"snapshot-operation".to_vec(),
                    expected_parent: None,
                    at_event: SnapshotPosition::At(2),
                    root: TreeId::Directory([9; 32]),
                },
            ),
            (
                StreamRole::Author,
                Request::Submit {
                    operation: b"operation".to_vec(),
                    reference: Some(1),
                    event,
                },
            ),
            (
                StreamRole::Author,
                Request::ResolveSubmission {
                    operation: b"operation".to_vec(),
                },
            ),
            (
                StreamRole::Content,
                Request::Read {
                    after: Some(1),
                    stop_after: Some(2),
                },
            ),
            (
                StreamRole::Content,
                Request::PutBlob {
                    payload: b"blob".to_vec(),
                },
            ),
            (StreamRole::Content, Request::GetBlob { id: [5; 32] }),
            (StreamRole::Content, Request::PutDirectory { entries }),
            (StreamRole::Content, Request::GetDirectory { id: [6; 32] }),
            (StreamRole::Content, Request::GetSnapshot { id: vec![7; 8] }),
            (StreamRole::Snapshot, Request::LatestSnapshot),
            (
                StreamRole::Snapshot,
                Request::ResolveSnapshot {
                    operation: b"snapshot-operation".to_vec(),
                },
            ),
            (StreamRole::Author, Request::Close),
        ];
        for (role, request) in cases {
            let encoded = encode_request_frame(role, 17, &request, Limits::default())
                .expect("request encoding");
            assert_eq!(encoded[4], u8::from(request.kind()));
            let frame = decode_one_network_frame(&encoded);
            assert_eq!(frame.correlation_id, 17);
            assert_eq!(
                decode_request_frame(role, &frame).expect("request decoding"),
                request
            );
        }
        for participation in [
            SnapshotParticipation::ReadOnly,
            SnapshotParticipation::SeaSelected,
            SnapshotParticipation::ClientSelected,
        ] {
            let request = Request::OpenSnapshotStream {
                authority: vec![7; 32],
                participation,
            };
            let encoded =
                encode_request_frame(StreamRole::Snapshot, 18, &request, Limits::default())
                    .expect("snapshot participation encoding");
            let frame = decode_one_network_frame(&encoded);
            assert_eq!(
                decode_request_frame(StreamRole::Snapshot, &frame)
                    .expect("snapshot participation decoding"),
                request
            );
        }
    }

    #[test]
    fn every_response_payload_round_trips_without_outer_enum_encoding() {
        let snapshot = Snapshot {
            id: vec![1; 8],
            parent: None,
            at_event: SnapshotPosition::At(2),
            root: TreeId::Directory([2; 32]),
        };
        let stream_event = StreamEvent {
            position: 2,
            author: b"author".to_vec(),
            session: b"session".to_vec(),
            operation: b"operation".to_vec(),
            reference: Some(1),
            minimum_reference: Some(1),
            event: Event {
                payload: b"event".to_vec(),
                blob_tree: None,
            },
        };
        let cases = vec![
            (StreamRole::Author, Response::Acknowledged),
            (StreamRole::Content, Response::ResponseComplete),
            (
                StreamRole::Event,
                Response::EventStreamOpened {
                    authority: vec![7; 32],
                },
            ),
            (
                StreamRole::Snapshot,
                Response::SnapshotCoordination {
                    latest: Some(snapshot.clone()),
                    fence: Some(3),
                },
            ),
            (
                StreamRole::Author,
                Response::EventCommitted {
                    position: 2,
                    durability: WireDurability::Durable,
                },
            ),
            (
                StreamRole::Author,
                Response::SubmissionResolved {
                    position: Some(2),
                    durability: Some(WireDurability::Durable),
                },
            ),
            (StreamRole::Content, Response::BlobStored { id: [3; 32] }),
            (StreamRole::Content, Response::Blob(b"blob".to_vec())),
            (
                StreamRole::Content,
                Response::DirectoryStored { id: [4; 32] },
            ),
            (
                StreamRole::Content,
                Response::Directory(vec![DirectoryEntry {
                    name: "leaf".to_owned(),
                    child: TreeId::Blob([5; 32]),
                }]),
            ),
            (
                StreamRole::Snapshot,
                Response::Snapshot(Some(snapshot.clone())),
            ),
            (StreamRole::Event, Response::LoadSnapshot(snapshot)),
            (
                StreamRole::Event,
                Response::LoadEvent(Box::new(stream_event)),
            ),
            (
                StreamRole::Event,
                Response::StreamProgress {
                    previous: Some(1),
                    latest_known: Some(2),
                    status: StreamStatus::StreamingBacklog,
                },
            ),
            (
                StreamRole::Author,
                Response::Error {
                    kind: ErrorKind::Rejected,
                    message: "rejected".to_owned(),
                },
            ),
        ];
        for (role, response) in cases {
            let encoded = encode_response_frame(role, 19, &response, Limits::default())
                .expect("response encoding");
            assert_eq!(encoded[4], u8::from(response.kind()));
            let frame = decode_one_network_frame(&encoded);
            assert_eq!(
                decode_response_network_frame(role, &frame).expect("response decoding"),
                response
            );
        }
    }

    #[test]
    fn typed_payloads_reject_wrong_direction_and_malformed_bytes() {
        let response = Response::Acknowledged;
        let encoded = encode_response_frame(StreamRole::Author, 1, &response, Limits::default())
            .expect("response encoding");
        let frame = decode_one_network_frame(&encoded);
        assert!(matches!(
            decode_request_frame(StreamRole::Author, &frame),
            Err(ProtocolError::UnexpectedMessageDirection(
                MessageKind::Acknowledged
            ))
        ));

        let wrong_stream = NetworkFrame {
            kind: MessageKind::Submit,
            correlation_id: 1,
            payload: Vec::new(),
        };
        assert!(matches!(
            decode_request_frame(StreamRole::Content, &wrong_stream),
            Err(ProtocolError::WrongStream { .. })
        ));

        let malformed = NetworkFrame {
            kind: MessageKind::Submit,
            correlation_id: 1,
            payload: vec![0xff],
        };
        assert!(matches!(
            decode_request_frame(StreamRole::Author, &malformed),
            Err(ProtocolError::InvalidPayload(_))
        ));
    }

    fn decode_one_network_frame(encoded: &[u8]) -> NetworkFrame {
        let mut decoder = NetworkFrameDecoder::new(Limits::default());
        decoder.push(encoded);
        decoder
            .next_frame()
            .expect("network decoding")
            .expect("complete network frame")
    }
}
