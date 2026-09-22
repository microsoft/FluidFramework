//! Versioned internal state, independent of application snapshot publication.

use std::collections::{BTreeMap, BTreeSet};

use bytes::{Buf, BufMut, Bytes, BytesMut};
use sea_core::{
    CommittedEvent, Event, EventPosition, SessionCommittedEvent, SessionId,
    archive::SessionEventKind,
};

use super::SessionError;
use crate::codec::{self, decode_committed, encode_membership};

/// Recent positions required by the 1024-entry policy and its 64-position rounding.
pub(super) const POSITION_WINDOW: usize = 1088;
/// Maximum applied entries between normal internal checkpoint publications.
pub(super) const INTERVAL: usize = 256;
/// Internal encoding marker, separate from event and application snapshot encodings.
const MAGIC: &[u8] = b"SEAC2";

/// Exact sequencer state at the last position in its recent window.
#[derive(Default)]
pub(super) struct Checkpoint {
    /// Persisted allocation upper bound, inclusive, with zero denoting no issued reservations.
    pub(super) reserved: u64,
    /// Monotonic admission floor at this committed boundary.
    pub(super) minimum_reference: Option<EventPosition>,
    /// Recent committed positions needed for floor advancement.
    pub(super) positions: BTreeSet<EventPosition>,
    /// Outstanding announcements requiring terminal departures on recovery.
    pub(super) announced: BTreeMap<SessionId, SessionCommittedEvent>,
}

impl Checkpoint {
    /// Encodes one exact applied boundary; no application snapshot is referenced.
    pub(super) fn encode<Error>(&self) -> Result<Bytes, SessionError<Error>> {
        let mut bytes = BytesMut::from(MAGIC);
        bytes.put_u64(self.reserved);
        codec::put_position(&mut bytes, self.minimum_reference);
        put_count(&mut bytes, self.positions.len())?;
        for position in &self.positions {
            bytes.put_u64(position.get());
        }
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

    /// Decodes bounded policy state and outstanding memberships, rejecting malformed encodings.
    pub(super) fn decode<Error>(mut bytes: Bytes) -> Result<Self, SessionError<Error>> {
        if !bytes.starts_with(MAGIC) {
            return Err(SessionError::Corrupt("checkpoint marker"));
        }
        bytes.advance(MAGIC.len());
        let reserved = take_u64(&mut bytes)?;
        let minimum_reference = codec::take_position(&mut bytes)?;
        let mut positions = BTreeSet::new();
        let count = take_count(&mut bytes)?;
        if count > POSITION_WINDOW {
            return Err(SessionError::Corrupt("checkpoint position window"));
        }
        for _ in 0..count {
            let position = EventPosition::new(take_u64(&mut bytes)?);
            if positions.last().is_some_and(|last| *last >= position) {
                return Err(SessionError::Corrupt("checkpoint position order"));
            }
            positions.insert(position);
        }
        if minimum_reference > positions.last().copied() {
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
                || Some(position) > positions.last().copied()
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
            reserved,
            minimum_reference,
            positions,
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
    fn checkpoint_rejects_every_truncation_and_trailing_bytes() {
        let checkpoint = Checkpoint {
            reserved: 256,
            positions: [EventPosition::new(1)].into(),
            ..Checkpoint::default()
        };
        let bytes = checkpoint.encode::<()>().unwrap();
        assert_eq!(
            Checkpoint::decode::<()>(bytes.clone()).unwrap().reserved,
            256
        );
        for length in 0..bytes.len() {
            assert!(Checkpoint::decode::<()>(bytes.slice(..length)).is_err());
        }
        let mut trailing = bytes.to_vec();
        trailing.push(0);
        assert!(Checkpoint::decode::<()>(trailing.into()).is_err());
    }
}
