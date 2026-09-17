#![doc = include_str!("../README.md")]

use std::{
    fs::{self, File, OpenOptions},
    io::{Read as _, Write as _},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use bytes::Bytes;
use sea_core::{BlobDirectory, BlobDirectoryId, BlobId};
use thiserror::Error;

static NEXT_TEMP: AtomicU64 = AtomicU64::new(1);

/// Limits applied to immutable objects.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StoreConfig {
    /// Maximum stored bytes in one leaf.
    pub max_blob_bytes: u64,
    /// Maximum canonical bytes in one directory.
    pub max_directory_bytes: u64,
}

impl Default for StoreConfig {
    fn default() -> Self {
        Self {
            max_blob_bytes: 512 * 1024,
            max_directory_bytes: 4 * 1024 * 1024,
        }
    }
}

/// Failures from immutable content persistence.
#[derive(Debug, Error)]
pub enum StoreError {
    /// Filesystem access failed.
    #[error("content store I/O failed: {0}")]
    Io(#[from] std::io::Error),
    /// A blob exceeds its configured bound.
    #[error("blob has {actual} bytes; maximum is {maximum}")]
    BlobTooLarge {
        /// Actual source bytes.
        actual: u64,
        /// Configured maximum.
        maximum: u64,
    },
    /// A directory encoding exceeds its configured bound.
    #[error("directory has {actual} bytes; maximum is {maximum}")]
    DirectoryTooLarge {
        /// Actual canonical bytes.
        actual: u64,
        /// Configured maximum.
        maximum: u64,
    },
    /// A stored object is missing.
    #[error("content object is missing")]
    Missing,
    /// Stored bytes do not match their requested identity or canonical encoding.
    #[error("stored content is corrupt: {0}")]
    Corrupt(&'static str),
}

/// Durable immutable blob-tree object store.
#[derive(Debug)]
pub struct ContentStore {
    root: PathBuf,
    blobs: PathBuf,
    directories: PathBuf,
    config: StoreConfig,
}

impl ContentStore {
    /// Opens or creates an object store below `root`.
    ///
    /// # Errors
    ///
    /// Returns an error when namespaces cannot be created or synchronized.
    pub fn open(root: impl AsRef<Path>, config: StoreConfig) -> Result<Self, StoreError> {
        let root = root.as_ref().to_owned();
        let blobs = root.join("blobs");
        let directories = root.join("directories");
        fs::create_dir_all(&blobs)?;
        fs::create_dir_all(&directories)?;
        sync_directory(&root)?;
        Ok(Self {
            root,
            blobs,
            directories,
            config,
        })
    }

    /// Publishes or deduplicates one immutable blob.
    ///
    /// # Errors
    ///
    /// Returns an error for oversized content or failed durable publication.
    pub fn put_blob(&self, payload: &Bytes) -> Result<BlobId, StoreError> {
        let length = u64::try_from(payload.len()).map_err(|_| StoreError::BlobTooLarge {
            actual: u64::MAX,
            maximum: self.config.max_blob_bytes,
        })?;
        if length > self.config.max_blob_bytes {
            return Err(StoreError::BlobTooLarge {
                actual: length,
                maximum: self.config.max_blob_bytes,
            });
        }
        let id = BlobId::for_bytes(payload);
        publish(&self.blobs, &hex(id.as_bytes()), payload)?;
        Ok(id)
    }

    /// Fetches and verifies one immutable blob.
    ///
    /// # Errors
    ///
    /// Returns an error when the blob is missing, oversized, unreadable, or corrupt.
    pub fn get_blob(&self, id: BlobId) -> Result<Bytes, StoreError> {
        let payload = read_bounded(
            &self.blobs.join(hex(id.as_bytes())),
            self.config.max_blob_bytes,
        )?;
        if BlobId::for_bytes(&payload) != id {
            return Err(StoreError::Corrupt("blob identity mismatch"));
        }
        Ok(payload)
    }

    /// Publishes or deduplicates one immutable directory.
    ///
    /// # Errors
    ///
    /// Returns an error when canonical encoding, bounds, or durable publication fails.
    pub fn put_directory(&self, directory: &BlobDirectory) -> Result<BlobDirectoryId, StoreError> {
        let encoded = directory
            .encode()
            .map_err(|_| StoreError::Corrupt("directory cannot be encoded"))?;
        let length = u64::try_from(encoded.len()).map_err(|_| StoreError::DirectoryTooLarge {
            actual: u64::MAX,
            maximum: self.config.max_directory_bytes,
        })?;
        if length > self.config.max_directory_bytes {
            return Err(StoreError::DirectoryTooLarge {
                actual: length,
                maximum: self.config.max_directory_bytes,
            });
        }
        let id = directory
            .id()
            .map_err(|_| StoreError::Corrupt("directory cannot be identified"))?;
        publish(&self.directories, &hex(id.as_bytes()), &encoded)?;
        Ok(id)
    }

    /// Fetches and verifies one immutable directory.
    ///
    /// # Errors
    ///
    /// Returns an error when the directory is missing, malformed, oversized, or corrupt.
    pub fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, StoreError> {
        let encoded = read_bounded(
            &self.directories.join(hex(id.as_bytes())),
            self.config.max_directory_bytes,
        )?;
        let directory = BlobDirectory::decode(&encoded)
            .map_err(|_| StoreError::Corrupt("directory encoding is invalid"))?;
        if directory
            .id()
            .map_err(|_| StoreError::Corrupt("directory cannot be identified"))?
            != id
        {
            return Err(StoreError::Corrupt("directory identity mismatch"));
        }
        Ok(directory)
    }

    /// Returns the store's root directory.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }
}

fn publish(directory: &Path, name: &str, bytes: &[u8]) -> Result<(), StoreError> {
    let target = directory.join(name);
    match target.try_exists() {
        Ok(true) => return verify_existing(&target, bytes),
        Ok(false) => {}
        Err(error) => return Err(error.into()),
    }
    let temporary = directory.join(format!(
        ".{name}.{}.tmp",
        NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        match fs::hard_link(&temporary, &target) {
            Ok(()) => {
                fs::remove_file(&temporary)?;
                sync_directory(directory)
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                fs::remove_file(&temporary)?;
                verify_existing(&target, bytes)
            }
            Err(error) => Err(error.into()),
        }
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

fn verify_existing(path: &Path, expected: &[u8]) -> Result<(), StoreError> {
    let limit = u64::try_from(expected.len())
        .map_err(|_| StoreError::Corrupt("published object exceeds address space"))?;
    let actual = read_bounded(path, limit)?;
    if actual == expected {
        Ok(())
    } else {
        Err(StoreError::Corrupt(
            "published object content does not match its identity",
        ))
    }
}

fn read_bounded(path: &Path, limit: u64) -> Result<Bytes, StoreError> {
    let mut file = File::open(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            StoreError::Missing
        } else {
            StoreError::Io(error)
        }
    })?;
    let length = file.metadata()?.len();
    if length > limit {
        return Err(StoreError::Corrupt(
            "stored object exceeds configured bound",
        ));
    }
    let capacity = usize::try_from(length)
        .map_err(|_| StoreError::Corrupt("stored object exceeds address space"))?;
    let mut bytes = Vec::with_capacity(capacity);
    file.read_to_end(&mut bytes)?;
    Ok(Bytes::from(bytes))
}

fn sync_directory(path: &Path) -> Result<(), StoreError> {
    File::open(path)?.sync_all()?;
    Ok(())
}

fn hex(bytes: &[u8]) -> String {
    let mut value = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        write!(value, "{byte:02x}").expect("writing to String cannot fail");
    }
    value
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, sync::atomic::AtomicU64};

    use sea_core::BlobTreeId;

    use super::*;

    static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(1);

    fn test_directory() -> PathBuf {
        std::env::temp_dir().join(format!(
            "sea-content-addressed-{}-{}",
            std::process::id(),
            NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn blobs_and_directories_reopen_and_verify() {
        let root = test_directory();
        let store = ContentStore::open(&root, StoreConfig::default()).unwrap();
        let blob = store.put_blob(&Bytes::from_static(b"content")).unwrap();
        let directory = BlobDirectory::new(BTreeMap::from([(
            "leaf".to_owned(),
            BlobTreeId::Blob(blob),
        )]))
        .unwrap();
        let directory_id = store.put_directory(&directory).unwrap();
        drop(store);

        let reopened = ContentStore::open(&root, StoreConfig::default()).unwrap();
        assert_eq!(
            reopened.get_blob(blob).unwrap(),
            Bytes::from_static(b"content")
        );
        assert_eq!(reopened.get_directory(directory_id).unwrap(), directory);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_blob_bounds_and_corruption() {
        let root = test_directory();
        let store = ContentStore::open(
            &root,
            StoreConfig {
                max_blob_bytes: 3,
                max_directory_bytes: 1024,
            },
        )
        .unwrap();
        assert!(matches!(
            store.put_blob(&Bytes::from_static(b"four")),
            Err(StoreError::BlobTooLarge { .. })
        ));
        let blob = store.put_blob(&Bytes::from_static(b"ok")).unwrap();
        fs::write(store.blobs.join(hex(blob.as_bytes())), b"four").unwrap();
        assert!(matches!(
            store.get_blob(blob),
            Err(StoreError::Corrupt(
                "stored object exceeds configured bound"
            ))
        ));
        fs::write(store.blobs.join(hex(blob.as_bytes())), b"no").unwrap();
        assert!(matches!(store.get_blob(blob), Err(StoreError::Corrupt(_))));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_directory_bounds_and_corruption() {
        let root = test_directory();
        let directory = BlobDirectory::new(BTreeMap::new()).unwrap();
        let bounded_store = ContentStore::open(
            &root,
            StoreConfig {
                max_blob_bytes: 1024,
                max_directory_bytes: 0,
            },
        )
        .unwrap();
        assert!(matches!(
            bounded_store.put_directory(&directory),
            Err(StoreError::DirectoryTooLarge { .. })
        ));
        drop(bounded_store);

        let store = ContentStore::open(&root, StoreConfig::default()).unwrap();
        let directory_id = store.put_directory(&directory).unwrap();
        fs::write(
            store.directories.join(hex(directory_id.as_bytes())),
            b"invalid",
        )
        .unwrap();
        assert!(matches!(
            store.get_directory(directory_id),
            Err(StoreError::Corrupt(_))
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_directory_identity_mismatch() {
        let root = test_directory();
        let store = ContentStore::open(&root, StoreConfig::default()).unwrap();
        let expected = BlobDirectory::new(BTreeMap::new()).unwrap();
        let expected_id = store.put_directory(&expected).unwrap();
        let different = BlobDirectory::new(BTreeMap::from([(
            "leaf".to_owned(),
            BlobTreeId::Blob(BlobId::for_bytes(b"different")),
        )]))
        .unwrap();
        fs::write(
            store.directories.join(hex(expected_id.as_bytes())),
            different.encode().unwrap(),
        )
        .unwrap();

        assert!(matches!(
            store.get_directory(expected_id),
            Err(StoreError::Corrupt("directory identity mismatch"))
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reports_missing_objects() {
        let root = test_directory();
        let store = ContentStore::open(&root, StoreConfig::default()).unwrap();
        assert!(matches!(
            store.get_blob(BlobId::for_bytes(b"missing")),
            Err(StoreError::Missing)
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn publication_verifies_existing_content() {
        let root = test_directory();
        fs::create_dir(&root).unwrap();
        let target = root.join("object");
        fs::write(&target, b"existing").unwrap();

        publish(&root, "object", b"existing").unwrap();
        assert!(matches!(
            publish(&root, "object", b"replacement"),
            Err(StoreError::Corrupt(_))
        ));
        assert_eq!(fs::read(&target).unwrap(), b"existing");
        fs::remove_dir_all(root).unwrap();
    }
}
