//! Cross-crate scenarios for independently selected session decorator stacks.
//!
//! See `sea-integration-tests/README.md` for scenarios, layer configurations, and coverage limits.
//! Reconnects rebuild memberships, decorators, and connections over a retained in-memory sequencer;
//! they do not restart the service or test durable recovery.
//!
//! # Reading this test
//!
//! Start with the `configurations!` invocation at the bottom: each row is one Cargo test.
//! `stack!` builds that row's concrete session type; `configurations!` first checks its
//! network path on a disposable document, then runs every workflow in `SCENARIOS` on fresh documents.
//! The transport-path probe is separate so its successful submissions cannot seed a scenario's history.
//!
//! `Fixture` and `TestHost` own the setup, not the expected behavior.
//! The single-author workflows use `write_trace` and `after_reconnect`.
//! The two-author workflows use `collaborate`, with one round for collaboration and four for stress.
//! Its helpers separate content checks, concurrent submissions, snapshot authority, and reconnect loading.
//!
//! Expectations retain original plaintext submissions, not copies of received events.
//! Concurrent receipt positions determine the expected order because either author may win a race.
//! Progress notifications are not events; `next_event` skips them, while bounded history checks
//! also consume the stream to completion to catch unexpected extra events.

use std::{
    panic::AssertUnwindSafe,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::Duration,
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{FutureExt, StreamExt, future::BoxFuture, stream};
use sea_compression::CompressionSession;
use sea_core::{
    BlobDirectory, BlobTreeId, ClassifiedError, ErrorKind, Event, EventPosition, EventSubmission,
    MonitoredStreamItem, MonitoredStreamStatus, SeaArchive, SeaAuthorSession, SeaSession,
    SessionCommittedEvent, SnapshotParticipation,
    storage::{LoadStart, SeaStorage, Snapshot, StorageHandle},
};
use sea_encryption::{ActiveKey, EncryptionKey, EncryptionSession, KeyId, KeyProvider};
use sea_memory::MemoryStorage;
use sea_sequencer::session::{LocalSequencer, LocalSession};
use sea_webtransport::{NativeSeaClient, NativeSessionOpen, protocol};
use sea_webtransport_server::{
    LivenessPolicy, SeaConnectionService, SeaResponseStream, SeaServiceHost, SessionDispatcher,
    ShutdownHandle, ShutdownMode, ShutdownOutcome, TransportConfig, WebTransportError,
    WebTransportServer,
};
use tokio::{task::JoinHandle, time::timeout};
use wtransport::Identity;

/// Independent workflows run against every layer configuration.
#[derive(Clone, Copy, Debug)]
enum Scenario {
    /// Opening and closing must work without content or snapshot registrations.
    OpenClose,
    /// Content, snapshot publication, bounded replay, and live delivery round-trip.
    EventsAndSnapshots,
    /// Fresh memberships and transport connections retain history and renew publication authority.
    Reconnect,
    /// Independent authors observe the same order and exchange snapshot content.
    Collaboration,
    /// Concurrent batches, snapshot history, and repeated peer reconnects share one document.
    CollaborationStress,
}

/// Keep scenarios separate from the layer table below.
const SCENARIOS: [Scenario; 5] = [
    Scenario::OpenClose,
    Scenario::EventsAndSnapshots,
    Scenario::Reconnect,
    Scenario::Collaboration,
    Scenario::CollaborationStress,
];

/// Fixed test-only keys survive reconstruction of all encryption layers.
#[derive(Clone)]
struct Keys;

impl KeyProvider for Keys {
    fn active_key(&self) -> Option<ActiveKey> {
        Some(ActiveKey {
            id: KeyId::new([1; 16]),
            key: EncryptionKey::new([7; 32]),
        })
    }

    fn key_for_id(&self, id: &KeyId) -> Option<EncryptionKey> {
        (*id == KeyId::new([1; 16])).then(|| EncryptionKey::new([7; 32]))
    }
}

/// One real loopback endpoint; abort on unwind so failed cases cannot leak servers.
struct Endpoint {
    /// Requests bounded graceful termination on the normal cleanup path.
    shutdown: ShutdownHandle,
    /// Owns the server and its connection tasks.
    task: JoinHandle<Result<ShutdownOutcome, WebTransportError>>,
}

impl Drop for Endpoint {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Server-side evidence and a rejection switch for one independently bound network hop.
#[derive(Default)]
struct HopProbe {
    /// Counts decoded submissions received from this endpoint's network connection.
    submissions: AtomicUsize,
    /// Stops submissions at this hop before dispatching to the next inner session.
    reject_submissions: AtomicBool,
}

/// A retained document and the transport hops belonging to one matrix cell.
///
/// Each author has its own fixture; peers share only the document and sequencer.
/// Rebuilding a stack advances `generation` and replaces membership, decorators, and connections.
/// Endpoint cleanup empties `endpoints`, but deliberately keeps `hops` so later assertions
/// include traffic from connections that were closed during earlier rounds.
struct Fixture {
    /// Shared authoritative state, retained across logical reconnects.
    runtime: Arc<LocalSequencer<MemoryStorage>>,
    /// Backend-assigned document identity returned by every proxy hop.
    document: Bytes,
    /// Identifies the author in hop-traffic assertion failures.
    author_label: &'static str,
    /// Fresh memberships prevent accidental reuse of connection-scoped authority.
    generation: usize,
    /// Endpoints in inner-to-outer construction order.
    endpoints: Vec<Endpoint>,
    /// Retains receipt evidence even after endpoints are stopped during reconnects.
    hops: Vec<Arc<HopProbe>>,
}

impl Fixture {
    /// Creates a fresh document for each scenario/configuration pair.
    async fn new() -> Self {
        let storage = MemoryStorage::new();
        let (document, view) = storage.create_view().await.unwrap();
        Self {
            runtime: LocalSequencer::<MemoryStorage>::recover(view)
                .await
                .unwrap(),
            document: document.as_bytes().clone(),
            author_label: "primary",
            generation: 0,
            endpoints: Vec::new(),
            hops: Vec::new(),
        }
    }

    /// Shares document state, but not author membership, wrappers, or transport resources.
    fn peer(&self, author_label: &'static str) -> Self {
        Self {
            runtime: self.runtime.clone(),
            document: self.document.clone(),
            author_label,
            generation: 0,
            endpoints: Vec::new(),
            hops: Vec::new(),
        }
    }

    /// Opens a fresh author membership on the retained document.
    async fn open(&mut self) -> LocalSession<MemoryStorage> {
        self.generation += 1;
        self.runtime.open_session(None).await.unwrap()
    }

    /// Serves an arbitrary concrete session through a real native transport hop.
    ///
    /// The server owns the supplied inner stack; the returned client is the only way the
    /// outer stack reaches it. Repeating this creates a chain, not several clients of one server.
    async fn transport<Session: SeaSession + 'static>(
        &mut self,
        session: Session,
    ) -> NativeSeaClient {
        let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
        let certificate_hash = identity.certificate_chain().as_slice()[0].hash();
        let probe = Arc::new(HopProbe::default());
        let host = Arc::new(TestHost {
            document: self.document.clone(),
            dispatcher: Arc::new(SessionDispatcher::new(Arc::new(session))),
            probe: probe.clone(),
        });
        let server = WebTransportServer::bind(
            "127.0.0.1:0".parse().unwrap(),
            identity,
            host,
            TransportConfig::default(),
        )
        .unwrap();
        let address = server.local_addr().unwrap();
        self.hops.push(probe);
        self.endpoints.push(Endpoint {
            shutdown: server.shutdown_handle(),
            task: tokio::spawn(server.serve_until_shutdown()),
        });
        NativeSeaClient::connect(
            format!("https://{address}/sea"),
            certificate_hash,
            sea_webtransport::TransportConfig::default(),
            NativeSessionOpen {
                archive: self.document.clone(),
                intent: protocol::ArchiveIntent::Open,
                reference: None,
            },
        )
        .await
        .unwrap()
    }

    /// Requires the configured hop count on every connection generation and real submission traffic.
    fn verify_hop_traffic(&self, expected_hops: usize, scenario: Scenario) {
        assert_eq!(self.hops.len(), self.generation * expected_hops);
        if !matches!(scenario, Scenario::OpenClose) {
            for (index, hop) in self.hops.iter().enumerate() {
                assert!(
                    hop.submissions.load(Ordering::SeqCst) > 0,
                    "{} / {scenario:?}: hop {index} received no submissions",
                    self.author_label
                );
            }
        }
    }

    /// Stops outer hops before the upstream endpoints they depend on.
    async fn stop_endpoints(&mut self) {
        while let Some(mut endpoint) = self.endpoints.pop() {
            endpoint
                .shutdown
                .shutdown(ShutdownMode::Drain {
                    timeout: Duration::from_secs(2),
                })
                .unwrap();
            timeout(Duration::from_secs(3), &mut endpoint.task)
                .await
                .expect("server cleanup timed out")
                .expect("server task panicked")
                .expect("server failed");
        }
    }
}

/// A single-session test host; production dispatch still handles all data operations.
///
/// Membership is already established by `Fixture::open`, so this host supplies only the
/// opening handshake and delegates to that session's dispatcher, except for injected rejections.
/// It does not exercise the production host's authentication or reconnect-grace policy.
struct TestHost {
    /// Identity of the already-open document.
    document: Bytes,
    /// Can target a local session, decorated session, or another transport client.
    dispatcher: Arc<dyn SeaConnectionService>,
    /// Shared only with this endpoint's observer and its accepted connection handlers.
    probe: Arc<HopProbe>,
}

impl SeaServiceHost for TestHost {
    fn connect(&self, _liveness: LivenessPolicy) -> Arc<dyn SeaConnectionService> {
        Arc::new(TestHost {
            document: self.document.clone(),
            dispatcher: self.dispatcher.clone(),
            probe: self.probe.clone(),
        })
    }
}

#[async_trait]
impl SeaConnectionService for TestHost {
    async fn bind_session(
        self: Arc<Self>,
        authority: &[u8],
    ) -> Result<Arc<dyn SeaConnectionService>, protocol::Response> {
        assert_eq!(authority, b"composition-test");
        Ok(self)
    }

    async fn connection_closed(&self, allow_reconnect_grace: bool) {
        self.dispatcher
            .connection_closed(allow_reconnect_grace)
            .await;
    }

    async fn open_event_stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        let protocol::Request::OpenEventStream {
            archive,
            version,
            resume_after,
            ..
        } = request
        else {
            panic!("expected event-stream opening");
        };
        assert_eq!(archive, self.document);
        assert_eq!(version, protocol::PROTOCOL_VERSION);
        let opened = protocol::Response::EventStreamOpened {
            session: 1,
            document: self.document.to_vec(),
            authority: b"composition-test".to_vec(),
        };
        let events = self.dispatcher.event_stream(resume_after).await?;
        Ok(Box::pin(stream::once(async move { opened }).chain(events)))
    }

    async fn event_stream(
        &self,
        resume_after: Option<u64>,
    ) -> Result<SeaResponseStream, protocol::Response> {
        self.dispatcher.event_stream(resume_after).await
    }

    async fn author_request(&self, request: protocol::Request) -> protocol::Response {
        if matches!(&request, protocol::Request::Submit { .. }) {
            self.probe.submissions.fetch_add(1, Ordering::SeqCst);
            if self.probe.reject_submissions.load(Ordering::SeqCst) {
                return protocol::Response::Error {
                    kind: protocol::ErrorKind::Rejected,
                    message: "injected hop rejection".to_owned(),
                };
            }
        }
        if let protocol::Request::OpenAuthorStream { authority } = request {
            assert_eq!(authority, b"composition-test");
            protocol::Response::Acknowledged
        } else {
            self.dispatcher.author_request(request).await
        }
    }

    async fn snapshot_stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        self.dispatcher.snapshot_stream(request).await
    }

    async fn snapshot_request(&self, request: protocol::Request) -> protocol::Response {
        self.dispatcher.snapshot_request(request).await
    }

    async fn revoke_snapshot_publisher(&self) {
        self.dispatcher.revoke_snapshot_publisher().await;
    }

    async fn open_content_stream(&self, request: protocol::Request) -> protocol::Response {
        self.dispatcher.open_content_stream(request).await
    }

    async fn content_request(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        self.dispatcher.content_request(request).await
    }
}

/// Stored identities and original plaintext survive stack teardown; availability handles do not.
struct Trace {
    /// Original input retained for history and terminal-rejection checks after rebuilding layers.
    submission: EventSubmission,
    /// First committed event, also the snapshot version.
    first: EventPosition,
    /// Event after the snapshot, used to check replay boundaries.
    second: EventPosition,
    /// Stored root identity, resolved afresh through each new session.
    root: BlobTreeId,
    /// Stored leaf identity, which can differ from a plaintext content hash.
    leaf: BlobTreeId,
}

/// Reads through progress notifications without assuming their delivery cadence.
async fn next_event<Error: std::fmt::Debug>(
    events: &mut sea_core::ArchiveEventStream<Error>,
) -> SessionCommittedEvent {
    loop {
        if let MonitoredStreamItem::Item(event) = events.next().await.unwrap().unwrap() {
            return event;
        }
    }
}

/// Verifies public membership metadata and application payloads through every configured layer.
async fn verify_membership<Writer: SeaSession, Observer: SeaSession>(
    writer: &Writer,
    observer: &Observer,
) {
    use sea_core::archive::SessionEventKind;
    let metadata = Bytes::from_static(b"public membership metadata");
    let joined = writer.announce_membership(metadata.clone()).await.unwrap();
    assert_eq!(
        writer.announce_membership(metadata.clone()).await.unwrap(),
        joined
    );
    let position = writer
        .submit(EventSubmission {
            reference: Some(joined),
            event: Event {
                payload: Bytes::from_static(b"protected application data"),
                blob_tree: None,
            },
        })
        .await
        .unwrap();
    let mut events = observer.read(None, None);
    let announcement = next_event(&mut events).await;
    assert_eq!(announcement.kind, SessionEventKind::Joined);
    assert_eq!(announcement.committed.position, joined);
    assert_eq!(announcement.committed.event.payload, metadata);
    let application = next_event(&mut events).await;
    assert_eq!(application.kind, SessionEventKind::Application);
    assert_eq!(application.committed.position, position);
    assert_eq!(
        application.committed.event.payload,
        Bytes::from_static(b"protected application data")
    );
    writer.close().await.unwrap();
    let departed = next_event(&mut events).await;
    assert_eq!(departed.kind, SessionEventKind::Left);
    assert_eq!(departed.session_id, announcement.session_id);
    assert!(departed.committed.position > position);
    assert!(departed.committed.event.payload.is_empty());
}

/// Checks actual decoded content, including the directory-to-leaf identity mapping.
async fn check_content<Session: SeaArchive>(session: &Session, trace: &Trace) {
    let BlobTreeId::Directory(root) = trace.root else {
        panic!("expected directory")
    };
    let BlobTreeId::Blob(leaf) = trace.leaf else {
        panic!("expected blob")
    };
    let directory = session.get_directory(root).await.unwrap();
    assert_eq!(directory.entries().get("state"), Some(&trace.leaf));
    assert_eq!(
        session.get_blob(leaf).await.unwrap(),
        Bytes::from_static(b"snapshot content")
    );
    assert_eq!(
        session
            .resolve_tree(trace.root)
            .await
            .unwrap()
            .unwrap()
            .id(),
        trace.root
    );
}

/// Publishes under Sea selection and waits for the corresponding coordination update.
async fn publish<Session: SeaSession>(
    session: &Session,
    root: BlobTreeId,
    position: EventPosition,
    parent: Option<EventPosition>,
) {
    let mut coordination = session
        .coordinate_snapshots(SnapshotParticipation::SeaSelected)
        .await
        .unwrap();
    let selected = coordination.next().await.unwrap().unwrap();
    assert!(selected.fence.is_some());
    assert_eq!(selected.latest, parent);
    let snapshot = Snapshot {
        root: session.resolve_tree(root).await.unwrap().unwrap(),
        at_event: session.resolve_position(position).await.unwrap().unwrap(),
    };
    let accepted = session
        .publish_snapshot(parent, selected.fence, snapshot.clone())
        .await
        .unwrap();
    assert_eq!(accepted.root.id(), root);
    assert_eq!(accepted.at_event.id(), position);
    assert_eq!(
        session
            .publish_snapshot(parent, selected.fence, snapshot)
            .await
            .unwrap()
            .at_event
            .id(),
        position
    );
    while coordination.next().await.unwrap().unwrap().latest != Some(position) {}
    session.revoke_snapshot_publisher().await.unwrap();
}

/// Establishes plaintext, snapshot, bounded-history, and live-stream observations.
async fn write_trace<Session: SeaSession>(session: &Session) -> Trace {
    let mut initial = session.load(LoadStart::LatestSnapshot).await.unwrap();
    assert!(initial.snapshot.is_none());
    let leaf = session
        .put_blob(Bytes::from_static(b"snapshot content"))
        .await
        .unwrap()
        .id();
    let root = session
        .put_directory(BlobDirectory::new([("state".to_owned(), leaf)].into()).unwrap())
        .await
        .unwrap()
        .id();
    let submission = EventSubmission {
        reference: None,
        event: Event {
            payload: Bytes::from_static(b"first plaintext event"),
            blob_tree: Some(root),
        },
    };
    let first = session.submit(submission.clone()).await.unwrap();
    let delivered = next_event(&mut initial.events).await;
    assert_eq!(delivered.committed.position, first);
    assert_eq!(delivered.committed.event, submission.event);
    drop(initial.events);
    publish(session, root, first, None).await;
    let mut loaded = session.load(LoadStart::LatestSnapshot).await.unwrap();
    let snapshot = loaded.snapshot.unwrap();
    assert_eq!(snapshot.at_event.id(), first);
    assert_eq!(snapshot.root.id(), root);
    let second = session
        .submit(EventSubmission {
            reference: Some(first),
            event: Event {
                payload: Bytes::from_static(b"second plaintext event"),
                blob_tree: None,
            },
        })
        .await
        .unwrap();
    let delivered = next_event(&mut loaded.events).await;
    assert_eq!(delivered.committed.position, second);
    assert_eq!(
        delivered.committed.event.payload,
        Bytes::from_static(b"second plaintext event")
    );
    let trace = Trace {
        submission,
        first,
        second,
        root,
        leaf,
    };
    check_content(session, &trace).await;
    check_history(session, &trace).await;
    trace
}

/// A bounded read must contain exactly the two submitted events.
async fn check_history<Session: SeaArchive>(session: &Session, trace: &Trace) {
    let mut history = session.read(None, Some(trace.second));
    let first = next_event(&mut history).await;
    let second = next_event(&mut history).await;
    assert_eq!(first.committed.position, trace.first);
    assert_eq!(first.committed.event, trace.submission.event);
    assert_eq!(second.committed.position, trace.second);
    assert_eq!(
        second.committed.event.payload,
        Bytes::from_static(b"second plaintext event")
    );
    while let Some(item) = history.next().await {
        assert!(matches!(item.unwrap(), MonitoredStreamItem::Progress(_)));
    }
}

/// Verifies replay and fresh snapshot authority after the stack is rebuilt.
async fn after_reconnect<Session: SeaSession>(session: &Session, trace: &Trace) {
    check_content(session, trace).await;
    check_history(session, trace).await;
    let mut loaded = session.load(LoadStart::LatestSnapshot).await.unwrap();
    assert_eq!(loaded.snapshot.unwrap().at_event.id(), trace.first);
    assert_eq!(
        next_event(&mut loaded.events).await.committed.position,
        trace.second
    );
    let third = session
        .submit(EventSubmission {
            reference: Some(trace.second),
            event: Event {
                payload: Bytes::from_static(b"after reconnect"),
                blob_tree: Some(trace.root),
            },
        })
        .await
        .unwrap();
    let live = next_event(&mut loaded.events).await;
    assert_eq!(live.committed.position, third);
    assert_eq!(
        live.committed.event.payload,
        Bytes::from_static(b"after reconnect")
    );
    publish(session, trace.root, third, Some(trace.first)).await;
    assert_eq!(
        session
            .get_snapshot(LoadStart::LatestSnapshot)
            .await
            .unwrap()
            .unwrap()
            .at_event
            .id(),
        third
    );
    let mut changed = trace.submission.clone();
    changed.reference = Some(EventPosition::new(u64::MAX));
    assert!(matches!(
        session.submit(changed).await.unwrap_err().kind(),
        ErrorKind::Conflict | ErrorKind::Rejected
    ));
    assert!(session.submit(trace.submission.clone()).await.is_err());
}

/// Plaintext expectations retained independently of decoded history returned by Sea.
struct ExpectedEvent {
    /// Receipt used to order concurrent submissions without assuming which author wins.
    position: EventPosition,

    /// Original operation, reference, and event bytes.
    submission: EventSubmission,
}

/// A nested snapshot tree containing binary content, an empty leaf, and a shared subtree.
struct ContentTree {
    /// Root identity returned by the complete stack.
    root: BlobTreeId,
    /// Shared directory referenced twice by the root.
    branch: BlobTreeId,
    /// Binary payload leaf in the stored identity domain.
    leaf: BlobTreeId,
    /// Empty payload leaf in the stored identity domain.
    empty: BlobTreeId,
    /// Expected decoded bytes, not their encoded representation.
    payload: Bytes,
}

/// Builds a reproducible binary tree with repeated directory references.
async fn content_tree<Session: SeaArchive>(session: &Session, seed: usize) -> ContentTree {
    let payload = Bytes::from(
        (0..4096)
            .map(|index| u8::try_from((index * 31 + seed) % 256).unwrap())
            .collect::<Vec<_>>(),
    );
    let leaf = session.put_blob(payload.clone()).await.unwrap().id();
    let empty = session.put_blob(Bytes::new()).await.unwrap().id();
    let branch = session
        .put_directory(
            BlobDirectory::new([("binary".to_owned(), leaf), ("empty".to_owned(), empty)].into())
                .unwrap(),
        )
        .await
        .unwrap()
        .id();
    let root = session
        .put_directory(
            BlobDirectory::new([("left".to_owned(), branch), ("right".to_owned(), branch)].into())
                .unwrap(),
        )
        .await
        .unwrap()
        .id();
    ContentTree {
        root,
        branch,
        leaf,
        empty,
        payload,
    }
}

/// Traverses every level through a different session, checking plaintext and shared identities.
async fn verify_tree<Session: SeaArchive>(session: &Session, tree: &ContentTree) {
    let BlobTreeId::Directory(root) = tree.root else {
        panic!("expected root directory")
    };
    let BlobTreeId::Directory(branch) = tree.branch else {
        panic!("expected nested directory")
    };
    let BlobTreeId::Blob(leaf) = tree.leaf else {
        panic!("expected binary leaf")
    };
    let BlobTreeId::Blob(empty) = tree.empty else {
        panic!("expected empty leaf")
    };
    assert_eq!(
        session.get_directory(root).await.unwrap().entries(),
        &[
            ("left".to_owned(), tree.branch),
            ("right".to_owned(), tree.branch),
        ]
        .into()
    );
    assert_eq!(
        session.get_directory(branch).await.unwrap().entries(),
        &[
            ("binary".to_owned(), tree.leaf),
            ("empty".to_owned(), tree.empty),
        ]
        .into()
    );
    assert_eq!(session.get_blob(leaf).await.unwrap(), tree.payload);
    assert!(session.get_blob(empty).await.unwrap().is_empty());
}

/// Checks original plaintext, position, and reference against the model.
fn verify_event(actual: &SessionCommittedEvent, expected: &ExpectedEvent) {
    assert_eq!(actual.committed.position, expected.position);
    assert_eq!(actual.committed.event, expected.submission.event);
    assert_eq!(actual.reference, expected.submission.reference);
}

/// Confirms exact retained history, including the absence of rejected or duplicate operations.
async fn verify_history<Session: SeaArchive>(session: &Session, expected: &[ExpectedEvent]) {
    let mut history = session.read(None, Some(expected.last().unwrap().position));
    for event in expected {
        verify_event(&next_event(&mut history).await, event);
    }
    while let Some(item) = history.next().await {
        assert!(matches!(item.unwrap(), MonitoredStreamItem::Progress(_)));
    }
}

/// Cancels an initialized, polled read while other subscriptions remain active.
async fn cancel_idle_read<Session: SeaArchive>(session: &Session, after: Option<EventPosition>) {
    let mut events = session.read(after, None);
    loop {
        match events.next().await.unwrap().unwrap() {
            MonitoredStreamItem::Progress(progress) => {
                if progress.status == MonitoredStreamStatus::AwaitingNewItems {
                    break;
                }
            }
            MonitoredStreamItem::Item(_) => panic!("idle read unexpectedly delivered an event"),
        }
    }
    assert!(events.next().now_or_never().is_none());
    drop(events);
}

/// Creates submissions with empty, short, and larger binary payloads.
fn collaborative_submission(
    payload_seed: &str,
    round: usize,
    batch: usize,
    root: BlobTreeId,
    reference: Option<EventPosition>,
) -> EventSubmission {
    let length = [0, 1, 127, 8192][batch % 4];
    EventSubmission {
        reference,
        event: Event {
            payload: Bytes::from(
                (0..length)
                    .map(|index| {
                        u8::try_from(
                            (index * 17 + round + batch + usize::from(payload_seed.as_bytes()[0]))
                                % 256,
                        )
                        .unwrap()
                    })
                    .collect::<Vec<_>>(),
            ),
            blob_tree: Some(root),
        },
    }
}

/// Exercises read-only rejection, client-selected suppression, stale fences, and parent checks.
///
/// Authority moves from the first author's Sea-selected fence to the peer's client-selected
/// registration, then back to a new fence after the peer revokes its registration.
/// The peer starts read-only to test registration replacement as well as publication rights.
/// Coordination streams may contain intermediate updates, so waits use state predicates
/// instead of assuming one notification per operation; the enclosing scenario sets the deadline.
async fn collaborative_snapshot<Session: SeaSession>(
    first: &Session,
    peer: &Session,
    tree: &ContentTree,
    position: EventPosition,
    parent: Option<EventPosition>,
) {
    let mut selected = first
        .coordinate_snapshots(SnapshotParticipation::SeaSelected)
        .await
        .unwrap();
    let old_fence = selected.next().await.unwrap().unwrap().fence;
    assert!(old_fence.is_some());
    let mut read_only = peer
        .coordinate_snapshots(SnapshotParticipation::ReadOnly)
        .await
        .unwrap();
    assert!(read_only.next().await.unwrap().unwrap().fence.is_none());
    let snapshot = Snapshot {
        root: peer.resolve_tree(tree.root).await.unwrap().unwrap(),
        at_event: peer.resolve_position(position).await.unwrap().unwrap(),
    };
    assert!(
        peer.publish_snapshot(parent, None, snapshot.clone())
            .await
            .is_err()
    );
    let mut client_selected = peer
        .coordinate_snapshots(SnapshotParticipation::ClientSelected)
        .await
        .unwrap();
    assert!(
        client_selected
            .next()
            .await
            .unwrap()
            .unwrap()
            .fence
            .is_none()
    );
    // Dropping the superseded stream must not revoke the peer's new client-selected registration.
    drop(read_only);
    while selected.next().await.unwrap().unwrap().fence.is_some() {}
    let stale_snapshot = Snapshot {
        root: first.resolve_tree(tree.root).await.unwrap().unwrap(),
        at_event: first.resolve_position(position).await.unwrap().unwrap(),
    };
    assert!(
        first
            .publish_snapshot(parent, old_fence, stale_snapshot)
            .await
            .is_err()
    );
    verify_snapshot_publication(peer, tree, position, parent, snapshot).await;
    while client_selected.next().await.unwrap().unwrap().latest != Some(position) {}
    peer.revoke_snapshot_publisher().await.unwrap();
    let renewed = loop {
        let update = selected.next().await.unwrap().unwrap();
        if update.fence.is_some() {
            break update;
        }
    };
    assert_ne!(renewed.fence, old_fence);
    assert_eq!(renewed.latest, Some(position));
    first.revoke_snapshot_publisher().await.unwrap();
}

/// Checks parent fencing and exact snapshot retries without accepting conflicting content.
async fn verify_snapshot_publication<Session: SeaSession>(
    peer: &Session,
    tree: &ContentTree,
    position: EventPosition,
    parent: Option<EventPosition>,
    snapshot: Snapshot<Session::BlobHandle, Session::EventHandle>,
) {
    let wrong_parent = if parent.is_some() {
        None
    } else {
        Some(position)
    };
    assert!(
        peer.publish_snapshot(wrong_parent, None, snapshot.clone())
            .await
            .is_err()
    );
    assert_eq!(
        peer.get_snapshot(LoadStart::LatestSnapshot)
            .await
            .unwrap()
            .map(|value| value.at_event.id()),
        parent
    );
    let accepted = peer
        .publish_snapshot(parent, None, snapshot.clone())
        .await
        .unwrap();
    assert_eq!(accepted.root.id(), tree.root);
    assert_eq!(accepted.at_event.id(), position);
    assert_eq!(
        peer.publish_snapshot(parent, None, snapshot)
            .await
            .unwrap()
            .at_event
            .id(),
        position
    );
    let conflicting = Snapshot {
        root: peer.resolve_tree(tree.branch).await.unwrap().unwrap(),
        at_event: peer.resolve_position(position).await.unwrap().unwrap(),
    };
    assert!(
        peer.publish_snapshot(Some(position), None, conflicting)
            .await
            .is_err()
    );
    assert_eq!(
        peer.get_snapshot(LoadStart::LatestSnapshot)
            .await
            .unwrap()
            .unwrap()
            .root
            .id(),
        tree.root
    );
}

/// Races two authors and orders the expected committed pair.
async fn concurrent_batch<Session: SeaSession>(
    first: &Session,
    peer: &Session,
    roots: (BlobTreeId, BlobTreeId),
    round: usize,
    batch: usize,
    reference: Option<EventPosition>,
) -> [ExpectedEvent; 2] {
    let first_submission = collaborative_submission("author", round, batch, roots.0, reference);
    let peer_submission = collaborative_submission("peer", round, batch, roots.1, reference);
    let (first_receipt, peer_receipt) = tokio::join!(
        first.submit(first_submission.clone()),
        peer.submit(peer_submission.clone()),
    );
    let first_receipt = first_receipt.unwrap();
    let peer_receipt = peer_receipt.unwrap();
    assert_ne!(first_receipt, peer_receipt);
    let mut pair = [
        ExpectedEvent {
            position: first_receipt,

            submission: first_submission,
        },
        ExpectedEvent {
            position: peer_receipt,

            submission: peer_submission,
        },
    ];
    pair.sort_by_key(|event| event.position);
    pair
}

/// Verifies a reconnect's selected snapshot and retained suffix before returning its live stream.
async fn load_peer<Session: SeaArchive>(
    peer: &Session,
    history: &[ExpectedEvent],
    snapshot: Option<&(EventPosition, ContentTree)>,
) -> sea_core::ArchiveEventStream<Session::Error> {
    let mut loaded = peer.load(LoadStart::LatestSnapshot).await.unwrap();
    assert_eq!(
        loaded.snapshot.as_ref().map(|value| value.at_event.id()),
        snapshot.map(|(position, _)| *position)
    );
    if let Some((position, tree)) = snapshot {
        assert_eq!(loaded.snapshot.unwrap().root.id(), tree.root);
        verify_tree(peer, tree).await;
        for event in history.iter().filter(|event| event.position > *position) {
            verify_event(&next_event(&mut loaded.events).await, event);
        }
    }
    loaded.events
}

/// Runs concurrent writers and repeated reconnects while keeping the first author's stream live.
///
/// Each round rebuilds the peer, catches up from the latest snapshot, exchanges nested content,
/// runs four two-author batches, and publishes one snapshot while testing authority transitions.
/// The peer then disconnects and the first author writes one more event for the next load's suffix.
/// Thus a round contributes nine committed events; rejected operations contribute none.
/// A final peer connection checks the last suffix even when there is no next round.
///
/// `build` borrows a fixture only during construction and returns an owned session.
/// Both authors use the same concrete stack type, but share no decorator instances or connections.
async fn collaborate<Session, Build>(
    fixture: &mut Fixture,
    peer_fixture: &mut Fixture,
    build: Build,
    rounds: usize,
) where
    Session: SeaSession,
    Build: for<'fixture> Fn(&'fixture mut Fixture) -> BoxFuture<'fixture, Session>,
{
    let first = build(fixture).await;
    let mut first_events = first.load(LoadStart::LatestSnapshot).await.unwrap().events;
    let mut history: Vec<ExpectedEvent> = Vec::new();
    let mut snapshots: Vec<(EventPosition, ContentTree)> = Vec::new();
    for round in 0..rounds {
        let peer = build(peer_fixture).await;
        let mut peer_events = load_peer(&peer, &history, snapshots.last()).await;
        let first_tree = content_tree(&first, round * 2).await;
        let peer_tree = content_tree(&peer, round * 2 + 1).await;
        verify_tree(&peer, &first_tree).await;
        verify_tree(&first, &peer_tree).await;
        cancel_idle_read(&peer, history.last().map(|event| event.position)).await;
        // Both live streams must agree with the independently retained inputs, not just each other.
        for batch in 0..4 {
            let reference = history.last().map(|event| event.position);
            let pair = concurrent_batch(
                &first,
                &peer,
                (first_tree.root, peer_tree.root),
                round,
                batch,
                reference,
            )
            .await;
            for expected in pair {
                let delivered = next_event(&mut first_events).await;
                let observed = next_event(&mut peer_events).await;
                assert_eq!(delivered, observed);
                verify_event(&delivered, &expected);
                history.push(expected);
            }
        }
        let position = history.last().unwrap().position;
        collaborative_snapshot(
            &first,
            &peer,
            &peer_tree,
            position,
            snapshots.last().map(|(position, _)| *position),
        )
        .await;
        snapshots.push((position, peer_tree));
        for (position, tree) in &snapshots {
            let snapshot = peer
                .get_snapshot(LoadStart::ReplayAtLeastAllAfter(*position))
                .await
                .unwrap()
                .unwrap();
            assert_eq!(snapshot.at_event.id(), *position);
            assert_eq!(snapshot.root.id(), tree.root);
            verify_tree(&first, tree).await;
        }
        verify_history(&first, &history).await;
        verify_history(&peer, &history).await;
        drop(peer_events);
        verify_terminal_rejection(&peer, &history.last().unwrap().submission).await;
        peer.close().await.unwrap();
        drop(peer);
        peer_fixture.stop_endpoints().await;
        // This is intentionally after snapshot publication and peer teardown: reconnect must replay it.
        let submission =
            collaborative_submission("offline", round, 2, first_tree.root, Some(position));
        let receipt = first.submit(submission.clone()).await.unwrap();
        let expected = ExpectedEvent {
            position: receipt,

            submission,
        };
        verify_event(&next_event(&mut first_events).await, &expected);
        history.push(expected);
    }
    let peer = build(peer_fixture).await;
    verify_history(&peer, &history).await;
    drop(load_peer(&peer, &history, snapshots.last()).await);
    let mut submission = history.last().unwrap().submission.clone();
    submission.reference = Some(history.last().unwrap().position);
    let position = peer.submit(submission.clone()).await.unwrap();
    assert!(position > history.last().unwrap().position);
    let expected = ExpectedEvent {
        position,

        submission,
    };
    verify_event(&next_event(&mut first_events).await, &expected);
    history.push(expected);
    verify_history(&peer, &history).await;
    peer.close().await.unwrap();
    first.close().await.unwrap();
}

/// An invalid reference ends authority, including for a subsequent otherwise valid submission.
async fn verify_terminal_rejection<Session: SeaSession>(
    session: &Session,
    original: &EventSubmission,
) {
    let mut changed = original.clone();
    changed.reference = Some(EventPosition::new(u64::MAX));
    assert!(session.submit(changed).await.is_err());
    assert!(session.submit(original.clone()).await.is_err());
}

/// Proves each configured hop is on the submission path, in the expected order, without bypasses.
///
/// Hop indices follow construction order: zero is nearest storage, the last is nearest the caller.
/// With three hops, a submission travels 2 -> 1 -> 0.
/// Blocking hop 1 must increment counters 2 and 1, but leave counter 0 unchanged.
/// This is the `index >= blocked` term below; recovery requires a fresh stack.
/// Counts are checked after the awaited response, so receipt evidence needs no sleeps or polling.
///
/// The first rejection ends this append stream; even a valid later submission must fail.
async fn verify_transport_path<Session: SeaSession>(
    fixture: &Fixture,
    session: &Session,
    expected_hops: usize,
    blocked: usize,
) -> EventSubmission {
    assert_eq!(fixture.endpoints.len(), expected_hops);
    assert_eq!(fixture.hops.len(), expected_hops);
    let probe = &fixture.hops[blocked];
    let before: Vec<_> = fixture
        .hops
        .iter()
        .map(|hop| hop.submissions.load(Ordering::SeqCst))
        .collect();
    let submission = EventSubmission {
        reference: None,
        event: Event {
            payload: Bytes::from_static(b"must cross every hop"),
            blob_tree: None,
        },
    };
    probe.reject_submissions.store(true, Ordering::SeqCst);
    let error = session.submit(submission.clone()).await.unwrap_err();
    assert_eq!(error.kind(), ErrorKind::Rejected);
    for (index, hop) in fixture.hops.iter().enumerate() {
        assert_eq!(
            hop.submissions.load(Ordering::SeqCst),
            before[index] + usize::from(index >= blocked),
            "blocked hop {blocked}: unexpected traffic at hop {index} (inner-to-outer)"
        );
    }
    probe.reject_submissions.store(false, Ordering::SeqCst);
    assert!(session.submit(submission.clone()).await.is_err());
    for (index, hop) in fixture.hops.iter().enumerate() {
        assert_eq!(
            hop.submissions.load(Ordering::SeqCst),
            before[index] + usize::from(index >= blocked),
            "terminated stream sent another submission to hop {index}"
        );
    }
    submission
}

/// Builds concrete stacks in application-to-storage order, without erasing handles or errors.
///
/// For example, `[compression, transport, encryption, transport]` means
/// caller -> compression -> network -> encryption -> network -> local session.
/// Recursion constructs the rightmost (innermost) layer first; every `transport` starts
/// a separate server owning the remaining inner stack and returns a client for that server.
/// Keeping the stack's concrete type lets the same generic scenarios exercise every combination.
macro_rules! stack {
    ($fixture:ident, $session:expr;) => { $session };
    ($fixture:ident, $session:expr; compression $(, $rest:ident)*) => {
        CompressionSession::new(stack!($fixture, $session; $($rest),*))
    };
    ($fixture:ident, $session:expr; encryption $(, $rest:ident)*) => {
        EncryptionSession::new(stack!($fixture, $session; $($rest),*), Keys)
    };
    ($fixture:ident, $session:expr; transport $(, $rest:ident)*) => {{
        let inner = stack!($fixture, $session; $($rest),*);
        $fixture.transport(inner).await
    }};
}

/// Generates one named test per configuration, each running the independent scenario table.
///
/// Cargo reports configuration names; scenario failures add their workflow name after cleanup.
/// Each cell has its own timeout, and panic capture lets endpoint and sequencer cleanup run
/// before the failure is re-reported. Endpoint drop also aborts tasks during unwinding.
/// Receipt checks run after cleanup because their probes outlive the stopped endpoints.
macro_rules! configurations {
    ($($name:ident => [$($layer:ident),*]),* $(,)?) => {
        $(
            #[tokio::test]
            async fn $name() {
                /// Rebuilds this configuration without retaining resources from earlier connections.
                /// `use<>` keeps the returned opaque session type independent of the fixture borrow.
                async fn build(fixture: &mut Fixture) -> impl SeaSession + use<> {
                    let base = fixture.open().await;
                    stack!(fixture, base; $($layer),*)
                }
                let layers: &[&str] = &[$(stringify!($layer)),*];
                let expected_hops = layers.iter().filter(|layer| **layer == "transport").count();
                for blocked in 0..expected_hops {
                let mut probe_fixture = Fixture::new().await;
                timeout(Duration::from_secs(30), async {
                    let session = build(&mut probe_fixture).await;
                    let submission = verify_transport_path(&probe_fixture, &session, expected_hops, blocked).await;
                    session.close().await.unwrap();
                    drop(session);
                    probe_fixture.stop_endpoints().await;
                    let recovered = build(&mut probe_fixture).await;
                    let mut history = recovered.read(None, None);
                    match history.next().await.unwrap().unwrap() {
                        MonitoredStreamItem::Progress(progress) => assert_eq!(progress.latest_known, None),
                        MonitoredStreamItem::Item(_) => panic!("rejected submission committed"),
                    }
                    recovered.submit(submission).await.unwrap();
                    recovered.close().await.unwrap();
                }).await.expect("transport path probe timed out");
                probe_fixture.stop_endpoints().await;
                probe_fixture.runtime.shutdown().await.unwrap();
                }
                let mut membership_fixture = Fixture::new().await;
                let mut membership_peer = membership_fixture.peer("membership-observer");
                timeout(Duration::from_secs(30), async {
                    let writer = build(&mut membership_fixture).await;
                    let observer = build(&mut membership_peer).await;
                    verify_membership(&writer, &observer).await;
                    observer.close().await.unwrap();
                }).await.expect("membership composition timed out");
                membership_peer.stop_endpoints().await;
                membership_fixture.stop_endpoints().await;
                membership_fixture.runtime.shutdown().await.unwrap();
                for scenario in SCENARIOS {
                    let mut fixture = Fixture::new().await;
                    let mut peer_fixture = fixture.peer("peer");
                    let result = AssertUnwindSafe(timeout(Duration::from_secs(30), async {
                        if matches!(scenario, Scenario::Collaboration | Scenario::CollaborationStress) {
                            let rounds = if matches!(scenario, Scenario::CollaborationStress) { 4 } else { 1 };
                            collaborate(&mut fixture, &mut peer_fixture, |fixture| Box::pin(build(fixture)), rounds).await;
                            return;
                        }
                        let base = fixture.open().await;
                        let session = stack!(fixture, base; $($layer),*);
                        let trace = match scenario {
                            Scenario::OpenClose => None,
                            Scenario::EventsAndSnapshots | Scenario::Reconnect => Some(write_trace(&session).await),
                            Scenario::Collaboration | Scenario::CollaborationStress => unreachable!(),
                        };
                        session.close().await.unwrap();
                        drop(session);
                        fixture.stop_endpoints().await;
                        if matches!(scenario, Scenario::Reconnect) {
                            let base = fixture.open().await;
                            let session = stack!(fixture, base; $($layer),*);
                            after_reconnect(&session, &trace.unwrap()).await;
                            session.close().await.unwrap();
                        }
                    })).catch_unwind().await;
                    peer_fixture.stop_endpoints().await;
                    fixture.stop_endpoints().await;
                    fixture.runtime.shutdown().await.unwrap();
                    match result {
                        Ok(Ok(())) => {},
                        Ok(Err(_)) => panic!("{} / {scenario:?}: timed out", stringify!($name)),
                        Err(_) => panic!("{} / {scenario:?}: see original assertion above", stringify!($name)),
                    }
                    fixture.verify_hop_traffic(expected_hops, scenario);
                    peer_fixture.verify_hop_traffic(expected_hops, scenario);
                }
            }
        )*
    };
}

configurations! {
    bare => [],
    compression => [compression],
    encryption => [encryption],
    duplicate_compression => [compression, compression],
    duplicate_encryption => [encryption, encryption],
    compress_then_encrypt => [compression, encryption],
    encrypt_then_compress => [encryption, compression],
    transport_only => [transport],
    duplicate_transport => [transport, transport],
    transport_compression_transport => [transport, compression, transport],
    mixed => [compression, transport, encryption, transport],
    repeated_stress => [compression, encryption, transport, compression, encryption, transport, encryption, compression, transport],
}
