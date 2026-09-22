//! Runtime-selected final Sea session hosting.

use std::{collections::BTreeMap, path::PathBuf, sync::Arc};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{StreamExt as _, stream};
use rand_core::{OsRng, RngCore as _};
use sea_core::storage::{DocumentId, SeaStorage};
use sea_core::{ClassifiedError, ErrorKind, EventPosition, archive::SessionId};
use sea_file::storage::FileStorage;
use sea_file_durable::storage::DurableStorage;
use sea_memory::MemoryStorage;
use sea_webtransport::protocol;
use tokio::{sync::Mutex, time::sleep};

use crate::{
    LivenessPolicy, SeaConnectionService, SeaResponseStream, SeaServiceHost, SessionDispatcher,
};

/// Serializes lazy runtime recovery within one backend namespace.
struct DocumentRegistry<Storage: sea_core::storage::SeaStorage> {
    /// Factory retaining the backend namespace independently of active views.
    storage: Storage,
    /// Serializes first recovery; failed attempts are never cached.
    documents: Mutex<BTreeMap<Vec<u8>, Arc<sea_sequencer::session::LocalSequencer<Storage>>>>,
}

impl<Storage: sea_core::storage::SeaStorage + 'static> DocumentRegistry<Storage> {
    /// Creates an empty cache over one backend namespace.
    fn new(storage: Storage) -> Self {
        Self {
            storage,
            documents: Mutex::new(BTreeMap::new()),
        }
    }

    /// Allocates a backend identity and retains its recovered exclusive view.
    async fn create(&self) -> Result<sea_core::storage::DocumentId, protocol::Response> {
        let mut documents = self.documents.lock().await;
        let (id, view) = self.storage.create_view().await.map_err(error_response)?;
        let runtime = sea_sequencer::session::LocalSequencer::recover(view)
            .await
            .map_err(error_response)?;
        documents.insert(id.as_bytes().to_vec(), runtime);
        Ok(id)
    }

    /// Shares the existing runtime or exclusively recovers one without caching failures.
    async fn open(
        &self,
        id: &sea_core::storage::DocumentId,
    ) -> Result<Arc<sea_sequencer::session::LocalSequencer<Storage>>, protocol::Response> {
        let mut documents = self.documents.lock().await;
        if let Some(runtime) = documents.get(id.as_bytes().as_ref()) {
            return Ok(runtime.clone());
        }
        let view = self
            .storage
            .open_view(id)
            .await
            .map_err(error_response)?
            .ok_or_else(|| rejected("document does not exist"))?;
        let runtime = sea_sequencer::session::LocalSequencer::recover(view)
            .await
            .map_err(error_response)?;
        documents.insert(id.as_bytes().to_vec(), runtime.clone());
        Ok(runtime)
    }
}

/// Runtime-selected factory and its exclusively owned document views.
enum Backend {
    /// Ephemeral process-local document namespace.
    Memory(DocumentRegistry<MemoryStorage>),
    /// Buffered journal namespace.
    Buffered(DocumentRegistry<FileStorage>),
    /// Crash-durable journal namespace.
    Durable(DocumentRegistry<DurableStorage>),
}

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

impl Backend {
    /// Opens a logical membership through the selected document registry.
    async fn open_session(
        &self,
        document: Vec<u8>,
        intent: protocol::ArchiveIntent,
        reference: Option<EventPosition>,
    ) -> Result<(DocumentId, SessionId, Arc<dyn SeaConnectionService>), protocol::Response> {
        match self {
            Self::Memory(registry) => open(registry, document, intent, reference).await,
            Self::Buffered(registry) => open(registry, document, intent, reference).await,
            Self::Durable(registry) => open(registry, document, intent, reference).await,
        }
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
    /// Ephemeral rooms independent of retained document runtimes.
    signals: Mutex<BTreeMap<Vec<u8>, std::sync::Weak<sea_signals::SignalRoom>>>,
    /// Storage namespace for file modes.
    root: PathBuf,
    /// Configured storage guarantees.
    mode: StorageMode,
    /// Successful factory initialization; errors leave this empty for retry.
    backend: Mutex<Option<Arc<Backend>>>,
}

/// Final Sea protocol host using the server's runtime-selected backend.
#[derive(Clone)]
pub struct BuiltInSeaHost {
    inner: Arc<HostInner>,
}

impl BuiltInSeaHost {
    /// Creates an empty archive registry rooted at `root`.
    #[must_use]
    pub fn new(root: PathBuf, mode: StorageMode) -> Self {
        Self {
            inner: Arc::new(HostInner {
                signals: Mutex::new(BTreeMap::new()),
                root,
                mode,
                backend: Mutex::new(None),
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
        let backend = self.backend().await?;
        backend.open_session(archive_id, intent, reference).await
    }

    /// Initializes storage without opening author membership.
    async fn backend(&self) -> Result<Arc<Backend>, protocol::Response> {
        let backend = {
            let mut current = self.inner.backend.lock().await;
            if current.is_none() {
                let root = self.inner.root.join("documents");
                let backend = match self.inner.mode {
                    StorageMode::Memory => {
                        Backend::Memory(DocumentRegistry::new(MemoryStorage::new()))
                    }
                    StorageMode::BufferedFile => Backend::Buffered(DocumentRegistry::new(
                        FileStorage::open(root).map_err(error_response)?,
                    )),
                    StorageMode::DurableFile => Backend::Durable(DocumentRegistry::new(
                        DurableStorage::open(root).map_err(error_response)?,
                    )),
                };
                *current = Some(Arc::new(backend));
            }
            current.as_ref().expect("backend initialized").clone()
        };
        Ok(backend)
    }
}

impl SeaServiceHost for BuiltInSeaHost {
    fn connect(&self, liveness: LivenessPolicy) -> Arc<dyn SeaConnectionService> {
        Arc::new(HostedConnection {
            signals: Mutex::new(None),
            host: self.clone(),
            session: Mutex::new(None),
            liveness,
        })
    }
}

struct HostedConnection {
    /// Current signal registration, released before author reconnect grace.
    signals: Mutex<Option<Arc<sea_signals::SignalConnection>>>,
    host: BuiltInSeaHost,
    session: Mutex<Option<HostedSession>>,
    liveness: LivenessPolicy,
}

struct HostedSession {
    authority: Vec<u8>,
    service: Arc<dyn SeaConnectionService>,
}

#[async_trait]
impl SeaConnectionService for HostedConnection {
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
        match backend.as_ref() {
            Backend::Memory(registry) => {
                registry.open(&id).await?;
            }
            Backend::Buffered(registry) => {
                registry.open(&id).await?;
            }
            Backend::Durable(registry) => {
                registry.open(&id).await?;
            }
        }
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

impl Clone for HostedSession {
    fn clone(&self) -> Self {
        Self {
            authority: self.authority.clone(),
            service: Arc::clone(&self.service),
        }
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

fn error_response(error: impl ClassifiedError) -> protocol::Response {
    let kind = error.kind();
    let message = error.to_string();
    drop(error);
    protocol::Response::Error {
        kind: match kind {
            ErrorKind::InvalidPosition => protocol::ErrorKind::Invalid,
            ErrorKind::StalePosition => protocol::ErrorKind::Stale,
            ErrorKind::Conflict => protocol::ErrorKind::Conflict,
            ErrorKind::Rejected => protocol::ErrorKind::Rejected,
            ErrorKind::Ambiguous => protocol::ErrorKind::Ambiguous,
            ErrorKind::Unavailable => protocol::ErrorKind::Unavailable,
            ErrorKind::Corrupt => protocol::ErrorKind::Corrupt,
        },
        message,
    }
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
        LivenessPolicy, SeaServiceHost, ShutdownDisposition, ShutdownMode, TransportConfig,
        WebTransportServer,
    };

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
        let root = std::env::temp_dir().join(format!(
            "sea-webtransport-event-open-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        let host = BuiltInSeaHost::new(root.clone(), StorageMode::Memory);
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
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn concurrent_close_is_idempotent_during_reconnect_grace() {
        let root = std::env::temp_dir().join(format!(
            "sea-webtransport-concurrent-close-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        let host = BuiltInSeaHost::new(root.clone(), StorageMode::Memory);
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
        let _ = std::fs::remove_dir_all(root);
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
    async fn immediate_shutdown_releases_session_without_reconnect_grace() {
        let root = std::env::temp_dir().join(format!(
            "sea-webtransport-immediate-shutdown-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
        let certificate_hash = identity.certificate_chain().as_slice()[0].hash();
        let server = WebTransportServer::bind(
            "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
            identity,
            Arc::new(BuiltInSeaHost::new(root.clone(), StorageMode::Memory)),
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
        let _ = std::fs::remove_dir_all(root);
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
        let root = std::env::temp_dir().join(format!(
            "sea-webtransport-server-fault-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
        let certificate_hash = identity.certificate_chain().as_slice()[0].hash();
        let server = WebTransportServer::bind(
            "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
            identity,
            Arc::new(BuiltInSeaHost::new(root.clone(), StorageMode::Memory)),
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
        let _ = std::fs::remove_dir_all(root);
    }

    async fn malformed_snapshot_stream_releases_publisher(
        address: SocketAddr,
        certificate_hash: wtransport::tls::Sha256Digest,
    ) {
        let (_endpoint, connection) = raw_connection(address, certificate_hash.clone()).await;
        let (authority, document, _, _events) = open_raw_event_stream_with_intent(
            &connection,
            b"",
            protocol::ArchiveIntent::Create,
            b"malformed-snapshot-session",
        )
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
            open_raw_event_stream(&observer_connection, &document, b"observer-session").await;
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
        let (authority, _, _events) = open_raw_event_stream(
            &connection,
            client.document().as_bytes(),
            b"invalid-suffix-session",
        )
        .await;
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
        let (authority, session, _events) = open_raw_event_stream(
            &connection,
            client.document().as_bytes(),
            b"submission-session",
        )
        .await;
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
        let (authority, _, _events) =
            open_raw_event_stream(&connection, document, b"snapshot-session").await;
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
        session: &[u8],
    ) -> (Vec<u8>, u64, wtransport::RecvStream) {
        let (authority, _, allocated, events) = open_raw_event_stream_with_intent(
            connection,
            archive,
            protocol::ArchiveIntent::Open,
            session,
        )
        .await;
        (authority, allocated, events)
    }

    async fn open_raw_event_stream_with_intent(
        connection: &Connection,
        archive: &[u8],
        intent: protocol::ArchiveIntent,
        _session: &[u8],
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
