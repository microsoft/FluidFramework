//! Browser WebTransport connection and bidirectional-stream primitives.

use async_trait::async_trait;
use js_sys::{Reflect, Uint8Array};
use wasm_bindgen::{JsCast as _, JsValue};
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    ReadableStream, ReadableStreamDefaultReader, WebTransport, WebTransportBidirectionalStream,
    WebTransportHash, WebTransportOptions, WritableStream, WritableStreamDefaultWriter,
};

use super::{BidirectionalStream, ClientTransport};

/// Browser connection primitive used by the shared Sea client.
pub struct BrowserTransport {
    transport: WebTransport,
}

impl BrowserTransport {
    /// Connects to a WebTransport endpoint using one SHA-256 certificate pin.
    pub async fn connect(url: &str, certificate_hash: &[u8]) -> Result<Self, JsValue> {
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
        Ok(Self { transport })
    }
}

#[async_trait(?Send)]
impl ClientTransport for BrowserTransport {
    type Stream = BrowserBidirectionalStream;
    type Error = JsValue;

    async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error> {
        let stream = JsFuture::from(self.transport.create_bidirectional_stream())
            .await?
            .dyn_into::<WebTransportBidirectionalStream>()?;
        let writable: WritableStream = stream.writable().unchecked_into();
        let readable: ReadableStream = stream.readable().unchecked_into();
        Ok(BrowserBidirectionalStream {
            writer: writable.get_writer()?.unchecked_into(),
            reader: readable.get_reader().unchecked_into(),
            finished: false,
            cancelled: false,
        })
    }

    fn disconnect(&self) -> Result<(), Self::Error> {
        Ok(())
    }
}

/// Browser bidirectional byte stream used by the shared Sea client.
pub struct BrowserBidirectionalStream {
    writer: WritableStreamDefaultWriter,
    reader: ReadableStreamDefaultReader,
    finished: bool,
    cancelled: bool,
}

#[async_trait(?Send)]
impl BidirectionalStream for BrowserBidirectionalStream {
    type Error = JsValue;

    async fn send(&mut self, bytes: &[u8]) -> Result<(), Self::Error> {
        if self.finished {
            return Err(js_error("browser stream send direction is finished"));
        }
        JsFuture::from(
            self.writer
                .write_with_chunk(Uint8Array::from(bytes).as_ref()),
        )
        .await?;
        Ok(())
    }

    async fn finish(&mut self) -> Result<(), Self::Error> {
        if !self.finished {
            self.finished = true;
            JsFuture::from(self.writer.close()).await?;
            self.writer.release_lock();
        }
        Ok(())
    }

    async fn receive(&mut self) -> Result<Option<Vec<u8>>, Self::Error> {
        if self.cancelled {
            return Err(js_error("Sea browser stream is cancelled"));
        }
        let result = JsFuture::from(self.reader.read()).await?;
        let done = Reflect::get(&result, &JsValue::from_str("done"))?
            .as_bool()
            .ok_or_else(|| js_error("browser stream returned an invalid done flag"))?;
        if done {
            self.reader.release_lock();
            return Ok(None);
        }
        let value = Reflect::get(&result, &JsValue::from_str("value"))?;
        Ok(Some(Uint8Array::new(&value).to_vec()))
    }

    async fn cancel(&mut self) -> Result<(), Self::Error> {
        if !self.cancelled {
            self.cancelled = true;
            self.finish().await?;
            JsFuture::from(self.reader.cancel()).await?;
            self.reader.release_lock();
        }
        Ok(())
    }
}

fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
