//! Native streaming and ordinary WebSocket adapters with explicit establishment policy.

use std::{
    cell::{Cell, RefCell},
    future::Future,
    rc::{Rc, Weak},
};

use futures_util::future::{Either, select};
use gloo_timers::future::TimeoutFuture;
use js_sys::{Array, Function, Object, Promise, Reflect, Uint8Array};
use wasm_bindgen::{JsCast as _, prelude::*};
use wasm_bindgen_futures::{JsFuture, spawn_local};

use super::{SeaBrowserTransport, call_method, js_error, ordinary_websocket::OrdinarySocket};
use crate::{
    protocol,
    websocket::{self, CHUNK_BYTES, DATA, FIN, Record, SUBPROTOCOL},
};

/// Transport selection, applied only before any Sea operation is issued.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SeaBrowserTransportMode {
    /// Require pinned native WebTransport; do not attempt a fallback.
    WebTransport,
    /// Require native `WebSocketStream` using the separately configured endpoint.
    WebSocketStream,
    /// Attempt WebTransport, then `WebSocketStream` on establishment failure or timeout.
    PreferWebTransport,
    /// Require ordinary WebSocket for compatibility, without receive backpressure.
    WebSocket,
    /// Permit WebTransport, native streaming sockets, then ordinary WebSocket.
    /// The last choice sacrifices receive backpressure for Node/Firefox compatibility.
    PreferAvailable,
}

/// Connects one raw transport for `SeaInjectedClient`, without replaying Sea operations.
///
/// The caller explicitly trusts both endpoints when selecting fallback. A WebTransport
/// certificate pin does not authenticate a TLS-terminating WebSocket proxy.
/// Each attempt has its own timeout. `PreferAvailable` permits up to three attempts
/// and explicitly accepts the ordinary socket's lack of receive backpressure.
///
/// # Errors
/// Rejects invalid configuration, unavailable native APIs, or failed establishment.
#[wasm_bindgen(js_name = connectSeaBrowserTransport)]
pub async fn connect_browser_transport(
    mode: SeaBrowserTransportMode,
    webtransport_url: String,
    certificate_hash: Uint8Array,
    websocket_url: String,
    max_frame_bytes: usize,
    timeout_milliseconds: u32,
) -> Result<JsValue, JsValue> {
    if timeout_milliseconds == 0 || max_frame_bytes < protocol::MIN_FRAME_BYTES {
        return Err(js_error("invalid transport limits"));
    }
    let try_webtransport = matches!(
        mode,
        SeaBrowserTransportMode::WebTransport
            | SeaBrowserTransportMode::PreferWebTransport
            | SeaBrowserTransportMode::PreferAvailable
    );
    if try_webtransport && certificate_hash.length() != 32 {
        return Err(js_error("certificate hash must contain exactly 32 bytes"));
    }
    if mode != SeaBrowserTransportMode::WebTransport {
        validate_url(&websocket_url)?;
    }
    if try_webtransport {
        match deadline(
            SeaBrowserTransport::connect(webtransport_url, certificate_hash, max_frame_bytes),
            timeout_milliseconds,
        )
        .await
        {
            Ok(transport) => return Ok(transport.into()),
            Err(error) if mode == SeaBrowserTransportMode::WebTransport => return Err(error),
            Err(_) => {}
        }
    }
    if mode != SeaBrowserTransportMode::WebSocket {
        match SeaWebSocketTransport::connect(websocket_url.clone(), timeout_milliseconds).await {
            Ok(transport) => return Ok(transport.into()),
            Err(error) if mode != SeaBrowserTransportMode::PreferAvailable => return Err(error),
            Err(_) => {}
        }
    }
    Ok(
        SeaWebSocketTransport::connect_ordinary(websocket_url, timeout_milliseconds)
            .await?
            .into(),
    )
}

/// Validates the independently trusted WebSocket endpoint without changing its path.
fn validate_url(url: &str) -> Result<(), JsValue> {
    let parsed = web_sys::Url::new(url)?;
    let loopback = matches!(
        parsed.hostname().as_str(),
        "localhost" | "127.0.0.1" | "[::1]"
    );
    if !(parsed.protocol() == "wss:" || (parsed.protocol() == "ws:" && loopback))
        || !parsed.username().is_empty()
        || !parsed.password().is_empty()
        || !parsed.search().is_empty()
        || !parsed.hash().is_empty()
        || parsed.pathname().trim_end_matches('/') != websocket::PATH
    {
        return Err(js_error(
            "expected wss endpoint at /sea/websocket (ws allowed only on loopback)",
        ));
    }
    Ok(())
}

/// Bounds establishment and drops the losing future so owned sockets are closed.
async fn deadline<Value>(
    future: impl Future<Output = Result<Value, JsValue>>,
    milliseconds: u32,
) -> Result<Value, JsValue> {
    match select(Box::pin(future), Box::pin(TimeoutFuture::new(milliseconds))).await {
        Either::Left((result, _)) => result,
        Either::Right(_) => Err(js_error("transport establishment timed out")),
    }
}

/// Native socket plus cancellation-safe reader ownership.
struct Socket {
    /// Explicit compatibility backend, never silently used by strict modes.
    ordinary: Option<OrdinarySocket>,
    /// Native `WebSocketStream` object, never the traditional WebSocket API.
    object: JsValue,
    /// Explicitly aborts a handshake when its deadline or owning future ends.
    abort: web_sys::AbortController,
    /// Reader supplied when the handshake completes.
    reader: RefCell<JsValue>,
    /// Writer supplied when the handshake completes.
    writer: RefCell<JsValue>,
    /// Retained pending read across cancelled Rust futures.
    pending: RefCell<Option<Promise>>,
    /// Local close already requested.
    closed: Cell<bool>,
}

impl Socket {
    /// Constructs a native socket and closes it if establishment is abandoned.
    async fn connect(url: &str, ordinary: bool) -> Result<Rc<Self>, JsValue> {
        if ordinary {
            return Ok(Rc::new(Self {
                ordinary: Some(OrdinarySocket::connect(url).await?),
                object: JsValue::UNDEFINED,
                abort: web_sys::AbortController::new()?,
                reader: RefCell::new(JsValue::UNDEFINED),
                writer: RefCell::new(JsValue::UNDEFINED),
                pending: RefCell::new(None),
                closed: Cell::new(false),
            }));
        }
        let constructor = Reflect::get(&js_sys::global(), &JsValue::from_str("WebSocketStream"))?
            .dyn_into::<Function>()
            .map_err(|_| js_error("native WebSocketStream is unavailable"))?;
        let options = Object::new();
        let abort = web_sys::AbortController::new()?;
        Reflect::set(&options, &JsValue::from_str("signal"), &abort.signal())?;
        let protocols = Array::new();
        protocols.push(&JsValue::from_str(SUBPROTOCOL));
        Reflect::set(&options, &JsValue::from_str("protocols"), &protocols)?;
        let arguments = Array::new();
        arguments.push(&JsValue::from_str(url));
        arguments.push(&options);
        let socket = Rc::new(Self {
            ordinary: None,
            object: Reflect::construct(&constructor, &arguments)?,
            abort,
            reader: RefCell::new(JsValue::UNDEFINED),
            writer: RefCell::new(JsValue::UNDEFINED),
            pending: RefCell::new(None),
            closed: Cell::new(false),
        });
        let closed = Reflect::get(&socket.object, &JsValue::from_str("closed"))?;
        spawn_local(async move {
            let _ = JsFuture::from(Promise::resolve(&closed)).await;
        });
        let opened = JsFuture::from(Promise::resolve(&Reflect::get(
            &socket.object,
            &JsValue::from_str("opened"),
        )?))
        .await?;
        if Reflect::get(&opened, &JsValue::from_str("protocol"))?
            .as_string()
            .as_deref()
            != Some(SUBPROTOCOL)
        {
            return Err(js_error("server did not negotiate sea-stream-v1"));
        }
        *socket.reader.borrow_mut() = call_method(
            &Reflect::get(&opened, &JsValue::from_str("readable"))?,
            "getReader",
            &[],
        )?;
        *socket.writer.borrow_mut() = call_method(
            &Reflect::get(&opened, &JsValue::from_str("writable"))?,
            "getWriter",
            &[],
        )?;
        Ok(socket)
    }

    /// Reads one complete message without losing a pending read on cancellation.
    async fn read(&self) -> Result<JsValue, JsValue> {
        if let Some(socket) = &self.ordinary {
            return socket.read().await;
        }
        if self.closed.get() {
            return Err(js_error("WebSocket stream is closed"));
        }
        if self.pending.borrow().is_none() {
            let pending = call_method(&self.reader.borrow(), "read", &[])?;
            *self.pending.borrow_mut() = Some(Promise::resolve(&pending));
        }
        let pending = self
            .pending
            .borrow()
            .as_ref()
            .cloned()
            .ok_or_else(|| js_error("missing pending read"))?;
        let result = JsFuture::from(pending).await;
        self.pending.borrow_mut().take();
        let result = result?;
        if Reflect::get(&result, &JsValue::from_str("done"))?.as_bool() != Some(false) {
            return Err(js_error("WebSocket closed without directional FIN"));
        }
        Reflect::get(&result, &JsValue::from_str("value"))
    }

    /// Awaits streaming backpressure or ordinary-socket upload buffer capacity.
    async fn write(&self, bytes: &Uint8Array) -> Result<(), JsValue> {
        if let Some(socket) = &self.ordinary {
            return socket.write(bytes).await;
        }
        if self.closed.get() {
            return Err(js_error("WebSocket stream is closed"));
        }
        let writing = call_method(&self.writer.borrow(), "write", &[bytes.clone().into()])?;
        JsFuture::from(Promise::resolve(&writing)).await?;
        Ok(())
    }

    /// Requests an idempotent close, also aborting an unfinished handshake.
    fn close(&self) {
        if let Some(socket) = &self.ordinary {
            socket.close();
            return;
        }
        if !self.closed.replace(true) {
            self.abort.abort();
            let _ = call_method(&self.object, "close", &[]);
        }
    }
}

impl Drop for Socket {
    fn drop(&mut self) {
        self.close();
    }
}

/// Browser-owned control connection and weakly tracked child sockets.
struct Group {
    /// Owning control connection; loss closes every child stream.
    control: Rc<Socket>,
    /// Child endpoint including the server-issued opaque association token.
    child_url: String,
    /// Child sockets without a cycle back to the transport owner.
    children: RefCell<Vec<Weak<Socket>>>,
    /// Disconnection is terminal; this adapter never reconnects or replays operations.
    closed: Cell<bool>,
    /// Deadline for each child upgrade.
    timeout_milliseconds: u32,
}

impl Group {
    /// Cancels the entire logical connection exactly once.
    fn close(&self) {
        if !self.closed.replace(true) {
            self.control.close();
            for child in self.children.borrow().iter().filter_map(Weak::upgrade) {
                child.close();
            }
        }
    }
}

impl Drop for Group {
    fn drop(&mut self) {
        self.close();
    }
}

/// Feature-gated WebSocket transport for `SeaInjectedClient`.
/// Native `WebSocketStream` is the default; ordinary sockets require explicit opt-in.
#[wasm_bindgen]
pub struct SeaWebSocketTransport {
    /// Connection group shared with streams while they remain owned.
    group: Rc<Group>,
}

#[wasm_bindgen]
impl SeaWebSocketTransport {
    /// Establishes a connection group without issuing any Sea operation.
    ///
    /// # Errors
    /// Rejects invalid URLs, unavailable native API, and handshake failures.
    pub async fn connect(url: String, timeout_milliseconds: u32) -> Result<Self, JsValue> {
        Self::connect_backend(url, timeout_milliseconds, false).await
    }

    /// Connects without receive backpressure for Node and non-streaming browsers.
    /// The per-socket receive queue holds at most 4 MiB and 256 messages.
    /// Queue overflow fails the stream rather than losing SEA data.
    /// These limits do not bound runtime, kernel, or proxy buffering.
    /// Uploads use `bufferedAmount` throttling, not remote consumption acknowledgements.
    ///
    /// # Errors
    /// Rejects invalid configuration and failed establishment.
    #[wasm_bindgen(js_name = connectOrdinary)]
    pub async fn connect_ordinary(url: String, timeout_milliseconds: u32) -> Result<Self, JsValue> {
        Self::connect_backend(url, timeout_milliseconds, true).await
    }

    /// Whether the selected API propagates receive demand to the transport.
    /// Runtime implementations must still honor their streaming API contract.
    #[wasm_bindgen(getter, js_name = supportsReceiveBackpressure)]
    #[must_use]
    pub fn supports_receive_backpressure(&self) -> bool {
        self.group.control.ordinary.is_none()
    }
}

impl SeaWebSocketTransport {
    /// Establishes the shared group protocol using one fixed socket backend.
    async fn connect_backend(
        url: String,
        timeout_milliseconds: u32,
        ordinary: bool,
    ) -> Result<Self, JsValue> {
        validate_url(&url)?;
        if timeout_milliseconds == 0 {
            return Err(js_error("timeout must be positive"));
        }
        deadline(
            async {
                let control = Socket::connect(url.trim_end_matches('/'), ordinary).await?;
                let token = control
                    .read()
                    .await?
                    .as_string()
                    .ok_or_else(|| js_error("invalid WebSocket group token"))?;
                if token.len() != 64 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                    return Err(js_error("invalid WebSocket group token"));
                }
                let group = Rc::new(Group {
                    control: Rc::clone(&control),
                    child_url: format!("{}/{token}", url.trim_end_matches('/')),
                    children: RefCell::default(),
                    closed: Cell::new(false),
                    timeout_milliseconds,
                });
                let weak = Rc::downgrade(&group);
                spawn_local(async move {
                    let _ = control.read().await;
                    if let Some(group) = weak.upgrade() {
                        group.close();
                    }
                });
                Ok(Self { group })
            },
            timeout_milliseconds,
        )
        .await
    }
}

#[wasm_bindgen]
impl SeaWebSocketTransport {
    /// Opens an independent socket using the group's already selected backend.
    ///
    /// # Errors
    /// Rejects closed groups and failed or timed-out child upgrades.
    #[wasm_bindgen(js_name = openBidirectional)]
    pub async fn open_bidirectional(&self) -> Result<SeaWebSocketBidirectionalStream, JsValue> {
        if self.group.closed.get() {
            return Err(js_error("WebSocket transport is disconnected"));
        }
        let socket = deadline(
            Socket::connect(&self.group.child_url, self.group.control.ordinary.is_some()),
            self.group.timeout_milliseconds,
        )
        .await?;
        if self.group.closed.get() {
            return Err(js_error("WebSocket transport is disconnected"));
        }
        let mut children = self.group.children.borrow_mut();
        children.retain(|child| child.strong_count() != 0);
        children.push(Rc::downgrade(&socket));
        Ok(SeaWebSocketBidirectionalStream {
            socket,
            _group: Rc::clone(&self.group),
            finished: Cell::new(false),
            ended: Cell::new(false),
            sending: Cell::new(false),
            receiving: Cell::new(false),
        })
    }

    /// Closes the control socket and cancels every owned stream without replay.
    pub fn disconnect(&self) {
        self.group.close();
    }
}

/// One native WebSocket adapted to bidirectional bytes and directional EOF.
#[wasm_bindgen]
pub struct SeaWebSocketBidirectionalStream {
    /// Native socket owned by this logical stream.
    socket: Rc<Socket>,
    /// Keeps the connection group alive while the stream is owned.
    _group: Rc<Group>,
    /// Whether local FIN has been sent.
    finished: Cell<bool>,
    /// Whether remote FIN has been consumed.
    ended: Cell<bool>,
    /// Prevents concurrent writers from bypassing upload flow control.
    sending: Cell<bool>,
    /// Prevents concurrent readers from sharing a pending read result.
    receiving: Cell<bool>,
}

/// Releases an operation guard when an async call completes or is cancelled.
struct Busy<'state>(&'state Cell<bool>);

impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.set(false);
    }
}

#[wasm_bindgen]
impl SeaWebSocketBidirectionalStream {
    /// Sends bounded records, awaiting streaming backpressure or upload buffer capacity.
    ///
    /// # Errors
    /// Rejects writes after FIN, concurrent sends, or transport failure.
    pub async fn send(&self, bytes: Uint8Array) -> Result<(), JsValue> {
        if self.finished.get() || self.sending.replace(true) {
            return Err(js_error("stream cannot accept another send"));
        }
        let _busy = Busy(&self.sending);
        let mut offset = 0;
        while offset < bytes.length() {
            let end = offset
                .saturating_add(
                    u32::try_from(CHUNK_BYTES).map_err(|_| js_error("invalid chunk limit"))?,
                )
                .min(bytes.length());
            let record = Uint8Array::new_with_length(end - offset + 1);
            record.set_index(0, DATA);
            record.set(&bytes.subarray(offset, end), 1);
            self.socket.write(&record).await?;
            offset = end;
        }
        Ok(())
    }

    /// Sends directional EOF while retaining the receive side.
    ///
    /// # Errors
    /// Rejects concurrent sends or transport failure.
    pub async fn finish(&self) -> Result<(), JsValue> {
        if self.finished.get() {
            return Ok(());
        }
        if self.sending.replace(true) {
            return Err(js_error("send is already in progress"));
        }
        let _busy = Busy(&self.sending);
        self.socket.write(&Uint8Array::from(&[FIN][..])).await?;
        self.finished.set(true);
        Ok(())
    }

    /// Receives a bounded byte chunk, or clean directional EOF.
    ///
    /// # Errors
    /// Rejects malformed records, concurrent reads, and closure before FIN.
    pub async fn receive(&self) -> Result<Option<Uint8Array>, JsValue> {
        if self.ended.get() {
            return Ok(None);
        }
        if self.receiving.replace(true) {
            return Err(js_error("receive is already in progress"));
        }
        let _busy = Busy(&self.receiving);
        let value = self.socket.read().await?;
        let bytes = if value.is_instance_of::<js_sys::ArrayBuffer>() {
            Uint8Array::new(&value)
        } else {
            value
                .dyn_into::<Uint8Array>()
                .map_err(|_| js_error("expected a binary WebSocket message"))?
        };
        if bytes.length() as usize > CHUNK_BYTES + 1 {
            self.socket.close();
            return Err(js_error("oversized WebSocket record"));
        }
        match websocket::decode(&bytes.to_vec()) {
            Some(Record::Data(_)) => Ok(Some(bytes.subarray(1, bytes.length()))),
            Some(Record::Finish) => {
                self.ended.set(true);
                Ok(None)
            }
            None => {
                self.socket.close();
                Err(js_error("invalid WebSocket record"))
            }
        }
    }

    /// Cancels both directions without reporting a clean EOF.
    pub fn cancel(&self) {
        self.socket.close();
    }
}

impl Drop for SeaWebSocketBidirectionalStream {
    fn drop(&mut self) {
        self.socket.close();
    }
}
