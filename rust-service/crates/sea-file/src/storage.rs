//! Document components over exclusive journals and hash-addressed immutable content.
//!
//! [`crate::FileStorage`] allocates numeric document identities below a canonical namespace
//! and opens OS-locked event and snapshot journals per document. All components share that
//! opening and its mutation order. Availability handles retain canonical-path provenance but no
//! writer ownership; components and streams retain the opening until dropped.
//!
//! Publication orders immutable content before referencing events and events before snapshots.
//! Recovery validates journal tails and dependencies after storage-owned settled cursors.
//! Events use literal byte offsets, while snapshot traversal remains private to storage. Raw event components keep
//! tree identities opaque, while the composed view resolves availability before publication.
//!
//! Reads initialize lazily, register wakeups under the published-state lock, and preserve
//! exclusive-lower and inclusive-upper archive bounds. Event batches run on Tokio blocking workers
//! that retain the opening after caller cancellation. Their disk I/O does not hold the state lock.
//! Returned results establish settlement; cancellation does not. Creation, recovery, blob writes,
//! and snapshot writes remain synchronous barriers. No mutation is retried automatically.
//! Uncertain writes and failed workers terminate authoritative observations until recovery.

pub use crate::journal::FileStorageError;
use crate::{
    atomic_file,
    journal::{Journal, read_record},
};
use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{Stream, stream, task::AtomicWaker};
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, CommittedEvent, Durability, Event,
    EventPosition, MonitoredStream, MonitoredStreamItem, MonitoredStreamProgress,
    MonitoredStreamStatus,
    storage::{
        Archive, ArchiveStream, BlobStore, CreatedDocument, DocumentId, ReferenceableStore,
        SeaStorage, Snapshot, SnapshotArchive, StorageComponents, StorageHandle, StorageSurface,
    },
};
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, MutexGuard, Weak,
        atomic::{AtomicBool, Ordering},
    },
    task::Poll,
};

/// Directory-backed factory; durable mode synchronizes each mutation group and namespace creation.
#[derive(Clone, Debug)]
pub(crate) struct Factory {
    /// Canonical namespace, also used to establish handle provenance across openings.
    root: PathBuf,
    /// Required physical publication policy.
    durable: bool,
    /// Shared filesystem worker budget for all clones of this factory.
    workers: Arc<tokio::sync::Semaphore>,
    /// Weak registrations do not retain idle document ownership.
    openings: Arc<Mutex<Vec<Weak<Opening>>>>,
    /// Shared shutdown admission fence.
    closed: Arc<AtomicBool>,
    /// Retains background failure evidence even after an opening is dropped.
    failed: Arc<AtomicBool>,
    /// Initialization ownership retained through cancellation and shutdown.
    initialization: Arc<tokio::sync::RwLock<()>>,
}

impl Factory {
    /// Opens or creates a document namespace.
    ///
    /// # Errors
    /// Returns filesystem failures, including namespace synchronization failures.
    pub(crate) fn open(root: impl AsRef<Path>, durable: bool) -> Result<Self, FileStorageError> {
        fs::create_dir_all(root.as_ref())?;
        let root = fs::canonicalize(root)?;
        if durable {
            sync_namespace(&root, |directory| fs::File::open(directory)?.sync_all())?;
        }
        Ok(Self {
            root,
            durable,
            workers: Arc::new(tokio::sync::Semaphore::new(4)),
            openings: Arc::default(),
            closed: Arc::default(),
            failed: Arc::default(),
            initialization: Arc::default(),
        })
    }

    /// Builds components only after all recovered records satisfy dependency closure.
    fn components(
        &self,
        path: PathBuf,
        mut journal: Journal,
        records: Vec<Vec<u8>>,
        workers: Arc<tokio::sync::Semaphore>,
    ) -> Result<StorageComponents<FileBlobs, FileEvents, FileSnapshots>, FileStorageError> {
        let snapshots_path = path.with_file_name(format!(
            "{}-snapshots.sea",
            path.file_stem().unwrap().to_string_lossy()
        ));
        let (mut snapshots, snapshot_records) = Journal::open(
            &snapshots_path,
            !snapshots_path.try_exists()?,
            journal.durable(),
        )?;
        let content = path.with_extension("content");
        fs::create_dir_all(&content)?;
        if journal.durable() {
            fs::File::open(&content)?.sync_all()?;
            fs::File::open(content.parent().unwrap())?.sync_all()?;
        }
        let mut boundary = journal.recovered_from;
        let mut state = State::new(path.clone(), &mut journal, &mut snapshots)?;
        for record in records {
            state.recover_record(&record, boundary)?;
            boundary += 48 + record.len() as u64;
        }
        journal.remember_tail(state.head)?;
        let mut snapshot_offset = snapshots.recovered_from;
        for record in snapshot_records {
            state.recover_record(&record, snapshot_offset)?;
            snapshot_offset += 48 + record.len() as u64;
        }
        snapshots.remember_tail(if state.snapshot_end == 8 {
            0
        } else {
            state.snapshot_end - 90
        })?;
        let opening = Arc::new(Opening {
            closed: self.closed.clone(),
            factory_failed: self.failed.clone(),
            buffered: (!journal.durable()).then(|| crate::buffered::Executor::new(workers.clone())),
            path: Arc::new(path),
            journal: Mutex::new(journal),
            snapshots: Mutex::new(snapshots),
            failed: AtomicBool::new(false),
            state: Mutex::new(state),
            executor: crate::durable::Executor::new(workers.clone()),
            workers,
        });
        let mut openings = self.openings.lock().unwrap();
        openings.retain(|opening| opening.strong_count() != 0);
        openings.push(Arc::downgrade(&opening));
        Ok(StorageComponents {
            checkpoints: Box::new(FileCheckpoint(opening.clone())),
            blobs: FileBlobs(opening.clone()),
            events: FileEvents(opening.clone()),
            snapshots: FileSnapshots(opening),
        })
    }
}

#[async_trait]
impl SeaStorage for Factory {
    type Error = FileStorageError;
    type Blobs = FileBlobs;
    type Events = FileEvents;
    type Snapshots = FileSnapshots;

    fn durability(&self) -> Durability {
        if self.durable {
            Durability::Durable
        } else {
            Durability::Buffered
        }
    }

    async fn flush(&self) -> Result<(), Self::Error> {
        self.drain(false).await
    }

    async fn shutdown(&self) -> Result<(), Self::Error> {
        self.closed.store(true, Ordering::Release);
        let _initialization = self.initialization.write().await;
        self.drain(true).await
    }

    async fn create_document(
        &self,
    ) -> Result<CreatedDocument<FileBlobs, FileEvents, FileSnapshots>, Self::Error> {
        let storage = self.clone();
        let initialization = self.initialization.clone().read_owned().await;
        if self.closed.load(Ordering::Acquire) {
            return Err(FileStorageError::Rejected("storage is shut down"));
        }
        crate::common::blocking(self.workers.clone(), move || {
            let _initialization = initialization;
            storage.create_blocking()
        })
        .await
    }

    async fn open_document(
        &self,
        id: &DocumentId,
    ) -> Result<Option<StorageComponents<FileBlobs, FileEvents, FileSnapshots>>, Self::Error> {
        let storage = self.clone();
        let id = id.clone();
        let initialization = self.initialization.clone().read_owned().await;
        if self.closed.load(Ordering::Acquire) {
            return Err(FileStorageError::Rejected("storage is shut down"));
        }
        crate::common::blocking(self.workers.clone(), move || {
            let _initialization = initialization;
            storage.open_blocking(&id)
        })
        .await
    }
}

impl Factory {
    /// Captures retained openings and reports every background failure after draining them.
    async fn drain(&self, close: bool) -> Result<(), FileStorageError> {
        let openings = self
            .openings
            .lock()
            .unwrap()
            .iter()
            .filter_map(Weak::upgrade)
            .collect::<Vec<_>>();
        let mut failed = false;
        for opening in openings {
            if let Some(executor) = &opening.buffered {
                failed |= executor.flush(close).await.is_err();
            } else {
                opening.executor.flush(close).await;
            }
            failed |= opening.failed.load(Ordering::Acquire);
        }
        if failed || self.failed.load(Ordering::Acquire) {
            Err(FileStorageError::Ambiguous)
        } else {
            Ok(())
        }
    }
    /// Allocates and recovers a document entirely on its owning blocking worker.
    fn create_blocking(
        &self,
    ) -> Result<CreatedDocument<FileBlobs, FileEvents, FileSnapshots>, FileStorageError> {
        for ordinal in 1_u64.. {
            let path = self.root.join(format!("{ordinal:016x}.sea"));
            match Journal::open(&path, true, self.durable) {
                Ok((journal, records)) => {
                    if self.durable {
                        fs::File::open(&self.root)?.sync_all()?;
                    }
                    let components =
                        self.components(path, journal, records, self.workers.clone())?;
                    return Ok(CreatedDocument {
                        id: DocumentId::from_bytes(Bytes::copy_from_slice(&ordinal.to_be_bytes())),
                        components,
                    });
                }
                Err(FileStorageError::Io(error))
                    if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error),
            }
        }
        Err(FileStorageError::Rejected("document identity exhausted"))
    }

    /// Recovers one exclusive opening without blocking the caller's executor.
    fn open_blocking(
        &self,
        id: &DocumentId,
    ) -> Result<Option<StorageComponents<FileBlobs, FileEvents, FileSnapshots>>, FileStorageError>
    {
        let Ok(bytes) = <[u8; 8]>::try_from(id.as_bytes().as_ref()) else {
            return Ok(None);
        };
        let path = self
            .root
            .join(format!("{:016x}.sea", u64::from_be_bytes(bytes)));
        match Journal::open(&path, false, self.durable) {
            Ok((journal, records)) => self
                .components(path, journal, records, self.workers.clone())
                .map(Some),
            Err(FileStorageError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(None)
            }
            Err(error) => Err(error),
        }
    }
}

/// Synchronizes namespace bindings bottom-up without flushing unrelated parent filesystems.
/// Mount configuration is external to the namespace's durability guarantee.
fn sync_namespace(
    root: &Path,
    mut synchronize: impl FnMut(&Path) -> std::io::Result<()>,
) -> std::io::Result<()> {
    #[cfg(unix)]
    use std::os::unix::fs::MetadataExt;

    #[cfg(unix)]
    let device = fs::metadata(root)?.dev();
    for ancestor in root.ancestors() {
        #[cfg(unix)]
        if fs::metadata(ancestor)?.dev() != device {
            break;
        }
        synchronize(ancestor)?;
    }
    Ok(())
}

/// Availability evidence scoped to a canonical document path, without writer ownership.
#[derive(Clone, Debug)]
pub struct FileHandle<Identity> {
    /// Persistable identity.
    id: Identity,
    /// Namespace provenance, not an independent writer capability.
    document: Arc<PathBuf>,
}

impl<Identity: Copy + Send + Sync + 'static> StorageHandle for FileHandle<Identity> {
    type Id = Identity;
    fn id(&self) -> Identity {
        self.id
    }
}

/// Shared writer ownership retained by components, reads, and workers, not availability handles.
struct Opening {
    /// Factory lifecycle fence checked before every new mutation.
    closed: Arc<AtomicBool>,
    /// Sticky failure accounting for factory flush and shutdown.
    factory_failed: Arc<AtomicBool>,
    /// Independent process-local admission authority for buffered mode.
    buffered: Option<Arc<crate::buffered::Executor>>,
    /// Document provenance for minted handles.
    path: Arc<PathBuf>,
    /// Serializes mutations; acquired before the published-state mutex.
    journal: Mutex<Journal>,
    /// Separate fixed-record snapshot log, ordered after the document mutation lock.
    snapshots: Mutex<Journal>,
    /// Refuses observations after uncertain I/O or a failed worker.
    failed: AtomicBool,
    /// Published dependency-closed state; event disk I/O never holds this mutex.
    state: Mutex<State>,
    /// Bounded document mutation ordering outside the blocking pool.
    executor: crate::durable::Executor,
    /// Shared bounded file-read and mutation worker capacity.
    workers: Arc<tokio::sync::Semaphore>,
}

impl Opening {
    /// Rejects new mutations once factory shutdown or terminal failure has begun.
    fn admission(&self) -> Result<(), FileStorageError> {
        if self.closed.load(Ordering::Acquire) {
            return Err(FileStorageError::Rejected("storage is shut down"));
        }
        drop(self.lock()?);
        Ok(())
    }
    /// Builds a cancellation-independent buffered write with terminal failure signaling.
    fn buffered_task(self: &Arc<Self>, records: Vec<(Key, Bytes)>) -> crate::buffered::Task {
        let opening = self.clone();
        crate::buffered::Task {
            events: records[0].0[0] == 3,
            records,
            run: Box::new(move |records| {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    let mut journal = opening.writer()?;
                    let state = opening.published()?;
                    match records[0].0[0] {
                        1 | 2 => {
                            for (key, record) in &records {
                                journal.write_value(&state.content_path(key), record)?;
                            }
                        }
                        3 => {
                            let invalid = records.iter().any(|(_, record)| {
                                decode_event(record).is_ok_and(|event| {
                                    event.event.blob_tree.is_some_and(|root| {
                                        !matches!(
                                            state.content_path(&tree_key(root)).try_exists(),
                                            Ok(true)
                                        )
                                    })
                                })
                            });
                            let payloads = records
                                .iter()
                                .map(|(_, record)| record.as_ref())
                                .collect::<Vec<_>>();
                            journal.append_batch(&payloads)?;
                            let invalid = {
                                let mut published = opening.lock()?;
                                published.invalid_dependency |= invalid;
                                published.invalid_dependency
                            };
                            if !invalid {
                                journal
                                    .remember_tail(key_position(records.last().unwrap().0).get())?;
                            }
                        }
                        4 => {
                            let mut snapshots = opening
                                .snapshots
                                .lock()
                                .map_err(|_| FileStorageError::Ambiguous)?;
                            snapshots.append(&records[0].1)?;
                            snapshots.remember_tail(key_position(records[0].0).get())?;
                        }
                        _ => unreachable!(),
                    }
                    let mut pending = state.pending.lock().unwrap();
                    for (key, _) in &records {
                        pending.remove(key);
                    }
                    Ok::<(), FileStorageError>(())
                }));
                if matches!(result, Ok(Ok(()))) {
                    Ok(())
                } else {
                    opening.poison();
                    opening
                        .state
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner)
                        .pending
                        .lock()
                        .unwrap()
                        .clear();
                    Err(FileStorageError::Ambiguous)
                }
            }),
        }
    }
    /// Runs a mutation with cancellation-owned ordering and fail-closed panic handling.
    async fn execute<Output: Send + 'static>(
        self: &Arc<Self>,
        bytes: usize,
        operation: impl FnOnce() -> Result<Output, FileStorageError> + Send + 'static,
    ) -> Result<Output, FileStorageError> {
        if self.closed.load(Ordering::Acquire) {
            return Err(FileStorageError::Rejected("storage is shut down"));
        }
        let opening = self.clone();
        self.executor
            .run(bytes, move || {
                if let Ok(result) =
                    std::panic::catch_unwind(std::panic::AssertUnwindSafe(operation))
                {
                    result
                } else {
                    opening.poison();
                    Err(FileStorageError::Ambiguous)
                }
            })
            .await
    }

    /// Isolates file reads without joining the mutation queue.
    async fn query<Output: Send + 'static>(
        self: &Arc<Self>,
        operation: impl FnOnce() -> Result<Output, FileStorageError> + Send + 'static,
    ) -> Result<Output, FileStorageError> {
        crate::common::blocking(self.workers.clone(), operation).await
    }
    /// Fails closed and notifies readers even when a worker panics after cancellation.
    fn poison(&self) {
        self.factory_failed.store(true, Ordering::Release);
        self.failed.store(true, Ordering::Release);
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let readers = state.readers();
        drop(state);
        for reader in readers {
            reader.wake();
        }
    }

    /// Acquires a usable state or refuses uncertain journal observations.
    fn lock(&self) -> Result<MutexGuard<'_, State>, FileStorageError> {
        let state = self.state.lock().map_err(|_| FileStorageError::Ambiguous)?;
        if self.failed.load(Ordering::Acquire) || self.journal.is_poisoned() {
            return Err(FileStorageError::Ambiguous);
        }
        Ok(state)
    }

    /// Copies published bounds without retaining the state lock across filesystem work.
    fn published(&self) -> Result<State, FileStorageError> {
        Ok(self.lock()?.clone())
    }

    /// Holds the mutation order across disk I/O and in-memory publication.
    fn writer(&self) -> Result<MutexGuard<'_, Journal>, FileStorageError> {
        let journal = self
            .journal
            .lock()
            .map_err(|_| FileStorageError::Ambiguous)?;
        journal.ready()?;
        if self.failed.load(Ordering::Acquire) {
            return Err(FileStorageError::Ambiguous);
        }
        Ok(journal)
    }

    /// Mints evidence only after the caller has established membership.
    fn handle<Identity>(&self, id: Identity) -> FileHandle<Identity> {
        FileHandle {
            id,
            document: self.path.clone(),
        }
    }

    /// Checks document provenance before consulting membership.
    fn compatible<Identity>(&self, handle: &FileHandle<Identity>) -> Result<(), FileStorageError> {
        if handle.document == self.path {
            Ok(())
        } else {
            Err(FileStorageError::Rejected("foreign document handle"))
        }
    }

    /// Reconstructs snapshot handles from already validated retained identities.
    fn snapshot(
        &self,
        position: EventPosition,
        root: BlobTreeId,
    ) -> Snapshot<FileHandle<BlobTreeId>, FileHandle<EventPosition>> {
        Snapshot {
            root: self.handle(root),
            at_event: self.handle(position),
        }
    }
}

/// Journal state is dependency-closed after recovery and immutable except for append.
#[derive(Clone)]
struct State {
    /// Durable values hidden until their atomic publication barriers complete.
    unpublished: Arc<Mutex<std::collections::BTreeSet<Key>>>,
    /// Encoded accepted records not yet available from their final filesystem locations.
    pending: Arc<Mutex<std::collections::BTreeMap<Key, Bytes>>>,
    /// Reserved event byte boundary, independent of the written journal cursor.
    event_end: u64,
    /// Document-local hash namespace and checkpoint destination.
    path: PathBuf,
    /// Independent journal cursor for addressed reads, never shared with the writer.
    reader: Arc<Mutex<fs::File>>,
    /// Independent cursor for fixed-width snapshot records.
    snapshot_reader: Arc<Mutex<fs::File>>,
    /// Byte boundary after the last published snapshot record.
    snapshot_end: u64,
    /// Last committed event byte offset, with zero representing an empty archive.
    head: u64,
    /// Last application snapshot position, with zero representing no snapshots.
    snapshot_head: u64,
    /// Raw event writes with unavailable dependencies must never advance the trusted cursor.
    invalid_dependency: bool,
    /// Weak wake registrations pruned on mutation and reader initialization.
    readers: Vec<Weak<AtomicWaker>>,
}

impl State {
    /// Restores log heads from storage-owned cursors, independently of sequencer state.
    fn new(
        path: PathBuf,
        events: &mut Journal,
        snapshots: &mut Journal,
    ) -> Result<Self, FileStorageError> {
        let mut snapshot_reader = snapshots.reader()?;
        let snapshot_head = if snapshots.last == 0 {
            0
        } else {
            let record = read_record(&mut snapshot_reader, snapshots.last)?;
            if record.len() != 42 || record[0] != 4 {
                return Err(FileStorageError::Corrupt("snapshot record"));
            }
            u64::from_be_bytes(record[1..9].try_into().unwrap())
        };
        let state = Self {
            unpublished: Arc::default(),
            pending: Arc::default(),
            event_end: events.boundary()?,
            path,
            reader: Arc::new(Mutex::new(events.reader()?)),
            snapshot_reader: Arc::new(Mutex::new(snapshot_reader)),
            snapshot_end: snapshots.recovered_from,
            head: events.last,
            snapshot_head,
            invalid_dependency: false,
            readers: Vec::new(),
        };
        if let Some(head) = nonzero_position(state.head) {
            let event = state.event(head)?;
            if event
                .event
                .blob_tree
                .is_some_and(|root| !matches!(state.contains(root), Ok(true)))
            {
                return Err(FileStorageError::Corrupt("event dependency"));
            }
        }
        if let Some(head) = nonzero_position(state.snapshot_head) {
            let root = state
                .snapshot(head)?
                .ok_or(FileStorageError::Corrupt("snapshot head"))?;
            if !state.has_event(head)? || !state.contains(root)? {
                return Err(FileStorageError::Corrupt("snapshot dependency"));
            }
        }
        Ok(state)
    }

    /// Derives immutable content location directly from its typed hash.
    fn content_path(&self, key: &Key) -> PathBuf {
        let name: String = key
            .iter()
            .flat_map(|byte| {
                let digits = b"0123456789abcdef";
                [
                    char::from(digits[usize::from(byte >> 4)]),
                    char::from(digits[usize::from(byte & 15)]),
                ]
            })
            .collect();
        self.path.with_extension("content").join(name)
    }

    /// Fetches a complete checked frame by logical identity.
    fn record(&self, key: &Key) -> Result<Option<Vec<u8>>, FileStorageError> {
        if self.unpublished.lock().unwrap().contains(key) {
            return Ok(None);
        }
        if let Some(record) = self.pending.lock().unwrap().get(key) {
            return Ok(Some(record.to_vec()));
        }
        let record = if key[0] <= 2 {
            let Some(record) = atomic_file::read(&self.content_path(key))? else {
                return Ok(None);
            };
            record
        } else {
            let offset = key_position(*key).get();
            if offset < 8 || offset > self.head {
                return Ok(None);
            }
            read_record(
                &mut *self
                    .reader
                    .lock()
                    .map_err(|_| FileStorageError::Ambiguous)?,
                offset,
            )?
        };
        if record_key(&record)? != *key {
            return Err(FileStorageError::Corrupt("addressed record identity"));
        }
        Ok(Some(record))
    }

    /// Reads one accepted frame from its pending buffer or the written journal prefix.
    fn frame(&self, category: u8, offset: u64) -> Result<Vec<u8>, FileStorageError> {
        let key = position_key(category, EventPosition::new(offset));
        if let Some(record) = self.pending.lock().unwrap().get(&key) {
            return Ok(record.to_vec());
        }
        let reader = if category == 3 {
            &self.reader
        } else {
            &self.snapshot_reader
        };
        read_record(
            &mut *reader.lock().map_err(|_| FileStorageError::Ambiguous)?,
            offset,
        )
    }

    /// Seeks from an event cursor, or walks snapshots backward to select its successor.
    fn next(
        &self,
        category: u8,
        after: Option<EventPosition>,
    ) -> Result<Option<EventPosition>, FileStorageError> {
        if category == 4 {
            let mut next = None;
            for ordinal in (0..(self.snapshot_end - 8) / 90).rev() {
                let offset = 8 + ordinal * 90;
                let record = self.frame(4, offset)?;
                let position = key_position(record_key(&record)?);
                if Some(position) <= after {
                    break;
                }
                next = Some(position);
            }
            return Ok(next);
        }
        if self.head == 0 || after.is_some_and(|after| after.get() >= self.head) {
            return Ok(None);
        }
        let offset = match after {
            None => 8,
            Some(after) if self.has_event(after)? => {
                let record = self.frame(3, after.get())?;
                after.get() + 48 + record.len() as u64
            }
            Some(after) => {
                let mut candidate = self.head;
                loop {
                    let record = self.frame(3, candidate)?;
                    let previous = event_previous(&record)?;
                    if previous <= after.get() {
                        break candidate;
                    }
                    candidate = previous;
                }
            }
        };
        Ok(Some(EventPosition::new(offset)))
    }

    /// Walks backward from the archive tail; latest lookups need no traversal.
    fn floor(
        &self,
        category: u8,
        through: Option<EventPosition>,
    ) -> Result<Option<EventPosition>, FileStorageError> {
        if category == 4 {
            for ordinal in (0..(self.snapshot_end - 8) / 90).rev() {
                let offset = 8 + ordinal * 90;
                let record = self.frame(4, offset)?;
                let position = key_position(record_key(&record)?);
                if through.is_none_or(|bound| position <= bound) {
                    return Ok(Some(position));
                }
            }
            return Ok(None);
        }
        let mut candidate = self.head;
        while candidate != 0 && through.is_some_and(|bound| candidate > bound.get()) {
            candidate = event_previous(&self.frame(3, candidate)?)?;
        }
        Ok(nonzero_position(candidate))
    }

    /// Fetches an event only when an archive reader requests it.
    fn event(&self, position: EventPosition) -> Result<CommittedEvent, FileStorageError> {
        let record = self
            .record(&position_key(3, position))?
            .ok_or(FileStorageError::Corrupt("missing addressed event"))?;
        decode_event(&record)
    }

    /// Fetches an application snapshot root by walking backward from the snapshot tail.
    fn snapshot(&self, position: EventPosition) -> Result<Option<BlobTreeId>, FileStorageError> {
        for ordinal in (0..(self.snapshot_end - 8) / 90).rev() {
            let offset = 8 + ordinal * 90;
            let record = self.frame(4, offset)?;
            let found = key_position(record_key(&record)?);
            if found == position {
                return decode_tree(&record[9..]).map(Some);
            }
            if found < position {
                break;
            }
        }
        Ok(None)
    }

    /// Rejects non-record positions without treating numeric ordering as availability.
    fn has_event(&self, position: EventPosition) -> Result<bool, FileStorageError> {
        let offset = position.get();
        if offset < 8 || offset > self.head {
            return Ok(false);
        }
        if self
            .pending
            .lock()
            .unwrap()
            .contains_key(&position_key(3, position))
        {
            return Ok(true);
        }
        let mut reader = self
            .reader
            .lock()
            .map_err(|_| FileStorageError::Ambiguous)?;
        reader.seek(SeekFrom::Start(offset))?;
        let mut header = [0; 57];
        if reader.read_exact(&mut header).is_err() {
            return Ok(false);
        }
        let length = u64::from_be_bytes(header[..8].try_into().unwrap());
        let inverse = u64::from_be_bytes(header[8..16].try_into().unwrap());
        if inverse != !length
            || header[48] != 3
            || u64::from_be_bytes(header[49..57].try_into().unwrap()) != offset
        {
            return Ok(false);
        }
        decode_event(&read_record(&mut reader, offset)?)?;
        Ok(true)
    }

    /// Membership implies transitive closure for immutable published directories.
    fn contains(&self, id: BlobTreeId) -> Result<bool, FileStorageError> {
        if self.unpublished.lock().unwrap().contains(&tree_key(id)) {
            return Ok(false);
        }
        if self.pending.lock().unwrap().contains_key(&tree_key(id)) {
            return Ok(true);
        }
        Ok(self.content_path(&tree_key(id)).try_exists()?)
    }

    /// Captures live readers to notify after releasing the state mutex.
    fn readers(&mut self) -> Vec<Arc<AtomicWaker>> {
        let mut readers = Vec::new();
        self.readers.retain(|reader| {
            if let Some(reader) = reader.upgrade() {
                readers.push(reader);
                true
            } else {
                false
            }
        });
        readers
    }

    /// Applies one checked frame, rejecting gaps, missing dependencies, and invalid encodings.
    fn recover_record(&mut self, record: &[u8], offset: u64) -> Result<(), FileStorageError> {
        let Some((&tag, body)) = record.split_first() else {
            return Err(FileStorageError::Corrupt("empty record"));
        };
        match tag {
            1 => {}
            2 => {
                let directory = BlobDirectory::decode(body)
                    .map_err(|_| FileStorageError::Corrupt("directory encoding"))?;
                for child in directory.entries().values() {
                    if !self.contains(*child)? {
                        return Err(FileStorageError::Corrupt("directory dependency"));
                    }
                }
            }
            3 => {
                if body.len() < 17 {
                    return Err(FileStorageError::Corrupt("event encoding"));
                }
                let position =
                    EventPosition::new(u64::from_be_bytes(body[..8].try_into().unwrap()));
                let (blob_tree, payload) = if body[16] == 0 {
                    (None, &body[17..])
                } else if body[16] == 1 && body.len() >= 50 {
                    (Some(decode_tree(&body[17..50])?), &body[50..])
                } else {
                    return Err(FileStorageError::Corrupt("event tree"));
                };
                if position.get() != offset || event_previous(record)? != self.head {
                    return Err(FileStorageError::Corrupt("event position or dependency"));
                }
                if let Some(root) = blob_tree
                    && !self.contains(root)?
                {
                    return Err(FileStorageError::Corrupt("event dependency"));
                }
                let _ = payload;
                self.head = position.get();
            }
            4 => {
                if body.len() != 41 {
                    return Err(FileStorageError::Corrupt("snapshot encoding"));
                }
                let position =
                    EventPosition::new(u64::from_be_bytes(body[..8].try_into().unwrap()));
                let root = decode_tree(&body[8..])?;
                if self.snapshot_head >= position.get()
                    || !self.has_event(position)?
                    || !self.contains(root)?
                {
                    return Err(FileStorageError::Corrupt("snapshot order or dependency"));
                }
                self.snapshot_head = position.get();
                self.snapshot_end = offset + 90;
            }
            _ => return Err(FileStorageError::Corrupt("record tag")),
        }
        Ok(())
    }
}

/// Typed content identities and direct event positions, never an address table.
type Key = [u8; 33];

/// Forms a fixed-width key whose byte ordering matches event ordering.
fn position_key(category: u8, position: EventPosition) -> Key {
    let mut key = [0; 33];
    key[0] = category;
    key[25..].copy_from_slice(&position.get().to_be_bytes());
    key
}

/// Recovers the position encoded in an archive lookup key.
fn key_position(key: Key) -> EventPosition {
    EventPosition::new(u64::from_be_bytes(key[25..].try_into().unwrap()))
}

/// Converts the dense archive's empty sentinel into its public optional head.
fn nonzero_position(ordinal: u64) -> Option<EventPosition> {
    (ordinal != 0).then(|| EventPosition::new(ordinal))
}

/// Forms a key for an immutable tree identity.
fn tree_key(tree: BlobTreeId) -> Key {
    let mut key = [0; 33];
    match tree {
        BlobTreeId::Blob(id) => {
            key[0] = 1;
            key[1..].copy_from_slice(id.as_bytes());
        }
        BlobTreeId::Directory(id) => {
            key[0] = 2;
            key[1..].copy_from_slice(id.as_bytes());
        }
    }
    key
}

/// Determines the identity represented by a journal record.
fn record_key(record: &[u8]) -> Result<Key, FileStorageError> {
    match record.first() {
        Some(1) => Ok(tree_key(BlobTreeId::Blob(BlobId::for_bytes(&record[1..])))),
        Some(2) => Ok(tree_key(BlobTreeId::Directory(
            BlobDirectory::decode(&record[1..])
                .and_then(|directory| directory.id())
                .map_err(|_| FileStorageError::Corrupt("directory identity"))?,
        ))),
        Some(category @ (3 | 4)) if record.len() >= 9 => Ok(position_key(
            *category,
            EventPosition::new(u64::from_be_bytes(record[1..9].try_into().unwrap())),
        )),
        _ => Err(FileStorageError::Corrupt("record identity")),
    }
}

/// Decodes one event payload after its framing checksum has been verified.
fn decode_event(record: &[u8]) -> Result<CommittedEvent, FileStorageError> {
    if record.len() < 18 || record[0] != 3 {
        return Err(FileStorageError::Corrupt("event encoding"));
    }
    let position = EventPosition::new(u64::from_be_bytes(record[1..9].try_into().unwrap()));
    let (blob_tree, payload) = match record[17] {
        0 => (None, &record[18..]),
        1 if record.len() >= 51 => (Some(decode_tree(&record[18..51])?), &record[51..]),
        _ => return Err(FileStorageError::Corrupt("event tree")),
    };
    Ok(CommittedEvent {
        position,
        event: Event {
            payload: Bytes::copy_from_slice(payload),
            blob_tree,
        },
    })
}

/// Reads the previous event offset from a validated frame for backward bound selection.
fn event_previous(record: &[u8]) -> Result<u64, FileStorageError> {
    if record.len() < 18 || record[0] != 3 {
        return Err(FileStorageError::Corrupt("event link"));
    }
    let previous = u64::from_be_bytes(record[9..17].try_into().unwrap());
    let position = u64::from_be_bytes(record[1..9].try_into().unwrap());
    if previous >= position {
        return Err(FileStorageError::Corrupt("event link order"));
    }
    Ok(previous)
}

/// Encodes a typed tree identity without inventing an availability capability.
fn encode_tree(output: &mut Vec<u8>, tree: BlobTreeId) {
    match tree {
        BlobTreeId::Blob(id) => {
            output.push(0);
            output.extend_from_slice(id.as_bytes());
        }
        BlobTreeId::Directory(id) => {
            output.push(1);
            output.extend_from_slice(id.as_bytes());
        }
    }
}

/// Decodes a frame's tree identity; recovery checks actual dependency availability separately.
fn decode_tree(bytes: &[u8]) -> Result<BlobTreeId, FileStorageError> {
    match bytes.first() {
        Some(0) => BlobId::from_bytes(&bytes[1..]).map(BlobTreeId::Blob),
        Some(1) => BlobDirectoryId::from_bytes(&bytes[1..]).map(BlobTreeId::Directory),
        _ => return Err(FileStorageError::Corrupt("tree tag")),
    }
    .map_err(|_| FileStorageError::Corrupt("tree identity"))
}

/// Independently usable immutable content component.
#[derive(Clone)]
pub struct FileBlobs(Arc<Opening>);
/// Independently usable ordered event component, with opaque tree identities.
#[derive(Clone)]
pub struct FileEvents(Arc<Opening>);
/// Independently usable sparse snapshot component.
#[derive(Clone)]
pub struct FileSnapshots(Arc<Opening>);

/// Snapshot carrying document-scoped availability evidence for its dependencies.
type FileSnapshot = Snapshot<FileHandle<BlobTreeId>, FileHandle<EventPosition>>;

impl StorageSurface for FileBlobs {
    type Error = FileStorageError;
}
impl StorageSurface for FileEvents {
    type Error = FileStorageError;
}
impl StorageSurface for FileSnapshots {
    type Error = FileStorageError;
}

#[async_trait]
impl ReferenceableStore for FileBlobs {
    type Id = BlobTreeId;
    type Handle = FileHandle<BlobTreeId>;
    async fn resolve(&self, id: Self::Id) -> Result<Option<Self::Handle>, Self::Error> {
        let component = self.clone();
        self.0.query(move || component.resolve_blocking(id)).await
    }
    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), Self::Error> {
        let handle = handle.clone();
        let component = self.clone();
        self.0
            .query(move || component.ensure_available_blocking(&handle))
            .await
    }
}

#[async_trait]
impl BlobStore for FileBlobs {
    async fn put_blob(&self, payload: Bytes) -> Result<Self::Handle, Self::Error> {
        self.0.admission()?;
        if self.0.buffered.is_some() {
            let id = BlobTreeId::Blob(BlobId::for_bytes(&payload));
            if let Some(handle) = self.resolve(id).await? {
                return Ok(handle);
            }
            let mut record = Vec::with_capacity(payload.len() + 1);
            record.push(1);
            record.extend_from_slice(&payload);
            return self.admit_content(id, Bytes::from(record));
        }
        let component = self.clone();
        self.0
            .execute(payload.len().saturating_add(1), move || {
                component.put_blob_blocking(&payload)
            })
            .await
    }
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        let component = self.clone();
        self.0.query(move || component.get_blob_blocking(id)).await
    }
    async fn put_directory(&self, directory: BlobDirectory) -> Result<Self::Handle, Self::Error> {
        self.0.admission()?;
        let (encoded, id) = directory
            .encode_with_id()
            .map_err(|_| FileStorageError::Rejected("directory encoding"))?;
        if let Some(handle) = self.resolve(BlobTreeId::Directory(id)).await? {
            return Ok(handle);
        }
        if self.0.buffered.is_some() {
            let id = BlobTreeId::Directory(id);
            if let Some(handle) = self.resolve(id).await? {
                return Ok(handle);
            }
            let component = self.clone();
            self.0
                .query(move || {
                    let state = component.0.published()?;
                    for child in directory.entries().values() {
                        if !state.contains(*child)? {
                            return Err(FileStorageError::Rejected("missing directory child"));
                        }
                    }
                    Ok(())
                })
                .await?;
            let mut record = vec![2];
            record.extend_from_slice(&encoded);
            return self.admit_content(id, Bytes::from(record));
        }
        let component = self.clone();
        self.0
            .execute(encoded.len(), move || {
                component.put_directory_blocking(&directory, &encoded, id)
            })
            .await
    }
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        let component = self.clone();
        self.0
            .query(move || component.get_directory_blocking(id))
            .await
    }
}

#[async_trait]
impl ReferenceableStore for FileEvents {
    type Id = EventPosition;
    type Handle = FileHandle<EventPosition>;
    async fn resolve(&self, id: Self::Id) -> Result<Option<Self::Handle>, Self::Error> {
        let component = self.clone();
        self.0.query(move || component.resolve_blocking(id)).await
    }
    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), Self::Error> {
        let handle = handle.clone();
        let component = self.clone();
        self.0
            .query(move || component.ensure_available_blocking(&handle))
            .await
    }
}

#[async_trait]
impl Archive for FileEvents {
    type Position = EventPosition;
    type Item = CommittedEvent;
    type Append = Event;
    type AppendResult = FileHandle<EventPosition>;
    async fn append(&self, event: Event) -> Result<Self::AppendResult, Self::Error> {
        self.append_batch(vec![event])
            .await
            .pop()
            .expect("one event produces one result")
    }
    async fn append_batch(
        &self,
        values: Vec<Event>,
    ) -> Vec<Result<Self::AppendResult, Self::Error>> {
        if values.is_empty() {
            return Vec::new();
        }
        if let Err(error) = self.0.admission() {
            return vec![Err(error)];
        }
        let count = values.len();
        let events = self.clone();
        let bytes = values.iter().try_fold(0usize, |total, event| {
            total.checked_add(event.payload.len())?.checked_add(99)
        });
        let Some(bytes) = bytes else {
            return vec![Err(FileStorageError::Rejected("batch size overflow"))];
        };
        if let Some(executor) = &self.0.buffered {
            return match executor.admit(
                bytes.saturating_add(values.len().saturating_mul(128)),
                || {
                    let mut state = self.0.lock()?;
                    let mut offset = state.event_end;
                    let mut previous = state.head;
                    let mut records = Vec::with_capacity(values.len());
                    let mut handles = Vec::with_capacity(values.len());
                    for event in &values {
                        let position = EventPosition::new(offset);
                        let mut record = vec![3];
                        record.extend_from_slice(&offset.to_be_bytes());
                        record.extend_from_slice(&previous.to_be_bytes());
                        record.push(u8::from(event.blob_tree.is_some()));
                        if let Some(root) = event.blob_tree {
                            encode_tree(&mut record, root);
                        }
                        record.extend_from_slice(&event.payload);
                        previous = offset;
                        offset = offset
                            .checked_add(48 + record.len() as u64)
                            .ok_or(FileStorageError::Rejected("event positions exhausted"))?;
                        records.push((position_key(3, position), Bytes::from(record)));
                        handles.push(Ok(self.0.handle(position)));
                    }
                    state.head = previous;
                    state.event_end = offset;
                    state
                        .pending
                        .lock()
                        .unwrap()
                        .extend(records.iter().cloned());
                    let readers = state.readers();
                    drop(state);
                    for reader in readers {
                        reader.wake();
                    }
                    Ok((handles, self.0.buffered_task(records)))
                },
            ) {
                Ok(results) => results,
                Err(error) => vec![Err(error)],
            };
        }
        match self
            .0
            .execute(bytes, move || Ok(events.append_batch_blocking(&values)))
            .await
        {
            Ok(results) => results,
            Err(FileStorageError::Ambiguous) => (0..count)
                .map(|_| Err(FileStorageError::Ambiguous))
                .collect(),
            Err(error) => vec![Err(error)],
        }
    }
    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<Self::Item, EventPosition, Self::Error> {
        read(
            self.0.clone(),
            after,
            stop_after,
            3,
            |_, state, position| state.event(position),
        )
    }
    async fn head(&self) -> Result<Option<EventPosition>, Self::Error> {
        Ok(nonzero_position(self.0.lock()?.head))
    }
}

impl FileEvents {
    /// Settles a whole batch while the blocking worker retains the exclusive opening.
    fn append_batch_blocking(
        &self,
        values: &[Event],
    ) -> Vec<Result<FileHandle<EventPosition>, FileStorageError>> {
        let mut journal = match self.0.writer() {
            Ok(journal) => journal,
            Err(error) => return vec![Err(error)],
        };
        let state = match self.0.published() {
            Ok(state) => state,
            Err(error) => return vec![Err(error)],
        };
        let head = state.head;
        let invalid_dependency = values.iter().any(|event| {
            event
                .blob_tree
                .is_some_and(|root| !matches!(state.contains(root), Ok(true)))
        });
        drop(state);
        let mut offset = match journal.boundary() {
            Ok(offset) => offset,
            Err(error) => return vec![Err(error)],
        };
        let mut previous = head;
        let mut records = Vec::with_capacity(values.len());
        for event in values {
            let ordinal = offset;
            let mut record = vec![3];
            record.extend_from_slice(&ordinal.to_be_bytes());
            record.extend_from_slice(&previous.to_be_bytes());
            record.push(u8::from(event.blob_tree.is_some()));
            if let Some(root) = event.blob_tree {
                encode_tree(&mut record, root);
            }
            record.extend_from_slice(&event.payload);
            let Some(next) = offset
                .checked_add(48)
                .and_then(|start| start.checked_add(record.len() as u64))
            else {
                return vec![Err(FileStorageError::Rejected("event positions exhausted"))];
            };
            previous = offset;
            offset = next;
            records.push(record);
        }
        let payloads: Vec<&[u8]> = records.iter().map(Vec::as_slice).collect();
        if let Err(error) = journal.append_batch(&payloads) {
            drop(journal);
            if matches!(error, FileStorageError::Ambiguous) {
                self.0.poison();
            }
            return if matches!(error, FileStorageError::Ambiguous) {
                (0..values.len())
                    .map(|_| Err(FileStorageError::Ambiguous))
                    .collect()
            } else {
                vec![Err(error)]
            };
        }
        let invalid_dependency = self
            .0
            .published()
            .map_or(true, |state| state.invalid_dependency || invalid_dependency);
        if !invalid_dependency && journal.remember_tail(previous).is_err() {
            drop(journal);
            self.0.poison();
            return (0..values.len())
                .map(|_| Err(FileStorageError::Ambiguous))
                .collect();
        }
        let Ok(mut state) = self.0.lock() else {
            drop(journal);
            self.0.poison();
            return (0..values.len())
                .map(|_| Err(FileStorageError::Ambiguous))
                .collect();
        };
        state.invalid_dependency |= invalid_dependency;
        let results = records
            .iter()
            .map(|record| {
                let position =
                    EventPosition::new(u64::from_be_bytes(record[1..9].try_into().unwrap()));
                state.head = position.get();
                Ok(self.0.handle(position))
            })
            .collect::<Vec<_>>();
        let readers = state.readers();
        drop(state);
        drop(journal);
        for reader in readers {
            reader.wake();
        }
        results
    }
}

#[async_trait]
impl Archive for FileSnapshots {
    type Position = EventPosition;
    type Item = Snapshot<FileHandle<BlobTreeId>, FileHandle<EventPosition>>;
    type Append = Self::Item;
    type AppendResult = ();
    async fn append(&self, snapshot: Self::Append) -> Result<(), Self::Error> {
        self.0.admission()?;
        if let Some(executor) = &self.0.buffered {
            self.0.compatible(&snapshot.root)?;
            self.0.compatible(&snapshot.at_event)?;
            let component = self.clone();
            let root = snapshot.root.id;
            let position = snapshot.at_event.id;
            self.0
                .query(move || {
                    let state = component.0.published()?;
                    if !state.contains(root)? || !state.has_event(position)? {
                        return Err(FileStorageError::Rejected("snapshot dependency"));
                    }
                    Ok(())
                })
                .await?;
            return executor.admit(256, || {
                let mut state = self.0.lock()?;
                if state.snapshot_head >= position.get() {
                    return Err(FileStorageError::Rejected("snapshot must advance"));
                }
                let offset = state.snapshot_end;
                let end = offset
                    .checked_add(90)
                    .ok_or(FileStorageError::Rejected("snapshot positions exhausted"))?;
                let mut record = vec![4];
                record.extend_from_slice(&position.get().to_be_bytes());
                encode_tree(&mut record, root);
                let record = Bytes::from(record);
                let key = position_key(4, EventPosition::new(offset));
                state.pending.lock().unwrap().insert(key, record.clone());
                state.snapshot_end = end;
                state.snapshot_head = position.get();
                let readers = state.readers();
                drop(state);
                for reader in readers {
                    reader.wake();
                }
                Ok(((), self.0.buffered_task(vec![(key, record)])))
            });
        }
        let component = self.clone();
        self.0
            .execute(90, move || component.append_blocking(&snapshot))
            .await
    }
    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<Self::Item, EventPosition, Self::Error> {
        read(
            self.0.clone(),
            after,
            stop_after,
            4,
            |opening, state, position| {
                let root = state
                    .snapshot(position)?
                    .ok_or(FileStorageError::Corrupt("missing snapshot"))?;
                Ok(opening.snapshot(position, root))
            },
        )
    }
    async fn head(&self) -> Result<Option<EventPosition>, Self::Error> {
        Ok(nonzero_position(self.0.lock()?.snapshot_head))
    }
}

/// Independent checkpoint authority over the shared document opening.
#[derive(Clone)]
struct FileCheckpoint(Arc<Opening>);

impl std::fmt::Debug for FileCheckpoint {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_tuple("FileCheckpoint")
            .field(&self.0.path)
            .finish()
    }
}

impl StorageSurface for FileCheckpoint {
    type Error = FileStorageError;
}

#[async_trait]
impl sea_core::storage::CheckpointStore for FileCheckpoint {
    async fn checkpoint(&self) -> Result<Option<Bytes>, Self::Error> {
        if let Some(executor) = &self.0.buffered {
            executor.flush(false).await?;
        }
        let component = self.clone();
        self.0.query(move || component.checkpoint_blocking()).await
    }
    async fn publish_checkpoint(&self, checkpoint: Bytes) -> Result<(), Self::Error> {
        self.0.admission()?;
        if checkpoint.is_empty() {
            return Err(FileStorageError::Rejected("empty internal checkpoint"));
        }
        if let Some(executor) = &self.0.buffered {
            let (sender, receiver) = tokio::sync::oneshot::channel();
            let component = self.clone();
            executor.admit(checkpoint.len().saturating_add(128), || {
                drop(self.0.lock()?);
                Ok((
                    (),
                    crate::buffered::Task {
                        records: Vec::new(),
                        events: false,
                        run: Box::new(move |_| {
                            let result =
                                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                    component.publish_checkpoint_blocking(&checkpoint)
                                }));
                            if !matches!(result, Ok(Ok(()))) {
                                component.0.poison();
                                return Err(FileStorageError::Ambiguous);
                            }
                            let _ = sender.send(());
                            Ok(())
                        }),
                    },
                ))
            })?;
            return receiver.await.map_err(|_| FileStorageError::Ambiguous);
        }
        let component = self.clone();
        self.0
            .execute(checkpoint.len(), move || {
                component.publish_checkpoint_blocking(&checkpoint)
            })
            .await
    }
}

#[async_trait]
impl SnapshotArchive for FileSnapshots {
    type BlobHandle = FileHandle<BlobTreeId>;
    type EventHandle = FileHandle<EventPosition>;
    async fn get_snapshot_at(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::Item>, Self::Error> {
        let component = self.clone();
        self.0
            .query(move || component.get_snapshot_at_blocking(position))
            .await
    }
    async fn latest_at_or_before(
        &self,
        position: Option<EventPosition>,
    ) -> Result<Option<Self::Item>, Self::Error> {
        let component = self.clone();
        self.0
            .query(move || component.latest_at_or_before_blocking(position))
            .await
    }
}

impl FileBlobs {
    /// Publishes one immutable pending record in the document's buffered mutation order.
    fn admit_content(
        &self,
        id: BlobTreeId,
        record: Bytes,
    ) -> Result<FileHandle<BlobTreeId>, FileStorageError> {
        self.0
            .buffered
            .as_ref()
            .unwrap()
            .admit(record.len().saturating_add(128), || {
                let state = self.0.lock()?;
                let key = tree_key(id);
                state.pending.lock().unwrap().insert(key, record.clone());
                Ok((self.0.handle(id), self.0.buffered_task(vec![(key, record)])))
            })
    }
    /// Executes resolve on an owned blocking worker.
    fn resolve_blocking(
        &self,
        id: BlobTreeId,
    ) -> Result<Option<FileHandle<BlobTreeId>>, FileStorageError> {
        Ok(self.0.published()?.contains(id)?.then(|| self.0.handle(id)))
    }
    /// Executes ensure available on an owned blocking worker.
    fn ensure_available_blocking(
        &self,
        handle: &FileHandle<BlobTreeId>,
    ) -> Result<(), FileStorageError> {
        self.0.compatible(handle)?;
        if self.0.published()?.contains(handle.id)? {
            Ok(())
        } else {
            Err(FileStorageError::Rejected("missing tree"))
        }
    }
    /// Executes put blob on an owned blocking worker.
    fn put_blob_blocking(
        &self,
        payload: &[u8],
    ) -> Result<FileHandle<BlobTreeId>, FileStorageError> {
        let id = BlobId::for_bytes(payload);
        let mut journal = self.0.writer()?;
        let state = self.0.published()?;
        if !state.contains(BlobTreeId::Blob(id))? {
            let mut record = vec![1];
            record.extend_from_slice(payload);
            drop(persist(&self.0, &mut journal, state, &record)?);
        }
        Ok(self.0.handle(BlobTreeId::Blob(id)))
    }
    /// Executes get blob on an owned blocking worker.
    fn get_blob_blocking(&self, id: BlobId) -> Result<Bytes, FileStorageError> {
        let record = self
            .0
            .published()?
            .record(&tree_key(BlobTreeId::Blob(id)))?
            .ok_or(FileStorageError::Rejected("missing blob"))?;
        Ok(Bytes::copy_from_slice(&record[1..]))
    }
    /// Executes put directory on an owned blocking worker.
    fn put_directory_blocking(
        &self,
        directory: &BlobDirectory,
        encoded: &[u8],
        id: BlobDirectoryId,
    ) -> Result<FileHandle<BlobTreeId>, FileStorageError> {
        if self.0.published()?.contains(BlobTreeId::Directory(id))? {
            return Ok(self.0.handle(BlobTreeId::Directory(id)));
        }
        // Release the fast-path state lock before waiting for the journal.
        // Writers acquire journal before state; reversing that order can deadlock with event publication.
        // Leaving state unlocked also lets reads and deduplication proceed during event disk I/O.
        // Recheck membership below because another writer may publish this directory while we wait.
        let mut journal = self.0.writer()?;
        let state = self.0.published()?;
        if !state.contains(BlobTreeId::Directory(id))? {
            for child in directory.entries().values() {
                if !state.contains(*child)? {
                    return Err(FileStorageError::Rejected("missing directory child"));
                }
            }
            let mut record = vec![2];
            record.extend_from_slice(encoded);
            drop(persist(&self.0, &mut journal, state, &record)?);
        }
        Ok(self.0.handle(BlobTreeId::Directory(id)))
    }
    /// Executes get directory on an owned blocking worker.
    fn get_directory_blocking(
        &self,
        id: BlobDirectoryId,
    ) -> Result<BlobDirectory, FileStorageError> {
        let record = self
            .0
            .published()?
            .record(&tree_key(BlobTreeId::Directory(id)))?
            .ok_or(FileStorageError::Rejected("missing directory"))?;
        BlobDirectory::decode(&record[1..])
            .map_err(|_| FileStorageError::Corrupt("directory encoding"))
    }
}

impl FileEvents {
    /// Executes resolve on an owned blocking worker.
    fn resolve_blocking(
        &self,
        id: EventPosition,
    ) -> Result<Option<FileHandle<EventPosition>>, FileStorageError> {
        Ok(self
            .0
            .published()?
            .has_event(id)?
            .then(|| self.0.handle(id)))
    }
    /// Executes ensure available on an owned blocking worker.
    fn ensure_available_blocking(
        &self,
        handle: &FileHandle<EventPosition>,
    ) -> Result<(), FileStorageError> {
        self.0.compatible(handle)?;
        if self.0.published()?.has_event(handle.id)? {
            Ok(())
        } else {
            Err(FileStorageError::Rejected("missing event"))
        }
    }
}

impl FileSnapshots {
    /// Executes append on an owned blocking worker.
    fn append_blocking(&self, snapshot: &FileSnapshot) -> Result<(), FileStorageError> {
        self.0.compatible(&snapshot.root)?;
        self.0.compatible(&snapshot.at_event)?;
        let mut journal = self.0.writer()?;
        let mut state = self.0.published()?;
        let position = snapshot.at_event.id;
        if !state.contains(snapshot.root.id)? || !state.has_event(position)? {
            return Err(FileStorageError::Rejected("snapshot dependency"));
        }
        if state.snapshot_head >= position.get() {
            return Err(FileStorageError::Rejected("snapshot must advance"));
        }
        let mut record = vec![4];
        record.extend_from_slice(&position.get().to_be_bytes());
        encode_tree(&mut record, snapshot.root.id);
        state = persist(&self.0, &mut journal, state, &record)?;
        let readers = {
            let mut published = self.0.lock()?;
            published.snapshot_head = state.snapshot_head;
            published.snapshot_end = state.snapshot_end;
            published.readers()
        };
        for reader in readers {
            reader.wake();
        }
        Ok(())
    }
    /// Executes get snapshot at on an owned blocking worker.
    fn get_snapshot_at_blocking(
        &self,
        position: EventPosition,
    ) -> Result<Option<FileSnapshot>, FileStorageError> {
        Ok(self
            .0
            .published()?
            .snapshot(position)?
            .map(|root| self.0.snapshot(position, root)))
    }
    /// Executes latest at or before on an owned blocking worker.
    fn latest_at_or_before_blocking(
        &self,
        position: Option<EventPosition>,
    ) -> Result<Option<FileSnapshot>, FileStorageError> {
        let state = self.0.published()?;
        let Some(position) = state.floor(4, position)? else {
            return Ok(None);
        };
        Ok(state
            .snapshot(position)?
            .map(|root| self.0.snapshot(position, root)))
    }
}

impl FileCheckpoint {
    /// Executes checkpoint on an owned blocking worker.
    fn checkpoint_blocking(&self) -> Result<Option<Bytes>, FileStorageError> {
        drop(self.0.lock()?);
        Ok(atomic_file::read(&self.0.path.with_extension("checkpoint"))?.map(Bytes::from))
    }
    /// Executes publish checkpoint on an owned blocking worker.
    fn publish_checkpoint_blocking(&self, checkpoint: &[u8]) -> Result<(), FileStorageError> {
        if checkpoint.is_empty() {
            return Err(FileStorageError::Rejected("empty internal checkpoint"));
        }
        let mut journal = self.0.writer()?;
        if let Err(error) =
            journal.write_value(&self.0.path.with_extension("checkpoint"), checkpoint)
        {
            drop(journal);
            self.0.poison();
            return Err(error);
        }
        Ok(())
    }
}

/// Releases the mutation lock before notifying readers of an uncertain write.
fn persist(
    opening: &Opening,
    journal: &mut Journal,
    mut state: State,
    record: &[u8],
) -> Result<State, FileStorageError> {
    let result = if matches!(record.first(), Some(1 | 2)) {
        let key = record_key(record)?;
        state.unpublished.lock().unwrap().insert(key);
        let result = journal.write_value(&state.content_path(&key), record);
        if result.is_ok() || matches!(result, Err(FileStorageError::Rejected(_))) {
            state.unpublished.lock().unwrap().remove(&key);
        }
        result
    } else {
        let mut snapshots = opening
            .snapshots
            .lock()
            .map_err(|_| FileStorageError::Ambiguous)?;
        let offset = snapshots.boundary()?;
        snapshots.append(record).and_then(|()| {
            state.recover_record(record, offset)?;
            snapshots.remember_tail(offset)
        })
    };
    if let Err(error) = result {
        if matches!(error, FileStorageError::Ambiguous) {
            opening.poison();
        }
        return Err(error);
    }
    Ok(state)
}

/// Creates a lazy read retaining the opening, with notifications registered under the mutation lock.
#[expect(
    clippy::too_many_lines,
    reason = "Keep the bounded lazy-read state machine together"
)]
fn read<Item: Send + 'static>(
    opening: Arc<Opening>,
    after: Option<EventPosition>,
    stop: Option<EventPosition>,
    category: u8,
    convert: fn(&Opening, &State, EventPosition) -> Result<Item, FileStorageError>,
) -> ArchiveStream<Item, EventPosition, FileStorageError> {
    let workers = opening.workers.clone();
    let initial = MonitoredStreamProgress {
        previous: after,
        latest_known: after,
        status: MonitoredStreamStatus::StreamingBacklog,
    };
    let observation = Arc::new(Mutex::new(initial));
    let observed = observation.clone();
    let mut previous = after;
    let mut initialized = false;
    let mut finished = false;
    let mut reported = None;
    let empty = matches!((after, stop), (Some(after), Some(stop)) if after >= stop);
    let waker = Arc::new(AtomicWaker::new());
    let source = stream::poll_fn(move |context| {
        if finished {
            return Poll::Ready(None);
        }
        let mut state = match opening.lock() {
            Ok(state) => state,
            Err(error) => {
                finished = true;
                return Poll::Ready(Some(Err(error)));
            }
        };
        waker.register(context.waker());
        let head = nonzero_position(if category == 3 {
            state.head
        } else {
            state.snapshot_head
        });
        if !initialized {
            if !empty
                && (after.is_some_and(|bound| Some(bound) > head)
                    || stop.is_some_and(|bound| Some(bound) > head))
            {
                finished = true;
                return Poll::Ready(Some(Err(FileStorageError::InvalidPosition)));
            }
            initialized = true;
            state.readers.retain(|reader| reader.strong_count() != 0);
            state.readers.push(Arc::downgrade(&waker));
        }
        let state = {
            let snapshot = state.clone();
            drop(state);
            snapshot
        };
        let latest = match state.floor(category, stop) {
            Ok(latest) => latest,
            Err(error) => {
                finished = true;
                return Poll::Ready(Some(Err(error)));
            }
        };
        let next = if empty {
            None
        } else {
            match state.next(category, previous) {
                Ok(next) => next.filter(|position| stop.is_none_or(|stop| *position <= stop)),
                Err(error) => {
                    finished = true;
                    return Poll::Ready(Some(Err(error)));
                }
            }
        };
        let progress = observe(latest, next, previous, empty);
        *observed.lock().expect("reader observation lock") = progress.clone();
        if reported.is_none() {
            reported = Some(progress.clone());
            return Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(progress))));
        }
        if let Some(position) = next {
            let item = match convert(&opening, &state, position) {
                Ok(item) => item,
                Err(error) => {
                    finished = true;
                    return Poll::Ready(Some(Err(error)));
                }
            };
            previous = Some(position);
            let mut observation = observed.lock().expect("reader observation lock");
            observation.previous = previous;
            if previous == observation.latest_known {
                observation.status = MonitoredStreamStatus::AwaitingNewItems;
            }
            return Poll::Ready(Some(Ok(MonitoredStreamItem::Item(item))));
        }
        if reported.as_ref() != Some(&progress) {
            reported = Some(progress.clone());
            return Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(progress))));
        }
        if stop.is_some() || empty {
            finished = true;
            Poll::Ready(None)
        } else {
            Poll::Pending
        }
    });
    crate::common::blocking_read(
        Box::pin(FileRead {
            source: Box::pin(source),
            observation,
        }),
        workers,
    )
}

/// File reads update delivered position and backlog status atomically on every poll.
struct FileRead<Source> {
    /// Owned lazy source, retaining its exclusive opening.
    source: std::pin::Pin<Box<Source>>,
    /// Latest coherent delivery observation, including newly discovered entries.
    observation: Arc<Mutex<MonitoredStreamProgress<EventPosition>>>,
}

/// Computes a coherent in-range backlog observation from the same locked history.
fn observe(
    latest: Option<EventPosition>,
    next: Option<EventPosition>,
    previous: Option<EventPosition>,
    empty: bool,
) -> MonitoredStreamProgress<EventPosition> {
    let latest_known = if empty {
        previous
    } else {
        previous.max(latest)
    };
    let status = if previous == latest_known {
        MonitoredStreamStatus::AwaitingNewItems
    } else if next < latest_known {
        MonitoredStreamStatus::FallenBehind
    } else {
        MonitoredStreamStatus::StreamingBacklog
    };
    MonitoredStreamProgress {
        previous,
        latest_known,
        status,
    }
}

impl<Source, Item> Stream for FileRead<Source>
where
    Source: Stream<Item = Result<MonitoredStreamItem<Item, EventPosition>, FileStorageError>>,
{
    type Item = Source::Item;
    fn poll_next(
        self: std::pin::Pin<&mut Self>,
        context: &mut std::task::Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        self.get_mut().source.as_mut().poll_next(context)
    }
}

impl<Source, Item> MonitoredStream for FileRead<Source>
where
    Source: Stream<Item = Result<MonitoredStreamItem<Item, EventPosition>, FileStorageError>>,
{
    type Data = Item;
    type Position = EventPosition;
    type Error = FileStorageError;
    fn progress(&self) -> MonitoredStreamProgress<EventPosition> {
        self.observation
            .lock()
            .expect("reader observation lock")
            .clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::journal::JournalFault;
    use futures_util::StreamExt;
    use std::collections::BTreeMap;
    use std::sync::atomic::{AtomicU64, Ordering};
    /// Prevents collisions between concurrent tests and namespace factories.
    static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

    /// Counts actual wake notifications independently of eager manual polling.
    struct WakeCount(AtomicU64);
    impl futures_util::task::ArcWake for WakeCount {
        fn wake_by_ref(arc_self: &Arc<Self>) {
            arc_self.0.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Blocks one journal write with a bounded watchdog so executor stalls fail instead of hang.
    fn block_write(
        events: &FileEvents,
        panic: bool,
    ) -> (
        tokio::sync::oneshot::Receiver<()>,
        std::sync::mpsc::Sender<()>,
    ) {
        let (entered, entered_receiver) = tokio::sync::oneshot::channel();
        let (release, release_receiver) = std::sync::mpsc::channel();
        events.0.writer().unwrap().before_sync = Some(Box::new(move || {
            entered.send(()).unwrap();
            release_receiver
                .recv_timeout(std::time::Duration::from_secs(5))
                .expect("executor must release the blocked writer");
            assert!(!panic, "injected worker panic after writing");
        }));
        (entered_receiver, release)
    }

    /// Provides identical payloads so batch ordering does not depend on content identity.
    fn batch() -> Vec<Event> {
        vec![
            Event {
                payload: Bytes::from_static(b"batch"),
                blob_tree: None
            };
            2
        ]
    }

    #[tokio::test]
    async fn byte_offset_bounds_and_backward_snapshots_survive_reopen_without_checkpoint() {
        let root = root();
        let storage = Factory::open(&root, true).unwrap();
        let created = storage.create_document().await.unwrap();
        let id = created.id;
        let components = created.components;
        let blob = components
            .blobs
            .put_blob(Bytes::from_static(b"state"))
            .await
            .unwrap();
        let mut positions = Vec::new();
        for size in [1, 137, 7, 310] {
            let event = components
                .events
                .append(Event {
                    payload: Bytes::from(vec![42; size]),
                    blob_tree: Some(blob.id()),
                })
                .await
                .unwrap();
            components
                .snapshots
                .append(Snapshot {
                    root: blob.clone(),
                    at_event: event.clone(),
                })
                .await
                .unwrap();
            positions.push(event.id());
        }
        drop(components);
        let components = storage.open_document(&id).await.unwrap().unwrap();
        assert_eq!(components.checkpoints.checkpoint().await.unwrap(), None);
        let between = EventPosition::new(positions[1].get() + 1);
        assert!(components.events.resolve(between).await.unwrap().is_none());
        let mut events = components.events.read(Some(between), Some(positions[3]));
        let mut delivered = Vec::new();
        while let Some(item) = events.next().await {
            if let MonitoredStreamItem::Item(event) = item.unwrap() {
                delivered.push(event.position);
            }
        }
        assert_eq!(delivered, positions[2..]);
        for (bound, expected) in [
            (None, Some(positions[3])),
            (Some(between), Some(positions[1])),
            (Some(EventPosition::new(7)), None),
        ] {
            assert_eq!(
                components
                    .snapshots
                    .latest_at_or_before(bound)
                    .await
                    .unwrap()
                    .map(|snapshot| snapshot.at_event.id()),
                expected
            );
        }
        drop((events, components));
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn direct_reopen_keeps_history_lazy_and_checkpoint_size_independent() {
        use std::io::{Seek, SeekFrom, Write};
        let root = root();
        let storage = Factory::open(&root, true).unwrap();
        let created = storage.create_document().await.unwrap();
        let id = created.id;
        let blob = created
            .components
            .blobs
            .put_blob(Bytes::from_static(b"old payload"))
            .await
            .unwrap();
        for _ in 0..520 {
            created
                .components
                .events
                .append(batch().remove(0))
                .await
                .unwrap();
        }
        created
            .components
            .checkpoints
            .publish_checkpoint(Bytes::from_static(b"internal"))
            .await
            .unwrap();
        assert_eq!(created.components.snapshots.head().await.unwrap(), None);
        let last = created
            .components
            .events
            .append(batch().remove(0))
            .await
            .unwrap()
            .id();
        drop(created.components);
        let components = storage.open_document(&id).await.unwrap().unwrap();
        assert_eq!(components.events.head().await.unwrap(), Some(last));
        assert_eq!(
            components.checkpoints.checkpoint().await.unwrap().unwrap(),
            b"internal"[..]
        );
        let BlobTreeId::Blob(blob_id) = blob.id() else {
            panic!("leaf expected")
        };
        assert_eq!(
            components.blobs.get_blob(blob_id).await.unwrap(),
            b"old payload"[..]
        );
        let mut history = components.events.read(None, Some(last));
        let mut count = 0;
        while let Some(item) = history.next().await {
            if matches!(item.unwrap(), MonitoredStreamItem::Item(_)) {
                count += 1;
            }
        }
        assert_eq!(count, 521);
        let path = components
            .blobs
            .0
            .lock()
            .unwrap()
            .content_path(&tree_key(blob.id()));
        let checkpoint_path = components.events.0.path.with_extension("checkpoint");
        assert_eq!(fs::metadata(&checkpoint_path).unwrap().len(), 32 + 8);
        assert!(!components.events.0.path.with_extension("index").exists());
        let cursor_before = fs::read(components.events.0.path.with_extension("cursor")).unwrap();
        let events_before = fs::read(&*components.events.0.path).unwrap();
        let content_before = fs::read(&path).unwrap();
        components
            .checkpoints
            .publish_checkpoint(Bytes::from_static(b"replaced"))
            .await
            .unwrap();
        assert_eq!(fs::metadata(checkpoint_path).unwrap().len(), 32 + 8);
        assert_eq!(
            fs::read(components.events.0.path.with_extension("cursor")).unwrap(),
            cursor_before
        );
        assert_eq!(fs::read(&*components.events.0.path).unwrap(), events_before);
        assert_eq!(fs::read(&path).unwrap(), content_before);
        drop((history, components));
        let mut file = fs::OpenOptions::new().write(true).open(&path).unwrap();
        file.seek(SeekFrom::Start(33)).unwrap();
        file.write_all(b"X").unwrap();
        drop(file);
        let components = storage.open_document(&id).await.unwrap().unwrap();
        assert!(matches!(
            components.blobs.get_blob(blob_id).await,
            Err(FileStorageError::Corrupt(_))
        ));
        drop(components);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn directory_deduplication_does_not_wait_for_writer() {
        for indexed in [false, true] {
            check_directory_deduplication::<false>(indexed).await;
            check_directory_deduplication::<true>(indexed).await;
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn namespace_sync_stops_at_filesystem_boundary() {
        let mut synchronized = Vec::new();
        sync_namespace(Path::new("/proc"), |directory| {
            synchronized.push(directory.to_path_buf());
            Ok(())
        })
        .unwrap();
        assert_eq!(synchronized, vec![PathBuf::from("/proc")]);
    }

    #[test]
    fn namespace_sync_is_bottom_up_and_propagates_failure() {
        let root = root();
        fs::create_dir_all(root.join("nested")).unwrap();
        let root = fs::canonicalize(root).unwrap();
        let nested = root.join("nested");
        let mut synchronized = Vec::new();
        let error = sync_namespace(&nested, |directory| {
            synchronized.push(directory.to_path_buf());
            if directory == root {
                Err(std::io::Error::other("injected namespace sync failure"))
            } else {
                Ok(())
            }
        })
        .unwrap_err();
        assert_eq!(error.to_string(), "injected namespace sync failure");
        assert_eq!(synchronized, vec![nested, root.clone()]);
        fs::remove_dir_all(root).unwrap();
    }

    /// Checks that closed directories can be reused while another mutation owns the journal.
    async fn check_directory_deduplication<const DURABLE: bool>(indexed: bool) {
        let root = root();
        let storage = Factory::open(&root, DURABLE).unwrap();
        let created = storage.create_document().await.unwrap();
        let blobs = &created.components.blobs;
        let leaf = blobs.put_blob(Bytes::from_static(b"leaf")).await.unwrap();
        let directory =
            BlobDirectory::new(BTreeMap::from([("leaf".to_owned(), leaf.id())])).unwrap();
        let original = blobs.put_directory(directory.clone()).await.unwrap();
        let components = if indexed {
            created
                .components
                .checkpoints
                .publish_checkpoint(Bytes::from_static(b"deduplication checkpoint"))
                .await
                .unwrap();
            drop(created.components);
            let components = storage.open_document(&created.id).await.unwrap().unwrap();
            assert!(
                components
                    .blobs
                    .0
                    .lock()
                    .unwrap()
                    .contains(original.id())
                    .unwrap()
            );
            components
        } else {
            created.components
        };
        let blobs = &components.blobs;
        let syncs_before = blobs.0.writer().unwrap().syncs;
        let duplicate = blobs.clone();
        let (completed, completion) = std::sync::mpsc::channel();
        let (worker, result) = {
            let journal = blobs.0.writer().unwrap();
            let syncs = journal.syncs;
            let worker = tokio::task::spawn_blocking(move || {
                let result =
                    tokio::runtime::Handle::current().block_on(duplicate.put_directory(directory));
                let _ = completed.send(result);
            });
            let result = completion.recv_timeout(std::time::Duration::from_secs(5));
            assert_eq!(journal.syncs, syncs);
            (worker, result)
        };
        worker.await.unwrap();
        assert_eq!(
            result
                .expect("deduplication must not wait for the writer")
                .unwrap()
                .id(),
            original.id()
        );
        assert_eq!(blobs.0.writer().unwrap().syncs, syncs_before);
        drop(components);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn directory_publication_preserves_closure_and_failed_deduplication_is_rejected() {
        let root = root();
        let storage = Factory::open(&root, true).unwrap();
        let created = storage.create_document().await.unwrap();
        let blobs = &created.components.blobs;
        let leaf = blobs.put_blob(Bytes::from_static(b"leaf")).await.unwrap();
        let child = BlobDirectory::new(BTreeMap::from([("leaf".to_owned(), leaf.id())])).unwrap();
        let child_handle = blobs.put_directory(child.clone()).await.unwrap();
        let parent =
            BlobDirectory::new(BTreeMap::from([("child".to_owned(), child_handle.id())])).unwrap();
        let parent_handle = blobs.put_directory(parent.clone()).await.unwrap();
        let missing_blob = BlobTreeId::Blob(BlobId::for_bytes(b"missing"));
        let missing_directory =
            BlobDirectory::new(BTreeMap::from([("missing".to_owned(), missing_blob)])).unwrap();
        for missing in [
            missing_blob,
            BlobTreeId::Directory(missing_directory.id().unwrap()),
        ] {
            let incomplete = BlobDirectory::new(BTreeMap::from([
                ("available".to_owned(), child_handle.id()),
                ("missing".to_owned(), missing),
            ]))
            .unwrap();
            let id = BlobTreeId::Directory(incomplete.id().unwrap());
            assert!(matches!(
                blobs.put_directory(incomplete).await,
                Err(FileStorageError::Rejected("missing directory child"))
            ));
            assert!(blobs.resolve(id).await.unwrap().is_none());
        }
        assert_eq!(blobs.0.writer().unwrap().syncs, 3);
        blobs.0.writer().unwrap().inject(JournalFault::BeforeWrite);
        assert_eq!(
            blobs.put_directory(parent.clone()).await.unwrap().id(),
            parent_handle.id()
        );
        assert!(matches!(
            blobs.put_directory(BlobDirectory::default()).await,
            Err(FileStorageError::Rejected(_))
        ));
        blobs.0.writer().unwrap().inject(JournalFault::PartialWrite);
        assert!(matches!(
            blobs.put_directory(BlobDirectory::default()).await,
            Err(FileStorageError::Ambiguous)
        ));
        assert!(matches!(
            blobs.put_directory(parent.clone()).await,
            Err(FileStorageError::Ambiguous)
        ));
        drop(created.components);
        let reopened = storage.open_document(&created.id).await.unwrap().unwrap();
        reopened
            .blobs
            .ensure_available(&parent_handle)
            .await
            .unwrap();
        for directory in [child, parent] {
            assert_eq!(
                reopened
                    .blobs
                    .get_directory(directory.id().unwrap())
                    .await
                    .unwrap(),
                directory
            );
        }
        assert_eq!(
            reopened
                .blobs
                .get_blob(BlobId::for_bytes(b"leaf"))
                .await
                .unwrap(),
            Bytes::from_static(b"leaf")
        );
        assert!(
            reopened
                .blobs
                .resolve(BlobTreeId::Directory(
                    BlobDirectory::default().id().unwrap()
                ))
                .await
                .unwrap()
                .is_none()
        );
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn directory_sync_failure_does_not_publish_parent() {
        let root = root();
        let storage = Factory::open(&root, true).unwrap();
        let created = storage.create_document().await.unwrap();
        let blobs = &created.components.blobs;
        let child = blobs.put_blob(Bytes::from_static(b"child")).await.unwrap();
        let parent =
            BlobDirectory::new(BTreeMap::from([("child".to_owned(), child.id())])).unwrap();
        let parent_id = parent.id().unwrap();
        blobs.0.writer().unwrap().inject(JournalFault::BeforeSync);

        assert!(matches!(
            blobs.put_directory(parent).await,
            Err(FileStorageError::Ambiguous)
        ));
        {
            let state = blobs.0.state.lock().unwrap();
            assert!(state.contains(child.id()).unwrap());
            assert!(
                !state.contains(BlobTreeId::Directory(parent_id)).unwrap(),
                "the parent must not be published before synchronization succeeds"
            );
        }
        assert!(matches!(
            blobs.resolve(BlobTreeId::Directory(parent_id)).await,
            Err(FileStorageError::Ambiguous)
        ));
        assert!(matches!(
            blobs.get_directory(parent_id).await,
            Err(FileStorageError::Ambiguous)
        ));
        drop(created);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn blocked_batch_allows_executor_admission_and_published_reads() {
        check_blocked_batch::<true>().await;
    }

    #[tokio::test(flavor = "current_thread")]
    async fn buffered_admission_reads_capacity_and_shutdown_precede_reopen() {
        let root = root();
        let storage = Factory::open(&root, false).unwrap();
        let created = storage.create_document().await.unwrap();
        let events = &created.components.events;
        let (entered, release) = block_write(events, false);
        let first = events.append(batch().remove(0)).await.unwrap();
        entered.await.unwrap();
        let second = events.append(batch().remove(0)).await.unwrap();
        assert_eq!(second.id().get(), first.id().get() + 71);
        assert_eq!(events.head().await.unwrap(), Some(second.id()));
        let mut history = events.read(None, Some(second.id()));
        let mut positions = Vec::new();
        while let Some(item) = history.next().await {
            if let MonitoredStreamItem::Item(event) = item.unwrap() {
                positions.push(event.position);
            }
        }
        assert_eq!(positions, vec![first.id(), second.id()]);
        for _ in 2..128 {
            events.append(batch().remove(0)).await.unwrap();
        }
        assert!(matches!(
            events.append(batch().remove(0)).await,
            Err(FileStorageError::Rejected(_))
        ));
        let head = events.head().await.unwrap();
        let drain = storage.flush();
        tokio::pin!(drain);
        assert!(futures_util::poll!(&mut drain).is_pending());
        release.send(()).unwrap();
        drain.await.unwrap();
        assert!(
            events
                .0
                .published()
                .unwrap()
                .pending
                .lock()
                .unwrap()
                .is_empty()
        );
        storage.shutdown().await.unwrap();
        assert!(events.append(batch().remove(0)).await.is_err());
        drop((history, created.components));
        let reopened_factory = Factory::open(&root, false).unwrap();
        let reopened = reopened_factory
            .open_document(&created.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(reopened.events.head().await.unwrap(), head);
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }

    /// Checks off-executor writes and prefix visibility under both durability policies.
    async fn check_blocked_batch<const DURABLE: bool>() {
        let root = root();
        let storage = Factory::open(&root, DURABLE).unwrap();
        let created = storage.create_document().await.unwrap();
        let events = created.components.events.clone();
        let first = events.append(batch().remove(0)).await.unwrap();
        let mut live = events.read(Some(first.id()), None);
        live.next().await.unwrap().unwrap();
        let (entered, release) = block_write(&events, false);
        let writer = events.clone();
        let append = tokio::spawn(async move { writer.append_batch(batch()).await });
        entered.await.unwrap();
        assert!(!append.is_finished());
        assert_eq!(tokio::spawn(async { 42 }).await.unwrap(), 42);
        assert_eq!(events.head().await.unwrap(), Some(first.id()));
        assert!(
            events
                .resolve(EventPosition::new(2))
                .await
                .unwrap()
                .is_none()
        );
        events.ensure_available(&first).await.unwrap();
        assert_eq!(created.components.snapshots.head().await.unwrap(), None);
        let counter = Arc::new(WakeCount(AtomicU64::new(0)));
        let waker = futures_util::task::waker(counter.clone());
        assert!(
            live.as_mut()
                .poll_next(&mut std::task::Context::from_waker(&waker))
                .is_pending()
        );
        release.send(()).unwrap();
        let results = append.await.unwrap();
        assert_eq!(results.len(), 2);
        let positions: Vec<_> = results
            .into_iter()
            .map(|result| result.unwrap().id())
            .collect();
        assert!(counter.0.load(Ordering::Relaxed) >= 1);
        assert_eq!(events.head().await.unwrap(), positions.last().copied());
        assert!(
            matches!(live.next().await, Some(Ok(MonitoredStreamItem::Item(event))) if event.position == positions[0])
        );
        drop((live, events, created));
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn cancelled_batch_retains_opening_until_worker_settles() {
        let root = root();
        let storage = Factory::open(&root, true).unwrap();
        let created = storage.create_document().await.unwrap();
        let events = created.components.events.clone();
        let (entered, release) = block_write(&events, false);
        let append = tokio::spawn(async move { events.append_batch(batch()).await });
        entered.await.unwrap();
        append.abort();
        assert!(append.await.unwrap_err().is_cancelled());
        drop(created.components);
        assert!(matches!(
            storage.open_document(&created.id).await,
            Err(FileStorageError::Busy)
        ));
        release.send(()).unwrap();
        let reopened = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                match storage.open_document(&created.id).await {
                    Err(FileStorageError::Busy) => tokio::task::yield_now().await,
                    result => break result.unwrap().unwrap(),
                }
            }
        })
        .await
        .unwrap();
        assert_eq!(
            reopened.events.head().await.unwrap(),
            Some(EventPosition::new(8 + 48 + 18 + 5))
        );
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn worker_panic_poisons_observations_and_wakes_readers_even_after_cancellation() {
        for cancelled in [false, true] {
            let root = root();
            let storage = Factory::open(&root, true).unwrap();
            let created = storage.create_document().await.unwrap();
            let events = created.components.events.clone();
            let mut live = events.read(None, None);
            live.next().await.unwrap().unwrap();
            let counter = Arc::new(WakeCount(AtomicU64::new(0)));
            let waker = futures_util::task::waker(counter.clone());
            assert!(
                live.as_mut()
                    .poll_next(&mut std::task::Context::from_waker(&waker))
                    .is_pending()
            );
            let (entered, release) = block_write(&events, true);
            let writer = events.clone();
            let append = tokio::spawn(async move { writer.append_batch(batch()).await });
            entered.await.unwrap();
            if cancelled {
                append.abort();
                assert!(append.await.unwrap_err().is_cancelled());
                release.send(()).unwrap();
            } else {
                release.send(()).unwrap();
                let results = append.await.unwrap();
                assert_eq!(results.len(), 2);
                assert!(
                    results
                        .iter()
                        .all(|result| matches!(result, Err(FileStorageError::Ambiguous)))
                );
            }
            tokio::time::timeout(std::time::Duration::from_secs(5), async {
                while counter.0.load(Ordering::Relaxed) == 0 {
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            let next = tokio::time::timeout(std::time::Duration::from_secs(5), live.next())
                .await
                .unwrap();
            assert!(matches!(next, Some(Err(FileStorageError::Ambiguous))));
            assert!(counter.0.load(Ordering::Relaxed) >= 1);
            assert!(events.0.journal.is_poisoned());
            assert!(matches!(
                events.head().await,
                Err(FileStorageError::Ambiguous)
            ));
            assert!(matches!(
                events.resolve(EventPosition::new(1)).await,
                Err(FileStorageError::Ambiguous)
            ));
            assert!(matches!(
                created
                    .components
                    .blobs
                    .resolve(BlobTreeId::Blob(BlobId::for_bytes(b"missing")))
                    .await,
                Err(FileStorageError::Ambiguous)
            ));
            assert!(events.append(batch().remove(0)).await.is_err());
            drop((live, events, created.components));
            let reopened = storage.open_document(&created.id).await.unwrap().unwrap();
            assert_eq!(
                reopened.events.head().await.unwrap(),
                Some(EventPosition::new(8 + 48 + 18 + 5))
            );
            drop(reopened);
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[tokio::test]
    async fn event_batch_positions_are_frame_offsets_with_one_journal_sync() {
        let root = root();
        let storage = Factory::open(&root, true).unwrap();
        let created = storage.create_document().await.unwrap();
        let events = &created.components.events;
        let mut live = events.read(None, None);
        live.next().await.unwrap().unwrap();
        let results = events
            .append_batch(vec![
                Event {
                    payload: Bytes::from_static(b"same"),
                    blob_tree: None,
                },
                Event {
                    payload: Bytes::from_static(b"same"),
                    blob_tree: None,
                },
            ])
            .await;
        assert_eq!(results.len(), 2);
        for (index, result) in results.into_iter().enumerate() {
            assert_eq!(result.unwrap().id().get(), 8 + index as u64 * (48 + 18 + 4));
        }
        assert_eq!(events.0.writer().unwrap().syncs, 1);
        assert!(events.append_batch(Vec::new()).await.is_empty());
        assert_eq!(events.0.writer().unwrap().syncs, 1);
        for ordinal in [8, 8 + 48 + 18 + 4] {
            assert!(matches!(
                live.next().await,
                Some(Ok(MonitoredStreamItem::Item(event))) if event.position.get() == ordinal
            ));
        }
        drop((live, created.components));
        let view = storage.open_view(&created.id).await.unwrap().unwrap();
        assert_eq!(
            view.head().await.unwrap(),
            Some(EventPosition::new(8 + 48 + 18 + 4))
        );
        drop(view);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn uncertain_batch_reports_every_entry_without_publishing_to_readers() {
        for fault in [
            JournalFault::BeforeWrite,
            JournalFault::PartialWrite,
            JournalFault::BeforeSync,
            JournalFault::AfterSync,
        ] {
            let root = root();
            let storage = Factory::open(&root, true).unwrap();
            let created = storage.create_document().await.unwrap();
            let events = &created.components.events;
            let mut live = events.read(None, None);
            live.next().await.unwrap().unwrap();
            events.0.writer().unwrap().inject(fault);
            let results = events
                .append_batch(vec![
                    Event {
                        payload: Bytes::new(),
                        blob_tree: None,
                    },
                    Event {
                        payload: Bytes::new(),
                        blob_tree: None,
                    },
                ])
                .await;
            if matches!(fault, JournalFault::BeforeWrite) {
                assert_eq!(results.len(), 1);
                assert!(matches!(results[0], Err(FileStorageError::Rejected(_))));
                assert_eq!(events.head().await.unwrap(), None);
            } else {
                assert_eq!(results.len(), 2);
                assert!(
                    results
                        .iter()
                        .all(|result| matches!(result, Err(FileStorageError::Ambiguous)))
                );
                assert_eq!(events.0.state.lock().unwrap().head, 0);
                assert!(matches!(
                    live.next().await,
                    Some(Err(FileStorageError::Ambiguous))
                ));
                assert!(events.head().await.is_err());
            }
            drop((live, created.components));
            let view = storage.open_view(&created.id).await.unwrap().unwrap();
            let expected = if matches!(fault, JournalFault::BeforeSync | JournalFault::AfterSync) {
                Some(EventPosition::new(8 + 48 + 18))
            } else {
                None
            };
            assert_eq!(view.head().await.unwrap(), expected);
            drop(view);
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[tokio::test]
    async fn live_readers_wake_on_commit_and_uncertain_write() {
        let root = root();
        let storage = Factory::open(&root, true).unwrap();
        let created = storage.create_document().await.unwrap();
        let events = &created.components.events;
        let mut live = events.read(None, None);
        live.next().await.unwrap().unwrap();
        let counter = Arc::new(WakeCount(AtomicU64::new(0)));
        let waker = futures_util::task::waker(counter.clone());
        let mut context = std::task::Context::from_waker(&waker);
        assert!(live.as_mut().poll_next(&mut context).is_pending());
        events
            .append(Event {
                payload: Bytes::new(),
                blob_tree: None,
            })
            .await
            .unwrap();
        assert!(counter.0.load(Ordering::Relaxed) >= 1);
        live.next().await.unwrap().unwrap();
        live.next().await.unwrap().unwrap();
        assert!(live.as_mut().poll_next(&mut context).is_pending());
        events
            .0
            .writer()
            .unwrap()
            .inject(JournalFault::PartialWrite);
        assert!(
            events
                .append(Event {
                    payload: Bytes::new(),
                    blob_tree: None
                })
                .await
                .is_err()
        );
        assert!(counter.0.load(Ordering::Relaxed) >= 2);
        assert!(matches!(
            live.next().await,
            Some(Err(FileStorageError::Ambiguous))
        ));
        assert!(live.next().await.is_none());
        drop((live, created));
        fs::remove_dir_all(root).unwrap();
    }
    /// Allocates an isolated namespace for a filesystem regression.
    fn root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "sea-next-components-{}-{}",
            std::process::id(),
            NEXT_ROOT.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[tokio::test]
    async fn journal_faults_preserve_prefix_and_block_uncertain_observations() {
        for fault in [
            JournalFault::BeforeWrite,
            JournalFault::PartialWrite,
            JournalFault::AfterSync,
        ] {
            check_fault::<false>(fault).await;
            check_fault::<true>(fault).await;
        }
        check_fault::<true>(JournalFault::BeforeSync).await;
    }

    /// Exercises the same state transition under both durability policies.
    async fn check_fault<const DURABLE: bool>(fault: JournalFault) {
        let root = root();
        let storage = Factory::open(&root, DURABLE).unwrap();
        let created = storage.create_document().await.unwrap();
        let events = &created.components.events;
        let first = events
            .append(Event {
                payload: Bytes::from_static(b"first"),
                blob_tree: None,
            })
            .await
            .unwrap();
        storage.flush().await.unwrap();
        events.0.writer().unwrap().inject(fault);
        let result = events
            .append(Event {
                payload: Bytes::from_static(b"second"),
                blob_tree: None,
            })
            .await;
        if !DURABLE {
            result.unwrap();
            assert!(matches!(
                storage.flush().await,
                Err(FileStorageError::Ambiguous)
            ));
            assert!(events.head().await.is_err());
            assert!(events.resolve(first.id()).await.is_err());
        } else if let JournalFault::BeforeWrite = fault {
            let error = result.unwrap_err();
            assert!(matches!(error, FileStorageError::Rejected(_)));
            assert_eq!(events.head().await.unwrap(), Some(first.id()));
        } else {
            let error = result.unwrap_err();
            assert!(matches!(error, FileStorageError::Ambiguous));
            assert!(events.head().await.is_err());
            assert!(events.resolve(first.id()).await.is_err());
        }
        drop(created.components);
        let reopened = storage.open_view(&created.id).await;
        if !DURABLE && matches!(fault, JournalFault::PartialWrite) {
            assert!(matches!(reopened, Err(FileStorageError::Corrupt(_))));
        } else {
            let view = reopened.unwrap().unwrap();
            let expected = if matches!(fault, JournalFault::BeforeSync | JournalFault::AfterSync) {
                8 + 48 + 18 + 5
            } else {
                8
            };
            assert_eq!(
                view.head().await.unwrap(),
                Some(EventPosition::new(expected))
            );
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn snapshot_post_sync_ambiguity_recovers_without_duplicate_publication() {
        let root = root();
        let storage = Factory::open(&root, true).unwrap();
        let created = storage.create_document().await.unwrap();
        let blob = created
            .components
            .blobs
            .put_blob(Bytes::new())
            .await
            .unwrap();
        let event = created
            .components
            .events
            .append(Event {
                payload: Bytes::new(),
                blob_tree: Some(blob.id()),
            })
            .await
            .unwrap();
        let snapshot = Snapshot {
            root: blob,
            at_event: event.clone(),
        };
        created
            .components
            .snapshots
            .0
            .snapshots
            .lock()
            .unwrap()
            .inject(JournalFault::AfterSync);
        assert!(matches!(
            created.components.snapshots.append(snapshot).await,
            Err(FileStorageError::Ambiguous)
        ));
        assert!(
            created
                .components
                .snapshots
                .get_snapshot_at(event.id())
                .await
                .is_err()
        );
        drop(created.components);
        let reopened = storage.open_view(&created.id).await.unwrap().unwrap();
        assert_eq!(
            reopened
                .get_snapshot(sea_core::storage::LoadStart::LatestSnapshot)
                .await
                .unwrap()
                .unwrap()
                .at_event
                .id(),
            event.id()
        );
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn progress_stays_coherent_when_live_reader_discovers_new_backlog() {
        let root = root();
        let storage = Factory::open(&root, false).unwrap();
        let (_, view) = storage.create_view().await.unwrap();
        let mut live = view.read(None, None);
        live.next().await.unwrap().unwrap();
        let first = view.append(Bytes::new(), None).await.unwrap();
        let second = view.append(Bytes::new(), None).await.unwrap();
        assert!(matches!(
            live.next().await,
            Some(Ok(MonitoredStreamItem::Item(_)))
        ));
        assert_eq!(live.progress().previous, Some(first.id()));
        assert_eq!(live.progress().latest_known, Some(second.id()));
        assert_eq!(live.progress().status, MonitoredStreamStatus::FallenBehind);
        live.next().await.unwrap().unwrap();
        assert_eq!(live.progress().previous, live.progress().latest_known);
        assert_eq!(
            live.progress().status,
            MonitoredStreamStatus::AwaitingNewItems
        );
        storage.flush().await.unwrap();
        drop((live, view));
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn file_conformance() {
        let root = root();
        let storage = Factory::open(&root, false).unwrap();
        sea_conformance::run_view_conformance(&storage).await;
        sea_conformance::run_snapshot_archive_conformance(&storage).await;
        storage.shutdown().await.unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn raw_event_dependencies_fail_recovery_and_foreign_handles_are_rejected() {
        let root = root();
        let storage = Factory::open(&root, false).unwrap();
        let created = storage.create_document().await.unwrap();
        let (_, other) = storage.create_view().await.unwrap();
        let foreign = other
            .blobs()
            .put_blob(Bytes::from_static(b"same"))
            .await
            .unwrap();
        created
            .components
            .blobs
            .put_blob(Bytes::from_static(b"same"))
            .await
            .unwrap();
        assert!(
            created
                .components
                .blobs
                .ensure_available(&foreign)
                .await
                .is_err()
        );
        created
            .components
            .events
            .append(Event {
                payload: Bytes::new(),
                blob_tree: Some(BlobTreeId::Blob(BlobId::for_bytes(b"missing"))),
            })
            .await
            .unwrap();
        storage.flush().await.unwrap();
        drop(created.components);
        assert!(matches!(
            storage.open_document(&created.id).await,
            Err(FileStorageError::Corrupt(_))
        ));
        drop(other);
        fs::remove_dir_all(root).unwrap();
    }
}
