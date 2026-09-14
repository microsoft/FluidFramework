#![doc = "A minimal buffered file implementation of the snapshotted stream contracts."]
#![doc = ""]
#![doc = "The stream and snapshot logs use fixed headers followed by big-endian"]
#![doc = "length-framed records. Successful writes are flushed through `BufWriter`,"]
#![doc = "but are not synced. Receipts therefore report only buffered durability."]
#![doc = "Opening a store validates every byte and rejects incomplete or invalid data;"]
#![doc = "this crate deliberately provides no crash recovery or repair."]

use std::{
    fs::{self, File, OpenOptions},
    io::{BufWriter, Read, Write},
    path::Path,
    sync::{
        Arc, Mutex, MutexGuard,
        atomic::{AtomicU64, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::stream;
use snapshotted_stream_core::{
    AppendReceipt, AppendStream, Capabilities, ClassifiedError, Durability, ErrorKind,
    PublishedSnapshot, ReadRecord, Snapshot, SnapshotId, SnapshotPosition, SnapshotStore,
    StreamReader,
};
use thiserror::Error;

const STREAM_MAGIC: [u8; 8] = *b"SSTRM001";
const SNAPSHOT_MAGIC: [u8; 8] = *b"SSNAP001";
const HEADER_LEN: usize = 24;
const STREAM_FILE: &str = "stream.log";
const SNAPSHOT_FILE: &str = "snapshots.log";
static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);

/// An opaque ordinal tied to the generation persisted in a file store.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FilePosition {
    generation: u128,
    ordinal: u64,
}

impl FilePosition {
    /// Returns the one-based record index within this position's generation.
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
    /// A position belongs to another persisted stream generation.
    #[error("position belongs to another stream generation")]
    ForeignPosition,
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
}

impl ClassifiedError for FileError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Io(_) | Self::Poisoned => ErrorKind::Unavailable,
            Self::Corrupt(_) => ErrorKind::Corrupt,
            Self::ForeignPosition | Self::InvalidPosition => ErrorKind::InvalidPosition,
            Self::SnapshotConflict | Self::SnapshotRegression => ErrorKind::Conflict,
        }
    }
}

/// Parsed records and append handles protected by the store mutex.
#[derive(Debug)]
struct State {
    /// Records reconstructed at open and extended after successful flushes.
    records: Vec<Bytes>,
    /// Append-only buffered writer for stream records.
    stream_writer: BufWriter<File>,
    /// Latest snapshot reconstructed from the snapshot log.
    latest_snapshot: Option<PublishedSnapshot<FilePosition>>,
    /// Contiguous numeric identity for the next snapshot.
    next_snapshot_id: u64,
    /// Append-only buffered writer for snapshot records.
    snapshot_writer: BufWriter<File>,
}

/// A single-process buffered file stream.
///
/// One instance owns a directory containing `stream.log` and `snapshots.log`.
/// Reopening that directory after clean use preserves positions and snapshots.
/// Concurrent independent opens of the same directory are unsupported.
#[derive(Clone, Debug)]
pub struct FileStream {
    /// Persistent identity stored in both file headers.
    generation: u128,
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
        let stream_path = directory.as_ref().join(STREAM_FILE);
        let snapshot_path = directory.as_ref().join(SNAPSHOT_FILE);

        let (generation, records) = if stream_path.exists() {
            parse_stream(&read_all(&stream_path)?)?
        } else {
            let generation = new_generation()?;
            write_header(&stream_path, STREAM_MAGIC, generation)?;
            (generation, Vec::new())
        };
        let (latest_snapshot, next_snapshot_id) = if snapshot_path.exists() {
            parse_snapshots(&read_all(&snapshot_path)?, generation, records.len())?
        } else {
            write_header(&snapshot_path, SNAPSHOT_MAGIC, generation)?;
            (None, 1)
        };

        Ok(Self {
            generation,
            state: Arc::new(Mutex::new(State {
                records,
                stream_writer: append_writer(&stream_path)?,
                latest_snapshot,
                next_snapshot_id,
                snapshot_writer: append_writer(&snapshot_path)?,
            })),
        })
    }

    /// Acquires the shared state or classifies mutex poisoning.
    fn state(&self) -> Result<MutexGuard<'_, State>, FileError> {
        self.state.lock().map_err(|_| FileError::Poisoned)
    }

    /// Rejects foreign, zero, and beyond-head positions.
    fn validate_position(&self, position: &FilePosition, len: usize) -> Result<(), FileError> {
        if position.generation != self.generation {
            return Err(FileError::ForeignPosition);
        }
        let len = u64::try_from(len).map_err(|_| FileError::InvalidPosition)?;
        if position.ordinal == 0 || position.ordinal > len {
            return Err(FileError::InvalidPosition);
        }
        Ok(())
    }

    /// Resolves a one-based event ordinal in this stream generation.
    ///
    /// # Errors
    ///
    /// Returns [`FileError::InvalidPosition`] when the ordinal is not committed.
    pub fn position_at(&self, ordinal: u64) -> Result<FilePosition, FileError> {
        let position = FilePosition {
            generation: self.generation,
            ordinal,
        };
        self.validate_position(&position, self.state()?.records.len())?;
        Ok(position)
    }
}

#[async_trait]
impl AppendStream for FileStream {
    type Position = FilePosition;
    type Error = FileError;

    fn capabilities(&self) -> Capabilities {
        Capabilities::NONE
    }

    async fn append(&self, value: Bytes) -> Result<AppendReceipt<Self::Position>, Self::Error> {
        let mut state = self.state()?;
        write_frame(&mut state.stream_writer, &value)?;
        state.stream_writer.flush()?;
        state.records.push(value);
        let ordinal = u64::try_from(state.records.len())
            .map_err(|_| FileError::Corrupt("record count exceeds position range"))?;
        Ok(AppendReceipt {
            position: FilePosition {
                generation: self.generation,
                ordinal,
            },
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
                self.validate_position(position, state.records.len())?;
                usize::try_from(position.ordinal).map_err(|_| FileError::InvalidPosition)?
            }
            None => 0,
        };
        let end = state.records.len();
        drop(state);

        let generation = self.generation;
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
                        Ok(ReadRecord {
                            position: FilePosition {
                                generation,
                                ordinal,
                            },
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
        Ok((ordinal > 0).then_some(FilePosition {
            generation: self.generation,
            ordinal,
        }))
    }
}

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
        if let SnapshotPosition::At(position) = &snapshot.includes_through {
            self.validate_position(position, state.records.len())?;
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
fn snapshot_ordinal(snapshot: &Snapshot<FilePosition>) -> u64 {
    match &snapshot.includes_through {
        SnapshotPosition::Initial => 0,
        SnapshotPosition::At(position) => position.ordinal,
    }
}

/// Encodes a numeric snapshot identity as opaque bytes.
fn snapshot_id(value: u64) -> SnapshotId {
    SnapshotId::from_bytes(Bytes::copy_from_slice(&value.to_be_bytes()))
}

/// Produces a process-local generation candidate for a newly created store.
fn new_generation() -> Result<u128, FileError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| FileError::Corrupt("system clock is before the Unix epoch"))?
        .as_nanos();
    let process = u128::from(std::process::id()) << 64;
    let sequence = u128::from(NEXT_GENERATION.fetch_add(1, Ordering::Relaxed));
    Ok(timestamp ^ process ^ sequence)
}

/// Reads a complete store file for strict validation during open.
fn read_all(path: &Path) -> Result<Vec<u8>, FileError> {
    let mut bytes = Vec::new();
    File::open(path)?.read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Creates and flushes a store file header.
fn write_header(path: &Path, magic: [u8; 8], generation: u128) -> Result<(), FileError> {
    let mut writer = BufWriter::new(File::create(path)?);
    writer.write_all(&magic)?;
    writer.write_all(&generation.to_be_bytes())?;
    writer.flush()?;
    Ok(())
}

/// Opens a buffered append handle for an initialized store file.
fn append_writer(path: &Path) -> Result<BufWriter<File>, FileError> {
    Ok(BufWriter::new(OpenOptions::new().append(true).open(path)?))
}

/// Validates a file header and returns its generation.
fn parse_header(bytes: &[u8], magic: [u8; 8]) -> Result<u128, FileError> {
    if bytes.len() < HEADER_LEN {
        return Err(FileError::Corrupt("incomplete file header"));
    }
    if bytes[..8] != magic {
        return Err(FileError::Corrupt("invalid file header"));
    }
    Ok(u128::from_be_bytes(
        bytes[8..HEADER_LEN]
            .try_into()
            .map_err(|_| FileError::Corrupt("invalid generation"))?,
    ))
}

/// Strictly parses every length-framed stream record.
fn parse_stream(bytes: &[u8]) -> Result<(u128, Vec<Bytes>), FileError> {
    let generation = parse_header(bytes, STREAM_MAGIC)?;
    let mut cursor = HEADER_LEN;
    let mut records = Vec::new();
    while cursor < bytes.len() {
        records.push(Bytes::copy_from_slice(read_frame(bytes, &mut cursor)?));
    }
    Ok((generation, records))
}

/// Strictly parses snapshots and validates generation, IDs, and monotonic positions.
fn parse_snapshots(
    bytes: &[u8],
    generation: u128,
    record_count: usize,
) -> Result<(Option<PublishedSnapshot<FilePosition>>, u64), FileError> {
    if parse_header(bytes, SNAPSHOT_MAGIC)? != generation {
        return Err(FileError::Corrupt(
            "snapshot generation does not match stream",
        ));
    }
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
                includes_through: if ordinal == 0 {
                    SnapshotPosition::Initial
                } else {
                    SnapshotPosition::At(FilePosition {
                        generation,
                        ordinal,
                    })
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

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };

    use futures_util::TryStreamExt;
    use snapshotted_stream_core::{AppendStream, ClassifiedError, SnapshotStore};

    use super::*;

    static NEXT_TEST_DIRECTORY: AtomicU64 = AtomicU64::new(1);

    /// Creates a process-unique path for one file-store test.
    fn test_directory(label: &str) -> PathBuf {
        let id = NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "snapshotted-stream-file-simple-{}-{label}-{id}",
            std::process::id()
        ))
    }

    #[tokio::test]
    async fn passes_shared_conformance() {
        let root = test_directory("conformance");
        let next = AtomicU64::new(1);
        snapshotted_stream_conformance::run_conformance(|| {
            let id = next.fetch_add(1, Ordering::Relaxed);
            FileStream::open(root.join(id.to_string())).expect("create conformance stream")
        })
        .await;
        fs::remove_dir_all(root).expect("remove conformance files");
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
                    includes_through: SnapshotPosition::At(first.position.clone()),
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
        assert_eq!(stream_bytes + snapshot_bytes, 720_048);
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
