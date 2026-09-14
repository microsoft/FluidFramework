//! A valid-only authoritative Fluid sequencer over opaque appends.
//!
//! Session starts and accepted submissions are the only canonical log entries. Validation occurs
//! while the current fence is held, before append. Exact submission retries are append-free;
//! conflicting identities, stale sessions or references, and local sequence gaps are rejected.
//! Ambiguous appends require replay before another append, including session-start retries.

use std::{
    collections::{BTreeMap, BTreeSet},
    error::Error,
    fmt,
    fs::{File, OpenOptions},
    future::Future,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{Arc, RwLock, RwLockReadGuard},
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

/// A document-local canonical event position with its protocol encoding.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PositionToken {
    ordinal: u64,
    encoded: Bytes,
}

impl PositionToken {
    fn from_ordinal(ordinal: u64) -> Self {
        debug_assert_ne!(ordinal, 0);
        Self {
            ordinal,
            encoded: Bytes::copy_from_slice(&ordinal.to_be_bytes()),
        }
    }

    /// Parses an eight-byte, one-based canonical event position.
    ///
    /// # Errors
    ///
    /// Returns a value error when `value` is empty, malformed, or zero.
    pub fn new(value: impl Into<Bytes>) -> Result<Self, ValueError> {
        let value = value.into();
        if value.is_empty() {
            return Err(ValueError::EmptyPosition);
        }
        let ordinal = u64::from_be_bytes(
            value
                .as_ref()
                .try_into()
                .map_err(|_| ValueError::InvalidPosition)?,
        );
        if ordinal == 0 {
            return Err(ValueError::InvalidPosition);
        }
        Ok(Self {
            ordinal,
            encoded: value,
        })
    }

    /// Returns the opaque serialized position bytes.
    #[must_use]
    pub fn as_bytes(&self) -> &Bytes {
        &self.encoded
    }

    /// Returns the one-based ordinal represented by this token.
    #[must_use]
    pub const fn ordinal(&self) -> u64 {
        self.ordinal
    }
}

/// Invalid strongly typed values.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ValueError {
    /// A writer identity was empty.
    EmptyWriterId,
    /// A session identity was empty.
    EmptySessionId,
    /// A submission identity was empty.
    EmptySubmissionId,
    /// A position token was empty.
    EmptyPosition,
    /// A position token was not an eight-byte nonzero ordinal.
    InvalidPosition,
}

/// A writer submission before final sequencing metadata is assigned.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Submission {
    /// Stable identity of the submitting writer.
    pub writer_id: WriterId,
    /// Current connection-scoped session identity.
    pub session_id: SessionId,
    /// Stable identity used for deduplication and resolution.
    pub submission_id: SubmissionId,
    /// Contiguous writer-local sequence number.
    pub local_sequence_number: u64,
    /// Canonical state on which the submission was based.
    pub reference_position: SnapshotPosition<PositionToken>,
    /// Opaque operation payload.
    pub payload: Bytes,
}

/// Failures while encoding or decoding a submission frame.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameError {
    /// A length-prefixed field exceeds its representation.
    FieldTooLarge,
    /// A canonical entry does not begin with the sequencer magic bytes.
    InvalidMagic,
    /// A canonical entry ends before a declared value.
    Truncated,
    /// A reference uses an unknown discriminant.
    InvalidReferenceTag,
    /// A strongly typed identity or position is invalid.
    InvalidValue(ValueError),
    /// A canonical entry uses an unknown entry kind.
    InvalidEntryTag,
    /// Bytes remain after decoding one canonical entry.
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
    /// Canonical position of the accepted submission entry.
    pub stream_position: PositionToken,
    /// Contiguous sequence number among accepted submissions.
    pub sequence_number: u64,
    /// Minimum reference position across active writers after acceptance.
    pub minimum_reference_position: SnapshotPosition<PositionToken>,
    /// Original accepted submission.
    pub submission: Submission,
}

/// One accepted Fluid operation projected from the private canonical log.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectedOperation {
    /// Canonical position of the accepted submission entry.
    pub stream_position: PositionToken,
    /// Contiguous sequence number among accepted submissions.
    pub sequence_number: u64,
    /// Minimum reference position across active writers after acceptance.
    pub minimum_reference_position: SnapshotPosition<PositionToken>,
    /// Stable writer identity.
    pub writer_id: WriterId,
    /// Connection-scoped session identity.
    pub session_id: SessionId,
    /// Stable submission identity.
    pub submission_id: SubmissionId,
    /// Contiguous writer-local sequence number.
    pub local_sequence_number: u64,
    /// Canonical state on which the operation was based.
    pub reference_position: SnapshotPosition<PositionToken>,
    /// Opaque operation payload.
    pub payload: Bytes,
}

impl From<SequencedMessage> for ProjectedOperation {
    fn from(message: SequencedMessage) -> Self {
        Self {
            stream_position: message.stream_position,
            sequence_number: message.sequence_number,
            minimum_reference_position: message.minimum_reference_position,
            writer_id: message.submission.writer_id,
            session_id: message.submission.session_id,
            submission_id: message.submission.submission_id,
            local_sequence_number: message.submission.local_sequence_number,
            reference_position: message.submission.reference_position,
            payload: message.submission.payload,
        }
    }
}

impl ProjectedOperation {
    fn encoded_size(&self) -> usize {
        self.stream_position.encoded.len()
            + self.writer_id.0.len()
            + self.session_id.0.len()
            + self.submission_id.0.len()
            + reference_size(&self.minimum_reference_position)
            + reference_size(&self.reference_position)
            + self.payload.len()
            + 8
            + 8
            + 7 * 4
            + 2
    }
}

fn reference_size(reference: &SnapshotPosition<PositionToken>) -> usize {
    match reference {
        SnapshotPosition::Initial => 1,
        SnapshotPosition::At(position) => 1 + 4 + position.encoded.len(),
    }
}

/// A bounded projected read and its opaque canonical resume cursor.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectedPage {
    /// Accepted operations encountered in the scanned canonical range.
    pub operations: Vec<ProjectedOperation>,
    /// Last canonical position scanned, including administrative entries.
    pub cursor: Option<PositionToken>,
    /// Whether canonical entries remain after the cursor.
    pub has_more: bool,
}

/// A protocol-level rejection produced before an invalid operation is appended.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Rejection {
    /// The proposed session identity has already appeared in the log.
    SessionAlreadyUsed,
    /// No session has been opened for the writer.
    UnknownWriter,
    /// The submission does not use the writer's current session.
    StaleSession,
    /// The local sequence does not advance beyond the last accepted value.
    DuplicateLocalSequence {
        /// Last accepted local sequence number.
        last_accepted: u64,
        /// Rejected local sequence number.
        received: u64,
    },
    /// The local sequence skips the next expected value.
    LocalSequenceGap {
        /// Required next local sequence number.
        expected: u64,
        /// Rejected local sequence number.
        received: u64,
    },
    /// The reference points beyond the observed canonical head.
    UnknownReferencePosition,
    /// The reference precedes the minimum reference position.
    StaleReferencePosition,
    /// The submission identity is already bound to different content or context.
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
    observed_head: Option<PositionToken>,
    canonical_submissions: Vec<Option<SubmissionId>>,
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
        if Self::reference_rank(&submission.reference_position)
            < Self::reference_rank(&writer.reference_position)
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
        self.canonical_submissions.push(
            result
                .as_ref()
                .map(|message| message.submission.submission_id.clone()),
        );
        self.observed_head = Some(stream_position);
        Ok(result)
    }

    fn minimum_reference_position(&self) -> SnapshotPosition<PositionToken> {
        self.writers
            .values()
            .min_by_key(|writer| Self::reference_rank(&writer.reference_position))
            .map_or_else(
                || {
                    self.observed_head
                        .clone()
                        .map_or(SnapshotPosition::Initial, SnapshotPosition::At)
                },
                |writer| writer.reference_position.clone(),
            )
    }

    fn validate_reference(
        &self,
        reference: &SnapshotPosition<PositionToken>,
    ) -> Result<(), Rejection> {
        if matches!(reference, SnapshotPosition::At(position) if self.observed_head.as_ref().is_none_or(|head| position.ordinal() > head.ordinal()))
        {
            return Err(Rejection::UnknownReferencePosition);
        }
        Ok(())
    }

    fn is_below_minimum(&self, reference: &SnapshotPosition<PositionToken>) -> bool {
        Self::reference_rank(reference) < Self::reference_rank(&self.minimum_reference_position())
    }

    fn reference_rank(reference: &SnapshotPosition<PositionToken>) -> u64 {
        match reference {
            SnapshotPosition::Initial => 0,
            SnapshotPosition::At(position) => position.ordinal(),
        }
    }
}

enum Preflight {
    Append(LogEntry),
    Duplicate(SequencedMessage),
}

/// The finite-read, append, and position-codec boundary consumed by the sequencer service.
pub trait SequencerStorage: Send + Sync {
    /// Stream-owned canonical position type.
    type Position: StreamPosition;
    /// Classified storage error type.
    type Error: ClassifiedError;

    /// Appends one encoded canonical entry.
    fn append(
        &self,
        value: Bytes,
    ) -> impl Future<Output = Result<AppendReceipt<Self::Position>, Self::Error>> + Send;

    /// Reads all canonical entries in order as a finite collection.
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

/// Failures while accessing a deployment fencing authority.
#[derive(Debug)]
pub enum FenceAuthorityError {
    /// The authority file could not be accessed or persisted.
    Io(std::io::Error),
    /// The persisted authority epoch is malformed.
    CorruptEpoch,
    /// The authority cannot issue another monotonically increasing epoch.
    EpochExhausted,
}

impl fmt::Display for FenceAuthorityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "fencing authority I/O failed: {error}"),
            Self::CorruptEpoch => formatter.write_str("fencing authority epoch is corrupt"),
            Self::EpochExhausted => formatter.write_str("fencing authority epoch is exhausted"),
        }
    }
}

impl Error for FenceAuthorityError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::CorruptEpoch | Self::EpochExhausted => None,
        }
    }
}

impl From<std::io::Error> for FenceAuthorityError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

#[derive(Clone)]
enum FenceAuthority {
    Process,
    Deployment(Arc<PathBuf>),
}

/// A service-level gate that keeps fence validation atomic with replay, validation, and append.
pub struct FencedStream<S> {
    stream: Arc<S>,
    process_epoch: Arc<RwLock<u64>>,
    authority: FenceAuthority,
}

impl<S> Clone for FencedStream<S> {
    fn clone(&self) -> Self {
        Self {
            stream: Arc::clone(&self.stream),
            process_epoch: Arc::clone(&self.process_epoch),
            authority: self.authority.clone(),
        }
    }
}

#[derive(Debug)]
enum FenceAcquireError {
    Lost,
    Authority(FenceAuthorityError),
}

enum FenceGuard<'a, S> {
    Process {
        stream: &'a S,
        _epoch: RwLockReadGuard<'a, u64>,
    },
    Deployment {
        stream: &'a S,
        _lock: File,
    },
}

impl<S> FenceGuard<'_, S>
where
    S: SequencerStorage,
{
    fn stream(&self) -> &S {
        match self {
            Self::Process { stream, .. } | Self::Deployment { stream, .. } => stream,
        }
    }

    async fn append(&self, value: Bytes) -> Result<AppendReceipt<S::Position>, S::Error> {
        self.stream().append(value).await
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
            stream: Arc::new(stream),
            process_epoch: Arc::new(RwLock::new(0)),
            authority: FenceAuthority::Process,
        }
    }

    /// Wraps a stream with a same-host file-lock and persisted-epoch authority.
    ///
    /// Independent processes must use the same authority path and storage resource.
    ///
    /// # Errors
    ///
    /// Returns an authority error when the epoch file cannot be opened or initialized.
    pub fn with_deployment_authority(
        stream: S,
        authority_path: impl AsRef<Path>,
    ) -> Result<Self, FenceAuthorityError> {
        let authority_path = authority_path.as_ref().to_path_buf();
        let mut file = open_locked_authority(&authority_path)?;
        if file.metadata()?.len() == 0 {
            write_epoch(&mut file, 0)?;
        } else {
            read_epoch(&mut file)?;
        }
        Ok(Self {
            stream: Arc::new(stream),
            process_epoch: Arc::new(RwLock::new(0)),
            authority: FenceAuthority::Deployment(Arc::new(authority_path)),
        })
    }

    /// Issues a new lease and invalidates all earlier tokens.
    ///
    /// # Panics
    ///
    /// Panics if a deployment authority is configured and its epoch cannot be advanced. Deployment
    /// callers should use [`Self::try_issue_fence`] to handle authority failures.
    #[must_use]
    pub fn issue_fence(&self) -> FenceToken {
        self.try_issue_fence()
            .expect("in-process fencing authority cannot fail")
    }

    /// Issues a new lease, reporting deployment authority failures.
    ///
    /// # Errors
    ///
    /// Returns an authority error when the epoch cannot be read or advanced.
    pub fn try_issue_fence(&self) -> Result<FenceToken, FenceAuthorityError> {
        match &self.authority {
            FenceAuthority::Process => {
                let mut epoch = self
                    .process_epoch
                    .write()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                *epoch = epoch
                    .checked_add(1)
                    .ok_or(FenceAuthorityError::EpochExhausted)?;
                Ok(FenceToken(*epoch))
            }
            FenceAuthority::Deployment(path) => {
                let mut file = open_locked_authority(path)?;
                let epoch = read_epoch(&mut file)?
                    .checked_add(1)
                    .ok_or(FenceAuthorityError::EpochExhausted)?;
                write_epoch(&mut file, epoch)?;
                Ok(FenceToken(epoch))
            }
        }
    }

    fn lock_current(&self, fence: FenceToken) -> Result<FenceGuard<'_, S>, FenceAcquireError> {
        match &self.authority {
            FenceAuthority::Process => {
                let epoch = self
                    .process_epoch
                    .read()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                if *epoch != fence.0 {
                    return Err(FenceAcquireError::Lost);
                }
                Ok(FenceGuard::Process {
                    stream: &self.stream,
                    _epoch: epoch,
                })
            }
            FenceAuthority::Deployment(path) => {
                let mut file = open_locked_authority(path).map_err(FenceAcquireError::Authority)?;
                let epoch = read_epoch(&mut file).map_err(FenceAcquireError::Authority)?;
                if epoch != fence.0 {
                    return Err(FenceAcquireError::Lost);
                }
                Ok(FenceGuard::Deployment {
                    stream: &self.stream,
                    _lock: file,
                })
            }
        }
    }
}

fn open_locked_authority(path: &Path) -> Result<File, FenceAuthorityError> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)?;
    file.lock()?;
    Ok(file)
}

fn read_epoch(file: &mut File) -> Result<u64, FenceAuthorityError> {
    file.seek(SeekFrom::Start(0))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    let bytes: [u8; 8] = bytes
        .try_into()
        .map_err(|_| FenceAuthorityError::CorruptEpoch)?;
    Ok(u64::from_be_bytes(bytes))
}

fn write_epoch(file: &mut File, epoch: u64) -> Result<(), FenceAuthorityError> {
    file.seek(SeekFrom::Start(0))?;
    file.write_all(&epoch.to_be_bytes())?;
    file.set_len(8)?;
    file.sync_data()?;
    Ok(())
}

/// The current process no longer owns the authoritative sequencer lease.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FenceLost;

/// A service failure. Protocol rejections occur before append.
#[derive(Debug)]
pub enum ServiceError<E> {
    /// Protocol validation rejected the operation before append.
    Rejected(Rejection),
    /// A supplied canonical position is invalid.
    InvalidPosition,
    /// A projected-read limit is zero or otherwise invalid.
    InvalidPageLimit,
    /// The service no longer owns its sequencer lease.
    FenceLost,
    /// The deployment fencing authority failed.
    Authority(FenceAuthorityError),
    /// Storage failed with a classified error.
    Storage(E),
    /// Storage may have committed the named submission.
    StorageAmbiguous(SubmissionId),
    /// An ambiguous operation must be resolved before another append.
    RecoveryRequired,
    /// A canonical entry could not be decoded.
    CorruptLog(FrameError),
    /// A committed entry violates sequencer invariants during replay.
    InvalidCommittedEntry(Rejection),
}

/// A successful submission response.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SubmitOutcome {
    /// The submission was newly appended and sequenced.
    Accepted(SequencedMessage),
    /// An identical committed submission was returned without appending.
    Duplicate(SequencedMessage),
}

/// Resolution of an append whose storage response was ambiguous.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RecoveryOutcome {
    /// Replay found the ambiguous submission committed.
    Committed(SequencedMessage),
    /// Replay proved the submission absent and returns it for caller disposition.
    NotCommitted(Submission),
}

/// Authoritative resolution for a stable submission identity.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ResolutionOutcome {
    /// The stable submission identity is committed.
    Committed(Box<SequencedMessage>),
    /// The stable submission identity is absent from the authoritative log.
    NotCommitted,
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
    unresolved_session_start: Option<LogEntry>,
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
        let guard = storage
            .lock_current(fence)
            .map_err(map_fence_acquire_error)?;
        let state = replay(&guard).await?;
        drop(guard);
        Ok(Self {
            storage,
            fence,
            state,
            unresolved: None,
            unresolved_session_start: None,
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
        let pending = LogEntry::SessionStart {
            writer_id: writer_id.clone(),
            session_id: session_id.clone(),
            reference_position: reference_position.clone(),
        };
        if self.recovery_required {
            if self.unresolved_session_start.as_ref() != Some(&pending) {
                return Err(ServiceError::RecoveryRequired);
            }
            let guard = self
                .storage
                .lock_current(self.fence)
                .map_err(map_fence_acquire_error)?;
            let recovered = replay(&guard).await?;
            drop(guard);
            let committed = recovered
                .writers
                .get(&writer_id)
                .is_some_and(|writer| writer.session_id == session_id);
            self.state = recovered;
            self.unresolved_session_start = None;
            self.recovery_required = false;
            if committed {
                return Ok(());
            }
        }
        let guard = self
            .storage
            .lock_current(self.fence)
            .map_err(map_fence_acquire_error)?;
        let entry = self
            .state
            .validate_session_start(writer_id, session_id, reference_position)
            .map_err(ServiceError::Rejected)?;
        let frame = encode_entry(&entry).map_err(ServiceError::CorruptLog)?;
        let receipt = match guard.append(frame).await.map_err(ServiceError::Storage) {
            Err(ServiceError::Storage(error)) if error.kind() == ErrorKind::Ambiguous => {
                self.unresolved_session_start = Some(entry);
                self.recovery_required = true;
                return Err(ServiceError::Storage(error));
            }
            result => result?,
        };
        let position = position_token(guard.stream(), &receipt.position)?;
        self.state
            .apply(position, entry)
            .map_err(ServiceError::InvalidCommittedEntry)?;
        drop(guard);
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
        let guard = self
            .storage
            .lock_current(self.fence)
            .map_err(map_fence_acquire_error)?;
        let entry = match self
            .state
            .validate_submission(submission.clone())
            .map_err(ServiceError::Rejected)?
        {
            Preflight::Duplicate(message) => return Ok(SubmitOutcome::Duplicate(message)),
            Preflight::Append(entry) => entry,
        };
        let frame = encode_entry(&entry).map_err(ServiceError::CorruptLog)?;
        let receipt = match guard.append(frame).await.map_err(ServiceError::Storage) {
            Err(ServiceError::Storage(error)) if error.kind() == ErrorKind::Ambiguous => {
                self.unresolved = Some(submission.clone());
                self.recovery_required = true;
                return Err(ServiceError::StorageAmbiguous(submission.submission_id));
            }
            result => result?,
        };
        let position = position_token(guard.stream(), &receipt.position)?;
        let Some(message) = self
            .state
            .apply(position, entry)
            .map_err(ServiceError::InvalidCommittedEntry)?
        else {
            return Err(ServiceError::RecoveryRequired);
        };
        drop(guard);
        Ok(SubmitOutcome::Accepted(message))
    }

    /// Reads accepted operations while advancing through a bounded number of canonical records.
    ///
    /// The returned cursor remains opaque and advances across administrative-only pages.
    ///
    /// # Errors
    ///
    /// Returns an invalid-position or invalid-limit error, or a fence, storage, framing, or
    /// committed-entry validation error when projection cannot complete authoritatively.
    pub fn read_projected(
        &self,
        after: Option<&PositionToken>,
        max_canonical_records: usize,
        max_encoded_bytes: usize,
    ) -> Result<ProjectedPage, ServiceError<S::Error>> {
        if max_canonical_records == 0 || max_encoded_bytes == 0 {
            return Err(ServiceError::InvalidPageLimit);
        }
        let guard = self
            .storage
            .lock_current(self.fence)
            .map_err(map_fence_acquire_error)?;
        let reference = after
            .cloned()
            .map_or(SnapshotPosition::Initial, SnapshotPosition::At);
        self.state
            .validate_reference(&reference)
            .map_err(|_| ServiceError::InvalidPosition)?;
        let start = after.map_or(Ok(0), |position| {
            usize::try_from(position.ordinal()).map_err(|_| ServiceError::InvalidPosition)
        })?;
        let record_count = self.state.canonical_submissions.len();
        let mut cursor = after.cloned();
        let mut encoded_bytes = 0_usize;
        let mut operations = Vec::new();
        let mut has_more = false;

        for (scanned, index) in (start..record_count).enumerate() {
            if scanned == max_canonical_records {
                has_more = true;
                break;
            }
            let operation = self.state.canonical_submissions[index]
                .as_ref()
                .and_then(|submission_id| self.state.accepted.get(submission_id))
                .cloned()
                .map(ProjectedOperation::from);
            if let Some(operation) = operation.as_ref() {
                let next_encoded_bytes = encoded_bytes.saturating_add(operation.encoded_size());
                if !operations.is_empty() && next_encoded_bytes > max_encoded_bytes {
                    has_more = true;
                    break;
                }
                encoded_bytes = next_encoded_bytes;
            }
            let ordinal = u64::try_from(index + 1).map_err(|_| ServiceError::InvalidPosition)?;
            let position = PositionToken::from_ordinal(ordinal);
            cursor = Some(position);
            if let Some(operation) = operation {
                operations.push(operation);
            }
            has_more = index + 1 < record_count;
        }

        drop(guard);
        Ok(ProjectedPage {
            operations,
            cursor,
            has_more,
        })
    }

    /// Resolves one stable identity without appending or retrying the submission.
    ///
    /// # Errors
    ///
    /// Returns a context rejection for the wrong writer or session, or a fence, storage, framing,
    /// or committed-entry validation error when replay cannot complete authoritatively.
    pub async fn resolve_submission(
        &mut self,
        writer_id: &WriterId,
        session_id: &SessionId,
        submission_id: &SubmissionId,
    ) -> Result<ResolutionOutcome, ServiceError<S::Error>> {
        let guard = self
            .storage
            .lock_current(self.fence)
            .map_err(map_fence_acquire_error)?;
        let recovered = replay(&guard).await?;
        let writer = recovered
            .writers
            .get(writer_id)
            .ok_or(ServiceError::Rejected(Rejection::UnknownWriter))?;
        if &writer.session_id != session_id {
            return Err(ServiceError::Rejected(Rejection::StaleSession));
        }
        let outcome = match recovered.accepted.get(submission_id) {
            Some(message)
                if &message.submission.writer_id == writer_id
                    && &message.submission.session_id == session_id =>
            {
                ResolutionOutcome::Committed(Box::new(message.clone()))
            }
            Some(_) => {
                return Err(ServiceError::Rejected(
                    Rejection::SubmissionIdentityConflict,
                ));
            }
            None => ResolutionOutcome::NotCommitted,
        };
        drop(guard);
        self.state = recovered;
        if self.unresolved.as_ref().is_some_and(|submission| {
            &submission.writer_id == writer_id
                && &submission.session_id == session_id
                && &submission.submission_id == submission_id
        }) {
            self.unresolved = None;
            self.recovery_required = false;
        }
        Ok(outcome)
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
        match self
            .resolve_submission(
                &submission.writer_id,
                &submission.session_id,
                &submission.submission_id,
            )
            .await?
        {
            ResolutionOutcome::Committed(message) => Ok(RecoveryOutcome::Committed(*message)),
            ResolutionOutcome::NotCommitted => Ok(RecoveryOutcome::NotCommitted(submission)),
        }
    }
}

fn map_fence_acquire_error<E>(error: FenceAcquireError) -> ServiceError<E> {
    match error {
        FenceAcquireError::Lost => ServiceError::FenceLost,
        FenceAcquireError::Authority(error) => ServiceError::Authority(error),
    }
}

fn position_token<S>(
    storage: &S,
    position: &S::Position,
) -> Result<PositionToken, ServiceError<S::Error>>
where
    S: SequencerStorage,
{
    let encoded = storage
        .encode_position(position)
        .map_err(ServiceError::Storage)?;
    PositionToken::new(encoded).map_err(|_| ServiceError::InvalidPosition)
}

async fn replay<S>(guard: &FenceGuard<'_, S>) -> Result<SequencerState, ServiceError<S::Error>>
where
    S: SequencerStorage,
{
    let storage = guard.stream();
    let records = storage.read_all().await.map_err(ServiceError::Storage)?;
    let mut state = SequencerState::default();
    for record in records {
        let entry = decode_entry(record.payload).map_err(ServiceError::CorruptLog)?;
        let position = position_token(storage, &record.position)?;
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
            put_u16_bytes(frame, &position.encoded)?;
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
        env,
        error::Error,
        fmt,
        fs::{self, OpenOptions},
        future::Future,
        path::{Path, PathBuf},
        process::{Child, Command},
        sync::{Arc, Mutex},
        task::{Context, Poll, Waker},
        thread,
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
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

    async_test!(identity_and_reference_failures_are_append_free, {
        let (stream, _, mut sequencer, writer_id, session_id) = setup().await;
        let stored = stream.len();
        assert!(matches!(
            sequencer
                .connect(
                    writer(b"bob"),
                    session_id.clone(),
                    SnapshotPosition::Initial,
                )
                .await,
            Err(ServiceError::Rejected(Rejection::SessionAlreadyUsed))
        ));
        let unknown = PositionToken::new(Bytes::copy_from_slice(&100_u64.to_be_bytes())).unwrap();
        assert!(matches!(
            sequencer
                .submit(submission(
                    &writer_id,
                    &session_id,
                    b"unknown-reference",
                    1,
                    SnapshotPosition::At(unknown),
                ))
                .await,
            Err(ServiceError::Rejected(Rejection::UnknownReferencePosition))
        ));
        assert_eq!(stream.len(), stored);

        let original = submission(
            &writer_id,
            &session_id,
            b"stable-id",
            1,
            SnapshotPosition::Initial,
        );
        let accepted = sequencer.submit(original.clone()).await.unwrap();
        let stored = stream.len();
        assert!(matches!(accepted, SubmitOutcome::Accepted(_)));
        assert!(matches!(
            sequencer.submit(original.clone()).await.unwrap(),
            SubmitOutcome::Duplicate(_)
        ));
        assert!(matches!(
            sequencer
                .submit(Submission {
                    payload: Bytes::from_static(b"conflict"),
                    ..original
                })
                .await,
            Err(ServiceError::Rejected(
                Rejection::SubmissionIdentityConflict
            ))
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
        ambiguous_session_start_can_retry_without_duplicate_append,
        {
            for outcome in [
                NextAppend::AmbiguousCommitted,
                NextAppend::AmbiguousNotCommitted,
            ] {
                let stream = TestStream::default();
                let storage = FencedStream::new(stream.clone());
                let fence = storage.issue_fence();
                let mut sequencer = AuthoritativeSequencer::recover(storage, fence)
                    .await
                    .unwrap();
                let writer_id = writer(b"alice");
                let session_id = session(b"session-1");
                stream.fail_next(outcome);

                assert!(matches!(
                    sequencer
                        .connect(
                            writer_id.clone(),
                            session_id.clone(),
                            SnapshotPosition::Initial,
                        )
                        .await,
                    Err(ServiceError::Storage(TestError::Ambiguous))
                ));
                let stored = stream.len();
                sequencer
                    .connect(writer_id, session_id, SnapshotPosition::Initial)
                    .await
                    .unwrap();
                assert_eq!(
                    stream.len(),
                    if matches!(outcome, NextAppend::AmbiguousCommitted) {
                        stored
                    } else {
                        stored + 1
                    }
                );
            }
        }
    );

    async_test!(projected_pages_advance_across_administrative_records, {
        let (stream, _, mut sequencer, writer_id, session_id) = setup().await;
        let accepted = accepted(
            sequencer
                .submit(submission(
                    &writer_id,
                    &session_id,
                    b"projected",
                    1,
                    SnapshotPosition::Initial,
                ))
                .await
                .unwrap(),
        );
        let first_page = sequencer.read_projected(None, 1, 1024).unwrap();
        assert!(first_page.operations.is_empty());
        assert!(first_page.has_more);
        let first_cursor = first_page.cursor.unwrap();

        let second_page = sequencer
            .read_projected(Some(&first_cursor), 1, 1024)
            .unwrap();
        assert_eq!(second_page.operations.len(), 1);
        assert_eq!(second_page.operations[0].sequence_number, 1);
        assert_eq!(
            second_page.operations[0].payload,
            Bytes::from_static(b"payload")
        );
        assert_eq!(second_page.cursor, Some(accepted.stream_position.clone()));
        assert!(!second_page.has_more);
        let end_page = sequencer
            .read_projected(second_page.cursor.as_ref(), 1, 1024)
            .unwrap();
        assert!(end_page.operations.is_empty());
        assert_eq!(end_page.cursor, second_page.cursor);
        assert!(!end_page.has_more);
        assert_eq!(stream.len(), 2);
    });

    async_test!(projected_read_rejects_cursor_beyond_head, {
        let (_, _, sequencer, _, _) = setup().await;
        let beyond_head =
            PositionToken::new(Bytes::copy_from_slice(&1000_u64.to_be_bytes())).unwrap();
        assert!(matches!(
            sequencer.read_projected(Some(&beyond_head), 1, 1024),
            Err(ServiceError::InvalidPosition)
        ));
    });

    async_test!(projected_pages_are_byte_bounded_without_skipping, {
        let (_, _, mut sequencer, writer_id, session_id) = setup().await;
        for (submission_id, local_sequence_number) in [(b"one".as_slice(), 1), (b"two", 2)] {
            sequencer
                .submit(submission(
                    &writer_id,
                    &session_id,
                    submission_id,
                    local_sequence_number,
                    SnapshotPosition::Initial,
                ))
                .await
                .unwrap();
        }
        let administrative = sequencer.read_projected(None, 1, usize::MAX).unwrap();
        let full = sequencer
            .read_projected(administrative.cursor.as_ref(), 2, usize::MAX)
            .unwrap();
        let first_size = full.operations[0].encoded_size();
        let bounded = sequencer
            .read_projected(administrative.cursor.as_ref(), 2, first_size)
            .unwrap();
        assert_eq!(bounded.operations.len(), 1);
        assert!(bounded.has_more);
        assert_eq!(
            bounded.cursor,
            Some(full.operations[0].stream_position.clone())
        );
        let resumed = sequencer
            .read_projected(bounded.cursor.as_ref(), 2, first_size)
            .unwrap();
        assert_eq!(resumed.operations.len(), 1);
        assert_eq!(resumed.operations[0], full.operations[1]);
        assert!(!resumed.has_more);
    });

    async_test!(
        explicit_resolution_is_idempotent_authorized_and_append_free,
        {
            let (stream, storage, mut sequencer, writer_id, session_id) = setup().await;
            let other_writer = writer(b"bob");
            let other_session = session(b"bob-session");
            sequencer
                .connect(
                    other_writer.clone(),
                    other_session.clone(),
                    SnapshotPosition::Initial,
                )
                .await
                .unwrap();
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
            for _ in 0..2 {
                assert!(matches!(
                    sequencer
                        .resolve_submission(&writer_id, &session_id, &pending.submission_id)
                        .await
                        .unwrap(),
                    ResolutionOutcome::Committed(_)
                ));
                assert_eq!(stream.len(), stored);
            }
            assert!(matches!(
                sequencer
                    .resolve_submission(&other_writer, &other_session, &pending.submission_id)
                    .await,
                Err(ServiceError::Rejected(
                    Rejection::SubmissionIdentityConflict
                ))
            ));

            let replacement_fence = storage.issue_fence();
            let mut restarted = AuthoritativeSequencer::recover(storage, replacement_fence)
                .await
                .unwrap();
            assert!(matches!(
                restarted
                    .resolve_submission(&writer_id, &session_id, &pending.submission_id)
                    .await
                    .unwrap(),
                ResolutionOutcome::Committed(_)
            ));
            assert_eq!(stream.len(), stored);
        }
    );

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

    #[derive(Clone, Debug)]
    struct ProcessFileStream {
        log_path: PathBuf,
        ambiguity_path: PathBuf,
    }

    impl ProcessFileStream {
        fn new(directory: &Path) -> Self {
            Self {
                log_path: directory.join("sequencer.log"),
                ambiguity_path: directory.join("next-append"),
            }
        }

        fn records(&self) -> Result<Vec<Bytes>, ProcessFileError> {
            let bytes = match fs::read(&self.log_path) {
                Ok(bytes) => bytes,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
                Err(error) => return Err(ProcessFileError::Io(error)),
            };
            let mut offset = 0;
            let mut records = Vec::new();
            while offset < bytes.len() {
                let length_bytes: [u8; 4] = bytes
                    .get(offset..offset + 4)
                    .ok_or(ProcessFileError::CorruptLog)?
                    .try_into()
                    .map_err(|_| ProcessFileError::CorruptLog)?;
                offset += 4;
                let length = usize::try_from(u32::from_be_bytes(length_bytes))
                    .map_err(|_| ProcessFileError::CorruptLog)?;
                let payload = bytes
                    .get(offset..offset + length)
                    .ok_or(ProcessFileError::CorruptLog)?;
                records.push(Bytes::copy_from_slice(payload));
                offset += length;
            }
            Ok(records)
        }

        fn pause_after_fence_validation() -> Result<(), ProcessFileError> {
            let Ok(marker) = env::var("FLUID_FENCE_VALIDATED_MARKER") else {
                return Ok(());
            };
            fs::write(marker, b"validated")?;
            let release = PathBuf::from(
                env::var("FLUID_FENCE_RELEASE_MARKER")
                    .map_err(|_| ProcessFileError::MissingEnvironment)?,
            );
            wait_for_path(&release, Duration::from_secs(10));
            Ok(())
        }
    }

    #[derive(Debug)]
    enum ProcessFileError {
        Io(std::io::Error),
        Ambiguous,
        CorruptLog,
        MissingEnvironment,
    }

    impl fmt::Display for ProcessFileError {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            match self {
                Self::Io(error) => write!(formatter, "process file stream I/O failed: {error}"),
                Self::Ambiguous => formatter.write_str("append result is ambiguous"),
                Self::CorruptLog => formatter.write_str("process file stream is corrupt"),
                Self::MissingEnvironment => {
                    formatter.write_str("process test environment is incomplete")
                }
            }
        }
    }

    impl Error for ProcessFileError {
        fn source(&self) -> Option<&(dyn Error + 'static)> {
            match self {
                Self::Io(error) => Some(error),
                Self::Ambiguous | Self::CorruptLog | Self::MissingEnvironment => None,
            }
        }
    }

    impl From<std::io::Error> for ProcessFileError {
        fn from(error: std::io::Error) -> Self {
            Self::Io(error)
        }
    }

    impl ClassifiedError for ProcessFileError {
        fn kind(&self) -> ErrorKind {
            match self {
                Self::Ambiguous => ErrorKind::Ambiguous,
                Self::CorruptLog => ErrorKind::Corrupt,
                Self::Io(_) | Self::MissingEnvironment => ErrorKind::Unavailable,
            }
        }
    }

    impl SequencerStorage for ProcessFileStream {
        type Position = TestPosition;
        type Error = ProcessFileError;

        fn append(
            &self,
            value: Bytes,
        ) -> impl Future<Output = Result<AppendReceipt<Self::Position>, Self::Error>> + Send
        {
            let result = (|| {
                Self::pause_after_fence_validation()?;
                let ambiguity = match fs::read_to_string(&self.ambiguity_path) {
                    Ok(value) => {
                        fs::remove_file(&self.ambiguity_path)?;
                        Some(value)
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                    Err(error) => return Err(ProcessFileError::Io(error)),
                };
                if ambiguity.as_deref() != Some("not-committed") {
                    let ordinal = self.records()?.len() + 1;
                    let length =
                        u32::try_from(value.len()).map_err(|_| ProcessFileError::CorruptLog)?;
                    let mut file = OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(&self.log_path)?;
                    file.write_all(&length.to_be_bytes())?;
                    file.write_all(&value)?;
                    file.sync_data()?;
                    if ambiguity.as_deref() == Some("committed") {
                        return Err(ProcessFileError::Ambiguous);
                    }
                    return Ok(AppendReceipt {
                        position: TestPosition(
                            u64::try_from(ordinal).map_err(|_| ProcessFileError::CorruptLog)?,
                        ),
                        durability: Durability::Durable,
                    });
                }
                Err(ProcessFileError::Ambiguous)
            })();
            std::future::ready(result)
        }

        fn read_all(
            &self,
        ) -> impl Future<Output = Result<Vec<ReadRecord<Self::Position>>, Self::Error>> + Send
        {
            let result = self.records().and_then(|records| {
                records
                    .into_iter()
                    .enumerate()
                    .map(|(index, payload)| {
                        Ok(ReadRecord {
                            position: TestPosition(
                                u64::try_from(index + 1)
                                    .map_err(|_| ProcessFileError::CorruptLog)?,
                            ),
                            payload,
                        })
                    })
                    .collect()
            });
            std::future::ready(result)
        }

        fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error> {
            if position.0 == 0 {
                return Err(ProcessFileError::CorruptLog);
            }
            Ok(Bytes::copy_from_slice(&position.0.to_be_bytes()))
        }
    }

    fn deployment_storage(
        directory: &Path,
    ) -> Result<FencedStream<ProcessFileStream>, FenceAuthorityError> {
        FencedStream::with_deployment_authority(
            ProcessFileStream::new(directory),
            directory.join("authority.epoch"),
        )
    }

    fn wait_for_path(path: &Path, timeout: Duration) {
        let deadline = Instant::now() + timeout;
        while !path.exists() {
            assert!(Instant::now() < deadline, "timed out waiting for {path:?}");
            thread::sleep(Duration::from_millis(5));
        }
    }

    fn wait_for_child(child: &mut Child, timeout: Duration) {
        let deadline = Instant::now() + timeout;
        loop {
            match child.try_wait().unwrap() {
                Some(status) => {
                    assert!(status.success(), "child process failed with {status}");
                    return;
                }
                None if Instant::now() < deadline => thread::sleep(Duration::from_millis(5)),
                None => {
                    child.kill().unwrap();
                    child.wait().unwrap();
                    panic!("child process exceeded {timeout:?}");
                }
            }
        }
    }

    fn spawn_worker(directory: &Path, role: &str, epoch: u64) -> Child {
        Command::new(env::current_exe().unwrap())
            .args([
                "--exact",
                "tests::deployment_fencing_process_worker",
                "--ignored",
                "--nocapture",
            ])
            .env("FLUID_FENCE_TEST_DIRECTORY", directory)
            .env("FLUID_FENCE_TEST_ROLE", role)
            .env("FLUID_FENCE_TEST_EPOCH", epoch.to_string())
            .spawn()
            .unwrap()
    }

    fn process_test_directory() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = env::temp_dir().join(format!(
            "fluid-deployment-fencing-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir(&directory).unwrap();
        directory
    }

    #[test]
    #[ignore = "launched by deployment_file_authority_fences_independent_processes"]
    fn deployment_fencing_process_worker() {
        let Ok(role) = env::var("FLUID_FENCE_TEST_ROLE") else {
            return;
        };
        let directory = PathBuf::from(env::var("FLUID_FENCE_TEST_DIRECTORY").unwrap());
        let epoch = env::var("FLUID_FENCE_TEST_EPOCH")
            .unwrap()
            .parse::<u64>()
            .unwrap();
        if role == "replacement" {
            fs::write(directory.join("rotation-attempted"), b"attempted").unwrap();
        }
        let storage = deployment_storage(&directory).unwrap();
        match role.as_str() {
            "old-owner" => block_on(async {
                let mut sequencer = AuthoritativeSequencer::recover(storage, FenceToken(epoch))
                    .await
                    .unwrap();
                assert!(matches!(
                    sequencer
                        .submit(submission(
                            &writer(b"alice"),
                            &session(b"session-1"),
                            b"old-owner-1",
                            1,
                            SnapshotPosition::Initial,
                        ))
                        .await
                        .unwrap(),
                    SubmitOutcome::Accepted(_)
                ));
            }),
            "replacement" => block_on(async {
                let next_fence = storage.try_issue_fence().unwrap();
                fs::write(directory.join("rotation-complete"), b"complete").unwrap();
                let mut sequencer = AuthoritativeSequencer::recover(storage, next_fence)
                    .await
                    .unwrap();
                assert!(matches!(
                    sequencer
                        .submit(submission(
                            &writer(b"alice"),
                            &session(b"session-1"),
                            b"replacement-2",
                            2,
                            SnapshotPosition::Initial,
                        ))
                        .await
                        .unwrap(),
                    SubmitOutcome::Accepted(_)
                ));
            }),
            "stale-owner" => block_on(async {
                assert!(matches!(
                    AuthoritativeSequencer::recover(storage, FenceToken(epoch)).await,
                    Err(ServiceError::FenceLost)
                ));
            }),
            "crash-holder" => {
                let _guard = storage.lock_current(FenceToken(epoch)).unwrap();
                fs::write(directory.join("crash-lock-held"), b"held").unwrap();
                loop {
                    thread::park_timeout(Duration::from_secs(10));
                }
            }
            other => panic!("unknown process test role {other}"),
        }
    }

    async_test!(deployment_file_authority_fences_independent_processes, {
        let directory = process_test_directory();
        let authority_path = directory.join("authority.epoch");
        let storage = deployment_storage(&directory).unwrap();
        let initial_fence = storage.try_issue_fence().unwrap();
        assert_eq!(initial_fence, FenceToken(1));
        let mut initial = AuthoritativeSequencer::recover(storage.clone(), initial_fence)
            .await
            .unwrap();
        initial
            .connect(
                writer(b"alice"),
                session(b"session-1"),
                SnapshotPosition::Initial,
            )
            .await
            .unwrap();
        drop(initial);

        let validated = directory.join("old-validated");
        let release = directory.join("release-old");
        let mut old_owner = Command::new(env::current_exe().unwrap())
            .args([
                "--exact",
                "tests::deployment_fencing_process_worker",
                "--ignored",
                "--nocapture",
            ])
            .env("FLUID_FENCE_TEST_DIRECTORY", &directory)
            .env("FLUID_FENCE_TEST_ROLE", "old-owner")
            .env("FLUID_FENCE_TEST_EPOCH", "1")
            .env("FLUID_FENCE_VALIDATED_MARKER", &validated)
            .env("FLUID_FENCE_RELEASE_MARKER", &release)
            .spawn()
            .unwrap();
        wait_for_path(&validated, Duration::from_secs(10));

        let probe = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&authority_path)
            .unwrap();
        assert!(matches!(
            probe.try_lock(),
            Err(std::fs::TryLockError::WouldBlock)
        ));

        let mut replacement = spawn_worker(&directory, "replacement", 1);
        wait_for_path(
            &directory.join("rotation-attempted"),
            Duration::from_secs(10),
        );
        assert!(!directory.join("rotation-complete").exists());
        let handoff_started = Instant::now();
        fs::write(&release, b"release").unwrap();
        wait_for_child(&mut old_owner, Duration::from_secs(10));
        wait_for_child(&mut replacement, Duration::from_secs(10));
        let handoff_elapsed = handoff_started.elapsed();
        assert!(directory.join("rotation-complete").exists());

        let mut stale_owner = spawn_worker(&directory, "stale-owner", 1);
        wait_for_child(&mut stale_owner, Duration::from_secs(10));

        let mut crash_holder = spawn_worker(&directory, "crash-holder", 2);
        wait_for_path(&directory.join("crash-lock-held"), Duration::from_secs(10));
        let crash_probe = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&authority_path)
            .unwrap();
        assert!(matches!(
            crash_probe.try_lock(),
            Err(std::fs::TryLockError::WouldBlock)
        ));
        crash_holder.kill().unwrap();
        crash_holder.wait().unwrap();
        let process_loss_started = Instant::now();
        let replacement_fence = storage.try_issue_fence().unwrap();
        let process_loss_elapsed = process_loss_started.elapsed();
        assert_eq!(replacement_fence, FenceToken(3));

        let mut recovered = AuthoritativeSequencer::recover(storage, replacement_fence)
            .await
            .unwrap();
        let replacement_submission = submission(
            &writer(b"alice"),
            &session(b"session-1"),
            b"replacement-2",
            2,
            SnapshotPosition::Initial,
        );
        assert!(matches!(
            recovered
                .submit(replacement_submission.clone())
                .await
                .unwrap(),
            SubmitOutcome::Duplicate(_)
        ));

        fs::write(directory.join("next-append"), b"committed").unwrap();
        let committed = submission(
            &writer(b"alice"),
            &session(b"session-1"),
            b"ambiguous-committed-3",
            3,
            SnapshotPosition::Initial,
        );
        assert!(matches!(
            recovered.submit(committed.clone()).await,
            Err(ServiceError::StorageAmbiguous(_))
        ));
        assert!(matches!(
            recovered.resolve_ambiguous().await.unwrap(),
            RecoveryOutcome::Committed(_)
        ));
        assert!(matches!(
            recovered.submit(committed).await.unwrap(),
            SubmitOutcome::Duplicate(_)
        ));

        fs::write(directory.join("next-append"), b"not-committed").unwrap();
        let not_committed = submission(
            &writer(b"alice"),
            &session(b"session-1"),
            b"ambiguous-not-committed-4",
            4,
            SnapshotPosition::Initial,
        );
        assert!(matches!(
            recovered.submit(not_committed.clone()).await,
            Err(ServiceError::StorageAmbiguous(_))
        ));
        assert_eq!(
            recovered.resolve_ambiguous().await.unwrap(),
            RecoveryOutcome::NotCommitted(not_committed.clone())
        );
        assert!(matches!(
            recovered.submit(not_committed).await.unwrap(),
            SubmitOutcome::Accepted(_)
        ));

        let workload_started = Instant::now();
        for local_sequence_number in 5..=20 {
            let submission_id = format!("workload-{local_sequence_number}");
            let operation = Submission {
                writer_id: writer(b"alice"),
                session_id: session(b"session-1"),
                submission_id: SubmissionId::new(Bytes::from(submission_id)).unwrap(),
                local_sequence_number,
                reference_position: SnapshotPosition::Initial,
                payload: Bytes::from_static(b"payload"),
            };
            assert!(matches!(
                recovered.submit(operation).await.unwrap(),
                SubmitOutcome::Accepted(_)
            ));
        }
        let workload_elapsed = workload_started.elapsed();
        println!(
            "deployment fencing observations: handoff={handoff_elapsed:?}, process_loss_reacquire={process_loss_elapsed:?}, 16_guarded_appends={workload_elapsed:?}"
        );
        fs::remove_dir_all(directory).unwrap();
    });
}
