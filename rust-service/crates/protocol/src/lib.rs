#![doc = "Bounded, versioned, transport-neutral frames for the native Fluid service."]

use bytes::{Buf, BufMut, Bytes, BytesMut};
use thiserror::Error;

pub const VERSION: u16 = 1;
pub const HEADER_BYTES: usize = 20;
const MAGIC: &[u8; 4] = b"FSP4";

const CREATE: u8 = 1;
const OPEN_SESSION: u8 = 2;
const SUBMIT: u8 = 3;
const READ: u8 = 4;
const LATEST_SNAPSHOT: u8 = 5;
const PUBLISH_SNAPSHOT: u8 = 6;
const SHUTDOWN: u8 = 7;
const READ_PROJECTED: u8 = 8;
const RESOLVE_SUBMISSION: u8 = 9;
const ACKNOWLEDGED: u8 = 64;
const SUBMITTED: u8 = 65;
const READ_RESULT: u8 = 66;
const SNAPSHOT_RESULT: u8 = 67;
const PROJECTED_READ_RESULT: u8 = 68;
const RESOLUTION_RESULT: u8 = 69;
const ERROR: u8 = 127;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Limits {
    pub max_frame_bytes: usize,
    pub max_document_bytes: usize,
    pub max_identity_bytes: usize,
    pub max_position_bytes: usize,
    pub max_payload_bytes: usize,
    pub max_record_bytes: usize,
    pub max_snapshot_bytes: usize,
    pub max_read_records: usize,
}

impl Default for Limits {
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
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Reference {
    Initial,
    At(Bytes),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Submission {
    pub document: Bytes,
    pub writer: Bytes,
    pub session: Bytes,
    pub submission: Bytes,
    pub local_sequence_number: u64,
    pub reference: Reference,
    pub payload: Bytes,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Request {
    Create {
        document: Bytes,
    },
    OpenSession {
        document: Bytes,
        writer: Bytes,
        session: Bytes,
        reference: Reference,
    },
    Submit(Submission),
    Read {
        document: Bytes,
        after: Option<Bytes>,
    },
    ReadProjected {
        document: Bytes,
        after: Option<Bytes>,
    },
    ResolveSubmission {
        document: Bytes,
        writer: Bytes,
        session: Bytes,
        submission: Bytes,
    },
    LatestSnapshot {
        document: Bytes,
    },
    PublishSnapshot {
        document: Bytes,
        includes_through: Reference,
        expected_parent: Option<Bytes>,
        payload: Bytes,
    },
    Shutdown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum Acknowledgement {
    Created = 1,
    SessionOpened = 2,
    SnapshotPublished = 3,
    ShuttingDown = 4,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum SubmissionDisposition {
    Accepted = 1,
    Duplicate = 2,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommittedRecord {
    pub position: Bytes,
    pub payload: Bytes,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectedOperation {
    pub position: Bytes,
    pub sequence_number: u64,
    pub minimum_reference: Reference,
    pub writer: Bytes,
    pub session: Bytes,
    pub submission: Bytes,
    pub local_sequence_number: u64,
    pub reference: Reference,
    pub payload: Bytes,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Resolution {
    Committed {
        position: Bytes,
        sequence_number: u64,
        minimum_reference: Reference,
    },
    NotCommitted,
    StillUncertain,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublishedSnapshot {
    pub id: Bytes,
    pub includes_through: Reference,
    pub payload: Bytes,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u16)]
pub enum ErrorCode {
    InvalidRequest = 1,
    DocumentNotFound = 2,
    DocumentAlreadyExists = 3,
    InvalidPosition = 4,
    StalePosition = 5,
    Conflict = 6,
    Rejected = 7,
    Ambiguous = 8,
    Unavailable = 9,
    Corrupt = 10,
    SessionAlreadyUsed = 11,
    UnknownWriter = 12,
    StaleSession = 13,
    DuplicateLocalSequence = 14,
    LocalSequenceGap = 15,
    UnknownReferencePosition = 16,
    StaleReferencePosition = 17,
    SubmissionIdentityConflict = 18,
    FenceLost = 19,
    RecoveryRequired = 20,
    FrameTooLarge = 21,
    UnsupportedVersion = 22,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Response {
    Acknowledged(Acknowledgement),
    Submitted {
        disposition: SubmissionDisposition,
        position: Bytes,
        sequence_number: u64,
        minimum_reference: Reference,
    },
    Read {
        records: Vec<CommittedRecord>,
    },
    ProjectedRead {
        operations: Vec<ProjectedOperation>,
        cursor: Option<Bytes>,
        has_more: bool,
    },
    Resolved(Resolution),
    Snapshot(Option<PublishedSnapshot>),
    Error(ErrorCode),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Message {
    Request(Request),
    Response(Response),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Frame {
    pub request_id: u64,
    pub message: Message,
}

#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ProtocolError {
    #[error("frame exceeds the configured limit")]
    FrameTooLarge,
    #[error("frame is truncated")]
    Truncated,
    #[error("frame has invalid magic")]
    InvalidMagic,
    #[error("protocol version is unsupported")]
    UnsupportedVersion,
    #[error("message kind is invalid")]
    InvalidKind,
    #[error("reserved header bits are nonzero")]
    InvalidReserved,
    #[error("field is empty")]
    EmptyField,
    #[error("field exceeds its configured limit")]
    FieldTooLarge,
    #[error("enum discriminant is invalid")]
    InvalidDiscriminant,
    #[error("frame has trailing bytes")]
    TrailingBytes,
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
        Message::Response(Response::Error(code)) => {
            body.put_u16(*code as u16);
            ERROR
        }
    };
    Ok((kind, body.freeze()))
}

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
        Request::Shutdown => SHUTDOWN,
    };
    Ok((kind, body.freeze()))
}

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
        put_bytes(body, &operation.position, limits.max_position_bytes)?;
        body.put_u64(operation.sequence_number);
        put_reference(body, &operation.minimum_reference, limits)?;
        put_bytes(body, &operation.writer, limits.max_identity_bytes)?;
        put_bytes(body, &operation.session, limits.max_identity_bytes)?;
        put_bytes(body, &operation.submission, limits.max_identity_bytes)?;
        body.put_u64(operation.local_sequence_number);
        put_reference(body, &operation.reference, limits)?;
        put_bytes(body, &operation.payload, limits.max_payload_bytes)?;
    }
    put_optional_bytes(body, cursor, limits.max_position_bytes)?;
    body.put_u8(u8::from(has_more));
    Ok(())
}

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

fn decode_message(kind: u8, mut body: Bytes, limits: Limits) -> Result<Message, ProtocolError> {
    let message = if kind <= RESOLVE_SUBMISSION {
        Message::Request(decode_request(kind, &mut body, limits)?)
    } else {
        Message::Response(decode_response(kind, &mut body, limits)?)
    };
    if body.has_remaining() {
        return Err(ProtocolError::TrailingBytes);
    }
    Ok(message)
}

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
        SHUTDOWN => Request::Shutdown,
        _ => return Err(ProtocolError::InvalidKind),
    })
}

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
        ERROR => Response::Error(take_error_code(body)?),
        _ => return Err(ProtocolError::InvalidKind),
    })
}

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
        operations.push(ProjectedOperation {
            position,
            sequence_number,
            minimum_reference,
            writer,
            session,
            submission,
            local_sequence_number,
            reference,
            payload,
        });
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

fn take_reference(body: &mut Bytes, limits: Limits) -> Result<Reference, ProtocolError> {
    match take_u8(body)? {
        0 => Ok(Reference::Initial),
        1 => Ok(Reference::At(take_bytes(body, limits.max_position_bytes)?)),
        _ => Err(ProtocolError::InvalidDiscriminant),
    }
}

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

fn take_optional_bytes(body: &mut Bytes, limit: usize) -> Result<Option<Bytes>, ProtocolError> {
    match take_u8(body)? {
        0 => Ok(None),
        1 => Ok(Some(take_bytes(body, limit)?)),
        _ => Err(ProtocolError::InvalidDiscriminant),
    }
}

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

fn take_u8(body: &mut Bytes) -> Result<u8, ProtocolError> {
    if !body.has_remaining() {
        return Err(ProtocolError::Truncated);
    }
    Ok(body.get_u8())
}

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
            b"FSP4\0\x01\x01\0\0\0\0\0\0\0\0\x01\0\0\0\x05\0\0\0\x01a"
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
        round_trip(Message::Response(Response::Error(ErrorCode::StaleSession)));
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
        invalid[5] = 2;
        assert_eq!(
            decode(&invalid, Limits::default()),
            Err(ProtocolError::UnsupportedVersion)
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
