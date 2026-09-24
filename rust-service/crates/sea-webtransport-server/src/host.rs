//! Runtime-selected final Sea session hosting.

use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Weak},
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{StreamExt as _, stream};
use rand_core::{OsRng, RngCore as _};
use sea_core::storage::{DocumentId, SeaStorage};
use sea_core::{EventPosition, archive::SessionId};
use sea_file::buffered::FileStorage;
use sea_file::durable::DurableStorage;
use sea_memory::MemoryStorage;
use sea_webtransport::protocol;
use tokio::{sync::Mutex, time::sleep};

use crate::{
    LivenessPolicy, SeaConnectionService, SeaResponseStream, SeaServiceHost, SessionDispatcher,
    dispatch::error_response,
};

/// Retained exclusive runtimes indexed by opaque document identity.
type DocumentRuntimes<Storage> =
    BTreeMap<Vec<u8>, Arc<sea_sequencer::session::LocalSequencer<Storage>>>;

/// Serializes lazy runtime recovery within one backend namespace.
struct DocumentRegistry<Storage: sea_core::storage::SeaStorage> {
    /// Enables experimental live delivery for recovered documents; `DocumentRegistry::new` disables it.
    live_cache: bool,
    /// Factory retaining the backend namespace independently of active views.
    storage: Arc<Storage>,
    /// Serializes first recovery; failed attempts are never cached.
    documents: Arc<Mutex<DocumentRuntimes<Storage>>>,
}

impl<Storage: sea_core::storage::SeaStorage + 'static> DocumentRegistry<Storage> {
    /// Creates an empty cache over one backend namespace.
    fn new(storage: Storage) -> Self {
        Self::with_live_cache(storage, false)
    }

    /// Selects the experiment independently of backend durability and session policy.
    fn with_live_cache(storage: Storage, live_cache: bool) -> Self {
        Self {
            live_cache,
            storage: Arc::new(storage),
            documents: Arc::new(Mutex::new(BTreeMap::new())),
        }
    }

    /// Allocates a backend identity and retains its recovered exclusive view.
    async fn create(&self) -> Result<sea_core::storage::DocumentId, protocol::Response> {
        let mut documents = self.documents.clone().lock_owned().await;
        let storage = self.storage.clone();
        let live_cache = self.live_cache;
        storage_worker(async move {
            let (id, view) = storage.create_view().await.map_err(error_response)?;
            let runtime = if live_cache {
                sea_sequencer::session::LocalSequencer::recover_with_live_cache(view).await
            } else {
                sea_sequencer::session::LocalSequencer::recover(view).await
            }
            .map_err(error_response)?;
            documents.insert(id.as_bytes().to_vec(), runtime);
            Ok(id)
        })
        .await
    }

    /// Shares the existing runtime or exclusively recovers one without caching failures.
    async fn open(
        &self,
        id: &sea_core::storage::DocumentId,
    ) -> Result<Arc<sea_sequencer::session::LocalSequencer<Storage>>, protocol::Response> {
        let mut documents = self.documents.clone().lock_owned().await;
        if let Some(runtime) = documents.get(id.as_bytes().as_ref()) {
            return Ok(runtime.clone());
        }
        let storage = self.storage.clone();
        let live_cache = self.live_cache;
        let id = id.clone();
        storage_worker(async move {
            let view = storage
                .open_view(&id)
                .await
                .map_err(error_response)?
                .ok_or_else(|| rejected("document does not exist"))?;
            let runtime = if live_cache {
                sea_sequencer::session::LocalSequencer::recover_with_live_cache(view).await
            } else {
                sea_sequencer::session::LocalSequencer::recover(view).await
            }
            .map_err(error_response)?;
            documents.insert(id.as_bytes().to_vec(), runtime.clone());
            Ok(runtime)
        })
        .await
    }
}

/// Runs potentially synchronous storage futures off the executor, retaining captured ownership on cancellation.
/// A failed worker may have mutated storage, so its outcome is ambiguous and is never retried here.
async fn storage_worker<Output: Send + 'static>(
    operation: impl std::future::Future<Output = Result<Output, protocol::Response>> + Send + 'static,
) -> Result<Output, protocol::Response> {
    tokio::task::spawn_blocking(move || tokio::runtime::Handle::current().block_on(operation))
        .await
        .map_err(|error| protocol::Response::Error {
            kind: protocol::ErrorKind::Ambiguous,
            message: format!("storage worker failed: {error}"),
        })?
}

/// Backend-independent document/session operations needed by the transport host.
#[async_trait]
trait HostedDocuments: Send + Sync {
    /// Opens a logical membership through the document registry.
    async fn open_session(
        &self,
        document: Vec<u8>,
        intent: protocol::ArchiveIntent,
        reference: Option<EventPosition>,
    ) -> Result<(DocumentId, SessionId, Arc<dyn SeaConnectionService>), protocol::Response>;

    /// Establishes document existence before admitting a signal connection.
    async fn ensure_document(&self, id: &DocumentId) -> Result<(), protocol::Response>;

    /// Completes accepted persistence without stopping sharing listeners.
    async fn flush(&self) -> Result<(), crate::WebTransportError>;

    /// Settles session cleanup and stops storage admission.
    async fn shutdown(&self) -> Result<(), crate::WebTransportError>;
}

/// Retryable lazy construction, executed off the async executor.
type InitializeDocuments =
    dyn Fn() -> Result<Arc<dyn HostedDocuments>, protocol::Response> + Send + Sync;

/// Runtime-selected built-in archive backend.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum StorageMode {
    /// Process-local ephemeral storage.
    Memory,
    /// Buffered single-process file storage.
    BufferedFile,
    /// Crash-durable single-process file storage.
    #[default]
    DurableFile,
}

impl StorageMode {
    /// Parses one stable command-line backend name.
    #[must_use]
    pub fn from_name(value: &str) -> Option<Self> {
        match value {
            "memory" => Some(Self::Memory),
            "buffered-file" => Some(Self::BufferedFile),
            "durable-file" => Some(Self::DurableFile),
            _ => None,
        }
    }

    /// Returns the stable command-line backend name.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Memory => "memory",
            Self::BufferedFile => "buffered-file",
            Self::DurableFile => "durable-file",
        }
    }
}

#[async_trait]
impl<Storage: SeaStorage + 'static> HostedDocuments for DocumentRegistry<Storage> {
    async fn open_session(
        &self,
        document: Vec<u8>,
        intent: protocol::ArchiveIntent,
        reference: Option<EventPosition>,
    ) -> Result<(DocumentId, SessionId, Arc<dyn SeaConnectionService>), protocol::Response> {
        open(self, document, intent, reference).await
    }

    async fn ensure_document(&self, id: &DocumentId) -> Result<(), protocol::Response> {
        self.open(id).await.map(|_| ())
    }

    async fn flush(&self) -> Result<(), crate::WebTransportError> {
        self.storage
            .flush()
            .await
            .map_err(|error| crate::WebTransportError::StorageShutdown(error.to_string()))
    }

    async fn shutdown(&self) -> Result<(), crate::WebTransportError> {
        let documents = self.documents.lock().await;
        let mut failure = None;
        for runtime in documents.values() {
            if let Err(error) = runtime.shutdown().await {
                failure = Some(error.to_string());
            }
        }
        if let Err(error) = self.storage.shutdown().await {
            failure = Some(error.to_string());
        }
        failure.map_or(Ok(()), |error| {
            Err(crate::WebTransportError::StorageShutdown(error))
        })
    }
}

/// Resolves backend identity before opening author membership in the shared runtime.
async fn open<Storage>(
    registry: &DocumentRegistry<Storage>,
    document: Vec<u8>,
    intent: protocol::ArchiveIntent,
    reference: Option<EventPosition>,
) -> Result<(DocumentId, SessionId, Arc<dyn SeaConnectionService>), protocol::Response>
where
    Storage: SeaStorage + 'static,
{
    let id = match intent {
        protocol::ArchiveIntent::Create if document.is_empty() => registry.create().await?,
        protocol::ArchiveIntent::Create => {
            return Err(invalid("creation does not accept a document identity"));
        }
        protocol::ArchiveIntent::Open if !document.is_empty() => {
            DocumentId::from_bytes(Bytes::from(document))
        }
        protocol::ArchiveIntent::Open => {
            return Err(invalid("opening requires a document identity"));
        }
    };
    let sequencer = registry.open(&id).await?;
    let session = sequencer
        .open_session(reference)
        .await
        .map_err(error_response)?;
    Ok((
        id,
        session.session_id().clone(),
        Arc::new(SessionDispatcher::new(Arc::new(session))),
    ))
}

/// Shared lazy backend initialization and retained document ownership.
struct HostInner {
    /// Rejects new document/session admission after host-wide shutdown starts.
    closed: std::sync::atomic::AtomicBool,
    /// Ephemeral rooms independent of retained document runtimes.
    signals: Mutex<BTreeMap<Vec<u8>, std::sync::Weak<sea_signals::SignalRoom>>>,
    /// Construction policy supplied independently of transport operations.
    initialize: Arc<InitializeDocuments>,
    /// Successful factory initialization; errors leave this empty for retry.
    backend: Arc<Mutex<Option<Arc<dyn HostedDocuments>>>>,
}

/// Final Sea protocol host using the server's runtime-selected backend.
#[derive(Clone)]
pub struct BuiltInSeaHost {
    inner: Arc<HostInner>,
}

impl BuiltInSeaHost {
    /// Stops host admission and drains storage after all sharing listeners have stopped.
    ///
    /// # Errors
    /// Returns an error if accepted mutations cannot reach their persistence boundary.
    pub async fn shutdown(&self) -> Result<(), crate::WebTransportError> {
        self.inner
            .closed
            .store(true, std::sync::atomic::Ordering::Release);
        let backend = self.inner.backend.lock().await;
        if let Some(backend) = backend.as_ref() {
            backend.shutdown().await?;
        }
        Ok(())
    }
    /// Creates an empty archive registry rooted at `root`.
    ///
    /// Enables the experimental live cache. Stalled readers can retain unbounded history.
    /// Use [`Self::new_with_live_cache`] with `false` for storage-backed delivery.
    #[must_use]
    pub fn new(root: PathBuf, mode: StorageMode) -> Self {
        Self::new_with_live_cache(root, mode, true)
    }

    /// Selects the experimental shared live cache for every recovered document.
    ///
    /// This is a controlled-use delivery optimization, not a production resource policy.
    /// Stalled subscriptions can retain unbounded history until closed or revoked.
    #[must_use]
    pub fn new_with_live_cache(root: PathBuf, mode: StorageMode, enabled: bool) -> Self {
        Self::with_initializer(move || {
            let root = root.join("documents");
            Ok(match mode {
                StorageMode::Memory => Arc::new(DocumentRegistry::with_live_cache(
                    MemoryStorage::new(),
                    enabled,
                )),
                StorageMode::BufferedFile => Arc::new(DocumentRegistry::with_live_cache(
                    FileStorage::open(root).map_err(error_response)?,
                    enabled,
                )),
                StorageMode::DurableFile => Arc::new(DocumentRegistry::with_live_cache(
                    DurableStorage::open(root).map_err(error_response)?,
                    enabled,
                )),
            })
        })
    }

    /// Hosts any storage implementation without backend-specific transport dispatch.
    /// The caller owns any synchronous factory construction required by the backend.
    /// Keeps storage-backed delivery; custom backends need not support cache invalidation.
    #[must_use]
    pub fn with_storage<Storage: SeaStorage + 'static>(storage: Storage) -> Self {
        let documents: Arc<dyn HostedDocuments> = Arc::new(DocumentRegistry::new(storage));
        Self::with_initializer(move || Ok(documents.clone()))
    }

    /// Retains a retryable construction policy without initializing storage eagerly.
    fn with_initializer(
        initialize: impl Fn() -> Result<Arc<dyn HostedDocuments>, protocol::Response>
        + Send
        + Sync
        + 'static,
    ) -> Self {
        Self {
            inner: Arc::new(HostInner {
                closed: std::sync::atomic::AtomicBool::new(false),
                signals: Mutex::new(BTreeMap::new()),
                initialize: Arc::new(initialize),
                backend: Arc::new(Mutex::new(None)),
            }),
        }
    }

    /// Initializes the factory once and delegates to its document registry.
    async fn open_session(
        &self,
        archive_id: Vec<u8>,
        intent: protocol::ArchiveIntent,
        reference: Option<EventPosition>,
    ) -> Result<(DocumentId, SessionId, Arc<dyn SeaConnectionService>), protocol::Response> {
        if self.inner.closed.load(std::sync::atomic::Ordering::Acquire) {
            return Err(rejected("host is shut down"));
        }
        let backend = self.backend().await?;
        backend.open_session(archive_id, intent, reference).await
    }

    /// Initializes storage without opening author membership.
    async fn backend(&self) -> Result<Arc<dyn HostedDocuments>, protocol::Response> {
        let initialize = self.inner.initialize.clone();
        self.initialize_backend(move || initialize()).await
    }

    /// Keeps synchronous initialization off the executor and retains serialization after cancellation.
    /// A completed worker caches success even if its caller has gone away; failures remain retryable.
    async fn initialize_backend(
        &self,
        initialize: impl FnOnce() -> Result<Arc<dyn HostedDocuments>, protocol::Response>
        + Send
        + 'static,
    ) -> Result<Arc<dyn HostedDocuments>, protocol::Response> {
        let mut current = self.inner.backend.clone().lock_owned().await;
        if self.inner.closed.load(std::sync::atomic::Ordering::Acquire) {
            return Err(rejected("host is shut down"));
        }
        if let Some(backend) = current.as_ref() {
            return Ok(backend.clone());
        }
        tokio::task::spawn_blocking(move || {
            let backend = initialize()?;
            *current = Some(backend.clone());
            Ok(backend)
        })
        .await
        .map_err(|error| protocol::Response::Error {
            kind: protocol::ErrorKind::Unavailable,
            message: format!("storage initialization worker failed: {error}"),
        })?
    }
}

#[async_trait]
impl SeaServiceHost for BuiltInSeaHost {
    async fn flush(&self) -> Result<(), crate::WebTransportError> {
        let backend = self.inner.backend.lock().await;
        let Some(backend) = backend.as_ref() else {
            return Ok(());
        };
        backend.flush().await
    }
    fn connect(&self, liveness: LivenessPolicy) -> Arc<dyn SeaConnectionService> {
        Arc::new(HostedConnection {
            signals: Mutex::new(None),
            host: self.clone(),
            session: Arc::new(Mutex::new(None)),
            liveness,
        })
    }
}

struct HostedConnection {
    /// Current signal registration, released before author reconnect grace.
    signals: Mutex<Option<Arc<sea_signals::SignalConnection>>>,
    host: BuiltInSeaHost,
    session: Arc<Mutex<Option<HostedSession>>>,
    liveness: LivenessPolicy,
}

/// Fixed session authority with conditional removal from its connection's current slot.
#[derive(Clone)]
struct HostedSession {
    /// Token admitted by this session, never a later replacement token.
    authority: Vec<u8>,
    /// Immutable dispatcher for the admitted session.
    service: Arc<dyn SeaConnectionService>,
    /// Weak registry ownership permits token revocation without retaining the connection.
    current: Weak<Mutex<Option<Self>>>,
}

#[async_trait]
impl SeaConnectionService for HostedConnection {
    async fn bind_session(
        self: Arc<Self>,
        authority: &[u8],
    ) -> Result<Arc<dyn SeaConnectionService>, protocol::Response> {
        let current = self.session.lock().await;
        match current.as_ref() {
            Some(session) if session.authority == authority => Ok(Arc::new(session.clone())),
            Some(_) => Err(rejected("logical stream authority does not match")),
            None => Err(invalid(
                "OpenEventStream is required before logical streams",
            )),
        }
    }

    async fn signal_datagram(&self, submission: protocol::signals::Submission) {
        use sea_core::signals::SeaSignals as _;
        if let Some(connection) = self.signals.lock().await.as_ref() {
            let _ = connection.send_signal(submission.into()).await;
        }
    }
    async fn open_signals(
        &self,
        opening: protocol::signals::OpenSignals,
    ) -> Result<Arc<sea_signals::SignalConnection>, protocol::Response> {
        if opening.version != protocol::PROTOCOL_VERSION {
            return Err(unsupported_version(opening.version));
        }
        if opening.document.is_empty() {
            return Err(invalid("signal document identity is empty"));
        }
        let mut registration = self.signals.lock().await;
        if registration.is_some() {
            return Err(rejected("signal stream is already open on this connection"));
        }
        let id = DocumentId::from_bytes(Bytes::copy_from_slice(&opening.document));
        let backend = self.host.backend().await?;
        backend.ensure_document(&id).await?;
        let mut rooms = self.host.inner.signals.lock().await;
        rooms.retain(|_, room| room.strong_count() > 0);
        let room = if let Some(room) = rooms
            .get(&opening.document)
            .and_then(std::sync::Weak::upgrade)
        {
            room
        } else {
            let room = sea_signals::SignalRoom::new(sea_signals::SignalLimits::default())
                .map_err(error_response)?;
            rooms.insert(opening.document, Arc::downgrade(&room));
            room
        };
        let connection = room
            .connect(opening.member.into())
            .map_err(error_response)?;
        *registration = Some(connection.clone());
        Ok(connection)
    }

    async fn connection_closed(&self, allow_reconnect_grace: bool) {
        use sea_core::signals::SeaSignals as _;
        if let Some(signals) = self.signals.lock().await.take() {
            let _ = signals.close_signals().await;
        }
        if let Some(session) = self.session.lock().await.clone() {
            session.service.revoke_snapshot_publisher().await;
            if allow_reconnect_grace {
                sleep(self.liveness.reconnect_grace).await;
            }
        }
        if let Some(session) = self.session.lock().await.take() {
            let _ = session
                .service
                .author_request(protocol::Request::Close)
                .await;
        }
    }

    async fn open_event_stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        if let protocol::Request::OpenEventStream {
            version,
            archive,
            intent,

            resume_after,
        } = request
        {
            if version != protocol::PROTOCOL_VERSION {
                return Err(unsupported_version(version));
            }
            let mut current = self.session.lock().await;
            if let Some(previous) = current.take() {
                let _ = previous
                    .service
                    .author_request(protocol::Request::Close)
                    .await;
            }
            let (document, session, service) = self
                .host
                .open_session(archive, intent, resume_after.map(EventPosition::new))
                .await?;
            let authority = new_authority();
            *current = Some(HostedSession {
                authority: authority.clone(),
                service: Arc::clone(&service),
                current: Arc::downgrade(&self.session),
            });
            let opened = stream::once(async move {
                protocol::Response::EventStreamOpened {
                    session: session.get(),
                    document: document.as_bytes().to_vec(),
                    authority,
                }
            });
            let recovery = stream::once(open_recovery_stream(service, resume_after)).flatten();
            return Ok(Box::pin(opened.chain(recovery)));
        }
        Err(invalid("event stream requires OpenEventStream"))
    }

    async fn event_stream(
        &self,
        _resume_after: Option<u64>,
    ) -> Result<SeaResponseStream, protocol::Response> {
        Err(invalid("event stream must be opened with OpenEventStream"))
    }

    async fn author_request(&self, request: protocol::Request) -> protocol::Response {
        if let protocol::Request::OpenAuthorStream { authority } = request {
            let session = self.session.lock().await;
            return match session.as_ref() {
                Some(session) if session.authority == authority => protocol::Response::Acknowledged,
                Some(_) => rejected("author stream authority does not match"),
                None => invalid("OpenEventStream is required before OpenAuthorStream"),
            };
        }
        let session = if matches!(request, protocol::Request::Close) {
            self.session.lock().await.take()
        } else {
            self.session.lock().await.clone()
        };
        match session {
            Some(session) => session.service.author_request(request).await,
            None => invalid("OpenEventStream is required before author operations"),
        }
    }

    async fn snapshot_stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        let protocol::Request::OpenSnapshotStream { ref authority, .. } = request else {
            return Err(invalid("snapshot stream requires OpenSnapshotStream"));
        };
        let session = self.session.lock().await.clone();
        match session {
            Some(session) if session.authority == *authority => {
                session.service.snapshot_stream(request).await
            }
            Some(_) => Err(rejected("snapshot stream authority does not match")),
            None => Err(invalid(
                "OpenEventStream is required before OpenSnapshotStream",
            )),
        }
    }

    async fn snapshot_request(&self, request: protocol::Request) -> protocol::Response {
        let session = self.session.lock().await.clone();
        match session {
            Some(session) => session.service.snapshot_request(request).await,
            None => invalid("OpenEventStream is required before snapshot operations"),
        }
    }

    async fn revoke_snapshot_publisher(&self) {
        if let Some(session) = self.session.lock().await.clone() {
            session.service.revoke_snapshot_publisher().await;
        }
    }

    async fn open_content_stream(&self, request: protocol::Request) -> protocol::Response {
        let protocol::Request::OpenContentStream { ref authority } = request else {
            return invalid("content stream requires OpenContentStream");
        };
        let session = self.session.lock().await.clone();
        match session {
            Some(session) if session.authority == *authority => {
                session.service.open_content_stream(request).await
            }
            Some(_) => rejected("content stream authority does not match"),
            None => invalid("OpenEventStream is required before OpenContentStream"),
        }
    }

    async fn content_request(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        let session = self.session.lock().await.clone();
        match session {
            Some(session) => session.service.content_request(request).await,
            None => Err(invalid(
                "OpenEventStream is required before content operations",
            )),
        }
    }
}

#[async_trait]
impl SeaConnectionService for HostedSession {
    async fn bind_session(
        self: Arc<Self>,
        _authority: &[u8],
    ) -> Result<Arc<dyn SeaConnectionService>, protocol::Response> {
        Err(invalid("session binding cannot admit connection streams"))
    }

    async fn connection_closed(&self, _allow_reconnect_grace: bool) {
        let _ = self.author_request(protocol::Request::Close).await;
    }

    async fn open_event_stream(
        &self,
        _request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        Err(invalid("event stream must be opened by the service host"))
    }

    async fn event_stream(
        &self,
        resume_after: Option<u64>,
    ) -> Result<SeaResponseStream, protocol::Response> {
        self.service.event_stream(resume_after).await
    }

    async fn author_request(&self, request: protocol::Request) -> protocol::Response {
        let close = matches!(request, protocol::Request::Close);
        let response = self.service.author_request(request).await;
        if (close || matches!(response, protocol::Response::Error { .. }))
            && let Some(current) = self.current.upgrade()
        {
            let mut current = current.lock().await;
            if current
                .as_ref()
                .is_some_and(|session| Arc::ptr_eq(&session.service, &self.service))
            {
                *current = None;
            }
        }
        response
    }

    async fn snapshot_stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        self.service.snapshot_stream(request).await
    }

    async fn snapshot_request(&self, request: protocol::Request) -> protocol::Response {
        self.service.snapshot_request(request).await
    }

    async fn revoke_snapshot_publisher(&self) {
        self.service.revoke_snapshot_publisher().await;
    }

    async fn open_content_stream(&self, request: protocol::Request) -> protocol::Response {
        self.service.open_content_stream(request).await
    }

    async fn content_request(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        self.service.content_request(request).await
    }
}

fn new_authority() -> Vec<u8> {
    let mut authority = vec![0_u8; 32];
    OsRng.fill_bytes(&mut authority);
    authority
}

async fn open_recovery_stream(
    service: Arc<dyn SeaConnectionService>,
    resume_after: Option<u64>,
) -> SeaResponseStream {
    match service.event_stream(resume_after).await {
        Ok(stream) => stream,
        Err(response) => Box::pin(stream::once(async move { response })),
    }
}

fn invalid(message: &str) -> protocol::Response {
    protocol::Response::Error {
        kind: protocol::ErrorKind::Invalid,
        message: message.to_owned(),
    }
}

fn rejected(message: &str) -> protocol::Response {
    protocol::Response::Error {
        kind: protocol::ErrorKind::Rejected,
        message: message.to_owned(),
    }
}

fn unsupported_version(version: u16) -> protocol::Response {
    rejected(&format!("unsupported protocol version {version}"))
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, net::SocketAddr, sync::Arc, time::Duration};

    use bytes::Bytes;
    use futures_util::StreamExt as _;
    use sea_core::{
        BlobDirectory, BlobTreeId, Event, EventPosition,
        archive::{EventSubmission, SnapshotParticipation},
        session::{SeaArchive, SeaAuthorSession, SeaSnapshotCoordinator},
        storage::{LoadStart, Snapshot, StorageHandle},
    };
    use sea_webtransport::{
        NativeSeaClient, NativeSessionOpen, TransportConfig as ClientTransportConfig, protocol,
    };
    use tokio::time::timeout;
    use wtransport::{
        ClientConfig, Connection, Endpoint, Identity, endpoint::endpoint_side::Client,
    };

    use super::{BuiltInSeaHost, DocumentRegistry, StorageMode};
    use crate::{
        LivenessPolicy, SeaConnectionService, SeaResponseStream, SeaServiceHost,
        ShutdownDisposition, ShutdownMode, TransportConfig, WebTransportServer,
    };

    /// Exercises real file invalidation through experimental document recovery, without polling.
    async fn assert_cache_shutdown<Storage: sea_core::storage::SeaStorage + 'static>(
        storage: Storage,
    ) {
        let registry = DocumentRegistry::with_live_cache(storage, true);
        let id = registry.create().await.unwrap();
        let runtime = registry.open(&id).await.unwrap();
        let author = runtime.open_session(None).await.unwrap();
        let mut live = author.read(None, None);
        let unpolled = author.read(None, None);
        assert!(matches!(
            live.next().await.unwrap().unwrap(),
            sea_core::MonitoredStreamItem::Progress(_)
        ));
        author
            .submit(EventSubmission {
                reference: None,
                event: Event {
                    payload: Bytes::from_static(b"retained"),
                    blob_tree: None,
                },
            })
            .await
            .unwrap();
        assert_eq!(runtime.live_cache_stats().unwrap().entries, 1);
        registry.storage.shutdown().await.unwrap();
        let stats = runtime.live_cache_stats().unwrap();
        assert_eq!(
            (stats.subscriptions, stats.entries, stats.payload_bytes),
            (0, 0, 0)
        );
        assert!(matches!(
            live.next().await.unwrap(),
            Err(sea_sequencer::session::SessionError::StorageInvalidated(_))
        ));
        drop(unpolled);
    }

    #[tokio::test]
    async fn experimental_file_registry_shutdown_releases_cache_without_subscriber_polling() {
        let root = std::path::PathBuf::from("target")
            .join(format!("cache-registry-{}", std::process::id()));
        assert_cache_shutdown(
            sea_file::buffered::FileStorage::open(root.join("buffered")).unwrap(),
        )
        .await;
        assert_cache_shutdown(
            sea_file::durable::DurableStorage::open(root.join("durable")).unwrap(),
        )
        .await;
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn file_registry_recovers_checkpointed_offsets_and_departures() {
        use sea_core::{MonitoredStreamItem, archive::SessionEventKind, storage::SeaStorage};

        let root =
            std::env::temp_dir().join(format!("sea-registry-checkpoint-{}", std::process::id()));
        let storage = sea_file::durable::DurableStorage::open(&root).unwrap();
        let registry = DocumentRegistry::new(storage.clone());
        let id = registry.create().await.unwrap();
        let runtime = registry.open(&id).await.unwrap();
        let idle = runtime.open_session(None).await.unwrap();
        idle.announce_membership(Bytes::from_static(b"idle"))
            .await
            .unwrap();
        let idle_id = idle.session_id().clone();
        let writer = runtime.open_session(None).await.unwrap();
        let mut reference = None;
        for size in (0..1152).map(|ordinal| ordinal % 127) {
            reference = Some(
                writer
                    .submit(EventSubmission {
                        reference,
                        event: Event {
                            payload: Bytes::from(vec![42; size]),
                            blob_tree: None,
                        },
                    })
                    .await
                    .unwrap(),
            );
        }
        let head = reference.unwrap();
        let mut history = writer.read(None, Some(head));
        let mut floor = None;
        while let Some(item) = history.next().await {
            if let MonitoredStreamItem::Item(event) = item.unwrap() {
                assert!(event.minimum_reference >= floor);
                floor = event.minimum_reference;
            }
        }
        assert!(floor.is_some());
        drop((history, idle, writer, runtime, registry));
        let view = storage.open_view(&id).await.unwrap().unwrap();
        assert!(view.checkpoint().await.unwrap().is_some());
        assert!(
            view.get_snapshot(LoadStart::LatestSnapshot)
                .await
                .unwrap()
                .is_none()
        );
        drop(view);
        let registry = DocumentRegistry::new(storage);
        let runtime = registry.open(&id).await.unwrap();
        let reader = runtime.open_session(None).await.unwrap();
        assert_eq!(reader.session_id().get(), 257);
        let mut departures = reader.read(Some(head), None);
        loop {
            if let MonitoredStreamItem::Item(event) = departures.next().await.unwrap().unwrap() {
                assert_eq!(event.kind, SessionEventKind::Left);
                assert_eq!(event.session_id, idle_id);
                assert!(event.minimum_reference >= floor);
                assert!(event.committed.position > head);
                break;
            }
        }
        drop((departures, reader, runtime, registry));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn slow_backend_initialization_preserves_executor_progress_and_cancellation_ownership() {
        let host = BuiltInSeaHost::new(std::path::PathBuf::new(), StorageMode::Memory);
        let (entered, entering) = tokio::sync::oneshot::channel();
        let (release, released) = std::sync::mpsc::channel();
        let initializing_host = host.clone();
        let initialization = tokio::spawn(async move {
            initializing_host
                .initialize_backend(move || {
                    entered.send(()).unwrap();
                    released
                        .recv_timeout(Duration::from_secs(5))
                        .expect("executor must release initialization");
                    Ok(Arc::new(DocumentRegistry::new(
                        sea_memory::MemoryStorage::new(),
                    )))
                })
                .await
        });
        entering.await.unwrap();
        assert!(
            timeout(Duration::from_millis(10), host.backend())
                .await
                .is_err()
        );
        initialization.abort();
        assert!(matches!(initialization.await, Err(error) if error.is_cancelled()));
        assert!(host.inner.backend.try_lock().is_err());
        release.send(()).unwrap();
        let backend = host
            .initialize_backend(|| panic!("cancelled worker must cache its result"))
            .await
            .unwrap();
        assert!(Arc::ptr_eq(&backend, &host.backend().await.unwrap()));
    }

    #[tokio::test]
    async fn backend_initialization_failure_remains_retryable() {
        let host = BuiltInSeaHost::new(std::path::PathBuf::new(), StorageMode::Memory);
        assert!(
            host.initialize_backend(|| Err(super::rejected("injected failure")))
                .await
                .is_err()
        );
        assert!(host.inner.backend.lock().await.is_none());
        let backend = host.backend().await.unwrap();
        assert!(Arc::ptr_eq(&backend, &host.backend().await.unwrap()));
    }

    #[tokio::test]
    async fn signal_admission_requires_existing_document_and_one_registration_per_connection() {
        use sea_core::signals::SeaSignals as _;

        let host = BuiltInSeaHost::new(std::path::PathBuf::new(), StorageMode::Memory);
        let connection = host.connect(LivenessPolicy::default());
        let mut opening = protocol::signals::OpenSignals {
            version: protocol::PROTOCOL_VERSION,
            document: b"missing".to_vec(),
            member: protocol::signals::Member {
                id: b"member".to_vec(),
                metadata: Vec::new(),
            },
            datagrams: false,
        };
        assert!(matches!(
            connection.open_signals(opening.clone()).await,
            Err(protocol::Response::Error {
                kind: protocol::ErrorKind::Rejected,
                ..
            })
        ));
        let (document, _, session) = host
            .open_session(Vec::new(), protocol::ArchiveIntent::Create, None)
            .await
            .unwrap();
        opening.document = document.as_bytes().to_vec();
        opening.version += 1;
        assert!(matches!(
            connection.open_signals(opening.clone()).await,
            Err(protocol::Response::Error {
                kind: protocol::ErrorKind::Rejected,
                ..
            })
        ));
        opening.version = protocol::PROTOCOL_VERSION;
        let signals = connection.open_signals(opening.clone()).await.unwrap();
        signals.close_signals().await.unwrap();
        assert!(matches!(
            connection.open_signals(opening.clone()).await,
            Err(protocol::Response::Error {
                kind: protocol::ErrorKind::Rejected,
                ..
            })
        ));
        let fresh = host.connect(LivenessPolicy::default());
        fresh.open_signals(opening).await.unwrap();
        fresh.connection_closed(false).await;
        connection.connection_closed(false).await;
        session.connection_closed(false).await;
    }

    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn signals_cross_native_connections_without_archive_events() {
        use sea_core::signals::{
            SeaSignals, SignalDelivery, SignalEvent, SignalMember, SignalSubmission,
        };
        let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
        let hash = identity.certificate_chain().as_slice()[0].hash();
        let server = WebTransportServer::bind(
            "127.0.0.1:0".parse().unwrap(),
            identity,
            Arc::new(BuiltInSeaHost::new(
                std::env::temp_dir().join("sea-signals-test"),
                StorageMode::Memory,
            )),
            TransportConfig::default(),
        )
        .unwrap();
        let address = server.local_addr().unwrap();
        let shutdown = server.shutdown_handle();
        let exercise = async {
            let first = NativeSeaClient::connect(
                format!("https://{address}/sea"),
                hash.clone(),
                ClientTransportConfig::default(),
                NativeSessionOpen {
                    archive: Bytes::new(),
                    intent: protocol::ArchiveIntent::Create,
                    reference: None,
                },
            )
            .await
            .unwrap();
            let second = NativeSeaClient::connect(
                format!("https://{address}/sea"),
                hash,
                ClientTransportConfig::default(),
                NativeSessionOpen {
                    archive: first.document().as_bytes().clone(),
                    intent: protocol::ArchiveIntent::Open,
                    reference: None,
                },
            )
            .await
            .unwrap();
            let sender = first
                .open_signals(SignalMember {
                    id: Bytes::from_static(b"first"),
                    metadata: Bytes::new(),
                })
                .await
                .unwrap();
            assert!(
                matches!(sender.next_signal().await.unwrap(), Some(SignalEvent::Members(members)) if members.len() == 1)
            );
            let receiver = second
                .open_signals(SignalMember {
                    id: Bytes::from_static(b"second"),
                    metadata: Bytes::new(),
                })
                .await
                .unwrap();
            assert!(
                matches!(receiver.next_signal().await.unwrap(), Some(SignalEvent::Members(members)) if members.len() == 2)
            );
            assert!(matches!(
                sender.next_signal().await.unwrap(),
                Some(SignalEvent::Joined(_))
            ));
            sender
                .send_signal(SignalSubmission {
                    target: None,
                    payload: Bytes::from_static(b"broadcast"),
                    delivery: SignalDelivery::Reliable,
                })
                .await
                .unwrap();
            assert_eq!(
                sender.next_signal().await.unwrap(),
                receiver.next_signal().await.unwrap()
            );
            sender
                .send_signal(SignalSubmission {
                    target: Some(Bytes::from_static(b"second")),
                    payload: Bytes::from_static(b"target"),
                    delivery: SignalDelivery::Reliable,
                })
                .await
                .unwrap();
            assert!(
                matches!(receiver.next_signal().await.unwrap(), Some(SignalEvent::Message(message)) if message.submission.payload == "target")
            );
            for size in [32, 4096] {
                let payload = Bytes::from(vec![7; size]);
                sender
                    .send_signal(SignalSubmission {
                        target: Some(Bytes::from_static(b"second")),
                        payload: payload.clone(),
                        delivery: SignalDelivery::BestEffort,
                    })
                    .await
                    .unwrap();
                assert!(
                    matches!(receiver.next_signal().await.unwrap(), Some(SignalEvent::Message(message)) if message.submission.payload == payload && message.submission.delivery == SignalDelivery::BestEffort)
                );
            }
            let mut history = first.load(LoadStart::LatestSnapshot).await.unwrap().events;
            assert!(
                matches!(history.next().await.unwrap().unwrap(), sea_core::MonitoredStreamItem::Progress(progress) if progress.previous.is_none() && progress.latest_known.is_none())
            );
            receiver.close_signals().await.unwrap();
            assert_eq!(
                sender.next_signal().await.unwrap(),
                Some(SignalEvent::Left(Bytes::from_static(b"second")))
            );
            first.close().await.unwrap();
            second.close().await.unwrap();
            shutdown.shutdown(ShutdownMode::Immediate).unwrap();
        };
        let (outcome, ()) = tokio::join!(server.serve_until_shutdown(), async {
            timeout(Duration::from_secs(15), exercise).await.unwrap();
        });
        outcome.unwrap();
    }

    #[tokio::test]
    async fn document_registry_shares_concurrent_first_opens() {
        use sea_core::storage::SeaStorage as _;

        let storage = sea_memory::MemoryStorage::new();
        let (id, view) = storage
            .create_view()
            .await
            .expect("create persisted document");
        drop(view);
        let registry = DocumentRegistry::new(storage);
        let (first, second) = tokio::join!(registry.open(&id), registry.open(&id));
        assert!(Arc::ptr_eq(
            &first.expect("first"),
            &second.expect("second")
        ));
        let fresh = registry.create().await.expect("allocate document");
        assert_ne!(fresh, id);
        assert!(registry.open(&fresh).await.is_ok());
    }

    /// Injects synchronous storage latency independently of filesystem and VM timing.
    struct PausedStorage {
        /// Real storage supplying exclusive document components after the pause.
        inner: sea_memory::MemoryStorage,
        /// One bounded blocking pause before creation or recovery.
        pause: std::sync::Mutex<Option<Box<dyn FnOnce() + Send>>>,
        /// Lifecycle calls observed through the backend-independent host interface.
        lifecycle: Arc<std::sync::Mutex<Vec<&'static str>>>,
    }

    impl PausedStorage {
        /// Consumes the pause on the first storage operation only.
        fn pause(&self) {
            if let Some(pause) = self.pause.lock().unwrap().take() {
                pause();
            }
        }
    }

    #[async_trait::async_trait]
    impl sea_core::storage::SeaStorage for PausedStorage {
        type Error = <sea_memory::MemoryStorage as sea_core::storage::SeaStorage>::Error;
        type Blobs = <sea_memory::MemoryStorage as sea_core::storage::SeaStorage>::Blobs;
        type Events = <sea_memory::MemoryStorage as sea_core::storage::SeaStorage>::Events;
        type Snapshots = <sea_memory::MemoryStorage as sea_core::storage::SeaStorage>::Snapshots;

        fn durability(&self) -> sea_core::Durability {
            self.inner.durability()
        }

        async fn flush(&self) -> Result<(), Self::Error> {
            self.lifecycle.lock().unwrap().push("flush");
            Ok(())
        }

        async fn shutdown(&self) -> Result<(), Self::Error> {
            self.lifecycle.lock().unwrap().push("shutdown");
            Ok(())
        }

        async fn create_document(
            &self,
        ) -> Result<
            sea_core::storage::CreatedDocument<Self::Blobs, Self::Events, Self::Snapshots>,
            Self::Error,
        > {
            self.pause();
            self.inner.create_document().await
        }

        async fn open_document(
            &self,
            id: &sea_core::storage::DocumentId,
        ) -> Result<
            Option<
                sea_core::storage::StorageComponents<Self::Blobs, Self::Events, Self::Snapshots>,
            >,
            Self::Error,
        > {
            self.pause();
            self.inner.open_document(id).await
        }
    }

    #[tokio::test]
    async fn custom_storage_uses_generic_document_and_lifecycle_dispatch() {
        let lifecycle = Arc::new(std::sync::Mutex::new(Vec::new()));
        let host = BuiltInSeaHost::with_storage(PausedStorage {
            inner: sea_memory::MemoryStorage::new(),
            pause: std::sync::Mutex::new(None),
            lifecycle: lifecycle.clone(),
        });
        let (document, _, session) = host
            .open_session(Vec::new(), protocol::ArchiveIntent::Create, None)
            .await
            .unwrap();
        host.backend()
            .await
            .unwrap()
            .ensure_document(&document)
            .await
            .unwrap();
        session.connection_closed(false).await;
        host.flush().await.unwrap();
        host.shutdown().await.unwrap();
        assert_eq!(*lifecycle.lock().unwrap(), vec!["flush", "shutdown"]);
        assert!(
            host.open_session(
                document.as_bytes().to_vec(),
                protocol::ArchiveIntent::Open,
                None
            )
            .await
            .is_err()
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn slow_document_initialization_preserves_executor_progress_and_cancellation_ownership() {
        use sea_core::storage::SeaStorage as _;

        for create in [false, true] {
            let storage = sea_memory::MemoryStorage::new();
            let (existing, view) = storage.create_view().await.unwrap();
            drop(view);
            let (entered, entering) = tokio::sync::oneshot::channel();
            let (release, released) = std::sync::mpsc::channel();
            let registry = Arc::new(DocumentRegistry::new(PausedStorage {
                inner: storage,
                lifecycle: Arc::default(),
                pause: std::sync::Mutex::new(Some(Box::new(move || {
                    entered.send(()).unwrap();
                    released
                        .recv_timeout(Duration::from_secs(5))
                        .expect("executor must release storage");
                }))),
            }));
            let initializing_registry = registry.clone();
            let initialization = tokio::spawn(async move {
                if create {
                    initializing_registry.create().await.unwrap();
                } else {
                    initializing_registry.open(&existing).await.unwrap();
                }
            });
            entering.await.unwrap();
            assert!(
                timeout(Duration::from_millis(10), registry.documents.lock())
                    .await
                    .is_err()
            );
            initialization.abort();
            assert!(initialization.await.unwrap_err().is_cancelled());
            assert!(registry.documents.try_lock().is_err());
            release.send(()).unwrap();
            let (id, cached) = {
                let documents = timeout(Duration::from_secs(5), registry.documents.lock())
                    .await
                    .unwrap();
                assert_eq!(documents.len(), 1);
                let (id, cached) = documents.first_key_value().unwrap();
                (
                    sea_core::storage::DocumentId::from_bytes(Bytes::copy_from_slice(id)),
                    cached.clone(),
                )
            };
            assert!(Arc::ptr_eq(&cached, &registry.open(&id).await.unwrap()));
        }
    }

    #[tokio::test]
    async fn document_registry_retries_failed_initialization() {
        use sea_core::storage::{DocumentId, SeaStorage as _};

        let storage = sea_memory::MemoryStorage::new();
        let (id, external_view) = storage.create_view().await.expect("external writer");
        let registry = DocumentRegistry::new(storage);
        assert!(registry.open(&id).await.is_err());
        assert!(registry.documents.lock().await.is_empty());
        drop(external_view);
        let runtime = registry
            .open(&id)
            .await
            .expect("retry after writer release");
        assert!(Arc::ptr_eq(
            &runtime,
            &registry.open(&id).await.expect("cached")
        ));
        let unknown = DocumentId::from_bytes(Bytes::from_static(b"unknown"));
        assert!(registry.open(&unknown).await.is_err());
        assert_eq!(registry.documents.lock().await.len(), 1);
    }

    #[tokio::test]
    async fn archive_create_and_open_intent_is_explicit() {
        for mode in [
            StorageMode::Memory,
            StorageMode::BufferedFile,
            StorageMode::DurableFile,
        ] {
            let root = std::env::temp_dir().join(format!(
                "sea-webtransport-archive-intent-{}-{}",
                std::process::id(),
                mode.name()
            ));
            let _ = std::fs::remove_dir_all(&root);
            let host = BuiltInSeaHost::new(root.clone(), mode);
            assert!(
                host.open_session(vec![0; 8], protocol::ArchiveIntent::Open, None)
                    .await
                    .is_err()
            );
            assert!(matches!(
                host.connect(LivenessPolicy::default())
                    .open_event_stream(protocol::Request::OpenEventStream {
                        version: protocol::PROTOCOL_VERSION + 1,
                        archive: Vec::new(),
                        intent: protocol::ArchiveIntent::Create,
                        resume_after: None,
                    })
                    .await,
                Err(protocol::Response::Error {
                    kind: protocol::ErrorKind::Rejected,
                    ..
                })
            ));
            let (document, created_id, created) = host
                .open_session(Vec::new(), protocol::ArchiveIntent::Create, None)
                .await
                .unwrap();
            assert!(!document.as_bytes().is_empty());
            assert!(
                host.open_session(
                    document.as_bytes().to_vec(),
                    protocol::ArchiveIntent::Create,
                    None
                )
                .await
                .is_err()
            );
            let (opened_id, opened_session_id, opened) = host
                .open_session(
                    document.as_bytes().to_vec(),
                    protocol::ArchiveIntent::Open,
                    None,
                )
                .await
                .unwrap();
            assert_eq!(document, opened_id);
            assert!(opened_session_id > created_id);
            created.connection_closed(false).await;
            opened.connection_closed(false).await;
            drop((created, opened));

            if mode != StorageMode::Memory {
                drop(host);
                let recovered = BuiltInSeaHost::new(root.clone(), mode);
                assert!(
                    recovered
                        .open_session(
                            document.as_bytes().to_vec(),
                            protocol::ArchiveIntent::Open,
                            None
                        )
                        .await
                        .is_ok()
                );
            }
            let _ = std::fs::remove_dir_all(root);
        }
    }

    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn event_stream_returns_distinct_authority_before_recovery() {
        let host = BuiltInSeaHost::new(std::path::PathBuf::new(), StorageMode::Memory);
        let first_connection = host.connect(LivenessPolicy::default());
        let mut first_stream = first_connection
            .open_event_stream(protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: Vec::new(),
                intent: protocol::ArchiveIntent::Create,
                resume_after: None,
            })
            .await
            .expect("first event stream");
        let protocol::Response::EventStreamOpened {
            session: _,
            authority: first_authority,
            document,
        } = first_stream.next().await.expect("opening authority")
        else {
            panic!("event stream must return its authority first");
        };
        assert_eq!(first_authority.len(), 32);
        assert!(matches!(
            first_connection
                .author_request(protocol::Request::OpenAuthorStream {
                    authority: vec![0; 32],
                })
                .await,
            protocol::Response::Error {
                kind: protocol::ErrorKind::Rejected,
                ..
            }
        ));
        assert_eq!(
            first_connection
                .author_request(protocol::Request::OpenAuthorStream {
                    authority: first_authority.clone(),
                })
                .await,
            protocol::Response::Acknowledged
        );
        assert!(matches!(
            first_stream.next().await,
            Some(protocol::Response::StreamProgress {
                previous: None,
                latest_known: None,
                status: protocol::StreamStatus::AwaitingNewItems,
            })
        ));

        let second = host.connect(LivenessPolicy::default());
        let mut second_stream = second
            .open_event_stream(protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: document.clone(),
                intent: protocol::ArchiveIntent::Open,
                resume_after: None,
            })
            .await
            .expect("second event stream");
        let protocol::Response::EventStreamOpened {
            authority: second_authority,
            ..
        } = second_stream.next().await.expect("second authority")
        else {
            panic!("event stream must return its authority first");
        };
        assert_eq!(second_authority.len(), 32);
        assert_ne!(first_authority, second_authority);

        assert!(
            second
                .snapshot_stream(protocol::Request::OpenSnapshotStream {
                    authority: vec![0; 32],
                    participation: protocol::SnapshotParticipation::SeaSelected,
                })
                .await
                .is_err()
        );
        let mut first_snapshots = first_connection
            .snapshot_stream(protocol::Request::OpenSnapshotStream {
                authority: first_authority,
                participation: protocol::SnapshotParticipation::SeaSelected,
            })
            .await
            .expect("first snapshot stream");
        let protocol::Response::SnapshotCoordination {
            fence: Some(first_fence),
            ..
        } = first_snapshots.next().await.expect("first nomination")
        else {
            panic!("first Sea-selected session must be nominated");
        };
        let mut second_snapshots = second
            .snapshot_stream(protocol::Request::OpenSnapshotStream {
                authority: second_authority,
                participation: protocol::SnapshotParticipation::SeaSelected,
            })
            .await
            .expect("second snapshot stream");
        assert!(matches!(
            second_snapshots.next().await,
            Some(protocol::Response::SnapshotCoordination { fence: None, .. })
        ));
        let protocol::Response::BlobStored { id: snapshot_root } = first_connection
            .content_request(protocol::Request::PutBlob {
                payload: b"state".to_vec(),
            })
            .await
            .unwrap()
            .next()
            .await
            .unwrap()
        else {
            panic!("blob upload");
        };
        let protocol::Response::EventCommitted { position } = first_connection
            .author_request(protocol::Request::Submit {
                reference: None,
                event: protocol::Event {
                    payload: b"initialization".to_vec(),
                    blob_tree: Some(protocol::TreeId::Blob(snapshot_root)),
                },
            })
            .await
        else {
            panic!("initialization event");
        };
        assert!(matches!(
            second
                .snapshot_request(protocol::Request::PublishSnapshot {
                    fence: Some(first_fence),
                    expected_parent: None,
                    at_event: position,
                    root: protocol::TreeId::Blob(snapshot_root),
                })
                .await,
            protocol::Response::Error {
                kind: protocol::ErrorKind::Rejected,
                ..
            }
        ));

        let client_selected = host.connect(LivenessPolicy::default());
        let mut client_events = client_selected
            .open_event_stream(protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: document,
                intent: protocol::ArchiveIntent::Open,
                resume_after: None,
            })
            .await
            .expect("client-selected event stream");
        let protocol::Response::EventStreamOpened {
            authority: client_authority,
            ..
        } = client_events
            .next()
            .await
            .expect("client-selected authority")
        else {
            panic!("client-selected event stream must return authority first");
        };
        let mut client_snapshots = client_selected
            .snapshot_stream(protocol::Request::OpenSnapshotStream {
                authority: client_authority,
                participation: protocol::SnapshotParticipation::ClientSelected,
            })
            .await
            .expect("client-selected snapshot stream");
        assert!(matches!(
            client_snapshots.next().await,
            Some(protocol::Response::SnapshotCoordination { fence: None, .. })
        ));
        assert!(matches!(
            first_snapshots.next().await,
            Some(protocol::Response::SnapshotCoordination { fence: None, .. })
        ));
        assert!(matches!(
            first_connection
                .snapshot_request(protocol::Request::PublishSnapshot {
                    fence: Some(first_fence),
                    expected_parent: None,
                    at_event: position,
                    root: protocol::TreeId::Blob(snapshot_root),
                })
                .await,
            protocol::Response::Error {
                kind: protocol::ErrorKind::Rejected,
                ..
            }
        ));
        client_selected.connection_closed(false).await;
        assert!(matches!(
            first_snapshots.next().await,
            Some(protocol::Response::SnapshotCoordination {
                fence: Some(fence),
                ..
            }) if fence > first_fence
        ));

        first_connection.connection_closed(false).await;
        assert!(matches!(
            first_connection
                .author_request(protocol::Request::AnnounceMembership {
                    metadata: Vec::new(),
                })
                .await,
            protocol::Response::Error {
                kind: protocol::ErrorKind::Invalid,
                ..
            }
        ));
        assert!(matches!(
            second_snapshots.next().await,
            Some(protocol::Response::SnapshotCoordination {
                fence: Some(fence),
                ..
            }) if fence > first_fence
        ));
    }

    #[tokio::test]
    async fn concurrent_close_is_idempotent_during_reconnect_grace() {
        let host = BuiltInSeaHost::new(std::path::PathBuf::new(), StorageMode::Memory);
        let connection = host.connect(LivenessPolicy {
            reconnect_grace: Duration::from_millis(25),
            ..LivenessPolicy::default()
        });
        let mut events = connection
            .open_event_stream(protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: Vec::new(),
                intent: protocol::ArchiveIntent::Create,
                resume_after: None,
            })
            .await
            .unwrap();
        let protocol::Response::EventStreamOpened {
            session: _,
            authority,
            document,
        } = events.next().await.expect("event authority")
        else {
            panic!("event stream must return authority");
        };
        assert_eq!(
            connection
                .author_request(protocol::Request::OpenAuthorStream { authority })
                .await,
            protocol::Response::Acknowledged
        );
        assert!(matches!(
            connection
                .author_request(protocol::Request::AnnounceMembership {
                    metadata: b"public member".to_vec(),
                })
                .await,
            protocol::Response::EventCommitted { .. }
        ));
        let observer = host.connect(LivenessPolicy::default());
        let mut peer_events = observer
            .open_event_stream(protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: document,
                intent: protocol::ArchiveIntent::Open,
                resume_after: None,
            })
            .await
            .unwrap();
        assert!(matches!(
            peer_events.next().await,
            Some(protocol::Response::EventStreamOpened { .. })
        ));
        let cleanup = connection.connection_closed(true);
        let explicit = async {
            tokio::task::yield_now().await;
            connection.author_request(protocol::Request::Close).await
        };
        let ((), response) = tokio::join!(cleanup, explicit);
        assert_eq!(response, protocol::Response::Acknowledged);
        connection.connection_closed(false).await;
        let mut membership = Vec::new();
        while membership.len() < 2 {
            if let protocol::Response::LoadEvent(event) = peer_events.next().await.unwrap() {
                membership.push(event.kind);
            }
        }
        assert_eq!(
            membership,
            vec![
                protocol::SessionEventKind::Joined,
                protocol::SessionEventKind::Left
            ]
        );
        observer.connection_closed(false).await;
        assert!(matches!(
            connection
                .author_request(protocol::Request::AnnounceMembership {
                    metadata: Vec::new(),
                })
                .await,
            protocol::Response::Error {
                kind: protocol::ErrorKind::Invalid,
                ..
            }
        ));
    }

    #[tokio::test]
    async fn native_client_round_trip_in_every_storage_mode() {
        for mode in [
            StorageMode::Memory,
            StorageMode::BufferedFile,
            StorageMode::DurableFile,
        ] {
            native_client_round_trip(mode).await;
        }
    }

    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn bound_stream_operations_and_cleanup_cannot_reach_a_replacement_session() {
        for replace_document in [false, true] {
            let host = BuiltInSeaHost::new(std::path::PathBuf::new(), StorageMode::Memory);
            let connection = host.connect(LivenessPolicy::default());
            assert!(matches!(
                connection.clone().bind_session(b"unopened").await,
                Err(protocol::Response::Error {
                    kind: protocol::ErrorKind::Invalid,
                    ..
                })
            ));
            let (authority, document, _events) = open_test_session(&connection, Vec::new()).await;
            let old_author = connection.clone().bind_session(&authority).await.unwrap();
            let old_content = connection.clone().bind_session(&authority).await.unwrap();
            let old_snapshot = connection.clone().bind_session(&authority).await.unwrap();
            assert_eq!(
                old_author
                    .author_request(protocol::Request::OpenAuthorStream {
                        authority: authority.clone(),
                    })
                    .await,
                protocol::Response::Acknowledged
            );
            let old_lease = old_snapshot
                .snapshot_stream(protocol::Request::OpenSnapshotStream {
                    authority: authority.clone(),
                    participation: protocol::SnapshotParticipation::ClientSelected,
                })
                .await
                .unwrap();

            let archive = if replace_document {
                Vec::new()
            } else {
                document
            };
            let (replacement_authority, _, _replacement_events) =
                open_test_session(&connection, archive).await;
            assert_ne!(authority, replacement_authority);
            assert!(matches!(
                connection.clone().bind_session(&authority).await,
                Err(protocol::Response::Error {
                    kind: protocol::ErrorKind::Rejected,
                    ..
                })
            ));
            let replacement = connection
                .clone()
                .bind_session(&replacement_authority)
                .await
                .unwrap();
            let _replacement_lease = replacement
                .snapshot_stream(protocol::Request::OpenSnapshotStream {
                    authority: replacement_authority.clone(),
                    participation: protocol::SnapshotParticipation::ClientSelected,
                })
                .await
                .unwrap();
            let Some(protocol::Response::BlobStored { id: root }) = replacement
                .content_request(protocol::Request::PutBlob {
                    payload: b"replacement".to_vec(),
                })
                .await
                .unwrap()
                .next()
                .await
            else {
                panic!("replacement must accept content");
            };
            let protocol::Response::EventCommitted { position } = replacement
                .author_request(protocol::Request::Submit {
                    reference: None,
                    event: protocol::Event {
                        payload: b"replacement".to_vec(),
                        blob_tree: None,
                    },
                })
                .await
            else {
                panic!("replacement must accept submissions");
            };
            assert!(matches!(
                old_author
                    .author_request(protocol::Request::Submit {
                        reference: None,
                        event: protocol::Event {
                            payload: b"stale".to_vec(),
                            blob_tree: None
                        },
                    })
                    .await,
                protocol::Response::Error {
                    kind: protocol::ErrorKind::Rejected,
                    ..
                }
            ));
            assert!(matches!(
                old_content
                    .content_request(protocol::Request::PutBlob {
                        payload: b"stale".to_vec(),
                    })
                    .await,
                Err(protocol::Response::Error {
                    kind: protocol::ErrorKind::Rejected,
                    ..
                })
            ));
            let publication = protocol::Request::PublishSnapshot {
                fence: None,
                expected_parent: None,
                at_event: position,
                root: protocol::TreeId::Blob(root),
            };
            assert!(matches!(
                old_snapshot.snapshot_request(publication.clone()).await,
                protocol::Response::Error {
                    kind: protocol::ErrorKind::Rejected,
                    ..
                }
            ));

            assert_eq!(
                old_author.author_request(protocol::Request::Close).await,
                protocol::Response::Acknowledged
            );
            old_snapshot.revoke_snapshot_publisher().await;
            drop(old_lease);
            assert!(
                connection
                    .clone()
                    .bind_session(&replacement_authority)
                    .await
                    .is_ok(),
                "old cleanup must not revoke the replacement opening token"
            );
            assert!(
                matches!(
                    replacement.snapshot_request(publication).await,
                    protocol::Response::Snapshot(Some(_))
                ),
                "old cleanup must not revoke the replacement registration"
            );
            assert!(
                matches!(
                    replacement
                        .author_request(protocol::Request::Submit {
                            reference: Some(position),
                            event: protocol::Event {
                                payload: b"still open".to_vec(),
                                blob_tree: None
                            },
                        })
                        .await,
                    protocol::Response::EventCommitted { .. }
                ),
                "old author cleanup must not close replacement membership"
            );
            connection.connection_closed(false).await;
        }
    }

    /// Opens or creates a session and retains its event stream independently of its token.
    async fn open_test_session(
        connection: &Arc<dyn SeaConnectionService>,
        archive: Vec<u8>,
    ) -> (Vec<u8>, Vec<u8>, SeaResponseStream) {
        let intent = if archive.is_empty() {
            protocol::ArchiveIntent::Create
        } else {
            protocol::ArchiveIntent::Open
        };
        let mut events = connection
            .open_event_stream(protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive,
                intent,
                resume_after: None,
            })
            .await
            .unwrap();
        let Some(protocol::Response::EventStreamOpened {
            authority,
            document,
            ..
        }) = events.next().await
        else {
            panic!("opening must return session authority");
        };
        (authority, document, events)
    }

    #[tokio::test(start_paused = true)]
    async fn closing_bound_authority_revokes_its_token_without_reconnect_grace() {
        for request in [
            protocol::Request::Close,
            protocol::Request::Read {
                after: None,
                stop_after: None,
            },
        ] {
            let host = BuiltInSeaHost::new(std::path::PathBuf::new(), StorageMode::Memory);
            let connection = host.connect(LivenessPolicy::default());
            let (authority, _, _events) = open_test_session(&connection, Vec::new()).await;
            let bound = connection.clone().bind_session(&authority).await.unwrap();
            let response = bound.author_request(request.clone()).await;
            if matches!(request, protocol::Request::Close) {
                assert_eq!(response, protocol::Response::Acknowledged);
            } else {
                assert!(matches!(response, protocol::Response::Error { .. }));
            }
            assert!(
                matches!(
                    connection.clone().bind_session(&authority).await,
                    Err(protocol::Response::Error {
                        kind: protocol::ErrorKind::Invalid,
                        ..
                    })
                ),
                "closed session authority must not admit another stream"
            );
            assert!(
                futures_util::poll!(connection.connection_closed(true)).is_ready(),
                "already-closed membership must not incur reconnect grace"
            );
        }
    }

    #[tokio::test]
    async fn replaced_event_authority_cannot_be_used_by_an_old_author_stream() {
        let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
        let hash = identity.certificate_chain().as_slice()[0].hash();
        let server = WebTransportServer::bind(
            "127.0.0.1:0".parse().unwrap(),
            identity,
            Arc::new(BuiltInSeaHost::new(
                std::path::PathBuf::new(),
                StorageMode::Memory,
            )),
            TransportConfig::default(),
        )
        .unwrap();
        let address = server.local_addr().unwrap();
        let shutdown = server.shutdown_handle();
        let serving = tokio::spawn(server.serve_until_shutdown());
        let (_endpoint, connection) = raw_connection(address, hash).await;
        let (authority, document, old_session, _events) =
            open_raw_event_stream_with_intent(&connection, b"", protocol::ArchiveIntent::Create)
                .await;
        let (mut author, mut receipts) = connection.open_bi().await.unwrap().await.unwrap();
        let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        send_raw_request(
            &mut author,
            protocol::Request::OpenAuthorStream { authority },
        )
        .await;
        assert_eq!(
            read_raw_response(&mut receipts, &mut decoder, protocol::StreamRole::Author).await,
            protocol::Response::Acknowledged
        );
        let (_, replacement, _replacement_events) =
            open_raw_event_stream(&connection, &document).await;
        assert_ne!(old_session, replacement);
        send_raw_request(
            &mut author,
            protocol::Request::Submit {
                reference: None,
                event: protocol::Event {
                    payload: b"old-stream".to_vec(),
                    blob_tree: None,
                },
            },
        )
        .await;
        let response =
            read_raw_response(&mut receipts, &mut decoder, protocol::StreamRole::Author).await;
        connection.close(0_u32.into(), b"reproduction complete");
        shutdown.shutdown(ShutdownMode::Immediate).unwrap();
        serving.await.unwrap().unwrap();
        assert!(
            matches!(
                response,
                protocol::Response::Error {
                    kind: protocol::ErrorKind::Rejected,
                    ..
                }
            ),
            "old session {old_session} author stream committed under replacement {replacement}: {response:?}"
        );
    }

    #[tokio::test]
    async fn immediate_shutdown_releases_session_without_reconnect_grace() {
        let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
        let certificate_hash = identity.certificate_chain().as_slice()[0].hash();
        let server = WebTransportServer::bind(
            "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
            identity,
            Arc::new(BuiltInSeaHost::new(
                std::path::PathBuf::new(),
                StorageMode::Memory,
            )),
            TransportConfig {
                liveness: LivenessPolicy {
                    reconnect_grace: Duration::from_secs(30),
                    ..LivenessPolicy::default()
                },
                ..TransportConfig::default()
            },
        )
        .unwrap();
        let address = server.local_addr().unwrap();
        let shutdown = server.shutdown_handle();
        let measurements = server.measurement_handle();
        let serving = server.serve_until_shutdown();
        let exercise = async {
            let client = NativeSeaClient::connect(
                format!("https://{address}/sea"),
                certificate_hash,
                ClientTransportConfig::default(),
                NativeSessionOpen {
                    archive: Bytes::new(),
                    intent: protocol::ArchiveIntent::Create,
                    reference: None,
                },
            )
            .await
            .unwrap();
            shutdown.shutdown(ShutdownMode::Immediate).unwrap();
            client
        };
        let (outcome, client) = tokio::join!(serving, exercise);
        drop(client);
        let outcome = outcome.unwrap();
        assert_eq!(outcome.disposition, ShutdownDisposition::Cancelled);
        assert_eq!(outcome.owned_connections, 1);
        assert_eq!(outcome.cancelled_connections, 1);
        assert_eq!(measurements.snapshot().connection_cleanups, 1);
    }

    #[allow(clippy::too_many_lines)]
    async fn native_client_round_trip(mode: StorageMode) {
        let root = std::env::temp_dir().join(format!(
            "sea-webtransport-server-test-{}-{}",
            std::process::id(),
            mode.name()
        ));
        let _ = std::fs::remove_dir_all(&root);
        let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
        let certificate_hash = identity.certificate_chain().as_slice()[0].hash();
        let server = WebTransportServer::bind(
            "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
            identity,
            Arc::new(BuiltInSeaHost::new(root.clone(), mode)),
            TransportConfig::default(),
        )
        .unwrap();
        let address = server.local_addr().unwrap();
        let shutdown = server.shutdown_handle();
        let measurements = server.measurement_handle();
        let serving = server.serve_until_shutdown();
        let exercise = async {
            let started = std::time::Instant::now();
            let client = NativeSeaClient::connect(
                format!("https://{address}/sea"),
                certificate_hash,
                ClientTransportConfig::default(),
                NativeSessionOpen {
                    archive: Bytes::new(),
                    intent: protocol::ArchiveIntent::Create,
                    reference: None,
                },
            )
            .await
            .unwrap_or_else(|error| {
                panic!(
                    "{} connection failed after {:?}: {error:?}; server: {:?}",
                    mode.name(),
                    started.elapsed(),
                    measurements.snapshot(),
                )
            });
            let mut events = client.load(LoadStart::LatestSnapshot).await.unwrap().events;
            loop {
                let sea_core::MonitoredStreamItem::Progress(progress) =
                    events.next().await.unwrap().unwrap()
                else {
                    panic!("empty document must not deliver events");
                };
                assert!(progress.previous.is_none() && progress.latest_known.is_none());
                if progress.status == sea_core::MonitoredStreamStatus::AwaitingNewItems {
                    break;
                }
            }
            let receipt = client
                .submit(EventSubmission {
                    reference: None,
                    event: Event {
                        payload: Bytes::from_static(b"native-payload"),
                        blob_tree: None,
                    },
                })
                .await
                .unwrap();
            loop {
                if let sea_core::MonitoredStreamItem::Item(event) =
                    events.next().await.unwrap().unwrap()
                {
                    assert_eq!(event.committed.position, receipt);
                    break;
                }
            }
            let old_registration = client
                .coordinate_snapshots(SnapshotParticipation::SeaSelected)
                .await
                .unwrap();
            let mut coordination = client
                .coordinate_snapshots(SnapshotParticipation::SeaSelected)
                .await
                .unwrap();
            drop(old_registration);
            let selected = coordination.next().await.unwrap().unwrap();
            let root_handle = client
                .put_blob(Bytes::from_static(b"snapshot-state"))
                .await
                .unwrap();
            let event_handle = client.resolve_position(receipt).await.unwrap().unwrap();
            let publish = client.publish_snapshot(
                None,
                selected.fence,
                Snapshot {
                    root: root_handle,
                    at_event: event_handle,
                },
            );
            let observed = async {
                while coordination.next().await.unwrap().unwrap().latest != Some(receipt) {}
            };
            let (published, ()) = timeout(Duration::from_secs(2), async {
                tokio::join!(publish, observed)
            })
            .await
            .expect("publication must not deadlock behind coordination reads");
            assert_eq!(published.unwrap().at_event.id(), receipt);
            drop(coordination);
            client.close().await.unwrap();
            shutdown
                .shutdown(ShutdownMode::Drain {
                    timeout: Duration::from_secs(2),
                })
                .unwrap();
        };
        let (result, ()) = tokio::join!(serving, exercise);
        result.unwrap();
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn server_survives_malformed_and_abandoned_response_streams() {
        let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
        let certificate_hash = identity.certificate_chain().as_slice()[0].hash();
        let server = WebTransportServer::bind(
            "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
            identity,
            Arc::new(BuiltInSeaHost::new(
                std::path::PathBuf::new(),
                StorageMode::Memory,
            )),
            TransportConfig {
                operation_timeout: Duration::from_millis(50),
                ..TransportConfig::default()
            },
        )
        .unwrap();
        let address = server.local_addr().unwrap();
        let shutdown = server.shutdown_handle();
        let serving = server.serve_until_shutdown();
        let exercise = async {
            // Framing failures terminate the offending connection, not the server.
            send_malformed_stream(address, certificate_hash.clone()).await;
            timeout_in_flight_frame(address, certificate_hash.clone()).await;

            malformed_snapshot_stream_releases_publisher(address, certificate_hash.clone()).await;

            // A fresh client proves the server remains usable after both framing failures.
            let client = NativeSeaClient::connect(
                format!("https://{address}/sea"),
                certificate_hash.clone(),
                ClientTransportConfig::default(),
                NativeSessionOpen {
                    archive: Bytes::new(),
                    intent: protocol::ArchiveIntent::Create,
                    reference: None,
                },
            )
            .await
            .unwrap();

            // Once committed, submissions and snapshots remain resolvable even when the
            // requester abandons its response stream before reading the acknowledgement.
            unknown_kind_rejects_suffix(address, certificate_hash.clone(), &client).await;
            let receipt =
                abandon_submission_and_resolve(address, certificate_hash.clone(), &client).await;
            abandon_snapshot_and_resolve(address, certificate_hash, &client, receipt).await;
            shutdown
                .shutdown(ShutdownMode::Drain {
                    timeout: Duration::from_secs(2),
                })
                .unwrap();
        };
        let (result, ()) = tokio::join!(serving, exercise);
        result.unwrap();
    }

    async fn malformed_snapshot_stream_releases_publisher(
        address: SocketAddr,
        certificate_hash: wtransport::tls::Sha256Digest,
    ) {
        let (_endpoint, connection) = raw_connection(address, certificate_hash.clone()).await;
        let (authority, document, _, _events) =
            open_raw_event_stream_with_intent(&connection, b"", protocol::ArchiveIntent::Create)
                .await;
        let (mut send, mut receive) = connection.open_bi().await.unwrap().await.unwrap();
        let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        send_raw_request(
            &mut send,
            protocol::Request::OpenSnapshotStream {
                authority,
                participation: protocol::SnapshotParticipation::SeaSelected,
            },
        )
        .await;
        assert_eq!(
            read_raw_response(&mut receive, &mut decoder, protocol::StreamRole::Snapshot).await,
            protocol::Response::Acknowledged
        );
        assert!(matches!(
            read_raw_response(&mut receive, &mut decoder, protocol::StreamRole::Snapshot).await,
            protocol::Response::SnapshotCoordination { fence: Some(_), .. }
        ));

        send_raw_request(
            &mut send,
            protocol::Request::AnnounceMembership {
                metadata: Vec::new(),
            },
        )
        .await;
        timeout(Duration::from_secs(2), send.stopped())
            .await
            .expect("malformed snapshot stream should be stopped");

        let (_observer_endpoint, observer_connection) =
            raw_connection(address, certificate_hash).await;
        let (observer_authority, _, _observer_events) =
            open_raw_event_stream(&observer_connection, &document).await;
        let (mut observer_send, mut observer_receive) =
            observer_connection.open_bi().await.unwrap().await.unwrap();
        let mut observer_decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        send_raw_request(
            &mut observer_send,
            protocol::Request::OpenSnapshotStream {
                authority: observer_authority,
                participation: protocol::SnapshotParticipation::SeaSelected,
            },
        )
        .await;
        assert_eq!(
            read_raw_response(
                &mut observer_receive,
                &mut observer_decoder,
                protocol::StreamRole::Snapshot
            )
            .await,
            protocol::Response::Acknowledged
        );
        assert!(matches!(
            read_raw_response(
                &mut observer_receive,
                &mut observer_decoder,
                protocol::StreamRole::Snapshot
            )
            .await,
            protocol::Response::SnapshotCoordination { fence: Some(_), .. }
        ));
        connection.close(0_u32.into(), b"fault injected");
        observer_connection.close(0_u32.into(), b"test complete");
    }

    async fn send_malformed_stream(
        address: SocketAddr,
        certificate_hash: wtransport::tls::Sha256Digest,
    ) {
        let (_endpoint, connection) = raw_connection(address, certificate_hash).await;
        let (mut send, mut receive) = connection.open_bi().await.unwrap().await.unwrap();
        send.write_all(b"bad!").await.unwrap();

        let _ = send.finish().await;
        let mut response = [0_u8; 1];
        let result = timeout(Duration::from_secs(2), receive.read(&mut response))
            .await
            .expect("malformed stream response should close");
        assert!(matches!(result, Ok(None) | Err(_)));

        timeout(Duration::from_secs(2), connection.closed())
            .await
            .expect("malformed message must close its owning connection");
        connection.close(0_u32.into(), b"fault injected");
    }

    async fn timeout_in_flight_frame(
        address: SocketAddr,
        certificate_hash: wtransport::tls::Sha256Digest,
    ) {
        let (_endpoint, connection) = raw_connection(address, certificate_hash).await;
        let (mut send, receive) = connection.open_bi().await.unwrap().await.unwrap();
        send.write_all(b"SE").await.unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        drop(send);
        drop(receive);
        connection.close(0_u32.into(), b"in-flight read cancelled");
    }

    async fn unknown_kind_rejects_suffix(
        address: SocketAddr,
        certificate_hash: wtransport::tls::Sha256Digest,
        client: &NativeSeaClient,
    ) {
        let (_endpoint, connection) = raw_connection(address, certificate_hash).await;
        let (authority, _, _events) =
            open_raw_event_stream(&connection, client.document().as_bytes()).await;
        let (mut send, mut receive) = connection.open_bi().await.unwrap().await.unwrap();
        let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        send_raw_request(&mut send, protocol::Request::OpenAuthorStream { authority }).await;
        assert_eq!(
            read_raw_response(&mut receive, &mut decoder, protocol::StreamRole::Author).await,
            protocol::Response::Acknowledged
        );
        send_raw_request(
            &mut send,
            protocol::Request::AnnounceMembership {
                metadata: Vec::new(),
            },
        )
        .await;
        let joined =
            match read_raw_response(&mut receive, &mut decoder, protocol::StreamRole::Author).await
            {
                protocol::Response::EventCommitted { position } => position,
                response => panic!("expected join receipt, got {response:?}"),
            };
        let request = |payload: &[u8]| protocol::Request::Submit {
            reference: None,
            event: protocol::Event {
                payload: payload.to_vec(),
                blob_tree: None,
            },
        };
        send_raw_request(&mut send, request(b"accepted-prefix")).await;
        assert!(matches!(
            read_raw_response(&mut receive, &mut decoder, protocol::StreamRole::Author).await,
            protocol::Response::EventCommitted { .. }
        ));
        let mut suffix = vec![0];
        suffix.extend(
            protocol::encode_request_frame(
                protocol::StreamRole::Author,
                &request(b"rejected-suffix"),
                protocol::Limits::default(),
            )
            .unwrap(),
        );
        send.write_all(&suffix).await.unwrap();
        timeout(Duration::from_secs(2), connection.closed())
            .await
            .expect("invalid kind closes connection");
        timeout(Duration::from_secs(2), async {
            let mut history = client.read(None, None);
            let mut applications = Vec::new();
            let mut session = None;
            while let Some(item) = history.next().await {
                if let sea_core::MonitoredStreamItem::Item(event) = item.unwrap() {
                    if event.committed.position.get() == joined {
                        session = Some(event.session_id.clone());
                    }
                    if session.as_ref() != Some(&event.session_id) {
                        continue;
                    }
                    if event.kind == sea_core::archive::SessionEventKind::Application {
                        applications.push(event.committed.event.payload);
                    }
                    if event.kind == sea_core::archive::SessionEventKind::Left {
                        assert_eq!(applications, vec![Bytes::from_static(b"accepted-prefix")]);
                        return;
                    }
                }
            }
            panic!("missing terminal departure");
        })
        .await
        .expect("accepted prefix and terminal departure survive connection failure");
    }

    async fn abandon_submission_and_resolve(
        address: SocketAddr,
        certificate_hash: wtransport::tls::Sha256Digest,
        client: &NativeSeaClient,
    ) -> EventPosition {
        let (_endpoint, connection) = raw_connection(address, certificate_hash).await;
        let (authority, session, _events) =
            open_raw_event_stream(&connection, client.document().as_bytes()).await;
        let (mut send, mut receive) = connection.open_bi().await.unwrap().await.unwrap();
        let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        send_raw_request(&mut send, protocol::Request::OpenAuthorStream { authority }).await;
        assert_eq!(
            read_raw_response(&mut receive, &mut decoder, protocol::StreamRole::Author).await,
            protocol::Response::Acknowledged
        );
        send_raw_request(
            &mut send,
            protocol::Request::Submit {
                reference: None,
                event: protocol::Event {
                    payload: b"committed-without-ack".to_vec(),
                    blob_tree: None,
                },
            },
        )
        .await;
        send.finish().await.unwrap();
        drop(receive);
        connection.close(0_u32.into(), b"response abandoned");
        timeout(Duration::from_secs(2), async {
            let mut history = client.read(None, None);
            while let Some(item) = history.next().await {
                if let sea_core::MonitoredStreamItem::Item(event) = item.unwrap()
                    && event.session_id.get() == session
                    && event.kind == sea_core::archive::SessionEventKind::Application
                {
                    assert_eq!(
                        event.committed.event.payload.as_ref(),
                        b"committed-without-ack"
                    );
                    return event.committed.position;
                }
            }
            panic!("history ended before committed submission");
        })
        .await
        .expect("submission should remain resolvable after acknowledgement loss")
    }

    async fn abandon_snapshot_and_resolve(
        address: SocketAddr,
        certificate_hash: wtransport::tls::Sha256Digest,
        client: &NativeSeaClient,
        receipt: EventPosition,
    ) {
        let blob = client
            .put_blob(Bytes::from_static(b"snapshot-content"))
            .await
            .unwrap();
        let root = client
            .put_directory(
                BlobDirectory::new(BTreeMap::from([("leaf".to_owned(), blob.id())])).unwrap(),
            )
            .await
            .unwrap();
        client.close().await.unwrap();
        let BlobTreeId::Directory(root) = root.id() else {
            panic!("directory");
        };
        abandon_raw_snapshot_publication(
            address,
            certificate_hash.clone(),
            client.document().as_bytes(),
            receipt,
            *root.as_bytes(),
        )
        .await;
        let resolver = NativeSeaClient::connect(
            format!("https://{address}/sea"),
            certificate_hash,
            ClientTransportConfig::default(),
            NativeSessionOpen {
                archive: client.document().as_bytes().clone(),
                intent: protocol::ArchiveIntent::Open,
                reference: None,
            },
        )
        .await
        .unwrap();
        timeout(Duration::from_secs(2), async {
            loop {
                if resolver
                    .get_snapshot(LoadStart::ReplayAtLeastAllAfter(receipt))
                    .await
                    .unwrap()
                    .is_some()
                {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("snapshot should remain resolvable after acknowledgement loss");
        resolver.close().await.unwrap();
    }

    async fn abandon_raw_snapshot_publication(
        address: SocketAddr,
        certificate_hash: wtransport::tls::Sha256Digest,
        document: &[u8],
        receipt: EventPosition,
        root: [u8; 32],
    ) {
        let (_endpoint, connection) = raw_connection(address, certificate_hash.clone()).await;
        let (authority, _, _events) = open_raw_event_stream(&connection, document).await;
        let (mut send, mut receive) = connection.open_bi().await.unwrap().await.unwrap();
        let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        send_raw_request(
            &mut send,
            protocol::Request::OpenSnapshotStream {
                authority,
                participation: protocol::SnapshotParticipation::SeaSelected,
            },
        )
        .await;
        assert_eq!(
            read_raw_response(&mut receive, &mut decoder, protocol::StreamRole::Snapshot).await,
            protocol::Response::Acknowledged
        );
        let protocol::Response::SnapshotCoordination {
            fence: Some(fence), ..
        } = read_raw_response(&mut receive, &mut decoder, protocol::StreamRole::Snapshot).await
        else {
            panic!("raw snapshot publisher should be nominated");
        };
        send_raw_request(
            &mut send,
            protocol::Request::PublishSnapshot {
                fence: Some(fence),
                expected_parent: None,
                at_event: receipt.get(),
                root: protocol::TreeId::Directory(root),
            },
        )
        .await;
        send.finish().await.unwrap();
        drop(receive);
        connection.close(0_u32.into(), b"response abandoned");
    }

    async fn raw_connection(
        address: SocketAddr,
        certificate_hash: wtransport::tls::Sha256Digest,
    ) -> (Endpoint<Client>, Connection) {
        let endpoint = Endpoint::client(
            ClientConfig::builder()
                .with_bind_default()
                .with_server_certificate_hashes([certificate_hash])
                .build(),
        )
        .unwrap();
        let connection = endpoint
            .connect(format!("https://{address}/sea"))
            .await
            .unwrap();
        (endpoint, connection)
    }

    async fn open_raw_event_stream(
        connection: &Connection,
        archive: &[u8],
    ) -> (Vec<u8>, u64, wtransport::RecvStream) {
        let (authority, _, allocated, events) =
            open_raw_event_stream_with_intent(connection, archive, protocol::ArchiveIntent::Open)
                .await;
        (authority, allocated, events)
    }

    async fn open_raw_event_stream_with_intent(
        connection: &Connection,
        archive: &[u8],
        intent: protocol::ArchiveIntent,
    ) -> (Vec<u8>, Vec<u8>, u64, wtransport::RecvStream) {
        let (mut send, mut receive) = connection.open_bi().await.unwrap().await.unwrap();
        send_raw_request(
            &mut send,
            protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: archive.to_vec(),
                intent,
                resume_after: None,
            },
        )
        .await;
        send.finish().await.unwrap();
        let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        let protocol::Response::EventStreamOpened {
            session,
            authority,
            document,
        } = read_raw_response(&mut receive, &mut decoder, protocol::StreamRole::Event).await
        else {
            panic!("raw event stream should return authority");
        };
        (authority, document, session, receive)
    }

    async fn send_raw_request(send: &mut wtransport::SendStream, request: protocol::Request) {
        let role = request.stream_role();
        let bytes =
            protocol::encode_request_frame(role, &request, protocol::Limits::default()).unwrap();
        send.write_all(&bytes).await.unwrap();
    }

    async fn read_raw_response(
        receive: &mut wtransport::RecvStream,
        decoder: &mut protocol::NetworkFrameDecoder,
        role: protocol::StreamRole,
    ) -> protocol::Response {
        let mut buffer = [0_u8; 1024];
        loop {
            if let Some(frame) = decoder.next_frame().unwrap() {
                return protocol::decode_response_network_frame(role, &frame).unwrap();
            }
            let count = receive
                .read(&mut buffer)
                .await
                .unwrap()
                .expect("response frame");
            decoder.push(&buffer[..count]);
        }
    }

    #[test]
    fn storage_mode_names_round_trip_and_reject_unknown_values() {
        for mode in [
            StorageMode::Memory,
            StorageMode::BufferedFile,
            StorageMode::DurableFile,
        ] {
            assert_eq!(StorageMode::from_name(mode.name()), Some(mode));
        }
        assert_eq!(StorageMode::from_name("unknown"), None);
    }
}
