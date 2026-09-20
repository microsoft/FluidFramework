//! Exclusive framed journal for filesystem document components.
//!
//! Each record carries its length, complemented length, and content checksum. Recovery returns
//! only complete verified records and the last valid byte boundary; interpretation and
//! dependency-closure checks remain the responsibility of `sea_file::storage`.
//!
//! Buffered openings append in place and reject incomplete tails.
//! Durable openings append frames in place and synchronize once per group before acknowledgment.
//! This requires durable-prefix integrity: appending or truncating an unsynchronized tail must not
//! damage previously synchronized bytes, including bytes sharing its final sector. Creation still
//! publishes through synchronized rename. Recovery truncates incomplete tails and synchronizes the
//! selected journal and directory before exposing records.
//! Complete malformed published frames remain corruption, not discardable uncommitted data.
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

use sea_core::{BlobId, ClassifiedError, ErrorKind};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
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
const MAGIC: &[u8; 8] = b"SEANEXT1";
/// Length, complemented length, and content hash protect frame boundaries.
const FRAME_HEADER: usize = 48;

/// An exclusive opening; the stable sidecar lock survives journal replacement.
pub(crate) struct Journal {
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
        if create && path.try_exists()? {
            return Err(FileStorageError::Io(
                std::io::ErrorKind::AlreadyExists.into(),
            ));
        }
        let mut file = if create && durable {
            let mut staged = staging_file(path)?;
            staged.write_all(MAGIC)?;
            publish(path, &staged)?;
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
        if durable {
            file.sync_all()?;
            sync_parent(path)?;
        }
        file.seek(SeekFrom::Start(0))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;
        let (records, boundary) = recover(&bytes, durable)?;
        if boundary != bytes.len() {
            file.set_len(boundary as u64)?;
        }
        if durable {
            file.sync_all()?;
            sync_parent(path)?;
        }
        match fs::remove_file(path.with_extension("pending")) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        file.seek(SeekFrom::End(0))?;
        Ok((
            Self {
                file,
                _lock: lock,
                durable,
                failed: false,
                #[cfg(test)]
                fault: None,
                #[cfg(test)]
                syncs: 0,
                #[cfg(test)]
                before_sync: None,
            },
            records,
        ))
    }

    /// Refuses observations that could mistake an uncertain tail for settled absence.
    pub(crate) fn ready(&self) -> Result<(), FileStorageError> {
        if self.failed {
            Err(FileStorageError::Ambiguous)
        } else {
            Ok(())
        }
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
        let fault = self.fault.take();
        #[cfg(test)]
        if matches!(fault, Some(JournalFault::BeforeWrite)) {
            return Err(FileStorageError::Rejected("injected before write"));
        }
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
        if matches!(fault, Some(JournalFault::BeforeSync)) {
            return Err(FileStorageError::Ambiguous);
        }
        #[cfg(test)]
        if let Some(before_sync) = self.before_sync.take() {
            before_sync();
        }
        if self.durable {
            self.file
                .sync_all()
                .map_err(|_| FileStorageError::Ambiguous)?;
            #[cfg(test)]
            {
                self.syncs += 1;
            }
        }
        #[cfg(test)]
        if matches!(fault, Some(JournalFault::AfterSync)) {
            return Err(FileStorageError::Ambiguous);
        }
        self.failed = false;
        Ok(())
    }
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

/// Accepts complete verified frames; only durable recovery tolerates an incomplete final frame.
fn recover(bytes: &[u8], durable: bool) -> Result<(Vec<Vec<u8>>, usize), FileStorageError> {
    if bytes.get(..8) != Some(MAGIC.as_slice()) {
        return Err(FileStorageError::Corrupt("journal header"));
    }
    let mut cursor = 8;
    let mut records = Vec::new();
    while cursor < bytes.len() {
        let tail = &bytes[cursor..];
        if tail.len() < FRAME_HEADER {
            break;
        }
        let length = u64::from_be_bytes(tail[..8].try_into().unwrap());
        let inverse = u64::from_be_bytes(tail[8..16].try_into().unwrap());
        if inverse != !length {
            return Err(FileStorageError::Corrupt("frame length"));
        }
        let length =
            usize::try_from(length).map_err(|_| FileStorageError::Corrupt("frame overflow"))?;
        let end = FRAME_HEADER
            .checked_add(length)
            .ok_or(FileStorageError::Corrupt("frame overflow"))?;
        let Some(payload) = tail.get(FRAME_HEADER..end) else {
            break;
        };
        if BlobId::for_bytes(payload).as_bytes() != &tail[16..48] {
            return Err(FileStorageError::Corrupt("frame checksum"));
        }
        records.push(payload.to_vec());
        cursor += end;
    }
    if cursor != bytes.len() && !durable {
        return Err(FileStorageError::Corrupt("incomplete buffered journal"));
    }
    Ok((records, cursor))
}

#[cfg(test)]
mod tests {
    use super::*;

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
