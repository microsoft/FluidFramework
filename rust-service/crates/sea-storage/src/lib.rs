//! Built-in storage composition for the single-host Fluid service.
//!
//! This crate owns concrete backend selection and filesystem layout. Service behavior depends only
//! on the storage contracts in `sea-core`.

use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::{Read as _, Write as _},
    path::PathBuf,
    sync::{Arc, Mutex},
};

use async_trait::async_trait;
use bytes::Bytes;
use sea_content_addressed::{ContentStore, MemoryContentStore, StoreConfig};
use sea_core::{
    ErrorKind,
    storage::{
        ContentId, ContentReceipt, ContentStorage, ContentSummaryEntry, ContentSummaryReceipt,
        DocumentFencing, DocumentStorage, DocumentStorageAdapter, DocumentStorageFactory,
        OpenedDocumentStorage, ServiceStorage, StorageError, StorageErrorKind,
    },
};
use sea_file_durable::DurableLog;
use sea_file::FileStream;
use sea_memory::MemoryStream;

const SCOPE_FILE: &str = "service.scope";
const SCOPE_BYTES: usize = 16;
const MAX_BLOB_BYTES: u64 = 512 * 1024;
const MAX_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
const CONTENT_COPY_BUFFER_BYTES: usize = 64 * 1024;

/// Persistence backend used by the built-in single-host storage composition.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum StorageMode {
    /// Process-local storage intended for tests and ephemeral use.
    Memory,
    /// Buffered file storage without deployment-level fencing or durable append acknowledgement.
    BufferedFile,
    /// Durable file storage with persisted fencing authority.
    #[default]
    DurableFile,
}

impl StorageMode {
    /// Parses a stable command-line storage mode name.
    #[must_use]
    pub fn from_name(value: &str) -> Option<Self> {
        match value {
            "memory" => Some(Self::Memory),
            "buffered-file" => Some(Self::BufferedFile),
            "durable-file" => Some(Self::DurableFile),
            _ => None,
        }
    }

    /// Returns the stable command-line name of this storage mode.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Memory => "memory",
            Self::BufferedFile => "buffered-file",
            Self::DurableFile => "durable-file",
        }
    }
}

/// Filesystem and backend policy for built-in service storage.
#[derive(Clone, Debug)]
pub struct StorageConfig {
    /// Root directory for durable content, documents, and fencing authorities.
    pub root: PathBuf,
    /// Backend used for document logs and content.
    pub mode: StorageMode,
}

impl StorageConfig {
    /// Creates a configuration using durable file storage below `root`.
    #[must_use]
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            mode: StorageMode::default(),
        }
    }

    /// Replaces the configured storage backend.
    #[must_use]
    pub fn with_mode(mut self, mode: StorageMode) -> Self {
        self.mode = mode;
        self
    }
}

/// Built-in document and content storage composition.
pub struct BuiltInServiceStorage {
    documents: BuiltInDocumentStorageFactory,
    content: BuiltInContentStorage,
}

impl BuiltInServiceStorage {
    /// Creates built-in storage while retaining any durable content initialization failure.
    #[must_use]
    pub fn new(config: StorageConfig) -> Self {
        let content_config = StoreConfig {
            max_blob_bytes: MAX_BLOB_BYTES,
            max_manifest_bytes: MAX_MANIFEST_BYTES,
            copy_buffer_bytes: CONTENT_COPY_BUFFER_BYTES,
        };
        let content = match config.mode {
            StorageMode::Memory => {
                BuiltInContentStorage::Memory(MemoryContentStore::new(content_config))
            }
            StorageMode::BufferedFile | StorageMode::DurableFile => BuiltInContentStorage::Durable(
                ContentStore::open(config.root.join("content"), content_config)
                    .map_err(|error| StorageError::new(ErrorKind::Unavailable, error.to_string())),
            ),
        };
        Self {
            documents: BuiltInDocumentStorageFactory {
                config,
                memory: Mutex::new(BTreeMap::new()),
            },
            content,
        }
    }
}

impl ServiceStorage for BuiltInServiceStorage {
    fn documents(&self) -> &dyn DocumentStorageFactory {
        &self.documents
    }

    fn content(&self) -> &dyn ContentStorage {
        &self.content
    }
}

/// Runtime-selected content backend, including a retained durable initialization failure.
enum BuiltInContentStorage {
    Memory(MemoryContentStore),
    Durable(Result<ContentStore, StorageError>),
}

impl BuiltInContentStorage {
    fn selected(&self) -> Result<&dyn ContentStorage, StorageError> {
        match self {
            Self::Memory(storage) => Ok(storage),
            Self::Durable(Ok(storage)) => Ok(storage),
            Self::Durable(Err(error)) => Err(error.clone()),
        }
    }
}

impl ContentStorage for BuiltInContentStorage {
    fn put_blob(&self, payload: Bytes) -> Result<ContentReceipt, StorageError> {
        self.selected()?.put_blob(payload)
    }

    fn get_blob(&self, id: &ContentId) -> Result<Bytes, StorageError> {
        self.selected()?.get_blob(id)
    }

    fn put_summary(
        &self,
        entries: Vec<ContentSummaryEntry>,
    ) -> Result<ContentSummaryReceipt, StorageError> {
        self.selected()?.put_summary(entries)
    }

    fn get_summary(&self, id: &ContentId) -> Result<Vec<ContentSummaryEntry>, StorageError> {
        self.selected()?.get_summary(id)
    }
}

/// Built-in factory for process-local, buffered, and durable document streams.
struct BuiltInDocumentStorageFactory {
    config: StorageConfig,
    memory: Mutex<BTreeMap<Bytes, Arc<dyn DocumentStorage>>>,
}

#[async_trait]
impl DocumentStorageFactory for BuiltInDocumentStorageFactory {
    async fn exists(&self, document: &[u8]) -> Result<bool, StorageError> {
        if self.config.mode == StorageMode::Memory {
            return Ok(self
                .memory
                .lock()
                .map_err(|_| unavailable("document registry lock was poisoned"))?
                .contains_key(document));
        }
        Ok(self.document_path(document).join(SCOPE_FILE).is_file())
    }

    async fn create(&self, document: &[u8]) -> Result<OpenedDocumentStorage, StorageError> {
        if self.config.mode == StorageMode::Memory {
            let mut documents = self
                .memory
                .lock()
                .map_err(|_| unavailable("document registry lock was poisoned"))?;
            if documents.contains_key(document) {
                return Err(StorageError::categorized(
                    StorageErrorKind::DocumentAlreadyExists,
                    "document already exists",
                ));
            }
            let storage: Arc<dyn DocumentStorage> =
                Arc::new(DocumentStorageAdapter::new(MemoryStream::new()));
            documents.insert(Bytes::copy_from_slice(document), Arc::clone(&storage));
            return Ok(OpenedDocumentStorage {
                storage,
                fencing: DocumentFencing::Process,
            });
        }

        let path = self.document_path(document);
        fs::create_dir_all(&path).map_err(|error| unavailable(error.to_string()))?;
        let mut scope_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path.join(SCOPE_FILE))
            .map_err(|error| {
                if error.kind() == std::io::ErrorKind::AlreadyExists {
                    StorageError::categorized(
                        StorageErrorKind::DocumentAlreadyExists,
                        "document already exists",
                    )
                } else {
                    unavailable(error.to_string())
                }
            })?;
        scope_file
            .write_all(&new_scope())
            .and_then(|()| scope_file.sync_all())
            .map_err(|error| unavailable(error.to_string()))?;
        self.open_file_storage(document, path)
    }

    async fn open(&self, document: &[u8]) -> Result<OpenedDocumentStorage, StorageError> {
        if self.config.mode == StorageMode::Memory {
            return self
                .memory
                .lock()
                .map_err(|_| unavailable("document registry lock was poisoned"))?
                .get(document)
                .cloned()
                .map(|storage| OpenedDocumentStorage {
                    storage,
                    fencing: DocumentFencing::Process,
                })
                .ok_or_else(|| {
                    StorageError::categorized(
                        StorageErrorKind::DocumentNotFound,
                        "document does not exist",
                    )
                });
        }

        let path = self.document_path(document);
        let mut scope = [0_u8; SCOPE_BYTES];
        let mut scope_file = OpenOptions::new()
            .read(true)
            .open(path.join(SCOPE_FILE))
            .map_err(|error| {
                if error.kind() == std::io::ErrorKind::NotFound {
                    StorageError::categorized(
                        StorageErrorKind::DocumentNotFound,
                        "document does not exist",
                    )
                } else {
                    unavailable(error.to_string())
                }
            })?;
        scope_file
            .read_exact(&mut scope)
            .map_err(|error| StorageError::new(ErrorKind::Corrupt, error.to_string()))?;
        let mut trailing = [0_u8; 1];
        if scope_file
            .read(&mut trailing)
            .map_err(|error| unavailable(error.to_string()))?
            != 0
        {
            return Err(StorageError::new(
                ErrorKind::Corrupt,
                "document scope has trailing bytes",
            ));
        }
        self.open_file_storage(document, path)
    }
}

impl BuiltInDocumentStorageFactory {
    fn open_file_storage(
        &self,
        document: &[u8],
        path: PathBuf,
    ) -> Result<OpenedDocumentStorage, StorageError> {
        let storage: Arc<dyn DocumentStorage> = match self.config.mode {
            StorageMode::Memory => unreachable!("memory documents do not use filesystem storage"),
            StorageMode::BufferedFile => Arc::new(DocumentStorageAdapter::new(
                FileStream::open(path).map_err(|error| StorageError::from_classified(&error))?,
            )),
            StorageMode::DurableFile => Arc::new(DocumentStorageAdapter::new(
                DurableLog::open(path).map_err(|error| StorageError::from_classified(&error))?,
            )),
        };
        let fencing = if self.config.mode == StorageMode::DurableFile {
            DocumentFencing::File(self.authority_path(document))
        } else {
            DocumentFencing::Process
        };
        Ok(OpenedDocumentStorage { storage, fencing })
    }

    fn document_path(&self, document: &[u8]) -> PathBuf {
        self.config.root.join("documents").join(hex(document))
    }

    fn authority_path(&self, document: &[u8]) -> PathBuf {
        self.config
            .root
            .join("authorities")
            .join(format!("{}.epoch", hex(document)))
    }
}

/// Generates a process-and-time-derived document scope marker.
fn new_scope() -> [u8; SCOPE_BYTES] {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());
    (timestamp ^ (u128::from(std::process::id()) << 64)).to_be_bytes()
}

/// Encodes opaque bytes for collision-free filesystem names.
fn hex(value: &[u8]) -> String {
    let mut encoded = String::with_capacity(value.len() * 2);
    for byte in value {
        use std::fmt::Write as _;
        let _ = write!(encoded, "{byte:02x}");
    }
    encoded
}

/// Creates a classified unavailable storage failure.
fn unavailable(message: impl Into<String>) -> StorageError {
    StorageError::new(ErrorKind::Unavailable, message)
}
