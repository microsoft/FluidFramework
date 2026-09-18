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
//! Reads initialize lazily, register wakeups under the mutation lock, and preserve exclusive-lower
//! and inclusive-upper archive bounds. Filesystem operations are synchronous inside their async
//! methods: there is no detached work or automatic retry. An uncertain journal write terminates
//! authoritative observations until reopening and recovery.

pub use crate::journal::FileStorageError;
use crate::journal::Journal;
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
    sync::{Arc, Mutex, MutexGuard, Weak},
    task::Poll,
};

/// Directory-backed document factory; durable mode synchronizes each record and namespace creation.
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
            for ancestor in root.ancestors() {
                fs::File::open(ancestor)?.sync_all()?;
            }
        }
        Ok(Self { root })
    }

    /// Builds components only after all recovered records satisfy dependency closure.
    fn components(
        path: PathBuf,
        journal: Journal,
        records: Vec<Vec<u8>>,
    ) -> Result<StorageComponents<FileBlobs, FileEvents, FileSnapshots>, FileStorageError> {
        let mut state = State {
            journal,
            blobs: BTreeMap::new(),
            directories: BTreeMap::new(),
            events: BTreeMap::new(),
            snapshots: BTreeMap::new(),
            readers: Vec::new(),
        };
        for record in records {
            state.recover_record(&record)?;
        }
        let opening = Arc::new(Opening {
            path: Arc::new(path),
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

/// Shared writer ownership retained by components and reads, not availability handles.
struct Opening {
    /// Document provenance for minted handles.
    path: Arc<PathBuf>,
    /// Serializes all journal mutations and observations.
    state: Mutex<State>,
}

impl Opening {
    /// Acquires a usable state or refuses uncertain journal observations.
    fn lock(&self) -> Result<MutexGuard<'_, State>, FileStorageError> {
        let state = self.state.lock().map_err(|_| FileStorageError::Ambiguous)?;
        state.journal.ready()?;
        Ok(state)
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
    /// Exclusive persistent writer.
    journal: Journal,
    /// Verified leaves, indexed by content identity.
    blobs: BTreeMap<BlobId, Bytes>,
    /// Immutable directories whose children were available at publication.
    directories: BTreeMap<BlobDirectoryId, BlobDirectory>,
    /// Full dense event prefix.
    events: BTreeMap<EventPosition, CommittedEvent>,
    /// Sparse snapshot positions and roots, without self-owned handles.
    snapshots: BTreeMap<EventPosition, BlobTreeId>,
    /// Weak wake registrations pruned on mutation and reader initialization.
    readers: Vec<Weak<AtomicWaker>>,
}

impl State {
    /// Membership implies transitive closure for immutable published directories.
    fn contains(&self, id: BlobTreeId) -> bool {
        match id {
            BlobTreeId::Blob(id) => self.blobs.contains_key(&id),
            BlobTreeId::Directory(id) => self.directories.contains_key(&id),
        }
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
    fn recover_record(&mut self, record: &[u8]) -> Result<(), FileStorageError> {
        let Some((&tag, body)) = record.split_first() else {
            return Err(FileStorageError::Corrupt("empty record"));
        };
        match tag {
            1 => {
                self.blobs
                    .insert(BlobId::for_bytes(body), Bytes::copy_from_slice(body));
            }
            2 => {
                let directory = BlobDirectory::decode(body)
                    .map_err(|_| FileStorageError::Corrupt("directory encoding"))?;
                if directory
                    .entries()
                    .values()
                    .any(|child| !self.contains(*child))
                {
                    return Err(FileStorageError::Corrupt("directory dependency"));
                }
                let id = directory
                    .id()
                    .map_err(|_| FileStorageError::Corrupt("directory identity"))?;
                self.directories.insert(id, directory);
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
                if position.get() != self.events.len() as u64 + 1
                    || blob_tree.is_some_and(|root| !self.contains(root))
                {
                    return Err(FileStorageError::Corrupt("event position or dependency"));
                }
                self.events.insert(
                    position,
                    CommittedEvent {
                        position,
                        event: Event {
                            payload: Bytes::copy_from_slice(payload),
                            blob_tree,
                        },
                    },
                );
            }
            4 => {
                if body.len() != 41 {
                    return Err(FileStorageError::Corrupt("snapshot encoding"));
                }
                let position =
                    EventPosition::new(u64::from_be_bytes(body[..8].try_into().unwrap()));
                let root = decode_tree(&body[8..])?;
                if self
                    .snapshots
                    .last_key_value()
                    .is_some_and(|(head, _)| *head >= position)
                    || !self.events.contains_key(&position)
                    || !self.contains(root)
                {
                    return Err(FileStorageError::Corrupt("snapshot order or dependency"));
                }
                self.snapshots.insert(position, root);
            }
            _ => return Err(FileStorageError::Corrupt("record tag")),
        }
        Ok(())
    }
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
        Ok(self.0.lock()?.contains(id).then(|| self.0.handle(id)))
    }
    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), Self::Error> {
        self.0.compatible(handle)?;
        if self.0.lock()?.contains(handle.id) {
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
        let mut state = self.0.lock()?;
        if !state.blobs.contains_key(&id) {
            let mut record = vec![1];
            record.extend_from_slice(&payload);
            state = persist(state, &record)?;
            state.blobs.insert(id, payload);
        }
        Ok(self.0.handle(BlobTreeId::Blob(id)))
    }
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        self.0
            .lock()?
            .blobs
            .get(&id)
            .cloned()
            .ok_or(FileStorageError::Rejected("missing blob"))
    }
    async fn put_directory(&self, directory: BlobDirectory) -> Result<Self::Handle, Self::Error> {
        let encoded = directory
            .encode()
            .map_err(|_| FileStorageError::Rejected("directory encoding"))?;
        let id = directory
            .id()
            .map_err(|_| FileStorageError::Rejected("directory identity"))?;
        let mut state = self.0.lock()?;
        if directory
            .entries()
            .values()
            .any(|child| !state.contains(*child))
        {
            return Err(FileStorageError::Rejected("missing directory child"));
        }
        if !state.directories.contains_key(&id) {
            let mut record = vec![2];
            record.extend_from_slice(&encoded);
            state = persist(state, &record)?;
            state.directories.insert(id, directory);
        }
        Ok(self.0.handle(BlobTreeId::Directory(id)))
    }
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.0
            .lock()?
            .directories
            .get(&id)
            .cloned()
            .ok_or(FileStorageError::Rejected("missing directory"))
    }
}

#[async_trait]
impl ReferenceableStore for FileEvents {
    type Id = EventPosition;
    type Handle = FileHandle<EventPosition>;
    async fn resolve(&self, id: Self::Id) -> Result<Option<Self::Handle>, Self::Error> {
        Ok(self
            .0
            .lock()?
            .events
            .contains_key(&id)
            .then(|| self.0.handle(id)))
    }
    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), Self::Error> {
        self.0.compatible(handle)?;
        if self.0.lock()?.events.contains_key(&handle.id) {
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
        let mut state = self.0.lock()?;
        let ordinal = (state.events.len() as u64)
            .checked_add(1)
            .ok_or(FileStorageError::Rejected("event positions exhausted"))?;
        let position = EventPosition::new(ordinal);
        let mut record = vec![3];
        record.extend_from_slice(&ordinal.to_be_bytes());
        record.push(u8::from(event.blob_tree.is_some()));
        if let Some(root) = event.blob_tree {
            encode_tree(&mut record, root);
        }
        record.extend_from_slice(&event.payload);
        state = persist(state, &record)?;
        let replaced = state
            .events
            .insert(position, CommittedEvent { position, event });
        assert!(replaced.is_none(), "new event position must be vacant");
        let readers = state.readers();
        drop(state);
        for reader in readers {
            reader.wake();
        }
        Ok(self.0.handle(position))
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
            |state| &state.events,
            |_, _, event| event.clone(),
        )
    }
    async fn head(&self) -> Result<Option<EventPosition>, Self::Error> {
        Ok(self
            .0
            .lock()?
            .events
            .last_key_value()
            .map(|(position, _)| *position))
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
        let mut state = self.0.lock()?;
        let position = snapshot.at_event.id;
        if !state.contains(snapshot.root.id) || !state.events.contains_key(&position) {
            return Err(FileStorageError::Rejected("snapshot dependency"));
        }
        if state
            .snapshots
            .last_key_value()
            .is_some_and(|(head, _)| *head >= position)
        {
            return Err(FileStorageError::Rejected("snapshot must advance"));
        }
        let mut record = vec![4];
        record.extend_from_slice(&position.get().to_be_bytes());
        encode_tree(&mut record, snapshot.root.id);
        state = persist(state, &record)?;
        let replaced = state.snapshots.insert(position, snapshot.root.id);
        assert!(replaced.is_none(), "new snapshot position must be vacant");
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
            |state| &state.snapshots,
            |opening, position, root| opening.snapshot(position, *root),
        )
    }
    async fn head(&self) -> Result<Option<EventPosition>, Self::Error> {
        Ok(self
            .0
            .lock()?
            .snapshots
            .last_key_value()
            .map(|(position, _)| *position))
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
        Ok(self
            .0
            .lock()?
            .snapshots
            .get(&position)
            .map(|root| self.0.snapshot(position, *root)))
    }
    async fn latest_at_or_before(
        &self,
        position: Option<EventPosition>,
    ) -> Result<Option<Self::Item>, Self::Error> {
        let state = self.0.lock()?;
        let upper = position.map_or(std::ops::Bound::Unbounded, std::ops::Bound::Included);
        Ok(state
            .snapshots
            .range((std::ops::Bound::Unbounded, upper))
            .next_back()
            .map(|(position, root)| self.0.snapshot(*position, *root)))
    }
}

/// Releases the mutation lock before notifying readers of an uncertain write.
fn persist<'state>(
    mut state: MutexGuard<'state, State>,
    record: &[u8],
) -> Result<MutexGuard<'state, State>, FileStorageError> {
    if let Err(error) = state.journal.append(record) {
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
fn read<Stored: 'static, Item: Send + 'static>(
    opening: Arc<Opening>,
    after: Option<EventPosition>,
    stop: Option<EventPosition>,
    entries: fn(&State) -> &BTreeMap<EventPosition, Stored>,
    convert: fn(&Opening, EventPosition, &Stored) -> Item,
) -> ArchiveStream<Item, EventPosition, FileStorageError> {
    use std::ops::Bound::{Excluded, Included, Unbounded};
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
        let archive = entries(&state);
        let head = archive.last_key_value().map(|(position, _)| *position);
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
        let archive = entries(&state);
        let upper = stop.map_or(Unbounded, Included);
        let progress = observe(archive, previous, stop, empty);
        *observed.lock().expect("reader observation lock") = progress.clone();
        if reported.is_none() {
            reported = Some(progress.clone());
            return Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(progress))));
        }
        if !empty
            && let Some((position, item)) = archive
                .range((previous.map_or(Unbounded, Excluded), upper))
                .next()
        {
            previous = Some(*position);
            let mut observation = observed.lock().expect("reader observation lock");
            observation.previous = previous;
            if previous == observation.latest_known {
                observation.status = MonitoredStreamStatus::AwaitingNewItems;
            }
            return Poll::Ready(Some(Ok(MonitoredStreamItem::Item(convert(
                &opening, *position, item,
            )))));
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
fn observe<Stored>(
    archive: &BTreeMap<EventPosition, Stored>,
    previous: Option<EventPosition>,
    stop: Option<EventPosition>,
    empty: bool,
) -> MonitoredStreamProgress<EventPosition> {
    use std::ops::Bound::{Excluded, Included, Unbounded};
    let upper = stop.map_or(Unbounded, Included);
    let latest_known = if empty {
        previous
    } else {
        previous.max(
            archive
                .range((Unbounded, upper))
                .next_back()
                .map(|(position, _)| *position),
        )
    };
    let status = if previous == latest_known {
        MonitoredStreamStatus::AwaitingNewItems
    } else if archive
        .range((previous.map_or(Unbounded, Excluded), upper))
        .take(2)
        .count()
        > 1
    {
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
            .lock()
            .unwrap()
            .journal
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
        events.0.lock().unwrap().journal.inject(fault);
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
            let expected = if matches!(fault, JournalFault::AfterSync) {
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
            .lock()
            .unwrap()
            .journal
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
