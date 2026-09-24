//! Deterministic failure and ownership tests for the session runtime.
//!
//! [`FaultStorage`] decorates memory components without changing their identities or
//! ordering guarantees. One-shot controls distinguish rejection, ambiguity before or after a real
//! commit, reconciliation failure, and suspension on either side of commitment. Append counters
//! verify that the sequencer never converts reconciliation or caller cancellation into an implicit
//! retry.
//!
//! Decorated read streams retain their component opening. This exercises the storage contract's
//! strictest permitted ownership lifetime and verifies that session closure and runtime shutdown do
//! not assume memory-specific independent streams. [`tokio::sync::Notify`] gates make cancellation
//! checks independent of sleeps and scheduler timing.

use std::{
    fmt,
    sync::{
        Arc, Mutex as StdMutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{FutureExt, StreamExt};
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, ClassifiedError, Durability, ErrorKind, EventPosition,
    map_monitored_stream,
    session::{SeaArchive, SeaSnapshotCoordinator},
    storage::{
        Archive, ArchiveStream, BlobStore, CreatedDocument, DocumentId, ReferenceableStore,
        SeaStorage, SnapshotArchive, StorageComponents, StorageSurface,
    },
};
use sea_memory::{
    MemoryBlobHandle, MemoryBlobStore, MemoryEventArchive, MemoryEventHandle,
    MemorySnapshotArchive, MemoryStorage, MemoryStorageError,
};
use tokio::sync::Notify;

#[path = "live_cache_tests.rs"]
mod live_cache_tests;

use super::{
    LocalSequencer, SessionError,
    tests::{create_sequencer, member, submission},
};
use sea_core::{
    archive::SnapshotParticipation,
    storage::{LoadStart, Snapshot},
};

/// One-shot backend behavior selected by a test before submitting work.
#[derive(Clone, Copy, Default)]
enum Failure {
    /// Complete normally.
    #[default]
    None,
    /// Definitively reject without appending.
    Reject,
    /// Return ambiguity without creating an entry.
    AmbiguousAbsent,
    /// Commit then return ambiguity.
    AmbiguousCommitted,
    /// Commit ambiguously, then fail authoritative head discovery.
    FailHead,
    /// Commit ambiguously, then fail reconciliation delivery.
    FailRead,
    /// Commit ambiguously, then fail snapshot lookup.
    FailLookup,
    /// Suspend before commitment until explicitly released by the test.
    GateBefore,
    /// Commit then suspend before returning until explicitly released.
    GateAfter,
    /// Suspend, then definitively reject without modifying history.
    GateReject,
    /// A grouped call waits, commits its entries, and reports ambiguous outcomes.
    GateGroupAmbiguous,
}

/// Deterministic fault injection and append-call accounting.
#[derive(Default)]
struct Faults {
    /// Independent opening invalidation, not inferred from archive reads.
    invalidation: sea_core::storage::InvalidationSource<FaultError>,
    /// Explicitly exercises third-party backends without the optional capability.
    unsupported_observer: AtomicBool,
    /// Counts archive stream construction.
    reads: AtomicUsize,
    /// Counts every underlying archive poll, including pending polls.
    read_polls: AtomicUsize,
    /// Behavior consumed by the next append or checkpoint publication.
    next: StdMutex<Failure>,
    /// Number of backend append invocations, including pending ones.
    calls: AtomicUsize,
    /// Number of multi-entry backend calls, independent of individual entry accounting.
    batches: AtomicUsize,
    /// One-shot head error after an ambiguous commit.
    fail_head: AtomicBool,
    /// One-shot data-delivery error during reconciliation.
    fail_read: AtomicBool,
    /// One-shot snapshot lookup error after an ambiguous commit.
    fail_lookup: AtomicBool,
    /// Test-controlled settlement, with no sleeps or scheduler timing assumptions.
    release: Notify,
}

impl Faults {
    /// Arms one append or checkpoint publication with the selected behavior.
    fn arm(&self, failure: Failure) {
        *self.next.lock().unwrap() = failure;
    }
}

/// Fixture errors preserve the underlying classification or inject a requested one.
#[derive(Debug)]
enum FaultError {
    /// Real memory backend failure.
    Backend(MemoryStorageError),
    /// Deterministic test fault.
    Injected(ErrorKind),
}

impl fmt::Display for FaultError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{self:?}")
    }
}
impl std::error::Error for FaultError {}
impl ClassifiedError for FaultError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Backend(error) => error.kind(),
            Self::Injected(kind) => *kind,
        }
    }
}

/// Decorates a component without weakening any storage guarantee.
struct FaultStore<Store> {
    /// Retained by reads to exercise the permitted writer-owning stream lifetime.
    inner: Arc<Store>,
    /// Per-component fault controls.
    faults: Arc<Faults>,
}

/// Poll instrumentation preserves the source's exact progress semantics.
struct CountedRead<Item, Position, Error> {
    /// Original backend stream, including its delivered-cursor observation.
    source: ArchiveStream<Item, Position, Error>,
    /// Counter owned by the fixture, not by production cache code.
    faults: Arc<Faults>,
}

impl<Item, Position: Clone + PartialOrd, Error> futures_util::Stream
    for CountedRead<Item, Position, Error>
{
    type Item = Result<sea_core::MonitoredStreamItem<Item, Position>, Error>;

    fn poll_next(
        self: std::pin::Pin<&mut Self>,
        context: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        let this = self.get_mut();
        this.faults.read_polls.fetch_add(1, Ordering::SeqCst);
        this.source.as_mut().poll_next(context)
    }
}

impl<Item, Position: Clone + PartialOrd, Error> sea_core::MonitoredStream
    for CountedRead<Item, Position, Error>
{
    type Data = Item;
    type Position = Position;
    type Error = Error;

    fn progress(&self) -> sea_core::MonitoredStreamProgress<Position> {
        self.source.progress()
    }
}

impl<Store> FaultStore<Store> {
    /// Wraps a component from one exclusive memory opening.
    fn new(inner: Store, faults: Arc<Faults>) -> Self {
        Self {
            inner: Arc::new(inner),
            faults,
        }
    }
}

impl<Store: StorageSurface> StorageSurface for FaultStore<Store> {
    type Error = FaultError;
}

#[async_trait]
impl<Store: ReferenceableStore<Error = MemoryStorageError>> ReferenceableStore
    for FaultStore<Store>
{
    type Id = Store::Id;
    type Handle = Store::Handle;
    async fn resolve(&self, id: Self::Id) -> Result<Option<Self::Handle>, Self::Error> {
        self.inner.resolve(id).await.map_err(FaultError::Backend)
    }
    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), Self::Error> {
        self.inner
            .ensure_available(handle)
            .await
            .map_err(FaultError::Backend)
    }
}

#[async_trait]
impl BlobStore for FaultStore<MemoryBlobStore> {
    async fn put_blob(&self, payload: Bytes) -> Result<Self::Handle, Self::Error> {
        self.inner
            .put_blob(payload)
            .await
            .map_err(FaultError::Backend)
    }
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        self.inner.get_blob(id).await.map_err(FaultError::Backend)
    }
    async fn put_directory(&self, directory: BlobDirectory) -> Result<Self::Handle, Self::Error> {
        self.inner
            .put_directory(directory)
            .await
            .map_err(FaultError::Backend)
    }
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.inner
            .get_directory(id)
            .await
            .map_err(FaultError::Backend)
    }
}

#[async_trait]
impl<Store: Archive<Position = EventPosition, Error = MemoryStorageError> + 'static> Archive
    for FaultStore<Store>
{
    type Position = EventPosition;
    type Item = Store::Item;
    type Append = Store::Append;
    type AppendResult = Store::AppendResult;

    fn observe_invalidation(
        &self,
        callback: sea_core::storage::InvalidationCallback<Self::Error>,
    ) -> Option<sea_core::storage::InvalidationRegistration> {
        (!self.faults.unsupported_observer.load(Ordering::SeqCst))
            .then(|| self.faults.invalidation.register(callback))
    }

    async fn append(&self, value: Self::Append) -> Result<Self::AppendResult, Self::Error> {
        self.faults.calls.fetch_add(1, Ordering::SeqCst);
        let failure = std::mem::take(&mut *self.faults.next.lock().unwrap());
        match failure {
            Failure::Reject => return Err(FaultError::Injected(ErrorKind::Rejected)),
            Failure::AmbiguousAbsent => return Err(FaultError::Injected(ErrorKind::Ambiguous)),
            Failure::GateBefore => self.faults.release.notified().await,
            Failure::GateReject => {
                self.faults.release.notified().await;
                return Err(FaultError::Injected(ErrorKind::Rejected));
            }
            _ => {}
        }
        let result = self
            .inner
            .append(value)
            .await
            .map_err(FaultError::Backend)?;
        match failure {
            Failure::GateAfter => self.faults.release.notified().await,
            Failure::FailHead => self.faults.fail_head.store(true, Ordering::SeqCst),
            Failure::FailRead => self.faults.fail_read.store(true, Ordering::SeqCst),
            Failure::FailLookup => self.faults.fail_lookup.store(true, Ordering::SeqCst),
            _ => {}
        }
        if matches!(
            failure,
            Failure::AmbiguousCommitted
                | Failure::FailHead
                | Failure::FailRead
                | Failure::FailLookup
        ) {
            Err(FaultError::Injected(ErrorKind::Ambiguous))
        } else {
            Ok(result)
        }
    }

    /// Stops at a real append failure; grouped ambiguity reports errors for the committed prefix.
    async fn append_batch(
        &self,
        values: Vec<Self::Append>,
    ) -> Vec<Result<Self::AppendResult, Self::Error>> {
        self.faults.batches.fetch_add(1, Ordering::SeqCst);
        let ambiguous = {
            let mut next = self.faults.next.lock().unwrap();
            if matches!(*next, Failure::GateGroupAmbiguous) {
                *next = Failure::None;
                true
            } else {
                false
            }
        };
        if ambiguous {
            self.faults.release.notified().await;
        }
        let mut results = Vec::new();
        for value in values {
            let result = self.append(value).await;
            let failed = result.is_err();
            results.push(if ambiguous && !failed {
                Err(FaultError::Injected(ErrorKind::Ambiguous))
            } else {
                result
            });
            if failed {
                break;
            }
        }
        results
    }

    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<Self::Item, EventPosition, Self::Error> {
        let owner = self.inner.clone();
        let faults = self.faults.clone();
        faults.reads.fetch_add(1, Ordering::SeqCst);
        let source: ArchiveStream<Self::Item, EventPosition, MemoryStorageError> =
            Box::pin(CountedRead {
                source: self.inner.read(after, stop_after),
                faults: faults.clone(),
            });
        map_monitored_stream(
            source,
            move |item| {
                let _keep_writer_opening = &owner;
                if faults.fail_read.swap(false, Ordering::SeqCst) {
                    Err(FaultError::Injected(ErrorKind::Unavailable))
                } else {
                    Ok(item)
                }
            },
            FaultError::Backend,
        )
    }

    async fn head(&self) -> Result<Option<EventPosition>, Self::Error> {
        if self.faults.fail_head.swap(false, Ordering::SeqCst) {
            return Err(FaultError::Injected(ErrorKind::Unavailable));
        }
        self.inner.head().await.map_err(FaultError::Backend)
    }
}

/// Fault injection at the independent document checkpoint boundary.
struct FaultCheckpoint {
    /// Retains the document's independent checkpoint authority.
    inner: Box<dyn sea_core::storage::CheckpointStore<Error = MemoryStorageError>>,
    /// Controls publication failure and cancellation boundaries.
    faults: Arc<Faults>,
}

impl fmt::Debug for FaultCheckpoint {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("FaultCheckpoint")
    }
}

impl StorageSurface for FaultCheckpoint {
    type Error = FaultError;
}

#[async_trait]
impl sea_core::storage::CheckpointStore for FaultCheckpoint {
    async fn checkpoint(&self) -> Result<Option<Bytes>, Self::Error> {
        self.inner.checkpoint().await.map_err(FaultError::Backend)
    }
    async fn publish_checkpoint(&self, checkpoint: Bytes) -> Result<(), Self::Error> {
        let failure = std::mem::take(&mut *self.faults.next.lock().unwrap());
        match failure {
            Failure::Reject => return Err(FaultError::Injected(ErrorKind::Rejected)),
            Failure::AmbiguousAbsent => return Err(FaultError::Injected(ErrorKind::Ambiguous)),
            Failure::GateBefore => self.faults.release.notified().await,
            _ => {}
        }
        self.inner
            .publish_checkpoint(checkpoint)
            .await
            .map_err(FaultError::Backend)?;
        match failure {
            Failure::AmbiguousCommitted => Err(FaultError::Injected(ErrorKind::Ambiguous)),
            Failure::GateAfter => {
                self.faults.release.notified().await;
                Ok(())
            }
            _ => Ok(()),
        }
    }
}

#[async_trait]
impl SnapshotArchive for FaultStore<MemorySnapshotArchive> {
    type BlobHandle = MemoryBlobHandle;
    type EventHandle = MemoryEventHandle;
    async fn get_snapshot_at(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::Item>, Self::Error> {
        self.inner
            .get_snapshot_at(position)
            .await
            .map_err(FaultError::Backend)
    }
    async fn latest_at_or_before(
        &self,
        position: Option<EventPosition>,
    ) -> Result<Option<Self::Item>, Self::Error> {
        if self.faults.fail_lookup.swap(false, Ordering::SeqCst) {
            return Err(FaultError::Injected(ErrorKind::Unavailable));
        }
        self.inner
            .latest_at_or_before(position)
            .await
            .map_err(FaultError::Backend)
    }
}

/// Factory with independent event faults and shared snapshot/checkpoint publication faults.
#[derive(Default)]
struct FaultStorage {
    /// Persistent in-process test document registry.
    inner: MemoryStorage,
    /// Event-append fault controls.
    events: Arc<Faults>,
    /// Shared snapshot and internal-checkpoint publication fault controls.
    snapshots: Arc<Faults>,
}

#[tokio::test]
async fn checkpoint_failure_stops_tail_growth_before_next_submission() {
    for failure in [
        Failure::Reject,
        Failure::AmbiguousAbsent,
        Failure::AmbiguousCommitted,
    ] {
        let storage = FaultStorage::default();
        let (id, runtime) = create_sequencer(&storage).await;
        let writer = member(&runtime).await;
        for _ in 0..super::checkpoint::INTERVAL {
            writer.submit(submission(b"accepted")).await.unwrap();
        }
        storage.snapshots.arm(failure);
        assert!(writer.submit(submission(b"not admitted")).await.is_err());
        assert!(runtime.runtime.lock().await.recovery_required);
        assert_eq!(
            storage.events.calls.load(Ordering::SeqCst),
            super::checkpoint::INTERVAL
        );
        drop((writer, runtime));
        let recovered =
            LocalSequencer::<FaultStorage>::recover(storage.open_view(&id).await.unwrap().unwrap())
                .await
                .unwrap();
        let mut state = recovered.runtime.lock().await;
        assert_eq!(
            state.applied_through.unwrap().get(),
            super::checkpoint::INTERVAL as u64
        );
        state.checkpoint_if_due().await.unwrap();
        assert!(!state.recovery_required);
    }
}

#[tokio::test]
async fn failed_reservations_expose_no_authority_and_recovery_skips_committed_ranges() {
    for (failure, expected) in [
        (Failure::Reject, 1),
        (Failure::AmbiguousAbsent, 1),
        (Failure::AmbiguousCommitted, 257),
    ] {
        let storage = FaultStorage::default();
        let (id, runtime) = create_sequencer(&storage).await;
        storage.snapshots.arm(failure);
        assert!(runtime.open_session(None).await.is_err());
        assert!(runtime.runtime.lock().await.members.is_empty());
        assert!(runtime.open_session(None).await.is_err());
        drop(runtime);
        let recovered =
            LocalSequencer::<FaultStorage>::recover(storage.open_view(&id).await.unwrap().unwrap())
                .await
                .unwrap();
        let session = recovered.open_session(None).await.unwrap();
        assert_eq!(session.session_id().get(), expected);
    }
}

#[tokio::test]
async fn cancelled_reservations_require_recovery_before_allocating_again() {
    for (failure, expected) in [(Failure::GateBefore, 1), (Failure::GateAfter, 257)] {
        let storage = FaultStorage::default();
        let (id, runtime) = create_sequencer(&storage).await;
        storage.snapshots.arm(failure);
        let mut opening = Box::pin(runtime.open_session(None));
        assert!(opening.as_mut().now_or_never().is_none());
        drop(opening);
        assert!(runtime.runtime.lock().await.members.is_empty());
        assert!(runtime.open_session(None).await.is_err());
        drop(runtime);
        let recovered =
            LocalSequencer::<FaultStorage>::recover(storage.open_view(&id).await.unwrap().unwrap())
                .await
                .unwrap();
        assert_eq!(
            recovered
                .open_session(None)
                .await
                .unwrap()
                .session_id()
                .get(),
            expected
        );
    }
}

#[tokio::test]
async fn interrupted_recovery_departures_are_not_duplicated_on_reopen() {
    let storage = FaultStorage::default();
    let (id, runtime) = create_sequencer(&storage).await;
    let first = member(&runtime).await;
    let second = member(&runtime).await;
    first.announce_membership(Bytes::new()).await.unwrap();
    second.announce_membership(Bytes::new()).await.unwrap();
    let identities = [first.session_id().clone(), second.session_id().clone()];
    runtime
        .runtime
        .lock()
        .await
        .publish_checkpoint()
        .await
        .unwrap();
    drop((first, second, runtime));

    storage.events.arm(Failure::GateAfter);
    let mut recovery = Box::pin(LocalSequencer::<FaultStorage>::recover(
        storage.open_view(&id).await.unwrap().unwrap(),
    ));
    assert!(recovery.as_mut().now_or_never().is_none());
    drop(recovery);
    let recovered =
        LocalSequencer::<FaultStorage>::recover(storage.open_view(&id).await.unwrap().unwrap())
            .await
            .unwrap();
    let observer = recovered.open_session(None).await.unwrap();
    let mut history = observer.read(None, Some(EventPosition::new(4)));
    let mut departures = Vec::new();
    while let Some(event) = super::tests::data(&mut history).await {
        if event.kind == sea_core::archive::SessionEventKind::Left {
            departures.push(event.session_id);
        }
    }
    assert_eq!(departures, identities);
    assert_eq!(
        recovered.runtime.lock().await.applied_through,
        Some(EventPosition::new(4))
    );
}

impl FaultStorage {
    /// Wraps every component from one opening without changing handle provenance.
    fn wrap(
        &self,
        components: StorageComponents<MemoryBlobStore, MemoryEventArchive, MemorySnapshotArchive>,
    ) -> StorageComponents<
        FaultStore<MemoryBlobStore>,
        FaultStore<MemoryEventArchive>,
        FaultStore<MemorySnapshotArchive>,
    > {
        StorageComponents {
            checkpoints: Box::new(FaultCheckpoint {
                inner: components.checkpoints,
                faults: self.snapshots.clone(),
            }),
            blobs: FaultStore::new(components.blobs, Arc::default()),
            events: FaultStore::new(components.events, self.events.clone()),
            snapshots: FaultStore::new(components.snapshots, self.snapshots.clone()),
        }
    }
}

#[async_trait]
impl SeaStorage for FaultStorage {
    type Error = FaultError;
    type Blobs = FaultStore<MemoryBlobStore>;
    type Events = FaultStore<MemoryEventArchive>;
    type Snapshots = FaultStore<MemorySnapshotArchive>;
    fn durability(&self) -> Durability {
        Durability::Memory
    }
    async fn create_document(
        &self,
    ) -> Result<CreatedDocument<Self::Blobs, Self::Events, Self::Snapshots>, Self::Error> {
        let created = self
            .inner
            .create_document()
            .await
            .map_err(FaultError::Backend)?;
        Ok(CreatedDocument {
            id: created.id,
            components: self.wrap(created.components),
        })
    }
    async fn open_document(
        &self,
        id: &DocumentId,
    ) -> Result<Option<StorageComponents<Self::Blobs, Self::Events, Self::Snapshots>>, Self::Error>
    {
        Ok(self
            .inner
            .open_document(id)
            .await
            .map_err(FaultError::Backend)?
            .map(|components| self.wrap(components)))
    }
}

/// Creates a fresh fault-injecting document and its exclusive sequencer.
async fn fixture() -> (FaultStorage, Arc<LocalSequencer<FaultStorage>>) {
    let storage = FaultStorage::default();
    let (_, runtime) = create_sequencer(&storage).await;
    (storage, runtime)
}

/// Bounds delayed checks without assuming when the cooperative driver runs.
async fn settles<Output>(future: impl std::future::Future<Output = Output>) -> Output {
    tokio::time::timeout(std::time::Duration::from_secs(5), future)
        .await
        .expect("released work must settle")
}

#[tokio::test]
async fn idle_ready_submissions_apply_before_receipts_and_rejection_ends_authority() {
    let (storage, runtime) = fixture().await;
    let writer = member(&runtime).await;
    let mut receipts = Vec::new();
    for _ in 0..2 {
        let position = writer
            .submit(submission(b"same"))
            .now_or_never()
            .expect("idle ready storage must complete on its first poll")
            .unwrap();
        assert_eq!(runtime.pipeline.occupancy(), (0, 0));
        let state = runtime.runtime.try_lock().unwrap();
        assert!(state.recent_positions.contains(&position));
        assert!(state.member(&writer.session).is_ok());
        receipts.push(position);
    }
    assert!(receipts[0] < receipts[1]);
    storage.events.arm(Failure::Reject);
    assert!(matches!(
        writer.submit(submission(b"rejected")).now_or_never(),
        Some(Err(SessionError::Storage(_)))
    ));
    assert!(matches!(
        writer.submit(submission(b"suffix")).await,
        Err(SessionError::Closed)
    ));
    assert_eq!(storage.events.calls.load(Ordering::SeqCst), 3);
    assert_eq!(storage.events.batches.load(Ordering::SeqCst), 0);
    assert_eq!(runtime.pipeline.occupancy(), (0, 0));
    runtime.shutdown().await.unwrap();
}

#[tokio::test]
async fn buffered_submissions_preserve_first_poll_order_with_exhausted_budget() {
    let storage = MemoryStorage::new();
    let (_, runtime) = create_sequencer(&storage).await;
    let writer = member(&runtime).await;
    let mut pending = futures_util::stream::iter(0..257)
        .map(|index| {
            let writer = &writer;
            async move {
                if index == 0 {
                    while tokio::task::coop::has_budget_remaining() {
                        tokio::task::consume_budget().await;
                    }
                    assert!(!tokio::task::coop::has_budget_remaining());
                }
                let mut input = submission(b"ordered");
                input.event.payload = Bytes::from(index.to_string());
                writer.submit(input).await.unwrap()
            }
        })
        .buffered(128);
    let mut receipts = Vec::new();
    while let Some(position) = settles(pending.next()).await {
        assert!(
            receipts.last().is_none_or(|previous| *previous < position),
            "receipt {} is out of first-poll order: {receipts:?}, {position:?}",
            receipts.len()
        );
        receipts.push(position);
    }
    assert_eq!(receipts.len(), 257);
    let mut replay = writer.read(None, receipts.last().copied());
    for (index, position) in receipts.iter().enumerate() {
        let event = settles(super::tests::data(&mut replay)).await.unwrap();
        assert_eq!(
            event.committed.event.payload,
            Bytes::from(index.to_string())
        );
        assert_eq!(event.committed.position, *position);
    }
    assert!(settles(super::tests::data(&mut replay)).await.is_none());
}

#[tokio::test]
async fn delayed_persistence_admits_a_bounded_ring_and_publishes_only_after_commit() {
    let (storage, runtime) = fixture().await;
    let mut members = Vec::new();
    for _ in 0..257 {
        members.push(member(&runtime).await);
    }
    let observer = member(&runtime).await;
    let mut reader = observer.read(None, None);
    assert!(reader.next().await.unwrap().is_ok());
    for _ in 0..2 {
        storage.events.arm(Failure::GateBefore);
        let mut pending = Vec::new();
        for member in &members {
            let mut future = Box::pin(member.submit(submission(b"queued")));
            assert!(
                tokio::task::unconstrained(future.as_mut())
                    .now_or_never()
                    .is_none()
            );
            pending.push(future);
        }
        assert_eq!(runtime.pipeline.occupancy().0, 256);
        assert!(
            runtime.runtime.try_lock().is_ok(),
            "persistence must not hold admission state"
        );
        assert!(
            reader.next().now_or_never().is_none(),
            "no early reader visibility"
        );
        storage.events.release.notify_one();
        let results = settles(futures_util::future::join_all(pending)).await;
        assert!(results.iter().all(Result::is_ok));
        assert_eq!(runtime.pipeline.occupancy(), (0, 0));
        assert!(storage.events.batches.load(Ordering::SeqCst) > 0);
        for _ in 0..257 {
            settles(super::tests::data(&mut reader)).await.unwrap();
        }
        while reader.next().now_or_never().is_some() {}
    }
}

#[tokio::test]
async fn cancelled_admitted_entry_discards_queued_session_suffix_before_leave() {
    let (storage, runtime) = fixture().await;
    let writer = member(&runtime).await;
    let observer = member(&runtime).await;
    writer.announce_membership(Bytes::new()).await.unwrap();
    storage.events.arm(Failure::GateBefore);
    let mut first = Box::pin(writer.submit(submission(b"first")));
    let mut suffix = Box::pin(writer.submit(submission(b"suffix")));
    assert!(first.as_mut().now_or_never().is_none());
    assert!(suffix.as_mut().now_or_never().is_none());
    assert_eq!(runtime.pipeline.occupancy().0, 2);
    drop(first);
    storage.events.release.notify_one();
    assert!(settles(suffix).await.is_err());
    settles(writer.close()).await.unwrap();
    let mut reader = observer.read(None, Some(EventPosition::new(3)));
    assert_eq!(
        super::tests::data(&mut reader).await.unwrap().kind,
        sea_core::archive::SessionEventKind::Joined
    );
    assert_eq!(
        super::tests::data(&mut reader)
            .await
            .unwrap()
            .committed
            .event
            .payload,
        Bytes::from_static(b"first")
    );
    assert_eq!(
        super::tests::data(&mut reader).await.unwrap().kind,
        sea_core::archive::SessionEventKind::Left
    );
    assert_eq!(storage.events.calls.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn definitive_failure_never_dispatches_the_queued_same_session_suffix() {
    let (storage, runtime) = fixture().await;
    let writer = member(&runtime).await;
    storage.events.arm(Failure::GateReject);
    let mut first = Box::pin(writer.submit(submission(b"first")));
    let mut suffix = Box::pin(writer.submit(submission(b"suffix")));
    assert!(first.as_mut().now_or_never().is_none());
    assert!(suffix.as_mut().now_or_never().is_none());
    storage.events.release.notify_one();
    let (first, suffix) = settles(futures_util::future::join(first, suffix)).await;
    assert!(first.is_err());
    assert!(suffix.is_err());
    assert_eq!(storage.events.calls.load(Ordering::SeqCst), 1);
    assert!(runtime.runtime.lock().await.recent_positions.is_empty());
}

#[tokio::test]
async fn grouped_ambiguity_poisoning_prevents_suffix_and_terminal_leave() {
    let (storage, runtime) = fixture().await;
    let first = member(&runtime).await;
    let second = member(&runtime).await;
    let third = member(&runtime).await;
    second.announce_membership(Bytes::new()).await.unwrap();
    storage.events.arm(Failure::GateBefore);
    let mut blocked = Box::pin(first.submit(submission(b"blocked")));
    let mut ambiguous = Box::pin(second.submit(submission(b"ambiguous")));
    let mut also_ambiguous = Box::pin(third.submit(submission(b"also-ambiguous")));
    assert!(blocked.as_mut().now_or_never().is_none());
    assert!(ambiguous.as_mut().now_or_never().is_none());
    assert!(also_ambiguous.as_mut().now_or_never().is_none());
    storage.events.release.notify_one();
    assert!(settles(blocked).await.is_ok());
    storage.events.arm(Failure::GateGroupAmbiguous);
    settles(async {
        while storage.events.batches.load(Ordering::SeqCst) == 0 {
            assert!(ambiguous.as_mut().now_or_never().is_none());
            tokio::task::yield_now().await;
        }
    })
    .await;
    let mut suffix = Box::pin(second.submit(submission(b"suffix")));
    assert!(suffix.as_mut().now_or_never().is_none());
    storage.events.release.notify_one();
    assert!(matches!(
        settles(ambiguous).await,
        Err(SessionError::RecoveryRequired)
    ));
    assert!(matches!(
        settles(also_ambiguous).await,
        Err(SessionError::RecoveryRequired)
    ));
    assert!(settles(suffix).await.is_err());
    assert!(matches!(
        settles(second.close()).await,
        Err(SessionError::RecoveryRequired)
    ));
    assert_eq!(storage.events.calls.load(Ordering::SeqCst), 4);
}

#[tokio::test]
async fn admitted_inputs_do_not_retain_oversized_caller_backing() {
    let (storage, runtime) = fixture().await;
    let first = member(&runtime).await;
    let second = member(&runtime).await;
    storage.events.arm(Failure::GateBefore);
    let mut pending = Vec::new();
    for writer in [&first, &second] {
        let owner = Arc::<[u8]>::from(vec![7; 8192]);
        let weak = Arc::downgrade(&owner);
        let mut input = submission(b"");
        input.event.payload = Bytes::from_owner(owner).slice(12..19);
        let mut future = Box::pin(writer.submit(input));
        assert!(future.as_mut().now_or_never().is_none());
        assert!(
            weak.upgrade().is_none(),
            "admitted payload retains caller backing"
        );
        pending.push(future);
    }
    assert_eq!(runtime.pipeline.occupancy().0, 2);
    storage.events.release.notify_one();
    assert!(
        settles(futures_util::future::join_all(pending))
            .await
            .iter()
            .all(Result::is_ok)
    );
    assert_eq!(runtime.pipeline.occupancy(), (0, 0));
}

#[tokio::test]
async fn unavailable_tree_rejects_singleton_and_batch_before_storage_append() {
    for batched in [false, true] {
        let (storage, runtime) = fixture().await;
        let leader = member(&runtime).await;
        let writer = member(&runtime).await;
        let mut invalid = submission(b"unavailable tree");
        invalid.event.blob_tree = Some(sea_core::BlobTreeId::Blob(BlobId::for_bytes(b"absent")));
        if batched {
            storage.events.arm(Failure::GateBefore);
            let mut blocked = Box::pin(leader.submit(submission(b"leader")));
            assert!(blocked.as_mut().now_or_never().is_none());
            let mut invalid = Box::pin(writer.submit(invalid));
            let mut suffix = Box::pin(writer.submit(submission(b"suffix")));
            assert!(invalid.as_mut().now_or_never().is_none());
            assert!(suffix.as_mut().now_or_never().is_none());
            assert_eq!(runtime.pipeline.occupancy().0, 3);
            storage.events.release.notify_one();
            settles(blocked).await.unwrap();
            assert!(matches!(
                settles(invalid).await,
                Err(SessionError::Rejected("event tree unavailable"))
            ));
            assert!(settles(suffix).await.is_err());
        } else {
            assert!(matches!(
                writer.submit(invalid).await,
                Err(SessionError::Rejected("event tree unavailable"))
            ));
        }
        assert_eq!(
            storage.events.calls.load(Ordering::SeqCst),
            usize::from(batched)
        );
        assert_eq!(runtime.pipeline.occupancy(), (0, 0));
        assert!(matches!(
            writer.submit(submission(b"after failure")).await,
            Err(SessionError::Closed)
        ));
    }
}

#[tokio::test]
async fn byte_bound_backpressures_before_the_entry_limit() {
    let (storage, runtime) = fixture().await;
    let first = member(&runtime).await;
    let second = member(&runtime).await;
    let mut large = submission(b"large");
    large.event.payload = Bytes::from(vec![0; 3 * 1024 * 1024]);
    storage.events.arm(Failure::GateBefore);
    let mut blocked = Box::pin(first.submit(large));
    assert!(blocked.as_mut().now_or_never().is_none());
    let mut large = submission(b"other-large");
    large.event.payload = Bytes::from(vec![0; 2 * 1024 * 1024]);
    let mut waiting = Box::pin(second.submit(large));
    assert!(waiting.as_mut().now_or_never().is_none());
    assert_eq!(runtime.pipeline.occupancy().0, 1);
    storage.events.release.notify_one();
    assert!(settles(blocked).await.is_ok());
    assert!(settles(waiting).await.is_ok());
    assert_eq!(runtime.pipeline.occupancy(), (0, 0));
}

#[tokio::test]
async fn capacity_wait_preserves_same_session_order_and_failure_prefix() {
    for invalid in [false, true] {
        let (storage, runtime) = fixture().await;
        let leader = member(&runtime).await;
        let writer = member(&runtime).await;
        let cloned_writer = writer.clone();
        let mut input = submission(b"blocked");
        input.event.payload = Bytes::from(vec![0; 3 * 1024 * 1024]);
        storage.events.arm(Failure::GateBefore);
        let mut blocked = Box::pin(leader.submit(input));
        assert!(
            tokio::task::unconstrained(blocked.as_mut())
                .now_or_never()
                .is_none()
        );
        let mut input = submission(b"first");
        input.event.payload = Bytes::from(vec![0; 2 * 1024 * 1024]);
        if invalid {
            input.reference = Some(EventPosition::new(999));
        }
        let mut first = Box::pin(writer.submit(input));
        let mut second = Box::pin(cloned_writer.submit(submission(b"second")));
        assert!(
            tokio::task::unconstrained(first.as_mut())
                .now_or_never()
                .is_none()
        );
        assert!(
            tokio::task::unconstrained(second.as_mut())
                .now_or_never()
                .is_none()
        );
        assert_eq!(
            runtime.pipeline.occupancy().0,
            1,
            "neither writer input may bypass capacity admission"
        );
        storage.events.release.notify_one();
        settles(blocked).await.unwrap();
        let (second, first) = settles(futures_util::future::join(second, first)).await;
        if invalid {
            assert!(matches!(first, Err(SessionError::Rejected(_))));
            assert!(matches!(second, Err(SessionError::Closed)));
            assert_eq!(storage.events.calls.load(Ordering::SeqCst), 1);
        } else {
            assert_eq!(first.unwrap(), EventPosition::new(2));
            assert_eq!(second.unwrap(), EventPosition::new(3));
            assert_eq!(storage.events.calls.load(Ordering::SeqCst), 3);
        }
        assert_eq!(runtime.pipeline.occupancy(), (0, 0));
    }
}

#[tokio::test]
async fn capacity_wait_cancellation_preserves_authority_and_close_needs_no_admission_lock() {
    for close in [false, true] {
        let (storage, runtime) = fixture().await;
        let leader = member(&runtime).await;
        let writer = member(&runtime).await;
        let cloned_writer = writer.clone();
        let mut input = submission(b"blocked");
        input.event.payload = Bytes::from(vec![0; 3 * 1024 * 1024]);
        storage.events.arm(Failure::GateBefore);
        let mut blocked = Box::pin(leader.submit(input));
        assert!(
            tokio::task::unconstrained(blocked.as_mut())
                .now_or_never()
                .is_none()
        );
        let mut input = submission(b"first");
        input.event.payload = Bytes::from(vec![0; 2 * 1024 * 1024]);
        let mut first = Box::pin(writer.submit(input));
        assert!(
            tokio::task::unconstrained(first.as_mut())
                .now_or_never()
                .is_none()
        );
        let mut cancelled_waiter = Box::pin(cloned_writer.submit(submission(b"cancelled-waiter")));
        assert!(
            tokio::task::unconstrained(cancelled_waiter.as_mut())
                .now_or_never()
                .is_none()
        );
        let mut second = Box::pin(cloned_writer.submit(submission(b"second")));
        assert!(
            tokio::task::unconstrained(second.as_mut())
                .now_or_never()
                .is_none()
        );
        assert_eq!(runtime.pipeline.occupancy().0, 1);
        drop(cancelled_waiter);
        if close {
            let mut closing = Box::pin(writer.close());
            assert!(
                tokio::task::unconstrained(closing.as_mut())
                    .now_or_never()
                    .is_none()
            );
            storage.events.release.notify_one();
            settles(closing).await.unwrap();
            assert!(matches!(settles(first).await, Err(SessionError::Closed)));
            assert!(matches!(settles(second).await, Err(SessionError::Closed)));
            settles(blocked).await.unwrap();
            assert_eq!(storage.events.calls.load(Ordering::SeqCst), 1);
        } else {
            drop(first);
            assert!(
                tokio::task::unconstrained(second.as_mut())
                    .now_or_never()
                    .is_none()
            );
            assert_eq!(
                runtime.pipeline.occupancy().0,
                2,
                "cancelling preadmission waiters lets the fitting successor enter"
            );
            storage.events.release.notify_one();
            settles(blocked).await.unwrap();
            assert_eq!(settles(second).await.unwrap(), EventPosition::new(2));
            assert_eq!(
                settles(writer.submit(submission(b"later"))).await.unwrap(),
                EventPosition::new(3)
            );
            assert_eq!(storage.events.calls.load(Ordering::SeqCst), 3);
        }
        assert_eq!(runtime.pipeline.occupancy(), (0, 0));
    }
}

#[tokio::test]
async fn same_session_batch_rejects_invalid_entry_and_suffix_but_settles_prepared_prefix() {
    let (storage, runtime) = fixture().await;
    let leader = member(&runtime).await;
    let writer = member(&runtime).await;
    storage.events.arm(Failure::GateBefore);
    let mut blocked = Box::pin(leader.submit(submission(b"blocked")));
    assert!(blocked.as_mut().now_or_never().is_none());
    let mut first = Box::pin(writer.submit(submission(b"equal")));
    let mut second = Box::pin(writer.submit(submission(b"equal")));
    let mut invalid = submission(b"invalid");
    invalid.reference = Some(EventPosition::new(999));
    let mut invalid = Box::pin(writer.submit(invalid));
    let mut suffix = Box::pin(writer.submit(submission(b"suffix")));
    for future in [&mut first, &mut second, &mut invalid, &mut suffix] {
        assert!(future.as_mut().now_or_never().is_none());
    }
    storage.events.release.notify_one();
    assert!(settles(blocked).await.is_ok());
    let first = settles(first).await.unwrap();
    let second = settles(second).await.unwrap();
    assert!(
        first < second,
        "equal inputs must receive distinct ordered positions"
    );
    assert!(matches!(
        settles(invalid).await,
        Err(SessionError::Rejected(_))
    ));
    assert!(matches!(settles(suffix).await, Err(SessionError::Closed)));
    assert_eq!(storage.events.batches.load(Ordering::SeqCst), 1);
    assert_eq!(storage.events.calls.load(Ordering::SeqCst), 3);
    assert_eq!(runtime.pipeline.occupancy(), (0, 0));
}

#[tokio::test]
async fn cancelled_dispatched_same_session_batch_settles_before_leave_without_queued_suffix() {
    let (storage, runtime) = fixture().await;
    let leader = member(&runtime).await;
    let writer = member(&runtime).await;
    writer.announce_membership(Bytes::new()).await.unwrap();
    storage.events.arm(Failure::GateBefore);
    let mut blocked = Box::pin(leader.submit(submission(b"blocked")));
    assert!(blocked.as_mut().now_or_never().is_none());
    let mut first = Box::pin(writer.submit(submission(b"first")));
    let mut second = Box::pin(writer.submit(submission(b"second")));
    assert!(first.as_mut().now_or_never().is_none());
    assert!(second.as_mut().now_or_never().is_none());
    storage.events.release.notify_one();
    settles(blocked).await.unwrap();
    storage.events.arm(Failure::GateBefore);
    settles(async {
        while storage.events.batches.load(Ordering::SeqCst) == 0 {
            assert!(first.as_mut().now_or_never().is_none());
            tokio::task::yield_now().await;
        }
    })
    .await;
    assert_eq!(storage.events.batches.load(Ordering::SeqCst), 1);
    let mut suffix = Box::pin(writer.submit(submission(b"suffix")));
    assert!(suffix.as_mut().now_or_never().is_none());
    drop(first);
    storage.events.release.notify_one();
    settles(second).await.unwrap();
    assert!(settles(suffix).await.is_err());
    settles(writer.close()).await.unwrap();
    let mut reader = leader.read(None, Some(EventPosition::new(5)));
    let mut records = Vec::new();
    while let Some(record) = settles(super::tests::data(&mut reader)).await {
        records.push(record);
    }
    assert_eq!(records.len(), 5);
    assert_eq!(
        records[2].committed.event.payload,
        Bytes::from_static(b"first")
    );
    assert_eq!(
        records[3].committed.event.payload,
        Bytes::from_static(b"second")
    );
    assert_eq!(records[4].kind, sea_core::archive::SessionEventKind::Left);
    assert_eq!(storage.events.calls.load(Ordering::SeqCst), 5);
}

#[tokio::test]
async fn batch_floor_does_not_invalidate_a_prepared_lower_reference() {
    let storage = FaultStorage::default();
    let (id, runtime) = create_sequencer(&storage).await;
    let leader = member(&runtime).await;
    let writer = member(&runtime).await;
    let mut reference = None;
    for _ in 0..1100 {
        let mut input = submission(b"seed");
        input.reference = reference;
        reference = Some(writer.submit(input).await.unwrap());
    }
    let floor = runtime.runtime.lock().await.minimum_reference;
    assert_eq!(floor, Some(EventPosition::new(64)));
    let mut input = submission(b"blocked");
    input.reference = floor;
    storage.events.arm(Failure::GateBefore);
    let mut blocked = Box::pin(leader.submit(input));
    assert!(blocked.as_mut().now_or_never().is_none());
    let mut high = submission(b"high");
    high.reference = reference;
    let mut low = submission(b"low");
    low.reference = floor;
    let mut high = Box::pin(writer.submit(high));
    let mut low = Box::pin(writer.submit(low));
    assert!(high.as_mut().now_or_never().is_none());
    assert!(low.as_mut().now_or_never().is_none());
    storage.events.release.notify_one();
    settles(blocked).await.unwrap();
    settles(high).await.unwrap();
    settles(low).await.unwrap();
    assert_eq!(storage.events.batches.load(Ordering::SeqCst), 1);
    assert_eq!(runtime.runtime.lock().await.minimum_reference, floor);
    drop((leader, writer, runtime));
    let recovered =
        LocalSequencer::<FaultStorage>::recover(storage.open_view(&id).await.unwrap().unwrap())
            .await
            .unwrap();
    assert_eq!(recovered.runtime.lock().await.minimum_reference, floor);
}

#[tokio::test]
async fn floor_advances_only_with_the_committed_event() {
    for failure in [
        Failure::Reject,
        Failure::AmbiguousAbsent,
        Failure::AmbiguousCommitted,
    ] {
        let storage = FaultStorage::default();
        let (id, runtime) = create_sequencer(&storage).await;
        let session = member(&runtime).await;
        let initial = session.submit(submission(b"initial")).await.unwrap();
        let mut advancing = submission(b"advance");
        advancing.reference = Some(initial);
        storage.events.arm(failure);
        let committed = session.submit(advancing).await.is_ok();
        assert_eq!(committed, matches!(failure, Failure::AmbiguousCommitted));
        let expected = committed.then_some(initial);
        assert_eq!(runtime.runtime.lock().await.minimum_reference, expected);
        drop((session, runtime));
        let recovered =
            LocalSequencer::<FaultStorage>::recover(storage.open_view(&id).await.unwrap().unwrap())
                .await
                .unwrap();
        assert_eq!(recovered.runtime.lock().await.minimum_reference, expected);
    }
}

#[tokio::test]
async fn returned_ambiguity_is_scanned_and_rejection_requires_fresh_membership() {
    for failure in [
        Failure::AmbiguousCommitted,
        Failure::AmbiguousAbsent,
        Failure::Reject,
    ] {
        let (storage, runtime) = fixture().await;
        let session = member(&runtime).await;
        storage.events.arm(failure);
        let result = session.submit(submission(b"operation")).await;
        assert_eq!(storage.events.calls.load(Ordering::SeqCst), 1);
        if matches!(failure, Failure::AmbiguousCommitted) {
            let position = result.unwrap();
            assert!(session.submit(submission(b"operation")).await.unwrap() > position);
            assert_eq!(storage.events.calls.load(Ordering::SeqCst), 2);
        } else {
            assert!(result.is_err());
            assert!(matches!(
                session.submit(submission(b"later")).await,
                Err(SessionError::Closed)
            ));
            let session = member(&runtime).await;
            assert!(
                session
                    .view()
                    .await
                    .unwrap()
                    .head()
                    .await
                    .unwrap()
                    .is_none()
            );
            session.submit(submission(b"operation")).await.unwrap();
            assert_eq!(storage.events.calls.load(Ordering::SeqCst), 2);
        }
    }
}

#[tokio::test]
async fn failed_reconciliation_blocks_mutation_and_absence_claims_until_recovery() {
    for failure in [Failure::FailHead, Failure::FailRead] {
        let storage = FaultStorage::default();
        let (id, runtime) = create_sequencer(&storage).await;
        let session = member(&runtime).await;
        storage.events.arm(failure);
        assert!(matches!(
            session.submit(submission(b"uncertain")).await,
            Err(SessionError::RecoveryRequired)
        ));
        assert!(matches!(
            session.close().await,
            Err(SessionError::RecoveryRequired)
        ));
        assert!(session.submit(submission(b"later")).await.is_err());
        assert_eq!(storage.events.calls.load(Ordering::SeqCst), 1);
        drop((session, runtime));
        let recovered =
            LocalSequencer::<FaultStorage>::recover(storage.open_view(&id).await.unwrap().unwrap())
                .await
                .unwrap();
        let session = member(&recovered).await;
        let mut replay = session.read(None, None);
        assert_eq!(
            super::tests::data(&mut replay)
                .await
                .unwrap()
                .committed
                .event
                .payload,
            Bytes::from_static(b"uncertain")
        );
    }
}

#[tokio::test]
async fn failed_reconciliation_prevents_terminal_leave_until_recovery() {
    use sea_core::archive::SessionEventKind;
    for failure in [Failure::FailHead, Failure::FailRead] {
        for shutdown in [false, true] {
            let storage = FaultStorage::default();
            let (id, runtime) = create_sequencer(&storage).await;
            let session = member(&runtime).await;
            let old_session = session.session.clone();
            session.announce_membership(Bytes::new()).await.unwrap();
            storage.events.arm(failure);
            assert!(matches!(
                session.submit(submission(b"uncertain")).await,
                Err(SessionError::RecoveryRequired)
            ));
            assert_eq!(storage.events.calls.load(Ordering::SeqCst), 2);
            let result = if shutdown {
                runtime.shutdown().await
            } else {
                session.close().await
            };
            assert!(matches!(result, Err(SessionError::RecoveryRequired)));
            assert_eq!(
                storage.events.calls.load(Ordering::SeqCst),
                2,
                "unresolved settlement must not append a terminal leave"
            );
            assert!(
                storage.open_view(&id).await.is_err(),
                "failed close or shutdown must not release the unresolved view"
            );
            drop((session, runtime));
            let recovered = LocalSequencer::<FaultStorage>::recover(
                storage.open_view(&id).await.unwrap().unwrap(),
            )
            .await
            .unwrap();
            assert_eq!(storage.events.calls.load(Ordering::SeqCst), 3);
            let observer = member(&recovered).await;
            let head = observer
                .view()
                .await
                .unwrap()
                .head()
                .await
                .unwrap()
                .unwrap();
            let mut stream = observer.read(None, Some(head));
            let mut kinds = Vec::new();
            while let Some(item) = stream.next().await {
                if let sea_core::MonitoredStreamItem::Item(event) = item.unwrap() {
                    assert_eq!(event.session_id, old_session);
                    kinds.push(event.kind);
                }
            }
            assert_eq!(
                kinds,
                vec![
                    SessionEventKind::Joined,
                    SessionEventKind::Application,
                    SessionEventKind::Left,
                ]
            );
        }
    }
}

#[tokio::test]
async fn repeated_close_ignores_an_unrelated_recovery_failure() {
    let (storage, runtime) = fixture().await;
    let closed = member(&runtime).await;
    let active = member(&runtime).await;
    closed.close().await.unwrap();
    storage.events.arm(Failure::FailHead);
    assert!(matches!(
        active.submit(submission(b"uncertain")).await,
        Err(SessionError::RecoveryRequired)
    ));
    closed.close().await.unwrap();
}

#[tokio::test]
async fn cancelling_before_or_after_commit_retains_the_same_backend_future_until_settlement() {
    for failure in [Failure::GateBefore, Failure::GateAfter] {
        let (storage, runtime) = fixture().await;
        let first = member(&runtime).await;
        let second = member(&runtime).await;
        storage.events.arm(failure);
        assert!(
            first
                .submit(submission(b"cancelled"))
                .now_or_never()
                .is_none()
        );
        assert!(
            second
                .submit(submission(b"blocked"))
                .now_or_never()
                .is_none()
        );
        assert!(runtime.shutdown().now_or_never().is_none());
        assert_eq!(storage.events.calls.load(Ordering::SeqCst), 1);
        storage.events.release.notify_one();
        let accepted = second
            .submit(submission(b"after-settlement"))
            .await
            .unwrap();
        assert!(matches!(
            first.submit(submission(b"must-not-commit")).await,
            Err(SessionError::Closed)
        ));
        let mut replay = second.read(None, Some(accepted));
        let cancelled = super::tests::data(&mut replay).await.unwrap();
        assert_eq!(cancelled.session_id, first.session);
        assert_eq!(
            cancelled.committed.event.payload,
            Bytes::from_static(b"cancelled")
        );
        assert!(cancelled.committed.position < accepted);
        assert_eq!(
            super::tests::data(&mut replay)
                .await
                .unwrap()
                .committed
                .position,
            accepted
        );
        assert!(super::tests::data(&mut replay).await.is_none());
        assert_eq!(storage.events.calls.load(Ordering::SeqCst), 2);
    }
}

#[tokio::test]
async fn failed_append_and_cancelled_ack_end_announced_prefix_before_later_work() {
    use sea_core::archive::SessionEventKind;
    for failure in [
        Failure::Reject,
        Failure::AmbiguousAbsent,
        Failure::GateBefore,
        Failure::GateAfter,
    ] {
        let (storage, runtime) = fixture().await;
        let first = member(&runtime).await;
        let observer = member(&runtime).await;
        first.announce_membership(Bytes::new()).await.unwrap();
        first.submit(submission(b"accepted")).await.unwrap();
        storage.events.arm(failure);
        let cancelled = matches!(failure, Failure::GateBefore | Failure::GateAfter);
        if cancelled {
            assert!(
                first
                    .submit(submission(b"uncertain"))
                    .now_or_never()
                    .is_none()
            );
            storage.events.release.notify_one();
        } else {
            assert!(first.submit(submission(b"uncertain")).await.is_err());
        }
        assert!(matches!(
            first.submit(submission(b"later")).await,
            Err(SessionError::Closed)
        ));
        first.close().await.unwrap();
        observer
            .submit(submission(b"observer-event"))
            .await
            .unwrap();
        let mut stream = observer.read(None, None);
        let mut kinds = Vec::new();
        let mut operations = Vec::new();
        while let Some(item) = stream.next().await {
            match item.unwrap() {
                sea_core::MonitoredStreamItem::Item(event) => {
                    if event.session_id == first.session {
                        kinds.push(event.kind);
                        if event.kind == SessionEventKind::Application {
                            operations.push(event.committed.event.payload);
                        }
                    }
                }
                sea_core::MonitoredStreamItem::Progress(progress)
                    if progress.status == sea_core::MonitoredStreamStatus::AwaitingNewItems =>
                {
                    break;
                }
                sea_core::MonitoredStreamItem::Progress(_) => {}
            }
        }
        let mut expected = vec![SessionEventKind::Joined, SessionEventKind::Application];
        if cancelled {
            expected.push(SessionEventKind::Application);
        }
        expected.push(SessionEventKind::Left);
        assert_eq!(kinds, expected);
        assert_eq!(operations[0], Bytes::from_static(b"accepted"));
        assert_eq!(operations.len(), if cancelled { 2 } else { 1 });
    }
}

#[tokio::test]
async fn revoking_publisher_does_not_cancel_an_admitted_snapshot() {
    use sea_core::storage::StorageHandle;
    let (storage, runtime) = fixture().await;
    let session = member(&runtime).await;
    let position = session.submit(submission(b"boundary")).await.unwrap();
    let snapshot = Snapshot {
        root: session.put_blob(Bytes::new()).await.unwrap(),
        at_event: session.resolve_position(position).await.unwrap().unwrap(),
    };
    let authority = session
        .coordinate_snapshots(SnapshotParticipation::ClientSelected)
        .await
        .unwrap();
    storage.snapshots.arm(Failure::GateBefore);
    let mut publication = Box::pin(session.publish_snapshot(None, None, snapshot.clone()));
    assert!(publication.as_mut().now_or_never().is_none());
    assert_eq!(storage.snapshots.calls.load(Ordering::SeqCst), 1);
    drop(authority);
    storage.snapshots.release.notify_one();
    assert_eq!(settles(publication).await.unwrap().at_event.id(), position);
    assert_eq!(
        session
            .get_snapshot(LoadStart::LatestSnapshot)
            .await
            .unwrap()
            .unwrap()
            .root
            .id(),
        snapshot.root.id()
    );
    assert!(
        session
            .publish_snapshot(None, None, snapshot)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn snapshot_cancellation_and_ambiguity_preserve_publication_order() {
    for failure in [
        Failure::GateBefore,
        Failure::GateAfter,
        Failure::AmbiguousCommitted,
        Failure::AmbiguousAbsent,
        Failure::FailLookup,
    ] {
        let (storage, runtime) = fixture().await;
        let session = member(&runtime).await;
        let position = session.submit(submission(b"boundary")).await.unwrap();
        let root = session.put_blob(Bytes::new()).await.unwrap();
        let snapshot = Snapshot {
            root,
            at_event: session.resolve_position(position).await.unwrap().unwrap(),
        };
        let _authority = session
            .coordinate_snapshots(SnapshotParticipation::ClientSelected)
            .await
            .unwrap();
        storage.snapshots.arm(failure);
        if matches!(failure, Failure::GateBefore | Failure::GateAfter) {
            assert!(
                session
                    .publish_snapshot(None, None, snapshot.clone())
                    .now_or_never()
                    .is_none()
            );
            assert!(
                session
                    .submit(submission(b"must-wait"))
                    .now_or_never()
                    .is_none()
            );
            storage.snapshots.release.notify_one();
            session
                .publish_snapshot(None, None, snapshot)
                .await
                .unwrap();
        } else {
            let result = session.publish_snapshot(None, None, snapshot).await;
            if matches!(failure, Failure::AmbiguousCommitted) {
                assert!(result.is_ok());
            } else {
                assert!(matches!(result, Err(SessionError::RecoveryRequired)));
                assert!(session.submit(submission(b"unsafe")).await.is_err());
            }
        }
        assert_eq!(storage.snapshots.calls.load(Ordering::SeqCst), 1);
    }
}

#[tokio::test]
async fn shutdown_and_session_close_work_when_backend_streams_retain_writer_ownership() {
    let storage = FaultStorage::default();
    let (id, runtime) = create_sequencer(&storage).await;
    let first = member(&runtime).await;
    let second = member(&runtime).await;
    let mut first_read = first.read(None, None);
    let mut second_read = second.load(LoadStart::Beginning).await.unwrap().events;
    first_read.next().await.unwrap().unwrap();
    second_read.next().await.unwrap().unwrap();
    first.close().await.unwrap();
    assert!(first_read.next().await.is_none());
    second.submit(submission(b"still-open")).await.unwrap();
    runtime.shutdown().await.unwrap();
    assert!(
        storage.open_view(&id).await.is_err(),
        "backend stream still owns its component"
    );
    drop((first_read, second_read));
    assert!(storage.open_view(&id).await.unwrap().is_some());
}
