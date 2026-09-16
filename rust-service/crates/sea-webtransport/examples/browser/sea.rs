//! Typed Sea v1 bindings over an injected JavaScript transport.

#![allow(
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::must_use_candidate
)]

use std::{
    cell::{Cell, RefCell},
    collections::BTreeMap,
    rc::Rc,
    sync::Arc,
};

use bytes::Bytes;
use futures_util::StreamExt as _;
use js_sys::{Array, Promise, Reflect, Uint8Array};
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, Event, EventPosition, SnapshotId,
    archive::{
        AuthorId, EventSubmission, LoadEvent, OperationId, SeaSession, SessionId, SessionStream,
        Snapshot as ArchiveSnapshot, SnapshotPosition as ArchiveSnapshotPosition,
        SnapshotPublication,
    },
};
use sea_memory::MemoryStream;
use sea_sequencer::session::{LocalSequencer, LocalSession};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    ReadableStream, ReadableStreamDefaultReader, WebTransport, WebTransportBidirectionalStream,
    WritableStream,
};

use crate::{
    AsyncRequestTransport, call_method, open_transport, read_bounded, sea_protocol_v1 as protocol,
};

/// A typed immutable blob-tree identity.
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
    pub fn kind(&self) -> String {
        match self.inner {
            protocol::TreeId::Blob(_) => "blob",
            protocol::TreeId::Directory(_) => "directory",
        }
        .to_owned()
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

    /// Returns the typed child identity.
    #[wasm_bindgen(getter)]
    pub fn child(&self) -> SeaTreeId {
        self.child.clone()
    }
}

/// Receipt for one committed event.
#[wasm_bindgen]
pub struct SeaEventReceipt {
    position: u64,
    durability: String,
}

#[wasm_bindgen]
impl SeaEventReceipt {
    /// Returns the stable event position.
    #[wasm_bindgen(getter)]
    pub fn position(&self) -> u64 {
        self.position
    }

    /// Returns `memory`, `buffered`, or `durable`.
    #[wasm_bindgen(getter)]
    pub fn durability(&self) -> String {
        self.durability.clone()
    }
}

/// Metadata for one snapshot publication.
#[wasm_bindgen]
#[derive(Clone)]
pub struct SeaSnapshot {
    inner: protocol::Snapshot,
}

#[wasm_bindgen]
impl SeaSnapshot {
    /// Returns the publication identity.
    #[wasm_bindgen(getter)]
    pub fn id(&self) -> Uint8Array {
        Uint8Array::from(self.inner.id.as_slice())
    }

    /// Returns the parent publication identity.
    #[wasm_bindgen(getter)]
    pub fn parent(&self) -> Option<Uint8Array> {
        self.inner.parent.as_deref().map(Uint8Array::from)
    }

    /// Returns the included event position, or undefined for initial state.
    #[wasm_bindgen(getter, js_name = atEvent)]
    pub fn at_event(&self) -> Option<u64> {
        match self.inner.at_event {
            protocol::SnapshotPosition::Initial => None,
            protocol::SnapshotPosition::At(position) => Some(position),
        }
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
pub struct SeaLoadItem {
    inner: protocol::Response,
}

#[wasm_bindgen]
impl SeaLoadItem {
    /// Returns `snapshot`, `event`, or `caughtUp`.
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> String {
        match self.inner {
            protocol::Response::LoadSnapshot(_) => "snapshot",
            protocol::Response::LoadEvent(_) => "event",
            protocol::Response::CaughtUp(_) => "caughtUp",
            _ => "unexpected",
        }
        .to_owned()
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

    /// Returns the event position or caught-up head.
    #[wasm_bindgen(getter)]
    pub fn position(&self) -> Option<u64> {
        match &self.inner {
            protocol::Response::LoadEvent(event) => Some(event.position),
            protocol::Response::CaughtUp(position) => *position,
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

/// Cancellable typed load or snapshot stream over an injected transport.
#[wasm_bindgen]
pub struct SeaInjectedStream {
    transport: JsValue,
    request_id: u64,
    limits: protocol::Limits,
    cancelled: Cell<bool>,
}

/// Raw browser WebTransport adapter consumed by [`SeaInjectedClient`].
#[wasm_bindgen]
pub struct SeaBrowserTransport {
    transport: WebTransport,
    max_frame_bytes: usize,
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
        if max_frame_bytes < protocol::MAGIC.len() + 1 {
            return Err(js_error(
                "max_frame_bytes is smaller than the Sea frame header",
            ));
        }
        let certificate_hash = certificate_hash.to_vec();
        if certificate_hash.len() != 32 {
            return Err(js_error("certificate hash must contain exactly 32 bytes"));
        }
        Ok(Self {
            transport: open_transport(&url, &certificate_hash).await?,
            max_frame_bytes,
        })
    }

    /// Sends one complete Sea request and returns one complete response.
    pub async fn request(&self, frame: Uint8Array) -> Result<Uint8Array, JsValue> {
        validate_request(&frame.to_vec(), self.max_frame_bytes)?;
        let stream = self.open_stream(&frame.to_vec()).await?;
        let readable: ReadableStream = stream.readable().unchecked_into();
        let reader: ReadableStreamDefaultReader = readable.get_reader().unchecked_into();
        let response = read_bounded(&reader, self.max_frame_bytes).await?;
        reader.release_lock();
        protocol::decode::<protocol::Frame<protocol::Response>>(
            &response,
            protocol::Limits {
                max_frame_bytes: self.max_frame_bytes,
            },
        )
        .map_err(|error| js_error(&error.to_string()))?;
        Ok(Uint8Array::from(response.as_slice()))
    }

    /// Opens one complete Sea load or snapshot-subscription request.
    pub async fn subscribe(&self, frame: Uint8Array) -> Result<SeaBrowserStream, JsValue> {
        validate_request(&frame.to_vec(), self.max_frame_bytes)?;
        let stream = self.open_stream(&frame.to_vec()).await?;
        let readable: ReadableStream = stream.readable().unchecked_into();
        Ok(SeaBrowserStream {
            reader: readable.get_reader().unchecked_into(),
            buffered: RefCell::new(Vec::new()),
            max_frame_bytes: self.max_frame_bytes,
            cancelled: Cell::new(false),
        })
    }

    /// Closes the browser WebTransport connection.
    pub fn disconnect(&self) {
        self.transport.close();
    }
}

impl SeaBrowserTransport {
    async fn open_stream(
        &self,
        outgoing: &[u8],
    ) -> Result<WebTransportBidirectionalStream, JsValue> {
        let stream = JsFuture::from(self.transport.create_bidirectional_stream())
            .await?
            .dyn_into::<WebTransportBidirectionalStream>()?;
        let writable: WritableStream = stream.writable().unchecked_into();
        let writer = writable.get_writer()?;
        let outgoing = Uint8Array::from(outgoing);
        JsFuture::from(writer.write_with_chunk(outgoing.as_ref())).await?;
        JsFuture::from(writer.close()).await?;
        writer.release_lock();
        Ok(stream)
    }
}

/// Raw browser stream returning complete Sea response frames.
#[wasm_bindgen]
pub struct SeaBrowserStream {
    reader: ReadableStreamDefaultReader,
    buffered: RefCell<Vec<u8>>,
    max_frame_bytes: usize,
    cancelled: Cell<bool>,
}

#[wasm_bindgen]
impl SeaBrowserStream {
    /// Returns the next complete Sea response frame.
    pub async fn next(&self) -> Result<Option<Uint8Array>, JsValue> {
        if self.cancelled.get() {
            return Err(js_error("Sea browser stream is cancelled"));
        }
        let mut buffered = self.buffered.take();
        let result = read_length_delimited(&self.reader, &mut buffered, self.max_frame_bytes).await;
        self.buffered.replace(buffered);
        Ok(result?.map(|frame| Uint8Array::from(frame.as_slice())))
    }

    /// Cancels the stream and releases its reader.
    pub async fn cancel(&self) -> Result<(), JsValue> {
        if !self.cancelled.replace(true) {
            JsFuture::from(self.reader.cancel()).await?;
            self.reader.release_lock();
        }
        Ok(())
    }
}

#[wasm_bindgen]
impl SeaInjectedStream {
    /// Waits for the next typed stream item.
    pub async fn next(&self) -> Result<Option<SeaLoadItem>, JsValue> {
        if self.cancelled.get() {
            return Err(js_error("Sea stream is cancelled"));
        }
        let incoming = call_method(&self.transport, "next", &[])?;
        let incoming = JsFuture::from(Promise::resolve(&incoming)).await?;
        if incoming.is_null() || incoming.is_undefined() {
            return Ok(None);
        }
        if !incoming.is_instance_of::<Uint8Array>() {
            return Err(js_error("Sea stream frame is not a Uint8Array"));
        }
        let frame = protocol::decode::<protocol::Frame<protocol::Response>>(
            &Uint8Array::new(&incoming).to_vec(),
            self.limits,
        )
        .map_err(|error| js_error(&error.to_string()))?;
        if frame.request_id != self.request_id {
            return Err(js_error("Sea stream request identity did not match"));
        }
        if let protocol::Response::Error { message, .. } = frame.message {
            return Err(js_error(&message));
        }
        Ok(Some(SeaLoadItem {
            inner: frame.message,
        }))
    }

    /// Cancels the stream and injected transport.
    pub async fn cancel(&self) -> Result<(), JsValue> {
        if !self.cancelled.replace(true) {
            let cancelled = call_method(&self.transport, "cancel", &[])?;
            JsFuture::from(Promise::resolve(&cancelled)).await?;
        }
        Ok(())
    }
}

/// Typed Sea v1 client using a caller-provided asynchronous transport.
#[wasm_bindgen]
pub struct SeaInjectedClient {
    transport: Rc<RefCell<JsValue>>,
    next_request_id: Cell<u64>,
    limits: protocol::Limits,
}

/// Shared in-process memory service for local generated Sea clients.
#[wasm_bindgen]
pub struct SeaLocalService {
    sequencer: Arc<LocalSequencer<MemoryStream>>,
}

#[wasm_bindgen]
impl SeaLocalService {
    /// Creates one empty in-process archive service.
    pub async fn create() -> Result<SeaLocalService, JsValue> {
        let sequencer = LocalSequencer::recover(Arc::new(MemoryStream::new()))
            .await
            .map_err(|error| js_error(&error.to_string()))?;
        Ok(Self { sequencer })
    }

    /// Creates one client sharing this service's archive registry.
    pub fn connect(&self) -> SeaLocalClient {
        SeaLocalClient {
            sequencer: Arc::clone(&self.sequencer),
            session: RefCell::new(None),
            disconnected: Cell::new(false),
        }
    }
}

/// Typed in-process Sea client used by local browser tests and benchmarks.
#[wasm_bindgen]
pub struct SeaLocalClient {
    sequencer: Arc<LocalSequencer<MemoryStream>>,
    session: RefCell<Option<Rc<LocalSession<MemoryStream>>>>,
    disconnected: Cell<bool>,
}

#[wasm_bindgen]
impl SeaLocalClient {
    /// Opens or replaces this client's author session.
    #[wasm_bindgen(js_name = openSession)]
    pub async fn open_session(
        &self,
        _archive: Uint8Array,
        author: Uint8Array,
        session: Uint8Array,
        reference: Option<u64>,
    ) -> Result<(), JsValue> {
        self.disconnected.set(false);
        let previous = self.session.borrow().clone();
        if let Some(previous) = previous {
            previous
                .close()
                .await
                .map_err(|error| js_error(&error.to_string()))?;
        }
        let session = self
            .sequencer
            .open_session(
                AuthorId::new(Bytes::from(author.to_vec()))
                    .map_err(|_| js_error("author identity is empty"))?,
                SessionId::new(Bytes::from(session.to_vec()))
                    .map_err(|_| js_error("session identity is empty"))?,
                reference.map(EventPosition::new),
            )
            .await
            .map_err(|error| js_error(&error.to_string()))?;
        self.session.replace(Some(Rc::new(session)));
        Ok(())
    }

    /// Submits one typed event.
    pub async fn submit(
        &self,
        operation: Uint8Array,
        reference: Option<u64>,
        payload: Uint8Array,
        blob_tree: Option<SeaTreeId>,
    ) -> Result<SeaEventReceipt, JsValue> {
        let receipt = self
            .current()?
            .submit(EventSubmission {
                operation_id: OperationId::new(Bytes::from(operation.to_vec()))
                    .map_err(|_| js_error("operation identity is empty"))?,
                reference: reference.map(EventPosition::new),
                event: Event {
                    payload: Bytes::from(payload.to_vec()),
                    blob_tree: blob_tree.map(|value| core_tree(value.inner)),
                },
            })
            .await
            .map_err(|error| js_error(&error.to_string()))?;
        Ok(SeaEventReceipt {
            position: receipt.position.get(),
            durability: "memory".to_owned(),
        })
    }

    /// Resolves one stable event operation.
    #[wasm_bindgen(js_name = resolveSubmission)]
    pub async fn resolve_submission(
        &self,
        operation: Uint8Array,
    ) -> Result<Option<SeaEventReceipt>, JsValue> {
        let operation = OperationId::new(Bytes::from(operation.to_vec()))
            .map_err(|_| js_error("operation identity is empty"))?;
        Ok(self
            .current()?
            .resolve_submission(&operation)
            .await
            .map_err(|error| js_error(&error.to_string()))?
            .map(|receipt| SeaEventReceipt {
                position: receipt.position.get(),
                durability: "memory".to_owned(),
            }))
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
            inner: protocol::TreeId::Blob(*id.as_bytes()),
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
    pub async fn put_directory(&self, entries: Array) -> Result<SeaTreeId, JsValue> {
        let mut directory = BTreeMap::new();
        for value in entries {
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
            inner: protocol::TreeId::Directory(*id.as_bytes()),
        })
    }

    /// Fetches one immutable directory.
    #[wasm_bindgen(js_name = getDirectory)]
    pub async fn get_directory(&self, id: &SeaTreeId) -> Result<Array, JsValue> {
        let protocol::TreeId::Directory(bytes) = id.inner else {
            return Err(js_error("getDirectory requires a directory identity"));
        };
        let directory = self
            .current()?
            .get_directory(BlobDirectoryId::from_bytes(&bytes).expect("fixed identity"))
            .await
            .map_err(|error| js_error(&error.to_string()))?;
        Ok(directory
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
            .collect())
    }

    /// Fetches the latest retained snapshot.
    #[wasm_bindgen(js_name = latestSnapshot)]
    pub async fn latest_snapshot(&self) -> Result<Option<SeaSnapshot>, JsValue> {
        Ok(self
            .current()?
            .latest_snapshot()
            .await
            .map_err(|error| js_error(&error.to_string()))?
            .map(local_snapshot))
    }

    /// Fetches one retained snapshot.
    #[wasm_bindgen(js_name = getSnapshot)]
    pub async fn get_snapshot(&self, id: Uint8Array) -> Result<Option<SeaSnapshot>, JsValue> {
        let id = SnapshotId::from_bytes(Bytes::from(id.to_vec()));
        Ok(self
            .current()?
            .snapshot(&id)
            .await
            .map_err(|error| js_error(&error.to_string()))?
            .map(local_snapshot))
    }

    /// Publishes one conditional snapshot.
    #[wasm_bindgen(js_name = publishSnapshot)]
    pub async fn publish_snapshot(
        &self,
        operation: Uint8Array,
        expected_parent: Option<Uint8Array>,
        at_event: Option<u64>,
        root: &SeaTreeId,
    ) -> Result<SeaSnapshot, JsValue> {
        let snapshot = self
            .current()?
            .publish_snapshot(SnapshotPublication {
                operation_id: OperationId::new(Bytes::from(operation.to_vec()))
                    .map_err(|_| js_error("operation identity is empty"))?,
                expected_parent: expected_parent
                    .map(|value| SnapshotId::from_bytes(Bytes::from(value.to_vec()))),
                snapshot: ArchiveSnapshot {
                    at_event: at_event.map_or(ArchiveSnapshotPosition::Initial, |position| {
                        ArchiveSnapshotPosition::At(EventPosition::new(position))
                    }),
                    root: core_tree(root.inner),
                },
            })
            .await
            .map_err(|error| js_error(&error.to_string()))?;
        Ok(local_snapshot(snapshot))
    }

    /// Resolves one snapshot publication.
    #[wasm_bindgen(js_name = resolveSnapshot)]
    pub async fn resolve_snapshot(
        &self,
        operation: Uint8Array,
    ) -> Result<Option<SeaSnapshot>, JsValue> {
        let operation = OperationId::new(Bytes::from(operation.to_vec()))
            .map_err(|_| js_error("operation identity is empty"))?;
        Ok(self
            .current()?
            .resolve_snapshot_publication(&operation)
            .await
            .map_err(|error| js_error(&error.to_string()))?
            .map(local_snapshot))
    }

    /// Opens a gap-free load stream.
    pub async fn load(&self, required: Option<u64>) -> Result<SeaLocalStream, JsValue> {
        let stream = self
            .current()?
            .load(required.map(EventPosition::new))
            .await
            .map_err(|error| js_error(&error.to_string()))?;
        Ok(SeaLocalStream::new(stream.map(|item| {
            item.map(local_load_item)
                .map_err(|error| js_error(&error.to_string()))
        })))
    }

    /// Opens a finite bounded event stream.
    pub async fn read(
        &self,
        after: Option<u64>,
        through: Option<u64>,
    ) -> Result<SeaLocalStream, JsValue> {
        let stream = self
            .current()?
            .read(
                after.map(EventPosition::new),
                through.map(EventPosition::new),
            )
            .await
            .map_err(|error| js_error(&error.to_string()))?;
        Ok(SeaLocalStream::new(stream.map(|item| {
            item.map(|event| local_load_item(LoadEvent::Event(event)))
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
    fn current(&self) -> Result<Rc<LocalSession<MemoryStream>>, JsValue> {
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
}

impl SeaLocalStream {
    fn new(
        stream: impl futures_util::Stream<Item = Result<SeaLoadItem, JsValue>> + 'static,
    ) -> Self {
        Self {
            inner: RefCell::new(Some(Box::pin(stream))),
        }
    }
}

#[wasm_bindgen]
impl SeaLocalStream {
    /// Returns the next local stream item or undefined at finite completion.
    pub async fn next(&self) -> Result<Option<SeaLoadItem>, JsValue> {
        let mut stream = self
            .inner
            .take()
            .ok_or_else(|| js_error("Sea local stream is already being read"))?;
        let item = stream.next().await.transpose()?;
        self.inner.replace(Some(stream));
        Ok(item)
    }

    /// Cancels the local stream.
    pub async fn cancel(&self) {
        self.inner.replace(None);
        std::future::ready(()).await;
    }
}

#[wasm_bindgen]
impl SeaInjectedClient {
    /// Creates a typed client over one injected transport.
    #[wasm_bindgen(constructor)]
    pub fn new(transport: AsyncRequestTransport, max_frame_bytes: usize) -> Result<Self, JsValue> {
        if max_frame_bytes < protocol::MAGIC.len() + 1 {
            return Err(js_error(
                "max_frame_bytes is smaller than the Sea frame header",
            ));
        }
        Ok(Self {
            transport: Rc::new(RefCell::new(transport.into())),
            next_request_id: Cell::new(1),
            limits: protocol::Limits { max_frame_bytes },
        })
    }

    /// Opens one archive-bound author session.
    #[wasm_bindgen(js_name = openSession)]
    pub async fn open_session(
        &self,
        archive: Uint8Array,
        author: Uint8Array,
        session: Uint8Array,
        reference: Option<u64>,
    ) -> Result<(), JsValue> {
        let response = self
            .request(protocol::Request::OpenSession {
                archive: archive.to_vec(),
                author: author.to_vec(),
                session: session.to_vec(),
                reference,
            })
            .await?;
        expect_acknowledged(&response)
    }

    /// Submits one event under a stable operation identity.
    pub async fn submit(
        &self,
        operation: Uint8Array,
        reference: Option<u64>,
        payload: Uint8Array,
        blob_tree: Option<SeaTreeId>,
    ) -> Result<SeaEventReceipt, JsValue> {
        match self
            .request(protocol::Request::Submit {
                operation: operation.to_vec(),
                reference,
                event: protocol::Event {
                    payload: payload.to_vec(),
                    blob_tree: blob_tree.map(|value| value.inner),
                },
            })
            .await?
        {
            protocol::Response::EventCommitted {
                position,
                durability,
            } => Ok(SeaEventReceipt {
                position,
                durability,
            }),
            _ => Err(js_error("Sea response is not an event receipt")),
        }
    }

    /// Resolves one stable event operation to its committed position.
    #[wasm_bindgen(js_name = resolveSubmission)]
    pub async fn resolve_submission(
        &self,
        operation: Uint8Array,
    ) -> Result<Option<SeaEventReceipt>, JsValue> {
        match self
            .request(protocol::Request::ResolveSubmission {
                operation: operation.to_vec(),
            })
            .await?
        {
            protocol::Response::SubmissionResolved {
                position: Some(position),
                durability: Some(durability),
            } => Ok(Some(SeaEventReceipt {
                position,
                durability,
            })),
            protocol::Response::SubmissionResolved {
                position: None,
                durability: None,
            } => Ok(None),
            _ => Err(js_error("Sea response is not a submission resolution")),
        }
    }

    /// Opens a finite bounded committed-event stream.
    pub async fn read(
        &self,
        after: Option<u64>,
        through: Option<u64>,
    ) -> Result<SeaInjectedStream, JsValue> {
        self.open_stream(protocol::Request::Read { after, through })
            .await
    }

    /// Uploads one immutable blob and returns its stored identity.
    #[wasm_bindgen(js_name = putBlob)]
    pub async fn put_blob(&self, payload: Uint8Array) -> Result<SeaTreeId, JsValue> {
        match self
            .request(protocol::Request::PutBlob {
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
        match self.request(protocol::Request::GetBlob { id }).await? {
            protocol::Response::Blob(payload) => Ok(Uint8Array::from(payload.as_slice())),
            _ => Err(js_error("Sea response is not a blob")),
        }
    }

    /// Fetches one immutable directory.
    #[wasm_bindgen(js_name = getDirectory)]
    pub async fn get_directory(&self, id: &SeaTreeId) -> Result<Array, JsValue> {
        let protocol::TreeId::Directory(id) = id.inner else {
            return Err(js_error("getDirectory requires a directory identity"));
        };
        match self.request(protocol::Request::GetDirectory { id }).await? {
            protocol::Response::Directory(entries) => Ok(entries
                .into_iter()
                .map(|entry| {
                    JsValue::from(SeaDirectoryEntry {
                        name: entry.name,
                        child: SeaTreeId { inner: entry.child },
                    })
                })
                .collect()),
            _ => Err(js_error("Sea response is not a directory")),
        }
    }

    /// Publishes one immutable directory and returns its identity.
    #[wasm_bindgen(js_name = putDirectory)]
    pub async fn put_directory(&self, entries: Array) -> Result<SeaTreeId, JsValue> {
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
            .request(protocol::Request::PutDirectory { entries: values })
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
        operation: Uint8Array,
        expected_parent: Option<Uint8Array>,
        at_event: Option<u64>,
        root: &SeaTreeId,
    ) -> Result<SeaSnapshot, JsValue> {
        match self
            .request(protocol::Request::PublishSnapshot {
                operation: operation.to_vec(),
                expected_parent: expected_parent.map(|value| value.to_vec()),
                at_event: at_event.map_or(
                    protocol::SnapshotPosition::Initial,
                    protocol::SnapshotPosition::At,
                ),
                root: root.inner,
            })
            .await?
        {
            protocol::Response::Snapshot(Some(inner)) => Ok(SeaSnapshot { inner }),
            _ => Err(js_error("Sea response is not a published snapshot")),
        }
    }

    /// Fetches one retained snapshot by publication identity.
    #[wasm_bindgen(js_name = getSnapshot)]
    pub async fn get_snapshot(&self, id: Uint8Array) -> Result<Option<SeaSnapshot>, JsValue> {
        match self
            .request(protocol::Request::GetSnapshot { id: id.to_vec() })
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
        match self.request(protocol::Request::LatestSnapshot).await? {
            protocol::Response::Snapshot(snapshot) => {
                Ok(snapshot.map(|inner| SeaSnapshot { inner }))
            }
            _ => Err(js_error("Sea response is not a snapshot")),
        }
    }

    /// Resolves a possibly ambiguous snapshot publication.
    #[wasm_bindgen(js_name = resolveSnapshot)]
    pub async fn resolve_snapshot(
        &self,
        operation: Uint8Array,
    ) -> Result<Option<SeaSnapshot>, JsValue> {
        match self
            .request(protocol::Request::ResolveSnapshot {
                operation: operation.to_vec(),
            })
            .await?
        {
            protocol::Response::Snapshot(snapshot) => {
                Ok(snapshot.map(|inner| SeaSnapshot { inner }))
            }
            _ => Err(js_error("Sea response is not a snapshot resolution")),
        }
    }

    /// Opens a gap-free snapshot, catch-up, and live event stream.
    pub async fn load(&self, required: Option<u64>) -> Result<SeaInjectedStream, JsValue> {
        self.open_stream(protocol::Request::Load { required }).await
    }

    /// Opens a latest-value snapshot subscription.
    #[wasm_bindgen(js_name = subscribeSnapshots)]
    pub async fn subscribe_snapshots(&self) -> Result<SeaInjectedStream, JsValue> {
        self.open_stream(protocol::Request::SubscribeSnapshots)
            .await
    }

    /// Explicitly closes this logical session.
    pub async fn close(&self) -> Result<(), JsValue> {
        let response = self.request(protocol::Request::Close).await?;
        expect_acknowledged(&response)
    }

    /// Replaces the injected transport after an explicit reconnect.
    #[wasm_bindgen(js_name = replaceTransport)]
    pub fn replace_transport(&self, transport: AsyncRequestTransport) {
        self.transport.replace(transport.into());
    }

    /// Forwards explicit disconnection to the injected transport.
    pub fn disconnect(&self) -> Result<(), JsValue> {
        let transport = self.transport.borrow();
        call_method(&transport, "disconnect", &[]).map(|_| ())
    }
}

impl SeaInjectedClient {
    async fn request(&self, request: protocol::Request) -> Result<protocol::Response, JsValue> {
        let request_id = self.next_id();
        let outgoing = protocol::encode(
            &protocol::Frame {
                request_id,
                message: request,
            },
            self.limits,
        )
        .map_err(|error| js_error(&error.to_string()))?;
        let incoming = call_method(
            &self.transport.borrow(),
            "request",
            &[Uint8Array::from(outgoing.as_slice()).into()],
        )?;
        let incoming = JsFuture::from(Promise::resolve(&incoming)).await?;
        if !incoming.is_instance_of::<Uint8Array>() {
            return Err(js_error("Sea response is not a Uint8Array"));
        }
        decode_response(
            request_id,
            &Uint8Array::new(&incoming).to_vec(),
            self.limits,
        )
    }

    async fn open_stream(&self, request: protocol::Request) -> Result<SeaInjectedStream, JsValue> {
        let request_id = self.next_id();
        let outgoing = protocol::encode(
            &protocol::Frame {
                request_id,
                message: request,
            },
            self.limits,
        )
        .map_err(|error| js_error(&error.to_string()))?;
        let transport = call_method(
            &self.transport.borrow(),
            "subscribe",
            &[Uint8Array::from(outgoing.as_slice()).into()],
        )?;
        let transport = JsFuture::from(Promise::resolve(&transport)).await?;
        Ok(SeaInjectedStream {
            transport,
            request_id,
            limits: self.limits,
            cancelled: Cell::new(false),
        })
    }

    fn next_id(&self) -> u64 {
        let current = self.next_request_id.get();
        self.next_request_id.set(current.wrapping_add(1).max(1));
        current
    }
}

fn decode_response(
    request_id: u64,
    bytes: &[u8],
    limits: protocol::Limits,
) -> Result<protocol::Response, JsValue> {
    let frame = protocol::decode::<protocol::Frame<protocol::Response>>(bytes, limits)
        .map_err(|error| js_error(&error.to_string()))?;
    if frame.request_id != request_id {
        return Err(js_error("Sea response request identity did not match"));
    }
    match frame.message {
        protocol::Response::Error { message, .. } => Err(js_error(&message)),
        response => Ok(response),
    }
}

fn validate_request(bytes: &[u8], max_frame_bytes: usize) -> Result<(), JsValue> {
    protocol::decode::<protocol::Frame<protocol::Request>>(
        bytes,
        protocol::Limits { max_frame_bytes },
    )
    .map(|_| ())
    .map_err(|error| js_error(&error.to_string()))
}

async fn read_length_delimited(
    reader: &ReadableStreamDefaultReader,
    buffered: &mut Vec<u8>,
    max_frame_bytes: usize,
) -> Result<Option<Vec<u8>>, JsValue> {
    loop {
        if buffered.len() >= 4 {
            let length = usize::try_from(u32::from_be_bytes(
                buffered[..4]
                    .try_into()
                    .map_err(|_| js_error("invalid Sea stream length"))?,
            ))
            .map_err(|_| js_error("Sea stream frame length exceeds address space"))?;
            if length > max_frame_bytes {
                return Err(js_error("Sea stream frame exceeds its configured limit"));
            }
            let frame_end = 4_usize
                .checked_add(length)
                .ok_or_else(|| js_error("Sea stream frame length overflow"))?;
            if buffered.len() >= frame_end {
                let frame = buffered[4..frame_end].to_vec();
                buffered.drain(..frame_end);
                return Ok(Some(frame));
            }
        }
        let result = JsFuture::from(reader.read()).await?;
        let done = Reflect::get(&result, &JsValue::from_str("done"))?
            .as_bool()
            .ok_or_else(|| js_error("browser stream returned an invalid done flag"))?;
        if done {
            return if buffered.is_empty() {
                Ok(None)
            } else {
                Err(js_error("Sea stream ended in a partial frame"))
            };
        }
        let value = Reflect::get(&result, &JsValue::from_str("value"))?;
        let chunk = Uint8Array::new(&value);
        let next_length = buffered
            .len()
            .checked_add(chunk.length() as usize)
            .ok_or_else(|| js_error("Sea stream buffer length overflow"))?;
        let max_buffered = max_frame_bytes
            .checked_add(4)
            .ok_or_else(|| js_error("Sea stream limit overflow"))?;
        if next_length > max_buffered {
            return Err(js_error("Sea stream buffer exceeds its configured limit"));
        }
        buffered.resize(next_length, 0);
        chunk.copy_to(&mut buffered[next_length - chunk.length() as usize..]);
    }
}

fn expect_acknowledged(response: &protocol::Response) -> Result<(), JsValue> {
    if matches!(response, protocol::Response::Acknowledged) {
        Ok(())
    } else {
        Err(js_error("Sea response is not an acknowledgement"))
    }
}

fn fixed_id(bytes: &Uint8Array) -> Result<[u8; 32], JsValue> {
    bytes
        .to_vec()
        .try_into()
        .map_err(|_| js_error("Sea content identity must contain exactly 32 bytes"))
}

fn tree_from_js(value: &JsValue) -> Result<protocol::TreeId, JsValue> {
    let kind = Reflect::get(value, &JsValue::from_str("kind"))?
        .as_string()
        .ok_or_else(|| js_error("tree identity kind is not a string"))?;
    let bytes = Reflect::get(value, &JsValue::from_str("bytes"))?;
    if !bytes.is_instance_of::<Uint8Array>() {
        return Err(js_error("tree identity bytes are not a Uint8Array"));
    }
    let bytes = fixed_id(&Uint8Array::new(&bytes))?;
    match kind.as_str() {
        "blob" => Ok(protocol::TreeId::Blob(bytes)),
        "directory" => Ok(protocol::TreeId::Directory(bytes)),
        _ => Err(js_error("tree identity kind is invalid")),
    }
}

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

fn wire_tree(id: BlobTreeId) -> protocol::TreeId {
    match id {
        BlobTreeId::Blob(id) => protocol::TreeId::Blob(*id.as_bytes()),
        BlobTreeId::Directory(id) => protocol::TreeId::Directory(*id.as_bytes()),
    }
}

fn local_snapshot(snapshot: sea_core::archive::PublishedSnapshot) -> SeaSnapshot {
    SeaSnapshot {
        inner: protocol::Snapshot {
            id: snapshot.id.as_bytes().to_vec(),
            parent: snapshot.parent.map(|parent| parent.as_bytes().to_vec()),
            at_event: match snapshot.snapshot.at_event {
                ArchiveSnapshotPosition::Initial => protocol::SnapshotPosition::Initial,
                ArchiveSnapshotPosition::At(position) => {
                    protocol::SnapshotPosition::At(position.get())
                }
            },
            root: wire_tree(snapshot.snapshot.root),
        },
    }
}

fn local_load_item(item: LoadEvent) -> SeaLoadItem {
    SeaLoadItem {
        inner: match item {
            LoadEvent::Snapshot(snapshot) => {
                protocol::Response::LoadSnapshot(local_snapshot(snapshot).inner)
            }
            LoadEvent::Event(event) => {
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
            LoadEvent::CaughtUp(head) => protocol::Response::CaughtUp(head.map(EventPosition::get)),
        },
    }
}

fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
