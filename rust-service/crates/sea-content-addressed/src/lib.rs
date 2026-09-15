#![doc = "Durable content-addressed blobs and atomic summary manifests."]
#![doc = ""]
#![doc = "Objects are immutable SHA-256 values. Uploads and manifests are written"]
#![doc = "to same-filesystem temporary files, synced, atomically linked into place,"]
#![doc = "and directory-synced before acknowledgment. There is intentionally no GC."]

use std::{
    collections::{BTreeMap, VecDeque},
    fmt,
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    str::FromStr,
    sync::{
        Arc, Mutex, RwLock,
        atomic::{AtomicU64, Ordering},
    },
};

use bytes::Bytes;
use sea_core::{
    ErrorKind,
    storage::{
        ContentId, ContentReceipt, ContentStorage, ContentSummaryEntry, ContentSummaryReceipt,
        StorageError, StorageErrorKind,
    },
};
use sha2::{Digest as _, Sha256};

const DIGEST_BYTES: usize = 32;
const DIGEST_HEX_BYTES: usize = DIGEST_BYTES * 2;
const MANIFEST_MAGIC: [u8; 8] = *b"CSUM001\0";
const MANIFEST_HEADER_BYTES: usize = MANIFEST_MAGIC.len() + 4;
const MANIFEST_ENTRY_FIXED_BYTES: usize = 4 + DIGEST_BYTES;
static NEXT_TEMP_FILE: AtomicU64 = AtomicU64::new(1);

/// A SHA-256 content identity, formatted as 64 lowercase hexadecimal characters.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ContentDigest([u8; DIGEST_BYTES]);

impl ContentDigest {
    /// Computes the identity of `bytes`.
    #[must_use]
    pub fn of(bytes: &[u8]) -> Self {
        Self(Sha256::digest(bytes).into())
    }

    /// Returns the raw SHA-256 bytes.
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; DIGEST_BYTES] {
        &self.0
    }

    /// Parses an exact 32-byte SHA-256 identity.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::InvalidDigest`] when `bytes` is not exactly 32 bytes.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, StoreError> {
        let bytes = bytes.try_into().map_err(|_| StoreError::InvalidDigest)?;
        Ok(Self(bytes))
    }

    /// Finalizes an incremental SHA-256 computation.
    fn from_hash(hash: Sha256) -> Self {
        Self(hash.finalize().into())
    }
}

impl fmt::Display for ContentDigest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        for byte in self.0 {
            write!(formatter, "{byte:02x}")?;
        }
        Ok(())
    }
}

impl FromStr for ContentDigest {
    type Err = StoreError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        if value.len() != DIGEST_HEX_BYTES {
            return Err(StoreError::InvalidDigest);
        }
        let mut bytes = [0_u8; DIGEST_BYTES];
        for (index, pair) in value.as_bytes().as_chunks::<2>().0.iter().enumerate() {
            bytes[index] = (hex_nibble(pair[0])? << 4) | hex_nibble(pair[1])?;
        }
        Ok(Self(bytes))
    }
}

impl ContentStorage for ContentStore {
    fn put_blob(&self, payload: Bytes) -> Result<ContentReceipt, StorageError> {
        let receipt = ContentStore::put_blob(self, std::io::Cursor::new(payload))
            .map_err(|error| map_storage_error(&error))?;
        Ok(ContentReceipt {
            id: content_id(receipt.digest),
            size_bytes: receipt.size_bytes,
            deduplicated: receipt.deduplicated,
        })
    }

    fn get_blob(&self, id: &ContentId) -> Result<Bytes, StorageError> {
        let digest = content_digest(id)?;
        let mut reader = self
            .open_blob(digest)
            .map_err(|error| map_storage_error(&error))?;
        let capacity = usize::try_from(reader.size_bytes()).map_err(|_| {
            StorageError::categorized(
                StorageErrorKind::ContentTooLarge,
                "blob size exceeds the addressable memory range",
            )
        })?;
        let mut payload = Vec::with_capacity(capacity);
        reader
            .read_to_end(&mut payload)
            .map_err(|error| StorageError::new(ErrorKind::Unavailable, error.to_string()))?;
        Ok(Bytes::from(payload))
    }

    fn put_summary(
        &self,
        entries: Vec<ContentSummaryEntry>,
    ) -> Result<ContentSummaryReceipt, StorageError> {
        let entries = entries
            .into_iter()
            .map(|entry| {
                Ok(SummaryEntry {
                    path: String::from_utf8(entry.path.to_vec()).map_err(|error| {
                        StorageError::categorized(
                            StorageErrorKind::InvalidManifest,
                            error.to_string(),
                        )
                    })?,
                    blob: content_digest(&entry.content)?,
                })
            })
            .collect::<Result<Vec<_>, StorageError>>()?;
        let receipt = self
            .publish_summary(&SummaryManifest { entries })
            .map_err(|error| map_storage_error(&error))?;
        Ok(ContentSummaryReceipt {
            id: content_id(receipt.digest),
            entry_count: receipt.entry_count,
            persisted_bytes: receipt.persisted_bytes,
            deduplicated: receipt.deduplicated,
        })
    }

    fn get_summary(&self, id: &ContentId) -> Result<Vec<ContentSummaryEntry>, StorageError> {
        let manifest = self
            .load_summary(content_digest(id)?)
            .map_err(|error| map_storage_error(&error))?;
        Ok(manifest
            .entries
            .into_iter()
            .map(|entry| ContentSummaryEntry {
                path: Bytes::from(entry.path),
                content: content_id(entry.blob),
            })
            .collect())
    }
}

/// Converts an implementation digest to its storage-boundary representation.
fn content_id(digest: ContentDigest) -> ContentId {
    ContentId::from_bytes(Bytes::copy_from_slice(digest.as_bytes()))
}

/// Validates and converts a storage-boundary content identity.
fn content_digest(id: &ContentId) -> Result<ContentDigest, StorageError> {
    ContentDigest::from_bytes(id.as_bytes()).map_err(|error| {
        StorageError::categorized(StorageErrorKind::InvalidContentId, error.to_string())
    })
}

/// Preserves content-specific failures while erasing implementation details.
fn map_storage_error(error: &StoreError) -> StorageError {
    let message = error.to_string();
    match error {
        StoreError::InvalidDigest => {
            StorageError::categorized(StorageErrorKind::InvalidContentId, message)
        }
        StoreError::InvalidManifest(_) => {
            StorageError::categorized(StorageErrorKind::InvalidManifest, message)
        }
        StoreError::BlobTooLarge { .. } | StoreError::ManifestTooLarge { .. } => {
            StorageError::categorized(StorageErrorKind::ContentTooLarge, message)
        }
        StoreError::MissingBlob(_) => {
            StorageError::categorized(StorageErrorKind::BlobNotFound, message)
        }
        StoreError::MissingSummary(_) => {
            StorageError::categorized(StorageErrorKind::SummaryNotFound, message)
        }
        StoreError::CorruptBlob { .. } | StoreError::CorruptSummary { .. } => {
            StorageError::new(ErrorKind::Corrupt, message)
        }
        StoreError::Ambiguous(_) => StorageError::new(ErrorKind::Ambiguous, message),
        StoreError::Io(_)
        | StoreError::InvalidConfig(_)
        | StoreError::Injected(_)
        | StoreError::Poisoned => StorageError::new(ErrorKind::Unavailable, message),
    }
}

/// Decodes one ASCII hexadecimal digit.
fn hex_nibble(byte: u8) -> Result<u8, StoreError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err(StoreError::InvalidDigest),
    }
}

/// Limits controlling memory and persisted object sizes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StoreConfig {
    /// Maximum accepted blob size in bytes.
    pub max_blob_bytes: u64,
    /// Maximum encoded manifest size in bytes.
    pub max_manifest_bytes: u64,
    /// Reusable copy buffer size. Memory use is bounded by this value plus metadata.
    pub copy_buffer_bytes: usize,
}

impl Default for StoreConfig {
    fn default() -> Self {
        Self {
            max_blob_bytes: 64 * 1024 * 1024,
            max_manifest_bytes: 4 * 1024 * 1024,
            copy_buffer_bytes: 64 * 1024,
        }
    }
}

/// Deterministic persistence boundaries available to focused fault tests.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FaultPoint {
    /// Immediately after creating a pending blob file.
    BlobAfterCreate,
    /// After writing the first nonempty blob chunk.
    BlobDuringWrite,
    /// After writing the complete blob but before syncing it.
    BlobAfterWrite,
    /// After syncing blob contents but before publication.
    BlobAfterFileSync,
    /// After atomically publishing a blob but before syncing its directory.
    BlobAfterPublish,
    /// After syncing the blob directory.
    BlobAfterDirectorySync,
    /// Immediately after creating a pending summary file.
    SummaryAfterCreate,
    /// Between the first and remaining summary writes.
    SummaryDuringWrite,
    /// After writing the complete summary but before syncing it.
    SummaryAfterWrite,
    /// After syncing summary contents but before publication.
    SummaryAfterFileSync,
    /// After atomically publishing a summary but before syncing its directory.
    SummaryAfterPublish,
    /// After syncing the summary directory.
    SummaryAfterDirectorySync,
}

/// An ordered, one-shot fault plan shared by cloned store handles.
#[derive(Debug, Default)]
pub struct FaultInjector {
    /// Fault points still waiting to be triggered, in required order.
    points: Mutex<VecDeque<FaultPoint>>,
}

impl FaultInjector {
    /// Creates a plan that triggers each supplied point once and in order.
    #[must_use]
    pub fn new(points: impl IntoIterator<Item = FaultPoint>) -> Self {
        Self {
            points: Mutex::new(points.into_iter().collect()),
        }
    }

    /// Triggers and consumes `point` when it is next in the plan.
    fn hit(&self, point: FaultPoint) -> Result<(), StoreError> {
        let mut points = self.points.lock().map_err(|_| StoreError::Poisoned)?;
        if points.front() == Some(&point) {
            points.pop_front();
            return Err(
                if matches!(
                    point,
                    FaultPoint::BlobAfterPublish
                        | FaultPoint::BlobAfterDirectorySync
                        | FaultPoint::SummaryAfterPublish
                        | FaultPoint::SummaryAfterDirectorySync
                ) {
                    StoreError::Ambiguous(point)
                } else {
                    StoreError::Injected(point)
                },
            );
        }
        Ok(())
    }
}

/// A path-to-blob entry in a summary manifest.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SummaryEntry {
    /// Logical summary path, which must be nonempty, NUL-free, and ordered.
    pub path: String,
    /// Identity of the immutable blob stored at `path`.
    pub blob: ContentDigest,
}

/// A canonical summary. Entries must be strictly ordered by path.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SummaryManifest {
    /// Entries in strictly increasing path order.
    pub entries: Vec<SummaryEntry>,
}

/// Evidence returned after a durable blob publication.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BlobReceipt {
    /// SHA-256 identity of the published bytes.
    pub digest: ContentDigest,
    /// Number of source bytes consumed and persisted.
    pub size_bytes: u64,
    /// Whether an identical immutable object already existed.
    pub deduplicated: bool,
}

/// Evidence returned after a durable summary publication.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SummaryReceipt {
    /// SHA-256 identity of the canonical manifest encoding.
    pub digest: ContentDigest,
    /// Number of entries in the published manifest.
    pub entry_count: usize,
    /// Number of bytes in the canonical persisted encoding.
    pub persisted_bytes: u64,
    /// Whether an identical immutable manifest already existed.
    pub deduplicated: bool,
}

/// Stable failure categories for content-addressed operations.
#[derive(Debug)]
pub enum StoreError {
    /// A filesystem operation failed.
    Io(std::io::Error),
    /// Store limits or buffer sizing are invalid.
    InvalidConfig(&'static str),
    /// A digest has the wrong length or contains non-hexadecimal text.
    InvalidDigest,
    /// A manifest violates framing, path, ordering, or count constraints.
    InvalidManifest(&'static str),
    /// A blob exceeded its configured byte limit.
    BlobTooLarge {
        /// Configured maximum blob size.
        limit: u64,
    },
    /// An encoded manifest exceeded its configured byte limit.
    ManifestTooLarge {
        /// Configured maximum manifest size.
        limit: u64,
    },
    /// No blob exists for the requested identity.
    MissingBlob(ContentDigest),
    /// No summary exists for the requested identity.
    MissingSummary(ContentDigest),
    /// Persisted blob bytes do not match their requested identity.
    CorruptBlob {
        /// Identity used to locate the object.
        expected: ContentDigest,
        /// Identity recomputed from persisted bytes.
        actual: ContentDigest,
    },
    /// Persisted summary bytes do not match their requested identity.
    CorruptSummary {
        /// Identity used to locate the object.
        expected: ContentDigest,
        /// Identity recomputed from persisted bytes.
        actual: ContentDigest,
    },
    /// A deterministic fault occurred before atomic publication.
    Injected(FaultPoint),
    /// A deterministic fault occurred at or after publication.
    Ambiguous(FaultPoint),
    /// Another thread panicked while holding the fault-plan mutex.
    Poisoned,
}

impl fmt::Display for StoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "content store I/O failed: {error}"),
            Self::InvalidConfig(reason) => {
                write!(formatter, "invalid store configuration: {reason}")
            }
            Self::InvalidDigest => formatter.write_str("digest is not 64 hexadecimal characters"),
            Self::InvalidManifest(reason) => {
                write!(formatter, "invalid summary manifest: {reason}")
            }
            Self::BlobTooLarge { limit } => {
                write!(formatter, "blob exceeds configured limit of {limit} bytes")
            }
            Self::ManifestTooLarge { limit } => write!(
                formatter,
                "summary manifest exceeds configured limit of {limit} bytes"
            ),
            Self::MissingBlob(digest) => write!(formatter, "blob {digest} is missing"),
            Self::MissingSummary(digest) => write!(formatter, "summary {digest} is missing"),
            Self::CorruptBlob { expected, actual } => write!(
                formatter,
                "blob {expected} is corrupt; actual digest is {actual}"
            ),
            Self::CorruptSummary { expected, actual } => write!(
                formatter,
                "summary {expected} is corrupt; actual digest is {actual}"
            ),
            Self::Injected(point) => write!(formatter, "injected fault at {point:?}"),
            Self::Ambiguous(point) => write!(
                formatter,
                "operation may be durably published after fault at {point:?}"
            ),
            Self::Poisoned => formatter.write_str("fault injector mutex was poisoned"),
        }
    }
}

impl std::error::Error for StoreError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            _ => None,
        }
    }
}

impl From<std::io::Error> for StoreError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

/// A verified, seekable blob reader backed by an immutable file handle.
#[derive(Debug)]
pub struct BlobReader {
    /// Immutable published object opened for reading.
    file: File,
    /// Verified byte length of the object.
    size_bytes: u64,
}

/// Process-local content storage using the same identities and manifest encoding as [`ContentStore`].
#[derive(Debug)]
pub struct MemoryContentStore {
    /// Limits applied consistently with the durable implementation.
    config: StoreConfig,
    /// Immutable blobs indexed by digest.
    blobs: RwLock<BTreeMap<ContentDigest, Bytes>>,
    /// Canonical summary manifests indexed by digest.
    summaries: RwLock<BTreeMap<ContentDigest, SummaryManifest>>,
}

impl MemoryContentStore {
    /// Creates an empty process-local store with the supplied limits.
    #[must_use]
    pub fn new(config: StoreConfig) -> Self {
        Self {
            config,
            blobs: RwLock::new(BTreeMap::new()),
            summaries: RwLock::new(BTreeMap::new()),
        }
    }
}

impl Default for MemoryContentStore {
    fn default() -> Self {
        Self::new(StoreConfig::default())
    }
}

impl ContentStorage for MemoryContentStore {
    fn put_blob(&self, payload: Bytes) -> Result<ContentReceipt, StorageError> {
        let size_bytes = u64::try_from(payload.len()).map_err(|_| {
            StorageError::categorized(StorageErrorKind::ContentTooLarge, "blob size exceeds range")
        })?;
        if size_bytes > self.config.max_blob_bytes {
            return Err(StorageError::categorized(
                StorageErrorKind::ContentTooLarge,
                format!(
                    "blob exceeds configured limit of {} bytes",
                    self.config.max_blob_bytes
                ),
            ));
        }
        let digest = ContentDigest::of(&payload);
        let deduplicated = self
            .blobs
            .write()
            .map_err(|_| storage_unavailable("blob store lock was poisoned"))?
            .insert(digest, payload)
            .is_some();
        Ok(ContentReceipt {
            id: content_id(digest),
            size_bytes,
            deduplicated,
        })
    }

    fn get_blob(&self, id: &ContentId) -> Result<Bytes, StorageError> {
        let digest = content_digest(id)?;
        self.blobs
            .read()
            .map_err(|_| storage_unavailable("blob store lock was poisoned"))?
            .get(&digest)
            .cloned()
            .ok_or_else(|| {
                StorageError::categorized(
                    StorageErrorKind::BlobNotFound,
                    format!("blob {digest} is missing"),
                )
            })
    }

    fn put_summary(
        &self,
        entries: Vec<ContentSummaryEntry>,
    ) -> Result<ContentSummaryReceipt, StorageError> {
        let manifest = SummaryManifest {
            entries: entries
                .into_iter()
                .map(|entry| {
                    Ok(SummaryEntry {
                        path: String::from_utf8(entry.path.to_vec()).map_err(|error| {
                            StorageError::categorized(
                                StorageErrorKind::InvalidManifest,
                                error.to_string(),
                            )
                        })?,
                        blob: content_digest(&entry.content)?,
                    })
                })
                .collect::<Result<Vec<_>, StorageError>>()?,
        };
        let encoded = encode_manifest(&manifest, self.config.max_manifest_bytes)
            .map_err(|error| map_storage_error(&error))?;
        let blobs = self
            .blobs
            .read()
            .map_err(|_| storage_unavailable("blob store lock was poisoned"))?;
        if let Some(entry) = manifest
            .entries
            .iter()
            .find(|entry| !blobs.contains_key(&entry.blob))
        {
            return Err(StorageError::categorized(
                StorageErrorKind::BlobNotFound,
                format!("blob {} is missing", entry.blob),
            ));
        }
        drop(blobs);
        let digest = ContentDigest::of(&encoded);
        let entry_count = manifest.entries.len();
        let persisted_bytes = u64::try_from(encoded.len()).map_err(|_| {
            StorageError::categorized(
                StorageErrorKind::ContentTooLarge,
                "manifest size exceeds range",
            )
        })?;
        let deduplicated = self
            .summaries
            .write()
            .map_err(|_| storage_unavailable("summary store lock was poisoned"))?
            .insert(digest, manifest)
            .is_some();
        Ok(ContentSummaryReceipt {
            id: content_id(digest),
            entry_count,
            persisted_bytes,
            deduplicated,
        })
    }

    fn get_summary(&self, id: &ContentId) -> Result<Vec<ContentSummaryEntry>, StorageError> {
        let digest = content_digest(id)?;
        let manifest = self
            .summaries
            .read()
            .map_err(|_| storage_unavailable("summary store lock was poisoned"))?
            .get(&digest)
            .cloned()
            .ok_or_else(|| {
                StorageError::categorized(
                    StorageErrorKind::SummaryNotFound,
                    format!("summary {digest} is missing"),
                )
            })?;
        Ok(manifest
            .entries
            .into_iter()
            .map(|entry| ContentSummaryEntry {
                path: Bytes::from(entry.path),
                content: content_id(entry.blob),
            })
            .collect())
    }
}

/// Creates an unavailable storage error for failed in-process synchronization.
fn storage_unavailable(message: &'static str) -> StorageError {
    StorageError::new(ErrorKind::Unavailable, message)
}

impl BlobReader {
    /// Returns the verified blob size in bytes.
    #[must_use]
    pub const fn size_bytes(&self) -> u64 {
        self.size_bytes
    }
}

impl Read for BlobReader {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        self.file.read(buffer)
    }
}

/// A cloneable handle to one durable filesystem content store.
#[derive(Clone, Debug)]
pub struct ContentStore {
    /// Package root used for cleanup and diagnostics.
    root: PathBuf,
    /// Directory containing immutable blobs named by digest.
    blobs: PathBuf,
    /// Directory containing immutable manifests named by digest.
    summaries: PathBuf,
    /// Directory containing unpublished temporary files.
    temporary: PathBuf,
    /// Limits applied to writes and verification reads.
    config: StoreConfig,
    /// Optional deterministic fault plan shared by cloned handles.
    faults: Arc<FaultInjector>,
}

impl ContentStore {
    /// Opens or creates a store and removes abandoned unpublished temporary files.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid configuration or filesystem failure.
    pub fn open(root: impl AsRef<Path>, config: StoreConfig) -> Result<Self, StoreError> {
        Self::open_with_fault_injector(root, config, Arc::new(FaultInjector::default()))
    }

    /// Opens a store with deterministic persistence fault injection.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid configuration or filesystem failure.
    pub fn open_with_fault_injector(
        root: impl AsRef<Path>,
        config: StoreConfig,
        faults: Arc<FaultInjector>,
    ) -> Result<Self, StoreError> {
        if config.copy_buffer_bytes == 0 {
            return Err(StoreError::InvalidConfig("copy buffer must not be empty"));
        }
        let root = root.as_ref().to_owned();
        let blobs = root.join("blobs");
        let summaries = root.join("summaries");
        let temporary = root.join("pending");
        fs::create_dir_all(&blobs)?;
        fs::create_dir_all(&summaries)?;
        fs::create_dir_all(&temporary)?;
        for entry in fs::read_dir(&temporary)? {
            let entry = entry?;
            if entry.file_type()?.is_file() {
                fs::remove_file(entry.path())?;
            }
        }
        Ok(Self {
            root,
            blobs,
            summaries,
            temporary,
            config,
            faults,
        })
    }

    /// Returns the store's root directory.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Streams, hashes, and durably publishes a blob.
    ///
    /// # Errors
    ///
    /// Returns an error when the blob exceeds its limit, persistence fails, or an injected fault
    /// occurs.
    pub fn put_blob(&self, mut source: impl Read) -> Result<BlobReceipt, StoreError> {
        let temporary = self.temporary_path("blob");
        let result = self.put_blob_inner(&mut source, &temporary);
        if temporary.exists() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    /// Implements staged blob publication and leaves cleanup to the caller.
    fn put_blob_inner(
        &self,
        source: &mut impl Read,
        temporary: &Path,
    ) -> Result<BlobReceipt, StoreError> {
        let mut pending = create_new(temporary)?;
        self.faults.hit(FaultPoint::BlobAfterCreate)?;
        let mut hash = Sha256::new();
        let mut size_bytes = 0_u64;
        let mut buffer = vec![0_u8; self.config.copy_buffer_bytes];
        let mut during_write_checked = false;
        loop {
            let read = source.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            size_bytes = size_bytes
                .checked_add(u64::try_from(read).map_err(|_| StoreError::BlobTooLarge {
                    limit: self.config.max_blob_bytes,
                })?)
                .ok_or(StoreError::BlobTooLarge {
                    limit: self.config.max_blob_bytes,
                })?;
            if size_bytes > self.config.max_blob_bytes {
                return Err(StoreError::BlobTooLarge {
                    limit: self.config.max_blob_bytes,
                });
            }
            pending.write_all(&buffer[..read])?;
            hash.update(&buffer[..read]);
            if !during_write_checked {
                self.faults.hit(FaultPoint::BlobDuringWrite)?;
                during_write_checked = true;
            }
        }
        self.faults.hit(FaultPoint::BlobAfterWrite)?;
        pending.sync_all()?;
        self.faults.hit(FaultPoint::BlobAfterFileSync)?;
        drop(pending);

        let digest = ContentDigest::from_hash(hash);
        let destination = self.blob_path(digest);
        let deduplicated = publish_immutable(temporary, &destination)?;
        self.faults.hit(FaultPoint::BlobAfterPublish)?;
        File::open(&self.blobs)?.sync_all()?;
        self.faults.hit(FaultPoint::BlobAfterDirectorySync)?;
        if deduplicated {
            self.verify_blob(digest)?;
        }
        Ok(BlobReceipt {
            digest,
            size_bytes,
            deduplicated,
        })
    }

    /// Opens an existing blob after a bounded-memory full integrity scan.
    ///
    /// # Errors
    ///
    /// Returns an error when the blob is absent, oversized, corrupt, or cannot be read.
    pub fn open_blob(&self, digest: ContentDigest) -> Result<BlobReader, StoreError> {
        let mut file = File::open(self.blob_path(digest)).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                StoreError::MissingBlob(digest)
            } else {
                StoreError::Io(error)
            }
        })?;
        let size_bytes = file.metadata()?.len();
        if size_bytes > self.config.max_blob_bytes {
            return Err(StoreError::BlobTooLarge {
                limit: self.config.max_blob_bytes,
            });
        }
        let actual = hash_reader(&mut file, self.config.copy_buffer_bytes)?;
        if actual != digest {
            return Err(StoreError::CorruptBlob {
                expected: digest,
                actual,
            });
        }
        file.seek(SeekFrom::Start(0))?;
        Ok(BlobReader { file, size_bytes })
    }

    /// Recomputes and validates a blob identity without retaining its bytes.
    ///
    /// # Errors
    ///
    /// Returns an error when the blob is absent, oversized, corrupt, or cannot be read.
    pub fn verify_blob(&self, digest: ContentDigest) -> Result<u64, StoreError> {
        self.open_blob(digest).map(|reader| reader.size_bytes)
    }

    /// Verifies all references, then atomically and durably publishes a manifest.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid or oversized manifest, an invalid referenced blob, a
    /// persistence failure, or an injected fault.
    pub fn publish_summary(
        &self,
        manifest: &SummaryManifest,
    ) -> Result<SummaryReceipt, StoreError> {
        validate_manifest(manifest)?;
        for entry in &manifest.entries {
            self.verify_blob(entry.blob)?;
        }
        let encoded = encode_manifest(manifest, self.config.max_manifest_bytes)?;
        let digest = ContentDigest::of(&encoded);
        let temporary = self.temporary_path("summary");
        let result = self.publish_summary_inner(manifest, &encoded, digest, &temporary);
        if temporary.exists() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    /// Implements staged manifest publication and leaves cleanup to the caller.
    fn publish_summary_inner(
        &self,
        manifest: &SummaryManifest,
        encoded: &[u8],
        digest: ContentDigest,
        temporary: &Path,
    ) -> Result<SummaryReceipt, StoreError> {
        let mut pending = create_new(temporary)?;
        self.faults.hit(FaultPoint::SummaryAfterCreate)?;
        let split = encoded.len().min(self.config.copy_buffer_bytes);
        pending.write_all(&encoded[..split])?;
        self.faults.hit(FaultPoint::SummaryDuringWrite)?;
        pending.write_all(&encoded[split..])?;
        self.faults.hit(FaultPoint::SummaryAfterWrite)?;
        pending.sync_all()?;
        self.faults.hit(FaultPoint::SummaryAfterFileSync)?;
        drop(pending);

        let destination = self.summary_path(digest);
        let deduplicated = publish_immutable(temporary, &destination)?;
        self.faults.hit(FaultPoint::SummaryAfterPublish)?;
        File::open(&self.summaries)?.sync_all()?;
        self.faults.hit(FaultPoint::SummaryAfterDirectorySync)?;
        if deduplicated {
            self.load_summary(digest)?;
        }
        Ok(SummaryReceipt {
            digest,
            entry_count: manifest.entries.len(),
            persisted_bytes: u64::try_from(encoded.len()).map_err(|_| {
                StoreError::ManifestTooLarge {
                    limit: self.config.max_manifest_bytes,
                }
            })?,
            deduplicated,
        })
    }

    /// Loads a manifest after validating its identity, framing, and every blob reference.
    ///
    /// # Errors
    ///
    /// Returns an error when the summary is absent, oversized, malformed, corrupt, references an
    /// invalid blob, or cannot be read.
    pub fn load_summary(&self, digest: ContentDigest) -> Result<SummaryManifest, StoreError> {
        let bytes = read_limited(
            &self.summary_path(digest),
            self.config.max_manifest_bytes,
            StoreError::MissingSummary(digest),
        )?;
        let actual = ContentDigest::of(&bytes);
        if actual != digest {
            return Err(StoreError::CorruptSummary {
                expected: digest,
                actual,
            });
        }
        let manifest = decode_manifest(&bytes)?;
        for entry in &manifest.entries {
            self.verify_blob(entry.blob)?;
        }
        Ok(manifest)
    }

    /// Returns the immutable path used for `digest` without checking existence.
    #[must_use]
    pub fn blob_path(&self, digest: ContentDigest) -> PathBuf {
        self.blobs.join(digest.to_string())
    }

    /// Returns the immutable summary path used for `digest` without checking existence.
    #[must_use]
    pub fn summary_path(&self, digest: ContentDigest) -> PathBuf {
        self.summaries.join(digest.to_string())
    }

    /// Produces a process-unique pending-file path for one publication attempt.
    fn temporary_path(&self, kind: &str) -> PathBuf {
        let sequence = NEXT_TEMP_FILE.fetch_add(1, Ordering::Relaxed);
        self.temporary
            .join(format!("{kind}-{}-{sequence}.pending", std::process::id()))
    }
}

/// Creates a pending file without replacing an existing path.
fn create_new(path: &Path) -> Result<File, StoreError> {
    Ok(OpenOptions::new().write(true).create_new(true).open(path)?)
}

/// Hard-links a pending file into place and reports whether it was deduplicated.
fn publish_immutable(temporary: &Path, destination: &Path) -> Result<bool, StoreError> {
    match fs::hard_link(temporary, destination) {
        Ok(()) => {
            fs::remove_file(temporary)?;
            Ok(false)
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            fs::remove_file(temporary)?;
            Ok(true)
        }
        Err(error) => Err(StoreError::Io(error)),
    }
}

/// Hashes a reader with memory bounded by `buffer_size`.
fn hash_reader(reader: &mut impl Read, buffer_size: usize) -> Result<ContentDigest, StoreError> {
    let mut hash = Sha256::new();
    let mut buffer = vec![0_u8; buffer_size];
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
    }
    Ok(ContentDigest::from_hash(hash))
}

/// Validates path contents and strict canonical ordering.
fn validate_manifest(manifest: &SummaryManifest) -> Result<(), StoreError> {
    let mut previous: Option<&str> = None;
    for entry in &manifest.entries {
        if entry.path.is_empty() {
            return Err(StoreError::InvalidManifest("entry path is empty"));
        }
        if entry.path.as_bytes().contains(&0) {
            return Err(StoreError::InvalidManifest("entry path contains NUL"));
        }
        if previous.is_some_and(|path| path >= entry.path.as_str()) {
            return Err(StoreError::InvalidManifest(
                "entry paths are not strictly ordered",
            ));
        }
        previous = Some(&entry.path);
    }
    Ok(())
}

/// Encodes a validated manifest while enforcing the configured size limit.
fn encode_manifest(manifest: &SummaryManifest, limit: u64) -> Result<Vec<u8>, StoreError> {
    let entry_count = u32::try_from(manifest.entries.len())
        .map_err(|_| StoreError::InvalidManifest("entry count exceeds format range"))?;
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&MANIFEST_MAGIC);
    bytes.extend_from_slice(&entry_count.to_be_bytes());
    if u64::try_from(bytes.len()).map_or(true, |length| length > limit) {
        return Err(StoreError::ManifestTooLarge { limit });
    }
    for entry in &manifest.entries {
        let path = entry.path.as_bytes();
        let path_length = u32::try_from(path.len())
            .map_err(|_| StoreError::InvalidManifest("entry path exceeds format range"))?;
        bytes.extend_from_slice(&path_length.to_be_bytes());
        bytes.extend_from_slice(path);
        bytes.extend_from_slice(entry.blob.as_bytes());
        if u64::try_from(bytes.len()).map_or(true, |length| length > limit) {
            return Err(StoreError::ManifestTooLarge { limit });
        }
    }
    Ok(bytes)
}

/// Decodes a complete canonical manifest and rejects trailing or malformed bytes.
fn decode_manifest(bytes: &[u8]) -> Result<SummaryManifest, StoreError> {
    if bytes.len() < MANIFEST_HEADER_BYTES || bytes[..MANIFEST_MAGIC.len()] != MANIFEST_MAGIC {
        return Err(StoreError::InvalidManifest("invalid header"));
    }
    let mut cursor = MANIFEST_MAGIC.len();
    let entry_count = read_u32(bytes, &mut cursor, "incomplete entry count")?;
    let minimum = MANIFEST_HEADER_BYTES
        .checked_add(
            usize::try_from(entry_count)
                .map_err(|_| StoreError::InvalidManifest("entry count exceeds address space"))?
                .checked_mul(MANIFEST_ENTRY_FIXED_BYTES)
                .ok_or(StoreError::InvalidManifest(
                    "entry count overflows manifest",
                ))?,
        )
        .ok_or(StoreError::InvalidManifest(
            "entry count overflows manifest",
        ))?;
    if minimum > bytes.len() {
        return Err(StoreError::InvalidManifest(
            "entry count exceeds manifest length",
        ));
    }
    let mut entries = Vec::new();
    for _ in 0..entry_count {
        let path_length = usize::try_from(read_u32(
            bytes,
            &mut cursor,
            "incomplete entry path length",
        )?)
        .map_err(|_| StoreError::InvalidManifest("path length exceeds address space"))?;
        let path_end = cursor
            .checked_add(path_length)
            .ok_or(StoreError::InvalidManifest("path length overflow"))?;
        let path = std::str::from_utf8(
            bytes
                .get(cursor..path_end)
                .ok_or(StoreError::InvalidManifest("incomplete entry path"))?,
        )
        .map_err(|_| StoreError::InvalidManifest("entry path is not UTF-8"))?
        .to_owned();
        cursor = path_end;
        let digest_end = cursor
            .checked_add(DIGEST_BYTES)
            .ok_or(StoreError::InvalidManifest("digest length overflow"))?;
        let digest = ContentDigest(
            bytes
                .get(cursor..digest_end)
                .ok_or(StoreError::InvalidManifest("incomplete entry digest"))?
                .try_into()
                .map_err(|_| StoreError::InvalidManifest("invalid entry digest"))?,
        );
        cursor = digest_end;
        entries.push(SummaryEntry { path, blob: digest });
    }
    if cursor != bytes.len() {
        return Err(StoreError::InvalidManifest("trailing bytes"));
    }
    let manifest = SummaryManifest { entries };
    validate_manifest(&manifest)?;
    Ok(manifest)
}

/// Reads one big-endian integer while advancing a checked manifest cursor.
fn read_u32(bytes: &[u8], cursor: &mut usize, error: &'static str) -> Result<u32, StoreError> {
    let end = cursor
        .checked_add(4)
        .ok_or(StoreError::InvalidManifest(error))?;
    let value = bytes
        .get(*cursor..end)
        .ok_or(StoreError::InvalidManifest(error))?;
    *cursor = end;
    Ok(u32::from_be_bytes(
        value
            .try_into()
            .map_err(|_| StoreError::InvalidManifest(error))?,
    ))
}

/// Reads a manifest only when its metadata length is within `limit`.
fn read_limited(path: &Path, limit: u64, missing: StoreError) -> Result<Vec<u8>, StoreError> {
    let mut file = File::open(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            missing
        } else {
            StoreError::Io(error)
        }
    })?;
    let length = file.metadata()?.len();
    if length > limit {
        return Err(StoreError::ManifestTooLarge { limit });
    }
    let capacity = usize::try_from(length).map_err(|_| StoreError::ManifestTooLarge { limit })?;
    let mut bytes = Vec::with_capacity(capacity);
    file.read_to_end(&mut bytes)?;
    Ok(bytes)
}
