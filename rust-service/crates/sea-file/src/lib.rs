#![doc = "A minimal buffered file implementation of the Sea event archive contracts."]
#![doc = ""]
#![doc = "The stream and snapshot logs use fixed headers followed by big-endian"]
#![doc = "length-framed records. Successful writes are flushed through `BufWriter`,"]
#![doc = "but are not synced. Receipts therefore report only buffered durability."]
#![doc = "Opening a store validates every byte and rejects incomplete or invalid data;"]
#![doc = "this crate deliberately provides no crash recovery or repair."]

use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{BufWriter, Read, Write},
    path::Path,
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

const ARCHIVE_MAGIC: [u8; 8] = *b"SEAARC01";
const HEADER_LEN: usize = 8;
const ARCHIVE_FILE: &str = "archive.log";
const ARCHIVE_BLOB: u8 = 1;
const ARCHIVE_DIRECTORY: u8 = 2;
const ARCHIVE_EVENT: u8 = 3;
const ARCHIVE_SNAPSHOT: u8 = 4;

#[cfg(any())]
/// An obsolete one-based record ordinal within the legacy file stream.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FilePosition {
    ordinal: u64,
}

#[cfg(any())]
impl FilePosition {
    /// Returns the one-based record index within the file stream.
    #[must_use]
    pub const fn ordinal(&self) -> u64 {
        self.ordinal
    }
}

/// Errors returned by the minimal file implementation.
#[derive(Debug, Error)]
pub enum FileError {
    /// A filesystem operation failed.
    #[error("file I/O failed: {0}")]
    Io(#[from] std::io::Error),
    /// Persisted bytes violate the file format or internal range constraints.
    #[error("stored data is corrupt: {0}")]
    Corrupt(&'static str),
    /// A position does not identify a committed record.
    #[error("position is beyond the committed head")]
    InvalidPosition,
    /// The supplied expected parent is not the latest snapshot.
    #[error("snapshot parent does not match the latest snapshot")]
    SnapshotConflict,
    /// A snapshot includes fewer records than its predecessor.
    #[error("snapshot position regresses behind the latest snapshot")]
    SnapshotRegression,
    /// Another thread panicked while holding the store mutex.
    #[error("file store mutex was poisoned")]
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

impl ClassifiedError for FileError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Io(_) | Self::Poisoned => ErrorKind::Unavailable,
            Self::Corrupt(_) => ErrorKind::Corrupt,
            Self::InvalidPosition => ErrorKind::InvalidPosition,
            Self::SnapshotConflict | Self::SnapshotRegression | Self::OperationConflict => {
                ErrorKind::Conflict
            }
            Self::MissingBlobTree | Self::IdentityExhausted => ErrorKind::Rejected,
        }
    }
}

/// Recovered final-contract state from the append-only archive journal.
#[derive(Debug, Default)]
struct ArchiveState {
    events: Vec<ArchiveCommittedEvent>,
    blobs: BTreeMap<BlobId, Bytes>,
    directories: BTreeMap<BlobDirectoryId, BlobDirectory>,
    snapshots: Vec<ArchivePublishedSnapshot>,
    snapshot_operations: BTreeMap<OperationId, (SnapshotPublication, ArchivePublishedSnapshot)>,
    next_snapshot_id: u64,
}

/// Parsed records and append handles protected by the store mutex.
#[derive(Debug)]
struct State {
    /// Current Sea archive state reconstructed from its journal.
    archive: ArchiveState,
    /// Append-only buffered writer for final Sea archive records.
    archive_writer: BufWriter<File>,
}

/// A single-process buffered file stream.
///
/// One instance owns a directory containing `stream.log` and `snapshots.log`.
/// Reopening that directory after clean use preserves positions and snapshots.
/// Concurrent independent opens of the same directory are unsupported.
#[derive(Clone, Debug)]
pub struct FileStream {
    /// Parsed state and writers shared by cloned handles.
    state: Arc<Mutex<State>>,
}

impl FileStream {
    /// Opens an existing store or creates a new store in `directory`.
    ///
    /// Existing files must be complete and valid. No damaged tail is discarded.
    ///
    /// # Errors
    ///
    /// Returns an I/O error when the directory or files cannot be accessed, or
    /// a corruption error when an existing file is incomplete or invalid.
    pub fn open(directory: impl AsRef<Path>) -> Result<Self, FileError> {
        fs::create_dir_all(directory.as_ref())?;
        let archive_path = directory.as_ref().join(ARCHIVE_FILE);
        let archive = if archive_path.exists() {
            parse_archive(&read_all(&archive_path)?)?
        } else {
            write_header(&archive_path, ARCHIVE_MAGIC)?;
            ArchiveState {
                next_snapshot_id: 1,
                ..ArchiveState::default()
            }
        };

        Ok(Self {
            state: Arc::new(Mutex::new(State {
                archive,
                archive_writer: append_writer(&archive_path)?,
            })),
        })
    }

    /// Acquires the shared state or classifies mutex poisoning.
    fn state(&self) -> Result<MutexGuard<'_, State>, FileError> {
        self.state.lock().map_err(|_| FileError::Poisoned)
    }

    #[cfg(any())]
    /// Rejects zero and beyond-head legacy positions.
    fn validate_position(position: &FilePosition, len: usize) -> Result<(), FileError> {
        let len = u64::try_from(len).map_err(|_| FileError::InvalidPosition)?;
        if position.ordinal == 0 || position.ordinal > len {
            return Err(FileError::InvalidPosition);
        }
        Ok(())
    }

    #[cfg(any())]
    /// Resolves a one-based event ordinal in the legacy stream.
    ///
    /// # Errors
    ///
    /// Returns [`FileError::InvalidPosition`] when the ordinal is not committed.
    pub fn position_at(&self, ordinal: u64) -> Result<FilePosition, FileError> {
        let position = FilePosition { ordinal };
        Self::validate_position(&position, self.state()?.records.len())?;
        Ok(position)
    }

    fn validate_archive_position(position: EventPosition, len: usize) -> Result<(), FileError> {
        let len = u64::try_from(len).map_err(|_| FileError::InvalidPosition)?;
        if position.get() == 0 || position.get() > len {
            return Err(FileError::InvalidPosition);
        }
        Ok(())
    }

    fn validate_tree(state: &ArchiveState, root: BlobTreeId) -> Result<(), FileError> {
        match root {
            BlobTreeId::Blob(id) => state
                .blobs
                .contains_key(&id)
                .then_some(())
                .ok_or(FileError::MissingBlobTree),
            BlobTreeId::Directory(id) => {
                let directory = state
                    .directories
                    .get(&id)
                    .ok_or(FileError::MissingBlobTree)?;
                for child in directory.entries().values() {
                    Self::validate_tree(state, *child)?;
                }
                Ok(())
            }
        }
    }
}

#[async_trait]
impl sea_core::archive::SeaStorage for FileStream {
    type Error = FileError;

    fn durability(&self) -> Durability {
        Durability::Buffered
    }

    async fn put_blob(&self, payload: Bytes) -> Result<BlobId, Self::Error> {
        let mut state = self.state()?;
        let id = BlobId::for_bytes(&payload);
        if !state.archive.blobs.contains_key(&id) {
            let mut body = Vec::with_capacity(32 + payload.len());
            body.extend_from_slice(id.as_bytes());
            body.extend_from_slice(&payload);
            write_archive_record(&mut state.archive_writer, ARCHIVE_BLOB, &body)?;
            state.archive_writer.flush()?;
            state.archive.blobs.insert(id, payload);
        }
        Ok(id)
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        self.state()?
            .archive
            .blobs
            .get(&id)
            .cloned()
            .ok_or(FileError::MissingBlobTree)
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
            .map_err(|_| FileError::Corrupt("directory cannot be encoded"))?;
        if !state.archive.directories.contains_key(&id) {
            let encoded = directory
                .encode()
                .map_err(|_| FileError::Corrupt("directory cannot be encoded"))?;
            let mut body = Vec::with_capacity(32 + encoded.len());
            body.extend_from_slice(id.as_bytes());
            body.extend_from_slice(&encoded);
            write_archive_record(&mut state.archive_writer, ARCHIVE_DIRECTORY, &body)?;
            state.archive_writer.flush()?;
            state.archive.directories.insert(id, directory);
        }
        Ok(id)
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.state()?
            .archive
            .directories
            .get(&id)
            .cloned()
            .ok_or(FileError::MissingBlobTree)
    }

    async fn append(&self, event: Event) -> Result<ArchiveEventReceipt, Self::Error> {
        let mut state = self.state()?;
        if let Some(root) = event.blob_tree {
            Self::validate_tree(&state.archive, root)?;
        }
        let ordinal = u64::try_from(state.archive.events.len())
            .ok()
            .and_then(|value| value.checked_add(1))
            .ok_or(FileError::IdentityExhausted)?;
        let position = EventPosition::new(ordinal);
        let body = encode_archive_event(position, &event);
        write_archive_record(&mut state.archive_writer, ARCHIVE_EVENT, &body)?;
        state.archive_writer.flush()?;
        state
            .archive
            .events
            .push(ArchiveCommittedEvent { position, event });
        Ok(ArchiveEventReceipt {
            position,
            durability: Durability::Buffered,
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
            .map_err(|_| FileError::InvalidPosition)?
            .unwrap_or(0);
        let end = through
            .map(|position| usize::try_from(position.get()))
            .transpose()
            .map_err(|_| FileError::InvalidPosition)?
            .unwrap_or(state.archive.events.len());
        if end < start {
            return Err(FileError::InvalidPosition);
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
                Err(FileError::OperationConflict)
            };
        }
        let actual_parent = state.archive.snapshots.last().map(|snapshot| &snapshot.id);
        if actual_parent != publication.expected_parent.as_ref() {
            return Err(FileError::SnapshotConflict);
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
            return Err(FileError::SnapshotRegression);
        }
        Self::validate_tree(&state.archive, publication.snapshot.root)?;
        let id_number = state.archive.next_snapshot_id;
        let id = snapshot_id(id_number);
        let published = ArchivePublishedSnapshot {
            id,
            parent: publication.expected_parent.clone(),
            snapshot: publication.snapshot.clone(),
        };
        let body = encode_archive_snapshot(&publication, &published)?;
        write_archive_record(&mut state.archive_writer, ARCHIVE_SNAPSHOT, &body)?;
        state.archive_writer.flush()?;
        state.archive.next_snapshot_id = id_number
            .checked_add(1)
            .ok_or(FileError::IdentityExhausted)?;
        state.archive.snapshots.push(published.clone());
        state.archive.snapshot_operations.insert(
            publication.operation_id.clone(),
            (publication, published.clone()),
        );
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
                usize::try_from(position.get()).map_err(|_| FileError::InvalidPosition)?
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

#[cfg(any())]
#[async_trait]
impl EventStream for FileStream {
    type Position = FilePosition;
    type Error = FileError;

    fn capabilities(&self) -> Capabilities {
        Capabilities::NONE.with(sea_core::Capability::PositionSerialization)
    }

    async fn append(&self, value: Bytes) -> Result<EventReceipt<Self::Position>, Self::Error> {
        let mut state = self.state()?;
        write_frame(&mut state.stream_writer, &value)?;
        state.stream_writer.flush()?;
        state.records.push(value);
        let ordinal = u64::try_from(state.records.len())
            .map_err(|_| FileError::Corrupt("record count exceeds position range"))?;
        Ok(EventReceipt {
            position: FilePosition { ordinal },
            durability: Durability::Buffered,
        })
    }

    async fn read(
        &self,
        after: Option<&Self::Position>,
    ) -> Result<StreamReader<Self::Position, Self::Error>, Self::Error> {
        let state = self.state()?;
        let start = match after {
            Some(position) => {
                Self::validate_position(position, state.records.len())?;
                usize::try_from(position.ordinal).map_err(|_| FileError::InvalidPosition)?
            }
            None => 0,
        };
        let end = state.records.len();
        drop(state);

        let shared = Arc::clone(&self.state);
        Ok(Box::pin(stream::unfold(start, move |index| {
            let shared = Arc::clone(&shared);
            async move {
                if index >= end {
                    return None;
                }
                let result = shared
                    .lock()
                    .map_err(|_| FileError::Poisoned)
                    .and_then(|state| {
                        let ordinal = u64::try_from(index + 1).map_err(|_| {
                            FileError::Corrupt("record count exceeds position range")
                        })?;
                        Ok(CommittedEvent {
                            position: FilePosition { ordinal },
                            payload: state.records[index].clone(),
                        })
                    });
                Some((result, index + 1))
            }
        })))
    }

    async fn head(&self) -> Result<Option<Self::Position>, Self::Error> {
        let len = self.state()?.records.len();
        let ordinal = u64::try_from(len)
            .map_err(|_| FileError::Corrupt("record count exceeds position range"))?;
        Ok((ordinal > 0).then_some(FilePosition { ordinal }))
    }
}

#[cfg(any())]
impl PositionCodec for FileStream {
    fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error> {
        Self::validate_position(position, self.state()?.records.len())?;
        Ok(Bytes::copy_from_slice(&position.ordinal.to_be_bytes()))
    }

    fn decode_position(&self, token: &[u8]) -> Result<Self::Position, Self::Error> {
        let token: [u8; 8] = token.try_into().map_err(|_| FileError::InvalidPosition)?;
        let position = FilePosition {
            ordinal: u64::from_be_bytes(token),
        };
        Self::validate_position(&position, self.state()?.records.len())?;
        Ok(position)
    }
}

#[cfg(any())]
#[async_trait]
impl SnapshotStore for FileStream {
    type Position = FilePosition;
    type Error = FileError;

    async fn latest(&self) -> Result<Option<PublishedSnapshot<Self::Position>>, Self::Error> {
        Ok(self.state()?.latest_snapshot.clone())
    }

    async fn publish(
        &self,
        snapshot: Snapshot<Self::Position>,
        expected_parent: Option<&SnapshotId>,
    ) -> Result<SnapshotId, Self::Error> {
        let mut state = self.state()?;
        if state.latest_snapshot.as_ref().map(|value| &value.id) != expected_parent {
            return Err(FileError::SnapshotConflict);
        }
        if let SnapshotPosition::At(position) = &snapshot.at_event {
            Self::validate_position(position, state.records.len())?;
        }
        let previous_ordinal = state
            .latest_snapshot
            .as_ref()
            .map_or(0, |published| snapshot_ordinal(&published.snapshot));
        let next_ordinal = snapshot_ordinal(&snapshot);
        if next_ordinal < previous_ordinal {
            return Err(FileError::SnapshotRegression);
        }

        let id_number = state.next_snapshot_id;
        write_snapshot(
            &mut state.snapshot_writer,
            id_number,
            next_ordinal,
            &snapshot.payload,
        )?;
        state.snapshot_writer.flush()?;
        let id = snapshot_id(id_number);
        state.next_snapshot_id = id_number
            .checked_add(1)
            .ok_or(FileError::Corrupt("snapshot id range exhausted"))?;
        state.latest_snapshot = Some(PublishedSnapshot {
            id: id.clone(),
            snapshot,
        });
        Ok(id)
    }
}

/// Converts an initial or positioned snapshot to its persisted ordinal.
#[cfg(any())]
fn snapshot_ordinal(snapshot: &Snapshot<FilePosition>) -> u64 {
    match &snapshot.at_event {
        SnapshotPosition::Initial => 0,
        SnapshotPosition::At(position) => position.ordinal,
    }
}

/// Encodes a numeric snapshot identity as opaque bytes.
fn snapshot_id(value: u64) -> SnapshotId {
    SnapshotId::from_bytes(Bytes::copy_from_slice(&value.to_be_bytes()))
}

/// Reads a complete store file for strict validation during open.
fn read_all(path: &Path) -> Result<Vec<u8>, FileError> {
    let mut bytes = Vec::new();
    File::open(path)?.read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Creates and flushes a store file header.
fn write_header(path: &Path, magic: [u8; 8]) -> Result<(), FileError> {
    let mut writer = BufWriter::new(File::create(path)?);
    writer.write_all(&magic)?;
    writer.flush()?;
    Ok(())
}

/// Opens a buffered append handle for an initialized store file.
fn append_writer(path: &Path) -> Result<BufWriter<File>, FileError> {
    Ok(BufWriter::new(OpenOptions::new().append(true).open(path)?))
}

/// Validates a file header.
fn parse_header(bytes: &[u8], magic: [u8; 8]) -> Result<(), FileError> {
    if bytes.len() < HEADER_LEN {
        return Err(FileError::Corrupt("incomplete file header"));
    }
    if bytes[..8] != magic {
        return Err(FileError::Corrupt("invalid file header"));
    }
    Ok(())
}

/// Strictly parses every length-framed stream record.
#[cfg(any())]
fn parse_stream(bytes: &[u8]) -> Result<Vec<Bytes>, FileError> {
    parse_header(bytes, STREAM_MAGIC)?;
    let mut cursor = HEADER_LEN;
    let mut records = Vec::new();
    while cursor < bytes.len() {
        records.push(Bytes::copy_from_slice(read_frame(bytes, &mut cursor)?));
    }
    Ok(records)
}

/// Strictly parses snapshots and validates IDs and monotonic positions.
#[cfg(any())]
fn parse_snapshots(
    bytes: &[u8],
    record_count: usize,
) -> Result<(Option<PublishedSnapshot<FilePosition>>, u64), FileError> {
    parse_header(bytes, SNAPSHOT_MAGIC)?;
    let record_count = u64::try_from(record_count)
        .map_err(|_| FileError::Corrupt("record count exceeds position range"))?;
    let mut cursor = HEADER_LEN;
    let mut latest = None;
    let mut expected_id = 1_u64;
    let mut previous_ordinal = 0_u64;
    while cursor < bytes.len() {
        let id = read_u64(bytes, &mut cursor, "incomplete snapshot id")?;
        if id != expected_id {
            return Err(FileError::Corrupt("snapshot ids are not contiguous"));
        }
        let ordinal = read_u64(bytes, &mut cursor, "incomplete snapshot position")?;
        if ordinal > record_count || ordinal < previous_ordinal {
            return Err(FileError::Corrupt("invalid snapshot position"));
        }
        let payload = Bytes::copy_from_slice(read_frame(bytes, &mut cursor)?);
        latest = Some(PublishedSnapshot {
            id: snapshot_id(id),
            snapshot: Snapshot {
                at_event: if ordinal == 0 {
                    SnapshotPosition::Initial
                } else {
                    SnapshotPosition::At(FilePosition { ordinal })
                },
                payload,
            },
        });
        previous_ordinal = ordinal;
        expected_id = id
            .checked_add(1)
            .ok_or(FileError::Corrupt("snapshot id range exhausted"))?;
    }
    Ok((latest, expected_id))
}

/// Reads one big-endian integer while advancing a checked cursor.
fn read_u64(bytes: &[u8], cursor: &mut usize, error: &'static str) -> Result<u64, FileError> {
    let end = cursor.checked_add(8).ok_or(FileError::Corrupt(error))?;
    let value = bytes.get(*cursor..end).ok_or(FileError::Corrupt(error))?;
    *cursor = end;
    Ok(u64::from_be_bytes(
        value.try_into().map_err(|_| FileError::Corrupt(error))?,
    ))
}

/// Reads one length-prefixed frame without accepting an incomplete payload.
fn read_frame<'a>(bytes: &'a [u8], cursor: &mut usize) -> Result<&'a [u8], FileError> {
    let length = read_u64(bytes, cursor, "incomplete frame header")?;
    let length = usize::try_from(length).map_err(|_| FileError::Corrupt("frame is too large"))?;
    let end = cursor
        .checked_add(length)
        .ok_or(FileError::Corrupt("frame is too large"))?;
    let payload = bytes
        .get(*cursor..end)
        .ok_or(FileError::Corrupt("incomplete frame payload"))?;
    *cursor = end;
    Ok(payload)
}

/// Writes one big-endian length-prefixed payload.
fn write_frame(writer: &mut impl Write, payload: &[u8]) -> Result<(), FileError> {
    let length = u64::try_from(payload.len())
        .map_err(|_| FileError::Corrupt("payload exceeds frame length range"))?;
    writer.write_all(&length.to_be_bytes())?;
    writer.write_all(payload)?;
    Ok(())
}

/// Writes one snapshot record in the persisted log format.
#[cfg(any())]
fn write_snapshot(
    writer: &mut impl Write,
    id: u64,
    ordinal: u64,
    payload: &[u8],
) -> Result<(), FileError> {
    writer.write_all(&id.to_be_bytes())?;
    writer.write_all(&ordinal.to_be_bytes())?;
    write_frame(writer, payload)
}

/// Appends one typed record to the final Sea archive journal.
fn write_archive_record(writer: &mut impl Write, kind: u8, body: &[u8]) -> Result<(), FileError> {
    let mut record = Vec::with_capacity(1 + body.len());
    record.push(kind);
    record.extend_from_slice(body);
    write_frame(writer, &record)
}

/// Encodes one final-contract event record.
fn encode_archive_event(position: EventPosition, event: &Event) -> Vec<u8> {
    let mut body = Vec::with_capacity(8 + 33 + event.payload.len());
    body.extend_from_slice(&position.to_bytes());
    encode_optional_tree_id(&mut body, event.blob_tree);
    body.extend_from_slice(&event.payload);
    body
}

/// Encodes one final-contract snapshot publication record.
fn encode_archive_snapshot(
    publication: &SnapshotPublication,
    published: &ArchivePublishedSnapshot,
) -> Result<Vec<u8>, FileError> {
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

/// Encodes one length-delimited byte field.
fn encode_field(output: &mut Vec<u8>, value: &[u8]) -> Result<(), FileError> {
    let length = u32::try_from(value.len())
        .map_err(|_| FileError::Corrupt("archive field exceeds length range"))?;
    output.extend_from_slice(&length.to_be_bytes());
    output.extend_from_slice(value);
    Ok(())
}

/// Encodes a typed tree identity.
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

/// Encodes an optional typed tree identity.
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

/// Strictly replays every record in the final Sea archive journal.
fn parse_archive(bytes: &[u8]) -> Result<ArchiveState, FileError> {
    parse_header(bytes, ARCHIVE_MAGIC)?;
    let mut state = ArchiveState {
        next_snapshot_id: 1,
        ..ArchiveState::default()
    };
    let mut cursor = HEADER_LEN;
    while cursor < bytes.len() {
        let record = read_frame(bytes, &mut cursor)?;
        let (&kind, body) = record
            .split_first()
            .ok_or(FileError::Corrupt("empty archive record"))?;
        parse_archive_record(&mut state, kind, body)?;
    }
    Ok(state)
}

/// Applies one validated archive journal record to recovered state.
fn parse_archive_record(state: &mut ArchiveState, kind: u8, body: &[u8]) -> Result<(), FileError> {
    match kind {
        ARCHIVE_BLOB => {
            let (id_bytes, payload) = body
                .split_at_checked(32)
                .ok_or(FileError::Corrupt("truncated archive blob"))?;
            let id = BlobId::from_bytes(id_bytes)
                .map_err(|_| FileError::Corrupt("invalid archive blob identity"))?;
            if BlobId::for_bytes(payload) != id {
                return Err(FileError::Corrupt("archive blob identity mismatch"));
            }
            if state
                .blobs
                .insert(id, Bytes::copy_from_slice(payload))
                .is_some()
            {
                return Err(FileError::Corrupt("duplicate archive blob record"));
            }
        }
        ARCHIVE_DIRECTORY => {
            let (id_bytes, encoded) = body
                .split_at_checked(32)
                .ok_or(FileError::Corrupt("truncated archive directory"))?;
            let id = BlobDirectoryId::from_bytes(id_bytes)
                .map_err(|_| FileError::Corrupt("invalid archive directory identity"))?;
            let directory = BlobDirectory::decode(encoded)
                .map_err(|_| FileError::Corrupt("invalid archive directory"))?;
            if directory
                .id()
                .map_err(|_| FileError::Corrupt("invalid archive directory"))?
                != id
            {
                return Err(FileError::Corrupt("archive directory identity mismatch"));
            }
            for child in directory.entries().values() {
                FileStream::validate_tree(state, *child)
                    .map_err(|_| FileError::Corrupt("archive directory has a missing child"))?;
            }
            if state.directories.insert(id, directory).is_some() {
                return Err(FileError::Corrupt("duplicate archive directory record"));
            }
        }
        ARCHIVE_EVENT => parse_archive_event(state, body)?,
        ARCHIVE_SNAPSHOT => parse_archive_snapshot(state, body)?,
        _ => return Err(FileError::Corrupt("unknown archive record kind")),
    }
    Ok(())
}

/// Decodes and applies one event journal record.
fn parse_archive_event(state: &mut ArchiveState, body: &[u8]) -> Result<(), FileError> {
    let mut cursor = 0;
    let position = EventPosition::from_bytes(read_array::<8>(
        body,
        &mut cursor,
        "truncated archive event position",
    )?);
    let expected = u64::try_from(state.events.len())
        .ok()
        .and_then(|value| value.checked_add(1))
        .ok_or(FileError::Corrupt(
            "archive event count exceeds position range",
        ))?;
    if position.get() != expected {
        return Err(FileError::Corrupt(
            "archive event positions are not contiguous",
        ));
    }
    let blob_tree = decode_optional_tree_id(body, &mut cursor)?;
    if let Some(root) = blob_tree {
        FileStream::validate_tree(state, root)
            .map_err(|_| FileError::Corrupt("archive event has a missing tree"))?;
    }
    let event = Event {
        payload: Bytes::copy_from_slice(&body[cursor..]),
        blob_tree,
    };
    state.events.push(ArchiveCommittedEvent { position, event });
    Ok(())
}

/// Decodes and applies one snapshot-publication journal record.
fn parse_archive_snapshot(state: &mut ArchiveState, body: &[u8]) -> Result<(), FileError> {
    let mut cursor = 0;
    let operation_id = OperationId::new(Bytes::copy_from_slice(read_field(
        body,
        &mut cursor,
        "truncated archive snapshot operation identity",
    )?))
    .map_err(|_| FileError::Corrupt("empty archive snapshot operation identity"))?;
    if state.snapshot_operations.contains_key(&operation_id) {
        return Err(FileError::Corrupt("duplicate snapshot operation identity"));
    }
    let id = SnapshotId::from_bytes(Bytes::copy_from_slice(read_field(
        body,
        &mut cursor,
        "truncated archive snapshot identity",
    )?));
    if id != snapshot_id(state.next_snapshot_id) {
        return Err(FileError::Corrupt(
            "archive snapshot ids are not contiguous",
        ));
    }
    let parent = match read_byte(body, &mut cursor, "truncated snapshot parent tag")? {
        0 => None,
        1 => Some(SnapshotId::from_bytes(Bytes::copy_from_slice(read_field(
            body,
            &mut cursor,
            "truncated archive snapshot parent",
        )?))),
        _ => return Err(FileError::Corrupt("invalid archive snapshot parent tag")),
    };
    if state.snapshots.last().map(|snapshot| &snapshot.id) != parent.as_ref() {
        return Err(FileError::Corrupt("invalid archive snapshot lineage"));
    }
    let at_event = match read_byte(body, &mut cursor, "truncated snapshot position tag")? {
        0 => ArchiveSnapshotPosition::Initial,
        1 => ArchiveSnapshotPosition::At(EventPosition::from_bytes(read_array::<8>(
            body,
            &mut cursor,
            "truncated archive snapshot position",
        )?)),
        _ => return Err(FileError::Corrupt("invalid archive snapshot position tag")),
    };
    if let ArchiveSnapshotPosition::At(position) = at_event {
        FileStream::validate_archive_position(position, state.events.len())
            .map_err(|_| FileError::Corrupt("invalid archive snapshot position"))?;
    }
    if state
        .snapshots
        .last()
        .is_some_and(|previous| previous.snapshot.at_event > at_event)
    {
        return Err(FileError::Corrupt("archive snapshot position regressed"));
    }
    let root = decode_tree_id(body, &mut cursor)?;
    if cursor != body.len() {
        return Err(FileError::Corrupt("archive snapshot has trailing bytes"));
    }
    FileStream::validate_tree(state, root)
        .map_err(|_| FileError::Corrupt("archive snapshot has a missing tree"))?;
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
    state.snapshots.push(published.clone());
    state
        .snapshot_operations
        .insert(operation_id, (publication, published));
    state.next_snapshot_id = state
        .next_snapshot_id
        .checked_add(1)
        .ok_or(FileError::Corrupt("archive snapshot id range exhausted"))?;
    Ok(())
}

/// Returns the newest snapshot at or before one event position.
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

/// Decodes a typed tree identity.
fn decode_tree_id(bytes: &[u8], cursor: &mut usize) -> Result<BlobTreeId, FileError> {
    let tag = read_byte(bytes, cursor, "truncated tree identity tag")?;
    let id = read_array::<32>(bytes, cursor, "truncated tree identity")?;
    match tag {
        0 => BlobId::from_bytes(&id)
            .map(BlobTreeId::Blob)
            .map_err(|_| FileError::Corrupt("invalid blob identity")),
        1 => BlobDirectoryId::from_bytes(&id)
            .map(BlobTreeId::Directory)
            .map_err(|_| FileError::Corrupt("invalid directory identity")),
        _ => Err(FileError::Corrupt("invalid tree identity tag")),
    }
}

/// Decodes an optional typed tree identity.
fn decode_optional_tree_id(
    bytes: &[u8],
    cursor: &mut usize,
) -> Result<Option<BlobTreeId>, FileError> {
    match read_byte(bytes, cursor, "truncated optional tree identity tag")? {
        0 => Ok(None),
        1 => Ok(Some(BlobTreeId::Blob(
            BlobId::from_bytes(&read_array::<32>(bytes, cursor, "truncated blob identity")?)
                .map_err(|_| FileError::Corrupt("invalid blob identity"))?,
        ))),
        2 => Ok(Some(BlobTreeId::Directory(
            BlobDirectoryId::from_bytes(&read_array::<32>(
                bytes,
                cursor,
                "truncated directory identity",
            )?)
            .map_err(|_| FileError::Corrupt("invalid directory identity"))?,
        ))),
        _ => Err(FileError::Corrupt("invalid optional tree identity tag")),
    }
}

/// Reads one byte from a checked cursor.
fn read_byte(bytes: &[u8], cursor: &mut usize, error: &'static str) -> Result<u8, FileError> {
    let value = *bytes.get(*cursor).ok_or(FileError::Corrupt(error))?;
    *cursor += 1;
    Ok(value)
}

/// Reads one fixed-size byte array from a checked cursor.
fn read_array<const N: usize>(
    bytes: &[u8],
    cursor: &mut usize,
    error: &'static str,
) -> Result<[u8; N], FileError> {
    let end = cursor.checked_add(N).ok_or(FileError::Corrupt(error))?;
    let value = bytes.get(*cursor..end).ok_or(FileError::Corrupt(error))?;
    *cursor = end;
    value.try_into().map_err(|_| FileError::Corrupt(error))
}

/// Reads one 32-bit length-delimited field from a checked cursor.
fn read_field<'a>(
    bytes: &'a [u8],
    cursor: &mut usize,
    error: &'static str,
) -> Result<&'a [u8], FileError> {
    let length = u32::from_be_bytes(read_array::<4>(bytes, cursor, error)?);
    let length = usize::try_from(length).map_err(|_| FileError::Corrupt(error))?;
    let end = cursor
        .checked_add(length)
        .ok_or(FileError::Corrupt(error))?;
    let value = bytes.get(*cursor..end).ok_or(FileError::Corrupt(error))?;
    *cursor = end;
    Ok(value)
}

#[cfg(all(test, any()))]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };

    use futures_util::TryStreamExt;
    use sea_core::{ClassifiedError, EventStream, SnapshotStore};

    use super::*;

    static NEXT_TEST_DIRECTORY: AtomicU64 = AtomicU64::new(1);

    /// Creates a process-unique path for one file-store test.
    fn test_directory(label: &str) -> PathBuf {
        let id = NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!("sea-file-{}-{label}-{id}", std::process::id()))
    }

    #[tokio::test]
    async fn passes_shared_conformance() {
        let root = test_directory("conformance");
        let next = AtomicU64::new(1);
        sea_conformance::run_conformance(|| {
            let id = next.fetch_add(1, Ordering::Relaxed);
            FileStream::open(root.join(id.to_string())).expect("create conformance stream")
        })
        .await;
        fs::remove_dir_all(root).expect("remove conformance files");
    }

    #[tokio::test]
    async fn passes_final_storage_conformance() {
        let root = test_directory("archive-conformance");
        let next = AtomicU64::new(1);
        sea_conformance::run_sea_storage_conformance(|| {
            let id = next.fetch_add(1, Ordering::Relaxed);
            FileStream::open(root.join(id.to_string())).expect("create archive conformance store")
        })
        .await;
        fs::remove_dir_all(root).expect("remove archive conformance files");
    }

    #[tokio::test]
    async fn clean_reopen_preserves_final_archive_state() {
        use std::collections::BTreeMap;

        use sea_core::{
            BlobTreeId, Event,
            archive::{
                OperationId, SeaStorage, Snapshot as ArchiveSnapshot,
                SnapshotPosition as ArchiveSnapshotPosition, SnapshotPublication,
            },
        };

        let directory = test_directory("archive-reopen");
        let stream = FileStream::open(&directory).unwrap();
        let blob = SeaStorage::put_blob(&stream, Bytes::from_static(b"persisted"))
            .await
            .unwrap();
        let tree = SeaStorage::put_directory(
            &stream,
            BlobDirectory::new(BTreeMap::from([(
                "leaf".to_owned(),
                BlobTreeId::Blob(blob),
            )]))
            .unwrap(),
        )
        .await
        .unwrap();
        let event = SeaStorage::append(
            &stream,
            Event {
                payload: Bytes::from_static(b"event"),
                blob_tree: Some(BlobTreeId::Directory(tree)),
            },
        )
        .await
        .unwrap();
        let operation_id = OperationId::new(Bytes::from_static(b"persisted-publication")).unwrap();
        let published = SeaStorage::publish_snapshot(
            &stream,
            SnapshotPublication {
                operation_id: operation_id.clone(),
                expected_parent: None,
                snapshot: ArchiveSnapshot {
                    at_event: ArchiveSnapshotPosition::At(event.position),
                    root: BlobTreeId::Directory(tree),
                },
            },
        )
        .await
        .unwrap();
        drop(stream);

        let reopened = FileStream::open(&directory).unwrap();
        assert_eq!(
            SeaStorage::get_blob(&reopened, blob).await.unwrap(),
            Bytes::from_static(b"persisted")
        );
        assert_eq!(
            SeaStorage::head(&reopened).await.unwrap(),
            Some(event.position)
        );
        assert_eq!(
            SeaStorage::latest_snapshot(&reopened).await.unwrap(),
            Some(published.clone())
        );
        assert_eq!(
            SeaStorage::resolve_snapshot_publication(&reopened, &operation_id)
                .await
                .unwrap(),
            Some(published)
        );
        drop(reopened);
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn clean_reopen_preserves_records_positions_and_snapshot() {
        let directory = test_directory("reopen");
        let stream = FileStream::open(&directory).unwrap();
        let first = stream.append(Bytes::from_static(b"first")).await.unwrap();
        let second = stream.append(Bytes::from_static(b"second")).await.unwrap();
        assert_eq!(second.durability, Durability::Buffered);
        let snapshot_id = stream
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::At(first.position.clone()),
                    payload: Bytes::from_static(b"state-after-first"),
                },
                None,
            )
            .await
            .unwrap();
        drop(stream);

        let reopened = FileStream::open(&directory).unwrap();
        assert_eq!(reopened.head().await.unwrap(), Some(second.position));
        let records = reopened
            .read(Some(&first.position))
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].payload, Bytes::from_static(b"second"));
        let snapshot = reopened.latest().await.unwrap().unwrap();
        assert_eq!(snapshot.id, snapshot_id);
        assert_eq!(
            snapshot.snapshot.payload,
            Bytes::from_static(b"state-after-first")
        );
        drop(reopened);
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn persisted_size_matches_length_framing_for_10000_records() {
        const RECORD_COUNT: u64 = 10_000;
        const PAYLOAD_SIZE: usize = 64;

        let directory = test_directory("persisted-size");
        let stream = FileStream::open(&directory).unwrap();
        for _ in 0..RECORD_COUNT {
            stream
                .append(Bytes::from(vec![0x5a; PAYLOAD_SIZE]))
                .await
                .unwrap();
        }
        drop(stream);

        let stream_bytes = fs::metadata(directory.join(STREAM_FILE)).unwrap().len();
        let snapshot_bytes = fs::metadata(directory.join(SNAPSHOT_FILE)).unwrap().len();
        let expected_stream_bytes = u64::try_from(HEADER_LEN).unwrap()
            + RECORD_COUNT * (8 + u64::try_from(PAYLOAD_SIZE).unwrap());
        assert_eq!(stream_bytes, expected_stream_bytes);
        assert_eq!(snapshot_bytes, u64::try_from(HEADER_LEN).unwrap());
        assert_eq!(stream_bytes + snapshot_bytes, 720_016);
        let reopened = FileStream::open(&directory).unwrap();
        assert_eq!(
            reopened.head().await.unwrap().unwrap().ordinal,
            RECORD_COUNT
        );
        drop(reopened);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_invalid_stream_header() {
        let directory = test_directory("bad-header");
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join(STREAM_FILE), b"not-a-valid-header").unwrap();

        let error = FileStream::open(&directory).unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Corrupt);
        assert!(error.to_string().contains("header"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_incomplete_stream_payload() {
        let directory = test_directory("short-payload");
        let stream = FileStream::open(&directory).unwrap();
        drop(stream);
        let stream_path = directory.join(STREAM_FILE);
        let mut file = OpenOptions::new().append(true).open(stream_path).unwrap();
        file.write_all(&10_u64.to_be_bytes()).unwrap();
        file.write_all(b"short").unwrap();
        drop(file);

        let error = FileStream::open(&directory).unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Corrupt);
        assert!(error.to_string().contains("payload"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_incomplete_snapshot_record() {
        let directory = test_directory("short-snapshot");
        let stream = FileStream::open(&directory).unwrap();
        drop(stream);
        let snapshot_path = directory.join(SNAPSHOT_FILE);
        let mut file = OpenOptions::new().append(true).open(snapshot_path).unwrap();
        file.write_all(&1_u64.to_be_bytes()[..4]).unwrap();
        drop(file);

        let error = FileStream::open(&directory).unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Corrupt);
        assert!(error.to_string().contains("snapshot id"));
        fs::remove_dir_all(directory).unwrap();
    }
}

#[cfg(test)]
mod current_tests {
    use std::{
        fs,
        sync::atomic::{AtomicU64, Ordering},
    };

    use bytes::Bytes;
    use sea_core::{Event, archive::SeaStorage};

    use super::FileStream;

    static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(1);

    fn directory(label: &str) -> std::path::PathBuf {
        let id = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "sea-file-current-{}-{label}-{id}",
            std::process::id()
        ))
    }

    #[tokio::test]
    async fn passes_storage_conformance() {
        let root = directory("conformance");
        let next = AtomicU64::new(1);
        sea_conformance::run_sea_storage_conformance(|| {
            FileStream::open(root.join(next.fetch_add(1, Ordering::Relaxed).to_string())).unwrap()
        })
        .await;
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn clean_reopen_preserves_events() {
        let root = directory("reopen");
        let storage = FileStream::open(&root).unwrap();
        let receipt = storage
            .append(Event {
                payload: Bytes::from_static(b"persisted"),
                blob_tree: None,
            })
            .await
            .unwrap();
        drop(storage);
        let reopened = FileStream::open(&root).unwrap();
        assert_eq!(reopened.head().await.unwrap(), Some(receipt.position));
        fs::remove_dir_all(root).unwrap();
    }
}
