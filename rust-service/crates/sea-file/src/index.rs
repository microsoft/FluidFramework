//! Immutable sorted journal addresses, with bounded reads during opening and lookup.

use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
    sync::Mutex,
};

use sea_core::BlobId;

use crate::journal::FileStorageError;

/// A category byte followed by a content hash or a zero-padded event position.
pub(crate) type Key = [u8; 33];
/// Versioned index header marker.
const MAGIC: &[u8; 8] = b"SEAIDX01";
/// Marker, journal boundary, entry count, metadata length, and checksum.
const HEADER: usize = 64;
/// Key, journal frame offset, and checksum.
const ENTRY: usize = 73;

/// Published lookup state whose entries remain on disk until requested.
pub(crate) struct Index {
    /// Read handle serialized only across seek and read operations.
    file: Mutex<File>,
    /// First journal byte not covered by this index.
    pub(crate) boundary: u64,
    /// Opaque internal checkpoint payload, separate from application snapshots.
    pub(crate) metadata: Vec<u8>,
    /// Number of sorted entries.
    count: u64,
    /// First entry's byte offset.
    entries: u64,
}

impl Index {
    /// Opens the header and internal metadata without reading historical index entries.
    pub(crate) fn open(path: &Path) -> Result<Option<Self>, FileStorageError> {
        let mut file = match File::open(path.with_extension("index")) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let mut header = [0; HEADER];
        file.read_exact(&mut header)?;
        if &header[..8] != MAGIC || BlobId::for_bytes(&header[..32]).as_bytes() != &header[32..] {
            return Err(FileStorageError::Corrupt("index header"));
        }
        let boundary = u64::from_be_bytes(header[8..16].try_into().unwrap());
        let count = u64::from_be_bytes(header[16..24].try_into().unwrap());
        let length = u64::from_be_bytes(header[24..32].try_into().unwrap());
        let entries = (HEADER as u64)
            .checked_add(length)
            .and_then(|offset| offset.checked_add(32))
            .ok_or(FileStorageError::Corrupt("index length"))?;
        let expected = count
            .checked_mul(ENTRY as u64)
            .and_then(|length| entries.checked_add(length))
            .ok_or(FileStorageError::Corrupt("index length"))?;
        if expected != file.metadata()?.len() || boundary < 8 {
            return Err(FileStorageError::Corrupt("index length or boundary"));
        }
        let length = usize::try_from(length)
            .map_err(|_| FileStorageError::Corrupt("index metadata length"))?;
        let mut metadata = vec![0; length];
        file.read_exact(&mut metadata)?;
        let mut checksum = [0; 32];
        file.read_exact(&mut checksum)?;
        if BlobId::for_bytes(&metadata).as_bytes() != &checksum {
            return Err(FileStorageError::Corrupt("index metadata checksum"));
        }
        Ok(Some(Self {
            file: Mutex::new(file),
            boundary,
            metadata,
            count,
            entries,
        }))
    }

    /// Publishes a complete replacement after its referenced journal prefix is settled.
    /// Any failure after rename can leave the new index published despite an error result.
    pub(crate) fn publish(
        path: &Path,
        boundary: u64,
        metadata: &[u8],
        entries: impl IntoIterator<Item = Result<(Key, u64), FileStorageError>>,
        durable: bool,
    ) -> Result<Self, FileStorageError> {
        let pending = path.with_extension("index-pending");
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(true)
            .open(&pending)?;
        file.write_all(&[0; HEADER])?;
        file.write_all(metadata)?;
        file.write_all(BlobId::for_bytes(metadata).as_bytes())?;
        let mut count = 0_u64;
        let mut previous = None;
        for entry in entries {
            let (key, offset) = entry?;
            if previous.is_some_and(|previous| previous >= key) || offset < 8 || offset >= boundary
            {
                return Err(FileStorageError::Corrupt("index order or address"));
            }
            let mut encoded = [0; ENTRY];
            encoded[..33].copy_from_slice(&key);
            encoded[33..41].copy_from_slice(&offset.to_be_bytes());
            let checksum = BlobId::for_bytes(&encoded[..41]);
            encoded[41..].copy_from_slice(checksum.as_bytes());
            file.write_all(&encoded)?;
            count += 1;
            previous = Some(key);
        }
        let mut header = [0; HEADER];
        header[..8].copy_from_slice(MAGIC);
        header[8..16].copy_from_slice(&boundary.to_be_bytes());
        header[16..24].copy_from_slice(&count.to_be_bytes());
        header[24..32].copy_from_slice(&(metadata.len() as u64).to_be_bytes());
        let checksum = BlobId::for_bytes(&header[..32]);
        header[32..].copy_from_slice(checksum.as_bytes());
        file.seek(SeekFrom::Start(0))?;
        file.write_all(&header)?;
        if durable {
            file.sync_all()?;
        }
        fs::rename(pending, path.with_extension("index"))?;
        if durable {
            let parent = path
                .parent()
                .ok_or_else(|| std::io::Error::from(std::io::ErrorKind::InvalidInput))?;
            File::open(parent)?.sync_all()?;
        }
        Ok(Self {
            file: Mutex::new(file),
            boundary,
            metadata: metadata.to_vec(),
            count,
            entries: HEADER as u64 + metadata.len() as u64 + 32,
        })
    }

    /// Reads and verifies one fixed-size entry, without following its journal address.
    fn entry(&self, ordinal: u64) -> Result<(Key, u64), FileStorageError> {
        if ordinal >= self.count {
            return Err(FileStorageError::Corrupt("index ordinal"));
        }
        let mut file = self.file.lock().map_err(|_| FileStorageError::Ambiguous)?;
        file.seek(SeekFrom::Start(self.entries + ordinal * ENTRY as u64))?;
        let mut bytes = [0; ENTRY];
        file.read_exact(&mut bytes)?;
        if BlobId::for_bytes(&bytes[..41]).as_bytes() != &bytes[41..] {
            return Err(FileStorageError::Corrupt("index entry checksum"));
        }
        let offset = u64::from_be_bytes(bytes[33..41].try_into().unwrap());
        if offset < 8 || offset >= self.boundary {
            return Err(FileStorageError::Corrupt("index entry address"));
        }
        Ok((bytes[..33].try_into().unwrap(), offset))
    }

    /// Finds the first entry at or after a key with logarithmic fixed-size reads.
    pub(crate) fn lower_bound(&self, key: &Key) -> Result<Option<(Key, u64)>, FileStorageError> {
        let mut lower = 0;
        let mut upper = self.count;
        while lower < upper {
            let middle = lower + (upper - lower) / 2;
            if self.entry(middle)?.0 < *key {
                lower = middle + 1;
            } else {
                upper = middle;
            }
        }
        if lower == self.count {
            Ok(None)
        } else {
            self.entry(lower).map(Some)
        }
    }

    /// Finds the last entry at or before a key without scanning earlier entries.
    pub(crate) fn floor(&self, key: &Key) -> Result<Option<(Key, u64)>, FileStorageError> {
        let mut lower = 0;
        let mut upper = self.count;
        while lower < upper {
            let middle = lower + (upper - lower) / 2;
            if self.entry(middle)?.0 <= *key {
                lower = middle + 1;
            } else {
                upper = middle;
            }
        }
        if lower == 0 {
            Ok(None)
        } else {
            self.entry(lower - 1).map(Some)
        }
    }

    /// Streams index entries for replacement publication without reading event payloads.
    pub(crate) fn iter(&self) -> impl Iterator<Item = Result<(Key, u64), FileStorageError>> + '_ {
        (0..self.count).map(|ordinal| self.entry(ordinal))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn incomplete_unpublished_replacements_leave_previous_checkpoint_selected() {
        let root = std::env::temp_dir().join(format!("sea-index-crash-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("document.sea");
        let first = Index::publish(&path, 100, b"previous", [Ok(([1; 33], 8))], true).unwrap();
        let previous = fs::read(path.with_extension("index")).unwrap();
        let second = Index::publish(
            &path,
            200,
            b"replacement",
            [Ok(([1; 33], 8)), Ok(([2; 33], 100))],
            true,
        )
        .unwrap();
        let replacement = fs::read(path.with_extension("index")).unwrap();
        drop((first, second));
        for length in 0..=replacement.len() {
            fs::write(path.with_extension("index"), &previous).unwrap();
            fs::write(path.with_extension("index-pending"), &replacement[..length]).unwrap();
            let recovered = Index::open(&path).unwrap().unwrap();
            assert_eq!(recovered.boundary, 100);
            assert_eq!(recovered.metadata, b"previous");
        }
        fs::rename(
            path.with_extension("index-pending"),
            path.with_extension("index"),
        )
        .unwrap();
        let recovered = Index::open(&path).unwrap().unwrap();
        assert_eq!(recovered.boundary, 200);
        assert_eq!(recovered.metadata, b"replacement");
        drop(recovered);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn lookup_and_replacement_keep_historical_entries_lazy() {
        let root = std::env::temp_dir().join(format!("sea-index-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("document.sea");
        let entries = (1_u8..=100).map(|ordinal| Ok(([ordinal; 33], u64::from(ordinal) + 8)));
        let index = Index::publish(&path, 1000, b"checkpoint", entries, true).unwrap();
        assert_eq!(index.lower_bound(&[50; 33]).unwrap(), Some(([50; 33], 58)));
        assert_eq!(index.lower_bound(&[0; 33]).unwrap(), Some(([1; 33], 9)));
        assert_eq!(index.lower_bound(&[101; 33]).unwrap(), None);
        let replacement = Index::publish(&path, 2000, b"new", index.iter(), true).unwrap();
        assert_eq!(replacement.metadata, b"new");
        assert_eq!(index.metadata, b"checkpoint");
        let opened = Index::open(&path).unwrap().unwrap();
        assert_eq!(opened.boundary, 2000);
        assert_eq!(
            opened.lower_bound(&[100; 33]).unwrap(),
            Some(([100; 33], 108))
        );
        let mut corrupt = OpenOptions::new()
            .write(true)
            .open(path.with_extension("index"))
            .unwrap();
        corrupt.seek(SeekFrom::Start(opened.entries)).unwrap();
        corrupt.write_all(&[0xff]).unwrap();
        assert!(Index::open(&path).unwrap().is_some());
        assert!(matches!(
            opened.lower_bound(&[1; 33]),
            Err(FileStorageError::Corrupt(_))
        ));
        drop((index, replacement, opened, corrupt));
        fs::remove_dir_all(root).unwrap();
    }
}
