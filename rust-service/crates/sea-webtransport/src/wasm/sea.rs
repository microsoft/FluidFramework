//! Generated Sea bindings over browser and injected JavaScript transports.

#![allow(
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::must_use_candidate
)]

use std::{
    cell::{Cell, RefCell},
    collections::VecDeque,
    rc::{Rc, Weak},
    sync::Arc,
};

use async_trait::async_trait;
#[cfg(feature = "test-support")]
use bytes::Bytes;
#[cfg(feature = "test-support")]
use futures_util::StreamExt as _;
use futures_util::future::{AbortHandle, Abortable};
use js_sys::{Array, Promise, Reflect, Uint8Array};
#[cfg(feature = "test-support")]
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, Event, EventPosition, MonitoredStreamItem,
    MonitoredStreamStatus,
    archive::{
        AuthorId, EventSubmission, OperationId, SessionCommittedEvent, SessionId, SessionStream,
        SnapshotParticipation as ArchiveParticipation,
    },
    session::{
        SeaArchive, SeaAuthorSession, SeaSnapshotCoordinator,
        SnapshotCoordination as ArchiveCoordination,
    },
    storage::{DocumentId, LoadStart, SeaStorage, Snapshot, StorageHandle},
};
use tokio::sync::{mpsc, oneshot, watch};
use wasm_bindgen::{JsCast as _, prelude::*};
use wasm_bindgen_futures::JsFuture;

use super::{
    AsyncRequestTransport, SeaDirectoryEntries, SeaLoadResult, SeaTreeReference, call_method,
    call_optional_method, sea_protocol_v1 as protocol,
};
use crate::{
    client::{
        AuthorStream, Client, ClientError, ClientState, ContentStream, EventStream, ResponseStream,
        SnapshotStream,
    },
    transport::{
        BidirectionalStream, ClientTransport,
        browser::{BrowserBidirectionalStream, BrowserTransport},
    },
};

/// An immutable blob-tree identity exposed to generated consumers.
#[wasm_bindgen]
#[derive(Clone)]
pub struct SeaTreeId {
    inner: protocol::TreeId,
}

#[wasm_bindgen]
impl SeaTreeId {
    /// Creates a blob identity from exactly 32 bytes.
    #[wasm_bindgen(js_name = blob)]
    pub fn blob(bytes: &Uint8Array) -> Result<SeaTreeId, JsValue> {
        Ok(Self {
            inner: protocol::TreeId::Blob(fixed_id(bytes)?),
        })
    }

    /// Creates a directory identity from exactly 32 bytes.
    #[wasm_bindgen(js_name = directory)]
    pub fn directory(bytes: &Uint8Array) -> Result<SeaTreeId, JsValue> {
        Ok(Self {
            inner: protocol::TreeId::Directory(fixed_id(bytes)?),
        })
    }

    /// Returns `blob` or `directory`.
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> SeaTreeKind {
        match self.inner {
            protocol::TreeId::Blob(_) => SeaTreeKind::Blob,
            protocol::TreeId::Directory(_) => SeaTreeKind::Directory,
        }
    }

    /// Returns the fixed identity bytes.
    #[wasm_bindgen(getter)]
    pub fn bytes(&self) -> Uint8Array {
        match self.inner {
            protocol::TreeId::Blob(bytes) | protocol::TreeId::Directory(bytes) => {
                Uint8Array::from(bytes.as_slice())
            }
        }
    }
}

/// Closed immutable tree-identity cases.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum SeaTreeKind {
    /// Immutable blob bytes.
    Blob = 1,
    /// Immutable directory entries.
    Directory = 2,
}

/// One named child supplied when publishing a directory.
#[wasm_bindgen]
#[derive(Clone)]
pub struct SeaDirectoryEntry {
    name: String,
    child: SeaTreeId,
}

#[wasm_bindgen]
impl SeaDirectoryEntry {
    /// Creates one directory entry.
    #[wasm_bindgen(constructor)]
    pub fn new(name: String, child: &SeaTreeId) -> Self {
        Self {
            name,
            child: child.clone(),
        }
    }

    /// Returns the child name.
    #[wasm_bindgen(getter)]
    pub fn name(&self) -> String {
        self.name.clone()
    }

    /// Returns the child's closed identity value.
    #[wasm_bindgen(getter)]
    pub fn child(&self) -> SeaTreeId {
        self.child.clone()
    }
}

/// Closed service error categories exposed on generated JavaScript errors.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum SeaErrorKind {
    /// A position or identity is malformed or unavailable.
    Invalid = 1,
    /// Required retained state is no longer available.
    Stale = 2,
    /// Preconditions or stable identities conflict.
    Conflict = 3,
    /// The operation was definitively rejected.
    Rejected = 4,
    /// The operation may have committed.
    Ambiguous = 5,
    /// The service cannot currently complete the operation.
    Unavailable = 6,
    /// Persisted or received data is corrupt.
    Corrupt = 7,
}

/// Snapshot publication policy selected when opening coordination.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum SeaSnapshotParticipation {
    /// Receives snapshot state but cannot publish.
    ReadOnly = 1,
    /// Publishes only while selected and fenced by Sea.
    SeaSelected = 2,
    /// Publishes under client-managed selection without a Sea fence.
    ClientSelected = 3,
}

/// Metadata for one snapshot publication.
#[wasm_bindgen]
#[derive(Clone)]
pub struct SeaSnapshot {
    inner: protocol::Snapshot,
}

#[wasm_bindgen]
impl SeaSnapshot {
    /// Returns the included committed event and document-scoped version identity.
    #[wasm_bindgen(getter, js_name = atEvent)]
    pub fn at_event(&self) -> u64 {
        self.inner.at_event
    }

    /// Returns the snapshot tree root.
    #[wasm_bindgen(getter)]
    pub fn root(&self) -> SeaTreeId {
        SeaTreeId {
            inner: self.inner.root,
        }
    }
}

/// One item from a gap-free Sea load stream.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum SeaLoadKind {
    /// A selected recovery snapshot.
    Snapshot = 1,
    /// One catch-up or live event.
    Event = 2,
    /// One out-of-band delivery progress snapshot.
    Progress = 3,
}

/// Current monitored-stream delivery state.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum SeaStreamStatus {
    /// Initial discovery is incomplete, or unread items are known to exist.
    StreamingBacklog = 1,
    /// Initial discovery is complete and the stream is waiting for new items.
    AwaitingNewItems = 2,
    /// Items are buffering because throughput is limiting delivery.
    FallenBehind = 3,
}

/// One item from a gap-free Sea load stream.
#[wasm_bindgen]
pub struct SeaLoadItem {
    inner: protocol::Response,
}

#[wasm_bindgen]
impl SeaLoadItem {
    /// Returns the closed load-item case.
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> SeaLoadKind {
        match self.inner {
            protocol::Response::LoadSnapshot(_) => SeaLoadKind::Snapshot,
            protocol::Response::LoadEvent(_) => SeaLoadKind::Event,
            protocol::Response::StreamProgress { .. } => SeaLoadKind::Progress,
            _ => unreachable!("SeaLoadItem is constructed only from load responses"),
        }
    }

    /// Returns the selected snapshot when this is a snapshot item.
    #[wasm_bindgen(getter)]
    pub fn snapshot(&self) -> Option<SeaSnapshot> {
        match &self.inner {
            protocol::Response::LoadSnapshot(snapshot) => Some(SeaSnapshot {
                inner: snapshot.clone(),
            }),
            _ => None,
        }
    }

    /// Returns the event position when this is an event item.
    #[wasm_bindgen(getter)]
    pub fn position(&self) -> Option<u64> {
        match &self.inner {
            protocol::Response::LoadEvent(event) => Some(event.position),
            _ => None,
        }
    }

    /// Returns the cursor immediately before the next unread event for a progress item.
    #[wasm_bindgen(getter)]
    pub fn previous(&self) -> Option<u64> {
        match self.inner {
            protocol::Response::StreamProgress { previous, .. } => previous,
            _ => None,
        }
    }

    /// Returns the latest known event position for a progress item.
    #[wasm_bindgen(getter, js_name = latestKnown)]
    pub fn latest_known(&self) -> Option<u64> {
        match self.inner {
            protocol::Response::StreamProgress { latest_known, .. } => latest_known,
            _ => None,
        }
    }

    /// Returns the monitored delivery state for a progress item.
    #[wasm_bindgen(getter)]
    pub fn status(&self) -> Option<SeaStreamStatus> {
        match self.inner {
            protocol::Response::StreamProgress { status, .. } => Some(match status {
                protocol::StreamStatus::StreamingBacklog => SeaStreamStatus::StreamingBacklog,
                protocol::StreamStatus::AwaitingNewItems => SeaStreamStatus::AwaitingNewItems,
                protocol::StreamStatus::FallenBehind => SeaStreamStatus::FallenBehind,
            }),
            _ => None,
        }
    }

    /// Returns the opaque event payload.
    #[wasm_bindgen(getter)]
    pub fn payload(&self) -> Option<Uint8Array> {
        match &self.inner {
            protocol::Response::LoadEvent(event) => {
                Some(Uint8Array::from(event.event.payload.as_slice()))
            }
            _ => None,
        }
    }

    /// Returns the stable event author identity.
    #[wasm_bindgen(getter)]
    pub fn author(&self) -> Option<Uint8Array> {
        match &self.inner {
            protocol::Response::LoadEvent(event) => Some(Uint8Array::from(event.author.as_slice())),
            _ => None,
        }
    }

    /// Returns the connection identity that submitted the event.
    #[wasm_bindgen(getter)]
    pub fn session(&self) -> Option<Uint8Array> {
        match &self.inner {
            protocol::Response::LoadEvent(event) => {
                Some(Uint8Array::from(event.session.as_slice()))
            }
            _ => None,
        }
    }

    /// Returns the stable event operation identity.
    #[wasm_bindgen(getter)]
    pub fn operation(&self) -> Option<Uint8Array> {
        match &self.inner {
            protocol::Response::LoadEvent(event) => {
                Some(Uint8Array::from(event.operation.as_slice()))
            }
            _ => None,
        }
    }

    /// Returns the event author's reference position.
    #[wasm_bindgen(getter)]
    pub fn reference(&self) -> Option<u64> {
        match &self.inner {
            protocol::Response::LoadEvent(event) => event.reference,
            _ => None,
        }
    }

    /// Returns the minimum active reference position.
    #[wasm_bindgen(getter, js_name = minimumReference)]
    pub fn minimum_reference(&self) -> Option<u64> {
        match &self.inner {
            protocol::Response::LoadEvent(event) => event.minimum_reference,
            _ => None,
        }
    }

    /// Returns the event's optional blob-tree root.
    #[wasm_bindgen(getter, js_name = blobTree)]
    pub fn blob_tree(&self) -> Option<SeaTreeId> {
        match &self.inner {
            protocol::Response::LoadEvent(event) => {
                event.event.blob_tree.map(|inner| SeaTreeId { inner })
            }
            _ => None,
        }
    }
}

/// Cancellable discriminated load stream over an injected transport.
#[wasm_bindgen]
pub struct SeaInjectedStream {
    inner: RefCell<Option<ResponseStream<InjectedBidirectionalStream>>>,
    pending_read: RefCell<Option<(Rc<Client<InjectedTransport>>, protocol::Request)>>,
    buffered: RefCell<VecDeque<protocol::Response>>,
    pending_abort: RefCell<Option<AbortHandle>>,
    cancelled: Cell<bool>,
}

/// Latest accepted snapshot and this client's nomination fence.
#[wasm_bindgen]
pub struct SeaSnapshotCoordination {
    latest: Option<u64>,
    fence: Option<u64>,
}

#[wasm_bindgen]
impl SeaSnapshotCoordination {
    /// Returns the event position of the latest accepted snapshot.
    #[wasm_bindgen(getter)]
    pub fn latest(&self) -> Option<u64> {
        self.latest
    }

    /// Returns this client's current nomination fence.
    #[wasm_bindgen(getter)]
    pub fn fence(&self) -> Option<u64> {
        self.fence
    }
}

/// Latest-value snapshot coordination updates.
#[wasm_bindgen]
pub struct SeaInjectedSnapshotStream {
    /// Sole owner of this registration's browser-local I/O task.
    pump: Rc<InjectedSnapshotPump>,
    /// Coalescible state receiver, taken while a read is pending.
    receiver:
        RefCell<Option<watch::Receiver<Result<protocol::payload::SnapshotCoordination, JsValue>>>>,
    /// Cancellation for a pending notification read.
    pending_abort: RefCell<Option<AbortHandle>>,
    initial: Cell<bool>,
    cancelled: Cell<bool>,
}

/// One queued request on the browser-owned snapshot stream.
struct InjectedSnapshotCommand {
    /// Snapshot operation to send in order.
    request: protocol::Request,
    /// Completion delivered independently of caller cancellation.
    response: oneshot::Sender<Result<protocol::Response, JsValue>>,
}

/// Single non-Send owner of snapshot stream reads and correlated requests.
struct InjectedSnapshotPump {
    /// Bounded command queue feeding the local task.
    commands: mpsc::Sender<InjectedSnapshotCommand>,
    /// Last observed nomination and publication position.
    state: watch::Receiver<Result<protocol::payload::SnapshotCoordination, JsValue>>,
    /// Cancels transport ownership when its registration is dropped.
    abort: AbortHandle,
}

impl Drop for InjectedSnapshotPump {
    fn drop(&mut self) {
        self.abort.abort();
    }
}

impl InjectedSnapshotPump {
    /// Starts a browser-local task without requiring transport state to be Send.
    fn start(mut stream: SnapshotStream<InjectedBidirectionalStream>) -> Rc<Self> {
        let state = |stream: &SnapshotStream<InjectedBidirectionalStream>| {
            protocol::payload::SnapshotCoordination {
                latest: stream.latest(),
                fence: stream.fence(),
            }
        };
        let (updates, receiver) = watch::channel(Ok(state(&stream)));
        let (commands, mut requests) = mpsc::channel::<InjectedSnapshotCommand>(16);
        let (abort, registration) = AbortHandle::new_pair();
        wasm_bindgen_futures::spawn_local(async move {
            let _ = Abortable::new(async move {
                loop {
                    tokio::select! {
                        command = requests.recv() => {
                            let Some(command) = command else { break; };
                            let result = stream.request(command.request).await.map_err(client_error);
                            if let Err(error) = &result {
                                let _ = updates.send_replace(Err(error.clone()));
                                let _ = command.response.send(result);
                                break;
                            }
                            let _ = updates.send_replace(Ok(state(&stream)));
                            let _ = command.response.send(result);
                        }
                        result = stream.next_coordination() => {
                            match result {
                                Ok(()) => { let _ = updates.send_replace(Ok(state(&stream))); }
                                Err(error) => { let _ = updates.send_replace(Err(client_error(error))); break; }
                            }
                        }
                    }
                }
            }, registration).await;
        });
        Rc::new(Self {
            commands,
            state: receiver,
            abort,
        })
    }

    /// Queues one request without issuing retries after cancellation or ambiguity.
    async fn request(&self, request: protocol::Request) -> Result<protocol::Response, JsValue> {
        let (response, received) = oneshot::channel();
        self.commands
            .send(InjectedSnapshotCommand { request, response })
            .await
            .map_err(|_| js_error("Sea snapshot stream is closed"))?;
        received
            .await
            .map_err(|_| js_error("Sea snapshot stream is closed"))?
    }
}

#[wasm_bindgen]
impl SeaInjectedSnapshotStream {
    /// Waits for the next accepted-snapshot or nomination update.
    pub async fn next(&self) -> Result<SeaSnapshotCoordination, JsValue> {
        if self.cancelled.get() {
            return Err(js_error("Sea snapshot stream is cancelled"));
        }
        let mut receiver = self
            .receiver
            .take()
            .ok_or_else(|| js_error("Sea snapshot stream is already being read"))?;
        if !self.initial.replace(false) {
            let (abort, registration) = AbortHandle::new_pair();
            self.pending_abort.replace(Some(abort));
            let changed = Abortable::new(receiver.changed(), registration).await;
            self.pending_abort.take();
            if !matches!(changed, Ok(Ok(()))) {
                return Err(js_error("Sea snapshot stream ended"));
            }
        }
        let state = receiver.borrow_and_update().clone();
        self.receiver.replace(Some(receiver));
        let state = state?;
        Ok(SeaSnapshotCoordination {
            latest: state.latest,
            fence: state.fence,
        })
    }

    /// Finishes coordination and revokes publisher eligibility.
    pub async fn cancel(&self) -> Result<(), JsValue> {
        if !self.cancelled.replace(true) {
            if let Some(abort) = self.pending_abort.take() {
                abort.abort();
            }
            if self.pump.abort.is_aborted() {
                self.receiver.take();
                return Ok(());
            }
            let result = self.pump.request(protocol::Request::Close).await;
            self.pump.abort.abort();
            self.receiver.take();
            match result? {
                protocol::Response::Acknowledged => {}
                protocol::Response::Error { kind, message } => {
                    return Err(service_error(kind, &message));
                }
                _ => return Err(js_error("invalid snapshot close response")),
            }
        }
        Ok(())
    }
}

/// Raw browser WebTransport adapter consumed by [`SeaInjectedClient`].
#[wasm_bindgen]
pub struct SeaBrowserTransport {
    transport: Rc<BrowserTransport>,
}

/// Raw browser WebTransport bidirectional byte stream.
#[wasm_bindgen]
pub struct SeaBrowserBidirectionalStream {
    /// Shared reader and writer ownership allows full-duplex browser operations.
    inner: BrowserBidirectionalStream,
}

#[wasm_bindgen]
impl SeaBrowserTransport {
    /// Connects to a native `/sea` endpoint with one certificate pin.
    #[wasm_bindgen(js_name = connect)]
    pub async fn connect(
        url: String,
        certificate_hash: Uint8Array,
        max_frame_bytes: usize,
    ) -> Result<SeaBrowserTransport, JsValue> {
        if max_frame_bytes < protocol::MIN_FRAME_BYTES {
            return Err(js_error(
                "max_frame_bytes is smaller than the Sea frame header",
            ));
        }
        let certificate_hash = certificate_hash.to_vec();
        if certificate_hash.len() != 32 {
            return Err(js_error("certificate hash must contain exactly 32 bytes"));
        }
        Ok(Self {
            transport: Rc::new(BrowserTransport::connect(&url, &certificate_hash).await?),
        })
    }

    /// Opens one raw browser WebTransport bidirectional stream.
    #[wasm_bindgen(js_name = openBidirectional)]
    pub async fn open_bidirectional(&self) -> Result<SeaBrowserBidirectionalStream, JsValue> {
        Ok(SeaBrowserBidirectionalStream {
            inner: self.transport.open_bidirectional().await?,
        })
    }

    /// Closes the browser WebTransport connection.
    pub fn disconnect(&self) {
        let _ = self.transport.disconnect();
    }
}

#[wasm_bindgen]
impl SeaBrowserBidirectionalStream {
    /// Sends one arbitrary byte chunk.
    pub async fn send(&self, bytes: Uint8Array) -> Result<(), JsValue> {
        self.inner.clone().send(&bytes.to_vec()).await
    }

    /// Finishes the stream's send direction.
    pub async fn finish(&self) -> Result<(), JsValue> {
        self.inner.clone().finish().await
    }

    /// Receives the next arbitrary byte chunk.
    pub async fn receive(&self) -> Result<Option<Uint8Array>, JsValue> {
        Ok(self
            .inner
            .clone()
            .receive()
            .await?
            .map(|bytes| Uint8Array::from(bytes.as_slice())))
    }

    /// Cancels both stream directions and releases their locks.
    pub async fn cancel(&self) -> Result<(), JsValue> {
        self.inner.clone().cancel().await
    }
}

#[wasm_bindgen]
impl SeaInjectedStream {
    /// Waits for the next discriminated stream item.
    pub async fn next(&self) -> Result<Option<SeaLoadResult>, JsValue> {
        if self.cancelled.get() {
            return Err(js_error("Sea stream is cancelled"));
        }
        if let Some(response) = self.buffered.borrow_mut().pop_front() {
            return load_item(response).map(load_result).map(Some);
        }
        if let Some((client, request)) = self.pending_read.take() {
            let content = client.open_content_stream().await.map_err(client_error)?;
            let responses = content
                .request_stream(request)
                .await
                .map_err(client_error)?;
            self.inner.replace(Some(responses));
        }
        if self.inner.borrow().is_none() {
            return Ok(None);
        }
        let mut stream = self
            .inner
            .take()
            .ok_or_else(|| js_error("Sea stream has ended"))?;
        let (abort, registration) = AbortHandle::new_pair();
        self.pending_abort.replace(Some(abort));
        let response = Abortable::new(stream.next(), registration).await;
        self.pending_abort.replace(None);
        let Ok(response) = response else {
            return Ok(None);
        };
        let response = response.map_err(client_error)?;
        if response.is_some() {
            self.inner.replace(Some(stream));
        }
        let Some(response) = response else {
            return Ok(None);
        };
        load_item(response).map(load_result).map(Some)
    }

    /// Cancels the stream and injected transport.
    pub async fn cancel(&self) -> Result<(), JsValue> {
        if !self.cancelled.replace(true) {
            if let Some(abort) = self.pending_abort.take() {
                abort.abort();
            }
            if let Some(stream) = self.inner.take() {
                stream.cancel().await.map_err(client_error)?;
            }
            self.pending_read.take();
        }
        Ok(())
    }
}

/// Generated Sea client using a caller-provided asynchronous transport.
#[wasm_bindgen]
pub struct SeaInjectedClient {
    transport: Rc<RefCell<JsValue>>,
    client: Rc<Client<InjectedTransport>>,
    event_stream: RefCell<Option<EventStream<InjectedBidirectionalStream>>>,
    author_stream: RefCell<Option<AuthorStream<InjectedBidirectionalStream>>>,
    /// Weak reference so dropping the returned subscription revokes ownership.
    snapshot_stream: RefCell<Option<Weak<InjectedSnapshotPump>>>,
    snapshot_participation: Cell<Option<SeaSnapshotParticipation>>,
    content_stream: RefCell<Option<ContentStream<InjectedBidirectionalStream>>>,
    resume_after: Cell<Option<u64>>,
}

#[derive(Clone, Debug)]
struct InjectedTransport {
    inner: Rc<RefCell<JsValue>>,
}

#[derive(Debug)]
struct InjectedBidirectionalStream {
    inner: JsValue,
    /// Retains a started JavaScript receive across cancelled Rust waiters.
    pending_receive: Option<Promise>,
    /// Prevents duplicate explicit and drop cancellation.
    cancelled: bool,
}

impl Drop for InjectedBidirectionalStream {
    fn drop(&mut self) {
        if !self.cancelled
            && let Ok(cancelled) = call_method(&self.inner, "cancel", &[])
        {
            let promise = Promise::resolve(&cancelled);
            wasm_bindgen_futures::spawn_local(async move {
                let _ = JsFuture::from(promise).await;
            });
        }
    }
}

#[async_trait(?Send)]
impl ClientTransport for InjectedTransport {
    type Stream = InjectedBidirectionalStream;
    type Error = JsValue;

    async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error> {
        let stream = call_method(&self.inner.borrow(), "openBidirectional", &[])?;
        let stream = JsFuture::from(Promise::resolve(&stream)).await?;
        Ok(InjectedBidirectionalStream {
            inner: stream,
            pending_receive: None,
            cancelled: false,
        })
    }

    fn disconnect(&self) -> Result<(), Self::Error> {
        call_optional_method(&self.inner.borrow(), "disconnect", &[]).map(|_| ())
    }
}

#[async_trait(?Send)]
impl BidirectionalStream for InjectedBidirectionalStream {
    type Error = JsValue;

    async fn send(&mut self, bytes: &[u8]) -> Result<(), Self::Error> {
        let sent = call_method(&self.inner, "send", &[Uint8Array::from(bytes).into()])?;
        JsFuture::from(Promise::resolve(&sent)).await?;
        Ok(())
    }

    async fn finish(&mut self) -> Result<(), Self::Error> {
        let finished = call_method(&self.inner, "finish", &[])?;
        JsFuture::from(Promise::resolve(&finished)).await?;
        Ok(())
    }

    async fn receive(&mut self) -> Result<Option<Vec<u8>>, Self::Error> {
        if self.pending_receive.is_none() {
            let received = call_method(&self.inner, "receive", &[])?;
            self.pending_receive = Some(Promise::resolve(&received));
        }
        let received = JsFuture::from(
            self.pending_receive
                .as_ref()
                .expect("pending receive")
                .clone(),
        )
        .await;
        self.pending_receive.take();
        let received = received?;
        if received.is_null() || received.is_undefined() {
            return Ok(None);
        }
        if !received.is_instance_of::<Uint8Array>() {
            return Err(js_error("Sea transport chunk is not a Uint8Array"));
        }
        Ok(Some(Uint8Array::new(&received).to_vec()))
    }

    async fn cancel(&mut self) -> Result<(), Self::Error> {
        if self.cancelled {
            return Ok(());
        }
        self.cancelled = true;
        let cancelled = call_method(&self.inner, "cancel", &[])?;
        JsFuture::from(Promise::resolve(&cancelled)).await?;
        Ok(())
    }
}

#[cfg(feature = "test-support")]
mod test_support {
    use std::collections::BTreeMap;

    use sea_memory::{MemoryStorage, MemoryStorageError};
    use sea_sequencer::{
        session::SessionError,
        session::{LocalSequencer, LocalSession},
    };

    use super::*;

    type LocalSnapshotCoordinationStream =
        SessionStream<ArchiveCoordination, SessionError<MemoryStorageError>>;
    /// Process-local document namespace and serialized runtime initialization.
    struct LocalDocuments {
        /// Backend allocator retaining every document.
        storage: MemoryStorage,
        /// Exclusive views shared by all clients opening the same document.
        runtimes: futures_util::lock::Mutex<BTreeMap<Vec<u8>, Arc<LocalSequencer<MemoryStorage>>>>,
    }

    struct LocalSnapshotRegistration {
        /// Lease-bearing coordination stream, taken during a pending read.
        stream: RefCell<Option<LocalSnapshotCoordinationStream>>,
        /// Wakes a pending notification read when this registration ends.
        pending_abort: RefCell<Option<AbortHandle>>,
        /// Last delivered nomination fence for this registration only.
        fence: Cell<Option<u64>>,
        /// Whether the registration has been explicitly ended.
        cancelled: Cell<bool>,
    }

    impl LocalSnapshotRegistration {
        /// Ends only this registration and wakes any pending read.
        fn cancel(&self) {
            self.cancelled.set(true);
            if let Some(abort) = self.pending_abort.take() {
                abort.abort();
            }
            self.stream.take();
            self.fence.set(None);
        }
    }

    /// Shared in-process memory service for generated-client tests.
    #[wasm_bindgen]
    pub struct SeaLocalService {
        /// Shared factory and active document ownership.
        documents: Rc<LocalDocuments>,
    }

    #[wasm_bindgen]
    impl SeaLocalService {
        /// Creates one empty in-process archive service.
        pub async fn create() -> Result<SeaLocalService, JsValue> {
            std::future::ready(()).await;
            Ok(Self {
                documents: Rc::new(LocalDocuments {
                    storage: MemoryStorage::new(),
                    runtimes: futures_util::lock::Mutex::new(BTreeMap::new()),
                }),
            })
        }

        /// Creates one client sharing this service's archive registry.
        pub fn connect(&self) -> SeaLocalClient {
            SeaLocalClient {
                documents: Rc::clone(&self.documents),
                session: RefCell::new(None),
                snapshot_stream: RefCell::new(None),
                snapshot_participation: Cell::new(None),
                disconnected: Cell::new(false),
            }
        }
    }

    /// In-process Sea client used by local browser tests and benchmarks.
    #[wasm_bindgen]
    pub struct SeaLocalClient {
        /// Backend factory shared with the creating service.
        documents: Rc<LocalDocuments>,
        session: RefCell<Option<Rc<LocalSession<MemoryStorage>>>>,
        snapshot_stream: RefCell<Option<Weak<LocalSnapshotRegistration>>>,
        snapshot_participation: Cell<Option<SeaSnapshotParticipation>>,
        disconnected: Cell<bool>,
    }

    #[wasm_bindgen]
    impl SeaLocalClient {
        /// Creates a backend-identified document and opens its first author session.
        #[wasm_bindgen(js_name = createDocument)]
        pub async fn create_document(
            &self,
            author: Uint8Array,
            session: Uint8Array,
        ) -> Result<Uint8Array, JsValue> {
            self.open_session(Uint8Array::new_with_length(0), true, author, session, None)
                .await
        }

        /// Opens or replaces this client's author session.
        #[wasm_bindgen(js_name = openSession)]
        pub async fn open_session(
            &self,
            archive: Uint8Array,
            create: bool,
            author: Uint8Array,
            session: Uint8Array,
            reference: Option<u64>,
        ) -> Result<Uint8Array, JsValue> {
            let archive = archive.to_vec();
            let author = AuthorId::new(Bytes::from(author.to_vec()))
                .map_err(|_| js_error("author identity is empty"))?;
            let session_id = SessionId::new(Bytes::from(session.to_vec()))
                .map_err(|_| js_error("session identity is empty"))?;
            let mut runtimes = self.documents.runtimes.lock().await;
            let (document, sequencer) = if create {
                if !archive.is_empty() {
                    return Err(js_error("creation does not accept a document identity"));
                }
                let (id, view) = self
                    .documents
                    .storage
                    .create_view()
                    .await
                    .map_err(|error| js_error(&error.to_string()))?;
                let runtime = LocalSequencer::recover(view)
                    .await
                    .map_err(|error| js_error(&error.to_string()))?;
                runtimes.insert(id.as_bytes().to_vec(), runtime.clone());
                (id.as_bytes().to_vec(), runtime)
            } else {
                if !runtimes.contains_key(&archive) {
                    let id = DocumentId::from_bytes(Bytes::copy_from_slice(&archive));
                    let view = self
                        .documents
                        .storage
                        .open_view(&id)
                        .await
                        .map_err(|error| js_error(&error.to_string()))?
                        .ok_or_else(|| js_error("document does not exist"))?;
                    let runtime = LocalSequencer::recover(view)
                        .await
                        .map_err(|error| js_error(&error.to_string()))?;
                    runtimes.insert(archive.clone(), runtime);
                }
                (
                    archive.clone(),
                    runtimes.get(&archive).expect("document opened").clone(),
                )
            };
            drop(runtimes);
            self.disconnected.set(false);
            if let Some(registration) = self.snapshot_stream.take().and_then(|weak| weak.upgrade())
            {
                registration.cancel();
            }
            self.snapshot_participation.set(None);
            let previous = self.session.borrow().clone();
            if let Some(previous) = previous {
                previous
                    .close()
                    .await
                    .map_err(|error| js_error(&error.to_string()))?;
            }
            let session = sequencer
                .open_session(author, session_id, reference.map(EventPosition::new))
                .await
                .map_err(|error| js_error(&error.to_string()))?;
            self.session.replace(Some(Rc::new(session)));
            Ok(Uint8Array::from(document.as_slice()))
        }

        /// Submits one event.
        pub async fn submit(
            &self,
            operation: Uint8Array,
            reference: Option<u64>,
            payload: Uint8Array,
            blob_tree: Option<SeaTreeReference>,
        ) -> Result<u64, JsValue> {
            let receipt = self
                .current()?
                .submit(EventSubmission {
                    operation_id: OperationId::new(Bytes::from(operation.to_vec()))
                        .map_err(|_| js_error("operation identity is empty"))?,
                    reference: reference.map(EventPosition::new),
                    event: Event {
                        payload: Bytes::from(payload.to_vec()),
                        blob_tree: blob_tree
                            .map(|value| tree_from_js(value.as_ref()).map(core_tree))
                            .transpose()?,
                    },
                })
                .await
                .map_err(|error| js_error(&error.to_string()))?;
            Ok(receipt.get())
        }

        /// Resolves one stable event operation.
        #[wasm_bindgen(js_name = resolveSubmission)]
        pub async fn resolve_submission(
            &self,
            operation: Uint8Array,
        ) -> Result<Option<u64>, JsValue> {
            let operation = OperationId::new(Bytes::from(operation.to_vec()))
                .map_err(|_| js_error("operation identity is empty"))?;
            Ok(self
                .current()?
                .resolve_submission(&operation)
                .await
                .map_err(|error| js_error(&error.to_string()))?
                .map(EventPosition::get))
        }

        /// Uploads one immutable blob.
        #[wasm_bindgen(js_name = putBlob)]
        pub async fn put_blob(&self, payload: Uint8Array) -> Result<SeaTreeId, JsValue> {
            let id = self
                .current()?
                .put_blob(Bytes::from(payload.to_vec()))
                .await
                .map_err(|error| js_error(&error.to_string()))?;
            Ok(SeaTreeId {
                inner: wire_tree(id.id()),
            })
        }

        /// Fetches one immutable blob.
        #[wasm_bindgen(js_name = getBlob)]
        pub async fn get_blob(&self, id: &SeaTreeId) -> Result<Uint8Array, JsValue> {
            let protocol::TreeId::Blob(bytes) = id.inner else {
                return Err(js_error("getBlob requires a blob identity"));
            };
            let payload = self
                .current()?
                .get_blob(BlobId::from_bytes(&bytes).expect("fixed identity"))
                .await
                .map_err(|error| js_error(&error.to_string()))?;
            Ok(Uint8Array::from(payload.as_ref()))
        }

        /// Uploads one immutable directory.
        #[wasm_bindgen(js_name = putDirectory)]
        pub async fn put_directory(
            &self,
            entries: SeaDirectoryEntries,
        ) -> Result<SeaTreeId, JsValue> {
            let mut directory = BTreeMap::new();
            for value in Array::from(entries.as_ref()) {
                let name = Reflect::get(&value, &JsValue::from_str("name"))?
                    .as_string()
                    .ok_or_else(|| js_error("directory entry name is not a string"))?;
                let child = Reflect::get(&value, &JsValue::from_str("child"))?;
                if directory
                    .insert(name, core_tree(tree_from_js(&child)?))
                    .is_some()
                {
                    return Err(js_error("directory contains a duplicate name"));
                }
            }
            let directory =
                BlobDirectory::new(directory).map_err(|error| js_error(&error.to_string()))?;
            let id = self
                .current()?
                .put_directory(directory)
                .await
                .map_err(|error| js_error(&error.to_string()))?;
            Ok(SeaTreeId {
                inner: wire_tree(id.id()),
            })
        }

        /// Fetches one immutable directory.
        #[wasm_bindgen(js_name = getDirectory)]
        pub async fn get_directory(&self, id: &SeaTreeId) -> Result<SeaDirectoryEntries, JsValue> {
            let protocol::TreeId::Directory(bytes) = id.inner else {
                return Err(js_error("getDirectory requires a directory identity"));
            };
            let directory = self
                .current()?
                .get_directory(BlobDirectoryId::from_bytes(&bytes).expect("fixed identity"))
                .await
                .map_err(|error| js_error(&error.to_string()))?;
            let entries: Array = directory
                .entries()
                .iter()
                .map(|(name, child)| {
                    JsValue::from(SeaDirectoryEntry {
                        name: name.clone(),
                        child: SeaTreeId {
                            inner: wire_tree(*child),
                        },
                    })
                })
                .collect();
            Ok(entries.unchecked_into())
        }

        /// Fetches the latest retained snapshot.
        #[wasm_bindgen(js_name = latestSnapshot)]
        pub async fn latest_snapshot(&self) -> Result<Option<SeaSnapshot>, JsValue> {
            Ok(self
                .current()?
                .get_snapshot(LoadStart::LatestSnapshot)
                .await
                .map_err(|error| js_error(&error.to_string()))?
                .as_ref()
                .map(local_snapshot))
        }

        /// Fetches the newest snapshot at or before the inclusive event bound.
        #[wasm_bindgen(js_name = getSnapshot)]
        pub async fn get_snapshot(&self, id: u64) -> Result<Option<SeaSnapshot>, JsValue> {
            Ok(self
                .current()?
                .get_snapshot(LoadStart::ReplayAtLeastAllAfter(EventPosition::new(id)))
                .await
                .map_err(|error| js_error(&error.to_string()))?
                .as_ref()
                .map(local_snapshot))
        }

        /// Publishes one conditional snapshot.
        #[wasm_bindgen(js_name = publishSnapshot)]
        pub async fn publish_snapshot(
            &self,
            expected_parent: Option<u64>,
            at_event: u64,
            root: &SeaTreeId,
        ) -> Result<SeaSnapshot, JsValue> {
            let registration = self
                .snapshot_stream
                .borrow()
                .as_ref()
                .and_then(Weak::upgrade)
                .filter(|registration| !registration.cancelled.get())
                .ok_or_else(|| js_error("Sea snapshot stream is not open"))?;
            let participation = self
                .snapshot_participation
                .get()
                .ok_or_else(|| js_error("Sea snapshot stream is not open"))?;
            let fence = match participation {
                SeaSnapshotParticipation::ReadOnly => {
                    return Err(js_error("Sea snapshot stream is read-only"));
                }
                SeaSnapshotParticipation::SeaSelected => {
                    Some(registration.fence.get().ok_or_else(|| {
                        js_error("Sea client is not selected to publish snapshots")
                    })?)
                }
                SeaSnapshotParticipation::ClientSelected => None,
            };
            let current = self.current()?;
            let root = current
                .resolve_tree(core_tree(root.inner))
                .await
                .map_err(|error| js_error(&error.to_string()))?
                .ok_or_else(|| js_error("snapshot tree is unavailable"))?;
            let at_event = current
                .resolve_position(EventPosition::new(at_event))
                .await
                .map_err(|error| js_error(&error.to_string()))?
                .ok_or_else(|| js_error("snapshot event is unavailable"))?;
            let snapshot = current
                .publish_snapshot(
                    expected_parent.map(EventPosition::new),
                    fence,
                    Snapshot { root, at_event },
                )
                .await
                .map_err(|error| js_error(&error.to_string()))?;
            Ok(local_snapshot(&snapshot))
        }

        /// Opens policy-bound latest-value snapshot coordination.
        #[wasm_bindgen(js_name = subscribeSnapshots)]
        pub async fn subscribe_snapshots(
            &self,
            participation: SeaSnapshotParticipation,
        ) -> Result<SeaLocalSnapshotStream, JsValue> {
            if let Some(registration) = self.snapshot_stream.take().and_then(|weak| weak.upgrade())
            {
                registration.cancel();
            }
            let session = self.current()?;
            let stream = session
                .coordinate_snapshots(snapshot_participation_to_core(participation))
                .await
                .map_err(|error| js_error(&error.to_string()))?;
            let registration = Rc::new(LocalSnapshotRegistration {
                stream: RefCell::new(Some(stream)),
                pending_abort: RefCell::new(None),
                fence: Cell::new(None),
                cancelled: Cell::new(false),
            });
            self.snapshot_stream
                .replace(Some(Rc::downgrade(&registration)));
            self.snapshot_participation.set(Some(participation));
            Ok(SeaLocalSnapshotStream { registration })
        }

        /// Opens a gap-free load stream.
        pub async fn load(&self, required: Option<u64>) -> Result<SeaLocalStream, JsValue> {
            let load = self
                .current()?
                .load(required.map_or(LoadStart::LatestSnapshot, |position| {
                    LoadStart::ReplayAtLeastAllAfter(EventPosition::new(position))
                }))
                .await
                .map_err(|error| js_error(&error.to_string()))?;
            let snapshot = futures_util::stream::iter(load.snapshot.map(|snapshot| {
                Ok(SeaLoadItem {
                    inner: protocol::Response::LoadSnapshot(local_snapshot(&snapshot).inner),
                })
            }));
            Ok(SeaLocalStream::new(snapshot.chain(load.events.map(
                |item| {
                    item.map(local_monitored_load_item)
                        .map_err(|error| js_error(&error.to_string()))
                },
            ))))
        }

        /// Opens a bounded or live event stream.
        pub fn read(
            &self,
            after: Option<u64>,
            stop_after: Option<u64>,
        ) -> Result<SeaLocalStream, JsValue> {
            let stream = self.current()?.read(
                after.map(EventPosition::new),
                stop_after.map(EventPosition::new),
            );
            Ok(SeaLocalStream::new(stream.map(|item| {
                item.map(local_monitored_load_item)
                    .map_err(|error| js_error(&error.to_string()))
            })))
        }

        /// Disconnects this local client without closing shared service state.
        pub fn disconnect(&self) {
            self.disconnected.set(true);
        }

        /// Local clients do not replace a network transport.
        #[wasm_bindgen(js_name = replaceTransport)]
        pub fn replace_transport(&self, _transport: JsValue) {
            self.disconnected.set(false);
        }

        /// Explicitly closes the logical session.
        pub async fn close(&self) -> Result<(), JsValue> {
            if let Some(registration) = self.snapshot_stream.take().and_then(|weak| weak.upgrade())
            {
                registration.cancel();
            }
            self.snapshot_participation.set(None);
            let session = self.session.borrow().clone();
            if let Some(session) = session {
                session
                    .close()
                    .await
                    .map_err(|error| js_error(&error.to_string()))?;
            }
            self.session.replace(None);
            Ok(())
        }
    }

    impl SeaLocalClient {
        fn current(&self) -> Result<Rc<LocalSession<MemoryStorage>>, JsValue> {
            if self.disconnected.get() {
                return Err(js_error("Sea local client is disconnected"));
            }
            self.session
                .borrow()
                .clone()
                .ok_or_else(|| js_error("openSession is required before Sea operations"))
        }
    }

    /// Stream returned by an in-process generated Sea client.
    #[wasm_bindgen]
    pub struct SeaLocalStream {
        inner: RefCell<Option<SessionStream<SeaLoadItem, JsValue>>>,
        pending_abort: RefCell<Option<AbortHandle>>,
        cancelled: Cell<bool>,
    }

    impl SeaLocalStream {
        fn new(
            stream: impl futures_util::Stream<Item = Result<SeaLoadItem, JsValue>> + 'static,
        ) -> Self {
            Self {
                inner: RefCell::new(Some(Box::pin(stream))),
                pending_abort: RefCell::new(None),
                cancelled: Cell::new(false),
            }
        }
    }

    #[wasm_bindgen]
    impl SeaLocalStream {
        /// Returns the next local stream item or undefined at finite completion.
        pub async fn next(&self) -> Result<Option<SeaLoadResult>, JsValue> {
            if self.cancelled.get() {
                return Ok(None);
            }
            let mut stream = self
                .inner
                .take()
                .ok_or_else(|| js_error("Sea local stream is already being read"))?;
            let (abort, registration) = AbortHandle::new_pair();
            self.pending_abort.replace(Some(abort));
            let item = Abortable::new(stream.next(), registration).await;
            self.pending_abort.replace(None);
            let Ok(item) = item else {
                return Ok(None);
            };
            if self.cancelled.get() {
                return Ok(None);
            }
            self.inner.replace(Some(stream));
            item.transpose().map(|item| item.map(load_result))
        }

        /// Cancels the local stream.
        pub async fn cancel(&self) {
            self.cancelled.set(true);
            if let Some(abort) = self.pending_abort.take() {
                abort.abort();
            }
            self.inner.replace(None);
            std::future::ready(()).await;
        }
    }

    /// Latest-value snapshot coordination for process-local tests.
    #[wasm_bindgen]
    pub struct SeaLocalSnapshotStream {
        /// Owns the registration; the client keeps only a weak publication reference.
        registration: Rc<LocalSnapshotRegistration>,
    }

    #[wasm_bindgen]
    impl SeaLocalSnapshotStream {
        /// Waits for the next accepted snapshot or Sea nomination update.
        pub async fn next(&self) -> Result<SeaSnapshotCoordination, JsValue> {
            if self.registration.cancelled.get() {
                return Err(js_error("Sea snapshot stream is cancelled"));
            }
            let mut stream = self
                .registration
                .stream
                .take()
                .ok_or_else(|| js_error("Sea snapshot stream is unavailable"))?;
            let (abort, cancellation) = AbortHandle::new_pair();
            self.registration.pending_abort.replace(Some(abort));
            let state = Abortable::new(stream.next(), cancellation).await;
            self.registration.pending_abort.take();
            let state = state
                .map_err(|_| js_error("Sea snapshot stream is cancelled"))?
                .ok_or_else(|| js_error("Sea snapshot stream ended"))?
                .map_err(|error| js_error(&error.to_string()))?;
            self.registration.fence.set(state.fence);
            self.registration.stream.replace(Some(stream));
            Ok(SeaSnapshotCoordination {
                latest: state.latest.map(EventPosition::get),
                fence: state.fence,
            })
        }

        /// Revokes this process-local client's snapshot participation.
        pub async fn cancel(&self) -> Result<(), JsValue> {
            self.registration.cancel();
            std::future::ready(()).await;
            Ok(())
        }
    }
}

#[cfg(feature = "test-support")]
pub use test_support::*;

#[wasm_bindgen]
impl SeaInjectedClient {
    /// Creates a generated client over one injected transport.
    #[wasm_bindgen(constructor)]
    pub fn new(transport: AsyncRequestTransport, max_frame_bytes: usize) -> Result<Self, JsValue> {
        if max_frame_bytes < protocol::MIN_FRAME_BYTES {
            return Err(js_error(
                "max_frame_bytes is smaller than the Sea frame header",
            ));
        }
        let transport = Rc::new(RefCell::new(transport.into()));
        let state = Arc::new(ClientState::default());
        let limits = protocol::Limits { max_frame_bytes };
        let client = Client::with_state(
            InjectedTransport {
                inner: Rc::clone(&transport),
            },
            Arc::clone(&state),
            limits,
        );
        Ok(Self {
            transport,
            client: Rc::new(client),
            event_stream: RefCell::new(None),
            author_stream: RefCell::new(None),
            snapshot_stream: RefCell::new(None),
            snapshot_participation: Cell::new(None),
            content_stream: RefCell::new(None),
            resume_after: Cell::new(None),
        })
    }

    /// Creates a document, opens its first session, and returns its backend-assigned identity.
    #[wasm_bindgen(js_name = createDocument)]
    pub async fn create_document(
        &self,
        author: Uint8Array,
        session: Uint8Array,
    ) -> Result<Uint8Array, JsValue> {
        self.open_session(Uint8Array::new_with_length(0), true, author, session, None)
            .await
    }

    /// Opens one archive-bound recovery and live event stream.
    #[wasm_bindgen(js_name = openSession)]
    pub async fn open_session(
        &self,
        archive: Uint8Array,
        create: bool,
        author: Uint8Array,
        session: Uint8Array,
        reference: Option<u64>,
    ) -> Result<Uint8Array, JsValue> {
        if let Some(previous) = self.event_stream.take() {
            let _ = previous.cancel().await;
        }
        if let Some(author) = self.author_stream.take() {
            let _ = author.finish().await;
        }
        if let Some(pump) = self.snapshot_stream.take().and_then(|weak| weak.upgrade()) {
            pump.abort.abort();
        }
        self.snapshot_participation.set(None);
        self.content_stream.take();
        let archive = archive.to_vec();
        let event_stream = self
            .client
            .open_event_stream(protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive,
                intent: if create {
                    protocol::ArchiveIntent::Create
                } else {
                    protocol::ArchiveIntent::Open
                },
                author: author.to_vec(),
                session: session.to_vec(),
                resume_after: reference,
            })
            .await
            .map_err(client_error)?;
        let document = Uint8Array::from(event_stream.document());
        let author_stream = self
            .client
            .open_author_stream()
            .await
            .map_err(client_error)?;
        self.resume_after.set(reference);
        self.event_stream.replace(Some(event_stream));
        self.author_stream.replace(Some(author_stream));
        Ok(document)
    }

    /// Submits one event under a stable operation identity.
    pub async fn submit(
        &self,
        operation: Uint8Array,
        reference: Option<u64>,
        payload: Uint8Array,
        blob_tree: Option<SeaTreeReference>,
    ) -> Result<u64, JsValue> {
        match self
            .author_request(protocol::Request::Submit {
                operation: operation.to_vec(),
                reference,
                event: protocol::Event {
                    payload: payload.to_vec(),
                    blob_tree: blob_tree
                        .map(|value| tree_from_js(value.as_ref()))
                        .transpose()?,
                },
            })
            .await?
        {
            protocol::Response::EventCommitted { position } => Ok(position),
            _ => Err(js_error("Sea response is not an event receipt")),
        }
    }

    /// Resolves one stable event operation to its committed position.
    #[wasm_bindgen(js_name = resolveSubmission)]
    pub async fn resolve_submission(&self, operation: Uint8Array) -> Result<Option<u64>, JsValue> {
        match self
            .author_request(protocol::Request::ResolveSubmission {
                operation: operation.to_vec(),
            })
            .await?
        {
            protocol::Response::SubmissionResolved { position } => Ok(position),
            _ => Err(js_error("Sea response is not a submission resolution")),
        }
    }

    /// Opens a bounded or live committed-event stream without performing immediate I/O.
    pub fn read(
        &self,
        after: Option<u64>,
        stop_after: Option<u64>,
    ) -> Result<SeaInjectedStream, JsValue> {
        Ok(SeaInjectedStream {
            inner: RefCell::new(None),
            pending_read: RefCell::new(Some((
                Rc::clone(&self.client),
                protocol::Request::Read { after, stop_after },
            ))),
            buffered: RefCell::new(VecDeque::new()),
            pending_abort: RefCell::new(None),
            cancelled: Cell::new(false),
        })
    }

    /// Uploads one immutable blob and returns its stored identity.
    #[wasm_bindgen(js_name = putBlob)]
    pub async fn put_blob(&self, payload: Uint8Array) -> Result<SeaTreeId, JsValue> {
        match self
            .one_content_response(protocol::Request::PutBlob {
                payload: payload.to_vec(),
            })
            .await?
        {
            protocol::Response::BlobStored { id } => Ok(SeaTreeId {
                inner: protocol::TreeId::Blob(id),
            }),
            _ => Err(js_error("Sea response is not a blob receipt")),
        }
    }

    /// Fetches one immutable blob.
    #[wasm_bindgen(js_name = getBlob)]
    pub async fn get_blob(&self, id: &SeaTreeId) -> Result<Uint8Array, JsValue> {
        let protocol::TreeId::Blob(id) = id.inner else {
            return Err(js_error("getBlob requires a blob identity"));
        };
        match self
            .one_content_response(protocol::Request::GetBlob { id })
            .await?
        {
            protocol::Response::Blob(payload) => Ok(Uint8Array::from(payload.as_slice())),
            _ => Err(js_error("Sea response is not a blob")),
        }
    }

    /// Fetches one immutable directory.
    #[wasm_bindgen(js_name = getDirectory)]
    pub async fn get_directory(&self, id: &SeaTreeId) -> Result<SeaDirectoryEntries, JsValue> {
        let protocol::TreeId::Directory(id) = id.inner else {
            return Err(js_error("getDirectory requires a directory identity"));
        };
        match self
            .one_content_response(protocol::Request::GetDirectory { id })
            .await?
        {
            protocol::Response::Directory(entries) => {
                let entries: Array = entries
                    .into_iter()
                    .map(|entry| {
                        JsValue::from(SeaDirectoryEntry {
                            name: entry.name,
                            child: SeaTreeId { inner: entry.child },
                        })
                    })
                    .collect();
                Ok(entries.unchecked_into())
            }
            _ => Err(js_error("Sea response is not a directory")),
        }
    }

    /// Publishes one immutable directory and returns its identity.
    #[wasm_bindgen(js_name = putDirectory)]
    pub async fn put_directory(&self, entries: SeaDirectoryEntries) -> Result<SeaTreeId, JsValue> {
        let entries = Array::from(entries.as_ref());
        let mut values = Vec::with_capacity(entries.length() as usize);
        for value in entries {
            let name = Reflect::get(&value, &JsValue::from_str("name"))?
                .as_string()
                .ok_or_else(|| js_error("directory entry name is not a string"))?;
            let child = Reflect::get(&value, &JsValue::from_str("child"))?;
            values.push(protocol::DirectoryEntry {
                name,
                child: tree_from_js(&child)?,
            });
        }
        match self
            .one_content_response(protocol::Request::PutDirectory { entries: values })
            .await?
        {
            protocol::Response::DirectoryStored { id } => Ok(SeaTreeId {
                inner: protocol::TreeId::Directory(id),
            }),
            _ => Err(js_error("Sea response is not a directory receipt")),
        }
    }

    /// Publishes one conditional snapshot.
    #[wasm_bindgen(js_name = publishSnapshot)]
    pub async fn publish_snapshot(
        &self,
        expected_parent: Option<u64>,
        at_event: u64,
        root: &SeaTreeId,
    ) -> Result<SeaSnapshot, JsValue> {
        let participation = self
            .snapshot_participation
            .get()
            .ok_or_else(|| js_error("Sea snapshot stream is not open"))?;
        let fence = match participation {
            SeaSnapshotParticipation::ReadOnly => {
                return Err(js_error("Sea snapshot stream is read-only"));
            }
            SeaSnapshotParticipation::SeaSelected => Some(
                self.snapshot_stream
                    .borrow()
                    .as_ref()
                    .and_then(Weak::upgrade)
                    .and_then(|pump| {
                        pump.state
                            .borrow()
                            .as_ref()
                            .ok()
                            .and_then(|state| state.fence)
                    })
                    .ok_or_else(|| js_error("Sea client is not selected to publish snapshots"))?,
            ),
            SeaSnapshotParticipation::ClientSelected => None,
        };
        match self
            .snapshot_request(protocol::Request::PublishSnapshot {
                fence,
                expected_parent,
                at_event,
                root: root.inner,
            })
            .await?
        {
            protocol::Response::Snapshot(Some(inner)) => Ok(SeaSnapshot { inner }),
            _ => Err(js_error("Sea response is not a published snapshot")),
        }
    }

    /// Fetches the newest snapshot at or before an inclusive committed-event bound.
    #[wasm_bindgen(js_name = getSnapshot)]
    pub async fn get_snapshot(&self, id: u64) -> Result<Option<SeaSnapshot>, JsValue> {
        match self
            .one_content_response(protocol::Request::GetSnapshot { id })
            .await?
        {
            protocol::Response::Snapshot(snapshot) => {
                Ok(snapshot.map(|inner| SeaSnapshot { inner }))
            }
            _ => Err(js_error("Sea response is not a snapshot")),
        }
    }

    /// Fetches the latest retained snapshot.
    #[wasm_bindgen(js_name = latestSnapshot)]
    pub async fn latest_snapshot(&self) -> Result<Option<SeaSnapshot>, JsValue> {
        match self
            .one_content_response(protocol::Request::LatestSnapshot)
            .await?
        {
            protocol::Response::Snapshot(snapshot) => {
                Ok(snapshot.map(|inner| SeaSnapshot { inner }))
            }
            _ => Err(js_error("Sea response is not a snapshot")),
        }
    }

    /// Opens a gap-free snapshot, catch-up, and live event stream.
    pub fn load(&self, required: Option<u64>) -> Result<SeaInjectedStream, JsValue> {
        if required != self.resume_after.get() {
            return Err(js_error(
                "load position must match the opened event stream resume position",
            ));
        }
        let event_stream = self
            .event_stream
            .take()
            .ok_or_else(|| js_error("Sea event stream is not open"))?;
        Ok(SeaInjectedStream {
            inner: RefCell::new(Some(event_stream.into_responses())),
            pending_read: RefCell::new(None),
            buffered: RefCell::new(VecDeque::new()),
            pending_abort: RefCell::new(None),
            cancelled: Cell::new(false),
        })
    }

    /// Opens a latest-value snapshot subscription.
    #[wasm_bindgen(js_name = subscribeSnapshots)]
    pub async fn subscribe_snapshots(
        &self,
        participation: SeaSnapshotParticipation,
    ) -> Result<SeaInjectedSnapshotStream, JsValue> {
        if let Some(previous) = self.snapshot_stream.take().and_then(|weak| weak.upgrade()) {
            previous.abort.abort();
        }
        let snapshot_stream = self
            .client
            .open_snapshot_stream(snapshot_participation_to_wire(participation))
            .await
            .map_err(client_error)?;
        let pump = InjectedSnapshotPump::start(snapshot_stream);
        self.snapshot_stream.replace(Some(Rc::downgrade(&pump)));
        self.snapshot_participation.set(Some(participation));
        Ok(SeaInjectedSnapshotStream {
            receiver: RefCell::new(Some(pump.state.clone())),
            pump,
            pending_abort: RefCell::new(None),
            initial: Cell::new(true),
            cancelled: Cell::new(false),
        })
    }

    /// Explicitly closes this logical session.
    pub async fn close(&self) -> Result<(), JsValue> {
        if let Some(pump) = self.snapshot_stream.take().and_then(|weak| weak.upgrade()) {
            pump.abort.abort();
        }
        self.snapshot_participation.set(None);
        if let Some(content) = self.content_stream.take() {
            content.close().await.map_err(client_error)?;
        }
        let author = self
            .author_stream
            .take()
            .ok_or_else(|| js_error("Sea author stream is not open"))?;
        author.close().await.map_err(client_error)
    }

    /// Replaces the injected transport after an explicit reconnect.
    #[wasm_bindgen(js_name = replaceTransport)]
    pub fn replace_transport(&self, transport: AsyncRequestTransport) -> Result<(), JsValue> {
        self.client
            .reconnect()
            .map_err(|error| js_error(&error.to_string()))?;
        self.transport.replace(transport.into());
        Ok(())
    }

    /// Forwards explicit disconnection to the injected transport.
    pub fn disconnect(&self) -> Result<(), JsValue> {
        self.client.disconnect().map_err(client_error)
    }
}

impl SeaInjectedClient {
    async fn author_request(
        &self,
        request: protocol::Request,
    ) -> Result<protocol::Response, JsValue> {
        let mut author = self
            .author_stream
            .take()
            .ok_or_else(|| js_error("Sea author stream is not open"))?;
        let response = author.request(request).await;
        self.author_stream.replace(Some(author));
        match response.map_err(client_error)? {
            protocol::Response::Error { kind, message } => Err(service_error(kind, &message)),
            response => Ok(response),
        }
    }

    async fn snapshot_request(
        &self,
        request: protocol::Request,
    ) -> Result<protocol::Response, JsValue> {
        let pump = self
            .snapshot_stream
            .borrow()
            .as_ref()
            .and_then(Weak::upgrade)
            .ok_or_else(|| js_error("Sea snapshot stream is not open"))?;
        match pump.request(request).await? {
            protocol::Response::Error { kind, message } => Err(service_error(kind, &message)),
            response => Ok(response),
        }
    }

    async fn content_request(
        &self,
        request: protocol::Request,
    ) -> Result<Vec<protocol::Response>, JsValue> {
        if self.content_stream.borrow().is_none() {
            let content_stream = self
                .client
                .open_content_stream()
                .await
                .map_err(client_error)?;
            self.content_stream.replace(Some(content_stream));
        }
        let mut stream = self
            .content_stream
            .take()
            .ok_or_else(|| js_error("Sea content stream is not open"))?;
        let response = stream.request(request).await;
        self.content_stream.replace(Some(stream));
        let responses = response.map_err(client_error)?;
        if let Some(protocol::Response::Error { kind, message }) = responses.first() {
            return Err(service_error(*kind, message));
        }
        Ok(responses)
    }

    async fn one_content_response(
        &self,
        request: protocol::Request,
    ) -> Result<protocol::Response, JsValue> {
        let mut responses = self.content_request(request).await?;
        if responses.len() != 1 {
            return Err(js_error(
                "Sea content operation returned an invalid response count",
            ));
        }
        Ok(responses.remove(0))
    }
}

fn client_error(error: ClientError<JsValue>) -> JsValue {
    match error {
        ClientError::State(error) => js_error(&error.to_string()),
        ClientError::Protocol(error) => js_error(&error.to_string()),
        ClientError::Transport(error) => error,
        ClientError::ResponseEnded => js_error("Sea response stream ended before its response"),
        ClientError::UnexpectedResponse(protocol::Response::Error { kind, message }) => {
            service_error(kind, &message)
        }
        ClientError::UnexpectedResponse(_) => js_error("Sea response did not match its request"),
    }
}

fn load_item(response: protocol::Response) -> Result<SeaLoadItem, JsValue> {
    if let protocol::Response::Error { kind, message } = response {
        return Err(service_error(kind, &message));
    }
    if !matches!(
        response,
        protocol::Response::LoadSnapshot(_)
            | protocol::Response::LoadEvent(_)
            | protocol::Response::StreamProgress { .. }
    ) {
        return Err(js_error("Sea stream response is not a load item"));
    }
    Ok(SeaLoadItem { inner: response })
}

fn load_result(item: SeaLoadItem) -> SeaLoadResult {
    JsValue::from(item).unchecked_into()
}

const fn snapshot_participation_to_wire(
    participation: SeaSnapshotParticipation,
) -> protocol::SnapshotParticipation {
    match participation {
        SeaSnapshotParticipation::ReadOnly => protocol::SnapshotParticipation::ReadOnly,
        SeaSnapshotParticipation::SeaSelected => protocol::SnapshotParticipation::SeaSelected,
        SeaSnapshotParticipation::ClientSelected => protocol::SnapshotParticipation::ClientSelected,
    }
}

#[cfg(feature = "test-support")]
const fn snapshot_participation_to_core(
    participation: SeaSnapshotParticipation,
) -> ArchiveParticipation {
    match participation {
        SeaSnapshotParticipation::ReadOnly => ArchiveParticipation::ReadOnly,
        SeaSnapshotParticipation::SeaSelected => ArchiveParticipation::SeaSelected,
        SeaSnapshotParticipation::ClientSelected => ArchiveParticipation::ClientSelected,
    }
}

fn service_error(kind: protocol::ErrorKind, message: &str) -> JsValue {
    let error = js_sys::Error::new(message);
    let kind = match kind {
        protocol::ErrorKind::Invalid => SeaErrorKind::Invalid,
        protocol::ErrorKind::Stale => SeaErrorKind::Stale,
        protocol::ErrorKind::Conflict => SeaErrorKind::Conflict,
        protocol::ErrorKind::Rejected => SeaErrorKind::Rejected,
        protocol::ErrorKind::Ambiguous => SeaErrorKind::Ambiguous,
        protocol::ErrorKind::Unavailable => SeaErrorKind::Unavailable,
        protocol::ErrorKind::Corrupt => SeaErrorKind::Corrupt,
    };
    let _ = Reflect::set(
        error.as_ref(),
        &JsValue::from_str("kind"),
        &JsValue::from_f64(f64::from(kind as u8)),
    );
    error.into()
}

fn fixed_id(bytes: &Uint8Array) -> Result<[u8; 32], JsValue> {
    bytes
        .to_vec()
        .try_into()
        .map_err(|_| js_error("Sea content identity must contain exactly 32 bytes"))
}

fn tree_from_js(value: &JsValue) -> Result<protocol::TreeId, JsValue> {
    let kind = Reflect::get(value, &JsValue::from_str("kind"))?
        .as_f64()
        .ok_or_else(|| js_error("tree identity kind is not a number"))?;
    let bytes = Reflect::get(value, &JsValue::from_str("bytes"))?;
    if !bytes.is_instance_of::<Uint8Array>() {
        return Err(js_error("tree identity bytes are not a Uint8Array"));
    }
    let bytes = fixed_id(&Uint8Array::new(&bytes))?;
    match kind.to_bits() {
        value if value == f64::from(SeaTreeKind::Blob as u8).to_bits() => {
            Ok(protocol::TreeId::Blob(bytes))
        }
        value if value == f64::from(SeaTreeKind::Directory as u8).to_bits() => {
            Ok(protocol::TreeId::Directory(bytes))
        }
        _ => Err(js_error("tree identity kind is invalid")),
    }
}

#[cfg(feature = "test-support")]
fn core_tree(id: protocol::TreeId) -> BlobTreeId {
    match id {
        protocol::TreeId::Blob(bytes) => {
            BlobTreeId::Blob(BlobId::from_bytes(&bytes).expect("fixed identity"))
        }
        protocol::TreeId::Directory(bytes) => {
            BlobTreeId::Directory(BlobDirectoryId::from_bytes(&bytes).expect("fixed identity"))
        }
    }
}

#[cfg(feature = "test-support")]
fn wire_tree(id: BlobTreeId) -> protocol::TreeId {
    match id {
        BlobTreeId::Blob(id) => protocol::TreeId::Blob(*id.as_bytes()),
        BlobTreeId::Directory(id) => protocol::TreeId::Directory(*id.as_bytes()),
    }
}

#[cfg(feature = "test-support")]
fn local_snapshot<
    BlobHandle: StorageHandle<Id = BlobTreeId>,
    EventHandle: StorageHandle<Id = EventPosition>,
>(
    snapshot: &Snapshot<BlobHandle, EventHandle>,
) -> SeaSnapshot {
    SeaSnapshot {
        inner: protocol::Snapshot {
            at_event: snapshot.at_event.id().get(),
            root: wire_tree(snapshot.root.id()),
        },
    }
}

#[cfg(feature = "test-support")]
fn local_monitored_load_item(
    item: MonitoredStreamItem<SessionCommittedEvent, EventPosition>,
) -> SeaLoadItem {
    SeaLoadItem {
        inner: match item {
            MonitoredStreamItem::Item(event) => {
                protocol::Response::LoadEvent(Box::new(protocol::StreamEvent {
                    position: event.committed.position.get(),
                    author: event.author_id.as_bytes().to_vec(),
                    session: event.session_id.as_bytes().to_vec(),
                    operation: event.operation_id.as_bytes().to_vec(),
                    reference: event.reference.map(EventPosition::get),
                    minimum_reference: event.minimum_reference.map(EventPosition::get),
                    event: protocol::Event {
                        payload: event.committed.event.payload.to_vec(),
                        blob_tree: event.committed.event.blob_tree.map(wire_tree),
                    },
                }))
            }
            MonitoredStreamItem::Progress(progress) => protocol::Response::StreamProgress {
                previous: progress.previous.map(EventPosition::get),
                latest_known: progress.latest_known.map(EventPosition::get),
                status: match progress.status {
                    MonitoredStreamStatus::StreamingBacklog => {
                        protocol::StreamStatus::StreamingBacklog
                    }
                    MonitoredStreamStatus::AwaitingNewItems => {
                        protocol::StreamStatus::AwaitingNewItems
                    }
                    MonitoredStreamStatus::FallenBehind => protocol::StreamStatus::FallenBehind,
                },
            },
        },
    }
}

fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
