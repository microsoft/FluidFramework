use std::{cell::Cell, rc::Rc};

use fluid_service_protocol::{
    Frame, Limits, Message, Request, Resolution, Response, SummaryEntry, decode, encode,
};
use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, Eq, PartialEq)]
enum ClientState {
    Connected,
    Disconnected,
    Closed,
}

type ProjectedReadResponse = (
    Vec<fluid_service_protocol::ProjectedOperation>,
    Option<Vec<u8>>,
    bool,
);

pub(crate) struct ProtocolCore {
    limits: Limits,
    state: ClientState,
    active_operation: Option<u64>,
    next_operation: u64,
    next_request_id: u64,
    metrics: Rc<ClientMetrics>,
}

pub(crate) struct ClientMetrics {
    wire_bytes: Cell<u64>,
    peak_response_bytes: Cell<usize>,
    peak_subscription_frame_bytes: Cell<usize>,
    peak_subscription_queue_depth: Cell<usize>,
}

impl ClientMetrics {
    pub(crate) fn record_outgoing(&self, bytes: usize) {
        self.wire_bytes
            .set(self.wire_bytes.get().saturating_add(bytes as u64));
    }

    pub(crate) fn record_subscription_frame(&self, bytes: usize, queue_depth: usize) {
        self.wire_bytes
            .set(self.wire_bytes.get().saturating_add(bytes as u64));
        self.peak_subscription_frame_bytes
            .set(self.peak_subscription_frame_bytes.get().max(bytes));
        self.peak_subscription_queue_depth
            .set(self.peak_subscription_queue_depth.get().max(queue_depth));
    }

    pub(crate) fn record_response(&self, bytes: usize) {
        self.wire_bytes
            .set(self.wire_bytes.get().saturating_add(bytes as u64));
        self.peak_response_bytes
            .set(self.peak_response_bytes.get().max(bytes));
    }
}

impl ProtocolCore {
    pub(crate) fn new(max_frame_bytes: usize) -> Result<Self, JsValue> {
        if max_frame_bytes < fluid_service_protocol::HEADER_BYTES {
            return Err(js_error("max_frame_bytes is smaller than the FSP4 header"));
        }
        Ok(Self {
            limits: Limits {
                max_frame_bytes,
                ..Limits::default()
            },
            state: ClientState::Connected,
            active_operation: None,
            next_operation: 1,
            next_request_id: 1,
            metrics: Rc::new(ClientMetrics {
                wire_bytes: Cell::new(0),
                peak_response_bytes: Cell::new(0),
                peak_subscription_frame_bytes: Cell::new(0),
                peak_subscription_queue_depth: Cell::new(0),
            }),
        })
    }

    pub(crate) fn read_projected_request(
        &mut self,
        document: Vec<u8>,
        after: Option<Vec<u8>>,
    ) -> Result<Vec<u8>, JsValue> {
        self.encode_request(Request::ReadProjected {
            document: document.into(),
            after: after.map(Into::into),
        })
    }

    pub(crate) fn subscribe_projected_request(
        &mut self,
        document: Vec<u8>,
        after: Option<Vec<u8>>,
    ) -> Result<Vec<u8>, JsValue> {
        self.encode_request(Request::SubscribeProjected {
            document: document.into(),
            after: after.map(Into::into),
        })
    }

    pub(crate) fn open_submission_stream_request(
        &mut self,
        document: Vec<u8>,
    ) -> Result<Vec<u8>, JsValue> {
        self.encode_request(Request::OpenSubmissionStream {
            document: document.into(),
        })
    }

    pub(crate) fn resolve_submission_request(
        &mut self,
        document: Vec<u8>,
        writer: Vec<u8>,
        session: Vec<u8>,
        submission: Vec<u8>,
    ) -> Result<Vec<u8>, JsValue> {
        self.encode_request(Request::ResolveSubmission {
            document: document.into(),
            writer: writer.into(),
            session: session.into(),
            submission: submission.into(),
        })
    }

    pub(crate) fn upload_blob_request(&mut self, payload: Vec<u8>) -> Result<Vec<u8>, JsValue> {
        self.encode_request(Request::UploadBlob {
            payload: payload.into(),
        })
    }

    pub(crate) fn fetch_blob_request(&mut self, digest: Vec<u8>) -> Result<Vec<u8>, JsValue> {
        self.encode_request(Request::FetchBlob {
            digest: digest.into(),
        })
    }

    pub(crate) fn publish_summary_request(
        &mut self,
        entries: Vec<SummaryEntry>,
    ) -> Result<Vec<u8>, JsValue> {
        self.encode_request(Request::PublishSummary { entries })
    }

    pub(crate) fn fetch_summary_request(&mut self, digest: Vec<u8>) -> Result<Vec<u8>, JsValue> {
        self.encode_request(Request::FetchSummary {
            digest: digest.into(),
        })
    }

    pub(crate) fn projected_read_response(
        &self,
        incoming: &[u8],
    ) -> Result<ProjectedReadResponse, JsValue> {
        match decode(incoming, self.limits)
            .map_err(protocol_error)?
            .message
        {
            Message::Response(Response::ProjectedRead {
                operations,
                cursor,
                has_more,
            }) => Ok((operations, cursor.map(|value| value.to_vec()), has_more)),
            Message::Response(Response::Error(code)) => {
                Err(js_error(&format!("FSP4 service error: {code:?}")))
            }
            _ => Err(js_error("FSP4 response is not a projected read result")),
        }
    }

    pub(crate) fn projected_operation_response(
        &self,
        incoming: &[u8],
        request_id: u64,
    ) -> Result<fluid_service_protocol::ProjectedOperation, JsValue> {
        let frame = decode(incoming, self.limits).map_err(protocol_error)?;
        if frame.request_id != request_id {
            return Err(js_error("FSP4 subscription request id did not match"));
        }
        match frame.message {
            Message::Response(Response::ProjectedOperation(operation)) => Ok(operation),
            Message::Response(Response::Error(code)) => {
                Err(js_error(&format!("FSP4 service error: {code:?}")))
            }
            _ => Err(js_error("FSP4 response is not a projected operation")),
        }
    }

    pub(crate) fn request_id(&self, outgoing: &[u8]) -> Result<u64, JsValue> {
        let frame = decode(outgoing, self.limits).map_err(protocol_error)?;
        if matches!(frame.message, Message::Request(_)) {
            Ok(frame.request_id)
        } else {
            Err(js_error("outgoing FSP4 frame is not a request"))
        }
    }

    pub(crate) fn submission_request_id(&self, outgoing: &[u8]) -> Result<u64, JsValue> {
        let frame = decode(outgoing, self.limits).map_err(protocol_error)?;
        if matches!(frame.message, Message::Request(Request::Submit(_))) {
            Ok(frame.request_id)
        } else {
            Err(js_error("submission stream frame is not a submit request"))
        }
    }

    pub(crate) fn submission_response(
        &self,
        incoming: &[u8],
        request_id: u64,
    ) -> Result<(), JsValue> {
        let frame = decode(incoming, self.limits).map_err(protocol_error)?;
        if frame.request_id != request_id {
            return Err(js_error(
                "submission stream response request id did not match",
            ));
        }
        if matches!(
            frame.message,
            Message::Response(Response::Submitted { .. } | Response::Error(_))
        ) {
            Ok(())
        } else {
            Err(js_error(
                "submission stream returned an unexpected response",
            ))
        }
    }

    pub(crate) fn resolution_response(&self, incoming: &[u8]) -> Result<Resolution, JsValue> {
        match decode(incoming, self.limits)
            .map_err(protocol_error)?
            .message
        {
            Message::Response(Response::Resolved(resolution)) => Ok(resolution),
            Message::Response(Response::Error(code)) => {
                Err(js_error(&format!("FSP4 service error: {code:?}")))
            }
            _ => Err(js_error(
                "FSP4 response is not a submission resolution result",
            )),
        }
    }

    pub(crate) fn blob_upload_response(
        &self,
        incoming: &[u8],
    ) -> Result<(Vec<u8>, u64, bool), JsValue> {
        match decode(incoming, self.limits)
            .map_err(protocol_error)?
            .message
        {
            Message::Response(Response::BlobUploaded {
                digest,
                size_bytes,
                deduplicated,
            }) => Ok((digest.to_vec(), size_bytes, deduplicated)),
            Message::Response(Response::Error(code)) => {
                Err(js_error(&format!("FSP4 service error: {code:?}")))
            }
            _ => Err(js_error("FSP4 response is not a blob upload result")),
        }
    }

    pub(crate) fn blob_response(
        &self,
        incoming: &[u8],
        expected_digest: &[u8],
    ) -> Result<Vec<u8>, JsValue> {
        match decode(incoming, self.limits)
            .map_err(protocol_error)?
            .message
        {
            Message::Response(Response::Blob { digest, payload }) if digest == expected_digest => {
                Ok(payload.to_vec())
            }
            Message::Response(Response::Blob { .. }) => Err(js_error(
                "content response digest does not match the requested blob",
            )),
            Message::Response(Response::Error(code)) => {
                Err(js_error(&format!("FSP4 service error: {code:?}")))
            }
            _ => Err(js_error("FSP4 response is not a blob result")),
        }
    }

    pub(crate) fn summary_publication_response(
        &self,
        incoming: &[u8],
    ) -> Result<(Vec<u8>, u32, u64, bool), JsValue> {
        match decode(incoming, self.limits)
            .map_err(protocol_error)?
            .message
        {
            Message::Response(Response::SummaryPublished {
                digest,
                entry_count,
                persisted_bytes,
                deduplicated,
            }) => Ok((digest.to_vec(), entry_count, persisted_bytes, deduplicated)),
            Message::Response(Response::Error(code)) => {
                Err(js_error(&format!("FSP4 service error: {code:?}")))
            }
            _ => Err(js_error(
                "FSP4 response is not a summary publication result",
            )),
        }
    }

    pub(crate) fn summary_response(
        &self,
        incoming: &[u8],
        expected_digest: &[u8],
    ) -> Result<Vec<SummaryEntry>, JsValue> {
        match decode(incoming, self.limits)
            .map_err(protocol_error)?
            .message
        {
            Message::Response(Response::Summary { digest, entries })
                if digest == expected_digest =>
            {
                Ok(entries)
            }
            Message::Response(Response::Summary { .. }) => Err(js_error(
                "content response digest does not match the requested summary",
            )),
            Message::Response(Response::Error(code)) => {
                Err(js_error(&format!("FSP4 service error: {code:?}")))
            }
            _ => Err(js_error("FSP4 response is not a summary result")),
        }
    }

    fn encode_request(&mut self, request: Request) -> Result<Vec<u8>, JsValue> {
        let request_id = self.next_request_id;
        self.next_request_id = self.next_request_id.wrapping_add(1).max(1);
        encode(
            &Frame {
                request_id,
                message: Message::Request(request),
            },
            self.limits,
        )
        .map(|frame| frame.to_vec())
        .map_err(protocol_error)
    }

    pub(crate) fn begin_request(&mut self, outgoing: &[u8]) -> Result<(u64, u64), JsValue> {
        match self.state {
            ClientState::Connected => {}
            ClientState::Disconnected => return Err(js_error("client is disconnected")),
            ClientState::Closed => return Err(js_error("client is closed")),
        }
        if self.active_operation.is_some() {
            return Err(js_error("client request queue is full"));
        }
        let frame = decode(outgoing, self.limits).map_err(protocol_error)?;
        if !matches!(frame.message, Message::Request(_)) {
            return Err(js_error("outgoing FSP4 frame is not a request"));
        }
        let operation = self.next_operation;
        self.next_operation = self.next_operation.wrapping_add(1);
        self.active_operation = Some(operation);
        self.metrics.record_outgoing(outgoing.len());
        Ok((frame.request_id, operation))
    }

    pub(crate) fn finish_response(
        &mut self,
        operation: u64,
        request_id: u64,
        incoming: &[u8],
    ) -> Result<(), JsValue> {
        if self.active_operation != Some(operation) {
            return Err(js_error("request was cancelled"));
        }
        self.active_operation = None;
        self.metrics.record_response(incoming.len());
        let response = decode(incoming, self.limits).map_err(protocol_error)?;
        if response.request_id != request_id {
            return Err(js_error("FSP4 response request id did not match"));
        }
        if !matches!(response.message, Message::Response(_)) {
            return Err(js_error("incoming FSP4 frame is not a response"));
        }
        Ok(())
    }

    pub(crate) fn transport_failed(&mut self, operation: u64) {
        if self.active_operation == Some(operation) {
            self.active_operation = None;
            self.state = ClientState::Disconnected;
        }
    }

    pub(crate) fn cancel(&mut self) {
        self.active_operation = None;
    }

    pub(crate) fn disconnect(&mut self) {
        self.active_operation = None;
        if self.state != ClientState::Closed {
            self.state = ClientState::Disconnected;
        }
    }

    pub(crate) fn reconnect(&mut self) -> Result<(), JsValue> {
        match self.state {
            ClientState::Disconnected => {}
            ClientState::Connected => {
                return Err(js_error("connected client cannot reconnect"));
            }
            ClientState::Closed => return Err(js_error("closed client cannot reconnect")),
        }
        self.active_operation = None;
        self.state = ClientState::Connected;
        Ok(())
    }

    pub(crate) fn shutdown(&mut self) {
        self.active_operation = None;
        self.state = ClientState::Closed;
    }

    pub(crate) fn state(&self) -> &'static str {
        match self.state {
            ClientState::Connected => "connected",
            ClientState::Disconnected => "disconnected",
            ClientState::Closed => "closed",
        }
    }

    pub(crate) fn wire_bytes(&self) -> u64 {
        self.metrics.wire_bytes.get()
    }

    pub(crate) fn peak_response_bytes(&self) -> usize {
        self.metrics.peak_response_bytes.get()
    }

    pub(crate) fn peak_subscription_frame_bytes(&self) -> usize {
        self.metrics.peak_subscription_frame_bytes.get()
    }

    pub(crate) fn peak_subscription_queue_depth(&self) -> usize {
        self.metrics.peak_subscription_queue_depth.get()
    }

    pub(crate) fn max_frame_bytes(&self) -> usize {
        self.limits.max_frame_bytes
    }

    pub(crate) fn limits(&self) -> Limits {
        self.limits
    }

    pub(crate) fn metrics(&self) -> Rc<ClientMetrics> {
        Rc::clone(&self.metrics)
    }
}

fn protocol_error(error: fluid_service_protocol::ProtocolError) -> JsValue {
    js_error(&format!("FSP4 frame validation failed: {error}"))
}

pub(crate) fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
