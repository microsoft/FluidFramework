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
    /// A correlated response ended before its required value arrived.
    ResponseEnded,
    /// An event stream did not begin with its authority response.
    UnexpectedResponse(Response),
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

    /// Opens an event stream and consumes its authority handshake.
    pub async fn open_event_stream(
        &self,
        request: Request,
    ) -> Result<EventStream<Transport::Stream>, ClientError<Transport::Error>> {
        let pending = self.state.begin(StreamRole::Event)?;
        let correlation_id = pending.id();
        let outgoing = protocol::encode_request_frame(
            StreamRole::Event,
            correlation_id,
            &request,
            self.limits,
        )?;
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
        let mut responses = ResponseStream {
            stream,
            role: StreamRole::Event,
            pending: Some(pending),
            decoder: NetworkFrameDecoder::new(self.limits),
        };
        let response = responses.next().await?.ok_or(ClientError::ResponseEnded)?;
        let Response::EventStreamOpened { authority } = response else {
            return Err(ClientError::UnexpectedResponse(response));
        };
        self.state.set_authority(authority.clone())?;
        Ok(EventStream {
            authority,
            responses,
        })
    }

    /// Opens the ordered author stream bound to this client's event-stream authority.
    pub async fn open_author_stream(
        &self,
    ) -> Result<AuthorStream<Transport::Stream>, ClientError<Transport::Error>> {
        let authority = self.state.authority()?;
        let pending = self.state.begin(StreamRole::Author)?;
        let correlation_id = pending.id();
        let request = Request::OpenAuthorStream { authority };
        let outgoing = protocol::encode_request_frame(
            StreamRole::Author,
            correlation_id,
            &request,
            self.limits,
        )?;
        let mut stream = self
            .transport
            .open_bidirectional()
            .await
            .map_err(ClientError::Transport)?;
        stream
            .send(&outgoing)
            .await
            .map_err(ClientError::Transport)?;
        let mut decoder = NetworkFrameDecoder::new(self.limits);
        let frame = receive_next_frame(&mut stream, &mut decoder)
            .await?
            .ok_or(ClientError::ResponseEnded)?;
        pending.complete(frame.correlation_id)?;
        let response = protocol::decode_response_network_frame(StreamRole::Author, &frame)?;
        if response != Response::Acknowledged {
            return Err(ClientError::UnexpectedResponse(response));
        }
        Ok(AuthorStream {
            stream,
            state: Arc::clone(&self.state),
            limits: self.limits,
            decoder,
        })
    }

    /// Opens snapshot coordination bound to this client's event-stream authority.
    pub async fn open_snapshot_stream(
        &self,
        eligible: bool,
        willing: bool,
    ) -> Result<SnapshotStream<Transport::Stream>, ClientError<Transport::Error>> {
        let authority = self.state.authority()?;
        let pending = self.state.begin(StreamRole::Snapshot)?;
        let correlation_id = pending.id();
        let request = Request::OpenSnapshotStream {
            authority,
            eligible,
            willing,
        };
        let outgoing = protocol::encode_request_frame(
            StreamRole::Snapshot,
            correlation_id,
            &request,
            self.limits,
        )?;
        let mut stream = self
            .transport
            .open_bidirectional()
            .await
            .map_err(ClientError::Transport)?;
        stream
            .send(&outgoing)
            .await
            .map_err(ClientError::Transport)?;
        let mut decoder = NetworkFrameDecoder::new(self.limits);
        let frame = receive_next_frame(&mut stream, &mut decoder)
            .await?
            .ok_or(ClientError::ResponseEnded)?;
        pending.complete(frame.correlation_id)?;
        let response = protocol::decode_response_network_frame(StreamRole::Snapshot, &frame)?;
        if response != Response::Acknowledged {
            return Err(ClientError::UnexpectedResponse(response));
        }
        let mut snapshot = SnapshotStream {
            stream,
            state: Arc::clone(&self.state),
            limits: self.limits,
            decoder,
            latest: None,
            fence: None,
        };
        snapshot.next_coordination().await?;
        Ok(snapshot)
    }

    /// Opens the reusable content stream bound to event-stream authority.
    pub async fn open_content_stream(
        &self,
    ) -> Result<ContentStream<Transport::Stream>, ClientError<Transport::Error>> {
        let authority = self.state.authority()?;
        let pending = self.state.begin(StreamRole::Content)?;
        let correlation_id = pending.id();
        let request = Request::OpenContentStream { authority };
        let outgoing = protocol::encode_request_frame(
            StreamRole::Content,
            correlation_id,
            &request,
            self.limits,
        )?;
        let mut stream = self
            .transport
            .open_bidirectional()
            .await
            .map_err(ClientError::Transport)?;
        stream
            .send(&outgoing)
            .await
            .map_err(ClientError::Transport)?;
        let mut decoder = NetworkFrameDecoder::new(self.limits);
        let frame = receive_next_frame(&mut stream, &mut decoder)
            .await?
            .ok_or(ClientError::ResponseEnded)?;
        pending.complete(frame.correlation_id)?;
        let response = protocol::decode_response_network_frame(StreamRole::Content, &frame)?;
        if response != Response::Acknowledged {
            return Err(ClientError::UnexpectedResponse(response));
        }
        Ok(ContentStream {
            stream,
            state: Arc::clone(&self.state),
            limits: self.limits,
            decoder,
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

/// Open event stream after its authority handshake has completed.
#[derive(Debug)]
pub struct EventStream<Stream> {
    authority: Vec<u8>,
    responses: ResponseStream<Stream>,
}

/// Ordered author requests and receipts on one persistent transport stream.
#[derive(Debug)]
pub struct AuthorStream<Stream> {
    stream: Stream,
    state: Arc<ClientState>,
    limits: protocol::Limits,
    decoder: NetworkFrameDecoder,
}

/// Latest-value coordination and fenced requests on one persistent snapshot stream.
#[derive(Debug)]
pub struct SnapshotStream<Stream> {
    stream: Stream,
    state: Arc<ClientState>,
    limits: protocol::Limits,
    decoder: NetworkFrameDecoder,
    latest: Option<protocol::Snapshot>,
    fence: Option<u64>,
}

/// Correlated bounded operations on one reusable content stream.
#[derive(Debug)]
pub struct ContentStream<Stream> {
    stream: Stream,
    state: Arc<ClientState>,
    limits: protocol::Limits,
    decoder: NetworkFrameDecoder,
}

impl<Stream> ContentStream<Stream>
where
    Stream: BidirectionalStream,
{
    /// Sends one content operation and collects responses through explicit completion.
    pub async fn request(
        &mut self,
        request: Request,
    ) -> Result<Vec<Response>, ClientError<Stream::Error>> {
        let pending = self.state.begin(StreamRole::Content)?;
        let correlation_id = pending.id();
        let outgoing = protocol::encode_request_frame(
            StreamRole::Content,
            correlation_id,
            &request,
            self.limits,
        )?;
        self.stream
            .send(&outgoing)
            .await
            .map_err(ClientError::Transport)?;
        let mut responses = Vec::new();
        loop {
            let frame = receive_next_frame(&mut self.stream, &mut self.decoder)
                .await?
                .ok_or(ClientError::ResponseEnded)?;
            if frame.correlation_id != correlation_id {
                return Err(ProtocolError::UnknownCorrelation(frame.correlation_id).into());
            }
            let response = protocol::decode_response_network_frame(StreamRole::Content, &frame)?;
            if response == Response::ResponseComplete {
                pending.complete(correlation_id)?;
                return Ok(responses);
            }
            responses.push(response);
        }
    }

    /// Finishes the reusable content stream.
    pub async fn close(mut self) -> Result<(), ClientError<Stream::Error>> {
        self.stream.finish().await.map_err(ClientError::Transport)
    }
}

impl<Stream> SnapshotStream<Stream>
where
    Stream: BidirectionalStream,
{
    /// Returns the latest accepted snapshot observed on this stream.
    #[must_use]
    pub fn latest(&self) -> Option<&protocol::Snapshot> {
        self.latest.as_ref()
    }

    /// Returns the current nomination fence, when this client is nominated.
    #[must_use]
    pub const fn fence(&self) -> Option<u64> {
        self.fence
    }

    /// Waits for and applies the next latest-value coordination notification.
    pub async fn next_coordination(&mut self) -> Result<(), ClientError<Stream::Error>> {
        let frame = receive_next_frame(&mut self.stream, &mut self.decoder)
            .await?
            .ok_or(ClientError::ResponseEnded)?;
        if frame.correlation_id != 0 {
            return Err(ProtocolError::UnknownCorrelation(frame.correlation_id).into());
        }
        let response = protocol::decode_response_network_frame(StreamRole::Snapshot, &frame)?;
        if let Response::SnapshotCoordination { latest, fence } = response {
            self.latest = latest;
            self.fence = fence;
            return Ok(());
        }
        Err(ClientError::UnexpectedResponse(response))
    }

    /// Sends one correlated snapshot operation while retaining interleaved coordination updates.
    pub async fn request(
        &mut self,
        request: Request,
    ) -> Result<Response, ClientError<Stream::Error>> {
        let pending = self.state.begin(StreamRole::Snapshot)?;
        let correlation_id = pending.id();
        let outgoing = protocol::encode_request_frame(
            StreamRole::Snapshot,
            correlation_id,
            &request,
            self.limits,
        )?;
        self.stream
            .send(&outgoing)
            .await
            .map_err(ClientError::Transport)?;
        loop {
            let frame = receive_next_frame(&mut self.stream, &mut self.decoder)
                .await?
                .ok_or(ClientError::ResponseEnded)?;
            if frame.correlation_id == 0 {
                let response =
                    protocol::decode_response_network_frame(StreamRole::Snapshot, &frame)?;
                let Response::SnapshotCoordination { latest, fence } = response else {
                    return Err(ClientError::UnexpectedResponse(response));
                };
                self.latest = latest;
                self.fence = fence;
                continue;
            }
            pending.complete(frame.correlation_id)?;
            return protocol::decode_response_network_frame(StreamRole::Snapshot, &frame)
                .map_err(Into::into);
        }
    }

    /// Finishes the stream so the server revokes publisher membership.
    pub async fn close(mut self) -> Result<(), ClientError<Stream::Error>> {
        self.stream.finish().await.map_err(ClientError::Transport)
    }
}

impl<Stream> AuthorStream<Stream>
where
    Stream: BidirectionalStream,
{
    /// Sends one author-role request and receives its ordered response.
    pub async fn request(
        &mut self,
        request: Request,
    ) -> Result<Response, ClientError<Stream::Error>> {
        if request.stream_role() != StreamRole::Author
            || matches!(request, Request::OpenAuthorStream { .. })
        {
            return Err(ProtocolError::WrongStream {
                kind: request.kind(),
                role: StreamRole::Author,
            }
            .into());
        }
        let pending = self.state.begin(StreamRole::Author)?;
        let correlation_id = pending.id();
        let outgoing = protocol::encode_request_frame(
            StreamRole::Author,
            correlation_id,
            &request,
            self.limits,
        )?;
        self.stream
            .send(&outgoing)
            .await
            .map_err(ClientError::Transport)?;
        let frame = receive_next_frame(&mut self.stream, &mut self.decoder)
            .await?
            .ok_or(ClientError::ResponseEnded)?;
        pending.complete(frame.correlation_id)?;
        protocol::decode_response_network_frame(StreamRole::Author, &frame).map_err(Into::into)
    }

    /// Finishes the author stream and closes shared client state.
    pub async fn close(mut self) -> Result<(), ClientError<Stream::Error>> {
        let pending = self.state.begin(StreamRole::Author)?;
        let correlation_id = pending.id();
        let request = Request::Close;
        let outgoing = protocol::encode_request_frame(
            StreamRole::Author,
            correlation_id,
            &request,
            self.limits,
        )?;
        self.stream
            .send(&outgoing)
            .await
            .map_err(ClientError::Transport)?;
        let _ = self.stream.finish().await;
        let frame = receive_next_frame(&mut self.stream, &mut self.decoder)
            .await?
            .ok_or(ClientError::ResponseEnded)?;
        pending.complete(frame.correlation_id)?;
        let response = protocol::decode_response_network_frame(StreamRole::Author, &frame)?;
        if response != Response::Acknowledged {
            return Err(ClientError::UnexpectedResponse(response));
        }
        self.state.close()?;
        Ok(())
    }
}

impl<Stream> EventStream<Stream>
where
    Stream: BidirectionalStream,
{
    /// Returns the opaque authority used to bind later logical streams.
    #[must_use]
    pub fn authority(&self) -> &[u8] {
        &self.authority
    }

    /// Receives the next recovery or live event-stream response.
    pub async fn next(&mut self) -> Result<Option<Response>, ClientError<Stream::Error>> {
        self.responses.next().await
    }

    /// Cancels this event stream and abandons its correlation.
    pub async fn cancel(self) -> Result<(), ClientError<Stream::Error>> {
        self.responses.cancel().await
    }

    /// Returns the recovery/live response stream after preserving its authority in client state.
    pub fn into_responses(self) -> ResponseStream<Stream> {
        self.responses
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

async fn receive_next_frame<Stream>(
    stream: &mut Stream,
    decoder: &mut NetworkFrameDecoder,
) -> Result<Option<protocol::NetworkFrame>, ClientError<Stream::Error>>
where
    Stream: BidirectionalStream,
{
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
    /// An event stream must establish authority before another logical stream opens.
    #[error("Sea event stream is not open")]
    MissingAuthority,
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
    authority: Option<Vec<u8>>,
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
                authority: None,
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
        state.authority = None;
        state.correlations.clear();
        Ok(())
    }

    /// Marks the connection unavailable and abandons all active correlations.
    pub fn disconnect(&self) -> Result<(), ClientStateError> {
        let mut state = self.inner.lock().map_err(|_| ClientStateError::Poisoned)?;
        if state.status != ConnectionStatus::Closed {
            state.status = ConnectionStatus::Disconnected;
            state.authority = None;
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

    fn set_authority(&self, authority: Vec<u8>) -> Result<(), ClientStateError> {
        let mut state = self.inner.lock().map_err(|_| ClientStateError::Poisoned)?;
        state.authority = Some(authority);
        Ok(())
    }

    fn authority(&self) -> Result<Vec<u8>, ClientStateError> {
        self.inner
            .lock()
            .map_err(|_| ClientStateError::Poisoned)?
            .authority
            .clone()
            .ok_or(ClientStateError::MissingAuthority)
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
    use std::{
        collections::VecDeque,
        convert::Infallible,
        sync::{Arc, Mutex},
    };

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

    #[derive(Debug)]
    struct SequencedTransport {
        streams: Mutex<VecDeque<Vec<Vec<u8>>>>,
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
    impl ClientTransport for SequencedTransport {
        type Stream = ScriptedStream;
        type Error = Infallible;

        async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error> {
            Ok(ScriptedStream {
                chunks: self
                    .streams
                    .lock()
                    .expect("scripted streams")
                    .pop_front()
                    .expect("another scripted stream")
                    .into(),
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
    async fn shared_client_decodes_fragmented_and_coalesced_event_responses() {
        let limits = protocol::Limits::default();
        let opened = protocol::encode_response_frame(
            StreamRole::Event,
            1,
            &Response::EventStreamOpened {
                authority: vec![9; 32],
            },
            limits,
        )
        .expect("event stream opening");
        let caught_up = protocol::encode_response_frame(
            StreamRole::Event,
            1,
            &Response::CaughtUp(Some(2)),
            limits,
        )
        .expect("event stream item");
        let event_client = Client::new(
            ScriptedTransport {
                chunks: [opened, caught_up]
                    .concat()
                    .chunks(2)
                    .map(<[u8]>::to_vec)
                    .collect(),
            },
            limits,
        );
        let mut event_stream = event_client
            .open_event_stream(Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: b"archive".to_vec(),
                intent: protocol::ArchiveIntent::Open,
                author: b"author".to_vec(),
                session: b"session".to_vec(),
                resume_after: Some(1),
            })
            .await
            .expect("event stream");
        assert_eq!(event_stream.authority(), &[9; 32]);
        assert_eq!(
            event_stream.next().await.expect("event item"),
            Some(Response::CaughtUp(Some(2)))
        );
    }

    #[tokio::test]
    async fn shared_author_stream_binds_authority_and_orders_receipts() {
        let limits = protocol::Limits::default();
        let event_opened = protocol::encode_response_frame(
            StreamRole::Event,
            1,
            &Response::EventStreamOpened {
                authority: vec![9; 32],
            },
            limits,
        )
        .expect("event opening");
        let author_opened =
            protocol::encode_response_frame(StreamRole::Author, 2, &Response::Acknowledged, limits)
                .expect("author opening");
        let committed = protocol::encode_response_frame(
            StreamRole::Author,
            3,
            &Response::EventCommitted {
                position: 4,
                durability: protocol::WireDurability::Durable,
            },
            limits,
        )
        .expect("author receipt");
        let client = Client::new(
            SequencedTransport {
                streams: Mutex::new(
                    vec![
                        vec![event_opened],
                        vec![[author_opened, committed].concat()],
                    ]
                    .into(),
                ),
            },
            limits,
        );
        let _events = client
            .open_event_stream(Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: b"archive".to_vec(),
                intent: protocol::ArchiveIntent::Open,
                author: b"author".to_vec(),
                session: b"session".to_vec(),
                resume_after: None,
            })
            .await
            .expect("event stream");
        let mut author = client.open_author_stream().await.expect("author stream");
        assert_eq!(
            author
                .request(Request::Submit {
                    operation: b"operation".to_vec(),
                    reference: None,
                    event: protocol::Event {
                        payload: b"event".to_vec(),
                        blob_tree: None,
                    },
                })
                .await
                .expect("submission"),
            Response::EventCommitted {
                position: 4,
                durability: protocol::WireDurability::Durable,
            }
        );
    }
}
