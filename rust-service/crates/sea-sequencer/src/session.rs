//! Final multi-user local session implementation over [`SeaStorage`].

use std::{
    collections::{BTreeMap, BTreeSet},
    error::Error,
    fmt,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use async_trait::async_trait;
use bytes::{Buf as _, BufMut as _, Bytes, BytesMut};
use futures_util::{StreamExt as _, TryStreamExt as _, stream};
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, ClassifiedError, Durability, ErrorKind, Event,
    EventPosition, SnapshotId,
    archive::{
        AuthorId, CommittedEvent, EventReceipt, EventSubmission, LoadEvent, OperationId,
        PublishedSnapshot, SeaSession, SeaStorage, SessionCommittedEvent, SessionId, SessionStream,
        SnapshotPublication,
    },
};
use tokio::sync::{Mutex, broadcast, watch};

const ENVELOPE_MAGIC: &[u8; 5] = b"SEAQ1";
const SESSION_OPEN: u8 = 0;
const SUBMISSION: u8 = 1;
const SESSION_CLOSE: u8 = 2;

/// Failure from local multi-user sequencing or its trusted backend.
#[derive(Debug)]
pub enum SessionError<E> {
    /// The trusted backend failed.
    Storage(E),
    /// Caller input conflicts with current authoritative session state.
    Rejected(&'static str),
    /// A committed private sequencer envelope is malformed or inconsistent.
    Corrupt(&'static str),
    /// This local session has been closed.
    Closed,
    /// A live subscriber fell behind the bounded in-process queue.
    Lagged,
}

impl<E: fmt::Display> fmt::Display for SessionError<E> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Storage(error) => write!(formatter, "storage failed: {error}"),
            Self::Rejected(message) => write!(formatter, "session rejected operation: {message}"),
            Self::Corrupt(message) => write!(formatter, "sequencer log is corrupt: {message}"),
            Self::Closed => formatter.write_str("session is closed"),
            Self::Lagged => formatter.write_str("session subscriber fell behind"),
        }
    }
}

impl<E: Error + 'static> Error for SessionError<E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Storage(error) => Some(error),
            Self::Rejected(_) | Self::Corrupt(_) | Self::Closed | Self::Lagged => None,
        }
    }
}

impl<E: ClassifiedError> ClassifiedError for SessionError<E> {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Storage(error) => error.kind(),
            Self::Rejected(_) | Self::Closed => ErrorKind::Rejected,
            Self::Corrupt(_) => ErrorKind::Corrupt,
            Self::Lagged => ErrorKind::Unavailable,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct AuthorState {
    session_id: SessionId,
    reference: Option<EventPosition>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct AcceptedSubmission {
    author_id: AuthorId,
    session_id: SessionId,
    submission: EventSubmission,
    receipt: EventReceipt,
    committed: SessionCommittedEvent,
}

#[derive(Debug, Default)]
struct SequencerState {
    authors: BTreeMap<AuthorId, AuthorState>,
    seen_sessions: BTreeSet<SessionId>,
    accepted: BTreeMap<OperationId, AcceptedSubmission>,
    event_positions: BTreeSet<EventPosition>,
    latest_event: Option<EventPosition>,
}

impl SequencerState {
    fn minimum_reference(&self) -> Option<EventPosition> {
        if self.authors.is_empty() {
            return self.latest_event;
        }
        self.authors
            .values()
            .map(|author| author.reference)
            .min()
            .flatten()
    }

    fn validate_reference(&self, reference: Option<EventPosition>) -> Result<(), &'static str> {
        if reference.is_some_and(|position| !self.event_positions.contains(&position)) {
            return Err("reference does not identify an application event");
        }
        if let Some(minimum) = self.minimum_reference()
            && reference.is_some_and(|position| position < minimum)
        {
            return Err("reference precedes the active minimum");
        }
        Ok(())
    }

    fn minimum_reference_after(
        &self,
        author_id: &AuthorId,
        reference: Option<EventPosition>,
    ) -> Option<EventPosition> {
        if self.authors.is_empty() {
            return self.latest_event;
        }
        self.authors
            .iter()
            .map(|(candidate, author)| {
                if candidate == author_id {
                    reference
                } else {
                    author.reference
                }
            })
            .min()
            .flatten()
    }
}

/// Shared authoritative sequencer over one archive.
pub struct LocalSequencer<S: SeaStorage> {
    storage: Arc<S>,
    state: Mutex<SequencerState>,
    events: broadcast::Sender<SessionCommittedEvent>,
    snapshots: watch::Sender<Option<PublishedSnapshot>>,
}

impl<S> LocalSequencer<S>
where
    S: SeaStorage + 'static,
{
    /// Replays one archive and creates its local sequencing authority.
    ///
    /// # Errors
    ///
    /// Returns a storage or committed-envelope validation failure.
    pub async fn recover(storage: Arc<S>) -> Result<Arc<Self>, SessionError<S::Error>> {
        let state = replay(storage.as_ref()).await?;
        let latest_snapshot = storage
            .latest_snapshot()
            .await
            .map_err(SessionError::Storage)?;
        let (events, _) = broadcast::channel(256);
        let (snapshots, _) = watch::channel(latest_snapshot);
        Ok(Arc::new(Self {
            storage,
            state: Mutex::new(state),
            events,
            snapshots,
        }))
    }

    /// Opens a fresh logical session, replacing the author's previous active session.
    ///
    /// # Errors
    ///
    /// Returns an error for a reused session identity, unavailable reference, or storage failure.
    pub async fn open_session(
        self: &Arc<Self>,
        author_id: AuthorId,
        session_id: SessionId,
        reference: Option<EventPosition>,
    ) -> Result<LocalSession<S>, SessionError<S::Error>> {
        let mut state = self.state.lock().await;
        if state.seen_sessions.contains(&session_id) {
            return Err(SessionError::Rejected("session identity was already used"));
        }
        state
            .validate_reference(reference)
            .map_err(SessionError::Rejected)?;
        let envelope = encode_open(&author_id, &session_id, reference)?;
        self.storage
            .append(Event {
                payload: envelope,
                blob_tree: None,
            })
            .await
            .map_err(SessionError::Storage)?;
        state.seen_sessions.insert(session_id.clone());
        state.authors.insert(
            author_id.clone(),
            AuthorState {
                session_id: session_id.clone(),
                reference,
            },
        );
        Ok(LocalSession {
            sequencer: Arc::clone(self),
            author_id,
            session_id,
            closed: AtomicBool::new(false),
        })
    }
}

/// One individual-user session backed by a shared local sequencer.
pub struct LocalSession<S: SeaStorage> {
    sequencer: Arc<LocalSequencer<S>>,
    author_id: AuthorId,
    session_id: SessionId,
    closed: AtomicBool,
}

impl<S: SeaStorage> LocalSession<S> {
    fn ensure_open(&self) -> Result<(), SessionError<S::Error>> {
        if self.closed.load(Ordering::Acquire) {
            Err(SessionError::Closed)
        } else {
            Ok(())
        }
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S> SeaSession for LocalSession<S>
where
    S: SeaStorage + 'static,
{
    type Error = SessionError<S::Error>;

    async fn load(
        &self,
        required: Option<EventPosition>,
    ) -> Result<SessionStream<LoadEvent, Self::Error>, Self::Error> {
        self.ensure_open()?;
        let live = self.sequencer.events.subscribe();
        let load = self
            .sequencer
            .storage
            .load(required)
            .await
            .map_err(SessionError::Storage)?;
        let captured_head = load.head;
        let mut initial = Vec::new();
        if let Some(snapshot) = load.snapshot {
            initial.push(Ok(LoadEvent::Snapshot(snapshot)));
        }
        let records = load
            .events
            .try_collect::<Vec<_>>()
            .await
            .map_err(SessionError::Storage)?;
        for record in records {
            if let Some(committed) = decode_committed(&record)? {
                initial.push(Ok(LoadEvent::Event(committed)));
            }
        }
        initial.push(Ok(LoadEvent::CaughtUp(captured_head)));
        let live_stream =
            stream::unfold((live, captured_head), |(mut receiver, head)| async move {
                loop {
                    match receiver.recv().await {
                        Ok(event)
                            if head.is_none_or(|position| event.committed.position > position) =>
                        {
                            return Some((Ok(LoadEvent::Event(event)), (receiver, head)));
                        }
                        Ok(_) => {}
                        Err(broadcast::error::RecvError::Lagged(_)) => {
                            return Some((Err(SessionError::Lagged), (receiver, head)));
                        }
                        Err(broadcast::error::RecvError::Closed) => return None,
                    }
                }
            });
        Ok(Box::pin(stream::iter(initial).chain(live_stream)))
    }

    async fn read(
        &self,
        after: Option<EventPosition>,
        through: Option<EventPosition>,
    ) -> Result<SessionStream<SessionCommittedEvent, Self::Error>, Self::Error> {
        self.ensure_open()?;
        let records = self
            .sequencer
            .storage
            .read(after, through)
            .await
            .map_err(SessionError::Storage)?;
        Ok(Box::pin(records.filter_map(|record| async move {
            match record {
                Ok(record) => match decode_committed(&record) {
                    Ok(Some(committed)) => Some(Ok(committed)),
                    Ok(None) => None,
                    Err(error) => Some(Err(error)),
                },
                Err(error) => Some(Err(SessionError::Storage(error))),
            }
        })))
    }

    async fn submit(&self, submission: EventSubmission) -> Result<EventReceipt, Self::Error> {
        self.ensure_open()?;
        let mut state = self.sequencer.state.lock().await;
        if let Some(accepted) = state.accepted.get(&submission.operation_id) {
            return if accepted.author_id == self.author_id
                && accepted.session_id == self.session_id
                && accepted.submission == submission
            {
                Ok(accepted.receipt.clone())
            } else {
                Err(SessionError::Rejected(
                    "operation identity is already bound to different input",
                ))
            };
        }
        let author = state
            .authors
            .get(&self.author_id)
            .ok_or(SessionError::Rejected("author is not active"))?;
        if author.session_id != self.session_id {
            return Err(SessionError::Rejected("session was replaced"));
        }
        state
            .validate_reference(submission.reference)
            .map_err(SessionError::Rejected)?;
        let minimum_reference =
            state.minimum_reference_after(&self.author_id, submission.reference);
        let envelope = encode_submission(
            &self.author_id,
            &self.session_id,
            &submission.operation_id,
            submission.reference,
            minimum_reference,
            &submission.event.payload,
        )?;
        let receipt = self
            .sequencer
            .storage
            .append(Event {
                payload: envelope,
                blob_tree: submission.event.blob_tree,
            })
            .await
            .map_err(SessionError::Storage)?;
        state
            .authors
            .get_mut(&self.author_id)
            .expect("validated author")
            .reference = submission.reference;
        state.event_positions.insert(receipt.position);
        state.latest_event = Some(receipt.position);
        let committed = SessionCommittedEvent {
            committed: CommittedEvent {
                position: receipt.position,
                event: submission.event.clone(),
            },
            author_id: self.author_id.clone(),
            session_id: self.session_id.clone(),
            operation_id: submission.operation_id.clone(),
            reference: submission.reference,
            minimum_reference,
        };
        state.accepted.insert(
            submission.operation_id.clone(),
            AcceptedSubmission {
                author_id: self.author_id.clone(),
                session_id: self.session_id.clone(),
                submission,
                receipt: receipt.clone(),
                committed: committed.clone(),
            },
        );
        drop(state);
        let _ = self.sequencer.events.send(committed);
        Ok(receipt)
    }

    async fn resolve_submission(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<EventReceipt>, Self::Error> {
        self.ensure_open()?;
        Ok(self
            .sequencer
            .state
            .lock()
            .await
            .accepted
            .get(operation_id)
            .map(|accepted| accepted.receipt.clone()))
    }

    async fn put_blob(&self, payload: Bytes) -> Result<BlobId, Self::Error> {
        self.ensure_open()?;
        self.sequencer
            .storage
            .put_blob(payload)
            .await
            .map_err(SessionError::Storage)
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        self.ensure_open()?;
        self.sequencer
            .storage
            .get_blob(id)
            .await
            .map_err(SessionError::Storage)
    }

    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<BlobDirectoryId, Self::Error> {
        self.ensure_open()?;
        self.sequencer
            .storage
            .put_directory(directory)
            .await
            .map_err(SessionError::Storage)
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.ensure_open()?;
        self.sequencer
            .storage
            .get_directory(id)
            .await
            .map_err(SessionError::Storage)
    }

    async fn snapshot(&self, id: &SnapshotId) -> Result<Option<PublishedSnapshot>, Self::Error> {
        self.ensure_open()?;
        self.sequencer
            .storage
            .snapshot(id)
            .await
            .map_err(SessionError::Storage)
    }

    async fn latest_snapshot(&self) -> Result<Option<PublishedSnapshot>, Self::Error> {
        self.ensure_open()?;
        self.sequencer
            .storage
            .latest_snapshot()
            .await
            .map_err(SessionError::Storage)
    }

    async fn publish_snapshot(
        &self,
        publication: SnapshotPublication,
    ) -> Result<PublishedSnapshot, Self::Error> {
        self.ensure_open()?;
        let published = self
            .sequencer
            .storage
            .publish_snapshot(publication)
            .await
            .map_err(SessionError::Storage)?;
        self.sequencer
            .snapshots
            .send_replace(Some(published.clone()));
        Ok(published)
    }

    async fn resolve_snapshot_publication(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<PublishedSnapshot>, Self::Error> {
        self.ensure_open()?;
        self.sequencer
            .storage
            .resolve_snapshot_publication(operation_id)
            .await
            .map_err(SessionError::Storage)
    }

    async fn subscribe_snapshots(
        &self,
    ) -> Result<SessionStream<PublishedSnapshot, Self::Error>, Self::Error> {
        self.ensure_open()?;
        let receiver = self.sequencer.snapshots.subscribe();
        Ok(Box::pin(stream::unfold(
            (receiver, true),
            |(mut receiver, initial)| async move {
                if initial {
                    let snapshot = receiver.borrow_and_update().clone();
                    if let Some(snapshot) = snapshot {
                        return Some((Ok(snapshot), (receiver, false)));
                    }
                }
                match receiver.changed().await {
                    Ok(()) => {
                        let snapshot = receiver.borrow_and_update().clone();
                        snapshot.map(|snapshot| (Ok(snapshot), (receiver, false)))
                    }
                    Err(_) => None,
                }
            },
        )))
    }

    async fn close(&self) -> Result<(), Self::Error> {
        if self.closed.swap(true, Ordering::AcqRel) {
            return Ok(());
        }
        let mut state = self.sequencer.state.lock().await;
        if state
            .authors
            .get(&self.author_id)
            .is_some_and(|author| author.session_id == self.session_id)
        {
            let envelope = encode_close(&self.author_id, &self.session_id)?;
            self.sequencer
                .storage
                .append(Event {
                    payload: envelope,
                    blob_tree: None,
                })
                .await
                .map_err(SessionError::Storage)?;
            state.authors.remove(&self.author_id);
        }
        Ok(())
    }
}

async fn replay<S>(storage: &S) -> Result<SequencerState, SessionError<S::Error>>
where
    S: SeaStorage,
{
    let records = storage
        .read(None, None)
        .await
        .map_err(SessionError::Storage)?
        .try_collect::<Vec<_>>()
        .await
        .map_err(SessionError::Storage)?;
    let mut state = SequencerState::default();
    for record in records {
        apply_record(&mut state, &record, storage.durability())?;
    }
    Ok(state)
}

enum Envelope {
    Open {
        author_id: AuthorId,
        session_id: SessionId,
        reference: Option<EventPosition>,
    },
    Submission {
        author_id: AuthorId,
        session_id: SessionId,
        operation_id: OperationId,
        reference: Option<EventPosition>,
        minimum_reference: Option<EventPosition>,
        payload: Bytes,
    },
    Close {
        author_id: AuthorId,
        session_id: SessionId,
    },
}

fn apply_record<E>(
    state: &mut SequencerState,
    record: &CommittedEvent,
    durability: Durability,
) -> Result<(), SessionError<E>> {
    match decode_envelope(&record.event.payload)? {
        Envelope::Open {
            author_id,
            session_id,
            reference,
        } => {
            if !state.seen_sessions.insert(session_id.clone()) {
                return Err(SessionError::Corrupt("session identity was reused"));
            }
            state
                .validate_reference(reference)
                .map_err(SessionError::Corrupt)?;
            state.authors.insert(
                author_id,
                AuthorState {
                    session_id,
                    reference,
                },
            );
        }
        Envelope::Submission {
            author_id,
            session_id,
            operation_id,
            reference,
            minimum_reference,
            payload,
        } => {
            let author = state
                .authors
                .get(&author_id)
                .ok_or(SessionError::Corrupt("submission author is not active"))?;
            if author.session_id != session_id {
                return Err(SessionError::Corrupt("submission session is stale"));
            }
            state
                .validate_reference(reference)
                .map_err(SessionError::Corrupt)?;
            if state.minimum_reference_after(&author_id, reference) != minimum_reference {
                return Err(SessionError::Corrupt(
                    "submission minimum reference is inconsistent",
                ));
            }
            if state.accepted.contains_key(&operation_id) {
                return Err(SessionError::Corrupt("submission identity was reused"));
            }
            state
                .authors
                .get_mut(&author_id)
                .expect("validated author")
                .reference = reference;
            state.event_positions.insert(record.position);
            state.latest_event = Some(record.position);
            let submission = EventSubmission {
                operation_id: operation_id.clone(),
                reference,
                event: Event {
                    payload,
                    blob_tree: record.event.blob_tree,
                },
            };
            let committed = SessionCommittedEvent {
                committed: CommittedEvent {
                    position: record.position,
                    event: submission.event.clone(),
                },
                author_id: author_id.clone(),
                session_id: session_id.clone(),
                operation_id: operation_id.clone(),
                reference,
                minimum_reference,
            };
            state.accepted.insert(
                operation_id,
                AcceptedSubmission {
                    author_id,
                    session_id,
                    submission,
                    receipt: EventReceipt {
                        position: record.position,
                        durability,
                    },
                    committed,
                },
            );
        }
        Envelope::Close {
            author_id,
            session_id,
        } => {
            if state
                .authors
                .get(&author_id)
                .is_some_and(|author| author.session_id == session_id)
            {
                state.authors.remove(&author_id);
            }
        }
    }
    Ok(())
}

fn decode_committed<E>(
    record: &CommittedEvent,
) -> Result<Option<SessionCommittedEvent>, SessionError<E>> {
    let Envelope::Submission {
        author_id,
        session_id,
        operation_id,
        reference,
        minimum_reference,
        payload,
    } = decode_envelope(&record.event.payload)?
    else {
        return Ok(None);
    };
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

fn encode_open<E>(
    author_id: &AuthorId,
    session_id: &SessionId,
    reference: Option<EventPosition>,
) -> Result<Bytes, SessionError<E>> {
    encode_envelope(
        SESSION_OPEN,
        author_id,
        session_id,
        None,
        reference,
        None,
        &[],
    )
}

fn encode_submission<E>(
    author_id: &AuthorId,
    session_id: &SessionId,
    operation_id: &OperationId,
    reference: Option<EventPosition>,
    minimum_reference: Option<EventPosition>,
    payload: &[u8],
) -> Result<Bytes, SessionError<E>> {
    encode_envelope(
        SUBMISSION,
        author_id,
        session_id,
        Some(operation_id),
        reference,
        minimum_reference,
        payload,
    )
}

fn encode_close<E>(author_id: &AuthorId, session_id: &SessionId) -> Result<Bytes, SessionError<E>> {
    encode_envelope(SESSION_CLOSE, author_id, session_id, None, None, None, &[])
}

fn encode_envelope<E>(
    kind: u8,
    author_id: &AuthorId,
    session_id: &SessionId,
    operation_id: Option<&OperationId>,
    reference: Option<EventPosition>,
    minimum_reference: Option<EventPosition>,
    payload: &[u8],
) -> Result<Bytes, SessionError<E>> {
    let mut encoded = BytesMut::new();
    encoded.extend_from_slice(ENVELOPE_MAGIC);
    encoded.put_u8(kind);
    put_field(&mut encoded, author_id.as_bytes())?;
    put_field(&mut encoded, session_id.as_bytes())?;
    if let Some(operation_id) = operation_id {
        put_field(&mut encoded, operation_id.as_bytes())?;
    }
    put_position(&mut encoded, reference);
    if kind == SUBMISSION {
        put_position(&mut encoded, minimum_reference);
        let length = u32::try_from(payload.len())
            .map_err(|_| SessionError::Rejected("event payload is too large"))?;
        encoded.put_u32(length);
        encoded.extend_from_slice(payload);
    }
    Ok(encoded.freeze())
}

fn put_position(encoded: &mut BytesMut, position: Option<EventPosition>) {
    match position {
        Some(position) => {
            encoded.put_u8(1);
            encoded.extend_from_slice(&position.to_bytes());
        }
        None => encoded.put_u8(0),
    }
}

fn put_field<E>(encoded: &mut BytesMut, value: &[u8]) -> Result<(), SessionError<E>> {
    let length =
        u32::try_from(value.len()).map_err(|_| SessionError::Rejected("identity is too large"))?;
    encoded.put_u32(length);
    encoded.extend_from_slice(value);
    Ok(())
}

fn decode_envelope<E>(encoded: &[u8]) -> Result<Envelope, SessionError<E>> {
    if encoded.len() < ENVELOPE_MAGIC.len() + 1
        || &encoded[..ENVELOPE_MAGIC.len()] != ENVELOPE_MAGIC
    {
        return Err(SessionError::Corrupt("invalid envelope marker"));
    }
    let mut bytes = Bytes::copy_from_slice(&encoded[ENVELOPE_MAGIC.len()..]);
    let kind = bytes.get_u8();
    let author_id = AuthorId::new(take_field(&mut bytes)?)
        .map_err(|_| SessionError::Corrupt("empty author identity"))?;
    let session_id = SessionId::new(take_field(&mut bytes)?)
        .map_err(|_| SessionError::Corrupt("empty session identity"))?;
    let operation_id = if kind == SUBMISSION {
        Some(
            OperationId::new(take_field(&mut bytes)?)
                .map_err(|_| SessionError::Corrupt("empty operation identity"))?,
        )
    } else {
        None
    };
    let reference = take_position(&mut bytes)?;
    let minimum_reference = if kind == SUBMISSION {
        take_position(&mut bytes)?
    } else {
        None
    };
    let payload = if kind == SUBMISSION {
        if bytes.remaining() < 4 {
            return Err(SessionError::Corrupt("truncated payload length"));
        }
        let length = usize::try_from(bytes.get_u32())
            .map_err(|_| SessionError::Corrupt("payload length exceeds address space"))?;
        if bytes.remaining() != length {
            return Err(SessionError::Corrupt("invalid payload length"));
        }
        bytes.copy_to_bytes(length)
    } else {
        if bytes.has_remaining() {
            return Err(SessionError::Corrupt("control envelope has trailing bytes"));
        }
        Bytes::new()
    };
    match kind {
        SESSION_OPEN => Ok(Envelope::Open {
            author_id,
            session_id,
            reference,
        }),
        SUBMISSION => Ok(Envelope::Submission {
            author_id,
            session_id,
            operation_id: operation_id.expect("submission operation identity"),
            reference,
            minimum_reference,
            payload,
        }),
        SESSION_CLOSE => Ok(Envelope::Close {
            author_id,
            session_id,
        }),
        _ => Err(SessionError::Corrupt("unknown envelope kind")),
    }
}

fn take_position<E>(bytes: &mut Bytes) -> Result<Option<EventPosition>, SessionError<E>> {
    match take_byte(bytes)? {
        0 => Ok(None),
        1 => Ok(Some(EventPosition::from_bytes(take_array::<8, E>(bytes)?))),
        _ => Err(SessionError::Corrupt("invalid position tag")),
    }
}

fn take_field<E>(bytes: &mut Bytes) -> Result<Bytes, SessionError<E>> {
    if bytes.remaining() < 4 {
        return Err(SessionError::Corrupt("truncated identity length"));
    }
    let length = usize::try_from(bytes.get_u32())
        .map_err(|_| SessionError::Corrupt("identity length exceeds address space"))?;
    if bytes.remaining() < length {
        return Err(SessionError::Corrupt("truncated identity"));
    }
    Ok(bytes.copy_to_bytes(length))
}

fn take_byte<E>(bytes: &mut Bytes) -> Result<u8, SessionError<E>> {
    if bytes.has_remaining() {
        Ok(bytes.get_u8())
    } else {
        Err(SessionError::Corrupt("truncated envelope"))
    }
}

fn take_array<const N: usize, E>(bytes: &mut Bytes) -> Result<[u8; N], SessionError<E>> {
    if bytes.remaining() < N {
        return Err(SessionError::Corrupt("truncated envelope field"));
    }
    let mut value = [0; N];
    bytes.copy_to_slice(&mut value);
    Ok(value)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use bytes::Bytes;
    use futures_util::StreamExt as _;
    use sea_core::{
        Durability, Event,
        archive::{AuthorId, EventSubmission, LoadEvent, OperationId, SeaSession, SessionId},
    };
    use sea_memory::MemoryStream;

    use super::{LocalSequencer, SessionError};

    fn author(value: &'static [u8]) -> AuthorId {
        AuthorId::new(Bytes::from_static(value)).expect("author identity")
    }

    fn session(value: &'static [u8]) -> SessionId {
        SessionId::new(Bytes::from_static(value)).expect("session identity")
    }

    fn submission(
        value: &'static [u8],
        reference: Option<sea_core::EventPosition>,
    ) -> EventSubmission {
        EventSubmission {
            operation_id: OperationId::new(Bytes::from_static(value)).expect("operation identity"),
            reference,
            event: Event {
                payload: Bytes::from_static(value),
                blob_tree: None,
            },
        }
    }

    #[tokio::test]
    async fn local_sessions_retry_load_replace_and_recover() {
        let storage = Arc::new(MemoryStream::new());
        let sequencer = LocalSequencer::recover(Arc::clone(&storage)).await.unwrap();
        let first_author = author(b"author-one");
        let first_session_id = session(b"session-one");
        let first_session = sequencer
            .open_session(first_author.clone(), first_session_id, None)
            .await
            .unwrap();

        let first_submission = submission(b"operation-one", None);
        let first = first_session
            .submit(first_submission.clone())
            .await
            .unwrap();
        assert_eq!(first.durability, Durability::Memory);
        assert_eq!(
            first_session
                .submit(first_submission.clone())
                .await
                .unwrap(),
            first
        );
        let mut conflicting = first_submission;
        conflicting.event.payload = Bytes::from_static(b"different");
        assert!(matches!(
            first_session.submit(conflicting).await,
            Err(SessionError::Rejected(_))
        ));

        let mut load = first_session.load(None).await.unwrap();
        let loaded = load.next().await.unwrap().unwrap();
        let LoadEvent::Event(loaded) = loaded else {
            panic!("first load item should be the committed event");
        };
        assert_eq!(loaded.committed.position, first.position);
        assert_eq!(loaded.operation_id.as_bytes(), b"operation-one".as_slice());
        assert!(matches!(
            load.next().await.unwrap().unwrap(),
            LoadEvent::CaughtUp(Some(_))
        ));

        let second = first_session
            .submit(submission(b"operation-two", Some(first.position)))
            .await
            .unwrap();
        let LoadEvent::Event(live) = load.next().await.unwrap().unwrap() else {
            panic!("load should continue with live events");
        };
        assert_eq!(live.committed.position, second.position);

        let replacement = sequencer
            .open_session(first_author, session(b"session-two"), Some(second.position))
            .await
            .unwrap();
        assert!(matches!(
            first_session
                .submit(submission(b"stale-session", Some(second.position)))
                .await,
            Err(SessionError::Rejected("session was replaced"))
        ));
        replacement.close().await.unwrap();
        drop(replacement);
        drop(first_session);
        drop(sequencer);

        let recovered = LocalSequencer::recover(storage).await.unwrap();
        let resumed = recovered
            .open_session(
                author(b"author-three"),
                session(b"session-three"),
                Some(second.position),
            )
            .await
            .unwrap();
        assert_eq!(
            resumed
                .resolve_submission(
                    &OperationId::new(Bytes::from_static(b"operation-one")).unwrap()
                )
                .await
                .unwrap(),
            Some(first)
        );
    }
}
