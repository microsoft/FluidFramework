#![doc = "Browser WebTransport adapter for unchanged FSP4 service frames."]
#![cfg(target_arch = "wasm32")]

mod core;

use std::{cell::RefCell, rc::Rc};

use core::{ProtocolCore, js_error};
use js_sys::{Date, Function, Promise, Reflect, Uint8Array};
use wasm_bindgen::{JsCast, prelude::*};
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    ReadableStream, ReadableStreamDefaultReader, WebTransport, WebTransportBidirectionalStream,
    WebTransportHash, WebTransportOptions, WritableStream,
};

#[wasm_bindgen(typescript_custom_section)]
const TYPESCRIPT_TRANSPORT: &str = r#"
export interface AsyncRequestTransport {
    request(frame: Uint8Array): Promise<Uint8Array>;
    cancel?(): void;
    disconnect?(): void;
    shutdown?(): void;
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "AsyncRequestTransport")]
    pub type AsyncRequestTransport;
}

/// Environment-neutral FSP4 client using a caller-provided asynchronous request transport.
#[wasm_bindgen]
pub struct InjectedClient {
    transport: Rc<RefCell<JsValue>>,
    core: Rc<RefCell<ProtocolCore>>,
}

#[wasm_bindgen]
impl InjectedClient {
    /// Creates a connected client with a one-request bounded queue.
    ///
    /// # Errors
    ///
    /// Rejects invalid limits or transports without a request method.
    #[wasm_bindgen(constructor)]
    pub fn new(
        transport: AsyncRequestTransport,
        max_frame_bytes: usize,
    ) -> Result<InjectedClient, JsValue> {
        let transport: JsValue = transport.into();
        required_method(&transport, "request")?;
        Ok(Self {
            transport: Rc::new(RefCell::new(transport)),
            core: Rc::new(RefCell::new(ProtocolCore::new(max_frame_bytes)?)),
        })
    }

    /// Sends one validated FSP4 request through the injected transport.
    ///
    /// # Errors
    ///
    /// Rejects invalid frames, concurrent requests, transport failures, and invalid responses.
    pub async fn request(&self, frame_bytes: Uint8Array) -> Result<Uint8Array, JsValue> {
        let outgoing = frame_bytes.to_vec();
        let (request_id, operation) = self.core.borrow_mut().begin_request(&outgoing)?;
        let requested = call_method(
            &self.transport.borrow(),
            "request",
            &[Uint8Array::from(outgoing.as_slice()).into()],
        );
        let requested = match requested {
            Ok(value) => value,
            Err(error) => {
                self.core.borrow_mut().transport_failed(operation);
                return Err(error);
            }
        };
        let incoming = match JsFuture::from(Promise::resolve(&requested)).await {
            Ok(value) => value,
            Err(error) => {
                self.core.borrow_mut().transport_failed(operation);
                return Err(error);
            }
        };
        if !incoming.is_instance_of::<Uint8Array>() {
            self.core.borrow_mut().transport_failed(operation);
            return Err(js_error("transport response is not a Uint8Array"));
        }
        let incoming = Uint8Array::new(&incoming).to_vec();
        self.core
            .borrow_mut()
            .finish_response(operation, request_id, &incoming)?;
        Ok(Uint8Array::from(incoming.as_slice()))
    }

    /// Cancels the active operation and invokes the optional transport cancellation hook.
    ///
    /// # Errors
    ///
    /// Propagates a synchronous transport cancellation failure.
    pub fn cancel(&self) -> Result<(), JsValue> {
        self.core.borrow_mut().cancel();
        call_optional_method(&self.transport.borrow(), "cancel")
    }

    /// Disconnects without retrying and invokes the optional transport disconnect hook.
    ///
    /// # Errors
    ///
    /// Propagates a synchronous transport disconnect failure.
    pub fn disconnect(&self) -> Result<(), JsValue> {
        self.core.borrow_mut().disconnect();
        call_optional_method(&self.transport.borrow(), "disconnect")
    }

    /// Replaces the request transport after an explicit disconnect.
    ///
    /// # Errors
    ///
    /// Rejects a missing request method or an attempt to reopen a closed client.
    pub fn reconnect(&self, transport: AsyncRequestTransport) -> Result<(), JsValue> {
        let transport: JsValue = transport.into();
        required_method(&transport, "request")?;
        self.core.borrow_mut().reconnect()?;
        self.transport.replace(transport);
        Ok(())
    }

    /// Permanently closes the client and invokes the optional transport shutdown hook.
    ///
    /// # Errors
    ///
    /// Propagates a synchronous transport shutdown failure.
    pub fn shutdown(&self) -> Result<(), JsValue> {
        self.core.borrow_mut().shutdown();
        call_optional_method(&self.transport.borrow(), "shutdown")
    }

    #[wasm_bindgen(getter)]
    #[must_use]
    pub fn state(&self) -> String {
        self.core.borrow().state().to_owned()
    }

    #[wasm_bindgen(getter, js_name = wireBytes)]
    #[must_use]
    pub fn wire_bytes(&self) -> u64 {
        self.core.borrow().wire_bytes()
    }

    #[wasm_bindgen(getter, js_name = peakResponseBytes)]
    #[must_use]
    pub fn peak_response_bytes(&self) -> usize {
        self.core.borrow().peak_response_bytes()
    }
}

#[wasm_bindgen]
pub struct BrowserClient {
    url: String,
    certificate_hash: Vec<u8>,
    transport: WebTransport,
    core: ProtocolCore,
    last_reconnect_milliseconds: f64,
}

#[wasm_bindgen]
impl BrowserClient {
    /// Connects a browser WebTransport session using one SHA-256 certificate pin.
    ///
    /// # Errors
    ///
    /// Rejects invalid limits or hashes and propagates browser connection failures.
    #[wasm_bindgen(js_name = connect)]
    pub async fn connect(
        url: String,
        certificate_hash: Uint8Array,
        max_frame_bytes: usize,
    ) -> Result<BrowserClient, JsValue> {
        let certificate_hash = certificate_hash.to_vec();
        validate_hash(&certificate_hash)?;
        let core = ProtocolCore::new(max_frame_bytes)?;
        let transport = open_transport(&url, &certificate_hash).await?;
        Ok(Self {
            url,
            certificate_hash,
            transport,
            core,
            last_reconnect_milliseconds: 0.0,
        })
    }

    pub fn disconnect(&mut self) {
        self.transport.close();
        self.core.disconnect();
    }

    /// Replaces the current browser session with an explicit new connection.
    ///
    /// # Errors
    ///
    /// Propagates browser connection and certificate validation failures.
    pub async fn reconnect(&mut self) -> Result<(), JsValue> {
        let started = Date::now();
        let transport = open_transport(&self.url, &self.certificate_hash).await?;
        self.transport = transport;
        self.core.reconnect()?;
        self.last_reconnect_milliseconds = Date::now() - started;
        Ok(())
    }

    /// Sends one validated FSP4 request on a fresh reliable bidirectional stream.
    ///
    /// # Errors
    ///
    /// Rejects malformed or oversized frames and propagates browser stream failures.
    pub async fn request(&mut self, frame_bytes: Uint8Array) -> Result<Uint8Array, JsValue> {
        let outgoing = frame_bytes.to_vec();
        let (request_id, operation) = self.core.begin_request(&outgoing)?;
        let incoming = match self.request_transport(&outgoing).await {
            Ok(incoming) => incoming,
            Err(error) => {
                self.core.transport_failed(operation);
                return Err(error);
            }
        };
        self.core
            .finish_response(operation, request_id, &incoming)?;
        Ok(Uint8Array::from(incoming.as_slice()))
    }

    async fn request_transport(&self, outgoing: &[u8]) -> Result<Vec<u8>, JsValue> {
        let stream = JsFuture::from(self.transport.create_bidirectional_stream())
            .await?
            .dyn_into::<WebTransportBidirectionalStream>()?;
        let writable: WritableStream = stream.writable().unchecked_into();
        let writer = writable.get_writer()?;
        let outgoing_array = Uint8Array::from(outgoing);
        JsFuture::from(writer.write_with_chunk(outgoing_array.as_ref())).await?;
        JsFuture::from(writer.close()).await?;
        writer.release_lock();

        let readable: ReadableStream = stream.readable().unchecked_into();
        let reader: ReadableStreamDefaultReader = readable.get_reader().unchecked_into();
        let incoming = read_bounded(&reader, self.core.max_frame_bytes()).await?;
        reader.release_lock();
        Ok(incoming)
    }

    #[wasm_bindgen(getter, js_name = wireBytes)]
    #[must_use]
    pub fn wire_bytes(&self) -> u64 {
        self.core.wire_bytes()
    }

    #[wasm_bindgen(getter, js_name = peakResponseBytes)]
    #[must_use]
    pub fn peak_response_bytes(&self) -> usize {
        self.core.peak_response_bytes()
    }

    #[wasm_bindgen(getter, js_name = lastReconnectMilliseconds)]
    #[must_use]
    pub fn last_reconnect_milliseconds(&self) -> f64 {
        self.last_reconnect_milliseconds
    }
}

async fn open_transport(url: &str, certificate_hash: &[u8]) -> Result<WebTransport, JsValue> {
    let hash = WebTransportHash::new();
    hash.set_algorithm("sha-256");
    hash.set_value_u8_array(&Uint8Array::from(certificate_hash));
    let options = WebTransportOptions::new();
    options.set_server_certificate_hashes(&[hash]);
    let transport = WebTransport::new_with_options(url, &options)?;
    JsFuture::from(transport.ready()).await?;
    Ok(transport)
}

async fn read_bounded(
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
            .ok_or_else(|| js_error("browser response exceeded the configured frame limit"))?;
        if next_length > max_frame_bytes {
            JsFuture::from(reader.cancel()).await?;
            return Err(js_error(
                "browser response exceeded the configured frame limit",
            ));
        }
        bytes.resize(next_length, 0);
        chunk.copy_to(&mut bytes[next_length - chunk.length() as usize..]);
    }
}

fn validate_hash(hash: &[u8]) -> Result<(), JsValue> {
    if hash.len() == 32 {
        Ok(())
    } else {
        Err(js_error("certificate hash must contain exactly 32 bytes"))
    }
}

fn required_method(target: &JsValue, name: &str) -> Result<Function, JsValue> {
    Reflect::get(target, &JsValue::from_str(name))?
        .dyn_into::<Function>()
        .map_err(|_| js_error(&format!("transport must provide a {name} method")))
}

fn call_method(target: &JsValue, name: &str, arguments: &[JsValue]) -> Result<JsValue, JsValue> {
    let method = required_method(target, name)?;
    match arguments {
        [] => method.call0(target),
        [argument] => method.call1(target, argument),
        _ => Err(js_error("transport method received unsupported arguments")),
    }
}

fn call_optional_method(target: &JsValue, name: &str) -> Result<(), JsValue> {
    let method = Reflect::get(target, &JsValue::from_str(name))?;
    if method.is_null() || method.is_undefined() {
        return Ok(());
    }
    method
        .dyn_into::<Function>()
        .map_err(|_| js_error(&format!("transport {name} member is not a function")))?
        .call0(target)?;
    Ok(())
}
