#![doc = include_str!("../README.md")]

use std::{
    collections::{BTreeMap, VecDeque},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::stream;
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, Durability, ErrorKind,
    Event, EventPosition, SnapshotId,
    archive::{
        CommittedEvent as ArchiveCommittedEvent, EventReceipt as ArchiveEventReceipt, OperationId,
        PublishedSnapshot as ArchivePublishedSnapshot, Snapshot as ArchiveSnapshot,
        SnapshotPosition as ArchiveSnapshotPosition, SnapshotPublication, StorageEventStream,
        StorageLoad,
    },
};
use thiserror::Error;

/// Bytes occupied by the log marker.
const HEADER_LEN: usize = 8;
/// Marker opening a record frame.
const FRAME_MAGIC: [u8; 4] = *b"RECD";
/// Marker closing a record frame.
const FRAME_TRAILER_MAGIC: [u8; 4] = *b"ENDR";
/// Bytes occupied by one copy of record framing evidence.
const FRAME_HEADER_LEN: usize = 28;
/// Bytes occupied by the duplicated trailing framing evidence.
const FRAME_TRAILER_LEN: usize = 28;
/// Persisted framing bytes added to every record payload.
pub const RECORD_FRAME_OVERHEAD_BYTES: usize = FRAME_HEADER_LEN + FRAME_TRAILER_LEN;
/// Final Sea archive journal filename within the owned directory.
const ARCHIVE_FILE: &str = "archive.log";
/// Versioned final Sea archive journal marker.
const ARCHIVE_MAGIC: [u8; 8] = *b"SEAARD01";
const ARCHIVE_BLOB: u8 = 1;
const ARCHIVE_DIRECTORY: u8 = 2;
const ARCHIVE_EVENT: u8 = 3;
const ARCHIVE_SNAPSHOT: u8 = 4;
/// Deterministic boundaries at which a configured operation simulates a crash.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CrashPoint {
    /// After an append's header has been written.
    RecordAfterHeaderWrite,
    /// After an append's payload has been written.
    RecordAfterPayloadWrite,
    /// After an append's trailer has been written.
    RecordAfterTrailerWrite,
    /// Immediately before syncing an appended record.
    RecordBeforeSync,
    /// Immediately after syncing an appended record but before acknowledging it.
    RecordAfterSync,
    /// After the log bytes have been read during open.
    OpenAfterLogRead,
    /// After snapshot recovery has read the current snapshot, if present.
    OpenAfterSnapshotRead,
    /// After creating or truncating the pending snapshot file.
    SnapshotAfterCreate,
    /// After writing the complete pending snapshot record.
    SnapshotAfterWrite,
    /// Immediately before syncing the pending snapshot file.
    SnapshotBeforeFileSync,
    /// After syncing the pending snapshot file.
    SnapshotAfterFileSync,
    /// Immediately before atomically renaming the pending snapshot.
    SnapshotBeforeRename,
    /// After atomically renaming the pending snapshot.
    SnapshotAfterRename,
    /// Immediately before syncing the containing directory.
    SnapshotBeforeDirectorySync,
    /// After syncing the containing directory but before acknowledgment.
    SnapshotAfterDirectorySync,
}

/// An ordered, one-shot deterministic crash plan shared by cloned log handles.
#[derive(Debug, Default)]
pub struct CrashInjector {
    /// Remaining crash points consumed in declaration order.
    points: Mutex<VecDeque<CrashPoint>>,
}

impl CrashInjector {
    /// Creates an injector that fails when each point is reached in the supplied order.
    pub fn new(points: impl IntoIterator<Item = CrashPoint>) -> Self {
        Self {
            points: Mutex::new(points.into_iter().collect()),
        }
    }

    /// Consumes and fails at `point` when it is next in the crash plan.
    fn hit(&self, point: CrashPoint) -> std::io::Result<()> {
        let mut points = self
            .points
            .lock()
            .map_err(|_| std::io::Error::other("crash injector mutex was poisoned"))?;
        if points.front() == Some(&point) {
            points.pop_front();
            return Err(std::io::Error::other(format!(
                "simulated crash at {point:?}"
            )));
        }
        Ok(())
    }
}

/// Errors exposed by the durable-log spike.
#[derive(Debug, Error)]
pub enum DurableLogError {
    /// An I/O operation failed before an ambiguous durability boundary.
    #[error("log I/O failed: {0}")]
    Io(#[from] std::io::Error),
    /// An append failed after it may have reached durable storage.
    #[error("append outcome may be committed: {0}")]
    AmbiguousAppend(std::io::Error),
    /// Snapshot publication failed after it may have become durable.
    #[error("snapshot outcome may be published: {0}")]
    AmbiguousSnapshot(std::io::Error),
    /// Persisted framing or checksums violate the supported format.
    #[error("stored log is corrupt: {0}")]
    Corrupt(&'static str),
    /// A supplied position is zero or beyond the committed head.
    #[error("position is beyond the committed head")]
    InvalidPosition,
    /// The expected snapshot parent differs from the latest publication.
    #[error("snapshot parent does not match the latest snapshot")]
    SnapshotConflict,
    /// A snapshot boundary precedes the latest published boundary.
    #[error("snapshot position regresses behind the latest snapshot")]
    SnapshotRegression,
    /// Shared in-process state cannot be accessed after mutex poisoning.
    #[error("durable log mutex was poisoned")]
    Poisoned,
    /// A referenced blob-tree node is unavailable.
    #[error("referenced blob-tree node is unavailable")]
    MissingBlobTree,
    /// A stable operation identity was reused with different publication input.
    #[error("operation identity is already bound to different input")]
    OperationConflict,
    /// This archive cannot assign another numeric identity.
    #[error("numeric identity space is exhausted")]
    IdentityExhausted,
}

impl ClassifiedError for DurableLogError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::AmbiguousAppend(_) | Self::AmbiguousSnapshot(_) => ErrorKind::Ambiguous,
            Self::Corrupt(_) => ErrorKind::Corrupt,
            Self::InvalidPosition => ErrorKind::InvalidPosition,
            Self::SnapshotConflict | Self::SnapshotRegression | Self::OperationConflict => {
                ErrorKind::Conflict
            }
            Self::MissingBlobTree | Self::IdentityExhausted => ErrorKind::Rejected,
            Self::Io(_) | Self::Poisoned => ErrorKind::Unavailable,
        }
    }
}

/// Recovered final-contract state from the durable archive journal.
#[derive(Debug, Default)]
struct ArchiveState {
    events: Vec<ArchiveCommittedEvent>,
    blobs: BTreeMap<BlobId, Bytes>,
    directories: BTreeMap<BlobDirectoryId, BlobDirectory>,
    snapshots: Vec<ArchivePublishedSnapshot>,
    snapshot_operations: BTreeMap<OperationId, (SnapshotPublication, ArchivePublishedSnapshot)>,
    next_snapshot_id: u64,
}

/// Mutable append, recovery, snapshot, and crash-injection state behind the log lock.
#[derive(Debug)]
struct State {
    /// Current Sea archive state reconstructed from its journal.
    archive: ArchiveState,
    /// Append-only handle for the final Sea archive journal.
    archive_writer: File,
    /// Shared deterministic crash plan.
    crashes: Arc<CrashInjector>,
}

/// A single-process append log that syncs record data before returning success.
#[derive(Clone, Debug)]
pub struct DurableLog {
    /// Path of the final Sea archive journal.
    archive_path: PathBuf,
    /// Synchronized mutable writer and recovered state.
    state: Arc<Mutex<State>>,
}

impl DurableLog {
    /// Opens or creates a durable log in `directory`.
    ///
    /// Incomplete tail bytes are discarded and the truncation is synced. Complete
    /// records with invalid checksums are reported as corruption.
    ///
    /// # Errors
    ///
    /// Returns an I/O or corruption error when the log cannot be recovered safely.
    pub fn open(directory: impl AsRef<Path>) -> Result<Self, DurableLogError> {
        Self::open_with_crash_injector(directory, Arc::new(CrashInjector::default()))
    }

    /// Opens a durable log with deterministic crash injection enabled.
    ///
    /// # Errors
    ///
    /// Returns an I/O or corruption error, including an injected crash.
    pub fn open_with_crash_injector(
        directory: impl AsRef<Path>,
        crashes: Arc<CrashInjector>,
    ) -> Result<Self, DurableLogError> {
        fs::create_dir_all(directory.as_ref())?;
        let archive_path = directory.as_ref().join(ARCHIVE_FILE);
        if !archive_path.exists() {
            initialize_with_magic(&archive_path, ARCHIVE_MAGIC)?;
        }
        let archive_bytes = read_all(&archive_path)?;
        crashes.hit(CrashPoint::OpenAfterLogRead)?;
        crashes.hit(CrashPoint::OpenAfterSnapshotRead)?;
        let (archive_records, archive_valid_length) =
            parse_framed_log(&archive_bytes, ARCHIVE_MAGIC)?;
        let archive = parse_archive_records(&archive_records)?;
        let archive_writer = OpenOptions::new()
            .read(true)
            .append(true)
            .open(&archive_path)?;
        if archive_writer.metadata()?.len() != archive_valid_length {
            archive_writer.set_len(archive_valid_length)?;
            archive_writer.sync_data()?;
        }

        Ok(Self {
            archive_path,
            state: Arc::new(Mutex::new(State {
                archive,
                archive_writer,
                crashes,
            })),
        })
    }

    /// Returns the final Sea archive journal path.
    #[must_use]
    pub fn archive_path(&self) -> &Path {
        &self.archive_path
    }

    /// Locks mutable log state and classifies mutex poisoning.
    fn state(&self) -> Result<MutexGuard<'_, State>, DurableLogError> {
        self.state.lock().map_err(|_| DurableLogError::Poisoned)
    }

    /// Checks that an event position identifies an existing committed event.
    fn validate_archive_position(
        position: EventPosition,
        record_count: usize,
    ) -> Result<(), DurableLogError> {
        let record_count =
            u64::try_from(record_count).map_err(|_| DurableLogError::InvalidPosition)?;
        if position.get() == 0 || position.get() > record_count {
            return Err(DurableLogError::InvalidPosition);
        }
        Ok(())
    }

    /// Checks that a blob-tree root and all descendants exist in recovered state.
    fn validate_tree(state: &ArchiveState, root: BlobTreeId) -> Result<(), DurableLogError> {
        match root {
            BlobTreeId::Blob(id) => state
                .blobs
                .contains_key(&id)
                .then_some(())
                .ok_or(DurableLogError::MissingBlobTree),
            BlobTreeId::Directory(id) => {
                let directory = state
                    .directories
                    .get(&id)
                    .ok_or(DurableLogError::MissingBlobTree)?;
                for child in directory.entries().values() {
                    Self::validate_tree(state, *child)?;
                }
                Ok(())
            }
        }
    }
}

#[async_trait]
impl sea_core::archive::SeaStorage for DurableLog {
    type Error = DurableLogError;

    fn durability(&self) -> Durability {
        Durability::Durable
    }

    async fn put_blob(&self, payload: Bytes) -> Result<BlobId, Self::Error> {
        let mut state = self.state()?;
        let id = BlobId::for_bytes(&payload);
        if state.archive.blobs.contains_key(&id) {
            return Ok(id);
        }
        let mut body = Vec::with_capacity(32 + payload.len());
        body.extend_from_slice(id.as_bytes());
        body.extend_from_slice(&payload);
        persist_archive_record(&mut state, ARCHIVE_BLOB, &body, false)?;
        state.archive.blobs.insert(id, payload);
        archive_post_sync(&state, false)?;
        Ok(id)
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        self.state()?
            .archive
            .blobs
            .get(&id)
            .cloned()
            .ok_or(DurableLogError::MissingBlobTree)
    }

    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<BlobDirectoryId, Self::Error> {
        let mut state = self.state()?;
        for child in directory.entries().values() {
            Self::validate_tree(&state.archive, *child)?;
        }
        let id = directory
            .id()
            .map_err(|_| DurableLogError::Corrupt("directory cannot be encoded"))?;
        if state.archive.directories.contains_key(&id) {
            return Ok(id);
        }
        let encoded = directory
            .encode()
            .map_err(|_| DurableLogError::Corrupt("directory cannot be encoded"))?;
        let mut body = Vec::with_capacity(32 + encoded.len());
        body.extend_from_slice(id.as_bytes());
        body.extend_from_slice(&encoded);
        persist_archive_record(&mut state, ARCHIVE_DIRECTORY, &body, false)?;
        state.archive.directories.insert(id, directory);
        archive_post_sync(&state, false)?;
        Ok(id)
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.state()?
            .archive
            .directories
            .get(&id)
            .cloned()
            .ok_or(DurableLogError::MissingBlobTree)
    }

    async fn append(&self, event: Event) -> Result<ArchiveEventReceipt, Self::Error> {
        let mut state = self.state()?;
        if let Some(root) = event.blob_tree {
            Self::validate_tree(&state.archive, root)?;
        }
        let ordinal = u64::try_from(state.archive.events.len())
            .ok()
            .and_then(|value| value.checked_add(1))
            .ok_or(DurableLogError::IdentityExhausted)?;
        let position = EventPosition::new(ordinal);
        let body = encode_archive_event(position, &event);
        persist_archive_record(&mut state, ARCHIVE_EVENT, &body, false)?;
        state
            .archive
            .events
            .push(ArchiveCommittedEvent { position, event });
        archive_post_sync(&state, false)?;
        Ok(ArchiveEventReceipt {
            position,
            durability: Durability::Durable,
        })
    }

    async fn read(
        &self,
        after: Option<EventPosition>,
        through: Option<EventPosition>,
    ) -> Result<StorageEventStream<Self::Error>, Self::Error> {
        let state = self.state()?;
        if let Some(position) = after {
            Self::validate_archive_position(position, state.archive.events.len())?;
        }
        if let Some(position) = through {
            Self::validate_archive_position(position, state.archive.events.len())?;
        }
        let start = after
            .map(|position| usize::try_from(position.get()))
            .transpose()
            .map_err(|_| DurableLogError::InvalidPosition)?
            .unwrap_or(0);
        let end = through
            .map(|position| usize::try_from(position.get()))
            .transpose()
            .map_err(|_| DurableLogError::InvalidPosition)?
            .unwrap_or(state.archive.events.len());
        if end < start {
            return Err(DurableLogError::InvalidPosition);
        }
        let events = state.archive.events[start..end].to_vec();
        Ok(Box::pin(stream::iter(events.into_iter().map(Ok))))
    }

    async fn head(&self) -> Result<Option<EventPosition>, Self::Error> {
        Ok(self
            .state()?
            .archive
            .events
            .last()
            .map(|event| event.position))
    }

    async fn snapshot(
        &self,
        id: &SnapshotId,
    ) -> Result<Option<ArchivePublishedSnapshot>, Self::Error> {
        Ok(self
            .state()?
            .archive
            .snapshots
            .iter()
            .find(|snapshot| &snapshot.id == id)
            .cloned())
    }

    async fn latest_snapshot(&self) -> Result<Option<ArchivePublishedSnapshot>, Self::Error> {
        Ok(self.state()?.archive.snapshots.last().cloned())
    }

    async fn snapshot_at_or_before(
        &self,
        position: EventPosition,
    ) -> Result<Option<ArchivePublishedSnapshot>, Self::Error> {
        let state = self.state()?;
        Self::validate_archive_position(position, state.archive.events.len())?;
        Ok(select_archive_snapshot(&state.archive.snapshots, position))
    }

    async fn publish_snapshot(
        &self,
        publication: SnapshotPublication,
    ) -> Result<ArchivePublishedSnapshot, Self::Error> {
        let mut state = self.state()?;
        if let Some((original, published)) = state
            .archive
            .snapshot_operations
            .get(&publication.operation_id)
        {
            return if original == &publication {
                Ok(published.clone())
            } else {
                Err(DurableLogError::OperationConflict)
            };
        }
        if state.archive.snapshots.last().map(|snapshot| &snapshot.id)
            != publication.expected_parent.as_ref()
        {
            return Err(DurableLogError::SnapshotConflict);
        }
        if let ArchiveSnapshotPosition::At(position) = publication.snapshot.at_event {
            Self::validate_archive_position(position, state.archive.events.len())?;
        }
        if state
            .archive
            .snapshots
            .last()
            .is_some_and(|previous| previous.snapshot.at_event > publication.snapshot.at_event)
        {
            return Err(DurableLogError::SnapshotRegression);
        }
        Self::validate_tree(&state.archive, publication.snapshot.root)?;
        let id_number = state.archive.next_snapshot_id;
        let published = ArchivePublishedSnapshot {
            id: archive_snapshot_id(id_number),
            parent: publication.expected_parent.clone(),
            snapshot: publication.snapshot.clone(),
        };
        let body = encode_archive_snapshot(&publication, &published)?;
        persist_archive_record(&mut state, ARCHIVE_SNAPSHOT, &body, true)?;
        state.archive.next_snapshot_id = id_number
            .checked_add(1)
            .ok_or(DurableLogError::IdentityExhausted)?;
        state.archive.snapshots.push(published.clone());
        state.archive.snapshot_operations.insert(
            publication.operation_id.clone(),
            (publication, published.clone()),
        );
        archive_post_sync(&state, true)?;
        Ok(published)
    }

    async fn resolve_snapshot_publication(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<ArchivePublishedSnapshot>, Self::Error> {
        Ok(self
            .state()?
            .archive
            .snapshot_operations
            .get(operation_id)
            .map(|(_, published)| published.clone()))
    }

    async fn load(
        &self,
        required: Option<EventPosition>,
    ) -> Result<StorageLoad<Self::Error>, Self::Error> {
        let state = self.state()?;
        if let Some(position) = required {
            Self::validate_archive_position(position, state.archive.events.len())?;
        }
        let snapshot = required.map_or_else(
            || state.archive.snapshots.last().cloned(),
            |position| select_archive_snapshot(&state.archive.snapshots, position),
        );
        let start = match snapshot.as_ref().map(|snapshot| snapshot.snapshot.at_event) {
            None | Some(ArchiveSnapshotPosition::Initial) => 0,
            Some(ArchiveSnapshotPosition::At(position)) => {
                usize::try_from(position.get()).map_err(|_| DurableLogError::InvalidPosition)?
            }
        };
        let head = state.archive.events.last().map(|event| event.position);
        let events = state.archive.events[start..].to_vec();
        Ok(StorageLoad {
            snapshot,
            head,
            events: Box::pin(stream::iter(events.into_iter().map(Ok))),
        })
    }
}

/// Creates and syncs a new framed-log header with the supplied format marker.
fn initialize_with_magic(path: &Path, magic: [u8; 8]) -> Result<(), DurableLogError> {
    let mut file = File::create(path)?;
    file.write_all(&magic)?;
    file.sync_data()?;
    Ok(())
}

/// Reads a complete owned persistence file for recovery validation.
fn read_all(path: &Path) -> Result<Vec<u8>, DurableLogError> {
    let mut bytes = Vec::new();
    File::open(path)?.read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Recovers complete records from a checksummed log with the supplied marker.
fn parse_framed_log(bytes: &[u8], magic: [u8; 8]) -> Result<(Vec<Bytes>, u64), DurableLogError> {
    if bytes.len() < HEADER_LEN {
        return Err(DurableLogError::Corrupt("incomplete log header"));
    }
    if bytes[..8] != magic {
        return Err(DurableLogError::Corrupt("invalid log header"));
    }
    let mut cursor = HEADER_LEN;
    let mut records = Vec::new();
    while cursor < bytes.len() {
        let record_start = cursor;
        let Some(frame_header) = bytes.get(cursor..cursor.saturating_add(FRAME_HEADER_LEN)) else {
            return Ok((records, record_start as u64));
        };
        let (length, checksum) = parse_frame_fields(frame_header, FRAME_MAGIC)?;
        let length = usize::try_from(length)
            .map_err(|_| DurableLogError::Corrupt("record length exceeds address space"))?;
        cursor = cursor
            .checked_add(FRAME_HEADER_LEN)
            .ok_or(DurableLogError::Corrupt("record length overflow"))?;
        let Some(payload) = bytes.get(cursor..cursor.saturating_add(length)) else {
            return Ok((records, record_start as u64));
        };
        let trailer_start = cursor
            .checked_add(length)
            .ok_or(DurableLogError::Corrupt("record length overflow"))?;
        let Some(frame_trailer) =
            bytes.get(trailer_start..trailer_start.saturating_add(FRAME_TRAILER_LEN))
        else {
            return Ok((records, record_start as u64));
        };
        let trailer_fields = parse_frame_fields(frame_trailer, FRAME_TRAILER_MAGIC)?;
        if trailer_fields != (length as u64, checksum) {
            return Err(DurableLogError::Corrupt("record framing mismatch"));
        }
        if crc32fast::hash(payload) != checksum {
            return Err(DurableLogError::Corrupt("record checksum mismatch"));
        }
        records.push(Bytes::copy_from_slice(payload));
        cursor = trailer_start
            .checked_add(FRAME_TRAILER_LEN)
            .ok_or(DurableLogError::Corrupt("record length overflow"))?;
    }
    let valid_length = u64::try_from(cursor)
        .map_err(|_| DurableLogError::Corrupt("log length exceeds file range"))?;
    Ok((records, valid_length))
}

/// Validates duplicated frame metadata and returns payload length and checksum.
fn parse_frame_fields(
    bytes: &[u8],
    expected_magic: [u8; 4],
) -> Result<(u64, u32), DurableLogError> {
    if bytes[..4] != expected_magic {
        return Err(DurableLogError::Corrupt("invalid record framing marker"));
    }
    let length = u64::from_be_bytes(
        bytes[4..12]
            .try_into()
            .map_err(|_| DurableLogError::Corrupt("invalid record length"))?,
    );
    let inverse_length = u64::from_be_bytes(
        bytes[12..20]
            .try_into()
            .map_err(|_| DurableLogError::Corrupt("invalid inverse record length"))?,
    );
    let checksum = u32::from_be_bytes(
        bytes[20..24]
            .try_into()
            .map_err(|_| DurableLogError::Corrupt("invalid record checksum"))?,
    );
    let inverse_checksum = u32::from_be_bytes(
        bytes[24..28]
            .try_into()
            .map_err(|_| DurableLogError::Corrupt("invalid inverse record checksum"))?,
    );
    if inverse_length != !length || inverse_checksum != !checksum {
        return Err(DurableLogError::Corrupt(
            "record framing redundancy mismatch",
        ));
    }
    Ok((length, checksum))
}

/// Encodes a frame marker and complemented length/checksum evidence.
fn frame_fields(magic: [u8; 4], length: u64, checksum: u32) -> [u8; FRAME_HEADER_LEN] {
    let mut fields = [0_u8; FRAME_HEADER_LEN];
    fields[..4].copy_from_slice(&magic);
    fields[4..12].copy_from_slice(&length.to_be_bytes());
    fields[12..20].copy_from_slice(&(!length).to_be_bytes());
    fields[20..24].copy_from_slice(&checksum.to_be_bytes());
    fields[24..28].copy_from_slice(&(!checksum).to_be_bytes());
    fields
}

/// Writes one framed record while exposing deterministic crash boundaries.
fn write_record(
    writer: &mut impl Write,
    payload: &[u8],
    crashes: &CrashInjector,
) -> std::io::Result<()> {
    let length = u64::try_from(payload.len()).map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "payload exceeds record length range",
        )
    })?;
    let checksum = crc32fast::hash(payload);
    writer.write_all(&frame_fields(FRAME_MAGIC, length, checksum))?;
    crashes.hit(CrashPoint::RecordAfterHeaderWrite)?;
    writer.write_all(payload)?;
    crashes.hit(CrashPoint::RecordAfterPayloadWrite)?;
    writer.write_all(&frame_fields(FRAME_TRAILER_MAGIC, length, checksum))?;
    crashes.hit(CrashPoint::RecordAfterTrailerWrite)
}

/// Writes and syncs one final archive record up to the acknowledgement boundary.
fn persist_archive_record(
    state: &mut State,
    kind: u8,
    body: &[u8],
    snapshot: bool,
) -> Result<(), DurableLogError> {
    let mut record = Vec::with_capacity(1 + body.len());
    record.push(kind);
    record.extend_from_slice(body);
    let crashes = Arc::clone(&state.crashes);
    let map_error = |error| {
        if snapshot {
            DurableLogError::AmbiguousSnapshot(error)
        } else {
            DurableLogError::AmbiguousAppend(error)
        }
    };
    write_record(&mut state.archive_writer, &record, &crashes).map_err(map_error)?;
    crashes
        .hit(CrashPoint::RecordBeforeSync)
        .map_err(map_error)?;
    state.archive_writer.sync_data().map_err(map_error)
}

/// Applies the post-sync ambiguity boundary after in-memory state reflects the commit.
fn archive_post_sync(state: &State, snapshot: bool) -> Result<(), DurableLogError> {
    state
        .crashes
        .hit(CrashPoint::RecordAfterSync)
        .map_err(|error| {
            if snapshot {
                DurableLogError::AmbiguousSnapshot(error)
            } else {
                DurableLogError::AmbiguousAppend(error)
            }
        })
}

/// Encodes the next numeric snapshot identity in its stable byte representation.
fn archive_snapshot_id(value: u64) -> SnapshotId {
    SnapshotId::from_bytes(Bytes::copy_from_slice(&value.to_be_bytes()))
}

/// Encodes a committed event record body.
fn encode_archive_event(position: EventPosition, event: &Event) -> Vec<u8> {
    let mut body = Vec::with_capacity(8 + 33 + event.payload.len());
    body.extend_from_slice(&position.to_bytes());
    encode_optional_tree_id(&mut body, event.blob_tree);
    body.extend_from_slice(&event.payload);
    body
}

/// Encodes a snapshot publication and its assigned identity as a record body.
fn encode_archive_snapshot(
    publication: &SnapshotPublication,
    published: &ArchivePublishedSnapshot,
) -> Result<Vec<u8>, DurableLogError> {
    let mut body = Vec::new();
    encode_field(&mut body, publication.operation_id.as_bytes())?;
    encode_field(&mut body, published.id.as_bytes())?;
    match &published.parent {
        Some(parent) => {
            body.push(1);
            encode_field(&mut body, parent.as_bytes())?;
        }
        None => body.push(0),
    }
    match published.snapshot.at_event {
        ArchiveSnapshotPosition::Initial => body.push(0),
        ArchiveSnapshotPosition::At(position) => {
            body.push(1);
            body.extend_from_slice(&position.to_bytes());
        }
    }
    encode_tree_id(&mut body, published.snapshot.root);
    Ok(body)
}

/// Appends a length-prefixed byte field to an archive record body.
fn encode_field(output: &mut Vec<u8>, value: &[u8]) -> Result<(), DurableLogError> {
    let length = u32::try_from(value.len())
        .map_err(|_| DurableLogError::Corrupt("archive field exceeds length range"))?;
    output.extend_from_slice(&length.to_be_bytes());
    output.extend_from_slice(value);
    Ok(())
}

/// Appends a tagged blob-tree identity to an archive record body.
fn encode_tree_id(output: &mut Vec<u8>, id: BlobTreeId) {
    match id {
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

/// Appends an optional tagged blob-tree identity to an archive record body.
fn encode_optional_tree_id(output: &mut Vec<u8>, id: Option<BlobTreeId>) {
    match id {
        None => output.push(0),
        Some(BlobTreeId::Blob(id)) => {
            output.push(1);
            output.extend_from_slice(id.as_bytes());
        }
        Some(BlobTreeId::Directory(id)) => {
            output.push(2);
            output.extend_from_slice(id.as_bytes());
        }
    }
}

/// Reconstructs final-contract state from complete durable journal records.
fn parse_archive_records(records: &[Bytes]) -> Result<ArchiveState, DurableLogError> {
    let mut state = ArchiveState {
        next_snapshot_id: 1,
        ..ArchiveState::default()
    };
    for record in records {
        let (&kind, body) = record
            .split_first()
            .ok_or(DurableLogError::Corrupt("empty archive record"))?;
        parse_archive_record(&mut state, kind, body)?;
    }
    Ok(state)
}

/// Applies one decoded archive record to recovered state.
fn parse_archive_record(
    state: &mut ArchiveState,
    kind: u8,
    body: &[u8],
) -> Result<(), DurableLogError> {
    match kind {
        ARCHIVE_BLOB => {
            let (id_bytes, payload) = body
                .split_at_checked(32)
                .ok_or(DurableLogError::Corrupt("truncated archive blob"))?;
            let id = BlobId::from_bytes(id_bytes)
                .map_err(|_| DurableLogError::Corrupt("invalid archive blob identity"))?;
            if BlobId::for_bytes(payload) != id {
                return Err(DurableLogError::Corrupt("archive blob identity mismatch"));
            }
            let payload = Bytes::copy_from_slice(payload);
            if state
                .blobs
                .get(&id)
                .is_some_and(|existing| existing != &payload)
            {
                return Err(DurableLogError::Corrupt("conflicting archive blob record"));
            }
            state.blobs.entry(id).or_insert(payload);
        }
        ARCHIVE_DIRECTORY => {
            let (id_bytes, encoded) = body
                .split_at_checked(32)
                .ok_or(DurableLogError::Corrupt("truncated archive directory"))?;
            let id = BlobDirectoryId::from_bytes(id_bytes)
                .map_err(|_| DurableLogError::Corrupt("invalid archive directory identity"))?;
            let directory = BlobDirectory::decode(encoded)
                .map_err(|_| DurableLogError::Corrupt("invalid archive directory"))?;
            if directory
                .id()
                .map_err(|_| DurableLogError::Corrupt("invalid archive directory"))?
                != id
            {
                return Err(DurableLogError::Corrupt(
                    "archive directory identity mismatch",
                ));
            }
            for child in directory.entries().values() {
                DurableLog::validate_tree(state, *child).map_err(|_| {
                    DurableLogError::Corrupt("archive directory has a missing child")
                })?;
            }
            if state
                .directories
                .get(&id)
                .is_some_and(|existing| existing != &directory)
            {
                return Err(DurableLogError::Corrupt(
                    "conflicting archive directory record",
                ));
            }
            state.directories.entry(id).or_insert(directory);
        }
        ARCHIVE_EVENT => parse_archive_event(state, body)?,
        ARCHIVE_SNAPSHOT => parse_archive_snapshot_record(state, body)?,
        _ => return Err(DurableLogError::Corrupt("unknown archive record kind")),
    }
    Ok(())
}

/// Decodes and validates a committed event record.
fn parse_archive_event(state: &mut ArchiveState, body: &[u8]) -> Result<(), DurableLogError> {
    let mut cursor = 0;
    let position = EventPosition::from_bytes(read_archive_array::<8>(
        body,
        &mut cursor,
        "truncated archive event position",
    )?);
    let expected = u64::try_from(state.events.len())
        .ok()
        .and_then(|value| value.checked_add(1))
        .ok_or(DurableLogError::Corrupt(
            "archive event count exceeds position range",
        ))?;
    if position.get() != expected {
        return Err(DurableLogError::Corrupt(
            "archive event positions are not contiguous",
        ));
    }
    let blob_tree = decode_optional_tree_id(body, &mut cursor)?;
    if let Some(root) = blob_tree {
        DurableLog::validate_tree(state, root)
            .map_err(|_| DurableLogError::Corrupt("archive event has a missing tree"))?;
    }
    state.events.push(ArchiveCommittedEvent {
        position,
        event: Event {
            payload: Bytes::copy_from_slice(&body[cursor..]),
            blob_tree,
        },
    });
    Ok(())
}

/// Decodes and validates a snapshot publication record.
fn parse_archive_snapshot_record(
    state: &mut ArchiveState,
    body: &[u8],
) -> Result<(), DurableLogError> {
    let mut cursor = 0;
    let operation_id = OperationId::new(Bytes::copy_from_slice(read_archive_field(
        body,
        &mut cursor,
        "truncated archive snapshot operation identity",
    )?))
    .map_err(|_| DurableLogError::Corrupt("empty archive snapshot operation identity"))?;
    let id = SnapshotId::from_bytes(Bytes::copy_from_slice(read_archive_field(
        body,
        &mut cursor,
        "truncated archive snapshot identity",
    )?));
    let parent = match read_archive_byte(body, &mut cursor, "truncated snapshot parent tag")? {
        0 => None,
        1 => Some(SnapshotId::from_bytes(Bytes::copy_from_slice(
            read_archive_field(body, &mut cursor, "truncated archive snapshot parent")?,
        ))),
        _ => return Err(DurableLogError::Corrupt("invalid snapshot parent tag")),
    };
    let at_event = match read_archive_byte(body, &mut cursor, "truncated snapshot position tag")? {
        0 => ArchiveSnapshotPosition::Initial,
        1 => ArchiveSnapshotPosition::At(EventPosition::from_bytes(read_archive_array::<8>(
            body,
            &mut cursor,
            "truncated archive snapshot position",
        )?)),
        _ => return Err(DurableLogError::Corrupt("invalid snapshot position tag")),
    };
    let root = decode_tree_id(body, &mut cursor)?;
    if cursor != body.len() {
        return Err(DurableLogError::Corrupt(
            "archive snapshot has trailing bytes",
        ));
    }
    let snapshot = ArchiveSnapshot { at_event, root };
    let publication = SnapshotPublication {
        operation_id: operation_id.clone(),
        expected_parent: parent.clone(),
        snapshot: snapshot.clone(),
    };
    let published = ArchivePublishedSnapshot {
        id,
        parent,
        snapshot,
    };
    if let Some((original, existing)) = state.snapshot_operations.get(&operation_id) {
        return if original == &publication && existing == &published {
            Ok(())
        } else {
            Err(DurableLogError::Corrupt(
                "conflicting snapshot operation identity",
            ))
        };
    }
    if published.id != archive_snapshot_id(state.next_snapshot_id) {
        return Err(DurableLogError::Corrupt(
            "archive snapshot ids are not contiguous",
        ));
    }
    if state.snapshots.last().map(|snapshot| &snapshot.id) != published.parent.as_ref() {
        return Err(DurableLogError::Corrupt("invalid archive snapshot lineage"));
    }
    if let ArchiveSnapshotPosition::At(position) = at_event {
        DurableLog::validate_archive_position(position, state.events.len())
            .map_err(|_| DurableLogError::Corrupt("invalid archive snapshot position"))?;
    }
    if state
        .snapshots
        .last()
        .is_some_and(|previous| previous.snapshot.at_event > at_event)
    {
        return Err(DurableLogError::Corrupt(
            "archive snapshot position regressed",
        ));
    }
    DurableLog::validate_tree(state, root)
        .map_err(|_| DurableLogError::Corrupt("archive snapshot has a missing tree"))?;
    state.snapshots.push(published.clone());
    state
        .snapshot_operations
        .insert(operation_id, (publication, published));
    state.next_snapshot_id =
        state
            .next_snapshot_id
            .checked_add(1)
            .ok_or(DurableLogError::Corrupt(
                "archive snapshot id range exhausted",
            ))?;
    Ok(())
}

/// Selects the latest snapshot whose event boundary does not exceed `position`.
fn select_archive_snapshot(
    snapshots: &[ArchivePublishedSnapshot],
    position: EventPosition,
) -> Option<ArchivePublishedSnapshot> {
    snapshots
        .iter()
        .rev()
        .find(|snapshot| match snapshot.snapshot.at_event {
            ArchiveSnapshotPosition::Initial => true,
            ArchiveSnapshotPosition::At(at_event) => at_event <= position,
        })
        .cloned()
}

/// Decodes a required tagged blob-tree identity and advances `cursor`.
fn decode_tree_id(bytes: &[u8], cursor: &mut usize) -> Result<BlobTreeId, DurableLogError> {
    let tag = read_archive_byte(bytes, cursor, "truncated tree identity tag")?;
    let id = read_archive_array::<32>(bytes, cursor, "truncated tree identity")?;
    match tag {
        0 => BlobId::from_bytes(&id)
            .map(BlobTreeId::Blob)
            .map_err(|_| DurableLogError::Corrupt("invalid blob identity")),
        1 => BlobDirectoryId::from_bytes(&id)
            .map(BlobTreeId::Directory)
            .map_err(|_| DurableLogError::Corrupt("invalid directory identity")),
        _ => Err(DurableLogError::Corrupt("invalid tree identity tag")),
    }
}

/// Decodes an optional tagged blob-tree identity and advances `cursor`.
fn decode_optional_tree_id(
    bytes: &[u8],
    cursor: &mut usize,
) -> Result<Option<BlobTreeId>, DurableLogError> {
    match read_archive_byte(bytes, cursor, "truncated optional tree identity tag")? {
        0 => Ok(None),
        1 => Ok(Some(BlobTreeId::Blob(
            BlobId::from_bytes(&read_archive_array::<32>(
                bytes,
                cursor,
                "truncated blob identity",
            )?)
            .map_err(|_| DurableLogError::Corrupt("invalid blob identity"))?,
        ))),
        2 => Ok(Some(BlobTreeId::Directory(
            BlobDirectoryId::from_bytes(&read_archive_array::<32>(
                bytes,
                cursor,
                "truncated directory identity",
            )?)
            .map_err(|_| DurableLogError::Corrupt("invalid directory identity"))?,
        ))),
        _ => Err(DurableLogError::Corrupt(
            "invalid optional tree identity tag",
        )),
    }
}

/// Reads one byte from an archive record and advances `cursor`.
fn read_archive_byte(
    bytes: &[u8],
    cursor: &mut usize,
    error: &'static str,
) -> Result<u8, DurableLogError> {
    let value = *bytes.get(*cursor).ok_or(DurableLogError::Corrupt(error))?;
    *cursor += 1;
    Ok(value)
}

/// Reads a fixed-size array from an archive record and advances `cursor`.
fn read_archive_array<const N: usize>(
    bytes: &[u8],
    cursor: &mut usize,
    error: &'static str,
) -> Result<[u8; N], DurableLogError> {
    let end = cursor
        .checked_add(N)
        .ok_or(DurableLogError::Corrupt(error))?;
    let value = bytes
        .get(*cursor..end)
        .ok_or(DurableLogError::Corrupt(error))?;
    *cursor = end;
    value
        .try_into()
        .map_err(|_| DurableLogError::Corrupt(error))
}

/// Reads a length-prefixed byte field from an archive record and advances `cursor`.
fn read_archive_field<'a>(
    bytes: &'a [u8],
    cursor: &mut usize,
    error: &'static str,
) -> Result<&'a [u8], DurableLogError> {
    let length = u32::from_be_bytes(read_archive_array::<4>(bytes, cursor, error)?);
    let length = usize::try_from(length).map_err(|_| DurableLogError::Corrupt(error))?;
    let end = cursor
        .checked_add(length)
        .ok_or(DurableLogError::Corrupt(error))?;
    let value = bytes
        .get(*cursor..end)
        .ok_or(DurableLogError::Corrupt(error))?;
    *cursor = end;
    Ok(value)
}

#[cfg(test)]
mod current_tests {
    use std::{
        fs,
        io::Write,
        sync::Arc,
        sync::atomic::{AtomicU64, Ordering},
    };

    use bytes::Bytes;
    use sea_core::{
        BlobTreeId, Event,
        archive::{
            OperationId, SeaStorage, Snapshot as ArchiveSnapshot,
            SnapshotPosition as ArchiveSnapshotPosition, SnapshotPublication,
        },
    };

    use super::{
        CrashInjector, CrashPoint, DurableLog, DurableLogError, FRAME_HEADER_LEN, HEADER_LEN,
    };

    static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(1);

    fn directory(label: &str) -> std::path::PathBuf {
        let id = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "sea-durable-current-{}-{label}-{id}",
            std::process::id()
        ))
    }

    #[tokio::test]
    async fn passes_storage_conformance() {
        let directories = std::sync::Mutex::new(Vec::new());
        sea_conformance::run_sea_storage_conformance(|| {
            let root = directory("conformance");
            directories.lock().unwrap().push(root.clone());
            DurableLog::open(root).unwrap()
        })
        .await;
        for root in directories.into_inner().unwrap() {
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[tokio::test]
    async fn clean_reopen_preserves_events() {
        let root = directory("reopen");
        let storage = DurableLog::open(&root).unwrap();
        let receipt = storage
            .append(Event {
                payload: Bytes::from_static(b"persisted"),
                blob_tree: None,
            })
            .await
            .unwrap();
        drop(storage);
        let reopened = DurableLog::open(&root).unwrap();
        assert_eq!(reopened.head().await.unwrap(), Some(receipt.position));
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn crash_recovery_distinguishes_incomplete_and_synced_appends() {
        let incomplete_root = directory("crash-incomplete-append");
        let storage = DurableLog::open_with_crash_injector(
            &incomplete_root,
            Arc::new(CrashInjector::new([CrashPoint::RecordAfterHeaderWrite])),
        )
        .unwrap();
        let error = storage
            .append(Event {
                payload: Bytes::from_static(b"incomplete"),
                blob_tree: None,
            })
            .await
            .unwrap_err();
        assert!(matches!(error, DurableLogError::AmbiguousAppend(_)));
        drop(storage);
        let reopened = DurableLog::open(&incomplete_root).unwrap();
        assert_eq!(reopened.head().await.unwrap(), None);
        drop(reopened);
        fs::remove_dir_all(incomplete_root).unwrap();

        let synced_root = directory("crash-synced-append");
        let storage = DurableLog::open_with_crash_injector(
            &synced_root,
            Arc::new(CrashInjector::new([CrashPoint::RecordAfterSync])),
        )
        .unwrap();
        let error = storage
            .append(Event {
                payload: Bytes::from_static(b"synced"),
                blob_tree: None,
            })
            .await
            .unwrap_err();
        assert!(matches!(error, DurableLogError::AmbiguousAppend(_)));
        drop(storage);
        let reopened = DurableLog::open(&synced_root).unwrap();
        assert_eq!(
            reopened.head().await.unwrap(),
            Some(sea_core::EventPosition::new(1))
        );
        drop(reopened);
        fs::remove_dir_all(synced_root).unwrap();
    }

    #[tokio::test]
    async fn reopen_resolves_snapshot_after_post_sync_ambiguity() {
        let root = directory("crash-synced-snapshot");
        let storage = DurableLog::open(&root).unwrap();
        let blob = storage
            .put_blob(Bytes::from_static(b"snapshot-root"))
            .await
            .unwrap();
        drop(storage);

        let storage = DurableLog::open_with_crash_injector(
            &root,
            Arc::new(CrashInjector::new([CrashPoint::RecordAfterSync])),
        )
        .unwrap();
        let operation_id = OperationId::new(Bytes::from_static(b"ambiguous-snapshot")).unwrap();
        let publication = SnapshotPublication {
            operation_id: operation_id.clone(),
            expected_parent: None,
            snapshot: ArchiveSnapshot {
                at_event: ArchiveSnapshotPosition::Initial,
                root: BlobTreeId::Blob(blob),
            },
        };
        let error = storage.publish_snapshot(publication).await.unwrap_err();
        assert!(matches!(error, DurableLogError::AmbiguousSnapshot(_)));
        drop(storage);

        let reopened = DurableLog::open(&root).unwrap();
        let resolved = reopened
            .resolve_snapshot_publication(&operation_id)
            .await
            .unwrap()
            .expect("synced snapshot should be recovered by operation identity");
        assert_eq!(reopened.latest_snapshot().await.unwrap(), Some(resolved));
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn reopen_discards_incomplete_tail() {
        let root = directory("incomplete-tail");
        let storage = DurableLog::open(&root).unwrap();
        let receipt = storage
            .append(Event {
                payload: Bytes::from_static(b"committed"),
                blob_tree: None,
            })
            .await
            .unwrap();
        let archive_path = storage.archive_path().to_owned();
        drop(storage);

        let committed_length = fs::metadata(&archive_path).unwrap().len();
        fs::OpenOptions::new()
            .append(true)
            .open(&archive_path)
            .unwrap()
            .write_all(b"partial frame")
            .unwrap();

        let reopened = DurableLog::open(&root).unwrap();
        assert_eq!(reopened.head().await.unwrap(), Some(receipt.position));
        assert_eq!(fs::metadata(&archive_path).unwrap().len(), committed_length);
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn reopen_rejects_checksum_mismatch() {
        let root = directory("checksum-mismatch");
        let storage = DurableLog::open(&root).unwrap();
        storage
            .append(Event {
                payload: Bytes::from_static(b"committed"),
                blob_tree: None,
            })
            .await
            .unwrap();
        let archive_path = storage.archive_path().to_owned();
        drop(storage);

        let mut bytes = fs::read(&archive_path).unwrap();
        bytes[HEADER_LEN + FRAME_HEADER_LEN] ^= 1;
        fs::write(&archive_path, bytes).unwrap();

        let error = DurableLog::open(&root).unwrap_err();
        assert!(matches!(
            error,
            super::DurableLogError::Corrupt("record checksum mismatch")
        ));
        fs::remove_dir_all(root).unwrap();
    }
}
