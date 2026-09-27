//! Opt-in document policy at session admission boundaries.
//!
//! Policies share observations through one caller-supplied `Arc`; they do not own session cleanup.
//! Close bypasses policy and interrupts pre-source waits. The caller or host must poll source close
//! and reconciliation, including after a policy rejection terminates wrapper append authority.

use std::{
    collections::VecDeque,
    fmt,
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll},
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_core::Stream;
use futures_util::{StreamExt, future::poll_fn, task::AtomicWaker};

use crate::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, ErrorKind, EventPosition,
    EventSubmission, MonitoredStream, MonitoredStreamItem, MonitoredStreamProgress,
    MonitoredStreamStatus, SeaArchive, SeaAuthorSession, SeaService, SeaSession,
    SeaSnapshotCoordinator, SessionBounds, SessionCommittedEvent, SessionLoad, SessionStream,
    SnapshotCoordination, SnapshotParticipation,
    factory::{OpenedSession, SessionFactory},
    storage::{ArchiveStream, LoadStart, Snapshot},
};

/// Borrowed application input inspected before any policy or ordering suspension.
///
/// Policies choose their accounting unit and must document exclusions such as `Bytes` backing
/// allocations larger than the visible slice. No encoding or payload copy is needed to inspect it.
pub enum WriteRequest<'a> {
    /// An application event, including its reference and optional immutable-tree identity.
    Submit(&'a EventSubmission),
    /// An immutable leaf publication.
    Blob(&'a Bytes),
    /// An immutable directory publication.
    Directory(&'a BlobDirectory),
}

/// Document-wide admission decisions, independent of storage and transport implementations.
///
/// Synchronous hooks must be short and nonblocking. They run outside source and wrapper locks.
/// Errors are definitive pre-source failures and must not be classified as `Ambiguous`.
/// A policy must not retain payloads or start unbounded work in a hook.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait DocumentPolicy: SessionBounds {
    /// Detailed, classified refusal or observation failure.
    type Error: ClassifiedError;
    /// RAII ownership of a bounded waiting request and its policy-defined byte charge.
    ///
    /// Acquisition must reject synchronously if the document's independent request or byte limit
    /// is exhausted. Drop releases the charge on cancellation, refusal, or entry into the source.
    /// The charge covers both ordering and policy waits, not source-accepted work.
    type Permit: SessionBounds;
    /// Bounded ownership of one live reader, including a pending source load.
    ///
    /// Drop releases admission on load cancellation/failure, observed stream termination, or
    /// stream drop. A source-revoked but unpolled stream can retain this permit until dropped,
    /// even if the source has already released cache retention independently.
    /// The permit must not retain payloads or session/storage capabilities.
    type ReaderPermit: SessionBounds + 'static;

    /// Refuses a session before source allocation; success is not a storage reservation.
    ///
    /// # Errors
    /// Returns a classified pre-source refusal or observation failure.
    fn admit_session(&self, reference: Option<EventPosition>) -> Result<(), Self::Error>;

    /// Reserves a live read or load before the source can construct a subscription.
    /// Bounded reads and standalone snapshot selection deliberately bypass this hook.
    ///
    /// # Errors
    /// Returns a classified pre-source refusal or observation failure.
    fn admit_live_reader(&self) -> Result<Self::ReaderPermit, Self::Error>;

    /// Reserves bounded wait ownership before the wrapper can suspend with this input.
    ///
    /// This does not bound caller-owned inputs or futures that have not yet been polled.
    /// Limits apply even when pressure is currently low: a submission can still wait for its turn.
    ///
    /// # Errors
    /// Refuses when bounded ownership cannot be acquired, or a policy observation has failed.
    fn acquire_write(&self, request: WriteRequest<'_>) -> Result<Self::Permit, Self::Error>;

    /// Waits for advisory permission to enter a new source mutation.
    ///
    /// Use level-triggered state or registration/recheck, and surface terminal observation errors.
    /// Cancellation must release wait registrations without assuming the write was accepted.
    /// Source admission remains authoritative. Close cancels this future without waiting for it.
    ///
    /// # Errors
    /// Returns a classified pre-source refusal, including terminal observation failure.
    async fn wait_write(&self, permit: &Self::Permit) -> Result<(), Self::Error>;
}

/// Preserves source failures while distinguishing pre-source policy and terminal refusals.
#[derive(Debug)]
pub enum PolicyError<Source, Policy> {
    /// Unchanged source failure, including any ambiguity.
    Source(Source),
    /// Policy refused before the source operation was invoked.
    Policy(Policy),
    /// This wrapper's append authority has ended, or close has begun.
    Terminal,
}

impl<S: fmt::Display, P: fmt::Display> fmt::Display for PolicyError<S, P> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Source(error) => write!(formatter, "source: {error}"),
            Self::Policy(error) => write!(formatter, "policy: {error}"),
            Self::Terminal => formatter.write_str("session policy authority is terminal"),
        }
    }
}

impl<S: std::error::Error + 'static, P: std::error::Error + 'static> std::error::Error
    for PolicyError<S, P>
{
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Source(error) => Some(error),
            Self::Policy(error) => Some(error),
            Self::Terminal => None,
        }
    }
}

impl<S: ClassifiedError, P: ClassifiedError> ClassifiedError for PolicyError<S, P> {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Source(error) => error.kind(),
            Self::Policy(error) => error.kind(),
            Self::Terminal => ErrorKind::Rejected,
        }
    }
}

/// Decorates one document's sessions with the same policy instance.
///
/// Construction does not open a session or enable policy on other construction paths.
pub struct PolicyFactory<Source, Policy> {
    /// Document-scoped source factory.
    source: Source,
    /// Caller-constructed document observations and rules.
    policy: Arc<Policy>,
}

impl<S, P> PolicyFactory<S, P> {
    /// Retains a source and the document's shared policy.
    #[must_use]
    pub const fn new(source: S, policy: Arc<P>) -> Self {
        Self { source, policy }
    }
}

impl<S: Clone, P> Clone for PolicyFactory<S, P> {
    fn clone(&self) -> Self {
        Self::new(self.source.clone(), self.policy.clone())
    }
}

impl<S: SessionFactory, P: DocumentPolicy> SeaService for PolicyFactory<S, P> {
    type Error = PolicyError<S::Error, P::Error>;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S: SessionFactory, P: DocumentPolicy> SessionFactory for PolicyFactory<S, P> {
    type Session = PolicySession<S::Session, P>;

    async fn open_session(
        &self,
        reference: Option<EventPosition>,
    ) -> Result<OpenedSession<Self::Session>, Self::Error> {
        self.policy
            .admit_session(reference)
            .map_err(PolicyError::Policy)?;
        let opened = self
            .source
            .open_session(reference)
            .await
            .map_err(PolicyError::Source)?;
        // No await after source completion: ownership transfers in this same poll.
        Ok(OpenedSession {
            id: opened.id,
            session: PolicySession::new(opened.session, self.policy.clone()),
        })
    }
}

/// Policy-enabled session facets with concrete source availability handles.
///
/// Clones share terminal authority and FIFO submission order, established when each future first
/// polls its synchronous admission hooks. Callers must poll submissions in their intended order.
/// Policy/order waits never hold a source or close gate. The first submit failure ends wrapper
/// append authority across clones; it does not autonomously close the underlying membership.
/// Cancellation before source invocation removes the waiter without creating acceptance or ending
/// authority. Once source submit is entered, cancellation ends wrapper authority and leaves
/// settlement to the source. Already-entered source operations are never canceled by wrapper close.
pub struct PolicySession<Source, Policy> {
    /// Underlying capabilities and lifecycle owner.
    source: Source,
    /// Shared document rules; cloning does not clone policy state.
    policy: Arc<Policy>,
    /// Shared append ordering and pre-source cancellation notification.
    state: Arc<Mutex<AdmissionState>>,
}

impl<S, P> PolicySession<S, P> {
    /// Decorates an existing session; use clones, not repeated wrapping, to share wrapper authority.
    #[must_use]
    pub fn new(source: S, policy: Arc<P>) -> Self {
        Self {
            source,
            policy,
            state: Arc::default(),
        }
    }
}

impl<S: Clone, P> Clone for PolicySession<S, P> {
    fn clone(&self) -> Self {
        Self {
            source: self.source.clone(),
            policy: self.policy.clone(),
            state: self.state.clone(),
        }
    }
}

/// Only pre-source writes and the current source submit retain entries here.
#[derive(Default)]
struct AdmissionState {
    /// Sticky append/close refusal, independent of source settlement.
    terminal: bool,
    /// Bounded by policy permits, plus at most one source-entered submit.
    waiting: VecDeque<Arc<Waiter>>,
}

/// One cancellation-safe, identity-scoped position in the admission queue.
struct Waiter {
    /// Submissions wait for preceding submissions; content writes do not.
    ordered: bool,
    /// Policy-independent wakeup when close or a preceding submission changes state.
    waker: AtomicWaker,
}

/// Removes its queue entry on every exit and terminates authority on source-submit cancellation.
struct Admission {
    /// Shared authority and queue.
    state: Arc<Mutex<AdmissionState>>,
    /// Stable identity used for cancellation/removal.
    waiter: Arc<Waiter>,
    /// Armed only while a source submit might have been admitted.
    entered: bool,
}

/// Ends wrapper authority and wakes all pre-source waits without running callbacks under a lock.
fn terminate(state: &Mutex<AdmissionState>) {
    let waiting = {
        let mut state = state.lock().expect("policy admission lock");
        if state.terminal {
            return;
        }
        state.terminal = true;
        state.waiting.iter().cloned().collect::<Vec<_>>()
    };
    for waiter in waiting {
        waiter.waker.wake();
    }
}

impl Admission {
    /// Registers after policy capacity acquisition, rechecking concurrent close.
    fn new(state: Arc<Mutex<AdmissionState>>, ordered: bool) -> Option<Self> {
        let waiter = Arc::new(Waiter {
            ordered,
            waker: AtomicWaker::new(),
        });
        {
            let mut shared = state.lock().expect("policy admission lock");
            if shared.terminal {
                return None;
            }
            shared.waiting.push_back(waiter.clone());
        }
        Some(Self {
            state,
            waiter,
            entered: false,
        })
    }

    /// Registers before rechecking authority and FIFO readiness to avoid missed wakeups.
    fn poll_turn(&self, context: &Context<'_>) -> Poll<bool> {
        self.waiter.waker.register(context.waker());
        let shared = self.state.lock().expect("policy admission lock");
        if shared.terminal {
            return Poll::Ready(false);
        }
        if !self.waiter.ordered
            || shared
                .waiting
                .iter()
                .find(|waiter| waiter.ordered)
                .is_some_and(|first| Arc::ptr_eq(first, &self.waiter))
        {
            Poll::Ready(true)
        } else {
            Poll::Pending
        }
    }
}

impl Drop for Admission {
    fn drop(&mut self) {
        if self.entered {
            terminate(&self.state);
        }
        let next = {
            let mut shared = self.state.lock().expect("policy admission lock");
            shared
                .waiting
                .retain(|entry| !Arc::ptr_eq(entry, &self.waiter));
            shared.waiting.iter().find(|entry| entry.ordered).cloned()
        };
        if let Some(next) = next {
            next.waker.wake();
        }
    }
}

impl<S: SeaSession, P: DocumentPolicy> SeaService for PolicySession<S, P> {
    type Error = PolicyError<S::Error, P::Error>;
}

impl<S: SeaSession, P: DocumentPolicy> PolicySession<S, P> {
    /// Acquires capacity before allocating a waiter or suspending with an input.
    async fn admit_write(
        &self,
        request: WriteRequest<'_>,
    ) -> Result<Admission, PolicyError<S::Error, P::Error>> {
        let ordered = matches!(request, WriteRequest::Submit(_));
        if self.state.lock().expect("policy admission lock").terminal {
            return Err(PolicyError::Terminal);
        }
        let permit = match self.policy.acquire_write(request) {
            Ok(permit) => permit,
            Err(error) => {
                if ordered {
                    terminate(&self.state);
                }
                return Err(PolicyError::Policy(error));
            }
        };
        let admission = Admission::new(self.state.clone(), ordered).ok_or(PolicyError::Terminal)?;
        let mut waiting = self.policy.wait_write(&permit);
        let result = poll_fn(|context| match admission.poll_turn(context) {
            Poll::Ready(false) => Poll::Ready(Err(PolicyError::Terminal)),
            Poll::Ready(true) => waiting.as_mut().poll(context).map_err(PolicyError::Policy),
            Poll::Pending => Poll::Pending,
        })
        .await;
        if ordered && result.is_err() {
            terminate(&self.state);
        }
        result?;
        if self.state.lock().expect("policy admission lock").terminal {
            return Err(PolicyError::Terminal);
        }
        Ok(admission)
    }
}

/// Error-mapping stream that releases source ownership on an observed error or end.
///
/// Source revocation remains source-owned: this wrapper does not register a second reader registry
/// or claim to drop an unpolled source. Its final progress is retained after source destruction.
struct PolicyStream<S, P, G> {
    /// Removed on observed termination rather than retained until wrapper drop.
    source: Option<ArchiveStream<SessionCommittedEvent, EventPosition, S>>,
    /// Initial or final observation when no source exists.
    progress: MonitoredStreamProgress<EventPosition>,
    /// One pre-source refusal for a read whose synchronous API cannot return an error.
    refusal: Option<P>,
    /// Live-reader admission retained independently of the source's cache retention.
    reader: Option<G>,
}

impl<S, P, G> Unpin for PolicyStream<S, P, G> {}

impl<S, P, G> Stream for PolicyStream<S, P, G> {
    type Item =
        Result<MonitoredStreamItem<SessionCommittedEvent, EventPosition>, PolicyError<S, P>>;

    fn poll_next(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        if let Some(error) = this.refusal.take() {
            return Poll::Ready(Some(Err(PolicyError::Policy(error))));
        }
        let Some(source) = &mut this.source else {
            return Poll::Ready(None);
        };
        let result = source.as_mut().poll_next(context);
        this.progress = source.progress();
        match result {
            Poll::Ready(Some(Err(error))) => {
                this.source = None;
                this.reader = None;
                Poll::Ready(Some(Err(PolicyError::Source(error))))
            }
            Poll::Ready(None) => {
                this.source = None;
                this.reader = None;
                Poll::Ready(None)
            }
            Poll::Ready(Some(Ok(item))) => Poll::Ready(Some(Ok(item))),
            Poll::Pending => Poll::Pending,
        }
    }
}

impl<S, P, G> MonitoredStream for PolicyStream<S, P, G> {
    type Data = SessionCommittedEvent;
    type Position = EventPosition;
    type Error = PolicyError<S, P>;

    fn progress(&self) -> MonitoredStreamProgress<EventPosition> {
        self.source
            .as_ref()
            .map_or_else(|| self.progress.clone(), |source| source.progress())
    }
}

/// Wraps an admitted stream without changing its current progress or availability handles.
fn map_stream<S: ClassifiedError, P: ClassifiedError, G: SessionBounds + 'static>(
    source: ArchiveStream<SessionCommittedEvent, EventPosition, S>,
    reader: Option<G>,
) -> ArchiveStream<SessionCommittedEvent, EventPosition, PolicyError<S, P>> {
    Box::pin(PolicyStream {
        progress: source.progress(),
        source: Some(source),
        refusal: None,
        reader,
    })
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S: SeaSession, P: DocumentPolicy> SeaArchive for PolicySession<S, P> {
    type BlobHandle = S::BlobHandle;
    type EventHandle = S::EventHandle;

    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<SessionCommittedEvent, EventPosition, Self::Error> {
        let reader = if stop_after.is_none() {
            match self.policy.admit_live_reader() {
                Ok(permit) => Some(permit),
                Err(error) => {
                    return Box::pin(PolicyStream::<S::Error, P::Error, P::ReaderPermit> {
                        source: None,
                        progress: MonitoredStreamProgress {
                            previous: after,
                            latest_known: after,
                            status: MonitoredStreamStatus::StreamingBacklog,
                        },
                        refusal: Some(error),
                        reader: None,
                    });
                }
            }
        } else {
            None
        };
        map_stream(self.source.read(after, stop_after), reader)
    }

    async fn load(
        &self,
        start: LoadStart,
    ) -> Result<SessionLoad<Self::BlobHandle, Self::EventHandle, Self::Error>, Self::Error> {
        let reader = self
            .policy
            .admit_live_reader()
            .map_err(PolicyError::Policy)?;
        let loaded = self.source.load(start).await.map_err(PolicyError::Source)?;
        Ok(SessionLoad {
            snapshot: loaded.snapshot,
            events: map_stream(loaded.events, Some(reader)),
        })
    }

    async fn get_snapshot(
        &self,
        start: LoadStart,
    ) -> Result<Option<Snapshot<Self::BlobHandle, Self::EventHandle>>, Self::Error> {
        self.source
            .get_snapshot(start)
            .await
            .map_err(PolicyError::Source)
    }

    async fn put_blob(&self, payload: Bytes) -> Result<Self::BlobHandle, Self::Error> {
        let admission = self.admit_write(WriteRequest::Blob(&payload)).await?;
        drop(admission);
        self.source
            .put_blob(payload)
            .await
            .map_err(PolicyError::Source)
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        self.source.get_blob(id).await.map_err(PolicyError::Source)
    }

    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<Self::BlobHandle, Self::Error> {
        let admission = self
            .admit_write(WriteRequest::Directory(&directory))
            .await?;
        drop(admission);
        self.source
            .put_directory(directory)
            .await
            .map_err(PolicyError::Source)
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.source
            .get_directory(id)
            .await
            .map_err(PolicyError::Source)
    }

    async fn resolve_tree(&self, id: BlobTreeId) -> Result<Option<Self::BlobHandle>, Self::Error> {
        self.source
            .resolve_tree(id)
            .await
            .map_err(PolicyError::Source)
    }

    async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::EventHandle>, Self::Error> {
        self.source
            .resolve_position(position)
            .await
            .map_err(PolicyError::Source)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S: SeaSession, P: DocumentPolicy> SeaAuthorSession for PolicySession<S, P> {
    async fn announce_membership(&self, metadata: Bytes) -> Result<EventPosition, Self::Error> {
        self.source
            .announce_membership(metadata)
            .await
            .map_err(PolicyError::Source)
    }

    async fn submit(&self, submission: EventSubmission) -> Result<EventPosition, Self::Error> {
        let mut admission = self.admit_write(WriteRequest::Submit(&submission)).await?;
        admission.entered = true;
        let result = self
            .source
            .submit(submission)
            .await
            .map_err(PolicyError::Source);
        if result.is_ok() {
            admission.entered = false;
        }
        result
    }

    async fn close(&self) -> Result<(), Self::Error> {
        terminate(&self.state);
        self.source.close().await.map_err(PolicyError::Source)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S: SeaSession, P: DocumentPolicy> SeaSnapshotCoordinator for PolicySession<S, P> {
    async fn coordinate_snapshots(
        &self,
        participation: SnapshotParticipation,
    ) -> Result<SessionStream<SnapshotCoordination, Self::Error>, Self::Error> {
        let source = self
            .source
            .coordinate_snapshots(participation)
            .await
            .map_err(PolicyError::Source)?;
        Ok(Box::pin(
            source.map(|item| item.map_err(PolicyError::Source)),
        ))
    }

    async fn publish_snapshot(
        &self,
        parent: Option<EventPosition>,
        fence: Option<u64>,
        snapshot: Snapshot<Self::BlobHandle, Self::EventHandle>,
    ) -> Result<Snapshot<Self::BlobHandle, Self::EventHandle>, Self::Error> {
        self.source
            .publish_snapshot(parent, fence, snapshot)
            .await
            .map_err(PolicyError::Source)
    }

    async fn revoke_snapshot_publisher(&self) -> Result<(), Self::Error> {
        self.source
            .revoke_snapshot_publisher()
            .await
            .map_err(PolicyError::Source)
    }
}
