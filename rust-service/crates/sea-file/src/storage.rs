//! Document components over one exclusive dependency-ordered file journal.
//!
//! [`crate::storage::FileStorage`] allocates numeric document identities below a canonical namespace
//! and opens one OS-locked journal per document. Blob, event, and snapshot components share that
//! opening and its mutation order. Availability handles retain canonical-path provenance but no
//! writer ownership; components and streams retain the opening until dropped.
//!
//! Journal records publish immutable content before referencing events and events before
//! snapshots. Recovery validates framing, transitive content closure, a dense event prefix, and
//! strictly advancing snapshot positions before exposing any component. Raw event components keep
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
    index::{Index, Key},
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
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, MutexGuard, Weak,
        atomic::{AtomicBool, Ordering},
    },
    task::Poll,
};

/// Directory-backed factory; durable mode synchronizes each mutation group and namespace creation.
#[derive(Clone, Debug)]
pub struct FileStorage<const DURABLE: bool = false> {
    /// Canonical namespace, also used to establish handle provenance across openings.
    root: PathBuf,
}

impl<const DURABLE: bool> FileStorage<DURABLE> {
    /// Opens or creates a document namespace.
    ///
    /// # Errors
    /// Returns filesystem failures, including namespace synchronization failures.
    pub fn open(root: impl AsRef<Path>) -> Result<Self, FileStorageError> {
        fs::create_dir_all(root.as_ref())?;
        let root = fs::canonicalize(root)?;
        if DURABLE {
            sync_namespace(&root, |directory| fs::File::open(directory)?.sync_all())?;
        }
        Ok(Self { root })
    }

    /// Builds components only after all recovered records satisfy dependency closure.
    fn components(
        path: PathBuf,
        mut journal: Journal,
        records: Vec<Vec<u8>>,
    ) -> Result<StorageComponents<FileBlobs, FileEvents, FileSnapshots>, FileStorageError> {
        let index = journal.index.take();
        let mut boundary = index.as_ref().map_or(8, |index| index.boundary);
        let mut state = State::new(index, journal.reader()?)?;
        for record in records {
            state.recover_record(&record, boundary)?;
            boundary += 48 + record.len() as u64;
        }
        let opening = Arc::new(Opening {
            path: Arc::new(path),
            journal: Mutex::new(journal),
            failed: AtomicBool::new(false),
            state: Mutex::new(state),
        });
        Ok(StorageComponents {
            blobs: FileBlobs(opening.clone()),
            events: FileEvents(opening.clone()),
            snapshots: FileSnapshots(opening),
        })
    }
}

#[async_trait]
impl<const DURABLE: bool> SeaStorage for FileStorage<DURABLE> {
    type Error = FileStorageError;
    type Blobs = FileBlobs;
    type Events = FileEvents;
    type Snapshots = FileSnapshots;

    fn durability(&self) -> Durability {
        if DURABLE {
            Durability::Durable
        } else {
            Durability::Buffered
        }
    }

    async fn create_document(
        &self,
    ) -> Result<CreatedDocument<FileBlobs, FileEvents, FileSnapshots>, Self::Error> {
        for ordinal in 1_u64.. {
            let path = self.root.join(format!("{ordinal:016x}.sea"));
            match Journal::open(&path, true, DURABLE) {
                Ok((journal, records)) => {
                    if DURABLE {
                        fs::File::open(&self.root)?.sync_all()?;
                    }
                    let components = Self::components(path, journal, records)?;
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

    async fn open_document(
        &self,
        id: &DocumentId,
    ) -> Result<Option<StorageComponents<FileBlobs, FileEvents, FileSnapshots>>, Self::Error> {
        let Ok(bytes) = <[u8; 8]>::try_from(id.as_bytes().as_ref()) else {
            return Ok(None);
        };
        let path = self
            .root
            .join(format!("{:016x}.sea", u64::from_be_bytes(bytes)));
        match Journal::open(&path, false, DURABLE) {
            Ok((journal, records)) => Self::components(path, journal, records).map(Some),
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
    /// Document provenance for minted handles.
    path: Arc<PathBuf>,
    /// Serializes mutations; acquired before the published-state mutex.
    journal: Mutex<Journal>,
    /// Refuses observations after uncertain I/O or a failed worker.
    failed: AtomicBool,
    /// Published dependency-closed state; event disk I/O never holds this mutex.
    state: Mutex<State>,
}

impl Opening {
    /// Fails closed and notifies readers even when a worker panics after cancellation.
    fn poison(&self) {
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
struct State {
    /// Historical lookup entries, read lazily from a published immutable index.
    index: Option<Index>,
    /// Addresses appended since the published index boundary.
    addresses: BTreeMap<Key, u64>,
    /// Independent journal cursor for addressed reads, never shared with the writer.
    reader: Mutex<fs::File>,
    /// Last committed dense event position, with zero representing an empty archive.
    head: u64,
    /// Last application snapshot position, with zero representing no snapshots.
    snapshot_head: u64,
    /// Opaque internal metadata independent of application snapshot publication.
    checkpoint: Vec<u8>,
    /// Raw event writes with unavailable dependencies must never become trusted indexed history.
    invalid_dependency: bool,
    /// Weak wake registrations pruned on mutation and reader initialization.
    readers: Vec<Weak<AtomicWaker>>,
}

impl State {
    /// Restores constant-size archive heads and internal metadata without scanning old addresses.
    fn new(index: Option<Index>, reader: fs::File) -> Result<Self, FileStorageError> {
        let (head, snapshot_head, checkpoint) = if let Some(index) = &index {
            if index.metadata.len() < 16 {
                return Err(FileStorageError::Corrupt("storage checkpoint metadata"));
            }
            let head = u64::from_be_bytes(index.metadata[..8].try_into().unwrap());
            let snapshot_head = u64::from_be_bytes(index.metadata[8..16].try_into().unwrap());
            if snapshot_head > head {
                return Err(FileStorageError::Corrupt("checkpoint snapshot head"));
            }
            (head, snapshot_head, index.metadata[16..].to_vec())
        } else {
            (0, 0, Vec::new())
        };
        Ok(Self {
            index,
            addresses: BTreeMap::new(),
            reader: Mutex::new(reader),
            head,
            snapshot_head,
            checkpoint,
            invalid_dependency: false,
            readers: Vec::new(),
        })
    }

    /// Resolves recent or historical lookup state without loading payloads.
    fn address(&self, key: &Key) -> Result<Option<u64>, FileStorageError> {
        if let Some(offset) = self.addresses.get(key) {
            return Ok(Some(*offset));
        }
        Ok(match &self.index {
            Some(index) => index
                .lower_bound(key)?
                .filter(|(found, _)| found == key)
                .map(|(_, offset)| offset),
            None => None,
        })
    }

    /// Fetches a complete checked frame by logical identity.
    fn record(&self, key: &Key) -> Result<Option<Vec<u8>>, FileStorageError> {
        let Some(offset) = self.address(key)? else {
            return Ok(None);
        };
        let mut reader = self
            .reader
            .lock()
            .map_err(|_| FileStorageError::Ambiguous)?;
        let record = read_record(&mut reader, offset)?;
        if record_key(&record)? != *key {
            return Err(FileStorageError::Corrupt("indexed record identity"));
        }
        Ok(Some(record))
    }

    /// Selects the next archive position across the immutable index and recent addresses.
    fn next(
        &self,
        category: u8,
        after: Option<EventPosition>,
    ) -> Result<Option<EventPosition>, FileStorageError> {
        let Some(ordinal) = after.map_or(Some(1), |position| position.get().checked_add(1)) else {
            return Ok(None);
        };
        let key = position_key(category, EventPosition::new(ordinal));
        let recent = self.addresses.range(key..).next().map(|(key, _)| *key);
        let indexed = match &self.index {
            Some(index) => index.lower_bound(&key)?.map(|(key, _)| key),
            None => None,
        };
        Ok(recent
            .into_iter()
            .chain(indexed)
            .filter(|key| key[0] == category)
            .min()
            .map(key_position))
    }

    /// Selects the newest entry at or below a position from both lookup layers.
    fn floor(
        &self,
        category: u8,
        through: Option<EventPosition>,
    ) -> Result<Option<EventPosition>, FileStorageError> {
        let key = position_key(category, through.unwrap_or(EventPosition::new(u64::MAX)));
        let recent = self
            .addresses
            .range(..=key)
            .next_back()
            .map(|(key, _)| *key);
        let indexed = match &self.index {
            Some(index) => index.floor(&key)?.map(|(key, _)| key),
            None => None,
        };
        Ok(recent
            .into_iter()
            .chain(indexed)
            .filter(|key| key[0] == category)
            .max()
            .map(key_position))
    }

    /// Fetches an event only when an archive reader requests it.
    fn event(&self, position: EventPosition) -> Result<CommittedEvent, FileStorageError> {
        let record = self
            .record(&position_key(3, position))?
            .ok_or(FileStorageError::Corrupt("missing indexed event"))?;
        decode_event(&record)
    }

    /// Fetches an application snapshot root without traversing prior snapshot history.
    fn snapshot(&self, position: EventPosition) -> Result<Option<BlobTreeId>, FileStorageError> {
        self.record(&position_key(4, position))?
            .map(|record| decode_tree(&record[9..]))
            .transpose()
    }

    /// Merges lookup addresses and atomically advances the discoverable recovery boundary.
    fn publish(&mut self, journal: &mut Journal) -> Result<(), FileStorageError> {
        if self.invalid_dependency {
            return Err(FileStorageError::Corrupt("event dependency"));
        }
        let mut metadata = self.head.to_be_bytes().to_vec();
        metadata.extend_from_slice(&self.snapshot_head.to_be_bytes());
        metadata.extend_from_slice(&self.checkpoint);
        let mut old = self.index.iter().flat_map(Index::iter).peekable();
        let mut recent = self.addresses.iter().peekable();
        let entries = std::iter::from_fn(|| {
            if old.peek().is_some_and(Result::is_err) {
                return old.next();
            }
            match (old.peek(), recent.peek()) {
                (Some(Ok((old_key, _))), Some((new_key, _))) if old_key < *new_key => old.next(),
                (Some(Ok((old_key, _))), Some((new_key, _))) if old_key == *new_key => {
                    old.next();
                    recent.next().map(|(key, offset)| Ok((*key, *offset)))
                }
                (_, Some(_)) => recent.next().map(|(key, offset)| Ok((*key, *offset))),
                (Some(_), None) => old.next(),
                (None, None) => None,
            }
        });
        let index = journal.checkpoint(&metadata, entries)?;
        drop(old);
        drop(recent);
        self.index = Some(index);
        self.addresses.clear();
        Ok(())
    }

    /// Membership implies transitive closure for immutable published directories.
    fn contains(&self, id: BlobTreeId) -> Result<bool, FileStorageError> {
        Ok(self.address(&tree_key(id))?.is_some())
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
                if body.len() < 9 {
                    return Err(FileStorageError::Corrupt("event encoding"));
                }
                let position =
                    EventPosition::new(u64::from_be_bytes(body[..8].try_into().unwrap()));
                let (blob_tree, payload) = if body[8] == 0 {
                    (None, &body[9..])
                } else if body[8] == 1 && body.len() >= 42 {
                    (Some(decode_tree(&body[9..42])?), &body[42..])
                } else {
                    return Err(FileStorageError::Corrupt("event tree"));
                };
                if self.head.checked_add(1) != Some(position.get()) {
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
                    || position.get() > self.head
                    || !self.contains(root)?
                {
                    return Err(FileStorageError::Corrupt("snapshot order or dependency"));
                }
                self.snapshot_head = position.get();
            }
            _ => return Err(FileStorageError::Corrupt("record tag")),
        }
        self.addresses.insert(record_key(record)?, offset);
        Ok(())
    }
}

/// Forms a fixed-width key whose byte ordering matches event ordering.
fn position_key(category: u8, position: EventPosition) -> Key {
    let mut key = [0; 33];
    key[0] = category;
    key[25..].copy_from_slice(&position.get().to_be_bytes());
    key
}

/// Recovers the position encoded in an archive index key.
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
    if record.len() < 10 || record[0] != 3 {
        return Err(FileStorageError::Corrupt("event encoding"));
    }
    let position = EventPosition::new(u64::from_be_bytes(record[1..9].try_into().unwrap()));
    let (blob_tree, payload) = match record[9] {
        0 => (None, &record[10..]),
        1 if record.len() >= 43 => (Some(decode_tree(&record[10..43])?), &record[43..]),
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
        Ok(self.0.lock()?.contains(id)?.then(|| self.0.handle(id)))
    }
    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), Self::Error> {
        self.0.compatible(handle)?;
        if self.0.lock()?.contains(handle.id)? {
            Ok(())
        } else {
            Err(FileStorageError::Rejected("missing tree"))
        }
    }
}

#[async_trait]
impl BlobStore for FileBlobs {
    async fn put_blob(&self, payload: Bytes) -> Result<Self::Handle, Self::Error> {
        let id = BlobId::for_bytes(&payload);
        let mut journal = self.0.writer()?;
        let state = self.0.lock()?;
        if !state.contains(BlobTreeId::Blob(id))? {
            let mut record = vec![1];
            record.extend_from_slice(&payload);
            drop(persist(&self.0, &mut journal, state, &record)?);
        }
        Ok(self.0.handle(BlobTreeId::Blob(id)))
    }
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        let record = self
            .0
            .lock()?
            .record(&tree_key(BlobTreeId::Blob(id)))?
            .ok_or(FileStorageError::Rejected("missing blob"))?;
        Ok(Bytes::copy_from_slice(&record[1..]))
    }
    async fn put_directory(&self, directory: BlobDirectory) -> Result<Self::Handle, Self::Error> {
        let (encoded, id) = directory
            .encode_with_id()
            .map_err(|_| FileStorageError::Rejected("directory encoding"))?;
        if self.0.lock()?.contains(BlobTreeId::Directory(id))? {
            return Ok(self.0.handle(BlobTreeId::Directory(id)));
        }
        // Release the fast-path state lock before waiting for the journal.
        // Writers acquire journal before state; reversing that order can deadlock with event publication.
        // Leaving state unlocked also lets reads and deduplication proceed during event disk I/O.
        // Recheck membership below because another writer may publish this directory while we wait.
        let mut journal = self.0.writer()?;
        let state = self.0.lock()?;
        if !state.contains(BlobTreeId::Directory(id))? {
            for child in directory.entries().values() {
                if !state.contains(*child)? {
                    return Err(FileStorageError::Rejected("missing directory child"));
                }
            }
            let mut record = vec![2];
            record.extend_from_slice(&encoded);
            drop(persist(&self.0, &mut journal, state, &record)?);
        }
        Ok(self.0.handle(BlobTreeId::Directory(id)))
    }
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        let record = self
            .0
            .lock()?
            .record(&tree_key(BlobTreeId::Directory(id)))?
            .ok_or(FileStorageError::Rejected("missing directory"))?;
        BlobDirectory::decode(&record[1..])
            .map_err(|_| FileStorageError::Corrupt("directory encoding"))
    }
}

#[async_trait]
impl ReferenceableStore for FileEvents {
    type Id = EventPosition;
    type Handle = FileHandle<EventPosition>;
    async fn resolve(&self, id: Self::Id) -> Result<Option<Self::Handle>, Self::Error> {
        Ok((id.get() != 0 && id.get() <= self.0.lock()?.head).then(|| self.0.handle(id)))
    }
    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), Self::Error> {
        self.0.compatible(handle)?;
        if handle.id.get() != 0 && handle.id.get() <= self.0.lock()?.head {
            Ok(())
        } else {
            Err(FileStorageError::Rejected("missing event"))
        }
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
        let count = values.len();
        let events = self.clone();
        if let Ok(results) = tokio::task::spawn_blocking(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                events.append_batch_blocking(&values)
            }));
            match result {
                Ok(results) => results,
                Err(panic) => {
                    events.0.poison();
                    std::panic::resume_unwind(panic);
                }
            }
        })
        .await
        {
            results
        } else {
            self.0.poison();
            (0..count)
                .map(|_| Err(FileStorageError::Ambiguous))
                .collect()
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
        let state = match self.0.lock() {
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
        if head.checked_add(values.len() as u64).is_none() {
            return vec![Err(FileStorageError::Rejected("event positions exhausted"))];
        }
        let records: Vec<Vec<u8>> = values
            .iter()
            .enumerate()
            .map(|(index, event)| {
                let ordinal = head + index as u64 + 1;
                let mut record = vec![3];
                record.extend_from_slice(&ordinal.to_be_bytes());
                record.push(u8::from(event.blob_tree.is_some()));
                if let Some(root) = event.blob_tree {
                    encode_tree(&mut record, root);
                }
                record.extend_from_slice(&event.payload);
                record
            })
            .collect();
        let payloads: Vec<&[u8]> = records.iter().map(Vec::as_slice).collect();
        let mut offset = match journal.boundary() {
            Ok(offset) => offset,
            Err(error) => return vec![Err(error)],
        };
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
            .enumerate()
            .map(|(index, record)| {
                let position = EventPosition::new(head + index as u64 + 1);
                state.addresses.insert(position_key(3, position), offset);
                offset += 48 + record.len() as u64;
                state.head = position.get();
                Ok(self.0.handle(position))
            })
            .collect::<Vec<_>>();
        if state.addresses.len() >= 256 && state.publish(&mut journal).is_err() {
            drop(state);
            drop(journal);
            self.0.poison();
            return (0..results.len())
                .map(|_| Err(FileStorageError::Ambiguous))
                .collect();
        }
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
        self.0.compatible(&snapshot.root)?;
        self.0.compatible(&snapshot.at_event)?;
        let mut journal = self.0.writer()?;
        let mut state = self.0.lock()?;
        let position = snapshot.at_event.id;
        if !state.contains(snapshot.root.id)? || position.get() == 0 || position.get() > state.head
        {
            return Err(FileStorageError::Rejected("snapshot dependency"));
        }
        if state.snapshot_head >= position.get() {
            return Err(FileStorageError::Rejected("snapshot must advance"));
        }
        let mut record = vec![4];
        record.extend_from_slice(&position.get().to_be_bytes());
        encode_tree(&mut record, snapshot.root.id);
        state = persist(&self.0, &mut journal, state, &record)?;
        let readers = state.readers();
        drop(state);
        for reader in readers {
            reader.wake();
        }
        Ok(())
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
                    .ok_or(FileStorageError::Corrupt("missing indexed snapshot"))?;
                Ok(opening.snapshot(position, root))
            },
        )
    }
    async fn head(&self) -> Result<Option<EventPosition>, Self::Error> {
        Ok(nonzero_position(self.0.lock()?.snapshot_head))
    }
}

#[async_trait]
impl SnapshotArchive for FileSnapshots {
    type BlobHandle = FileHandle<BlobTreeId>;
    type EventHandle = FileHandle<EventPosition>;
    async fn checkpoint(&self) -> Result<Option<Bytes>, Self::Error> {
        let state = self.0.lock()?;
        Ok((!state.checkpoint.is_empty()).then(|| Bytes::copy_from_slice(&state.checkpoint)))
    }
    async fn publish_checkpoint(&self, checkpoint: Bytes) -> Result<(), Self::Error> {
        if checkpoint.is_empty() {
            return Err(FileStorageError::Rejected("empty internal checkpoint"));
        }
        let mut journal = self.0.writer()?;
        let mut state = self.0.lock()?;
        state.checkpoint = checkpoint.to_vec();
        if let Err(error) = state.publish(&mut journal) {
            drop(state);
            drop(journal);
            self.0.poison();
            return Err(error);
        }
        Ok(())
    }
    async fn get_snapshot_at(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::Item>, Self::Error> {
        Ok(self
            .0
            .lock()?
            .snapshot(position)?
            .map(|root| self.0.snapshot(position, root)))
    }
    async fn latest_at_or_before(
        &self,
        position: Option<EventPosition>,
    ) -> Result<Option<Self::Item>, Self::Error> {
        let state = self.0.lock()?;
        let Some(position) = state.floor(4, position)? else {
            return Ok(None);
        };
        Ok(state
            .snapshot(position)?
            .map(|root| self.0.snapshot(position, root)))
    }
}

/// Releases the mutation lock before notifying readers of an uncertain write.
fn persist<'state>(
    opening: &Opening,
    journal: &mut Journal,
    mut state: MutexGuard<'state, State>,
    record: &[u8],
) -> Result<MutexGuard<'state, State>, FileStorageError> {
    let offset = journal.boundary()?;
    let result = journal.append(record).and_then(|()| {
        state.recover_record(record, offset)?;
        if state.addresses.len() >= 256 {
            state.publish(journal)?;
        }
        Ok(())
    });
    if let Err(error) = result {
        if matches!(error, FileStorageError::Ambiguous) {
            opening.failed.store(true, Ordering::Release);
        }
        let readers = state.readers();
        drop(state);
        for reader in readers {
            reader.wake();
        }
        return Err(error);
    }
    Ok(state)
}

/// Creates a lazy read retaining the opening, with notifications registered under the mutation lock.
fn read<Item: Send + 'static>(
    opening: Arc<Opening>,
    after: Option<EventPosition>,
    stop: Option<EventPosition>,
    category: u8,
    convert: fn(&Opening, &State, EventPosition) -> Result<Item, FileStorageError>,
) -> ArchiveStream<Item, EventPosition, FileStorageError> {
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
    Box::pin(FileRead {
        source: Box::pin(source),
        observation,
    })
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
    async fn indexed_reopen_keeps_history_lazy_and_internal_state_independent() {
        use std::io::{Seek, SeekFrom, Write};
        let root = root();
        let storage = FileStorage::<true>::open(&root).unwrap();
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
            .snapshots
            .publish_checkpoint(Bytes::from_static(b"internal"))
            .await
            .unwrap();
        assert_eq!(created.components.snapshots.head().await.unwrap(), None);
        created
            .components
            .events
            .append(batch().remove(0))
            .await
            .unwrap();
        drop(created.components);
        let components = storage.open_document(&id).await.unwrap().unwrap();
        assert_eq!(components.events.0.lock().unwrap().addresses.len(), 1);
        assert_eq!(
            components.events.head().await.unwrap(),
            Some(EventPosition::new(521))
        );
        assert_eq!(
            components.snapshots.checkpoint().await.unwrap().unwrap(),
            b"internal"[..]
        );
        let BlobTreeId::Blob(blob_id) = blob.id() else {
            panic!("leaf expected")
        };
        assert_eq!(
            components.blobs.get_blob(blob_id).await.unwrap(),
            b"old payload"[..]
        );
        let mut history = components.events.read(None, Some(EventPosition::new(521)));
        let mut count = 0;
        while let Some(item) = history.next().await {
            if matches!(item.unwrap(), MonitoredStreamItem::Item(_)) {
                count += 1;
            }
        }
        assert_eq!(count, 521);
        let path = components.events.0.path.as_ref().clone();
        drop((history, components));
        let mut file = fs::OpenOptions::new().write(true).open(&path).unwrap();
        file.seek(SeekFrom::Start(8 + 48 + 1)).unwrap();
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
        let storage = FileStorage::<DURABLE>::open(&root).unwrap();
        let created = storage.create_document().await.unwrap();
        let blobs = &created.components.blobs;
        let leaf = blobs.put_blob(Bytes::from_static(b"leaf")).await.unwrap();
        let directory =
            BlobDirectory::new(BTreeMap::from([("leaf".to_owned(), leaf.id())])).unwrap();
        let original = blobs.put_directory(directory.clone()).await.unwrap();
        let components = if indexed {
            created
                .components
                .snapshots
                .publish_checkpoint(Bytes::from_static(b"deduplication checkpoint"))
                .await
                .unwrap();
            drop(created.components);
            let components = storage.open_document(&created.id).await.unwrap().unwrap();
            {
                let state = components.blobs.0.lock().unwrap();
                assert!(state.index.is_some());
                assert!(state.addresses.is_empty());
            }
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
        let storage = FileStorage::<true>::open(&root).unwrap();
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
        let storage = FileStorage::<true>::open(&root).unwrap();
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
        check_blocked_batch::<false>().await;
        check_blocked_batch::<true>().await;
    }

    /// Checks off-executor writes and prefix visibility under both durability policies.
    async fn check_blocked_batch<const DURABLE: bool>() {
        let root = root();
        let storage = FileStorage::<DURABLE>::open(&root).unwrap();
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
        assert!(results.into_iter().all(|result| result.is_ok()));
        assert_eq!(counter.0.load(Ordering::Relaxed), 1);
        assert_eq!(events.head().await.unwrap(), Some(EventPosition::new(3)));
        assert!(
            matches!(live.next().await, Some(Ok(MonitoredStreamItem::Item(event))) if event.position.get() == 2)
        );
        drop((live, events, created));
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn cancelled_batch_retains_opening_until_worker_settles() {
        let root = root();
        let storage = FileStorage::<true>::open(&root).unwrap();
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
            Some(EventPosition::new(2))
        );
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn worker_panic_poisons_observations_and_wakes_readers_even_after_cancellation() {
        for cancelled in [false, true] {
            let root = root();
            let storage = FileStorage::<true>::open(&root).unwrap();
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
                Some(EventPosition::new(2))
            );
            drop(reopened);
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[tokio::test]
    async fn event_batch_publishes_dense_history_with_one_sync() {
        let root = root();
        let storage = FileStorage::<true>::open(&root).unwrap();
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
            assert_eq!(result.unwrap().id().get(), index as u64 + 1);
        }
        assert_eq!(events.0.writer().unwrap().syncs, 1);
        assert!(events.append_batch(Vec::new()).await.is_empty());
        assert_eq!(events.0.writer().unwrap().syncs, 1);
        for ordinal in 1..=2 {
            assert!(matches!(
                live.next().await,
                Some(Ok(MonitoredStreamItem::Item(event))) if event.position.get() == ordinal
            ));
        }
        drop((live, created.components));
        let view = storage.open_view(&created.id).await.unwrap().unwrap();
        assert_eq!(view.head().await.unwrap(), Some(EventPosition::new(2)));
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
            let storage = FileStorage::<true>::open(&root).unwrap();
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
                Some(EventPosition::new(2))
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
        let storage = FileStorage::<true>::open(&root).unwrap();
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
        assert_eq!(counter.0.load(Ordering::Relaxed), 1);
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
        assert_eq!(counter.0.load(Ordering::Relaxed), 2);
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
        let storage = FileStorage::<DURABLE>::open(&root).unwrap();
        let created = storage.create_document().await.unwrap();
        let events = &created.components.events;
        let first = events
            .append(Event {
                payload: Bytes::from_static(b"first"),
                blob_tree: None,
            })
            .await
            .unwrap();
        events.0.writer().unwrap().inject(fault);
        let error = events
            .append(Event {
                payload: Bytes::from_static(b"second"),
                blob_tree: None,
            })
            .await
            .unwrap_err();
        if let JournalFault::BeforeWrite = fault {
            assert!(matches!(error, FileStorageError::Rejected(_)));
            assert_eq!(events.head().await.unwrap(), Some(first.id()));
        } else {
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
                2
            } else {
                1
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
        let storage = FileStorage::<true>::open(&root).unwrap();
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
            .writer()
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
        let storage = FileStorage::<false>::open(&root).unwrap();
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
        drop((live, view));
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn file_conformance() {
        let root = root();
        let storage = FileStorage::<false>::open(&root).unwrap();
        sea_conformance::run_view_conformance(&storage).await;
        sea_conformance::run_snapshot_archive_conformance(&storage).await;
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn raw_event_dependencies_fail_recovery_and_foreign_handles_are_rejected() {
        let root = root();
        let storage = FileStorage::<false>::open(&root).unwrap();
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
        drop(created.components);
        assert!(matches!(
            storage.open_document(&created.id).await,
            Err(FileStorageError::Corrupt(_))
        ));
        drop(other);
        fs::remove_dir_all(root).unwrap();
    }
}
