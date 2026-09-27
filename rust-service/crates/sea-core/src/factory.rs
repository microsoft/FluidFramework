//! Document boundaries for constructing decorated sessions.
//!
//! Pass-through preserves the source's open, cancellation, and close behavior.
//! It adds no cleanup owner: dropping a factory, session, or operation does not promise closure.

use async_trait::async_trait;
use bytes::Bytes;

use crate::storage::{ArchiveStream, LoadStart, Snapshot};
use crate::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, EventPosition, EventSubmission, SeaArchive,
    SeaAuthorSession, SeaService, SeaSession, SeaSnapshotCoordinator, SessionCommittedEvent,
    SessionId, SessionLoad, SessionStream, SnapshotCoordination, SnapshotParticipation,
};

#[cfg(not(target_arch = "wasm32"))]
/// The existing native session future representation, returned without another allocation.
pub type SessionFuture<'a, T> = futures_util::future::BoxFuture<'a, T>;

#[cfg(target_arch = "wasm32")]
/// The existing browser session future representation, which need not be `Send`.
pub type SessionFuture<'a, T> = futures_util::future::LocalBoxFuture<'a, T>;

/// A constructed session and its source-allocated identity.
///
/// Ownership passes to the caller when open completes.
/// This value adds no automatic close behavior to its session.
pub struct OpenedSession<S> {
    /// Document-scoped identity assigned by the underlying source.
    pub id: SessionId,
    /// Session capabilities, including any ownership supplied by a decorator.
    pub session: S,
}

/// Opens sessions for one document before an outer factory decorates them.
///
/// Implementations define cancellation and cleanup while an open is pending.
/// A decorator must retain those semantics or explicitly document a stronger ownership contract.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SessionFactory: SeaService {
    /// Complete session facets with the source's classified error.
    type Session: SeaSession<Error = Self::Error>;

    /// Opens a session using the caller's known reference state.
    ///
    /// # Errors
    /// Returns the implementation's open failure without implying that cancellation rolls back work.
    async fn open_session(
        &self,
        reference: Option<EventPosition>,
    ) -> Result<OpenedSession<Self::Session>, Self::Error>;
}

/// A document factory that opens its source before decorating the completed session.
///
/// No suspension occurs between source completion and wrapping its result.
/// Pending-open cancellation, including any retained source work, remains the source's responsibility.
#[derive(Clone)]
pub struct PassThroughFactory<Source> {
    /// Source retained for subsequent document-scoped opens.
    source: Source,
}

impl<Source> PassThroughFactory<Source> {
    /// Retains a source without opening a session.
    #[must_use]
    pub const fn new(source: Source) -> Self {
        Self { source }
    }
}

impl<Source: SessionFactory> SeaService for PassThroughFactory<Source> {
    type Error = Source::Error;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Source: SessionFactory> SessionFactory for PassThroughFactory<Source> {
    type Session = PassThroughSession<Source::Session>;

    async fn open_session(
        &self,
        reference: Option<EventPosition>,
    ) -> Result<OpenedSession<Self::Session>, Self::Error> {
        let opened = self.source.open_session(reference).await?;
        Ok(OpenedSession {
            id: opened.id,
            session: PassThroughSession::new(opened.session),
        })
    }
}

/// Forwards all session facets without changing handles, streams, or classified errors.
///
/// Cloning clones only the source; no independent membership or cleanup owner is created.
/// The desugared `async_trait` signatures return the source future directly, avoiding another
/// future box and preserving its polling and cancellation boundary.
#[derive(Clone)]
pub struct PassThroughSession<S> {
    /// Capabilities and ownership remain with the underlying session.
    source: S,
}

impl<S> PassThroughSession<S> {
    /// Decorates an existing session without changing its lifetime or close behavior.
    #[must_use]
    pub const fn new(source: S) -> Self {
        Self { source }
    }
}

impl<S: SeaSession> SeaService for PassThroughSession<S> {
    type Error = S::Error;
}

impl<S: SeaSession> SeaArchive for PassThroughSession<S> {
    type BlobHandle = S::BlobHandle;
    type EventHandle = S::EventHandle;

    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<SessionCommittedEvent, EventPosition, Self::Error> {
        self.source.read(after, stop_after)
    }

    fn load<'life0, 'async_trait>(
        &'life0 self,
        start: LoadStart,
    ) -> SessionFuture<
        'async_trait,
        Result<SessionLoad<Self::BlobHandle, Self::EventHandle, Self::Error>, Self::Error>,
    >
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.load(start)
    }

    fn get_snapshot<'life0, 'async_trait>(
        &'life0 self,
        start: LoadStart,
    ) -> SessionFuture<
        'async_trait,
        Result<Option<Snapshot<Self::BlobHandle, Self::EventHandle>>, Self::Error>,
    >
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.get_snapshot(start)
    }

    fn put_blob<'life0, 'async_trait>(
        &'life0 self,
        payload: Bytes,
    ) -> SessionFuture<'async_trait, Result<Self::BlobHandle, Self::Error>>
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.put_blob(payload)
    }

    fn get_blob<'life0, 'async_trait>(
        &'life0 self,
        id: BlobId,
    ) -> SessionFuture<'async_trait, Result<Bytes, Self::Error>>
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.get_blob(id)
    }

    fn put_directory<'life0, 'async_trait>(
        &'life0 self,
        directory: BlobDirectory,
    ) -> SessionFuture<'async_trait, Result<Self::BlobHandle, Self::Error>>
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.put_directory(directory)
    }

    fn get_directory<'life0, 'async_trait>(
        &'life0 self,
        id: BlobDirectoryId,
    ) -> SessionFuture<'async_trait, Result<BlobDirectory, Self::Error>>
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.get_directory(id)
    }

    fn resolve_tree<'life0, 'async_trait>(
        &'life0 self,
        id: BlobTreeId,
    ) -> SessionFuture<'async_trait, Result<Option<Self::BlobHandle>, Self::Error>>
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.resolve_tree(id)
    }

    fn resolve_position<'life0, 'async_trait>(
        &'life0 self,
        position: EventPosition,
    ) -> SessionFuture<'async_trait, Result<Option<Self::EventHandle>, Self::Error>>
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.resolve_position(position)
    }
}

impl<S: SeaSession> SeaAuthorSession for PassThroughSession<S> {
    fn announce_membership<'life0, 'async_trait>(
        &'life0 self,
        metadata: Bytes,
    ) -> SessionFuture<'async_trait, Result<EventPosition, Self::Error>>
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.announce_membership(metadata)
    }

    fn submit<'life0, 'async_trait>(
        &'life0 self,
        submission: EventSubmission,
    ) -> SessionFuture<'async_trait, Result<EventPosition, Self::Error>>
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.submit(submission)
    }

    fn close<'life0, 'async_trait>(
        &'life0 self,
    ) -> SessionFuture<'async_trait, Result<(), Self::Error>>
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.close()
    }
}

impl<S: SeaSession> SeaSnapshotCoordinator for PassThroughSession<S> {
    fn coordinate_snapshots<'life0, 'async_trait>(
        &'life0 self,
        participation: SnapshotParticipation,
    ) -> SessionFuture<
        'async_trait,
        Result<SessionStream<SnapshotCoordination, Self::Error>, Self::Error>,
    >
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.coordinate_snapshots(participation)
    }

    fn publish_snapshot<'life0, 'async_trait>(
        &'life0 self,
        expected_parent: Option<EventPosition>,
        fence: Option<u64>,
        snapshot: Snapshot<Self::BlobHandle, Self::EventHandle>,
    ) -> SessionFuture<
        'async_trait,
        Result<Snapshot<Self::BlobHandle, Self::EventHandle>, Self::Error>,
    >
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source
            .publish_snapshot(expected_parent, fence, snapshot)
    }

    fn revoke_snapshot_publisher<'life0, 'async_trait>(
        &'life0 self,
    ) -> SessionFuture<'async_trait, Result<(), Self::Error>>
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        self.source.revoke_snapshot_publisher()
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fmt,
        future::Future,
        pin::Pin,
        sync::{
            Arc, Mutex,
            atomic::{AtomicUsize, Ordering},
        },
        task::{Context, Poll},
    };

    use futures_core::Stream;
    use futures_util::task::noop_waker;

    use super::*;
    use crate::{
        ClassifiedError, ErrorKind, Event, MonitoredStream, MonitoredStreamItem,
        MonitoredStreamProgress, MonitoredStreamStatus, storage::StorageHandle,
    };

    /// Sentinel error whose shared payload must survive forwarding.
    #[derive(Clone, Debug)]
    struct TestError(Arc<()>);

    impl fmt::Display for TestError {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("sentinel ambiguity")
        }
    }

    impl std::error::Error for TestError {}

    impl ClassifiedError for TestError {
        fn kind(&self) -> ErrorKind {
            ErrorKind::Ambiguous
        }
    }

    /// Availability evidence with allocation identity distinct from its serializable identity.
    #[derive(Clone)]
    struct TestHandle<Id> {
        /// Value visible on the wire.
        id: Id,
        /// Evidence retained by the concrete handle.
        evidence: Arc<()>,
    }

    impl<Id: Copy + Send + Sync + 'static> StorageHandle for TestHandle<Id> {
        type Id = Id;

        fn id(&self) -> Id {
            self.id
        }
    }

    /// Snapshot retaining both concrete capability types.
    type TestSnapshot = Snapshot<TestHandle<BlobTreeId>, TestHandle<EventPosition>>;

    /// Instrumentation owned only by the test source, never by the decorator.
    #[derive(Default)]
    struct Observation {
        /// Data address of the boxed pending operation issued by the source.
        future_address: AtomicUsize,
        /// Source-operation polls performed by the caller.
        polls: AtomicUsize,
        /// Source futures dropped by the caller.
        drops: AtomicUsize,
    }

    /// Pending source operation with observable polling and cancellation.
    struct PendingOperation {
        /// Source-owned instrumentation retained across caller cancellation.
        observation: Arc<Observation>,
        #[cfg(target_arch = "wasm32")]
        /// Forces the browser operation itself to remain non-`Send`.
        _local: std::rc::Rc<()>,
    }

    impl Future for PendingOperation {
        type Output = Result<(), TestError>;

        fn poll(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Self::Output> {
            self.observation.polls.fetch_add(1, Ordering::SeqCst);
            Poll::Pending
        }
    }

    impl Drop for PendingOperation {
        fn drop(&mut self) {
            self.observation.drops.fetch_add(1, Ordering::SeqCst);
        }
    }

    /// Source stream with non-default progress and observable subscription drop.
    struct TestStream {
        /// Counts subscription destruction without requiring a poll.
        drops: Arc<AtomicUsize>,
    }

    impl Stream for TestStream {
        type Item = Result<MonitoredStreamItem<SessionCommittedEvent, EventPosition>, TestError>;

        fn poll_next(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Option<Self::Item>> {
            Poll::Pending
        }
    }

    impl MonitoredStream for TestStream {
        type Data = SessionCommittedEvent;
        type Position = EventPosition;
        type Error = TestError;

        fn progress(&self) -> MonitoredStreamProgress<EventPosition> {
            MonitoredStreamProgress {
                previous: Some(EventPosition::new(7)),
                latest_known: Some(EventPosition::new(11)),
                status: MonitoredStreamStatus::FallenBehind,
            }
        }
    }

    impl Drop for TestStream {
        fn drop(&mut self) {
            self.drops.fetch_add(1, Ordering::SeqCst);
        }
    }

    /// Cloneable source with concrete handles and browser-local ownership.
    #[derive(Clone)]
    struct TestSession {
        /// Pending close observations shared by source clones.
        observation: Arc<Observation>,
        /// Exact source subscription moved out by read or load.
        stream: Arc<Mutex<Option<ArchiveStream<SessionCommittedEvent, EventPosition, TestError>>>>,
        /// Capability evidence returned by snapshot selection.
        evidence: Arc<()>,
        /// Unchanged classified failure from the other facets.
        error: TestError,
        /// Records source entry for policy admission tests.
        calls: Arc<Mutex<Vec<&'static str>>>,
        /// Makes submit suspend after source entry for cancellation and ordering tests.
        pending_submit: Arc<std::sync::atomic::AtomicBool>,
        /// Suspends snapshot/load creation before source subscription registration.
        pending_load: Arc<std::sync::atomic::AtomicBool>,
        /// Returns a load failure before creating a source subscription.
        failed_load: Arc<std::sync::atomic::AtomicBool>,
        /// Makes a nonpending submit succeed rather than return the sentinel error.
        successful_submit: Arc<std::sync::atomic::AtomicBool>,
        #[cfg(target_arch = "wasm32")]
        /// Demonstrates that neither the factory nor decorator adds native bounds in browsers.
        local: std::rc::Rc<()>,
    }

    impl TestSession {
        /// Creates a source without an initialized subscription.
        fn new() -> Self {
            Self {
                observation: Arc::default(),
                stream: Arc::default(),
                evidence: Arc::default(),
                error: TestError(Arc::default()),
                calls: Arc::default(),
                pending_submit: Arc::default(),
                pending_load: Arc::default(),
                failed_load: Arc::default(),
                successful_submit: Arc::default(),
                #[cfg(target_arch = "wasm32")]
                local: std::rc::Rc::default(),
            }
        }

        /// Mints fixture capabilities without erasing their evidence.
        fn snapshot(&self) -> TestSnapshot {
            Snapshot {
                root: TestHandle {
                    id: BlobTreeId::Blob(BlobId::for_bytes(b"state")),
                    evidence: self.evidence.clone(),
                },
                at_event: TestHandle {
                    id: EventPosition::new(7),
                    evidence: self.evidence.clone(),
                },
            }
        }

        /// Creates a source-owned operation used to observe future forwarding and abandonment.
        fn pending_operation(&self) -> SessionFuture<'static, Result<(), TestError>> {
            let future = Box::pin(PendingOperation {
                observation: self.observation.clone(),
                #[cfg(target_arch = "wasm32")]
                _local: self.local.clone(),
            });
            self.observation.future_address.store(
                std::ptr::from_ref(&*future).cast::<()>() as usize,
                Ordering::SeqCst,
            );
            future
        }
    }

    impl SeaService for TestSession {
        type Error = TestError;
    }

    #[cfg_attr(not(target_arch = "wasm32"), async_trait)]
    #[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
    impl SeaArchive for TestSession {
        type BlobHandle = TestHandle<BlobTreeId>;
        type EventHandle = TestHandle<EventPosition>;

        fn read(
            &self,
            after: Option<EventPosition>,
            stop_after: Option<EventPosition>,
        ) -> ArchiveStream<SessionCommittedEvent, EventPosition, Self::Error> {
            assert_eq!(after, Some(EventPosition::new(7)));
            assert!(stop_after.is_none() || stop_after == Some(EventPosition::new(11)));
            self.calls.lock().unwrap().push("read");
            self.stream.lock().unwrap().take().unwrap()
        }

        async fn load(
            &self,
            start: LoadStart,
        ) -> Result<SessionLoad<Self::BlobHandle, Self::EventHandle, Self::Error>, Self::Error>
        {
            self.calls.lock().unwrap().push("load");
            assert!(matches!(start, LoadStart::LatestSnapshot));
            if self.pending_load.load(Ordering::SeqCst) {
                self.pending_operation().await?;
            }
            if self.failed_load.load(Ordering::SeqCst) {
                return Err(self.error.clone());
            }
            Ok(SessionLoad {
                snapshot: Some(self.snapshot()),
                events: self.read(Some(EventPosition::new(7)), None),
            })
        }

        async fn get_snapshot(
            &self,
            start: LoadStart,
        ) -> Result<Option<TestSnapshot>, Self::Error> {
            assert!(matches!(start, LoadStart::Beginning));
            Err(self.error.clone())
        }

        async fn put_blob(&self, payload: Bytes) -> Result<Self::BlobHandle, Self::Error> {
            self.calls.lock().unwrap().push("put_blob");
            assert_eq!(payload, Bytes::from_static(b"payload"));
            Err(self.error.clone())
        }

        async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
            assert_eq!(id, BlobId::for_bytes(b"payload"));
            Err(self.error.clone())
        }

        async fn put_directory(
            &self,
            directory: BlobDirectory,
        ) -> Result<Self::BlobHandle, Self::Error> {
            self.calls.lock().unwrap().push("put_directory");
            assert_eq!(directory, BlobDirectory::default());
            Err(self.error.clone())
        }

        async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
            assert_eq!(id, BlobDirectoryId::for_encoded_bytes(b"directory"));
            Err(self.error.clone())
        }

        async fn resolve_tree(
            &self,
            id: BlobTreeId,
        ) -> Result<Option<Self::BlobHandle>, Self::Error> {
            assert_eq!(id, BlobTreeId::Blob(BlobId::for_bytes(b"payload")));
            Err(self.error.clone())
        }

        async fn resolve_position(
            &self,
            position: EventPosition,
        ) -> Result<Option<Self::EventHandle>, Self::Error> {
            assert_eq!(position, EventPosition::new(7));
            Err(self.error.clone())
        }
    }

    #[cfg_attr(not(target_arch = "wasm32"), async_trait)]
    #[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
    impl SeaAuthorSession for TestSession {
        async fn announce_membership(&self, metadata: Bytes) -> Result<EventPosition, Self::Error> {
            assert_eq!(metadata, Bytes::from_static(b"metadata"));
            Err(self.error.clone())
        }

        async fn submit(&self, submission: EventSubmission) -> Result<EventPosition, Self::Error> {
            self.calls.lock().unwrap().push("submit");
            assert_eq!(submission.reference, Some(EventPosition::new(7)));
            assert_eq!(submission.event.payload, Bytes::from_static(b"payload"));
            assert_eq!(submission.event.blob_tree, None);
            if self.pending_submit.load(Ordering::SeqCst) {
                self.pending_operation().await?;
            }
            if self.successful_submit.load(Ordering::SeqCst) {
                return Ok(EventPosition::new(8));
            }
            Err(self.error.clone())
        }

        fn close<'life0, 'async_trait>(
            &'life0 self,
        ) -> SessionFuture<'async_trait, Result<(), Self::Error>>
        where
            'life0: 'async_trait,
            Self: 'async_trait,
        {
            self.calls.lock().unwrap().push("close");
            self.pending_operation()
        }
    }

    #[cfg_attr(not(target_arch = "wasm32"), async_trait)]
    #[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
    impl SeaSnapshotCoordinator for TestSession {
        async fn coordinate_snapshots(
            &self,
            participation: SnapshotParticipation,
        ) -> Result<SessionStream<SnapshotCoordination, Self::Error>, Self::Error> {
            assert_eq!(participation, SnapshotParticipation::SeaSelected);
            Err(self.error.clone())
        }

        async fn publish_snapshot(
            &self,
            expected_parent: Option<EventPosition>,
            fence: Option<u64>,
            snapshot: TestSnapshot,
        ) -> Result<TestSnapshot, Self::Error> {
            assert_eq!(expected_parent, Some(EventPosition::new(3)));
            assert_eq!(fence, Some(13));
            assert!(Arc::ptr_eq(&snapshot.root.evidence, &self.evidence));
            assert!(Arc::ptr_eq(&snapshot.at_event.evidence, &self.evidence));
            Err(self.error.clone())
        }

        async fn revoke_snapshot_publisher(&self) -> Result<(), Self::Error> {
            Err(self.error.clone())
        }
    }

    /// Source whose open uses the same browser-local owner as its sessions.
    struct TestFactory(TestSession);

    impl SeaService for TestFactory {
        type Error = TestError;
    }

    #[cfg_attr(not(target_arch = "wasm32"), async_trait)]
    #[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
    impl SessionFactory for TestFactory {
        type Session = TestSession;

        async fn open_session(
            &self,
            reference: Option<EventPosition>,
        ) -> Result<OpenedSession<Self::Session>, Self::Error> {
            self.0.calls.lock().unwrap().push("open");
            if reference.is_none() {
                return Err(self.0.error.clone());
            }
            if reference == Some(EventPosition::new(8)) {
                self.0.pending_operation().await?;
            }
            assert_eq!(reference, Some(EventPosition::new(7)));
            Ok(OpenedSession {
                id: SessionId::new(19).unwrap(),
                session: self.0.clone(),
            })
        }
    }

    /// Polls a fixture operation known to complete without an executor.
    fn ready<T>(mut future: SessionFuture<'_, T>) -> T {
        match future
            .as_mut()
            .poll(&mut Context::from_waker(&noop_waker()))
        {
            Poll::Ready(value) => value,
            Poll::Pending => panic!("fixture unexpectedly suspended"),
        }
    }

    /// Checks object safety without erasing either associated availability handle.
    fn factory_object<F: SessionFactory>(
        factory: &F,
    ) -> &dyn SessionFactory<Error = F::Error, Session = F::Session> {
        factory
    }

    /// Checks clone ownership and session-object availability for any concrete handle types.
    fn session_object<S: SeaSession + Clone>(
        session: &S,
    ) -> &dyn SeaSession<Error = S::Error, BlobHandle = S::BlobHandle, EventHandle = S::EventHandle>
    {
        session
    }

    #[path = "policy_tests.rs"]
    mod policy_tests;

    /// Confirms that a source failure retains both classification and its payload allocation.
    fn assert_error<T>(result: Result<T, TestError>, expected: &TestError) {
        let Err(error) = result else {
            panic!("source failure was not forwarded");
        };
        assert_eq!(error.kind(), ErrorKind::Ambiguous);
        assert!(Arc::ptr_eq(&error.0, &expected.0));
    }

    #[test]
    fn factory_and_dynamic_facets_preserve_identity_capabilities_and_errors() {
        let source = TestSession::new();
        let factory = PassThroughFactory::new(TestFactory(source.clone()));
        let object = factory_object(&factory);
        assert_error(ready(object.open_session(None)), &source.error);
        let opened = ready(object.open_session(Some(EventPosition::new(7)))).unwrap();
        assert_eq!(opened.id, SessionId::new(19).unwrap());
        let clone = opened.session.clone();
        drop(opened);
        let session = session_object(&clone);
        assert_error(
            ready(session.get_snapshot(LoadStart::Beginning)),
            &source.error,
        );
        assert_error(
            ready(session.put_blob(Bytes::from_static(b"payload"))),
            &source.error,
        );
        assert_error(
            ready(session.get_blob(BlobId::for_bytes(b"payload"))),
            &source.error,
        );
        assert_error(
            ready(session.put_directory(BlobDirectory::default())),
            &source.error,
        );
        assert_error(
            ready(session.get_directory(BlobDirectoryId::for_encoded_bytes(b"directory"))),
            &source.error,
        );
        assert_error(
            ready(session.resolve_tree(BlobTreeId::Blob(BlobId::for_bytes(b"payload")))),
            &source.error,
        );
        assert_error(
            ready(session.resolve_position(EventPosition::new(7))),
            &source.error,
        );
        assert_error(
            ready(session.announce_membership(Bytes::from_static(b"metadata"))),
            &source.error,
        );
        assert_error(
            ready(session.submit(EventSubmission {
                reference: Some(EventPosition::new(7)),
                event: Event {
                    payload: Bytes::from_static(b"payload"),
                    blob_tree: None,
                },
            })),
            &source.error,
        );
        assert_error(
            ready(session.coordinate_snapshots(SnapshotParticipation::SeaSelected)),
            &source.error,
        );
        assert_error(
            ready(session.publish_snapshot(
                Some(EventPosition::new(3)),
                Some(13),
                source.snapshot(),
            )),
            &source.error,
        );
        assert_error(ready(session.revoke_snapshot_publisher()), &source.error);
    }

    #[test]
    fn abandoning_an_open_cancels_only_the_source_operation() {
        let source = TestSession::new();
        let factory = PassThroughFactory::new(TestFactory(source.clone()));
        let mut opening = factory.open_session(Some(EventPosition::new(8)));
        assert_eq!(source.observation.polls.load(Ordering::SeqCst), 0);
        assert!(
            opening
                .as_mut()
                .poll(&mut Context::from_waker(&noop_waker()))
                .is_pending()
        );
        assert_eq!(source.observation.polls.load(Ordering::SeqCst), 1);
        drop(opening);
        assert_eq!(source.observation.drops.load(Ordering::SeqCst), 1);
        drop(factory);
        assert_eq!(source.observation.drops.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn close_returns_the_source_future_and_preserves_poll_and_drop_boundaries() {
        let source = TestSession::new();
        let session = PassThroughSession::new(source.clone());
        let mut future = session.close();
        assert_eq!(
            std::ptr::from_ref(&*future).cast::<()>() as usize,
            source.observation.future_address.load(Ordering::SeqCst),
        );
        assert_eq!(source.observation.polls.load(Ordering::SeqCst), 0);
        assert!(
            future
                .as_mut()
                .poll(&mut Context::from_waker(&noop_waker()))
                .is_pending()
        );
        assert_eq!(source.observation.polls.load(Ordering::SeqCst), 1);
        drop(future);
        assert_eq!(source.observation.drops.load(Ordering::SeqCst), 1);
        drop(session);
        assert_eq!(source.observation.drops.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn reads_and_loads_return_the_same_subscription_and_capability_allocations() {
        let source = TestSession::new();
        let session = PassThroughSession::new(source.clone());
        for load in [false, true] {
            let drops = Arc::new(AtomicUsize::new(0));
            let stream = Box::pin(TestStream {
                drops: drops.clone(),
            });
            let address = std::ptr::from_ref(&*stream).cast::<()>();
            *source.stream.lock().unwrap() = Some(stream);
            let events = if load {
                let loaded = ready(session.load(LoadStart::LatestSnapshot)).unwrap();
                let snapshot = loaded.snapshot.unwrap();
                assert!(Arc::ptr_eq(&snapshot.root.evidence, &source.evidence));
                assert!(Arc::ptr_eq(&snapshot.at_event.evidence, &source.evidence));
                loaded.events
            } else {
                session.read(Some(EventPosition::new(7)), None)
            };
            assert_eq!(std::ptr::from_ref(&*events).cast::<()>(), address);
            assert_eq!(
                events.progress().status,
                MonitoredStreamStatus::FallenBehind
            );
            assert_eq!(events.progress().previous, Some(EventPosition::new(7)));
            assert_eq!(events.progress().latest_known, Some(EventPosition::new(11)));
            assert_eq!(drops.load(Ordering::SeqCst), 0);
            drop(events);
            assert_eq!(drops.load(Ordering::SeqCst), 1);
        }
    }
}
