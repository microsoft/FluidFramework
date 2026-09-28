//! Experimental, opening-local delivery ownership. No storage or runtime lock is acquired here.

use std::{
    collections::{BTreeMap, VecDeque},
    sync::{Arc, Mutex, Weak},
};

use sea_core::{EventPosition, SessionCommittedEvent, SessionId};
use tokio::sync::watch;

use super::SessionError;

/// Instantaneous cache ownership, excluding payload handles already returned downstream.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct LiveCacheStats {
    /// Registered unbounded subscriptions, including historical readers.
    pub subscriptions: usize,
    /// Subscriptions currently retaining the live suffix.
    pub claims: usize,
    /// Settled entries still needed by at least one claim.
    pub entries: usize,
    /// Exact canonical payload backing allocations retained by those entries.
    pub payload_bytes: usize,
    /// Allocated entry slots, distinct from payload backing bytes.
    pub entry_capacity: usize,
}

/// Advisory, opening-local cache observations without retaining entries or storage.
///
/// Thresholds are soft targets supplied by the observer, not admission limits.
/// Reader-required entries remain retained above either target.
pub struct LiveCachePressure<E> {
    /// Upgraded only while registering or sampling, never across a wait.
    cache: Weak<LiveCache<E>>,
}

impl<E> Clone for LiveCachePressure<E> {
    fn clone(&self) -> Self {
        Self {
            cache: self.cache.clone(),
        }
    }
}

impl<E> LiveCachePressure<E> {
    /// Samples maintained ownership counts without walking retained events or readers.
    ///
    /// # Errors
    /// Returns the opening's terminal error, or `Closed` after its cache is dropped.
    /// # Panics
    /// Panics if the cache state lock is poisoned.
    pub fn current(&self) -> Result<LiveCacheStats, SessionError<E>> {
        let cache = self.cache.upgrade().ok_or(SessionError::Closed)?;
        let state = cache.state.lock().expect("live cache lock");
        if let Some(terminal) = &state.terminal {
            return Err(terminal.error());
        }
        Ok(state.stats())
    }

    /// Revokes one live claim with the oldest unread cursor if either target is exceeded.
    ///
    /// Threshold recheck and identity selection are atomic with cache ownership changes.
    /// Historical subscriptions and caught-up readers are not selected.
    /// This is subscription-only shedding, not session closure or a hard retention bound.
    /// # Errors
    /// Returns the opening's terminal error or `Closed` after cache destruction.
    /// # Panics
    /// Panics if a cache or subscription lock is poisoned.
    pub fn revoke_lagging(
        &self,
        entries: usize,
        payload_bytes: usize,
    ) -> Result<bool, SessionError<E>> {
        let cache = self.cache.upgrade().ok_or(SessionError::Closed)?;
        let removed = {
            let mut state = cache.state.lock().expect("live cache lock");
            if let Some(terminal) = &state.terminal {
                return Err(terminal.error());
            }
            if state.entries.len() <= entries && state.payload_bytes <= payload_bytes {
                return Ok(false);
            }
            let selected = state
                .subscriptions
                .iter()
                .filter(|(_, claim)| claim.attached && claim.cursor < state.head)
                .min_by_key(|(_, claim)| claim.cursor)
                .map(|(id, _)| *id);
            if let Some(id) = selected {
                let claim = state
                    .subscriptions
                    .remove(&id)
                    .expect("selected live claim");
                *claim.terminal.lock().expect("subscription terminal lock") =
                    Some(Terminal::Revoked);
                state.claims -= 1;
                state.reclaim();
                true
            } else {
                false
            }
        };
        if removed {
            cache.notify_pressure();
            cache.notify();
        }
        Ok(removed)
    }

    /// Waits until either retained entries or canonical payload bytes exceeds its target.
    ///
    /// This does not reserve capacity, shed readers, or block publication.
    /// # Errors
    /// Returns the opening's terminal error, or `Closed` after its cache is dropped.
    /// # Panics
    /// Panics if the cache state lock is poisoned.
    pub async fn wait_above(
        &self,
        entries: usize,
        payload_bytes: usize,
    ) -> Result<LiveCacheStats, SessionError<E>> {
        self.wait_for(entries, payload_bytes, true).await
    }

    /// Waits until both retained counts are at or below the supplied targets.
    ///
    /// Registration precedes sampling; cancellation removes only the wait registration.
    /// Returned handles and transport sends may still retain payloads after cache dequeue.
    /// # Errors
    /// Returns the opening's terminal error, or `Closed` after its cache is dropped.
    /// # Panics
    /// Panics if the cache state lock is poisoned.
    pub async fn wait_below(
        &self,
        entries: usize,
        payload_bytes: usize,
    ) -> Result<LiveCacheStats, SessionError<E>> {
        self.wait_for(entries, payload_bytes, false).await
    }

    /// Uses a coalesced wakeup only as a reason to recheck authoritative state.
    async fn wait_for(
        &self,
        entries: usize,
        payload_bytes: usize,
        above: bool,
    ) -> Result<LiveCacheStats, SessionError<E>> {
        let mut changed = self
            .cache
            .upgrade()
            .ok_or(SessionError::Closed)?
            .pressure_changed
            .subscribe();
        loop {
            let stats = self.current()?;
            if (stats.entries > entries || stats.payload_bytes > payload_bytes) == above {
                return Ok(stats);
            }
            changed.changed().await.map_err(|_| SessionError::Closed)?;
        }
    }
}

/// Subscription-only revocation, safe to clone and invoke repeatedly.
///
/// This capability cannot close the session, change author authority, or revoke a sibling.
/// It remains useful during historical replay, before the subscription owns a live claim.
#[derive(Clone)]
pub struct LiveReadRevocation {
    /// Identity-scoped removal; a weak owner prevents extending the opening lifetime.
    revoke: Arc<dyn Fn() + Send + Sync>,
}

impl LiveReadRevocation {
    /// Releases retention and signals a terminal subscription error without reader polling.
    pub fn revoke(&self) {
        (self.revoke)();
    }
}

/// Terminal outcomes are shared without requiring backend errors to implement `Clone`.
pub(super) enum Terminal<E> {
    /// Neutral subscription-only revocation.
    Revoked,
    /// Membership closure or runtime shutdown.
    Closed,
    /// The sequencer cannot establish a safe settled prefix.
    RecoveryRequired,
    /// Opening invalidation preserves the original backend error.
    Storage(Arc<E>),
}

impl<E> Clone for Terminal<E> {
    fn clone(&self) -> Self {
        match self {
            Self::Revoked => Self::Revoked,
            Self::Closed => Self::Closed,
            Self::RecoveryRequired => Self::RecoveryRequired,
            Self::Storage(error) => Self::Storage(error.clone()),
        }
    }
}

impl<E> Terminal<E> {
    /// Converts the retained cause into a caller-visible classified error.
    pub(super) fn error(&self) -> SessionError<E> {
        match self {
            Self::Revoked => SessionError::SubscriptionRevoked,
            Self::Closed => SessionError::Closed,
            Self::RecoveryRequired => SessionError::RecoveryRequired,
            Self::Storage(error) => SessionError::StorageInvalidated(error.clone()),
        }
    }
}

/// One registry-owned subscription; historical subscriptions have no retention cursor.
struct SubscriptionState<E> {
    /// Membership used only for synchronous lifecycle cleanup.
    session: SessionId,
    /// Historical subscriptions have no retention authority until atomic handoff.
    attached: bool,
    /// Last delivered position; `None` on an attached claim retains from an empty opening.
    cursor: Option<EventPosition>,
    /// Survives registry removal so the stream can observe its terminal cause.
    terminal: Arc<Mutex<Option<Terminal<E>>>>,
}

/// All publication, handoff, delivery, and reclamation are serialized by this short lock.
struct State<E> {
    /// Last successfully applied event; never inferred from progress notifications.
    head: Option<EventPosition>,
    /// Cursor just before the retained range.
    reclaimed_through: Option<EventPosition>,
    /// Shared canonical entries, with exact-sized payload backing.
    entries: VecDeque<SessionCommittedEvent>,
    /// Exact canonical payload bytes retained by the deque, excluding downstream handles.
    payload_bytes: usize,
    /// Both historical observers and live retention owners.
    subscriptions: BTreeMap<u64, SubscriptionState<E>>,
    /// Maintained attached-reader count, independent of historical subscriptions.
    claims: usize,
    /// Checked, never-reused subscription identity.
    next: u64,
    /// Sticky opening termination; new reads must not rejoin.
    terminal: Option<Terminal<E>>,
}

/// One opening's neutral cache; independent invalidation never enters the runtime.
pub(super) struct LiveCache<E> {
    /// Authoritative ownership and handoff state.
    state: Mutex<State<E>>,
    /// Coalesced publication, retained-work, and termination notification.
    changed: watch::Sender<()>,
    /// Pressure-only wakeups do not reschedule live readers on every dequeue.
    pressure_changed: watch::Sender<()>,
}

/// Invalidates cached delivery if checkpoint publication fails or is cancelled.
pub(super) struct RecoveryGuard<E>(pub(super) Option<Arc<LiveCache<E>>>);

impl<E> Drop for RecoveryGuard<E> {
    fn drop(&mut self) {
        if let Some(cache) = &self.0 {
            cache.terminate(Terminal::RecoveryRequired);
        }
    }
}

/// Fans backend control readiness out to cached readers even after the last caller is cancelled.
struct ControlWake<E> {
    /// Does not extend cache or opening ownership.
    cache: Weak<LiveCache<E>>,
    /// Preserves the currently driving caller's normal wakeup.
    caller: std::task::Waker,
}

impl<E: Send + Sync> futures_util::task::ArcWake for ControlWake<E> {
    fn wake_by_ref(arc_self: &Arc<Self>) {
        if let Some(cache) = arc_self.cache.upgrade() {
            cache.notify();
        }
        arc_self.caller.wake_by_ref();
    }
}

/// Retains one control future and adds coalesced readiness, not a task or another mutation.
pub(super) fn notify_control<E: Send + Sync + 'static>(
    cache: &Arc<LiveCache<E>>,
    mut future: super::MutationFuture<E>,
) -> super::MutationFuture<E> {
    let cache = Arc::downgrade(cache);
    Box::pin(std::future::poll_fn(move |context| {
        let waker = futures_util::task::waker(Arc::new(ControlWake {
            cache: cache.clone(),
            caller: context.waker().clone(),
        }));
        future
            .as_mut()
            .poll(&mut std::task::Context::from_waker(&waker))
    }))
}

/// Stream-owned registration removes itself even when never polled again.
pub(super) struct Subscription<E> {
    /// Owner is shared with runtime; no storage ownership is transferred.
    cache: Arc<LiveCache<E>>,
    /// Stable identity, not a reusable slot.
    id: u64,
    /// Retained terminal outcome after synchronous removal.
    terminal: Arc<Mutex<Option<Terminal<E>>>>,
}

impl<E> Drop for Subscription<E> {
    fn drop(&mut self) {
        self.cache.remove(self.id, None);
    }
}

impl<E> State<E> {
    /// Constant-time ownership observations under the state lock.
    fn stats(&self) -> LiveCacheStats {
        LiveCacheStats {
            subscriptions: self.subscriptions.len(),
            claims: self.claims,
            entries: self.entries.len(),
            payload_bytes: self.payload_bytes,
            entry_capacity: self.entries.capacity(),
        }
    }

    /// Removes entries no attached reader needs and releases slots when entirely empty.
    fn reclaim(&mut self) {
        let floor = self
            .subscriptions
            .values()
            .filter(|claim| claim.attached)
            .map(|claim| claim.cursor)
            .min();
        let through = floor.unwrap_or(self.head);
        while self
            .entries
            .front()
            .is_some_and(|event| Some(event.committed.position) <= through)
        {
            let event = self.entries.pop_front().expect("retained front");
            self.payload_bytes -= event.committed.event.payload.len();
        }
        self.reclaimed_through = through;
        if self.entries.is_empty() {
            self.entries = VecDeque::new();
        }
    }
}

impl<E> LiveCache<E> {
    /// Installs the recovered frontier without retaining replayed payloads.
    pub(super) fn recovered(&self, head: Option<EventPosition>) -> Result<(), SessionError<E>> {
        let mut state = self.state.lock().expect("live cache lock");
        if let Some(terminal) = &state.terminal {
            return Err(terminal.error());
        }
        state.head = head;
        state.reclaimed_through = head;
        Ok(())
    }

    /// Starts at the recovered frontier without retaining recovered history.
    pub(super) fn new(head: Option<EventPosition>) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(State {
                head,
                reclaimed_through: head,
                entries: VecDeque::new(),
                payload_bytes: 0,
                subscriptions: BTreeMap::new(),
                claims: 0,
                next: 0,
                terminal: None,
            }),
            changed: watch::channel(()).0,
            pressure_changed: watch::channel(()).0,
        })
    }

    /// Observes this cache without extending its lifetime.
    pub(super) fn pressure(self: &Arc<Self>) -> LiveCachePressure<E> {
        LiveCachePressure {
            cache: Arc::downgrade(self),
        }
    }

    /// Coalesces ownership changes separately from reader readiness.
    fn notify_pressure(&self) {
        if self.pressure_changed.receiver_count() != 0 {
            self.pressure_changed.send_replace(());
        }
    }

    /// Coalesces retained-work installation with publication notifications.
    pub(super) fn notify(&self) {
        self.changed.send_replace(());
    }

    /// Observes changes without a task or an event-sized notification backlog.
    pub(super) fn changes(&self) -> watch::Receiver<()> {
        self.changed.subscribe()
    }

    /// Publishes only after runtime application, sharing the decoder's exact-sized payload.
    pub(super) fn publish(&self, event: &SessionCommittedEvent) {
        {
            let mut state = self.state.lock().expect("live cache lock");
            state.head = Some(event.committed.position);
            if state.terminal.is_none() && state.claims != 0 {
                state.payload_bytes = state
                    .payload_bytes
                    .checked_add(event.committed.event.payload.len())
                    .expect("cache payload byte count overflow");
                state.entries.push_back(event.clone());
            }
            state.reclaim();
        }
        self.notify_pressure();
        self.notify();
    }

    /// Synchronously removes exactly one identity, then wakes outside the registry lock.
    fn remove(&self, id: u64, terminal: Option<Terminal<E>>) {
        {
            let mut state = self.state.lock().expect("live cache lock");
            if let Some(claim) = state.subscriptions.remove(&id) {
                state.claims -= usize::from(claim.attached);
                *claim.terminal.lock().expect("subscription terminal lock") = terminal;
                state.reclaim();
            } else {
                return;
            }
        }
        self.notify_pressure();
        self.notify();
    }

    /// Revokes every observer and retention claim belonging to one closing membership.
    pub(super) fn close_session(&self, session: &SessionId) {
        {
            let mut state = self.state.lock().expect("live cache lock");
            let mut removed = 0;
            state.subscriptions.retain(|_, claim| {
                if &claim.session == session {
                    removed += usize::from(claim.attached);
                    *claim.terminal.lock().expect("subscription terminal lock") =
                        Some(Terminal::Closed);
                    false
                } else {
                    true
                }
            });
            state.claims -= removed;
            state.reclaim();
        }
        self.notify_pressure();
        self.notify();
    }

    /// Invalidates this opening without acquiring the sequencer or any storage lock.
    pub(super) fn terminate(&self, terminal: Terminal<E>) {
        {
            let mut state = self.state.lock().expect("live cache lock");
            if state.terminal.is_some() {
                return;
            }
            for claim in std::mem::take(&mut state.subscriptions).into_values() {
                *claim.terminal.lock().expect("subscription terminal lock") =
                    Some(terminal.clone());
            }
            state.claims = 0;
            state.terminal = Some(terminal);
            state.reclaim();
        }
        self.notify_pressure();
        self.notify();
    }

    /// Returns ownership measurements without including downstream handles or archive storage.
    pub(super) fn stats(&self) -> LiveCacheStats {
        self.state.lock().expect("live cache lock").stats()
    }
}

impl<E: Send + Sync + 'static> LiveCache<E> {
    /// Registers synchronously, but retains no data until handoff succeeds.
    pub(super) fn subscribe(self: &Arc<Self>, session: SessionId) -> Subscription<E> {
        let mut state = self.state.lock().expect("live cache lock");
        let id = state.next;
        state.next = id
            .checked_add(1)
            .expect("live subscription identity exhausted");
        let terminal = Arc::new(Mutex::new(state.terminal.clone()));
        if state.terminal.is_none() {
            state.subscriptions.insert(
                id,
                SubscriptionState {
                    session,
                    attached: false,
                    cursor: None,
                    terminal: terminal.clone(),
                },
            );
        }
        drop(state);
        self.notify_pressure();
        Subscription {
            cache: self.clone(),
            id,
            terminal,
        }
    }

    /// Returns capabilities for all direct and decorated subscriptions, without policy.
    pub(super) fn revocations(self: &Arc<Self>) -> Vec<LiveReadRevocation> {
        self.state
            .lock()
            .expect("live cache lock")
            .subscriptions
            .keys()
            .map(|id| Self::revocation(Arc::downgrade(self), *id))
            .collect()
    }

    /// Builds an identity-scoped capability that does not retain the opening.
    fn revocation(cache: Weak<Self>, id: u64) -> LiveReadRevocation {
        LiveReadRevocation {
            revoke: Arc::new(move || {
                if let Some(cache) = cache.upgrade() {
                    cache.remove(id, Some(Terminal::Revoked));
                }
            }),
        }
    }
}

impl<E: Send + Sync + 'static> Subscription<E> {
    /// Creates a capability for exactly this subscription without exposing cache ownership.
    pub(super) fn revocation(&self) -> LiveReadRevocation {
        LiveCache::revocation(Arc::downgrade(&self.cache), self.id)
    }
    /// Releases ownership on a stream error without waiting for the stream to be dropped.
    pub(super) fn release(&self) {
        self.cache.remove(self.id, None);
    }

    /// The explicit terminal reason persists after cache ownership has been removed.
    pub(super) fn terminal(&self) -> Option<Terminal<E>> {
        self.terminal
            .lock()
            .expect("subscription terminal lock")
            .clone()
    }

    /// Attaches only if the delivered cursor still covers the reclaimed prefix.
    /// This check and registration are atomic with publication and reclamation.
    pub(super) fn attach(&self, cursor: Option<EventPosition>) -> Result<bool, SessionError<E>> {
        let mut state = self.cache.state.lock().expect("live cache lock");
        if let Some(terminal) = self.terminal() {
            return Err(terminal.error());
        }
        if cursor > state.head {
            return Err(SessionError::Rejected("live cursor exceeds applied head"));
        }
        if cursor < state.reclaimed_through {
            return Ok(false);
        }
        let claim = state
            .subscriptions
            .get_mut(&self.id)
            .expect("active subscription");
        let added = !claim.attached;
        claim.attached = true;
        claim.cursor = cursor;
        state.claims += usize::from(added);
        drop(state);
        self.cache.notify_pressure();
        Ok(true)
    }

    /// Captures a finite replay boundary; no live claim is acquired.
    pub(super) fn head(&self) -> Option<EventPosition> {
        self.cache.state.lock().expect("live cache lock").head
    }

    /// Observes the frontier and unread entry count together without subtracting opaque positions.
    pub(super) fn backlog(&self, cursor: Option<EventPosition>) -> (Option<EventPosition>, usize) {
        let state = self.cache.state.lock().expect("live cache lock");
        let start = state
            .entries
            .partition_point(|event| Some(event.committed.position) <= cursor);
        (state.head, state.entries.len() - start)
    }

    /// Returns the next canonical handle and immediately releases this reader's entry claim.
    /// Ordered lookup avoids rescanning a prefix retained by a stalled sibling.
    pub(super) fn next(&self) -> Result<Option<SessionCommittedEvent>, SessionError<E>> {
        let mut state = self.cache.state.lock().expect("live cache lock");
        if let Some(terminal) = self.terminal() {
            return Err(terminal.error());
        }
        let claim = state
            .subscriptions
            .get(&self.id)
            .expect("active subscription");
        assert!(claim.attached, "attached subscription");
        let cursor = claim.cursor;
        let index = state
            .entries
            .partition_point(|event| Some(event.committed.position) <= cursor);
        let event = state.entries.get(index).cloned();
        if let Some(event) = &event {
            state
                .subscriptions
                .get_mut(&self.id)
                .expect("active subscription")
                .cursor = Some(event.committed.position);
            state.reclaim();
        }
        drop(state);
        if event.is_some() {
            self.cache.notify_pressure();
        }
        Ok(event)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codec::{decode_committed, encode_submission};
    use sea_core::{CommittedEvent, Event};

    /// A canonical payload with deliberately sparse event positions.
    fn event(index: u64, bytes: usize) -> SessionCommittedEvent {
        SessionCommittedEvent {
            kind: sea_core::archive::SessionEventKind::Application,
            committed: CommittedEvent {
                position: EventPosition::new(index * 101 + 7),
                event: Event {
                    payload: bytes::Bytes::from(vec![7; bytes]),
                    blob_tree: None,
                },
            },
            session_id: SessionId::new(1).unwrap(),
            reference: None,
            minimum_reference: None,
        }
    }

    /// Checks maintained fields against an independent full ownership recount.
    fn check_accounting(cache: &LiveCache<std::io::Error>) {
        let state = cache.state.lock().unwrap();
        assert_eq!(
            state.payload_bytes,
            state
                .entries
                .iter()
                .map(|e| e.committed.event.payload.len())
                .sum::<usize>()
        );
        assert_eq!(
            state.claims,
            state
                .subscriptions
                .values()
                .filter(|claim| claim.attached)
                .count()
        );
    }

    /// Counts wakeups without relying on another poll to discover changed state.
    #[derive(Default)]
    struct WakeCount(std::sync::atomic::AtomicUsize);

    impl futures_util::task::ArcWake for WakeCount {
        fn wake_by_ref(this: &Arc<Self>) {
            this.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        }
    }

    #[test]
    fn pressure_wakes_all_waiters_and_cancellation_removes_registration() {
        let cache = LiveCache::<std::io::Error>::new(None);
        let subscription = cache.subscribe(SessionId::new(1).unwrap());
        subscription.attach(None).unwrap();
        let pressure = cache.pressure();
        let notifications = Arc::new(WakeCount::default());
        let waker = futures_util::task::waker(notifications.clone());
        let mut context = std::task::Context::from_waker(&waker);
        let mut first = Box::pin(pressure.wait_above(0, 0));
        let mut second = Box::pin(pressure.wait_above(0, 0));
        let mut cancelled = Box::pin(pressure.wait_above(0, 0));
        assert!(first.as_mut().poll(&mut context).is_pending());
        assert!(second.as_mut().poll(&mut context).is_pending());
        assert!(cancelled.as_mut().poll(&mut context).is_pending());
        assert_eq!(cache.pressure_changed.receiver_count(), 3);
        drop(cancelled);
        assert_eq!(cache.pressure_changed.receiver_count(), 2);
        cache.publish(&event(0, 1));
        assert_eq!(notifications.0.load(std::sync::atomic::Ordering::SeqCst), 2);
        assert!(first.as_mut().poll(&mut context).is_ready());
        assert!(second.as_mut().poll(&mut context).is_ready());
    }

    #[tokio::test]
    async fn pressure_registration_racing_publication_cannot_strand_a_waiter() {
        for _ in 0..32 {
            let cache = LiveCache::<std::io::Error>::new(None);
            let subscription = cache.subscribe(SessionId::new(1).unwrap());
            subscription.attach(None).unwrap();
            let pressure = cache.pressure();
            let barrier = Arc::new(std::sync::Barrier::new(2));
            let ready = barrier.clone();
            let publisher = std::thread::spawn(move || {
                ready.wait();
                cache.publish(&event(0, 1));
            });
            barrier.wait();
            tokio::time::timeout(std::time::Duration::from_secs(5), pressure.wait_above(0, 0))
                .await
                .unwrap()
                .unwrap();
            publisher.join().unwrap();
        }
    }

    #[tokio::test]
    async fn pressure_targets_are_soft_and_dequeue_does_not_wake_sibling_readers() {
        let cache = LiveCache::<std::io::Error>::new(None);
        let pressure = cache.pressure();
        let session = SessionId::new(1).unwrap();
        let parked = cache.subscribe(session.clone());
        let advancing = cache.subscribe(session);
        assert!(parked.attach(None).unwrap());
        assert!(advancing.attach(None).unwrap());
        assert!(advancing.attach(None).unwrap());
        check_accounting(&cache);
        let above = pressure.wait_above(1, 8);
        tokio::pin!(above);
        assert!(futures_util::poll!(&mut above).is_pending());
        cache.publish(&event(0, 8));
        assert!(futures_util::poll!(&mut above).is_pending());
        cache.publish(&event(1, 1));
        assert_eq!(above.await.unwrap().payload_bytes, 9);
        assert_eq!(pressure.wait_above(usize::MAX, 8).await.unwrap().entries, 2);
        assert_eq!(pressure.wait_above(1, usize::MAX).await.unwrap().entries, 2);
        let below = pressure.wait_below(0, 0);
        tokio::pin!(below);
        assert!(futures_util::poll!(&mut below).is_pending());
        let mut reader_changes = cache.changes();
        reader_changes.borrow_and_update();
        let downstream = advancing.next().unwrap().unwrap();
        assert!(!reader_changes.has_changed().unwrap());
        assert_eq!(pressure.current().unwrap().payload_bytes, 9);
        assert!(futures_util::poll!(&mut below).is_pending());
        parked.revocation().revoke();
        assert_eq!(pressure.current().unwrap().payload_bytes, 1);
        check_accounting(&cache);
        advancing.next().unwrap().unwrap();
        assert_eq!(below.await.unwrap().payload_bytes, 0);
        assert_eq!(downstream.committed.event.payload.len(), 8);
        assert_eq!(pressure.current().unwrap().entry_capacity, 0);
        drop(advancing);
        check_accounting(&cache);
    }

    #[tokio::test]
    async fn pressure_waits_do_not_retain_the_cache_and_termination_is_not_readiness() {
        for terminal in [
            Terminal::Closed,
            Terminal::RecoveryRequired,
            Terminal::Storage(Arc::new(std::io::Error::other("failed opening"))),
        ] {
            let cache = LiveCache::new(None);
            let pressure = cache.pressure();
            let subscription = cache.subscribe(SessionId::new(1).unwrap());
            subscription.attach(None).unwrap();
            cache.publish(&event(0, 1));
            let below = pressure.wait_below(0, 0);
            let above = pressure.wait_above(1, 1);
            tokio::pin!(below, above);
            assert!(futures_util::poll!(&mut below).is_pending());
            assert!(futures_util::poll!(&mut above).is_pending());
            cache.terminate(terminal.clone());
            assert_eq!(
                std::mem::discriminant(&below.await.unwrap_err()),
                std::mem::discriminant(&terminal.error())
            );
            assert!(above.await.is_err());
            cache.terminate(Terminal::Closed);
            assert_eq!(
                std::mem::discriminant(&pressure.current().unwrap_err()),
                std::mem::discriminant(&terminal.error())
            );
            check_accounting(&cache);
            assert_eq!(cache.stats(), LiveCacheStats::default());
        }
        let cache = LiveCache::<std::io::Error>::new(None);
        let pressure = cache.pressure();
        let waiting = pressure.wait_above(0, 0);
        tokio::pin!(waiting);
        assert!(futures_util::poll!(&mut waiting).is_pending());
        assert_eq!(Arc::strong_count(&cache), 1);
        drop(cache);
        assert!(matches!(waiting.await, Err(SessionError::Closed)));
        assert!(matches!(pressure.current(), Err(SessionError::Closed)));
    }

    #[test]
    fn maintained_counts_cover_historical_handoff_and_session_cleanup() {
        let cache = LiveCache::<std::io::Error>::new(None);
        let session = SessionId::new(1).unwrap();
        let historical = cache.subscribe(session.clone());
        cache.publish(&event(0, 8));
        assert!(!historical.attach(None).unwrap());
        check_accounting(&cache);
        assert_eq!(cache.stats().claims, 0);
        assert!(
            historical
                .attach(Some(event(0, 8).committed.position))
                .unwrap()
        );
        let sibling = cache.subscribe(SessionId::new(2).unwrap());
        assert!(
            sibling
                .attach(Some(event(0, 8).committed.position))
                .unwrap()
        );
        check_accounting(&cache);
        cache.publish(&event(1, 13));
        cache.close_session(&session);
        check_accounting(&cache);
        assert_eq!(cache.stats().claims, 1);
        assert_eq!(cache.stats().payload_bytes, 13);
        drop((historical, sibling));
        check_accounting(&cache);
        assert_eq!(cache.stats(), LiveCacheStats::default());
    }

    #[test]
    fn lagged_shedding_rechecks_targets_and_preserves_siblings_and_history() {
        let cache = LiveCache::<std::io::Error>::new(None);
        let pressure = cache.pressure();
        let session = SessionId::new(1).unwrap();
        let slow = cache.subscribe(session.clone());
        let fast = cache.subscribe(session.clone());
        let historical = cache.subscribe(session);
        slow.attach(None).unwrap();
        fast.attach(None).unwrap();
        cache.publish(&event(0, 8));
        fast.next().unwrap().unwrap();
        assert!(!pressure.revoke_lagging(1, 8).unwrap());
        assert!(pressure.revoke_lagging(0, 8).unwrap());
        assert!(matches!(
            slow.next(),
            Err(SessionError::SubscriptionRevoked)
        ));
        assert!(fast.next().unwrap().is_none());
        assert!(historical.terminal().is_none());
        assert!(!historical.attach(None).unwrap());
        assert!(!pressure.revoke_lagging(0, 0).unwrap());
        check_accounting(&cache);
        cache.publish(&event(1, 9));
        assert!(pressure.revoke_lagging(usize::MAX, 8).unwrap());
        assert!(matches!(
            fast.next(),
            Err(SessionError::SubscriptionRevoked)
        ));
        assert!(historical.terminal().is_none());
        assert_eq!(pressure.current().unwrap().entries, 0);
        check_accounting(&cache);
    }

    #[test]
    fn advancing_reader_preserves_order_while_a_sibling_retains_the_prefix() {
        for count in [2048_u64, 16384] {
            let cache = LiveCache::<std::io::Error>::new(None);
            let session = SessionId::new(1).unwrap();
            let parked = cache.subscribe(session.clone());
            let advancing = cache.subscribe(session.clone());
            assert!(parked.attach(None).unwrap());
            assert!(advancing.attach(None).unwrap());
            for index in 0..count {
                cache.publish(&SessionCommittedEvent {
                    kind: sea_core::archive::SessionEventKind::Application,
                    committed: CommittedEvent {
                        position: EventPosition::new(index * 101 + 7),
                        event: Event {
                            payload: bytes::Bytes::from_static(b"x"),
                            blob_tree: None,
                        },
                    },
                    session_id: session.clone(),
                    reference: None,
                    minimum_reference: None,
                });
            }
            let start = std::time::Instant::now();
            for index in 0..count {
                assert_eq!(
                    advancing.next().unwrap().unwrap().committed.position,
                    EventPosition::new(index * 101 + 7)
                );
            }
            assert!(advancing.next().unwrap().is_none());
            eprintln!(
                "retained-prefix count={count} elapsed={:?}",
                start.elapsed()
            );
            assert_eq!(cache.stats().entries, usize::try_from(count).unwrap());
            parked.revocation().revoke();
            assert_eq!(cache.stats().entries, 0);
            assert_eq!(cache.stats().entry_capacity, 0);
        }
    }

    #[test]
    fn publication_and_readers_share_decoded_backing_without_another_payload_copy() {
        let cache = LiveCache::<std::io::Error>::new(None);
        let session = SessionId::new(1).unwrap();
        let first = cache.subscribe(session.clone());
        let second = cache.subscribe(session.clone());
        assert!(first.attach(None).unwrap());
        assert!(second.attach(None).unwrap());
        for (index, length) in [64, 8192, 64, 8192].into_iter().enumerate() {
            let record = CommittedEvent {
                position: EventPosition::new(u64::try_from(index).unwrap()),
                event: Event {
                    payload: encode_submission::<std::io::Error>(
                        &session,
                        None,
                        None,
                        &vec![7; length],
                    )
                    .unwrap(),
                    blob_tree: None,
                },
            };
            let decoded = decode_committed::<std::io::Error>(&record).unwrap();
            cache.publish(&decoded);
            assert_eq!(cache.stats().payload_bytes, length);
            let one = first.next().unwrap().unwrap();
            assert_eq!(cache.stats().entries, 1);
            let two = second.next().unwrap().unwrap();
            assert_eq!(
                one.committed.event.payload.as_ptr(),
                decoded.committed.event.payload.as_ptr()
            );
            assert_eq!(
                two.committed.event.payload.as_ptr(),
                decoded.committed.event.payload.as_ptr()
            );
            assert_eq!(cache.stats().payload_bytes, 0);
            assert_eq!(cache.stats().entry_capacity, 0);
            drop((one, two));
            assert_eq!(
                decoded
                    .committed
                    .event
                    .payload
                    .try_into_mut()
                    .unwrap()
                    .capacity(),
                length,
                "the cache must release its handle after the last delivery"
            );
        }
    }
}
