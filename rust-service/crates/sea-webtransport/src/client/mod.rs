//! Platform-independent Sea client connection state.

use std::sync::{Arc, Mutex};

use thiserror::Error;

use crate::protocol::{self, NetworkFrameDecoder, ProtocolError, Request, Response, StreamRole};
use crate::transport::{BidirectionalStream, ClientTransport};

mod framed;
use framed::FramedStream;

#[cfg(all(test, not(target_arch = "wasm32")))]
mod deadline_tests;

/// Failure from the shared protocol client.
#[derive(Debug)]
pub enum ClientError<TransportError> {
    /// A native request or partial frame exceeded its absolute deadline.
    #[cfg(not(target_arch = "wasm32"))]
    Timeout,
    /// A mutating request timed out without establishing whether it committed.
    #[cfg(not(target_arch = "wasm32"))]
    AmbiguousTimeout,
    /// Shared connection lifecycle state failed.
    State(ClientStateError),
    /// A network frame violated the Sea protocol.
    Protocol(ProtocolError),
    /// A transport primitive failed.
    Transport(TransportError),
    /// An ordered response ended before its required value arrived.
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

    /// Opens independent signal membership without event or author authority.
    pub async fn open_signal_stream(
        &self,
        opening: protocol::signals::OpenSignals,
    ) -> Result<SignalStream<Transport::Stream>, ClientError<Transport::Error>> {
        self.state.check_connected()?;
        let outgoing = protocol::encode_request_frame(
            StreamRole::Signal,
            &Request::OpenSignalStream(opening),
            self.limits,
        )?;
        let mut stream = FramedStream::open(&self.transport, self.limits).await?;
        stream.send(&outgoing).await?;
        let frame = stream.receive().await?.ok_or(ClientError::ResponseEnded)?;

        let response = protocol::decode_response_network_frame(StreamRole::Signal, &frame)?;
        if response != Response::Acknowledged {
            return Err(ClientError::UnexpectedResponse(response));
        }
        Ok(SignalStream {
            terminal: false,
            stream,
            state: self.state.clone(),
            limits: self.limits,
        })
    }

    /// Reports whether the signal handshake can offer incoming datagrams.
    pub fn supports_datagrams(&self) -> bool {
        self.transport.supports_datagrams()
    }

    /// Sends an explicitly best-effort message, or requests reliable fallback before admission.
    pub async fn send_signal_datagram(
        &self,
        submission: &protocol::signals::Submission,
    ) -> Result<bool, ClientError<Transport::Error>>
    where
        Transport: sea_core::SessionBounds,
    {
        self.state.check_connected()?;
        let bytes = protocol::encode_request_frame(
            StreamRole::Signal,
            &Request::SendSignal(submission.clone()),
            self.limits,
        )?;
        self.transport
            .send_datagram(&bytes)
            .await
            .map_err(ClientError::Transport)
    }

    /// Receives exactly one framed best-effort message, rejecting reliable/control datagrams.
    pub async fn receive_signal_datagram(
        &self,
    ) -> Result<protocol::signals::Event, ClientError<Transport::Error>>
    where
        Transport: sea_core::SessionBounds,
    {
        self.state.check_connected()?;
        let bytes = self
            .transport
            .receive_datagram()
            .await
            .map_err(ClientError::Transport)?;
        let mut decoder = NetworkFrameDecoder::new(self.limits);
        decoder.push(&bytes);
        let frame = decoder.next_frame()?.ok_or(ClientError::ResponseEnded)?;
        decoder.finish()?;
        let response = protocol::decode_response_network_frame(StreamRole::Signal, &frame)?;
        match response {
            Response::SignalEvent(
                event @ protocol::signals::Event::Message {
                    submission:
                        protocol::signals::Submission {
                            best_effort: true, ..
                        },
                    ..
                },
            ) => Ok(event),
            response => Err(ClientError::UnexpectedResponse(response)),
        }
    }

    /// Opens an event stream and consumes its authority handshake.
    pub async fn open_event_stream(
        &self,
        request: Request,
    ) -> Result<EventStream<Transport::Stream>, ClientError<Transport::Error>> {
        self.state.check_connected()?;

        let outgoing = protocol::encode_request_frame(StreamRole::Event, &request, self.limits)?;
        let mut stream = FramedStream::open(&self.transport, self.limits).await?;
        stream.send(&outgoing).await?;
        stream.finish().await?;
        let mut responses = ResponseStream {
            ended: false,
            subscription: true,
            stream,
            role: StreamRole::Event,
        };
        let response = responses.next().await?.ok_or(ClientError::ResponseEnded)?;
        let Response::EventStreamOpened {
            session,
            document,
            authority,
        } = response
        else {
            return Err(ClientError::UnexpectedResponse(response));
        };
        self.state.set_authority(authority.clone())?;
        responses.stream.end_request();
        Ok(EventStream {
            session,
            document,
            authority,
            responses,
        })
    }

    /// Opens the ordered author stream bound to this client's event-stream authority.
    pub async fn open_author_stream(
        &self,
    ) -> Result<AuthorStream<Transport::Stream>, ClientError<Transport::Error>> {
        let authority = self.state.authority()?;
        self.state.check_connected()?;

        let request = Request::OpenAuthorStream { authority };
        let outgoing = protocol::encode_request_frame(StreamRole::Author, &request, self.limits)?;
        let mut stream = FramedStream::open(&self.transport, self.limits).await?;
        stream.send(&outgoing).await?;
        let frame = stream.receive().await?.ok_or(ClientError::ResponseEnded)?;

        let response = protocol::decode_response_network_frame(StreamRole::Author, &frame)?;
        if response != Response::Acknowledged {
            return Err(ClientError::UnexpectedResponse(response));
        }
        stream.end_request();
        Ok(AuthorStream {
            terminal: false,
            stream,
            state: Arc::clone(&self.state),
            limits: self.limits,
        })
    }

    /// Opens snapshot coordination bound to this client's event-stream authority.
    pub async fn open_snapshot_stream(
        &self,
        participation: protocol::SnapshotParticipation,
    ) -> Result<SnapshotStream<Transport::Stream>, ClientError<Transport::Error>> {
        let authority = self.state.authority()?;
        self.state.check_connected()?;

        let request = Request::OpenSnapshotStream {
            authority,
            participation,
        };
        let outgoing = protocol::encode_request_frame(StreamRole::Snapshot, &request, self.limits)?;
        let mut stream = FramedStream::open(&self.transport, self.limits).await?;
        stream.send(&outgoing).await?;
        let frame = stream.receive().await?.ok_or(ClientError::ResponseEnded)?;

        let response = protocol::decode_response_network_frame(StreamRole::Snapshot, &frame)?;
        if response != Response::Acknowledged {
            return Err(ClientError::UnexpectedResponse(response));
        }
        let mut snapshot = SnapshotStream {
            terminal: false,
            stream,
            state: Arc::clone(&self.state),
            limits: self.limits,
            latest: None,
            fence: None,
        };
        snapshot.next_coordination().await?;
        snapshot.stream.end_request();
        Ok(snapshot)
    }

    /// Opens the reusable content stream bound to event-stream authority.
    pub async fn open_content_stream(
        &self,
    ) -> Result<ContentStream<Transport::Stream>, ClientError<Transport::Error>> {
        let authority = self.state.authority()?;
        self.state.check_connected()?;

        let request = Request::OpenContentStream { authority };
        let outgoing = protocol::encode_request_frame(StreamRole::Content, &request, self.limits)?;
        let mut stream = FramedStream::open(&self.transport, self.limits).await?;
        stream.send(&outgoing).await?;
        let frame = stream.receive().await?.ok_or(ClientError::ResponseEnded)?;

        let response = protocol::decode_response_network_frame(StreamRole::Content, &frame)?;
        if response != Response::Acknowledged {
            return Err(ClientError::UnexpectedResponse(response));
        }
        stream.end_request();
        Ok(ContentStream {
            terminal: false,
            stream,
            state: Arc::clone(&self.state),
            limits: self.limits,
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

    /// Attempts physical disconnect and abandons logical authority even if it fails.
    ///
    /// Returns the physical transport error after disabling request admission.
    /// Recovery requires explicitly reconnecting or replacing the transport and opening a fresh session.
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
    /// Sequencer-allocated session identity from the opening handshake.
    pub(crate) session: u64,
    /// Backend identity returned by the opening handshake.
    document: Vec<u8>,
    authority: Vec<u8>,
    responses: ResponseStream<Stream>,
}

/// Ordered author requests and receipts on one persistent transport stream.
#[derive(Debug)]
pub struct AuthorStream<Stream> {
    /// Set before awaiting a request; only a successful response permits another request.
    terminal: bool,
    stream: FramedStream<Stream>,
    state: Arc<ClientState>,
    limits: protocol::Limits,
}

/// One independently pumped ephemeral signal stream.
pub struct SignalStream<Stream> {
    /// A cancelled or failed exchange cannot be reused.
    terminal: bool,
    /// Sole owner of network reads and writes.
    stream: FramedStream<Stream>,
    /// Connection lifecycle shared with other logical streams.
    state: Arc<ClientState>,
    /// Encoded frame bound.
    limits: protocol::Limits,
}

impl<Stream: BidirectionalStream> SignalStream<Stream> {
    /// Receives an unsolicited signal or terminal service error.
    pub async fn next(&mut self) -> Result<protocol::signals::Event, ClientError<Stream::Error>> {
        if self.terminal {
            let _ = self.stream.cancel().await;
            return Err(ClientStateError::Closed.into());
        }
        let frame = self
            .stream
            .receive()
            .await?
            .ok_or(ClientError::ResponseEnded)?;
        let response = protocol::decode_response_network_frame(StreamRole::Signal, &frame)?;
        match response {
            Response::SignalEvent(event) => {
                self.stream.end_request();
                Ok(event)
            }
            response => Err(ClientError::UnexpectedResponse(response)),
        }
    }

    /// Exchanges one submission while forwarding interleaved live events without buffering them unboundedly.
    pub async fn request(
        &mut self,
        request: Request,
        mut receive: impl FnMut(protocol::signals::Event) -> Result<(), ClientError<Stream::Error>>,
    ) -> Result<(), ClientError<Stream::Error>> {
        if std::mem::replace(&mut self.terminal, true) {
            let _ = self.stream.cancel().await;
            return Err(ClientStateError::Closed.into());
        }
        self.state.check_connected()?;
        let outgoing = protocol::encode_request_frame(StreamRole::Signal, &request, self.limits)?;
        self.stream.begin_request();
        self.stream.send(&outgoing).await?;
        loop {
            let frame = self
                .stream
                .receive()
                .await?
                .ok_or(ClientError::ResponseEnded)?;
            let response = protocol::decode_response_network_frame(StreamRole::Signal, &frame)?;
            if let Response::SignalEvent(event) = response {
                receive(event)?;
                continue;
            }

            return if response == Response::Acknowledged {
                self.stream.end_request();
                self.terminal = false;
                Ok(())
            } else {
                Err(ClientError::UnexpectedResponse(response))
            };
        }
    }

    /// Cancels both directions, releasing remote signal membership.
    pub async fn cancel(&mut self) {
        let _ = self.stream.cancel().await;
    }
}

/// Latest-value coordination and fenced requests on one persistent snapshot stream.
#[derive(Debug)]
pub struct SnapshotStream<Stream> {
    /// A cancelled or failed exchange cannot be reused.
    terminal: bool,
    stream: FramedStream<Stream>,
    state: Arc<ClientState>,
    limits: protocol::Limits,
    latest: Option<u64>,
    fence: Option<u64>,
}

/// Ordered bounded operations on one reusable content stream.
#[derive(Debug)]
pub struct ContentStream<Stream> {
    /// A cancelled or failed exchange cannot be reused.
    terminal: bool,
    stream: FramedStream<Stream>,
    state: Arc<ClientState>,
    limits: protocol::Limits,
}

impl<Stream> ContentStream<Stream>
where
    Stream: BidirectionalStream,
{
    /// Sends one content operation and returns its owned response stream.
    /// Native monitored reads bound their first response, then permit idle waits.
    /// Other requests retain their budget through `ResponseComplete`, including consumer pauses.
    pub async fn request_stream(
        mut self,
        request: Request,
    ) -> Result<ResponseStream<Stream>, ClientError<Stream::Error>> {
        if self.terminal {
            let _ = self.stream.cancel().await;
            return Err(ClientStateError::Closed.into());
        }
        self.state.check_connected()?;

        let outgoing = protocol::encode_request_frame(StreamRole::Content, &request, self.limits)?;
        self.stream.begin_request();
        self.stream.send(&outgoing).await?;
        self.stream.finish().await?;
        Ok(ResponseStream {
            ended: false,
            subscription: matches!(request, Request::Read { .. }),
            stream: self.stream,
            role: StreamRole::Content,
        })
    }

    /// Sends one content operation and collects responses through explicit completion.
    pub async fn request(
        &mut self,
        request: Request,
    ) -> Result<Vec<Response>, ClientError<Stream::Error>> {
        if std::mem::replace(&mut self.terminal, true) {
            let _ = self.stream.cancel().await;
            return Err(ClientStateError::Closed.into());
        }
        self.state.check_connected()?;

        let outgoing = protocol::encode_request_frame(StreamRole::Content, &request, self.limits)?;
        self.stream.begin_request();
        self.stream.send(&outgoing).await?;
        let mut responses = Vec::new();
        loop {
            let frame = self
                .stream
                .receive()
                .await?
                .ok_or(ClientError::ResponseEnded)?;
            let response = protocol::decode_response_network_frame(StreamRole::Content, &frame)?;
            if response == Response::ResponseComplete {
                self.stream.end_request();
                self.terminal = false;
                return Ok(responses);
            }
            responses.push(response);
        }
    }

    /// Finishes the reusable content stream.
    pub async fn close(mut self) -> Result<(), ClientError<Stream::Error>> {
        self.stream.begin_request();
        self.stream.finish().await
    }
}

impl<Stream> SnapshotStream<Stream>
where
    Stream: BidirectionalStream,
{
    /// Returns the latest accepted snapshot observed on this stream.
    #[must_use]
    pub const fn latest(&self) -> Option<u64> {
        self.latest
    }

    /// Returns the current nomination fence, when this client is nominated.
    #[must_use]
    pub const fn fence(&self) -> Option<u64> {
        self.fence
    }

    /// Waits for and applies the next latest-value coordination notification.
    pub async fn next_coordination(&mut self) -> Result<(), ClientError<Stream::Error>> {
        if self.terminal {
            let _ = self.stream.cancel().await;
            return Err(ClientStateError::Closed.into());
        }
        let frame = self
            .stream
            .receive()
            .await?
            .ok_or(ClientError::ResponseEnded)?;
        let response = protocol::decode_response_network_frame(StreamRole::Snapshot, &frame)?;
        if let Response::SnapshotCoordination { latest, fence } = response {
            self.latest = latest;
            self.fence = fence;
            return Ok(());
        }
        Err(ClientError::UnexpectedResponse(response))
    }

    /// Sends one ordered snapshot operation while retaining interleaved coordination updates.
    /// A native publication timeout leaves commitment unknown and ends the stream.
    pub async fn request(
        &mut self,
        request: Request,
    ) -> Result<Response, ClientError<Stream::Error>> {
        #[cfg(not(target_arch = "wasm32"))]
        let publishing = matches!(request, Request::PublishSnapshot { .. });
        let result = self.request_inner(request).await;
        #[cfg(not(target_arch = "wasm32"))]
        if publishing && matches!(result, Err(ClientError::Timeout)) {
            return Err(ClientError::AmbiguousTimeout);
        }
        result
    }

    /// Exchanges a request under terminal-by-default state and one timeout budget.
    async fn request_inner(
        &mut self,
        request: Request,
    ) -> Result<Response, ClientError<Stream::Error>> {
        if std::mem::replace(&mut self.terminal, true) {
            let _ = self.stream.cancel().await;
            return Err(ClientStateError::Closed.into());
        }
        self.state.check_connected()?;

        let outgoing = protocol::encode_request_frame(StreamRole::Snapshot, &request, self.limits)?;
        self.stream.begin_request();
        self.stream.send(&outgoing).await?;
        loop {
            let frame = self
                .stream
                .receive()
                .await?
                .ok_or(ClientError::ResponseEnded)?;
            let response = protocol::decode_response_network_frame(StreamRole::Snapshot, &frame)?;
            if let Response::SnapshotCoordination { latest, fence } = response {
                self.latest = latest;
                self.fence = fence;
                continue;
            }

            let completed = matches!(
                (&request, &response),
                (_, Response::Error { .. })
                    | (Request::Close, Response::Acknowledged)
                    | (
                        Request::LatestSnapshot | Request::PublishSnapshot { .. },
                        Response::Snapshot(_)
                    )
            );
            if !completed {
                return Err(ClientError::UnexpectedResponse(response));
            }
            self.stream.end_request();
            self.terminal = false;
            return Ok(response);
        }
    }

    /// Finishes the stream so the server revokes publisher membership.
    pub async fn close(mut self) -> Result<(), ClientError<Stream::Error>> {
        self.stream.begin_request();
        self.stream.finish().await
    }

    /// Cancels both directions when the registration owner ends, including on pump cancellation.
    pub(crate) async fn cancel(&mut self) {
        self.terminal = true;
        let _ = self.stream.cancel().await;
    }
}

impl<Stream> AuthorStream<Stream>
where
    Stream: BidirectionalStream,
{
    /// Sends one author-role request and receives its matching ordered response.
    /// An unexpected receipt ends this stream's authority before another request can be sent.
    /// A native append timeout is ambiguous; this client never resubmits it.
    pub async fn request(
        &mut self,
        request: Request,
    ) -> Result<Response, ClientError<Stream::Error>> {
        if std::mem::replace(&mut self.terminal, true) {
            let _ = self.stream.cancel().await;
            return Err(ClientStateError::Closed.into());
        }
        #[cfg(not(target_arch = "wasm32"))]
        let appending = matches!(
            request,
            Request::Submit { .. } | Request::AnnounceMembership { .. }
        );
        let result = self.request_inner(request).await;
        if matches!(&result, Ok(response) if !matches!(response, Response::Error { .. })) {
            self.stream.end_request();
            self.terminal = false;
        } else {
            let _ = self.stream.cancel().await;
        }
        #[cfg(not(target_arch = "wasm32"))]
        if appending && matches!(result, Err(ClientError::Timeout)) {
            return Err(ClientError::AmbiguousTimeout);
        }
        result
    }

    /// Exchanges one request while terminal-by-default state protects cancellation.
    async fn request_inner(
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
        self.state.check_connected()?;

        let outgoing = protocol::encode_request_frame(StreamRole::Author, &request, self.limits)?;
        self.stream.begin_request();
        self.stream.send(&outgoing).await?;
        let frame = self
            .stream
            .receive()
            .await?
            .ok_or(ClientError::ResponseEnded)?;

        let response = protocol::decode_response_network_frame(StreamRole::Author, &frame)?;
        if matches!(
            (&request, &response),
            (_, Response::Error { .. })
                | (Request::Close, Response::Acknowledged)
                | (
                    Request::Submit { .. } | Request::AnnounceMembership { .. },
                    Response::EventCommitted { .. }
                )
        ) {
            Ok(response)
        } else {
            Err(ClientError::UnexpectedResponse(response))
        }
    }

    /// Finishes the author stream and closes shared client state.
    pub async fn close(self) -> Result<(), ClientError<Stream::Error>> {
        let state = Arc::clone(&self.state);
        self.finish().await?;
        state.close()?;
        Ok(())
    }

    /// Finishes this author stream while allowing another session to open.
    /// The `Close` acknowledgement completes the exchange; transport half-close is not required.
    pub async fn finish(mut self) -> Result<(), ClientError<Stream::Error>> {
        if self.terminal {
            return self.stream.cancel().await;
        }
        self.state.check_connected()?;

        let request = Request::Close;
        let outgoing = protocol::encode_request_frame(StreamRole::Author, &request, self.limits)?;
        self.stream.begin_request();
        self.stream.send(&outgoing).await?;
        let frame = self
            .stream
            .receive()
            .await?
            .ok_or(ClientError::ResponseEnded)?;

        let response = protocol::decode_response_network_frame(StreamRole::Author, &frame)?;
        if response != Response::Acknowledged {
            return Err(ClientError::UnexpectedResponse(response));
        }
        Ok(())
    }
}

impl<Stream> EventStream<Stream>
where
    Stream: BidirectionalStream,
{
    /// Returns the backend-assigned identity used to reopen this document.
    #[must_use]
    pub fn document(&self) -> &[u8] {
        &self.document
    }

    /// Returns the opaque authority used to bind later logical streams.
    #[must_use]
    pub fn authority(&self) -> &[u8] {
        &self.authority
    }

    /// Receives the next recovery or live event-stream response.
    pub async fn next(&mut self) -> Result<Option<Response>, ClientError<Stream::Error>> {
        self.responses.next().await
    }

    /// Cancels this event stream.
    pub async fn cancel(self) -> Result<(), ClientError<Stream::Error>> {
        self.responses.cancel().await
    }

    /// Returns the recovery/live response stream after preserving its authority in client state.
    pub fn into_responses(self) -> ResponseStream<Stream> {
        self.responses
    }
}

/// Bounded response stream owned by the shared client.
#[derive(Debug)]
pub struct ResponseStream<Stream> {
    stream: FramedStream<Stream>,
    role: StreamRole,
    ended: bool,
    /// Reads become idle subscriptions after their first response; finite requests do not.
    subscription: bool,
}

impl<Stream> ResponseStream<Stream>
where
    Stream: BidirectionalStream,
{
    /// Receives and decodes the next response.
    /// Content responses require `ResponseComplete`; clean EOF alone ends only event streams.
    pub async fn next(&mut self) -> Result<Option<Response>, ClientError<Stream::Error>> {
        if self.ended {
            return Ok(None);
        }
        let frame = self.stream.receive().await?;
        if let Some(frame) = frame {
            let response = protocol::decode_response_network_frame(self.role, &frame)?;
            if self.subscription {
                self.stream.end_request();
            }
            if response != Response::ResponseComplete {
                return Ok(Some(response));
            }
            self.stream.end_request();
        } else if self.role == StreamRole::Content {
            self.ended = true;
            return Err(ClientError::ResponseEnded);
        }
        self.ended = true;
        Ok(None)
    }

    /// Cancels the transport stream.
    pub async fn cancel(mut self) -> Result<(), ClientError<Stream::Error>> {
        self.ended = true;
        self.stream.cancel().await
    }
}

/// Failure from shared client connection state.
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
    /// Shared state was poisoned by a panic.
    #[error("Sea client state is unavailable")]
    Poisoned,
}

#[derive(Debug)]
struct State {
    status: ConnectionStatus,
    authority: Option<Vec<u8>>,
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
            }),
        }
    }
}

impl ClientState {
    /// Rejects admission after close or disconnect.
    pub fn check_connected(&self) -> Result<(), ClientStateError> {
        let state = self.inner.lock().map_err(|_| ClientStateError::Poisoned)?;
        match state.status {
            ConnectionStatus::Connected => Ok(()),
            ConnectionStatus::Disconnected => Err(ClientStateError::Disconnected),
            ConnectionStatus::Closed => Err(ClientStateError::Closed),
        }
    }

    /// Marks the connection closed; future requests are rejected.
    pub fn close(&self) -> Result<(), ClientStateError> {
        let mut state = self.inner.lock().map_err(|_| ClientStateError::Poisoned)?;
        state.status = ConnectionStatus::Closed;
        state.authority = None;
        Ok(())
    }

    /// Marks the connection unavailable.
    pub fn disconnect(&self) -> Result<(), ClientStateError> {
        let mut state = self.inner.lock().map_err(|_| ClientStateError::Poisoned)?;
        if state.status != ConnectionStatus::Closed {
            state.status = ConnectionStatus::Disconnected;
            state.authority = None;
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
}

#[cfg(test)]
mod tests {
    use std::{
        collections::VecDeque,
        convert::Infallible,
        sync::{
            Arc, Mutex,
            atomic::{AtomicBool, AtomicUsize, Ordering},
        },
    };

    use async_trait::async_trait;

    use super::{Client, ClientState, ClientStateError};
    use crate::protocol::{self, Request, Response, StreamRole};
    use crate::transport::{BidirectionalStream, ClientTransport};

    #[derive(Debug)]
    struct ScriptedTransport {
        chunks: Vec<Vec<u8>>,
        cancelled: Option<Arc<AtomicBool>>,
    }

    #[derive(Debug)]
    struct ScriptedStream {
        chunks: VecDeque<Vec<u8>>,
        cancelled: Option<Arc<AtomicBool>>,
    }

    #[derive(Debug)]
    struct SequencedTransport {
        streams: Mutex<VecDeque<Vec<Vec<u8>>>>,
    }

    struct FailingDisconnectTransport {
        calls: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl ClientTransport for FailingDisconnectTransport {
        type Stream = Self;
        type Error = &'static str;

        async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error> {
            self.calls.fetch_add(1, Ordering::Relaxed);
            Err("transport requires replacement")
        }

        async fn send_datagram(&self, _bytes: &[u8]) -> Result<bool, Self::Error> {
            self.calls.fetch_add(1, Ordering::Relaxed);
            Err("transport requires replacement")
        }

        async fn receive_datagram(&self) -> Result<Vec<u8>, Self::Error> {
            self.calls.fetch_add(1, Ordering::Relaxed);
            Err("transport requires replacement")
        }

        fn disconnect(&self) -> Result<(), Self::Error> {
            self.calls.fetch_add(1, Ordering::Relaxed);
            Err("physical disconnect failed")
        }
    }

    #[async_trait]
    impl BidirectionalStream for FailingDisconnectTransport {
        type Error = &'static str;

        async fn send(&mut self, _bytes: &[u8]) -> Result<(), Self::Error> {
            panic!("failed transport must not yield an open stream");
        }

        async fn finish(&mut self) -> Result<(), Self::Error> {
            panic!("failed transport must not yield an open stream");
        }

        async fn receive(&mut self) -> Result<Option<Vec<u8>>, Self::Error> {
            panic!("failed transport must not yield an open stream");
        }

        async fn cancel(&mut self) -> Result<(), Self::Error> {
            panic!("failed transport must not yield an open stream");
        }
    }

    #[async_trait]
    impl ClientTransport for ScriptedTransport {
        type Stream = ScriptedStream;
        type Error = Infallible;

        async fn receive_datagram(&self) -> Result<Vec<u8>, Self::Error> {
            Ok(self.chunks.concat())
        }

        async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error> {
            Ok(ScriptedStream {
                chunks: self.chunks.clone().into(),
                cancelled: self.cancelled.clone(),
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
                cancelled: None,
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
            if let Some(cancelled) = &self.cancelled {
                cancelled.store(true, Ordering::Relaxed);
            }
            Ok(())
        }
    }

    #[test]
    fn disconnect_abandons_requests_and_requires_explicit_recovery() {
        let state = Arc::new(ClientState::default());
        state.check_connected().expect("connected");
        state.disconnect().expect("disconnect");
        assert!(matches!(
            state.check_connected(),
            Err(ClientStateError::Disconnected)
        ));
        state.reconnect().expect("reconnect");
        state.check_connected().expect("request after recovery");
        state.close().expect("close");
        assert!(matches!(state.reconnect(), Err(ClientStateError::Closed)));
    }

    #[tokio::test]
    async fn failed_physical_disconnect_abandons_authority_and_rejects_later_requests() {
        use super::ClientError;

        let calls = Arc::new(AtomicUsize::new(0));
        let state = Arc::new(ClientState::default());
        state.set_authority(vec![9; 32]).unwrap();
        let client = Client::with_state(
            FailingDisconnectTransport {
                calls: calls.clone(),
            },
            state.clone(),
            protocol::Limits::default(),
        );
        assert!(matches!(
            client.disconnect(),
            Err(ClientError::Transport("physical disconnect failed"))
        ));
        assert_eq!(calls.load(Ordering::Relaxed), 1);
        assert!(matches!(
            state.check_connected(),
            Err(ClientStateError::Disconnected)
        ));
        assert!(matches!(
            state.authority(),
            Err(ClientStateError::MissingAuthority)
        ));
        assert!(matches!(
            client.open_content_stream().await,
            Err(ClientError::State(ClientStateError::MissingAuthority))
        ));
        let opening = Request::OpenEventStream {
            version: protocol::PROTOCOL_VERSION,
            archive: b"document".to_vec(),
            intent: protocol::ArchiveIntent::Open,
            resume_after: None,
        };
        assert!(matches!(
            client.open_event_stream(opening.clone()).await,
            Err(ClientError::State(ClientStateError::Disconnected))
        ));
        assert!(matches!(
            client
                .send_signal_datagram(&protocol::signals::Submission {
                    target: None,
                    payload: Vec::new(),
                    best_effort: true,
                })
                .await,
            Err(ClientError::State(ClientStateError::Disconnected))
        ));
        assert!(matches!(
            client.receive_signal_datagram().await,
            Err(ClientError::State(ClientStateError::Disconnected))
        ));
        assert_eq!(calls.load(Ordering::Relaxed), 1);
        client.reconnect().unwrap();
        assert!(matches!(
            state.authority(),
            Err(ClientStateError::MissingAuthority)
        ));
        assert!(matches!(
            client.open_author_stream().await,
            Err(ClientError::State(ClientStateError::MissingAuthority))
        ));
        assert!(matches!(
            client.open_event_stream(opening).await,
            Err(ClientError::Transport("transport requires replacement"))
        ));
        assert_eq!(calls.load(Ordering::Relaxed), 2);
    }

    #[tokio::test]
    async fn signal_datagrams_require_one_complete_best_effort_message() {
        let limits = protocol::Limits::default();
        let message = |best_effort| protocol::signals::Event::Message {
            sender: vec![1],
            submission: protocol::signals::Submission {
                target: Some(vec![2]),
                payload: vec![3],
                best_effort,
            },
        };
        let encode = |event| {
            protocol::encode_response_frame(
                StreamRole::Signal,
                &Response::SignalEvent(event),
                limits,
            )
            .unwrap()
        };
        let valid = encode(message(true));
        for (bytes, accepted) in [
            (valid.clone(), true),
            (encode(message(false)), false),
            (encode(protocol::signals::Event::Members(Vec::new())), false),
            ([valid.clone(), valid.clone()].concat(), false),
            (valid[..valid.len() - 1].to_vec(), false),
        ] {
            let client = Client::new(
                ScriptedTransport {
                    chunks: vec![bytes],
                    cancelled: None,
                },
                limits,
            );
            let result = client.receive_signal_datagram().await;
            if accepted {
                assert_eq!(result.unwrap(), message(true));
            } else {
                assert!(result.is_err());
            }
        }
    }

    #[tokio::test]
    async fn shared_client_decodes_fragmented_and_coalesced_event_responses() {
        let limits = protocol::Limits::default();
        let opened = protocol::encode_response_frame(
            StreamRole::Event,
            &Response::EventStreamOpened {
                session: 1,
                document: vec![8; 8],
                authority: vec![9; 32],
            },
            limits,
        )
        .expect("event stream opening");
        let caught_up = protocol::encode_response_frame(
            StreamRole::Event,
            &Response::StreamProgress {
                previous: Some(2),
                latest_known: Some(2),
                status: protocol::StreamStatus::AwaitingNewItems,
            },
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
                cancelled: None,
            },
            limits,
        );
        let mut event_stream = event_client
            .open_event_stream(Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: b"archive".to_vec(),
                intent: protocol::ArchiveIntent::Open,
                resume_after: Some(1),
            })
            .await
            .expect("event stream");
        assert_eq!(event_stream.authority(), &[9; 32]);
        assert_eq!(event_stream.document(), &[8; 8]);
        assert_eq!(
            event_stream.next().await.expect("event item"),
            Some(Response::StreamProgress {
                previous: Some(2),
                latest_known: Some(2),
                status: protocol::StreamStatus::AwaitingNewItems,
            })
        );
    }

    #[tokio::test]
    async fn event_stream_cancel_delegates_to_transport() {
        let limits = protocol::Limits::default();
        let opened = protocol::encode_response_frame(
            StreamRole::Event,
            &Response::EventStreamOpened {
                session: 1,
                document: vec![8; 8],
                authority: vec![9; 32],
            },
            limits,
        )
        .expect("event stream opening");
        let cancelled = Arc::new(AtomicBool::new(false));
        let client = Client::new(
            ScriptedTransport {
                chunks: vec![opened],
                cancelled: Some(Arc::clone(&cancelled)),
            },
            limits,
        );
        let event_stream = client
            .open_event_stream(Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: b"archive".to_vec(),
                intent: protocol::ArchiveIntent::Open,
                resume_after: None,
            })
            .await
            .expect("event stream");

        event_stream.cancel().await.expect("cancel event stream");

        assert!(cancelled.load(Ordering::Relaxed));
    }

    #[tokio::test]
    async fn content_eof_requires_explicit_completion_but_event_eof_does_not() {
        let limits = protocol::Limits::default();
        for (role, complete) in [
            (StreamRole::Content, false),
            (StreamRole::Content, true),
            (StreamRole::Event, false),
        ] {
            let chunks = if complete {
                vec![
                    protocol::encode_response_frame(role, &Response::ResponseComplete, limits)
                        .unwrap(),
                ]
            } else {
                Vec::new()
            };
            let mut responses = super::ResponseStream {
                stream: super::FramedStream::untimed(
                    ScriptedStream {
                        chunks: chunks.into(),
                        cancelled: None,
                    },
                    limits,
                ),
                role,
                ended: false,
                subscription: role == StreamRole::Event,
            };
            let result = responses.next().await;
            if role == StreamRole::Content && !complete {
                assert!(matches!(result, Err(super::ClientError::ResponseEnded)));
            } else {
                assert!(matches!(result, Ok(None)));
            }
            assert!(matches!(responses.next().await, Ok(None)));
        }
    }

    #[tokio::test]
    async fn author_error_or_cancelled_receipt_prevents_later_requests() {
        use futures_util::FutureExt;
        for cancel_receipt in [false, true] {
            let cancelled = Arc::new(AtomicBool::new(false));
            let limits = protocol::Limits::default();
            let error = protocol::encode_response_frame(
                StreamRole::Author,
                &Response::Error {
                    kind: protocol::ErrorKind::Rejected,
                    message: "rejected".into(),
                },
                limits,
            )
            .unwrap();
            let mut author = super::AuthorStream {
                terminal: false,
                stream: super::FramedStream::untimed(
                    SuspendedAuthorStream {
                        inner: ScriptedStream {
                            chunks: vec![error].into(),
                            cancelled: Some(cancelled.clone()),
                        },
                        suspend: cancel_receipt,
                    },
                    limits,
                ),
                state: Arc::new(ClientState::default()),
                limits,
            };
            let request = Request::Submit {
                reference: None,
                event: protocol::Event {
                    payload: Vec::new(),
                    blob_tree: None,
                },
            };
            if cancel_receipt {
                assert!(author.request(request.clone()).now_or_never().is_none());
            } else {
                assert!(matches!(
                    author.request(request.clone()).await.unwrap(),
                    Response::Error { .. }
                ));
            }
            assert!(matches!(
                author.request(request).await,
                Err(super::ClientError::State(ClientStateError::Closed))
            ));
            assert!(cancelled.load(Ordering::Relaxed));
            author.finish().await.unwrap();
        }
    }

    #[tokio::test]
    async fn cancelled_exchanges_cannot_consume_stale_replies() {
        use futures_util::FutureExt;
        let limits = protocol::Limits::default();
        let cancelled = Arc::new(AtomicBool::new(false));
        let suspended = || SuspendedAuthorStream {
            inner: ScriptedStream {
                chunks: VecDeque::new(),
                cancelled: Some(cancelled.clone()),
            },
            suspend: true,
        };
        let mut content = super::ContentStream {
            terminal: false,
            stream: super::FramedStream::untimed(suspended(), limits),
            state: Arc::new(ClientState::default()),
            limits,
        };
        assert!(
            content
                .request(Request::GetBlob { id: [0; 32] })
                .now_or_never()
                .is_none()
        );
        assert!(matches!(
            content.request(Request::GetBlob { id: [0; 32] }).await,
            Err(super::ClientError::State(ClientStateError::Closed))
        ));
        assert!(cancelled.swap(false, Ordering::Relaxed));
        let mut snapshot = super::SnapshotStream {
            terminal: false,
            stream: super::FramedStream::untimed(suspended(), limits),
            state: Arc::new(ClientState::default()),
            limits,
            latest: None,
            fence: None,
        };
        assert!(
            snapshot
                .request(Request::LatestSnapshot)
                .now_or_never()
                .is_none()
        );
        assert!(matches!(
            snapshot.request(Request::LatestSnapshot).await,
            Err(super::ClientError::State(ClientStateError::Closed))
        ));
        assert!(cancelled.swap(false, Ordering::Relaxed));
        let mut signal = super::SignalStream {
            terminal: false,
            stream: super::FramedStream::untimed(suspended(), limits),
            state: Arc::new(ClientState::default()),
            limits,
        };
        let request = Request::SendSignal(protocol::signals::Submission {
            target: None,
            payload: vec![1],
            best_effort: false,
        });
        assert!(
            signal
                .request(request.clone(), |_| Ok(()))
                .now_or_never()
                .is_none()
        );
        assert!(matches!(
            signal.request(request, |_| Ok(())).await,
            Err(super::ClientError::State(ClientStateError::Closed))
        ));
        assert!(cancelled.load(Ordering::Relaxed));
    }

    #[tokio::test]
    async fn mismatched_author_receipts_make_the_stream_terminal() {
        let limits = protocol::Limits::default();
        for (request, response) in [
            (
                Request::Submit {
                    reference: None,
                    event: protocol::Event {
                        payload: vec![1],
                        blob_tree: None,
                    },
                },
                Response::Acknowledged,
            ),
            (
                Request::AnnounceMembership { metadata: vec![] },
                Response::Acknowledged,
            ),
            (Request::Close, Response::EventCommitted { position: 1 }),
        ] {
            let cancelled = Arc::new(AtomicBool::new(false));
            let mut author = super::AuthorStream {
                terminal: false,
                stream: super::FramedStream::untimed(
                    ScriptedStream {
                        chunks: vec![
                            protocol::encode_response_frame(StreamRole::Author, &response, limits)
                                .unwrap(),
                        ]
                        .into(),
                        cancelled: Some(cancelled.clone()),
                    },
                    limits,
                ),
                state: Arc::new(ClientState::default()),
                limits,
            };
            assert!(matches!(
                author.request(request.clone()).await,
                Err(super::ClientError::UnexpectedResponse(actual)) if actual == response
            ));
            assert!(cancelled.load(Ordering::Relaxed));
            assert!(matches!(
                author.request(request).await,
                Err(super::ClientError::State(ClientStateError::Closed))
            ));
        }
    }

    #[tokio::test]
    async fn signal_notifications_do_not_complete_ordered_requests() {
        let limits = protocol::Limits::default();
        let notification = protocol::signals::Event::Members(Vec::new());
        let chunks = [
            Response::SignalEvent(notification.clone()),
            Response::Acknowledged,
        ]
        .iter()
        .flat_map(|response| {
            protocol::encode_response_frame(StreamRole::Signal, response, limits).unwrap()
        })
        .collect::<Vec<_>>();
        let mut signal = super::SignalStream {
            terminal: false,
            stream: super::FramedStream::untimed(
                ScriptedStream {
                    chunks: chunks.chunks(2).map(<[u8]>::to_vec).collect(),
                    cancelled: None,
                },
                limits,
            ),
            state: Arc::new(ClientState::default()),
            limits,
        };
        let mut received = Vec::new();
        signal
            .request(
                Request::SendSignal(protocol::signals::Submission {
                    target: None,
                    payload: vec![1],
                    best_effort: false,
                }),
                |event| {
                    received.push(event);
                    Ok(())
                },
            )
            .await
            .unwrap();
        assert_eq!(received, vec![notification]);
        assert!(!signal.terminal);
    }

    #[tokio::test]
    async fn snapshot_notifications_do_not_complete_ordered_requests() {
        let limits = protocol::Limits::default();
        let chunks = [
            Response::SnapshotCoordination {
                latest: Some(3),
                fence: Some(7),
            },
            Response::Error {
                kind: protocol::ErrorKind::Rejected,
                message: "stale parent".into(),
            },
            Response::Snapshot(None),
        ]
        .iter()
        .flat_map(|response| {
            protocol::encode_response_frame(StreamRole::Snapshot, response, limits).unwrap()
        })
        .collect::<Vec<_>>();
        let mut snapshot = super::SnapshotStream {
            terminal: false,
            stream: super::FramedStream::untimed(
                ScriptedStream {
                    chunks: chunks.chunks(2).map(<[u8]>::to_vec).collect(),
                    cancelled: None,
                },
                limits,
            ),
            state: Arc::new(ClientState::default()),
            limits,
            latest: None,
            fence: None,
        };
        assert!(matches!(
            snapshot
                .request(Request::PublishSnapshot {
                    fence: Some(7),
                    expected_parent: None,
                    at_event: 3,
                    root: protocol::TreeId::Directory([0; 32]),
                })
                .await
                .unwrap(),
            Response::Error { .. }
        ));
        assert_eq!(
            snapshot.request(Request::LatestSnapshot).await.unwrap(),
            Response::Snapshot(None)
        );
        assert_eq!(snapshot.latest(), Some(3));
        assert_eq!(snapshot.fence(), Some(7));
        assert!(!snapshot.terminal);
    }

    /// Suspends receipt delivery so dropping an admitted request is deterministic.
    struct SuspendedAuthorStream {
        inner: ScriptedStream,
        suspend: bool,
    }

    #[async_trait]
    impl BidirectionalStream for SuspendedAuthorStream {
        type Error = Infallible;
        async fn send(&mut self, bytes: &[u8]) -> Result<(), Self::Error> {
            self.inner.send(bytes).await
        }
        async fn finish(&mut self) -> Result<(), Self::Error> {
            self.inner.finish().await
        }
        async fn receive(&mut self) -> Result<Option<Vec<u8>>, Self::Error> {
            if self.suspend {
                std::future::pending::<()>().await;
            }
            self.inner.receive().await
        }
        async fn cancel(&mut self) -> Result<(), Self::Error> {
            self.inner.cancel().await
        }
    }

    #[tokio::test]
    async fn shared_author_stream_binds_authority_and_orders_receipts() {
        let limits = protocol::Limits::default();
        let event_opened = protocol::encode_response_frame(
            StreamRole::Event,
            &Response::EventStreamOpened {
                session: 1,
                document: vec![8; 8],
                authority: vec![9; 32],
            },
            limits,
        )
        .expect("event opening");
        let author_opened =
            protocol::encode_response_frame(StreamRole::Author, &Response::Acknowledged, limits)
                .expect("author opening");
        let committed = protocol::encode_response_frame(
            StreamRole::Author,
            &Response::EventCommitted { position: 4 },
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
                resume_after: None,
            })
            .await
            .expect("event stream");
        let mut author = client.open_author_stream().await.expect("author stream");
        assert_eq!(
            author
                .request(Request::Submit {
                    reference: None,
                    event: protocol::Event {
                        payload: b"event".to_vec(),
                        blob_tree: None,
                    },
                })
                .await
                .expect("submission"),
            Response::EventCommitted { position: 4 }
        );
    }
}
