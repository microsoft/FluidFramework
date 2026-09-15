#![doc = "Browser WebTransport adapter for unchanged FSP4 service frames."]
#![cfg(target_arch = "wasm32")]

mod core;

use std::{
    cell::{Cell, RefCell},
    collections::VecDeque,
    rc::Rc,
};

use core::{ClientMetrics, ProtocolCore, js_error};
use js_sys::{Array, Date, Function, Promise, Reflect, Uint8Array};
use sea_protocol::{
    ProjectedOperation as ProtocolProjectedOperation, Reference, Resolution,
    SummaryEntry as ProtocolSummaryEntry,
};
use wasm_bindgen::{JsCast, prelude::*};
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    ReadableStream, ReadableStreamDefaultReader, WebTransport, WebTransportBidirectionalStream,
    WebTransportHash, WebTransportOptions, WritableStream, WritableStreamDefaultWriter,
};

#[wasm_bindgen(typescript_custom_section)]
const TYPESCRIPT_TRANSPORT: &str = r#"
/** Supplies complete FSP4 request and response frames to `InjectedClient`. */
export interface AsyncRequestTransport {
    /** Sends one complete request frame and resolves to one complete response frame. */
    request(frame: Uint8Array): Promise<Uint8Array>;
    /** Opens a projected-operation stream when subscription support is available. */
    subscribe?(frame: Uint8Array): AsyncSubscriptionTransport;
    /** Cancels the active operation when the transport supports cancellation. */
    cancel?(): void;
    /** Disconnects the current transport session without reconnecting. */
    disconnect?(): void;
    /** Permanently releases transport resources. */
    shutdown?(): void;
}

/** Supplies complete projected-operation response frames in stream order. */
export interface AsyncSubscriptionTransport {
    /** Resolves to the next complete response frame. */
    next(): Promise<Uint8Array>;
    /** Stops the subscription and releases its transport resources. */
    cancel(): void | Promise<void>;
}

/** Immutable summary entries accepted by `publishSummary`. */
export type SummaryEntries = ReadonlyArray<SummaryEntry>;
"#;

/// Receipt for one immutable blob upload.
#[wasm_bindgen]
pub struct BlobUpload {
    digest: Vec<u8>,
    size_bytes: u64,
    deduplicated: bool,
}

#[wasm_bindgen]
impl BlobUpload {
    /// Returns the service-computed content digest.
    #[wasm_bindgen(getter)]
    #[must_use]
    pub fn digest(&self) -> Uint8Array {
        Uint8Array::from(self.digest.as_slice())
    }

    /// Returns the accepted payload size in bytes.
    #[wasm_bindgen(getter, js_name = sizeBytes)]
    #[must_use]
    pub fn size_bytes(&self) -> u64 {
        self.size_bytes
    }

    /// Returns whether the service reused an existing blob.
    #[wasm_bindgen(getter)]
    #[must_use]
    pub fn deduplicated(&self) -> bool {
        self.deduplicated
    }
}

/// One canonical summary path and immutable blob identity.
#[wasm_bindgen]
pub struct SummaryEntry {
    inner: ProtocolSummaryEntry,
}

#[wasm_bindgen]
impl SummaryEntry {
    /// Creates one summary entry from an opaque path and blob digest.
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new(path: &Uint8Array, blob: &Uint8Array) -> Self {
        Self {
            inner: ProtocolSummaryEntry {
                path: path.to_vec().into(),
                blob: blob.to_vec().into(),
            },
        }
    }

    /// Returns the entry path bytes.
    #[wasm_bindgen(getter)]
    #[must_use]
    pub fn path(&self) -> Uint8Array {
        Uint8Array::from(self.inner.path.as_ref())
    }

    /// Returns the referenced blob digest.
    #[wasm_bindgen(getter)]
    #[must_use]
    pub fn blob(&self) -> Uint8Array {
        Uint8Array::from(self.inner.blob.as_ref())
    }
}

/// Receipt for one immutable summary publication.
#[wasm_bindgen]
pub struct SummaryPublication {
    digest: Vec<u8>,
    entry_count: u32,
    persisted_bytes: u64,
    deduplicated: bool,
}

#[wasm_bindgen]
impl SummaryPublication {
    /// Returns the service-computed summary digest.
    #[wasm_bindgen(getter)]
    #[must_use]
    pub fn digest(&self) -> Uint8Array {
        Uint8Array::from(self.digest.as_slice())
    }

    /// Returns the number of manifest entries.
    #[wasm_bindgen(getter, js_name = entryCount)]
    #[must_use]
    pub fn entry_count(&self) -> u32 {
        self.entry_count
    }

    /// Returns the number of manifest bytes newly persisted.
    #[wasm_bindgen(getter, js_name = persistedBytes)]
    #[must_use]
    pub fn persisted_bytes(&self) -> u64 {
        self.persisted_bytes
    }

    /// Returns whether the service reused an existing summary.
    #[wasm_bindgen(getter)]
    #[must_use]
    pub fn deduplicated(&self) -> bool {
        self.deduplicated
    }
}

/// One accepted operation returned by a projected read.
#[derive(Clone)]
#[wasm_bindgen]
pub struct ProjectedOperation {
    inner: ProtocolProjectedOperation,
}

#[wasm_bindgen]
impl ProjectedOperation {
    /// Returns the operation's opaque committed position.
    #[wasm_bindgen(getter)]
    pub fn position(&self) -> Uint8Array {
        Uint8Array::from(self.inner.position.as_ref())
    }

    /// Returns the document sequence number.
    #[wasm_bindgen(getter, js_name = sequenceNumber)]
    pub fn sequence_number(&self) -> u64 {
        self.inner.sequence_number
    }

    /// Returns the minimum reference position, or `undefined` for the initial position.
    #[wasm_bindgen(getter, js_name = minimumReference)]
    pub fn minimum_reference(&self) -> Option<Uint8Array> {
        reference_position(&self.inner.minimum_reference)
    }

    /// Returns the writer identity.
    #[wasm_bindgen(getter)]
    pub fn writer(&self) -> Uint8Array {
        Uint8Array::from(self.inner.writer.as_ref())
    }

    /// Returns the session identity.
    #[wasm_bindgen(getter)]
    pub fn session(&self) -> Uint8Array {
        Uint8Array::from(self.inner.session.as_ref())
    }

    /// Returns the stable submission identity.
    #[wasm_bindgen(getter)]
    pub fn submission(&self) -> Uint8Array {
        Uint8Array::from(self.inner.submission.as_ref())
    }

    /// Returns the session-local sequence number.
    #[wasm_bindgen(getter, js_name = localSequenceNumber)]
    pub fn local_sequence_number(&self) -> u64 {
        self.inner.local_sequence_number
    }

    /// Returns the authored reference, or `undefined` for the initial position.
    #[wasm_bindgen(getter)]
    pub fn reference(&self) -> Option<Uint8Array> {
        reference_position(&self.inner.reference)
    }

    /// Returns the opaque application operation bytes.
    #[wasm_bindgen(getter)]
    pub fn payload(&self) -> Uint8Array {
        Uint8Array::from(self.inner.payload.as_ref())
    }
}

/// One bounded page of projected accepted operations.
#[wasm_bindgen]
pub struct ProjectedReadPage {
    operations: Vec<ProjectedOperation>,
    cursor: Option<Vec<u8>>,
    has_more: bool,
}

#[wasm_bindgen]
/// Projected-operation subscription backed by a caller-provided JavaScript transport.
pub struct InjectedProjectedSubscription {
    transport: JsValue,
    limits: sea_protocol::Limits,
    request_id: u64,
    cancelled: Cell<bool>,
    metrics: Rc<ClientMetrics>,
}

#[wasm_bindgen]
impl InjectedProjectedSubscription {
    /// Waits for the next projected operation.
    ///
    /// # Errors
    ///
    /// Rejects cancellation, transport failures, and invalid response frames.
    pub async fn next(&self) -> Result<ProjectedOperation, JsValue> {
        if self.cancelled.get() {
            return Err(js_error("projected subscription is cancelled"));
        }
        let incoming = call_method(&self.transport, "next", &[])?;
        let incoming = JsFuture::from(Promise::resolve(&incoming)).await?;
        if !incoming.is_instance_of::<Uint8Array>() {
            return Err(js_error("subscription frame is not a Uint8Array"));
        }
        let incoming = Uint8Array::new(&incoming).to_vec();
        self.metrics.record_subscription_frame(incoming.len(), 1);
        projected_operation(self.limits, self.request_id, &incoming)
    }

    /// Waits for one operation and returns it with operations already queued by the transport.
    ///
    /// # Errors
    ///
    /// Rejects invalid limits, cancellation, transport failures, and invalid response frames.
    #[wasm_bindgen(js_name = nextBatch)]
    pub async fn next_batch(
        &self,
        max_operations: usize,
        max_payload_bytes: usize,
    ) -> Result<Array, JsValue> {
        if self.cancelled.get() {
            return Err(js_error("projected subscription is cancelled"));
        }
        if max_operations == 0 || max_payload_bytes == 0 {
            return Err(js_error(
                "projected subscription batch limits must be positive",
            ));
        }
        let batch_method = Reflect::get(&self.transport, &JsValue::from_str("nextBatch"))?;
        if batch_method.is_null() || batch_method.is_undefined() {
            let operations = Array::new();
            operations.push(&self.next().await?.into());
            return Ok(operations);
        }
        let incoming = call_method(
            &self.transport,
            "nextBatch",
            &[
                JsValue::from_f64(max_operations as f64),
                JsValue::from_f64(max_payload_bytes as f64),
            ],
        )?;
        let incoming = JsFuture::from(Promise::resolve(&incoming)).await?;
        if !incoming.is_instance_of::<Array>() {
            return Err(js_error("subscription batch is not an array"));
        }
        let operations = Array::new();
        for frame in Array::from(&incoming) {
            if !frame.is_instance_of::<Uint8Array>() {
                return Err(js_error("subscription batch frame is not a Uint8Array"));
            }
            let frame = Uint8Array::new(&frame).to_vec();
            self.metrics.record_subscription_frame(frame.len(), 1);
            operations.push(&projected_operation(self.limits, self.request_id, &frame)?.into());
        }
        Ok(operations)
    }

    /// Cancels the subscription and its injected transport.
    ///
    /// # Errors
    ///
    /// Rejects if the injected transport cannot be cancelled.
    pub async fn cancel(&self) -> Result<(), JsValue> {
        if !self.cancelled.replace(true) {
            let cancelled = call_method(&self.transport, "cancel", &[])?;
            JsFuture::from(Promise::resolve(&cancelled)).await?;
        }
        Ok(())
    }
}

#[wasm_bindgen]
impl ProjectedReadPage {
    /// Returns the accepted operations in document order.
    #[wasm_bindgen(getter)]
    pub fn operations(&self) -> Array {
        self.operations.iter().cloned().map(JsValue::from).collect()
    }

    /// Returns the opaque resume cursor, when the page advances it.
    #[wasm_bindgen(getter)]
    pub fn cursor(&self) -> Option<Uint8Array> {
        self.cursor.as_deref().map(Uint8Array::from)
    }

    /// Returns whether another bounded page is available.
    #[wasm_bindgen(getter, js_name = hasMore)]
    #[must_use]
    pub fn has_more(&self) -> bool {
        self.has_more
    }
}

/// Authoritative result for one stable submission identity.
#[wasm_bindgen]
pub struct SubmissionResolution {
    resolution: Resolution,
}

#[wasm_bindgen]
impl SubmissionResolution {
    /// Returns `committed`, `notCommitted`, or `stillUncertain`.
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> String {
        match self.resolution {
            Resolution::Committed { .. } => "committed",
            Resolution::NotCommitted => "notCommitted",
            Resolution::StillUncertain => "stillUncertain",
        }
        .to_owned()
    }

    /// Returns the committed position only for a committed result.
    #[wasm_bindgen(getter)]
    pub fn position(&self) -> Option<Uint8Array> {
        match &self.resolution {
            Resolution::Committed { position, .. } => Some(Uint8Array::from(position.as_ref())),
            Resolution::NotCommitted | Resolution::StillUncertain => None,
        }
    }

    /// Returns the sequence number only for a committed result.
    #[wasm_bindgen(getter, js_name = sequenceNumber)]
    pub fn sequence_number(&self) -> Option<u64> {
        match self.resolution {
            Resolution::Committed {
                sequence_number, ..
            } => Some(sequence_number),
            Resolution::NotCommitted | Resolution::StillUncertain => None,
        }
    }

    /// Returns the committed result's minimum reference, when non-initial.
    #[wasm_bindgen(getter, js_name = minimumReference)]
    pub fn minimum_reference(&self) -> Option<Uint8Array> {
        match &self.resolution {
            Resolution::Committed {
                minimum_reference, ..
            } => reference_position(minimum_reference),
            Resolution::NotCommitted | Resolution::StillUncertain => None,
        }
    }
}

#[wasm_bindgen]
extern "C" {
    /// JavaScript transport contract accepted by [`InjectedClient`].
    #[wasm_bindgen(typescript_type = "AsyncRequestTransport")]
    pub type AsyncRequestTransport;

    /// Read-only JavaScript collection of [`SummaryEntry`] values.
    #[wasm_bindgen(typescript_type = "SummaryEntries")]
    pub type SummaryEntries;
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

    /// Reads one bounded page of projected accepted operations.
    ///
    /// # Errors
    ///
    /// Rejects invalid fields, transport failures, and invalid responses.
    #[wasm_bindgen(js_name = readProjected)]
    pub async fn read_projected(
        &self,
        document: Uint8Array,
        after: Option<Uint8Array>,
    ) -> Result<ProjectedReadPage, JsValue> {
        let request = self
            .core
            .borrow_mut()
            .read_projected_request(document.to_vec(), after.map(|value| value.to_vec()))?;
        let response = self.request(Uint8Array::from(request.as_slice())).await?;
        projected_read_page(&self.core.borrow(), &response.to_vec())
    }

    /// Starts a projected-operation subscription over the injected transport.
    ///
    /// # Errors
    ///
    /// Rejects invalid fields and invalid injected transport state.
    #[allow(clippy::needless_pass_by_value)] // wasm-bindgen exports JS arrays by value.
    #[wasm_bindgen(js_name = subscribeProjected)]
    pub fn subscribe_projected(
        &self,
        document: Uint8Array,
        after: Option<Uint8Array>,
    ) -> Result<InjectedProjectedSubscription, JsValue> {
        let document = document.to_vec();
        let request = self
            .core
            .borrow_mut()
            .subscribe_projected_request(document, after.map(|value| value.to_vec()))?;
        let request_id = self.core.borrow().request_id(&request)?;
        self.core.borrow().metrics().record_outgoing(request.len());
        let transport = call_method(
            &self.transport.borrow(),
            "subscribe",
            &[Uint8Array::from(request.as_slice()).into()],
        )?;
        required_method(&transport, "next")?;
        required_method(&transport, "cancel")?;
        Ok(InjectedProjectedSubscription {
            transport,
            limits: self.core.borrow().limits(),
            request_id,
            cancelled: Cell::new(false),
            metrics: self.core.borrow().metrics(),
        })
    }

    /// Resolves one stable submission identity without retrying the submission.
    ///
    /// # Errors
    ///
    /// Rejects invalid identities, transport failures, and invalid responses.
    #[wasm_bindgen(js_name = resolveSubmission)]
    pub async fn resolve_submission(
        &self,
        document: Uint8Array,
        writer: Uint8Array,
        session: Uint8Array,
        submission: Uint8Array,
    ) -> Result<SubmissionResolution, JsValue> {
        let request = self.core.borrow_mut().resolve_submission_request(
            document.to_vec(),
            writer.to_vec(),
            session.to_vec(),
            submission.to_vec(),
        )?;
        let response = self.request(Uint8Array::from(request.as_slice())).await?;
        submission_resolution(&self.core.borrow(), &response.to_vec())
    }

    /// Uploads one bounded immutable blob.
    ///
    /// # Errors
    ///
    /// Rejects oversized content, transport failures, and invalid responses.
    #[wasm_bindgen(js_name = uploadBlob)]
    pub async fn upload_blob(&self, payload: Uint8Array) -> Result<BlobUpload, JsValue> {
        let request = self
            .core
            .borrow_mut()
            .upload_blob_request(payload.to_vec())?;
        let response = self.request(Uint8Array::from(request.as_slice())).await?;
        blob_upload(&self.core.borrow(), &response.to_vec())
    }

    /// Fetches one blob and validates its echoed digest.
    ///
    /// # Errors
    ///
    /// Rejects invalid digests, transport failures, and mismatched response identities.
    #[wasm_bindgen(js_name = fetchBlob)]
    pub async fn fetch_blob(&self, digest: Uint8Array) -> Result<Uint8Array, JsValue> {
        let expected_digest = digest.to_vec();
        let request = self
            .core
            .borrow_mut()
            .fetch_blob_request(expected_digest.clone())?;
        let response = self.request(Uint8Array::from(request.as_slice())).await?;
        blob_payload(&self.core.borrow(), &response.to_vec(), &expected_digest)
    }

    /// Publishes one bounded canonical summary manifest.
    ///
    /// # Errors
    ///
    /// Rejects invalid entries, transport failures, and invalid responses.
    #[wasm_bindgen(js_name = publishSummary)]
    pub async fn publish_summary(
        &self,
        entries: SummaryEntries,
    ) -> Result<SummaryPublication, JsValue> {
        let request = self
            .core
            .borrow_mut()
            .publish_summary_request(protocol_summary_entries(entries)?)?;
        let response = self.request(Uint8Array::from(request.as_slice())).await?;
        summary_publication(&self.core.borrow(), &response.to_vec())
    }

    /// Fetches one summary and validates its echoed digest.
    ///
    /// # Errors
    ///
    /// Rejects invalid digests, transport failures, and mismatched response identities.
    #[wasm_bindgen(js_name = fetchSummary)]
    pub async fn fetch_summary(&self, digest: Uint8Array) -> Result<SummaryEntries, JsValue> {
        let expected_digest = digest.to_vec();
        let request = self
            .core
            .borrow_mut()
            .fetch_summary_request(expected_digest.clone())?;
        let response = self.request(Uint8Array::from(request.as_slice())).await?;
        summary_entries(&self.core.borrow(), &response.to_vec(), &expected_digest)
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

    /// Returns the lifecycle state used to gate requests and reconnects.
    #[wasm_bindgen(getter)]
    #[must_use]
    pub fn state(&self) -> String {
        self.core.borrow().state().to_owned()
    }

    /// Returns encoded FSP4 bytes sent and received, excluding transport overhead.
    #[wasm_bindgen(getter, js_name = wireBytes)]
    #[must_use]
    pub fn wire_bytes(&self) -> u64 {
        self.core.borrow().wire_bytes()
    }

    /// Returns the largest complete unary response observed.
    #[wasm_bindgen(getter, js_name = peakResponseBytes)]
    #[must_use]
    pub fn peak_response_bytes(&self) -> usize {
        self.core.borrow().peak_response_bytes()
    }

    /// Returns the largest complete subscription frame observed.
    #[wasm_bindgen(getter, js_name = peakSubscriptionFrameBytes)]
    #[must_use]
    pub fn peak_subscription_frame_bytes(&self) -> usize {
        self.core.borrow().peak_subscription_frame_bytes()
    }

    /// Returns the highest buffered subscription-frame count observed.
    #[wasm_bindgen(getter, js_name = peakSubscriptionQueueDepth)]
    #[must_use]
    pub fn peak_subscription_queue_depth(&self) -> usize {
        self.core.borrow().peak_subscription_queue_depth()
    }
}

#[wasm_bindgen]
/// Browser WebTransport client with certificate pinning and explicit reconnect policy.
pub struct BrowserClient {
    url: String,
    certificate_hash: Vec<u8>,
    transport: WebTransport,
    core: Rc<RefCell<ProtocolCore>>,
    last_reconnect_milliseconds: f64,
}

#[wasm_bindgen]
/// Projected-operation subscription backed by one browser readable stream.
pub struct BrowserProjectedSubscription {
    reader: ReadableStreamDefaultReader,
    limits: sea_protocol::Limits,
    request_id: u64,
    buffered: RefCell<Vec<u8>>,
    pending: RefCell<Option<ProjectedOperation>>,
    cancelled: Cell<bool>,
    metrics: Rc<ClientMetrics>,
}

#[wasm_bindgen]
/// Ordered, document-bound submission stream with explicit write-side close.
pub struct BrowserSubmissionStream {
    writer: WritableStreamDefaultWriter,
    reader: ReadableStreamDefaultReader,
    limits: sea_protocol::Limits,
    core: Rc<RefCell<ProtocolCore>>,
    buffered: RefCell<Vec<u8>>,
    request_ids: RefCell<VecDeque<u64>>,
    sending: Cell<bool>,
    receiving: Cell<bool>,
    receive_ended: Cell<bool>,
    closed: Cell<bool>,
}

#[wasm_bindgen]
impl BrowserSubmissionStream {
    /// Writes one ordered submission frame, waiting only for transport backpressure.
    ///
    /// # Errors
    ///
    /// Rejects invalid frames, concurrent writes, closed streams, and transport failures.
    pub async fn send(&self, frame: Uint8Array) -> Result<(), JsValue> {
        if self.closed.get() {
            return Err(js_error("submission stream is closed"));
        }
        if self.sending.replace(true) {
            return Err(js_error("submission stream already has an active write"));
        }
        let outgoing = frame.to_vec();
        let request_id = match self.core.borrow().submission_request_id(&outgoing) {
            Ok(request_id) => request_id,
            Err(error) => {
                self.sending.set(false);
                return Err(error);
            }
        };
        self.core.borrow().metrics().record_outgoing(outgoing.len());
        self.request_ids.borrow_mut().push_back(request_id);
        let result = JsFuture::from(
            self.writer
                .write_with_chunk(Uint8Array::from(outgoing.as_slice()).as_ref()),
        )
        .await;
        self.sending.set(false);
        if let Err(error) = result {
            self.request_ids.borrow_mut().pop_back();
            return Err(error);
        }
        Ok(())
    }

    /// Reads the next ordered submission result.
    ///
    /// # Errors
    ///
    /// Rejects missing requests, concurrent reads, invalid responses, and transport failures.
    pub async fn next(&self) -> Result<Uint8Array, JsValue> {
        if self.receive_ended.get() {
            return Err(js_error("submission response stream has ended"));
        }
        if self.receiving.replace(true) {
            return Err(js_error("submission stream already has an active read"));
        }
        let Some(request_id) = self.request_ids.borrow().front().copied() else {
            self.receiving.set(false);
            return Err(js_error("submission stream has no pending request"));
        };
        let mut buffered = self.buffered.take();
        let result =
            read_stream_frame(&self.reader, &mut buffered, self.limits.max_frame_bytes).await;
        self.buffered.replace(buffered);
        self.receiving.set(false);
        let (incoming, _) = match result {
            Ok(incoming) => incoming,
            Err(error) => {
                self.receive_ended.set(true);
                return Err(error);
            }
        };
        if let Err(error) = self
            .core
            .borrow()
            .submission_response(&incoming, request_id)
        {
            self.receive_ended.set(true);
            return Err(error);
        }
        self.request_ids.borrow_mut().pop_front();
        self.core.borrow().metrics().record_response(incoming.len());
        Ok(Uint8Array::from(incoming.as_slice()))
    }

    /// Closes the submission side after all queued writes.
    ///
    /// # Errors
    ///
    /// Rejects if the browser stream cannot be closed.
    pub async fn close(&self) -> Result<(), JsValue> {
        if !self.closed.replace(true) {
            JsFuture::from(self.writer.close()).await?;
            self.writer.release_lock();
        }
        Ok(())
    }
}

#[wasm_bindgen]
impl BrowserProjectedSubscription {
    /// Waits for the next projected operation.
    ///
    /// # Errors
    ///
    /// Rejects cancellation, transport failures, and invalid response frames.
    pub async fn next(&self) -> Result<ProjectedOperation, JsValue> {
        if self.cancelled.get() {
            return Err(js_error("projected subscription is cancelled"));
        }
        if let Some(operation) = self.pending.borrow_mut().take() {
            return Ok(operation);
        }
        let mut buffered = self.buffered.take();
        let result =
            read_stream_frame(&self.reader, &mut buffered, self.limits.max_frame_bytes).await;
        self.buffered.replace(buffered);
        let (incoming, queue_depth) = result?;
        self.metrics
            .record_subscription_frame(incoming.len(), queue_depth);
        projected_operation(self.limits, self.request_id, &incoming)
    }

    /// Waits for one operation and drains complete operations already buffered by the stream.
    ///
    /// # Errors
    ///
    /// Rejects invalid limits, cancellation, transport failures, and invalid response frames.
    #[wasm_bindgen(js_name = nextBatch)]
    pub async fn next_batch(
        &self,
        max_operations: usize,
        max_payload_bytes: usize,
    ) -> Result<Array, JsValue> {
        if max_operations == 0 || max_payload_bytes == 0 {
            return Err(js_error(
                "projected subscription batch limits must be positive",
            ));
        }

        let operations = Array::new();
        let mut payload_bytes = 0usize;
        loop {
            let operation = self.next().await?;
            let next_payload_bytes = payload_bytes
                .checked_add(operation.inner.payload.len())
                .ok_or_else(|| js_error("projected subscription batch size overflowed"))?;
            if next_payload_bytes > max_payload_bytes {
                self.pending.replace(Some(operation));
                if operations.length() == 0 {
                    return Err(js_error(
                        "next projected operation exceeds the subscription batch byte limit",
                    ));
                }
                break;
            }
            payload_bytes = next_payload_bytes;
            operations.push(&operation.into());
            if operations.length() as usize >= max_operations
                || complete_frame_count(&self.buffered.borrow()) == 0
            {
                break;
            }
        }
        Ok(operations)
    }

    /// Cancels the subscription and releases its stream reader.
    ///
    /// # Errors
    ///
    /// Rejects if the browser stream cannot be cancelled.
    pub async fn cancel(&self) -> Result<(), JsValue> {
        if !self.cancelled.replace(true) {
            JsFuture::from(self.reader.cancel()).await?;
            self.reader.release_lock();
        }
        Ok(())
    }
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
            core: Rc::new(RefCell::new(core)),
            last_reconnect_milliseconds: 0.0,
        })
    }

    /// Closes the current browser session without retrying outstanding work.
    pub fn disconnect(&self) {
        self.transport.close();
        self.core.borrow_mut().disconnect();
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
        self.core.borrow_mut().reconnect()?;
        self.last_reconnect_milliseconds = Date::now() - started;
        Ok(())
    }

    /// Sends one validated FSP4 request on a fresh reliable bidirectional stream.
    ///
    /// # Errors
    ///
    /// Rejects malformed or oversized frames and propagates browser stream failures.
    pub async fn request(&self, frame_bytes: Uint8Array) -> Result<Uint8Array, JsValue> {
        let outgoing = frame_bytes.to_vec();
        let (request_id, operation) = self.core.borrow_mut().begin_request(&outgoing)?;
        let incoming = match self.request_transport(&outgoing).await {
            Ok(incoming) => incoming,
            Err(error) => {
                self.core.borrow_mut().transport_failed(operation);
                return Err(error);
            }
        };
        self.core
            .borrow_mut()
            .finish_response(operation, request_id, &incoming)?;
        Ok(Uint8Array::from(incoming.as_slice()))
    }

    /// Reads one bounded page of projected accepted operations.
    ///
    /// # Errors
    ///
    /// Rejects invalid fields, transport failures, and invalid responses.
    #[wasm_bindgen(js_name = readProjected)]
    pub async fn read_projected(
        &self,
        document: Uint8Array,
        after: Option<Uint8Array>,
    ) -> Result<ProjectedReadPage, JsValue> {
        let request = self
            .core
            .borrow_mut()
            .read_projected_request(document.to_vec(), after.map(|value| value.to_vec()))?;
        let response = self.request(Uint8Array::from(request.as_slice())).await?;
        projected_read_page(&self.core.borrow(), &response.to_vec())
    }

    #[wasm_bindgen(js_name = subscribeProjected)]
    /// Starts a projected-operation subscription on a dedicated stream.
    ///
    /// # Errors
    ///
    /// Rejects invalid fields, transport failures, and invalid stream state.
    pub async fn subscribe_projected(
        &self,
        document: Uint8Array,
        after: Option<Uint8Array>,
    ) -> Result<BrowserProjectedSubscription, JsValue> {
        let request = self
            .core
            .borrow_mut()
            .subscribe_projected_request(document.to_vec(), after.map(|value| value.to_vec()))?;
        let request_id = self.core.borrow().request_id(&request)?;
        self.core.borrow().metrics().record_outgoing(request.len());
        let stream = JsFuture::from(self.transport.create_bidirectional_stream())
            .await?
            .dyn_into::<WebTransportBidirectionalStream>()?;
        let writable: WritableStream = stream.writable().unchecked_into();
        let writer = writable.get_writer()?;
        let outgoing = Uint8Array::from(request.as_slice());
        JsFuture::from(writer.write_with_chunk(outgoing.as_ref())).await?;
        JsFuture::from(writer.close()).await?;
        writer.release_lock();
        let readable: ReadableStream = stream.readable().unchecked_into();
        Ok(BrowserProjectedSubscription {
            reader: readable.get_reader().unchecked_into(),
            limits: self.core.borrow().limits(),
            request_id,
            buffered: RefCell::new(Vec::new()),
            pending: RefCell::new(None),
            cancelled: Cell::new(false),
            metrics: self.core.borrow().metrics(),
        })
    }

    /// Opens one ordered, document-bound submission stream.
    ///
    /// # Errors
    ///
    /// Rejects invalid fields and browser transport failures.
    #[wasm_bindgen(js_name = openSubmissionStream)]
    pub async fn open_submission_stream(
        &self,
        document: Uint8Array,
    ) -> Result<BrowserSubmissionStream, JsValue> {
        let request = self
            .core
            .borrow_mut()
            .open_submission_stream_request(document.to_vec())?;
        self.core.borrow().metrics().record_outgoing(request.len());
        let stream = JsFuture::from(self.transport.create_bidirectional_stream())
            .await?
            .dyn_into::<WebTransportBidirectionalStream>()?;
        let writable: WritableStream = stream.writable().unchecked_into();
        let writer = writable.get_writer()?;
        JsFuture::from(writer.write_with_chunk(Uint8Array::from(request.as_slice()).as_ref()))
            .await?;
        let readable: ReadableStream = stream.readable().unchecked_into();
        Ok(BrowserSubmissionStream {
            writer,
            reader: readable.get_reader().unchecked_into(),
            limits: self.core.borrow().limits(),
            core: Rc::clone(&self.core),
            buffered: RefCell::new(Vec::new()),
            request_ids: RefCell::new(VecDeque::new()),
            sending: Cell::new(false),
            receiving: Cell::new(false),
            receive_ended: Cell::new(false),
            closed: Cell::new(false),
        })
    }

    /// Resolves one stable submission identity without retrying the submission.
    ///
    /// # Errors
    ///
    /// Rejects invalid identities, transport failures, and invalid responses.
    #[wasm_bindgen(js_name = resolveSubmission)]
    pub async fn resolve_submission(
        &self,
        document: Uint8Array,
        writer: Uint8Array,
        session: Uint8Array,
        submission: Uint8Array,
    ) -> Result<SubmissionResolution, JsValue> {
        let request = self.core.borrow_mut().resolve_submission_request(
            document.to_vec(),
            writer.to_vec(),
            session.to_vec(),
            submission.to_vec(),
        )?;
        let response = self.request(Uint8Array::from(request.as_slice())).await?;
        submission_resolution(&self.core.borrow(), &response.to_vec())
    }

    /// Uploads one bounded immutable blob.
    ///
    /// # Errors
    ///
    /// Rejects oversized content, transport failures, and invalid responses.
    #[wasm_bindgen(js_name = uploadBlob)]
    pub async fn upload_blob(&self, payload: Uint8Array) -> Result<BlobUpload, JsValue> {
        let request = self
            .core
            .borrow_mut()
            .upload_blob_request(payload.to_vec())?;
        let response = self.request(Uint8Array::from(request.as_slice())).await?;
        blob_upload(&self.core.borrow(), &response.to_vec())
    }

    /// Fetches one blob and validates its echoed digest.
    ///
    /// # Errors
    ///
    /// Rejects invalid digests, transport failures, and mismatched response identities.
    #[wasm_bindgen(js_name = fetchBlob)]
    pub async fn fetch_blob(&self, digest: Uint8Array) -> Result<Uint8Array, JsValue> {
        let expected_digest = digest.to_vec();
        let request = self
            .core
            .borrow_mut()
            .fetch_blob_request(expected_digest.clone())?;
        let response = self.request(Uint8Array::from(request.as_slice())).await?;
        blob_payload(&self.core.borrow(), &response.to_vec(), &expected_digest)
    }

    /// Publishes one bounded canonical summary manifest.
    ///
    /// # Errors
    ///
    /// Rejects invalid entries, transport failures, and invalid responses.
    #[wasm_bindgen(js_name = publishSummary)]
    pub async fn publish_summary(
        &self,
        entries: SummaryEntries,
    ) -> Result<SummaryPublication, JsValue> {
        let request = self
            .core
            .borrow_mut()
            .publish_summary_request(protocol_summary_entries(entries)?)?;
        let response = self.request(Uint8Array::from(request.as_slice())).await?;
        summary_publication(&self.core.borrow(), &response.to_vec())
    }

    /// Fetches one summary and validates its echoed digest.
    ///
    /// # Errors
    ///
    /// Rejects invalid digests, transport failures, and mismatched response identities.
    #[wasm_bindgen(js_name = fetchSummary)]
    pub async fn fetch_summary(&self, digest: Uint8Array) -> Result<SummaryEntries, JsValue> {
        let expected_digest = digest.to_vec();
        let request = self
            .core
            .borrow_mut()
            .fetch_summary_request(expected_digest.clone())?;
        let response = self.request(Uint8Array::from(request.as_slice())).await?;
        summary_entries(&self.core.borrow(), &response.to_vec(), &expected_digest)
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
        let max_frame_bytes = self.core.borrow().max_frame_bytes();
        let incoming = read_bounded(&reader, max_frame_bytes).await?;
        reader.release_lock();
        Ok(incoming)
    }

    /// Returns encoded FSP4 bytes sent and received, excluding transport overhead.
    #[wasm_bindgen(getter, js_name = wireBytes)]
    #[must_use]
    pub fn wire_bytes(&self) -> u64 {
        self.core.borrow().wire_bytes()
    }

    /// Returns the largest complete unary response observed.
    #[wasm_bindgen(getter, js_name = peakResponseBytes)]
    #[must_use]
    pub fn peak_response_bytes(&self) -> usize {
        self.core.borrow().peak_response_bytes()
    }

    /// Returns the largest complete subscription frame observed.
    #[wasm_bindgen(getter, js_name = peakSubscriptionFrameBytes)]
    #[must_use]
    pub fn peak_subscription_frame_bytes(&self) -> usize {
        self.core.borrow().peak_subscription_frame_bytes()
    }

    /// Returns the highest buffered subscription-frame count observed.
    #[wasm_bindgen(getter, js_name = peakSubscriptionQueueDepth)]
    #[must_use]
    pub fn peak_subscription_queue_depth(&self) -> usize {
        self.core.borrow().peak_subscription_queue_depth()
    }

    /// Returns the elapsed time of the most recent successful explicit reconnect.
    #[wasm_bindgen(getter, js_name = lastReconnectMilliseconds)]
    #[must_use]
    pub fn last_reconnect_milliseconds(&self) -> f64 {
        self.last_reconnect_milliseconds
    }
}

fn projected_read_page(core: &ProtocolCore, response: &[u8]) -> Result<ProjectedReadPage, JsValue> {
    let (operations, cursor, has_more) = core.projected_read_response(response)?;
    Ok(ProjectedReadPage {
        operations: operations
            .into_iter()
            .map(|inner| ProjectedOperation { inner })
            .collect(),
        cursor,
        has_more,
    })
}

fn projected_operation(
    limits: sea_protocol::Limits,
    request_id: u64,
    response: &[u8],
) -> Result<ProjectedOperation, JsValue> {
    let core = ProtocolCore::new(limits.max_frame_bytes)?;
    Ok(ProjectedOperation {
        inner: core.projected_operation_response(response, request_id)?,
    })
}

fn submission_resolution(
    core: &ProtocolCore,
    response: &[u8],
) -> Result<SubmissionResolution, JsValue> {
    Ok(SubmissionResolution {
        resolution: core.resolution_response(response)?,
    })
}

fn blob_upload(core: &ProtocolCore, response: &[u8]) -> Result<BlobUpload, JsValue> {
    let (digest, size_bytes, deduplicated) = core.blob_upload_response(response)?;
    Ok(BlobUpload {
        digest,
        size_bytes,
        deduplicated,
    })
}

fn blob_payload(
    core: &ProtocolCore,
    response: &[u8],
    expected_digest: &[u8],
) -> Result<Uint8Array, JsValue> {
    core.blob_response(response, expected_digest)
        .map(|payload| Uint8Array::from(payload.as_slice()))
}

fn summary_publication(
    core: &ProtocolCore,
    response: &[u8],
) -> Result<SummaryPublication, JsValue> {
    let (digest, entry_count, persisted_bytes, deduplicated) =
        core.summary_publication_response(response)?;
    Ok(SummaryPublication {
        digest,
        entry_count,
        persisted_bytes,
        deduplicated,
    })
}

fn protocol_summary_entries(entries: SummaryEntries) -> Result<Vec<ProtocolSummaryEntry>, JsValue> {
    Array::from(&JsValue::from(entries))
        .iter()
        .map(|entry| {
            Ok(ProtocolSummaryEntry {
                path: uint8_array_property(&entry, "path")?.to_vec().into(),
                blob: uint8_array_property(&entry, "blob")?.to_vec().into(),
            })
        })
        .collect()
}

fn summary_entries(
    core: &ProtocolCore,
    response: &[u8],
    expected_digest: &[u8],
) -> Result<SummaryEntries, JsValue> {
    let entries: Array = core
        .summary_response(response, expected_digest)?
        .into_iter()
        .map(|inner| JsValue::from(SummaryEntry { inner }))
        .collect();
    Ok(entries.unchecked_into())
}

fn uint8_array_property(target: &JsValue, name: &str) -> Result<Uint8Array, JsValue> {
    let value = Reflect::get(target, &JsValue::from_str(name))?;
    if value.is_instance_of::<Uint8Array>() {
        Ok(Uint8Array::new(&value))
    } else {
        Err(js_error(&format!(
            "summary entry {name} is not a Uint8Array"
        )))
    }
}

fn reference_position(reference: &Reference) -> Option<Uint8Array> {
    match reference {
        Reference::Initial => None,
        Reference::At(position) => Some(Uint8Array::from(position.as_ref())),
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

async fn read_stream_frame(
    reader: &ReadableStreamDefaultReader,
    buffered: &mut Vec<u8>,
    max_frame_bytes: usize,
) -> Result<(Vec<u8>, usize), JsValue> {
    let max_buffered_bytes = max_frame_bytes
        .checked_mul(2)
        .ok_or_else(|| js_error("subscription buffer limit overflowed"))?;
    loop {
        if buffered.len() >= sea_protocol::HEADER_BYTES {
            let body_bytes = usize::try_from(u32::from_be_bytes(
                buffered[sea_protocol::HEADER_BYTES - 4..sea_protocol::HEADER_BYTES]
                    .try_into()
                    .map_err(|_| js_error("subscription frame header is invalid"))?,
            ))
            .map_err(|_| js_error("subscription frame length is invalid"))?;
            let frame_bytes = sea_protocol::HEADER_BYTES
                .checked_add(body_bytes)
                .ok_or_else(|| js_error("subscription frame length overflowed"))?;
            if frame_bytes > max_frame_bytes {
                return Err(js_error("subscription frame exceeded the configured limit"));
            }
            if buffered.len() >= frame_bytes {
                let frame = buffered.drain(..frame_bytes).collect::<Vec<_>>();
                return Ok((frame, complete_frame_count(buffered)));
            }
        }
        let result = JsFuture::from(reader.read()).await?;
        let done = Reflect::get(&result, &JsValue::from_str("done"))?
            .as_bool()
            .ok_or_else(|| js_error("browser stream returned an invalid done flag"))?;
        if done {
            return Err(if buffered.is_empty() {
                js_error("browser stream ended")
            } else {
                js_error("browser stream ended with a partial frame")
            });
        }
        let value = Reflect::get(&result, &JsValue::from_str("value"))?;
        let chunk = Uint8Array::new(&value);
        let next_length = buffered
            .len()
            .checked_add(chunk.length() as usize)
            .ok_or_else(|| js_error("subscription buffer limit overflowed"))?;
        if next_length > max_buffered_bytes {
            JsFuture::from(reader.cancel()).await?;
            return Err(js_error("subscription buffer exceeded two frames"));
        }
        buffered.resize(next_length, 0);
        chunk.copy_to(&mut buffered[next_length - chunk.length() as usize..]);
    }
}

fn complete_frame_count(mut bytes: &[u8]) -> usize {
    let mut count = 0;
    while bytes.len() >= sea_protocol::HEADER_BYTES {
        let body_bytes = u32::from_be_bytes(
            bytes[sea_protocol::HEADER_BYTES - 4..sea_protocol::HEADER_BYTES]
                .try_into()
                .expect("the bounded header slice has four bytes"),
        ) as usize;
        let Some(frame_bytes) = sea_protocol::HEADER_BYTES.checked_add(body_bytes) else {
            break;
        };
        if bytes.len() < frame_bytes {
            break;
        }
        count += 1;
        bytes = &bytes[frame_bytes..];
    }
    count
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
        [first, second] => method.call2(target, first, second),
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
