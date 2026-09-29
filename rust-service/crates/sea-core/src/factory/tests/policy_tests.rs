//! Policy regression tests reuse the factory's concrete-capability and browser-local fixtures.

use super::*;
use crate::policy::{DocumentPolicy, PolicyError, PolicyFactory, PolicySession, WriteRequest};
use futures_util::{StreamExt, future::poll_fn};
use std::sync::atomic::AtomicBool;

/// Definitive refusal distinct from the fixture source's ambiguous failure.
#[derive(Debug)]
struct Refused;

impl fmt::Display for Refused {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("policy refused")
    }
}

impl std::error::Error for Refused {}

impl ClassifiedError for Refused {
    fn kind(&self) -> ErrorKind {
        ErrorKind::Rejected
    }
}

/// Independent request/visible-byte capacity for policy-owned waits.
#[derive(Default)]
struct Capacity {
    /// Charges held by live permits, including ordering waits.
    requests: usize,
    /// Visible payload bytes held by live permits.
    bytes: usize,
}

/// Shared document fixture, deliberately not `Clone`.
struct TestPolicy {
    /// Refuse open before touching the source.
    refuse_session: AtomicBool,
    /// Refuse all unbounded subscriptions, including load.
    refuse_reader: AtomicBool,
    /// Active reader permits, including pending loads.
    readers: Arc<AtomicUsize>,
    /// Advisory readiness independent of source lifecycle.
    blocked: AtomicBool,
    /// Live guard accounting.
    capacity: Arc<Mutex<Capacity>>,
    /// Maximum simultaneous pre-source writes.
    max_requests: usize,
    /// Maximum charged visible input bytes.
    max_bytes: usize,
    /// Counts calls even when they are refused synchronously.
    acquisitions: AtomicUsize,
    /// Counts actual policy future polls, not construction.
    wait_polls: AtomicUsize,
    /// Produces a policy wait error rather than admission.
    fail_wait: AtomicBool,
    #[cfg(target_arch = "wasm32")]
    /// Forces local policy callbacks/futures to be accepted on browser targets.
    local: std::rc::Rc<()>,
}

impl TestPolicy {
    /// Creates a bounded, immediately ready policy.
    fn new(max_requests: usize, max_bytes: usize) -> Arc<Self> {
        Arc::new(Self {
            refuse_session: AtomicBool::new(false),
            refuse_reader: AtomicBool::new(false),
            readers: Arc::default(),
            blocked: AtomicBool::new(false),
            capacity: Arc::default(),
            max_requests,
            max_bytes,
            acquisitions: AtomicUsize::new(0),
            wait_polls: AtomicUsize::new(0),
            fail_wait: AtomicBool::new(false),
            #[cfg(target_arch = "wasm32")]
            local: std::rc::Rc::default(),
        })
    }
}

/// Request ownership acquired synchronously and released on every exit path.
struct Permit {
    /// Shared accounting, independent of the wrapper's queue.
    capacity: Arc<Mutex<Capacity>>,
    /// Visible byte charge used by this fixture.
    bytes: usize,
    #[cfg(target_arch = "wasm32")]
    /// Proves the permit does not impose native bounds on local futures.
    _local: std::rc::Rc<()>,
}

impl Drop for Permit {
    fn drop(&mut self) {
        let mut capacity = self.capacity.lock().unwrap();
        capacity.requests -= 1;
        capacity.bytes -= self.bytes;
    }
}

/// One document-wide live-reader slot, without source/session ownership.
struct ReaderPermit {
    /// Counter released on cancellation, observed stream termination, or drop.
    readers: Arc<AtomicUsize>,
    #[cfg(target_arch = "wasm32")]
    /// Proves live-stream guards may be locally owned on browser targets.
    _local: std::rc::Rc<()>,
}

impl Drop for ReaderPermit {
    fn drop(&mut self) {
        self.readers.fetch_sub(1, Ordering::SeqCst);
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl DocumentPolicy for TestPolicy {
    type Error = Refused;
    type Permit = Permit;
    type ReaderPermit = ReaderPermit;

    fn admit_session(&self, _: Option<EventPosition>) -> Result<(), Self::Error> {
        if self.refuse_session.load(Ordering::SeqCst) {
            Err(Refused)
        } else {
            Ok(())
        }
    }

    fn admit_live_reader(&self) -> Result<ReaderPermit, Self::Error> {
        if self.refuse_reader.load(Ordering::SeqCst)
            || self
                .readers
                .compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst)
                .is_err()
        {
            Err(Refused)
        } else {
            Ok(ReaderPermit {
                readers: self.readers.clone(),
                #[cfg(target_arch = "wasm32")]
                _local: self.local.clone(),
            })
        }
    }

    fn acquire_write(&self, request: WriteRequest<'_>) -> Result<Permit, Refused> {
        self.acquisitions.fetch_add(1, Ordering::SeqCst);
        let bytes = match request {
            WriteRequest::Submit(submission) => submission.event.payload.len(),
            WriteRequest::Blob(payload) => payload.len(),
            WriteRequest::Directory(directory) => directory.encode().unwrap().len(),
        };
        let mut capacity = self.capacity.lock().unwrap();
        if capacity.requests >= self.max_requests
            || bytes > self.max_bytes.saturating_sub(capacity.bytes)
        {
            return Err(Refused);
        }
        capacity.requests += 1;
        capacity.bytes += bytes;
        Ok(Permit {
            capacity: self.capacity.clone(),
            bytes,
            #[cfg(target_arch = "wasm32")]
            _local: self.local.clone(),
        })
    }

    async fn wait_write(&self, _: &Permit) -> Result<(), Refused> {
        // Tests explicitly poll readiness transitions; close must supply its own wakeup.
        poll_fn(|_| {
            self.wait_polls.fetch_add(1, Ordering::SeqCst);
            if self.fail_wait.load(Ordering::SeqCst) {
                Poll::Ready(Err(Refused))
            } else if self.blocked.load(Ordering::SeqCst) {
                Poll::Pending
            } else {
                Poll::Ready(Ok(()))
            }
        })
        .await
    }
}

/// Counts wrapper-driven wakeups without a runtime.
#[derive(Default)]
struct WakeCount(AtomicUsize);

impl std::task::Wake for WakeCount {
    fn wake(self: Arc<Self>) {
        self.0.fetch_add(1, Ordering::SeqCst);
    }
}

/// Polls an operation whose pending state is part of the test.
fn pending<T>(future: &mut SessionFuture<'_, T>, wake: &Arc<WakeCount>) {
    let waker = std::task::Waker::from(wake.clone());
    assert!(
        future
            .as_mut()
            .poll(&mut Context::from_waker(&waker))
            .is_pending()
    );
}

/// One caller-ordered submission accepted by the existing source fixture.
fn submission() -> EventSubmission {
    EventSubmission {
        reference: Some(EventPosition::new(7)),
        event: Event {
            payload: Bytes::from_static(b"payload"),
            blob_tree: None,
        },
    }
}

/// Confirms error classification and the source error's original allocation.
fn source_error<T>(result: Result<T, PolicyError<TestError, Refused>>, expected: &TestError) {
    let Err(PolicyError::Source(error)) = result else {
        panic!("expected unchanged source failure");
    };
    assert_error::<()>(Err(error), expected);
}

/// Moves one instrumented stream into the source before read/load.
fn install_stream(source: &TestSession) -> Arc<AtomicUsize> {
    let drops = Arc::new(AtomicUsize::new(0));
    *source.stream.lock().unwrap() = Some(Box::pin(TestStream {
        drops: drops.clone(),
    }));
    drops
}

#[test]
fn factory_admission_precedes_source_and_open_has_no_post_source_suspension() {
    let source = TestSession::new();
    let policy = TestPolicy::new(1, 7);
    let factory = PolicyFactory::new(TestFactory(source.clone()), policy.clone());
    policy.refuse_session.store(true, Ordering::SeqCst);
    assert!(matches!(
        ready(factory.open_session(Some(EventPosition::new(7)))),
        Err(PolicyError::Policy(Refused))
    ));
    assert!(source.calls.lock().unwrap().is_empty());
    policy.refuse_session.store(false, Ordering::SeqCst);
    source_error(ready(factory.open_session(None)), &source.error);
    let opened = ready(factory_object(&factory).open_session(Some(EventPosition::new(7)))).unwrap();
    assert_eq!(opened.id, SessionId::new(19).unwrap());
    let sibling = ready(factory.open_session(Some(EventPosition::new(7)))).unwrap();
    policy.blocked.store(true, Ordering::SeqCst);
    let mut first = opened.session.put_blob(Bytes::from_static(b"payload"));
    pending(&mut first, &Arc::default());
    assert!(matches!(
        ready(sibling.session.put_blob(Bytes::from_static(b"payload"))),
        Err(PolicyError::Policy(Refused))
    ));
    drop(first);
    let mut opening = factory.open_session(Some(EventPosition::new(8)));
    pending(&mut opening, &Arc::default());
    drop(opening);
    assert_eq!(source.observation.drops.load(Ordering::SeqCst), 1);
}

#[test]
fn reader_refusal_covers_load_but_not_bounded_history_or_snapshot_lookup() {
    let source = TestSession::new();
    let policy = TestPolicy::new(1, 7);
    let session = PolicySession::new(source.clone(), policy.clone());
    policy.refuse_reader.store(true, Ordering::SeqCst);
    let mut refused = session.read(Some(EventPosition::new(7)), None);
    assert_eq!(refused.progress().previous, Some(EventPosition::new(7)));
    assert!(matches!(
        ready(Box::pin(refused.next())),
        Some(Err(PolicyError::Policy(Refused)))
    ));
    assert!(ready(Box::pin(refused.next())).is_none());
    assert!(matches!(
        ready(session.load(LoadStart::LatestSnapshot)),
        Err(PolicyError::Policy(Refused))
    ));
    assert!(source.calls.lock().unwrap().is_empty());
    source.successful_submit.store(true, Ordering::SeqCst);
    assert_eq!(
        ready(session.submit(submission())).unwrap(),
        EventPosition::new(8)
    );
    source_error(
        ready(session.get_snapshot(LoadStart::Beginning)),
        &source.error,
    );
    let drops = install_stream(&source);
    let bounded = session.read(Some(EventPosition::new(7)), Some(EventPosition::new(11)));
    assert_eq!(
        bounded.progress().latest_known,
        Some(EventPosition::new(11))
    );
    drop(bounded);
    assert_eq!(drops.load(Ordering::SeqCst), 1);
    policy.refuse_reader.store(false, Ordering::SeqCst);
    let drops = install_stream(&source);
    let loaded = ready(session.load(LoadStart::LatestSnapshot)).unwrap();
    let snapshot = loaded.snapshot.unwrap();
    assert!(Arc::ptr_eq(&snapshot.root.evidence, &source.evidence));
    assert!(Arc::ptr_eq(&snapshot.at_event.evidence, &source.evidence));
    assert_eq!(
        loaded.events.progress().status,
        MonitoredStreamStatus::FallenBehind
    );
    drop(loaded.events);
    assert_eq!(drops.load(Ordering::SeqCst), 1);
}

#[test]
fn reader_permits_cover_pending_loads_owned_streams_and_cancellation() {
    let source = TestSession::new();
    source.pending_load.store(true, Ordering::SeqCst);
    let policy = TestPolicy::new(1, 7);
    let session = PolicySession::new(source.clone(), policy.clone());
    let mut loading = session.load(LoadStart::LatestSnapshot);
    pending(&mut loading, &Arc::default());
    assert_eq!(policy.readers.load(Ordering::SeqCst), 1);
    assert!(matches!(
        ready(session.load(LoadStart::LatestSnapshot)),
        Err(PolicyError::Policy(Refused))
    ));
    let mut refused = session.read(Some(EventPosition::new(7)), None);
    assert!(matches!(
        ready(Box::pin(refused.next())),
        Some(Err(PolicyError::Policy(Refused)))
    ));
    assert_eq!(*source.calls.lock().unwrap(), ["load"]);
    drop(loading);
    assert_eq!(policy.readers.load(Ordering::SeqCst), 0);
    assert_eq!(source.observation.drops.load(Ordering::SeqCst), 1);

    source.pending_load.store(false, Ordering::SeqCst);
    source.failed_load.store(true, Ordering::SeqCst);
    source_error(
        ready(session.load(LoadStart::LatestSnapshot)),
        &source.error,
    );
    assert_eq!(policy.readers.load(Ordering::SeqCst), 0);
    source.failed_load.store(false, Ordering::SeqCst);
    let drops = install_stream(&source);
    let loaded = ready(session.load(LoadStart::LatestSnapshot)).unwrap();
    assert_eq!(policy.readers.load(Ordering::SeqCst), 1);
    let bounded_drops = install_stream(&source);
    let bounded = session.read(Some(EventPosition::new(7)), Some(EventPosition::new(11)));
    assert_eq!(policy.readers.load(Ordering::SeqCst), 1);
    drop(bounded);
    assert_eq!(bounded_drops.load(Ordering::SeqCst), 1);
    drop(loaded.events);
    assert_eq!(policy.readers.load(Ordering::SeqCst), 0);
    assert_eq!(drops.load(Ordering::SeqCst), 1);
}

#[test]
fn close_wakes_policy_waits_across_clones_and_never_waits_for_admission() {
    let source = TestSession::new();
    let policy = TestPolicy::new(3, 21);
    policy.blocked.store(true, Ordering::SeqCst);
    let session = PolicySession::new(source.clone(), policy.clone());
    let sibling = session.clone();
    let wake = Arc::<WakeCount>::default();
    let mut submit = session.submit(submission());
    let mut blob = sibling.put_blob(Bytes::from_static(b"payload"));
    let mut queued = sibling.submit(submission());
    pending(&mut submit, &wake);
    pending(&mut blob, &wake);
    pending(&mut queued, &wake);
    assert_eq!(policy.capacity.lock().unwrap().requests, 3);
    assert!(source.calls.lock().unwrap().is_empty());
    let mut close = sibling.close();
    pending(&mut close, &Arc::default());
    assert_eq!(*source.calls.lock().unwrap(), ["close"]);
    assert_eq!(wake.0.load(Ordering::SeqCst), 3);
    drop(close);
    assert!(matches!(ready(submit), Err(PolicyError::Terminal)));
    assert!(matches!(ready(blob), Err(PolicyError::Terminal)));
    assert!(matches!(ready(queued), Err(PolicyError::Terminal)));
    assert_eq!(policy.capacity.lock().unwrap().requests, 0);
    assert_eq!(policy.capacity.lock().unwrap().bytes, 0);
    assert!(matches!(
        ready(sibling.submit(submission())),
        Err(PolicyError::Terminal)
    ));
    assert_eq!(source.observation.drops.load(Ordering::SeqCst), 1);
}

#[test]
fn bounded_wait_ownership_is_acquired_before_suspension_and_released_on_drop() {
    for (requests, bytes) in [(1, 100), (100, 7)] {
        let source = TestSession::new();
        source.successful_submit.store(true, Ordering::SeqCst);
        let policy = TestPolicy::new(requests, bytes);
        policy.blocked.store(true, Ordering::SeqCst);
        let session = PolicySession::new(source.clone(), policy.clone());
        let mut first = session.put_blob(Bytes::from_static(b"payload"));
        assert_eq!(policy.acquisitions.load(Ordering::SeqCst), 0);
        pending(&mut first, &Arc::default());
        assert_eq!(policy.capacity.lock().unwrap().requests, 1);
        assert!(matches!(
            ready(session.put_blob(Bytes::from_static(b"payload"))),
            Err(PolicyError::Policy(Refused))
        ));
        assert_eq!(policy.wait_polls.load(Ordering::SeqCst), 1);
        assert!(source.calls.lock().unwrap().is_empty());
        drop(first);
        assert_eq!(policy.capacity.lock().unwrap().requests, 0);
        assert_eq!(policy.capacity.lock().unwrap().bytes, 0);
        let mut canceled = session.submit(submission());
        pending(&mut canceled, &Arc::default());
        drop(canceled);
        policy.blocked.store(false, Ordering::SeqCst);
        assert_eq!(
            ready(session.submit(submission())).unwrap(),
            EventPosition::new(8)
        );
    }
}

#[test]
fn rejected_submit_terminates_clones_without_autonomous_close() {
    let source = TestSession::new();
    let policy = TestPolicy::new(1, 7);
    policy.blocked.store(true, Ordering::SeqCst);
    let session = PolicySession::new(source.clone(), policy.clone());
    let clone = session.clone();
    let mut first = session.submit(submission());
    let wake = Arc::<WakeCount>::default();
    pending(&mut first, &wake);
    assert!(matches!(
        ready(clone.submit(submission())),
        Err(PolicyError::Policy(Refused))
    ));
    assert!(wake.0.load(Ordering::SeqCst) > 0);
    assert!(matches!(ready(first), Err(PolicyError::Terminal)));
    assert!(matches!(
        ready(session.submit(submission())),
        Err(PolicyError::Terminal)
    ));
    assert!(source.calls.lock().unwrap().is_empty());
    assert_eq!(policy.capacity.lock().unwrap().requests, 0);
}

#[test]
fn ordered_submits_release_fifo_after_source_entry_and_preserve_cancellation() {
    for enter_suffix in [false, true] {
        let source = TestSession::new();
        source.pending_submit.store(true, Ordering::SeqCst);
        let policy = TestPolicy::new(2, 14);
        policy.blocked.store(true, Ordering::SeqCst);
        let session = PolicySession::new(source.clone(), policy.clone());
        let clone = session.clone();
        let mut first = session.submit(submission());
        let mut second = clone.submit(submission());
        let wake = Arc::<WakeCount>::default();
        pending(&mut first, &wake);
        pending(&mut second, &wake);
        policy.blocked.store(false, Ordering::SeqCst);
        pending(&mut second, &wake);
        assert!(source.calls.lock().unwrap().is_empty());
        pending(&mut first, &wake);
        assert_eq!(*source.calls.lock().unwrap(), ["submit"]);
        assert_eq!(policy.capacity.lock().unwrap().requests, 1);
        if enter_suffix {
            pending(&mut second, &wake);
            assert_eq!(*source.calls.lock().unwrap(), ["submit", "submit"]);
            assert_eq!(policy.capacity.lock().unwrap().requests, 0);
        }
        drop(first);
        if enter_suffix {
            pending(&mut second, &wake);
            drop(second);
        } else {
            assert!(matches!(ready(second), Err(PolicyError::Terminal)));
            assert_eq!(*source.calls.lock().unwrap(), ["submit"]);
        }
        assert_eq!(
            source.observation.drops.load(Ordering::SeqCst),
            if enter_suffix { 2 } else { 1 }
        );
        assert!(matches!(
            ready(clone.submit(submission())),
            Err(PolicyError::Terminal)
        ));

        let session = PolicySession::new(source.clone(), policy.clone());
        source.pending_submit.store(false, Ordering::SeqCst);
        source_error(ready(session.submit(submission())), &source.error);
        assert!(matches!(
            ready(session.clone().submit(submission())),
            Err(PolicyError::Terminal)
        ));
        assert_eq!(policy.capacity.lock().unwrap().requests, 0);
    }
}

#[test]
fn canceling_a_pre_source_head_releases_the_next_turn_without_revoking_authority() {
    let source = TestSession::new();
    source.successful_submit.store(true, Ordering::SeqCst);
    let policy = TestPolicy::new(2, 14);
    policy.blocked.store(true, Ordering::SeqCst);
    let session = PolicySession::new(source.clone(), policy.clone());
    let mut first = session.submit(submission());
    let mut second = session.submit(submission());
    let wake = Arc::<WakeCount>::default();
    pending(&mut first, &Arc::default());
    pending(&mut second, &wake);
    drop(first);
    assert_eq!(wake.0.load(Ordering::SeqCst), 1);
    assert_eq!(policy.capacity.lock().unwrap().requests, 1);
    policy.blocked.store(false, Ordering::SeqCst);
    assert_eq!(ready(second).unwrap(), EventPosition::new(8));
    assert_eq!(*source.calls.lock().unwrap(), ["submit"]);
    assert_eq!(policy.capacity.lock().unwrap().requests, 0);
}

#[test]
fn source_failure_rejects_a_queued_suffix_and_close_does_not_cancel_entered_work() {
    let source = TestSession::new();
    let policy = TestPolicy::new(2, 14);
    policy.blocked.store(true, Ordering::SeqCst);
    let session = PolicySession::new(source.clone(), policy.clone());
    let mut first = session.submit(submission());
    let mut second = session.submit(submission());
    pending(&mut first, &Arc::default());
    pending(&mut second, &Arc::default());
    policy.blocked.store(false, Ordering::SeqCst);
    source_error(ready(first), &source.error);
    assert!(matches!(ready(second), Err(PolicyError::Terminal)));
    assert_eq!(*source.calls.lock().unwrap(), ["submit"]);

    let session = PolicySession::new(source.clone(), policy);
    source.pending_submit.store(true, Ordering::SeqCst);
    let mut entered = session.submit(submission());
    pending(&mut entered, &Arc::default());
    let mut close = session.close();
    pending(&mut close, &Arc::default());
    drop(close);
    assert_eq!(source.observation.drops.load(Ordering::SeqCst), 1);
    pending(&mut entered, &Arc::default());
    assert_eq!(source.observation.drops.load(Ordering::SeqCst), 1);
    drop(entered);
    assert_eq!(source.observation.drops.load(Ordering::SeqCst), 2);
}

#[test]
fn policy_wait_failure_is_terminal_but_does_not_touch_source() {
    let source = TestSession::new();
    let policy = TestPolicy::new(1, 7);
    policy.fail_wait.store(true, Ordering::SeqCst);
    let session = PolicySession::new(source.clone(), policy.clone());
    assert!(matches!(
        ready(session.submit(submission())),
        Err(PolicyError::Policy(Refused))
    ));
    assert!(matches!(
        ready(session.clone().submit(submission())),
        Err(PolicyError::Terminal)
    ));
    assert!(source.calls.lock().unwrap().is_empty());
    assert_eq!(policy.capacity.lock().unwrap().requests, 0);
}

#[test]
fn all_facets_preserve_source_errors_and_control_bypasses_pressure() {
    let source = TestSession::new();
    let policy = TestPolicy::new(1, 100);
    let wrapped = PolicySession::new(source.clone(), policy.clone());
    let session = session_object(&wrapped);
    source_error(
        ready(session.put_blob(Bytes::from_static(b"payload"))),
        &source.error,
    );
    source_error(
        ready(session.put_directory(BlobDirectory::default())),
        &source.error,
    );
    assert_eq!(policy.capacity.lock().unwrap().requests, 0);
    policy.blocked.store(true, Ordering::SeqCst);
    source_error(
        ready(session.get_blob(BlobId::for_bytes(b"payload"))),
        &source.error,
    );
    source_error(
        ready(session.get_directory(BlobDirectoryId::for_encoded_bytes(b"directory"))),
        &source.error,
    );
    source_error(
        ready(session.resolve_tree(BlobTreeId::Blob(BlobId::for_bytes(b"payload")))),
        &source.error,
    );
    source_error(
        ready(session.resolve_position(EventPosition::new(7))),
        &source.error,
    );
    source_error(
        ready(session.announce_membership(Bytes::from_static(b"metadata"))),
        &source.error,
    );
    source_error(
        ready(session.coordinate_snapshots(SnapshotParticipation::SeaSelected)),
        &source.error,
    );
    source_error(
        ready(session.publish_snapshot(Some(EventPosition::new(3)), Some(13), source.snapshot())),
        &source.error,
    );
    source_error(ready(session.revoke_snapshot_publisher()), &source.error);
    assert_eq!(policy.acquisitions.load(Ordering::SeqCst), 2);
}

/// Source stream yields progress, then an error or completion, without self-releasing.
struct TerminatingStream {
    /// Current source observation must survive termination.
    progress: MonitoredStreamProgress<EventPosition>,
    /// Original classified error payload, or graceful completion when absent.
    error: Option<TestError>,
    /// Number of polls, selecting the progress/termination steps.
    polls: usize,
    /// Confirms the wrapper releases the source immediately on observed termination.
    drops: Arc<AtomicUsize>,
}

impl Drop for TerminatingStream {
    fn drop(&mut self) {
        self.drops.fetch_add(1, Ordering::SeqCst);
    }
}

impl Stream for TerminatingStream {
    type Item = Result<MonitoredStreamItem<SessionCommittedEvent, EventPosition>, TestError>;

    fn poll_next(mut self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.polls += 1;
        if self.polls == 1 {
            Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(
                self.progress.clone(),
            ))))
        } else if let Some(error) = &self.error {
            Poll::Ready(Some(Err(error.clone())))
        } else {
            self.progress.status = MonitoredStreamStatus::AwaitingNewItems;
            Poll::Ready(None)
        }
    }
}

impl MonitoredStream for TerminatingStream {
    type Data = SessionCommittedEvent;
    type Position = EventPosition;
    type Error = TestError;

    fn progress(&self) -> MonitoredStreamProgress<EventPosition> {
        self.progress.clone()
    }
}

#[test]
fn stream_maps_progress_and_classified_failure_then_immediately_releases_source() {
    let source = TestSession::new();
    let drops = Arc::new(AtomicUsize::new(0));
    let progress = MonitoredStreamProgress {
        previous: Some(EventPosition::new(7)),
        latest_known: Some(EventPosition::new(11)),
        status: MonitoredStreamStatus::FallenBehind,
    };
    *source.stream.lock().unwrap() = Some(Box::pin(TerminatingStream {
        progress: progress.clone(),
        error: Some(source.error.clone()),
        polls: 0,
        drops: drops.clone(),
    }));
    let policy = TestPolicy::new(1, 7);
    let session = PolicySession::new(source.clone(), policy.clone());
    let mut stream = session.read(Some(EventPosition::new(7)), None);
    assert_eq!(policy.readers.load(Ordering::SeqCst), 1);
    assert_eq!(stream.progress(), progress);
    assert!(
        matches!(ready(Box::pin(stream.next())), Some(Ok(MonitoredStreamItem::Progress(value))) if value == progress)
    );
    source_error(ready(Box::pin(stream.next())).unwrap(), &source.error);
    assert_eq!(drops.load(Ordering::SeqCst), 1);
    assert_eq!(policy.readers.load(Ordering::SeqCst), 0);
    assert_eq!(stream.progress(), progress);
    assert!(ready(Box::pin(stream.next())).is_none());
}

#[test]
fn stream_end_releases_source_and_reader_permit_and_preserves_final_progress() {
    let source = TestSession::new();
    let drops = Arc::new(AtomicUsize::new(0));
    let mut progress = MonitoredStreamProgress {
        previous: Some(EventPosition::new(7)),
        latest_known: Some(EventPosition::new(7)),
        status: MonitoredStreamStatus::StreamingBacklog,
    };
    *source.stream.lock().unwrap() = Some(Box::pin(TerminatingStream {
        progress: progress.clone(),
        error: None,
        polls: 0,
        drops: drops.clone(),
    }));
    let policy = TestPolicy::new(1, 7);
    let session = PolicySession::new(source, policy.clone());
    let mut stream = session.read(Some(EventPosition::new(7)), None);
    assert_eq!(policy.readers.load(Ordering::SeqCst), 1);
    assert!(
        matches!(ready(Box::pin(stream.next())), Some(Ok(MonitoredStreamItem::Progress(value))) if value == progress)
    );
    assert_eq!(drops.load(Ordering::SeqCst), 0);
    assert!(ready(Box::pin(stream.next())).is_none());
    assert_eq!(drops.load(Ordering::SeqCst), 1);
    assert_eq!(policy.readers.load(Ordering::SeqCst), 0);
    progress.status = MonitoredStreamStatus::AwaitingNewItems;
    assert_eq!(stream.progress(), progress);
    assert!(ready(Box::pin(stream.next())).is_none());
    assert_eq!(drops.load(Ordering::SeqCst), 1);
}
