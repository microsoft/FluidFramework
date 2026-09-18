//! Native certificate-pinned [`SeaSession`] client.

use std::{
    collections::BTreeMap,
    error::Error,
    fmt,
    sync::{Arc, Weak},
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{StreamExt as _, TryStreamExt as _, stream};
use sea_core::{
    ArchiveEventStream, BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError,
    ErrorKind, Event, EventPosition, MonitoredStreamItem, MonitoredStreamProgress,
    MonitoredStreamStatus,
    archive::{
        AuthorId, CommittedEvent, EventSubmission, OperationId, SeaService, SessionCommittedEvent,
        SessionId, SessionStream, SnapshotParticipation,
    },
    boxed_monitored_stream,
    next::{
        DocumentId, LoadStart, Snapshot, StorageHandle,
        session::{
            SeaArchive, SeaAuthorSession, SeaSnapshotCoordinator, SessionLoad, SnapshotCoordination,
        },
    },
};
use tokio::{
    sync::{Mutex, mpsc, oneshot, watch},
    time::timeout,
};
use wtransport::tls::Sha256Digest;

use crate::{
    TransportConfig, WebTransportError,
    client::{
        AuthorStream, Client, ClientError, ClientStateError, ContentStream, EventStream,
        SnapshotStream,
    },
    connect_once, protocol,
    transport::native::{NativeBidirectionalStream, NativeTransport},
};

/// Failure from a native typed Sea client.
#[derive(Debug)]
pub enum SeaClientError {
    /// The underlying connection or framing failed.
    Transport(WebTransportError),
    /// The service returned a classified Sea failure.
    Service(protocol::ErrorKind, String),
    /// The service returned a response that does not match the request.
    UnexpectedResponse,
    /// The client was explicitly closed.
    Closed,
}

impl fmt::Display for SeaClientError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Transport(error) => write!(formatter, "transport failed: {error}"),
            Self::Service(_, message) => formatter.write_str(message),
            Self::UnexpectedResponse => {
                formatter.write_str("service returned an unexpected response")
            }
            Self::Closed => formatter.write_str("Sea client is closed"),
        }
    }
}

impl Error for SeaClientError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Transport(error) => Some(error),
            Self::Service(_, _) | Self::UnexpectedResponse | Self::Closed => None,
        }
    }
}

impl ClassifiedError for SeaClientError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Transport(_) | Self::UnexpectedResponse => ErrorKind::Unavailable,
            Self::Closed => ErrorKind::Rejected,
            Self::Service(kind, _) => match kind {
                protocol::ErrorKind::Invalid => ErrorKind::InvalidPosition,
                protocol::ErrorKind::Stale => ErrorKind::StalePosition,
                protocol::ErrorKind::Conflict => ErrorKind::Conflict,
                protocol::ErrorKind::Rejected => ErrorKind::Rejected,
                protocol::ErrorKind::Ambiguous => ErrorKind::Ambiguous,
                protocol::ErrorKind::Unavailable => ErrorKind::Unavailable,
                protocol::ErrorKind::Corrupt => ErrorKind::Corrupt,
            },
        }
    }
}

impl From<WebTransportError> for SeaClientError {
    fn from(error: WebTransportError) -> Self {
        Self::Transport(error)
    }
}

impl From<protocol::ProtocolError> for SeaClientError {
    fn from(error: protocol::ProtocolError) -> Self {
        Self::Transport(WebTransportError::SeaProtocol(error))
    }
}

impl From<ClientStateError> for SeaClientError {
    fn from(error: ClientStateError) -> Self {
        match error {
            ClientStateError::Closed => Self::Closed,
            ClientStateError::Disconnected => WebTransportError::Disconnected.into(),
            ClientStateError::MissingAuthority => Self::UnexpectedResponse,
            ClientStateError::Protocol(error) => error.into(),
            ClientStateError::Poisoned => Self::Transport(WebTransportError::Transport(
                "shared client state is unavailable".to_owned(),
            )),
        }
    }
}

impl From<ClientError<WebTransportError>> for SeaClientError {
    fn from(error: ClientError<WebTransportError>) -> Self {
        match error {
            ClientError::State(error) => error.into(),
            ClientError::Protocol(error) => error.into(),
            ClientError::Transport(error) => error.into(),
            ClientError::ResponseEnded => WebTransportError::Disconnected.into(),
            ClientError::UnexpectedResponse(response) => response_error(response),
        }
    }
}

/// Native WebTransport client bound to one open Sea archive session.
pub struct NativeSeaClient {
    client: Arc<Client<NativeTransport>>,
    event_stream: Arc<Mutex<Option<EventStream<NativeBidirectionalStream>>>>,
    author_stream: Mutex<Option<AuthorStream<NativeBidirectionalStream>>>,
    /// Weak registration ownership; the returned coordination stream owns its lifetime.
    snapshot_stream: Mutex<Option<Weak<SnapshotPump>>>,
    content_stream: Mutex<Option<ContentStream<NativeBidirectionalStream>>>,
    resume_after: Option<EventPosition>,
    /// Backend document identity, distinct from logical session authority.
    document: DocumentId,
    /// Private provenance shared by handles resolved through this client.
    scope: Arc<()>,
}

/// Remotely confirmed availability scoped to the client that obtained it.
#[derive(Clone)]
pub struct RemoteHandle<Identity: Copy + Send + Sync + 'static> {
    /// Confirmed immutable identity or committed event position.
    id: Identity,
    /// Private client provenance; retaining it does not keep a session open.
    scope: Arc<()>,
}

impl<Identity: Copy + Send + Sync + 'static> StorageHandle for RemoteHandle<Identity> {
    type Id = Identity;

    fn id(&self) -> Identity {
        self.id
    }
}

/// One publication request processed without competing readers on the transport stream.
struct SnapshotCommand {
    /// Correlated request to send.
    request: protocol::Request,
    /// Completion independent of the submitting future's lifetime.
    response: oneshot::Sender<Result<protocol::Response, SeaClientError>>,
}

/// Owns the sole snapshot transport reader while a coordination subscription exists.
struct SnapshotPump {
    /// Requests queued behind any in-flight publication.
    commands: mpsc::Sender<SnapshotCommand>,
    /// Cancels transport ownership when the registration stream is dropped.
    task: tokio::task::AbortHandle,
}

impl Drop for SnapshotPump {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl SnapshotPump {
    /// Starts one cancellation-owned pump and its coalescible coordination receiver.
    fn start(
        mut stream: SnapshotStream<NativeBidirectionalStream>,
    ) -> (
        Arc<Self>,
        watch::Receiver<Result<SnapshotCoordination, String>>,
    ) {
        let state = |stream: &SnapshotStream<NativeBidirectionalStream>| SnapshotCoordination {
            latest: stream.latest().map(EventPosition::new),
            fence: stream.fence(),
        };
        let (updates, receiver) = watch::channel(Ok(state(&stream)));
        let (commands, mut requests) = mpsc::channel::<SnapshotCommand>(16);
        let task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    command = requests.recv() => {
                        let Some(command) = command else { break; };
                        let result = stream.request(command.request).await.map_err(SeaClientError::from);
                        if let Err(error) = &result {
                            let _ = updates.send_replace(Err(error.to_string()));
                            let _ = command.response.send(result);
                            break;
                        }
                        let _ = updates.send_replace(Ok(state(&stream)));
                        let _ = command.response.send(result);
                    }
                    result = stream.next_coordination() => {
                        match result {
                            Ok(()) => { let _ = updates.send_replace(Ok(state(&stream))); }
                            Err(error) => {
                                let _ = updates.send_replace(Err(SeaClientError::from(error).to_string()));
                                break;
                            }
                        }
                    }
                }
            }
        });
        (
            Arc::new(Self {
                commands,
                task: task.abort_handle(),
            }),
            receiver,
        )
    }

    /// Enqueues a request; cancellation does not cause an automatic publication retry.
    async fn request(
        &self,
        request: protocol::Request,
    ) -> Result<protocol::Response, SeaClientError> {
        let (response, received) = oneshot::channel();
        self.commands
            .send(SnapshotCommand { request, response })
            .await
            .map_err(|_| SeaClientError::Closed)?;
        received.await.map_err(|_| SeaClientError::Closed)?
    }
}

/// Values that identify and initialize one native archive-bound session.
pub struct NativeSessionOpen {
    /// Archive selected for this session.
    pub archive: Bytes,
    /// Whether the archive is created or must already exist.
    pub intent: protocol::ArchiveIntent,
    /// Stable author identity.
    pub author: AuthorId,
    /// Fresh session identity.
    pub session: SessionId,
    /// Latest event incorporated by the author.
    pub reference: Option<EventPosition>,
}

impl NativeSeaClient {
    /// Connects to `/sea` and opens one archive-bound logical session.
    ///
    /// # Errors
    ///
    /// Returns a transport, protocol, or session-open failure.
    pub async fn connect(
        url: impl Into<String>,
        certificate_hash: Sha256Digest,
        config: TransportConfig,
        open: NativeSessionOpen,
    ) -> Result<Self, SeaClientError> {
        config.validate()?;
        let url = url.into();
        let (endpoint, connection) =
            connect_once(&url, certificate_hash, config.operation_timeout).await?;
        let client = Client::new(
            NativeTransport::new(endpoint, connection),
            protocol::Limits {
                max_frame_bytes: config.max_frame_bytes,
            },
        );
        let resume_after = open.reference;
        let event_stream = timeout(
            config.operation_timeout,
            client.open_event_stream(protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: open.archive.to_vec(),
                intent: open.intent,
                author: open.author.as_bytes().to_vec(),
                session: open.session.as_bytes().to_vec(),
                resume_after: resume_after.map(EventPosition::get),
            }),
        )
        .await
        .map_err(|_| WebTransportError::Timeout)??;
        let author_stream = timeout(config.operation_timeout, client.open_author_stream())
            .await
            .map_err(|_| WebTransportError::Timeout)??;
        Ok(Self {
            document: DocumentId::from_bytes(Bytes::copy_from_slice(event_stream.document())),
            scope: Arc::new(()),
            client: Arc::new(client),
            event_stream: Arc::new(Mutex::new(Some(event_stream))),
            author_stream: Mutex::new(Some(author_stream)),
            snapshot_stream: Mutex::new(None),
            content_stream: Mutex::new(None),
            resume_after,
        })
    }

    /// Returns the backend-assigned identity to retain for later opens.
    #[must_use]
    pub const fn document(&self) -> &DocumentId {
        &self.document
    }

    /// Mints a handle only after a successful service observation.
    fn handle<Identity: Copy + Send + Sync + 'static>(
        &self,
        id: Identity,
    ) -> RemoteHandle<Identity> {
        RemoteHandle {
            id,
            scope: self.scope.clone(),
        }
    }

    /// Converts a service-confirmed publication to local availability evidence.
    fn snapshot_from_wire(
        &self,
        snapshot: &protocol::Snapshot,
    ) -> Snapshot<RemoteHandle<BlobTreeId>, RemoteHandle<EventPosition>> {
        Snapshot {
            root: self.handle(tree_from_wire(snapshot.root)),
            at_event: self.handle(EventPosition::new(snapshot.at_event)),
        }
    }

    async fn content_request(
        &self,
        request: protocol::Request,
    ) -> Result<Vec<protocol::Response>, SeaClientError> {
        let mut content_stream = self.content_stream.lock().await;
        if content_stream.is_none() {
            *content_stream = Some(self.client.open_content_stream().await?);
        }
        content_stream
            .as_mut()
            .expect("content stream was initialized")
            .request(request)
            .await
            .map_err(Into::into)
    }

    async fn one_content_response(
        &self,
        request: protocol::Request,
    ) -> Result<protocol::Response, SeaClientError> {
        let mut responses = self.content_request(request).await?;
        if responses.len() != 1 {
            return Err(SeaClientError::UnexpectedResponse);
        }
        Ok(responses.remove(0))
    }
}

#[async_trait]
impl SeaService for NativeSeaClient {
    type Error = SeaClientError;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl SeaArchive for NativeSeaClient {
    type BlobHandle = RemoteHandle<BlobTreeId>;
    type EventHandle = RemoteHandle<EventPosition>;

    async fn load(
        &self,
        start: LoadStart,
    ) -> Result<SessionLoad<Self::BlobHandle, Self::EventHandle, Self::Error>, Self::Error> {
        let opened_start = self
            .resume_after
            .map_or(LoadStart::LatestSnapshot, LoadStart::ReplayAtLeastAllAfter);
        if start == opened_start {
            let mut opened = self.event_stream.lock().await;
            if let Some(mut events) = opened.take() {
                let first = events
                    .next()
                    .await?
                    .ok_or(SeaClientError::UnexpectedResponse)?;
                let (snapshot, pending) = match first {
                    protocol::Response::LoadSnapshot(snapshot) => {
                        (Some(self.snapshot_from_wire(&snapshot)), None)
                    }
                    response => (None, Some(response)),
                };
                let cursor = snapshot.as_ref().map(|value| value.at_event.id());
                let responses = stream::iter(pending.into_iter().map(Ok)).chain(
                    stream::try_unfold(events, |mut events| async move {
                        Ok(events
                            .next()
                            .await
                            .map_err(SeaClientError::from)?
                            .map(|response| (response, events)))
                    }),
                );
                return Ok(SessionLoad {
                    snapshot,
                    events: boxed_monitored_stream(
                        responses.map(|result| result.and_then(event_from_stream_response)),
                        MonitoredStreamProgress {
                            previous: cursor,
                            latest_known: cursor,
                            status: MonitoredStreamStatus::StreamingBacklog,
                        },
                        |event| Some(event.committed.position),
                    ),
                });
            }
        }
        let snapshot = self.get_snapshot(start).await?;
        let events = self.read(snapshot.as_ref().map(|value| value.at_event.id()), None);
        Ok(SessionLoad { snapshot, events })
    }

    fn read(
        &self,
        after: Option<EventPosition>,
        stop_after: Option<EventPosition>,
    ) -> ArchiveEventStream<Self::Error> {
        let initial = MonitoredStreamProgress {
            previous: after,
            latest_known: after,
            status: MonitoredStreamStatus::StreamingBacklog,
        };
        let client = Arc::clone(&self.client);
        let response_stream = stream::once(async move {
            let content = client
                .open_content_stream()
                .await
                .map_err(SeaClientError::from)?;
            content
                .request_stream(protocol::Request::Read {
                    after: after.map(EventPosition::get),
                    stop_after: stop_after.map(EventPosition::get),
                })
                .await
                .map_err(SeaClientError::from)
        })
        .map_ok(|responses| {
            stream::try_unfold(responses, |mut responses| async move {
                Ok(responses
                    .next()
                    .await
                    .map_err(SeaClientError::from)?
                    .map(|response| (response, responses)))
            })
        })
        .try_flatten();
        boxed_monitored_stream(
            response_stream.map(|result| result.and_then(event_from_stream_response)),
            initial,
            |event| Some(event.committed.position),
        )
    }

    async fn put_blob(&self, payload: Bytes) -> Result<Self::BlobHandle, Self::Error> {
        match self
            .one_content_response(protocol::Request::PutBlob {
                payload: payload.to_vec(),
            })
            .await?
        {
            protocol::Response::BlobStored { id } => Ok(self.handle(BlobTreeId::Blob(
                BlobId::from_bytes(&id).expect("fixed blob identity"),
            ))),
            response => Err(response_error(response)),
        }
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        match self
            .one_content_response(protocol::Request::GetBlob { id: *id.as_bytes() })
            .await?
        {
            protocol::Response::Blob(payload) => Ok(Bytes::from(payload)),
            response => Err(response_error(response)),
        }
    }

    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<Self::BlobHandle, Self::Error> {
        let entries = directory
            .entries()
            .iter()
            .map(|(name, child)| protocol::DirectoryEntry {
                name: name.clone(),
                child: tree_to_wire(*child),
            })
            .collect();
        match self
            .one_content_response(protocol::Request::PutDirectory { entries })
            .await?
        {
            protocol::Response::DirectoryStored { id } => Ok(self.handle(BlobTreeId::Directory(
                BlobDirectoryId::from_bytes(&id).expect("fixed directory identity"),
            ))),
            response => Err(response_error(response)),
        }
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        match self
            .one_content_response(protocol::Request::GetDirectory { id: *id.as_bytes() })
            .await?
        {
            protocol::Response::Directory(entries) => {
                let mut directory = BTreeMap::new();
                for entry in entries {
                    if directory
                        .insert(entry.name, tree_from_wire(entry.child))
                        .is_some()
                    {
                        return Err(SeaClientError::UnexpectedResponse);
                    }
                }
                BlobDirectory::new(directory).map_err(|_| SeaClientError::UnexpectedResponse)
            }
            response => Err(response_error(response)),
        }
    }

    async fn get_snapshot(
        &self,
        start: LoadStart,
    ) -> Result<Option<Snapshot<Self::BlobHandle, Self::EventHandle>>, Self::Error> {
        let response = match start {
            LoadStart::Beginning => return Ok(None),
            LoadStart::LatestSnapshot => {
                self.one_content_response(protocol::Request::LatestSnapshot)
                    .await?
            }
            LoadStart::ReplayAtLeastAllAfter(position) => {
                self.one_content_response(protocol::Request::GetSnapshot { id: position.get() })
                    .await?
            }
        };
        match response {
            protocol::Response::Snapshot(snapshot) => {
                Ok(snapshot.map(|value| self.snapshot_from_wire(&value)))
            }
            response => Err(response_error(response)),
        }
    }

    async fn resolve_tree(&self, id: BlobTreeId) -> Result<Option<Self::BlobHandle>, Self::Error> {
        let result = match id {
            BlobTreeId::Blob(blob) => self.get_blob(blob).await.map(|_| ()),
            BlobTreeId::Directory(directory) => self.get_directory(directory).await.map(|_| ()),
        };
        match result {
            Ok(()) => Ok(Some(self.handle(id))),
            Err(error) if error.kind() == ErrorKind::Rejected => Ok(None),
            Err(error) => Err(error),
        }
    }

    async fn resolve_position(
        &self,
        position: EventPosition,
    ) -> Result<Option<Self::EventHandle>, Self::Error> {
        let mut events = self.read(None, None);
        while let Some(item) = events.next().await {
            match item? {
                MonitoredStreamItem::Item(event) if event.committed.position == position => {
                    return Ok(Some(self.handle(position)));
                }
                MonitoredStreamItem::Item(event) if event.committed.position > position => {
                    return Ok(None);
                }
                MonitoredStreamItem::Progress(progress)
                    if progress.status == MonitoredStreamStatus::AwaitingNewItems =>
                {
                    return Ok(None);
                }
                _ => {}
            }
        }
        Ok(None)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl SeaAuthorSession for NativeSeaClient {
    async fn submit(&self, submission: EventSubmission) -> Result<EventPosition, Self::Error> {
        match self
            .author_stream
            .lock()
            .await
            .as_mut()
            .ok_or(SeaClientError::Closed)?
            .request(protocol::Request::Submit {
                operation: submission.operation_id.as_bytes().to_vec(),
                reference: submission.reference.map(EventPosition::get),
                event: event_to_wire(&submission.event),
            })
            .await?
        {
            protocol::Response::EventCommitted { position, .. } => Ok(EventPosition::new(position)),
            response => Err(response_error(response)),
        }
    }

    async fn resolve_submission(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<EventPosition>, Self::Error> {
        match self
            .author_stream
            .lock()
            .await
            .as_mut()
            .ok_or(SeaClientError::Closed)?
            .request(protocol::Request::ResolveSubmission {
                operation: operation_id.as_bytes().to_vec(),
            })
            .await?
        {
            protocol::Response::SubmissionResolved { position, .. } => {
                Ok(position.map(EventPosition::new))
            }
            response => Err(response_error(response)),
        }
    }

    async fn close(&self) -> Result<(), Self::Error> {
        if self.client.is_closed()? {
            return Ok(());
        }
        let author = self
            .author_stream
            .lock()
            .await
            .take()
            .ok_or(SeaClientError::Closed)?;
        author.close().await?;
        if let Some(pump) = self
            .snapshot_stream
            .lock()
            .await
            .take()
            .and_then(|weak| weak.upgrade())
        {
            pump.task.abort();
        }
        self.event_stream.lock().await.take();
        self.client.disconnect()?;
        Ok(())
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl SeaSnapshotCoordinator for NativeSeaClient {
    async fn publish_snapshot(
        &self,
        expected_parent: Option<EventPosition>,
        fence: Option<u64>,
        snapshot: Snapshot<Self::BlobHandle, Self::EventHandle>,
    ) -> Result<Snapshot<Self::BlobHandle, Self::EventHandle>, Self::Error> {
        if !Arc::ptr_eq(&self.scope, &snapshot.root.scope)
            || !Arc::ptr_eq(&self.scope, &snapshot.at_event.scope)
        {
            return Err(SeaClientError::Service(
                protocol::ErrorKind::Rejected,
                "snapshot handles belong to another client".to_owned(),
            ));
        }
        let pump = self
            .snapshot_stream
            .lock()
            .await
            .as_ref()
            .and_then(Weak::upgrade)
            .ok_or(SeaClientError::Closed)?;
        match pump
            .request(protocol::Request::PublishSnapshot {
                fence,
                expected_parent: expected_parent.map(EventPosition::get),
                at_event: snapshot.at_event.id().get(),
                root: tree_to_wire(snapshot.root.id()),
            })
            .await?
        {
            protocol::Response::Snapshot(Some(snapshot)) => Ok(self.snapshot_from_wire(&snapshot)),
            response => Err(response_error(response)),
        }
    }

    async fn coordinate_snapshots(
        &self,
        participation: SnapshotParticipation,
    ) -> Result<SessionStream<SnapshotCoordination, Self::Error>, Self::Error> {
        let participation = match participation {
            SnapshotParticipation::ReadOnly => protocol::SnapshotParticipation::ReadOnly,
            SnapshotParticipation::SeaSelected => protocol::SnapshotParticipation::SeaSelected,
            SnapshotParticipation::ClientSelected => {
                protocol::SnapshotParticipation::ClientSelected
            }
        };
        let mut current = self.snapshot_stream.lock().await;
        if let Some(previous) = current.take().and_then(|weak| weak.upgrade()) {
            previous.task.abort();
        }
        let (pump, receiver) =
            SnapshotPump::start(self.client.open_snapshot_stream(participation).await?);
        *current = Some(Arc::downgrade(&pump));
        Ok(Box::pin(stream::try_unfold(
            (pump, receiver, true),
            |(pump, mut receiver, initial)| async move {
                if !initial && receiver.changed().await.is_err() {
                    return Ok(None);
                }
                let state = receiver.borrow_and_update().clone().map_err(|message| {
                    SeaClientError::Service(protocol::ErrorKind::Unavailable, message)
                })?;
                Ok(Some((state, (pump, receiver, false))))
            },
        )))
    }

    async fn revoke_snapshot_publisher(&self) -> Result<(), Self::Error> {
        if let Some(pump) = self
            .snapshot_stream
            .lock()
            .await
            .take()
            .and_then(|weak| weak.upgrade())
        {
            let response = pump.request(protocol::Request::Close).await?;
            pump.task.abort();
            if response != protocol::Response::Acknowledged {
                return Err(response_error(response));
            }
        }
        Ok(())
    }
}

fn event_from_stream_response(
    response: protocol::Response,
) -> Result<MonitoredStreamItem<SessionCommittedEvent, EventPosition>, SeaClientError> {
    match response {
        protocol::Response::LoadEvent(event) => {
            session_event_from_wire(*event).map(MonitoredStreamItem::Item)
        }
        protocol::Response::StreamProgress {
            previous,
            latest_known,
            status,
        } => Ok(MonitoredStreamItem::Progress(progress_from_wire(
            previous,
            latest_known,
            status,
        ))),
        response => Err(response_error(response)),
    }
}

fn progress_from_wire(
    previous: Option<u64>,
    latest_known: Option<u64>,
    status: protocol::StreamStatus,
) -> MonitoredStreamProgress<EventPosition> {
    MonitoredStreamProgress {
        previous: previous.map(EventPosition::new),
        latest_known: latest_known.map(EventPosition::new),
        status: match status {
            protocol::StreamStatus::StreamingBacklog => MonitoredStreamStatus::StreamingBacklog,
            protocol::StreamStatus::AwaitingNewItems => MonitoredStreamStatus::AwaitingNewItems,
            protocol::StreamStatus::FallenBehind => MonitoredStreamStatus::FallenBehind,
        },
    }
}

fn session_event_from_wire(
    event: protocol::StreamEvent,
) -> Result<SessionCommittedEvent, SeaClientError> {
    Ok(SessionCommittedEvent {
        committed: CommittedEvent {
            position: EventPosition::new(event.position),
            event: event_from_wire(event.event),
        },
        author_id: AuthorId::new(Bytes::from(event.author))
            .map_err(|_| SeaClientError::UnexpectedResponse)?,
        session_id: SessionId::new(Bytes::from(event.session))
            .map_err(|_| SeaClientError::UnexpectedResponse)?,
        operation_id: OperationId::new(Bytes::from(event.operation))
            .map_err(|_| SeaClientError::UnexpectedResponse)?,
        reference: event.reference.map(EventPosition::new),
        minimum_reference: event.minimum_reference.map(EventPosition::new),
    })
}

fn event_from_wire(event: protocol::Event) -> Event {
    Event {
        payload: Bytes::from(event.payload),
        blob_tree: event.blob_tree.map(tree_from_wire),
    }
}

fn event_to_wire(event: &Event) -> protocol::Event {
    protocol::Event {
        payload: event.payload.to_vec(),
        blob_tree: event.blob_tree.map(tree_to_wire),
    }
}

fn tree_from_wire(id: protocol::TreeId) -> BlobTreeId {
    match id {
        protocol::TreeId::Blob(bytes) => {
            BlobTreeId::Blob(BlobId::from_bytes(&bytes).expect("fixed blob identity"))
        }
        protocol::TreeId::Directory(bytes) => BlobTreeId::Directory(
            BlobDirectoryId::from_bytes(&bytes).expect("fixed directory identity"),
        ),
    }
}

fn tree_to_wire(id: BlobTreeId) -> protocol::TreeId {
    match id {
        BlobTreeId::Blob(id) => protocol::TreeId::Blob(*id.as_bytes()),
        BlobTreeId::Directory(id) => protocol::TreeId::Directory(*id.as_bytes()),
    }
}

fn response_error(response: protocol::Response) -> SeaClientError {
    match response {
        protocol::Response::Error { kind, message } => SeaClientError::Service(kind, message),
        _ => SeaClientError::UnexpectedResponse,
    }
}

#[cfg(test)]
mod tests {
    use super::{SeaClientError, event_from_stream_response};
    use crate::protocol::Response;

    #[test]
    fn load_rejects_unexpected_response_kind() {
        assert!(matches!(
            event_from_stream_response(Response::Acknowledged),
            Err(SeaClientError::UnexpectedResponse)
        ));
    }
}
