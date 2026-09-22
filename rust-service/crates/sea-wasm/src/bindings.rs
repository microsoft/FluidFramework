//! JavaScript session operations independent of concrete stack construction.

#![allow(
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::must_use_candidate
)]

use std::{cell::RefCell, collections::BTreeMap, rc::Rc};

use bytes::Bytes;
use futures_util::{
    StreamExt as _,
    future::{AbortHandle, Abortable},
};
use js_sys::{Array, Object, Reflect, Uint8Array};
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, Event, EventPosition,
    EventSubmission, MonitoredStreamItem, SeaSession as SessionContract, SessionId, SessionStream,
    SnapshotCoordination, SnapshotParticipation,
    storage::{LoadStart, Snapshot, StorageHandle},
};
use wasm_bindgen::prelude::*;

use crate::session::{BindingError, BindingSession, SessionAdapter};

/// Converts classified failures into JavaScript errors without losing their category.
pub(crate) fn service_error(error: &impl ClassifiedError) -> JsValue {
    let result = js_sys::Error::new(&error.to_string());
    let _ = Reflect::set(
        result.as_ref(),
        &"kind".into(),
        &format!("{:?}", error.kind()).into(),
    );
    result.into()
}

/// Reports invalid binding input before calling a session.
fn invalid(message: &str) -> JsValue {
    let result = js_sys::Error::new(message);
    let _ = Reflect::set(result.as_ref(), &"kind".into(), &"Rejected".into());
    result.into()
}

/// Sets one property on a newly allocated binding result.
pub(crate) fn set(object: &Object, name: &str, value: impl Into<JsValue>) -> Result<(), JsValue> {
    Reflect::set(object, &name.into(), &value.into())?;
    Ok(())
}

/// Immutable content identity, not proof that the content is available.
#[wasm_bindgen]
#[derive(Clone)]
pub struct SeaTreeId {
    /// Transport-independent core identity.
    inner: BlobTreeId,
}

#[wasm_bindgen]
extern "C" {
    /// Non-consuming JavaScript reference to a generated content identity.
    #[wasm_bindgen(typescript_type = "SeaTreeId")]
    pub type SeaTreeReference;
}

/// Copies an optional generated identity without transferring ownership of its allocation.
fn tree_reference(value: &SeaTreeReference) -> Result<BlobTreeId, JsValue> {
    let bytes = Reflect::get(value.as_ref(), &"bytes".into())?;
    let bytes = bytes
        .dyn_ref::<Uint8Array>()
        .ok_or_else(|| invalid("content identity requires Uint8Array bytes"))?
        .to_vec();
    match Reflect::get(value.as_ref(), &"kind".into())?
        .as_string()
        .as_deref()
    {
        Some("blob") => Ok(SeaTreeId::blob(&bytes)?.inner),
        Some("directory") => Ok(SeaTreeId::directory(&bytes)?.inner),
        _ => Err(invalid("unknown content identity kind")),
    }
}

#[wasm_bindgen]
impl SeaTreeId {
    /// Constructs a blob identity from its fixed-size digest.
    pub fn blob(bytes: &[u8]) -> Result<SeaTreeId, JsValue> {
        Ok(Self {
            inner: BlobTreeId::Blob(
                BlobId::from_bytes(bytes).map_err(|error| invalid(&error.to_string()))?,
            ),
        })
    }

    /// Constructs a directory identity from its fixed-size digest.
    pub fn directory(bytes: &[u8]) -> Result<SeaTreeId, JsValue> {
        Ok(Self {
            inner: BlobTreeId::Directory(
                BlobDirectoryId::from_bytes(bytes).map_err(|error| invalid(&error.to_string()))?,
            ),
        })
    }

    /// Returns the identity digest without consuming this object.
    #[wasm_bindgen(getter)]
    pub fn bytes(&self) -> Vec<u8> {
        match self.inner {
            BlobTreeId::Blob(id) => id.as_bytes().to_vec(),
            BlobTreeId::Directory(id) => id.as_bytes().to_vec(),
        }
    }

    /// Returns `blob` or `directory`.
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> String {
        match self.inner {
            BlobTreeId::Blob(_) => "blob",
            BlobTreeId::Directory(_) => "directory",
        }
        .to_owned()
    }
}

/// Reference and decorator options supplied to a stack factory.
#[wasm_bindgen]
pub struct SeaSessionOptions {
    /// Latest incorporated event.
    reference: Option<EventPosition>,
    /// Whether this session explicitly uses the compression decorator.
    compression: bool,
}

#[wasm_bindgen]
impl SeaSessionOptions {
    /// Records explicit session semantics; identity is allocated when opening succeeds.
    #[wasm_bindgen(constructor)]
    pub fn new(reference: Option<u64>, compression: bool) -> SeaSessionOptions {
        Self {
            reference: reference.map(EventPosition::new),
            compression,
        }
    }
}

/// One open session whose operations are shared by every concrete configuration.
#[wasm_bindgen]
pub struct SeaSession {
    /// Numeric identity allocated by the document sequencer.
    session_id: SessionId,
    /// Independent document signal factory, not wrapped by archive payload decorators.
    signal_factory: Rc<dyn crate::signals::SignalFactory>,
    /// Live registrations to close before session transport ownership is released.
    signals: RefCell<Vec<std::rc::Weak<crate::signals::BindingSignals>>>,
    /// Shared, object-safe adapter around the selected stack.
    inner: Rc<BindingSession>,
    /// Backend-assigned document identity.
    document: Vec<u8>,
}

impl SeaSession {
    /// Erases the concrete stack only after its optional decorators are composed.
    #[cfg_attr(feature = "compression", allow(clippy::unnecessary_wraps))]
    fn from_stack<Session: SessionContract + 'static>(
        session: Session,
        document: Vec<u8>,
        session_id: SessionId,
        compression: bool,
        signal_factory: Rc<dyn crate::signals::SignalFactory>,
    ) -> Result<Self, JsValue> {
        let inner: Rc<BindingSession> = if compression {
            #[cfg(feature = "compression")]
            {
                Rc::new(SessionAdapter::new(
                    sea_compression::CompressionSession::new(session),
                ))
            }
            #[cfg(not(feature = "compression"))]
            {
                return Err(invalid("this WASM bundle does not support compression"));
            }
        } else {
            Rc::new(SessionAdapter::new(session))
        };
        Ok(Self {
            session_id,
            inner,
            document,
            signal_factory,
            signals: RefCell::new(Vec::new()),
        })
    }
}

/// Checks capabilities before allocating a document or opening transport resources.
fn check_options(options: &SeaSessionOptions) -> Result<(), JsValue> {
    if options.compression && !cfg!(feature = "compression") {
        return Err(invalid("this WASM bundle does not support compression"));
    }
    Ok(())
}

#[wasm_bindgen]
impl SeaSession {
    /// Returns the allocated session identity in canonical eight-byte big-endian form.
    #[wasm_bindgen(getter, js_name = sessionId)]
    pub fn session_id(&self) -> Vec<u8> {
        self.session_id.as_bytes().to_vec()
    }

    /// Returns the identity to retain for future opens on the same service.
    #[wasm_bindgen(getter)]
    pub fn document(&self) -> Vec<u8> {
        self.document.clone()
    }

    /// Uploads a blob through the configured decorator stack.
    #[wasm_bindgen(js_name = putBlob)]
    pub async fn put_blob(&self, payload: &[u8]) -> Result<SeaTreeId, JsValue> {
        Ok(SeaTreeId {
            inner: self
                .inner
                .put_blob(Bytes::copy_from_slice(payload))
                .await
                .map_err(|error| service_error(&error))?
                .id(),
        })
    }

    /// Reads and decodes a blob through the configured decorator stack.
    #[wasm_bindgen(js_name = getBlob)]
    pub async fn get_blob(&self, id: &SeaTreeId) -> Result<Vec<u8>, JsValue> {
        let BlobTreeId::Blob(id) = id.inner else {
            return Err(invalid("getBlob requires a blob identity"));
        };
        Ok(self
            .inner
            .get_blob(id)
            .await
            .map_err(|error| service_error(&error))?
            .to_vec())
    }

    /// Uploads an immutable directory of named identities.
    #[wasm_bindgen(js_name = putDirectory)]
    pub async fn put_directory(
        &self,
        names: Vec<String>,
        children: Vec<SeaTreeId>,
    ) -> Result<SeaTreeId, JsValue> {
        if names.len() != children.len() {
            return Err(invalid(
                "directory names and children must have equal lengths",
            ));
        }
        let count = names.len();
        let entries: BTreeMap<_, _> = names
            .into_iter()
            .zip(children.into_iter().map(|child| child.inner))
            .collect();
        if entries.len() != count {
            return Err(invalid("directory contains duplicate names"));
        }
        let directory = BlobDirectory::new(entries).map_err(|error| invalid(&error.to_string()))?;
        Ok(SeaTreeId {
            inner: self
                .inner
                .put_directory(directory)
                .await
                .map_err(|error| service_error(&error))?
                .id(),
        })
    }

    /// Reads a directory as named child identities.
    #[wasm_bindgen(js_name = getDirectory)]
    pub async fn get_directory(&self, id: &SeaTreeId) -> Result<Array, JsValue> {
        let BlobTreeId::Directory(id) = id.inner else {
            return Err(invalid("getDirectory requires a directory identity"));
        };
        let directory = self
            .inner
            .get_directory(id)
            .await
            .map_err(|error| service_error(&error))?;
        let result = Array::new();
        for (name, child) in directory.entries() {
            let entry = Object::new();
            set(&entry, "name", name.as_str())?;
            set(&entry, "child", SeaTreeId { inner: *child })?;
            result.push(&entry);
        }
        Ok(result)
    }

    /// Announces immutable public membership metadata in the ordered archive.
    #[wasm_bindgen(js_name = announceMembership)]
    pub async fn announce_membership(&self, metadata: &[u8]) -> Result<u64, JsValue> {
        self.inner
            .announce_membership(Bytes::copy_from_slice(metadata))
            .await
            .map(EventPosition::get)
            .map_err(|error| service_error(&error))
    }

    /// Submits opaque application data in session order.
    pub async fn submit(
        &self,
        reference: Option<u64>,
        payload: &[u8],
        blob_tree: Option<SeaTreeReference>,
    ) -> Result<u64, JsValue> {
        let tree = match blob_tree.as_ref().map(tree_reference).transpose() {
            Ok(prepared) => prepared,
            Err(error) => {
                let _ = self.inner.close().await;
                return Err(error);
            }
        };
        self.inner
            .submit(EventSubmission {
                reference: reference.map(EventPosition::new),
                event: Event {
                    payload: Bytes::copy_from_slice(payload),
                    blob_tree: tree,
                },
            })
            .await
            .map(EventPosition::get)
            .map_err(|error| service_error(&error))
    }

    /// Opens monitored bounded or live event history.
    pub fn read(&self, after: Option<u64>, stop_after: Option<u64>) -> SeaEventStream {
        let events = self.inner.read(
            after.map(EventPosition::new),
            stop_after.map(EventPosition::new),
        );
        SeaEventStream {
            stream: RefCell::new(Some(Box::pin(events.map(|item| {
                item.map_err(|error| service_error(&error))
                    .and_then(event_result)
            })))),
            pending: RefCell::new(None),
        }
    }

    /// Selects a snapshot and its gap-free event suffix.
    pub async fn load(&self, required: Option<u64>) -> Result<SeaEventStream, JsValue> {
        let loaded = self
            .inner
            .load(required.map_or(LoadStart::LatestSnapshot, |position| {
                LoadStart::ReplayAtLeastAllAfter(EventPosition::new(position))
            }))
            .await
            .map_err(|error| service_error(&error))?;
        let snapshot = futures_util::stream::iter(
            loaded
                .snapshot
                .map(|snapshot| snapshot_result(snapshot.root.id(), snapshot.at_event.id())),
        );
        let events = loaded.events.map(|item| {
            item.map_err(|error| service_error(&error))
                .and_then(event_result)
        });
        Ok(SeaEventStream {
            stream: RefCell::new(Some(Box::pin(snapshot.chain(events)))),
            pending: RefCell::new(None),
        })
    }

    /// Returns the newest snapshot at or before an inclusive event bound, or the latest if absent.
    #[wasm_bindgen(js_name = getSnapshot)]
    pub async fn get_snapshot(&self, required: Option<u64>) -> Result<JsValue, JsValue> {
        let snapshot = self
            .inner
            .get_snapshot(required.map_or(LoadStart::LatestSnapshot, |position| {
                LoadStart::ReplayAtLeastAllAfter(EventPosition::new(position))
            }))
            .await
            .map_err(|error| service_error(&error))?;
        snapshot.map_or(Ok(JsValue::UNDEFINED), |snapshot| {
            snapshot_result(snapshot.root.id(), snapshot.at_event.id())
        })
    }

    /// Registers snapshot participation as `readOnly`, `seaSelected`, or `clientSelected`.
    #[wasm_bindgen(js_name = coordinateSnapshots)]
    pub async fn coordinate_snapshots(
        &self,
        participation: &str,
    ) -> Result<SeaSnapshotStream, JsValue> {
        let participation = match participation {
            "readOnly" => SnapshotParticipation::ReadOnly,
            "seaSelected" => SnapshotParticipation::SeaSelected,
            "clientSelected" => SnapshotParticipation::ClientSelected,
            _ => return Err(invalid("unknown snapshot participation")),
        };
        let stream = self
            .inner
            .coordinate_snapshots(participation)
            .await
            .map_err(|error| service_error(&error))?;
        Ok(SeaSnapshotStream {
            stream: RefCell::new(Some(stream)),
            pending: RefCell::new(None),
        })
    }

    /// Resolves snapshot dependencies in this session and conditionally publishes them.
    #[wasm_bindgen(js_name = publishSnapshot)]
    pub async fn publish_snapshot(
        &self,
        parent: Option<u64>,
        fence: Option<u64>,
        position: u64,
        root: &SeaTreeId,
    ) -> Result<JsValue, JsValue> {
        let root = self
            .inner
            .resolve_tree(root.inner)
            .await
            .map_err(|error| service_error(&error))?
            .ok_or_else(|| invalid("snapshot root is unavailable"))?;
        let at_event = self
            .inner
            .resolve_position(EventPosition::new(position))
            .await
            .map_err(|error| service_error(&error))?
            .ok_or_else(|| invalid("snapshot event is unavailable"))?;
        let snapshot = self
            .inner
            .publish_snapshot(
                parent.map(EventPosition::new),
                fence,
                Snapshot { root, at_event },
            )
            .await
            .map_err(|error| service_error(&error))?;
        snapshot_result(snapshot.root.id(), snapshot.at_event.id())
    }

    /// Closes this membership without closing other clients of the same service.
    pub async fn close(&self) -> Result<(), JsValue> {
        let signals = self.signals.take();
        for connection in signals
            .into_iter()
            .filter_map(|connection| connection.upgrade())
        {
            connection
                .close_signals()
                .await
                .map_err(|error| service_error(&error))?;
        }
        self.inner
            .close()
            .await
            .map_err(|error| service_error(&error))
    }

    /// Opens ephemeral messaging using a document-scoped connection identity.
    #[wasm_bindgen(js_name = openSignals)]
    pub async fn open_signals(
        &self,
        id: &[u8],
        metadata: &[u8],
    ) -> Result<crate::signals::SeaSignals, JsValue> {
        let inner = self
            .signal_factory
            .open(sea_core::signals::SignalMember {
                id: Bytes::copy_from_slice(id),
                metadata: Bytes::copy_from_slice(metadata),
            })
            .await
            .map_err(|error| service_error(&error))?;
        self.signals.borrow_mut().push(Rc::downgrade(&inner));
        Ok(crate::signals::SeaSignals { inner })
    }
}

/// Encodes one snapshot with neutral content identities.
fn snapshot_result(root: BlobTreeId, position: EventPosition) -> Result<JsValue, JsValue> {
    let result = Object::new();
    set(&result, "kind", "snapshot")?;
    set(&result, "root", SeaTreeId { inner: root })?;
    set(&result, "atEvent", position.get())?;
    Ok(result.into())
}

/// Encodes event and progress cases without transport-protocol values.
fn event_result(
    item: MonitoredStreamItem<sea_core::SessionCommittedEvent, EventPosition>,
) -> Result<JsValue, JsValue> {
    let result = Object::new();
    match item {
        MonitoredStreamItem::Item(event) => {
            set(&result, "kind", "event")?;
            set(
                &result,
                "eventType",
                match event.kind {
                    sea_core::archive::SessionEventKind::Application => "application",
                    sea_core::archive::SessionEventKind::Joined => "joined",
                    sea_core::archive::SessionEventKind::Left => "left",
                },
            )?;
            set(&result, "position", event.committed.position.get())?;
            set(
                &result,
                "payload",
                Uint8Array::from(event.committed.event.payload.as_ref()),
            )?;
            set(
                &result,
                "session",
                Uint8Array::from(event.session_id.as_bytes().as_ref()),
            )?;
            set(
                &result,
                "reference",
                event.reference.map(EventPosition::get),
            )?;
            set(
                &result,
                "minimumReference",
                event.minimum_reference.map(EventPosition::get),
            )?;
            set(
                &result,
                "blobTree",
                event
                    .committed
                    .event
                    .blob_tree
                    .map_or(JsValue::UNDEFINED, |inner| {
                        JsValue::from(SeaTreeId { inner })
                    }),
            )?;
        }
        MonitoredStreamItem::Progress(progress) => {
            set(&result, "kind", "progress")?;
            set(
                &result,
                "previous",
                progress.previous.map(EventPosition::get),
            )?;
            set(
                &result,
                "latestKnown",
                progress.latest_known.map(EventPosition::get),
            )?;
            set(&result, "status", format!("{:?}", progress.status))?;
        }
    }
    Ok(result.into())
}

/// Cancellable event or snapshot-and-event stream.
#[wasm_bindgen]
pub struct SeaEventStream {
    /// Sole stream owner between reads.
    stream: RefCell<Option<SessionStream<JsValue, JsValue>>>,
    /// Wakes a pending read on explicit cancellation.
    pending: RefCell<Option<AbortHandle>>,
}

#[wasm_bindgen]
impl SeaEventStream {
    /// Reads one result; concurrent reads are rejected.
    pub async fn next(&self) -> Result<JsValue, JsValue> {
        let Some(mut stream) = self.stream.take() else {
            return if self.pending.borrow().is_some() {
                Err(invalid("stream is already being read"))
            } else {
                Ok(JsValue::UNDEFINED)
            };
        };
        let (abort, registration) = AbortHandle::new_pair();
        self.pending.replace(Some(abort));
        let result = Abortable::new(stream.next(), registration).await;
        self.pending.take();
        match result {
            Ok(Some(result)) => {
                self.stream.replace(Some(stream));
                result
            }
            Ok(None) | Err(_) => Ok(JsValue::UNDEFINED),
        }
    }

    /// Cancels a pending read and drops owned stream resources.
    pub fn cancel(&self) {
        if let Some(abort) = self.pending.take() {
            abort.abort();
        }
        self.stream.take();
    }
}

/// Cancellation-owned snapshot registration with explicit publisher fences.
#[wasm_bindgen]
pub struct SeaSnapshotStream {
    /// Underlying registration, whose drop revokes participation.
    stream: RefCell<Option<SessionStream<SnapshotCoordination, BindingError>>>,
    /// Wakes a pending coordination read on cancellation.
    pending: RefCell<Option<AbortHandle>>,
}

#[wasm_bindgen]
impl SeaSnapshotStream {
    /// Reads the current or next coalesced coordination state.
    pub async fn next(&self) -> Result<JsValue, JsValue> {
        let mut stream = self
            .stream
            .take()
            .ok_or_else(|| invalid("snapshot stream is closed or already being read"))?;
        let (abort, registration) = AbortHandle::new_pair();
        self.pending.replace(Some(abort));
        let result = Abortable::new(stream.next(), registration).await;
        self.pending.take();
        let state = result
            .map_err(|_| invalid("snapshot stream cancelled"))?
            .ok_or_else(|| invalid("snapshot stream ended"))?
            .map_err(|error| service_error(&error))?;
        self.stream.replace(Some(stream));
        let result = Object::new();
        set(&result, "latest", state.latest.map(EventPosition::get))?;
        set(&result, "fence", state.fence)?;
        Ok(result.into())
    }

    /// Cancels pending notification reads and revokes this registration.
    pub fn cancel(&self) {
        if let Some(abort) = self.pending.take() {
            abort.abort();
        }
        self.stream.take();
    }
}

/// Independent in-memory document namespace shared only through this service instance.
#[cfg(feature = "memory")]
#[wasm_bindgen]
pub struct SeaMemoryService {
    /// Signal rooms share document identity but do not access the sequencer.
    signals: RefCell<BTreeMap<Vec<u8>, std::sync::Arc<sea_signals::SignalRoom>>>,
    /// Storage retains documents independently of individual sessions.
    storage: sea_memory::MemoryStorage,
    /// One exclusive sequencer per document.
    runtimes: futures_util::lock::Mutex<
        BTreeMap<
            Vec<u8>,
            std::sync::Arc<sea_sequencer::session::LocalSequencer<sea_memory::MemoryStorage>>,
        >,
    >,
}

#[cfg(feature = "memory")]
#[wasm_bindgen]
impl SeaMemoryService {
    /// Creates an empty service with independent document storage.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            storage: sea_memory::MemoryStorage::new(),
            signals: RefCell::new(BTreeMap::new()),
            runtimes: futures_util::lock::Mutex::new(BTreeMap::new()),
        }
    }

    /// Creates a document when its identity is absent, or opens an existing document.
    pub async fn open(
        &self,
        document: Option<Vec<u8>>,
        options: &SeaSessionOptions,
    ) -> Result<SeaSession, JsValue> {
        use sea_core::storage::SeaStorage as _;
        check_options(options)?;
        let mut runtimes = self.runtimes.lock().await;
        let (document, sequencer) = if let Some(document) = document {
            let sequencer = runtimes
                .get(&document)
                .cloned()
                .ok_or_else(|| invalid("document does not exist in this memory service"))?;
            (document, sequencer)
        } else {
            let (document, view) = self
                .storage
                .create_view()
                .await
                .map_err(|error| service_error(&error))?;
            let sequencer = sea_sequencer::session::LocalSequencer::recover(view)
                .await
                .map_err(|error| service_error(&error))?;
            let document = document.as_bytes().to_vec();
            runtimes.insert(document.clone(), sequencer.clone());
            (document, sequencer)
        };
        drop(runtimes);
        let session = sequencer
            .open_session(options.reference)
            .await
            .map_err(|error| service_error(&error))?;
        let room = self
            .signals
            .borrow_mut()
            .entry(document.clone())
            .or_insert_with(|| {
                sea_signals::SignalRoom::new(sea_signals::SignalLimits::default())
                    .expect("default signal limits are valid")
            })
            .clone();
        let session_id = session.session_id().clone();
        SeaSession::from_stack(
            session,
            document,
            session_id,
            options.compression,
            Rc::new(crate::signals::FactoryAdapter(
                sea_signals::LocalSignalService::new(room),
            )),
        )
    }
}

#[cfg(feature = "memory")]
impl Default for SeaMemoryService {
    fn default() -> Self {
        Self::new()
    }
}

/// Opens a neutral session with explicit initial transport selection and no replay.
#[cfg(feature = "websocket-stream")]
#[wasm_bindgen(js_name = openRemote)]
pub async fn open_remote(
    mode: sea_webtransport::transport::browser_socket::SeaBrowserTransportMode,
    url: String,
    certificate_hash: js_sys::Uint8Array,
    websocket_url: String,
    timeout_milliseconds: u32,
    document: Option<Vec<u8>>,
    options: &SeaSessionOptions,
) -> Result<SeaSession, JsValue> {
    use sea_webtransport::{
        SessionClient, SessionOpen,
        protocol::{ArchiveIntent, Limits},
        transport::browser_socket::connect_browser_transport,
    };
    check_options(options)?;
    let transport = connect_browser_transport(
        mode,
        url,
        certificate_hash,
        websocket_url,
        4 * 1024 * 1024,
        timeout_milliseconds,
    )
    .await
    .map_err(|error| service_error(&sea_webtransport::SeaClientError::from(error)))?;
    let intent = if document.is_some() {
        ArchiveIntent::Open
    } else {
        ArchiveIntent::Create
    };
    let session = SessionClient::open(
        transport,
        Limits {
            max_frame_bytes: 4 * 1024 * 1024,
        },
        SessionOpen {
            archive: Bytes::from(document.unwrap_or_default()),
            intent,
            reference: options.reference,
        },
    )
    .await
    .map_err(|error| service_error(&error))?;
    let document = session.document().as_bytes().to_vec();
    let signals = Rc::new(crate::signals::FactoryAdapter(session.signal_service()));
    let session_id = session.session_id().clone();
    SeaSession::from_stack(session, document, session_id, options.compression, signals)
}

/// Opens a real browser WebTransport session without fallback, optionally wrapped in compression.
#[cfg(feature = "webtransport")]
#[wasm_bindgen(js_name = openWebTransport)]
pub async fn open_webtransport(
    url: &str,
    certificate_hash: &[u8],
    document: Option<Vec<u8>>,
    options: &SeaSessionOptions,
) -> Result<SeaSession, JsValue> {
    use sea_webtransport::{
        SessionClient, SessionOpen,
        protocol::{ArchiveIntent, Limits},
        transport::browser::BrowserTransport,
    };
    check_options(options)?;
    let transport = BrowserTransport::connect(url, certificate_hash)
        .await
        .map_err(|error| service_error(&sea_webtransport::SeaClientError::from(error)))?;
    let intent = if document.is_some() {
        ArchiveIntent::Open
    } else {
        ArchiveIntent::Create
    };
    let session = SessionClient::open(
        transport,
        Limits {
            max_frame_bytes: 4 * 1024 * 1024,
        },
        SessionOpen {
            archive: Bytes::from(document.unwrap_or_default()),
            intent,
            reference: options.reference,
        },
    )
    .await
    .map_err(|error| service_error(&error))?;
    let document = session.document().as_bytes().to_vec();
    let signals = Rc::new(crate::signals::FactoryAdapter(session.signal_service()));
    let session_id = session.session_id().clone();
    SeaSession::from_stack(session, document, session_id, options.compression, signals)
}
