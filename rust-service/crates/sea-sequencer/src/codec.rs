//! Private persisted submission encoding for the local sequencer.
//!
//! Each application event stores session identity, its explicit
//! reference, the durable minimum-reference floor, and opaque application bytes. Blob-tree identity stays
//! in the surrounding storage event so availability checks remain owned by the storage view.
//!
//! Older active-member-minimum encodings are rejected rather than interpreted as enforced floors.
//! Announced membership records use a distinct marker
//! and share the same archive order without occupying the application submission identity space.
//! Decoding rejects an invalid marker, empty identity, truncation, unknown position tag, or trailing
//! bytes as [`crate::SessionError::Corrupt`].

use bytes::{Buf, BufMut, Bytes, BytesMut};
use sea_core::archive::SessionEventKind;
use sea_core::{CommittedEvent, Event, EventPosition, SessionCommittedEvent, SessionId};

use crate::session::SessionError;

/// Identifies the submission-only encoding.
const MAGIC: &[u8; 5] = b"SEAQ6";

/// Identifies a service-authored membership envelope around submission-shaped metadata.
const MEMBERSHIP_MAGIC: &[u8; 5] = b"SEAM5";

/// Encodes an announced membership transition in the same ordered archive as submissions.
pub(crate) fn encode_membership<Error>(
    session: &SessionId,
    kind: SessionEventKind,
    reference: Option<EventPosition>,
    minimum_reference: Option<EventPosition>,
    metadata: &[u8],
) -> Result<Bytes, SessionError<Error>> {
    let tag = match kind {
        SessionEventKind::Joined => 0,
        SessionEventKind::Left if metadata.is_empty() => 1,
        _ => return Err(SessionError::Rejected("invalid membership event")),
    };
    let submission = encode_submission::<Error>(session, reference, minimum_reference, metadata)?;
    let mut encoded = BytesMut::new();
    encoded.extend_from_slice(MEMBERSHIP_MAGIC);
    encoded.put_u8(tag);
    encoded.extend_from_slice(&submission);
    Ok(encoded.freeze())
}

/// Encodes stable submission metadata and opaque application bytes.
pub(crate) fn encode_submission<Error>(
    session: &SessionId,
    reference: Option<EventPosition>,
    minimum_reference: Option<EventPosition>,
    payload: &[u8],
) -> Result<Bytes, SessionError<Error>> {
    let mut encoded = BytesMut::new();
    encoded.extend_from_slice(MAGIC);
    encoded.put_u64(session.get());
    put_position(&mut encoded, reference);
    put_position(&mut encoded, minimum_reference);
    put_field(&mut encoded, payload)?;
    Ok(encoded.freeze())
}

/// Decodes a persisted submission, rejecting truncation and trailing bytes.
///
/// The returned payload owns exact-sized backing, independent of the encoded record.
/// Metadata parsing only borrows shared input backing; it does not copy the encoded body.
pub(crate) fn decode_committed<Error>(
    record: &CommittedEvent,
) -> Result<SessionCommittedEvent, SessionError<Error>> {
    let (kind, payload) =
        if let Some(envelope) = record.event.payload.strip_prefix(MEMBERSHIP_MAGIC) {
            let Some((&tag, payload)) = envelope.split_first() else {
                return Err(SessionError::Corrupt("truncated membership tag"));
            };
            let kind = match tag {
                0 => SessionEventKind::Joined,
                1 => SessionEventKind::Left,
                _ => return Err(SessionError::Corrupt("invalid membership tag")),
            };
            if record.event.blob_tree.is_some() {
                return Err(SessionError::Corrupt("membership event contains a tree"));
            }
            (kind, payload)
        } else {
            (SessionEventKind::Application, record.event.payload.as_ref())
        };
    let Some(encoded) = payload.strip_prefix(MAGIC) else {
        return Err(SessionError::Corrupt("invalid submission marker"));
    };
    let mut bytes = record.event.payload.slice_ref(encoded);
    if bytes.remaining() < 8 {
        return Err(SessionError::Corrupt("truncated session identity"));
    }
    let session_id = SessionId::new(bytes.get_u64())
        .map_err(|_| SessionError::Corrupt("zero session identity"))?;
    let reference = take_position(&mut bytes)?;
    let minimum_reference = take_position(&mut bytes)?;
    let payload = take_field(&mut bytes)?;
    if bytes.has_remaining() {
        return Err(SessionError::Corrupt("trailing submission bytes"));
    }
    if kind == SessionEventKind::Left && !payload.is_empty() {
        return Err(SessionError::Corrupt("departure contains metadata"));
    }
    Ok(SessionCommittedEvent {
        kind,
        committed: CommittedEvent {
            position: record.position,
            event: Event {
                payload: Bytes::from(payload.as_ref().to_vec().into_boxed_slice()),
                blob_tree: record.event.blob_tree,
            },
        },

        session_id,
        reference,
        minimum_reference,
    })
}

/// Writes a length-prefixed identity or payload.
pub(super) fn put_field<Error>(
    encoded: &mut BytesMut,
    bytes: &[u8],
) -> Result<(), SessionError<Error>> {
    encoded.put_u32(
        u32::try_from(bytes.len())
            .map_err(|_| SessionError::Rejected("submission field is too large"))?,
    );
    encoded.extend_from_slice(bytes);
    Ok(())
}

/// Writes a tagged optional position.
pub(super) fn put_position(encoded: &mut BytesMut, position: Option<EventPosition>) {
    encoded.put_u8(u8::from(position.is_some()));
    if let Some(position) = position {
        encoded.put_u64(position.get());
    }
}

/// Reads one length-prefixed field without trusting its declared size.
pub(super) fn take_field<Error>(bytes: &mut Bytes) -> Result<Bytes, SessionError<Error>> {
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
pub(super) fn take_position<Error>(
    bytes: &mut Bytes,
) -> Result<Option<EventPosition>, SessionError<Error>> {
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
    fn decoded_payload_has_exact_backing_and_does_not_retain_encoded_storage() {
        for kind in [
            SessionEventKind::Application,
            SessionEventKind::Joined,
            SessionEventKind::Left,
        ] {
            for length in [0, 64, 8192] {
                if kind == SessionEventKind::Left && length != 0 {
                    continue;
                }
                let payload = vec![7; length];
                let session = SessionId::new(1).unwrap();
                let reference = Some(EventPosition::new(2));
                let encoded = if kind == SessionEventKind::Application {
                    encode_submission::<std::io::Error>(&session, reference, reference, &payload)
                } else {
                    encode_membership::<std::io::Error>(
                        &session, kind, reference, reference, &payload,
                    )
                }
                .unwrap();
                let offset = 123;
                let mut backing = vec![0; 4 * 1024 * 1024];
                backing[offset..offset + encoded.len()].copy_from_slice(&encoded);
                let backing = std::sync::Arc::<[u8]>::from(backing);
                let weak = std::sync::Arc::downgrade(&backing);
                let record = CommittedEvent {
                    position: EventPosition::new(3),
                    event: Event {
                        payload: Bytes::from_owner(backing).slice(offset..offset + encoded.len()),
                        blob_tree: None,
                    },
                };
                let decoded = decode_committed::<std::io::Error>(&record).unwrap();
                assert_eq!(decoded.kind, kind);
                assert_eq!(decoded.reference, reference);
                assert_eq!(decoded.minimum_reference, reference);
                assert_eq!(decoded.committed.event.payload.as_ref(), payload);
                drop(record);
                assert!(weak.upgrade().is_none(), "encoded backing must be released");
                if length != 0 {
                    let owned = decoded.committed.event.payload.try_into_mut().unwrap();
                    assert_eq!(owned.capacity(), length, "charge the full allocation");
                }
            }
        }
    }

    #[test]
    fn membership_encoding_preserves_kind_and_rejects_malformed_records() {
        for kind in [SessionEventKind::Joined, SessionEventKind::Left] {
            let metadata = if kind == SessionEventKind::Joined {
                b"member".as_slice()
            } else {
                b""
            };
            let encoded = encode_membership::<std::io::Error>(
                &SessionId::new(1).unwrap(),
                kind,
                Some(EventPosition::new(2)),
                None,
                metadata,
            )
            .unwrap();
            let mut record = CommittedEvent {
                position: EventPosition::new(3),
                event: Event {
                    payload: encoded.clone(),
                    blob_tree: None,
                },
            };
            let decoded = decode_committed::<std::io::Error>(&record).unwrap();
            assert_eq!(decoded.kind, kind);
            assert_eq!(decoded.committed.event.payload.as_ref(), metadata);
            for length in 0..encoded.len() {
                record.event.payload = encoded.slice(..length);
                assert!(decode_committed::<std::io::Error>(&record).is_err());
            }
            let mut invalid_tag = encoded.to_vec();
            invalid_tag[MEMBERSHIP_MAGIC.len()] = 2;
            record.event.payload = Bytes::from(invalid_tag);
            assert!(decode_committed::<std::io::Error>(&record).is_err());
            let mut trailing = encoded.to_vec();
            trailing.push(0);
            record.event.payload = Bytes::from(trailing);
            assert!(decode_committed::<std::io::Error>(&record).is_err());
            let mut previous_format = encoded.to_vec();
            previous_format[..MEMBERSHIP_MAGIC.len()].copy_from_slice(b"SEAM2");
            record.event.payload = Bytes::from(previous_format);
            assert!(decode_committed::<std::io::Error>(&record).is_err());
        }
    }

    #[test]
    fn submission_round_trip_rejects_every_truncation_and_trailing_bytes() {
        let encoded = encode_submission::<std::io::Error>(
            &SessionId::new(1).unwrap(),
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
        let decoded = decode_committed::<std::io::Error>(&record).unwrap();
        assert_eq!(decoded.kind, SessionEventKind::Application);
        assert_eq!(
            decoded.committed.event.payload,
            Bytes::from_static(b"payload")
        );
        assert_eq!(decoded.reference, Some(EventPosition::new(2)));
        let mut zero_identity = encoded.to_vec();
        zero_identity[MAGIC.len()..MAGIC.len() + 8].fill(0);
        record.event.payload = Bytes::from(zero_identity);
        assert!(matches!(
            decode_committed::<std::io::Error>(&record),
            Err(SessionError::Corrupt("zero session identity"))
        ));
        let mut unknown_tag = encoded.to_vec();
        unknown_tag[MAGIC.len() + 8] = 2;
        record.event.payload = Bytes::from(unknown_tag);
        assert!(matches!(
            decode_committed::<std::io::Error>(&record),
            Err(SessionError::Corrupt("invalid position"))
        ));
        for length in 0..encoded.len() {
            record.event.payload = encoded.slice(..length);
            assert!(decode_committed::<std::io::Error>(&record).is_err());
        }
        let mut extended = encoded.to_vec();
        extended.push(0);
        record.event.payload = Bytes::from(extended);
        assert!(decode_committed::<std::io::Error>(&record).is_err());
        let mut previous_format = encoded.to_vec();
        previous_format[..MAGIC.len()].copy_from_slice(b"SEAQ3");
        record.event.payload = Bytes::from(previous_format);
        assert!(decode_committed::<std::io::Error>(&record).is_err());
    }
}
