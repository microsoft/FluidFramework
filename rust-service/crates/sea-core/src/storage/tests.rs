//! Owner-local checks use permissive components so backend validation cannot mask view regressions.

use std::sync::{Arc, Mutex};

use futures_util::{FutureExt, StreamExt};

use super::*;
use crate::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, CommittedEvent, ErrorKind,
    MonitoredStreamProgress, MonitoredStreamStatus, boxed_monitored_stream,
};

/// Separates dependency, append, and lookup failures in the composition assertions.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TestError {
    /// The supplied capability cannot establish availability.
    Dependency,
    /// The archive refused an append.
    Append,
    /// Snapshot selection failed.
    Lookup,
}

impl std::fmt::Display for TestError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{self:?}")
    }
}

impl std::error::Error for TestError {}

impl ClassifiedError for TestError {
    fn kind(&self) -> ErrorKind {
        ErrorKind::Rejected
    }
}

/// Identity with independently controlled availability, unlike eagerly stored backend handles.
#[derive(Clone, Debug)]
struct Handle<Id> {
    /// Identity forwarded only after availability succeeds.
    id: Id,
    /// Outcome of the owning store's availability check.
    available: bool,
}

impl<Id: Copy + Send + Sync + 'static> StorageHandle for Handle<Id> {
    type Id = Id;

    fn id(&self) -> Id {
        self.id
    }
}

/// Snapshot fixture with separately rejectable dependencies.
type TestSnapshot = Snapshot<Handle<BlobTreeId>, Handle<EventPosition>>;

/// Observations shared by independently permissive component implementations.
#[derive(Default)]
struct State {
    /// Ordered component calls made by the view.
    calls: Vec<&'static str>,
    /// Every attempted event, including the definitive failure.
    events: Vec<Event>,
    /// Zero-based append attempt to reject.
    append_error_at: Option<usize>,
    /// Snapshot selected by the fixture, independent of its bound.
    snapshot: Option<TestSnapshot>,
    /// Whether snapshot selection must fail.
    lookup_error: bool,
    /// Bounds supplied by the view's selection policy.
    lookups: Vec<Option<EventPosition>>,
    /// Cursors supplied when constructing a live suffix.
    reads: Vec<(Option<EventPosition>, Option<EventPosition>)>,
}

/// Blob component that records checks but does not enforce dependencies in other components.
struct Blobs(Arc<Mutex<State>>);
/// Event component that uses the trait's sequential batch default.
struct Events(Arc<Mutex<State>>);
/// Snapshot component that accepts any dependencies, leaving validation to the view.
struct Snapshots(Arc<Mutex<State>>);

impl StorageSurface for Blobs {
    type Error = TestError;
}

impl StorageSurface for Events {
    type Error = TestError;
}

impl StorageSurface for Snapshots {
    type Error = TestError;
}

#[async_trait]
impl ReferenceableStore for Blobs {
    type Id = BlobTreeId;
    type Handle = Handle<BlobTreeId>;

    async fn resolve(&self, _id: Self::Id) -> Result<Option<Self::Handle>, TestError> {
        unreachable!("this fixture supplies handles directly")
    }

    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), TestError> {
        self.0.lock().unwrap().calls.push("blob availability");
        handle.available.then_some(()).ok_or(TestError::Dependency)
    }
}

#[async_trait]
impl BlobStore for Blobs {
    async fn put_blob(&self, _payload: Bytes) -> Result<Self::Handle, TestError> {
        unreachable!("this fixture supplies handles directly")
    }

    async fn get_blob(&self, _id: BlobId) -> Result<Bytes, TestError> {
        unreachable!("view publication must not fetch content")
    }

    async fn put_directory(&self, _directory: BlobDirectory) -> Result<Self::Handle, TestError> {
        unreachable!("this fixture supplies handles directly")
    }

    async fn get_directory(&self, _id: BlobDirectoryId) -> Result<BlobDirectory, TestError> {
        unreachable!("view publication must not fetch content")
    }
}

#[async_trait]
impl ReferenceableStore for Events {
    type Id = EventPosition;
    type Handle = Handle<EventPosition>;

    async fn resolve(&self, _id: Self::Id) -> Result<Option<Self::Handle>, TestError> {
        unreachable!("this fixture supplies handles directly")
    }

    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), TestError> {
        self.0.lock().unwrap().calls.push("event availability");
        handle.available.then_some(()).ok_or(TestError::Dependency)
    }
}

#[async_trait]
impl Archive for Events {
    type Position = EventPosition;
    type Item = CommittedEvent;
    type Append = Event;
    type AppendResult = Handle<EventPosition>;

    async fn append(&self, event: Event) -> Result<Self::AppendResult, TestError> {
        let mut state = self.0.lock().unwrap();
        state.calls.push("append");
        let attempt = state.events.len();
        state.events.push(event);
        if state.append_error_at == Some(attempt) {
            return Err(TestError::Append);
        }
        Ok(Handle {
            id: EventPosition::new(attempt as u64 + 1),
            available: true,
        })
    }

    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> EventArchiveStream<TestError> {
        self.0.lock().unwrap().reads.push((after, stop_after));
        boxed_monitored_stream(
            futures_util::stream::iter([Err(TestError::Lookup)]),
            MonitoredStreamProgress {
                previous: after,
                latest_known: after,
                status: MonitoredStreamStatus::StreamingBacklog,
            },
            |event: &CommittedEvent| Some(event.position),
        )
    }

    async fn head(&self) -> Result<Option<EventPosition>, TestError> {
        panic!("load must not capture an event head")
    }
}

#[async_trait]
impl Archive for Snapshots {
    type Position = EventPosition;
    type Item = TestSnapshot;
    type Append = TestSnapshot;
    type AppendResult = ();

    async fn append(&self, _snapshot: TestSnapshot) -> Result<(), TestError> {
        self.0.lock().unwrap().calls.push("snapshot append");
        Ok(())
    }

    fn read(
        &self,
        _after: Option<EventPosition>,
        _stop_after: Option<EventPosition>,
    ) -> ArchiveStream<TestSnapshot, EventPosition, TestError> {
        unreachable!("selection must use lookup")
    }

    async fn head(&self) -> Result<Option<EventPosition>, TestError> {
        unreachable!("selection must use lookup")
    }
}

#[async_trait]
impl SnapshotArchive for Snapshots {
    type BlobHandle = Handle<BlobTreeId>;
    type EventHandle = Handle<EventPosition>;

    async fn get_snapshot_at(
        &self,
        _position: EventPosition,
    ) -> Result<Option<TestSnapshot>, TestError> {
        unreachable!("selection must use inclusive lookup")
    }

    async fn latest_at_or_before(
        &self,
        position: Option<EventPosition>,
    ) -> Result<Option<TestSnapshot>, TestError> {
        let mut state = self.0.lock().unwrap();
        state.lookups.push(position);
        if state.lookup_error {
            return Err(TestError::Lookup);
        }
        Ok(state.snapshot.clone())
    }
}

/// Unused component required to construct a view without a backend dependency.
#[derive(Debug)]
struct Checkpoints;

impl StorageSurface for Checkpoints {
    type Error = TestError;
}

#[async_trait]
impl CheckpointStore for Checkpoints {
    async fn checkpoint(&self) -> Result<Option<Bytes>, TestError> {
        unreachable!("snapshot selection must not read internal checkpoints")
    }

    async fn publish_checkpoint(&self, _checkpoint: Bytes) -> Result<(), TestError> {
        unreachable!("snapshot publication must not write internal checkpoints")
    }
}

/// Creates a view with observable component calls and no duplicated dependency enforcement.
fn view(state: &Arc<Mutex<State>>) -> SeaView<Blobs, Events, Snapshots> {
    SeaView::new(StorageComponents {
        blobs: Blobs(state.clone()),
        events: Events(state.clone()),
        snapshots: Snapshots(state.clone()),
        checkpoints: Box::new(Checkpoints),
    })
}

/// Supplies a snapshot whose dependencies are independently controlled by each test.
fn snapshot() -> TestSnapshot {
    Snapshot {
        root: Handle {
            id: BlobTreeId::Blob(BlobId::for_bytes(b"tree")),
            available: true,
        },
        at_event: Handle {
            id: EventPosition::new(7),
            available: true,
        },
    }
}

#[test]
fn view_checks_dependencies_before_permissive_component_publication() {
    let state = Arc::new(Mutex::new(State::default()));
    let view = view(&state);
    let mut snapshot = snapshot();
    snapshot.root.available = false;
    assert!(matches!(
        view.append(Bytes::new(), Some(&snapshot.root))
            .now_or_never(),
        Some(Err(TestError::Dependency))
    ));
    assert_eq!(state.lock().unwrap().calls, ["blob availability"]);
    assert!(state.lock().unwrap().events.is_empty());
    snapshot.root.available = true;
    view.append(Bytes::from_static(b"payload"), Some(&snapshot.root))
        .now_or_never()
        .unwrap()
        .unwrap();
    {
        let mut state = state.lock().unwrap();
        assert_eq!(
            state.calls,
            ["blob availability", "blob availability", "append"]
        );
        assert_eq!(state.events[0].payload, Bytes::from_static(b"payload"));
        assert_eq!(state.events[0].blob_tree, Some(snapshot.root.id()));
        state.calls.clear();
    }
    for (root_available, event_available, expected_calls) in [
        (false, true, vec!["blob availability"]),
        (true, false, vec!["blob availability", "event availability"]),
        (
            true,
            true,
            vec!["blob availability", "event availability", "snapshot append"],
        ),
    ] {
        snapshot.root.available = root_available;
        snapshot.at_event.available = event_available;
        let result = view.publish_snapshot(&snapshot).now_or_never().unwrap();
        assert_eq!(result.is_ok(), root_available && event_available);
        let mut state = state.lock().unwrap();
        assert_eq!(state.calls, expected_calls);
        state.calls.clear();
    }
}

#[test]
fn default_batch_stops_at_first_failure_without_retry() {
    for fail_at in [None, Some(0), Some(1)] {
        let state = Arc::new(Mutex::new(State {
            append_error_at: fail_at,
            ..State::default()
        }));
        let events = Events(state.clone());
        let event = Event {
            payload: Bytes::new(),
            blob_tree: None,
        };
        let results = events.append_batch(vec![event; 3]).now_or_never().unwrap();
        let attempted = fail_at.map_or(3, |index| index + 1);
        assert_eq!(results.len(), attempted);
        assert_eq!(state.lock().unwrap().events.len(), attempted);
        for (index, result) in results.into_iter().enumerate() {
            if Some(index) == fail_at {
                assert!(matches!(result, Err(TestError::Append)));
            } else {
                assert_eq!(result.unwrap().id(), EventPosition::new(index as u64 + 1));
            }
        }
        assert!(
            events
                .append_batch(Vec::new())
                .now_or_never()
                .unwrap()
                .is_empty()
        );
        assert_eq!(state.lock().unwrap().events.len(), attempted);
    }
}

#[test]
fn view_batch_dependency_error_follows_only_a_fully_successful_prefix() {
    for fail_at in [None, Some(0), Some(1)] {
        let state = Arc::new(Mutex::new(State {
            append_error_at: fail_at,
            ..State::default()
        }));
        let view = view(&state);
        let mut unavailable = snapshot().root;
        unavailable.available = false;
        let results = view
            .append_batch(vec![
                (Bytes::from_static(b"first"), None),
                (Bytes::from_static(b"second"), None),
                (Bytes::new(), Some(unavailable)),
                (Bytes::from_static(b"unattempted"), None),
            ])
            .now_or_never()
            .unwrap();
        assert_eq!(results.len(), fail_at.map_or(3, |index| index + 1));
        assert_eq!(
            results.last().unwrap().as_ref().unwrap_err(),
            &fail_at.map_or(TestError::Dependency, |_| TestError::Append)
        );
        assert!(results[..results.len() - 1].iter().all(Result::is_ok));
        assert_eq!(
            state.lock().unwrap().events.len(),
            fail_at.map_or(2, |i| i + 1)
        );
    }
}

#[test]
fn load_selects_without_a_head_and_defers_read_errors() {
    let state = Arc::new(Mutex::new(State {
        snapshot: Some(snapshot()),
        ..State::default()
    }));
    let view = view(&state);
    for (policy, lookup, after) in [
        (LoadStart::Beginning, None, None),
        (
            LoadStart::ReplayAtLeastAllAfter(EventPosition::new(9)),
            Some(Some(EventPosition::new(9))),
            Some(EventPosition::new(7)),
        ),
        (
            LoadStart::LatestSnapshot,
            Some(None),
            Some(EventPosition::new(7)),
        ),
    ] {
        let mut loaded = view.load(policy).now_or_never().unwrap().unwrap();
        assert_eq!(loaded.snapshot.map(|s| s.at_event.id()), after);
        assert_eq!(loaded.events.progress().previous, after);
        assert!(matches!(
            loaded.events.next().now_or_never(),
            Some(Some(Err(TestError::Lookup)))
        ));
        let mut state = state.lock().unwrap();
        assert_eq!(state.lookups, lookup.into_iter().collect::<Vec<_>>());
        assert_eq!(state.reads, [(after, None)]);
        state.lookups.clear();
        state.reads.clear();
    }
    state.lock().unwrap().lookup_error = true;
    assert!(
        view.load(LoadStart::Beginning)
            .now_or_never()
            .unwrap()
            .is_ok()
    );
    state.lock().unwrap().reads.clear();
    assert!(matches!(
        view.load(LoadStart::LatestSnapshot).now_or_never(),
        Some(Err(TestError::Lookup))
    ));
    assert!(state.lock().unwrap().reads.is_empty());
}
