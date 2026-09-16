//! Typed Sea v1 bindings over an injected JavaScript transport.

#![allow(
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::must_use_candidate
)]

use std::{
    cell::{Cell, RefCell},
    collections::VecDeque,
    rc::Rc,
    sync::Arc,
};

use async_trait::async_trait;
use futures_util::{
    StreamExt as _,
    future::{AbortHandle, Abortable},
};
use js_sys::{Array, Promise, Reflect, Uint8Array};
#[cfg(feature = "test-support")]
use bytes::Bytes;
#[cfg(feature = "test-support")]
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, Event, EventPosition, SnapshotId,
    archive::{
        AuthorId, EventSubmission, LoadEvent, OperationId, SeaArchive, SeaAuthorSession,
        SeaEventSubscription, SeaSnapshotCoordinator, SessionId, SessionStream,
        Snapshot as ArchiveSnapshot, SnapshotPosition as ArchiveSnapshotPosition,
        SnapshotPublication,
    },
};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

use super::{AsyncRequestTransport, call_method, sea_protocol_v1 as protocol};
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
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum SeaLoadKind {
    /// A selected recovery snapshot.
    Snapshot = 1,
    /// One catch-up or live event.
    Event = 2,
    /// The finite catch-up boundary.
    CaughtUp = 3,
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
            protocol::Response::CaughtUp(_) => SeaLoadKind::CaughtUp,
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
    inner: RefCell<Option<ResponseStream<InjectedBidirectionalStream>>>,
    buffered: RefCell<VecDeque<protocol::Response>>,
    cancelled: Cell<bool>,
}

/// Latest accepted snapshot and this client's nomination fence.
#[wasm_bindgen]
pub struct SeaSnapshotCoordination {
    latest: Option<protocol::Snapshot>,
    fence: Option<u64>,
}

#[wasm_bindgen]
impl SeaSnapshotCoordination {
    /// Returns the latest accepted snapshot.
    #[wasm_bindgen(getter)]
    pub fn latest(&self) -> Option<SeaSnapshot> {
        self.latest.clone().map(|inner| SeaSnapshot { inner })
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
    inner: Rc<RefCell<Option<SnapshotStream<InjectedBidirectionalStream>>>>,
    cancelled: Cell<bool>,
}

#[wasm_bindgen]
impl SeaInjectedSnapshotStream {
    /// Waits for the next accepted-snapshot or nomination update.
    pub async fn next(&self) -> Result<SeaSnapshotCoordination, JsValue> {
        if self.cancelled.get() {
            return Err(js_error("Sea snapshot stream is cancelled"));
        }
        let mut stream = self
            .inner
            .take()
            .ok_or_else(|| js_error("Sea snapshot stream is unavailable"))?;
        stream.next_coordination().await.map_err(client_error)?;
        let result = SeaSnapshotCoordination {
            latest: stream.latest().cloned(),
            fence: stream.fence(),
        };
        self.inner.replace(Some(stream));
        Ok(result)
    }

    /// Finishes coordination and revokes publisher eligibility.
    pub async fn cancel(&self) -> Result<(), JsValue> {
        if !self.cancelled.replace(true)
            && let Some(stream) = self.inner.take()
        {
            stream.close().await.map_err(client_error)?;
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
    inner: RefCell<Option<BrowserBidirectionalStream>>,
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
            inner: RefCell::new(Some(self.transport.open_bidirectional().await?)),
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
        let mut stream = take_browser_stream(&self.inner)?;
        let result = stream.send(&bytes.to_vec()).await;
        self.inner.replace(Some(stream));
        result?;
        Ok(())
    }

    /// Finishes the stream's send direction.
    pub async fn finish(&self) -> Result<(), JsValue> {
        let mut stream = take_browser_stream(&self.inner)?;
        let result = stream.finish().await;
        self.inner.replace(Some(stream));
        result?;
        Ok(())
    }

    /// Receives the next arbitrary byte chunk.
    pub async fn receive(&self) -> Result<Option<Uint8Array>, JsValue> {
        let mut stream = take_browser_stream(&self.inner)?;
        let result = stream.receive().await;
        self.inner.replace(Some(stream));
        Ok(result?.map(|bytes| Uint8Array::from(bytes.as_slice())))
    }

    /// Cancels both stream directions and releases their locks.
    pub async fn cancel(&self) -> Result<(), JsValue> {
        if let Some(mut stream) = self.inner.take() {
            stream.cancel().await?;
        }
        Ok(())
    }
}

fn take_browser_stream(
    stream: &RefCell<Option<BrowserBidirectionalStream>>,
) -> Result<BrowserBidirectionalStream, JsValue> {
    stream
        .take()
        .ok_or_else(|| js_error("Sea browser stream is unavailable"))
}

#[wasm_bindgen]
impl SeaInjectedStream {
    /// Waits for the next typed stream item.
    pub async fn next(&self) -> Result<Option<SeaLoadItem>, JsValue> {
        if self.cancelled.get() {
            return Err(js_error("Sea stream is cancelled"));
        }
        if let Some(response) = self.buffered.borrow_mut().pop_front() {
            return load_item(response).map(Some);
        }
        if self.inner.borrow().is_none() {
            return Ok(None);
        }
        let mut stream = self
            .inner
            .take()
            .ok_or_else(|| js_error("Sea stream has ended"))?;
        let response = stream.next().await.map_err(client_error)?;
        if response.is_some() {
            self.inner.replace(Some(stream));
        }
        let Some(response) = response else {
            return Ok(None);
        };
        load_item(response).map(Some)
    }

    /// Cancels the stream and injected transport.
    pub async fn cancel(&self) -> Result<(), JsValue> {
        if !self.cancelled.replace(true)
            && let Some(stream) = self.inner.take()
        {
            stream.cancel().await.map_err(client_error)?;
        }
        Ok(())
    }
}

/// Typed Sea v1 client using a caller-provided asynchronous transport.
#[wasm_bindgen]
pub struct SeaInjectedClient {
    transport: Rc<RefCell<JsValue>>,
    client: Client<InjectedTransport>,
    event_stream: RefCell<Option<EventStream<InjectedBidirectionalStream>>>,
    author_stream: RefCell<Option<AuthorStream<InjectedBidirectionalStream>>>,
    snapshot_stream: Rc<RefCell<Option<SnapshotStream<InjectedBidirectionalStream>>>>,
    content_stream: RefCell<Option<ContentStream<InjectedBidirectionalStream>>>,
    pending_archive_creation: RefCell<Option<Vec<u8>>>,
    resume_after: Cell<Option<u64>>,
}

#[derive(Clone, Debug)]
struct InjectedTransport {
    inner: Rc<RefCell<JsValue>>,
}

#[derive(Debug)]
struct InjectedBidirectionalStream {
    inner: JsValue,
}

#[async_trait(?Send)]
impl ClientTransport for InjectedTransport {
    type Stream = InjectedBidirectionalStream;
    type Error = JsValue;

    async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error> {
        let stream = call_method(&self.inner.borrow(), "openBidirectional", &[])?;
        let stream = JsFuture::from(Promise::resolve(&stream)).await?;
        Ok(InjectedBidirectionalStream { inner: stream })
    }

    fn disconnect(&self) -> Result<(), Self::Error> {
        call_method(&self.inner.borrow(), "disconnect", &[]).map(|_| ())
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
        let received = call_method(&self.inner, "receive", &[])?;
        let received = JsFuture::from(Promise::resolve(&received)).await?;
        if received.is_null() || received.is_undefined() {
            return Ok(None);
        }
        if !received.is_instance_of::<Uint8Array>() {
            return Err(js_error("Sea transport chunk is not a Uint8Array"));
        }
        Ok(Some(Uint8Array::new(&received).to_vec()))
    }

    async fn cancel(&mut self) -> Result<(), Self::Error> {
        let cancelled = call_method(&self.inner, "cancel", &[])?;
        JsFuture::from(Promise::resolve(&cancelled)).await?;
        Ok(())
    }
}

#[cfg(feature = "test-support")]
mod test_support {
    use std::collections::BTreeMap;

    use sea_memory::MemoryStream;
    use sea_sequencer::session::{LocalSequencer, LocalSession};

    use super::*;

/// Shared in-process memory service for generated-client tests.
#[wasm_bindgen]
pub struct SeaLocalService {
    sequencer: Arc<LocalSequencer<MemoryStream>>,
    archive: Rc<RefCell<Option<Vec<u8>>>>,
}

#[wasm_bindgen]
impl SeaLocalService {
    /// Creates one empty in-process archive service.
    pub async fn create() -> Result<SeaLocalService, JsValue> {
        let sequencer = LocalSequencer::recover(Arc::new(MemoryStream::new()))
            .await
            .map_err(|error| js_error(&error.to_string()))?;
        Ok(Self {
            sequencer,
            archive: Rc::new(RefCell::new(None)),
        })
    }

    /// Creates one client sharing this service's archive registry.
    pub fn connect(&self) -> SeaLocalClient {
        SeaLocalClient {
            sequencer: Arc::clone(&self.sequencer),
            archive: Rc::clone(&self.archive),
            session: RefCell::new(None),
            disconnected: Cell::new(false),
        }
    }
}

/// Typed in-process Sea client used by local browser tests and benchmarks.
#[wasm_bindgen]
pub struct SeaLocalClient {
    sequencer: Arc<LocalSequencer<MemoryStream>>,
    archive: Rc<RefCell<Option<Vec<u8>>>>,
    session: RefCell<Option<Rc<LocalSession<MemoryStream>>>>,
    disconnected: Cell<bool>,
}

#[wasm_bindgen]
impl SeaLocalClient {
    /// Creates an archive without opening an author session.
    #[wasm_bindgen(js_name = createArchive)]
    pub async fn create_archive(&self, archive: Uint8Array) -> Result<(), JsValue> {
        if self.archive.borrow().is_some() {
            return Err(js_error("archive already exists"));
        }
        self.archive.replace(Some(archive.to_vec()));
        std::future::ready(()).await;
        Ok(())
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
    ) -> Result<(), JsValue> {
        let archive = archive.to_vec();
        let author = AuthorId::new(Bytes::from(author.to_vec()))
            .map_err(|_| js_error("author identity is empty"))?;
        let session_id = SessionId::new(Bytes::from(session.to_vec()))
            .map_err(|_| js_error("session identity is empty"))?;
        match (&*self.archive.borrow(), create) {
            (Some(_), true) => return Err(js_error("archive already exists")),
            (None, false) => return Err(js_error("archive does not exist")),
            (Some(existing), false) if existing != &archive => {
                return Err(js_error("archive does not exist"));
            }
            _ => {}
        }
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
            .open_session(author, session_id, reference.map(EventPosition::new))
            .await
            .map_err(|error| js_error(&error.to_string()))?;
        if create {
            self.archive.replace(Some(archive));
        }
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
    pub async fn next(&self) -> Result<Option<SeaLoadItem>, JsValue> {
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
        item.transpose()
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

}

#[cfg(feature = "test-support")]
pub use test_support::*;

#[wasm_bindgen]
impl SeaInjectedClient {
    /// Creates a typed client over one injected transport.
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
            client,
            event_stream: RefCell::new(None),
            author_stream: RefCell::new(None),
            snapshot_stream: Rc::new(RefCell::new(None)),
            content_stream: RefCell::new(None),
            pending_archive_creation: RefCell::new(None),
            resume_after: Cell::new(None),
        })
    }

    /// Creates an archive without opening an author session.
    #[wasm_bindgen(js_name = createArchive)]
    pub async fn create_archive(&self, archive: Uint8Array) -> Result<(), JsValue> {
        if self.pending_archive_creation.borrow().is_some() {
            return Err(js_error("archive creation is already pending"));
        }
        self.pending_archive_creation
            .replace(Some(archive.to_vec()));
        std::future::ready(()).await;
        Ok(())
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
    ) -> Result<(), JsValue> {
        if let Some(previous) = self.event_stream.take() {
            previous.cancel().await.map_err(client_error)?;
        }
        self.author_stream.take();
        self.snapshot_stream.take();
        self.content_stream.take();
        let archive = archive.to_vec();
        let create = {
            let pending_create = self.pending_archive_creation.borrow();
            if let Some(pending_archive) = pending_create.as_ref()
                && pending_archive != &archive
            {
                return Err(js_error(
                    "pending archive creation does not match the session",
                ));
            }
            create || pending_create.is_some()
        };
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
        self.pending_archive_creation.take();
        let author_stream = self
            .client
            .open_author_stream()
            .await
            .map_err(client_error)?;
        let snapshot_stream = self
            .client
            .open_snapshot_stream(true, true)
            .await
            .map_err(client_error)?;
        self.resume_after.set(reference);
        self.event_stream.replace(Some(event_stream));
        self.author_stream.replace(Some(author_stream));
        self.snapshot_stream.replace(Some(snapshot_stream));
        Ok(())
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
            .author_request(protocol::Request::Submit {
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
                durability: durability.name().to_owned(),
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
            .author_request(protocol::Request::ResolveSubmission {
                operation: operation.to_vec(),
            })
            .await?
        {
            protocol::Response::SubmissionResolved {
                position: Some(position),
                durability: Some(durability),
            } => Ok(Some(SeaEventReceipt {
                position,
                durability: durability.name().to_owned(),
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
        let responses = self
            .content_request(protocol::Request::Read { after, through })
            .await?;
        Ok(SeaInjectedStream {
            inner: RefCell::new(None),
            buffered: RefCell::new(responses.into()),
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
    pub async fn get_directory(&self, id: &SeaTreeId) -> Result<Array, JsValue> {
        let protocol::TreeId::Directory(id) = id.inner else {
            return Err(js_error("getDirectory requires a directory identity"));
        };
        match self
            .one_content_response(protocol::Request::GetDirectory { id })
            .await?
        {
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
        operation: Uint8Array,
        expected_parent: Option<Uint8Array>,
        at_event: Option<u64>,
        root: &SeaTreeId,
    ) -> Result<SeaSnapshot, JsValue> {
        let fence = self
            .snapshot_stream
            .borrow()
            .as_ref()
            .and_then(SnapshotStream::fence)
            .ok_or_else(|| js_error("Sea client is not nominated to publish snapshots"))?;
        match self
            .snapshot_request(protocol::Request::PublishNominatedSnapshot {
                fence,
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
            .one_content_response(protocol::Request::GetSnapshot { id: id.to_vec() })
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
            .snapshot_request(protocol::Request::LatestSnapshot)
            .await?
        {
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
            .snapshot_request(protocol::Request::ResolveSnapshot {
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
        if required != self.resume_after.get() {
            return Err(js_error(
                "load position must match the opened event stream resume position",
            ));
        }
        let event_stream = self
            .event_stream
            .take()
            .ok_or_else(|| js_error("Sea event stream is not open"))?;
        std::future::ready(()).await;
        Ok(SeaInjectedStream {
            inner: RefCell::new(Some(event_stream.into_responses())),
            buffered: RefCell::new(VecDeque::new()),
            cancelled: Cell::new(false),
        })
    }

    /// Opens a latest-value snapshot subscription.
    #[wasm_bindgen(js_name = subscribeSnapshots)]
    pub async fn subscribe_snapshots(&self) -> Result<SeaInjectedSnapshotStream, JsValue> {
        std::future::ready(()).await;
        Ok(SeaInjectedSnapshotStream {
            inner: Rc::clone(&self.snapshot_stream),
            cancelled: Cell::new(false),
        })
    }

    /// Explicitly closes this logical session.
    pub async fn close(&self) -> Result<(), JsValue> {
        if let Some(snapshot) = self.snapshot_stream.take() {
            snapshot.close().await.map_err(client_error)?;
        }
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
            protocol::Response::Error { message, .. } => Err(js_error(&message)),
            response => Ok(response),
        }
    }

    async fn snapshot_request(
        &self,
        request: protocol::Request,
    ) -> Result<protocol::Response, JsValue> {
        let mut stream = self
            .snapshot_stream
            .take()
            .ok_or_else(|| js_error("Sea snapshot stream is not open"))?;
        let response = stream.request(request).await;
        self.snapshot_stream.replace(Some(stream));
        match response.map_err(client_error)? {
            protocol::Response::Error { message, .. } => Err(js_error(&message)),
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
        if let Some(protocol::Response::Error { message, .. }) = responses.first() {
            return Err(js_error(message));
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
        ClientError::UnexpectedResponse(protocol::Response::Error { message, .. }) => {
            js_error(&message)
        }
        ClientError::UnexpectedResponse(_) => js_error("Sea response did not match its request"),
    }
}

fn load_item(response: protocol::Response) -> Result<SeaLoadItem, JsValue> {
    if let protocol::Response::Error { message, .. } = response {
        return Err(js_error(&message));
    }
    if !matches!(
        response,
        protocol::Response::LoadSnapshot(_)
            | protocol::Response::LoadEvent(_)
            | protocol::Response::CaughtUp(_)
    ) {
        return Err(js_error("Sea stream response is not a load item"));
    }
    Ok(SeaLoadItem { inner: response })
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

#[cfg(feature = "test-support")]
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
