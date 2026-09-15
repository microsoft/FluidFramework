//! Service-level storage composition contracts.
//!
//! These contracts keep document streams and content operations focused while allowing a service
//! to receive both from one storage composition root. Backend-specific persistence, filesystem,
//! synchronization, and durability policy remain in implementation crates.

use std::{error::Error, fmt, path::PathBuf, sync::Arc};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::StreamExt as _;

use crate::{
    AppendReceipt, AppendStream, Capabilities, ClassifiedError, ErrorKind, PositionCodec,
    PublishedSnapshot, ReadRecord, Snapshot, SnapshotId, SnapshotPosition, SnapshotStore,
    StreamReader,
};

/// An opaque, backend-validated position used across the service storage boundary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoragePosition(Bytes);

impl StoragePosition {
    /// Creates a position from an opaque backend token.
    #[must_use]
    pub fn from_token(token: Bytes) -> Self {
        Self(token)
    }

    /// Returns the opaque backend token.
    #[must_use]
    pub fn token(&self) -> &Bytes {
        &self.0
    }
}

/// A classified failure returned through a type-erased storage boundary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StorageError {
    kind: StorageErrorKind,
    message: String,
}

/// Stable failure categories spanning document and content storage.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StorageErrorKind {
    /// A kernel stream or snapshot failure.
    Document(ErrorKind),
    /// The requested document already exists.
    DocumentAlreadyExists,
    /// The requested document does not exist.
    DocumentNotFound,
    /// A content identity has an invalid representation.
    InvalidContentId,
    /// A summary manifest violates its structural contract.
    InvalidManifest,
    /// A blob or summary exceeds configured storage limits.
    ContentTooLarge,
    /// No blob exists for the requested identity.
    BlobNotFound,
    /// No summary exists for the requested identity.
    SummaryNotFound,
}

impl StorageError {
    /// Creates a classified storage failure with a diagnostic message.
    #[must_use]
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind: StorageErrorKind::Document(kind),
            message: message.into(),
        }
    }

    /// Creates a storage failure that preserves a content-specific category.
    #[must_use]
    pub fn categorized(kind: StorageErrorKind, message: impl Into<String>) -> Self {
        debug_assert!(!matches!(kind, StorageErrorKind::Document(_)));
        Self {
            kind,
            message: message.into(),
        }
    }

    /// Converts an implementation error without exposing its concrete type.
    #[must_use]
    pub fn from_classified(error: &impl ClassifiedError) -> Self {
        Self::new(error.kind(), error.to_string())
    }

    /// Returns the storage-level failure category.
    #[must_use]
    pub const fn storage_kind(&self) -> StorageErrorKind {
        self.kind
    }
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for StorageError {}

impl ClassifiedError for StorageError {
    fn kind(&self) -> ErrorKind {
        match self.kind {
            StorageErrorKind::Document(kind) => kind,
            StorageErrorKind::DocumentAlreadyExists
            | StorageErrorKind::DocumentNotFound
            | StorageErrorKind::InvalidContentId
            | StorageErrorKind::InvalidManifest
            | StorageErrorKind::ContentTooLarge
            | StorageErrorKind::BlobNotFound
            | StorageErrorKind::SummaryNotFound => ErrorKind::Rejected,
        }
    }
}

/// Backend-neutral document stream and snapshot storage.
#[async_trait]
pub trait DocumentStorage: Send + Sync {
    /// Reports optional stream capabilities preserved by this storage composition.
    fn capabilities(&self) -> Capabilities;

    /// Appends one record and returns its opaque service position.
    async fn append(&self, value: Bytes) -> Result<AppendReceipt<StoragePosition>, StorageError>;

    /// Reads records strictly after `after`, or from the retained beginning when absent.
    async fn read(
        &self,
        after: Option<&StoragePosition>,
    ) -> Result<StreamReader<StoragePosition, StorageError>, StorageError>;

    /// Returns the latest committed position, or `None` when the stream is empty.
    async fn head(&self) -> Result<Option<StoragePosition>, StorageError>;

    /// Returns the latest published snapshot.
    async fn latest(&self) -> Result<Option<PublishedSnapshot<StoragePosition>>, StorageError>;

    /// Publishes a snapshot with optimistic parent validation.
    async fn publish(
        &self,
        snapshot: Snapshot<StoragePosition>,
        expected_parent: Option<&SnapshotId>,
    ) -> Result<SnapshotId, StorageError>;

    /// Validates and normalizes a token supplied by a service client.
    async fn validate_position(&self, token: &[u8]) -> Result<StoragePosition, StorageError>;
}

/// Type-erases a stream implementing the kernel storage contracts.
#[derive(Clone, Debug)]
pub struct DocumentStorageAdapter<S> {
    inner: S,
}

impl<S> DocumentStorageAdapter<S> {
    /// Wraps one document stream implementation.
    #[must_use]
    pub const fn new(inner: S) -> Self {
        Self { inner }
    }
}

#[async_trait]
impl<S> DocumentStorage for DocumentStorageAdapter<S>
where
    S: AppendStream
        + PositionCodec
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>
        + Clone
        + Send
        + Sync
        + 'static,
    <S as AppendStream>::Position: Send + Sync + 'static,
    <S as AppendStream>::Error: Send + Sync + 'static,
{
    fn capabilities(&self) -> Capabilities {
        self.inner.capabilities()
    }

    async fn append(&self, value: Bytes) -> Result<AppendReceipt<StoragePosition>, StorageError> {
        let receipt = self
            .inner
            .append(value)
            .await
            .map_err(|error| StorageError::from_classified(&error))?;
        Ok(AppendReceipt {
            position: self.encode_position(&receipt.position)?,
            durability: receipt.durability,
        })
    }

    async fn read(
        &self,
        after: Option<&StoragePosition>,
    ) -> Result<StreamReader<StoragePosition, StorageError>, StorageError> {
        let after = after
            .map(|position| self.decode_position(position))
            .transpose()?;
        let reader = self
            .inner
            .read(after.as_ref())
            .await
            .map_err(|error| StorageError::from_classified(&error))?;
        let inner = self.inner.clone();
        Ok(Box::pin(reader.map(move |record| {
            let record = record.map_err(|error| StorageError::from_classified(&error))?;
            Ok(ReadRecord {
                position: Self::encode_with(&inner, &record.position)?,
                payload: record.payload,
            })
        })))
    }

    async fn head(&self) -> Result<Option<StoragePosition>, StorageError> {
        self.inner
            .head()
            .await
            .map_err(|error| StorageError::from_classified(&error))?
            .map(|position| self.encode_position(&position))
            .transpose()
    }

    async fn latest(&self) -> Result<Option<PublishedSnapshot<StoragePosition>>, StorageError> {
        self.inner
            .latest()
            .await
            .map_err(|error| StorageError::from_classified(&error))?
            .map(|published| {
                Ok(PublishedSnapshot {
                    id: published.id,
                    snapshot: Snapshot {
                        includes_through: match published.snapshot.includes_through {
                            SnapshotPosition::Initial => SnapshotPosition::Initial,
                            SnapshotPosition::At(position) => {
                                SnapshotPosition::At(self.encode_position(&position)?)
                            }
                        },
                        payload: published.snapshot.payload,
                    },
                })
            })
            .transpose()
    }

    async fn publish(
        &self,
        snapshot: Snapshot<StoragePosition>,
        expected_parent: Option<&SnapshotId>,
    ) -> Result<SnapshotId, StorageError> {
        let includes_through = match snapshot.includes_through {
            SnapshotPosition::Initial => SnapshotPosition::Initial,
            SnapshotPosition::At(position) => {
                SnapshotPosition::At(self.decode_position(&position)?)
            }
        };
        self.inner
            .publish(
                Snapshot {
                    includes_through,
                    payload: snapshot.payload,
                },
                expected_parent,
            )
            .await
            .map_err(|error| StorageError::from_classified(&error))
    }

    async fn validate_position(&self, token: &[u8]) -> Result<StoragePosition, StorageError> {
        let position = self
            .inner
            .decode_position(token)
            .map_err(|error| StorageError::from_classified(&error))?;
        let reader = self
            .inner
            .read(Some(&position))
            .await
            .map_err(|error| StorageError::from_classified(&error))?;
        drop(reader);
        self.encode_position(&position)
    }
}

impl<S> DocumentStorageAdapter<S>
where
    S: AppendStream + PositionCodec,
{
    /// Encodes one backend position into its opaque storage form.
    fn encode_position(
        &self,
        position: &<S as AppendStream>::Position,
    ) -> Result<StoragePosition, StorageError> {
        Self::encode_with(&self.inner, position)
    }

    /// Encodes one backend position without borrowing the adapter.
    fn encode_with(
        inner: &S,
        position: &<S as AppendStream>::Position,
    ) -> Result<StoragePosition, StorageError> {
        inner
            .encode_position(position)
            .map(StoragePosition::from_token)
            .map_err(|error| StorageError::from_classified(&error))
    }

    /// Decodes one opaque storage position for the wrapped backend.
    fn decode_position(
        &self,
        position: &StoragePosition,
    ) -> Result<<S as AppendStream>::Position, StorageError> {
        self.inner
            .decode_position(position.token())
            .map_err(|error| StorageError::from_classified(&error))
    }
}

/// Fencing policy paired with one opened document store.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DocumentFencing {
    /// Fencing is scoped to one process.
    Process,
    /// Fencing uses a same-host persisted authority at this implementation-owned path.
    File(PathBuf),
}

/// Storage and fencing returned for one document.
pub struct OpenedDocumentStorage {
    /// Opaque document stream and snapshot storage.
    pub storage: Arc<dyn DocumentStorage>,
    /// Authority used to fence authoritative sequencers for this document.
    pub fencing: DocumentFencing,
}

/// Creates and opens isolated document storage.
#[async_trait]
pub trait DocumentStorageFactory: Send + Sync {
    /// Reports whether the document already exists.
    async fn exists(&self, document: &[u8]) -> Result<bool, StorageError>;

    /// Creates and opens a document that must not already exist.
    async fn create(&self, document: &[u8]) -> Result<OpenedDocumentStorage, StorageError>;

    /// Opens an existing document.
    async fn open(&self, document: &[u8]) -> Result<OpenedDocumentStorage, StorageError>;
}

/// Opaque content digest bytes interpreted by a content implementation.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ContentId(Bytes);

impl ContentId {
    /// Creates an identifier from implementation-defined digest bytes.
    #[must_use]
    pub fn from_bytes(bytes: Bytes) -> Self {
        Self(bytes)
    }

    /// Returns the digest bytes.
    #[must_use]
    pub fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

/// One canonical path-to-content entry in a summary manifest.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContentSummaryEntry {
    /// UTF-8 path bytes interpreted by the service protocol adapter.
    pub path: Bytes,
    /// Content identity stored at this path.
    pub content: ContentId,
}

/// Receipt for immutable blob publication.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContentReceipt {
    /// Identity computed from the published bytes.
    pub id: ContentId,
    /// Number of published source bytes.
    pub size_bytes: u64,
    /// Whether identical content already existed.
    pub deduplicated: bool,
}

/// Receipt for summary publication.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContentSummaryReceipt {
    /// Identity computed from the canonical manifest.
    pub id: ContentId,
    /// Number of entries in the manifest.
    pub entry_count: usize,
    /// Number of bytes in its persisted canonical encoding.
    pub persisted_bytes: u64,
    /// Whether an identical manifest already existed.
    pub deduplicated: bool,
}

/// Immutable blob and summary storage used by a service.
pub trait ContentStorage: Send + Sync {
    /// Publishes or deduplicates one blob.
    ///
    /// # Errors
    ///
    /// Returns a classified storage failure when validation or publication fails.
    fn put_blob(&self, payload: Bytes) -> Result<ContentReceipt, StorageError>;

    /// Fetches and verifies one blob.
    ///
    /// # Errors
    ///
    /// Returns a classified storage failure when the identity is invalid, missing, or corrupt.
    fn get_blob(&self, id: &ContentId) -> Result<Bytes, StorageError>;

    /// Validates referenced content and publishes one canonical summary.
    ///
    /// # Errors
    ///
    /// Returns a classified storage failure when validation or publication fails.
    fn put_summary(
        &self,
        entries: Vec<ContentSummaryEntry>,
    ) -> Result<ContentSummaryReceipt, StorageError>;

    /// Fetches and verifies one canonical summary.
    ///
    /// # Errors
    ///
    /// Returns a classified storage failure when the identity is invalid, missing, or corrupt.
    fn get_summary(&self, id: &ContentId) -> Result<Vec<ContentSummaryEntry>, StorageError>;
}

/// Central composition root for service document and content storage.
pub trait ServiceStorage: Send + Sync {
    /// Returns the document storage factory.
    fn documents(&self) -> &dyn DocumentStorageFactory;

    /// Returns service-wide immutable content storage.
    fn content(&self) -> &dyn ContentStorage;
}

/// Collects one finite document read into a vector for replay-oriented consumers.
///
/// # Errors
///
/// Returns the first storage failure produced while opening or consuming the read.
pub async fn read_all(
    storage: &dyn DocumentStorage,
) -> Result<Vec<ReadRecord<StoragePosition>>, StorageError> {
    let mut reader = storage.read(None).await?;
    let mut records = Vec::new();
    while let Some(record) =
        std::future::poll_fn(|context| reader.as_mut().poll_next(context)).await
    {
        records.push(record?);
    }
    Ok(records)
}
