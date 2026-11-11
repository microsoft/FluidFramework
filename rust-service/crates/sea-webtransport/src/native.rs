//! Typed Sea sessions over platform transport primitives.

use std::{
    collections::VecDeque,
    error::Error,
    fmt,
    sync::{Arc, Weak},
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{
    StreamExt as _, TryStreamExt as _,
    future::{AbortHandle, AbortRegistration, Abortable},
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
use tokio::sync::{Mutex, Notify, Semaphore, mpsc, oneshot, watch};
#[cfg(not(target_arch = "wasm32"))]
use wtransport::tls::Sha256Digest;

#[cfg(not(target_arch = "wasm32"))]
use crate::{
    TransportConfig, WebTransportError,
    transport::native::{NativeTransport, connect_once},
};
use crate::{
    client::{
        AuthorStream, Client, ClientError, ClientErrorReason, ClientStateError, ContentStream,
        SnapshotStream,
    },
    protocol,
    transport::{BidirectionalStream, ClientTransport},
};

#[path = "native_load.rs"]
mod loading;
use loading::{LoadReceiver, split_load};

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

/// Failure from a typed Sea client, classified solely by its primary reason.
///
/// Supplementary failures are available through [`Self::additional_errors`] and are included
/// in display output, but do not change recovery decisions or the primary causal chain.
#[derive(Debug)]
pub struct SeaClientError {
    /// Initiating failure that determines classification.
    reason: SeaClientErrorReason,
    /// Diagnostic failures observed while handling the initiating failure.
    additional_errors: Vec<Self>,
}

/// Primary reason for a typed Sea client failure.
#[derive(Debug)]
pub enum SeaClientErrorReason {
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

impl fmt::Display for SeaClientErrorReason {
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

impl Error for SeaClientErrorReason {
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

impl ClassifiedError for SeaClientErrorReason {
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
        Self::new(SeaClientErrorReason::Transport(error))
    }
}

impl From<protocol::ProtocolError> for SeaClientError {
    fn from(error: protocol::ProtocolError) -> Self {
        #[cfg(not(target_arch = "wasm32"))]
        {
            Self::new(SeaClientErrorReason::Transport(
                WebTransportError::SeaProtocol(error),
            ))
        }
        #[cfg(target_arch = "wasm32")]
        {
            Self::new(SeaClientErrorReason::Transport(error.to_string()))
        }
    }
}

#[cfg(target_arch = "wasm32")]
impl From<wasm_bindgen::JsValue> for SeaClientError {
    fn from(error: wasm_bindgen::JsValue) -> Self {
        Self::new(SeaClientErrorReason::Transport(format!("{error:?}")))
    }
}

impl SeaClientError {
    /// Creates a failure without supplementary diagnostics.
    #[must_use]
    pub fn new(reason: SeaClientErrorReason) -> Self {
        Self {
            reason,
            additional_errors: Vec::new(),
        }
    }

    /// Returns the primary reason for callers needing more detail than classification.
    #[must_use]
    pub fn reason(&self) -> &SeaClientErrorReason {
        &self.reason
    }

    /// Returns supplementary failures in observation order, each with its own context.
    #[must_use]
    pub fn additional_errors(&self) -> &[Self] {
        &self.additional_errors
    }

    /// Attaches a diagnostic failure without changing the primary reason or classification.
    #[must_use]
    pub fn with_additional_error(mut self, error: Self) -> Self {
        self.additional_errors.push(error);
        self
    }

    /// Transfers the primary reason and all supplementary failures to a consumer.
    #[must_use]
    pub fn into_parts(self) -> (SeaClientErrorReason, Vec<Self>) {
        (self.reason, self.additional_errors)
    }

    /// Reports a transport failure without retaining platform-owned error values.
    fn transport_message(message: &str) -> Self {
        #[cfg(not(target_arch = "wasm32"))]
        {
            Self::new(SeaClientErrorReason::Transport(
                WebTransportError::Transport(message.to_owned()),
            ))
        }
        #[cfg(target_arch = "wasm32")]
        {
            Self::new(SeaClientErrorReason::Transport(message.to_owned()))
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

impl From<SeaClientErrorReason> for SeaClientError {
    fn from(reason: SeaClientErrorReason) -> Self {
        Self::new(reason)
    }
}

impl fmt::Display for SeaClientError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.reason.fmt(formatter)?;
        for error in &self.additional_errors {
            write!(formatter, "; additional failure: {error}")?;
        }
        Ok(())
    }
}

impl Error for SeaClientError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        self.reason.source()
    }
}

impl ClassifiedError for SeaClientError {
    fn kind(&self) -> ErrorKind {
        self.reason.kind()
    }
}

impl From<ClientStateError> for SeaClientError {
    fn from(error: ClientStateError) -> Self {
        match error {
            ClientStateError::Closed => Self::new(SeaClientErrorReason::Closed),
            ClientStateError::Disconnected => Self::disconnected(),
            ClientStateError::MissingAuthority => {
                Self::new(SeaClientErrorReason::UnexpectedResponse)
            }
            ClientStateError::Poisoned => {
                Self::transport_message("shared client state is unavailable")
            }
        }
    }
}

impl<TransportError: Into<SeaClientError>> From<ClientError<TransportError>> for SeaClientError {
    fn from(error: ClientError<TransportError>) -> Self {
        let (reason, additional_errors) = error.into_parts();
        let mut error: Self = match reason {
            #[cfg(not(target_arch = "wasm32"))]
            ClientErrorReason::Timeout => WebTransportError::Timeout.into(),
            #[cfg(not(target_arch = "wasm32"))]
            ClientErrorReason::AmbiguousTimeout => Self::new(SeaClientErrorReason::Service(
                protocol::ErrorKind::Ambiguous,
                "transport operation timed out; commitment is unknown".into(),
            )),
            ClientErrorReason::State(error) => error.into(),
            ClientErrorReason::Protocol(error) => error.into(),
            ClientErrorReason::Transport(error) => error.into(),
            ClientErrorReason::ResponseEnded => Self::disconnected(),
            ClientErrorReason::UnexpectedResponse(response) => response_error(response),
        };
        error
            .additional_errors
            .extend(additional_errors.into_iter().map(Self::from));
        error
    }
}

/// Native certificate-pinned client with the shared typed session implementation.
#[cfg(not(target_arch = "wasm32"))]
pub type NativeSeaClient = SessionClient<NativeTransport>;

/// Independent finite content exchanges; monitored reads own separate streams.
const CONTENT_CONCURRENCY: usize = 4;

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
    event_stream: Arc<Mutex<Option<(LoadReceiver, LoadReceiver)>>>,
    author_stream: Mutex<Option<AuthorStream<Transport::Stream>>>,
    /// Weak registration ownership; the returned coordination stream owns its lifetime.
    snapshot_stream: Mutex<Option<Weak<SnapshotPump>>>,
    content_pool: Arc<ContentPool<Transport::Stream>>,
    content_permits: Arc<Semaphore>,
    /// Hint used by the already-open snapshot delivery.
    opening_hint: sea_core::session::BlobTreeHint,
    resume_after: Option<EventPosition>,
    /// Backend document identity, distinct from logical session authority.
    document: DocumentId,
    /// Private provenance shared by handles resolved through this client.
    scope: Arc<()>,
}

enum ContentSlot<Stream> {
    Empty,
    Opening(AbortHandle),
    Idle(ContentStream<Stream>),
    Borrowed,
}

/// Fixed slots share one budget across idle, borrowed, and opening streams.
struct ContentPoolState<Stream> {
    slots: [ContentSlot<Stream>; CONTENT_CONCURRENCY],
    errors: VecDeque<SeaClientError>,
    closed: bool,
}

struct ContentPool<Stream> {
    state: std::sync::Mutex<ContentPoolState<Stream>>,
    changed: Notify,
}

impl<Stream> ContentPool<Stream> {
    fn new() -> Self {
        Self {
            state: std::sync::Mutex::new(ContentPoolState {
                slots: std::array::from_fn(|_| ContentSlot::Empty),
                errors: VecDeque::new(),
                closed: false,
            }),
            changed: Notify::new(),
        }
    }

    fn close(&self) {
        let mut state = self.state.lock().expect("content pool");
        state.closed = true;
        for slot in &mut state.slots {
            if let ContentSlot::Opening(task) = slot {
                task.abort();
            }
            *slot = ContentSlot::Empty;
        }
        state.errors.clear();
        drop(state);
        self.changed.notify_waiters();
    }
}

impl<Stream> Drop for ContentPool<Stream> {
    fn drop(&mut self) {
        self.close();
    }
}

/// Keeps a slot reserved until an exchange completes or its future is dropped.
struct ContentLease<Stream> {
    stream: Option<ContentStream<Stream>>,
    pool: Arc<ContentPool<Stream>>,
    index: usize,
    reusable: bool,
}

impl<Stream> Drop for ContentLease<Stream> {
    fn drop(&mut self) {
        let mut state = self.pool.state.lock().expect("content pool");
        state.slots[self.index] = if self.reusable && !state.closed {
            ContentSlot::Idle(self.stream.take().expect("borrowed content stream"))
        } else {
            drop(self.stream.take());
            ContentSlot::Empty
        };
        drop(state);
        self.pool.changed.notify_waiters();
    }
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
            .map_err(|_| SeaClientError::new(SeaClientErrorReason::Closed))?;
        received
            .await
            .map_err(|_| SeaClientError::new(SeaClientErrorReason::Closed))?
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
    /// Optional descendants requested with the selected opening snapshot.
    pub hint: sea_core::session::BlobTreeHint,
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
                hint: protocol::LoadingHint::encode(open.hint)?,
            })
            .await?;
        let session = SessionId::new(event_stream.session)
            .map_err(|_| SeaClientError::new(SeaClientErrorReason::UnexpectedResponse))?;
        let document = DocumentId::from_bytes(Bytes::copy_from_slice(event_stream.document()));
        let streams = split_load(event_stream);
        let author_stream = client.open_author_stream().await?;
        Ok(Self {
            session,
            document,
            scope: Arc::new(()),
            client: Arc::new(client),
            event_stream: Arc::new(Mutex::new(Some(streams))),
            author_stream: Mutex::new(Some(author_stream)),
            snapshot_stream: Mutex::new(None),
            content_pool: Arc::new(ContentPool::new()),
            content_permits: Arc::new(Semaphore::new(CONTENT_CONCURRENCY)),
            opening_hint: open.hint,
            resume_after: open.reference,
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

    async fn acquire_content_stream(
        &self,
    ) -> Result<ContentLease<Transport::Stream>, SeaClientError> {
        Self::acquire_pool_stream(&self.client, &self.content_pool).await
    }

    /// Acquires through shared ownership so a returned content stream can outlive the call.
    async fn acquire_pool_stream(
        client: &Arc<Client<Transport>>,
        pool: &Arc<ContentPool<Transport::Stream>>,
    ) -> Result<ContentLease<Transport::Stream>, SeaClientError> {
        loop {
            let changed = pool.changed.notified();
            {
                let mut state = pool.state.lock().expect("content pool");
                if state.closed {
                    return Err(SeaClientError::new(SeaClientErrorReason::Closed));
                }
                // An opening can fail after its original caller has already reused a stream.
                if let Some(error) = state.errors.pop_front() {
                    return Err(error);
                }
                if let Some(index) = state
                    .slots
                    .iter()
                    .position(|slot| matches!(slot, ContentSlot::Idle(_)))
                {
                    let ContentSlot::Idle(stream) =
                        std::mem::replace(&mut state.slots[index], ContentSlot::Borrowed)
                    else {
                        unreachable!("selected idle content stream");
                    };
                    return Ok(ContentLease {
                        stream: Some(stream),
                        pool: Arc::clone(pool),
                        index,
                        reusable: false,
                    });
                }
                if let Some(index) = state
                    .slots
                    .iter()
                    .position(|slot| matches!(slot, ContentSlot::Empty))
                {
                    let (task, registration) = AbortHandle::new_pair();
                    state.slots[index] = ContentSlot::Opening(task);
                    Self::start_content_opening(client, pool, index, registration);
                }
            }
            changed.await;
        }
    }

    fn start_content_opening(
        client: &Arc<Client<Transport>>,
        pool: &Arc<ContentPool<Transport::Stream>>,
        index: usize,
        registration: AbortRegistration,
    ) {
        let pool = Arc::downgrade(pool);
        let client = Arc::clone(client);
        let future = async move {
            let Ok(result) = Abortable::new(client.open_content_stream(), registration).await
            else {
                return;
            };
            if let Some(pool) = pool.upgrade() {
                let mut state = pool.state.lock().expect("content pool");
                if !state.closed {
                    state.slots[index] = match result {
                        Ok(stream) => ContentSlot::Idle(stream),
                        Err(error) => {
                            state.errors.push_back(error.into());
                            ContentSlot::Empty
                        }
                    };
                }
                drop(state);
                pool.changed.notify_waiters();
            }
        };
        #[cfg(not(target_arch = "wasm32"))]
        tokio::spawn(future);
        #[cfg(target_arch = "wasm32")]
        wasm_bindgen_futures::spawn_local(future);
    }

    async fn content_request(
        &self,
        request: protocol::Request,
    ) -> Result<Vec<protocol::Response>, SeaClientError> {
        let _permit = self
            .content_permits
            .acquire()
            .await
            .map_err(|_| SeaClientError::new(SeaClientErrorReason::Closed))?;
        let mut lease = self.acquire_content_stream().await?;
        // The exchange owns its stream until completion. Cancellation drops it instead
        // of returning an unread response to another request.
        let result = lease
            .stream
            .as_mut()
            .expect("borrowed content stream")
            .request(request)
            .await;
        lease.reusable = result.is_ok();
        result.map_err(Into::into)
    }

    async fn one_content_response(
        &self,
        request: protocol::Request,
    ) -> Result<protocol::Response, SeaClientError> {
        let mut responses = self.content_request(request).await?;
        if responses.len() != 1 {
            return Err(SeaClientError::new(
                SeaClientErrorReason::UnexpectedResponse,
            ));
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
        hint: sea_core::session::BlobTreeHint,
    ) -> Result<SessionLoad<Self::BlobHandle, Self::EventHandle, Self::Error>, Self::Error> {
        let opened_start = self
            .resume_after
            .map_or(LoadStart::LatestSnapshot, LoadStart::ReplayAtLeastAllAfter);
        if start == opened_start && hint == self.opening_hint {
            let mut opened = self.event_stream.lock().await;
            if let Some((mut events, content)) = opened.take() {
                let first = events.next().await.ok_or(SeaClientError::new(
                    SeaClientErrorReason::UnexpectedResponse,
                ))?;
                let (snapshot, pending) = match first {
                    protocol::Response::LoadSnapshot(snapshot) => {
                        (Some(self.snapshot_from_wire(&snapshot)), None)
                    }
                    response => (None, Some(response)),
                };
                let cursor = snapshot.as_ref().map(|value| value.at_event.id());
                let root = snapshot.as_ref().map(|value| value.root.id());
                let responses = stream::iter(pending.into_iter().map(Ok)).chain(stream::unfold(
                    events,
                    |mut events| async move {
                        events.next().await.map(|response| (Ok(response), events))
                    },
                ));
                return Ok(SessionLoad {
                    snapshot,
                    content: Box::pin(stream::try_unfold(
                        (content, root.is_none()),
                        move |(mut content, progressed)| async move {
                            match content.next().await {
                                Some(protocol::Response::LoadContentComplete) if progressed => {
                                    Ok(None)
                                }
                                Some(protocol::Response::LoadContentComplete) | None => Err(
                                    SeaClientError::new(SeaClientErrorReason::UnexpectedResponse),
                                ),
                                Some(response) => {
                                    let item = blob_tree_from_response(response)?;
                                    let progressed = progressed || Some(item.id()) == root;
                                    Ok(Some((item, (content, progressed))))
                                }
                            }
                        },
                    )),
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
        let content =
            self.get_blob_trees(snapshot.iter().map(|value| value.root.id()).collect(), hint);
        Ok(SessionLoad {
            snapshot,
            events,
            content,
        })
    }

    fn get_blob_trees(
        &self,
        roots: Vec<BlobTreeId>,
        hint: sea_core::session::BlobTreeHint,
    ) -> sea_core::session::BlobTreeStream<Self::Error> {
        if roots.is_empty() {
            return Box::pin(stream::empty());
        }
        let client = Arc::clone(&self.client);
        let pool = Arc::clone(&self.content_pool);
        let permits = Arc::clone(&self.content_permits);
        let initialized = stream::once(async move {
            let permit = permits
                .acquire_owned()
                .await
                .map_err(|_| SeaClientError::new(SeaClientErrorReason::Closed))?;
            let mut lease = Self::acquire_pool_stream(&client, &pool).await?;
            lease
                .stream
                .as_mut()
                .expect("borrowed content stream")
                .begin_response(protocol::Request::GetBlobTrees {
                    roots: roots.iter().copied().map(tree_to_wire).collect(),
                    hint: protocol::LoadingHint::encode(hint)?,
                })
                .await?;
            Ok::<_, SeaClientError>((lease, permit, roots, false))
        });
        Box::pin(
            initialized
                .map_ok(|state| {
                    stream::try_unfold(
                        state,
                        |(mut lease, permit, roots, mut progressed)| async move {
                            let response = lease
                                .stream
                                .as_mut()
                                .expect("borrowed content stream")
                                .next_response()
                                .await?;
                            if let Some(response) = response {
                                let item = blob_tree_from_response(response)?;
                                progressed |= roots.contains(&item.id());
                                Ok(Some((item, (lease, permit, roots, progressed))))
                            } else if progressed {
                                lease.reusable = true;
                                drop(lease);
                                Ok(None)
                            } else {
                                Err(SeaClientError::new(
                                    SeaClientErrorReason::UnexpectedResponse,
                                ))
                            }
                        },
                    )
                })
                .try_flatten(),
        )
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
        let result = self
            .get_blob_trees(vec![id], sea_core::session::BlobTreeHint::default())
            .try_collect::<Vec<_>>()
            .await
            .map(|_| ());
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
            .ok_or(SeaClientError::new(SeaClientErrorReason::Closed))?
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
        #[cfg(not(target_arch = "wasm32"))]
        let mut author = tokio::task::unconstrained(self.author_stream.lock()).await;
        #[cfg(target_arch = "wasm32")]
        let mut author = self.author_stream.lock().await;
        match author
            .as_mut()
            .ok_or(SeaClientError::new(SeaClientErrorReason::Closed))?
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
            .ok_or(SeaClientError::new(SeaClientErrorReason::Closed))?;
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
        self.content_permits.close();
        self.content_pool.close();
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
            return Err(SeaClientError::new(SeaClientErrorReason::Service(
                protocol::ErrorKind::Rejected,
                "snapshot handles belong to another client".to_owned(),
            )));
        }
        let pump = self
            .snapshot_stream
            .lock()
            .await
            .as_ref()
            .and_then(Weak::upgrade)
            .ok_or(SeaClientError::new(SeaClientErrorReason::Closed))?;
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
                    SeaClientError::new(SeaClientErrorReason::Service(
                        protocol::ErrorKind::Unavailable,
                        message,
                    ))
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
            .map_err(|_| SeaClientError::new(SeaClientErrorReason::UnexpectedResponse))?,

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

/// Decodes typed content from the authenticated session.
///
/// Storage verifies leaf bytes before decorators transform them. A transport hop may sit
/// above those decorators, so its leaf payload need not hash to its stable stored identity.
/// Directories remain canonical and can also be verified here.
fn blob_tree_from_response(
    response: protocol::Response,
) -> Result<sea_core::session::BlobTreeItem, SeaClientError> {
    use sea_core::session::BlobTreeItem;
    match response {
        protocol::Response::BlobTree { id, payload } => match tree_from_wire(id) {
            BlobTreeId::Blob(id) => Ok(BlobTreeItem::Blob {
                id,
                bytes: Bytes::from(payload),
            }),
            BlobTreeId::Directory(id) if BlobDirectoryId::for_encoded_bytes(&payload) == id => {
                let directory = BlobDirectory::decode(&payload).map_err(|error| {
                    SeaClientError::new(SeaClientErrorReason::Service(
                        protocol::ErrorKind::Corrupt,
                        error.to_string(),
                    ))
                })?;
                Ok(BlobTreeItem::Directory { id, directory })
            }
            BlobTreeId::Directory(_) => Err(SeaClientError::new(SeaClientErrorReason::Service(
                protocol::ErrorKind::Corrupt,
                "blob-tree digest mismatch".to_owned(),
            ))),
        },
        protocol::Response::LoadContentError { kind, message } => Err(SeaClientError::new(
            SeaClientErrorReason::Service(kind, message),
        )),
        response => Err(response_error(response)),
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
        protocol::Response::Error { kind, message } => {
            SeaClientError::new(SeaClientErrorReason::Service(kind, message))
        }
        _ => SeaClientError::new(SeaClientErrorReason::UnexpectedResponse),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{Response, StreamRole};
    use std::collections::VecDeque;

    fn blob_response(value: u8) -> Response {
        Response::BlobTree {
            id: protocol::TreeId::Blob(*BlobId::for_bytes(&[value]).as_bytes()),
            payload: vec![value],
        }
    }

    #[test]
    fn converting_error_context_preserves_nested_payloads_and_primary_classification() {
        let primary = SeaClientError::new(SeaClientErrorReason::Service(
            protocol::ErrorKind::Conflict,
            "primary conflict".to_owned(),
        ))
        .with_additional_error(SeaClientError::new(SeaClientErrorReason::Closed));
        let nested = SeaClientError::new(SeaClientErrorReason::Service(
            protocol::ErrorKind::Rejected,
            "nested rejection".to_owned(),
        ));
        let additional = ClientError::new(ClientErrorReason::Transport(
            SeaClientError::new(SeaClientErrorReason::UnexpectedResponse)
                .with_additional_error(nested),
        ))
        .with_additional_error(ClientError::new(ClientErrorReason::ResponseEnded));
        let error = ClientError::new(ClientErrorReason::Transport(primary))
            .with_additional_error(additional)
            .with_additional_error(ClientStateError::Closed.into());
        let error = SeaClientError::from(error);
        assert_eq!(error.kind(), ErrorKind::Conflict);
        assert!(matches!(
            error.reason(),
            SeaClientErrorReason::Service(protocol::ErrorKind::Conflict, message)
                if message == "primary conflict"
        ));
        let additional = error.additional_errors();
        assert_eq!(additional.len(), 3);
        assert!(matches!(
            additional[0].reason(),
            SeaClientErrorReason::Closed
        ));
        assert!(matches!(
            additional[1].reason(),
            SeaClientErrorReason::UnexpectedResponse
        ));
        assert!(matches!(
            additional[2].reason(),
            SeaClientErrorReason::Closed
        ));
        let nested = additional[1].additional_errors();
        assert_eq!(nested.len(), 2);
        assert!(matches!(
            nested[0].reason(),
            SeaClientErrorReason::Service(protocol::ErrorKind::Rejected, message)
                if message == "nested rejection"
        ));
        assert_eq!(nested[1].kind(), ErrorKind::Unavailable);
        assert!(error.source().is_none());
        let display = error.to_string();
        assert!(display.starts_with("primary conflict; additional failure:"));
        assert!(display.contains("nested rejection"));
        assert_eq!(display.matches("additional failure:").count(), 5);
        let (reason, additional) = error.into_parts();
        assert_eq!(reason.kind(), ErrorKind::Conflict);
        assert_eq!(additional.len(), 3);
    }

    #[test]
    #[cfg(not(target_arch = "wasm32"))]
    fn error_sources_describe_primary_causes_not_supplementary_failures() {
        let error = ClientError::new(ClientErrorReason::Transport(
            WebTransportError::InvalidConfig,
        ))
        .with_additional_error(ClientError::new(ClientErrorReason::Transport(
            WebTransportError::Timeout,
        )));
        assert!(matches!(
            error.source().unwrap().downcast_ref::<WebTransportError>(),
            Some(WebTransportError::InvalidConfig)
        ));
        assert!(error.to_string().contains("additional failure:"));
        let error = SeaClientError::from(error);
        assert!(matches!(
            error.source().unwrap().downcast_ref::<WebTransportError>(),
            Some(WebTransportError::InvalidConfig)
        ));
        assert!(matches!(
            error.additional_errors()[0]
                .source()
                .unwrap()
                .downcast_ref::<WebTransportError>(),
            Some(WebTransportError::Timeout)
        ));
        assert_eq!(error.kind(), ErrorKind::Unavailable);
    }

    #[test]
    fn generic_error_context_does_not_require_transport_error_traits() {
        let error = ClientError::new(ClientErrorReason::Transport("primary"))
            .with_additional_error(ClientError::new(ClientErrorReason::Transport("cleanup")));
        assert!(matches!(
            error.reason(),
            ClientErrorReason::Transport("primary")
        ));
        assert!(error.to_string().contains("cleanup"));
        let (reason, additional) = error.into_parts();
        assert!(matches!(reason, ClientErrorReason::Transport("primary")));
        assert_eq!(additional.len(), 1);
        assert!(matches!(
            additional[0].reason(),
            ClientErrorReason::Transport("cleanup")
        ));
    }

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
        /// Observes consumed fragments before the test cancels a logical receiver.
        received: Option<Arc<tokio::sync::Notify>>,
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
            let bytes = self.incoming.recv().await;
            if let Some(received) = &self.received {
                received.notify_one();
            }
            Ok(bytes)
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
        opening_client_with_observed_reads(reference, additional, None).await
    }

    /// Optionally observes physical opening reads independently of decoded logical items.
    async fn opening_client_with_observed_reads(
        reference: Option<EventPosition>,
        additional: Vec<OpeningStream>,
        received: Option<Arc<tokio::sync::Notify>>,
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
                received,
            },
            OpeningStream {
                incoming: author_incoming,
                cancelled: None,
                received: None,
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
                hint: sea_core::session::BlobTreeHint::default(),
            },
        )
        .await
        .unwrap();
        (client, events)
    }

    /// Counts idle, opening, and borrowed slots.
    fn content_counts(client: &SessionClient<OpeningTransport>) -> (usize, usize, usize) {
        let state = client.content_pool.state.lock().unwrap();
        let mut counts = (0, 0, 0);
        for slot in &state.slots {
            match slot {
                ContentSlot::Idle(_) => counts.0 += 1,
                ContentSlot::Opening(_) => counts.1 += 1,
                ContentSlot::Borrowed => counts.2 += 1,
                ContentSlot::Empty => {}
            }
        }
        counts
    }

    #[tokio::test]
    async fn content_requests_overlap_with_a_bound_and_reuse_completed_streams() {
        use futures_util::FutureExt as _;

        let mut senders = Vec::new();
        let mut streams = Vec::new();
        for _ in 0..CONTENT_CONCURRENCY {
            let (sender, incoming) = mpsc::unbounded_channel();
            reply(&sender, StreamRole::Content, &Response::Acknowledged);
            senders.push(sender);
            streams.push(OpeningStream {
                incoming,
                cancelled: None,
                received: None,
            });
        }
        let (client, _events) = opening_client_with_streams(None, streams).await;
        let mut requests: Vec<_> = (0..CONTENT_CONCURRENCY)
            .map(|_| Box::pin(client.content_request(protocol::Request::LatestSnapshot)))
            .collect();
        for request in &mut requests {
            assert!(request.as_mut().now_or_never().is_none());
        }
        tokio::task::yield_now().await;
        for request in &mut requests {
            assert!(request.as_mut().now_or_never().is_none());
        }
        assert_eq!(content_counts(&client), (0, 0, CONTENT_CONCURRENCY));
        assert_eq!(client.content_permits.available_permits(), 0);
        let mut waiting = Box::pin(client.content_request(protocol::Request::LatestSnapshot));
        assert!(waiting.as_mut().now_or_never().is_none());

        // A later request can complete before the first one; its response stays on its stream.
        for index in (0..CONTENT_CONCURRENCY).rev() {
            let value = u8::try_from(index).unwrap();
            reply(&senders[index], StreamRole::Content, &blob_response(value));
            reply(
                &senders[index],
                StreamRole::Content,
                &Response::ResponseComplete,
            );
            let result = requests[index].as_mut().now_or_never().unwrap().unwrap();
            assert_eq!(result, vec![blob_response(value)]);
        }
        assert!(waiting.as_mut().now_or_never().is_none());
        reply(&senders[0], StreamRole::Content, &Response::Snapshot(None));
        reply(
            &senders[0],
            StreamRole::Content,
            &Response::ResponseComplete,
        );
        assert_eq!(waiting.await.unwrap(), vec![Response::Snapshot(None)]);
        assert_eq!(content_counts(&client), (CONTENT_CONCURRENCY, 0, 0));
    }

    #[tokio::test]
    async fn returned_content_stream_is_used_while_opening_finishes_for_future_reuse() {
        use futures_util::FutureExt as _;

        for opening_ready in [false, true] {
            let (active, incoming) = mpsc::unbounded_channel();
            let (opening, opening_incoming) = mpsc::unbounded_channel();
            reply(&active, StreamRole::Content, &Response::Acknowledged);
            let (client, _events) = opening_client_with_streams(
                None,
                vec![
                    OpeningStream {
                        incoming,
                        cancelled: None,
                        received: None,
                    },
                    OpeningStream {
                        incoming: opening_incoming,
                        cancelled: None,
                        received: None,
                    },
                ],
            )
            .await;
            let mut first = Box::pin(client.content_request(protocol::Request::LatestSnapshot));
            let mut second = Box::pin(client.content_request(protocol::Request::LatestSnapshot));
            assert!(first.as_mut().now_or_never().is_none());
            tokio::task::yield_now().await;
            assert!(first.as_mut().now_or_never().is_none());
            assert!(second.as_mut().now_or_never().is_none());
            tokio::task::yield_now().await;
            if opening_ready {
                reply(&opening, StreamRole::Content, &Response::Acknowledged);
            }
            reply(&active, StreamRole::Content, &blob_response(1));
            reply(&active, StreamRole::Content, &Response::ResponseComplete);
            assert_eq!(first.await.unwrap(), vec![blob_response(1)]);
            assert!(second.as_mut().now_or_never().is_none());
            assert!(
                !opening.is_closed(),
                "the pool must retain the unused opening"
            );
            reply(&active, StreamRole::Content, &blob_response(2));
            reply(&active, StreamRole::Content, &Response::ResponseComplete);
            assert_eq!(second.await.unwrap(), vec![blob_response(2)]);
            if !opening_ready {
                reply(&opening, StreamRole::Content, &Response::Acknowledged);
            }
            tokio::task::yield_now().await;
            assert_eq!(content_counts(&client), (2, 0, 0));
            let _held = client.acquire_content_stream().await.unwrap();
            let mut next = Box::pin(client.content_request(protocol::Request::LatestSnapshot));
            assert!(next.as_mut().now_or_never().is_none());
            reply(&opening, StreamRole::Content, &blob_response(3));
            reply(&opening, StreamRole::Content, &Response::ResponseComplete);
            assert_eq!(next.await.unwrap(), vec![blob_response(3)]);
            assert_eq!(
                client.content_permits.available_permits(),
                CONTENT_CONCURRENCY
            );
        }
    }

    #[tokio::test]
    async fn returned_content_stream_wakes_waiters_despite_cancellation() {
        use futures_util::FutureExt as _;
        use std::{
            sync::atomic::{AtomicBool, Ordering},
            task::{Context, Wake, Waker},
        };

        struct WakeFlag(AtomicBool);
        impl Wake for WakeFlag {
            fn wake(self: Arc<Self>) {
                self.0.store(true, Ordering::SeqCst);
            }
        }

        let mut senders = Vec::new();
        let mut streams = Vec::new();
        for _ in 0..3 {
            let (sender, incoming) = mpsc::unbounded_channel();
            senders.push(sender);
            streams.push(OpeningStream {
                incoming,
                cancelled: None,
                received: None,
            });
        }
        reply(&senders[0], StreamRole::Content, &Response::Acknowledged);
        let (client, _events) = opening_client_with_streams(None, streams).await;
        let mut first = Box::pin(client.content_request(protocol::Request::LatestSnapshot));
        let mut cancelled = Box::pin(client.content_request(protocol::Request::LatestSnapshot));
        let mut remaining = Box::pin(client.content_request(protocol::Request::LatestSnapshot));
        assert!(first.as_mut().now_or_never().is_none());
        tokio::task::yield_now().await;
        assert!(first.as_mut().now_or_never().is_none());
        assert!(cancelled.as_mut().now_or_never().is_none());
        let wake = Arc::new(WakeFlag(AtomicBool::new(false)));
        let waker = Waker::from(Arc::clone(&wake));
        assert!(
            std::future::Future::poll(remaining.as_mut(), &mut Context::from_waker(&waker))
                .is_pending()
        );
        tokio::task::yield_now().await;
        reply(&senders[0], StreamRole::Content, &Response::Snapshot(None));
        reply(
            &senders[0],
            StreamRole::Content,
            &Response::ResponseComplete,
        );
        first.await.unwrap();
        assert!(
            wake.0.load(Ordering::SeqCst),
            "returning a stream must wake every eligible waiter"
        );
        drop(cancelled);
        assert!(!senders[1].is_closed());
        assert!(remaining.as_mut().now_or_never().is_none());
        assert!(!senders[2].is_closed());
        reply(&senders[0], StreamRole::Content, &Response::Snapshot(None));
        reply(
            &senders[0],
            StreamRole::Content,
            &Response::ResponseComplete,
        );
        assert_eq!(remaining.await.unwrap(), vec![Response::Snapshot(None)]);
        assert_eq!(content_counts(&client), (1, 2, 0));
        client.content_pool.close();
        tokio::task::yield_now().await;
        assert!(senders.iter().all(mpsc::UnboundedSender::is_closed));
    }

    #[tokio::test]
    async fn content_open_failure_and_pool_closure_interrupt_acquisition() {
        use futures_util::FutureExt as _;

        for close_pool in [false, true] {
            let (sender, incoming) = mpsc::unbounded_channel();
            let (client, _events) = opening_client_with_streams(
                None,
                vec![OpeningStream {
                    incoming,
                    cancelled: None,
                    received: None,
                }],
            )
            .await;
            let mut request = Box::pin(client.content_request(protocol::Request::LatestSnapshot));
            assert!(request.as_mut().now_or_never().is_none());
            if close_pool {
                client.content_permits.close();
                client.content_pool.close();
            } else {
                drop(sender);
            }
            tokio::task::yield_now().await;
            let error = request
                .as_mut()
                .now_or_never()
                .expect("acquisition must finish")
                .unwrap_err();
            if close_pool {
                assert!(matches!(error.reason(), SeaClientErrorReason::Closed));
            }
            assert_eq!(
                client.content_permits.available_permits(),
                CONTENT_CONCURRENCY
            );
            assert_eq!(content_counts(&client), (0, 0, 0));
        }
    }

    #[tokio::test]
    async fn cancelled_callers_cannot_exceed_the_total_content_stream_budget() {
        use futures_util::FutureExt as _;

        let mut senders = Vec::new();
        let mut streams = Vec::new();
        for _ in 0..CONTENT_CONCURRENCY {
            let (sender, incoming) = mpsc::unbounded_channel();
            senders.push(sender);
            streams.push(OpeningStream {
                incoming,
                cancelled: None,
                received: None,
            });
        }
        let (client, _events) = opening_client_with_streams(None, streams).await;
        let mut requests: Vec<_> = (0..CONTENT_CONCURRENCY)
            .map(|_| Box::pin(client.content_request(protocol::Request::LatestSnapshot)))
            .collect();
        for request in &mut requests {
            assert!(request.as_mut().now_or_never().is_none());
        }
        tokio::task::yield_now().await;
        drop(requests);
        assert_eq!(content_counts(&client), (0, CONTENT_CONCURRENCY, 0));
        assert_eq!(
            client.content_permits.available_permits(),
            CONTENT_CONCURRENCY
        );
        let mut replacements: Vec<_> = (0..CONTENT_CONCURRENCY)
            .map(|_| Box::pin(client.content_request(protocol::Request::LatestSnapshot)))
            .collect();
        for request in &mut replacements {
            assert!(request.as_mut().now_or_never().is_none());
        }
        tokio::task::yield_now().await;
        assert_eq!(content_counts(&client), (0, CONTENT_CONCURRENCY, 0));
        for sender in &senders {
            reply(sender, StreamRole::Content, &Response::Acknowledged);
        }
        tokio::task::yield_now().await;
        for request in &mut replacements {
            assert!(request.as_mut().now_or_never().is_none());
        }
        assert_eq!(content_counts(&client), (0, 0, CONTENT_CONCURRENCY));
        for sender in &senders {
            reply(sender, StreamRole::Content, &Response::Snapshot(None));
            reply(sender, StreamRole::Content, &Response::ResponseComplete);
        }
        for request in replacements {
            assert_eq!(request.await.unwrap(), vec![Response::Snapshot(None)]);
        }
        assert_eq!(content_counts(&client), (CONTENT_CONCURRENCY, 0, 0));
    }

    #[tokio::test]
    async fn unused_opening_failure_is_reported_by_the_next_acquisition() {
        use futures_util::FutureExt as _;

        let (active, incoming) = mpsc::unbounded_channel();
        let (opening, pending) = mpsc::unbounded_channel();
        reply(&active, StreamRole::Content, &Response::Acknowledged);
        let (client, _events) = opening_client_with_streams(
            None,
            vec![
                OpeningStream {
                    incoming,
                    cancelled: None,
                    received: None,
                },
                OpeningStream {
                    incoming: pending,
                    cancelled: None,
                    received: None,
                },
            ],
        )
        .await;
        let mut first = Box::pin(client.content_request(protocol::Request::LatestSnapshot));
        assert!(first.as_mut().now_or_never().is_none());
        tokio::task::yield_now().await;
        assert!(first.as_mut().now_or_never().is_none());
        let mut second = Box::pin(client.content_request(protocol::Request::LatestSnapshot));
        assert!(second.as_mut().now_or_never().is_none());
        tokio::task::yield_now().await;
        for _ in 0..2 {
            reply(&active, StreamRole::Content, &Response::Snapshot(None));
            reply(&active, StreamRole::Content, &Response::ResponseComplete);
        }
        first.await.unwrap();
        second.await.unwrap();
        drop(opening);
        tokio::task::yield_now().await;
        assert_eq!(content_counts(&client), (1, 0, 0));
        assert!(
            client
                .content_request(protocol::Request::LatestSnapshot)
                .await
                .is_err()
        );
        reply(&active, StreamRole::Content, &Response::Snapshot(None));
        reply(&active, StreamRole::Content, &Response::ResponseComplete);
        assert_eq!(
            client
                .content_request(protocol::Request::LatestSnapshot)
                .await
                .unwrap(),
            vec![Response::Snapshot(None)],
        );
    }

    #[tokio::test]
    async fn closing_or_dropping_the_content_pool_cancels_owned_openings() {
        use futures_util::FutureExt as _;

        for explicit_close in [false, true] {
            let (sender, incoming) = mpsc::unbounded_channel();
            let (client, _events) = opening_client_with_streams(
                None,
                vec![OpeningStream {
                    incoming,
                    cancelled: None,
                    received: None,
                }],
            )
            .await;
            let pool = Arc::downgrade(&client.content_pool);
            let mut request = Box::pin(client.content_request(protocol::Request::LatestSnapshot));
            assert!(request.as_mut().now_or_never().is_none());
            tokio::task::yield_now().await;
            drop(request);
            assert!(!sender.is_closed());
            if explicit_close {
                client.content_pool.close();
                tokio::task::yield_now().await;
                assert!(sender.is_closed());
            }
            drop(client);
            tokio::task::yield_now().await;
            assert!(
                pool.upgrade().is_none(),
                "opening tasks must not keep the pool alive"
            );
            assert!(sender.is_closed());
        }
    }

    #[tokio::test]
    async fn cancelled_and_failed_content_requests_release_capacity_without_reusing_the_stream() {
        use futures_util::FutureExt as _;

        for cancelled in [true, false] {
            let mut senders = Vec::new();
            let mut streams = Vec::new();
            for _ in 0..2 {
                let (sender, incoming) = mpsc::unbounded_channel();
                reply(&sender, StreamRole::Content, &Response::Acknowledged);
                senders.push(sender);
                streams.push(OpeningStream {
                    incoming,
                    cancelled: None,
                    received: None,
                });
            }
            let (client, _events) = opening_client_with_streams(None, streams).await;
            let mut request = Box::pin(client.content_request(protocol::Request::LatestSnapshot));
            assert!(request.as_mut().now_or_never().is_none());
            tokio::task::yield_now().await;
            assert!(request.as_mut().now_or_never().is_none());
            let first = senders.remove(0);
            if cancelled {
                drop(request);
                assert!(first.is_closed());
            } else {
                drop(first);
                assert!(request.await.is_err());
            }
            assert_eq!(
                client.content_permits.available_permits(),
                CONTENT_CONCURRENCY
            );
            assert_eq!(content_counts(&client), (0, 0, 0));
            reply(&senders[0], StreamRole::Content, &Response::Snapshot(None));
            reply(
                &senders[0],
                StreamRole::Content,
                &Response::ResponseComplete,
            );
            assert_eq!(
                client
                    .content_request(protocol::Request::LatestSnapshot)
                    .await
                    .unwrap(),
                vec![Response::Snapshot(None)]
            );
        }
    }

    #[tokio::test]
    async fn submission_reserves_fifo_even_when_cooperative_budget_is_exhausted() {
        use futures_util::FutureExt as _;

        let (client, _events) = opening_client(None).await;
        let preceding = client.author_stream.lock().await;
        while tokio::task::coop::has_budget_remaining() {
            tokio::task::consume_budget().await;
        }
        let mut submit = client.submit(EventSubmission {
            reference: None,
            event: sea_core::Event {
                payload: Bytes::new(),
                blob_tree: None,
            },
        });
        assert!(submit.as_mut().now_or_never().is_none());
        drop(preceding);
        assert!(
            client.author_stream.try_lock().is_err(),
            "the first poll must reserve its turn"
        );
        drop(submit);
        assert!(client.author_stream.try_lock().is_ok());
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
                    .load(start, sea_core::session::BlobTreeHint::default())
                    .await
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
                tokio::task::yield_now().await;
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
                tokio::task::yield_now().await;
                assert!(events.is_closed(), "returned load owns opening delivery");
            }
        }
    }

    #[test]
    fn prefetched_content_preserves_decoded_blob_identity_and_verifies_directories() {
        let payload = vec![1, 2, 3];
        let id = BlobId::for_bytes(&payload);
        assert!(
            blob_tree_from_response(Response::BlobTree {
                id: protocol::TreeId::Blob(*id.as_bytes()),
                payload: payload.clone(),
            })
            .is_ok()
        );
        assert!(
            blob_tree_from_response(Response::BlobTree {
                id: protocol::TreeId::Blob(*id.as_bytes()),
                payload: vec![4],
            })
            .is_ok()
        );
        let directory = BlobDirectory::new(std::collections::BTreeMap::new()).unwrap();
        let (encoded, id) = directory.encode_with_id().unwrap();
        assert!(
            blob_tree_from_response(Response::BlobTree {
                id: protocol::TreeId::Directory(*id.as_bytes()),
                payload: encoded.to_vec(),
            })
            .is_ok()
        );
        assert!(
            blob_tree_from_response(Response::BlobTree {
                id: protocol::TreeId::Directory(*id.as_bytes()),
                payload,
            })
            .is_err()
        );
    }

    #[tokio::test]
    async fn cancelling_content_drains_a_partially_received_frame_before_delivering_events() {
        use futures_util::FutureExt as _;

        let received = Arc::new(tokio::sync::Notify::new());
        let (client, sender) =
            opening_client_with_observed_reads(None, Vec::new(), Some(received.clone())).await;
        reply(
            &sender,
            StreamRole::Event,
            &Response::StreamProgress {
                previous: None,
                latest_known: None,
                status: protocol::StreamStatus::AwaitingNewItems,
            },
        );
        let mut loaded = client
            .load(LoadStart::LatestSnapshot, sea_core::BlobTreeHint::default())
            .await
            .unwrap();
        loaded.events.next().await.unwrap().unwrap();
        while received.notified().now_or_never().is_some() {}
        let frame = protocol::encode_response_frame(
            StreamRole::Event,
            &Response::BlobTree {
                id: protocol::TreeId::Blob([0; 32]),
                payload: vec![42; 16 * 1024],
            },
            protocol::Limits::default(),
        )
        .unwrap();
        sender.send(frame[..frame.len() - 1].to_vec()).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(1), received.notified())
            .await
            .unwrap();
        assert!(loaded.content.next().now_or_never().is_none());
        drop(loaded.content);
        sender.send(frame[frame.len() - 1..].to_vec()).unwrap();
        reply(&sender, StreamRole::Event, &Response::LoadContentComplete);
        reply(
            &sender,
            StreamRole::Event,
            &Response::LoadEvent(Box::new(protocol::StreamEvent {
                kind: protocol::SessionEventKind::Application,
                position: 1,
                session: 2,
                reference: None,
                minimum_reference: None,
                event: protocol::Event {
                    payload: b"after".to_vec(),
                    blob_tree: None,
                },
            })),
        );
        let item = tokio::time::timeout(std::time::Duration::from_secs(1), loaded.events.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let MonitoredStreamItem::Item(event) = item else {
            panic!("expected the event following the discarded body")
        };
        assert_eq!(event.committed.position, EventPosition::new(1));
        assert_eq!(event.committed.event.payload, Bytes::from_static(b"after"));
    }

    #[tokio::test]
    async fn opening_content_and_events_can_be_consumed_and_cancelled_independently() {
        for cancel_content in [false, true] {
            let (client, sender) = opening_client(None).await;
            reply(
                &sender,
                StreamRole::Event,
                &Response::StreamProgress {
                    previous: None,
                    latest_known: None,
                    status: protocol::StreamStatus::AwaitingNewItems,
                },
            );
            let mut loaded = client
                .load(LoadStart::LatestSnapshot, sea_core::BlobTreeHint::default())
                .await
                .unwrap();
            let bytes = vec![42];
            let id = BlobId::for_bytes(&bytes);
            if cancel_content {
                drop(loaded.content);
                reply(
                    &sender,
                    StreamRole::Event,
                    &Response::StreamProgress {
                        previous: Some(5),
                        latest_known: Some(5),
                        status: protocol::StreamStatus::AwaitingNewItems,
                    },
                );
                loaded.events.next().await.unwrap().unwrap();
                let progress = loaded.events.next().await.unwrap().unwrap();
                assert!(
                    matches!(progress, MonitoredStreamItem::Progress(value) if value.previous == Some(EventPosition::new(5)))
                );
                drop(loaded.events);
            } else {
                for position in
                    0..protocol::LOAD_EVENT_WINDOW_BYTES / protocol::LOAD_MESSAGE_OVERHEAD
                {
                    reply(
                        &sender,
                        StreamRole::Event,
                        &Response::StreamProgress {
                            previous: Some(u64::from(position)),
                            latest_known: Some(u64::from(position)),
                            status: protocol::StreamStatus::AwaitingNewItems,
                        },
                    );
                }
                // Fill the unread event window while the content channel completes.
                reply(
                    &sender,
                    StreamRole::Event,
                    &Response::BlobTree {
                        id: protocol::TreeId::Blob(*id.as_bytes()),
                        payload: bytes,
                    },
                );
                reply(&sender, StreamRole::Event, &Response::LoadContentComplete);
                assert_eq!(
                    loaded.content.next().await.unwrap().unwrap().id(),
                    BlobTreeId::Blob(id)
                );
                assert!(loaded.content.next().await.is_none());
                assert!(loaded.events.next().await.unwrap().is_ok());
                drop(loaded);
            }
            tokio::task::yield_now().await;
            assert!(sender.is_closed());
        }
    }

    #[tokio::test]
    async fn cancelling_events_keeps_a_full_content_window_usable() {
        let (client, sender) = opening_client(None).await;
        reply(
            &sender,
            StreamRole::Event,
            &Response::StreamProgress {
                previous: None,
                latest_known: None,
                status: protocol::StreamStatus::AwaitingNewItems,
            },
        );
        let load = client
            .load(LoadStart::LatestSnapshot, sea_core::BlobTreeHint::default())
            .await
            .unwrap();
        let mut content = load.content;
        let count = protocol::LOAD_CONTENT_WINDOW_BYTES / (protocol::LOAD_MESSAGE_OVERHEAD + 4);
        for value in 0..count {
            let payload = value.to_le_bytes().to_vec();
            reply(
                &sender,
                StreamRole::Event,
                &Response::BlobTree {
                    id: protocol::TreeId::Blob(*BlobId::for_bytes(&payload).as_bytes()),
                    payload,
                },
            );
        }
        reply(&sender, StreamRole::Event, &Response::LoadContentComplete);
        drop(load.events);
        for _ in 0..count {
            assert!(content.next().await.unwrap().is_ok());
        }
        assert!(content.next().await.is_none());
    }

    #[tokio::test]
    async fn opening_rejects_content_above_its_byte_window() {
        let (client, sender) = opening_client(None).await;
        reply(
            &sender,
            StreamRole::Event,
            &Response::StreamProgress {
                previous: None,
                latest_known: None,
                status: protocol::StreamStatus::AwaitingNewItems,
            },
        );
        let mut load = client
            .load(LoadStart::LatestSnapshot, sea_core::BlobTreeHint::default())
            .await
            .unwrap();
        let response = Response::BlobTree {
            id: protocol::TreeId::Blob([0; 32]),
            payload: vec![0; protocol::LOAD_CONTENT_MAX_ITEM_BYTES - 1024],
        };
        let count = protocol::LOAD_CONTENT_WINDOW_BYTES / protocol::load_response_bytes(&response);
        for _ in 0..=count {
            reply(&sender, StreamRole::Event, &response);
        }
        // Do not consume content: the pump must reject byte overdelivery even with free queue slots.
        let error = tokio::time::timeout(std::time::Duration::from_secs(1), async {
            loop {
                if let Err(error) = load.events.next().await.unwrap() {
                    break error;
                }
            }
        })
        .await
        .unwrap();
        assert!(matches!(error.kind(), sea_core::ErrorKind::Unavailable));
    }

    #[tokio::test]
    async fn initial_content_requires_snapshot_root_progress() {
        let (client, sender) = opening_client(None).await;
        reply(
            &sender,
            StreamRole::Event,
            &Response::LoadSnapshot(protocol::Snapshot {
                root: protocol::TreeId::Blob([3; 32]),
                at_event: 5,
            }),
        );
        reply(&sender, StreamRole::Event, &Response::LoadContentComplete);
        let mut load = client
            .load(LoadStart::LatestSnapshot, sea_core::BlobTreeHint::default())
            .await
            .unwrap();
        assert!(load.content.next().await.unwrap().is_err());
        reply(
            &sender,
            StreamRole::Event,
            &Response::StreamProgress {
                previous: Some(5),
                latest_known: Some(5),
                status: protocol::StreamStatus::AwaitingNewItems,
            },
        );
        assert!(load.events.next().await.unwrap().is_ok());
    }

    #[tokio::test]
    async fn opening_failure_preserves_classification_on_both_channels() {
        let (client, sender) = opening_client(None).await;
        reply(
            &sender,
            StreamRole::Event,
            &Response::StreamProgress {
                previous: None,
                latest_known: None,
                status: protocol::StreamStatus::AwaitingNewItems,
            },
        );
        let mut load = client
            .load(LoadStart::LatestSnapshot, sea_core::BlobTreeHint::default())
            .await
            .unwrap();
        load.events.next().await.unwrap().unwrap();
        reply(
            &sender,
            StreamRole::Event,
            &Response::Error {
                kind: protocol::ErrorKind::Corrupt,
                message: "corrupt source".to_owned(),
            },
        );
        assert_eq!(
            load.events.next().await.unwrap().unwrap_err().kind(),
            ErrorKind::Corrupt
        );
        assert_eq!(
            load.content.next().await.unwrap().unwrap_err().kind(),
            ErrorKind::Corrupt
        );
    }

    #[tokio::test]
    async fn finite_blob_tree_reads_reuse_only_completed_streams_and_require_progress() {
        use futures_util::FutureExt as _;
        for successful in [false, true] {
            let (sender, incoming) = mpsc::unbounded_channel();
            reply(&sender, StreamRole::Content, &Response::Acknowledged);
            let (client, _events) = opening_client_with_streams(
                None,
                vec![OpeningStream {
                    incoming,
                    cancelled: None,
                    received: None,
                }],
            )
            .await;
            let id = BlobId::for_bytes(&[3]);
            let mut items = client.get_blob_trees(
                vec![BlobTreeId::Blob(id)],
                sea_core::BlobTreeHint::default(),
            );
            assert!(items.next().now_or_never().is_none());
            tokio::task::yield_now().await;
            if successful {
                reply(
                    &sender,
                    StreamRole::Content,
                    &Response::BlobTree {
                        id: protocol::TreeId::Blob(*id.as_bytes()),
                        payload: vec![3],
                    },
                );
            }
            reply(&sender, StreamRole::Content, &Response::ResponseComplete);
            if successful {
                assert_eq!(
                    items.next().await.unwrap().unwrap().id(),
                    BlobTreeId::Blob(id)
                );
                assert!(items.next().await.is_none());
                assert_eq!(content_counts(&client), (1, 0, 0));
            } else {
                assert!(items.next().await.unwrap().is_err());
                assert_eq!(content_counts(&client), (0, 0, 0));
            }
        }
    }

    #[test]
    fn load_rejects_unexpected_response_kind() {
        assert!(matches!(
            (event_from_stream_response(Response::Acknowledged))
                .as_ref()
                .map_err(super::SeaClientError::reason),
            Err(SeaClientErrorReason::UnexpectedResponse)
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
                    received: None,
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
            assert!(
                matches!((client.publish_snapshot(None, None, snapshot).await).as_ref().map_err(super::SeaClientError::reason),
                    Err(SeaClientErrorReason::Service(protocol::ErrorKind::Rejected, message))
                        if message == "snapshot handles belong to another client"
                )
            );
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
                            received: None,
                        },
                        OpeningStream {
                            incoming: snapshot_incoming,
                            cancelled: Some(cancelled),
                            received: None,
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
                    hint: protocol::LoadingHint::default(),
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
