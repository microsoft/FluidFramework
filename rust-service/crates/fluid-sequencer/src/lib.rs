#![doc = "A deterministic Fluid sequencing feasibility model over opaque appends."]

use std::collections::BTreeMap;

use bytes::{Buf, BufMut, Bytes, BytesMut};
use snapshotted_stream_core::SnapshotPosition;

const FRAME_MAGIC: &[u8; 4] = b"FSQ1";

/// A stable writer identity carried in every submitted frame.
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct WriterId(Bytes);

impl WriterId {
    /// Creates a non-empty writer identity.
    ///
    /// # Errors
    ///
    /// Returns [`ValueError::EmptyWriterId`] when `value` is empty.
    pub fn new(value: impl Into<Bytes>) -> Result<Self, ValueError> {
        let value = value.into();
        if value.is_empty() {
            return Err(ValueError::EmptyWriterId);
        }
        Ok(Self(value))
    }

    /// Returns the opaque writer identity bytes.
    #[must_use]
    pub fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

/// A serialized kernel stream position, opaque to this adapter.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PositionToken(Bytes);

impl PositionToken {
    /// Creates a non-empty serialized position.
    ///
    /// # Errors
    ///
    /// Returns [`ValueError::EmptyPosition`] when `value` is empty.
    pub fn new(value: impl Into<Bytes>) -> Result<Self, ValueError> {
        let value = value.into();
        if value.is_empty() {
            return Err(ValueError::EmptyPosition);
        }
        Ok(Self(value))
    }

    /// Returns the opaque serialized position bytes.
    #[must_use]
    pub fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

/// Invalid strongly typed values.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ValueError {
    EmptyWriterId,
    EmptyPosition,
}

/// A writer submission before final sequencing metadata is assigned.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Submission {
    pub writer_id: WriterId,
    pub local_sequence_number: u64,
    pub reference_position: SnapshotPosition<PositionToken>,
    pub payload: Bytes,
}

/// Failures while encoding or decoding a submission frame.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameError {
    FieldTooLarge,
    InvalidMagic,
    Truncated,
    InvalidReferenceTag,
    InvalidValue(ValueError),
    TrailingBytes,
}

/// Encodes one submission while preserving its append boundary.
///
/// # Errors
///
/// Returns [`FrameError::FieldTooLarge`] if an identity, position, or payload cannot be length
/// prefixed by the frame format.
pub fn encode_submission(submission: &Submission) -> Result<Bytes, FrameError> {
    let writer_length =
        u16::try_from(submission.writer_id.0.len()).map_err(|_| FrameError::FieldTooLarge)?;
    let payload_length =
        u32::try_from(submission.payload.len()).map_err(|_| FrameError::FieldTooLarge)?;
    let reference_length = match &submission.reference_position {
        SnapshotPosition::Initial => 0,
        SnapshotPosition::At(position) => {
            u16::try_from(position.0.len()).map_err(|_| FrameError::FieldTooLarge)?
        }
    };

    let mut frame = BytesMut::with_capacity(
        FRAME_MAGIC.len()
            + 2
            + usize::from(writer_length)
            + 8
            + 1
            + 2
            + usize::from(reference_length)
            + 4
            + submission.payload.len(),
    );
    frame.extend_from_slice(FRAME_MAGIC);
    frame.put_u16(writer_length);
    frame.extend_from_slice(&submission.writer_id.0);
    frame.put_u64(submission.local_sequence_number);
    match &submission.reference_position {
        SnapshotPosition::Initial => frame.put_u8(0),
        SnapshotPosition::At(position) => {
            frame.put_u8(1);
            frame.put_u16(reference_length);
            frame.extend_from_slice(&position.0);
        }
    }
    frame.put_u32(payload_length);
    frame.extend_from_slice(&submission.payload);
    Ok(frame.freeze())
}

/// Decodes one complete submission frame.
///
/// # Errors
///
/// Returns a [`FrameError`] for malformed, truncated, or non-canonical input.
pub fn decode_submission(mut frame: Bytes) -> Result<Submission, FrameError> {
    if frame.remaining() < FRAME_MAGIC.len() || &frame[..FRAME_MAGIC.len()] != FRAME_MAGIC {
        return Err(FrameError::InvalidMagic);
    }
    frame.advance(FRAME_MAGIC.len());

    let writer = take_u16_bytes(&mut frame)?;
    let writer_id = WriterId::new(writer).map_err(FrameError::InvalidValue)?;
    if frame.remaining() < 9 {
        return Err(FrameError::Truncated);
    }
    let local_sequence_number = frame.get_u64();
    let reference_position = match frame.get_u8() {
        0 => SnapshotPosition::Initial,
        1 => {
            let position = take_u16_bytes(&mut frame)?;
            SnapshotPosition::At(PositionToken::new(position).map_err(FrameError::InvalidValue)?)
        }
        _ => return Err(FrameError::InvalidReferenceTag),
    };
    if frame.remaining() < 4 {
        return Err(FrameError::Truncated);
    }
    let payload_length = usize::try_from(frame.get_u32()).map_err(|_| FrameError::FieldTooLarge)?;
    if frame.remaining() < payload_length {
        return Err(FrameError::Truncated);
    }
    let payload = frame.split_to(payload_length);
    if frame.has_remaining() {
        return Err(FrameError::TrailingBytes);
    }

    Ok(Submission {
        writer_id,
        local_sequence_number,
        reference_position,
        payload,
    })
}

fn take_u16_bytes(frame: &mut Bytes) -> Result<Bytes, FrameError> {
    if frame.remaining() < 2 {
        return Err(FrameError::Truncated);
    }
    let length = usize::from(frame.get_u16());
    if frame.remaining() < length {
        return Err(FrameError::Truncated);
    }
    Ok(frame.split_to(length))
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct WriterState {
    local_sequence_number: u64,
    reference_position: SnapshotPosition<PositionToken>,
}

/// Final sequence metadata deterministically derived from committed append order.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SequencedMessage {
    pub stream_position: PositionToken,
    pub sequence_number: u64,
    pub minimum_reference_position: SnapshotPosition<PositionToken>,
    pub submission: Submission,
}

/// A protocol-level rejection discovered while replaying an already committed frame.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Rejection {
    DuplicateStreamPosition,
    MalformedFrame(FrameError),
    WriterAlreadyActive,
    UnknownWriter,
    DuplicateLocalSequence { last_accepted: u64, received: u64 },
    LocalSequenceGap { expected: u64, received: u64 },
    UnknownReferencePosition,
    StaleReferencePosition,
}

/// Deterministic state derived by replaying framed opaque appends in committed order.
#[derive(Debug, Default)]
pub struct Sequencer {
    observed_positions: Vec<PositionToken>,
    writers: BTreeMap<WriterId, WriterState>,
    sequence_number: u64,
}

impl Sequencer {
    /// Creates an empty replay state.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers an active writer at a known, non-stale creation position.
    ///
    /// # Errors
    ///
    /// Returns a protocol rejection when the reference is unknown or older than the current
    /// minimum, or when the writer is already active.
    pub fn join(
        &mut self,
        writer_id: WriterId,
        reference_position: SnapshotPosition<PositionToken>,
    ) -> Result<(), Rejection> {
        if self.writers.contains_key(&writer_id) {
            return Err(Rejection::WriterAlreadyActive);
        }
        self.validate_reference(&reference_position)?;
        if self.is_below_minimum(&reference_position) {
            return Err(Rejection::StaleReferencePosition);
        }
        self.writers.insert(
            writer_id,
            WriterState {
                local_sequence_number: 0,
                reference_position,
            },
        );
        Ok(())
    }

    /// Removes an active writer. Returns whether the writer was present.
    pub fn leave(&mut self, writer_id: &WriterId) -> bool {
        self.writers.remove(writer_id).is_some()
    }

    /// Observes one committed opaque append and projects it into final sequence metadata.
    ///
    /// The stream position is recorded even when the protocol frame is rejected: the opaque
    /// kernel append has already committed and cannot be removed by this adapter.
    ///
    /// # Errors
    ///
    /// Returns a protocol rejection for malformed frames, duplicate or gapped writer-local
    /// order, unknown writers or references, and stale references.
    pub fn observe(
        &mut self,
        stream_position: PositionToken,
        frame: Bytes,
    ) -> Result<SequencedMessage, Rejection> {
        if self.position_index(&stream_position).is_some() {
            return Err(Rejection::DuplicateStreamPosition);
        }
        self.observed_positions.push(stream_position.clone());

        let submission = decode_submission(frame).map_err(Rejection::MalformedFrame)?;
        let writer = self
            .writers
            .get(&submission.writer_id)
            .ok_or(Rejection::UnknownWriter)?;
        let expected = writer.local_sequence_number + 1;
        if submission.local_sequence_number <= writer.local_sequence_number {
            return Err(Rejection::DuplicateLocalSequence {
                last_accepted: writer.local_sequence_number,
                received: submission.local_sequence_number,
            });
        }
        if submission.local_sequence_number != expected {
            return Err(Rejection::LocalSequenceGap {
                expected,
                received: submission.local_sequence_number,
            });
        }
        self.validate_prior_reference(&submission.reference_position)?;
        if self.reference_rank(&submission.reference_position)
            < self.reference_rank(&writer.reference_position)
            || self.is_below_minimum(&submission.reference_position)
        {
            return Err(Rejection::StaleReferencePosition);
        }

        let Some(writer) = self.writers.get_mut(&submission.writer_id) else {
            return Err(Rejection::UnknownWriter);
        };
        writer.local_sequence_number = submission.local_sequence_number;
        writer.reference_position = submission.reference_position.clone();
        self.sequence_number += 1;

        Ok(SequencedMessage {
            stream_position,
            sequence_number: self.sequence_number,
            minimum_reference_position: self.minimum_reference_position(),
            submission,
        })
    }

    /// Returns the minimum reference position among active writers.
    #[must_use]
    pub fn minimum_reference_position(&self) -> SnapshotPosition<PositionToken> {
        self.writers
            .values()
            .min_by_key(|writer| self.reference_rank(&writer.reference_position))
            .map_or_else(
                || {
                    self.observed_positions
                        .last()
                        .cloned()
                        .map_or(SnapshotPosition::Initial, SnapshotPosition::At)
                },
                |writer| writer.reference_position.clone(),
            )
    }

    fn validate_reference(
        &self,
        reference: &SnapshotPosition<PositionToken>,
    ) -> Result<(), Rejection> {
        if matches!(reference, SnapshotPosition::At(position) if self.position_index(position).is_none())
        {
            return Err(Rejection::UnknownReferencePosition);
        }
        Ok(())
    }

    fn validate_prior_reference(
        &self,
        reference: &SnapshotPosition<PositionToken>,
    ) -> Result<(), Rejection> {
        if matches!(
            reference,
            SnapshotPosition::At(position)
                if self.position_index(position).is_none_or(|index| index + 1 == self.observed_positions.len())
        ) {
            return Err(Rejection::UnknownReferencePosition);
        }
        Ok(())
    }

    fn is_below_minimum(&self, reference: &SnapshotPosition<PositionToken>) -> bool {
        self.reference_rank(reference) < self.reference_rank(&self.minimum_reference_position())
    }

    fn reference_rank(&self, reference: &SnapshotPosition<PositionToken>) -> usize {
        match reference {
            SnapshotPosition::Initial => 0,
            SnapshotPosition::At(position) => self
                .position_index(position)
                .map_or(usize::MAX, |index| index + 1),
        }
    }

    fn position_index(&self, position: &PositionToken) -> Option<usize> {
        self.observed_positions
            .iter()
            .position(|observed| observed == position)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn writer(value: &'static [u8]) -> WriterId {
        WriterId::new(Bytes::from_static(value)).unwrap()
    }

    fn position(value: &'static [u8]) -> PositionToken {
        PositionToken::new(Bytes::from_static(value)).unwrap()
    }

    fn submission(
        writer_id: &WriterId,
        local_sequence_number: u64,
        reference_position: SnapshotPosition<PositionToken>,
    ) -> Bytes {
        encode_submission(&Submission {
            writer_id: writer_id.clone(),
            local_sequence_number,
            reference_position,
            payload: Bytes::from_static(b"payload"),
        })
        .unwrap()
    }

    #[test]
    fn frame_round_trips_opaque_reference_and_payload() {
        let submission = Submission {
            writer_id: writer(b"writer-a"),
            local_sequence_number: 42,
            reference_position: SnapshotPosition::At(position(b"opaque-position")),
            payload: Bytes::from_static(b"operation"),
        };

        assert_eq!(
            decode_submission(encode_submission(&submission).unwrap()).unwrap(),
            submission
        );
    }

    #[test]
    fn committed_order_deterministically_assigns_final_sequence_metadata() {
        let alice = writer(b"alice");
        let bob = writer(b"bob");
        let mut first_replay = Sequencer::new();
        let mut second_replay = Sequencer::new();
        for sequencer in [&mut first_replay, &mut second_replay] {
            sequencer
                .join(alice.clone(), SnapshotPosition::Initial)
                .unwrap();
            sequencer
                .join(bob.clone(), SnapshotPosition::Initial)
                .unwrap();
        }
        let committed = [
            (
                position(b"p1"),
                submission(&bob, 1, SnapshotPosition::Initial),
            ),
            (
                position(b"p2"),
                submission(&alice, 1, SnapshotPosition::Initial),
            ),
        ];

        let first = committed
            .clone()
            .into_iter()
            .map(|(position, frame)| first_replay.observe(position, frame).unwrap())
            .collect::<Vec<_>>();
        let second = committed
            .into_iter()
            .map(|(position, frame)| second_replay.observe(position, frame).unwrap())
            .collect::<Vec<_>>();

        assert_eq!(first, second);
        assert_eq!(first[0].sequence_number, 1);
        assert_eq!(first[0].submission.writer_id, bob);
        assert_eq!(first[1].sequence_number, 2);
        assert_eq!(first[1].submission.writer_id, alice);
    }

    #[test]
    fn duplicate_gap_and_stale_reference_do_not_advance_final_sequence() {
        let alice = writer(b"alice");
        let bob = writer(b"bob");
        let mut sequencer = Sequencer::new();
        sequencer
            .join(alice.clone(), SnapshotPosition::Initial)
            .unwrap();
        sequencer
            .join(bob.clone(), SnapshotPosition::Initial)
            .unwrap();

        let first = sequencer
            .observe(
                position(b"p1"),
                submission(&alice, 1, SnapshotPosition::Initial),
            )
            .unwrap();
        assert_eq!(first.sequence_number, 1);
        assert_eq!(
            sequencer.observe(
                position(b"p2"),
                submission(&alice, 1, SnapshotPosition::Initial)
            ),
            Err(Rejection::DuplicateLocalSequence {
                last_accepted: 1,
                received: 1
            })
        );
        assert_eq!(
            sequencer.observe(
                position(b"p3"),
                submission(&alice, 3, SnapshotPosition::Initial)
            ),
            Err(Rejection::LocalSequenceGap {
                expected: 2,
                received: 3
            })
        );

        let bob_advance = sequencer
            .observe(
                position(b"p4"),
                submission(&bob, 1, SnapshotPosition::At(position(b"p1"))),
            )
            .unwrap();
        assert_eq!(bob_advance.sequence_number, 2);
        let alice_advance = sequencer
            .observe(
                position(b"p5"),
                submission(&alice, 2, SnapshotPosition::At(position(b"p1"))),
            )
            .unwrap();
        assert_eq!(
            alice_advance.minimum_reference_position,
            SnapshotPosition::At(position(b"p1"))
        );
        assert_eq!(
            sequencer.observe(
                position(b"p6"),
                submission(&alice, 3, SnapshotPosition::Initial)
            ),
            Err(Rejection::StaleReferencePosition)
        );

        let next = sequencer
            .observe(
                position(b"p7"),
                submission(&alice, 3, SnapshotPosition::At(position(b"p5"))),
            )
            .unwrap();
        assert_eq!(next.sequence_number, 4);
        assert!(sequencer.leave(&bob));
        assert_eq!(
            sequencer.minimum_reference_position(),
            SnapshotPosition::At(position(b"p5"))
        );
    }

    #[test]
    fn protocol_rejection_is_only_known_after_opaque_append_commits() {
        let alice = writer(b"alice");
        let mut sequencer = Sequencer::new();
        sequencer
            .join(alice.clone(), SnapshotPosition::Initial)
            .unwrap();
        sequencer
            .observe(
                position(b"p1"),
                submission(&alice, 1, SnapshotPosition::Initial),
            )
            .unwrap();

        assert_eq!(
            sequencer.observe(
                position(b"committed-p2"),
                submission(&alice, 3, SnapshotPosition::Initial),
            ),
            Err(Rejection::LocalSequenceGap {
                expected: 2,
                received: 3
            })
        );
        assert_eq!(
            sequencer
                .observe(
                    position(b"p3"),
                    submission(&alice, 2, SnapshotPosition::At(position(b"committed-p2"))),
                )
                .unwrap()
                .sequence_number,
            2
        );
    }

    #[test]
    fn unknown_reference_is_rejected_without_advancing_writer_order() {
        let alice = writer(b"alice");
        let mut sequencer = Sequencer::new();
        sequencer
            .join(alice.clone(), SnapshotPosition::Initial)
            .unwrap();

        assert_eq!(
            sequencer.observe(
                position(b"p1"),
                submission(&alice, 1, SnapshotPosition::At(position(b"future"))),
            ),
            Err(Rejection::UnknownReferencePosition)
        );
        assert_eq!(
            sequencer.observe(
                position(b"p2"),
                submission(&alice, 1, SnapshotPosition::At(position(b"p2"))),
            ),
            Err(Rejection::UnknownReferencePosition)
        );
        assert_eq!(
            sequencer
                .observe(
                    position(b"p3"),
                    submission(&alice, 1, SnapshotPosition::Initial)
                )
                .unwrap()
                .sequence_number,
            1
        );
    }
}
