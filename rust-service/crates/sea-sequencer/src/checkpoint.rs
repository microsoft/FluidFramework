//! Versioned internal state, independent of application snapshot publication.

use std::collections::BTreeMap;

use bytes::{Buf, BufMut, Bytes, BytesMut};
use sea_core::{
    CommittedEvent, Event, EventPosition, SessionCommittedEvent, SessionId,
    archive::SessionEventKind,
};

use super::SessionError;
use crate::codec::{self, decode_committed, encode_membership};

/// Maximum applied entries between normal internal checkpoint publications.
pub(super) const INTERVAL: usize = 256;
/// Internal encoding marker, separate from event and application snapshot encodings.
const MAGIC: &[u8] = b"SEAC3";

/// Durable sequencer state at an exact applied boundary; live session policy resets on recovery.
#[derive(Default)]
pub(super) struct Checkpoint {
    /// Highest session ID durably reserved, inclusive; zero means no IDs have been reserved.
    /// Recovery allocates above this value, skipping unused IDs in the reservation to prevent reuse.
    pub(super) session_id_reserved_through: u64,
    /// Monotonic admission floor at this committed boundary.
    pub(super) minimum_reference: Option<EventPosition>,
    /// Last applied event, inclusive; recovery replays only events after this position.
    pub(super) applied_through: Option<EventPosition>,
    /// Outstanding announcements requiring terminal departures on recovery.
    pub(super) announced: BTreeMap<SessionId, SessionCommittedEvent>,
}

impl Checkpoint {
    /// Encodes one exact applied boundary; no application snapshot is referenced.
    pub(super) fn encode<Error>(&self) -> Result<Bytes, SessionError<Error>> {
        let mut bytes = BytesMut::from(MAGIC);
        bytes.put_u64(self.session_id_reserved_through);
        codec::put_position(&mut bytes, self.minimum_reference);
        codec::put_position(&mut bytes, self.applied_through);
        put_count(&mut bytes, self.announced.len())?;
        for event in self.announced.values() {
            bytes.put_u64(event.committed.position.get());
            let payload = encode_membership(
                &event.session_id,
                SessionEventKind::Joined,
                event.reference,
                event.minimum_reference,
                &event.committed.event.payload,
            )?;
            codec::put_field(&mut bytes, &payload)?;
        }
        Ok(bytes.freeze())
    }

    /// Decodes the applied boundary, durable floor, and outstanding memberships.
    pub(super) fn decode<Error>(mut bytes: Bytes) -> Result<Self, SessionError<Error>> {
        if !bytes.starts_with(MAGIC) {
            return Err(SessionError::Corrupt("checkpoint marker"));
        }
        bytes.advance(MAGIC.len());
        let reserved = take_u64(&mut bytes)?;
        let minimum_reference = codec::take_position(&mut bytes)?;
        let applied_through = codec::take_position(&mut bytes)?;
        if minimum_reference > applied_through {
            return Err(SessionError::Corrupt("checkpoint floor"));
        }
        let mut announced = BTreeMap::new();
        for _ in 0..take_count(&mut bytes)? {
            let position = EventPosition::new(take_u64(&mut bytes)?);
            let payload = codec::take_field(&mut bytes)?;
            let event = decode_committed(&CommittedEvent {
                position,
                event: Event {
                    payload,
                    blob_tree: None,
                },
            })?;
            if event.kind != SessionEventKind::Joined
                || Some(position) > applied_through
                || event.session_id.get() > reserved
                || announced.insert(event.session_id.clone(), event).is_some()
            {
                return Err(SessionError::Corrupt("checkpoint announcement"));
            }
        }
        if bytes.has_remaining() {
            return Err(SessionError::Corrupt("checkpoint trailing bytes"));
        }
        Ok(Self {
            session_id_reserved_through: reserved,
            minimum_reference,
            applied_through,
            announced,
        })
    }
}

/// Encodes a checked collection length.
fn put_count<Error>(bytes: &mut BytesMut, count: usize) -> Result<(), SessionError<Error>> {
    bytes.put_u32(
        u32::try_from(count).map_err(|_| SessionError::Rejected("checkpoint collection length"))?,
    );
    Ok(())
}

/// Decodes a collection length without reserving memory based on untrusted input.
fn take_count<Error>(bytes: &mut Bytes) -> Result<usize, SessionError<Error>> {
    if bytes.remaining() < 4 {
        return Err(SessionError::Corrupt("checkpoint count"));
    }
    usize::try_from(bytes.get_u32()).map_err(|_| SessionError::Corrupt("checkpoint count overflow"))
}

/// Decodes a fixed-width integer with explicit truncation handling.
fn take_u64<Error>(bytes: &mut Bytes) -> Result<u64, SessionError<Error>> {
    if bytes.remaining() < 8 {
        return Err(SessionError::Corrupt("checkpoint integer"));
    }
    Ok(bytes.get_u64())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checkpoint_announcements_preserve_metadata_and_reject_invalid_bounds() {
        let session = SessionId::new(1).unwrap();
        let announcement = SessionCommittedEvent {
            kind: SessionEventKind::Joined,
            session_id: session.clone(),
            reference: None,
            minimum_reference: None,
            committed: CommittedEvent {
                position: EventPosition::new(1),
                event: Event {
                    payload: Bytes::from_static(b"public metadata"),
                    blob_tree: None,
                },
            },
        };
        let mut checkpoint = Checkpoint {
            session_id_reserved_through: 256,
            minimum_reference: Some(EventPosition::new(1)),
            applied_through: Some(EventPosition::new(2)),
            announced: [(session, announcement)].into_iter().collect(),
        };
        let encoded = checkpoint.encode::<()>().unwrap();
        let decoded = Checkpoint::decode::<()>(encoded.clone()).unwrap();
        assert_eq!(decoded.announced, checkpoint.announced);
        for length in 0..encoded.len() {
            assert!(Checkpoint::decode::<()>(encoded.slice(..length)).is_err());
        }
        checkpoint.session_id_reserved_through = 0;
        assert!(matches!(
            Checkpoint::decode::<()>(checkpoint.encode::<()>().unwrap()),
            Err(SessionError::Corrupt("checkpoint announcement"))
        ));
        checkpoint.session_id_reserved_through = 256;
        checkpoint
            .announced
            .values_mut()
            .next()
            .unwrap()
            .committed
            .position = EventPosition::new(3);
        assert!(matches!(
            Checkpoint::decode::<()>(checkpoint.encode::<()>().unwrap()),
            Err(SessionError::Corrupt("checkpoint announcement"))
        ));
    }

    #[test]
    fn checkpoint_rejects_every_truncation_and_trailing_bytes() {
        let checkpoint = Checkpoint {
            session_id_reserved_through: 256,
            minimum_reference: Some(EventPosition::new(1)),
            applied_through: Some(EventPosition::new(1)),
            ..Checkpoint::default()
        };
        let bytes = checkpoint.encode::<()>().unwrap();
        assert_eq!(bytes.len(), 35);
        let decoded = Checkpoint::decode::<()>(bytes.clone()).unwrap();
        assert_eq!(decoded.applied_through, checkpoint.applied_through);
        assert_eq!(decoded.minimum_reference, checkpoint.minimum_reference);
        assert_eq!(
            Checkpoint::decode::<()>(bytes.clone())
                .unwrap()
                .session_id_reserved_through,
            256
        );
        for length in 0..bytes.len() {
            assert!(Checkpoint::decode::<()>(bytes.slice(..length)).is_err());
        }
        let mut trailing = bytes.to_vec();
        trailing.push(0);
        assert!(Checkpoint::decode::<()>(trailing.into()).is_err());
        let invalid = Checkpoint {
            applied_through: None,
            ..checkpoint
        };
        assert!(Checkpoint::decode::<()>(invalid.encode::<()>().unwrap()).is_err());
    }
}
