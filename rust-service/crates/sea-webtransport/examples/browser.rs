#![doc = "Typed browser, injected, and in-process Sea session bindings."]
#![cfg(target_arch = "wasm32")]

#[path = "browser/sea.rs"]
mod sea;

#[path = "../src/protocol.rs"]
mod sea_protocol_v1;

pub use sea::*;

use js_sys::{Array, Function, Reflect, Uint8Array};
use wasm_bindgen::{JsCast as _, prelude::*};
use wasm_bindgen_futures::JsFuture;
use web_sys::{ReadableStreamDefaultReader, WebTransport, WebTransportHash, WebTransportOptions};

#[wasm_bindgen(typescript_custom_section)]
const TYPESCRIPT_TRANSPORT: &str = r#"
/** Supplies complete Sea request and response frames to `SeaInjectedClient`. */
export interface AsyncRequestTransport {
    request(frame: Uint8Array): Promise<Uint8Array>;
    subscribe(frame: Uint8Array): AsyncSubscriptionTransport | Promise<AsyncSubscriptionTransport>;
    disconnect?(): void;
}

/** Supplies complete Sea response frames in stream order. */
export interface AsyncSubscriptionTransport {
    next(): Promise<Uint8Array | undefined>;
    cancel(): void | Promise<void>;
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "AsyncRequestTransport")]
    pub type AsyncRequestTransport;
}

pub(crate) fn call_method(
    target: &JsValue,
    name: &str,
    arguments: &[JsValue],
) -> Result<JsValue, JsValue> {
    let method = Reflect::get(target, &JsValue::from_str(name))?;
    if method.is_null() || method.is_undefined() {
        return Err(js_error(&format!("transport does not implement {name}")));
    }
    let function = method
        .dyn_into::<Function>()
        .map_err(|_| js_error(&format!("transport member {name} is not callable")))?;
    function.apply(target, &Array::from_iter(arguments.iter()))
}

pub(crate) async fn open_transport(
    url: &str,
    certificate_hash: &[u8],
) -> Result<WebTransport, JsValue> {
    if certificate_hash.len() != 32 {
        return Err(js_error("certificate hash must contain exactly 32 bytes"));
    }
    let hash = WebTransportHash::new();
    hash.set_algorithm("sha-256");
    hash.set_value_u8_array(&Uint8Array::from(certificate_hash));
    let options = WebTransportOptions::new();
    options.set_server_certificate_hashes(&[hash]);
    let transport = WebTransport::new_with_options(url, &options)?;
    JsFuture::from(transport.ready()).await?;
    Ok(transport)
}

pub(crate) async fn read_bounded(
    reader: &ReadableStreamDefaultReader,
    max_frame_bytes: usize,
) -> Result<Vec<u8>, JsValue> {
    let mut bytes = Vec::new();
    loop {
        let result = JsFuture::from(reader.read()).await?;
        let done = Reflect::get(&result, &JsValue::from_str("done"))?
            .as_bool()
            .ok_or_else(|| js_error("browser stream returned an invalid done flag"))?;
        if done {
            return Ok(bytes);
        }
        let value = Reflect::get(&result, &JsValue::from_str("value"))?;
        let chunk = Uint8Array::new(&value);
        let next_length = bytes
            .len()
            .checked_add(chunk.length() as usize)
            .ok_or_else(|| js_error("browser response length overflow"))?;
        if next_length > max_frame_bytes {
            JsFuture::from(reader.cancel()).await?;
            return Err(js_error(
                "browser response exceeded its configured frame limit",
            ));
        }
        bytes.resize(next_length, 0);
        chunk.copy_to(&mut bytes[next_length - chunk.length() as usize..]);
    }
}

pub(crate) fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
