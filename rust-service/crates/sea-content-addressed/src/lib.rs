#![doc = include_str!("../README.md")]

/// Blob-store availability capabilities for the immutable object engine.
pub mod storage;

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
    /// Availability evidence belongs to another namespace.
    #[error("incompatible content handle")]
    IncompatibleHandle,
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
    /// Synchronizes namespace bindings bottom-up through the root's filesystem before returning.
    /// On Unix, traversal stops before a parent on another device; mount configuration is external.
    ///
    /// # Errors
    ///
    /// Returns an error when namespaces cannot be created or synchronized.
    pub fn open(root: impl AsRef<Path>, config: StoreConfig) -> Result<Self, StoreError> {
        Self::open_with_sync(root.as_ref(), config, |directory| {
            File::open(directory)?.sync_all()
        })
    }

    /// Opens a namespace with an injectable synchronization boundary for initialization tests.
    fn open_with_sync(
        root: &Path,
        config: StoreConfig,
        synchronize: impl FnMut(&Path) -> std::io::Result<()>,
    ) -> Result<Self, StoreError> {
        let blobs = root.join("blobs");
        let directories = root.join("directories");
        fs::create_dir_all(&blobs)?;
        fs::create_dir_all(&directories)?;
        let root = fs::canonicalize(root)?;
        sync_namespace(&root, synchronize)?;
        let blobs = root.join("blobs");
        let directories = root.join("directories");
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

    /// Publishes or deduplicates one immutable directory without checking child availability.
    ///
    /// Use [`sea_core::storage::BlobStore::put_directory`] to verify the complete tree.
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

/// Persists namespace bindings bottom-up without synchronizing unrelated parent filesystems.
fn sync_namespace(
    root: &Path,
    mut synchronize: impl FnMut(&Path) -> std::io::Result<()>,
) -> std::io::Result<()> {
    #[cfg(unix)]
    use std::os::unix::fs::MetadataExt;

    #[cfg(unix)]
    let device = fs::metadata(root)?.dev();
    for ancestor in root.ancestors() {
        #[cfg(unix)]
        if fs::metadata(ancestor)?.dev() != device {
            break;
        }
        synchronize(ancestor)?;
    }
    Ok(())
}

fn publish(directory: &Path, name: &str, bytes: &[u8]) -> Result<(), StoreError> {
    publish_with_sync(directory, name, bytes, sync_directory)
}

/// Synchronizes the published name even when another attempt created it before this call.
fn publish_with_sync(
    directory: &Path,
    name: &str,
    bytes: &[u8],
    synchronize: impl FnOnce(&Path) -> Result<(), StoreError>,
) -> Result<(), StoreError> {
    let target = directory.join(name);
    match target.try_exists() {
        Ok(true) => {
            verify_existing(&target, bytes)?;
            return synchronize(directory);
        }
        Ok(false) => {}
        Err(error) => return Err(error.into()),
    }
    let temporary = directory.join(format!(
        ".{name}.{}.tmp",
        NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
    ));
    publish_new(directory, &target, &temporary, bytes, synchronize)
}

/// Publishes through a fresh staging path and removes only a file created by this attempt.
fn publish_new(
    directory: &Path,
    target: &Path,
    temporary: &Path,
    bytes: &[u8],
    synchronize: impl FnOnce(&Path) -> Result<(), StoreError>,
) -> Result<(), StoreError> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temporary)?;
    let result = (|| {
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        match fs::hard_link(temporary, target) {
            Ok(()) => {
                fs::remove_file(temporary)?;
                synchronize(directory)
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                fs::remove_file(temporary)?;
                verify_existing(target, bytes)?;
                synchronize(directory)
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

    /// Keeps filesystem fixtures inside this checkout, independent of the host temporary directory.
    fn test_directory() -> PathBuf {
        let root = PathBuf::from("target").join(format!(
            "sea-content-addressed-{}-{}",
            std::process::id(),
            NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(root.parent().unwrap()).unwrap();
        root
    }

    #[test]
    fn namespace_creation_synchronizes_bottom_up_and_propagates_failure() {
        let root = test_directory();
        let nested = root.join("parent").join("store");
        let mut synchronized = Vec::new();
        let opened = ContentStore::open_with_sync(&nested, StoreConfig::default(), |directory| {
            synchronized.push(directory.to_path_buf());
            Ok(())
        })
        .unwrap();
        let canonical = fs::canonicalize(&nested).unwrap();
        assert_eq!(opened.root(), canonical);
        assert!(canonical.join("blobs").is_dir());
        assert!(canonical.join("directories").is_dir());
        let expected: Vec<_> = canonical
            .ancestors()
            .take_while(|ancestor| {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::MetadataExt;
                    fs::metadata(ancestor).unwrap().dev() == fs::metadata(&canonical).unwrap().dev()
                }
                #[cfg(not(unix))]
                {
                    let _ = ancestor;
                    true
                }
            })
            .map(Path::to_path_buf)
            .collect();
        assert_eq!(synchronized, expected);
        let parent = canonical.parent().unwrap();
        synchronized.clear();
        let failed = ContentStore::open_with_sync(&nested, StoreConfig::default(), |directory| {
            synchronized.push(directory.to_path_buf());
            if directory == parent {
                Err(std::io::ErrorKind::PermissionDenied.into())
            } else {
                Ok(())
            }
        });
        fs::remove_dir_all(root).unwrap();
        assert!(matches!(
            failed,
            Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::PermissionDenied
        ));
        assert_eq!(synchronized, [canonical.clone(), parent.to_path_buf()]);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn namespace_sync_stops_before_another_filesystem() {
        let mut synchronized = Vec::new();
        sync_namespace(Path::new("/proc"), |directory| {
            synchronized.push(directory.to_path_buf());
            Ok(())
        })
        .unwrap();
        assert_eq!(synchronized, [PathBuf::from("/proc")]);
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
        let boundary = store.put_blob(&Bytes::from_static(b"max")).unwrap();
        assert_eq!(
            store.get_blob(boundary).unwrap(),
            Bytes::from_static(b"max")
        );
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

        let boundary_store = ContentStore::open(
            &root,
            StoreConfig {
                max_blob_bytes: 1024,
                max_directory_bytes: 4,
            },
        )
        .unwrap();
        let boundary_id = boundary_store.put_directory(&directory).unwrap();
        assert_eq!(
            boundary_store.get_directory(boundary_id).unwrap(),
            directory
        );
        fs::write(
            boundary_store.directories.join(hex(boundary_id.as_bytes())),
            b"extra",
        )
        .unwrap();
        assert!(matches!(
            boundary_store.get_directory(boundary_id),
            Err(StoreError::Corrupt(
                "stored object exceeds configured bound"
            ))
        ));
        fs::remove_file(boundary_store.directories.join(hex(boundary_id.as_bytes()))).unwrap();
        drop(boundary_store);

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

    #[test]
    fn publication_cleanup_preserves_unowned_staging_files() {
        let root = test_directory();
        fs::create_dir_all(&root).unwrap();
        let target = root.join("object");
        let staging = root.join("staging");
        fs::write(&staging, b"other publisher").unwrap();
        assert!(matches!(
            publish_new(&root, &target, &staging, b"new", sync_directory),
            Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::AlreadyExists
        ));
        let unowned_content = fs::read(&staging).ok();
        assert!(!target.exists());

        if staging.exists() {
            fs::remove_file(&staging).unwrap();
        }
        fs::write(&target, b"existing").unwrap();
        assert!(matches!(
            publish_new(&root, &target, &staging, b"new", sync_directory),
            Err(StoreError::Corrupt(_))
        ));
        assert_eq!(fs::read(&target).unwrap(), b"existing");
        assert!(!staging.exists(), "an owned failed publication is cleaned");
        publish_new(&root, &target, &staging, b"existing", sync_directory).unwrap();
        assert!(!staging.exists(), "a deduplicated race is cleaned");
        fs::remove_dir_all(root).unwrap();
        assert_eq!(
            unowned_content.as_deref(),
            Some(b"other publisher".as_slice())
        );
    }

    #[test]
    fn existing_and_racing_publications_propagate_directory_sync_failure() {
        let root = test_directory();
        fs::create_dir_all(&root).unwrap();
        let target = root.join("object");
        let staging = root.join("staging");
        fs::write(&target, b"existing").unwrap();
        let reject_sync = |path: &Path| {
            assert_eq!(path, root);
            Err(StoreError::Io(std::io::ErrorKind::PermissionDenied.into()))
        };
        let existing = publish_with_sync(&root, "object", b"existing", reject_sync);
        let racing = publish_new(&root, &target, &staging, b"existing", reject_sync);
        let fresh = publish_with_sync(&root, "fresh", b"new", reject_sync);
        assert!(!staging.exists());
        assert_eq!(fs::read(&target).unwrap(), b"existing");
        assert_eq!(fs::read(root.join("fresh")).unwrap(), b"new");
        fs::remove_dir_all(root).unwrap();
        for result in [existing, racing, fresh] {
            assert!(matches!(
                result,
                Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::PermissionDenied
            ));
        }
    }
}
