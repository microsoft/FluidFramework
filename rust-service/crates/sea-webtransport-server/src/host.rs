//! Runtime-selected final Sea session hosting.

use std::{collections::BTreeMap, path::PathBuf, sync::Arc};

use async_trait::async_trait;
use bytes::Bytes;
use sea_core::{
    ClassifiedError, ErrorKind, EventPosition,
    archive::{AuthorId, SessionId},
};
use sea_file::FileStream;
use sea_file_durable::DurableLog;
use sea_memory::MemoryStream;
use sea_sequencer::session::{LocalSequencer, LocalSession};
use sea_webtransport::{
    SeaConnectionService, SeaResponseStream, SeaServiceHost, SessionDispatcher, protocol,
};
use tokio::sync::Mutex;

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
    pub fn from_name(value: &str) -> Option<Self> {
        match value {
            "memory" => Some(Self::Memory),
            "buffered-file" => Some(Self::BufferedFile),
            "durable-file" => Some(Self::DurableFile),
            _ => None,
        }
    }

    /// Returns the stable command-line backend name.
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
        author: AuthorId,
        session: SessionId,
        reference: Option<EventPosition>,
    ) -> Result<Arc<dyn SeaConnectionService>, protocol::Response> {
        if archive_id.is_empty() || archive_id.len() > 256 {
            return Err(invalid("archive identity must contain 1 to 256 bytes"));
        }
        let mut state = self.inner.state.lock().await;
        if !state.archives.contains_key(&archive_id) {
            let path = self.inner.root.join("archives").join(hex(&archive_id));
            let archive = match self.inner.mode {
                StorageMode::Memory => Archive::Memory(
                    LocalSequencer::recover(Arc::new(MemoryStream::new()))
                        .await
                        .map_err(error_response)?,
                ),
                StorageMode::BufferedFile => Archive::Buffered(
                    LocalSequencer::recover(Arc::new(
                        FileStream::open(path).map_err(error_response)?,
                    ))
                    .await
                    .map_err(error_response)?,
                ),
                StorageMode::DurableFile => Archive::Durable(
                    LocalSequencer::recover(Arc::new(
                        DurableLog::open(path).map_err(error_response)?,
                    ))
                    .await
                    .map_err(error_response)?,
                ),
            };
            state.archives.insert(archive_id.clone(), archive);
        }
        state
            .archives
            .get(&archive_id)
            .expect("archive was inserted")
            .open_session(author, session, reference)
            .await
    }
}

impl SeaServiceHost for BuiltInSeaHost {
    fn connect(&self) -> Arc<dyn SeaConnectionService> {
        Arc::new(HostedConnection {
            host: self.clone(),
            session: Mutex::new(None),
        })
    }
}

struct HostedConnection {
    host: BuiltInSeaHost,
    session: Mutex<Option<Arc<dyn SeaConnectionService>>>,
}

#[async_trait]
impl SeaConnectionService for HostedConnection {
    async fn request(&self, request: protocol::Request) -> protocol::Response {
        if let protocol::Request::OpenSession {
            archive,
            author,
            session,
            reference,
        } = request
        {
            let Ok(author) = AuthorId::new(Bytes::from(author)) else {
                return invalid("author identity is empty");
            };
            let Ok(session_id) = SessionId::new(Bytes::from(session)) else {
                return invalid("session identity is empty");
            };
            let mut current = self.session.lock().await;
            if let Some(previous) = current.take() {
                let _ = previous.request(protocol::Request::Close).await;
            }
            match self
                .host
                .open_session(
                    archive,
                    author,
                    session_id,
                    reference.map(EventPosition::new),
                )
                .await
            {
                Ok(session) => {
                    *current = Some(session);
                    protocol::Response::Acknowledged
                }
                Err(error) => error,
            }
        } else {
            let session = self.session.lock().await.clone();
            match session {
                Some(session) => session.request(request).await,
                None => invalid("OpenSession is required before session operations"),
            }
        }
    }

    async fn stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        let session = self.session.lock().await.clone();
        match session {
            Some(session) => session.stream(request).await,
            None => Err(invalid("OpenSession is required before session streams")),
        }
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
    use std::{net::SocketAddr, sync::Arc, time::Duration};

    use bytes::Bytes;
    use futures_util::StreamExt as _;
    use sea_core::{
        Event,
        archive::{AuthorId, EventSubmission, LoadEvent, OperationId, SeaSession, SessionId},
    };
    use sea_webtransport::{NativeSeaClient, ShutdownMode, TransportConfig, WebTransportServer};
    use wtransport::Identity;

    use super::{BuiltInSeaHost, StorageMode};

    #[tokio::test]
    async fn native_client_round_trips_every_storage_mode() {
        for mode in [
            StorageMode::Memory,
            StorageMode::BufferedFile,
            StorageMode::DurableFile,
        ] {
            native_client_round_trip(mode).await;
        }
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
            TransportConfig::default(),
        )
        .unwrap();
        let address = server.local_addr().unwrap();
        let shutdown = server.shutdown_handle();
        let serving = server.serve_until_shutdown();
        let exercise = async {
            let client = NativeSeaClient::connect(
                format!("https://{address}/sea"),
                certificate_hash,
                TransportConfig::default(),
                Bytes::from_static(b"archive"),
                AuthorId::new(Bytes::from_static(b"author")).unwrap(),
                SessionId::new(Bytes::from_static(b"session")).unwrap(),
                None,
            )
            .await
            .unwrap();
            let receipt = client
                .submit(EventSubmission {
                    operation_id: OperationId::new(Bytes::from_static(b"operation")).unwrap(),
                    reference: None,
                    event: Event {
                        payload: Bytes::from_static(b"payload"),
                        blob_tree: None,
                    },
                })
                .await
                .unwrap();
            let mut load = client.load(None).await.unwrap();
            let LoadEvent::Event(event) = load.next().await.unwrap().unwrap() else {
                panic!("load should begin with the committed event");
            };
            assert_eq!(event.committed.position, receipt.position);
            assert_eq!(
                event.committed.event.payload,
                Bytes::from_static(b"payload")
            );
            assert!(matches!(
                load.next().await.unwrap().unwrap(),
                LoadEvent::CaughtUp(Some(_))
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
