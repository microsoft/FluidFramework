//! Exclusive framed journal for filesystem document components.
//!
//! Each record carries its length, complemented length, and content checksum. Recovery returns
//! only complete verified suffix records after the storage cursor boundary; interpretation and
//! dependency-closure checks remain the responsibility of `sea_file::storage`.
//!
//! Buffered openings append in place and reject incomplete tails.
//! Durable openings append frames in place and synchronize once per group before acknowledgment.
//! This requires durable-prefix integrity: appending or truncating an unsynchronized tail must not
//! damage previously synchronized bytes, including bytes sharing its final sector. Creation still
//! publishes through synchronized rename. Recovery truncates incomplete tails and synchronizes the
//! selected journal and directory before exposing records.
//! Complete malformed suffix frames remain corruption, not discardable uncommitted data.
//! The settled prefix is validated on historical access rather than rescanned during opening.
//!
//! Power-loss recovery assumes durable-prefix integrity, crash-atomic creation rename, truthful
//! synchronization, and tails consisting of valid frames followed by at most a short header or
//! short payload with intact length metadata. Checksums cannot distinguish a full-length torn
//! unacknowledged frame from damaged committed history; both fail recovery. Loss of acknowledged
//! length is indistinguishable from an interrupted tail and is excluded by this model.
//! Media corruption and a switch to buffered writes are outside the guarantee.
//!
//! Once writing begins, an I/O failure or injected uncertain boundary poisons the opening. Later
//! mutations and authoritative observations return [`FileStorageError::Ambiguous`] until every
//! owner drops the journal and a new exclusive opening recovers it.

use crate::atomic_file;
use sea_core::{BlobId, ClassifiedError, ErrorKind};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};
use thiserror::Error;

/// Filesystem failures, including uncertain writes requiring reopening.
#[derive(Debug, Error)]
pub enum FileStorageError {
    /// An operation failed before any archive mutation.
    #[error("file I/O failed: {0}")]
    Io(#[from] std::io::Error),
    /// A frame or dependency violates the retained-prefix contract.
    #[error("corrupt document: {0}")]
    Corrupt(&'static str),
    /// A valid opening already owns this document.
    #[error("document already open")]
    Busy,
    /// An input is not valid for this component.
    #[error("rejected: {0}")]
    Rejected(&'static str),
    /// A nonempty read has a bound beyond its initialization head.
    #[error("position beyond archive head")]
    InvalidPosition,
    /// A journal mutation may have committed; this opening must be recovered.
    #[error("journal mutation requires recovery")]
    Ambiguous,
}

impl ClassifiedError for FileStorageError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Io(_) => ErrorKind::Unavailable,
            Self::Corrupt(_) => ErrorKind::Corrupt,
            Self::Busy => ErrorKind::Conflict,
            Self::Rejected(_) => ErrorKind::Rejected,
            Self::InvalidPosition => ErrorKind::InvalidPosition,
            Self::Ambiguous => ErrorKind::Ambiguous,
        }
    }
}

/// Format marker intentionally unrelated to the transitional backend format.
const MAGIC: &[u8; 8] = b"SEANEXT2";
/// Physical offset of the first frame in either journal.
pub(crate) const RECORD_START: u64 = MAGIC.len() as u64;
/// Length, complemented length, and content hash protect frame boundaries.
pub(crate) const FRAME_HEADER: usize = 48;

/// Computes the exclusive frame boundary without overflowing physical offsets.
pub(crate) fn frame_end(offset: u64, payload_length: u64) -> Option<u64> {
    offset
        .checked_add(FRAME_HEADER as u64)?
        .checked_add(payload_length)
}

/// Probes record identity bytes at a possible frame boundary without allocating its payload.
/// A matching prefix still requires a complete checked record read before claiming availability.
pub(crate) fn read_prefix<const LENGTH: usize>(
    source: &mut File,
    offset: u64,
) -> Result<Option<[u8; LENGTH]>, FileStorageError> {
    source.seek(SeekFrom::Start(offset))?;
    let mut header = [0; FRAME_HEADER];
    let mut prefix = [0; LENGTH];
    match source
        .read_exact(&mut header)
        .and_then(|()| source.read_exact(&mut prefix))
    {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(error.into()),
    }
    let length = u64::from_be_bytes(header[..8].try_into().unwrap());
    let inverse = u64::from_be_bytes(header[8..16].try_into().unwrap());
    Ok((inverse == !length).then_some(prefix))
}

/// An exclusive opening; the stable sidecar lock survives journal replacement.
pub(crate) struct Journal {
    /// Stable journal name used to publish its settled-tail cursor.
    path: PathBuf,
    /// Last record covered by the storage-owned settled cursor, or zero for an empty log.
    pub(crate) last: u64,
    /// First byte not covered by the storage-owned settled cursor.
    pub(crate) recovered_from: u64,
    /// Last published cursor value; absence requires publication even for an empty journal.
    cursor: Option<(u64, u64)>,
    /// Published file, positioned at its validated append boundary.
    file: File,
    /// Never replaced or removed; owns the OS lock across publication and recovery.
    _lock: File,
    /// Whether each acknowledged record must be synchronized.
    durable: bool,
    /// Prevents writes and authoritative observations after an uncertain write.
    failed: bool,
    /// Deterministic boundaries used only by localized recovery tests.
    #[cfg(test)]
    fault: Option<JournalFault>,
    /// Counts successful append synchronization calls, excluding opening and recovery.
    #[cfg(test)]
    pub(crate) syncs: usize,
    /// Counts journal synchronization barriers during creation or recovery.
    #[cfg(test)]
    opening_syncs: usize,
    /// Counts actual cursor replacements during this opening.
    #[cfg(test)]
    pub(crate) cursor_writes: usize,
    /// Pauses or panics at a completed-write boundary in executor and cancellation tests.
    #[cfg(test)]
    pub(crate) before_sync: Option<Box<dyn FnOnce() + Send>>,
}

/// Failure boundaries distinguish rejection, an incomplete tail, and lost acknowledgment.
#[cfg(test)]
#[derive(Clone, Copy, Debug)]
pub(crate) enum JournalFault {
    /// Fails without touching the journal.
    BeforeWrite,
    /// Leaves an incomplete frame and an unusable opening.
    PartialWrite,
    /// Writes complete frames but fails before synchronization.
    BeforeSync,
    /// Commits and synchronizes the complete frame, then loses acknowledgment.
    AfterSync,
}

impl Journal {
    /// Creates or recovers a journal under its exclusive OS lock.
    pub(crate) fn open(
        path: &Path,
        create: bool,
        durable: bool,
    ) -> Result<(Self, Vec<Vec<u8>>), FileStorageError> {
        if create && path.try_exists()? {
            return Err(FileStorageError::Io(
                std::io::ErrorKind::AlreadyExists.into(),
            ));
        }
        let lock = lock_journal(path, create)?;
        if create && path.try_exists()? {
            return Err(FileStorageError::Io(
                std::io::ErrorKind::AlreadyExists.into(),
            ));
        }
        #[cfg(test)]
        let mut opening_syncs = 0;
        let mut file = if create && durable {
            let mut staged = staging_file(path)?;
            staged.write_all(MAGIC)?;
            publish(path, &staged)?;
            #[cfg(test)]
            {
                opening_syncs += 1;
            }
            staged
        } else {
            let mut file = OpenOptions::new()
                .read(true)
                .write(true)
                .create_new(create)
                .open(path)?;
            if create {
                file.write_all(MAGIC)?;
            }
            file
        };
        file.seek(SeekFrom::Start(0))?;
        let mut magic = [0; 8];
        match file.read_exact(&mut magic) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => {
                return Err(FileStorageError::Corrupt("journal header"));
            }
            Err(error) => return Err(error.into()),
        }
        if &magic != MAGIC {
            return Err(FileStorageError::Corrupt("journal header"));
        }
        let cursor = if create {
            None
        } else {
            atomic_file::read(&path.with_extension("cursor"))?
        };
        let (start, last) = Self::decode_cursor(cursor.as_deref())?;
        let length = file.metadata()?.len();
        let (records, boundary) = recover_tail(&mut file, start, length, durable)?;
        if boundary != length {
            file.set_len(boundary)?;
        }
        match fs::remove_file(path.with_extension("pending")) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        if durable && !create {
            file.sync_all()?;
            sync_parent(path)?;
            #[cfg(test)]
            {
                opening_syncs += 1;
            }
        }
        file.seek(SeekFrom::End(0))?;
        Ok((
            Self {
                path: path.to_path_buf(),
                last,
                recovered_from: start,
                cursor: cursor.map(|_| (start, last)),
                file,
                _lock: lock,
                durable,
                failed: false,
                #[cfg(test)]
                fault: None,
                #[cfg(test)]
                syncs: 0,
                #[cfg(test)]
                opening_syncs,
                #[cfg(test)]
                cursor_writes: 0,
                #[cfg(test)]
                before_sync: None,
            },
            records,
        ))
    }

    /// Validates the fixed-size storage cursor without loading historical addresses.
    fn decode_cursor(cursor: Option<&[u8]>) -> Result<(u64, u64), FileStorageError> {
        let Some(cursor) = cursor else {
            return Ok((8, 0));
        };
        if cursor.len() != 16 {
            return Err(FileStorageError::Corrupt("journal cursor"));
        }
        let boundary = u64::from_be_bytes(cursor[..8].try_into().unwrap());
        let last = u64::from_be_bytes(cursor[8..].try_into().unwrap());
        if (boundary == 8) != (last == 0) || (last != 0 && (last < 8 || last >= boundary)) {
            return Err(FileStorageError::Corrupt("journal cursor boundary"));
        }
        Ok((boundary, last))
    }

    /// Refuses observations that could mistake an uncertain tail for settled absence.
    pub(crate) fn ready(&self) -> Result<(), FileStorageError> {
        if self.failed {
            Err(FileStorageError::Ambiguous)
        } else {
            Ok(())
        }
    }

    /// Returns the settled append boundary while the caller holds the mutation order.
    pub(crate) fn boundary(&mut self) -> Result<u64, FileStorageError> {
        self.ready()?;
        Ok(self.file.stream_position()?)
    }

    /// Opens an independent read cursor while this journal retains exclusive ownership.
    pub(crate) fn reader(&self) -> Result<File, FileStorageError> {
        self.ready()?;
        Ok(File::open(&self.path)?)
    }

    /// Publishes the storage-owned validated tail without any historical address table.
    pub(crate) fn remember_tail(&mut self, last: u64) -> Result<(), FileStorageError> {
        let boundary = self.boundary()?;
        if self.cursor == Some((boundary, last)) {
            return Ok(());
        }
        self.failed = true;
        let result = {
            let mut cursor = boundary.to_be_bytes().to_vec();
            cursor.extend_from_slice(&last.to_be_bytes());
            atomic_file::write(&self.path.with_extension("cursor"), &cursor, self.durable)
        };
        match result {
            Ok(()) => {
                self.last = last;
                self.cursor = Some((boundary, last));
                #[cfg(test)]
                {
                    self.cursor_writes += 1;
                }
                self.failed = false;
                Ok(())
            }
            Err(_) => Err(FileStorageError::Ambiguous),
        }
    }

    /// Returns the publication policy shared by this document's immutable files.
    pub(crate) const fn durable(&self) -> bool {
        self.durable
    }

    /// Arms one deterministic failure without exposing fault machinery to production callers.
    #[cfg(test)]
    pub(crate) fn inject(&mut self, fault: JournalFault) {
        self.fault = Some(fault);
    }

    /// Writes once, synchronously; an I/O failure poisons this opening until recovery.
    pub(crate) fn append(&mut self, payload: &[u8]) -> Result<(), FileStorageError> {
        self.append_batch(&[payload])
    }

    /// Appends a group with one sync; on uncertainty any prefix of the group may survive.
    /// No caller may publish any member until this method succeeds.
    pub(crate) fn append_batch(&mut self, payloads: &[&[u8]]) -> Result<(), FileStorageError> {
        self.ready()?;
        if payloads.is_empty() {
            return Ok(());
        }
        #[cfg(test)]
        let fault = {
            let fault = self.fault.take();
            if matches!(fault, Some(JournalFault::BeforeWrite)) {
                return Err(FileStorageError::Rejected("injected before write"));
            }
            fault
        };
        let mut frame = Vec::new();
        for payload in payloads {
            let length = payload.len() as u64;
            frame.extend_from_slice(&length.to_be_bytes());
            frame.extend_from_slice(&(!length).to_be_bytes());
            frame.extend_from_slice(BlobId::for_bytes(payload).as_bytes());
            frame.extend_from_slice(payload);
        }
        self.failed = true;
        #[cfg(test)]
        if matches!(fault, Some(JournalFault::PartialWrite)) {
            self.file
                .write_all(&frame[..20])
                .map_err(|_| FileStorageError::Ambiguous)?;
            return Err(FileStorageError::Ambiguous);
        }
        self.file
            .write_all(&frame)
            .map_err(|_| FileStorageError::Ambiguous)?;
        #[cfg(test)]
        {
            if matches!(fault, Some(JournalFault::BeforeSync)) {
                return Err(FileStorageError::Ambiguous);
            }
            if let Some(before_sync) = self.before_sync.take() {
                before_sync();
            }
        }
        if self.durable {
            self.file
                .sync_all()
                .map_err(|_| FileStorageError::Ambiguous)?;
        }
        #[cfg(test)]
        {
            if self.durable {
                self.syncs += 1;
            }
            if matches!(fault, Some(JournalFault::AfterSync)) {
                return Err(FileStorageError::Ambiguous);
            }
        }
        self.failed = false;
        Ok(())
    }
}

/// Acquires a stable sidecar lock, distinguishing allocation races from occupied openings.
fn lock_journal(path: &Path, create: bool) -> Result<File, FileStorageError> {
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path.with_extension("lock"))?;
    lock.try_lock().map_err(|error| match error {
        std::fs::TryLockError::WouldBlock if create => {
            FileStorageError::Io(std::io::ErrorKind::AlreadyExists.into())
        }
        std::fs::TryLockError::WouldBlock => FileStorageError::Busy,
        std::fs::TryLockError::Error(error) => FileStorageError::Io(error),
    })?;
    Ok(lock)
}

/// Creates a fresh unpublished inode while the document's stable lock is held.
fn staging_file(path: &Path) -> Result<File, std::io::Error> {
    let pending = path.with_extension("pending");
    match fs::remove_file(&pending) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .open(pending)
}

/// Makes a complete replacement and its namespace entry stable before returning.
fn publish(path: &Path, staged: &File) -> Result<(), std::io::Error> {
    staged.sync_all()?;
    fs::rename(path.with_extension("pending"), path)?;
    sync_parent(path)
}

/// Persists publication; also completes a rename whose acknowledgment was lost on a prior opening.
fn sync_parent(path: &Path) -> Result<(), std::io::Error> {
    File::open(path.parent().ok_or(std::io::ErrorKind::InvalidInput)?)?.sync_all()
}

/// Reads only frames at or after a trusted boundary; durable recovery tolerates a short final frame.
fn recover_tail(
    source: &mut (impl Read + Seek),
    start: u64,
    length: u64,
    durable: bool,
) -> Result<(Vec<Vec<u8>>, u64), FileStorageError> {
    if start < MAGIC.len() as u64 || start > length {
        return Err(FileStorageError::Corrupt("journal recovery boundary"));
    }
    source.seek(SeekFrom::Start(start))?;
    let mut cursor = start;
    let mut records = Vec::new();
    while cursor < length {
        if length - cursor < FRAME_HEADER as u64 {
            break;
        }
        let mut header = [0; FRAME_HEADER];
        source.read_exact(&mut header)?;
        let payload_length = u64::from_be_bytes(header[..8].try_into().unwrap());
        let inverse = u64::from_be_bytes(header[8..16].try_into().unwrap());
        if inverse != !payload_length {
            return Err(FileStorageError::Corrupt("frame length"));
        }
        let end =
            frame_end(cursor, payload_length).ok_or(FileStorageError::Corrupt("frame overflow"))?;
        if end > length {
            break;
        }
        let payload_length = usize::try_from(payload_length)
            .map_err(|_| FileStorageError::Corrupt("frame overflow"))?;
        let mut payload = vec![0; payload_length];
        source.read_exact(&mut payload)?;
        if BlobId::for_bytes(&payload).as_bytes() != &header[16..48] {
            return Err(FileStorageError::Corrupt("frame checksum"));
        }
        records.push(payload);
        cursor = end;
    }
    if cursor != length && !durable {
        return Err(FileStorageError::Corrupt("incomplete buffered journal"));
    }
    Ok((records, cursor))
}

/// Fetches and verifies exactly one historical frame through an independent read cursor.
pub(crate) fn read_record(source: &mut File, offset: u64) -> Result<Vec<u8>, FileStorageError> {
    source.seek(SeekFrom::Start(offset))?;
    let mut header = [0; FRAME_HEADER];
    source.read_exact(&mut header)?;
    let length = u64::from_be_bytes(header[..8].try_into().unwrap());
    let end = frame_end(offset, length).ok_or(FileStorageError::Corrupt("frame overflow"))?;
    if end > source.metadata()?.len() {
        return Err(FileStorageError::Corrupt("addressed frame length"));
    }
    let (mut records, boundary) = recover_tail(source, offset, end, false)?;
    if boundary != end || records.len() != 1 {
        return Err(FileStorageError::Corrupt("addressed frame"));
    }
    Ok(records.remove(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checked_boundaries_and_prefix_probes_match_persisted_frames() {
        assert_eq!(frame_end(8, 9), Some(65));
        assert_eq!(frame_end(u64::MAX, 0), None);
        assert_eq!(frame_end(8, u64::MAX), None);
        let root = std::env::temp_dir().join(format!("sea-prefix-probe-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("document.sea");
        let (mut journal, _) = Journal::open(&path, true, true).unwrap();
        journal.append(b"identity!").unwrap();
        assert_eq!(journal.boundary().unwrap(), 65);
        let mut reader = journal.reader().unwrap();
        assert_eq!(
            read_prefix::<9>(&mut reader, 8).unwrap(),
            Some(*b"identity!")
        );
        assert_eq!(read_prefix::<10>(&mut reader, 8).unwrap(), None);
        assert_eq!(read_prefix::<9>(&mut reader, 65).unwrap(), None);
        let mut writer = fs::OpenOptions::new().write(true).open(&path).unwrap();
        writer.seek(SeekFrom::Start(16)).unwrap();
        writer.write_all(&0_u64.to_be_bytes()).unwrap();
        assert_eq!(read_prefix::<9>(&mut reader, 8).unwrap(), None);
        drop((journal, reader, writer));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reopening_settles_once_and_only_replaces_changed_cursors() {
        let root =
            std::env::temp_dir().join(format!("sea-cursor-settlement-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("document.sea");
        let (mut journal, _) = Journal::open(&path, true, true).unwrap();
        assert_eq!(journal.opening_syncs, 1);
        journal.remember_tail(0).unwrap();
        assert_eq!(journal.cursor_writes, 1);
        drop(journal);
        let (mut journal, records) = Journal::open(&path, false, true).unwrap();
        assert!(records.is_empty());
        assert_eq!(journal.opening_syncs, 1);
        journal.remember_tail(0).unwrap();
        assert_eq!(journal.cursor_writes, 0);
        journal.append(b"settled").unwrap();
        journal.remember_tail(8).unwrap();
        assert_eq!(journal.cursor_writes, 1);
        let tail = journal.boundary().unwrap();
        journal.inject(JournalFault::BeforeSync);
        assert!(matches!(
            journal.append(b"uncertain"),
            Err(FileStorageError::Ambiguous)
        ));
        drop(journal);
        let (mut journal, records) = Journal::open(&path, false, true).unwrap();
        assert_eq!(records, vec![b"uncertain".to_vec()]);
        assert_eq!(journal.opening_syncs, 1);
        journal.remember_tail(tail).unwrap();
        assert_eq!(journal.cursor_writes, 1);
        drop(journal);
        let (mut journal, records) = Journal::open(&path, false, true).unwrap();
        assert!(records.is_empty());
        assert_eq!(journal.opening_syncs, 1);
        journal.remember_tail(tail).unwrap();
        assert_eq!(journal.cursor_writes, 0);
        drop(journal);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn storage_cursor_skips_old_frames_without_a_sequencer_checkpoint() {
        let root = std::env::temp_dir().join(format!("sea-cursor-journal-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("document.sea");
        let (mut journal, _) = Journal::open(&path, true, true).unwrap();
        journal.append(b"old").unwrap();
        let boundary = journal.boundary().unwrap();
        journal.remember_tail(8).unwrap();
        journal.append(b"tail").unwrap();
        drop(journal);
        let (journal, records) = Journal::open(&path, false, true).unwrap();
        assert_eq!(records, vec![b"tail".to_vec()]);
        assert_eq!(journal.recovered_from, boundary);
        assert_eq!(journal.last, 8);
        assert_eq!(
            fs::metadata(path.with_extension("cursor")).unwrap().len(),
            48
        );
        let mut reader = journal.reader().unwrap();
        assert_eq!(read_record(&mut reader, 8).unwrap(), b"old");
        drop((journal, reader));
        fs::remove_dir_all(root).unwrap();
    }

    /// Records the earliest byte requested by recovery and the total data read.
    struct ObservedRead {
        /// In-memory journal fixture with seek support.
        source: std::io::Cursor<Vec<u8>>,
        /// Inclusive lower bound on all reads.
        earliest: u64,
        /// Number of bytes actually read.
        bytes: usize,
    }

    impl Read for ObservedRead {
        fn read(&mut self, output: &mut [u8]) -> std::io::Result<usize> {
            self.earliest = self.earliest.min(self.source.position());
            let count = self.source.read(output)?;
            self.bytes += count;
            Ok(count)
        }
    }

    impl Seek for ObservedRead {
        fn seek(&mut self, position: SeekFrom) -> std::io::Result<u64> {
            self.source.seek(position)
        }
    }

    #[test]
    fn recovery_from_boundary_never_reads_older_payloads() {
        let payload = b"recent";
        let start = 1024 * 1024;
        let mut bytes = vec![0xff; start];
        bytes.extend_from_slice(&(payload.len() as u64).to_be_bytes());
        bytes.extend_from_slice(&(!(payload.len() as u64)).to_be_bytes());
        bytes.extend_from_slice(BlobId::for_bytes(payload).as_bytes());
        bytes.extend_from_slice(payload);
        let length = bytes.len() as u64;
        let mut observed = ObservedRead {
            source: std::io::Cursor::new(bytes),
            earliest: u64::MAX,
            bytes: 0,
        };
        let (records, boundary) = recover_tail(&mut observed, start as u64, length, true).unwrap();
        assert_eq!(records, vec![payload.to_vec()]);
        assert_eq!(boundary, length);
        assert_eq!(observed.earliest, start as u64);
        assert_eq!(observed.bytes, FRAME_HEADER + payload.len());
    }

    #[test]
    fn durable_append_reuses_inode_and_recovers_uncertain_prefix() {
        let root = std::env::temp_dir().join(format!("sea-publication-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        for (index, fault) in [
            JournalFault::PartialWrite,
            JournalFault::BeforeSync,
            JournalFault::AfterSync,
        ]
        .into_iter()
        .enumerate()
        {
            for rollback in [false, true] {
                let path = root.join(format!("journal-{index}-{rollback}"));
                let (mut journal, _) = Journal::open(&path, true, true).unwrap();
                journal.append(b"acknowledged").unwrap();
                let published = fs::read(&path).unwrap();
                let mut old_inode = File::open(&path).unwrap();
                journal.inject(fault);
                assert!(matches!(
                    journal.append(b"next"),
                    Err(FileStorageError::Ambiguous)
                ));
                assert!(matches!(journal.ready(), Err(FileStorageError::Ambiguous)));
                for durable in [false, true] {
                    assert!(matches!(
                        Journal::open(&path, false, durable),
                        Err(FileStorageError::Busy)
                    ));
                }
                let mut retained = Vec::new();
                old_inode.read_to_end(&mut retained).unwrap();
                assert!(retained.starts_with(&published));
                assert!(retained.len() > published.len());
                assert_eq!(retained, fs::read(&path).unwrap());
                assert!(!path.with_extension("pending").exists());
                drop((old_inode, journal));
                if rollback && matches!(fault, JournalFault::BeforeSync) {
                    fs::write(&path, &published).unwrap();
                }
                let (mut journal, records) = Journal::open(&path, false, true).unwrap();
                let mut expected = vec![b"acknowledged".to_vec()];
                if matches!(fault, JournalFault::AfterSync)
                    || (!rollback && matches!(fault, JournalFault::BeforeSync))
                {
                    expected.push(b"next".to_vec());
                }
                assert_eq!(records, expected);
                journal.append(b"resumed").unwrap();
                drop(journal);
                expected.push(b"resumed".to_vec());
                let (journal, records) = Journal::open(&path, false, true).unwrap();
                assert_eq!(records, expected);
                drop(journal);
            }
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn recovery_repairs_every_incomplete_tail_but_rejects_complete_corruption() {
        let root = std::env::temp_dir().join(format!("sea-staging-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("journal");
        let (mut journal, _) = Journal::open(&path, true, true).unwrap();
        journal.append(b"acknowledged").unwrap();
        let published = fs::read(&path).unwrap();
        journal.append(b"unacknowledged").unwrap();
        let candidate = fs::read(&path).unwrap();
        drop(journal);
        for length in published.len()..candidate.len() {
            fs::write(&path, &candidate[..length]).unwrap();
            fs::write(path.with_extension("pending"), b"ignored creation staging").unwrap();
            let (journal, records) = Journal::open(&path, false, true).unwrap();
            assert_eq!(records, vec![b"acknowledged".to_vec()]);
            assert_eq!(fs::read(&path).unwrap(), published);
            assert!(!path.with_extension("pending").exists());
            drop(journal);
        }
        for offset in published.len()..candidate.len() {
            let mut corrupt = candidate.clone();
            corrupt[offset] ^= 1;
            fs::write(&path, corrupt).unwrap();
            assert!(matches!(
                Journal::open(&path, false, true),
                Err(FileStorageError::Corrupt(_))
            ));
        }
        let mut corrupt = published;
        *corrupt.last_mut().unwrap() ^= 1;
        fs::write(&path, corrupt).unwrap();
        assert!(matches!(
            Journal::open(&path, false, true),
            Err(FileStorageError::Corrupt(_))
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn interrupted_creation_does_not_publish_an_invalid_header() {
        let root = std::env::temp_dir().join(format!("sea-creation-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        for length in 0..=MAGIC.len() {
            let path = root.join(format!("journal-{length}"));
            fs::write(path.with_extension("pending"), &MAGIC[..length]).unwrap();
            assert!(
                matches!(Journal::open(&path, false, true), Err(FileStorageError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound)
            );
            let (journal, records) = Journal::open(&path, true, true).unwrap();
            assert!(records.is_empty());
            assert_eq!(fs::read(&path).unwrap(), MAGIC);
            assert!(
                matches!(Journal::open(&path, true, true), Err(FileStorageError::Io(error)) if error.kind() == std::io::ErrorKind::AlreadyExists)
            );
            drop(journal);
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn interrupted_durable_append_preserves_acknowledged_prefix() {
        let root =
            std::env::temp_dir().join(format!("sea-published-journal-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("journal");
        let (mut journal, _) = Journal::open(&path, true, true).unwrap();
        journal.append(b"acknowledged").unwrap();
        let published = std::fs::read(&path).unwrap();
        journal.inject(JournalFault::PartialWrite);
        assert!(matches!(
            journal.append(b"unacknowledged"),
            Err(FileStorageError::Ambiguous)
        ));
        let interrupted = std::fs::read(&path).unwrap();
        assert!(interrupted.starts_with(&published));
        assert_eq!(interrupted.len(), published.len() + 20);
        drop(journal);
        let (journal, records) = Journal::open(&path, false, true).unwrap();
        assert_eq!(records, vec![b"acknowledged".to_vec()]);
        assert_eq!(std::fs::read(&path).unwrap(), published);
        drop(journal);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn durable_batch_syncs_once_and_empty_batch_does_not_sync() {
        let root = std::env::temp_dir().join(format!("sea-batch-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("journal");
        let (mut journal, _) = Journal::open(&path, true, true).unwrap();
        journal.append_batch(&[]).unwrap();
        assert_eq!(journal.syncs, 0);
        journal.append_batch(&[b"one", b"two", b"three"]).unwrap();
        assert_eq!(journal.syncs, 1);
        drop(journal);
        let (journal, records) = Journal::open(&path, false, true).unwrap();
        assert_eq!(
            records,
            vec![b"one".to_vec(), b"two".to_vec(), b"three".to_vec()]
        );
        drop(journal);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn exclusive_journal_round_trip_and_tail_policies() {
        let root = std::env::temp_dir().join(format!("sea-next-journal-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("journal");
        let (mut journal, records) = Journal::open(&path, true, true).unwrap();
        assert!(records.is_empty());
        assert!(matches!(
            Journal::open(&path, false, true),
            Err(FileStorageError::Busy)
        ));
        journal.append(b"one").unwrap();
        journal.append(b"two").unwrap();
        drop(journal);
        let (journal, records) = Journal::open(&path, false, true).unwrap();
        assert_eq!(records, vec![b"one".to_vec(), b"two".to_vec()]);
        drop(journal);
        OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(b"torn")
            .unwrap();
        assert!(matches!(
            Journal::open(&path, false, false),
            Err(FileStorageError::Corrupt(_))
        ));
        let (journal, records) = Journal::open(&path, false, true).unwrap();
        assert_eq!(records.len(), 2);
        drop(journal);
        assert!(Journal::open(&path, false, false).is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }
}
