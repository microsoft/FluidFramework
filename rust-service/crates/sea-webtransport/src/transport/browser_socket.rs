//! Optional browser socket mechanics; session bindings belong to `sea-wasm`.

#[path = "ordinary_websocket.rs"]
mod ordinary_websocket;
#[path = "websocket.rs"]
mod websocket;

pub use websocket::{
    SeaBrowserTransportMode, SeaWebSocketTransport, SelectedTransport, connect_browser_transport,
};

use wasm_bindgen::JsValue;

/// Creates a JavaScript transport error.
fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
