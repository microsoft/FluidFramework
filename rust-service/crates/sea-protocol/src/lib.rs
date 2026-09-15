//! Bounded, versioned, transport-neutral frames for the Sea service.
//!
//! Each encoded buffer contains exactly one complete FSP4 frame. Decoding rejects bytes outside
//! the declared body, unconsumed bytes inside it, malformed discriminants, and values exceeding
//! the supplied [`Limits`]. Request kinds and field encodings are wire compatibility boundaries.

use bytes::{Buf, BufMut, Bytes, BytesMut};
use thiserror::Error;

/// The protocol version encoded in every FSP4 frame header.
pub const VERSION: u16 = 2;
/// The fixed byte length of an FSP4 frame header.
pub const HEADER_BYTES: usize = 20;
/// Identifies an FSP4 frame before version and kind decoding.
const MAGIC: &[u8; 4] = b"FSP4";

/// Wire kind for [`Request::Create`].
const CREATE: u8 = 1;
/// Wire kind for [`Request::OpenSession`].
const OPEN_SESSION: u8 = 2;
/// Wire kind for [`Request::Submit`].
const SUBMIT: u8 = 3;
/// Wire kind for [`Request::Read`].
const READ: u8 = 4;
/// Wire kind for [`Request::LatestSnapshot`].
const LATEST_SNAPSHOT: u8 = 5;
/// Wire kind for [`Request::PublishSnapshot`].
const PUBLISH_SNAPSHOT: u8 = 6;
/// Wire kind for [`Request::Shutdown`].
const SHUTDOWN: u8 = 7;
/// Wire kind for [`Request::ReadProjected`].
const READ_PROJECTED: u8 = 8;
/// Wire kind for [`Request::ResolveSubmission`].
const RESOLVE_SUBMISSION: u8 = 9;
/// Wire kind for [`Request::UploadBlob`].
const UPLOAD_BLOB: u8 = 10;
/// Wire kind for [`Request::FetchBlob`].
const FETCH_BLOB: u8 = 11;
/// Wire kind for [`Request::PublishSummary`].
const PUBLISH_SUMMARY: u8 = 12;
/// Wire kind for [`Request::FetchSummary`].
const FETCH_SUMMARY: u8 = 13;
/// Wire kind for [`Request::SubscribeProjected`].
const SUBSCRIBE_PROJECTED: u8 = 14;
/// Wire kind for [`Request::OpenSubmissionStream`].
const OPEN_SUBMISSION_STREAM: u8 = 15;
/// Wire kind for [`Response::Acknowledged`].
const ACKNOWLEDGED: u8 = 64;
/// Wire kind for [`Response::Submitted`].
const SUBMITTED: u8 = 65;
/// Wire kind for [`Response::Read`].
const READ_RESULT: u8 = 66;
/// Wire kind for [`Response::Snapshot`].
const SNAPSHOT_RESULT: u8 = 67;
/// Wire kind for [`Response::ProjectedRead`].
const PROJECTED_READ_RESULT: u8 = 68;
/// Wire kind for [`Response::Resolved`].
const RESOLUTION_RESULT: u8 = 69;
/// Wire kind for [`Response::BlobUploaded`].
const BLOB_UPLOADED: u8 = 70;
/// Wire kind for [`Response::Blob`].
const BLOB_RESULT: u8 = 71;
/// Wire kind for [`Response::SummaryPublished`].
const SUMMARY_PUBLISHED: u8 = 72;
/// Wire kind for [`Response::Summary`].
const SUMMARY_RESULT: u8 = 73;
/// Wire kind for [`Response::ProjectedOperation`].
const PROJECTED_OPERATION: u8 = 74;
/// Wire kind for [`Response::Error`].
const ERROR: u8 = 127;

/// Byte length of every supported content digest.
const CONTENT_DIGEST_BYTES: usize = 32;

/// Configurable upper bounds applied while encoding and decoding frames.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Limits {
    /// Maximum total frame size, including the header.
    pub max_frame_bytes: usize,
    /// Maximum encoded document identifier length.
    pub max_document_bytes: usize,
    /// Maximum writer, session, or submission identifier length.
    pub max_identity_bytes: usize,
    /// Maximum opaque position or snapshot identifier length.
    pub max_position_bytes: usize,
    /// Maximum submitted operation payload length.
    pub max_payload_bytes: usize,
    /// Maximum canonical record payload length returned by a read.
    pub max_record_bytes: usize,
    /// Maximum snapshot payload length.
    pub max_snapshot_bytes: usize,
    /// Maximum number of records or projected operations in one response.
    pub max_read_records: usize,
    /// Maximum content-addressed blob length.
    pub max_blob_bytes: usize,
    /// Maximum number of entries in a summary manifest.
    pub max_summary_entries: usize,
    /// Maximum UTF-8 path length in a summary entry.
    pub max_summary_path_bytes: usize,
}

impl Default for Limits {
    /// Returns the service's default frame and field bounds.
    fn default() -> Self {
        Self {
            max_frame_bytes: 1024 * 1024,
            max_document_bytes: 128,
            max_identity_bytes: 256,
            max_position_bytes: 4096,
            max_payload_bytes: 512 * 1024,
            max_record_bytes: 768 * 1024,
            max_snapshot_bytes: 512 * 1024,
            max_read_records: 1024,
            max_blob_bytes: 512 * 1024,
            max_summary_entries: 4096,
            max_summary_path_bytes: 4096,
        }
    }
}

/// A reference to the initial document state or a canonical position.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Reference {
    /// Refers to the state before the first canonical record.
    Initial,
    /// Refers to the canonical position represented by the opaque bytes.
    At(Bytes),
}

/// A writer operation submitted for authoritative sequencing.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Submission {
    /// Document that owns the submission.
    pub document: Bytes,
    /// Stable writer identity.
    pub writer: Bytes,
    /// Connection-scoped session identity.
    pub session: Bytes,
    /// Stable identity for deduplication and later resolution.
    pub submission: Bytes,
    /// Writer-local sequence number, starting at one and increasing contiguously.
    pub local_sequence_number: u64,
    /// Canonical state on which the operation was based.
    pub reference: Reference,
    /// Opaque operation payload.
    pub payload: Bytes,
}

/// A client request carried by one FSP4 frame.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Request {
    /// Creates a new document.
    Create {
        /// Identifier of the document to create.
        document: Bytes,
    },
    /// Starts a fresh writer session at a known reference position.
    OpenSession {
        /// Document that owns the session.
        document: Bytes,
        /// Stable writer identity.
        writer: Bytes,
        /// Fresh connection-scoped session identity.
        session: Bytes,
        /// Canonical state from which the session begins.
        reference: Reference,
    },
    /// Submits one operation for sequencing.
    Submit(Submission),
    /// Reads canonical records after an optional opaque position.
    Read {
        /// Document whose canonical log is read.
        document: Bytes,
        /// Exclusive resume position, or the beginning when absent.
        after: Option<Bytes>,
    },
    /// Reads accepted operations projected from the canonical log.
    ReadProjected {
        /// Document whose operations are projected.
        document: Bytes,
        /// Exclusive canonical resume cursor, or the beginning when absent.
        after: Option<Bytes>,
    },
    /// Opens a projected-operation subscription after an optional cursor.
    SubscribeProjected {
        /// Document whose accepted operations are subscribed to.
        document: Bytes,
        /// Exclusive canonical resume cursor, or the beginning when absent.
        after: Option<Bytes>,
    },
    /// Opens a transport-managed submission stream bound to one document.
    OpenSubmissionStream {
        /// Document to which all stream submissions belong.
        document: Bytes,
    },
    /// Resolves a stable submission identity without appending it again.
    ResolveSubmission {
        /// Document that owns the submission.
        document: Bytes,
        /// Writer identity supplied with the original submission.
        writer: Bytes,
        /// Session identity supplied with the original submission.
        session: Bytes,
        /// Stable submission identity to resolve.
        submission: Bytes,
    },
    /// Fetches the latest published snapshot for a document.
    LatestSnapshot {
        /// Document whose snapshot is requested.
        document: Bytes,
    },
    /// Publishes a snapshot with optimistic parent validation.
    PublishSnapshot {
        /// Document that owns the snapshot.
        document: Bytes,
        /// Canonical position included by the snapshot.
        includes_through: Reference,
        /// Expected current snapshot identifier, or no parent for first publication.
        expected_parent: Option<Bytes>,
        /// Opaque snapshot payload.
        payload: Bytes,
    },
    /// Stores a content-addressed blob.
    UploadBlob {
        /// Blob bytes; empty blobs are permitted.
        payload: Bytes,
    },
    /// Fetches a blob by its content digest.
    FetchBlob {
        /// Fixed-length content digest.
        digest: Bytes,
    },
    /// Publishes an ordered summary manifest whose blobs already exist.
    PublishSummary {
        /// Canonically ordered path-to-blob entries.
        entries: Vec<SummaryEntry>,
    },
    /// Fetches a summary manifest by its content digest.
    FetchSummary {
        /// Fixed-length summary digest.
        digest: Bytes,
    },
    /// Requests graceful service shutdown from the transport host.
    Shutdown,
}

/// Successful acknowledgement kinds for requests without result payloads.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum Acknowledgement {
    /// A document was created.
    Created = 1,
    /// A writer session was opened.
    SessionOpened = 2,
    /// A snapshot was published.
    SnapshotPublished = 3,
    /// The service accepted a shutdown request.
    ShuttingDown = 4,
}

/// Whether a successful submission appended or matched an existing entry.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum SubmissionDisposition {
    /// The submission was newly appended.
    Accepted = 1,
    /// An identical submission was already committed and no append occurred.
    Duplicate = 2,
}

/// One opaque record from a document's canonical log.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommittedRecord {
    /// Opaque canonical position of the record.
    pub position: Bytes,
    /// Encoded canonical record payload.
    pub payload: Bytes,
}

/// One accepted operation projected from the canonical log.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectedOperation {
    /// Opaque canonical position of the underlying submission record.
    pub position: Bytes,
    /// Contiguous sequence number among accepted operations.
    pub sequence_number: u64,
    /// Minimum reference position across active writers after acceptance.
    pub minimum_reference: Reference,
    /// Stable writer identity.
    pub writer: Bytes,
    /// Connection-scoped session identity.
    pub session: Bytes,
    /// Stable submission identity.
    pub submission: Bytes,
    /// Writer-local sequence number.
    pub local_sequence_number: u64,
    /// Canonical state on which the operation was based.
    pub reference: Reference,
    /// Opaque operation payload.
    pub payload: Bytes,
}

/// Authoritative result of resolving a stable submission identity.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Resolution {
    /// The submission is committed with final sequence metadata.
    Committed {
        /// Opaque canonical position of the submission.
        position: Bytes,
        /// Contiguous accepted-operation sequence number.
        sequence_number: u64,
        /// Minimum reference position after acceptance.
        minimum_reference: Reference,
    },
    /// The authoritative log does not contain the submission.
    NotCommitted,
    /// Storage or fencing prevented an authoritative answer.
    StillUncertain,
}

/// The latest published snapshot and its opaque identifier.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublishedSnapshot {
    /// Snapshot identifier used for optimistic parent validation.
    pub id: Bytes,
    /// Canonical position included by the snapshot.
    pub includes_through: Reference,
    /// Opaque snapshot payload.
    pub payload: Bytes,
}

/// One path-to-blob entry in a summary manifest.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SummaryEntry {
    /// UTF-8 summary path encoded as bytes on the wire.
    pub path: Bytes,
    /// Fixed-length digest of an uploaded blob.
    pub blob: Bytes,
}

/// Stable service error classifications encoded on the wire.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u16)]
pub enum ErrorCode {
    /// The request fields or request context are invalid.
    InvalidRequest = 1,
    /// The requested document does not exist.
    DocumentNotFound = 2,
    /// The requested document already exists.
    DocumentAlreadyExists = 3,
    /// A position token is malformed or not recognized.
    InvalidPosition = 4,
    /// A valid position has fallen outside the retained range.
    StalePosition = 5,
    /// Optimistic state did not match current state.
    Conflict = 6,
    /// The operation was rejected by a storage or policy boundary.
    Rejected = 7,
    /// The operation may or may not have committed.
    Ambiguous = 8,
    /// A required resource is temporarily unavailable.
    Unavailable = 9,
    /// Persisted state is malformed or inconsistent.
    Corrupt = 10,
    /// A session identity has already appeared in the document log.
    SessionAlreadyUsed = 11,
    /// No session has been opened for the writer.
    UnknownWriter = 12,
    /// The submission names a session that is no longer current for its writer.
    StaleSession = 13,
    /// The local sequence number is not greater than the last accepted number.
    DuplicateLocalSequence = 14,
    /// The local sequence number skipped the next expected number.
    LocalSequenceGap = 15,
    /// The reference points beyond the observed canonical head.
    UnknownReferencePosition = 16,
    /// The reference precedes the current minimum reference position.
    StaleReferencePosition = 17,
    /// A submission identity was reused with different content or context.
    SubmissionIdentityConflict = 18,
    /// The service no longer owns the sequencer fence.
    FenceLost = 19,
    /// An earlier ambiguous operation must be resolved before continuing.
    RecoveryRequired = 20,
    /// The complete frame exceeds the configured bound.
    FrameTooLarge = 21,
    /// The frame declares an unsupported protocol version.
    UnsupportedVersion = 22,
    /// The requested blob digest is not present.
    BlobNotFound = 23,
    /// The requested summary digest is not present.
    SummaryNotFound = 24,
    /// Blob or summary content exceeds a configured bound.
    ContentTooLarge = 25,
    /// A content digest has an invalid representation.
    InvalidDigest = 26,
    /// A summary manifest is malformed or noncanonical.
    InvalidManifest = 27,
}

/// A service response carried by one FSP4 frame.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Response {
    /// A request completed with the given acknowledgement.
    Acknowledged(Acknowledgement),
    /// A submission was accepted or matched an identical committed submission.
    Submitted {
        /// Whether the submission appended or was an exact retry.
        disposition: SubmissionDisposition,
        /// Opaque canonical position of the committed submission.
        position: Bytes,
        /// Contiguous accepted-operation sequence number.
        sequence_number: u64,
        /// Minimum reference position after acceptance.
        minimum_reference: Reference,
    },
    /// A bounded page of opaque canonical records.
    Read {
        /// Records following the request's exclusive resume position.
        records: Vec<CommittedRecord>,
    },
    /// A bounded page of accepted projected operations.
    ProjectedRead {
        /// Accepted operations encountered in the scanned canonical range.
        operations: Vec<ProjectedOperation>,
        /// Opaque cursor through all scanned canonical records.
        cursor: Option<Bytes>,
        /// Whether more canonical records remain after the cursor.
        has_more: bool,
    },
    /// One accepted operation delivered by a subscription.
    ProjectedOperation(ProjectedOperation),
    /// Authoritative or explicitly uncertain submission resolution.
    Resolved(Resolution),
    /// The latest snapshot, or `None` when none has been published.
    Snapshot(Option<PublishedSnapshot>),
    /// Receipt for an uploaded content-addressed blob.
    BlobUploaded {
        /// Digest computed from the blob content.
        digest: Bytes,
        /// Number of bytes in the blob.
        size_bytes: u64,
        /// Whether identical content already existed.
        deduplicated: bool,
    },
    /// Blob content returned for a requested digest.
    Blob {
        /// Digest requested by the client.
        digest: Bytes,
        /// Stored blob bytes.
        payload: Bytes,
    },
    /// Receipt for a published summary manifest.
    SummaryPublished {
        /// Digest computed from the canonical manifest.
        digest: Bytes,
        /// Number of entries in the manifest.
        entry_count: u32,
        /// Number of bytes in the persisted canonical manifest.
        persisted_bytes: u64,
        /// Whether an identical manifest already existed.
        deduplicated: bool,
    },
    /// Summary manifest returned for a requested digest.
    Summary {
        /// Digest requested by the client.
        digest: Bytes,
        /// Canonically ordered manifest entries.
        entries: Vec<SummaryEntry>,
    },
    /// A request failed with a stable service classification.
    Error(ErrorCode),
}

/// The request or response payload of an FSP4 frame.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Message {
    /// A client-to-service request.
    Request(Request),
    /// A service-to-client response.
    Response(Response),
}

/// One complete FSP4 message with its caller-assigned correlation identifier.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Frame {
    /// Correlation identifier echoed between a request and its response.
    pub request_id: u64,
    /// Request or response body.
    pub message: Message,
}

/// A framing, bounds, or wire-value failure while encoding or decoding FSP4.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ProtocolError {
    /// The complete encoded or received frame exceeds `max_frame_bytes`.
    #[error("frame exceeds the configured limit")]
    FrameTooLarge,
    /// The frame ends before a declared fixed or variable-length value.
    #[error("frame is truncated")]
    Truncated,
    /// The header does not begin with the FSP4 magic bytes.
    #[error("frame has invalid magic")]
    InvalidMagic,
    /// The header's protocol version does not equal [`VERSION`].
    #[error("protocol version is unsupported")]
    UnsupportedVersion,
    /// The message kind byte is not assigned by this protocol version.
    #[error("message kind is invalid")]
    InvalidKind,
    /// Reserved header bits are nonzero.
    #[error("reserved header bits are nonzero")]
    InvalidReserved,
    /// A length-prefixed field that requires content is empty.
    #[error("field is empty")]
    EmptyField,
    /// A field exceeds its configured bound or representable length.
    #[error("field exceeds its configured limit")]
    FieldTooLarge,
    /// An enum or Boolean field contains an unknown discriminant.
    #[error("enum discriminant is invalid")]
    InvalidDiscriminant,
    /// Bytes remain beyond the declared body or decoded message.
    #[error("frame has trailing bytes")]
    TrailingBytes,
    /// A read, projected read, or summary contains too many entries.
    #[error("read result has too many records")]
    TooManyRecords,
}

/// Encodes one complete service frame.
///
/// # Errors
///
/// Returns a protocol error when a field or the complete frame exceeds its configured bound.
pub fn encode(frame: &Frame, limits: Limits) -> Result<Bytes, ProtocolError> {
    let (kind, body) = encode_message(&frame.message, limits)?;
    let body_length = u32::try_from(body.len()).map_err(|_| ProtocolError::FrameTooLarge)?;
    let frame_length = HEADER_BYTES
        .checked_add(body.len())
        .ok_or(ProtocolError::FrameTooLarge)?;
    if frame_length > limits.max_frame_bytes {
        return Err(ProtocolError::FrameTooLarge);
    }
    let mut bytes = BytesMut::with_capacity(frame_length);
    bytes.extend_from_slice(MAGIC);
    bytes.put_u16(VERSION);
    bytes.put_u8(kind);
    bytes.put_u8(0);
    bytes.put_u64(frame.request_id);
    bytes.put_u32(body_length);
    bytes.extend_from_slice(&body);
    Ok(bytes.freeze())
}

/// Decodes one complete service frame.
///
/// # Errors
///
/// Returns a protocol error when framing, versioning, bounds, or message contents are invalid.
pub fn decode(bytes: &[u8], limits: Limits) -> Result<Frame, ProtocolError> {
    if bytes.len() > limits.max_frame_bytes {
        return Err(ProtocolError::FrameTooLarge);
    }
    if bytes.len() < HEADER_BYTES {
        return Err(ProtocolError::Truncated);
    }
    if &bytes[..MAGIC.len()] != MAGIC {
        return Err(ProtocolError::InvalidMagic);
    }
    let mut frame = Bytes::copy_from_slice(&bytes[MAGIC.len()..]);
    if frame.get_u16() != VERSION {
        return Err(ProtocolError::UnsupportedVersion);
    }
    let kind = frame.get_u8();
    if frame.get_u8() != 0 {
        return Err(ProtocolError::InvalidReserved);
    }
    let request_id = frame.get_u64();
    let body_length = usize::try_from(frame.get_u32()).map_err(|_| ProtocolError::FrameTooLarge)?;
    if frame.remaining() < body_length {
        return Err(ProtocolError::Truncated);
    }
    if frame.remaining() > body_length {
        return Err(ProtocolError::TrailingBytes);
    }
    let message = decode_message(kind, frame.split_to(body_length), limits)?;
    Ok(Frame {
        request_id,
        message,
    })
}

/// Encodes a message body and returns its stable wire kind.
fn encode_message(message: &Message, limits: Limits) -> Result<(u8, Bytes), ProtocolError> {
    let mut body = BytesMut::new();
    let kind = match message {
        Message::Request(request) => return encode_request_message(request, limits),
        Message::Response(Response::Acknowledged(acknowledgement)) => {
            body.put_u8(*acknowledgement as u8);
            ACKNOWLEDGED
        }
        Message::Response(Response::Submitted {
            disposition,
            position,
            sequence_number,
            minimum_reference,
        }) => {
            body.put_u8(*disposition as u8);
            put_bytes(&mut body, position, limits.max_position_bytes)?;
            body.put_u64(*sequence_number);
            put_reference(&mut body, minimum_reference, limits)?;
            SUBMITTED
        }
        Message::Response(Response::Read { records }) => {
            if records.len() > limits.max_read_records {
                return Err(ProtocolError::TooManyRecords);
            }
            body.put_u32(u32::try_from(records.len()).map_err(|_| ProtocolError::TooManyRecords)?);
            for record in records {
                put_bytes(&mut body, &record.position, limits.max_position_bytes)?;
                put_bytes(&mut body, &record.payload, limits.max_record_bytes)?;
            }
            READ_RESULT
        }
        Message::Response(Response::ProjectedRead {
            operations,
            cursor,
            has_more,
        }) => {
            encode_projected_read(&mut body, operations, cursor.as_ref(), *has_more, limits)?;
            PROJECTED_READ_RESULT
        }
        Message::Response(Response::ProjectedOperation(operation)) => {
            encode_projected_operation(&mut body, operation, limits)?;
            PROJECTED_OPERATION
        }
        Message::Response(Response::Resolved(resolution)) => {
            encode_resolution(&mut body, resolution, limits)?;
            RESOLUTION_RESULT
        }
        Message::Response(Response::Snapshot(snapshot)) => {
            body.put_u8(u8::from(snapshot.is_some()));
            if let Some(snapshot) = snapshot {
                put_bytes(&mut body, &snapshot.id, limits.max_position_bytes)?;
                put_reference(&mut body, &snapshot.includes_through, limits)?;
                put_bytes(&mut body, &snapshot.payload, limits.max_snapshot_bytes)?;
            }
            SNAPSHOT_RESULT
        }
        Message::Response(Response::BlobUploaded {
            digest,
            size_bytes,
            deduplicated,
        }) => {
            put_digest(&mut body, digest)?;
            body.put_u64(*size_bytes);
            body.put_u8(u8::from(*deduplicated));
            BLOB_UPLOADED
        }
        Message::Response(Response::Blob { digest, payload }) => {
            put_digest(&mut body, digest)?;
            put_blob_bytes(&mut body, payload, limits.max_blob_bytes)?;
            BLOB_RESULT
        }
        Message::Response(Response::SummaryPublished {
            digest,
            entry_count,
            persisted_bytes,
            deduplicated,
        }) => {
            put_digest(&mut body, digest)?;
            body.put_u32(*entry_count);
            body.put_u64(*persisted_bytes);
            body.put_u8(u8::from(*deduplicated));
            SUMMARY_PUBLISHED
        }
        Message::Response(Response::Summary { digest, entries }) => {
            put_digest(&mut body, digest)?;
            put_summary_entries(&mut body, entries, limits)?;
            SUMMARY_RESULT
        }
        Message::Response(Response::Error(code)) => {
            body.put_u16(*code as u16);
            ERROR
        }
    };
    Ok((kind, body.freeze()))
}

/// Encodes a request body and returns its stable wire kind.
fn encode_request_message(request: &Request, limits: Limits) -> Result<(u8, Bytes), ProtocolError> {
    let mut body = BytesMut::new();
    let kind = match request {
        Request::Create { document } => {
            put_bytes(&mut body, document, limits.max_document_bytes)?;
            CREATE
        }
        Request::OpenSession {
            document,
            writer,
            session,
            reference,
        } => {
            put_bytes(&mut body, document, limits.max_document_bytes)?;
            put_bytes(&mut body, writer, limits.max_identity_bytes)?;
            put_bytes(&mut body, session, limits.max_identity_bytes)?;
            put_reference(&mut body, reference, limits)?;
            OPEN_SESSION
        }
        Request::Submit(submission) => {
            put_bytes(&mut body, &submission.document, limits.max_document_bytes)?;
            put_bytes(&mut body, &submission.writer, limits.max_identity_bytes)?;
            put_bytes(&mut body, &submission.session, limits.max_identity_bytes)?;
            put_bytes(&mut body, &submission.submission, limits.max_identity_bytes)?;
            body.put_u64(submission.local_sequence_number);
            put_reference(&mut body, &submission.reference, limits)?;
            put_bytes(&mut body, &submission.payload, limits.max_payload_bytes)?;
            SUBMIT
        }
        Request::Read { document, after } => {
            put_bytes(&mut body, document, limits.max_document_bytes)?;
            put_optional_bytes(&mut body, after.as_ref(), limits.max_position_bytes)?;
            READ
        }
        Request::ReadProjected { document, after } => {
            put_bytes(&mut body, document, limits.max_document_bytes)?;
            put_optional_bytes(&mut body, after.as_ref(), limits.max_position_bytes)?;
            READ_PROJECTED
        }
        Request::SubscribeProjected { document, after } => {
            put_bytes(&mut body, document, limits.max_document_bytes)?;
            put_optional_bytes(&mut body, after.as_ref(), limits.max_position_bytes)?;
            SUBSCRIBE_PROJECTED
        }
        Request::OpenSubmissionStream { document } => {
            put_bytes(&mut body, document, limits.max_document_bytes)?;
            OPEN_SUBMISSION_STREAM
        }
        Request::ResolveSubmission {
            document,
            writer,
            session,
            submission,
        } => {
            put_bytes(&mut body, document, limits.max_document_bytes)?;
            put_bytes(&mut body, writer, limits.max_identity_bytes)?;
            put_bytes(&mut body, session, limits.max_identity_bytes)?;
            put_bytes(&mut body, submission, limits.max_identity_bytes)?;
            RESOLVE_SUBMISSION
        }
        Request::LatestSnapshot { document } => {
            put_bytes(&mut body, document, limits.max_document_bytes)?;
            LATEST_SNAPSHOT
        }
        Request::PublishSnapshot {
            document,
            includes_through,
            expected_parent,
            payload,
        } => {
            put_bytes(&mut body, document, limits.max_document_bytes)?;
            put_reference(&mut body, includes_through, limits)?;
            put_optional_bytes(
                &mut body,
                expected_parent.as_ref(),
                limits.max_position_bytes,
            )?;
            put_bytes(&mut body, payload, limits.max_snapshot_bytes)?;
            PUBLISH_SNAPSHOT
        }
        Request::UploadBlob { payload } => {
            put_blob_bytes(&mut body, payload, limits.max_blob_bytes)?;
            UPLOAD_BLOB
        }
        Request::FetchBlob { digest } => {
            put_digest(&mut body, digest)?;
            FETCH_BLOB
        }
        Request::PublishSummary { entries } => {
            put_summary_entries(&mut body, entries, limits)?;
            PUBLISH_SUMMARY
        }
        Request::FetchSummary { digest } => {
            put_digest(&mut body, digest)?;
            FETCH_SUMMARY
        }
        Request::Shutdown => SHUTDOWN,
    };
    Ok((kind, body.freeze()))
}

/// Encodes a bounded projected-read response body.
fn encode_projected_read(
    body: &mut BytesMut,
    operations: &[ProjectedOperation],
    cursor: Option<&Bytes>,
    has_more: bool,
    limits: Limits,
) -> Result<(), ProtocolError> {
    if operations.len() > limits.max_read_records {
        return Err(ProtocolError::TooManyRecords);
    }
    body.put_u32(u32::try_from(operations.len()).map_err(|_| ProtocolError::TooManyRecords)?);
    for operation in operations {
        encode_projected_operation(body, operation, limits)?;
    }
    put_optional_bytes(body, cursor, limits.max_position_bytes)?;
    body.put_u8(u8::from(has_more));
    Ok(())
}

/// Encodes one projected operation into an existing body.
fn encode_projected_operation(
    body: &mut BytesMut,
    operation: &ProjectedOperation,
    limits: Limits,
) -> Result<(), ProtocolError> {
    put_bytes(body, &operation.position, limits.max_position_bytes)?;
    body.put_u64(operation.sequence_number);
    put_reference(body, &operation.minimum_reference, limits)?;
    put_bytes(body, &operation.writer, limits.max_identity_bytes)?;
    put_bytes(body, &operation.session, limits.max_identity_bytes)?;
    put_bytes(body, &operation.submission, limits.max_identity_bytes)?;
    body.put_u64(operation.local_sequence_number);
    put_reference(body, &operation.reference, limits)?;
    put_bytes(body, &operation.payload, limits.max_payload_bytes)?;
    Ok(())
}

/// Encodes one submission resolution into an existing body.
fn encode_resolution(
    body: &mut BytesMut,
    resolution: &Resolution,
    limits: Limits,
) -> Result<(), ProtocolError> {
    match resolution {
        Resolution::Committed {
            position,
            sequence_number,
            minimum_reference,
        } => {
            body.put_u8(1);
            put_bytes(body, position, limits.max_position_bytes)?;
            body.put_u64(*sequence_number);
            put_reference(body, minimum_reference, limits)?;
        }
        Resolution::NotCommitted => body.put_u8(2),
        Resolution::StillUncertain => body.put_u8(3),
    }
    Ok(())
}

/// Decodes exactly one request or response body for `kind`.
fn decode_message(kind: u8, mut body: Bytes, limits: Limits) -> Result<Message, ProtocolError> {
    let message = if kind <= OPEN_SUBMISSION_STREAM {
        Message::Request(decode_request(kind, &mut body, limits)?)
    } else {
        Message::Response(decode_response(kind, &mut body, limits)?)
    };
    if body.has_remaining() {
        return Err(ProtocolError::TrailingBytes);
    }
    Ok(message)
}

/// Decodes one request body for its stable wire kind.
fn decode_request(kind: u8, body: &mut Bytes, limits: Limits) -> Result<Request, ProtocolError> {
    Ok(match kind {
        CREATE => Request::Create {
            document: take_bytes(body, limits.max_document_bytes)?,
        },
        OPEN_SESSION => Request::OpenSession {
            document: take_bytes(body, limits.max_document_bytes)?,
            writer: take_bytes(body, limits.max_identity_bytes)?,
            session: take_bytes(body, limits.max_identity_bytes)?,
            reference: take_reference(body, limits)?,
        },
        SUBMIT => {
            let document = take_bytes(body, limits.max_document_bytes)?;
            let writer = take_bytes(body, limits.max_identity_bytes)?;
            let session = take_bytes(body, limits.max_identity_bytes)?;
            let submission = take_bytes(body, limits.max_identity_bytes)?;
            if body.remaining() < 8 {
                return Err(ProtocolError::Truncated);
            }
            let local_sequence_number = body.get_u64();
            let reference = take_reference(body, limits)?;
            let payload = take_bytes(body, limits.max_payload_bytes)?;
            Request::Submit(Submission {
                document,
                writer,
                session,
                submission,
                local_sequence_number,
                reference,
                payload,
            })
        }
        READ => Request::Read {
            document: take_bytes(body, limits.max_document_bytes)?,
            after: take_optional_bytes(body, limits.max_position_bytes)?,
        },
        READ_PROJECTED => Request::ReadProjected {
            document: take_bytes(body, limits.max_document_bytes)?,
            after: take_optional_bytes(body, limits.max_position_bytes)?,
        },
        SUBSCRIBE_PROJECTED => Request::SubscribeProjected {
            document: take_bytes(body, limits.max_document_bytes)?,
            after: take_optional_bytes(body, limits.max_position_bytes)?,
        },
        OPEN_SUBMISSION_STREAM => Request::OpenSubmissionStream {
            document: take_bytes(body, limits.max_document_bytes)?,
        },
        RESOLVE_SUBMISSION => Request::ResolveSubmission {
            document: take_bytes(body, limits.max_document_bytes)?,
            writer: take_bytes(body, limits.max_identity_bytes)?,
            session: take_bytes(body, limits.max_identity_bytes)?,
            submission: take_bytes(body, limits.max_identity_bytes)?,
        },
        LATEST_SNAPSHOT => Request::LatestSnapshot {
            document: take_bytes(body, limits.max_document_bytes)?,
        },
        PUBLISH_SNAPSHOT => Request::PublishSnapshot {
            document: take_bytes(body, limits.max_document_bytes)?,
            includes_through: take_reference(body, limits)?,
            expected_parent: take_optional_bytes(body, limits.max_position_bytes)?,
            payload: take_bytes(body, limits.max_snapshot_bytes)?,
        },
        UPLOAD_BLOB => Request::UploadBlob {
            payload: take_blob_bytes(body, limits.max_blob_bytes)?,
        },
        FETCH_BLOB => Request::FetchBlob {
            digest: take_digest(body)?,
        },
        PUBLISH_SUMMARY => Request::PublishSummary {
            entries: take_summary_entries(body, limits)?,
        },
        FETCH_SUMMARY => Request::FetchSummary {
            digest: take_digest(body)?,
        },
        SHUTDOWN => Request::Shutdown,
        _ => return Err(ProtocolError::InvalidKind),
    })
}

/// Decodes one response body for its stable wire kind.
fn decode_response(kind: u8, body: &mut Bytes, limits: Limits) -> Result<Response, ProtocolError> {
    Ok(match kind {
        ACKNOWLEDGED => Response::Acknowledged(match take_u8(body)? {
            1 => Acknowledgement::Created,
            2 => Acknowledgement::SessionOpened,
            3 => Acknowledgement::SnapshotPublished,
            4 => Acknowledgement::ShuttingDown,
            _ => return Err(ProtocolError::InvalidDiscriminant),
        }),
        SUBMITTED => {
            let disposition = match take_u8(body)? {
                1 => SubmissionDisposition::Accepted,
                2 => SubmissionDisposition::Duplicate,
                _ => return Err(ProtocolError::InvalidDiscriminant),
            };
            let position = take_bytes(body, limits.max_position_bytes)?;
            if body.remaining() < 8 {
                return Err(ProtocolError::Truncated);
            }
            let sequence_number = body.get_u64();
            let minimum_reference = take_reference(body, limits)?;
            Response::Submitted {
                disposition,
                position,
                sequence_number,
                minimum_reference,
            }
        }
        READ_RESULT => {
            if body.remaining() < 4 {
                return Err(ProtocolError::Truncated);
            }
            let count =
                usize::try_from(body.get_u32()).map_err(|_| ProtocolError::TooManyRecords)?;
            if count > limits.max_read_records {
                return Err(ProtocolError::TooManyRecords);
            }
            let mut records = Vec::with_capacity(count);
            for _ in 0..count {
                records.push(CommittedRecord {
                    position: take_bytes(body, limits.max_position_bytes)?,
                    payload: take_bytes(body, limits.max_record_bytes)?,
                });
            }
            Response::Read { records }
        }
        PROJECTED_READ_RESULT => decode_projected_read(body, limits)?,
        PROJECTED_OPERATION => {
            Response::ProjectedOperation(decode_projected_operation(body, limits)?)
        }
        RESOLUTION_RESULT => Response::Resolved(decode_resolution(body, limits)?),
        SNAPSHOT_RESULT => {
            let snapshot = match take_u8(body)? {
                0 => None,
                1 => Some(PublishedSnapshot {
                    id: take_bytes(body, limits.max_position_bytes)?,
                    includes_through: take_reference(body, limits)?,
                    payload: take_bytes(body, limits.max_snapshot_bytes)?,
                }),
                _ => return Err(ProtocolError::InvalidDiscriminant),
            };
            Response::Snapshot(snapshot)
        }
        BLOB_UPLOADED => Response::BlobUploaded {
            digest: take_digest(body)?,
            size_bytes: take_u64(body)?,
            deduplicated: take_bool(body)?,
        },
        BLOB_RESULT => Response::Blob {
            digest: take_digest(body)?,
            payload: take_blob_bytes(body, limits.max_blob_bytes)?,
        },
        SUMMARY_PUBLISHED => Response::SummaryPublished {
            digest: take_digest(body)?,
            entry_count: take_u32(body)?,
            persisted_bytes: take_u64(body)?,
            deduplicated: take_bool(body)?,
        },
        SUMMARY_RESULT => Response::Summary {
            digest: take_digest(body)?,
            entries: take_summary_entries(body, limits)?,
        },
        ERROR => Response::Error(take_error_code(body)?),
        _ => return Err(ProtocolError::InvalidKind),
    })
}

/// Decodes a bounded projected-read response body.
fn decode_projected_read(body: &mut Bytes, limits: Limits) -> Result<Response, ProtocolError> {
    if body.remaining() < 4 {
        return Err(ProtocolError::Truncated);
    }
    let count = usize::try_from(body.get_u32()).map_err(|_| ProtocolError::TooManyRecords)?;
    if count > limits.max_read_records {
        return Err(ProtocolError::TooManyRecords);
    }
    let mut operations = Vec::with_capacity(count);
    for _ in 0..count {
        operations.push(decode_projected_operation(body, limits)?);
    }
    let cursor = take_optional_bytes(body, limits.max_position_bytes)?;
    let has_more = match take_u8(body)? {
        0 => false,
        1 => true,
        _ => return Err(ProtocolError::InvalidDiscriminant),
    };
    Ok(Response::ProjectedRead {
        operations,
        cursor,
        has_more,
    })
}

/// Decodes one projected operation from a response body.
fn decode_projected_operation(
    body: &mut Bytes,
    limits: Limits,
) -> Result<ProjectedOperation, ProtocolError> {
    let position = take_bytes(body, limits.max_position_bytes)?;
    if body.remaining() < 8 {
        return Err(ProtocolError::Truncated);
    }
    let sequence_number = body.get_u64();
    let minimum_reference = take_reference(body, limits)?;
    let writer = take_bytes(body, limits.max_identity_bytes)?;
    let session = take_bytes(body, limits.max_identity_bytes)?;
    let submission = take_bytes(body, limits.max_identity_bytes)?;
    if body.remaining() < 8 {
        return Err(ProtocolError::Truncated);
    }
    let local_sequence_number = body.get_u64();
    let reference = take_reference(body, limits)?;
    let payload = take_bytes(body, limits.max_payload_bytes)?;
    Ok(ProjectedOperation {
        position,
        sequence_number,
        minimum_reference,
        writer,
        session,
        submission,
        local_sequence_number,
        reference,
        payload,
    })
}

/// Decodes one submission resolution from a response body.
fn decode_resolution(body: &mut Bytes, limits: Limits) -> Result<Resolution, ProtocolError> {
    Ok(match take_u8(body)? {
        1 => {
            let position = take_bytes(body, limits.max_position_bytes)?;
            if body.remaining() < 8 {
                return Err(ProtocolError::Truncated);
            }
            Resolution::Committed {
                position,
                sequence_number: body.get_u64(),
                minimum_reference: take_reference(body, limits)?,
            }
        }
        2 => Resolution::NotCommitted,
        3 => Resolution::StillUncertain,
        _ => return Err(ProtocolError::InvalidDiscriminant),
    })
}

/// Encodes an initial or opaque canonical reference.
fn put_reference(
    body: &mut BytesMut,
    reference: &Reference,
    limits: Limits,
) -> Result<(), ProtocolError> {
    match reference {
        Reference::Initial => body.put_u8(0),
        Reference::At(position) => {
            body.put_u8(1);
            put_bytes(body, position, limits.max_position_bytes)?;
        }
    }
    Ok(())
}

/// Decodes an initial or opaque canonical reference.
fn take_reference(body: &mut Bytes, limits: Limits) -> Result<Reference, ProtocolError> {
    match take_u8(body)? {
        0 => Ok(Reference::Initial),
        1 => Ok(Reference::At(take_bytes(body, limits.max_position_bytes)?)),
        _ => Err(ProtocolError::InvalidDiscriminant),
    }
}

/// Encodes presence followed by an optional bounded byte field.
fn put_optional_bytes(
    body: &mut BytesMut,
    value: Option<&Bytes>,
    limit: usize,
) -> Result<(), ProtocolError> {
    body.put_u8(u8::from(value.is_some()));
    if let Some(value) = value {
        put_bytes(body, value, limit)?;
    }
    Ok(())
}

/// Decodes presence followed by an optional bounded byte field.
fn take_optional_bytes(body: &mut Bytes, limit: usize) -> Result<Option<Bytes>, ProtocolError> {
    match take_u8(body)? {
        0 => Ok(None),
        1 => Ok(Some(take_bytes(body, limit)?)),
        _ => Err(ProtocolError::InvalidDiscriminant),
    }
}

/// Encodes a required non-empty length-prefixed byte field.
fn put_bytes(body: &mut BytesMut, value: &Bytes, limit: usize) -> Result<(), ProtocolError> {
    if value.is_empty() {
        return Err(ProtocolError::EmptyField);
    }
    if value.len() > limit {
        return Err(ProtocolError::FieldTooLarge);
    }
    body.put_u32(u32::try_from(value.len()).map_err(|_| ProtocolError::FieldTooLarge)?);
    body.extend_from_slice(value);
    Ok(())
}

/// Decodes a required non-empty length-prefixed byte field.
fn take_bytes(body: &mut Bytes, limit: usize) -> Result<Bytes, ProtocolError> {
    if body.remaining() < 4 {
        return Err(ProtocolError::Truncated);
    }
    let length = usize::try_from(body.get_u32()).map_err(|_| ProtocolError::FieldTooLarge)?;
    if length == 0 {
        return Err(ProtocolError::EmptyField);
    }
    if length > limit {
        return Err(ProtocolError::FieldTooLarge);
    }
    if body.remaining() < length {
        return Err(ProtocolError::Truncated);
    }
    Ok(body.split_to(length))
}

/// Decodes one byte after checking for truncation.
fn take_u8(body: &mut Bytes) -> Result<u8, ProtocolError> {
    if !body.has_remaining() {
        return Err(ProtocolError::Truncated);
    }
    Ok(body.get_u8())
}

/// Decodes one big-endian 32-bit integer after checking for truncation.
fn take_u32(body: &mut Bytes) -> Result<u32, ProtocolError> {
    if body.remaining() < 4 {
        return Err(ProtocolError::Truncated);
    }
    Ok(body.get_u32())
}

/// Decodes one big-endian 64-bit integer after checking for truncation.
fn take_u64(body: &mut Bytes) -> Result<u64, ProtocolError> {
    if body.remaining() < 8 {
        return Err(ProtocolError::Truncated);
    }
    Ok(body.get_u64())
}

/// Decodes a Boolean represented by exactly zero or one.
fn take_bool(body: &mut Bytes) -> Result<bool, ProtocolError> {
    match take_u8(body)? {
        0 => Ok(false),
        1 => Ok(true),
        _ => Err(ProtocolError::InvalidDiscriminant),
    }
}

/// Encodes a fixed-length content digest.
fn put_digest(body: &mut BytesMut, digest: &Bytes) -> Result<(), ProtocolError> {
    if digest.len() != CONTENT_DIGEST_BYTES {
        return Err(ProtocolError::InvalidDiscriminant);
    }
    body.extend_from_slice(digest);
    Ok(())
}

/// Decodes a fixed-length content digest.
fn take_digest(body: &mut Bytes) -> Result<Bytes, ProtocolError> {
    if body.remaining() < CONTENT_DIGEST_BYTES {
        return Err(ProtocolError::Truncated);
    }
    Ok(body.split_to(CONTENT_DIGEST_BYTES))
}

/// Encodes a length-prefixed blob, permitting empty content.
fn put_blob_bytes(body: &mut BytesMut, value: &Bytes, limit: usize) -> Result<(), ProtocolError> {
    if value.len() > limit {
        return Err(ProtocolError::FieldTooLarge);
    }
    body.put_u32(u32::try_from(value.len()).map_err(|_| ProtocolError::FieldTooLarge)?);
    body.extend_from_slice(value);
    Ok(())
}

/// Decodes a bounded length-prefixed blob, permitting empty content.
fn take_blob_bytes(body: &mut Bytes, limit: usize) -> Result<Bytes, ProtocolError> {
    let length = usize::try_from(take_u32(body)?).map_err(|_| ProtocolError::FieldTooLarge)?;
    if length > limit {
        return Err(ProtocolError::FieldTooLarge);
    }
    if body.remaining() < length {
        return Err(ProtocolError::Truncated);
    }
    Ok(body.split_to(length))
}

/// Encodes a bounded sequence of summary entries.
fn put_summary_entries(
    body: &mut BytesMut,
    entries: &[SummaryEntry],
    limits: Limits,
) -> Result<(), ProtocolError> {
    if entries.len() > limits.max_summary_entries {
        return Err(ProtocolError::TooManyRecords);
    }
    body.put_u32(u32::try_from(entries.len()).map_err(|_| ProtocolError::TooManyRecords)?);
    for entry in entries {
        put_bytes(body, &entry.path, limits.max_summary_path_bytes)?;
        put_digest(body, &entry.blob)?;
    }
    Ok(())
}

/// Decodes a bounded sequence of summary entries.
fn take_summary_entries(
    body: &mut Bytes,
    limits: Limits,
) -> Result<Vec<SummaryEntry>, ProtocolError> {
    let count = usize::try_from(take_u32(body)?).map_err(|_| ProtocolError::TooManyRecords)?;
    if count > limits.max_summary_entries {
        return Err(ProtocolError::TooManyRecords);
    }
    let mut entries = Vec::with_capacity(count);
    for _ in 0..count {
        entries.push(SummaryEntry {
            path: take_bytes(body, limits.max_summary_path_bytes)?,
            blob: take_digest(body)?,
        });
    }
    Ok(entries)
}

/// Decodes a stable service error code discriminant.
fn take_error_code(body: &mut Bytes) -> Result<ErrorCode, ProtocolError> {
    if body.remaining() < 2 {
        return Err(ProtocolError::Truncated);
    }
    match body.get_u16() {
        1 => Ok(ErrorCode::InvalidRequest),
        2 => Ok(ErrorCode::DocumentNotFound),
        3 => Ok(ErrorCode::DocumentAlreadyExists),
        4 => Ok(ErrorCode::InvalidPosition),
        5 => Ok(ErrorCode::StalePosition),
        6 => Ok(ErrorCode::Conflict),
        7 => Ok(ErrorCode::Rejected),
        8 => Ok(ErrorCode::Ambiguous),
        9 => Ok(ErrorCode::Unavailable),
        10 => Ok(ErrorCode::Corrupt),
        11 => Ok(ErrorCode::SessionAlreadyUsed),
        12 => Ok(ErrorCode::UnknownWriter),
        13 => Ok(ErrorCode::StaleSession),
        14 => Ok(ErrorCode::DuplicateLocalSequence),
        15 => Ok(ErrorCode::LocalSequenceGap),
        16 => Ok(ErrorCode::UnknownReferencePosition),
        17 => Ok(ErrorCode::StaleReferencePosition),
        18 => Ok(ErrorCode::SubmissionIdentityConflict),
        19 => Ok(ErrorCode::FenceLost),
        20 => Ok(ErrorCode::RecoveryRequired),
        21 => Ok(ErrorCode::FrameTooLarge),
        22 => Ok(ErrorCode::UnsupportedVersion),
        23 => Ok(ErrorCode::BlobNotFound),
        24 => Ok(ErrorCode::SummaryNotFound),
        25 => Ok(ErrorCode::ContentTooLarge),
        26 => Ok(ErrorCode::InvalidDigest),
        27 => Ok(ErrorCode::InvalidManifest),
        _ => Err(ProtocolError::InvalidDiscriminant),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn round_trip(message: Message) {
        let frame = Frame {
            request_id: 42,
            message,
        };
        let encoded = encode(&frame, Limits::default()).unwrap();
        assert_eq!(decode(&encoded, Limits::default()).unwrap(), frame);
    }

    #[test]
    fn create_fixture_bytes_are_stable() {
        let frame = Frame {
            request_id: 1,
            message: Message::Request(Request::Create {
                document: Bytes::from_static(b"a"),
            }),
        };
        assert_eq!(
            encode(&frame, Limits::default()).unwrap().as_ref(),
            b"FSP4\0\x02\x01\0\0\0\0\0\0\0\0\x01\0\0\0\x05\0\0\0\x01a"
        );
    }

    #[test]
    fn request_variants_round_trip() {
        round_trip(Message::Request(Request::OpenSession {
            document: Bytes::from_static(b"doc"),
            writer: Bytes::from_static(b"writer"),
            session: Bytes::from_static(b"session"),
            reference: Reference::Initial,
        }));
        round_trip(Message::Request(Request::Submit(Submission {
            document: Bytes::from_static(b"doc"),
            writer: Bytes::from_static(b"writer"),
            session: Bytes::from_static(b"session"),
            submission: Bytes::from_static(b"submission"),
            local_sequence_number: 7,
            reference: Reference::At(Bytes::from_static(b"position")),
            payload: Bytes::from_static(b"payload"),
        })));
        round_trip(Message::Request(Request::Read {
            document: Bytes::from_static(b"doc"),
            after: Some(Bytes::from_static(b"position")),
        }));
        round_trip(Message::Request(Request::ReadProjected {
            document: Bytes::from_static(b"doc"),
            after: Some(Bytes::from_static(b"position")),
        }));
        round_trip(Message::Request(Request::SubscribeProjected {
            document: Bytes::from_static(b"doc"),
            after: Some(Bytes::from_static(b"position")),
        }));
        round_trip(Message::Request(Request::OpenSubmissionStream {
            document: Bytes::from_static(b"doc"),
        }));
        round_trip(Message::Request(Request::ResolveSubmission {
            document: Bytes::from_static(b"doc"),
            writer: Bytes::from_static(b"writer"),
            session: Bytes::from_static(b"session"),
            submission: Bytes::from_static(b"submission"),
        }));
        round_trip(Message::Request(Request::LatestSnapshot {
            document: Bytes::from_static(b"doc"),
        }));
        round_trip(Message::Request(Request::PublishSnapshot {
            document: Bytes::from_static(b"doc"),
            includes_through: Reference::Initial,
            expected_parent: None,
            payload: Bytes::from_static(b"snapshot"),
        }));
        round_trip(Message::Request(Request::UploadBlob {
            payload: Bytes::new(),
        }));
        round_trip(Message::Request(Request::FetchBlob {
            digest: Bytes::from_static(&[1; CONTENT_DIGEST_BYTES]),
        }));
        round_trip(Message::Request(Request::PublishSummary {
            entries: vec![SummaryEntry {
                path: Bytes::from_static(b"root/data"),
                blob: Bytes::from_static(&[2; CONTENT_DIGEST_BYTES]),
            }],
        }));
        round_trip(Message::Request(Request::FetchSummary {
            digest: Bytes::from_static(&[3; CONTENT_DIGEST_BYTES]),
        }));
        round_trip(Message::Request(Request::Shutdown));
    }

    #[test]
    fn response_variants_round_trip() {
        round_trip(Message::Response(Response::Acknowledged(
            Acknowledgement::Created,
        )));
        round_trip(Message::Response(Response::Submitted {
            disposition: SubmissionDisposition::Accepted,
            position: Bytes::from_static(b"position"),
            sequence_number: 3,
            minimum_reference: Reference::Initial,
        }));
        round_trip(Message::Response(Response::Read {
            records: vec![CommittedRecord {
                position: Bytes::from_static(b"position"),
                payload: Bytes::from_static(b"payload"),
            }],
        }));
        round_trip(Message::Response(Response::ProjectedRead {
            operations: vec![ProjectedOperation {
                position: Bytes::from_static(b"position"),
                sequence_number: 3,
                minimum_reference: Reference::Initial,
                writer: Bytes::from_static(b"writer"),
                session: Bytes::from_static(b"session"),
                submission: Bytes::from_static(b"submission"),
                local_sequence_number: 2,
                reference: Reference::At(Bytes::from_static(b"reference")),
                payload: Bytes::from_static(b"payload"),
            }],
            cursor: Some(Bytes::from_static(b"cursor")),
            has_more: true,
        }));
        round_trip(Message::Response(Response::ProjectedOperation(
            ProjectedOperation {
                position: Bytes::from_static(b"position"),
                sequence_number: 3,
                minimum_reference: Reference::Initial,
                writer: Bytes::from_static(b"writer"),
                session: Bytes::from_static(b"session"),
                submission: Bytes::from_static(b"submission"),
                local_sequence_number: 2,
                reference: Reference::At(Bytes::from_static(b"reference")),
                payload: Bytes::from_static(b"payload"),
            },
        )));
        round_trip(Message::Response(Response::Resolved(
            Resolution::Committed {
                position: Bytes::from_static(b"position"),
                sequence_number: 3,
                minimum_reference: Reference::Initial,
            },
        )));
        round_trip(Message::Response(Response::Resolved(
            Resolution::NotCommitted,
        )));
        round_trip(Message::Response(Response::Resolved(
            Resolution::StillUncertain,
        )));
        round_trip(Message::Response(Response::Snapshot(Some(
            PublishedSnapshot {
                id: Bytes::from_static(b"snapshot-id"),
                includes_through: Reference::Initial,
                payload: Bytes::from_static(b"snapshot"),
            },
        ))));
        round_trip(Message::Response(Response::Snapshot(None)));
        round_trip(Message::Response(Response::BlobUploaded {
            digest: Bytes::from_static(&[4; CONTENT_DIGEST_BYTES]),
            size_bytes: 7,
            deduplicated: false,
        }));
        round_trip(Message::Response(Response::Blob {
            digest: Bytes::from_static(&[4; CONTENT_DIGEST_BYTES]),
            payload: Bytes::new(),
        }));
        round_trip(Message::Response(Response::SummaryPublished {
            digest: Bytes::from_static(&[5; CONTENT_DIGEST_BYTES]),
            entry_count: 1,
            persisted_bytes: 53,
            deduplicated: true,
        }));
        round_trip(Message::Response(Response::Summary {
            digest: Bytes::from_static(&[5; CONTENT_DIGEST_BYTES]),
            entries: vec![SummaryEntry {
                path: Bytes::from_static(b"root/data"),
                blob: Bytes::from_static(&[4; CONTENT_DIGEST_BYTES]),
            }],
        }));
        round_trip(Message::Response(Response::Error(ErrorCode::StaleSession)));
    }

    #[test]
    fn content_operation_kinds_are_additive_and_stable() {
        let digest = Bytes::from_static(&[1; CONTENT_DIGEST_BYTES]);
        let request_kinds = [
            (
                Request::UploadBlob {
                    payload: Bytes::new(),
                },
                10,
            ),
            (
                Request::FetchBlob {
                    digest: digest.clone(),
                },
                11,
            ),
            (
                Request::PublishSummary {
                    entries: Vec::new(),
                },
                12,
            ),
            (
                Request::FetchSummary {
                    digest: digest.clone(),
                },
                13,
            ),
        ];
        for (request, expected_kind) in request_kinds {
            let encoded = encode(
                &Frame {
                    request_id: 1,
                    message: Message::Request(request),
                },
                Limits::default(),
            )
            .unwrap();
            assert_eq!(encoded[6], expected_kind);
        }

        let response_kinds = [
            (
                Response::BlobUploaded {
                    digest: digest.clone(),
                    size_bytes: 0,
                    deduplicated: false,
                },
                70,
            ),
            (
                Response::Blob {
                    digest: digest.clone(),
                    payload: Bytes::new(),
                },
                71,
            ),
            (
                Response::SummaryPublished {
                    digest: digest.clone(),
                    entry_count: 0,
                    persisted_bytes: 12,
                    deduplicated: false,
                },
                72,
            ),
            (
                Response::Summary {
                    digest,
                    entries: Vec::new(),
                },
                73,
            ),
        ];
        for (response, expected_kind) in response_kinds {
            let encoded = encode(
                &Frame {
                    request_id: 1,
                    message: Message::Response(response),
                },
                Limits::default(),
            )
            .unwrap();
            assert_eq!(encoded[6], expected_kind);
        }
    }

    #[test]
    fn projected_subscription_kinds_are_additive_and_stable() {
        let request = encode(
            &Frame {
                request_id: 1,
                message: Message::Request(Request::SubscribeProjected {
                    document: Bytes::from_static(b"doc"),
                    after: None,
                }),
            },
            Limits::default(),
        )
        .unwrap();
        assert_eq!(request[6], 14);

        let response = encode(
            &Frame {
                request_id: 1,
                message: Message::Response(Response::ProjectedOperation(ProjectedOperation {
                    position: Bytes::from_static(b"position"),
                    sequence_number: 1,
                    minimum_reference: Reference::Initial,
                    writer: Bytes::from_static(b"writer"),
                    session: Bytes::from_static(b"session"),
                    submission: Bytes::from_static(b"submission"),
                    local_sequence_number: 1,
                    reference: Reference::Initial,
                    payload: Bytes::from_static(b"payload"),
                })),
            },
            Limits::default(),
        )
        .unwrap();
        assert_eq!(response[6], 74);
    }

    #[test]
    fn malformed_and_oversized_frames_are_rejected() {
        let limits = Limits {
            max_frame_bytes: HEADER_BYTES,
            ..Limits::default()
        };
        let frame = Frame {
            request_id: 1,
            message: Message::Request(Request::Create {
                document: Bytes::from_static(b"a"),
            }),
        };
        assert_eq!(encode(&frame, limits), Err(ProtocolError::FrameTooLarge));
        assert_eq!(
            decode(b"short", Limits::default()),
            Err(ProtocolError::Truncated)
        );
        let mut invalid = encode(&frame, Limits::default()).unwrap().to_vec();
        invalid[0] = b'X';
        assert_eq!(
            decode(&invalid, Limits::default()),
            Err(ProtocolError::InvalidMagic)
        );
        invalid[0] = b'F';
        invalid[5] = 3;
        assert_eq!(
            decode(&invalid, Limits::default()),
            Err(ProtocolError::UnsupportedVersion)
        );
    }

    #[test]
    fn every_truncation_and_trailing_byte_is_rejected() {
        let frame = Frame {
            request_id: 7,
            message: Message::Request(Request::Submit(Submission {
                document: Bytes::from_static(b"doc"),
                writer: Bytes::from_static(b"writer"),
                session: Bytes::from_static(b"session"),
                submission: Bytes::from_static(b"submission"),
                local_sequence_number: 1,
                reference: Reference::Initial,
                payload: Bytes::from_static(b"payload"),
            })),
        };
        let encoded = encode(&frame, Limits::default()).unwrap();

        for length in 0..encoded.len() {
            assert!(decode(&encoded[..length], Limits::default()).is_err());
        }

        let mut outside_body = encoded.to_vec();
        outside_body.push(0);
        assert_eq!(
            decode(&outside_body, Limits::default()),
            Err(ProtocolError::TrailingBytes)
        );

        let mut inside_body = outside_body;
        let body_length = u32::from_be_bytes(inside_body[16..20].try_into().unwrap());
        inside_body[16..20].copy_from_slice(&(body_length + 1).to_be_bytes());
        assert_eq!(
            decode(&inside_body, Limits::default()),
            Err(ProtocolError::TrailingBytes)
        );
    }

    #[test]
    fn field_and_record_limits_are_enforced() {
        let limits = Limits {
            max_document_bytes: 2,
            max_read_records: 1,
            ..Limits::default()
        };
        let create = Frame {
            request_id: 1,
            message: Message::Request(Request::Create {
                document: Bytes::from_static(b"doc"),
            }),
        };
        assert_eq!(encode(&create, limits), Err(ProtocolError::FieldTooLarge));
        let read = Frame {
            request_id: 1,
            message: Message::Response(Response::Read {
                records: vec![
                    CommittedRecord {
                        position: Bytes::from_static(b"a"),
                        payload: Bytes::from_static(b"a"),
                    },
                    CommittedRecord {
                        position: Bytes::from_static(b"b"),
                        payload: Bytes::from_static(b"b"),
                    },
                ],
            }),
        };
        assert_eq!(encode(&read, limits), Err(ProtocolError::TooManyRecords));
    }

    #[test]
    fn projected_and_resolution_frame_sizes_are_measured() {
        let limits = Limits::default();
        let projected_request = Frame {
            request_id: 1,
            message: Message::Request(Request::ReadProjected {
                document: Bytes::from_static(b"document"),
                after: Some(Bytes::from_static(b"cursor")),
            }),
        };
        let projected_response = Frame {
            request_id: 1,
            message: Message::Response(Response::ProjectedRead {
                operations: vec![ProjectedOperation {
                    position: Bytes::from_static(b"position"),
                    sequence_number: 1,
                    minimum_reference: Reference::Initial,
                    writer: Bytes::from_static(b"writer"),
                    session: Bytes::from_static(b"session"),
                    submission: Bytes::from_static(b"submission"),
                    local_sequence_number: 1,
                    reference: Reference::Initial,
                    payload: Bytes::from_static(b"payload"),
                }],
                cursor: Some(Bytes::from_static(b"position")),
                has_more: false,
            }),
        };
        let resolution_request = Frame {
            request_id: 2,
            message: Message::Request(Request::ResolveSubmission {
                document: Bytes::from_static(b"document"),
                writer: Bytes::from_static(b"writer"),
                session: Bytes::from_static(b"session"),
                submission: Bytes::from_static(b"submission"),
            }),
        };
        let resolution_response = Frame {
            request_id: 2,
            message: Message::Response(Response::Resolved(Resolution::Committed {
                position: Bytes::from_static(b"position"),
                sequence_number: 1,
                minimum_reference: Reference::Initial,
            })),
        };
        let sizes = [
            encode(&projected_request, limits).unwrap().len(),
            encode(&projected_response, limits).unwrap().len(),
            encode(&resolution_request, limits).unwrap().len(),
            encode(&resolution_response, limits).unwrap().len(),
        ];
        println!(
            "projected_request={} projected_response={} resolution_request={} resolution_response={}",
            sizes[0], sizes[1], sizes[2], sizes[3]
        );
        assert!(sizes.into_iter().all(|size| size <= limits.max_frame_bytes));
    }
}
