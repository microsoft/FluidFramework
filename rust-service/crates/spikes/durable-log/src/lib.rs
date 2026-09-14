#![doc = "A focused checksummed append-log and atomic snapshot spike."]
#![doc = ""]
#![doc = "Records use duplicated framing evidence. Snapshots are file-synced, atomically"]
#![doc = "renamed, and directory-synced before acknowledgment. Retention and"]
#![doc = "multi-process access are out of scope."]

use std::{
    collections::VecDeque,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
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

#[cfg(test)]
use std::time::{Duration, Instant};

/// Versioned log-file marker.
const MAGIC: [u8; 8] = *b"SDLOG003";
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
/// Append-log filename within the owned directory.
const LOG_FILE: &str = "stream.log";
/// Published snapshot filename within the owned directory.
const SNAPSHOT_FILE: &str = "snapshot.current";
/// Pending snapshot filename used before atomic publication.
const SNAPSHOT_TEMP_FILE: &str = "snapshot.pending";
/// Versioned snapshot-file marker.
const SNAPSHOT_MAGIC: [u8; 8] = *b"SDSNP002";
/// Marker closing a snapshot record.
const SNAPSHOT_TRAILER_MAGIC: [u8; 4] = *b"ENDS";
/// Encoded bytes in a snapshot identifier.
const SNAPSHOT_ID_LEN: usize = 20;
/// Bytes preceding the payload in a snapshot record.
const SNAPSHOT_HEADER_LEN: usize = 61;

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
    #[cfg(test)]
    process_boundary: Option<(CrashPoint, Arc<ProcessBoundary>)>,
}

impl CrashInjector {
    /// Creates an injector that fails when each point is reached in the supplied order.
    pub fn new(points: impl IntoIterator<Item = CrashPoint>) -> Self {
        Self {
            points: Mutex::new(points.into_iter().collect()),
            #[cfg(test)]
            process_boundary: None,
        }
    }

    /// Consumes and fails at `point` when it is next in the crash plan.
    fn hit(&self, point: CrashPoint) -> std::io::Result<()> {
        #[cfg(test)]
        if let Some((target, boundary)) = &self.process_boundary
            && *target == point
        {
            return boundary.stop(&format!("{point:?}"));
        }

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

    #[cfg(test)]
    fn for_process(point: CrashPoint, boundary: Arc<ProcessBoundary>) -> Self {
        Self {
            points: Mutex::new(VecDeque::new()),
            process_boundary: Some((point, boundary)),
        }
    }
}

#[cfg(test)]
#[derive(Debug)]
struct ProcessBoundary {
    /// Marker written when the child reaches the armed crash point.
    ready: PathBuf,
    /// Parent-written instruction selecting abort, exit, or kill.
    control: PathBuf,
    /// Marker confirming that the child observed the control instruction.
    armed: PathBuf,
    /// Maximum coordination wait before the child reports failure.
    timeout: Duration,
}

#[cfg(test)]
impl ProcessBoundary {
    fn from_environment() -> Self {
        let coordination = PathBuf::from(
            std::env::var_os("DURABLE_LOG_PROCESS_COORDINATION")
                .expect("child coordination directory is required"),
        );
        Self {
            ready: coordination.join("ready"),
            control: coordination.join("control"),
            armed: coordination.join("armed"),
            timeout: Duration::from_secs(10),
        }
    }

    fn stop(&self, label: &str) -> std::io::Result<()> {
        write_marker(&self.ready, label)?;
        let started = Instant::now();
        while !self.control.exists() {
            if started.elapsed() >= self.timeout {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "parent control marker timeout",
                ));
            }
            std::thread::yield_now();
        }

        let control = fs::read_to_string(&self.control)?;
        write_marker(&self.armed, &control)?;
        match control.as_str() {
            "abort" => std::process::abort(),
            "exit" => std::process::exit(86),
            "kill" => {
                while started.elapsed() < self.timeout {
                    std::thread::yield_now();
                }
                Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "parent did not kill armed child",
                ))
            }
            _ => Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "unknown process control marker",
            )),
        }
    }
}

#[cfg(test)]
fn write_marker(path: &Path, value: &str) -> std::io::Result<()> {
    let pending = path.with_extension("pending");
    let mut file = File::create(&pending)?;
    file.write_all(value.as_bytes())?;
    file.sync_all()?;
    drop(file);
    fs::rename(pending, path)
}

/// An opaque one-based record ordinal within a durable log.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DurablePosition {
    /// One-based record index within the log.
    ordinal: u64,
}

impl DurablePosition {
    /// Returns the one-based record ordinal within the log.
    #[must_use]
    pub const fn ordinal(&self) -> u64 {
        self.ordinal
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
}

impl ClassifiedError for DurableLogError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::AmbiguousAppend(_) | Self::AmbiguousSnapshot(_) => ErrorKind::Ambiguous,
            Self::Corrupt(_) => ErrorKind::Corrupt,
            Self::InvalidPosition => ErrorKind::InvalidPosition,
            Self::SnapshotConflict | Self::SnapshotRegression => ErrorKind::Conflict,
            Self::Io(_) | Self::Poisoned => ErrorKind::Unavailable,
        }
    }
}

/// Mutable append, recovery, snapshot, and crash-injection state behind the log lock.
#[derive(Debug)]
struct State {
    /// Recovered and newly acknowledged payloads in append order.
    records: Vec<Bytes>,
    /// Append-only handle for the current log.
    writer: File,
    /// Most recently published and recovered snapshot.
    latest_snapshot: Option<PublishedSnapshot<DurablePosition>>,
    /// Shared deterministic crash plan.
    crashes: Arc<CrashInjector>,
}

/// A single-process append log that syncs record data before returning success.
#[derive(Clone, Debug)]
pub struct DurableLog {
    /// Directory containing log and snapshot files.
    directory: PathBuf,
    /// Path of the append-log file.
    path: PathBuf,
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
        let path = directory.as_ref().join(LOG_FILE);
        if !path.exists() {
            initialize(&path)?;
        }

        let bytes = read_all(&path)?;
        crashes.hit(CrashPoint::OpenAfterLogRead)?;
        let (records, valid_length) = parse_log(&bytes)?;
        let writer = OpenOptions::new().read(true).append(true).open(&path)?;
        if writer.metadata()?.len() != valid_length {
            writer.set_len(valid_length)?;
            writer.sync_data()?;
        }
        let snapshot_path = directory.as_ref().join(SNAPSHOT_FILE);
        let latest_snapshot = if snapshot_path.exists() {
            let snapshot_bytes = read_all(&snapshot_path)?;
            crashes.hit(CrashPoint::OpenAfterSnapshotRead)?;
            Some(parse_snapshot(&snapshot_bytes, records.len())?)
        } else {
            crashes.hit(CrashPoint::OpenAfterSnapshotRead)?;
            None
        };

        Ok(Self {
            directory: directory.as_ref().to_owned(),
            path,
            state: Arc::new(Mutex::new(State {
                records,
                writer,
                latest_snapshot,
                crashes,
            })),
        })
    }

    /// Returns the path used by the spike for deterministic recovery experiments.
    #[must_use]
    pub fn log_path(&self) -> &Path {
        &self.path
    }

    /// Locks mutable log state and classifies mutex poisoning.
    fn state(&self) -> Result<MutexGuard<'_, State>, DurableLogError> {
        self.state.lock().map_err(|_| DurableLogError::Poisoned)
    }

    /// Ensures a position belongs to the committed range.
    fn validate_position(
        position: &DurablePosition,
        record_count: usize,
    ) -> Result<(), DurableLogError> {
        let record_count =
            u64::try_from(record_count).map_err(|_| DurableLogError::InvalidPosition)?;
        if position.ordinal == 0 || position.ordinal > record_count {
            return Err(DurableLogError::InvalidPosition);
        }
        Ok(())
    }

    /// Resolves a one-based event ordinal in this log.
    ///
    /// # Errors
    ///
    /// Returns [`DurableLogError::InvalidPosition`] when the ordinal is not committed.
    pub fn position_at(&self, ordinal: u64) -> Result<DurablePosition, DurableLogError> {
        let position = DurablePosition { ordinal };
        Self::validate_position(&position, self.state()?.records.len())?;
        Ok(position)
    }
}

#[async_trait]
impl AppendStream for DurableLog {
    type Position = DurablePosition;
    type Error = DurableLogError;

    fn capabilities(&self) -> Capabilities {
        Capabilities::NONE
    }

    async fn append(&self, value: Bytes) -> Result<AppendReceipt<Self::Position>, Self::Error> {
        let mut state = self.state()?;
        let crashes = Arc::clone(&state.crashes);
        write_record(&mut state.writer, &value, &crashes)
            .map_err(DurableLogError::AmbiguousAppend)?;
        crashes
            .hit(CrashPoint::RecordBeforeSync)
            .map_err(DurableLogError::AmbiguousAppend)?;
        state
            .writer
            .sync_data()
            .map_err(DurableLogError::AmbiguousAppend)?;
        crashes
            .hit(CrashPoint::RecordAfterSync)
            .map_err(DurableLogError::AmbiguousAppend)?;
        state.records.push(value);
        let ordinal = u64::try_from(state.records.len())
            .map_err(|_| DurableLogError::Corrupt("record count exceeds position range"))?;
        Ok(AppendReceipt {
            position: DurablePosition { ordinal },
            durability: Durability::Durable,
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
                usize::try_from(position.ordinal).map_err(|_| DurableLogError::InvalidPosition)?
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
                    .map_err(|_| DurableLogError::Poisoned)
                    .and_then(|state| {
                        let ordinal = u64::try_from(index + 1).map_err(|_| {
                            DurableLogError::Corrupt("record count exceeds position range")
                        })?;
                        Ok(ReadRecord {
                            position: DurablePosition { ordinal },
                            payload: state.records[index].clone(),
                        })
                    });
                Some((result, index + 1))
            }
        })))
    }

    async fn head(&self) -> Result<Option<Self::Position>, Self::Error> {
        let record_count = self.state()?.records.len();
        let ordinal = u64::try_from(record_count)
            .map_err(|_| DurableLogError::Corrupt("record count exceeds position range"))?;
        Ok((ordinal > 0).then_some(DurablePosition { ordinal }))
    }
}

#[async_trait]
impl SnapshotStore for DurableLog {
    type Position = DurablePosition;
    type Error = DurableLogError;

    async fn latest(&self) -> Result<Option<PublishedSnapshot<Self::Position>>, Self::Error> {
        Ok(self.state()?.latest_snapshot.clone())
    }

    async fn publish(
        &self,
        snapshot: Snapshot<Self::Position>,
        expected_parent: Option<&SnapshotId>,
    ) -> Result<SnapshotId, Self::Error> {
        let mut state = self.state()?;
        let ordinal = match &snapshot.includes_through {
            SnapshotPosition::Initial => 0,
            SnapshotPosition::At(position) => {
                Self::validate_position(position, state.records.len())?;
                position.ordinal
            }
        };
        let actual_parent = state
            .latest_snapshot
            .as_ref()
            .map(|published| &published.id);
        if actual_parent != expected_parent {
            return Err(DurableLogError::SnapshotConflict);
        }
        if state
            .latest_snapshot
            .as_ref()
            .map(|published| snapshot_ordinal(&published.snapshot))
            .is_some_and(|latest_ordinal| ordinal < latest_ordinal)
        {
            return Err(DurableLogError::SnapshotRegression);
        }

        let id = snapshot_id(ordinal, &snapshot.payload)?;
        let encoded = encode_snapshot(ordinal, actual_parent, &snapshot.payload)?;
        let pending_path = self.directory.join(SNAPSHOT_TEMP_FILE);
        let current_path = self.directory.join(SNAPSHOT_FILE);
        let mut pending = File::create(&pending_path)?;
        state.crashes.hit(CrashPoint::SnapshotAfterCreate)?;
        pending.write_all(&encoded)?;
        state.crashes.hit(CrashPoint::SnapshotAfterWrite)?;
        state.crashes.hit(CrashPoint::SnapshotBeforeFileSync)?;
        pending.sync_all()?;
        state.crashes.hit(CrashPoint::SnapshotAfterFileSync)?;
        drop(pending);
        state.crashes.hit(CrashPoint::SnapshotBeforeRename)?;
        fs::rename(&pending_path, &current_path)?;
        state
            .crashes
            .hit(CrashPoint::SnapshotAfterRename)
            .map_err(DurableLogError::AmbiguousSnapshot)?;
        state
            .crashes
            .hit(CrashPoint::SnapshotBeforeDirectorySync)
            .map_err(DurableLogError::AmbiguousSnapshot)?;
        File::open(&self.directory)?
            .sync_all()
            .map_err(DurableLogError::AmbiguousSnapshot)?;
        state
            .crashes
            .hit(CrashPoint::SnapshotAfterDirectorySync)
            .map_err(DurableLogError::AmbiguousSnapshot)?;

        state.latest_snapshot = Some(PublishedSnapshot {
            id: id.clone(),
            snapshot,
        });
        Ok(id)
    }
}

/// Converts an initial or positioned snapshot boundary to its persisted ordinal.
fn snapshot_ordinal(snapshot: &Snapshot<DurablePosition>) -> u64 {
    match &snapshot.includes_through {
        SnapshotPosition::Initial => 0,
        SnapshotPosition::At(position) => position.ordinal,
    }
}

/// Derives the stable snapshot identifier from lineage and payload evidence.
fn snapshot_id(ordinal: u64, payload: &[u8]) -> Result<SnapshotId, DurableLogError> {
    let length = u64::try_from(payload.len())
        .map_err(|_| DurableLogError::Corrupt("snapshot payload exceeds length range"))?;
    let mut bytes = Vec::with_capacity(SNAPSHOT_ID_LEN);
    bytes.extend_from_slice(&ordinal.to_be_bytes());
    bytes.extend_from_slice(&length.to_be_bytes());
    bytes.extend_from_slice(&crc32fast::hash(payload).to_be_bytes());
    Ok(SnapshotId::from_bytes(Bytes::from(bytes)))
}

/// Encodes a complete checksummed snapshot record with duplicated framing evidence.
fn encode_snapshot(
    ordinal: u64,
    parent: Option<&SnapshotId>,
    payload: &[u8],
) -> Result<Vec<u8>, DurableLogError> {
    let length = u64::try_from(payload.len())
        .map_err(|_| DurableLogError::Corrupt("snapshot payload exceeds length range"))?;
    let mut parent_bytes = [0_u8; SNAPSHOT_ID_LEN];
    let parent_present = match parent {
        Some(id) if id.as_bytes().len() == SNAPSHOT_ID_LEN => {
            parent_bytes.copy_from_slice(id.as_bytes());
            1
        }
        Some(_) => return Err(DurableLogError::Corrupt("invalid snapshot parent id")),
        None => 0,
    };
    let checksum = snapshot_checksum(ordinal, parent_present, &parent_bytes, payload);
    let mut bytes = Vec::with_capacity(
        SNAPSHOT_HEADER_LEN
            .checked_add(payload.len())
            .and_then(|size| size.checked_add(FRAME_TRAILER_LEN))
            .ok_or(DurableLogError::Corrupt("snapshot length overflow"))?,
    );
    bytes.extend_from_slice(&SNAPSHOT_MAGIC);
    bytes.extend_from_slice(&ordinal.to_be_bytes());
    bytes.push(parent_present);
    bytes.extend_from_slice(&parent_bytes);
    bytes.extend_from_slice(&length.to_be_bytes());
    bytes.extend_from_slice(&(!length).to_be_bytes());
    bytes.extend_from_slice(&checksum.to_be_bytes());
    bytes.extend_from_slice(&(!checksum).to_be_bytes());
    bytes.extend_from_slice(payload);
    bytes.extend_from_slice(&frame_fields(SNAPSHOT_TRAILER_MAGIC, length, checksum));
    Ok(bytes)
}

/// Checksums snapshot lineage and payload fields in persisted order.
fn snapshot_checksum(
    ordinal: u64,
    parent_present: u8,
    parent: &[u8; SNAPSHOT_ID_LEN],
    payload: &[u8],
) -> u32 {
    let mut checksum = crc32fast::Hasher::new();
    checksum.update(&ordinal.to_be_bytes());
    checksum.update(&[parent_present]);
    checksum.update(parent);
    checksum.update(payload);
    checksum.finalize()
}

/// Parses and validates one complete snapshot record against the recovered log.
fn parse_snapshot(
    bytes: &[u8],
    record_count: usize,
) -> Result<PublishedSnapshot<DurablePosition>, DurableLogError> {
    if bytes.len() < SNAPSHOT_HEADER_LEN + FRAME_TRAILER_LEN {
        return Err(DurableLogError::Corrupt("incomplete snapshot record"));
    }
    if bytes[..8] != SNAPSHOT_MAGIC {
        return Err(DurableLogError::Corrupt("invalid snapshot header"));
    }
    let ordinal = u64::from_be_bytes(
        bytes[8..16]
            .try_into()
            .map_err(|_| DurableLogError::Corrupt("invalid snapshot ordinal"))?,
    );
    let parent_present = bytes[16];
    if parent_present > 1 || (parent_present == 0 && bytes[17..37] != [0_u8; SNAPSHOT_ID_LEN]) {
        return Err(DurableLogError::Corrupt("invalid snapshot parent framing"));
    }
    let length = u64::from_be_bytes(
        bytes[37..45]
            .try_into()
            .map_err(|_| DurableLogError::Corrupt("invalid snapshot length"))?,
    );
    let inverse_length = u64::from_be_bytes(
        bytes[45..53]
            .try_into()
            .map_err(|_| DurableLogError::Corrupt("invalid inverse snapshot length"))?,
    );
    let checksum = u32::from_be_bytes(
        bytes[53..57]
            .try_into()
            .map_err(|_| DurableLogError::Corrupt("invalid snapshot checksum"))?,
    );
    let inverse_checksum = u32::from_be_bytes(
        bytes[57..61]
            .try_into()
            .map_err(|_| DurableLogError::Corrupt("invalid inverse snapshot checksum"))?,
    );
    if inverse_length != !length || inverse_checksum != !checksum {
        return Err(DurableLogError::Corrupt(
            "snapshot framing redundancy mismatch",
        ));
    }
    let payload_length = usize::try_from(length)
        .map_err(|_| DurableLogError::Corrupt("snapshot length exceeds address space"))?;
    let trailer_start = SNAPSHOT_HEADER_LEN
        .checked_add(payload_length)
        .ok_or(DurableLogError::Corrupt("snapshot length overflow"))?;
    let expected_length = trailer_start
        .checked_add(FRAME_TRAILER_LEN)
        .ok_or(DurableLogError::Corrupt("snapshot length overflow"))?;
    if bytes.len() != expected_length {
        return Err(DurableLogError::Corrupt("snapshot record length mismatch"));
    }
    let trailer_fields = parse_frame_fields(&bytes[trailer_start..], SNAPSHOT_TRAILER_MAGIC)?;
    if trailer_fields != (length, checksum) {
        return Err(DurableLogError::Corrupt("snapshot framing mismatch"));
    }
    let payload = &bytes[SNAPSHOT_HEADER_LEN..trailer_start];
    let parent = bytes[17..37]
        .try_into()
        .map_err(|_| DurableLogError::Corrupt("invalid snapshot parent"))?;
    if snapshot_checksum(ordinal, parent_present, parent, payload) != checksum {
        return Err(DurableLogError::Corrupt("snapshot checksum mismatch"));
    }
    let record_count = u64::try_from(record_count)
        .map_err(|_| DurableLogError::Corrupt("record count exceeds position range"))?;
    if ordinal > record_count {
        return Err(DurableLogError::Corrupt(
            "snapshot position is beyond the log head",
        ));
    }
    let includes_through = if ordinal == 0 {
        SnapshotPosition::Initial
    } else {
        SnapshotPosition::At(DurablePosition { ordinal })
    };
    Ok(PublishedSnapshot {
        id: snapshot_id(ordinal, payload)?,
        snapshot: Snapshot {
            includes_through,
            payload: Bytes::copy_from_slice(payload),
        },
    })
}

/// Creates and syncs a new log header.
fn initialize(path: &Path) -> Result<(), DurableLogError> {
    let mut file = File::create(path)?;
    file.write_all(&MAGIC)?;
    file.sync_data()?;
    Ok(())
}

/// Reads a complete owned persistence file for recovery validation.
fn read_all(path: &Path) -> Result<Vec<u8>, DurableLogError> {
    let mut bytes = Vec::new();
    File::open(path)?.read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Recovers complete records and returns the byte length safe to retain.
fn parse_log(bytes: &[u8]) -> Result<(Vec<Bytes>, u64), DurableLogError> {
    if bytes.len() < HEADER_LEN {
        return Err(DurableLogError::Corrupt("incomplete log header"));
    }
    if bytes[..8] != MAGIC {
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

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::{Seek, SeekFrom},
        path::PathBuf,
        process::{Child, Command, ExitStatus, Stdio},
        sync::atomic::{AtomicU64, Ordering},
        time::{Duration, Instant},
    };

    use futures_util::TryStreamExt;
    use snapshotted_stream_core::{AppendStream, ClassifiedError};

    use super::*;

    static NEXT_TEST_DIRECTORY: AtomicU64 = AtomicU64::new(1);

    const CHILD_TEST: &str = "tests::process_crash_child";
    const PROCESS_TIMEOUT: Duration = Duration::from_secs(10);

    #[derive(Clone, Copy, Debug)]
    enum Termination {
        Kill,
        Abort,
        Exit,
    }

    impl Termination {
        fn control(self) -> &'static str {
            match self {
                Self::Kill => "kill",
                Self::Abort => "abort",
                Self::Exit => "exit",
            }
        }
    }

    fn test_directory(label: &str) -> PathBuf {
        let id = NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "snapshotted-stream-durable-log-{}-{label}-{id}",
            std::process::id()
        ))
    }

    fn wait_for_marker(child: &mut Child, path: &Path, label: &str) {
        let started = Instant::now();
        loop {
            if path.exists() {
                return;
            }
            if let Some(status) = child.try_wait().unwrap() {
                panic!("child exited before {label}: {status}");
            }
            assert!(
                started.elapsed() < PROCESS_TIMEOUT,
                "timed out waiting for {label}"
            );
            std::thread::yield_now();
        }
    }

    fn wait_for_exit(child: &mut Child) -> ExitStatus {
        let started = Instant::now();
        loop {
            if let Some(status) = child.try_wait().unwrap() {
                return status;
            }
            if started.elapsed() >= PROCESS_TIMEOUT {
                child.kill().unwrap();
                let _ = child.wait();
                panic!("timed out waiting for child exit");
            }
            std::thread::yield_now();
        }
    }

    fn terminate_child(
        data_directory: &Path,
        operation: &str,
        boundary: &str,
        termination: Termination,
    ) {
        let coordination = test_directory("process-coordination");
        fs::create_dir_all(&coordination).unwrap();
        let ready = coordination.join("ready");
        let control = coordination.join("control");
        let armed = coordination.join("armed");
        let mut child = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", CHILD_TEST, "--ignored", "--nocapture"])
            .env("DURABLE_LOG_PROCESS_CHILD", "1")
            .env("DURABLE_LOG_PROCESS_DIRECTORY", data_directory)
            .env("DURABLE_LOG_PROCESS_COORDINATION", &coordination)
            .env("DURABLE_LOG_PROCESS_OPERATION", operation)
            .env("DURABLE_LOG_PROCESS_BOUNDARY", boundary)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();

        wait_for_marker(&mut child, &ready, "child readiness marker");
        assert_eq!(fs::read_to_string(&ready).unwrap(), boundary);
        write_marker(&control, termination.control()).unwrap();
        wait_for_marker(&mut child, &armed, "child armed marker");
        assert_eq!(fs::read_to_string(&armed).unwrap(), termination.control());
        if matches!(termination, Termination::Kill) {
            child.kill().unwrap();
        }
        let status = wait_for_exit(&mut child);
        assert!(!status.success(), "child unexpectedly succeeded");
        if matches!(termination, Termination::Exit) {
            assert_eq!(status.code(), Some(86));
        }
        fs::remove_dir_all(coordination).unwrap();
    }

    fn process_crash_point(boundary: &str) -> Option<CrashPoint> {
        Some(match boundary {
            "RecordAfterHeaderWrite" => CrashPoint::RecordAfterHeaderWrite,
            "RecordAfterPayloadWrite" => CrashPoint::RecordAfterPayloadWrite,
            "RecordAfterTrailerWrite" => CrashPoint::RecordAfterTrailerWrite,
            "RecordBeforeSync" => CrashPoint::RecordBeforeSync,
            "RecordAfterSync" => CrashPoint::RecordAfterSync,
            "SnapshotAfterCreate" => CrashPoint::SnapshotAfterCreate,
            "SnapshotAfterWrite" => CrashPoint::SnapshotAfterWrite,
            "SnapshotBeforeFileSync" => CrashPoint::SnapshotBeforeFileSync,
            "SnapshotAfterFileSync" => CrashPoint::SnapshotAfterFileSync,
            "SnapshotBeforeRename" => CrashPoint::SnapshotBeforeRename,
            "SnapshotAfterRename" => CrashPoint::SnapshotAfterRename,
            "SnapshotBeforeDirectorySync" => CrashPoint::SnapshotBeforeDirectorySync,
            "SnapshotAfterDirectorySync" => CrashPoint::SnapshotAfterDirectorySync,
            "RecordBeforeWrite"
            | "RecordAfterAcknowledgment"
            | "SnapshotBeforeWrite"
            | "SnapshotAfterAcknowledgment" => return None,
            _ => panic!("unknown child boundary: {boundary}"),
        })
    }

    #[tokio::test]
    #[ignore = "spawned only by process recovery tests"]
    async fn process_crash_child() {
        if std::env::var_os("DURABLE_LOG_PROCESS_CHILD").is_none() {
            return;
        }
        let directory = PathBuf::from(
            std::env::var_os("DURABLE_LOG_PROCESS_DIRECTORY")
                .expect("child data directory is required"),
        );
        let operation = std::env::var("DURABLE_LOG_PROCESS_OPERATION").unwrap();
        let boundary_name = std::env::var("DURABLE_LOG_PROCESS_BOUNDARY").unwrap();
        let boundary = Arc::new(ProcessBoundary::from_environment());
        let log = match process_crash_point(&boundary_name) {
            Some(point) => DurableLog::open_with_crash_injector(
                &directory,
                Arc::new(CrashInjector::for_process(point, Arc::clone(&boundary))),
            )
            .unwrap(),
            None => DurableLog::open(&directory).unwrap(),
        };

        match operation.as_str() {
            "append" => {
                if boundary_name == "RecordBeforeWrite" {
                    boundary.stop(&boundary_name).unwrap();
                }
                log.append(Bytes::from_static(b"second")).await.unwrap();
                if boundary_name == "RecordAfterAcknowledgment" {
                    boundary.stop(&boundary_name).unwrap();
                }
            }
            "snapshot" => {
                if boundary_name == "SnapshotBeforeWrite" {
                    boundary.stop(&boundary_name).unwrap();
                }
                let records = log
                    .read(None)
                    .await
                    .unwrap()
                    .try_collect::<Vec<_>>()
                    .await
                    .unwrap();
                let position = records[1].position.clone();
                let parent = log.latest().await.unwrap().unwrap().id;
                log.publish(
                    Snapshot {
                        includes_through: SnapshotPosition::At(position),
                        payload: Bytes::from_static(b"attempted"),
                    },
                    Some(&parent),
                )
                .await
                .unwrap();
                if boundary_name == "SnapshotAfterAcknowledgment" {
                    boundary.stop(&boundary_name).unwrap();
                }
            }
            _ => panic!("unknown child operation: {operation}"),
        }
        panic!("child operation passed its configured boundary");
    }

    #[tokio::test]
    async fn child_process_append_termination_recovers_acknowledged_prefix() {
        let cases = [
            ("RecordBeforeWrite", Termination::Kill),
            ("RecordAfterHeaderWrite", Termination::Abort),
            ("RecordAfterPayloadWrite", Termination::Exit),
            ("RecordAfterTrailerWrite", Termination::Kill),
            ("RecordBeforeSync", Termination::Abort),
            ("RecordAfterSync", Termination::Exit),
            ("RecordAfterAcknowledgment", Termination::Kill),
        ];

        for (boundary, termination) in cases {
            let directory = test_directory("process-append");
            let log = DurableLog::open(&directory).unwrap();
            let acknowledged = log.append(Bytes::from_static(b"first")).await.unwrap();
            drop(log);

            terminate_child(&directory, "append", boundary, termination);

            let reopened = DurableLog::open(&directory).unwrap();
            let records = reopened
                .read(None)
                .await
                .unwrap()
                .try_collect::<Vec<_>>()
                .await
                .unwrap();
            assert_eq!(records[0].position, acknowledged.position, "{boundary}");
            assert_eq!(records[0].payload, Bytes::from_static(b"first"));
            assert!(records.len() == 1 || records.len() == 2, "{boundary}");
            if records.len() == 2 {
                assert_eq!(records[1].payload, Bytes::from_static(b"second"));
            }
            fs::remove_dir_all(directory).unwrap();
        }
    }

    #[tokio::test]
    async fn child_process_snapshot_termination_recovers_valid_lineage_and_replay() {
        let boundaries = [
            "SnapshotBeforeWrite",
            "SnapshotAfterCreate",
            "SnapshotAfterWrite",
            "SnapshotBeforeFileSync",
            "SnapshotAfterFileSync",
            "SnapshotBeforeRename",
            "SnapshotAfterRename",
            "SnapshotBeforeDirectorySync",
            "SnapshotAfterDirectorySync",
            "SnapshotAfterAcknowledgment",
        ];

        for (index, boundary) in boundaries.into_iter().enumerate() {
            let termination = match index % 3 {
                0 => Termination::Kill,
                1 => Termination::Abort,
                _ => Termination::Exit,
            };
            let directory = test_directory("process-snapshot");
            let log = DurableLog::open(&directory).unwrap();
            let first = log.append(Bytes::from_static(b"first")).await.unwrap();
            log.append(Bytes::from_static(b"second")).await.unwrap();
            let third = log.append(Bytes::from_static(b"third")).await.unwrap();
            let baseline_id = log
                .publish(
                    Snapshot {
                        includes_through: SnapshotPosition::At(first.position.clone()),
                        payload: Bytes::from_static(b"baseline"),
                    },
                    None,
                )
                .await
                .unwrap();
            drop(log);

            terminate_child(&directory, "snapshot", boundary, termination);

            let reopened = DurableLog::open(&directory).unwrap();
            let recovered = reopened.latest().await.unwrap().unwrap();
            let (expected_id, replay_after, expected_replay) =
                if recovered.snapshot.payload == Bytes::from_static(b"baseline") {
                    (
                        baseline_id,
                        first.position,
                        vec![Bytes::from_static(b"second"), Bytes::from_static(b"third")],
                    )
                } else {
                    assert_eq!(
                        recovered.snapshot.payload,
                        Bytes::from_static(b"attempted"),
                        "{boundary}"
                    );
                    let position = match &recovered.snapshot.includes_through {
                        SnapshotPosition::At(position) => position.clone(),
                        SnapshotPosition::Initial => panic!("attempted snapshot lost its position"),
                    };
                    (
                        snapshot_id(position.ordinal, b"attempted").unwrap(),
                        position,
                        vec![Bytes::from_static(b"third")],
                    )
                };
            assert_eq!(recovered.id, expected_id, "{boundary}");
            let replay = reopened
                .read(Some(&replay_after))
                .await
                .unwrap()
                .try_collect::<Vec<_>>()
                .await
                .unwrap();
            assert_eq!(
                replay
                    .iter()
                    .map(|record| record.payload.clone())
                    .collect::<Vec<_>>(),
                expected_replay,
                "{boundary}"
            );
            assert_eq!(
                replay.last().unwrap().position,
                third.position,
                "{boundary}"
            );
            fs::remove_dir_all(directory).unwrap();
        }
    }

    #[tokio::test]
    async fn passes_shared_conformance() {
        let directories = std::sync::Mutex::new(Vec::new());
        snapshotted_stream_conformance::run_conformance(|| {
            let directory = test_directory("conformance");
            directories.lock().unwrap().push(directory.clone());
            DurableLog::open(directory).unwrap()
        })
        .await;

        for directory in directories.into_inner().unwrap() {
            fs::remove_dir_all(directory).unwrap();
        }
    }

    #[tokio::test]
    async fn durable_receipt_and_reopen_preserve_records_and_positions() {
        let directory = test_directory("reopen");
        let log = DurableLog::open(&directory).unwrap();
        let first = log.append(Bytes::from_static(b"first")).await.unwrap();
        let second = log.append(Bytes::from_static(b"second")).await.unwrap();
        assert_eq!(first.durability, Durability::Durable);
        assert_eq!(second.durability, Durability::Durable);
        drop(log);

        let reopened = DurableLog::open(&directory).unwrap();
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
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn incomplete_tail_is_truncated_to_last_valid_record() {
        let directory = test_directory("partial-tail");
        let log = DurableLog::open(&directory).unwrap();
        let receipt = log.append(Bytes::from_static(b"committed")).await.unwrap();
        let valid_length = fs::metadata(log.log_path()).unwrap().len();
        let path = log.log_path().to_owned();
        drop(log);

        let mut file = OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(&16_u64.to_be_bytes()).unwrap();
        file.write_all(&[0xaa, 0xbb]).unwrap();
        file.sync_data().unwrap();
        drop(file);
        assert!(fs::metadata(&path).unwrap().len() > valid_length);

        let reopened = DurableLog::open(&directory).unwrap();
        assert_eq!(fs::metadata(&path).unwrap().len(), valid_length);
        assert_eq!(reopened.head().await.unwrap(), Some(receipt.position));
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn complete_record_with_invalid_checksum_is_rejected() {
        let directory = test_directory("checksum");
        let log = DurableLog::open(&directory).unwrap();
        log.append(Bytes::from_static(b"record")).await.unwrap();
        let path = log.log_path().to_owned();
        drop(log);

        let mut file = OpenOptions::new().write(true).open(&path).unwrap();
        file.seek(SeekFrom::Start((HEADER_LEN + 20) as u64))
            .unwrap();
        file.write_all(&0_u32.to_be_bytes()).unwrap();
        file.sync_data().unwrap();
        drop(file);

        let error = DurableLog::open(&directory).unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Corrupt);
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn concurrent_appends_are_contiguous_and_precedence_is_preserved() {
        let directory = test_directory("ordering");
        let log = DurableLog::open(&directory).unwrap();
        let appends = (0_u8..16).map(|value| log.append(Bytes::from(vec![value])));
        for result in futures_util::future::join_all(appends).await {
            result.unwrap();
        }
        log.append(Bytes::from_static(b"sentinel")).await.unwrap();

        let records = log
            .read(None)
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(records.len(), 17);
        assert_eq!(
            records.last().unwrap().payload,
            Bytes::from_static(b"sentinel")
        );
        let mut values = records[..16]
            .iter()
            .map(|record| record.payload[0])
            .collect::<Vec<_>>();
        values.sort_unstable();
        assert_eq!(values, (0_u8..16).collect::<Vec<_>>());
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn persisted_size_matches_checksumming_for_10000_records() {
        let directory = test_directory("persisted-size");
        let log = DurableLog::open(&directory).unwrap();
        let payload = Bytes::from(vec![0x5a; 64]);
        for _ in 0..10_000 {
            log.append(payload.clone()).await.unwrap();
        }

        let expected = HEADER_LEN as u64 + 10_000 * (RECORD_FRAME_OVERHEAD_BYTES as u64 + 64);
        assert_eq!(fs::metadata(log.log_path()).unwrap().len(), expected);
        drop(log);
        let recovery_started = Instant::now();
        let reopened = DurableLog::open(&directory).unwrap();
        eprintln!(
            "recovery_records=10000 recovery_elapsed_ns={}",
            recovery_started.elapsed().as_nanos()
        );
        assert_eq!(reopened.state().unwrap().records.len(), 10_000);
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn every_incomplete_frame_prefix_is_discarded() {
        let directory = test_directory("all-partial-frame-prefixes");
        let log = DurableLog::open(&directory).unwrap();
        let receipt = log.append(Bytes::from_static(b"committed")).await.unwrap();
        let valid_bytes = read_all(log.log_path()).unwrap();
        let mut complete_frame = Vec::new();
        write_record(
            &mut complete_frame,
            b"interrupted",
            &CrashInjector::default(),
        )
        .unwrap();
        drop(log);

        for prefix_length in 0..complete_frame.len() {
            let path = directory.join(LOG_FILE);
            let mut bytes = valid_bytes.clone();
            bytes.extend_from_slice(&complete_frame[..prefix_length]);
            fs::write(&path, bytes).unwrap();
            let reopened = DurableLog::open(&directory).unwrap();
            assert_eq!(
                reopened.head().await.unwrap(),
                Some(receipt.position.clone())
            );
            assert_eq!(fs::metadata(&path).unwrap().len(), valid_bytes.len() as u64);
            drop(reopened);
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn corruption_in_each_complete_frame_region_is_rejected() {
        let directory = test_directory("all-frame-regions");
        let log = DurableLog::open(&directory).unwrap();
        log.append(Bytes::from_static(b"payload")).await.unwrap();
        let path = log.log_path().to_owned();
        let valid_bytes = read_all(&path).unwrap();
        drop(log);

        let frame_length = RECORD_FRAME_OVERHEAD_BYTES + b"payload".len();
        for relative_offset in 0..frame_length {
            let mut corrupted = valid_bytes.clone();
            corrupted[HEADER_LEN + relative_offset] ^= 0x01;
            fs::write(&path, corrupted).unwrap();
            let error = DurableLog::open(&directory).unwrap_err();
            assert_eq!(error.kind(), ErrorKind::Corrupt, "offset {relative_offset}");
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn record_crash_points_recover_to_a_valid_prefix() {
        let crash_points = [
            CrashPoint::RecordAfterHeaderWrite,
            CrashPoint::RecordAfterPayloadWrite,
            CrashPoint::RecordAfterTrailerWrite,
            CrashPoint::RecordBeforeSync,
            CrashPoint::RecordAfterSync,
        ];
        for point in crash_points {
            let directory = test_directory("record-crash");
            let log = DurableLog::open(&directory).unwrap();
            let first = log.append(Bytes::from_static(b"first")).await.unwrap();
            drop(log);

            let injector = Arc::new(CrashInjector::new([point]));
            let log = DurableLog::open_with_crash_injector(&directory, injector).unwrap();
            assert!(log.append(Bytes::from_static(b"second")).await.is_err());
            drop(log);

            let reopened = DurableLog::open(&directory).unwrap();
            let records = reopened
                .read(None)
                .await
                .unwrap()
                .try_collect::<Vec<_>>()
                .await
                .unwrap();
            assert_eq!(records.first().unwrap().position, first.position);
            assert!(records.len() == 1 || records.len() == 2, "point {point:?}");
            fs::remove_dir_all(directory).unwrap();
        }
    }

    #[test]
    fn reopen_crash_point_is_one_shot() {
        let directory = test_directory("reopen-crash");
        let log = DurableLog::open(&directory).unwrap();
        drop(log);
        let injector = Arc::new(CrashInjector::new([CrashPoint::OpenAfterLogRead]));
        assert!(DurableLog::open_with_crash_injector(&directory, injector).is_err());
        DurableLog::open(&directory).unwrap();
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn acknowledged_snapshot_recovers_and_replay_starts_after_it() {
        let directory = test_directory("snapshot-replay");
        let log = DurableLog::open(&directory).unwrap();
        log.append(Bytes::from_static(b"first")).await.unwrap();
        let second = log.append(Bytes::from_static(b"second")).await.unwrap();
        let third = log.append(Bytes::from_static(b"third")).await.unwrap();
        let snapshot = Snapshot {
            includes_through: SnapshotPosition::At(second.position.clone()),
            payload: Bytes::from_static(b"state-at-second"),
        };
        let id = log.publish(snapshot.clone(), None).await.unwrap();
        drop(log);

        let reopened = DurableLog::open(&directory).unwrap();
        assert_eq!(
            reopened.latest().await.unwrap(),
            Some(PublishedSnapshot {
                id,
                snapshot: snapshot.clone(),
            })
        );
        let replay = reopened
            .read(match &snapshot.includes_through {
                SnapshotPosition::At(position) => Some(position),
                SnapshotPosition::Initial => None,
            })
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(replay.len(), 1);
        assert_eq!(replay[0].position, third.position);
        assert_eq!(replay[0].payload, Bytes::from_static(b"third"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn snapshot_lineage_conflict_and_position_regression_are_rejected() {
        let directory = test_directory("snapshot-lineage");
        let log = DurableLog::open(&directory).unwrap();
        let first = log.append(Bytes::from_static(b"first")).await.unwrap();
        let second = log.append(Bytes::from_static(b"second")).await.unwrap();
        let latest_id = log
            .publish(
                Snapshot {
                    includes_through: SnapshotPosition::At(second.position.clone()),
                    payload: Bytes::from_static(b"newer"),
                },
                None,
            )
            .await
            .unwrap();

        let wrong_parent = SnapshotId::from_bytes(Bytes::from_static(b"wrong"));
        let conflict = log
            .publish(
                Snapshot {
                    includes_through: SnapshotPosition::At(second.position),
                    payload: Bytes::from_static(b"conflict"),
                },
                Some(&wrong_parent),
            )
            .await
            .unwrap_err();
        assert_eq!(conflict.kind(), ErrorKind::Conflict);

        let regression = log
            .publish(
                Snapshot {
                    includes_through: SnapshotPosition::At(first.position),
                    payload: Bytes::from_static(b"older"),
                },
                Some(&latest_id),
            )
            .await
            .unwrap_err();
        assert_eq!(regression.kind(), ErrorKind::Conflict);
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn every_snapshot_publication_crash_recovers_a_valid_lineage_member() {
        let crash_points = [
            CrashPoint::SnapshotAfterCreate,
            CrashPoint::SnapshotAfterWrite,
            CrashPoint::SnapshotBeforeFileSync,
            CrashPoint::SnapshotAfterFileSync,
            CrashPoint::SnapshotBeforeRename,
            CrashPoint::SnapshotAfterRename,
            CrashPoint::SnapshotBeforeDirectorySync,
            CrashPoint::SnapshotAfterDirectorySync,
        ];
        for point in crash_points {
            let directory = test_directory("snapshot-crash");
            let log = DurableLog::open(&directory).unwrap();
            let first = log.append(Bytes::from_static(b"first")).await.unwrap();
            let second = log.append(Bytes::from_static(b"second")).await.unwrap();
            let baseline_id = log
                .publish(
                    Snapshot {
                        includes_through: SnapshotPosition::At(first.position),
                        payload: Bytes::from_static(b"baseline"),
                    },
                    None,
                )
                .await
                .unwrap();
            drop(log);

            let injector = Arc::new(CrashInjector::new([point]));
            let log = DurableLog::open_with_crash_injector(&directory, injector).unwrap();
            let attempted = Snapshot {
                includes_through: SnapshotPosition::At(second.position),
                payload: Bytes::from_static(b"attempted"),
            };
            assert!(log.publish(attempted, Some(&baseline_id)).await.is_err());
            drop(log);

            let reopened = DurableLog::open(&directory).unwrap();
            let recovered = reopened.latest().await.unwrap().unwrap();
            assert!(
                recovered.snapshot.payload == Bytes::from_static(b"baseline")
                    || recovered.snapshot.payload == Bytes::from_static(b"attempted"),
                "point {point:?}"
            );
            fs::remove_dir_all(directory).unwrap();
        }
    }

    #[tokio::test]
    async fn corruption_in_each_snapshot_record_region_is_rejected() {
        let directory = test_directory("snapshot-corruption");
        let log = DurableLog::open(&directory).unwrap();
        let receipt = log.append(Bytes::from_static(b"record")).await.unwrap();
        log.publish(
            Snapshot {
                includes_through: SnapshotPosition::At(receipt.position),
                payload: Bytes::from_static(b"snapshot-payload"),
            },
            None,
        )
        .await
        .unwrap();
        let path = directory.join(SNAPSHOT_FILE);
        let valid_bytes = read_all(&path).unwrap();
        drop(log);

        for offset in 0..valid_bytes.len() {
            let mut corrupted = valid_bytes.clone();
            corrupted[offset] ^= 0x01;
            fs::write(&path, corrupted).unwrap();
            let error = DurableLog::open(&directory).unwrap_err();
            assert_eq!(error.kind(), ErrorKind::Corrupt, "offset {offset}");
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn snapshot_size_matches_framing_policy() {
        let directory = test_directory("snapshot-size");
        let log = DurableLog::open(&directory).unwrap();
        let receipt = log.append(Bytes::from_static(b"record")).await.unwrap();
        let payload = Bytes::from(vec![0x5a; 1024]);
        log.publish(
            Snapshot {
                includes_through: SnapshotPosition::At(receipt.position),
                payload: payload.clone(),
            },
            None,
        )
        .await
        .unwrap();
        let persisted = fs::metadata(directory.join(SNAPSHOT_FILE)).unwrap().len();
        let expected = (SNAPSHOT_HEADER_LEN + payload.len() + FRAME_TRAILER_LEN) as u64;
        assert_eq!(persisted, expected);
        eprintln!(
            "snapshot_payload_bytes={} snapshot_persisted_bytes={persisted}",
            payload.len()
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn snapshot_reopen_crash_point_is_one_shot() {
        let directory = test_directory("snapshot-reopen-crash");
        let log = DurableLog::open(&directory).unwrap();
        let receipt = log.append(Bytes::from_static(b"record")).await.unwrap();
        log.publish(
            Snapshot {
                includes_through: SnapshotPosition::At(receipt.position),
                payload: Bytes::from_static(b"snapshot"),
            },
            None,
        )
        .await
        .unwrap();
        drop(log);

        let injector = Arc::new(CrashInjector::new([CrashPoint::OpenAfterSnapshotRead]));
        assert!(DurableLog::open_with_crash_injector(&directory, injector).is_err());
        assert!(
            DurableLog::open(&directory)
                .unwrap()
                .latest()
                .await
                .unwrap()
                .is_some()
        );
        fs::remove_dir_all(directory).unwrap();
    }
}
