//! Exercises application policy construction through the public host and protocol interfaces.

use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};

use async_trait::async_trait;
use futures_util::{StreamExt as _, poll};
use sea_core::{
    ClassifiedError, ErrorKind, EventPosition, SeaAuthorSession as _,
    factory::{PassThroughFactory, SessionFactory},
    policy::{DocumentPolicy, PolicyFactory, WriteRequest},
    storage::DocumentId,
};
use sea_file::pressure::DurableWritePressure;
use sea_sequencer::session::LiveCachePressure;
use sea_webtransport::protocol;
use sea_webtransport_server::{
    DocumentContext, DocumentHost, LivenessPolicy, PassThrough, SeaConnectionService,
    SeaProtocolHost, SeaResponseStream, SeaServiceHost, SessionDecorator, SessionSetup,
    StorageSetup,
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

#[tokio::test]
async fn direct_and_protocol_sessions_share_document_policy_and_shutdown() {
    let probe = Arc::new(Probe::default());
    let documents = DocumentHost::new(
        StorageSetup::memory(),
        SessionSetup::default().decorate(PreserveReaders(probe.clone())),
    )
    .unwrap();
    let id = documents.create_document().await.unwrap();
    let direct = documents.open_session(&id, None).await.unwrap().session;
    let protocol = SeaProtocolHost::new(documents.clone());
    let (_, reader, mut events) = open(&protocol, Some(&id)).await;
    catch_up(&mut events).await;
    assert_eq!(probe.documents.lock().unwrap().len(), 1);
    assert_eq!(probe.sessions.load(Ordering::SeqCst), 2);

    let event = |value| sea_core::EventSubmission {
        reference: None,
        event: sea_core::Event {
            payload: bytes::Bytes::from(vec![value]),
            blob_tree: None,
        },
    };
    direct.submit(event(1)).await.unwrap();
    let waiting = direct.submit(event(2));
    tokio::pin!(waiting);
    assert!(
        poll!(&mut waiting).is_pending(),
        "protocol reader retains the direct write"
    );
    assert_eq!(catch_up(&mut events).await, vec![vec![1]]);
    waiting.await.unwrap();
    direct.close().await.unwrap();
    assert_eq!(catch_up(&mut events).await, vec![vec![2]]);
    drop(events);
    reader.connection_closed(false).await;
    protocol.shutdown().await.unwrap();
    assert!(matches!(
        documents.ensure_document(&id).await,
        Err(sea_webtransport_server::HostError::Closed)
    ));
}

/// Records construction and session admission without retaining a document or policy.
#[derive(Default)]
struct Probe {
    /// One entry for each successfully recovered document opening.
    documents: Mutex<Vec<(DocumentId, bool)>>,
    /// Counts sessions admitted by all constructed policies.
    sessions: AtomicUsize,
    /// Detects policies that outlive their final host/session owner.
    dropped: AtomicUsize,
}

/// Selects reader-preserving backpressure instead of the built-in shedding policy.
struct PreserveReaders(Arc<Probe>);

/// Records generic decorator construction independently of policy-specific behavior.
struct Record {
    /// Distinguishes inner and outer construction.
    label: &'static str,
    /// Construction order and opening-local identity.
    calls: Arc<Mutex<Vec<(&'static str, DocumentId)>>>,
}

impl<S: SessionFactory<Session: 'static> + 'static, E: ClassifiedError> SessionDecorator<S, E>
    for Record
{
    type Factory = PassThroughFactory<S>;

    fn decorate(&self, source: S, context: &DocumentContext<'_, E>) -> Self::Factory {
        assert!(context.output.is_none());
        assert!(context.storage.is_none());
        self.calls
            .lock()
            .unwrap()
            .push((self.label, context.document.clone()));
        PassThroughFactory::new(source)
    }
}

#[tokio::test]
async fn decorators_compose_once_in_order_without_cache_and_memory_hosts_are_independent() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let documents = DocumentHost::new(
        StorageSetup::memory(),
        SessionSetup::default()
            .with_live_cache(false)
            .decorate(Record {
                label: "inner",
                calls: calls.clone(),
            })
            .decorate(Record {
                label: "outer",
                calls: calls.clone(),
            }),
    )
    .unwrap();
    let host = SeaProtocolHost::new(documents);
    assert!(calls.lock().unwrap().is_empty());
    let (id, first, first_events) = open(&host, None).await;
    let (_, second, second_events) = open(&host.clone(), Some(&id)).await;
    assert_eq!(
        *calls.lock().unwrap(),
        vec![("inner", id.clone()), ("outer", id.clone())]
    );
    let (other_id, other, other_events) = open(&host, None).await;
    assert_ne!(id, other_id);
    assert_eq!(
        *calls.lock().unwrap(),
        vec![
            ("inner", id.clone()),
            ("outer", id.clone()),
            ("inner", other_id.clone()),
            ("outer", other_id),
        ]
    );
    let independent = SeaProtocolHost::new(
        DocumentHost::new(StorageSetup::memory(), SessionSetup::default()).unwrap(),
    );
    let connection = independent.connect(LivenessPolicy::default());
    assert!(
        connection
            .open_event_stream(protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                intent: protocol::ArchiveIntent::Open,
                archive: id.as_bytes().to_vec(),
                resume_after: None,
            })
            .await
            .is_err()
    );
    drop((first_events, second_events, other_events));
    first.connection_closed(false).await;
    second.connection_closed(false).await;
    other.connection_closed(false).await;
    host.shutdown().await.unwrap();
    independent.shutdown().await.unwrap();
}

impl<S: SessionFactory<Session: 'static> + 'static, E: ClassifiedError> SessionDecorator<S, E>
    for PreserveReaders
{
    type Factory = PolicyFactory<S, ReaderPolicy<E>>;

    fn requires_live_cache(&self) -> bool {
        true
    }

    fn decorate(&self, source: S, context: &DocumentContext<'_, E>) -> Self::Factory {
        let output = context.output.clone().expect("host validated live caching");
        let storage = context.storage.clone();
        assert!(output.current().is_ok());
        if let Some(storage) = &storage {
            assert!(storage.current().is_ok());
        }
        self.0
            .documents
            .lock()
            .unwrap()
            .push((context.document.clone(), storage.is_some()));
        PolicyFactory::new(
            source,
            Arc::new(ReaderPolicy {
                probe: self.0.clone(),
                output,
                storage,
                writes: Arc::new(Semaphore::new(2)),
                readers: Arc::new(Semaphore::new(8)),
            }),
        )
    }
}

/// Configures the same application decorator over each runtime-selected storage recipe.
fn host(root: std::path::PathBuf, mode: &str, probe: Arc<Probe>) -> SeaProtocolHost {
    let sessions = SessionSetup::default()
        .decorate(PreserveReaders(probe))
        .decorate(PassThrough);
    match mode {
        "memory" => DocumentHost::new(StorageSetup::memory(), sessions).map(SeaProtocolHost::new),
        "buffered-file" => {
            DocumentHost::new(StorageSetup::buffered(root), sessions).map(SeaProtocolHost::new)
        }
        "durable-file" => {
            DocumentHost::new(StorageSetup::durable(root), sessions).map(SeaProtocolHost::new)
        }
        _ => panic!("unknown backend"),
    }
    .unwrap()
}

/// Keeps small pending writes bounded while waiting for readers to dequeue prior events.
struct ReaderPolicy<E> {
    /// Construction and lifecycle evidence independent of source ownership.
    probe: Arc<Probe>,
    /// Document-local read progress, excluding transport delivery.
    output: LiveCachePressure<E>,
    /// Durable-only admission observation.
    storage: Option<DurableWritePressure>,
    /// Bounds concurrent waiters retaining at most 1 KiB inputs each.
    writes: Arc<Semaphore>,
    /// Bounds pending and returned live streams.
    readers: Arc<Semaphore>,
}

impl<E> Drop for ReaderPolicy<E> {
    fn drop(&mut self) {
        self.probe.dropped.fetch_add(1, Ordering::SeqCst);
    }
}

/// Definitive refusal before source invocation, even when an observation failed ambiguously.
#[derive(Debug, thiserror::Error)]
#[error("{0}")]
struct Refused(String);

impl ClassifiedError for Refused {
    fn kind(&self) -> ErrorKind {
        ErrorKind::Rejected
    }
}

#[async_trait]
impl<E: ClassifiedError> DocumentPolicy for ReaderPolicy<E> {
    type Error = Refused;
    type Permit = OwnedSemaphorePermit;
    type ReaderPermit = OwnedSemaphorePermit;

    fn admit_session(&self, _reference: Option<EventPosition>) -> Result<(), Refused> {
        self.probe.sessions.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    fn admit_live_reader(&self) -> Result<Self::ReaderPermit, Refused> {
        self.readers
            .clone()
            .try_acquire_owned()
            .map_err(|error| Refused(error.to_string()))
    }

    fn acquire_write(&self, request: WriteRequest<'_>) -> Result<Self::Permit, Refused> {
        match request {
            WriteRequest::Submit(submission) if submission.event.payload.len() <= 1024 => {}
            _ => {
                return Err(Refused(
                    "fixture accepts only small application writes".into(),
                ));
            }
        }
        self.writes
            .clone()
            .try_acquire_owned()
            .map_err(|error| Refused(error.to_string()))
    }

    async fn wait_write(&self, _permit: &Self::Permit) -> Result<(), Refused> {
        if let Some(storage) = &self.storage {
            storage
                .wait_below(127, 8 * 1024 * 1024)
                .await
                .map_err(|error| Refused(error.to_string()))?;
        }
        self.output
            .wait_below(0, 0)
            .await
            .map_err(|error| Refused(error.to_string()))?;
        Ok(())
    }
}

/// Opens and binds a session through the same host boundary used by both listeners.
async fn open(
    host: &SeaProtocolHost,
    document: Option<&DocumentId>,
) -> (DocumentId, Arc<dyn SeaConnectionService>, SeaResponseStream) {
    let connection = host.connect(LivenessPolicy::default());
    let mut events = connection
        .open_event_stream(protocol::Request::OpenEventStream {
            version: protocol::PROTOCOL_VERSION,
            intent: if document.is_some() {
                protocol::ArchiveIntent::Open
            } else {
                protocol::ArchiveIntent::Create
            },
            archive: document.map_or_else(Vec::new, |id| id.as_bytes().to_vec()),
            resume_after: None,
        })
        .await
        .unwrap();
    let protocol::Response::EventStreamOpened {
        document,
        authority,
        ..
    } = events.next().await.unwrap()
    else {
        panic!("missing opening authority");
    };
    let bound = connection.bind_session(&authority).await.unwrap();
    (DocumentId::from_bytes(document.into()), bound, events)
}

/// Drains to the live boundary, rejecting errors rather than silently treating shedding as success.
async fn catch_up(events: &mut SeaResponseStream) -> Vec<Vec<u8>> {
    let mut payloads = Vec::new();
    loop {
        match events.next().await.unwrap() {
            protocol::Response::LoadEvent(event)
                if event.kind == protocol::SessionEventKind::Application =>
            {
                payloads.push(event.event.payload);
            }
            protocol::Response::StreamProgress {
                status: protocol::StreamStatus::AwaitingNewItems,
                ..
            } => return payloads,
            protocol::Response::LoadEvent(_)
            | protocol::Response::LoadSnapshot(_)
            | protocol::Response::StreamProgress { .. } => {}
            response => panic!("unexpected read response: {response:?}"),
        }
    }
}

/// Uses distinct bytes so replay detects a write incorrectly admitted during a policy wait.
fn submit(value: u8) -> protocol::Request {
    protocol::Request::Submit {
        reference: None,
        event: protocol::Event {
            payload: vec![value],
            blob_tree: None,
        },
    }
}

#[tokio::test]
#[allow(clippy::too_many_lines)]
async fn injected_policy_preserves_readers_and_close_interrupts_waits() {
    for mode in ["memory", "buffered-file", "durable-file"] {
        let root = std::env::temp_dir().join(format!(
            "sea-injected-policy-{}-{}",
            std::process::id(),
            mode,
        ));
        assert!(!root.exists());
        let probe = Arc::new(Probe::default());
        let host = self::host(root.clone(), mode, probe.clone());
        let exercise = async {
            let (id, author, mut echo) = open(&host, None).await;
            catch_up(&mut echo).await;
            let (_, observer, mut events) = open(&host.clone(), Some(&id)).await;
            catch_up(&mut events).await;
            assert_eq!(
                probe.documents.lock().unwrap().as_slice(),
                &[(id.clone(), mode == "durable-file")]
            );
            assert_eq!(probe.sessions.load(Ordering::SeqCst), 2);
            assert!(matches!(
                author.author_request(submit(1)).await,
                protocol::Response::EventCommitted { .. }
            ));
            let pending = author.author_request(submit(2));
            tokio::pin!(pending);
            assert!(poll!(&mut pending).is_pending());

            let (_, other, mut other_events) = open(&host, None).await;
            catch_up(&mut other_events).await;
            assert!(matches!(
                other.author_request(submit(9)).await,
                protocol::Response::EventCommitted { .. }
            ));
            assert_eq!(probe.documents.lock().unwrap().len(), 2);
            assert_eq!(catch_up(&mut echo).await, vec![vec![1]]);
            assert!(
                poll!(&mut pending).is_pending(),
                "the observer still retains the event"
            );
            assert_eq!(catch_up(&mut events).await, vec![vec![1]]);
            assert!(matches!(
                pending.await,
                protocol::Response::EventCommitted { .. }
            ));

            let pending = author.author_request(submit(3));
            tokio::pin!(pending);
            assert!(poll!(&mut pending).is_pending());
            assert_eq!(catch_up(&mut echo).await, vec![vec![2]]);
            assert!(poll!(&mut pending).is_pending());
            drop(events);
            assert!(matches!(
                pending.await,
                protocol::Response::EventCommitted { .. }
            ));

            let pending = author.author_request(submit(4));
            tokio::pin!(pending);
            assert!(poll!(&mut pending).is_pending());
            assert_eq!(
                author.author_request(protocol::Request::Close).await,
                protocol::Response::Acknowledged
            );
            assert!(matches!(
                pending.await,
                protocol::Response::Error {
                    kind: protocol::ErrorKind::Rejected,
                    ..
                }
            ));
            drop((echo, other_events));
            observer.connection_closed(false).await;
            other.connection_closed(false).await;
            host.shutdown().await.unwrap();
            id
        };
        let id = tokio::time::timeout(std::time::Duration::from_secs(10), exercise)
            .await
            .unwrap();
        drop(host);
        assert_eq!(probe.dropped.load(Ordering::SeqCst), 2);
        if mode != "memory" {
            let reopened = self::host(root.clone(), mode, probe.clone());
            let (_, reader, mut events) = open(&reopened, Some(&id)).await;
            assert_eq!(catch_up(&mut events).await, vec![vec![1], vec![2], vec![3]]);
            assert_eq!(probe.documents.lock().unwrap().len(), 3);
            drop(events);
            reader.connection_closed(false).await;
            reopened.shutdown().await.unwrap();
            drop((reader, reopened));
            assert_eq!(probe.dropped.load(Ordering::SeqCst), 3);
            std::fs::remove_dir_all(root).unwrap();
        }
    }
}
