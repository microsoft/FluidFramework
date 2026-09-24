//! Test-only controls for browser connection attempts and shared stream ownership.
//!
//! Included by the browser lifecycle fixture, not exported by the production crate.

use futures_util::future::{AbortHandle, Abortable};
use js_sys::{Promise, Uint8Array};
use sea_webtransport::transport::{
    BidirectionalStream, ClientTransport,
    browser::{BrowserBidirectionalStream, BrowserTransport},
};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

/// Establishes strict WebTransport using the production selection deadline.
#[cfg(feature = "websocket-stream")]
#[wasm_bindgen(js_name = awaitSelectedConnect)]
pub async fn await_selected_connect(
    url: String,
    hash: Vec<u8>,
    timeout_milliseconds: u32,
) -> Result<LifecycleConnection, JsValue> {
    use sea_webtransport::transport::browser_socket::{
        SeaBrowserTransportMode, SelectedTransport, connect_browser_transport,
    };

    match connect_browser_transport(
        SeaBrowserTransportMode::WebTransport,
        url,
        Uint8Array::from(&hash[..]),
        String::new(),
        sea_webtransport::protocol::Limits::default().max_frame_bytes,
        timeout_milliseconds,
    )
    .await?
    {
        SelectedTransport::WebTransport(transport) => Ok(LifecycleConnection { transport }),
        SelectedTransport::WebSocket(_) => Err(JsValue::from_str(
            "strict selection unexpectedly used a socket",
        )),
    }
}

/// Owns a cancellable connection attempt and its observable completion.
#[wasm_bindgen]
pub struct LifecycleConnectAttempt {
    /// Dropping an in-flight owner cancels the Rust future.
    abort: AbortHandle,
    /// Retains success or failure independently of the attempt owner.
    result: Promise,
}

#[wasm_bindgen]
impl LifecycleConnectAttempt {
    /// Starts establishment without a logical Sea session or automatic retry.
    #[wasm_bindgen(constructor)]
    pub fn new(url: String, hash: Vec<u8>) -> Self {
        let (abort, registration) = AbortHandle::new_pair();
        let result = future_to_promise(async move {
            let transport = Abortable::new(BrowserTransport::connect(&url, &hash), registration)
                .await
                .map_err(|_| JsValue::from_str("connection attempt cancelled"))??;
            Ok(JsValue::from(LifecycleConnection { transport }))
        });
        Self { abort, result }
    }

    /// Returns the same completion promise for every observer.
    pub fn result(&self) -> Promise {
        self.result.clone()
    }

    /// Drops the in-flight connection future without replacing its transport.
    pub fn cancel(&self) {
        self.abort.abort();
    }
}

impl Drop for LifecycleConnectAttempt {
    fn drop(&mut self) {
        self.abort.abort();
    }
}

/// Owns an established transport with explicit byte-stream access.
#[wasm_bindgen]
pub struct LifecycleConnection {
    /// The actual production transport, including its datagram locks.
    transport: BrowserTransport,
}

#[wasm_bindgen]
impl LifecycleConnection {
    /// Opens a raw transport stream without logical protocol messages.
    #[wasm_bindgen(js_name = openStream)]
    pub async fn open_stream(&self) -> Result<LifecycleStream, JsValue> {
        Ok(LifecycleStream {
            stream: self.transport.open_bidirectional().await?,
        })
    }

    /// Closes the underlying connection while retaining the fixture owner.
    pub fn disconnect(&self) -> Result<(), JsValue> {
        self.transport.disconnect()
    }
}

/// Owns one clone of the production bidirectional-stream state.
#[wasm_bindgen]
pub struct LifecycleStream {
    /// Clones share directions and release them only after the last owner drops.
    stream: BrowserBidirectionalStream,
}

#[wasm_bindgen]
impl LifecycleStream {
    /// Adds another owner without creating or locking another stream.
    #[wasm_bindgen(js_name = cloneOwner)]
    pub fn clone_owner(&self) -> Self {
        Self {
            stream: self.stream.clone(),
        }
    }

    /// Finishes only the send direction.
    pub async fn finish(&mut self) -> Result<(), JsValue> {
        self.stream.finish().await
    }

    /// Receives bytes, or returns `undefined` after clean receive EOF.
    pub async fn receive(&mut self) -> Result<JsValue, JsValue> {
        self.stream.receive().await.map(|bytes| {
            bytes.map_or(JsValue::UNDEFINED, |bytes| {
                Uint8Array::from(&bytes[..]).into()
            })
        })
    }

    /// Cancels both directions without consuming this owner.
    pub async fn cancel(&mut self) -> Result<(), JsValue> {
        self.stream.cancel().await
    }
}
