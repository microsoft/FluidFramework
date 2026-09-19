//! Compatibility for Node and browsers lacking native streaming transports.
//!
//! Ordinary WebSocket cannot pause reception when the application stops reading.
//! Queue limits fail closed on overflow; they do not provide receive backpressure
//! or bound runtime/kernel buffering. Uploads are throttled using `bufferedAmount`.

use std::{
    cell::{Cell, RefCell},
    collections::VecDeque,
    rc::Rc,
};

use gloo_timers::future::TimeoutFuture;
use js_sys::Uint8Array;
use tokio::sync::Notify;
use wasm_bindgen::{JsCast as _, prelude::*};
use web_sys::{BinaryType, Event, MessageEvent, WebSocket};

use super::js_error;
use crate::websocket::{CHUNK_BYTES, SUBPROTOCOL};

/// Maximum adapter-owned receive bytes per logical socket, not a process bound.
const MAX_QUEUED_BYTES: usize = 4 * 1024 * 1024;
/// Also bounds overhead from very small or empty messages.
const MAX_QUEUED_MESSAGES: usize = 256;
/// At most two envelope-sized messages are admitted to the native send buffer.
const MAX_BUFFERED_SEND: u32 = 2 * (64 * 1024 + 1);

/// Event callbacks own only this state; dropping the adapter detaches callbacks.
struct State {
    /// Native event-based socket.
    socket: WebSocket,
    /// Received messages with their accounted sizes.
    queue: RefCell<VecDeque<(JsValue, usize)>>,
    /// Sum of queued message sizes.
    queued_bytes: Cell<usize>,
    /// Terminal failure takes priority over queued data.
    error: RefCell<Option<JsValue>>,
    /// Retained wakeups make reads cancellation-safe.
    changed: Notify,
}

impl State {
    /// Fails the stream instead of dropping or silently truncating application data.
    fn fail(&self, message: &str) {
        if self.error.borrow().is_none() {
            *self.error.borrow_mut() = Some(js_error(message));
            self.queue.borrow_mut().clear();
            self.queued_bytes.set(0);
            let _ = self.socket.close();
        }
        self.changed.notify_one();
    }

    /// Returns the terminal error without consuming it.
    fn check(&self) -> Result<(), JsValue> {
        self.error.borrow().clone().map_or(Ok(()), Err)
    }
}

/// Bounded compatibility adapter; intentionally not a streaming API polyfill.
pub(super) struct OrdinarySocket {
    /// Shared event and operation state.
    state: Rc<State>,
    /// Owned callback retained until detached during drop.
    _message: Closure<dyn FnMut(MessageEvent)>,
    /// Opening notification.
    _open: Closure<dyn FnMut(Event)>,
    /// Terminal native error notification.
    _error: Closure<dyn FnMut(Event)>,
    /// Terminal close notification.
    _close: Closure<dyn FnMut(Event)>,
}

impl OrdinarySocket {
    /// Opens using only the platform's built-in WebSocket, with no npm dependency.
    pub(super) async fn connect(url: &str) -> Result<Self, JsValue> {
        let socket = WebSocket::new_with_str(url, SUBPROTOCOL)?;
        socket.set_binary_type(BinaryType::Arraybuffer);
        let state = Rc::new(State {
            socket,
            queue: RefCell::default(),
            queued_bytes: Cell::new(0),
            error: RefCell::new(None),
            changed: Notify::new(),
        });
        let message_state = Rc::clone(&state);
        let message = Closure::new(move |event: MessageEvent| {
            let value = event.data();
            let size = if let Some(text) = value.as_string() {
                text.len()
            } else if value.is_instance_of::<js_sys::ArrayBuffer>() {
                Uint8Array::new(&value).length() as usize
            } else {
                message_state.fail("unsupported WebSocket message type");
                return;
            };
            if size > CHUNK_BYTES + 1
                || message_state.queue.borrow().len() >= MAX_QUEUED_MESSAGES
                || size > MAX_QUEUED_BYTES - message_state.queued_bytes.get()
            {
                message_state.fail("ordinary WebSocket receive queue exceeded its limit; receive backpressure is unavailable");
                return;
            }
            if message_state.error.borrow().is_none() {
                message_state
                    .queued_bytes
                    .set(message_state.queued_bytes.get() + size);
                message_state.queue.borrow_mut().push_back((value, size));
                message_state.changed.notify_one();
            }
        });
        let open_state = Rc::clone(&state);
        let open = Closure::new(move |_: Event| {
            open_state.changed.notify_one();
        });
        let error_state = Rc::clone(&state);
        let error = Closure::new(move |_: Event| {
            error_state.fail("ordinary WebSocket connection failed");
        });
        let close_state = Rc::clone(&state);
        let close = Closure::new(move |_: Event| {
            close_state.changed.notify_one();
        });
        state
            .socket
            .set_onmessage(Some(message.as_ref().unchecked_ref()));
        state.socket.set_onopen(Some(open.as_ref().unchecked_ref()));
        state
            .socket
            .set_onerror(Some(error.as_ref().unchecked_ref()));
        state
            .socket
            .set_onclose(Some(close.as_ref().unchecked_ref()));
        let connected = Self {
            state,
            _message: message,
            _open: open,
            _error: error,
            _close: close,
        };
        loop {
            connected.state.check()?;
            match connected.state.socket.ready_state() {
                WebSocket::OPEN => break,
                WebSocket::CONNECTING => connected.state.changed.notified().await,
                _ => return Err(js_error("WebSocket closed during establishment")),
            }
        }
        if connected.state.socket.protocol() != SUBPROTOCOL {
            return Err(js_error("server did not negotiate sea-stream-v1"));
        }
        Ok(connected)
    }

    /// Consumes one queued message; cancelling the waiter does not lose messages.
    pub(super) async fn read(&self) -> Result<JsValue, JsValue> {
        loop {
            self.state.check()?;
            if let Some((message, size)) = self.state.queue.borrow_mut().pop_front() {
                self.state
                    .queued_bytes
                    .set(self.state.queued_bytes.get() - size);
                return Ok(message);
            }
            if self.state.socket.ready_state() != WebSocket::OPEN {
                return Err(js_error("WebSocket closed without directional FIN"));
            }
            self.state.changed.notified().await;
        }
    }

    /// Throttles uploads; completion is not a remote application acknowledgement.
    pub(super) async fn write(&self, bytes: &Uint8Array) -> Result<(), JsValue> {
        loop {
            self.state.check()?;
            if self.state.socket.ready_state() != WebSocket::OPEN {
                return Err(js_error("WebSocket is closed"));
            }
            if self
                .state
                .socket
                .buffered_amount()
                .saturating_add(bytes.length())
                <= MAX_BUFFERED_SEND
            {
                break;
            }
            TimeoutFuture::new(5).await;
        }
        self.state.socket.send_with_js_u8_array(bytes)
    }

    /// Cancels pending reads and releases queued messages immediately.
    pub(super) fn close(&self) {
        self.state.fail("WebSocket stream cancelled");
    }
}

impl Drop for OrdinarySocket {
    fn drop(&mut self) {
        self.state.socket.set_onmessage(None);
        self.state.socket.set_onopen(None);
        self.state.socket.set_onerror(None);
        self.state.socket.set_onclose(None);
        self.close();
    }
}
