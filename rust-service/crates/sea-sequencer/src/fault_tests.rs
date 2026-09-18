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

use super::{
    LocalSequencer, SessionError,
    tests::{member, submission},
};
use sea_core::{
    archive::{OperationId, SnapshotParticipation},
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
}

/// Deterministic fault injection and append-call accounting.
#[derive(Default)]
struct Faults {
    /// Behavior consumed by the next append.
    next: StdMutex<Failure>,
    /// Number of backend append invocations, including pending ones.
    calls: AtomicUsize,
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
    /// Arms a single append failure.
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

    async fn append(&self, value: Self::Append) -> Result<Self::AppendResult, Self::Error> {
        self.faults.calls.fetch_add(1, Ordering::SeqCst);
        let failure = std::mem::take(&mut *self.faults.next.lock().unwrap());
        match failure {
            Failure::Reject => return Err(FaultError::Injected(ErrorKind::Rejected)),
            Failure::AmbiguousAbsent => return Err(FaultError::Injected(ErrorKind::Ambiguous)),
            Failure::GateBefore => self.faults.release.notified().await,
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

    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<Self::Item, EventPosition, Self::Error> {
        let owner = self.inner.clone();
        let faults = self.faults.clone();
        map_monitored_stream(
            self.inner.read(after, stop_after),
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

/// Factory with separately controlled event and snapshot failures.
#[derive(Default)]
struct FaultStorage {
    /// Persistent in-process test document registry.
    inner: MemoryStorage,
    /// Event-append fault controls.
    events: Arc<Faults>,
    /// Snapshot-publication fault controls.
    snapshots: Arc<Faults>,
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

#[tokio::test]
async fn returned_ambiguity_is_scanned_without_resubmitting_and_absence_allows_explicit_retry() {
    for failure in [
        Failure::AmbiguousCommitted,
        Failure::AmbiguousAbsent,
        Failure::Reject,
    ] {
        let storage = FaultStorage::default();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<FaultStorage>::recover(view).await.unwrap();
        let session = member(&runtime, "author").await;
        storage.events.arm(failure);
        let result = session.submit(submission(b"operation")).await;
        assert_eq!(storage.events.calls.load(Ordering::SeqCst), 1);
        if matches!(failure, Failure::AmbiguousCommitted) {
            let position = result.unwrap();
            assert_eq!(
                session.submit(submission(b"operation")).await.unwrap(),
                position
            );
            assert_eq!(storage.events.calls.load(Ordering::SeqCst), 1);
        } else {
            assert!(result.is_err());
            assert!(
                session
                    .resolve_submission(&OperationId::new("operation").unwrap())
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
        let (id, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<FaultStorage>::recover(view).await.unwrap();
        let session = member(&runtime, "author").await;
        storage.events.arm(failure);
        assert!(matches!(
            session.submit(submission(b"uncertain")).await,
            Err(SessionError::RecoveryRequired)
        ));
        assert!(matches!(
            session
                .resolve_submission(&OperationId::new("uncertain").unwrap())
                .await,
            Err(SessionError::RecoveryRequired)
        ));
        assert!(session.submit(submission(b"later")).await.is_err());
        assert_eq!(storage.events.calls.load(Ordering::SeqCst), 1);
        drop((session, runtime));
        let recovered =
            LocalSequencer::<FaultStorage>::recover(storage.open_view(&id).await.unwrap().unwrap())
                .await
                .unwrap();
        let session = member(&recovered, "new-author").await;
        assert!(
            session
                .resolve_submission(&OperationId::new("uncertain").unwrap())
                .await
                .unwrap()
                .is_some()
        );
    }
}

#[tokio::test]
async fn repeated_close_ignores_an_unrelated_recovery_failure() {
    let storage = FaultStorage::default();
    let (_, view) = storage.create_view().await.unwrap();
    let runtime = LocalSequencer::<FaultStorage>::recover(view).await.unwrap();
    let closed = member(&runtime, "closed").await;
    let active = member(&runtime, "active").await;
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
        let storage = FaultStorage::default();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<FaultStorage>::recover(view).await.unwrap();
        let first = member(&runtime, "first").await;
        let second = member(&runtime, "second").await;
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
        let cancelled = first
            .resolve_submission(&OperationId::new("cancelled").unwrap())
            .await
            .unwrap()
            .unwrap();
        assert!(cancelled < accepted);
        assert!(
            first
                .resolve_submission(&OperationId::new("blocked").unwrap())
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(storage.events.calls.load(Ordering::SeqCst), 2);
    }
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
        let storage = FaultStorage::default();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<FaultStorage>::recover(view).await.unwrap();
        let session = member(&runtime, "author").await;
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
    let (id, view) = storage.create_view().await.unwrap();
    let runtime = LocalSequencer::<FaultStorage>::recover(view).await.unwrap();
    let first = member(&runtime, "first").await;
    let second = member(&runtime, "second").await;
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
