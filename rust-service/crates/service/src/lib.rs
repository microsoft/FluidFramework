//! Single-host native Fluid service assembly.
//!
//! Documents own independent logs, sequencers, fences, and projected-operation notification
//! channels. Unary requests route by their embedded document identity. Transport adapters own
//! long-lived stream framing and bind submission streams to one document before calling this
//! service. Projected subscriptions register before catch-up reads, recover from notification lag
//! by cursor, and report cancellation before returning another pending operation.

use std::{
    collections::{BTreeMap, VecDeque},
    error::Error,
    fmt,
    fs::{self, OpenOptions},
    future::Future,
    io::{Cursor, Read, Write},
    path::PathBuf,
    sync::{Arc, RwLock},
};

use async_trait::async_trait;
use bytes::Bytes;
use fluid_sequencer::{
    AuthoritativeSequencer, FencedStream, PositionToken, ProjectedOperation as SequencerOperation,
    Rejection, ResolutionOutcome, SequencedMessage, SequencerStorage,
    ServiceError as SequencerError, SessionId, Submission as SequencerSubmission, SubmissionId,
    SubmitOutcome, WriterId,
};
use fluid_service_protocol::{
    Acknowledgement, CommittedRecord, ErrorCode, ProjectedOperation,
    PublishedSnapshot as ProtocolSnapshot, Reference, Request, Resolution, Response,
    SubmissionDisposition,
};
use futures_util::StreamExt;
use snapshotted_stream_content_addressed::{
    BlobReceipt, ContentDigest, ContentStore, StoreConfig, StoreError,
    SummaryEntry as StoreSummaryEntry, SummaryManifest, SummaryReceipt,
};
use snapshotted_stream_core::{
    AppendReceipt, AppendStream, ClassifiedError, ErrorKind, PublishedSnapshot, ReadRecord,
    Snapshot, SnapshotId, SnapshotPosition, SnapshotStore,
};
use snapshotted_stream_durable_log_spike::{DurableLog, DurableLogError};
use snapshotted_stream_file_simple::{FileError, FileStream};
use snapshotted_stream_memory::{MemoryError, MemoryStream};
use tokio::sync::{Mutex, broadcast, watch};

/// File containing a durable document's generated scope identifier.
const SCOPE_FILE: &str = "service.scope";
/// Byte length of a generated document scope identifier.
const SCOPE_BYTES: usize = 16;
/// Byte length of canonical event position tokens.
const TOKEN_BYTES: usize = 8;
/// Maximum canonical records returned by one raw read.
const MAX_READ_RECORDS: usize = 1024;
/// Target maximum payload bytes returned by one raw read.
const MAX_READ_PAYLOAD_BYTES: usize = 768 * 1024;
/// Maximum canonical entries scanned by one projected read.
const MAX_PROJECTED_CANONICAL_RECORDS: usize = 1024;
/// Target maximum encoded operation bytes returned by one projected read.
const MAX_PROJECTED_ENCODED_BYTES: usize = 768 * 1024;
/// Maximum accepted content-addressed blob size.
const MAX_BLOB_BYTES: u64 = 512 * 1024;
/// Maximum encoded summary manifest size.
const MAX_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
/// Buffer size used while copying durable content.
const CONTENT_COPY_BUFFER_BYTES: usize = 64 * 1024;
/// Notification capacity; lag is recovered by reading from the cursor.
const PROJECTED_SUBSCRIPTION_NOTIFICATIONS: usize = 1;
/// Identifies the canonical in-memory summary encoding.
const SUMMARY_MANIFEST_MAGIC: [u8; 8] = *b"CSUM001\0";

/// Terminal errors returned while consuming a projected-operation subscription.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProjectedSubscriptionError {
    /// The caller explicitly cancelled the subscription.
    Cancelled,
    /// Catch-up or tailing failed with a classified service error.
    Service(ErrorCode),
}

/// A cursor-based stream of accepted operations for one document.
pub struct ProjectedSubscription {
    /// Shared service used for cursor-based catch-up reads.
    service: Arc<NativeService>,
    /// Document to which the subscription is bound.
    document: Bytes,
    /// Last canonical position scanned.
    cursor: Option<Bytes>,
    /// Accepted operations already fetched but not yet returned.
    pending: VecDeque<ProjectedOperation>,
    /// Best-effort notification receiver; lag is repaired by cursor reads.
    notifications: broadcast::Receiver<()>,
    /// Cancellation state observed by `next`.
    cancellation: watch::Receiver<bool>,
    /// Cancellation sender retained by the subscription handle.
    cancel: watch::Sender<bool>,
}

impl ProjectedSubscription {
    /// Returns the next accepted projected operation after the subscription cursor.
    ///
    /// # Errors
    ///
    /// Returns `Cancelled` after explicit cancellation or a classified service error when
    /// cursor validation, projected reading, or document ownership fails.
    pub async fn next(&mut self) -> Result<ProjectedOperation, ProjectedSubscriptionError> {
        self.fill_pending().await?;
        self.pending
            .pop_front()
            .ok_or(ProjectedSubscriptionError::Service(
                ErrorCode::InvalidRequest,
            ))
    }

    /// Returns a bounded batch beginning with the next accepted projected operation.
    ///
    /// The call waits until one operation is available, then drains only operations already
    /// fetched by the same projected read. `max_payload_bytes` bounds the sum of payload bytes.
    ///
    /// # Errors
    ///
    /// Returns `InvalidRequest` for zero limits or when the next operation exceeds the payload
    /// limit. Otherwise returns the same cancellation and service errors as [`Self::next`].
    pub async fn next_batch(
        &mut self,
        max_operations: usize,
        max_payload_bytes: usize,
    ) -> Result<Vec<ProjectedOperation>, ProjectedSubscriptionError> {
        if max_operations == 0 || max_payload_bytes == 0 {
            return Err(ProjectedSubscriptionError::Service(
                ErrorCode::InvalidRequest,
            ));
        }
        self.fill_pending().await?;
        if self
            .pending
            .front()
            .is_some_and(|operation| operation.payload.len() > max_payload_bytes)
        {
            return Err(ProjectedSubscriptionError::Service(
                ErrorCode::InvalidRequest,
            ));
        }

        let mut payload_bytes = 0usize;
        let mut operations = Vec::new();
        while operations.len() < max_operations {
            let Some(operation) = self.pending.front() else {
                break;
            };
            let Some(next_payload_bytes) = payload_bytes.checked_add(operation.payload.len())
            else {
                break;
            };
            if next_payload_bytes > max_payload_bytes {
                break;
            }
            payload_bytes = next_payload_bytes;
            operations.push(
                self.pending
                    .pop_front()
                    .expect("the projected operation was just observed"),
            );
        }
        Ok(operations)
    }

    async fn fill_pending(&mut self) -> Result<(), ProjectedSubscriptionError> {
        loop {
            if *self.cancellation.borrow() {
                return Err(ProjectedSubscriptionError::Cancelled);
            }
            if !self.pending.is_empty() {
                return Ok(());
            }
            match self
                .service
                .handle(Request::ReadProjected {
                    document: self.document.clone(),
                    after: self.cursor.clone(),
                })
                .await
            {
                Response::ProjectedRead {
                    operations,
                    cursor,
                    has_more,
                } => {
                    self.cursor = cursor;
                    self.pending.extend(operations);
                    if !self.pending.is_empty() {
                        return Ok(());
                    }
                    if has_more {
                        continue;
                    }
                }
                Response::Error(code) => return Err(ProjectedSubscriptionError::Service(code)),
                _ => {
                    return Err(ProjectedSubscriptionError::Service(
                        ErrorCode::InvalidRequest,
                    ));
                }
            }
            tokio::select! {
                biased;
                changed = self.cancellation.changed() => {
                    if changed.is_err() || *self.cancellation.borrow() {
                        return Err(ProjectedSubscriptionError::Cancelled);
                    }
                }
                notification = self.notifications.recv() => match notification {
                    Ok(()) | Err(broadcast::error::RecvError::Lagged(_)) => {}
                    Err(broadcast::error::RecvError::Closed) => {
                        return Err(ProjectedSubscriptionError::Service(ErrorCode::Unavailable));
                    }
                }
            }
        }
    }

    /// Cancels the subscription and causes the next read to return `Cancelled`.
    pub fn cancel(&self) {
        self.cancel.send_replace(true);
    }

    /// Returns the last canonical cursor scanned by the subscription.
    #[must_use]
    pub fn cursor(&self) -> Option<&Bytes> {
        self.cursor.as_ref()
    }
}

/// Filesystem and storage policy used to construct a [`NativeService`].
#[derive(Clone, Debug)]
pub struct ServiceConfig {
    /// Root directory for durable content, documents, and fencing authorities.
    pub root: PathBuf,
    /// Backend used for document logs and content.
    pub storage_mode: StorageMode,
}

/// Persistence backend used by the single-host service.
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
    /// Parses a command-line storage mode name.
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

impl ServiceConfig {
    /// Creates a configuration using durable file storage below `root`.
    #[must_use]
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            storage_mode: StorageMode::default(),
        }
    }

    /// Replaces the configured storage backend.
    #[must_use]
    pub fn with_storage_mode(mut self, storage_mode: StorageMode) -> Self {
        self.storage_mode = storage_mode;
        self
    }
}

/// A single-host registry of isolated document sequencers and shared content storage.
pub struct NativeService {
    /// Storage and root-directory policy.
    config: ServiceConfig,
    /// Service-wide blob and summary storage.
    content: ServiceContentStore,
    /// Lazily opened document state by opaque identifier.
    documents: Mutex<BTreeMap<Bytes, Document>>,
}

/// Selects ephemeral or durable content-addressed storage.
enum ServiceContentStore {
    /// Process-local content storage.
    Memory(MemoryContentStore),
    /// Durable store or its retained initialization failure.
    Durable(Result<ContentStore, ErrorCode>),
}

/// Process-local content-addressed blobs and summary manifests.
#[derive(Default)]
struct MemoryContentStore {
    /// Blob bytes indexed by content digest.
    blobs: RwLock<BTreeMap<ContentDigest, Bytes>>,
    /// Summary manifests indexed by canonical digest.
    summaries: RwLock<BTreeMap<ContentDigest, SummaryManifest>>,
}

impl MemoryContentStore {
    /// Stores or deduplicates one bounded blob.
    fn put_blob(&self, payload: Bytes) -> Result<BlobReceipt, ErrorCode> {
        let size_bytes = u64::try_from(payload.len()).map_err(|_| ErrorCode::ContentTooLarge)?;
        if size_bytes > MAX_BLOB_BYTES {
            return Err(ErrorCode::ContentTooLarge);
        }
        let digest = ContentDigest::of(&payload);
        let deduplicated = self
            .blobs
            .write()
            .map_err(|_| ErrorCode::Unavailable)?
            .insert(digest, payload)
            .is_some();
        Ok(BlobReceipt {
            digest,
            size_bytes,
            deduplicated,
        })
    }

    /// Fetches one blob or reports that its digest is absent.
    fn fetch_blob(&self, digest: ContentDigest) -> Result<Bytes, ErrorCode> {
        self.blobs
            .read()
            .map_err(|_| ErrorCode::Unavailable)?
            .get(&digest)
            .cloned()
            .ok_or(ErrorCode::BlobNotFound)
    }

    /// Validates blob references and stores a canonical summary manifest.
    fn publish_summary(&self, manifest: SummaryManifest) -> Result<SummaryReceipt, ErrorCode> {
        let encoded = encode_summary_manifest(&manifest)?;
        let blobs = self.blobs.read().map_err(|_| ErrorCode::Unavailable)?;
        if manifest
            .entries
            .iter()
            .any(|entry| !blobs.contains_key(&entry.blob))
        {
            return Err(ErrorCode::BlobNotFound);
        }
        drop(blobs);
        let digest = ContentDigest::of(&encoded);
        let entry_count = manifest.entries.len();
        let persisted_bytes =
            u64::try_from(encoded.len()).map_err(|_| ErrorCode::ContentTooLarge)?;
        let deduplicated = self
            .summaries
            .write()
            .map_err(|_| ErrorCode::Unavailable)?
            .insert(digest, manifest)
            .is_some();
        Ok(SummaryReceipt {
            digest,
            entry_count,
            persisted_bytes,
            deduplicated,
        })
    }

    /// Fetches one summary manifest or reports that its digest is absent.
    fn fetch_summary(&self, digest: ContentDigest) -> Result<SummaryManifest, ErrorCode> {
        self.summaries
            .read()
            .map_err(|_| ErrorCode::Unavailable)?
            .get(&digest)
            .cloned()
            .ok_or(ErrorCode::SummaryNotFound)
    }
}

impl NativeService {
    /// Creates a lazily opened service using the supplied storage configuration.
    #[must_use]
    pub fn new(config: ServiceConfig) -> Self {
        let content = match config.storage_mode {
            StorageMode::Memory => ServiceContentStore::Memory(MemoryContentStore::default()),
            StorageMode::BufferedFile | StorageMode::DurableFile => ServiceContentStore::Durable(
                ContentStore::open(
                    config.root.join("content"),
                    StoreConfig {
                        max_blob_bytes: MAX_BLOB_BYTES,
                        max_manifest_bytes: MAX_MANIFEST_BYTES,
                        copy_buffer_bytes: CONTENT_COPY_BUFFER_BYTES,
                    },
                )
                .map_err(|error| map_content_error(&error)),
            ),
        };
        Self {
            config,
            content,
            documents: Mutex::new(BTreeMap::new()),
        }
    }

    /// Routes one unary request and converts classified failures into protocol responses.
    pub async fn handle(&self, request: Request) -> Response {
        match self.handle_result(request).await {
            Ok(response) => response,
            Err(code) => Response::Error(code),
        }
    }

    /// Registers a bounded projected-operation subscription for one document and opaque cursor.
    ///
    /// # Errors
    ///
    /// Returns a classified service error when the document cannot be found or opened.
    pub async fn subscribe_projected(
        self: &Arc<Self>,
        document: Bytes,
        after: Option<Bytes>,
    ) -> Result<ProjectedSubscription, ErrorCode> {
        let mut documents = self.documents.lock().await;
        if !documents.contains_key(&document) {
            let path = self.document_path(&document);
            if !self.document_exists(&path) {
                return Err(ErrorCode::DocumentNotFound);
            }
            let opened = Document::open(
                path,
                self.authority_path(&document),
                self.config.storage_mode,
            )
            .await?;
            documents.insert(document.clone(), opened);
        }
        let notifications = documents
            .get(&document)
            .ok_or(ErrorCode::DocumentNotFound)?
            .projected_notifications
            .subscribe();
        drop(documents);
        let (cancel, cancellation) = watch::channel(false);
        Ok(ProjectedSubscription {
            service: Arc::clone(self),
            document,
            cursor: after,
            pending: VecDeque::new(),
            notifications,
            cancellation,
            cancel,
        })
    }

    /// Handles service-wide requests or routes document-scoped requests.
    async fn handle_result(&self, request: Request) -> Result<Response, ErrorCode> {
        match request {
            Request::UploadBlob { payload } => self.upload_blob(payload),
            Request::FetchBlob { digest } => self.fetch_blob(&digest),
            Request::PublishSummary { entries } => self.publish_summary(entries),
            Request::FetchSummary { digest } => self.fetch_summary(&digest),
            Request::Create { document } => {
                let mut documents = self.documents.lock().await;
                let path = self.document_path(&document);
                if documents.contains_key(&document) || self.document_exists(&path) {
                    return Err(ErrorCode::DocumentAlreadyExists);
                }
                let opened = Document::create(
                    path,
                    self.authority_path(&document),
                    self.config.storage_mode,
                )
                .await?;
                documents.insert(document, opened);
                Ok(Response::Acknowledged(Acknowledgement::Created))
            }
            Request::Shutdown => Ok(Response::Acknowledged(Acknowledgement::ShuttingDown)),
            request => {
                let document_id = request_document(&request).ok_or(ErrorCode::InvalidRequest)?;
                let mut documents = self.documents.lock().await;
                if !documents.contains_key(document_id) {
                    let path = self.document_path(document_id);
                    if !self.document_exists(&path) {
                        return Err(ErrorCode::DocumentNotFound);
                    }
                    let opened = Document::open(
                        path,
                        self.authority_path(document_id),
                        self.config.storage_mode,
                    )
                    .await?;
                    documents.insert(document_id.clone(), opened);
                }
                documents
                    .get_mut(document_id)
                    .ok_or(ErrorCode::DocumentNotFound)?
                    .handle(request)
                    .await
            }
        }
    }

    /// Stores a blob in the configured content backend and builds its receipt response.
    fn upload_blob(&self, payload: Bytes) -> Result<Response, ErrorCode> {
        let receipt = match &self.content {
            ServiceContentStore::Memory(content) => content.put_blob(payload)?,
            ServiceContentStore::Durable(content) => content
                .as_ref()
                .map_err(|code| *code)?
                .put_blob(Cursor::new(payload))
                .map_err(|error| map_content_error(&error))?,
        };
        Ok(Response::BlobUploaded {
            digest: Bytes::copy_from_slice(receipt.digest.as_bytes()),
            size_bytes: receipt.size_bytes,
            deduplicated: receipt.deduplicated,
        })
    }

    /// Fetches a validated digest from the configured content backend.
    fn fetch_blob(&self, digest: &[u8]) -> Result<Response, ErrorCode> {
        let digest = ContentDigest::from_bytes(digest).map_err(|_| ErrorCode::InvalidDigest)?;
        let payload = match &self.content {
            ServiceContentStore::Memory(content) => content.fetch_blob(digest)?.to_vec(),
            ServiceContentStore::Durable(content) => {
                let mut reader = content
                    .as_ref()
                    .map_err(|code| *code)?
                    .open_blob(digest)
                    .map_err(|error| map_content_error(&error))?;
                let mut payload = Vec::with_capacity(
                    usize::try_from(reader.size_bytes()).map_err(|_| ErrorCode::ContentTooLarge)?,
                );
                reader
                    .read_to_end(&mut payload)
                    .map_err(|_| ErrorCode::Unavailable)?;
                payload
            }
        };
        Ok(Response::Blob {
            digest: Bytes::copy_from_slice(digest.as_bytes()),
            payload: Bytes::from(payload),
        })
    }

    /// Converts and publishes a protocol summary manifest.
    fn publish_summary(
        &self,
        entries: Vec<fluid_service_protocol::SummaryEntry>,
    ) -> Result<Response, ErrorCode> {
        let entries = entries
            .into_iter()
            .map(|entry| {
                Ok(StoreSummaryEntry {
                    path: String::from_utf8(entry.path.to_vec())
                        .map_err(|_| ErrorCode::InvalidManifest)?,
                    blob: ContentDigest::from_bytes(&entry.blob)
                        .map_err(|_| ErrorCode::InvalidDigest)?,
                })
            })
            .collect::<Result<Vec<_>, ErrorCode>>()?;
        let manifest = SummaryManifest { entries };
        let receipt = match &self.content {
            ServiceContentStore::Memory(content) => content.publish_summary(manifest)?,
            ServiceContentStore::Durable(content) => content
                .as_ref()
                .map_err(|code| *code)?
                .publish_summary(&manifest)
                .map_err(|error| map_content_error(&error))?,
        };
        Ok(Response::SummaryPublished {
            digest: Bytes::copy_from_slice(receipt.digest.as_bytes()),
            entry_count: u32::try_from(receipt.entry_count)
                .map_err(|_| ErrorCode::ContentTooLarge)?,
            persisted_bytes: receipt.persisted_bytes,
            deduplicated: receipt.deduplicated,
        })
    }

    /// Fetches and converts a summary manifest for the protocol response.
    fn fetch_summary(&self, digest: &[u8]) -> Result<Response, ErrorCode> {
        let digest = ContentDigest::from_bytes(digest).map_err(|_| ErrorCode::InvalidDigest)?;
        let manifest = match &self.content {
            ServiceContentStore::Memory(content) => content.fetch_summary(digest)?,
            ServiceContentStore::Durable(content) => content
                .as_ref()
                .map_err(|code| *code)?
                .load_summary(digest)
                .map_err(|error| map_content_error(&error))?,
        };
        Ok(Response::Summary {
            digest: Bytes::copy_from_slice(digest.as_bytes()),
            entries: manifest
                .entries
                .into_iter()
                .map(|entry| fluid_service_protocol::SummaryEntry {
                    path: Bytes::from(entry.path),
                    blob: Bytes::copy_from_slice(entry.blob.as_bytes()),
                })
                .collect(),
        })
    }

    /// Reports whether a file-backed document can be opened at `path`.
    fn document_exists(&self, path: &std::path::Path) -> bool {
        self.config.storage_mode != StorageMode::Memory && path.exists()
    }

    /// Maps an opaque document identifier to its isolated storage directory.
    fn document_path(&self, document: &[u8]) -> PathBuf {
        self.config.root.join("documents").join(hex(document))
    }

    /// Maps a document identifier to its persisted fencing authority.
    fn authority_path(&self, document: &[u8]) -> PathBuf {
        self.config
            .root
            .join("authorities")
            .join(format!("{}.epoch", hex(document)))
    }
}

/// Encodes a sorted, unique summary manifest for in-memory digest parity.
fn encode_summary_manifest(manifest: &SummaryManifest) -> Result<Vec<u8>, ErrorCode> {
    let entry_count =
        u32::try_from(manifest.entries.len()).map_err(|_| ErrorCode::InvalidManifest)?;
    let mut encoded = Vec::from(SUMMARY_MANIFEST_MAGIC);
    encoded.extend_from_slice(&entry_count.to_be_bytes());
    let mut previous: Option<&str> = None;
    for entry in &manifest.entries {
        if entry.path.is_empty()
            || entry.path.as_bytes().contains(&0)
            || previous.is_some_and(|path| path >= entry.path.as_str())
        {
            return Err(ErrorCode::InvalidManifest);
        }
        previous = Some(&entry.path);
        let path = entry.path.as_bytes();
        let path_length = u32::try_from(path.len()).map_err(|_| ErrorCode::InvalidManifest)?;
        encoded.extend_from_slice(&path_length.to_be_bytes());
        encoded.extend_from_slice(path);
        encoded.extend_from_slice(entry.blob.as_bytes());
        if u64::try_from(encoded.len()).map_or(true, |length| length > MAX_MANIFEST_BYTES) {
            return Err(ErrorCode::ContentTooLarge);
        }
    }
    Ok(encoded)
}

/// Returns the embedded document identifier for a document-scoped request.
fn request_document(request: &Request) -> Option<&Bytes> {
    match request {
        Request::OpenSession { document, .. }
        | Request::Read { document, .. }
        | Request::ReadProjected { document, .. }
        | Request::SubscribeProjected { document, .. }
        | Request::OpenSubmissionStream { document }
        | Request::ResolveSubmission { document, .. }
        | Request::LatestSnapshot { document }
        | Request::PublishSnapshot { document, .. } => Some(document),
        Request::Submit(submission) => Some(&submission.document),
        Request::Create { .. }
        | Request::UploadBlob { .. }
        | Request::FetchBlob { .. }
        | Request::PublishSummary { .. }
        | Request::FetchSummary { .. }
        | Request::Shutdown => None,
    }
}

/// Open storage, sequencer, and notification state for one document.
struct Document {
    /// Backend-neutral access to the document log and snapshots.
    storage: ServiceStorage,
    /// Authoritative sequencer recovered from the document log.
    sequencer: AuthoritativeSequencer<ServiceStorage>,
    /// Best-effort wakeups for projected subscribers.
    projected_notifications: broadcast::Sender<()>,
}

impl Document {
    /// Creates a document scope and opens its empty state.
    async fn create(
        path: PathBuf,
        authority_path: PathBuf,
        storage_mode: StorageMode,
    ) -> Result<Self, ErrorCode> {
        if storage_mode == StorageMode::Memory {
            let scope = new_scope().map_err(|()| ErrorCode::Unavailable)?;
            return Self::open_with_scope(path, authority_path, scope, storage_mode).await;
        }
        fs::create_dir_all(&path).map_err(|_| ErrorCode::Unavailable)?;
        let scope = new_scope().map_err(|()| ErrorCode::Unavailable)?;
        let scope_path = path.join(SCOPE_FILE);
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(scope_path)
            .map_err(|_| ErrorCode::DocumentAlreadyExists)?;
        file.write_all(&scope).map_err(|_| ErrorCode::Unavailable)?;
        file.sync_all().map_err(|_| ErrorCode::Unavailable)?;
        Self::open_with_scope(path, authority_path, scope, storage_mode).await
    }

    /// Opens and validates an existing file-backed document scope.
    async fn open(
        path: PathBuf,
        authority_path: PathBuf,
        storage_mode: StorageMode,
    ) -> Result<Self, ErrorCode> {
        if storage_mode == StorageMode::Memory {
            return Err(ErrorCode::DocumentNotFound);
        }
        let mut scope = [0_u8; SCOPE_BYTES];
        let mut file = OpenOptions::new()
            .read(true)
            .open(path.join(SCOPE_FILE))
            .map_err(|_| ErrorCode::Corrupt)?;
        file.read_exact(&mut scope)
            .map_err(|_| ErrorCode::Corrupt)?;
        let mut trailing = [0_u8; 1];
        if file.read(&mut trailing).map_err(|_| ErrorCode::Corrupt)? != 0 {
            return Err(ErrorCode::Corrupt);
        }
        Self::open_with_scope(path, authority_path, scope, storage_mode).await
    }

    /// Opens storage and recovers sequencer state for a validated scope.
    async fn open_with_scope(
        path: PathBuf,
        authority_path: PathBuf,
        _scope: [u8; SCOPE_BYTES],
        storage_mode: StorageMode,
    ) -> Result<Self, ErrorCode> {
        if storage_mode == StorageMode::DurableFile
            && let Some(parent) = authority_path.parent()
        {
            fs::create_dir_all(parent).map_err(|_| ErrorCode::Unavailable)?;
        }
        let log =
            ServiceLog::open(storage_mode, path).map_err(|error| map_storage_error(&error))?;
        let storage = ServiceStorage { log };
        let fenced = if storage_mode == StorageMode::DurableFile {
            FencedStream::with_deployment_authority(storage.clone(), authority_path)
                .map_err(|_| ErrorCode::Unavailable)?
        } else {
            FencedStream::new(storage.clone())
        };
        let fence = fenced
            .try_issue_fence()
            .map_err(|_| ErrorCode::Unavailable)?;
        let sequencer = AuthoritativeSequencer::recover(fenced, fence)
            .await
            .map_err(map_sequencer_error)?;
        let (projected_notifications, _) = broadcast::channel(PROJECTED_SUBSCRIPTION_NOTIFICATIONS);
        Ok(Self {
            storage,
            sequencer,
            projected_notifications,
        })
    }

    /// Dispatches one request already routed to this document.
    async fn handle(&mut self, request: Request) -> Result<Response, ErrorCode> {
        match request {
            Request::OpenSession {
                writer,
                session,
                reference,
                ..
            } => self.open_session(writer, session, reference).await,
            Request::Submit(submission) => self.submit(submission).await,
            Request::Read { after, .. } => self.read(after).await,
            Request::ReadProjected { after, .. } => self.read_projected(after),
            Request::ResolveSubmission {
                writer,
                session,
                submission,
                ..
            } => self.resolve_submission(writer, session, submission).await,
            Request::LatestSnapshot { .. } => self.latest_snapshot().await,
            Request::PublishSnapshot {
                includes_through,
                expected_parent,
                payload,
                ..
            } => {
                self.publish_snapshot(includes_through, expected_parent, payload)
                    .await
            }
            Request::Create { .. }
            | Request::SubscribeProjected { .. }
            | Request::OpenSubmissionStream { .. }
            | Request::UploadBlob { .. }
            | Request::FetchBlob { .. }
            | Request::PublishSummary { .. }
            | Request::FetchSummary { .. }
            | Request::Shutdown => Err(ErrorCode::InvalidRequest),
        }
    }

    /// Validates and appends one writer session start.
    async fn open_session(
        &mut self,
        writer: Bytes,
        session: Bytes,
        reference: Reference,
    ) -> Result<Response, ErrorCode> {
        self.sequencer
            .connect(
                WriterId::new(writer).map_err(|_| ErrorCode::InvalidRequest)?,
                SessionId::new(session).map_err(|_| ErrorCode::InvalidRequest)?,
                protocol_reference(reference)?,
            )
            .await
            .map_err(map_sequencer_error)?;
        Ok(Response::Acknowledged(Acknowledgement::SessionOpened))
    }

    /// Validates, sequences, and announces one operation submission.
    async fn submit(
        &mut self,
        submission: fluid_service_protocol::Submission,
    ) -> Result<Response, ErrorCode> {
        let outcome = self
            .sequencer
            .submit(SequencerSubmission {
                writer_id: WriterId::new(submission.writer)
                    .map_err(|_| ErrorCode::InvalidRequest)?,
                session_id: SessionId::new(submission.session)
                    .map_err(|_| ErrorCode::InvalidRequest)?,
                submission_id: SubmissionId::new(submission.submission)
                    .map_err(|_| ErrorCode::InvalidRequest)?,
                local_sequence_number: submission.local_sequence_number,
                reference_position: protocol_reference(submission.reference)?,
                payload: submission.payload,
            })
            .await
            .map_err(map_sequencer_error)?;
        let (disposition, message) = match outcome {
            SubmitOutcome::Accepted(message) => (SubmissionDisposition::Accepted, message),
            SubmitOutcome::Duplicate(message) => (SubmissionDisposition::Duplicate, message),
        };
        if disposition == SubmissionDisposition::Accepted {
            let _ = self.projected_notifications.send(());
        }
        Ok(submitted_response(disposition, message))
    }

    /// Reads a bounded page of opaque canonical records.
    async fn read(&self, after: Option<Bytes>) -> Result<Response, ErrorCode> {
        let after = match after {
            Some(token) => Some(self.storage.decode_position(&token).await?),
            None => None,
        };
        let mut reader = self
            .storage
            .log
            .read(after.as_ref())
            .await
            .map_err(|error| map_storage_error(&error))?;
        let mut records = Vec::new();
        let mut payload_bytes = 0_usize;
        while let Some(record) = reader.next().await {
            let record = record.map_err(|error| map_storage_error(&error))?;
            let next_payload_bytes = payload_bytes.saturating_add(record.payload.len());
            if !records.is_empty()
                && (records.len() == MAX_READ_RECORDS
                    || next_payload_bytes > MAX_READ_PAYLOAD_BYTES)
            {
                break;
            }
            payload_bytes = next_payload_bytes;
            records.push(CommittedRecord {
                position: record.position.encode(),
                payload: record.payload,
            });
        }
        Ok(Response::Read { records })
    }

    /// Reads a bounded page of accepted operations after a canonical cursor.
    fn read_projected(&self, after: Option<Bytes>) -> Result<Response, ErrorCode> {
        let after = after
            .map(PositionToken::new)
            .transpose()
            .map_err(|_| ErrorCode::InvalidPosition)?;
        let page = self
            .sequencer
            .read_projected(
                after.as_ref(),
                MAX_PROJECTED_CANONICAL_RECORDS,
                MAX_PROJECTED_ENCODED_BYTES,
            )
            .map_err(map_sequencer_error)?;
        Ok(Response::ProjectedRead {
            operations: page
                .operations
                .into_iter()
                .map(protocol_operation)
                .collect(),
            cursor: page.cursor.map(|position| position.as_bytes().clone()),
            has_more: page.has_more,
        })
    }

    /// Resolves a stable submission identity without appending.
    async fn resolve_submission(
        &mut self,
        writer: Bytes,
        session: Bytes,
        submission: Bytes,
    ) -> Result<Response, ErrorCode> {
        let writer = WriterId::new(writer).map_err(|_| ErrorCode::InvalidRequest)?;
        let session = SessionId::new(session).map_err(|_| ErrorCode::InvalidRequest)?;
        let submission = SubmissionId::new(submission).map_err(|_| ErrorCode::InvalidRequest)?;
        let resolution = match self
            .sequencer
            .resolve_submission(&writer, &session, &submission)
            .await
        {
            Ok(ResolutionOutcome::Committed(message)) => Resolution::Committed {
                position: message.stream_position.as_bytes().clone(),
                sequence_number: message.sequence_number,
                minimum_reference: protocol_reference_position(message.minimum_reference_position),
            },
            Ok(ResolutionOutcome::NotCommitted) => Resolution::NotCommitted,
            Err(SequencerError::Storage(error))
                if matches!(error.kind(), ErrorKind::Ambiguous | ErrorKind::Unavailable) =>
            {
                Resolution::StillUncertain
            }
            Err(SequencerError::FenceLost) => Resolution::StillUncertain,
            Err(error) => return Err(map_sequencer_error(error)),
        };
        Ok(Response::Resolved(resolution))
    }

    /// Fetches and converts the latest published snapshot.
    async fn latest_snapshot(&self) -> Result<Response, ErrorCode> {
        let latest = self
            .storage
            .log
            .latest()
            .await
            .map_err(|error| map_storage_error(&error))?;
        Ok(Response::Snapshot(latest.map(Self::protocol_snapshot)))
    }

    /// Validates protocol tokens and publishes a snapshot.
    async fn publish_snapshot(
        &self,
        includes_through: Reference,
        expected_parent: Option<Bytes>,
        payload: Bytes,
    ) -> Result<Response, ErrorCode> {
        let includes_through = match includes_through {
            Reference::Initial => SnapshotPosition::Initial,
            Reference::At(token) => {
                SnapshotPosition::At(self.storage.decode_position(&token).await?)
            }
        };
        let expected_parent = expected_parent.map(SnapshotId::from_bytes);
        self.storage
            .log
            .publish(
                Snapshot {
                    includes_through,
                    payload,
                },
                expected_parent.as_ref(),
            )
            .await
            .map_err(|error| map_storage_error(&error))?;
        Ok(Response::Acknowledged(Acknowledgement::SnapshotPublished))
    }

    /// Converts a storage snapshot into its protocol representation.
    fn protocol_snapshot(snapshot: PublishedSnapshot<EventPosition>) -> ProtocolSnapshot {
        ProtocolSnapshot {
            id: snapshot.id.as_bytes().clone(),
            includes_through: match snapshot.snapshot.includes_through {
                SnapshotPosition::Initial => Reference::Initial,
                SnapshotPosition::At(position) => Reference::At(position.encode()),
            },
            payload: snapshot.snapshot.payload,
        }
    }
}

/// Backend-neutral one-based canonical event ordinal.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct EventPosition(u64);

impl EventPosition {
    /// Encodes this ordinal as an eight-byte big-endian token.
    fn encode(self) -> Bytes {
        Bytes::copy_from_slice(&self.0.to_be_bytes())
    }
}

/// Classified failures from the selected document log backend.
#[derive(Debug)]
enum ServiceLogError {
    /// In-memory backend failure.
    Memory(MemoryError),
    /// Buffered file backend failure.
    Buffered(FileError),
    /// Durable-log backend failure.
    Durable(DurableLogError),
    /// A neutral position was paired with a different backend.
    WrongPositionMode,
}

impl fmt::Display for ServiceLogError {
    /// Formats the selected backend failure without losing its source.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Memory(error) => write!(formatter, "memory log failed: {error}"),
            Self::Buffered(error) => write!(formatter, "buffered log failed: {error}"),
            Self::Durable(error) => write!(formatter, "durable log failed: {error}"),
            Self::WrongPositionMode => {
                formatter.write_str("position belongs to another storage mode")
            }
        }
    }
}

impl Error for ServiceLogError {
    /// Returns the underlying backend error when one exists.
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Memory(error) => Some(error),
            Self::Buffered(error) => Some(error),
            Self::Durable(error) => Some(error),
            Self::WrongPositionMode => None,
        }
    }
}

impl ClassifiedError for ServiceLogError {
    /// Preserves the selected backend's stable error classification.
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Memory(error) => error.kind(),
            Self::Buffered(error) => error.kind(),
            Self::Durable(error) => error.kind(),
            Self::WrongPositionMode => ErrorKind::InvalidPosition,
        }
    }
}

/// Runtime-selected append and snapshot backend.
#[derive(Clone, Debug)]
enum ServiceLog {
    /// Process-local append and snapshot backend.
    Memory(MemoryStream),
    /// Buffered file append and snapshot backend.
    Buffered(FileStream),
    /// Durable append and snapshot backend.
    Durable(DurableLog),
}

impl ServiceLog {
    /// Opens the backend selected by `storage_mode`.
    fn open(storage_mode: StorageMode, path: PathBuf) -> Result<Self, ServiceLogError> {
        match storage_mode {
            StorageMode::Memory => Ok(Self::Memory(MemoryStream::new())),
            StorageMode::BufferedFile => FileStream::open(path)
                .map(Self::Buffered)
                .map_err(ServiceLogError::Buffered),
            StorageMode::DurableFile => DurableLog::open(path)
                .map(Self::Durable)
                .map_err(ServiceLogError::Durable),
        }
    }

    /// Resolves a neutral ordinal to the selected backend's position type.
    async fn position_at(
        &self,
        position: EventPosition,
    ) -> Result<BackendPosition, ServiceLogError> {
        match self {
            Self::Memory(log) => log
                .position_at(position.0)
                .await
                .map(BackendPosition::Memory)
                .map_err(ServiceLogError::Memory),
            Self::Buffered(log) => log
                .position_at(position.0)
                .map(BackendPosition::Buffered)
                .map_err(ServiceLogError::Buffered),
            Self::Durable(log) => log
                .position_at(position.0)
                .map(BackendPosition::Durable)
                .map_err(ServiceLogError::Durable),
        }
    }
}

/// Position value paired with its originating backend.
enum BackendPosition {
    /// Position owned by the in-memory backend.
    Memory(snapshotted_stream_memory::MemoryPosition),
    /// Position owned by the buffered file backend.
    Buffered(snapshotted_stream_file_simple::FilePosition),
    /// Position owned by the durable-log backend.
    Durable(snapshotted_stream_durable_log_spike::DurablePosition),
}

#[async_trait]
impl AppendStream for ServiceLog {
    /// Neutral position type exposed by the service.
    type Position = EventPosition;
    /// Error wrapper preserving backend classifications.
    type Error = ServiceLogError;

    /// Returns the capabilities of the selected backend.
    fn capabilities(&self) -> snapshotted_stream_core::Capabilities {
        match self {
            Self::Memory(log) => log.capabilities(),
            Self::Buffered(log) => log.capabilities(),
            Self::Durable(log) => log.capabilities(),
        }
    }

    /// Appends through the selected backend and normalizes its position.
    async fn append(&self, value: Bytes) -> Result<AppendReceipt<Self::Position>, Self::Error> {
        match self {
            Self::Memory(log) => log
                .append(value)
                .await
                .map(|receipt| AppendReceipt {
                    position: EventPosition(receipt.position.ordinal()),
                    durability: receipt.durability,
                })
                .map_err(ServiceLogError::Memory),
            Self::Buffered(log) => log
                .append(value)
                .await
                .map(|receipt| AppendReceipt {
                    position: EventPosition(receipt.position.ordinal()),
                    durability: receipt.durability,
                })
                .map_err(ServiceLogError::Buffered),
            Self::Durable(log) => log
                .append(value)
                .await
                .map(|receipt| AppendReceipt {
                    position: EventPosition(receipt.position.ordinal()),
                    durability: receipt.durability,
                })
                .map_err(ServiceLogError::Durable),
        }
    }

    /// Reads through the selected backend and normalizes returned positions.
    async fn read(
        &self,
        after: Option<&Self::Position>,
    ) -> Result<snapshotted_stream_core::StreamReader<Self::Position, Self::Error>, Self::Error>
    {
        let after = match after {
            Some(position) => Some(self.position_at(*position).await?),
            None => None,
        };
        match (self, after.as_ref()) {
            (Self::Memory(log), None | Some(BackendPosition::Memory(_))) => {
                let after = after.as_ref().map(|position| match position {
                    BackendPosition::Memory(position) => position,
                    _ => unreachable!(),
                });
                let reader = log.read(after).await.map_err(ServiceLogError::Memory)?;
                Ok(Box::pin(reader.map(|record| {
                    record
                        .map(|record| ReadRecord {
                            position: EventPosition(record.position.ordinal()),
                            payload: record.payload,
                        })
                        .map_err(ServiceLogError::Memory)
                })))
            }
            (Self::Buffered(log), None | Some(BackendPosition::Buffered(_))) => {
                let after = after.as_ref().map(|position| match position {
                    BackendPosition::Buffered(position) => position,
                    _ => unreachable!(),
                });
                let reader = log.read(after).await.map_err(ServiceLogError::Buffered)?;
                Ok(Box::pin(reader.map(|record| {
                    record
                        .map(|record| ReadRecord {
                            position: EventPosition(record.position.ordinal()),
                            payload: record.payload,
                        })
                        .map_err(ServiceLogError::Buffered)
                })))
            }
            (Self::Durable(log), None | Some(BackendPosition::Durable(_))) => {
                let after = after.as_ref().map(|position| match position {
                    BackendPosition::Durable(position) => position,
                    _ => unreachable!(),
                });
                let reader = log.read(after).await.map_err(ServiceLogError::Durable)?;
                Ok(Box::pin(reader.map(|record| {
                    record
                        .map(|record| ReadRecord {
                            position: EventPosition(record.position.ordinal()),
                            payload: record.payload,
                        })
                        .map_err(ServiceLogError::Durable)
                })))
            }
            _ => Err(ServiceLogError::WrongPositionMode),
        }
    }

    /// Returns the selected backend's head as a neutral ordinal.
    async fn head(&self) -> Result<Option<Self::Position>, Self::Error> {
        match self {
            Self::Memory(log) => log
                .head()
                .await
                .map(|position| position.map(|position| EventPosition(position.ordinal())))
                .map_err(ServiceLogError::Memory),
            Self::Buffered(log) => log
                .head()
                .await
                .map(|position| position.map(|position| EventPosition(position.ordinal())))
                .map_err(ServiceLogError::Buffered),
            Self::Durable(log) => log
                .head()
                .await
                .map(|position| position.map(|position| EventPosition(position.ordinal())))
                .map_err(ServiceLogError::Durable),
        }
    }
}

#[async_trait]
impl SnapshotStore for ServiceLog {
    /// Neutral position type exposed by service snapshots.
    type Position = EventPosition;
    /// Error wrapper preserving backend classifications.
    type Error = ServiceLogError;

    /// Fetches the selected backend's latest snapshot and normalizes its position.
    async fn latest(&self) -> Result<Option<PublishedSnapshot<Self::Position>>, Self::Error> {
        match self {
            Self::Memory(log) => log
                .latest()
                .await
                .map(|snapshot| {
                    snapshot.map(|snapshot| PublishedSnapshot {
                        id: snapshot.id,
                        snapshot: Snapshot {
                            includes_through: map_snapshot_position(
                                snapshot.snapshot.includes_through,
                                |position| EventPosition(position.ordinal()),
                            ),
                            payload: snapshot.snapshot.payload,
                        },
                    })
                })
                .map_err(ServiceLogError::Memory),
            Self::Buffered(log) => log
                .latest()
                .await
                .map(|snapshot| {
                    snapshot.map(|snapshot| PublishedSnapshot {
                        id: snapshot.id,
                        snapshot: Snapshot {
                            includes_through: map_snapshot_position(
                                snapshot.snapshot.includes_through,
                                |position| EventPosition(position.ordinal()),
                            ),
                            payload: snapshot.snapshot.payload,
                        },
                    })
                })
                .map_err(ServiceLogError::Buffered),
            Self::Durable(log) => log
                .latest()
                .await
                .map(|snapshot| {
                    snapshot.map(|snapshot| PublishedSnapshot {
                        id: snapshot.id,
                        snapshot: Snapshot {
                            includes_through: map_snapshot_position(
                                snapshot.snapshot.includes_through,
                                |position| EventPosition(position.ordinal()),
                            ),
                            payload: snapshot.snapshot.payload,
                        },
                    })
                })
                .map_err(ServiceLogError::Durable),
        }
    }

    /// Converts neutral positions and publishes through the selected backend.
    async fn publish(
        &self,
        snapshot: Snapshot<Self::Position>,
        expected_parent: Option<&SnapshotId>,
    ) -> Result<SnapshotId, Self::Error> {
        let includes_through = match snapshot.includes_through {
            SnapshotPosition::Initial => None,
            SnapshotPosition::At(position) => Some(self.position_at(position).await?),
        };
        match (self, includes_through) {
            (Self::Memory(log), None) => log
                .publish(
                    Snapshot {
                        includes_through: SnapshotPosition::Initial,
                        payload: snapshot.payload,
                    },
                    expected_parent,
                )
                .await
                .map_err(ServiceLogError::Memory),
            (Self::Memory(log), Some(BackendPosition::Memory(position))) => log
                .publish(
                    Snapshot {
                        includes_through: SnapshotPosition::At(position),
                        payload: snapshot.payload,
                    },
                    expected_parent,
                )
                .await
                .map_err(ServiceLogError::Memory),
            (Self::Buffered(log), None) => log
                .publish(
                    Snapshot {
                        includes_through: SnapshotPosition::Initial,
                        payload: snapshot.payload,
                    },
                    expected_parent,
                )
                .await
                .map_err(ServiceLogError::Buffered),
            (Self::Buffered(log), Some(BackendPosition::Buffered(position))) => log
                .publish(
                    Snapshot {
                        includes_through: SnapshotPosition::At(position),
                        payload: snapshot.payload,
                    },
                    expected_parent,
                )
                .await
                .map_err(ServiceLogError::Buffered),
            (Self::Durable(log), None) => log
                .publish(
                    Snapshot {
                        includes_through: SnapshotPosition::Initial,
                        payload: snapshot.payload,
                    },
                    expected_parent,
                )
                .await
                .map_err(ServiceLogError::Durable),
            (Self::Durable(log), Some(BackendPosition::Durable(position))) => log
                .publish(
                    Snapshot {
                        includes_through: SnapshotPosition::At(position),
                        payload: snapshot.payload,
                    },
                    expected_parent,
                )
                .await
                .map_err(ServiceLogError::Durable),
            _ => Err(ServiceLogError::WrongPositionMode),
        }
    }
}

/// Maps the positioned case while preserving an initial snapshot position.
fn map_snapshot_position<P>(
    position: SnapshotPosition<P>,
    map: impl FnOnce(P) -> EventPosition,
) -> SnapshotPosition<EventPosition> {
    match position {
        SnapshotPosition::Initial => SnapshotPosition::Initial,
        SnapshotPosition::At(position) => SnapshotPosition::At(map(position)),
    }
}

/// Sequencer adapter over the runtime-selected document log.
#[derive(Clone)]
struct ServiceStorage {
    /// Runtime-selected document log.
    log: ServiceLog,
}

impl ServiceStorage {
    /// Reads all canonical records for sequencer replay.
    async fn read_all(&self) -> Result<Vec<ReadRecord<EventPosition>>, ServiceLogError> {
        let mut reader = self.log.read(None).await?;
        let mut records = Vec::new();
        while let Some(record) = reader.next().await {
            records.push(record?);
        }
        Ok(records)
    }

    /// Validates and resolves an opaque protocol position token.
    async fn decode_position(&self, token: &[u8]) -> Result<EventPosition, ErrorCode> {
        if token.len() != TOKEN_BYTES {
            return Err(ErrorCode::InvalidPosition);
        }
        let ordinal = u64::from_be_bytes(token.try_into().map_err(|_| ErrorCode::InvalidPosition)?);
        let position = EventPosition(ordinal);
        self.log
            .position_at(position)
            .await
            .map_err(|error| map_storage_error(&error))?;
        Ok(position)
    }
}

impl SequencerStorage for ServiceStorage {
    /// Backend-neutral canonical position type.
    type Position = EventPosition;
    /// Selected backend's classified error wrapper.
    type Error = ServiceLogError;

    /// Appends one canonical sequencer entry.
    async fn append(&self, value: Bytes) -> Result<AppendReceipt<Self::Position>, Self::Error> {
        self.log.append(value).await
    }

    /// Returns all canonical records for sequencer replay.
    fn read_all(
        &self,
    ) -> impl Future<Output = Result<Vec<ReadRecord<Self::Position>>, Self::Error>> + Send {
        self.read_all()
    }

    /// Encodes a neutral canonical position for protocol transport.
    fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error> {
        Ok(position.encode())
    }
}

/// Validates and converts a protocol reference for the sequencer.
fn protocol_reference(reference: Reference) -> Result<SnapshotPosition<PositionToken>, ErrorCode> {
    match reference {
        Reference::Initial => Ok(SnapshotPosition::Initial),
        Reference::At(token) => Ok(SnapshotPosition::At(
            PositionToken::new(token).map_err(|_| ErrorCode::InvalidPosition)?,
        )),
    }
}

/// Converts sequencer acceptance metadata into a protocol response.
fn submitted_response(disposition: SubmissionDisposition, message: SequencedMessage) -> Response {
    Response::Submitted {
        disposition,
        position: message.stream_position.as_bytes().clone(),
        sequence_number: message.sequence_number,
        minimum_reference: protocol_reference_position(message.minimum_reference_position),
    }
}

/// Converts a sequencer projection into its protocol representation.
fn protocol_operation(operation: SequencerOperation) -> ProjectedOperation {
    ProjectedOperation {
        position: operation.stream_position.as_bytes().clone(),
        sequence_number: operation.sequence_number,
        minimum_reference: protocol_reference_position(operation.minimum_reference_position),
        writer: operation.writer_id.as_bytes().clone(),
        session: operation.session_id.as_bytes().clone(),
        submission: operation.submission_id.as_bytes().clone(),
        local_sequence_number: operation.local_sequence_number,
        reference: protocol_reference_position(operation.reference_position),
        payload: operation.payload,
    }
}

/// Converts a sequencer reference into its protocol representation.
fn protocol_reference_position(reference: SnapshotPosition<PositionToken>) -> Reference {
    match reference {
        SnapshotPosition::Initial => Reference::Initial,
        SnapshotPosition::At(position) => Reference::At(position.as_bytes().clone()),
    }
}

/// Maps sequencer and storage failures to stable protocol classifications.
fn map_sequencer_error(error: SequencerError<ServiceLogError>) -> ErrorCode {
    match error {
        SequencerError::Rejected(rejection) | SequencerError::InvalidCommittedEntry(rejection) => {
            map_rejection(&rejection)
        }
        SequencerError::InvalidPosition => ErrorCode::InvalidPosition,
        SequencerError::InvalidPageLimit => ErrorCode::InvalidRequest,
        SequencerError::FenceLost => ErrorCode::FenceLost,
        SequencerError::Authority(_) => ErrorCode::Unavailable,
        SequencerError::Storage(error) => map_storage_error(&error),
        SequencerError::StorageAmbiguous(_) => ErrorCode::Ambiguous,
        SequencerError::RecoveryRequired => ErrorCode::RecoveryRequired,
        SequencerError::CorruptLog(_) => ErrorCode::Corrupt,
    }
}

/// Maps each sequencer rejection to its dedicated protocol code.
fn map_rejection(rejection: &Rejection) -> ErrorCode {
    match rejection {
        Rejection::SessionAlreadyUsed => ErrorCode::SessionAlreadyUsed,
        Rejection::UnknownWriter => ErrorCode::UnknownWriter,
        Rejection::StaleSession => ErrorCode::StaleSession,
        Rejection::DuplicateLocalSequence { .. } => ErrorCode::DuplicateLocalSequence,
        Rejection::LocalSequenceGap { .. } => ErrorCode::LocalSequenceGap,
        Rejection::UnknownReferencePosition => ErrorCode::UnknownReferencePosition,
        Rejection::StaleReferencePosition => ErrorCode::StaleReferencePosition,
        Rejection::SubmissionIdentityConflict => ErrorCode::SubmissionIdentityConflict,
    }
}

/// Maps a classified log failure to its protocol code.
fn map_storage_error(error: &ServiceLogError) -> ErrorCode {
    match error.kind() {
        ErrorKind::InvalidPosition => ErrorCode::InvalidPosition,
        ErrorKind::StalePosition => ErrorCode::StalePosition,
        ErrorKind::Conflict => ErrorCode::Conflict,
        ErrorKind::Rejected => ErrorCode::Rejected,
        ErrorKind::Ambiguous => ErrorCode::Ambiguous,
        ErrorKind::Unavailable => ErrorCode::Unavailable,
        ErrorKind::Corrupt => ErrorCode::Corrupt,
    }
}

/// Maps content-store failures to stable protocol classifications.
fn map_content_error(error: &StoreError) -> ErrorCode {
    match error {
        StoreError::InvalidDigest => ErrorCode::InvalidDigest,
        StoreError::InvalidManifest(_) => ErrorCode::InvalidManifest,
        StoreError::BlobTooLarge { .. } | StoreError::ManifestTooLarge { .. } => {
            ErrorCode::ContentTooLarge
        }
        StoreError::MissingBlob(_) => ErrorCode::BlobNotFound,
        StoreError::MissingSummary(_) => ErrorCode::SummaryNotFound,
        StoreError::CorruptBlob { .. } | StoreError::CorruptSummary { .. } => ErrorCode::Corrupt,
        StoreError::Ambiguous(_) => ErrorCode::Ambiguous,
        StoreError::Io(_)
        | StoreError::InvalidConfig(_)
        | StoreError::Injected(_)
        | StoreError::Poisoned => ErrorCode::Unavailable,
    }
}

#[cfg(not(target_arch = "wasm32"))]
/// Generates a process-and-time-derived document scope on native targets.
fn new_scope() -> Result<[u8; SCOPE_BYTES], ()> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| ())?
        .as_nanos();
    Ok((timestamp ^ (u128::from(std::process::id()) << 64)).to_be_bytes())
}

#[cfg(target_arch = "wasm32")]
/// Generates a process-local monotonically unique document scope on WASM.
fn new_scope() -> Result<[u8; SCOPE_BYTES], ()> {
    static NEXT_SCOPE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    let scope = NEXT_SCOPE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    Ok(u128::from(scope).to_be_bytes())
}

/// Encodes arbitrary identifier bytes as a filesystem-safe lowercase path segment.
fn hex(value: &[u8]) -> String {
    /// Lowercase hexadecimal alphabet used for document paths.
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(value.len() * 2);
    for byte in value {
        encoded.push(char::from(DIGITS[usize::from(byte >> 4)]));
        encoded.push(char::from(DIGITS[usize::from(byte & 0x0f)]));
    }
    encoded
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use fluid_service_protocol::{Request, Submission};

    use super::*;

    #[test]
    fn service_config_defaults_to_durable_storage() {
        let config = ServiceConfig::new("service-data");
        assert_eq!(config.storage_mode, StorageMode::DurableFile);
        assert_eq!(
            config.with_storage_mode(StorageMode::Memory).storage_mode,
            StorageMode::Memory
        );
        assert_eq!(StorageMode::from_name("memory"), Some(StorageMode::Memory));
        assert_eq!(
            StorageMode::from_name("buffered-file"),
            Some(StorageMode::BufferedFile)
        );
        assert_eq!(
            StorageMode::from_name("durable-file"),
            Some(StorageMode::DurableFile)
        );
        assert_eq!(StorageMode::from_name("unknown"), None);
    }

    #[tokio::test]
    async fn storage_modes_create_submit_and_project() {
        for storage_mode in [
            StorageMode::Memory,
            StorageMode::BufferedFile,
            StorageMode::DurableFile,
        ] {
            let directory = TempDirectory::new();
            let service = NativeService::new(
                ServiceConfig::new(&directory.0).with_storage_mode(storage_mode),
            );
            create_and_open(&service, b"document", b"session").await;
            assert!(matches!(
                service.handle(submit(b"document", b"session", 1)).await,
                Response::Submitted {
                    sequence_number: 1,
                    ..
                }
            ));
            assert!(matches!(
                service
                    .handle(Request::ReadProjected {
                        document: bytes(b"document"),
                        after: None,
                    })
                    .await,
                Response::ProjectedRead {
                    operations,
                    has_more: false,
                    ..
                } if operations.len() == 1 && operations[0].payload == bytes(b"payload-1")
            ));
        }
    }

    static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(1);

    struct TempDirectory(PathBuf);

    impl TempDirectory {
        fn new() -> Self {
            let value = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "fluid-native-service-{}-{value}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDirectory {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    fn bytes(value: &'static [u8]) -> Bytes {
        Bytes::from_static(value)
    }

    fn submit(document: &'static [u8], session: &'static [u8], sequence: u64) -> Request {
        Request::Submit(Submission {
            document: bytes(document),
            writer: bytes(b"writer"),
            session: bytes(session),
            submission: Bytes::from(format!("submission-{session:?}-{sequence}")),
            local_sequence_number: sequence,
            reference: Reference::Initial,
            payload: Bytes::from(format!("payload-{sequence}")),
        })
    }

    async fn create_and_open(
        service: &NativeService,
        document: &'static [u8],
        session: &'static [u8],
    ) {
        assert_eq!(
            service
                .handle(Request::Create {
                    document: bytes(document)
                })
                .await,
            Response::Acknowledged(Acknowledgement::Created)
        );
        assert_eq!(
            service
                .handle(Request::OpenSession {
                    document: bytes(document),
                    writer: bytes(b"writer"),
                    session: bytes(session),
                    reference: Reference::Initial
                })
                .await,
            Response::Acknowledged(Acknowledgement::SessionOpened)
        );
    }

    #[tokio::test]
    async fn creates_and_reads_two_isolated_documents() {
        let directory = TempDirectory::new();
        let service = NativeService::new(ServiceConfig::new(&directory.0));
        create_and_open(&service, b"one", b"session-one").await;
        create_and_open(&service, b"two", b"session-two").await;
        let expected_position = Bytes::copy_from_slice(&2_u64.to_be_bytes());
        for (document, session) in [
            (b"one".as_slice(), b"session-one".as_slice()),
            (b"two".as_slice(), b"session-two".as_slice()),
        ] {
            assert!(matches!(
                service.handle(submit(document, session, 1)).await,
                Response::Submitted {
                    position,
                    sequence_number: 1,
                    ..
                } if position == expected_position
            ));
        }
        for document in [b"one".as_slice(), b"two".as_slice()] {
            assert!(
                matches!(service.handle(Request::Read { document: Bytes::copy_from_slice(document), after: None }).await, Response::Read { records } if records.len() == 2 && records[0].position == Bytes::copy_from_slice(&1_u64.to_be_bytes()) && records[1].position == expected_position)
            );
        }
    }

    #[tokio::test]
    async fn rejects_invalid_and_stale_sessions_before_append() {
        let directory = TempDirectory::new();
        let service = NativeService::new(ServiceConfig::new(&directory.0));
        create_and_open(&service, b"doc", b"session-one").await;
        assert_eq!(
            service.handle(submit(b"doc", b"unknown", 1)).await,
            Response::Error(ErrorCode::StaleSession)
        );
        assert_eq!(
            service
                .handle(Request::OpenSession {
                    document: bytes(b"doc"),
                    writer: bytes(b"writer"),
                    session: bytes(b"session-two"),
                    reference: Reference::Initial
                })
                .await,
            Response::Acknowledged(Acknowledgement::SessionOpened)
        );
        assert_eq!(
            service.handle(submit(b"doc", b"session-one", 1)).await,
            Response::Error(ErrorCode::StaleSession)
        );
        assert!(
            matches!(service.handle(Request::Read { document: bytes(b"doc"), after: None }).await, Response::Read { records } if records.len() == 2)
        );
    }

    #[tokio::test]
    async fn snapshot_and_restart_recover() {
        let directory = TempDirectory::new();
        let service = NativeService::new(ServiceConfig::new(&directory.0));
        create_and_open(&service, b"doc", b"session-one").await;
        let position = match service.handle(submit(b"doc", b"session-one", 1)).await {
            Response::Submitted { position, .. } => position,
            response => panic!("unexpected response: {response:?}"),
        };
        assert_eq!(
            service
                .handle(Request::PublishSnapshot {
                    document: bytes(b"doc"),
                    includes_through: Reference::At(position.clone()),
                    expected_parent: None,
                    payload: bytes(b"snapshot")
                })
                .await,
            Response::Acknowledged(Acknowledgement::SnapshotPublished)
        );
        drop(service);
        let recovered = NativeService::new(ServiceConfig::new(&directory.0));
        assert!(
            matches!(recovered.handle(Request::LatestSnapshot { document: bytes(b"doc") }).await, Response::Snapshot(Some(snapshot)) if snapshot.payload == bytes(b"snapshot") && snapshot.includes_through == Reference::At(position))
        );
        assert_eq!(
            recovered
                .handle(Request::OpenSession {
                    document: bytes(b"doc"),
                    writer: bytes(b"writer"),
                    session: bytes(b"session-two"),
                    reference: Reference::Initial
                })
                .await,
            Response::Acknowledged(Acknowledgement::SessionOpened)
        );
        assert!(matches!(
            recovered.handle(submit(b"doc", b"session-two", 1)).await,
            Response::Submitted {
                sequence_number: 2,
                ..
            }
        ));
    }

    #[tokio::test]
    async fn second_service_fences_stale_owner() {
        let directory = TempDirectory::new();
        let first = NativeService::new(ServiceConfig::new(&directory.0));
        create_and_open(&first, b"doc", b"session-one").await;
        let second = NativeService::new(ServiceConfig::new(&directory.0));
        assert_eq!(
            second
                .handle(Request::OpenSession {
                    document: bytes(b"doc"),
                    writer: bytes(b"writer"),
                    session: bytes(b"session-two"),
                    reference: Reference::Initial
                })
                .await,
            Response::Acknowledged(Acknowledgement::SessionOpened)
        );
        assert_eq!(
            first.handle(submit(b"doc", b"session-one", 1)).await,
            Response::Error(ErrorCode::FenceLost)
        );
    }

    #[tokio::test]
    async fn malformed_and_foreign_tokens_are_rejected() {
        let directory = TempDirectory::new();
        let service = NativeService::new(ServiceConfig::new(&directory.0));
        create_and_open(&service, b"doc", b"session-one").await;
        assert_eq!(
            service
                .handle(Request::Read {
                    document: bytes(b"doc"),
                    after: Some(bytes(b"invalid"))
                })
                .await,
            Response::Error(ErrorCode::InvalidPosition)
        );
        assert_eq!(
            service
                .handle(Request::PublishSnapshot {
                    document: bytes(b"doc"),
                    includes_through: Reference::At(bytes(b"invalid")),
                    expected_parent: None,
                    payload: bytes(b"snapshot")
                })
                .await,
            Response::Error(ErrorCode::InvalidPosition)
        );
        assert_eq!(
            service
                .handle(Request::ReadProjected {
                    document: bytes(b"doc"),
                    after: Some(bytes(b"invalid"))
                })
                .await,
            Response::Error(ErrorCode::InvalidPosition)
        );
    }

    #[tokio::test]
    async fn projected_reads_filter_administration_and_resume_exactly() {
        let directory = TempDirectory::new();
        let service = NativeService::new(ServiceConfig::new(&directory.0));
        create_and_open(&service, b"doc", b"session-one").await;
        let administrative_page = service
            .handle(Request::ReadProjected {
                document: bytes(b"doc"),
                after: None,
            })
            .await;
        let Response::ProjectedRead {
            operations,
            cursor: Some(cursor),
            has_more: false,
        } = administrative_page
        else {
            panic!("unexpected administrative page: {administrative_page:?}");
        };
        assert!(operations.is_empty());

        assert!(matches!(
            service.handle(submit(b"doc", b"session-one", 1)).await,
            Response::Submitted {
                disposition: SubmissionDisposition::Accepted,
                ..
            }
        ));
        let projected = service
            .handle(Request::ReadProjected {
                document: bytes(b"doc"),
                after: Some(cursor),
            })
            .await;
        let Response::ProjectedRead {
            operations,
            cursor: Some(end_cursor),
            has_more: false,
        } = projected
        else {
            panic!("unexpected projected page: {projected:?}");
        };
        assert_eq!(operations.len(), 1);
        assert_eq!(operations[0].sequence_number, 1);
        assert_eq!(operations[0].payload, Bytes::from_static(b"payload-1"));
        assert!(matches!(
            service
                .handle(Request::ReadProjected {
                    document: bytes(b"doc"),
                    after: Some(end_cursor.clone()),
                })
                .await,
            Response::ProjectedRead {
                operations,
                cursor: Some(cursor),
                has_more: false,
            } if operations.is_empty() && cursor == end_cursor
        ));
    }

    #[tokio::test]
    async fn projected_subscription_atomically_catches_up_and_tails_across_boundary() {
        let directory = TempDirectory::new();
        let service = Arc::new(NativeService::new(ServiceConfig::new(&directory.0)));
        create_and_open(&service, b"doc", b"session-one").await;
        assert!(matches!(
            service.handle(submit(b"doc", b"session-one", 1)).await,
            Response::Submitted { .. }
        ));
        let Response::ProjectedRead {
            cursor: Some(after_a),
            ..
        } = service
            .handle(Request::ReadProjected {
                document: bytes(b"doc"),
                after: None,
            })
            .await
        else {
            panic!("projected read did not return a cursor after A");
        };

        let mut subscription = service
            .subscribe_projected(bytes(b"doc"), Some(after_a))
            .await
            .unwrap();
        assert!(matches!(
            service.handle(submit(b"doc", b"session-one", 2)).await,
            Response::Submitted { .. }
        ));
        let operation_b = subscription.next().await.unwrap();
        assert_eq!(operation_b.sequence_number, 2);
        assert_eq!(operation_b.payload, bytes(b"payload-2"));

        assert!(matches!(
            service.handle(submit(b"doc", b"session-one", 3)).await,
            Response::Submitted { .. }
        ));
        let operation_c = subscription.next().await.unwrap();
        assert_eq!(operation_c.sequence_number, 3);
        assert_eq!(operation_c.payload, bytes(b"payload-3"));
        assert_ne!(operation_b.position, operation_c.position);

        subscription.cancel();
        assert_eq!(
            subscription.next().await,
            Err(ProjectedSubscriptionError::Cancelled)
        );
    }

    #[tokio::test]
    async fn projected_subscription_recovers_from_lag_and_rejects_duplicate_and_gap() {
        let directory = TempDirectory::new();
        let service = Arc::new(NativeService::new(ServiceConfig::new(&directory.0)));
        create_and_open(&service, b"doc", b"session-one").await;
        let Response::ProjectedRead {
            cursor: Some(initial_cursor),
            ..
        } = service
            .handle(Request::ReadProjected {
                document: bytes(b"doc"),
                after: None,
            })
            .await
        else {
            panic!("initial projected cursor was missing");
        };
        let mut subscription = service
            .subscribe_projected(bytes(b"doc"), Some(initial_cursor))
            .await
            .unwrap();

        for sequence in 1..=8 {
            assert!(matches!(
                service
                    .handle(submit(b"doc", b"session-one", sequence))
                    .await,
                Response::Submitted {
                    disposition: SubmissionDisposition::Accepted,
                    ..
                }
            ));
        }
        assert!(matches!(
            service.handle(submit(b"doc", b"session-one", 8)).await,
            Response::Submitted {
                disposition: SubmissionDisposition::Duplicate,
                ..
            }
        ));
        assert_eq!(
            service.handle(submit(b"doc", b"session-one", 10)).await,
            Response::Error(ErrorCode::LocalSequenceGap)
        );

        assert_eq!(
            subscription.next_batch(0, usize::MAX).await,
            Err(ProjectedSubscriptionError::Service(
                ErrorCode::InvalidRequest
            ))
        );
        assert_eq!(
            subscription.next_batch(3, 8).await,
            Err(ProjectedSubscriptionError::Service(
                ErrorCode::InvalidRequest
            ))
        );
        let first_batch = subscription.next_batch(3, 18).await.unwrap();
        assert_eq!(
            first_batch
                .iter()
                .map(|operation| operation.sequence_number)
                .collect::<Vec<_>>(),
            [1, 2]
        );
        let second_batch = subscription.next_batch(1, usize::MAX).await.unwrap();
        assert_eq!(second_batch[0].sequence_number, 3);
        let mut sequences = vec![1, 2, 3];
        for _ in 3..8 {
            sequences.push(subscription.next().await.unwrap().sequence_number);
        }
        assert_eq!(sequences, (1..=8).collect::<Vec<_>>());
        let after_b = subscription.cursor().cloned().unwrap();
        subscription.cancel();

        let mut resumed = service
            .subscribe_projected(bytes(b"doc"), Some(after_b))
            .await
            .unwrap();
        assert!(matches!(
            service.handle(submit(b"doc", b"session-one", 9)).await,
            Response::Submitted {
                disposition: SubmissionDisposition::Accepted,
                ..
            }
        ));
        assert_eq!(resumed.next().await.unwrap().sequence_number, 9);
    }

    #[tokio::test]
    async fn projected_subscriptions_are_document_bound_and_validate_cursors() {
        let directory = TempDirectory::new();
        let service = Arc::new(NativeService::new(ServiceConfig::new(&directory.0)));
        create_and_open(&service, b"one", b"session-one").await;
        create_and_open(&service, b"two", b"session-two").await;
        let Response::ProjectedRead {
            cursor: Some(after_one),
            ..
        } = service
            .handle(Request::ReadProjected {
                document: bytes(b"one"),
                after: None,
            })
            .await
        else {
            panic!("document one did not return an initial cursor");
        };
        let mut subscription = service
            .subscribe_projected(bytes(b"one"), Some(after_one))
            .await
            .unwrap();

        assert!(matches!(
            service.handle(submit(b"two", b"session-two", 1)).await,
            Response::Submitted { .. }
        ));
        assert!(matches!(
            service.handle(submit(b"one", b"session-one", 1)).await,
            Response::Submitted { .. }
        ));
        let operation = subscription.next().await.unwrap();
        assert_eq!(operation.payload, bytes(b"payload-1"));
        assert_eq!(operation.session, bytes(b"session-one"));

        let future = Bytes::copy_from_slice(&100_u64.to_be_bytes());
        let mut invalid = service
            .subscribe_projected(bytes(b"one"), Some(future))
            .await
            .unwrap();
        assert_eq!(
            invalid.next().await,
            Err(ProjectedSubscriptionError::Service(
                ErrorCode::InvalidPosition
            ))
        );
    }

    #[tokio::test]
    async fn explicit_resolution_is_repeatable_restart_safe_and_append_free() {
        let directory = TempDirectory::new();
        let service = NativeService::new(ServiceConfig::new(&directory.0));
        create_and_open(&service, b"doc", b"session-one").await;
        let request = submit(b"doc", b"session-one", 1);
        assert!(matches!(
            service.handle(request.clone()).await,
            Response::Submitted {
                disposition: SubmissionDisposition::Accepted,
                ..
            }
        ));
        assert!(matches!(
            service.handle(request).await,
            Response::Submitted {
                disposition: SubmissionDisposition::Duplicate,
                ..
            }
        ));
        let resolve = Request::ResolveSubmission {
            document: bytes(b"doc"),
            writer: bytes(b"writer"),
            session: bytes(b"session-one"),
            submission: Bytes::from(format!("submission-{:?}-1", b"session-one")),
        };
        for _ in 0..2 {
            assert!(matches!(
                service.handle(resolve.clone()).await,
                Response::Resolved(Resolution::Committed {
                    sequence_number: 1,
                    ..
                })
            ));
        }
        assert_eq!(
            service
                .handle(Request::ResolveSubmission {
                    document: bytes(b"doc"),
                    writer: bytes(b"other"),
                    session: bytes(b"session-one"),
                    submission: bytes(b"unknown"),
                })
                .await,
            Response::Error(ErrorCode::UnknownWriter)
        );
        assert_eq!(
            service
                .handle(Request::ResolveSubmission {
                    document: bytes(b"doc"),
                    writer: bytes(b"writer"),
                    session: bytes(b"session-one"),
                    submission: bytes(b"not-committed"),
                })
                .await,
            Response::Resolved(Resolution::NotCommitted)
        );
        assert!(matches!(
            service
                .handle(Request::Read {
                    document: bytes(b"doc"),
                    after: None,
                })
                .await,
            Response::Read { records } if records.len() == 2
        ));

        drop(service);
        let restarted = NativeService::new(ServiceConfig::new(&directory.0));
        assert!(matches!(
            restarted.handle(resolve).await,
            Response::Resolved(Resolution::Committed {
                sequence_number: 1,
                ..
            })
        ));
        assert!(matches!(
            restarted
                .handle(Request::Read {
                    document: bytes(b"doc"),
                    after: None,
                })
                .await,
            Response::Read { records } if records.len() == 2
        ));
    }

    #[tokio::test]
    async fn blobs_and_summaries_round_trip_and_reopen() {
        let directory = TempDirectory::new();
        let service = NativeService::new(ServiceConfig::new(&directory.0));
        let upload = Request::UploadBlob {
            payload: bytes(b"blob payload"),
        };
        let Response::BlobUploaded {
            digest,
            size_bytes: 12,
            deduplicated: false,
        } = service.handle(upload.clone()).await
        else {
            panic!("initial upload failed");
        };
        assert!(matches!(
            service.handle(upload).await,
            Response::BlobUploaded {
                digest: duplicate,
                size_bytes: 12,
                deduplicated: true,
            } if duplicate == digest
        ));
        let summary_digest = match service
            .handle(Request::PublishSummary {
                entries: vec![fluid_service_protocol::SummaryEntry {
                    path: bytes(b"root/data"),
                    blob: digest.clone(),
                }],
            })
            .await
        {
            Response::SummaryPublished {
                digest,
                entry_count: 1,
                persisted_bytes: 57,
                deduplicated: false,
            } => digest,
            response => panic!("unexpected summary response: {response:?}"),
        };
        assert!(matches!(
            service
                .handle(Request::PublishSummary {
                    entries: vec![fluid_service_protocol::SummaryEntry {
                        path: bytes(b"root/data"),
                        blob: digest.clone(),
                    }],
                })
                .await,
            Response::SummaryPublished {
                digest,
                entry_count: 1,
                persisted_bytes: 57,
                deduplicated: true,
            } if digest == summary_digest
        ));
        assert_eq!(
            service
                .handle(Request::PublishSummary {
                    entries: vec![fluid_service_protocol::SummaryEntry {
                        path: bytes(b"missing"),
                        blob: Bytes::from_static(&[9; 32]),
                    }],
                })
                .await,
            Response::Error(ErrorCode::BlobNotFound)
        );
        drop(service);

        let reopened = NativeService::new(ServiceConfig::new(&directory.0));
        assert_eq!(
            reopened
                .handle(Request::FetchBlob {
                    digest: digest.clone(),
                })
                .await,
            Response::Blob {
                digest: digest.clone(),
                payload: bytes(b"blob payload"),
            }
        );
        assert!(matches!(
            reopened
                .handle(Request::FetchSummary {
                    digest: summary_digest,
                })
                .await,
            Response::Summary { entries, .. }
                if entries == vec![fluid_service_protocol::SummaryEntry {
                    path: bytes(b"root/data"),
                    blob: digest,
                }]
        ));
        assert_eq!(
            reopened
                .handle(Request::FetchBlob {
                    digest: bytes(b"short"),
                })
                .await,
            Response::Error(ErrorCode::InvalidDigest)
        );
    }

    #[tokio::test]
    async fn memory_content_matches_durable_identities() {
        let directory = TempDirectory::new();
        let durable = NativeService::new(ServiceConfig::new(&directory.0));
        let memory = NativeService::new(
            ServiceConfig::new(PathBuf::new()).with_storage_mode(StorageMode::Memory),
        );
        let upload = Request::UploadBlob {
            payload: bytes(b"blob payload"),
        };
        let durable_upload = durable.handle(upload.clone()).await;
        let memory_upload = memory.handle(upload).await;
        assert_eq!(memory_upload, durable_upload);
        let Response::BlobUploaded { digest, .. } = memory_upload else {
            panic!("memory upload failed");
        };
        let summary = Request::PublishSummary {
            entries: vec![fluid_service_protocol::SummaryEntry {
                path: bytes(b"root/data"),
                blob: digest.clone(),
            }],
        };
        let durable_summary = durable.handle(summary.clone()).await;
        let memory_summary = memory.handle(summary).await;
        assert_eq!(memory_summary, durable_summary);
        let Response::SummaryPublished {
            digest: summary_digest,
            ..
        } = memory_summary
        else {
            panic!("memory summary publication failed");
        };
        assert!(matches!(
            memory.handle(Request::FetchBlob { digest }).await,
            Response::Blob { payload, .. } if payload == bytes(b"blob payload")
        ));
        assert!(matches!(
            memory
                .handle(Request::FetchSummary {
                    digest: summary_digest,
                })
                .await,
            Response::Summary { entries, .. } if entries.len() == 1
        ));
    }
}
