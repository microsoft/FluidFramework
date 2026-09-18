//! Private persisted submission encoding; membership remains runtime-local.

use bytes::{Buf, BufMut, Bytes, BytesMut};
use sea_core::{
    AuthorId, CommittedEvent, Event, EventPosition, OperationId, SessionCommittedEvent, SessionId,
};

use crate::session::SessionError;

/// Identifies the submission-only encoding.
const MAGIC: &[u8; 5] = b"SEAQ2";

/// Encodes stable submission metadata and opaque application bytes.
pub(crate) fn encode_submission<Error>(
    author: &AuthorId,
    session: &SessionId,
    operation: &OperationId,
    reference: Option<EventPosition>,
    minimum_reference: Option<EventPosition>,
    payload: &[u8],
) -> Result<Bytes, SessionError<Error>> {
    let mut encoded = BytesMut::new();
    encoded.extend_from_slice(MAGIC);
    put_field(&mut encoded, author.as_bytes())?;
    put_field(&mut encoded, session.as_bytes())?;
    put_field(&mut encoded, operation.as_bytes())?;
    put_position(&mut encoded, reference);
    put_position(&mut encoded, minimum_reference);
    put_field(&mut encoded, payload)?;
    Ok(encoded.freeze())
}

/// Decodes a persisted submission, rejecting truncation and trailing bytes.
pub(crate) fn decode_committed<Error>(
    record: &CommittedEvent,
) -> Result<Option<SessionCommittedEvent>, SessionError<Error>> {
    let Some(encoded) = record.event.payload.strip_prefix(MAGIC) else {
        return Err(SessionError::Corrupt("invalid submission marker"));
    };
    let mut bytes = Bytes::copy_from_slice(encoded);
    let author_id = AuthorId::new(take_field(&mut bytes)?)
        .map_err(|_| SessionError::Corrupt("empty author identity"))?;
    let session_id = SessionId::new(take_field(&mut bytes)?)
        .map_err(|_| SessionError::Corrupt("empty session identity"))?;
    let operation_id = OperationId::new(take_field(&mut bytes)?)
        .map_err(|_| SessionError::Corrupt("empty operation identity"))?;
    let reference = take_position(&mut bytes)?;
    let minimum_reference = take_position(&mut bytes)?;
    let payload = take_field(&mut bytes)?;
    if bytes.has_remaining() {
        return Err(SessionError::Corrupt("trailing submission bytes"));
    }
    Ok(Some(SessionCommittedEvent {
        committed: CommittedEvent {
            position: record.position,
            event: Event {
                payload,
                blob_tree: record.event.blob_tree,
            },
        },
        author_id,
        session_id,
        operation_id,
        reference,
        minimum_reference,
    }))
}

/// Writes a length-prefixed identity or payload.
fn put_field<Error>(encoded: &mut BytesMut, bytes: &[u8]) -> Result<(), SessionError<Error>> {
    encoded.put_u32(
        u32::try_from(bytes.len())
            .map_err(|_| SessionError::Rejected("submission field is too large"))?,
    );
    encoded.extend_from_slice(bytes);
    Ok(())
}

/// Writes a tagged optional position.
fn put_position(encoded: &mut BytesMut, position: Option<EventPosition>) {
    encoded.put_u8(u8::from(position.is_some()));
    if let Some(position) = position {
        encoded.put_u64(position.get());
    }
}

/// Reads one length-prefixed field without trusting its declared size.
fn take_field<Error>(bytes: &mut Bytes) -> Result<Bytes, SessionError<Error>> {
    if bytes.remaining() < 4 {
        return Err(SessionError::Corrupt("truncated field length"));
    }
    let length = usize::try_from(bytes.get_u32())
        .map_err(|_| SessionError::Corrupt("field length exceeds address space"))?;
    if bytes.remaining() < length {
        return Err(SessionError::Corrupt("truncated field"));
    }
    Ok(bytes.copy_to_bytes(length))
}

/// Reads a tagged position without accepting unknown tags.
fn take_position<Error>(bytes: &mut Bytes) -> Result<Option<EventPosition>, SessionError<Error>> {
    if !bytes.has_remaining() {
        return Err(SessionError::Corrupt("missing position tag"));
    }
    match bytes.get_u8() {
        0 => Ok(None),
        1 if bytes.remaining() >= 8 => Ok(Some(EventPosition::new(bytes.get_u64()))),
        _ => Err(SessionError::Corrupt("invalid position")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn submission_round_trip_rejects_every_truncation_and_trailing_bytes() {
        let encoded = encode_submission::<std::io::Error>(
            &AuthorId::new("author").unwrap(),
            &SessionId::new("session").unwrap(),
            &OperationId::new("operation").unwrap(),
            Some(EventPosition::new(2)),
            None,
            b"payload",
        )
        .unwrap();
        let mut record = CommittedEvent {
            position: EventPosition::new(3),
            event: Event {
                payload: encoded.clone(),
                blob_tree: None,
            },
        };
        let decoded = decode_committed::<std::io::Error>(&record)
            .unwrap()
            .unwrap();
        assert_eq!(
            decoded.committed.event.payload,
            Bytes::from_static(b"payload")
        );
        assert_eq!(decoded.reference, Some(EventPosition::new(2)));
        for length in 0..encoded.len() {
            record.event.payload = encoded.slice(..length);
            assert!(decode_committed::<std::io::Error>(&record).is_err());
        }
        let mut extended = encoded.to_vec();
        extended.push(0);
        record.event.payload = Bytes::from(extended);
        assert!(decode_committed::<std::io::Error>(&record).is_err());
    }
}
