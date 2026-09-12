#![doc = "A focused checksummed, sync-before-acknowledgment append-log spike."]
#![doc = ""]
#![doc = "Records are length-framed and checksummed. Opening a log truncates only an"]
#![doc = "incomplete tail; a complete record with an invalid checksum is rejected."]
#![doc = "Snapshots, retention, multi-process access, and directory durability are out of scope."]

use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
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
    AppendReceipt, AppendStream, Capabilities, ClassifiedError, Durability, ErrorKind, ReadRecord,
    StreamReader,
};
use thiserror::Error;

const MAGIC: [u8; 8] = *b"SDLOG001";
const HEADER_LEN: usize = 24;
const FRAME_HEADER_LEN: usize = 12;
const LOG_FILE: &str = "stream.log";
static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);

/// An opaque ordinal tied to one persisted log generation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DurablePosition {
    generation: u128,
    ordinal: u64,
}

/// Errors exposed by the durable-log spike.
#[derive(Debug, Error)]
pub enum DurableLogError {
    #[error("log I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("append outcome may be committed: {0}")]
    AmbiguousAppend(std::io::Error),
    #[error("stored log is corrupt: {0}")]
    Corrupt(&'static str),
    #[error("position belongs to another log generation")]
    ForeignPosition,
    #[error("position is beyond the committed head")]
    InvalidPosition,
    #[error("durable log mutex was poisoned")]
    Poisoned,
}

impl ClassifiedError for DurableLogError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::AmbiguousAppend(_) => ErrorKind::Ambiguous,
            Self::Corrupt(_) => ErrorKind::Corrupt,
            Self::ForeignPosition | Self::InvalidPosition => ErrorKind::InvalidPosition,
            Self::Io(_) | Self::Poisoned => ErrorKind::Unavailable,
        }
    }
}

#[derive(Debug)]
struct State {
    records: Vec<Bytes>,
    writer: File,
}

/// A single-process append log that syncs record data before returning success.
#[derive(Clone, Debug)]
pub struct DurableLog {
    generation: u128,
    path: PathBuf,
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
        fs::create_dir_all(directory.as_ref())?;
        let path = directory.as_ref().join(LOG_FILE);
        if !path.exists() {
            initialize(&path, new_generation()?)?;
        }

        let (generation, records, valid_length) = parse_log(&read_all(&path)?)?;
        let writer = OpenOptions::new().read(true).append(true).open(&path)?;
        if writer.metadata()?.len() != valid_length {
            writer.set_len(valid_length)?;
            writer.sync_data()?;
        }

        Ok(Self {
            generation,
            path,
            state: Arc::new(Mutex::new(State { records, writer })),
        })
    }

    /// Returns the path used by the spike for deterministic recovery experiments.
    #[must_use]
    pub fn log_path(&self) -> &Path {
        &self.path
    }

    fn state(&self) -> Result<MutexGuard<'_, State>, DurableLogError> {
        self.state.lock().map_err(|_| DurableLogError::Poisoned)
    }

    fn validate_position(
        &self,
        position: &DurablePosition,
        record_count: usize,
    ) -> Result<(), DurableLogError> {
        if position.generation != self.generation {
            return Err(DurableLogError::ForeignPosition);
        }
        let record_count =
            u64::try_from(record_count).map_err(|_| DurableLogError::InvalidPosition)?;
        if position.ordinal == 0 || position.ordinal > record_count {
            return Err(DurableLogError::InvalidPosition);
        }
        Ok(())
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
        write_record(&mut state.writer, &value).map_err(DurableLogError::AmbiguousAppend)?;
        state
            .writer
            .sync_data()
            .map_err(DurableLogError::AmbiguousAppend)?;
        state.records.push(value);
        let ordinal = u64::try_from(state.records.len())
            .map_err(|_| DurableLogError::Corrupt("record count exceeds position range"))?;
        Ok(AppendReceipt {
            position: DurablePosition {
                generation: self.generation,
                ordinal,
            },
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
                self.validate_position(position, state.records.len())?;
                usize::try_from(position.ordinal).map_err(|_| DurableLogError::InvalidPosition)?
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
                    .map_err(|_| DurableLogError::Poisoned)
                    .and_then(|state| {
                        let ordinal = u64::try_from(index + 1).map_err(|_| {
                            DurableLogError::Corrupt("record count exceeds position range")
                        })?;
                        Ok(ReadRecord {
                            position: DurablePosition {
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
        let record_count = self.state()?.records.len();
        let ordinal = u64::try_from(record_count)
            .map_err(|_| DurableLogError::Corrupt("record count exceeds position range"))?;
        Ok((ordinal > 0).then_some(DurablePosition {
            generation: self.generation,
            ordinal,
        }))
    }
}

fn initialize(path: &Path, generation: u128) -> Result<(), DurableLogError> {
    let mut file = File::create(path)?;
    file.write_all(&MAGIC)?;
    file.write_all(&generation.to_be_bytes())?;
    file.sync_data()?;
    Ok(())
}

fn new_generation() -> Result<u128, DurableLogError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| DurableLogError::Corrupt("system clock is before the Unix epoch"))?
        .as_nanos();
    let process = u128::from(std::process::id()) << 64;
    let sequence = u128::from(NEXT_GENERATION.fetch_add(1, Ordering::Relaxed));
    Ok(timestamp ^ process ^ sequence)
}

fn read_all(path: &Path) -> Result<Vec<u8>, DurableLogError> {
    let mut bytes = Vec::new();
    File::open(path)?.read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn parse_log(bytes: &[u8]) -> Result<(u128, Vec<Bytes>, u64), DurableLogError> {
    if bytes.len() < HEADER_LEN {
        return Err(DurableLogError::Corrupt("incomplete log header"));
    }
    if bytes[..8] != MAGIC {
        return Err(DurableLogError::Corrupt("invalid log header"));
    }
    let generation = u128::from_be_bytes(
        bytes[8..HEADER_LEN]
            .try_into()
            .map_err(|_| DurableLogError::Corrupt("invalid generation"))?,
    );
    let mut cursor = HEADER_LEN;
    let mut records = Vec::new();
    while cursor < bytes.len() {
        let record_start = cursor;
        let Some(frame_header) = bytes.get(cursor..cursor.saturating_add(FRAME_HEADER_LEN)) else {
            return Ok((generation, records, record_start as u64));
        };
        let length = u64::from_be_bytes(
            frame_header[..8]
                .try_into()
                .map_err(|_| DurableLogError::Corrupt("invalid record length"))?,
        );
        let checksum = u32::from_be_bytes(
            frame_header[8..]
                .try_into()
                .map_err(|_| DurableLogError::Corrupt("invalid record checksum"))?,
        );
        let length = usize::try_from(length)
            .map_err(|_| DurableLogError::Corrupt("record length exceeds address space"))?;
        cursor = cursor
            .checked_add(FRAME_HEADER_LEN)
            .ok_or(DurableLogError::Corrupt("record length overflow"))?;
        let Some(payload) = bytes.get(cursor..cursor.saturating_add(length)) else {
            return Ok((generation, records, record_start as u64));
        };
        if crc32fast::hash(payload) != checksum {
            return Err(DurableLogError::Corrupt("record checksum mismatch"));
        }
        records.push(Bytes::copy_from_slice(payload));
        cursor = cursor
            .checked_add(length)
            .ok_or(DurableLogError::Corrupt("record length overflow"))?;
    }
    let valid_length = u64::try_from(cursor)
        .map_err(|_| DurableLogError::Corrupt("log length exceeds file range"))?;
    Ok((generation, records, valid_length))
}

fn write_record(writer: &mut impl Write, payload: &[u8]) -> std::io::Result<()> {
    let length = u64::try_from(payload.len()).map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "payload exceeds record length range",
        )
    })?;
    writer.write_all(&length.to_be_bytes())?;
    writer.write_all(&crc32fast::hash(payload).to_be_bytes())?;
    writer.write_all(payload)
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::{Seek, SeekFrom},
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };

    use futures_util::TryStreamExt;
    use snapshotted_stream_core::{AppendStream, ClassifiedError};

    use super::*;

    static NEXT_TEST_DIRECTORY: AtomicU64 = AtomicU64::new(1);

    fn test_directory(label: &str) -> PathBuf {
        let id = NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "snapshotted-stream-durable-log-{}-{label}-{id}",
            std::process::id()
        ))
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
        file.seek(SeekFrom::Start((HEADER_LEN + 8) as u64)).unwrap();
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

        let expected = HEADER_LEN as u64 + 10_000 * (FRAME_HEADER_LEN as u64 + 64);
        assert_eq!(fs::metadata(log.log_path()).unwrap().len(), expected);
        drop(log);
        let reopened = DurableLog::open(&directory).unwrap();
        assert_eq!(reopened.state().unwrap().records.len(), 10_000);
        fs::remove_dir_all(directory).unwrap();
    }
}
