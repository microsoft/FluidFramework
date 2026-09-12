#![doc = "Browser WebTransport adapter for unchanged FSP4 service frames."]
#![cfg(target_arch = "wasm32")]

use fluid_service_protocol::{Limits, Message, decode};
use js_sys::{Date, Reflect, Uint8Array};
use wasm_bindgen::{JsCast, prelude::*};
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    ReadableStream, ReadableStreamDefaultReader, WebTransport, WebTransportBidirectionalStream,
    WebTransportHash, WebTransportOptions, WritableStream,
};

#[wasm_bindgen]
pub struct BrowserClient {
    url: String,
    certificate_hash: Vec<u8>,
    transport: WebTransport,
    limits: Limits,
    wire_bytes: u64,
    peak_response_bytes: usize,
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
        let limits = Limits {
            max_frame_bytes,
            ..Limits::default()
        };
        if max_frame_bytes < fluid_service_protocol::HEADER_BYTES {
            return Err(js_error("max_frame_bytes is smaller than the FSP4 header"));
        }
        let transport = open_transport(&url, &certificate_hash).await?;
        Ok(Self {
            url,
            certificate_hash,
            transport,
            limits,
            wire_bytes: 0,
            peak_response_bytes: 0,
            last_reconnect_milliseconds: 0.0,
        })
    }

    pub fn disconnect(&self) {
        self.transport.close();
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
        let request_id = match decode(&outgoing, self.limits)
            .map_err(protocol_error)?
            .message
        {
            Message::Request(_) => {
                decode(&outgoing, self.limits)
                    .map_err(protocol_error)?
                    .request_id
            }
            Message::Response(_) => return Err(js_error("outgoing FSP4 frame is not a request")),
        };
        let stream = JsFuture::from(self.transport.create_bidirectional_stream())
            .await?
            .dyn_into::<WebTransportBidirectionalStream>()?;
        let writable: WritableStream = stream.writable().unchecked_into();
        let writer = writable.get_writer()?;
        let outgoing_array = Uint8Array::from(outgoing.as_slice());
        JsFuture::from(writer.write_with_chunk(outgoing_array.as_ref())).await?;
        JsFuture::from(writer.close()).await?;
        writer.release_lock();
        self.wire_bytes = self.wire_bytes.saturating_add(outgoing.len() as u64);

        let readable: ReadableStream = stream.readable().unchecked_into();
        let reader: ReadableStreamDefaultReader = readable.get_reader().unchecked_into();
        let incoming = read_bounded(&reader, self.limits.max_frame_bytes).await?;
        reader.release_lock();
        self.wire_bytes = self.wire_bytes.saturating_add(incoming.len() as u64);
        self.peak_response_bytes = self.peak_response_bytes.max(incoming.len());
        let response = decode(&incoming, self.limits).map_err(protocol_error)?;
        if response.request_id != request_id {
            return Err(js_error("FSP4 response request id did not match"));
        }
        if !matches!(response.message, Message::Response(_)) {
            return Err(js_error("incoming FSP4 frame is not a response"));
        }
        Ok(Uint8Array::from(incoming.as_slice()))
    }

    #[wasm_bindgen(getter, js_name = wireBytes)]
    #[must_use]
    pub fn wire_bytes(&self) -> u64 {
        self.wire_bytes
    }

    #[wasm_bindgen(getter, js_name = peakResponseBytes)]
    #[must_use]
    pub fn peak_response_bytes(&self) -> usize {
        self.peak_response_bytes
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

fn protocol_error(error: fluid_service_protocol::ProtocolError) -> JsValue {
    js_error(&format!("FSP4 frame validation failed: {error}"))
}

fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
