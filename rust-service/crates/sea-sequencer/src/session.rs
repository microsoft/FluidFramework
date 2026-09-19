//! Multi-user session runtime over one exclusively owned document view.
//!
//! [`crate::session::LocalSequencer`] recovers committed submission and snapshot identities, then
//! multiplexes the view into [`crate::session::LocalSession`] memberships. Memberships are
//! runtime-local: reopening restores stable committed identities, closes outstanding durable
//! announcements, and requires callers to establish fresh sessions.
//!
//! One runtime mutex serializes membership changes and state-dependent mutations. Before releasing
//! that order, the runtime stores an owned backend future, so cancellation of a caller does not
//! masquerade as settlement. A later operation drives the same future to completion; a failed
//! bounded reconciliation poisons further mutation with
//! [`crate::session::SessionError::RecoveryRequired`] until the view is discarded and recovered.
//!
//! Event delivery uses the view's monitored archive streams directly. Snapshot publisher
//! registration is separate synchronous state: dropping a coordination stream revokes its lease,
//! client-selected publishers suppress Sea nomination, and every nomination change receives a new
//! fence.

#[cfg(test)]
#[path = "fault_tests.rs"]
mod fault_tests;

use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{
    StreamExt, TryStreamExt,
    future::{Either, select},
    stream,
};
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, CommittedEvent, ErrorKind,
    Event, EventPosition, MonitoredStreamItem, MonitoredStreamProgress, MonitoredStreamStatus,
    archive::{
        AuthorId, EventSubmission, OperationId, SessionCommittedEvent, SessionEventKind, SessionId,
        SessionStream, SnapshotParticipation,
    },
    boxed_monitored_stream,
    session::{
        SeaArchive, SeaAuthorSession, SeaSnapshotCoordinator, SessionLoad, SnapshotCoordination,
    },
    storage::{
        ArchiveStream, BlobStore, LoadStart, ReferenceableStore, SeaStorage, SeaView, Snapshot,
        StorageHandle,
    },
};
use tokio::sync::{Mutex, watch};

use crate::codec::{decode_committed, encode_membership, encode_submission};
pub use crate::error::SessionError;

/// View supplied by a document factory, moved into the sequencer.
type View<Storage> = SeaView<
    <Storage as SeaStorage>::Blobs,
    <Storage as SeaStorage>::Events,
    <Storage as SeaStorage>::Snapshots,
>;

#[cfg(not(target_arch = "wasm32"))]
/// An owned mutation remains pollable after cancellation of its caller.
type MutationFuture<Error> =
    futures_util::future::BoxFuture<'static, Result<EventPosition, SessionError<Error>>>;

#[cfg(target_arch = "wasm32")]
/// Browser-owned reconciliation streams need not be `Send`.
type MutationFuture<Error> =
    futures_util::future::LocalBoxFuture<'static, Result<EventPosition, SessionError<Error>>>;

/// Tree capability used by this factory.
type BlobHandle<Storage> = <<Storage as SeaStorage>::Blobs as ReferenceableStore>::Handle;
/// Event capability used by this factory.
type EventHandle<Storage> = <<Storage as SeaStorage>::Events as ReferenceableStore>::Handle;
/// Snapshot with capabilities from one document opening.
type ViewSnapshot<Storage> = Snapshot<BlobHandle<Storage>, EventHandle<Storage>>;

/// Runtime-owned publisher registration; stream cancellation revokes it synchronously.
struct Publisher {
    /// Requested publication policy.
    participation: SnapshotParticipation,
    /// Stream-held liveness token, independent of backend lifetime choices.
    alive: std::sync::Weak<()>,
    /// Registration identity prevents stale streams from observing replacement authority.
    registration: u64,
    /// Latest state for this registration.
    updates: watch::Sender<SnapshotCoordination>,
}

/// One logical membership; clones observe the same closure signal.
struct Membership {
    /// Stable author whose current connection is represented.
    author: AuthorId,
    /// Latest acknowledged application position.
    reference: Option<EventPosition>,
    /// Closing or replacing this membership ends its live streams.
    closed: watch::Sender<bool>,
}

/// One in-flight mutation and its replayable application input.
struct Pending<Error> {
    /// Owned backend work; never dropped merely because its requesting future was dropped.
    future: MutationFuture<Error>,
    /// Encoded event used to rebuild authoritative state after settlement.
    event: Option<Event>,
}

/// Authoritative mutable session state serialized across all clients.
struct Runtime<Storage: SeaStorage> {
    /// Removed only by explicit shutdown after pending work settles.
    view: Option<Arc<View<Storage>>>,
    /// Active session memberships, not persisted as application events.
    members: BTreeMap<SessionId, Membership>,
    /// Persisted announcements whose departure has not committed, including recovered sessions.
    announced: BTreeMap<SessionId, SessionCommittedEvent>,
    /// Identities cannot be reused within this runtime or after a committed submission.
    seen: BTreeSet<SessionId>,
    /// Committed submission identities for retries and recovery.
    accepted: BTreeMap<OperationId, SessionCommittedEvent>,
    /// Application positions used to validate references and snapshot boundaries.
    positions: BTreeSet<EventPosition>,
    /// At most one outstanding mutation owns backend execution.
    pending: Option<Pending<Storage::Error>>,
    /// A failed reconciliation prevents a duplicate-producing retry.
    recovery_required: bool,
    /// Publisher state is synchronous so dropping a stream can revoke its authority immediately.
    publishers: Arc<std::sync::Mutex<Publishers>>,
}

/// Publisher coordination without asynchronous work on stream drop.
#[derive(Default)]
struct Publishers {
    /// Live session registrations.
    entries: BTreeMap<SessionId, Publisher>,
    /// Current nomination, unique across registration changes within this runtime.
    nominee: Option<(SessionId, u64, u64)>,
    /// Monotonic registration/fencing sequence; exhaustion rejects registration.
    next_fence: u64,
    /// Latest committed snapshot version.
    latest: Option<EventPosition>,
}

impl Publishers {
    /// Recomputes authority after membership, registration, publication, or stream cancellation.
    fn refresh(&mut self) {
        self.entries
            .retain(|_, publisher| publisher.alive.strong_count() != 0);
        let client_selected = self
            .entries
            .values()
            .any(|publisher| publisher.participation == SnapshotParticipation::ClientSelected);
        let candidate = if client_selected {
            None
        } else {
            self.entries
                .iter()
                .find(|(_, publisher)| {
                    publisher.participation == SnapshotParticipation::SeaSelected
                })
                .map(|(session, publisher)| (session.clone(), publisher.registration))
        };
        if self
            .nominee
            .as_ref()
            .map(|(session, registration, _)| (session.clone(), *registration))
            != candidate
        {
            self.nominee = candidate.and_then(|(session, registration)| {
                self.next_fence = self.next_fence.checked_add(1)?;
                Some((session, registration, self.next_fence))
            });
        }
        for (session, publisher) in &self.entries {
            publisher.updates.send_replace(SnapshotCoordination {
                latest: self.latest,
                fence: self
                    .nominee
                    .as_ref()
                    .filter(|(nominee, _, _)| nominee == session)
                    .map(|(_, _, fence)| *fence),
            });
        }
    }
}

/// Drop guard revokes only the registration it created.
struct PublisherLease {
    /// Coordination state, containing no storage authority.
    publishers: Arc<std::sync::Mutex<Publishers>>,
    /// Owning logical session.
    session: SessionId,
    /// Unique registration identity.
    registration: u64,
    /// Keeps this registration live until stream drop.
    _alive: Arc<()>,
}

impl Drop for PublisherLease {
    fn drop(&mut self) {
        let mut publishers = self.publishers.lock().expect("publisher lock");
        if publishers
            .entries
            .get(&self.session)
            .is_some_and(|publisher| publisher.registration == self.registration)
        {
            publishers.entries.remove(&self.session);
            publishers.refresh();
        }
    }
}

impl<Storage: SeaStorage + 'static> Runtime<Storage> {
    /// Records a settled submission and rejects duplicate committed identities.
    fn apply(&mut self, record: &CommittedEvent) -> Result<(), SessionError<Storage::Error>> {
        let committed = decode_committed(record)?;
        if committed.kind == SessionEventKind::Application
            && self.accepted.contains_key(&committed.operation_id)
        {
            return Err(SessionError::Corrupt("duplicate submission identity"));
        }
        if committed
            .reference
            .is_some_and(|position| !self.positions.contains(&position))
        {
            return Err(SessionError::Corrupt("reference is not a preceding event"));
        }
        self.seen.insert(committed.session_id.clone());
        if committed.kind == SessionEventKind::Application
            && let Some(member) = self.members.get_mut(&committed.session_id)
        {
            member.reference = committed.reference;
        }
        self.positions.insert(record.position);
        match committed.kind {
            SessionEventKind::Application => {
                self.accepted
                    .insert(committed.operation_id.clone(), committed);
            }
            SessionEventKind::Joined => {
                if self
                    .announced
                    .insert(committed.session_id.clone(), committed)
                    .is_some()
                {
                    return Err(SessionError::Corrupt("duplicate membership announcement"));
                }
            }
            SessionEventKind::Left => {
                let announced = self
                    .announced
                    .remove(&committed.session_id)
                    .ok_or(SessionError::Corrupt("departure without announcement"))?;
                if announced.author_id != committed.author_id {
                    return Err(SessionError::Corrupt("departure author mismatch"));
                }
                self.remove_member(&committed.session_id);
            }
        }
        Ok(())
    }

    /// Closes live streams and publisher authority after ordered departure settles.
    fn remove_member(&mut self, session: &SessionId) {
        if let Some(member) = self.members.remove(session) {
            member.closed.send_replace(true);
        }
        let mut publishers = self.publishers.lock().expect("publisher lock");
        publishers.entries.remove(session);
        publishers.refresh();
    }

    /// Retains and settles one service-authored membership mutation.
    async fn append_membership(
        &mut self,
        author: &AuthorId,
        session: &SessionId,
        kind: SessionEventKind,
        metadata: &[u8],
    ) -> Result<EventPosition, SessionError<Storage::Error>> {
        let reference = self.positions.last().copied();
        let minimum = self
            .members
            .iter()
            .filter(|(identity, _)| kind != SessionEventKind::Left || *identity != session)
            .map(|(_, member)| member.reference)
            .min()
            .unwrap_or(reference);
        let event = Event {
            payload: encode_membership(author, session, kind, reference, minimum, metadata)?,
            blob_tree: None,
        };
        let view = self.view()?;
        let input = event.clone();
        self.pending = Some(Pending {
            event: Some(event),
            future: Box::pin(async move { append_once::<Storage>(&view, input).await }),
        });
        self.settle().await?;
        Ok(*self.positions.last().expect("settled membership position"))
    }

    /// Commits an announced departure before ending authority; unannounced sessions add no event.
    async fn close_member(
        &mut self,
        session: &SessionId,
    ) -> Result<(), SessionError<Storage::Error>> {
        if let Some(announcement) = self.announced.get(session) {
            let author = announcement.author_id.clone();
            self.append_membership(&author, session, SessionEventKind::Left, &[])
                .await?;
        } else {
            self.remove_member(session);
        }
        Ok(())
    }

    /// Drives a retained mutation to settlement before allowing another state-dependent operation.
    async fn settle(&mut self) -> Result<(), SessionError<Storage::Error>> {
        if self.recovery_required {
            return Err(SessionError::RecoveryRequired);
        }
        if let Some(pending) = &mut self.pending {
            let result = pending.future.as_mut().await;
            let pending = self.pending.take().expect("settled mutation");
            if matches!(
                &result,
                Err(SessionError::RecoveryRequired | SessionError::Corrupt(_))
            ) {
                self.recovery_required = true;
            }
            let position = result?;
            if let Some(event) = pending.event {
                if let Err(error) = self.apply(&CommittedEvent { position, event }) {
                    self.recovery_required = true;
                    return Err(error);
                }
            } else {
                let mut publishers = self.publishers.lock().expect("publisher lock");
                publishers.latest = Some(position);
                publishers.refresh();
            }
        }
        Ok(())
    }

    /// Clones the active view only for an operation; never lends writer authority to callers.
    fn view(&self) -> Result<Arc<View<Storage>>, SessionError<Storage::Error>> {
        self.view.clone().ok_or(SessionError::Closed)
    }

    /// Requires current logical membership after all prior mutations settle.
    fn member(&self, session: &SessionId) -> Result<&Membership, SessionError<Storage::Error>> {
        self.members.get(session).ok_or(SessionError::Closed)
    }
}

/// One runtime multiplexing an exclusively owned view into logical sessions.
pub struct LocalSequencer<Storage: SeaStorage> {
    /// The sole owner of mutation sequencing and session membership.
    runtime: Mutex<Runtime<Storage>>,
}

impl<Storage: SeaStorage + 'static> LocalSequencer<Storage> {
    /// Recovers stable event identities by scanning a bounded committed history.
    /// Active membership is runtime-local; recovery requires fresh logical sessions.
    ///
    /// # Errors
    /// Returns backend failures or malformed/duplicate committed submission errors.
    /// # Panics
    /// Panics if an internal publisher-state lock was poisoned.
    pub async fn recover(view: View<Storage>) -> Result<Arc<Self>, SessionError<Storage::Error>> {
        let view = Arc::new(view);
        let mut runtime = Runtime {
            view: Some(view.clone()),
            members: BTreeMap::new(),
            announced: BTreeMap::new(),
            seen: BTreeSet::new(),
            accepted: BTreeMap::new(),
            positions: BTreeSet::new(),
            pending: None,
            recovery_required: false,
            publishers: Arc::new(std::sync::Mutex::new(Publishers::default())),
        };
        if let Some(head) = view.head().await.map_err(SessionError::Storage)? {
            let mut records = view.read(None, Some(head));
            while let Some(item) = records.next().await {
                if let MonitoredStreamItem::Item(record) = item.map_err(SessionError::Storage)? {
                    runtime.apply(&record)?;
                }
            }
        }
        let latest = view
            .get_snapshot(LoadStart::LatestSnapshot)
            .await
            .map_err(SessionError::Storage)?;
        runtime.publishers.lock().expect("publisher lock").latest =
            latest.map(|snapshot| snapshot.at_event.id());
        for session in runtime.announced.keys().cloned().collect::<Vec<_>>() {
            runtime.close_member(&session).await?;
        }
        Ok(Arc::new(Self {
            runtime: Mutex::new(runtime),
        }))
    }

    /// Opens a fresh membership, closing the previous connection for the same author.
    ///
    /// # Errors
    /// Rejects reused sessions, invalid references, closed runtimes, or unsettled prior work.
    /// # Panics
    /// Panics if an internal publisher-state lock was poisoned.
    pub async fn open_session(
        self: &Arc<Self>,
        author: AuthorId,
        session: SessionId,
        reference: Option<EventPosition>,
    ) -> Result<LocalSession<Storage>, SessionError<Storage::Error>> {
        let mut runtime = self.runtime.lock().await;
        runtime.settle().await?;
        runtime.view()?;
        if runtime.seen.contains(&session)
            || reference.is_some_and(|position| !runtime.positions.contains(&position))
        {
            return Err(SessionError::Rejected(
                "reused session or invalid reference",
            ));
        }
        let replaced = runtime
            .members
            .iter()
            .filter(|(_, member)| member.author == author)
            .map(|(session, _)| session.clone())
            .collect::<Vec<_>>();
        for previous in replaced {
            runtime.close_member(&previous).await?;
        }
        let (closed, _) = watch::channel(false);
        runtime.members.insert(
            session.clone(),
            Membership {
                author: author.clone(),
                reference,
                closed,
            },
        );
        runtime.seen.insert(session.clone());
        Ok(LocalSession {
            sequencer: self.clone(),
            author,
            session,
        })
    }

    /// Settles retained backend work, closes every session, and releases the owned view.
    /// Backend-dependent resources retained by independent streams may still prevent reopening.
    ///
    /// # Errors
    /// Returns a pending mutation failure or an unresolved outcome requiring recovery.
    /// # Panics
    /// Panics if an internal publisher-state lock was poisoned.
    pub async fn shutdown(&self) -> Result<(), SessionError<Storage::Error>> {
        let mut runtime = self.runtime.lock().await;
        runtime.settle().await?;
        for session in runtime.members.keys().cloned().collect::<Vec<_>>() {
            runtime.close_member(&session).await?;
        }
        runtime
            .publishers
            .lock()
            .expect("publisher lock")
            .entries
            .clear();
        runtime.view.take();
        Ok(())
    }
}

/// Cloneable membership in one shared runtime; close affects only this membership.
pub struct LocalSession<Storage: SeaStorage> {
    /// Shared sequencing owner, not independent storage authority.
    sequencer: Arc<LocalSequencer<Storage>>,
    /// Author identity checked when reconciling retries.
    author: AuthorId,
    /// Unique connection identity for this membership.
    session: SessionId,
}

impl<Storage: SeaStorage> Clone for LocalSession<Storage> {
    fn clone(&self) -> Self {
        Self {
            sequencer: self.sequencer.clone(),
            author: self.author.clone(),
            session: self.session.clone(),
        }
    }
}

impl<Storage: SeaStorage + 'static> LocalSession<Storage> {
    /// Publishes this membership once in archive order, retaining opaque application metadata.
    /// Close, same-author replacement, and recovery publish an ordered departure.
    /// Exact retries return the original position; metadata cannot change within a membership.
    ///
    /// # Errors
    /// Returns closed-session, conflicting metadata, storage, or settlement errors.
    /// # Panics
    /// Panics if an internal publisher-state lock was poisoned.
    pub async fn announce_membership(
        &self,
        metadata: Bytes,
    ) -> Result<EventPosition, SessionError<Storage::Error>> {
        let mut runtime = self.sequencer.runtime.lock().await;
        runtime.settle().await?;
        runtime.member(&self.session)?;
        if let Some(announced) = runtime.announced.get(&self.session) {
            return if announced.committed.event.payload == metadata {
                Ok(announced.committed.position)
            } else {
                Err(SessionError::Rejected("membership metadata cannot change"))
            };
        }
        runtime
            .append_membership(
                &self.author,
                &self.session,
                SessionEventKind::Joined,
                &metadata,
            )
            .await
    }

    /// Submits once, retaining backend execution through caller cancellation.
    async fn submit(
        &self,
        submission: EventSubmission,
    ) -> Result<EventPosition, SessionError<Storage::Error>> {
        let mut runtime = self.sequencer.runtime.lock().await;
        runtime.settle().await?;
        runtime.member(&self.session)?;
        if let Some(accepted) = runtime.accepted.get(&submission.operation_id) {
            return if accepted.author_id == self.author
                && accepted.committed.event == submission.event
                && accepted.reference == submission.reference
            {
                Ok(accepted.committed.position)
            } else {
                Err(SessionError::Rejected(
                    "operation identity conflicts with previous input",
                ))
            };
        }
        if submission
            .reference
            .is_some_and(|position| !runtime.positions.contains(&position))
        {
            return Err(SessionError::Rejected(
                "reference is not an application event",
            ));
        }
        let active_minimum = runtime
            .members
            .values()
            .map(|member| member.reference)
            .min()
            .flatten();
        if submission
            .reference
            .zip(active_minimum)
            .is_some_and(|(reference, minimum)| reference < minimum)
        {
            return Err(SessionError::Rejected(
                "reference precedes the active minimum",
            ));
        }
        let minimum = runtime
            .members
            .iter()
            .map(|(session, member)| {
                if session == &self.session {
                    submission.reference
                } else {
                    member.reference
                }
            })
            .min()
            .flatten();
        let event = Event {
            payload: encode_submission(
                &self.author,
                &self.session,
                &submission.operation_id,
                submission.reference,
                minimum,
                &submission.event.payload,
            )?,
            blob_tree: submission.event.blob_tree,
        };
        let view = runtime.view()?;
        let input = event.clone();
        runtime.pending = Some(Pending {
            event: Some(event),
            future: Box::pin(async move { append_once::<Storage>(&view, input).await }),
        });
        runtime.settle().await?;
        Ok(runtime
            .accepted
            .get(&submission.operation_id)
            .expect("settled submission")
            .committed
            .position)
    }

    /// Resolves a stable identity after settling any cancelled caller's retained work.
    async fn resolve_submission(
        &self,
        operation: &OperationId,
    ) -> Result<Option<EventPosition>, SessionError<Storage::Error>> {
        let mut runtime = self.sequencer.runtime.lock().await;
        runtime.settle().await?;
        runtime.member(&self.session)?;
        Ok(runtime
            .accepted
            .get(operation)
            .map(|accepted| accepted.committed.position))
    }

    /// Closes this membership idempotently without closing the shared runtime.
    async fn close(&self) -> Result<(), SessionError<Storage::Error>> {
        let mut runtime = self.sequencer.runtime.lock().await;
        if !runtime.members.contains_key(&self.session) {
            return Ok(());
        }
        runtime.settle().await?;
        runtime.close_member(&self.session).await
    }

    /// Obtains a view only after validating current membership and settling prior work.
    async fn view(&self) -> Result<Arc<View<Storage>>, SessionError<Storage::Error>> {
        let mut runtime = self.sequencer.runtime.lock().await;
        runtime.settle().await?;
        runtime.member(&self.session)?;
        runtime.view()
    }
}

impl<Storage: SeaStorage + 'static> sea_core::SeaService for LocalSession<Storage> {
    type Error = SessionError<Storage::Error>;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Storage: SeaStorage + 'static> SeaAuthorSession for LocalSession<Storage> {
    async fn announce_membership(&self, metadata: Bytes) -> Result<EventPosition, Self::Error> {
        Self::announce_membership(self, metadata).await
    }
    async fn submit(&self, submission: EventSubmission) -> Result<EventPosition, Self::Error> {
        Self::submit(self, submission).await
    }
    async fn resolve_submission(
        &self,
        operation: &OperationId,
    ) -> Result<Option<EventPosition>, Self::Error> {
        Self::resolve_submission(self, operation).await
    }
    async fn close(&self) -> Result<(), Self::Error> {
        Self::close(self).await
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Storage: SeaStorage + 'static> SeaArchive for LocalSession<Storage> {
    type BlobHandle = BlobHandle<Storage>;
    type EventHandle = EventHandle<Storage>;

    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<SessionCommittedEvent, EventPosition, Self::Error> {
        let session = self.clone();
        let initial = MonitoredStreamProgress {
            previous: after,
            latest_known: after,
            status: MonitoredStreamStatus::StreamingBacklog,
        };
        let initialized = stream::once(async move {
            let mut runtime = session.sequencer.runtime.lock().await;
            runtime.settle().await?;
            let closed = runtime.member(&session.session)?.closed.subscribe();
            let source = runtime.view()?.read(after, stop_after);
            Ok::<_, Self::Error>(stream::unfold(
                (source, closed, false),
                |(mut source, mut closed, done)| async move {
                    if done || *closed.borrow() {
                        return None;
                    }
                    let next = {
                        let read = Box::pin(source.next());
                        let closing = Box::pin(closed.changed());
                        match select(closing, read).await {
                            Either::Left(_) => None,
                            Either::Right((item, _)) => item,
                        }
                    };
                    let item = match next? {
                        Ok(MonitoredStreamItem::Progress(progress)) => {
                            Ok(MonitoredStreamItem::Progress(progress))
                        }
                        Ok(MonitoredStreamItem::Item(record)) => {
                            decode_committed(&record).map(MonitoredStreamItem::Item)
                        }
                        Err(error) => Err(SessionError::Storage(error)),
                    };
                    let done = item.is_err();
                    Some((item, (source, closed, done)))
                },
            ))
        });
        boxed_monitored_stream(
            initialized.try_flatten(),
            initial,
            |event: &SessionCommittedEvent| Some(event.committed.position),
        )
    }

    async fn load(
        &self,
        start: LoadStart,
    ) -> Result<SessionLoad<Self::BlobHandle, Self::EventHandle, Self::Error>, Self::Error> {
        let snapshot = self.get_snapshot(start).await?;
        let after = snapshot.as_ref().map(|snapshot| snapshot.at_event.id());
        Ok(SessionLoad {
            snapshot,
            events: self.read(after, None),
        })
    }

    async fn get_snapshot(
        &self,
        start: LoadStart,
    ) -> Result<Option<ViewSnapshot<Storage>>, Self::Error> {
        self.view()
            .await?
            .get_snapshot(start)
            .await
            .map_err(SessionError::Storage)
    }
    async fn put_blob(&self, payload: Bytes) -> Result<Self::BlobHandle, Self::Error> {
        self.view()
            .await?
            .blobs()
            .put_blob(payload)
            .await
            .map_err(SessionError::Storage)
    }
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        self.view()
            .await?
            .blobs()
            .get_blob(id)
            .await
            .map_err(SessionError::Storage)
    }
    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<Self::BlobHandle, Self::Error> {
        self.view()
            .await?
            .blobs()
            .put_directory(directory)
            .await
            .map_err(SessionError::Storage)
    }
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.view()
            .await?
            .blobs()
            .get_directory(id)
            .await
            .map_err(SessionError::Storage)
    }
    async fn resolve_tree(&self, id: BlobTreeId) -> Result<Option<Self::BlobHandle>, Self::Error> {
        self.view()
            .await?
            .blobs()
            .resolve(id)
            .await
            .map_err(SessionError::Storage)
    }
    async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::EventHandle>, Self::Error> {
        self.view()
            .await?
            .resolve_position(position)
            .await
            .map_err(SessionError::Storage)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Storage: SeaStorage + 'static> SeaSnapshotCoordinator for LocalSession<Storage> {
    async fn coordinate_snapshots(
        &self,
        participation: SnapshotParticipation,
    ) -> Result<SessionStream<SnapshotCoordination, Self::Error>, Self::Error> {
        let mut runtime = self.sequencer.runtime.lock().await;
        runtime.settle().await?;
        runtime.member(&self.session)?;
        let mut publishers = runtime.publishers.lock().expect("publisher lock");
        let registration = publishers
            .next_fence
            .checked_add(1)
            .ok_or(SessionError::Rejected("publisher fence exhausted"))?;
        publishers.next_fence = registration;
        let alive = Arc::new(());
        let (updates, receiver) = watch::channel(SnapshotCoordination::default());
        publishers.entries.insert(
            self.session.clone(),
            Publisher {
                participation,
                alive: Arc::downgrade(&alive),
                registration,
                updates,
            },
        );
        publishers.refresh();
        let lease = PublisherLease {
            publishers: runtime.publishers.clone(),
            session: self.session.clone(),
            registration,
            _alive: alive,
        };
        Ok(Box::pin(stream::unfold(
            (receiver, true, lease),
            |(mut receiver, first, lease)| async move {
                if !first && receiver.changed().await.is_err() {
                    return None;
                }
                let update = receiver.borrow_and_update().clone();
                Some((Ok(update), (receiver, false, lease)))
            },
        )))
    }

    async fn publish_snapshot(
        &self,
        expected_parent: Option<EventPosition>,
        fence: Option<u64>,
        snapshot: ViewSnapshot<Storage>,
    ) -> Result<ViewSnapshot<Storage>, Self::Error> {
        let mut runtime = self.sequencer.runtime.lock().await;
        runtime.settle().await?;
        runtime.member(&self.session)?;
        {
            let mut publishers = runtime.publishers.lock().expect("publisher lock");
            publishers.refresh();
            let authorized = match publishers
                .entries
                .get(&self.session)
                .map(|publisher| publisher.participation)
            {
                Some(SnapshotParticipation::ClientSelected) => fence.is_none(),
                Some(SnapshotParticipation::SeaSelected) => publishers
                    .nominee
                    .as_ref()
                    .is_some_and(|(session, _, current)| {
                        session == &self.session && Some(*current) == fence
                    }),
                _ => false,
            };
            if !authorized {
                return Err(SessionError::Rejected(
                    "snapshot publisher is not authorized",
                ));
            }
        }
        let view = runtime.view()?;
        let position = snapshot.at_event.id();
        if !runtime.positions.contains(&position) {
            return Err(SessionError::Rejected(
                "snapshot boundary is not an application event",
            ));
        }
        view.blobs()
            .ensure_available(&snapshot.root)
            .await
            .map_err(SessionError::Storage)?;
        if let Some(existing) = view
            .get_snapshot(LoadStart::ReplayAtLeastAllAfter(position))
            .await
            .map_err(SessionError::Storage)?
            && existing.at_event.id() == position
        {
            return if existing.root.id() == snapshot.root.id() {
                Ok(existing)
            } else {
                Err(SessionError::Rejected(
                    "snapshot position already has a different root",
                ))
            };
        }
        let latest = runtime.publishers.lock().expect("publisher lock").latest;
        if latest != expected_parent || latest.is_some_and(|latest| position <= latest) {
            return Err(SessionError::Rejected(
                "snapshot parent conflicts or position regresses",
            ));
        }
        let input = snapshot.clone();
        runtime.pending = Some(Pending {
            event: None,
            future: Box::pin(async move {
                match view.publish_snapshot(&input).await {
                    Ok(()) => Ok(position),
                    Err(error) if error.kind() == ErrorKind::Ambiguous => {
                        let existing = view
                            .get_snapshot(LoadStart::ReplayAtLeastAllAfter(position))
                            .await
                            .map_err(|_| SessionError::RecoveryRequired)?;
                        match existing {
                            Some(existing)
                                if existing.at_event.id() == position
                                    && existing.root.id() == input.root.id() =>
                            {
                                Ok(position)
                            }
                            Some(existing) if existing.at_event.id() == position => Err(
                                SessionError::Corrupt("ambiguous publication has a different root"),
                            ),
                            _ => Err(SessionError::RecoveryRequired),
                        }
                    }
                    Err(error) => Err(SessionError::Storage(error)),
                }
            }),
        });
        runtime.settle().await?;
        Ok(snapshot)
    }

    async fn revoke_snapshot_publisher(&self) -> Result<(), Self::Error> {
        let runtime = self.sequencer.runtime.lock().await;
        let mut publishers = runtime.publishers.lock().expect("publisher lock");
        publishers.entries.remove(&self.session);
        publishers.refresh();
        Ok(())
    }
}

/// Appends once and reconciles a returned ambiguous result; never resubmits the event.
async fn append_once<Storage: SeaStorage>(
    view: &View<Storage>,
    event: Event,
) -> Result<EventPosition, SessionError<Storage::Error>> {
    let tree = match event.blob_tree {
        Some(id) => Some(
            view.blobs()
                .resolve(id)
                .await
                .map_err(SessionError::Storage)?
                .ok_or(SessionError::Rejected("event tree unavailable"))?,
        ),
        None => None,
    };
    let before = view.head().await.map_err(SessionError::Storage)?;
    match view.append(event.payload.clone(), tree.as_ref()).await {
        Ok(handle) => Ok(handle.id()),
        Err(error) if error.kind() == ErrorKind::Ambiguous => {
            let head = view
                .head()
                .await
                .map_err(|_| SessionError::RecoveryRequired)?;
            if let Some(head) = head {
                let mut records = view.read(before, Some(head));
                while let Some(item) = records.next().await {
                    if let MonitoredStreamItem::Item(record) =
                        item.map_err(|_| SessionError::RecoveryRequired)?
                    {
                        if record.event == event {
                            return Ok(record.position);
                        }
                        return Err(SessionError::Corrupt(
                            "unexpected concurrent archive writer",
                        ));
                    }
                }
            }
            Err(SessionError::Rejected("append settled without commitment"))
        }
        Err(error) => Err(SessionError::Storage(error)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_memory::MemoryStorage;

    #[tokio::test]
    async fn announced_membership_orders_departure_on_close_replacement_and_recovery() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let observer = member(&runtime, "observer").await;
        let first = member(&runtime, "first").await;
        let joined = first
            .announce_membership(Bytes::from_static(b"metadata"))
            .await
            .unwrap();
        assert_eq!(
            first
                .announce_membership(Bytes::from_static(b"metadata"))
                .await
                .unwrap(),
            joined
        );
        assert!(first.announce_membership(Bytes::new()).await.is_err());
        let edit = first.submit(submission(b"first")).await.unwrap();
        assert!(joined < edit);
        let mut history = observer.read(None, None);
        assert_eq!(
            data(&mut history).await.unwrap().kind,
            SessionEventKind::Joined
        );
        assert_eq!(
            data(&mut history).await.unwrap().kind,
            SessionEventKind::Application
        );
        first.close().await.unwrap();
        first.close().await.unwrap();
        let departed = data(&mut history).await.unwrap();
        assert_eq!(departed.kind, SessionEventKind::Left);
        assert!(edit < departed.committed.position);

        let second = member(&runtime, "second").await;
        second.announce_membership(Bytes::new()).await.unwrap();
        let replacement = runtime
            .open_session(
                AuthorId::new("second").unwrap(),
                SessionId::new("replacement").unwrap(),
                None,
            )
            .await
            .unwrap();
        assert_eq!(
            data(&mut history).await.unwrap().kind,
            SessionEventKind::Joined
        );
        assert_eq!(
            data(&mut history).await.unwrap().kind,
            SessionEventKind::Left
        );
        assert!(second.submit(submission(b"stale")).await.is_err());
        replacement
            .announce_membership(Bytes::from_static(b"replacement"))
            .await
            .unwrap();
        drop((history, observer, first, second, replacement, runtime));

        let recovered = LocalSequencer::<MemoryStorage>::recover(
            storage.open_view(&id).await.unwrap().unwrap(),
        )
        .await
        .unwrap();
        let observer = member(&recovered, "fresh-observer").await;
        let mut replay = observer.read(None, None);
        let mut kinds = Vec::new();
        for _ in 0..7 {
            kinds.push(data(&mut replay).await.unwrap().kind);
        }
        assert_eq!(
            kinds,
            vec![
                SessionEventKind::Joined,
                SessionEventKind::Application,
                SessionEventKind::Left,
                SessionEventKind::Joined,
                SessionEventKind::Left,
                SessionEventKind::Joined,
                SessionEventKind::Left,
            ]
        );
        assert_eq!(
            observer
                .resolve_submission(&OperationId::new("first").unwrap())
                .await
                .unwrap(),
            Some(edit)
        );
    }

    /// Produces one stable application submission for session tests.
    pub(super) fn submission(value: &'static [u8]) -> EventSubmission {
        EventSubmission {
            operation_id: OperationId::new(Bytes::from_static(value)).unwrap(),
            reference: None,
            event: Event {
                payload: Bytes::from_static(value),
                blob_tree: None,
            },
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn concurrent_sessions_deliver_each_submission_once_with_lazy_errors_and_progress() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = member(&runtime, "first").await;
        let second = member(&runtime, "second").await;
        let mut live = first.read(None, None);
        assert_eq!(live.progress().previous, None);
        assert!(matches!(
            live.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        let mut tasks = Vec::new();
        for index in 0..32 {
            let session = if index % 2 == 0 {
                first.clone()
            } else {
                second.clone()
            };
            tasks.push(tokio::spawn(async move {
                let payload = Bytes::from(index.to_string());
                session
                    .submit(EventSubmission {
                        operation_id: OperationId::new(payload.clone()).unwrap(),
                        reference: None,
                        event: Event {
                            payload,
                            blob_tree: None,
                        },
                    })
                    .await
                    .unwrap()
            }));
        }
        let mut positions = BTreeSet::new();
        for task in tasks {
            positions.insert(task.await.unwrap());
        }
        assert_eq!(positions.len(), 32);
        for expected in &positions {
            let event = data(&mut live).await.unwrap();
            assert_eq!(event.committed.position, *expected);
            assert_eq!(live.progress().previous, Some(*expected));
        }
        assert!(
            matches!(live.next().await, Some(Ok(MonitoredStreamItem::Progress(progress)))
            if progress.status == MonitoredStreamStatus::AwaitingNewItems && progress.previous == progress.latest_known)
        );
        let mut invalid = first.read(None, Some(EventPosition::new(u64::MAX)));
        assert_eq!(
            invalid.progress().status,
            MonitoredStreamStatus::StreamingBacklog
        );
        assert_eq!(
            invalid.next().await.unwrap().unwrap_err().kind(),
            ErrorKind::InvalidPosition
        );
        assert!(invalid.next().await.is_none());
        first.close().await.unwrap();
        second.close().await.unwrap();
        assert!(
            storage.open_view(&id).await.is_err(),
            "runtime, not its membership count, owns the view"
        );
        drop((live, invalid));
        runtime.shutdown().await.unwrap();
        assert!(storage.open_view(&id).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn recovery_rejects_malformed_and_duplicate_submission_envelopes() {
        let storage = MemoryStorage::new();
        let (_, malformed) = storage.create_view().await.unwrap();
        malformed
            .append(Bytes::from_static(b"not a sequencer record"), None)
            .await
            .unwrap();
        assert!(matches!(
            LocalSequencer::<MemoryStorage>::recover(malformed).await,
            Err(SessionError::Corrupt(_))
        ));
        let (_, duplicate) = storage.create_view().await.unwrap();
        let payload = encode_submission::<sea_memory::MemoryStorageError>(
            &AuthorId::new("author").unwrap(),
            &SessionId::new("session").unwrap(),
            &OperationId::new("operation").unwrap(),
            None,
            None,
            b"payload",
        )
        .unwrap();
        duplicate.append(payload.clone(), None).await.unwrap();
        duplicate.append(payload, None).await.unwrap();
        assert!(matches!(
            LocalSequencer::<MemoryStorage>::recover(duplicate).await,
            Err(SessionError::Corrupt(_))
        ));
    }

    /// Opens a named member without imposing backend-specific ownership rules.
    pub(super) async fn member<Storage: SeaStorage + 'static>(
        runtime: &Arc<LocalSequencer<Storage>>,
        name: &'static str,
    ) -> LocalSession<Storage> {
        runtime
            .open_session(
                AuthorId::new(name).unwrap(),
                SessionId::new(name).unwrap(),
                None,
            )
            .await
            .unwrap()
    }

    /// Returns data while allowing an implementation to emit progress first.
    async fn data<Error: std::fmt::Debug>(
        stream: &mut ArchiveStream<SessionCommittedEvent, EventPosition, Error>,
    ) -> Option<SessionCommittedEvent> {
        while let Some(item) = stream.next().await {
            if let MonitoredStreamItem::Item(event) = item.unwrap() {
                return Some(event);
            }
        }
        None
    }

    #[tokio::test]
    async fn session_conformance() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = member(&runtime, "first").await;
        let second = member(&runtime, "second").await;
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            sea_conformance::run_session_conformance(&first, &second),
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn snapshot_parent_position_and_publisher_fences_are_session_policy() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = member(&runtime, "first").await;
        let second = member(&runtime, "second").await;
        let root = first.put_blob(Bytes::new()).await.unwrap();
        let initial = first.submit(submission(b"initial")).await.unwrap();
        let snapshot = Snapshot {
            root: root.clone(),
            at_event: first.resolve_position(initial).await.unwrap().unwrap(),
        };
        assert!(
            first
                .publish_snapshot(None, None, snapshot.clone())
                .await
                .is_err()
        );
        let mut nomination = first
            .coordinate_snapshots(SnapshotParticipation::SeaSelected)
            .await
            .unwrap();
        let fence = nomination.next().await.unwrap().unwrap().fence.unwrap();
        let client = second
            .coordinate_snapshots(SnapshotParticipation::ClientSelected)
            .await
            .unwrap();
        assert!(
            first
                .publish_snapshot(None, Some(fence), snapshot.clone())
                .await
                .is_err()
        );
        drop(client);
        let new_fence = nomination.next().await.unwrap().unwrap().fence.unwrap();
        assert_ne!(fence, new_fence);
        assert!(
            first
                .publish_snapshot(None, Some(fence), snapshot.clone())
                .await
                .is_err()
        );
        first
            .publish_snapshot(None, Some(new_fence), snapshot.clone())
            .await
            .unwrap();
        let next_position = second.submit(submission(b"next")).await.unwrap();
        let next = Snapshot {
            root: root.clone(),
            at_event: second
                .resolve_position(next_position)
                .await
                .unwrap()
                .unwrap(),
        };
        assert!(
            first
                .publish_snapshot(None, Some(new_fence), next.clone())
                .await
                .is_err()
        );
        first
            .publish_snapshot(Some(initial), Some(new_fence), next)
            .await
            .unwrap();
        first
            .publish_snapshot(None, Some(new_fence), snapshot.clone())
            .await
            .unwrap();
        let different = first
            .put_blob(Bytes::from_static(b"different"))
            .await
            .unwrap();
        assert!(
            first
                .publish_snapshot(
                    None,
                    Some(new_fence),
                    Snapshot {
                        root: different,
                        at_event: snapshot.at_event
                    }
                )
                .await
                .is_err()
        );
        assert_registration_replacement(&first, nomination, root, initial, new_fence).await;
    }

    /// Dropping an older stream cannot revoke a newer registration for the same session.
    async fn assert_registration_replacement(
        first: &LocalSession<MemoryStorage>,
        nomination: SessionStream<
            SnapshotCoordination,
            SessionError<sea_memory::MemoryStorageError>,
        >,
        root: sea_memory::MemoryBlobHandle,
        initial: EventPosition,
        new_fence: u64,
    ) {
        let mut replacement = first
            .coordinate_snapshots(SnapshotParticipation::SeaSelected)
            .await
            .unwrap();
        drop(nomination);
        assert!(replacement.next().await.unwrap().unwrap().fence.is_some());
        drop(replacement);
        assert!(
            first
                .publish_snapshot(
                    None,
                    Some(new_fence),
                    Snapshot {
                        root,
                        at_event: first.resolve_position(initial).await.unwrap().unwrap()
                    }
                )
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn closing_the_nominee_transfers_snapshot_authority_with_a_fresh_fence() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = member(&runtime, "first").await;
        let second = member(&runtime, "second").await;
        let mut first_nomination = first
            .coordinate_snapshots(SnapshotParticipation::SeaSelected)
            .await
            .unwrap();
        let first_fence = first_nomination
            .next()
            .await
            .unwrap()
            .unwrap()
            .fence
            .unwrap();
        let mut second_nomination = second
            .coordinate_snapshots(SnapshotParticipation::SeaSelected)
            .await
            .unwrap();
        assert_eq!(second_nomination.next().await.unwrap().unwrap().fence, None);
        assert_eq!(
            first_nomination.next().await.unwrap().unwrap().fence,
            Some(first_fence)
        );

        first.close().await.unwrap();

        assert!(first_nomination.next().await.is_none());
        let second_fence = second_nomination
            .next()
            .await
            .unwrap()
            .unwrap()
            .fence
            .unwrap();
        assert!(second_fence > first_fence);
    }

    #[tokio::test]
    async fn direct_reads_close_with_membership_and_load_policies_preserve_replay() {
        use futures_util::FutureExt;
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = member(&runtime, "first").await;
        let second = member(&runtime, "second").await;
        let mut live = first.load(LoadStart::Beginning).await.unwrap().events;
        assert!(matches!(
            live.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        assert!(live.next().now_or_never().is_none());
        let position = second.submit(submission(b"event")).await.unwrap();
        assert_eq!(data(&mut live).await.unwrap().committed.position, position);
        let authority = second
            .coordinate_snapshots(SnapshotParticipation::ClientSelected)
            .await
            .unwrap();
        let root = second.put_blob(Bytes::new()).await.unwrap();
        second
            .publish_snapshot(
                None,
                None,
                Snapshot {
                    root,
                    at_event: second.resolve_position(position).await.unwrap().unwrap(),
                },
            )
            .await
            .unwrap();
        for policy in [
            LoadStart::LatestSnapshot,
            LoadStart::ReplayAtLeastAllAfter(position),
        ] {
            let loaded = first.load(policy).await.unwrap();
            assert_eq!(loaded.snapshot.unwrap().at_event.id(), position);
            assert_eq!(loaded.events.progress().previous, Some(position));
        }
        let mut beginning = first.load(LoadStart::Beginning).await.unwrap();
        assert!(beginning.snapshot.is_none());
        assert_eq!(
            data(&mut beginning.events)
                .await
                .unwrap()
                .committed
                .position,
            position
        );
        let replacement = runtime
            .open_session(
                AuthorId::new("first").unwrap(),
                SessionId::new("replacement").unwrap(),
                Some(position),
            )
            .await
            .unwrap();
        assert!(live.next().await.is_none());
        assert!(first.submit(submission(b"stale")).await.is_err());
        let mut retained = second.read(Some(position), None);
        assert!(matches!(
            retained.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        replacement.close().await.unwrap();
        second.submit(submission(b"surviving")).await.unwrap();
        assert_eq!(
            data(&mut retained).await.unwrap().committed.event.payload,
            Bytes::from_static(b"surviving")
        );
        runtime.shutdown().await.unwrap();
        assert!(retained.next().await.is_none());
        drop(authority);
    }

    #[tokio::test]
    async fn recovery_restores_submission_and_snapshot_identities_not_active_memberships() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = member(&runtime, "author").await;
        let position = first.submit(submission(b"original")).await.unwrap();
        let mut conflicting = submission(b"original");
        conflicting.event.payload = Bytes::from_static(b"conflict");
        assert!(first.submit(conflicting).await.is_err());
        let authority = first
            .coordinate_snapshots(SnapshotParticipation::ClientSelected)
            .await
            .unwrap();
        let root = first.put_blob(Bytes::new()).await.unwrap();
        first
            .publish_snapshot(
                None,
                None,
                Snapshot {
                    root,
                    at_event: first.resolve_position(position).await.unwrap().unwrap(),
                },
            )
            .await
            .unwrap();
        runtime.shutdown().await.unwrap();
        drop((first, authority, runtime));
        let recovered = LocalSequencer::<MemoryStorage>::recover(
            storage.open_view(&id).await.unwrap().unwrap(),
        )
        .await
        .unwrap();
        assert!(
            recovered
                .open_session(
                    AuthorId::new("author").unwrap(),
                    SessionId::new("author").unwrap(),
                    None
                )
                .await
                .is_err()
        );
        let reconnected = recovered
            .open_session(
                AuthorId::new("author").unwrap(),
                SessionId::new("new-session").unwrap(),
                Some(position),
            )
            .await
            .unwrap();
        assert_eq!(
            reconnected.submit(submission(b"original")).await.unwrap(),
            position
        );
        assert_eq!(
            reconnected
                .get_snapshot(LoadStart::LatestSnapshot)
                .await
                .unwrap()
                .unwrap()
                .at_event
                .id(),
            position
        );
        assert_eq!(
            reconnected
                .resolve_submission(&OperationId::new("original").unwrap())
                .await
                .unwrap(),
            Some(position)
        );
        let foreign = member(&recovered, "foreign").await;
        assert!(foreign.submit(submission(b"original")).await.is_err());
        let mut absent = submission(b"invalid");
        absent.reference = Some(EventPosition::new(999));
        assert!(foreign.submit(absent).await.is_err());
    }

    #[tokio::test]
    async fn two_sessions_share_one_view_and_close_independently() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let sequencer = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = sequencer
            .open_session(
                AuthorId::new("first").unwrap(),
                SessionId::new("first").unwrap(),
                None,
            )
            .await
            .unwrap();
        let second = sequencer
            .open_session(
                AuthorId::new("second").unwrap(),
                SessionId::new("second").unwrap(),
                None,
            )
            .await
            .unwrap();
        assert!(storage.open_view(&id).await.is_err());
        let first_position = first.submit(submission(b"one")).await.unwrap();
        first.clone().close().await.unwrap();
        assert!(first.submit(submission(b"closed")).await.is_err());
        let second_position = second.submit(submission(b"two")).await.unwrap();
        assert!(first_position < second_position);
        assert_eq!(
            second.submit(submission(b"two")).await.unwrap(),
            second_position
        );
        sequencer.shutdown().await.unwrap();
        assert!(second.submit(submission(b"after shutdown")).await.is_err());
        assert!(storage.open_view(&id).await.unwrap().is_some());
    }
}
