//! Browser WebTransport connection and bidirectional-stream primitives.

use async_trait::async_trait;
use js_sys::{Promise, Reflect, Uint8Array};
use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};
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
    /// Datagram stream locks and retained reads, separate from reliable logical streams.
    datagrams: BrowserBidirectionalStream,
    /// Browser-advertised datagram size, which may change during the connection.
    datagram_options: JsValue,
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
        let datagram_options = Reflect::get(&transport, &JsValue::from_str("datagrams"))?;
        let readable: ReadableStream =
            Reflect::get(&datagram_options, &JsValue::from_str("readable"))?.dyn_into()?;
        let writable: WritableStream =
            Reflect::get(&datagram_options, &JsValue::from_str("writable"))?.dyn_into()?;
        let datagrams = BrowserBidirectionalStream {
            state: Rc::new(BrowserStreamState {
                writer: writable.get_writer()?.unchecked_into(),
                reader: readable.get_reader().unchecked_into(),
                finished: Cell::new(false),
                cancelled: Cell::new(false),
                ended: Cell::new(false),
                pending_receive: RefCell::new(None),
            }),
        };
        Ok(Self {
            transport,
            datagrams,
            datagram_options,
        })
    }
}

impl Drop for BrowserTransport {
    fn drop(&mut self) {
        self.transport.close();
    }
}

#[async_trait(?Send)]
impl ClientTransport for BrowserTransport {
    type Stream = BrowserBidirectionalStream;
    type Error = JsValue;

    fn supports_datagrams(&self) -> bool {
        true
    }

    async fn send_datagram(&self, bytes: &[u8]) -> Result<bool, JsValue> {
        let limit = Reflect::get(
            &self.datagram_options,
            &JsValue::from_str("maxDatagramSize"),
        )?
        .as_f64()
        .unwrap_or(0.0);
        if !u32::try_from(bytes.len())
            .map(f64::from)
            .is_ok_and(|length| length <= limit)
        {
            return Ok(false);
        }
        self.datagrams.clone().send(bytes).await?;
        Ok(true)
    }

    async fn receive_datagram(&self) -> Result<Vec<u8>, JsValue> {
        self.datagrams
            .clone()
            .receive()
            .await?
            .ok_or_else(|| js_error("datagram stream ended"))
    }

    async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error> {
        let stream = JsFuture::from(self.transport.create_bidirectional_stream())
            .await?
            .dyn_into::<WebTransportBidirectionalStream>()?;
        let writable: WritableStream = stream.writable().unchecked_into();
        let readable: ReadableStream = stream.readable().unchecked_into();
        Ok(BrowserBidirectionalStream {
            state: Rc::new(BrowserStreamState {
                writer: writable.get_writer()?.unchecked_into(),
                reader: readable.get_reader().unchecked_into(),
                finished: Cell::new(false),
                cancelled: Cell::new(false),
                ended: Cell::new(false),
                pending_receive: RefCell::new(None),
            }),
        })
    }

    fn disconnect(&self) -> Result<(), Self::Error> {
        self.transport.close();
        Ok(())
    }
}

/// Browser bidirectional byte stream used by the shared Sea client.
#[derive(Clone)]
pub struct BrowserBidirectionalStream {
    /// Shared directions permit sending while one JavaScript read remains pending.
    state: Rc<BrowserStreamState>,
}

/// Shared browser stream locks and cancellation-safe read state.
struct BrowserStreamState {
    /// Independently locked send direction.
    writer: WritableStreamDefaultWriter,
    /// Independently locked receive direction.
    reader: ReadableStreamDefaultReader,
    /// Whether the send direction has been closed.
    finished: Cell<bool>,
    /// Whether explicit cancellation has started.
    cancelled: Cell<bool>,
    /// Whether the receive direction has reached EOF.
    ended: Cell<bool>,
    /// A JavaScript read is not cancelled merely by dropping its Rust waiter.
    pending_receive: RefCell<Option<Promise>>,
}

#[async_trait(?Send)]
impl BidirectionalStream for BrowserBidirectionalStream {
    type Error = JsValue;

    async fn send(&mut self, bytes: &[u8]) -> Result<(), Self::Error> {
        if self.state.finished.get() {
            return Err(js_error("browser stream send direction is finished"));
        }
        JsFuture::from(
            self.state
                .writer
                .write_with_chunk(Uint8Array::from(bytes).as_ref()),
        )
        .await?;
        Ok(())
    }

    async fn finish(&mut self) -> Result<(), Self::Error> {
        if !self.state.finished.replace(true) {
            JsFuture::from(self.state.writer.close()).await?;
            self.state.writer.release_lock();
        }
        Ok(())
    }

    async fn receive(&mut self) -> Result<Option<Vec<u8>>, Self::Error> {
        if self.state.cancelled.get() {
            return Err(js_error("Sea browser stream is cancelled"));
        }
        if self.state.ended.get() {
            return Ok(None);
        }
        let pending = self
            .state
            .pending_receive
            .borrow_mut()
            .get_or_insert_with(|| self.state.reader.read())
            .clone();
        let result = JsFuture::from(pending).await;
        self.state.pending_receive.take();
        let result = result?;
        let done = Reflect::get(&result, &JsValue::from_str("done"))?
            .as_bool()
            .ok_or_else(|| js_error("browser stream returned an invalid done flag"))?;
        if done {
            self.state.ended.set(true);
            self.state.reader.release_lock();
            return Ok(None);
        }
        let value = Reflect::get(&result, &JsValue::from_str("value"))?;
        Ok(Some(Uint8Array::new(&value).to_vec()))
    }

    async fn cancel(&mut self) -> Result<(), Self::Error> {
        if !self.state.cancelled.replace(true) {
            if !self.state.finished.replace(true) {
                let _ = JsFuture::from(self.state.writer.abort()).await;
                self.state.writer.release_lock();
            }
            if !self.state.ended.replace(true) {
                let _ = JsFuture::from(self.state.reader.cancel()).await;
                self.state.reader.release_lock();
            }
            self.state.pending_receive.take();
        }
        Ok(())
    }
}

fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
