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

/// Subscription-only revocation, safe to clone and invoke repeatedly.
///
/// This capability cannot close the session, change author authority, or revoke a sibling.
/// It remains useful during historical replay, before the subscription owns a live claim.
pub struct LiveReadRevocation {
    /// Identity-scoped removal; a weak owner prevents extending the opening lifetime.
    revoke: Arc<dyn Fn() + Send + Sync>,
}

impl Clone for LiveReadRevocation {
    fn clone(&self) -> Self {
        Self {
            revoke: self.revoke.clone(),
        }
    }
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
    /// Ordered membership closure.
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
    /// Both historical observers and live retention owners.
    subscriptions: BTreeMap<u64, SubscriptionState<E>>,
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
}

/// Cancellation of checkpoint publication invalidates the sequencer's continuation.
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
            self.entries.pop_front();
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
                subscriptions: BTreeMap::new(),
                next: 0,
                terminal: None,
            }),
            changed: watch::channel(()).0,
        })
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
            if state.terminal.is_none() && state.subscriptions.values().any(|claim| claim.attached)
            {
                state.entries.push_back(event.clone());
            }
            state.reclaim();
        }
        self.notify();
    }

    /// Synchronously removes exactly one identity, then wakes outside the registry lock.
    fn remove(&self, id: u64, terminal: Option<Terminal<E>>) {
        {
            let mut state = self.state.lock().expect("live cache lock");
            if let Some(claim) = state.subscriptions.remove(&id) {
                *claim.terminal.lock().expect("subscription terminal lock") = terminal;
                state.reclaim();
            } else {
                return;
            }
        }
        self.notify();
    }

    /// Revokes every observer and retention claim belonging to one closing membership.
    pub(super) fn close_session(&self, session: &SessionId) {
        {
            let mut state = self.state.lock().expect("live cache lock");
            state.subscriptions.retain(|_, claim| {
                if &claim.session == session {
                    *claim.terminal.lock().expect("subscription terminal lock") =
                        Some(Terminal::Closed);
                    false
                } else {
                    true
                }
            });
            state.reclaim();
        }
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
            state.terminal = Some(terminal);
            state.reclaim();
        }
        self.notify();
    }

    /// Returns ownership measurements without including downstream handles or archive storage.
    pub(super) fn stats(&self) -> LiveCacheStats {
        let state = self.state.lock().expect("live cache lock");
        LiveCacheStats {
            subscriptions: state.subscriptions.len(),
            claims: state
                .subscriptions
                .values()
                .filter(|claim| claim.attached)
                .count(),
            entries: state.entries.len(),
            payload_bytes: state
                .entries
                .iter()
                .map(|event| event.committed.event.payload.len())
                .sum(),
            entry_capacity: state.entries.capacity(),
        }
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
        claim.attached = true;
        claim.cursor = cursor;
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
        Ok(event)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codec::{decode_committed, encode_submission};
    use sea_core::{CommittedEvent, Event};

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
