//! Multi-user session runtime over one exclusively owned document view.
//!
//! [`crate::session::LocalSequencer`] recovers committed positions and used session identities, then
//! multiplexes the view into [`crate::session::LocalSession`] memberships. Memberships are
//! runtime-local: reopening restores stable committed identities, closes outstanding durable
//! announcements, and requires callers to establish fresh sessions.
//!
//! A bounded application ring separates admission from persistence; lifecycle barriers drain it.
//! One runtime mutex serializes membership changes and committed metadata. The runtime retains
//! owned backend futures, so cancellation of a caller does not
//! masquerade as settlement. A later operation drives the same future to completion; a failed
//! bounded reconciliation poisons further mutation with
//! [`crate::session::SessionError::RecoveryRequired`] until the view is discarded and recovered.
//!
//! Default event delivery uses the view's monitored archive streams directly.
//! Explicit cache-enabled openings use shared, revocable live delivery after storage replay.
//! Snapshot publisher
//! registration is separate synchronous state: dropping a coordination stream revokes its lease,
//! client-selected publishers suppress Sea nomination, and every nomination change receives a new
//! fence.

#[cfg(test)]
#[path = "fault_tests.rs"]
mod fault_tests;

#[path = "pipeline.rs"]
mod pipeline;

#[path = "checkpoint.rs"]
mod checkpoint;

#[path = "live_cache.rs"]
mod live_cache;
#[path = "live_read.rs"]
mod live_read;
#[path = "storage_read.rs"]
mod storage_read;

pub use live_cache::{LiveCacheStats, LiveReadRevocation};

use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{StreamExt, stream};
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, CommittedEvent, ErrorKind,
    Event, EventPosition, MonitoredStreamItem,
    archive::{
        EventSubmission, SessionCommittedEvent, SessionEventKind, SessionId, SessionStream,
        SnapshotParticipation,
    },
    session::{
        SeaArchive, SeaAuthorSession, SeaSnapshotCoordinator, SessionLoad, SnapshotCoordination,
    },
    storage::{
        ArchiveStream, BlobStore, LoadStart, ReferenceableStore, SeaStorage, SeaView, Snapshot,
        StorageHandle,
    },
};
use tokio::sync::{Mutex, RwLockWriteGuard, watch};

use crate::codec::{decode_committed, encode_membership, encode_submission};
pub use crate::error::SessionError;

/// An experimental live stream paired with its subscription-only revocation capability.
pub type RevocableLiveRead<E> = (
    ArchiveStream<SessionCommittedEvent, EventPosition, SessionError<E>>,
    LiveReadRevocation,
);

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
    /// Latest acknowledged application position.
    reference: Option<EventPosition>,
    /// Closing or replacing this membership ends its live streams.
    closed: watch::Sender<bool>,
    /// Cancellation or failure revokes append authority before asynchronous settlement.
    failed: Arc<std::sync::atomic::AtomicBool>,
}

/// Marks an admitted append terminal if its caller exits without a successful result.
struct AppendGuard(Option<Arc<std::sync::atomic::AtomicBool>>);

impl AppendGuard {
    /// Successful settlement leaves the session eligible for later submissions.
    fn disarm(&mut self) {
        self.0 = None;
    }
}

impl Drop for AppendGuard {
    fn drop(&mut self) {
        if let Some(failed) = &self.0 {
            failed.store(true, std::sync::atomic::Ordering::SeqCst);
        }
    }
}

/// One in-flight mutation and its replayable application input.
struct Pending<Error> {
    /// Owned backend work; never dropped merely because its requesting future was dropped.
    future: MutationFuture<Error>,
    /// Encoded event used to rebuild authoritative state after settlement.
    event: Option<Event>,
}

/// Recent positions required only by the live 1024-entry policy and its 64-entry debounce.
const POSITION_WINDOW: usize = 1088;

/// Authoritative mutable session state serialized across all clients.
struct Runtime<Storage: SeaStorage> {
    /// Optional delivery ownership, independent of sequencing and durable reference floors.
    live_cache: Option<Arc<live_cache::LiveCache<Storage::Error>>>,
    /// Removed only by explicit shutdown after pending work settles.
    view: Option<Arc<View<Storage>>>,
    /// Active session memberships, not persisted as application events.
    members: BTreeMap<SessionId, Membership>,
    /// Persisted announcements whose departure has not committed, including recovered sessions.
    announced: BTreeMap<SessionId, SessionCommittedEvent>,
    /// Bounded recent event positions for live floor policy; reset after recovery ends old sessions.
    positions: BTreeSet<EventPosition>,
    /// Last event incorporated into durable sequencer state, independent of the live policy window.
    applied_through: Option<EventPosition>,
    /// Applied records since the last successful internal publication.
    since_checkpoint: usize,
    /// Highest durably reserved session ID, including unused IDs that recovery must skip.
    session_id_reserved_through: u64,
    /// Next unexposed identity in the current reservation; `None` denotes exhaustion.
    next_session: Option<u64>,
    /// Durable document-wide admission floor restored from ordered committed metadata.
    minimum_reference: Option<EventPosition>,
    /// At most one outstanding mutation owns backend execution.
    pending: Option<Pending<Storage::Error>>,
    /// A failed reconciliation prevents mutation or a false terminal departure.
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
    /// Adds independent readiness only for experimental readers; default control futures are unchanged.
    fn retain_control(
        &self,
        future: MutationFuture<Storage::Error>,
    ) -> MutationFuture<Storage::Error> {
        if let Some(cache) = &self.live_cache {
            live_cache::notify_control(cache, future)
        } else {
            future
        }
    }

    /// Validates against the frozen committed floor; only the final candidate may advance it.
    async fn prepare_submission(
        &mut self,
        session: &SessionId,
        submission: &EventSubmission,
        floor: Option<EventPosition>,
        advance_floor: bool,
    ) -> Result<Event, SessionError<Storage::Error>> {
        self.member(session)?;
        self.view()?;
        if !self.known_reference(submission.reference).await? {
            return Err(SessionError::Rejected(
                "reference is not an application event",
            ));
        }
        if submission.reference < floor {
            return Err(SessionError::Rejected(
                "reference precedes the committed minimum",
            ));
        }
        let minimum = self
            .members
            .iter()
            .map(|(identity, member)| {
                if identity == session {
                    submission.reference
                } else {
                    member.reference
                }
            })
            .min()
            .flatten();
        let minimum = if advance_floor {
            self.proposed_minimum(minimum, submission.reference)
                .max(floor)
        } else {
            floor
        };
        Ok(Event {
            payload: encode_submission(
                session,
                submission.reference,
                minimum,
                &submission.event.payload,
            )?,
            blob_tree: submission.event.blob_tree,
        })
    }

    /// Checks historical references through storage instead of retaining all archive positions.
    async fn known_reference(
        &mut self,
        reference: Option<EventPosition>,
    ) -> Result<bool, SessionError<Storage::Error>> {
        let Some(position) = reference else {
            return Ok(true);
        };
        if Some(position) > self.applied_through {
            return Ok(false);
        }
        if self.positions.contains(&position) {
            return Ok(true);
        }
        Ok(self
            .view()?
            .resolve_position(position)
            .await
            .map_err(SessionError::Storage)?
            .is_some())
    }

    /// Publishes an exact applied prefix before admitting work beyond the bounded tail policy.
    async fn checkpoint_if_due(&mut self) -> Result<(), SessionError<Storage::Error>> {
        if self.since_checkpoint < checkpoint::INTERVAL {
            return Ok(());
        }
        self.publish_checkpoint().await
    }

    /// Invalidates mutation during publication so cancellation cannot silently extend the tail.
    async fn publish_checkpoint(&mut self) -> Result<(), SessionError<Storage::Error>> {
        if self.recovery_required {
            return Err(SessionError::RecoveryRequired);
        }
        let checkpoint = checkpoint::Checkpoint {
            session_id_reserved_through: self.session_id_reserved_through,
            minimum_reference: self.minimum_reference,
            applied_through: self.applied_through,
            announced: self.announced.clone(),
        }
        .encode()?;
        let view = self.view()?;
        self.recovery_required = true;
        let mut cache_guard = live_cache::RecoveryGuard(self.live_cache.clone());
        view.publish_checkpoint(checkpoint)
            .await
            .map_err(SessionError::Storage)?;
        self.since_checkpoint = 0;
        self.recovery_required = false;
        cache_guard.0 = None;
        Ok(())
    }

    /// Chooses an advance without coupling admission enforcement to membership progress.
    /// A 1024-entry lag window prevents idle readers from pinning the floor indefinitely.
    /// Window advances require 64 committed entries beyond the floor, independent of position encoding.
    fn proposed_minimum(
        &self,
        cooperative: Option<EventPosition>,
        reference: Option<EventPosition>,
    ) -> Option<EventPosition> {
        let window = self
            .positions
            .iter()
            .rev()
            .nth(1023)
            .copied()
            .filter(|candidate| {
                self.positions
                    .range(..=*candidate)
                    .filter(|position| Some(**position) > self.minimum_reference)
                    .take(64)
                    .count()
                    == 64
            });
        self.minimum_reference
            .max(cooperative.max(window).min(reference))
    }

    /// Records settled events and validates reference floors and membership transitions.
    fn apply(&mut self, record: &CommittedEvent) -> Result<(), SessionError<Storage::Error>> {
        let committed = decode_committed(record)?;
        if committed.minimum_reference < self.minimum_reference
            || committed.minimum_reference > committed.reference
            || committed.minimum_reference > self.applied_through
            || (committed.kind == SessionEventKind::Application
                && committed.reference < self.minimum_reference)
        {
            return Err(SessionError::Corrupt("invalid minimum reference floor"));
        }
        if committed.reference > self.applied_through {
            return Err(SessionError::Corrupt("reference is not a preceding event"));
        }
        if committed.session_id.get() > self.session_id_reserved_through {
            return Err(SessionError::Corrupt(
                "session exceeds persisted reservation",
            ));
        }
        if committed.kind == SessionEventKind::Application
            && let Some(member) = self.members.get_mut(&committed.session_id)
        {
            member.reference = committed.reference;
        }
        self.positions.insert(record.position);
        self.applied_through = Some(record.position);
        while self.positions.len() > POSITION_WINDOW {
            self.positions.pop_first();
        }
        self.since_checkpoint += 1;
        self.minimum_reference = committed.minimum_reference;
        match committed.kind {
            SessionEventKind::Application => {}
            SessionEventKind::Joined => {
                if self
                    .announced
                    .insert(committed.session_id.clone(), committed.clone())
                    .is_some()
                {
                    return Err(SessionError::Corrupt("duplicate membership announcement"));
                }
            }
            SessionEventKind::Left => {
                self.announced
                    .remove(&committed.session_id)
                    .ok_or(SessionError::Corrupt("departure without announcement"))?;
                self.remove_member(&committed.session_id);
            }
        }
        if let Some(cache) = &self.live_cache {
            cache.publish(&committed);
        }
        Ok(())
    }

    /// Closes live streams and publisher authority after ordered departure settles.
    fn remove_member(&mut self, session: &SessionId) {
        if let Some(cache) = &self.live_cache {
            cache.close_session(session);
        }
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
        session: &SessionId,
        kind: SessionEventKind,
        metadata: &[u8],
    ) -> Result<EventPosition, SessionError<Storage::Error>> {
        self.checkpoint_if_due().await?;
        let reference = self.applied_through;
        let minimum = self
            .members
            .iter()
            .filter(|(identity, _)| kind != SessionEventKind::Left || *identity != session)
            .map(|(_, member)| member.reference)
            .min()
            .unwrap_or(reference);
        let minimum = self.proposed_minimum(minimum, reference);
        let event = Event {
            payload: encode_membership(session, kind, reference, minimum, metadata)?,
            blob_tree: None,
        };
        let view = self.view()?;
        let input = event.clone();
        self.pending = Some(Pending {
            event: Some(event),
            future: self.retain_control(Box::pin(async move {
                append_once::<Storage>(&view, input).await
            })),
        });
        if let Some(cache) = &self.live_cache {
            cache.notify();
        }
        self.settle_pending().await?;
        Ok(self.applied_through.expect("settled membership position"))
    }

    /// Commits an announced departure before ending authority; unannounced sessions add no event.
    async fn close_member(
        &mut self,
        session: &SessionId,
    ) -> Result<(), SessionError<Storage::Error>> {
        self.remove_member(session);
        if self.announced.contains_key(session)
            && let Err(error) = self
                .append_membership(session, SessionEventKind::Left, &[])
                .await
        {
            self.recovery_required = true;
            if let Some(cache) = &self.live_cache {
                cache.terminate(live_cache::Terminal::RecoveryRequired);
            }
            return Err(error);
        }
        Ok(())
    }

    /// Drives a retained mutation to settlement before allowing another state-dependent operation.
    async fn settle(&mut self) -> Result<(), SessionError<Storage::Error>> {
        let result = self.settle_pending().await;
        if self.recovery_required {
            return result;
        }
        let failed = self
            .members
            .iter()
            .filter(|(_, member)| member.failed.load(std::sync::atomic::Ordering::SeqCst))
            .map(|(session, _)| session.clone())
            .collect::<Vec<_>>();
        for session in failed {
            self.close_member(&session).await?;
        }
        result
    }

    /// Settles only backend work; callers drain failed memberships before admitting new work.
    async fn settle_pending(&mut self) -> Result<(), SessionError<Storage::Error>> {
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
                if let Some(cache) = &self.live_cache {
                    cache.terminate(live_cache::Terminal::RecoveryRequired);
                }
            }
            let position = result?;
            if let Some(event) = pending.event {
                if let Err(error) = self.apply(&CommittedEvent { position, event }) {
                    self.recovery_required = true;
                    if let Some(cache) = &self.live_cache {
                        cache.terminate(live_cache::Terminal::RecoveryRequired);
                    }
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
        self.members
            .get(session)
            .filter(|member| !member.failed.load(std::sync::atomic::Ordering::SeqCst))
            .ok_or(SessionError::Closed)
    }
}

/// One runtime multiplexing an exclusively owned view into logical sessions.
pub struct LocalSequencer<Storage: SeaStorage> {
    /// Explicit experiment activation; all unbounded reads use this single registry.
    live_cache: Option<Arc<live_cache::LiveCache<Storage::Error>>>,
    /// Keeps independent backend invalidation registered for the opening lifetime.
    _invalidation: Option<sea_core::storage::InvalidationRegistration>,
    /// The sole owner of mutation sequencing and session membership.
    runtime: Arc<Mutex<Runtime<Storage>>>,
    /// Bounded admission, retained persistence work, and lifecycle exclusion.
    pipeline: pipeline::Pipeline<Storage>,
}

impl<Storage: SeaStorage + 'static> LocalSequencer<Storage> {
    /// Allocates a document-scoped numeric identity only after persisting its reservation.
    ///
    /// # Errors
    /// Rejects invalid references, exhausted identities, or unavailable checkpoint publication.
    ///
    /// # Panics
    /// Panics if an internal allocation invariant or a publisher-state lock is violated.
    pub async fn open_session(
        self: &Arc<Self>,
        reference: Option<EventPosition>,
    ) -> Result<LocalSession<Storage>, SessionError<Storage::Error>> {
        let _barrier = self.barrier().await;
        let mut runtime = self.runtime.lock().await;
        runtime.settle().await?;
        if !runtime.known_reference(reference).await? {
            return Err(SessionError::Rejected("invalid session reference"));
        }
        let ordinal = runtime
            .next_session
            .ok_or(SessionError::Rejected("session identity exhausted"))?;
        if ordinal > runtime.session_id_reserved_through {
            runtime.session_id_reserved_through = ordinal.saturating_add(255);
            runtime.publish_checkpoint().await?;
        }
        runtime.next_session = ordinal.checked_add(1);
        let session = SessionId::new(ordinal).expect("allocated identity is nonzero");
        let (closed, _) = watch::channel(false);
        runtime.members.insert(
            session.clone(),
            Membership {
                reference,
                closed,
                failed: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            },
        );
        Ok(LocalSession {
            sequencer: self.clone(),
            session,
            admission: Arc::new(Mutex::new(())),
        })
    }

    /// Excludes admission and settles every accepted application before lifecycle work.
    async fn barrier(&self) -> RwLockWriteGuard<'_, ()> {
        let guard = self.pipeline.gate.write().await;
        self.pipeline.drain(&self.runtime).await;
        guard
    }

    /// Recovers stable event identities by scanning a bounded committed history.
    /// Active membership is runtime-local; recovery requires fresh logical sessions.
    ///
    /// # Errors
    /// Returns backend failures, malformed records, or invalid membership transitions.
    /// # Panics
    /// Panics if an internal publisher-state lock was poisoned.
    pub async fn recover(view: View<Storage>) -> Result<Arc<Self>, SessionError<Storage::Error>> {
        Self::recover_inner(view, false).await
    }

    /// Recovers with the experimental shared live-read cache enabled for every unbounded read.
    ///
    /// Retention is unbounded until slow subscriptions are dropped or explicitly revoked.
    /// Finite reads and historical replay remain storage-backed. Unsupported independent
    /// backend invalidation is rejected rather than silently weakening terminal behavior.
    ///
    /// # Errors
    /// Returns recovery failures or rejects backends without independent invalidation support.
    /// # Panics
    /// Panics if an internal state lock is poisoned.
    pub async fn recover_with_live_cache(
        view: View<Storage>,
    ) -> Result<Arc<Self>, SessionError<Storage::Error>> {
        Self::recover_inner(view, true).await
    }

    /// Reports cache-owned allocations only; default openings return `None`.
    ///
    /// # Panics
    /// Panics if the cache state lock is poisoned.
    pub fn live_cache_stats(&self) -> Option<LiveCacheStats> {
        self.live_cache.as_ref().map(|cache| cache.stats())
    }

    /// Issues neutral revocation capabilities for every current live subscription.
    /// Historical subscriptions are included, but do not retain cache entries.
    ///
    /// # Panics
    /// Panics if the cache state lock is poisoned.
    pub fn live_read_revocations(&self) -> Vec<LiveReadRevocation> {
        self.live_cache
            .as_ref()
            .map_or_else(Vec::new, live_cache::LiveCache::revocations)
    }

    /// Shares authoritative recovery while preserving cache-disabled construction.
    async fn recover_inner(
        view: View<Storage>,
        enabled: bool,
    ) -> Result<Arc<Self>, SessionError<Storage::Error>> {
        let view = Arc::new(view);
        let live_cache = enabled.then(|| live_cache::LiveCache::new(None));
        let invalidation = if let Some(cache) = &live_cache {
            let weak = Arc::downgrade(cache);
            Some(
                view.observe_invalidation(Arc::new(move |error| {
                    if let Some(cache) = weak.upgrade() {
                        cache.terminate(live_cache::Terminal::Storage(error));
                    }
                }))
                .ok_or(SessionError::Rejected(
                    "backend does not support independent invalidation",
                ))?,
            )
        } else {
            None
        };
        if let Some(cache) = &live_cache {
            cache.recovered(None)?;
        }
        let recovered = view
            .checkpoint()
            .await
            .map_err(SessionError::Storage)?
            .map(checkpoint::Checkpoint::decode)
            .transpose()?
            .unwrap_or_default();
        let after = recovered.applied_through;
        let mut runtime = Runtime {
            live_cache: None,
            minimum_reference: recovered.minimum_reference,
            view: Some(view.clone()),
            members: BTreeMap::new(),
            announced: recovered.announced,
            positions: BTreeSet::new(),
            applied_through: after,
            since_checkpoint: 0,
            session_id_reserved_through: recovered.session_id_reserved_through,
            next_session: recovered.session_id_reserved_through.checked_add(1),
            pending: None,
            recovery_required: false,
            publishers: Arc::new(std::sync::Mutex::new(Publishers::default())),
        };
        let head = view.head().await.map_err(SessionError::Storage)?;
        if after > head {
            return Err(SessionError::Corrupt("checkpoint exceeds archive head"));
        }
        if let Some(head) = head {
            let mut records = view.read(after, Some(head));
            while let Some(item) = records.next().await {
                if let MonitoredStreamItem::Item(record) = item.map_err(SessionError::Storage)? {
                    let event = decode_committed(&record)?;
                    if !runtime.known_reference(event.reference).await?
                        || !runtime.known_reference(event.minimum_reference).await?
                    {
                        return Err(SessionError::Corrupt("invalid recovered reference"));
                    }
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
        runtime.positions.clear();
        if let Some(cache) = &live_cache {
            cache.recovered(runtime.applied_through)?;
        }
        runtime.live_cache = live_cache.clone();
        Ok(Arc::new(Self {
            live_cache,
            _invalidation: invalidation,
            runtime: Arc::new(Mutex::new(runtime)),
            pipeline: pipeline::Pipeline::new(),
        }))
    }

    /// Settles retained backend work, closes every session, and releases the owned view.
    /// Backend-dependent resources retained by independent streams may still prevent reopening.
    ///
    /// # Errors
    /// Returns a pending mutation failure or an unresolved outcome requiring recovery.
    /// # Panics
    /// Panics if an internal publisher-state lock was poisoned.
    pub async fn shutdown(&self) -> Result<(), SessionError<Storage::Error>> {
        let _barrier = self.barrier().await;
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
        if let Some(cache) = &self.live_cache {
            cache.terminate(live_cache::Terminal::Closed);
        }
        Ok(())
    }
}

/// Cloneable membership in one shared runtime; close affects only this membership.
pub struct LocalSession<Storage: SeaStorage> {
    /// Shared sequencing owner, not independent storage authority.
    sequencer: Arc<LocalSequencer<Storage>>,

    /// Unique connection identity for this membership.
    session: SessionId,
    /// Orders this membership's submissions through capacity waits, but not completion.
    admission: Arc<Mutex<()>>,
}

impl<Storage: SeaStorage> Clone for LocalSession<Storage> {
    fn clone(&self) -> Self {
        Self {
            sequencer: self.sequencer.clone(),

            session: self.session.clone(),
            admission: self.admission.clone(),
        }
    }
}

impl<Storage: SeaStorage + 'static> LocalSession<Storage> {
    /// Creates an experimental live read together with its subscription-only revoke capability.
    /// Ordinary unbounded `read` and `load` use the same registry and revocation contract.
    ///
    /// # Errors
    /// Rejects cache-disabled openings. Read initialization failures remain stream items.
    /// # Panics
    /// Panics if a cache lock is poisoned or subscription identities are exhausted.
    pub fn read_with_live_cache_revocation(
        &self,
        after: Option<EventPosition>,
    ) -> Result<RevocableLiveRead<Storage::Error>, SessionError<Storage::Error>> {
        let cache = self
            .sequencer
            .live_cache
            .as_ref()
            .ok_or(SessionError::Rejected("live cache is disabled"))?;
        Ok(live_read::read(self.clone(), cache, after))
    }

    /// Returns this membership's stable identity, including allocated numeric identities.
    #[must_use]
    pub fn session_id(&self) -> &SessionId {
        &self.session
    }

    /// Publishes this membership once in archive order, retaining opaque application metadata.
    /// Close and recovery publish an ordered departure.
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
        let _barrier = self.sequencer.barrier().await;
        let mut runtime = self.sequencer.runtime.lock().await;
        runtime.settle().await?;
        let mut guard = AppendGuard(Some(runtime.member(&self.session)?.failed.clone()));
        let result = self.announce_inner(&mut runtime, metadata).await;
        if result.is_ok() {
            guard.0 = None;
        }
        drop(guard);
        if result.is_err() && !runtime.recovery_required {
            runtime.close_member(&self.session).await?;
        }
        result
    }

    /// Sequences announcement under the same fail-stop authority as application appends.
    async fn announce_inner(
        &self,
        runtime: &mut Runtime<Storage>,
        metadata: Bytes,
    ) -> Result<EventPosition, SessionError<Storage::Error>> {
        if let Some(announced) = runtime.announced.get(&self.session) {
            return if announced.committed.event.payload == metadata {
                Ok(announced.committed.position)
            } else {
                Err(SessionError::Rejected("membership metadata cannot change"))
            };
        }
        runtime
            .append_membership(&self.session, SessionEventKind::Joined, &metadata)
            .await
    }

    /// Submits once; failure or cancellation ends this session's accepted prefix.
    async fn submit(
        &self,
        submission: EventSubmission,
    ) -> Result<EventPosition, SessionError<Storage::Error>> {
        #[cfg(not(target_arch = "wasm32"))]
        let admission = tokio::task::unconstrained(self.admission.lock()).await;
        #[cfg(target_arch = "wasm32")]
        let admission = self.admission.lock().await;
        let needs_settlement = {
            let runtime = self.sequencer.runtime.lock().await;
            runtime.pending.is_some()
                || runtime
                    .members
                    .values()
                    .any(|member| member.failed.load(std::sync::atomic::Ordering::SeqCst))
        };
        if needs_settlement {
            let _barrier = self.sequencer.barrier().await;
            self.sequencer.runtime.lock().await.settle().await?;
        }
        let result = self
            .sequencer
            .pipeline
            .submit(
                &self.sequencer.runtime,
                admission,
                self.session.clone(),
                submission,
            )
            .await;
        if result.is_err() {
            let _barrier = self.sequencer.barrier().await;
            let mut runtime = self.sequencer.runtime.lock().await;
            if !runtime.recovery_required {
                runtime.settle().await?;
            }
        }
        result
    }

    /// Closes this membership idempotently without closing the shared runtime.
    async fn close(&self) -> Result<(), SessionError<Storage::Error>> {
        let _barrier = self.sequencer.barrier().await;
        let mut runtime = self.sequencer.runtime.lock().await;
        if !runtime.members.contains_key(&self.session)
            && !runtime.announced.contains_key(&self.session)
        {
            return Ok(());
        }
        runtime.settle().await?;
        runtime.close_member(&self.session).await
    }

    /// Obtains a view only after validating current membership and settling prior work.
    async fn view(&self) -> Result<Arc<View<Storage>>, SessionError<Storage::Error>> {
        let _barrier = self.sequencer.barrier().await;
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
        if stop_after.is_none()
            && let Some(cache) = &self.sequencer.live_cache
        {
            return live_read::read(self.clone(), cache, after).0;
        }
        storage_read::read(self.clone(), after, stop_after)
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
        let _barrier = self.sequencer.barrier().await;
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
        let _barrier = self.sequencer.barrier().await;
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
        if !runtime.known_reference(Some(position)).await? {
            return Err(SessionError::Rejected(
                "snapshot boundary is not a committed session event",
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
            future: runtime.retain_control(Box::pin(async move {
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
            })),
        });
        if let Some(cache) = &runtime.live_cache {
            cache.notify();
        }
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
    use sea_core::MonitoredStreamStatus;
    use sea_memory::MemoryStorage;

    #[tokio::test]
    async fn committed_minimum_survives_new_members_and_recovery() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = member(&runtime, "first").await;
        first.announce_membership(Bytes::new()).await.unwrap();
        let initial = first.submit(submission(b"initial")).await.unwrap();
        let mut advancing = submission(b"advance");
        advancing.reference = Some(initial);
        let advanced = first.submit(advancing).await.unwrap();
        let mut history = first.read(Some(initial), Some(advanced));
        assert_eq!(
            data(&mut history).await.unwrap().minimum_reference,
            Some(initial)
        );
        drop(history);
        first.close().await.unwrap();
        let stale = member(&runtime, "stale").await;
        stale.announce_membership(Bytes::new()).await.unwrap();
        assert!(
            stale
                .submit(submission(b"missing-reference"))
                .await
                .is_err()
        );
        assert!(matches!(
            stale.submit(submission(b"queued")).await,
            Err(SessionError::Closed)
        ));
        drop((stale, first, runtime));
        let recovered = LocalSequencer::<MemoryStorage>::recover(
            storage.open_view(&id).await.unwrap().unwrap(),
        )
        .await
        .unwrap();
        let fresh = member(&recovered, "fresh").await;
        let mut below = submission(b"below-floor");
        below.reference = Some(initial);
        assert!(fresh.submit(below).await.is_err());
        let valid = recovered.open_session(None).await.unwrap();
        let observer = member(&recovered, "observer").await;
        let mut replay = observer.read(None, None);
        let mut minimum = None;
        for _ in 0..6 {
            let event = data(&mut replay).await.unwrap();
            assert!(event.minimum_reference >= minimum);
            minimum = event.minimum_reference;
        }
        assert!(minimum >= Some(advanced));
        drop(replay);
        let mut current = submission(b"current-context");
        current.reference = minimum;
        valid.submit(current).await.unwrap();
    }

    #[tokio::test]
    async fn floor_debounce_counts_events_not_numeric_position_units() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let sequencer = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let mut runtime = sequencer.runtime.lock().await;
        for ordinal in 1..=1152_u64 {
            let position = EventPosition::new(8 + ordinal * ordinal * 4099);
            runtime.positions.insert(position);
            while runtime.positions.len() > POSITION_WINDOW {
                runtime.positions.pop_first();
            }
            runtime.minimum_reference = runtime.proposed_minimum(None, Some(position));
            let expected_ordinal = ordinal.saturating_sub(1023) / 64 * 64;
            let expected = (expected_ordinal != 0)
                .then(|| EventPosition::new(8 + expected_ordinal * expected_ordinal * 4099));
            assert_eq!(runtime.minimum_reference, expected);
        }
    }

    #[tokio::test]
    async fn idle_members_cannot_pin_the_debounced_reference_window() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let idle = member(&runtime, "idle").await;
        let writer = member(&runtime, "writer").await;
        let mut reference = None;
        let mut advances = Vec::new();
        for _ in 0..1152 {
            reference = Some(
                writer
                    .submit(EventSubmission {
                        reference,
                        event: Event {
                            payload: Bytes::new(),
                            blob_tree: None,
                        },
                    })
                    .await
                    .unwrap(),
            );
            let floor = runtime.runtime.lock().await.minimum_reference;
            if advances.last().copied().flatten() != floor {
                advances.push(floor);
            }
        }
        assert_eq!(
            advances,
            vec![Some(EventPosition::new(64)), Some(EventPosition::new(128))]
        );
        assert!(idle.submit(submission(b"too-old")).await.is_err());
    }

    #[tokio::test]
    async fn snapshot_boundary_retains_its_floor_after_recovery() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let writer = member(&runtime, "writer").await;
        let participation = writer
            .coordinate_snapshots(SnapshotParticipation::ClientSelected)
            .await
            .unwrap();
        let initial = writer.submit(submission(b"initial")).await.unwrap();
        let mut advancing = submission(b"advance");
        advancing.reference = Some(initial);
        let advanced = writer.submit(advancing).await.unwrap();
        let root = writer
            .put_blob(Bytes::from_static(b"snapshot"))
            .await
            .unwrap();
        writer
            .publish_snapshot(
                None,
                None,
                Snapshot {
                    root,
                    at_event: writer.resolve_position(advanced).await.unwrap().unwrap(),
                },
            )
            .await
            .unwrap();
        drop((participation, writer, runtime));
        let recovered = LocalSequencer::<MemoryStorage>::recover(
            storage.open_view(&id).await.unwrap().unwrap(),
        )
        .await
        .unwrap();
        let reader = member(&recovered, "reader").await;
        let loaded = reader.load(LoadStart::LatestSnapshot).await.unwrap();
        let boundary = loaded.snapshot.unwrap().at_event.id();
        assert_eq!(boundary, advanced);
        let mut event = reader.read(Some(initial), Some(boundary));
        assert_eq!(
            data(&mut event).await.unwrap().minimum_reference,
            Some(initial)
        );
        assert_eq!(
            recovered.runtime.lock().await.minimum_reference,
            Some(initial)
        );
    }

    #[tokio::test]
    async fn announced_membership_orders_departure_on_close_and_recovery() {
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
        assert!(first.announce_membership(Bytes::new()).await.is_err());
        assert!(matches!(
            first.submit(submission(b"after-conflict")).await,
            Err(SessionError::Closed)
        ));
        first.close().await.unwrap();
        first.close().await.unwrap();
        let departed = data(&mut history).await.unwrap();
        assert_eq!(departed.kind, SessionEventKind::Left);
        assert!(edit < departed.committed.position);

        let second = member(&runtime, "second").await;
        second.announce_membership(Bytes::new()).await.unwrap();
        let replacement = runtime.open_session(None).await.unwrap();
        assert_eq!(
            data(&mut history).await.unwrap().kind,
            SessionEventKind::Joined
        );
        assert!(
            runtime
                .runtime
                .lock()
                .await
                .members
                .contains_key(&second.session)
        );
        second.close().await.unwrap();
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
        let mut application = observer.read(None, Some(edit));
        data(&mut application).await.unwrap();
        assert_eq!(
            data(&mut application).await.unwrap().committed.position,
            edit
        );
    }

    #[tokio::test]
    async fn internal_checkpoints_recover_bounded_tail_and_outstanding_departures() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let writer = member(&runtime, "checkpoint-writer").await;
        writer
            .announce_membership(Bytes::from_static(b"writer"))
            .await
            .unwrap();
        let mut reference = None;
        for _ in 0..1400 {
            let mut event = submission(b"event");
            event.reference = reference;
            reference = Some(writer.submit(event).await.unwrap());
        }
        let late = member(&runtime, "tail-announcement").await;
        late.announce_membership(Bytes::new()).await.unwrap();
        let unannounced = member(&runtime, "unannounced").await;
        let (boundary, floor, head) = {
            let state = runtime.runtime.lock().await;
            assert_eq!(state.positions.len(), POSITION_WINDOW);
            let view = state.view().unwrap();
            let checkpoint =
                checkpoint::Checkpoint::decode::<()>(view.checkpoint().await.unwrap().unwrap())
                    .unwrap();
            assert!(
                view.get_snapshot(LoadStart::LatestSnapshot)
                    .await
                    .unwrap()
                    .is_none()
            );
            (
                checkpoint.applied_through.unwrap(),
                state.minimum_reference,
                state.positions.last().copied().unwrap(),
            )
        };
        assert!(head.get() - boundary.get() < 2 * checkpoint::INTERVAL as u64);
        drop((writer, late, unannounced, runtime));
        let recovered = LocalSequencer::<MemoryStorage>::recover(
            storage.open_view(&id).await.unwrap().unwrap(),
        )
        .await
        .unwrap();
        {
            let state = recovered.runtime.lock().await;
            assert!(state.announced.is_empty());
            assert!(state.positions.is_empty());
            assert!(state.applied_through > Some(head));
            assert!(state.minimum_reference >= floor);
            assert!(state.since_checkpoint <= 2 * checkpoint::INTERVAL);
        }
        let reader = member(&recovered, "checkpoint-reader").await;
        let mut departures = reader.read(Some(head), Some(EventPosition::new(head.get() + 2)));
        for _ in 0..2 {
            assert_eq!(
                data(&mut departures).await.unwrap().kind,
                SessionEventKind::Left
            );
        }
        assert!(data(&mut departures).await.is_none());
    }

    #[tokio::test]
    async fn checkpoint_at_head_recovers_without_live_policy_history() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let writer = member(&runtime, "writer").await;
        let first = writer.submit(submission(b"first")).await.unwrap();
        let mut second = submission(b"second");
        second.reference = Some(first);
        let head = writer.submit(second).await.unwrap();
        runtime
            .runtime
            .lock()
            .await
            .publish_checkpoint()
            .await
            .unwrap();
        drop((writer, runtime));
        let recovered = LocalSequencer::<MemoryStorage>::recover(
            storage.open_view(&id).await.unwrap().unwrap(),
        )
        .await
        .unwrap();
        {
            let mut state = recovered.runtime.lock().await;
            assert!(state.positions.is_empty());
            assert_eq!(state.applied_through, Some(head));
            assert_eq!(state.minimum_reference, Some(first));
            assert_eq!(state.since_checkpoint, 0);
            assert!(state.known_reference(Some(first)).await.unwrap());
        }
        let fresh = member(&recovered, "fresh").await;
        let mut next = submission(b"next");
        next.reference = Some(head);
        let next = fresh.submit(next).await.unwrap();
        let state = recovered.runtime.lock().await;
        assert_eq!(
            state.positions.iter().copied().collect::<Vec<_>>(),
            vec![next]
        );
        assert_eq!(state.applied_through, Some(next));
        assert!(state.minimum_reference >= Some(first));
    }

    #[tokio::test]
    async fn allocation_reserves_before_exposure_and_skips_unused_ids_after_restart() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = runtime.open_session(None).await.unwrap();
        assert_eq!(first.session_id().as_bytes().as_ref(), 1_u64.to_be_bytes());
        let checkpoint = {
            let state = runtime.runtime.lock().await;
            checkpoint::Checkpoint::decode::<()>(
                state.view().unwrap().checkpoint().await.unwrap().unwrap(),
            )
            .unwrap()
        };
        assert_eq!(checkpoint.session_id_reserved_through, 256);
        assert!(checkpoint.applied_through.is_none());
        drop((first, runtime));
        let runtime = LocalSequencer::<MemoryStorage>::recover(
            storage.open_view(&id).await.unwrap().unwrap(),
        )
        .await
        .unwrap();
        let next = runtime.open_session(None).await.unwrap();
        assert_eq!(next.session_id().as_bytes().as_ref(), 257_u64.to_be_bytes());
        assert!(runtime.runtime.lock().await.positions.is_empty());
        drop(next);
        {
            let mut state = runtime.runtime.lock().await;
            state.session_id_reserved_through = u64::MAX;
            state.next_session = Some(u64::MAX);
            state.publish_checkpoint().await.unwrap();
        }
        let last = runtime.open_session(None).await.unwrap();
        assert_eq!(
            last.session_id().as_bytes().as_ref(),
            u64::MAX.to_be_bytes()
        );
        assert!(runtime.open_session(None).await.is_err());
        drop((last, runtime));
        let runtime = LocalSequencer::<MemoryStorage>::recover(
            storage.open_view(&id).await.unwrap().unwrap(),
        )
        .await
        .unwrap();
        assert!(runtime.open_session(None).await.is_err());
    }

    /// Produces one stable application submission for session tests.
    pub(super) fn submission(value: &'static [u8]) -> EventSubmission {
        EventSubmission {
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
        assert_eq!(live.progress().latest_known, positions.last().copied());
        assert_eq!(live.progress().status, MonitoredStreamStatus::FallenBehind);
        for expected in &positions {
            let event = data(&mut live).await.unwrap();
            assert_eq!(event.committed.position, *expected);
            assert_eq!(live.progress().previous, Some(*expected));
            let progress = live.progress();
            assert!(progress.latest_known >= progress.previous);
            if progress.status == MonitoredStreamStatus::FallenBehind {
                assert!(progress.previous < progress.latest_known);
            }
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
    async fn recovery_rejects_inconsistent_floor_reservation_and_membership_metadata() {
        let session = SessionId::new(1).unwrap();
        let first = EventPosition::new(1);
        let encode = |reference, floor| {
            encode_submission::<sea_memory::MemoryStorageError>(
                &session, reference, floor, b"payload",
            )
            .unwrap()
        };
        let joined = encode_membership::<sea_memory::MemoryStorageError>(
            &session,
            SessionEventKind::Joined,
            None,
            None,
            b"member",
        )
        .unwrap();
        let left = encode_membership::<sea_memory::MemoryStorageError>(
            &session,
            SessionEventKind::Left,
            None,
            None,
            b"",
        )
        .unwrap();
        for (records, expected) in [
            (
                vec![encode(Some(first), None)],
                "invalid recovered reference",
            ),
            (
                vec![encode(None, None), encode(None, Some(first))],
                "invalid minimum reference floor",
            ),
            (
                vec![
                    encode(None, None),
                    encode(Some(first), Some(first)),
                    encode(Some(first), None),
                ],
                "invalid minimum reference floor",
            ),
            (
                vec![
                    encode_submission::<sea_memory::MemoryStorageError>(
                        &SessionId::new(257).unwrap(),
                        None,
                        None,
                        b"unreserved",
                    )
                    .unwrap(),
                ],
                "session exceeds persisted reservation",
            ),
            (
                vec![joined.clone(), joined],
                "duplicate membership announcement",
            ),
            (vec![left], "departure without announcement"),
        ] {
            let storage = MemoryStorage::new();
            let (_, view) = storage.create_view().await.unwrap();
            view.publish_checkpoint(
                checkpoint::Checkpoint {
                    session_id_reserved_through: 256,
                    ..checkpoint::Checkpoint::default()
                }
                .encode::<()>()
                .unwrap(),
            )
            .await
            .unwrap();
            for record in records {
                view.append(record, None).await.unwrap();
            }
            assert!(
                matches!(
                    LocalSequencer::<MemoryStorage>::recover(view).await,
                    Err(SessionError::Corrupt(reason)) if reason == expected
                ),
                "{expected}"
            );
        }
    }

    #[tokio::test]
    async fn recovery_rejects_malformed_records_but_preserves_equal_submissions() {
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
            &SessionId::new(1).unwrap(),
            None,
            None,
            b"payload",
        )
        .unwrap();
        duplicate
            .publish_checkpoint(
                checkpoint::Checkpoint {
                    session_id_reserved_through: 256,
                    ..checkpoint::Checkpoint::default()
                }
                .encode::<()>()
                .unwrap(),
            )
            .await
            .unwrap();
        duplicate.append(payload.clone(), None).await.unwrap();
        duplicate.append(payload, None).await.unwrap();
        let recovered = LocalSequencer::<MemoryStorage>::recover(duplicate)
            .await
            .unwrap();
        let observer = member(&recovered, "observer").await;
        let mut replay = observer.read(None, None);
        let first = data(&mut replay).await.unwrap();
        let second = data(&mut replay).await.unwrap();
        assert_eq!(first.committed.event, second.committed.event);
        assert_eq!(first.session_id, second.session_id);
        assert!(first.committed.position < second.committed.position);
    }

    /// Opens a named member without imposing backend-specific ownership rules.
    pub(super) async fn member<Storage: SeaStorage + 'static>(
        runtime: &Arc<LocalSequencer<Storage>>,
        _name: &str,
    ) -> LocalSession<Storage> {
        runtime.open_session(None).await.unwrap()
    }

    /// Returns data while allowing an implementation to emit progress first.
    pub(super) async fn data<Error: std::fmt::Debug>(
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
    async fn membership_positions_resolve_and_publish_snapshot_boundaries() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let publisher = member(&runtime, "publisher").await;
        let participant = member(&runtime, "participant").await;
        let root = publisher.put_blob(Bytes::new()).await.unwrap();
        let _registration = publisher
            .coordinate_snapshots(SnapshotParticipation::ClientSelected)
            .await
            .unwrap();
        let joined = participant.announce_membership(Bytes::new()).await.unwrap();
        participant.close().await.unwrap();
        let mut events = publisher.read(None, None);
        let mut parent = None;
        for kind in [SessionEventKind::Joined, SessionEventKind::Left] {
            let event = data(&mut events).await.unwrap();
            assert_eq!(event.kind, kind);
            if kind == SessionEventKind::Joined {
                assert_eq!(event.committed.position, joined);
            }
            let at_event = publisher
                .resolve_position(event.committed.position)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(at_event.id(), event.committed.position);
            let receipt = publisher
                .publish_snapshot(
                    parent,
                    None,
                    Snapshot {
                        root: root.clone(),
                        at_event,
                    },
                )
                .await
                .unwrap();
            assert_eq!(receipt.at_event.id(), event.committed.position);
            let stored = publisher
                .get_snapshot(LoadStart::LatestSnapshot)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(stored.at_event.id(), event.committed.position);
            assert_eq!(stored.root.id(), root.id());
            parent = Some(event.committed.position);
        }
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
        let replacement = runtime.open_session(Some(position)).await.unwrap();
        assert!(
            runtime
                .runtime
                .lock()
                .await
                .members
                .contains_key(&first.session)
        );
        first.close().await.unwrap();
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
    async fn recovery_preserves_positions_and_snapshots_without_deduplicating_submissions() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = member(&runtime, "author").await;
        let position = first.submit(submission(b"original")).await.unwrap();
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
        let mut conflicting = submission(b"original");
        conflicting.event.payload = Bytes::from_static(b"conflict");
        assert!(first.submit(conflicting).await.unwrap() > position);
        runtime.shutdown().await.unwrap();
        drop((first, authority, runtime));
        let recovered = LocalSequencer::<MemoryStorage>::recover(
            storage.open_view(&id).await.unwrap().unwrap(),
        )
        .await
        .unwrap();
        let reconnected = recovered.open_session(Some(position)).await.unwrap();
        assert!(reconnected.submit(submission(b"original")).await.unwrap() > position);
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
        let foreign = member(&recovered, "foreign").await;
        assert!(foreign.submit(submission(b"original")).await.unwrap() > position);
        let mut absent = submission(b"invalid");
        absent.reference = Some(EventPosition::new(999));
        assert!(foreign.submit(absent).await.is_err());
    }

    #[tokio::test]
    async fn content_facade_resolves_stored_identities_and_requires_live_membership() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let session = member(&runtime, "content").await;
        let peer = member(&runtime, "peer").await;
        let payload = Bytes::from_static(b"content");
        let blob = session.put_blob(payload.clone()).await.unwrap();
        let BlobTreeId::Blob(id) = blob.id() else {
            panic!("expected blob")
        };
        assert_eq!(id, BlobId::for_bytes(&payload));
        assert_eq!(session.get_blob(id).await.unwrap(), payload);
        assert_eq!(
            session.resolve_tree(blob.id()).await.unwrap().unwrap().id(),
            blob.id()
        );
        let directory =
            BlobDirectory::new([("leaf".to_owned(), blob.id())].into_iter().collect()).unwrap();
        let root = session.put_directory(directory.clone()).await.unwrap();
        let BlobTreeId::Directory(directory_id) = root.id() else {
            panic!("expected directory")
        };
        assert_eq!(
            session.get_directory(directory_id).await.unwrap(),
            directory
        );
        assert_eq!(
            session.resolve_tree(root.id()).await.unwrap().unwrap().id(),
            root.id()
        );
        let missing = BlobTreeId::Blob(BlobId::for_bytes(b"missing"));
        assert!(session.resolve_tree(missing).await.unwrap().is_none());
        session.close().await.unwrap();
        assert!(matches!(
            session.get_blob(id).await,
            Err(SessionError::Closed)
        ));
        assert!(matches!(
            session.put_directory(directory).await,
            Err(SessionError::Closed)
        ));
        assert!(matches!(
            session.resolve_tree(root.id()).await,
            Err(SessionError::Closed)
        ));
        assert_eq!(peer.get_blob(id).await.unwrap(), payload);
    }

    #[tokio::test]
    async fn two_sessions_share_one_view_and_close_independently() {
        let storage = MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        let sequencer = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let first = sequencer.open_session(None).await.unwrap();
        let second = sequencer.open_session(None).await.unwrap();
        assert!(storage.open_view(&id).await.is_err());
        let first_position = first.submit(submission(b"one")).await.unwrap();
        first.clone().close().await.unwrap();
        assert!(first.submit(submission(b"closed")).await.is_err());
        let second_position = second.submit(submission(b"two")).await.unwrap();
        assert!(first_position < second_position);
        assert!(second.submit(submission(b"two")).await.unwrap() > second_position);
        sequencer.shutdown().await.unwrap();
        assert!(second.submit(submission(b"after shutdown")).await.is_err());
        assert!(storage.open_view(&id).await.unwrap().is_some());
    }
}
