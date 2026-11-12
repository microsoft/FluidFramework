//! Document ownership, recovery indexes, and storage component implementations.

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    sync::{
        Arc, Weak,
        atomic::{AtomicBool, Ordering},
    },
};

use async_trait::async_trait;
use bytes::Bytes;
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, CommittedEvent, Durability, ErrorKind,
    Event, EventPosition,
    storage::{
        Archive, ArchiveStream, BlobStore, CheckpointStore, CreatedDocument, DocumentId,
        ReferenceableStore, SeaStorage, Snapshot, SnapshotArchive, StorageComponents,
        StorageHandle, StorageSurface,
    },
};
use tokio::sync::{Mutex, watch};

use crate::{Error, Factory, Journal, MAX_BATCH_BYTES, MAX_BATCH_RECORDS, Result, record::Record};

/// A committed event's physical location and encoded size, used to bound replay pages.
pub(crate) struct EventLocation {
    /// Stable journal location.
    location: u64,
    /// Complete encoded record length, excluding provider framing.
    bytes: usize,
}

/// Recovered indexes; payloads are read from the provider only when requested.
#[derive(Default)]
pub(crate) struct Index {
    /// Validated complete trees and their record locations.
    blobs: HashMap<BlobTreeId, u64>,
    /// Consecutive event positions mapped to provider record locations.
    pub(crate) events: BTreeMap<EventPosition, EventLocation>,
    /// Sparse snapshot positions and complete roots.
    pub(crate) snapshots: BTreeMap<EventPosition, BlobTreeId>,
    /// Latest independent recovery state.
    checkpoint: Option<Bytes>,
}

impl Index {
    /// Validates dependency closure before accepting a new publication.
    fn validate(&self, record: &Record) -> Result<()> {
        let valid = match record {
            Record::Blob(_) => true,
            Record::Directory(directory) => directory
                .entries()
                .values()
                .all(|id| self.blobs.contains_key(id)),
            Record::Event(event) => {
                event
                    .blob_tree
                    .is_none_or(|id| self.blobs.contains_key(&id))
                    && self
                        .events
                        .last_key_value()
                        .is_none_or(|(position, _)| position.get() < u64::MAX)
            }
            Record::Snapshot(root, position) => {
                self.blobs.contains_key(root)
                    && self.events.contains_key(position)
                    && self
                        .snapshots
                        .last_key_value()
                        .is_none_or(|(head, _)| head < position)
            }
            Record::Checkpoint(bytes) => !bytes.is_empty(),
        };
        if valid {
            Ok(())
        } else {
            Err(Error::rejected("publication order or dependency closure"))
        }
    }

    /// Installs a validated durable record, returning its event position when applicable.
    fn apply(
        &mut self,
        location: u64,
        record: Record,
        bytes: usize,
    ) -> Result<Option<EventPosition>> {
        self.validate(&record)?;
        match record {
            Record::Blob(payload) => {
                self.blobs
                    .insert(BlobTreeId::Blob(BlobId::for_bytes(&payload)), location);
            }
            Record::Directory(directory) => {
                let id = directory.id().map_err(|e| Error::corrupt(e.to_string()))?;
                self.blobs.insert(BlobTreeId::Directory(id), location);
            }
            Record::Event(_) => {
                let ordinal = self
                    .events
                    .last_key_value()
                    .map_or(0, |(position, _)| position.get())
                    + 1;
                let position = EventPosition::new(ordinal);
                self.events
                    .insert(position, EventLocation { location, bytes });
                return Ok(Some(position));
            }
            Record::Snapshot(root, position) => {
                self.snapshots.insert(position, root);
            }
            Record::Checkpoint(bytes) => self.checkpoint = Some(bytes),
        }
        Ok(None)
    }
}

/// Mutable provider state serialized with its authoritative indexes.
pub(crate) struct State<J> {
    /// Fenced provider connection.
    journal: J,
    /// Validated history without retained event or blob payloads.
    pub(crate) index: Index,
    /// Terminal failure prevents stale heads and late publication after uncertainty.
    failure: Option<Error>,
    /// Factory-wide shutdown rejects new operations before draining any document.
    closed: Arc<AtomicBool>,
}

/// Sets a terminal uncertainty flag if cancellation interrupts a mutation.
struct Mutation<'a> {
    /// Persists independently of the cancelled future.
    failure: &'a mut Option<Error>,
    /// Successful publication and index update disarm cancellation poisoning.
    settled: bool,
}

impl Drop for Mutation<'_> {
    fn drop(&mut self) {
        if !self.settled {
            *self.failure = Some(Error::new(
                ErrorKind::Ambiguous,
                "interrupted remote mutation; reopen required",
            ));
        }
    }
}

impl<J: Journal> State<J> {
    /// Rejects known failure or shutdown without making a remote observation.
    pub(crate) fn check_local(&self) -> Result<()> {
        if let Some(error) = &self.failure {
            return Err(error.clone());
        }
        if self.closed.load(Ordering::Acquire) {
            return Err(Error::rejected("storage is shut down"));
        }
        Ok(())
    }

    /// Verifies provider ownership before making an authoritative observation.
    pub(crate) async fn check(&mut self) -> Result<()> {
        self.check_local()?;
        if let Err(error) = self.journal.check().await {
            self.failure = Some(error.clone());
            return Err(error);
        }
        Ok(())
    }

    /// Publishes once, poisoning the opening on failure or cancellation after admission.
    async fn publish(&mut self, record: Record) -> Result<Option<EventPosition>> {
        self.check_local()?;
        self.index.validate(&record)?;
        let encoded = record.encode()?;
        let bytes = encoded.len();
        let mut mutation = Mutation {
            failure: &mut self.failure,
            settled: false,
        };
        let location = self.journal.append(encoded).await?;
        let position = self.index.apply(location, record, bytes)?;
        mutation.settled = true;
        Ok(position)
    }

    /// Publishes validated events as bounded groups, stopping at the first input or persistence failure.
    async fn append_events(&mut self, values: Vec<Event>) -> Vec<Result<EventPosition>> {
        let mut output = Vec::with_capacity(values.len());
        let mut group = Vec::new();
        let mut bytes = 0;
        for event in values {
            let record = Record::Event(event);
            let prepared = self
                .check_local()
                .and_then(|()| self.index.validate(&record))
                .and_then(|()| record.encode());
            let encoded = match prepared {
                Ok(encoded) => encoded,
                Err(error) => {
                    if self.commit_events(&mut group, &mut output).await {
                        output.push(Err(error));
                    }
                    return output;
                }
            };
            if (group.len() == MAX_BATCH_RECORDS || bytes + encoded.len() + 4 > MAX_BATCH_BYTES)
                && !group.is_empty()
            {
                if !self.commit_events(&mut group, &mut output).await {
                    return output;
                }
                bytes = 0;
            }
            bytes += encoded.len() + 4;
            group.push((record, encoded));
        }
        self.commit_events(&mut group, &mut output).await;
        output
    }

    /// Adds successful positions or the uncertain attempted prefix to the caller's results.
    async fn commit_events(
        &mut self,
        group: &mut Vec<(Record, Bytes)>,
        output: &mut Vec<Result<EventPosition>>,
    ) -> bool {
        if group.is_empty() {
            return true;
        }
        let count = group.len();
        match self.publish_events(std::mem::take(group)).await {
            Ok(positions) => {
                output.extend(positions.into_iter().map(Ok));
                true
            }
            Err(error) => {
                let count = if error.kind == ErrorKind::Ambiguous {
                    count
                } else {
                    1
                };
                output.extend((0..count).map(|_| Err(error.clone())));
                false
            }
        }
    }

    /// Commits a group once; interrupted publication poisons even already-prefetched readers.
    async fn publish_events(&mut self, group: Vec<(Record, Bytes)>) -> Result<Vec<EventPosition>> {
        self.check_local()?;
        let head = self
            .index
            .events
            .last_key_value()
            .map_or(0, |(position, _)| position.get());
        head.checked_add(group.len() as u64)
            .ok_or_else(|| Error::rejected("event position exhausted"))?;
        let mut mutation = Mutation {
            failure: &mut self.failure,
            settled: false,
        };
        let locations = self
            .journal
            .append_batch(group.iter().map(|(_, bytes)| bytes.clone()).collect())
            .await?;
        if locations.len() != group.len() || locations.windows(2).any(|pair| pair[0] >= pair[1]) {
            return Err(Error::new(
                ErrorKind::Ambiguous,
                "committed group returned invalid locations",
            ));
        }
        let mut positions = Vec::with_capacity(group.len());
        for (location, (record, bytes)) in locations.into_iter().zip(group) {
            let position = self
                .index
                .apply(location, record, bytes.len())
                .map_err(|error| {
                    Error::new(
                        ErrorKind::Ambiguous,
                        format!("committed group index: {error}"),
                    )
                })?
                .ok_or_else(|| {
                    Error::new(
                        ErrorKind::Ambiguous,
                        "committed group contained a non-event",
                    )
                })?;
            positions.push(position);
        }
        mutation.settled = true;
        Ok(positions)
    }

    /// Fetches a bounded page of indexed events, including sparse physical journal locations.
    pub(crate) async fn event_page(
        &mut self,
        after: Option<EventPosition>,
        stop: Option<EventPosition>,
    ) -> Result<Vec<CommittedEvent>> {
        let bounds = (
            after.map_or(std::ops::Bound::Unbounded, std::ops::Bound::Excluded),
            stop.map_or(std::ops::Bound::Unbounded, std::ops::Bound::Included),
        );
        let mut bytes = 0;
        let indexed: Vec<_> = self
            .index
            .events
            .range(bounds)
            .take(MAX_BATCH_RECORDS)
            .take_while(|(_, entry)| {
                bytes += entry.bytes + 4;
                bytes <= MAX_BATCH_BYTES
            })
            .map(|(position, entry)| (*position, (entry.location, entry.bytes)))
            .collect();
        if indexed.is_empty() {
            return Ok(Vec::new());
        }
        let locations: Vec<_> = indexed.iter().map(|(_, location)| *location).collect();
        let records = self.journal.read_batch(&locations).await?;
        if records.len() != indexed.len() {
            return Err(Error::corrupt("incomplete event page"));
        }
        records
            .into_iter()
            .zip(indexed)
            .map(|(bytes, (position, (_, length)))| {
                if bytes.len() != length {
                    return Err(Error::corrupt("event page length mismatch"));
                }
                match Record::decode(&bytes)? {
                    Record::Event(event) => Ok(CommittedEvent { position, event }),
                    _ => Err(Error::corrupt("event page points to another record kind")),
                }
            })
            .collect()
    }

    /// Loads and validates a known event record.
    pub(crate) async fn event(&mut self, position: EventPosition) -> Result<CommittedEvent> {
        let location = self
            .index
            .events
            .get(&position)
            .ok_or_else(|| Error::corrupt("missing event index"))?
            .location;
        match Record::decode(&self.journal.read(location).await?)? {
            Record::Event(event) => Ok(CommittedEvent { position, event }),
            _ => Err(Error::corrupt("event index points to another record kind")),
        }
    }

    /// Verifies content identity and canonical encoding before returning payload bytes.
    async fn content(&mut self, id: BlobTreeId) -> Result<Record> {
        let location = *self
            .index
            .blobs
            .get(&id)
            .ok_or_else(|| Error::rejected("content is unavailable"))?;
        let record = Record::decode(&self.journal.read(location).await?)?;
        let actual = match &record {
            Record::Blob(bytes) => BlobTreeId::Blob(BlobId::for_bytes(bytes)),
            Record::Directory(directory) => {
                BlobTreeId::Directory(directory.id().map_err(|e| Error::corrupt(e.to_string()))?)
            }
            _ => {
                return Err(Error::corrupt(
                    "content index points to another record kind",
                ));
            }
        };
        if id != actual {
            return Err(Error::corrupt("content identity mismatch"));
        }
        Ok(record)
    }
}

/// Shared exclusive opening retained by components, handles, and streams.
pub(crate) struct Opening<J: Journal> {
    /// Serialized operations survive cancellation through terminal state.
    pub(crate) state: Arc<Mutex<State<J>>>,
    /// Asynchronous release result observed by same-factory reopening and shutdown.
    released: watch::Sender<Option<Result<()>>>,
}

impl<J: Journal> Drop for Opening<J> {
    fn drop(&mut self) {
        let state = self.state.clone();
        let released = self.released.clone();
        match tokio::runtime::Handle::try_current() {
            Ok(runtime) => {
                runtime.spawn(async move {
                    let result = state.lock().await.journal.close().await;
                    released.send_replace(Some(result));
                });
            }
            Err(error) => {
                released.send_replace(Some(Err(Error::new(
                    ErrorKind::Unavailable,
                    format!("runtime stopped before storage release: {error}"),
                ))));
            }
        }
    }
}

/// A tracked opening does not keep writer ownership alive.
struct Tracked<J: Journal> {
    /// Detects retained components and capabilities.
    opening: Weak<Opening<J>>,
    /// Receives the result of releasing the previous provider opening.
    released: watch::Receiver<Option<Result<()>>>,
}

/// Shared factory lifecycle; no remote provider dependency is included here.
struct Registry<F: Factory> {
    /// Creates and recovers fenced provider journals.
    factory: F,
    /// Serializes same-factory create/open/close transitions.
    openings: Mutex<HashMap<DocumentId, Tracked<F::Journal>>>,
    /// Stops admitting new document openings during shutdown.
    closed: Arc<AtomicBool>,
}

/// Native document storage composed over a provider's exclusive record journal.
pub struct Storage<F: Factory> {
    /// Clones share opening and shutdown authority.
    registry: Arc<Registry<F>>,
}

impl<F: Factory> Clone for Storage<F> {
    fn clone(&self) -> Self {
        Self {
            registry: self.registry.clone(),
        }
    }
}

/// Concrete components minted from one shared opening.
type Components<J> = StorageComponents<Blobs<J>, Events<J>, Snapshots<J>>;

impl<F: Factory> Storage<F> {
    /// Wraps a configured provider without connecting or creating documents.
    pub fn new(factory: F) -> Self {
        Self {
            registry: Arc::new(Registry {
                factory,
                openings: Mutex::new(HashMap::new()),
                closed: Arc::new(AtomicBool::new(false)),
            }),
        }
    }

    /// Scans complete history before returning any writable component.
    async fn recover(
        mut journal: F::Journal,
        closed: Arc<AtomicBool>,
    ) -> Result<Arc<Opening<F::Journal>>> {
        let mut index = Index::default();
        let mut cursor = None;
        let recovery = async {
            loop {
                let page = journal.scan(cursor).await?;
                if page.is_empty() {
                    break;
                }
                for (location, bytes) in page {
                    if cursor.is_some_and(|previous| location <= previous) {
                        return Err(Error::corrupt("journal locations do not increase"));
                    }
                    index
                        .apply(location, Record::decode(&bytes)?, bytes.len())
                        .map_err(|error| {
                            Error::corrupt(format!("invalid recovered publication: {error}"))
                        })?;
                    cursor = Some(location);
                }
            }
            journal.check().await
        }
        .await;
        if let Err(error) = recovery {
            journal.close().await?;
            return Err(error);
        }
        let (released, _) = watch::channel(None);
        Ok(Arc::new(Opening {
            state: Arc::new(Mutex::new(State {
                journal,
                index,
                failure: None,
                closed,
            })),
            released,
        }))
    }

    /// Associates the release barrier with the factory before exposing owners.
    fn components(
        openings: &mut HashMap<DocumentId, Tracked<F::Journal>>,
        id: DocumentId,
        opening: Arc<Opening<F::Journal>>,
    ) -> Components<F::Journal> {
        openings.insert(
            id,
            Tracked {
                opening: Arc::downgrade(&opening),
                released: opening.released.subscribe(),
            },
        );
        StorageComponents {
            blobs: Blobs(opening.clone()),
            events: Events(opening.clone()),
            snapshots: Snapshots(opening.clone()),
            checkpoints: Box::new(Checkpoints(opening)),
        }
    }
}

/// Waits for provider cleanup without hiding errors or a stopped runtime.
async fn released(receiver: &mut watch::Receiver<Option<Result<()>>>) -> Result<()> {
    loop {
        if let Some(result) = receiver.borrow().clone() {
            return result;
        }
        receiver.changed().await.map_err(|e| {
            Error::new(ErrorKind::Unavailable, format!("release task stopped: {e}"))
        })?;
    }
}

#[async_trait]
impl<F: Factory> SeaStorage for Storage<F> {
    type Error = Error;
    type Blobs = Blobs<F::Journal>;
    type Events = Events<F::Journal>;
    type Snapshots = Snapshots<F::Journal>;
    fn durability(&self) -> Durability {
        Durability::Durable
    }

    async fn create_document(
        &self,
    ) -> Result<CreatedDocument<Self::Blobs, Self::Events, Self::Snapshots>> {
        let mut openings = self.registry.openings.lock().await;
        if self.registry.closed.load(Ordering::Acquire) {
            return Err(Error::rejected("storage is shut down"));
        }
        let (id, journal) = self.registry.factory.create().await?;
        let opening = Self::recover(journal, self.registry.closed.clone()).await?;
        Ok(CreatedDocument {
            id: id.clone(),
            components: Self::components(&mut openings, id, opening),
        })
    }

    async fn open_document(&self, id: &DocumentId) -> Result<Option<Components<F::Journal>>> {
        let mut openings = self.registry.openings.lock().await;
        if self.registry.closed.load(Ordering::Acquire) {
            return Err(Error::rejected("storage is shut down"));
        }
        if let Some(previous) = openings.get(id)
            && previous.opening.upgrade().is_some()
        {
            return Err(Error::new(ErrorKind::Conflict, "document is already open"));
        }
        if let Some(mut previous) = openings.remove(id) {
            released(&mut previous.released).await?;
        }
        let Some(journal) = self.registry.factory.open(id).await? else {
            return Ok(None);
        };
        let opening = Self::recover(journal, self.registry.closed.clone()).await?;
        Ok(Some(Self::components(&mut openings, id.clone(), opening)))
    }

    async fn flush(&self) -> Result<()> {
        let mut openings = self.registry.openings.lock().await;
        for tracked in openings.values_mut() {
            if let Some(opening) = tracked.opening.upgrade() {
                opening.state.lock().await.check().await?;
            } else {
                released(&mut tracked.released).await?;
            }
        }
        Ok(())
    }

    async fn shutdown(&self) -> Result<()> {
        self.registry.closed.store(true, Ordering::Release);
        let mut first_error = None;
        let mut openings = self.registry.openings.lock().await;
        for tracked in openings.values_mut() {
            let result = if let Some(opening) = tracked.opening.upgrade() {
                let mut state = opening.state.lock().await;
                let failure = state.failure.clone();
                state.failure = Some(Error::rejected("storage is shut down"));
                let close = state.journal.close().await;
                close.and_then(|()| failure.map_or(Ok(()), Err))
            } else {
                released(&mut tracked.released).await
            };
            if let Err(error) = result {
                first_error.get_or_insert(error);
            }
        }
        first_error.map_or(Ok(()), Err)
    }
}

/// Unforgeable availability evidence retaining its original writer opening.
pub struct Handle<J: Journal, Id> {
    /// Provenance and writer lifetime.
    opening: Arc<Opening<J>>,
    /// Validated committed identity.
    id: Id,
}

impl<J: Journal, Id: Clone> Clone for Handle<J, Id> {
    fn clone(&self) -> Self {
        Self {
            opening: self.opening.clone(),
            id: self.id.clone(),
        }
    }
}
impl<J: Journal, Id: std::fmt::Debug> std::fmt::Debug for Handle<J, Id> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("Handle").field(&self.id).finish()
    }
}
impl<J: Journal, Id: Copy + Send + Sync + std::fmt::Debug + 'static> StorageHandle
    for Handle<J, Id>
{
    type Id = Id;
    fn id(&self) -> Id {
        self.id
    }
}

/// Immutable remote blob trees belonging to one exclusive document opening.
pub struct Blobs<J: Journal>(Arc<Opening<J>>);
/// Ordered remote event history belonging to one exclusive document opening.
pub struct Events<J: Journal>(Arc<Opening<J>>);
/// Sparse snapshot publications belonging to one exclusive document opening.
pub struct Snapshots<J: Journal>(Arc<Opening<J>>);
/// Internal checkpoint state sharing all publication and failure barriers.
struct Checkpoints<J: Journal>(Arc<Opening<J>>);

impl<J: Journal> std::fmt::Debug for Checkpoints<J> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RemoteCheckpoints")
    }
}
impl<J: Journal> StorageSurface for Blobs<J> {
    type Error = Error;
}
impl<J: Journal> StorageSurface for Events<J> {
    type Error = Error;
}
impl<J: Journal> StorageSurface for Snapshots<J> {
    type Error = Error;
}
impl<J: Journal> StorageSurface for Checkpoints<J> {
    type Error = Error;
}

#[async_trait]
impl<J: Journal> ReferenceableStore for Blobs<J> {
    type Id = BlobTreeId;
    type Handle = Handle<J, BlobTreeId>;
    async fn resolve(&self, id: BlobTreeId) -> Result<Option<Self::Handle>> {
        let mut state = self.0.state.lock().await;
        state.check().await?;
        if !state.index.blobs.contains_key(&id) {
            return Ok(None);
        }
        let mut pending = vec![id];
        let mut visited = HashSet::new();
        while let Some(next) = pending.pop() {
            if !visited.insert(next) {
                continue;
            }
            if let Record::Directory(directory) = state.content(next).await? {
                pending.extend(directory.entries().values().copied());
            }
        }
        Ok(Some(Handle {
            opening: self.0.clone(),
            id,
        }))
    }
    async fn ensure_available(&self, handle: &Self::Handle) -> Result<()> {
        if !Arc::ptr_eq(&self.0, &handle.opening) {
            return Err(Error::rejected("foreign blob handle"));
        }
        self.resolve(handle.id)
            .await?
            .ok_or_else(|| Error::corrupt("missing published blob"))?;
        Ok(())
    }
}

#[async_trait]
impl<J: Journal> BlobStore for Blobs<J> {
    async fn put_blob(&self, payload: Bytes) -> Result<Self::Handle> {
        let id = BlobTreeId::Blob(BlobId::for_bytes(&payload));
        let mut state = self.0.state.lock().await;
        state.check().await?;
        if state.index.blobs.contains_key(&id) {
            state.content(id).await?;
        } else {
            state.publish(Record::Blob(payload)).await?;
        }
        Ok(Handle {
            opening: self.0.clone(),
            id,
        })
    }
    async fn get_blob(&self, id: BlobId) -> Result<Bytes> {
        let mut state = self.0.state.lock().await;
        state.check().await?;
        match state.content(BlobTreeId::Blob(id)).await? {
            Record::Blob(bytes) => Ok(bytes),
            _ => Err(Error::corrupt("expected blob record")),
        }
    }
    async fn put_directory(&self, directory: BlobDirectory) -> Result<Self::Handle> {
        let id = BlobTreeId::Directory(directory.id().map_err(|e| Error::rejected(e.to_string()))?);
        let mut state = self.0.state.lock().await;
        state.check().await?;
        if state.index.blobs.contains_key(&id) {
            state.content(id).await?;
        } else {
            state.publish(Record::Directory(directory)).await?;
        }
        Ok(Handle {
            opening: self.0.clone(),
            id,
        })
    }
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory> {
        let mut state = self.0.state.lock().await;
        state.check().await?;
        match state.content(BlobTreeId::Directory(id)).await? {
            Record::Directory(directory) => Ok(directory),
            _ => Err(Error::corrupt("expected directory record")),
        }
    }
}

#[async_trait]
impl<J: Journal> ReferenceableStore for Events<J> {
    type Id = EventPosition;
    type Handle = Handle<J, EventPosition>;
    async fn resolve(&self, id: EventPosition) -> Result<Option<Self::Handle>> {
        let mut state = self.0.state.lock().await;
        state.check().await?;
        if !state.index.events.contains_key(&id) {
            return Ok(None);
        }
        state.event(id).await?;
        Ok(Some(Handle {
            opening: self.0.clone(),
            id,
        }))
    }
    async fn ensure_available(&self, handle: &Self::Handle) -> Result<()> {
        if !Arc::ptr_eq(&self.0, &handle.opening) {
            return Err(Error::rejected("foreign event handle"));
        }
        self.resolve(handle.id)
            .await?
            .ok_or_else(|| Error::corrupt("missing published event"))?;
        Ok(())
    }
}

#[async_trait]
impl<J: Journal> Archive for Events<J> {
    type Position = EventPosition;
    type Item = CommittedEvent;
    type Append = Event;
    type AppendResult = Handle<J, EventPosition>;
    async fn append(&self, event: Event) -> Result<Self::AppendResult> {
        let position = self
            .0
            .state
            .lock()
            .await
            .publish(Record::Event(event))
            .await?
            .ok_or_else(|| Error::corrupt("event publication produced no position"))?;
        Ok(Handle {
            opening: self.0.clone(),
            id: position,
        })
    }
    async fn append_batch(&self, values: Vec<Event>) -> Vec<Result<Self::AppendResult>> {
        self.0
            .state
            .lock()
            .await
            .append_events(values)
            .await
            .into_iter()
            .map(|position| {
                position.map(|id| Handle {
                    opening: self.0.clone(),
                    id,
                })
            })
            .collect()
    }
    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<Self::Item, EventPosition, Error> {
        crate::stream::events(self.0.clone(), after, stop_after)
    }
    async fn head(&self) -> Result<Option<EventPosition>> {
        let mut state = self.0.state.lock().await;
        state.check().await?;
        Ok(state
            .index
            .events
            .last_key_value()
            .map(|(position, _)| *position))
    }
}

/// Reconstitutes a snapshot from indexes validated at publication and recovery.
pub(crate) fn snapshot<J: Journal>(
    opening: &Arc<Opening<J>>,
    root: BlobTreeId,
    position: EventPosition,
) -> Snapshot<Handle<J, BlobTreeId>, Handle<J, EventPosition>> {
    Snapshot {
        root: Handle {
            opening: opening.clone(),
            id: root,
        },
        at_event: Handle {
            opening: opening.clone(),
            id: position,
        },
    }
}

#[async_trait]
impl<J: Journal> Archive for Snapshots<J> {
    type Position = EventPosition;
    type Item = Snapshot<Handle<J, BlobTreeId>, Handle<J, EventPosition>>;
    type Append = Self::Item;
    type AppendResult = ();
    async fn append(&self, value: Self::Append) -> Result<()> {
        if !Arc::ptr_eq(&self.0, &value.root.opening)
            || !Arc::ptr_eq(&self.0, &value.at_event.opening)
        {
            return Err(Error::rejected("foreign snapshot handles"));
        }
        self.0
            .state
            .lock()
            .await
            .publish(Record::Snapshot(value.root.id, value.at_event.id))
            .await?;
        Ok(())
    }
    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveStream<Self::Item, EventPosition, Error> {
        crate::stream::snapshots(self.0.clone(), after, stop_after)
    }
    async fn head(&self) -> Result<Option<EventPosition>> {
        let mut state = self.0.state.lock().await;
        state.check().await?;
        Ok(state
            .index
            .snapshots
            .last_key_value()
            .map(|(position, _)| *position))
    }
}

#[async_trait]
impl<J: Journal> SnapshotArchive for Snapshots<J> {
    type BlobHandle = Handle<J, BlobTreeId>;
    type EventHandle = Handle<J, EventPosition>;
    async fn get_snapshot_at(&self, position: EventPosition) -> Result<Option<Self::Item>> {
        let mut state = self.0.state.lock().await;
        state.check().await?;
        Ok(state
            .index
            .snapshots
            .get(&position)
            .map(|root| snapshot(&self.0, *root, position)))
    }
    async fn latest_at_or_before(
        &self,
        position: Option<EventPosition>,
    ) -> Result<Option<Self::Item>> {
        let mut state = self.0.state.lock().await;
        state.check().await?;
        Ok(state
            .index
            .snapshots
            .range(..=position.unwrap_or(EventPosition::new(u64::MAX)))
            .next_back()
            .map(|(position, root)| snapshot(&self.0, *root, *position)))
    }
}

#[async_trait]
impl<J: Journal> CheckpointStore for Checkpoints<J> {
    async fn checkpoint(&self) -> Result<Option<Bytes>> {
        let mut state = self.0.state.lock().await;
        state.check().await?;
        Ok(state.index.checkpoint.clone())
    }
    async fn publish_checkpoint(&self, bytes: Bytes) -> Result<()> {
        self.0
            .state
            .lock()
            .await
            .publish(Record::Checkpoint(bytes))
            .await?;
        Ok(())
    }
}
