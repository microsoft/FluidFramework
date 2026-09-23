//! Optional browser socket mechanics; session bindings belong to `sea-wasm`.

#[path = "ordinary_websocket.rs"]
mod ordinary_websocket;
#[path = "websocket.rs"]
mod websocket;

pub use websocket::{
    SeaBrowserTransportMode, SeaWebSocketTransport, SelectedTransport, connect_browser_transport,
};

use js_sys::{Array, Function, Reflect};
use wasm_bindgen::{JsCast as _, JsValue};

/// Creates a JavaScript transport error.
fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}

/// Invokes a native streaming API method with its original receiver.
fn call_method(receiver: &JsValue, name: &str, arguments: &[JsValue]) -> Result<JsValue, JsValue> {
    let function = Reflect::get(receiver, &JsValue::from_str(name))?.dyn_into::<Function>()?;
    let values = Array::new();
    for argument in arguments {
        values.push(argument);
    }
    function.apply(receiver, &values)
}
