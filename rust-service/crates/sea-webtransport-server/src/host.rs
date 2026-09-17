//! Runtime-selected final Sea session hosting.

use std::{collections::BTreeMap, path::PathBuf, sync::Arc};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{StreamExt as _, stream};
use rand_core::{OsRng, RngCore as _};
use sea_core::{
    ClassifiedError, ErrorKind, EventPosition,
    archive::{AuthorId, SessionId},
};
use sea_file::FileStream;
use sea_file_durable::DurableLog;
use sea_memory::MemoryStream;
use sea_sequencer::session::{LocalSequencer, LocalSession};
use sea_webtransport::protocol;
use tokio::{sync::Mutex, time::sleep};

use crate::{
    LivenessPolicy, SeaConnectionService, SeaResponseStream, SeaServiceHost, SessionDispatcher,
};

enum Archive {
    Memory(Arc<LocalSequencer<MemoryStream>>),
    Buffered(Arc<LocalSequencer<FileStream>>),
    Durable(Arc<LocalSequencer<DurableLog>>),
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

impl Archive {
    async fn open_session(
        &self,
        author: AuthorId,
        session: SessionId,
        reference: Option<EventPosition>,
    ) -> Result<Arc<dyn SeaConnectionService>, protocol::Response> {
        match self {
            Self::Memory(sequencer) => open(sequencer, author, session, reference).await,
            Self::Buffered(sequencer) => open(sequencer, author, session, reference).await,
            Self::Durable(sequencer) => open(sequencer, author, session, reference).await,
        }
    }
}

async fn open<S>(
    sequencer: &Arc<LocalSequencer<S>>,
    author: AuthorId,
    session: SessionId,
    reference: Option<EventPosition>,
) -> Result<Arc<dyn SeaConnectionService>, protocol::Response>
where
    S: sea_core::archive::SeaStorage + 'static,
{
    let session = sequencer
        .open_session(author, session, reference)
        .await
        .map_err(error_response)?;
    Ok(Arc::new(SessionDispatcher::new(Arc::new(session))))
}

struct HostState {
    archives: BTreeMap<Vec<u8>, Archive>,
}

struct HostInner {
    root: PathBuf,
    mode: StorageMode,
    state: Mutex<HostState>,
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
                root,
                mode,
                state: Mutex::new(HostState {
                    archives: BTreeMap::new(),
                }),
            }),
        }
    }

    async fn open_session(
        &self,
        archive_id: Vec<u8>,
        intent: protocol::ArchiveIntent,
        author: AuthorId,
        session: SessionId,
        reference: Option<EventPosition>,
        max_event_lag: usize,
    ) -> Result<Arc<dyn SeaConnectionService>, protocol::Response> {
        self.ensure_archive(&archive_id, intent, max_event_lag)
            .await?;
        let state = self.inner.state.lock().await;
        state
            .archives
            .get(&archive_id)
            .expect("archive was created or opened")
            .open_session(author, session, reference)
            .await
    }

    async fn ensure_archive(
        &self,
        archive_id: &[u8],
        intent: protocol::ArchiveIntent,
        max_event_lag: usize,
    ) -> Result<(), protocol::Response> {
        if archive_id.is_empty() || archive_id.len() > 256 {
            return Err(invalid("archive identity must contain 1 to 256 bytes"));
        }
        let mut state = self.inner.state.lock().await;
        let path = self.inner.root.join("archives").join(hex(archive_id));
        let persisted = self.inner.mode != StorageMode::Memory && path.exists();
        match intent {
            protocol::ArchiveIntent::Create
                if state.archives.contains_key(archive_id) || persisted =>
            {
                return Err(conflict("archive already exists"));
            }
            protocol::ArchiveIntent::Open
                if !state.archives.contains_key(archive_id) && !persisted =>
            {
                return Err(rejected("archive does not exist"));
            }
            _ => {}
        }
        if !state.archives.contains_key(archive_id) {
            let archive = match self.inner.mode {
                StorageMode::Memory => Archive::Memory(
                    LocalSequencer::recover_with_event_lag(
                        Arc::new(MemoryStream::new()),
                        max_event_lag,
                    )
                    .await
                    .map_err(error_response)?,
                ),
                StorageMode::BufferedFile => Archive::Buffered(
                    LocalSequencer::recover_with_event_lag(
                        Arc::new(FileStream::open(path).map_err(error_response)?),
                        max_event_lag,
                    )
                    .await
                    .map_err(error_response)?,
                ),
                StorageMode::DurableFile => Archive::Durable(
                    LocalSequencer::recover_with_event_lag(
                        Arc::new(DurableLog::open(path).map_err(error_response)?),
                        max_event_lag,
                    )
                    .await
                    .map_err(error_response)?,
                ),
            };
            state.archives.insert(archive_id.to_vec(), archive);
        }
        Ok(())
    }
}

impl SeaServiceHost for BuiltInSeaHost {
    fn connect(&self, liveness: LivenessPolicy) -> Arc<dyn SeaConnectionService> {
        Arc::new(HostedConnection {
            host: self.clone(),
            session: Mutex::new(None),
            liveness,
        })
    }
}

struct HostedConnection {
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
    async fn connection_closed(&self, allow_reconnect_grace: bool) {
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
            author,
            session,
            resume_after,
        } = request
        {
            if version != protocol::PROTOCOL_VERSION {
                return Err(unsupported_version(version));
            }
            let author = AuthorId::new(Bytes::from(author))
                .map_err(|_| invalid("author identity is empty"))?;
            let session_id = SessionId::new(Bytes::from(session))
                .map_err(|_| invalid("session identity is empty"))?;
            let mut current = self.session.lock().await;
            if let Some(previous) = current.take() {
                let _ = previous
                    .service
                    .author_request(protocol::Request::Close)
                    .await;
            }
            let service = self
                .host
                .open_session(
                    archive,
                    intent,
                    author,
                    session_id,
                    resume_after.map(EventPosition::new),
                    self.liveness.max_event_lag,
                )
                .await?;
            let authority = new_authority();
            *current = Some(HostedSession {
                authority: authority.clone(),
                service: Arc::clone(&service),
            });
            let opened =
                stream::once(async move { protocol::Response::EventStreamOpened { authority } });
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

fn hex(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        write!(encoded, "{byte:02x}").expect("writing to a string cannot fail");
    }
    encoded
}

fn invalid(message: &str) -> protocol::Response {
    protocol::Response::Error {
        kind: protocol::ErrorKind::Invalid,
        message: message.to_owned(),
    }
}

fn conflict(message: &str) -> protocol::Response {
    protocol::Response::Error {
        kind: protocol::ErrorKind::Conflict,
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

#[allow(dead_code)]
fn _assert_session_is_send_sync<S: sea_core::archive::SeaStorage>()
where
    LocalSession<S>: Send + Sync,
{
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, net::SocketAddr, sync::Arc, time::Duration};

    use bytes::Bytes;
    use futures_util::StreamExt as _;
    use sea_core::{
        BlobDirectory, BlobTreeId, Event,
        archive::{
            AuthorId, EventReceipt, EventSubmission, LoadEvent, OperationId, SeaArchive,
            SeaAuthorSession, SeaEventSubscription, SeaSnapshotCoordinator, SessionId,
        },
    };
    use sea_webtransport::{
        NativeSeaClient, NativeSessionOpen, TransportConfig as ClientTransportConfig, protocol,
    };
    use tokio::time::timeout;
    use wtransport::{
        ClientConfig, Connection, Endpoint, Identity, endpoint::endpoint_side::Client,
    };

    use super::{BuiltInSeaHost, StorageMode};
    use crate::{
        LivenessPolicy, SeaServiceHost, ShutdownDisposition, ShutdownMode, TransportConfig,
        WebTransportServer,
    };

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
            assert!(matches!(
                open_hosted_session(&host, protocol::ArchiveIntent::Open, b"missing-session").await,
                protocol::Response::Error {
                    kind: protocol::ErrorKind::Rejected,
                    ..
                }
            ));
            assert!(matches!(
                open_hosted_session_with_version(
                    &host,
                    protocol::PROTOCOL_VERSION + 1,
                    protocol::ArchiveIntent::Create,
                    b"invalid-version-session",
                )
                .await,
                protocol::Response::Error {
                    kind: protocol::ErrorKind::Rejected,
                    ..
                }
            ));
            assert_eq!(
                open_hosted_session(&host, protocol::ArchiveIntent::Create, b"create-session")
                    .await,
                protocol::Response::Acknowledged
            );
            assert!(matches!(
                open_hosted_session(&host, protocol::ArchiveIntent::Create, b"conflict-session")
                    .await,
                protocol::Response::Error {
                    kind: protocol::ErrorKind::Conflict,
                    ..
                }
            ));
            assert_eq!(
                open_hosted_session(&host, protocol::ArchiveIntent::Open, b"open-session").await,
                protocol::Response::Acknowledged
            );

            if mode != StorageMode::Memory {
                drop(host);
                let recovered = BuiltInSeaHost::new(root.clone(), mode);
                assert_eq!(
                    open_hosted_session(
                        &recovered,
                        protocol::ArchiveIntent::Open,
                        b"recovered-session",
                    )
                    .await,
                    protocol::Response::Acknowledged
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
                archive: b"archive".to_vec(),
                intent: protocol::ArchiveIntent::Create,
                author: b"first-author".to_vec(),
                session: b"first-session".to_vec(),
                resume_after: None,
            })
            .await
            .expect("first event stream");
        let protocol::Response::EventStreamOpened {
            authority: first_authority,
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
                status: protocol::StreamStatus::StreamingBacklog,
                ..
            })
        ));
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
                archive: b"archive".to_vec(),
                intent: protocol::ArchiveIntent::Open,
                author: b"second-author".to_vec(),
                session: b"second-session".to_vec(),
                resume_after: None,
            })
            .await
            .expect("second event stream");
        let protocol::Response::EventStreamOpened {
            authority: second_authority,
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
        assert!(matches!(
            second
                .snapshot_request(protocol::Request::PublishSnapshot {
                    fence: Some(first_fence),
                    operation: b"non-nominee".to_vec(),
                    expected_parent: None,
                    at_event: protocol::SnapshotPosition::Initial,
                    root: protocol::TreeId::Blob([0; 32]),
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
                archive: b"archive".to_vec(),
                intent: protocol::ArchiveIntent::Open,
                author: b"client-selected-author".to_vec(),
                session: b"client-selected-session".to_vec(),
                resume_after: None,
            })
            .await
            .expect("client-selected event stream");
        let protocol::Response::EventStreamOpened {
            authority: client_authority,
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
                    operation: b"suppressed-nominee".to_vec(),
                    expected_parent: None,
                    at_event: protocol::SnapshotPosition::Initial,
                    root: protocol::TreeId::Blob([0; 32]),
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
                .author_request(protocol::Request::ResolveSubmission {
                    operation: b"closed-author".to_vec(),
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
                archive: b"archive".to_vec(),
                intent: protocol::ArchiveIntent::Create,
                author: b"author".to_vec(),
                session: b"session".to_vec(),
                resume_after: None,
            })
            .await
            .unwrap();
        let protocol::Response::EventStreamOpened { authority } =
            events.next().await.expect("event authority")
        else {
            panic!("event stream must return authority");
        };
        assert_eq!(
            connection
                .author_request(protocol::Request::OpenAuthorStream { authority })
                .await,
            protocol::Response::Acknowledged
        );
        let cleanup = connection.connection_closed(true);
        let explicit = async {
            tokio::task::yield_now().await;
            connection.author_request(protocol::Request::Close).await
        };
        let ((), response) = tokio::join!(cleanup, explicit);
        assert_eq!(response, protocol::Response::Acknowledged);
        connection.connection_closed(false).await;
        assert!(matches!(
            connection
                .author_request(protocol::Request::ResolveSubmission {
                    operation: b"after-close".to_vec(),
                })
                .await,
            protocol::Response::Error {
                kind: protocol::ErrorKind::Invalid,
                ..
            }
        ));
        let _ = std::fs::remove_dir_all(root);
    }

    async fn open_hosted_session(
        host: &BuiltInSeaHost,
        intent: protocol::ArchiveIntent,
        session: &[u8],
    ) -> protocol::Response {
        open_hosted_session_with_version(host, protocol::PROTOCOL_VERSION, intent, session).await
    }

    async fn open_hosted_session_with_version(
        host: &BuiltInSeaHost,
        version: u16,
        intent: protocol::ArchiveIntent,
        session: &[u8],
    ) -> protocol::Response {
        match host
            .connect(LivenessPolicy::default())
            .open_event_stream(protocol::Request::OpenEventStream {
                version,
                archive: b"archive".to_vec(),
                intent,
                author: session.to_vec(),
                session: session.to_vec(),
                resume_after: None,
            })
            .await
        {
            Ok(mut stream) => match stream.next().await {
                Some(protocol::Response::EventStreamOpened { .. }) => {
                    protocol::Response::Acknowledged
                }
                Some(response) => response,
                None => protocol::Response::Error {
                    kind: protocol::ErrorKind::Unavailable,
                    message: "event stream ended before opening".to_owned(),
                },
            },
            Err(response) => response,
        }
    }

    #[tokio::test]
    async fn idle_stream_outlives_operation_deadline_in_every_storage_mode() {
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
                    archive: Bytes::from_static(b"shutdown-archive"),
                    intent: protocol::ArchiveIntent::Create,
                    author: AuthorId::new(Bytes::from_static(b"shutdown-author")).unwrap(),
                    session: SessionId::new(Bytes::from_static(b"shutdown-session")).unwrap(),
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
            let client = NativeSeaClient::connect(
                format!("https://{address}/sea"),
                certificate_hash,
                ClientTransportConfig::default(),
                NativeSessionOpen {
                    archive: Bytes::from_static(b"archive"),
                    intent: protocol::ArchiveIntent::Create,
                    author: AuthorId::new(Bytes::from_static(b"author")).unwrap(),
                    session: SessionId::new(Bytes::from_static(b"session")).unwrap(),
                    reference: None,
                },
            )
            .await
            .unwrap();
            let mut events = client.load(None);
            assert!(matches!(
                events.next().await.unwrap().unwrap(),
                sea_core::MonitoredStreamItem::Progress(progress)
                    if progress.status == sea_core::MonitoredStreamStatus::StreamingBacklog
            ));
            assert!(matches!(
                events.next().await.unwrap().unwrap(),
                sea_core::MonitoredStreamItem::Progress(progress)
                    if progress.previous.is_none()
                        && progress.latest_known.is_none()
                        && progress.status == sea_core::MonitoredStreamStatus::AwaitingNewItems
            ));
            tokio::time::sleep(Duration::from_millis(100)).await;
            let receipt = client
                .submit(EventSubmission {
                    operation_id: OperationId::new(Bytes::from_static(b"native-event")).unwrap(),
                    reference: None,
                    event: Event {
                        payload: Bytes::from_static(b"native-payload"),
                        blob_tree: None,
                    },
                })
                .await
                .unwrap();
            assert!(matches!(
                events.next().await.unwrap().unwrap(),
                sea_core::MonitoredStreamItem::Progress(progress)
                    if progress.latest_known == Some(receipt.position)
            ));
            assert!(matches!(
                events.next().await.unwrap().unwrap(),
                sea_core::MonitoredStreamItem::Item(LoadEvent::Event(event))
                    if event.committed.position == receipt.position
            ));
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
            // Framing failures must terminate only the offending stream, not the server.
            send_malformed_stream(address, certificate_hash.clone()).await;
            timeout_in_flight_frame(address, certificate_hash.clone()).await;

            // A fresh client proves the server remains usable after both framing failures.
            let client = NativeSeaClient::connect(
                format!("https://{address}/sea"),
                certificate_hash.clone(),
                ClientTransportConfig::default(),
                NativeSessionOpen {
                    archive: Bytes::from_static(b"fault-archive"),
                    intent: protocol::ArchiveIntent::Create,
                    author: AuthorId::new(Bytes::from_static(b"observer-author")).unwrap(),
                    session: SessionId::new(Bytes::from_static(b"observer-session")).unwrap(),
                    reference: None,
                },
            )
            .await
            .unwrap();

            // Once committed, submissions and snapshots remain resolvable even when the
            // requester abandons its response stream before reading the acknowledgement.
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

    async fn send_malformed_stream(
        address: SocketAddr,
        certificate_hash: wtransport::tls::Sha256Digest,
    ) {
        let (_endpoint, connection) = raw_connection(address, certificate_hash).await;
        let (mut send, receive) = connection.open_bi().await.unwrap().await.unwrap();
        send.write_all(b"bad!").await.unwrap();

        // The server may reject the malformed frame and send STOP_SENDING before this
        // finish completes. Both a clean finish and that peer stop mean the bytes were
        // delivered; later requests in the test verify that the server survived them.
        let _ = send.finish().await;
        drop(receive);
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

    async fn abandon_submission_and_resolve(
        address: SocketAddr,
        certificate_hash: wtransport::tls::Sha256Digest,
        client: &NativeSeaClient,
    ) -> EventReceipt {
        let operation = OperationId::new(Bytes::from_static(b"lost-event-ack")).unwrap();
        let (_endpoint, connection) = raw_connection(address, certificate_hash).await;
        let (authority, _events) = open_raw_event_stream(
            &connection,
            b"fault-archive",
            b"submission-author",
            b"submission-session",
        )
        .await;
        let (mut send, mut receive) = connection.open_bi().await.unwrap().await.unwrap();
        let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        send_raw_request(
            &mut send,
            2,
            protocol::Request::OpenAuthorStream { authority },
        )
        .await;
        assert_eq!(
            read_raw_response(&mut receive, &mut decoder, protocol::StreamRole::Author, 2,).await,
            protocol::Response::Acknowledged
        );
        send_raw_request(
            &mut send,
            3,
            protocol::Request::Submit {
                operation: operation.as_bytes().to_vec(),
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
            loop {
                if let Some(receipt) = client.resolve_submission(&operation).await.unwrap() {
                    break receipt;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("submission should remain resolvable after acknowledgement loss")
    }

    async fn abandon_snapshot_and_resolve(
        address: SocketAddr,
        certificate_hash: wtransport::tls::Sha256Digest,
        client: &NativeSeaClient,
        receipt: EventReceipt,
    ) {
        let blob = client
            .put_blob(Bytes::from_static(b"snapshot-content"))
            .await
            .unwrap();
        let root = client
            .put_directory(
                BlobDirectory::new(BTreeMap::from([(
                    "leaf".to_owned(),
                    BlobTreeId::Blob(blob),
                )]))
                .unwrap(),
            )
            .await
            .unwrap();
        let operation = OperationId::new(Bytes::from_static(b"lost-snapshot-ack")).unwrap();
        client.close().await.unwrap();
        abandon_raw_snapshot_publication(
            address,
            certificate_hash.clone(),
            &operation,
            receipt,
            *root.as_bytes(),
        )
        .await;
        let resolver = NativeSeaClient::connect(
            format!("https://{address}/sea"),
            certificate_hash,
            ClientTransportConfig::default(),
            NativeSessionOpen {
                archive: Bytes::from_static(b"fault-archive"),
                intent: protocol::ArchiveIntent::Open,
                author: AuthorId::new(Bytes::from_static(b"snapshot-resolver-author")).unwrap(),
                session: SessionId::new(Bytes::from_static(b"snapshot-resolver-session")).unwrap(),
                reference: None,
            },
        )
        .await
        .unwrap();
        timeout(Duration::from_secs(2), async {
            loop {
                if resolver
                    .resolve_snapshot_publication(&operation)
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
        operation: &OperationId,
        receipt: EventReceipt,
        root: [u8; 32],
    ) {
        let (_endpoint, connection) = raw_connection(address, certificate_hash.clone()).await;
        let (authority, _events) = open_raw_event_stream(
            &connection,
            b"fault-archive",
            b"snapshot-author",
            b"snapshot-session",
        )
        .await;
        let (mut send, mut receive) = connection.open_bi().await.unwrap().await.unwrap();
        let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        send_raw_request(
            &mut send,
            2,
            protocol::Request::OpenSnapshotStream {
                authority,
                participation: protocol::SnapshotParticipation::SeaSelected,
            },
        )
        .await;
        assert_eq!(
            read_raw_response(
                &mut receive,
                &mut decoder,
                protocol::StreamRole::Snapshot,
                2,
            )
            .await,
            protocol::Response::Acknowledged
        );
        let protocol::Response::SnapshotCoordination {
            fence: Some(fence), ..
        } = read_raw_response(
            &mut receive,
            &mut decoder,
            protocol::StreamRole::Snapshot,
            0,
        )
        .await
        else {
            panic!("raw snapshot publisher should be nominated");
        };
        send_raw_request(
            &mut send,
            3,
            protocol::Request::PublishSnapshot {
                fence: Some(fence),
                operation: operation.as_bytes().to_vec(),
                expected_parent: None,
                at_event: protocol::SnapshotPosition::At(receipt.position.get()),
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
        author: &[u8],
        session: &[u8],
    ) -> (Vec<u8>, wtransport::RecvStream) {
        let (mut send, mut receive) = connection.open_bi().await.unwrap().await.unwrap();
        send_raw_request(
            &mut send,
            1,
            protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: archive.to_vec(),
                intent: protocol::ArchiveIntent::Open,
                author: author.to_vec(),
                session: session.to_vec(),
                resume_after: None,
            },
        )
        .await;
        send.finish().await.unwrap();
        let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        let protocol::Response::EventStreamOpened { authority } =
            read_raw_response(&mut receive, &mut decoder, protocol::StreamRole::Event, 1).await
        else {
            panic!("raw event stream should return authority");
        };
        (authority, receive)
    }

    async fn send_raw_request(
        send: &mut wtransport::SendStream,
        correlation_id: u64,
        request: protocol::Request,
    ) {
        let role = request.stream_role();
        let bytes = protocol::encode_request_frame(
            role,
            correlation_id,
            &request,
            protocol::Limits::default(),
        )
        .unwrap();
        send.write_all(&bytes).await.unwrap();
    }

    async fn read_raw_response(
        receive: &mut wtransport::RecvStream,
        decoder: &mut protocol::NetworkFrameDecoder,
        role: protocol::StreamRole,
        correlation_id: u64,
    ) -> protocol::Response {
        let mut buffer = [0_u8; 1024];
        loop {
            if let Some(frame) = decoder.next_frame().unwrap() {
                assert_eq!(frame.correlation_id, correlation_id);
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
