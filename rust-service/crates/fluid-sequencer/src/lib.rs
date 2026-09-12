#![doc = "A valid-only authoritative Fluid sequencer over opaque appends."]

use std::{
    collections::{BTreeMap, BTreeSet},
    future::Future,
    sync::{Arc, RwLock},
};

use bytes::{Buf, BufMut, Bytes, BytesMut};
use snapshotted_stream_core::{
    AppendReceipt, AppendStream, ClassifiedError, ErrorKind, PositionCodec, ReadRecord,
    SnapshotPosition, StreamPosition,
};

const FRAME_MAGIC: &[u8; 4] = b"FSQ2";
const SESSION_START_TAG: u8 = 0;
const SUBMISSION_TAG: u8 = 1;

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

/// A connection-scoped identity. Reconnects must use a fresh value.
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct SessionId(Bytes);

impl SessionId {
    /// Creates a non-empty session identity.
    ///
    /// # Errors
    ///
    /// Returns [`ValueError::EmptySessionId`] when `value` is empty.
    pub fn new(value: impl Into<Bytes>) -> Result<Self, ValueError> {
        let value = value.into();
        if value.is_empty() {
            return Err(ValueError::EmptySessionId);
        }
        Ok(Self(value))
    }

    /// Returns the opaque session identity bytes.
    #[must_use]
    pub fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

/// A stable identity used to reconcile and deduplicate one logical submission.
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct SubmissionId(Bytes);

impl SubmissionId {
    /// Creates a non-empty submission identity.
    ///
    /// # Errors
    ///
    /// Returns [`ValueError::EmptySubmissionId`] when `value` is empty.
    pub fn new(value: impl Into<Bytes>) -> Result<Self, ValueError> {
        let value = value.into();
        if value.is_empty() {
            return Err(ValueError::EmptySubmissionId);
        }
        Ok(Self(value))
    }

    /// Returns the opaque submission identity bytes.
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
    EmptySessionId,
    EmptySubmissionId,
    EmptyPosition,
}

/// A writer submission before final sequencing metadata is assigned.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Submission {
    pub writer_id: WriterId,
    pub session_id: SessionId,
    pub submission_id: SubmissionId,
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
    InvalidEntryTag,
    TrailingBytes,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct WriterState {
    session_id: SessionId,
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

/// A protocol-level rejection produced before an invalid operation is appended.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Rejection {
    SessionAlreadyUsed,
    UnknownWriter,
    StaleSession,
    DuplicateLocalSequence { last_accepted: u64, received: u64 },
    LocalSequenceGap { expected: u64, received: u64 },
    UnknownReferencePosition,
    StaleReferencePosition,
    SubmissionIdentityConflict,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum LogEntry {
    SessionStart {
        writer_id: WriterId,
        session_id: SessionId,
        reference_position: SnapshotPosition<PositionToken>,
    },
    Submission(Submission),
}

#[derive(Debug, Default)]
struct SequencerState {
    observed_positions: Vec<PositionToken>,
    writers: BTreeMap<WriterId, WriterState>,
    seen_sessions: BTreeSet<SessionId>,
    accepted: BTreeMap<SubmissionId, SequencedMessage>,
    sequence_number: u64,
}

impl SequencerState {
    fn validate_session_start(
        &self,
        writer_id: WriterId,
        session_id: SessionId,
        reference_position: SnapshotPosition<PositionToken>,
    ) -> Result<LogEntry, Rejection> {
        if self.seen_sessions.contains(&session_id) {
            return Err(Rejection::SessionAlreadyUsed);
        }
        self.validate_reference(&reference_position)?;
        if self.is_below_minimum(&reference_position) {
            return Err(Rejection::StaleReferencePosition);
        }
        Ok(LogEntry::SessionStart {
            writer_id,
            session_id,
            reference_position,
        })
    }

    fn validate_submission(&self, submission: Submission) -> Result<Preflight, Rejection> {
        if let Some(accepted) = self.accepted.get(&submission.submission_id) {
            return if accepted.submission == submission {
                Ok(Preflight::Duplicate(accepted.clone()))
            } else {
                Err(Rejection::SubmissionIdentityConflict)
            };
        }
        let writer = self
            .writers
            .get(&submission.writer_id)
            .ok_or(Rejection::UnknownWriter)?;
        if writer.session_id != submission.session_id {
            return Err(Rejection::StaleSession);
        }
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
        self.validate_reference(&submission.reference_position)?;
        if self.reference_rank(&submission.reference_position)
            < self.reference_rank(&writer.reference_position)
            || self.is_below_minimum(&submission.reference_position)
        {
            return Err(Rejection::StaleReferencePosition);
        }
        Ok(Preflight::Append(LogEntry::Submission(submission)))
    }

    fn apply(
        &mut self,
        stream_position: PositionToken,
        entry: LogEntry,
    ) -> Result<Option<SequencedMessage>, Rejection> {
        let result = match entry {
            LogEntry::SessionStart {
                writer_id,
                session_id,
                reference_position,
            } => {
                let entry = self.validate_session_start(
                    writer_id.clone(),
                    session_id.clone(),
                    reference_position.clone(),
                )?;
                debug_assert!(matches!(entry, LogEntry::SessionStart { .. }));
                self.seen_sessions.insert(session_id.clone());
                self.writers.insert(
                    writer_id,
                    WriterState {
                        session_id,
                        local_sequence_number: 0,
                        reference_position,
                    },
                );
                None
            }
            LogEntry::Submission(submission) => {
                match self.validate_submission(submission.clone())? {
                    Preflight::Duplicate(message) => return Ok(Some(message)),
                    Preflight::Append(_) => {}
                }
                let Some(writer) = self.writers.get_mut(&submission.writer_id) else {
                    return Err(Rejection::UnknownWriter);
                };
                writer.local_sequence_number = submission.local_sequence_number;
                writer.reference_position = submission.reference_position.clone();
                self.sequence_number += 1;
                let message = SequencedMessage {
                    stream_position: stream_position.clone(),
                    sequence_number: self.sequence_number,
                    minimum_reference_position: self.minimum_reference_position(),
                    submission: submission.clone(),
                };
                self.accepted
                    .insert(submission.submission_id.clone(), message.clone());
                Some(message)
            }
        };
        self.observed_positions.push(stream_position);
        Ok(result)
    }

    fn minimum_reference_position(&self) -> SnapshotPosition<PositionToken> {
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

enum Preflight {
    Append(LogEntry),
    Duplicate(SequencedMessage),
}

/// The finite-read, append, and position-codec boundary consumed by the sequencer service.
pub trait SequencerStorage: Send + Sync {
    type Position: StreamPosition;
    type Error: ClassifiedError;

    fn append(
        &self,
        value: Bytes,
    ) -> impl Future<Output = Result<AppendReceipt<Self::Position>, Self::Error>> + Send;

    fn read_all(
        &self,
    ) -> impl Future<Output = Result<Vec<ReadRecord<Self::Position>>, Self::Error>> + Send;

    /// Encodes one stream-owned position as an opaque token.
    ///
    /// # Errors
    ///
    /// Returns a storage-defined error when the position cannot be encoded.
    fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error>;
}

/// Adapts an opaque kernel stream and its position codec to [`SequencerStorage`].
pub struct KernelStream<S>(pub S);

impl<S> SequencerStorage for KernelStream<S>
where
    S: AppendStream + PositionCodec,
{
    type Position = S::Position;
    type Error = S::Error;

    fn append(
        &self,
        value: Bytes,
    ) -> impl Future<Output = Result<AppendReceipt<Self::Position>, Self::Error>> + Send {
        self.0.append(value)
    }

    async fn read_all(&self) -> Result<Vec<ReadRecord<Self::Position>>, Self::Error> {
        let mut reader = self.0.read(None).await?;
        let mut records = Vec::new();
        while let Some(record) =
            std::future::poll_fn(|context| reader.as_mut().poll_next(context)).await
        {
            records.push(record?);
        }
        Ok(records)
    }

    fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error> {
        self.0.encode_position(position)
    }
}

/// A monotonically issued token for one authoritative sequencer lease.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FenceToken(u64);

struct FencedState<S> {
    stream: S,
    epoch: u64,
}

/// A shared service-level gate that keeps fence validation atomic with append.
pub struct FencedStream<S> {
    state: Arc<RwLock<FencedState<S>>>,
}

impl<S> Clone for FencedStream<S> {
    fn clone(&self) -> Self {
        Self {
            state: Arc::clone(&self.state),
        }
    }
}

impl<S> FencedStream<S>
where
    S: SequencerStorage,
{
    /// Wraps an opaque stream in the service-owned fencing gate.
    #[must_use]
    pub fn new(stream: S) -> Self {
        Self {
            state: Arc::new(RwLock::new(FencedState { stream, epoch: 0 })),
        }
    }

    /// Issues a new lease and invalidates all earlier tokens.
    #[must_use]
    pub fn issue_fence(&self) -> FenceToken {
        let mut state = self
            .state
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.epoch += 1;
        FenceToken(state.epoch)
    }

    fn ensure_current(&self, fence: FenceToken) -> Result<(), FenceLost> {
        let state = self
            .state
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if state.epoch == fence.0 {
            Ok(())
        } else {
            Err(FenceLost)
        }
    }

    #[allow(clippy::await_holding_lock)]
    async fn append(
        &self,
        fence: FenceToken,
        value: Bytes,
    ) -> Result<AppendReceipt<S::Position>, FencedAppendError<S::Error>> {
        let state = self
            .state
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if state.epoch != fence.0 {
            return Err(FencedAppendError::FenceLost);
        }
        state
            .stream
            .append(value)
            .await
            .map_err(FencedAppendError::Storage)
    }

    #[allow(clippy::await_holding_lock)]
    async fn read_all(&self) -> Result<Vec<ReadRecord<S::Position>>, S::Error> {
        let state = self
            .state
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.stream.read_all().await
    }

    fn encode_position(&self, position: &S::Position) -> Result<PositionToken, S::Error> {
        let state = self
            .state
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.stream.encode_position(position).map(PositionToken)
    }
}

enum FencedAppendError<E> {
    FenceLost,
    Storage(E),
}

/// The current process no longer owns the authoritative sequencer lease.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FenceLost;

/// A service failure. Protocol rejections occur before append.
#[derive(Debug)]
pub enum ServiceError<E> {
    Rejected(Rejection),
    FenceLost,
    Storage(E),
    StorageAmbiguous(SubmissionId),
    RecoveryRequired,
    CorruptLog(FrameError),
    InvalidCommittedEntry(Rejection),
}

/// A successful submission response.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SubmitOutcome {
    Accepted(SequencedMessage),
    Duplicate(SequencedMessage),
}

/// Resolution of an append whose storage response was ambiguous.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RecoveryOutcome {
    Committed(SequencedMessage),
    NotCommitted(Submission),
}

/// A single authoritative Fluid submission service recovered from canonical records.
pub struct AuthoritativeSequencer<S>
where
    S: SequencerStorage,
{
    storage: FencedStream<S>,
    fence: FenceToken,
    state: SequencerState,
    unresolved: Option<Submission>,
    recovery_required: bool,
}

impl<S> AuthoritativeSequencer<S>
where
    S: SequencerStorage,
{
    /// Replays the canonical log under the supplied current fence.
    ///
    /// # Errors
    ///
    /// Returns a fence, storage, framing, or committed-entry validation error when the service
    /// cannot establish authoritative state.
    pub async fn recover(
        storage: FencedStream<S>,
        fence: FenceToken,
    ) -> Result<Self, ServiceError<S::Error>> {
        storage
            .ensure_current(fence)
            .map_err(|_| ServiceError::FenceLost)?;
        let state = replay(&storage).await?;
        storage
            .ensure_current(fence)
            .map_err(|_| ServiceError::FenceLost)?;
        Ok(Self {
            storage,
            fence,
            state,
            unresolved: None,
            recovery_required: false,
        })
    }

    /// Starts or replaces a writer session after validating its reference.
    ///
    /// # Errors
    ///
    /// Returns a protocol rejection before append, a fence or storage error during append, or
    /// [`ServiceError::RecoveryRequired`] after an earlier ambiguous outcome.
    pub async fn connect(
        &mut self,
        writer_id: WriterId,
        session_id: SessionId,
        reference_position: SnapshotPosition<PositionToken>,
    ) -> Result<(), ServiceError<S::Error>> {
        if self.recovery_required {
            return Err(ServiceError::RecoveryRequired);
        }
        let entry = self
            .state
            .validate_session_start(writer_id, session_id, reference_position)
            .map_err(ServiceError::Rejected)?;
        let receipt = match self.append_entry(&entry).await {
            Err(ServiceError::Storage(error)) if error.kind() == ErrorKind::Ambiguous => {
                self.recovery_required = true;
                return Err(ServiceError::Storage(error));
            }
            result => result?,
        };
        let position = self
            .storage
            .encode_position(&receipt.position)
            .map_err(ServiceError::Storage)?;
        self.state
            .apply(position, entry)
            .map_err(ServiceError::InvalidCommittedEntry)?;
        Ok(())
    }

    /// Validates and appends one operation. Acceptance is returned only after append succeeds.
    ///
    /// # Errors
    ///
    /// Returns a protocol rejection before append, a fence or storage error during append,
    /// [`ServiceError::StorageAmbiguous`] when replay must determine the outcome, or
    /// [`ServiceError::RecoveryRequired`] while such recovery is outstanding.
    pub async fn submit(
        &mut self,
        submission: Submission,
    ) -> Result<SubmitOutcome, ServiceError<S::Error>> {
        if self.recovery_required {
            return Err(ServiceError::RecoveryRequired);
        }
        let entry = match self
            .state
            .validate_submission(submission.clone())
            .map_err(ServiceError::Rejected)?
        {
            Preflight::Duplicate(message) => return Ok(SubmitOutcome::Duplicate(message)),
            Preflight::Append(entry) => entry,
        };
        let receipt = match self.append_entry(&entry).await {
            Err(ServiceError::Storage(error)) if error.kind() == ErrorKind::Ambiguous => {
                self.unresolved = Some(submission.clone());
                self.recovery_required = true;
                return Err(ServiceError::StorageAmbiguous(submission.submission_id));
            }
            result => result?,
        };
        let position = self
            .storage
            .encode_position(&receipt.position)
            .map_err(ServiceError::Storage)?;
        let Some(message) = self
            .state
            .apply(position, entry)
            .map_err(ServiceError::InvalidCommittedEntry)?
        else {
            return Err(ServiceError::RecoveryRequired);
        };
        Ok(SubmitOutcome::Accepted(message))
    }

    /// Replays storage to resolve the sole outstanding ambiguous submission.
    ///
    /// # Errors
    ///
    /// Returns [`ServiceError::RecoveryRequired`] when no submission is pending, or a fence,
    /// storage, framing, or committed-entry validation error when replay cannot complete.
    pub async fn resolve_ambiguous(&mut self) -> Result<RecoveryOutcome, ServiceError<S::Error>> {
        let Some(submission) = self.unresolved.clone() else {
            return Err(ServiceError::RecoveryRequired);
        };
        self.storage
            .ensure_current(self.fence)
            .map_err(|_| ServiceError::FenceLost)?;
        let recovered = replay(&self.storage).await?;
        self.storage
            .ensure_current(self.fence)
            .map_err(|_| ServiceError::FenceLost)?;
        let outcome = recovered
            .accepted
            .get(&submission.submission_id)
            .cloned()
            .map_or_else(
                || RecoveryOutcome::NotCommitted(submission),
                RecoveryOutcome::Committed,
            );
        self.state = recovered;
        self.unresolved = None;
        self.recovery_required = false;
        Ok(outcome)
    }

    async fn append_entry(
        &self,
        entry: &LogEntry,
    ) -> Result<AppendReceipt<S::Position>, ServiceError<S::Error>> {
        let frame = encode_entry(entry).map_err(ServiceError::CorruptLog)?;
        self.storage
            .append(self.fence, frame)
            .await
            .map_err(|error| match error {
                FencedAppendError::FenceLost => ServiceError::FenceLost,
                FencedAppendError::Storage(error) => ServiceError::Storage(error),
            })
    }
}

async fn replay<S>(storage: &FencedStream<S>) -> Result<SequencerState, ServiceError<S::Error>>
where
    S: SequencerStorage,
{
    let records = storage.read_all().await.map_err(ServiceError::Storage)?;
    let mut state = SequencerState::default();
    for record in records {
        let entry = decode_entry(record.payload).map_err(ServiceError::CorruptLog)?;
        let position = storage
            .encode_position(&record.position)
            .map_err(ServiceError::Storage)?;
        state
            .apply(position, entry)
            .map_err(ServiceError::InvalidCommittedEntry)?;
    }
    Ok(state)
}

fn encode_entry(entry: &LogEntry) -> Result<Bytes, FrameError> {
    let mut frame = BytesMut::new();
    frame.extend_from_slice(FRAME_MAGIC);
    match entry {
        LogEntry::SessionStart {
            writer_id,
            session_id,
            reference_position,
        } => {
            frame.put_u8(SESSION_START_TAG);
            put_u16_bytes(&mut frame, &writer_id.0)?;
            put_u16_bytes(&mut frame, &session_id.0)?;
            put_reference(&mut frame, reference_position)?;
        }
        LogEntry::Submission(submission) => {
            frame.put_u8(SUBMISSION_TAG);
            put_u16_bytes(&mut frame, &submission.writer_id.0)?;
            put_u16_bytes(&mut frame, &submission.session_id.0)?;
            put_u16_bytes(&mut frame, &submission.submission_id.0)?;
            frame.put_u64(submission.local_sequence_number);
            put_reference(&mut frame, &submission.reference_position)?;
            let payload_length =
                u32::try_from(submission.payload.len()).map_err(|_| FrameError::FieldTooLarge)?;
            frame.put_u32(payload_length);
            frame.extend_from_slice(&submission.payload);
        }
    }
    Ok(frame.freeze())
}

fn decode_entry(mut frame: Bytes) -> Result<LogEntry, FrameError> {
    if frame.remaining() < FRAME_MAGIC.len() + 1 || &frame[..FRAME_MAGIC.len()] != FRAME_MAGIC {
        return Err(FrameError::InvalidMagic);
    }
    frame.advance(FRAME_MAGIC.len());
    let entry = match frame.get_u8() {
        SESSION_START_TAG => LogEntry::SessionStart {
            writer_id: WriterId::new(take_u16_bytes(&mut frame)?)
                .map_err(FrameError::InvalidValue)?,
            session_id: SessionId::new(take_u16_bytes(&mut frame)?)
                .map_err(FrameError::InvalidValue)?,
            reference_position: take_reference(&mut frame)?,
        },
        SUBMISSION_TAG => {
            let writer_id =
                WriterId::new(take_u16_bytes(&mut frame)?).map_err(FrameError::InvalidValue)?;
            let session_id =
                SessionId::new(take_u16_bytes(&mut frame)?).map_err(FrameError::InvalidValue)?;
            let submission_id =
                SubmissionId::new(take_u16_bytes(&mut frame)?).map_err(FrameError::InvalidValue)?;
            if frame.remaining() < 8 {
                return Err(FrameError::Truncated);
            }
            let local_sequence_number = frame.get_u64();
            let reference_position = take_reference(&mut frame)?;
            if frame.remaining() < 4 {
                return Err(FrameError::Truncated);
            }
            let payload_length =
                usize::try_from(frame.get_u32()).map_err(|_| FrameError::FieldTooLarge)?;
            if frame.remaining() < payload_length {
                return Err(FrameError::Truncated);
            }
            LogEntry::Submission(Submission {
                writer_id,
                session_id,
                submission_id,
                local_sequence_number,
                reference_position,
                payload: frame.split_to(payload_length),
            })
        }
        _ => return Err(FrameError::InvalidEntryTag),
    };
    if frame.has_remaining() {
        return Err(FrameError::TrailingBytes);
    }
    Ok(entry)
}

fn put_u16_bytes(frame: &mut BytesMut, value: &[u8]) -> Result<(), FrameError> {
    let length = u16::try_from(value.len()).map_err(|_| FrameError::FieldTooLarge)?;
    frame.put_u16(length);
    frame.extend_from_slice(value);
    Ok(())
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

fn put_reference(
    frame: &mut BytesMut,
    reference: &SnapshotPosition<PositionToken>,
) -> Result<(), FrameError> {
    match reference {
        SnapshotPosition::Initial => frame.put_u8(0),
        SnapshotPosition::At(position) => {
            frame.put_u8(1);
            put_u16_bytes(frame, &position.0)?;
        }
    }
    Ok(())
}

fn take_reference(frame: &mut Bytes) -> Result<SnapshotPosition<PositionToken>, FrameError> {
    if !frame.has_remaining() {
        return Err(FrameError::Truncated);
    }
    match frame.get_u8() {
        0 => Ok(SnapshotPosition::Initial),
        1 => Ok(SnapshotPosition::At(
            PositionToken::new(take_u16_bytes(frame)?).map_err(FrameError::InvalidValue)?,
        )),
        _ => Err(FrameError::InvalidReferenceTag),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        error::Error,
        fmt,
        future::Future,
        sync::{Arc, Mutex},
        task::{Context, Poll, Waker},
    };

    use snapshotted_stream_core::Durability;

    use super::*;

    fn writer(value: &'static [u8]) -> WriterId {
        WriterId::new(Bytes::from_static(value)).unwrap()
    }

    fn session(value: &'static [u8]) -> SessionId {
        SessionId::new(Bytes::from_static(value)).unwrap()
    }

    fn submission(
        writer_id: &WriterId,
        session_id: &SessionId,
        submission_id: &'static [u8],
        local_sequence_number: u64,
        reference_position: SnapshotPosition<PositionToken>,
    ) -> Submission {
        Submission {
            writer_id: writer_id.clone(),
            session_id: session_id.clone(),
            submission_id: SubmissionId::new(Bytes::from_static(submission_id)).unwrap(),
            local_sequence_number,
            reference_position,
            payload: Bytes::from_static(b"payload"),
        }
    }

    fn accepted(outcome: SubmitOutcome) -> SequencedMessage {
        match outcome {
            SubmitOutcome::Accepted(message) | SubmitOutcome::Duplicate(message) => message,
        }
    }

    fn block_on<F: Future>(future: F) -> F::Output {
        let waker = Waker::noop();
        let mut context = Context::from_waker(waker);
        let mut future = Box::pin(future);
        loop {
            match future.as_mut().poll(&mut context) {
                Poll::Ready(output) => return output,
                Poll::Pending => std::thread::yield_now(),
            }
        }
    }

    macro_rules! async_test {
        ($name:ident, $body:block) => {
            #[test]
            fn $name() {
                block_on(async $body);
            }
        };
    }

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct TestPosition(u64);

    #[derive(Clone, Copy, Debug)]
    enum NextAppend {
        Success,
        AmbiguousCommitted,
        AmbiguousNotCommitted,
    }

    #[derive(Debug)]
    enum TestError {
        Ambiguous,
        InvalidPosition,
    }

    impl fmt::Display for TestError {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            match self {
                Self::Ambiguous => formatter.write_str("append result is ambiguous"),
                Self::InvalidPosition => formatter.write_str("invalid position"),
            }
        }
    }

    impl Error for TestError {}

    impl ClassifiedError for TestError {
        fn kind(&self) -> ErrorKind {
            match self {
                Self::Ambiguous => ErrorKind::Ambiguous,
                Self::InvalidPosition => ErrorKind::InvalidPosition,
            }
        }
    }

    #[derive(Debug, Default)]
    struct TestState {
        records: Vec<Bytes>,
        next_append: Option<NextAppend>,
    }

    #[derive(Clone, Debug, Default)]
    struct TestStream {
        state: Arc<Mutex<TestState>>,
    }

    impl TestStream {
        fn len(&self) -> usize {
            self.state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .records
                .len()
        }

        fn fail_next(&self, outcome: NextAppend) {
            self.state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .next_append = Some(outcome);
        }
    }

    impl SequencerStorage for TestStream {
        type Position = TestPosition;
        type Error = TestError;

        fn append(
            &self,
            value: Bytes,
        ) -> impl Future<Output = Result<AppendReceipt<Self::Position>, Self::Error>> + Send
        {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let outcome = state.next_append.take().unwrap_or(NextAppend::Success);
            if matches!(
                outcome,
                NextAppend::Success | NextAppend::AmbiguousCommitted
            ) {
                state.records.push(value);
            }
            if matches!(
                outcome,
                NextAppend::AmbiguousCommitted | NextAppend::AmbiguousNotCommitted
            ) {
                return std::future::ready(Err(TestError::Ambiguous));
            }
            std::future::ready(Ok(AppendReceipt {
                position: TestPosition(state.records.len() as u64),
                durability: Durability::Memory,
            }))
        }

        fn read_all(
            &self,
        ) -> impl Future<Output = Result<Vec<ReadRecord<Self::Position>>, Self::Error>> + Send
        {
            let state = self
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            std::future::ready(Ok(state
                .records
                .iter()
                .enumerate()
                .map(|(index, payload)| ReadRecord {
                    position: TestPosition((index + 1) as u64),
                    payload: payload.clone(),
                })
                .collect()))
        }

        fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error> {
            if position.0 == 0 {
                return Err(TestError::InvalidPosition);
            }
            Ok(Bytes::copy_from_slice(&position.0.to_be_bytes()))
        }
    }

    async fn setup() -> (
        TestStream,
        FencedStream<TestStream>,
        AuthoritativeSequencer<TestStream>,
        WriterId,
        SessionId,
    ) {
        let stream = TestStream::default();
        let storage = FencedStream::new(stream.clone());
        let fence = storage.issue_fence();
        let mut sequencer = AuthoritativeSequencer::recover(storage.clone(), fence)
            .await
            .unwrap();
        let writer_id = writer(b"alice");
        let session_id = session(b"session-1");
        sequencer
            .connect(
                writer_id.clone(),
                session_id.clone(),
                SnapshotPosition::Initial,
            )
            .await
            .unwrap();
        (stream, storage, sequencer, writer_id, session_id)
    }

    async_test!(invalid_submissions_are_rejected_before_storage, {
        let (stream, _, mut sequencer, writer_id, session_id) = setup().await;
        let valid = submission(
            &writer_id,
            &session_id,
            b"one",
            1,
            SnapshotPosition::Initial,
        );
        sequencer.submit(valid.clone()).await.unwrap();
        let stored = stream.len();

        let duplicate_order = Submission {
            submission_id: SubmissionId::new(Bytes::from_static(b"duplicate-order")).unwrap(),
            ..valid.clone()
        };
        assert!(matches!(
            sequencer.submit(duplicate_order).await,
            Err(ServiceError::Rejected(
                Rejection::DuplicateLocalSequence { .. }
            ))
        ));
        let gap = submission(
            &writer_id,
            &session_id,
            b"gap",
            3,
            SnapshotPosition::Initial,
        );
        assert!(matches!(
            sequencer.submit(gap).await,
            Err(ServiceError::Rejected(Rejection::LocalSequenceGap { .. }))
        ));
        assert_eq!(stream.len(), stored);
    });

    async_test!(stale_client_reconnects_and_regenerates_submission, {
        let (stream, _, mut sequencer, alice, alice_session) = setup().await;
        let bob = writer(b"bob");
        let bob_session = session(b"bob-session");
        sequencer
            .connect(bob.clone(), bob_session.clone(), SnapshotPosition::Initial)
            .await
            .unwrap();
        let first = accepted(
            sequencer
                .submit(submission(
                    &alice,
                    &alice_session,
                    b"alice-1",
                    1,
                    SnapshotPosition::Initial,
                ))
                .await
                .unwrap(),
        );
        let reference = SnapshotPosition::At(first.stream_position.clone());
        sequencer
            .submit(submission(
                &bob,
                &bob_session,
                b"bob-1",
                1,
                reference.clone(),
            ))
            .await
            .unwrap();
        let latest = accepted(
            sequencer
                .submit(submission(&alice, &alice_session, b"alice-2", 2, reference))
                .await
                .unwrap(),
        );
        let stored = stream.len();
        assert!(matches!(
            sequencer
                .submit(submission(
                    &alice,
                    &alice_session,
                    b"stale",
                    3,
                    SnapshotPosition::Initial,
                ))
                .await,
            Err(ServiceError::Rejected(Rejection::StaleReferencePosition))
        ));
        assert_eq!(stream.len(), stored);

        let new_session = session(b"session-2");
        let current = SnapshotPosition::At(latest.stream_position);
        sequencer
            .connect(alice.clone(), new_session.clone(), current.clone())
            .await
            .unwrap();
        assert!(matches!(
            sequencer
                .submit(submission(
                    &alice,
                    &alice_session,
                    b"old-session",
                    3,
                    current.clone(),
                ))
                .await,
            Err(ServiceError::Rejected(Rejection::StaleSession))
        ));
        let regenerated = submission(&alice, &new_session, b"regenerated", 1, current);
        assert!(matches!(
            sequencer.submit(regenerated).await.unwrap(),
            SubmitOutcome::Accepted(_)
        ));
    });

    async_test!(fencing_loss_rejects_old_owner_and_failover_replays, {
        let (stream, storage, mut old, writer_id, session_id) = setup().await;
        old.submit(submission(
            &writer_id,
            &session_id,
            b"one",
            1,
            SnapshotPosition::Initial,
        ))
        .await
        .unwrap();
        let new_fence = storage.issue_fence();
        let stored = stream.len();
        assert!(matches!(
            old.submit(submission(
                &writer_id,
                &session_id,
                b"stale-owner",
                2,
                SnapshotPosition::Initial,
            ))
            .await,
            Err(ServiceError::FenceLost)
        ));
        assert_eq!(stream.len(), stored);

        let mut replacement = AuthoritativeSequencer::recover(storage, new_fence)
            .await
            .unwrap();
        let message = accepted(
            replacement
                .submit(submission(
                    &writer_id,
                    &session_id,
                    b"successor",
                    2,
                    SnapshotPosition::Initial,
                ))
                .await
                .unwrap(),
        );
        assert_eq!(message.sequence_number, 2);
    });

    async_test!(ambiguous_committed_append_is_recovered_and_deduplicated, {
        let (stream, _, mut sequencer, writer_id, session_id) = setup().await;
        let pending = submission(
            &writer_id,
            &session_id,
            b"ambiguous",
            1,
            SnapshotPosition::Initial,
        );
        stream.fail_next(NextAppend::AmbiguousCommitted);
        assert!(matches!(
            sequencer.submit(pending.clone()).await,
            Err(ServiceError::StorageAmbiguous(_))
        ));
        let stored = stream.len();
        let RecoveryOutcome::Committed(message) = sequencer.resolve_ambiguous().await.unwrap()
        else {
            panic!("committed append was not discovered");
        };
        assert_eq!(message.sequence_number, 1);
        assert!(matches!(
            sequencer.submit(pending).await.unwrap(),
            SubmitOutcome::Duplicate(_)
        ));
        assert_eq!(stream.len(), stored);
    });

    async_test!(ambiguous_not_committed_append_can_retry_same_identity, {
        let (stream, _, mut sequencer, writer_id, session_id) = setup().await;
        let pending = submission(
            &writer_id,
            &session_id,
            b"ambiguous",
            1,
            SnapshotPosition::Initial,
        );
        stream.fail_next(NextAppend::AmbiguousNotCommitted);
        assert!(matches!(
            sequencer.submit(pending.clone()).await,
            Err(ServiceError::StorageAmbiguous(_))
        ));
        let stored = stream.len();
        assert_eq!(
            sequencer.resolve_ambiguous().await.unwrap(),
            RecoveryOutcome::NotCommitted(pending.clone())
        );
        assert!(matches!(
            sequencer.submit(pending).await.unwrap(),
            SubmitOutcome::Accepted(_)
        ));
        assert_eq!(stream.len(), stored + 1);
    });

    async_test!(
        reused_submission_identity_with_different_content_is_rejected,
        {
            let (stream, _, mut sequencer, writer_id, session_id) = setup().await;
            let original = submission(
                &writer_id,
                &session_id,
                b"same-id",
                1,
                SnapshotPosition::Initial,
            );
            sequencer.submit(original.clone()).await.unwrap();
            let stored = stream.len();
            let conflict = Submission {
                payload: Bytes::from_static(b"different"),
                ..original
            };
            assert!(matches!(
                sequencer.submit(conflict).await,
                Err(ServiceError::Rejected(
                    Rejection::SubmissionIdentityConflict
                ))
            ));
            assert_eq!(stream.len(), stored);
        }
    );
}
