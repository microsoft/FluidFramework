use fluid_service_protocol::{
    Frame, Limits, Message, Request, Resolution, Response, decode, encode,
};
use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, Eq, PartialEq)]
enum ClientState {
    Connected,
    Disconnected,
    Closed,
}

pub(crate) struct ProtocolCore {
    limits: Limits,
    state: ClientState,
    active_operation: Option<u64>,
    next_operation: u64,
    next_request_id: u64,
    wire_bytes: u64,
    peak_response_bytes: usize,
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
            wire_bytes: 0,
            peak_response_bytes: 0,
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

    pub(crate) fn projected_read_response(
        &self,
        incoming: &[u8],
    ) -> Result<
        (
            Vec<fluid_service_protocol::ProjectedOperation>,
            Option<Vec<u8>>,
            bool,
        ),
        JsValue,
    > {
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
        self.wire_bytes = self.wire_bytes.saturating_add(outgoing.len() as u64);
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
        self.wire_bytes = self.wire_bytes.saturating_add(incoming.len() as u64);
        self.peak_response_bytes = self.peak_response_bytes.max(incoming.len());
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
        self.wire_bytes
    }

    pub(crate) fn peak_response_bytes(&self) -> usize {
        self.peak_response_bytes
    }

    pub(crate) fn max_frame_bytes(&self) -> usize {
        self.limits.max_frame_bytes
    }
}

fn protocol_error(error: fluid_service_protocol::ProtocolError) -> JsValue {
    js_error(&format!("FSP4 frame validation failed: {error}"))
}

pub(crate) fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
