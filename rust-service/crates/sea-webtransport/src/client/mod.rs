//! Platform-independent Sea client connection state.

use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex, Weak},
};

use thiserror::Error;

use crate::protocol::{
    self, CorrelationTracker, NetworkFrameDecoder, ProtocolError, Request, Response, StreamRole,
};
use crate::transport::{BidirectionalStream, ClientTransport};

/// Failure from the shared protocol client.
#[derive(Debug)]
pub enum ClientError<TransportError> {
    /// Shared lifecycle or correlation state failed.
    State(ClientStateError),
    /// A network frame violated the Sea protocol.
    Protocol(ProtocolError),
    /// A transport primitive failed.
    Transport(TransportError),
    /// A unary request ended before its response arrived.
    ResponseEnded,
}

impl<TransportError> From<ClientStateError> for ClientError<TransportError> {
    fn from(error: ClientStateError) -> Self {
        Self::State(error)
    }
}

impl<TransportError> From<ProtocolError> for ClientError<TransportError> {
    fn from(error: ProtocolError) -> Self {
        Self::Protocol(error)
    }
}

/// Platform-independent Sea request and response state machine.
#[derive(Debug)]
pub struct Client<Transport> {
    transport: Transport,
    state: Arc<ClientState>,
    limits: protocol::Limits,
}

impl<Transport> Client<Transport>
where
    Transport: ClientTransport,
{
    /// Creates a client over one connected transport.
    pub fn new(transport: Transport, limits: protocol::Limits) -> Self {
        Self::with_state(transport, Arc::new(ClientState::default()), limits)
    }

    /// Creates a client using an existing shared lifecycle state.
    pub fn with_state(
        transport: Transport,
        state: Arc<ClientState>,
        limits: protocol::Limits,
    ) -> Self {
        Self {
            transport,
            state,
            limits,
        }
    }

    /// Sends one request and receives its single correlated response.
    pub async fn request(
        &self,
        request: Request,
    ) -> Result<Response, ClientError<Transport::Error>> {
        let role = request.stream_role();
        let pending = self.state.begin(role)?;
        let correlation_id = pending.id();
        let outgoing = protocol::encode_request_frame(role, correlation_id, &request, self.limits)?;
        let mut stream = self
            .transport
            .open_bidirectional()
            .await
            .map_err(ClientError::Transport)?;
        stream
            .send(&outgoing)
            .await
            .map_err(ClientError::Transport)?;
        stream.finish().await.map_err(ClientError::Transport)?;
        let frame = receive_frame(&mut stream, self.limits)
            .await?
            .ok_or(ClientError::ResponseEnded)?;
        pending.complete(frame.correlation_id)?;
        protocol::decode_response_network_frame(role, &frame).map_err(Into::into)
    }

    /// Starts one request whose correlated responses continue until stream EOF.
    pub async fn request_stream(
        &self,
        request: Request,
    ) -> Result<ResponseStream<Transport::Stream>, ClientError<Transport::Error>> {
        let role = request.stream_role();
        let pending = self.state.begin(role)?;
        let correlation_id = pending.id();
        let outgoing = protocol::encode_request_frame(role, correlation_id, &request, self.limits)?;
        let mut stream = self
            .transport
            .open_bidirectional()
            .await
            .map_err(ClientError::Transport)?;
        stream
            .send(&outgoing)
            .await
            .map_err(ClientError::Transport)?;
        stream.finish().await.map_err(ClientError::Transport)?;
        Ok(ResponseStream {
            stream,
            role,
            pending: Some(pending),
            decoder: NetworkFrameDecoder::new(self.limits),
        })
    }

    /// Marks the logical client closed and rejects future requests.
    pub fn close(&self) -> Result<(), ClientStateError> {
        self.state.close()
    }

    /// Returns whether this logical client has been closed.
    pub fn is_closed(&self) -> Result<bool, ClientStateError> {
        self.state.is_closed()
    }

    /// Disconnects the underlying transport without closing logical client state.
    pub fn disconnect(&self) -> Result<(), ClientError<Transport::Error>> {
        let result = self.transport.disconnect();
        self.state.disconnect()?;
        result.map_err(ClientError::Transport)
    }

    /// Re-enables requests after the caller explicitly replaces or reconnects the transport.
    pub fn reconnect(&self) -> Result<(), ClientStateError> {
        self.state.reconnect()
    }
}

/// Correlated response stream owned by the shared client.
#[derive(Debug)]
pub struct ResponseStream<Stream> {
    stream: Stream,
    role: StreamRole,
    pending: Option<PendingCorrelation>,
    decoder: NetworkFrameDecoder,
}

impl<Stream> ResponseStream<Stream>
where
    Stream: BidirectionalStream,
{
    /// Receives and decodes the next response, or completes at clean EOF.
    pub async fn next(&mut self) -> Result<Option<Response>, ClientError<Stream::Error>> {
        loop {
            if let Some(frame) = self.decoder.next_frame()? {
                let expected = self
                    .pending
                    .as_ref()
                    .expect("response stream correlation remains active")
                    .id();
                if frame.correlation_id != expected {
                    return Err(ProtocolError::UnknownCorrelation(frame.correlation_id).into());
                }
                return protocol::decode_response_network_frame(self.role, &frame)
                    .map(Some)
                    .map_err(Into::into);
            }
            let Some(chunk) = self
                .stream
                .receive()
                .await
                .map_err(ClientError::Transport)?
            else {
                self.decoder.finish()?;
                let pending = self
                    .pending
                    .take()
                    .expect("response stream correlation remains active");
                let correlation_id = pending.id();
                pending.complete(correlation_id)?;
                return Ok(None);
            };
            self.decoder.push(&chunk);
        }
    }

    /// Cancels the transport stream and abandons its active correlation.
    pub async fn cancel(mut self) -> Result<(), ClientError<Stream::Error>> {
        self.pending.take();
        self.stream.cancel().await.map_err(ClientError::Transport)
    }
}

async fn receive_frame<Stream>(
    stream: &mut Stream,
    limits: protocol::Limits,
) -> Result<Option<protocol::NetworkFrame>, ClientError<Stream::Error>>
where
    Stream: BidirectionalStream,
{
    let mut decoder = NetworkFrameDecoder::new(limits);
    loop {
        if let Some(frame) = decoder.next_frame()? {
            return Ok(Some(frame));
        }
        let Some(chunk) = stream.receive().await.map_err(ClientError::Transport)? else {
            decoder.finish()?;
            return Ok(None);
        };
        decoder.push(&chunk);
    }
}

/// Failure from shared client connection or correlation state.
#[derive(Debug, Error)]
pub enum ClientStateError {
    /// The logical client connection is closed.
    #[error("Sea client is closed")]
    Closed,
    /// The logical client must reconnect before issuing requests.
    #[error("Sea client is disconnected")]
    Disconnected,
    /// A stream-scoped correlation invariant failed.
    #[error(transparent)]
    Protocol(#[from] ProtocolError),
    /// Shared state was poisoned by a panic.
    #[error("Sea client state is unavailable")]
    Poisoned,
}

#[derive(Debug)]
struct State {
    status: ConnectionStatus,
    next_correlation_id: u64,
    correlations: BTreeMap<StreamRole, CorrelationTracker>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ConnectionStatus {
    Connected,
    Disconnected,
    Closed,
}

/// Shared connection state used by every platform transport binding.
#[derive(Debug)]
pub struct ClientState {
    inner: Mutex<State>,
}

impl Default for ClientState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(State {
                status: ConnectionStatus::Connected,
                next_correlation_id: 1,
                correlations: BTreeMap::new(),
            }),
        }
    }
}

impl ClientState {
    /// Begins one stream-scoped request and returns its cancellation-safe guard.
    pub fn begin(
        self: &Arc<Self>,
        role: StreamRole,
    ) -> Result<PendingCorrelation, ClientStateError> {
        let mut state = self.inner.lock().map_err(|_| ClientStateError::Poisoned)?;
        match state.status {
            ConnectionStatus::Connected => {}
            ConnectionStatus::Disconnected => return Err(ClientStateError::Disconnected),
            ConnectionStatus::Closed => return Err(ClientStateError::Closed),
        }
        let correlation_id = state.next_correlation_id;
        state.next_correlation_id = correlation_id.wrapping_add(1).max(1);
        state
            .correlations
            .entry(role)
            .or_default()
            .begin(correlation_id)?;
        Ok(PendingCorrelation {
            client: Arc::downgrade(self),
            role,
            correlation_id,
            active: true,
        })
    }

    /// Marks the connection closed; future requests are rejected.
    pub fn close(&self) -> Result<(), ClientStateError> {
        let mut state = self.inner.lock().map_err(|_| ClientStateError::Poisoned)?;
        state.status = ConnectionStatus::Closed;
        state.correlations.clear();
        Ok(())
    }

    /// Marks the connection unavailable and abandons all active correlations.
    pub fn disconnect(&self) -> Result<(), ClientStateError> {
        let mut state = self.inner.lock().map_err(|_| ClientStateError::Poisoned)?;
        if state.status != ConnectionStatus::Closed {
            state.status = ConnectionStatus::Disconnected;
            state.correlations.clear();
        }
        Ok(())
    }

    /// Restores request admission after an explicit transport replacement.
    pub fn reconnect(&self) -> Result<(), ClientStateError> {
        let mut state = self.inner.lock().map_err(|_| ClientStateError::Poisoned)?;
        match state.status {
            ConnectionStatus::Connected | ConnectionStatus::Disconnected => {
                state.status = ConnectionStatus::Connected;
                Ok(())
            }
            ConnectionStatus::Closed => Err(ClientStateError::Closed),
        }
    }

    /// Returns whether the logical connection has been closed.
    pub fn is_closed(&self) -> Result<bool, ClientStateError> {
        Ok(self
            .inner
            .lock()
            .map_err(|_| ClientStateError::Poisoned)?
            .status
            == ConnectionStatus::Closed)
    }

    fn complete(&self, role: StreamRole, correlation_id: u64) -> Result<(), ClientStateError> {
        self.inner
            .lock()
            .map_err(|_| ClientStateError::Poisoned)?
            .correlations
            .entry(role)
            .or_default()
            .complete(correlation_id)?;
        Ok(())
    }

    fn abandon(&self, role: StreamRole, correlation_id: u64) {
        if let Ok(mut state) = self.inner.lock() {
            let _ = state
                .correlations
                .entry(role)
                .or_default()
                .complete(correlation_id);
        }
    }
}

/// One active request correlation that is abandoned automatically on cancellation.
#[derive(Debug)]
pub struct PendingCorrelation {
    client: Weak<ClientState>,
    role: StreamRole,
    correlation_id: u64,
    active: bool,
}

impl PendingCorrelation {
    /// Returns the assigned nonzero correlation ID.
    #[must_use]
    pub const fn id(&self) -> u64 {
        self.correlation_id
    }

    /// Completes this request after validating the response correlation.
    pub fn complete(mut self, response_id: u64) -> Result<(), ClientStateError> {
        if response_id != self.correlation_id {
            return Err(ProtocolError::UnknownCorrelation(response_id).into());
        }
        if let Some(client) = self.client.upgrade() {
            client.complete(self.role, self.correlation_id)?;
        }
        self.active = false;
        Ok(())
    }
}

impl Drop for PendingCorrelation {
    fn drop(&mut self) {
        if self.active
            && let Some(client) = self.client.upgrade()
        {
            client.abandon(self.role, self.correlation_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::VecDeque, convert::Infallible, sync::Arc};

    use async_trait::async_trait;

    use super::{Client, ClientState, ClientStateError};
    use crate::protocol::{self, ProtocolError, Request, Response, StreamRole};
    use crate::transport::{BidirectionalStream, ClientTransport};

    #[derive(Debug)]
    struct ScriptedTransport {
        chunks: Vec<Vec<u8>>,
    }

    #[derive(Debug)]
    struct ScriptedStream {
        chunks: VecDeque<Vec<u8>>,
    }

    #[async_trait]
    impl ClientTransport for ScriptedTransport {
        type Stream = ScriptedStream;
        type Error = Infallible;

        async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error> {
            Ok(ScriptedStream {
                chunks: self.chunks.clone().into(),
            })
        }

        fn disconnect(&self) -> Result<(), Self::Error> {
            Ok(())
        }
    }

    #[async_trait]
    impl BidirectionalStream for ScriptedStream {
        type Error = Infallible;

        async fn send(&mut self, _bytes: &[u8]) -> Result<(), Self::Error> {
            Ok(())
        }

        async fn finish(&mut self) -> Result<(), Self::Error> {
            Ok(())
        }

        async fn receive(&mut self) -> Result<Option<Vec<u8>>, Self::Error> {
            Ok(self.chunks.pop_front())
        }

        async fn cancel(&mut self) -> Result<(), Self::Error> {
            Ok(())
        }
    }

    #[test]
    fn correlations_are_scoped_completed_and_abandoned() {
        let state = Arc::new(ClientState::default());
        let first = state.begin(StreamRole::Author).expect("first request");
        let first_id = first.id();
        assert_ne!(first_id, 0);
        first.complete(first_id).expect("matching response");

        let cancelled = state.begin(StreamRole::Content).expect("cancelled request");
        let cancelled_id = cancelled.id();
        drop(cancelled);
        let next = state
            .begin(StreamRole::Content)
            .expect("request after cancellation");
        assert_ne!(next.id(), cancelled_id);
    }

    #[test]
    fn correlation_mismatch_and_closed_state_are_rejected() {
        let state = Arc::new(ClientState::default());
        let pending = state.begin(StreamRole::Event).expect("pending request");
        assert!(matches!(
            pending.complete(99),
            Err(ClientStateError::Protocol(
                ProtocolError::UnknownCorrelation(99)
            ))
        ));
        state.close().expect("close");
        assert!(matches!(
            state.begin(StreamRole::Event),
            Err(ClientStateError::Closed)
        ));
    }

    #[test]
    fn disconnect_abandons_requests_and_requires_explicit_recovery() {
        let state = Arc::new(ClientState::default());
        let pending = state.begin(StreamRole::Event).expect("pending request");
        state.disconnect().expect("disconnect");
        assert!(matches!(
            state.begin(StreamRole::Event),
            Err(ClientStateError::Disconnected)
        ));
        drop(pending);
        state.reconnect().expect("reconnect");
        state
            .begin(StreamRole::Event)
            .expect("request after recovery");
        state.close().expect("close");
        assert!(matches!(state.reconnect(), Err(ClientStateError::Closed)));
    }

    #[tokio::test]
    async fn shared_client_decodes_fragmented_unary_and_stream_responses() {
        let limits = protocol::Limits::default();
        let unary = protocol::encode_response_frame(
            StreamRole::Snapshot,
            1,
            &Response::Snapshot(None),
            limits,
        )
        .expect("unary response");
        let unary_client = Client::new(
            ScriptedTransport {
                chunks: unary.chunks(2).map(<[u8]>::to_vec).collect(),
            },
            limits,
        );
        assert_eq!(
            unary_client
                .request(Request::LatestSnapshot)
                .await
                .expect("unary request"),
            Response::Snapshot(None)
        );

        let first = protocol::encode_response_frame(
            StreamRole::Event,
            1,
            &Response::CaughtUp(None),
            limits,
        )
        .expect("first stream response");
        let second = protocol::encode_response_frame(
            StreamRole::Event,
            1,
            &Response::CaughtUp(Some(2)),
            limits,
        )
        .expect("second stream response");
        let stream_client = Client::new(
            ScriptedTransport {
                chunks: vec![[first, second].concat()],
            },
            limits,
        );
        let mut responses = stream_client
            .request_stream(Request::Load { required: None })
            .await
            .expect("stream request");
        assert_eq!(
            responses.next().await.expect("first item"),
            Some(Response::CaughtUp(None))
        );
        assert_eq!(
            responses.next().await.expect("second item"),
            Some(Response::CaughtUp(Some(2)))
        );
        assert_eq!(responses.next().await.expect("stream EOF"), None);
    }
}
