//! Exclusive framed journal for replacement filesystem document components.
//!
//! Each record carries its length, complemented length, and content checksum. Recovery returns
//! only complete verified records and the last valid byte boundary; interpretation and
//! dependency-closure checks remain the responsibility of `sea_file::storage`.
//!
//! Buffered openings reject an incomplete tail because an acknowledged write may not have reached
//! stable storage. Durable openings synchronize every acknowledged frame and may therefore discard
//! only an incomplete final frame left by an interrupted write. A complete malformed frame is
//! corruption in either mode.
//!
//! Once writing begins, an I/O failure or injected uncertain boundary poisons the opening. Later
//! mutations and authoritative observations return [`FileStorageError::Ambiguous`] until every
//! owner drops the journal and a new exclusive opening recovers it.

use sea_core::{BlobId, ClassifiedError, ErrorKind};
use std::{
    fs::{File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
};
use thiserror::Error;

/// Replacement filesystem failures, including uncertain writes requiring reopening.
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

/// An exclusive opening; the OS releases its lock only when this file is dropped.
pub(crate) struct Journal {
    /// Locked file, positioned at its validated append boundary.
    file: File,
    /// Whether each acknowledged record must be synchronized.
    durable: bool,
    /// Prevents writes and authoritative observations after an uncertain write.
    failed: bool,
    /// Deterministic boundaries used only by localized recovery tests.
    #[cfg(test)]
    fault: Option<JournalFault>,
}

/// Failure boundaries distinguish rejection, an incomplete tail, and lost acknowledgment.
#[cfg(test)]
#[derive(Clone, Copy, Debug)]
pub(crate) enum JournalFault {
    /// Fails without touching the journal.
    BeforeWrite,
    /// Leaves an incomplete frame and an unusable opening.
    PartialWrite,
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
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(create)
            .open(path)?;
        file.try_lock().map_err(|error| match error {
            std::fs::TryLockError::WouldBlock => FileStorageError::Busy,
            std::fs::TryLockError::Error(error) => FileStorageError::Io(error),
        })?;
        if create {
            file.write_all(MAGIC)?;
            if durable {
                file.sync_all()?;
            }
        }
        file.seek(SeekFrom::Start(0))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;
        let (records, boundary) = recover(&bytes, durable)?;
        if boundary != bytes.len() {
            file.set_len(boundary as u64)?;
            file.sync_all()?;
        }
        file.seek(SeekFrom::End(0))?;
        Ok((
            Self {
                file,
                durable,
                failed: false,
                #[cfg(test)]
                fault: None,
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
        self.ready()?;
        #[cfg(test)]
        let fault = self.fault.take();
        #[cfg(test)]
        if matches!(fault, Some(JournalFault::BeforeWrite)) {
            return Err(FileStorageError::Rejected("injected before write"));
        }
        let length = payload.len() as u64;
        let mut frame = Vec::with_capacity(FRAME_HEADER + payload.len());
        frame.extend_from_slice(&length.to_be_bytes());
        frame.extend_from_slice(&(!length).to_be_bytes());
        frame.extend_from_slice(BlobId::for_bytes(payload).as_bytes());
        frame.extend_from_slice(payload);
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
        if self.durable {
            self.file
                .sync_all()
                .map_err(|_| FileStorageError::Ambiguous)?;
        }
        #[cfg(test)]
        if matches!(fault, Some(JournalFault::AfterSync)) {
            return Err(FileStorageError::Ambiguous);
        }
        self.failed = false;
        Ok(())
    }
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
