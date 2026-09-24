//! Typed Sea sessions over platform transport primitives.

use std::{
    collections::BTreeMap,
    error::Error,
    fmt,
    sync::{Arc, Weak},
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{
    StreamExt as _, TryStreamExt as _,
    future::{AbortHandle, Abortable},
    stream,
};
use sea_core::{
    ArchiveEventStream, BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError,
    ErrorKind, Event, EventPosition, MonitoredStreamItem, MonitoredStreamProgress,
    MonitoredStreamStatus,
    archive::{
        CommittedEvent, EventSubmission, SessionCommittedEvent, SessionId, SessionStream,
        SnapshotParticipation,
    },
    boxed_monitored_stream,
    session::{
        SeaArchive, SeaAuthorSession, SeaSnapshotCoordinator, SessionLoad, SnapshotCoordination,
    },
    storage::{DocumentId, LoadStart, Snapshot, StorageHandle},
};
use tokio::sync::{Mutex, mpsc, oneshot, watch};
#[cfg(not(target_arch = "wasm32"))]
use wtransport::tls::Sha256Digest;

#[cfg(not(target_arch = "wasm32"))]
use crate::{TransportConfig, WebTransportError, connect_once, transport::native::NativeTransport};
use crate::{
    client::{
        AuthorStream, Client, ClientError, ClientStateError, ContentStream, EventStream,
        SnapshotStream,
    },
    protocol,
    transport::{BidirectionalStream, ClientTransport},
};

/// Thread transfer required by native session streams and transport errors.
#[cfg(not(target_arch = "wasm32"))]
pub trait SessionStreamBounds: Send {}
#[cfg(not(target_arch = "wasm32"))]
impl<Value: Send> SessionStreamBounds for Value {}

/// Browser session streams and transport errors may remain locally owned.
#[cfg(target_arch = "wasm32")]
pub trait SessionStreamBounds {}
#[cfg(target_arch = "wasm32")]
impl<Value> SessionStreamBounds for Value {}

/// Failure from a typed Sea client.
#[derive(Debug)]
pub enum SeaClientError {
    /// The underlying connection or framing failed.
    #[cfg(not(target_arch = "wasm32"))]
    Transport(WebTransportError),
    /// The browser transport or framing failed.
    #[cfg(target_arch = "wasm32")]
    Transport(String),
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
            #[cfg(not(target_arch = "wasm32"))]
            Self::Transport(error) => Some(error),
            #[cfg(target_arch = "wasm32")]
            Self::Transport(_) => None,
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

#[cfg(not(target_arch = "wasm32"))]
impl From<WebTransportError> for SeaClientError {
    fn from(error: WebTransportError) -> Self {
        Self::Transport(error)
    }
}

impl From<protocol::ProtocolError> for SeaClientError {
    fn from(error: protocol::ProtocolError) -> Self {
        #[cfg(not(target_arch = "wasm32"))]
        {
            Self::Transport(WebTransportError::SeaProtocol(error))
        }
        #[cfg(target_arch = "wasm32")]
        {
            Self::Transport(error.to_string())
        }
    }
}

#[cfg(target_arch = "wasm32")]
impl From<wasm_bindgen::JsValue> for SeaClientError {
    fn from(error: wasm_bindgen::JsValue) -> Self {
        Self::Transport(format!("{error:?}"))
    }
}

impl SeaClientError {
    /// Reports a transport failure without retaining platform-owned error values.
    fn transport_message(message: &str) -> Self {
        #[cfg(not(target_arch = "wasm32"))]
        {
            Self::Transport(WebTransportError::Transport(message.to_owned()))
        }
        #[cfg(target_arch = "wasm32")]
        {
            Self::Transport(message.to_owned())
        }
    }

    /// Reports the end of transport access without changing service classifications.
    fn disconnected() -> Self {
        #[cfg(not(target_arch = "wasm32"))]
        {
            WebTransportError::Disconnected.into()
        }
        #[cfg(target_arch = "wasm32")]
        {
            Self::transport_message("transport disconnected")
        }
    }
}

impl From<ClientStateError> for SeaClientError {
    fn from(error: ClientStateError) -> Self {
        match error {
            ClientStateError::Closed => Self::Closed,
            ClientStateError::Disconnected => Self::disconnected(),
            ClientStateError::MissingAuthority => Self::UnexpectedResponse,
            ClientStateError::Poisoned => {
                Self::transport_message("shared client state is unavailable")
            }
        }
    }
}

impl<TransportError: Into<SeaClientError>> From<ClientError<TransportError>> for SeaClientError {
    fn from(error: ClientError<TransportError>) -> Self {
        match error {
            #[cfg(not(target_arch = "wasm32"))]
            ClientError::Timeout => WebTransportError::Timeout.into(),
            #[cfg(not(target_arch = "wasm32"))]
            ClientError::AmbiguousTimeout => Self::Service(
                protocol::ErrorKind::Ambiguous,
                "transport operation timed out; commitment is unknown".into(),
            ),
            ClientError::State(error) => error.into(),
            ClientError::Protocol(error) => error.into(),
            ClientError::Transport(error) => error.into(),
            ClientError::ResponseEnded => Self::disconnected(),
            ClientError::UnexpectedResponse(response) => response_error(response),
        }
    }
}

/// Native certificate-pinned client with the shared typed session implementation.
#[cfg(not(target_arch = "wasm32"))]
pub type NativeSeaClient = SessionClient<NativeTransport>;

/// Typed archive session reusable across native and browser transports and session decorators.
///
/// Opening starts a snapshot/replay/live event stream. The first [`SeaArchive::load`] whose
/// policy matches [`SessionOpen::reference`] consumes that stream: [`LoadStart::LatestSnapshot`]
/// without a reference, or [`LoadStart::ReplayAtLeastAllAfter`] with it.
/// Read the returned events to consume opening delivery. Other loads and [`SeaArchive::read`]
/// use separate content streams and do not consume the opening stream.
pub struct SessionClient<Transport: ClientTransport> {
    /// Sequencer-allocated document-scoped identity.
    session: SessionId,
    client: Arc<Client<Transport>>,
    event_stream: Arc<Mutex<Option<EventStream<Transport::Stream>>>>,
    author_stream: Mutex<Option<AuthorStream<Transport::Stream>>>,
    /// Weak registration ownership; the returned coordination stream owns its lifetime.
    snapshot_stream: Mutex<Option<Weak<SnapshotPump>>>,
    content_stream: Mutex<Option<ContentStream<Transport::Stream>>>,
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
    /// Ordered request to send.
    request: protocol::Request,
    /// Completion independent of the submitting future's lifetime.
    response: oneshot::Sender<Result<protocol::Response, SeaClientError>>,
}

/// Owns the sole snapshot transport reader while a coordination subscription exists.
struct SnapshotPump {
    /// Requests queued behind any in-flight publication.
    commands: mpsc::Sender<SnapshotCommand>,
    /// Cancels transport ownership when the registration stream is dropped.
    task: AbortHandle,
}

impl Drop for SnapshotPump {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl SnapshotPump {
    /// Starts one cancellation-owned pump and its coalescible coordination receiver.
    fn start<Stream>(
        mut stream: SnapshotStream<Stream>,
    ) -> (
        Arc<Self>,
        watch::Receiver<Result<SnapshotCoordination, String>>,
    )
    where
        Stream: BidirectionalStream + SessionStreamBounds + 'static,
        Stream::Error: Into<SeaClientError> + SessionStreamBounds,
    {
        let state = |stream: &SnapshotStream<Stream>| SnapshotCoordination {
            latest: stream.latest().map(EventPosition::new),
            fence: stream.fence(),
        };
        let (updates, receiver) = watch::channel(Ok(state(&stream)));
        let (commands, mut requests) = mpsc::channel::<SnapshotCommand>(16);
        let (task, registration) = AbortHandle::new_pair();
        let future = async move {
            let _ = Abortable::new(
                async {
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
                },
                registration,
            )
            .await;
            stream.cancel().await;
        };
        #[cfg(not(target_arch = "wasm32"))]
        tokio::spawn(future);
        #[cfg(target_arch = "wasm32")]
        wasm_bindgen_futures::spawn_local(future);
        (Arc::new(Self { commands, task }), receiver)
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

/// Native session-open parameters retained for compatibility.
#[cfg(not(target_arch = "wasm32"))]
pub type NativeSessionOpen = SessionOpen;

/// Values that identify and initialize one archive-bound session.
pub struct SessionOpen {
    /// Archive selected for this session.
    pub archive: Bytes,
    /// Whether the archive is created or must already exist.
    pub intent: protocol::ArchiveIntent,

    /// Latest event incorporated by the author.
    pub reference: Option<EventPosition>,
}

#[cfg(not(target_arch = "wasm32"))]
impl SessionClient<NativeTransport> {
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
        Self::open(
            NativeTransport::new(endpoint, connection, config.operation_timeout),
            protocol::Limits {
                max_frame_bytes: config.max_frame_bytes,
            },
            open,
        )
        .await
    }
}

impl<Transport> SessionClient<Transport>
where
    Transport: ClientTransport + sea_core::SessionBounds + 'static,
    Transport::Stream: SessionStreamBounds + 'static,
    Transport::Error: Into<SeaClientError> + SessionStreamBounds,
{
    /// Opens a typed session over a caller-owned transport configuration.
    ///
    /// # Errors
    ///
    /// Returns transport, protocol, or service failures without retrying.
    pub async fn open(
        transport: Transport,
        limits: protocol::Limits,
        open: SessionOpen,
    ) -> Result<Self, SeaClientError> {
        let client = Client::new(transport, limits);
        let event_stream = client
            .open_event_stream(protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: open.archive.to_vec(),
                intent: open.intent,

                resume_after: open.reference.map(EventPosition::get),
            })
            .await?;
        let author_stream = client.open_author_stream().await?;
        Self::from_streams(client, event_stream, author_stream, open.reference)
    }

    /// Retains the initially opened event stream and independent session channels.
    fn from_streams(
        client: Client<Transport>,
        event_stream: EventStream<Transport::Stream>,
        author_stream: AuthorStream<Transport::Stream>,
        resume_after: Option<EventPosition>,
    ) -> Result<Self, SeaClientError> {
        Ok(Self {
            session: SessionId::new(event_stream.session)
                .map_err(|_| SeaClientError::UnexpectedResponse)?,
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

    /// Returns the sequencer-allocated identity from the opening handshake.
    #[must_use]
    pub fn session_id(&self) -> &SessionId {
        &self.session
    }

    /// Registers independent live messaging for this session's document.
    ///
    /// # Errors
    /// Returns connection, protocol, or membership admission failures.
    pub async fn open_signals(
        &self,
        member: sea_core::signals::SignalMember,
    ) -> Result<Arc<crate::signals::SignalClient>, SeaClientError> {
        use sea_core::signals::SeaSignalService as _;
        self.signal_service().open_signals(member).await
    }

    /// Returns independently usable document messaging without granting append authority.
    pub fn signal_service(&self) -> crate::signals::SignalService<Transport> {
        crate::signals::SignalService::new(self.client.clone(), self.document.as_bytes().clone())
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

impl<Transport> sea_core::SeaService for SessionClient<Transport>
where
    Transport: ClientTransport + sea_core::SessionBounds + 'static,
    Transport::Stream: SessionStreamBounds + 'static,
    Transport::Error: Into<SeaClientError> + SessionStreamBounds,
{
    type Error = SeaClientError;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Transport> SeaArchive for SessionClient<Transport>
where
    Transport: ClientTransport + sea_core::SessionBounds + 'static,
    Transport::Stream: SessionStreamBounds + 'static,
    Transport::Error: Into<SeaClientError> + SessionStreamBounds,
{
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
impl<Transport> SeaAuthorSession for SessionClient<Transport>
where
    Transport: ClientTransport + sea_core::SessionBounds + 'static,
    Transport::Stream: SessionStreamBounds + 'static,
    Transport::Error: Into<SeaClientError> + SessionStreamBounds,
{
    async fn announce_membership(&self, metadata: Bytes) -> Result<EventPosition, Self::Error> {
        match self
            .author_stream
            .lock()
            .await
            .as_mut()
            .ok_or(SeaClientError::Closed)?
            .request(protocol::Request::AnnounceMembership {
                metadata: metadata.to_vec(),
            })
            .await?
        {
            protocol::Response::EventCommitted { position } => Ok(EventPosition::new(position)),
            response => Err(response_error(response)),
        }
    }
    async fn submit(&self, submission: EventSubmission) -> Result<EventPosition, Self::Error> {
        match self
            .author_stream
            .lock()
            .await
            .as_mut()
            .ok_or(SeaClientError::Closed)?
            .request(protocol::Request::Submit {
                reference: submission.reference.map(EventPosition::get),
                event: event_to_wire(&submission.event),
            })
            .await?
        {
            protocol::Response::EventCommitted { position, .. } => Ok(EventPosition::new(position)),
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
impl<Transport> SeaSnapshotCoordinator for SessionClient<Transport>
where
    Transport: ClientTransport + sea_core::SessionBounds + 'static,
    Transport::Stream: SessionStreamBounds + 'static,
    Transport::Error: Into<SeaClientError> + SessionStreamBounds,
{
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
        kind: match event.kind {
            protocol::SessionEventKind::Application => {
                sea_core::archive::SessionEventKind::Application
            }
            protocol::SessionEventKind::Joined => sea_core::archive::SessionEventKind::Joined,
            protocol::SessionEventKind::Left => sea_core::archive::SessionEventKind::Left,
        },
        committed: CommittedEvent {
            position: EventPosition::new(event.position),
            event: event_from_wire(event.event),
        },

        session_id: SessionId::new(event.session)
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
    use super::*;
    use crate::protocol::{Response, StreamRole};
    use std::collections::VecDeque;

    /// Supplies only the expected logical streams, detecting redundant content opens.
    struct OpeningTransport {
        /// Opening event and author streams, in admission order.
        streams: std::sync::Mutex<VecDeque<OpeningStream>>,
    }

    /// Test-controlled incoming frames keep live delivery independent of session opening.
    struct OpeningStream {
        /// A pending receive wakes only when the test sends a frame or closes the channel.
        incoming: mpsc::UnboundedReceiver<Vec<u8>>,
        /// Reports explicit cancellation separately from dropping a transport handle.
        cancelled: Option<oneshot::Sender<()>>,
    }

    #[async_trait]
    impl ClientTransport for OpeningTransport {
        type Stream = OpeningStream;
        type Error = SeaClientError;

        async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error> {
            Ok(self
                .streams
                .lock()
                .expect("opening streams")
                .pop_front()
                .expect("load must reuse the opening stream"))
        }

        fn disconnect(&self) -> Result<(), Self::Error> {
            Ok(())
        }
    }

    #[async_trait]
    impl BidirectionalStream for OpeningStream {
        type Error = SeaClientError;

        async fn send(&mut self, _bytes: &[u8]) -> Result<(), Self::Error> {
            Ok(())
        }

        async fn finish(&mut self) -> Result<(), Self::Error> {
            Ok(())
        }

        async fn receive(&mut self) -> Result<Option<Vec<u8>>, Self::Error> {
            Ok(self.incoming.recv().await)
        }

        async fn cancel(&mut self) -> Result<(), Self::Error> {
            if let Some(cancelled) = self.cancelled.take() {
                let _ = cancelled.send(());
            }
            self.incoming.close();
            Ok(())
        }
    }

    /// Encodes one real protocol frame for the selected logical stream.
    fn reply(sender: &mpsc::UnboundedSender<Vec<u8>>, role: StreamRole, response: &Response) {
        sender
            .send(
                protocol::encode_response_frame(role, response, protocol::Limits::default())
                    .unwrap(),
            )
            .unwrap();
    }

    /// Opens a session while leaving all snapshot, replay, and live frames under test control.
    async fn opening_client(
        reference: Option<EventPosition>,
    ) -> (
        SessionClient<OpeningTransport>,
        mpsc::UnboundedSender<Vec<u8>>,
    ) {
        opening_client_with_streams(reference, Vec::new()).await
    }

    async fn opening_client_with_streams(
        reference: Option<EventPosition>,
        additional: Vec<OpeningStream>,
    ) -> (
        SessionClient<OpeningTransport>,
        mpsc::UnboundedSender<Vec<u8>>,
    ) {
        let (events, incoming) = mpsc::unbounded_channel();
        let (author, author_incoming) = mpsc::unbounded_channel();
        let mut streams = VecDeque::from([
            OpeningStream {
                incoming,
                cancelled: None,
            },
            OpeningStream {
                incoming: author_incoming,
                cancelled: None,
            },
        ]);
        streams.extend(additional);
        let transport = OpeningTransport {
            streams: std::sync::Mutex::new(streams),
        };
        reply(
            &events,
            StreamRole::Event,
            &Response::EventStreamOpened {
                session: 1,
                document: b"document".to_vec(),
                authority: vec![9; 32],
            },
        );
        reply(&author, StreamRole::Author, &Response::Acknowledged);
        let client = SessionClient::open(
            transport,
            protocol::Limits::default(),
            SessionOpen {
                archive: Bytes::from_static(b"document"),
                intent: protocol::ArchiveIntent::Open,
                reference,
            },
        )
        .await
        .unwrap();
        (client, events)
    }

    #[tokio::test]
    async fn matching_load_consumes_opening_prefix_and_continues_live_without_another_stream() {
        use futures_util::FutureExt as _;

        for reference in [None, Some(EventPosition::new(7))] {
            for with_snapshot in [false, true] {
                let (client, events) = opening_client(reference).await;
                let snapshot = protocol::Snapshot {
                    root: protocol::TreeId::Blob([3; 32]),
                    at_event: 5,
                };
                if with_snapshot {
                    reply(
                        &events,
                        StreamRole::Event,
                        &Response::LoadSnapshot(snapshot.clone()),
                    );
                }
                let cursor = with_snapshot.then_some(EventPosition::new(5));
                reply(
                    &events,
                    StreamRole::Event,
                    &Response::StreamProgress {
                        previous: cursor.map(EventPosition::get),
                        latest_known: Some(11),
                        status: protocol::StreamStatus::StreamingBacklog,
                    },
                );
                let start =
                    reference.map_or(LoadStart::LatestSnapshot, LoadStart::ReplayAtLeastAllAfter);
                let mut load = client
                    .load(start)
                    .now_or_never()
                    .expect("queued opening prefix must make load ready")
                    .unwrap();
                assert!(client.event_stream.lock().await.is_none());
                assert_eq!(
                    load.snapshot.as_ref().map(|value| value.at_event.id()),
                    cursor
                );
                if let Some(loaded) = &load.snapshot {
                    assert_eq!(tree_to_wire(loaded.root.id()), snapshot.root);
                }
                assert!(matches!(
                    load.events.next().now_or_never()
                        .expect("load must preserve queued opening progress").unwrap().unwrap(),
                    MonitoredStreamItem::Progress(progress)
                        if progress.previous == cursor
                            && progress.latest_known == Some(EventPosition::new(11))
                            && progress.status == MonitoredStreamStatus::StreamingBacklog
                ));
                let mut next = Box::pin(load.events.next());
                assert!(next.as_mut().now_or_never().is_none());
                reply(
                    &events,
                    StreamRole::Event,
                    &Response::LoadEvent(Box::new(protocol::StreamEvent {
                        kind: protocol::SessionEventKind::Application,
                        position: 11,
                        session: 2,
                        reference: Some(7),
                        minimum_reference: Some(5),
                        event: protocol::Event {
                            payload: b"live".to_vec(),
                            blob_tree: None,
                        },
                    })),
                );
                let MonitoredStreamItem::Item(event) = next
                    .now_or_never()
                    .expect("opening stream must continue live delivery")
                    .unwrap()
                    .unwrap()
                else {
                    panic!("expected live event after opening progress");
                };
                assert_eq!(event.committed.position, EventPosition::new(11));
                assert_eq!(event.committed.event.payload, Bytes::from_static(b"live"));
                assert_eq!(event.session_id, SessionId::new(2).unwrap());
                assert_eq!(event.reference, Some(EventPosition::new(7)));
                assert_eq!(event.minimum_reference, Some(EventPosition::new(5)));
                assert_eq!(
                    load.events.progress().previous,
                    Some(EventPosition::new(11))
                );
                drop(load);
                assert!(events.is_closed(), "returned load owns opening delivery");
            }
        }
    }

    #[test]
    fn load_rejects_unexpected_response_kind() {
        assert!(matches!(
            event_from_stream_response(Response::Acknowledged),
            Err(SeaClientError::UnexpectedResponse)
        ));
    }

    #[tokio::test]
    async fn remote_resolution_accepts_joined_and_left_positions() {
        for kind in [
            protocol::SessionEventKind::Joined,
            protocol::SessionEventKind::Left,
        ] {
            let (content, incoming) = mpsc::unbounded_channel();
            let (client, _events) = opening_client_with_streams(
                None,
                vec![OpeningStream {
                    incoming,
                    cancelled: None,
                }],
            )
            .await;
            reply(&content, StreamRole::Content, &Response::Acknowledged);
            reply(
                &content,
                StreamRole::Content,
                &Response::LoadEvent(Box::new(protocol::StreamEvent {
                    kind,
                    position: 7,
                    session: 1,
                    reference: None,
                    minimum_reference: None,
                    event: protocol::Event {
                        payload: Vec::new(),
                        blob_tree: None,
                    },
                })),
            );
            reply(&content, StreamRole::Content, &Response::ResponseComplete);
            let resolved = client
                .resolve_position(EventPosition::new(7))
                .await
                .unwrap()
                .expect("committed membership position must resolve");
            assert_eq!(resolved.id(), EventPosition::new(7));
            assert!(Arc::ptr_eq(&resolved.scope, &client.scope));
        }
    }

    #[tokio::test]
    async fn snapshot_handles_from_another_client_are_rejected_before_transport_access() {
        let (client, _events) = opening_client(None).await;
        let (other, _other_events) = opening_client(None).await;
        let root = BlobTreeId::Blob(BlobId::from_bytes(&[1; 32]).unwrap());
        let position = EventPosition::new(1);
        for snapshot in [
            Snapshot {
                root: other.handle(root),
                at_event: client.handle(position),
            },
            Snapshot {
                root: client.handle(root),
                at_event: other.handle(position),
            },
        ] {
            assert!(matches!(
                client.publish_snapshot(None, None, snapshot).await,
                Err(SeaClientError::Service(protocol::ErrorKind::Rejected, message))
                    if message == "snapshot handles belong to another client"
            ));
        }
    }

    #[tokio::test]
    async fn snapshot_pump_explicitly_cancels_transport_on_drop_or_receive_failure() {
        for drop_owner in [true, false] {
            let (events, incoming) = mpsc::unbounded_channel();
            let (snapshots, snapshot_incoming) = mpsc::unbounded_channel();
            let (cancelled, cancellation) = oneshot::channel();
            let client = Client::new(
                OpeningTransport {
                    streams: std::sync::Mutex::new(VecDeque::from([
                        OpeningStream {
                            incoming,
                            cancelled: None,
                        },
                        OpeningStream {
                            incoming: snapshot_incoming,
                            cancelled: Some(cancelled),
                        },
                    ])),
                },
                protocol::Limits::default(),
            );
            reply(
                &events,
                StreamRole::Event,
                &Response::EventStreamOpened {
                    session: 1,
                    document: b"document".to_vec(),
                    authority: vec![9; 32],
                },
            );
            let _event_stream = client
                .open_event_stream(protocol::Request::OpenEventStream {
                    version: protocol::PROTOCOL_VERSION,
                    archive: b"document".to_vec(),
                    intent: protocol::ArchiveIntent::Open,
                    resume_after: None,
                })
                .await
                .unwrap();
            reply(&snapshots, StreamRole::Snapshot, &Response::Acknowledged);
            reply(
                &snapshots,
                StreamRole::Snapshot,
                &Response::SnapshotCoordination {
                    latest: None,
                    fence: Some(1),
                },
            );
            let snapshot = client
                .open_snapshot_stream(protocol::SnapshotParticipation::SeaSelected)
                .await
                .unwrap();
            let (pump, _updates) = SnapshotPump::start(snapshot);
            if drop_owner {
                drop(pump);
            } else {
                reply(&snapshots, StreamRole::Snapshot, &Response::Acknowledged);
                // Keep the owner alive so only the unexpected notification ends the pump.
                tokio::time::timeout(std::time::Duration::from_secs(1), cancellation)
                    .await
                    .expect("failed pump must cancel its stream")
                    .expect("dropping the stream alone does not call cancel");
                drop(pump);
                continue;
            }
            tokio::time::timeout(std::time::Duration::from_secs(1), cancellation)
                .await
                .expect("dropping the owner must cancel its stream")
                .expect("dropping the stream alone does not call cancel");
        }
    }
}
