#![doc = "Native Sea WebTransport server endpoint and dispatch."]

use std::{
    collections::BTreeMap,
    future::poll_fn,
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    task::Poll,
    time::Duration,
};

#[cfg(test)]
use async_trait::async_trait;
use futures_util::{
    StreamExt as _, stream,
    stream::{FuturesOrdered, FuturesUnordered},
};
use thiserror::Error;
use tokio::{
    sync::watch,
    task::JoinSet,
    time::{Instant, timeout, timeout_at},
};
use wtransport::{
    Connection, Endpoint, Identity, ServerConfig, VarInt,
    endpoint::endpoint_side::Server as ServerSide,
};

#[cfg(test)]
use crate::protocol::SeaResponseStream;
use crate::protocol::{SeaConnectionService, SeaServiceHost};
use crate::stream::{ReceiveStream, SendStream};
use sea_webtransport::protocol;

pub(crate) const CLOSE_CODE: VarInt = VarInt::from_u32(1);
/// Point-in-time transport activity and high-water measurements.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct TransportMeasurement {
    /// Total encoded Sea bytes read or written, excluding QUIC overhead.
    pub wire_bytes: u64,
    /// Connections currently owned by the server.
    pub active_connections: usize,
    /// Highest number of concurrently owned connections observed.
    pub peak_active_connections: usize,
    /// Highest number of concurrently active bidirectional streams observed.
    pub peak_active_streams: usize,
    /// Connections whose session membership cleanup completed.
    pub connection_cleanups: u64,
    /// Highest number of dispatched author requests awaiting an ordered response on one stream.
    pub peak_pending_author_requests: usize,
    /// Highest encoded input-byte charge awaiting ordered responses on one author stream.
    pub peak_pending_author_bytes: usize,
}

/// Policy requested when stopping a WebTransport server.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ShutdownMode {
    /// Stop accepting and cancel all owned connections immediately.
    Immediate,
    /// Stop accepting and allow owned connections to finish until the deadline.
    Drain {
        /// Maximum time to wait for owned connections to finish.
        timeout: Duration,
    },
}

/// How the server completed an explicit shutdown request.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ShutdownDisposition {
    /// Every owned connection completed before the deadline.
    Drained,
    /// One or more owned connections remained and were cancelled.
    Cancelled,
}

/// Evidence describing completion of server shutdown.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ShutdownOutcome {
    /// Whether connections drained or were cancelled.
    pub disposition: ShutdownDisposition,
    /// Connections owned when the server stopped accepting sessions.
    pub owned_connections: usize,
    /// Connections cancelled after deadline expiry.
    pub cancelled_connections: usize,
    /// Time spent draining after the server stopped accepting sessions.
    pub elapsed: Duration,
}

/// Cloneable control channel for requesting and observing server shutdown.
#[derive(Clone, Debug)]
pub struct ShutdownHandle {
    pub(crate) request: watch::Sender<Option<ShutdownMode>>,
    pub(crate) accepting: watch::Receiver<bool>,
}

impl ShutdownHandle {
    /// Requests immediate cancellation or a bounded drain.
    ///
    /// # Errors
    ///
    /// Returns an error if the server has already stopped.
    pub fn shutdown(&self, mode: ShutdownMode) -> Result<(), WebTransportError> {
        self.request
            .send(Some(mode))
            .map_err(|_| WebTransportError::ShutdownUnavailable)
    }

    /// Waits until the server has stopped accepting sessions.
    ///
    /// # Errors
    ///
    /// Returns an error if the server stops without acknowledgement.
    pub async fn wait_stopped_accepting(&mut self) -> Result<(), WebTransportError> {
        while *self.accepting.borrow_and_update() {
            self.accepting
                .changed()
                .await
                .map_err(|_| WebTransportError::ShutdownUnavailable)?;
        }
        Ok(())
    }
}

#[derive(Debug, Default)]
pub(crate) struct Metrics {
    wire_bytes: AtomicU64,
    active_connections: AtomicUsize,
    peak_active_connections: AtomicUsize,
    active_streams: AtomicUsize,
    peak_active_streams: AtomicUsize,
    connection_cleanups: AtomicU64,
    peak_pending_author_requests: AtomicUsize,
    peak_pending_author_bytes: AtomicUsize,
}

/// Cloneable view of transport measurements.
#[derive(Clone, Debug)]
pub struct MeasurementHandle(pub(crate) Arc<Metrics>);

impl MeasurementHandle {
    /// Returns a point-in-time measurement snapshot.
    #[must_use]
    pub fn snapshot(&self) -> TransportMeasurement {
        self.0.snapshot()
    }
}

impl Metrics {
    pub(crate) fn enter_connection(&self) -> ActiveConnection<'_> {
        let active = self.active_connections.fetch_add(1, Ordering::Relaxed) + 1;
        self.peak_active_connections
            .fetch_max(active, Ordering::Relaxed);
        ActiveConnection(self)
    }

    pub(crate) fn enter_stream(&self) -> ActiveStream<'_> {
        let active = self.active_streams.fetch_add(1, Ordering::Relaxed) + 1;
        self.peak_active_streams
            .fetch_max(active, Ordering::Relaxed);
        ActiveStream(self)
    }

    fn add_wire_bytes(&self, count: usize) {
        self.wire_bytes.fetch_add(count as u64, Ordering::Relaxed);
    }

    pub(crate) fn record_connection_cleanup(&self) {
        self.connection_cleanups.fetch_add(1, Ordering::Relaxed);
    }

    fn snapshot(&self) -> TransportMeasurement {
        TransportMeasurement {
            wire_bytes: self.wire_bytes.load(Ordering::Relaxed),
            active_connections: self.active_connections.load(Ordering::Relaxed),
            peak_active_connections: self.peak_active_connections.load(Ordering::Relaxed),
            peak_active_streams: self.peak_active_streams.load(Ordering::Relaxed),
            connection_cleanups: self.connection_cleanups.load(Ordering::Relaxed),
            peak_pending_author_requests: self.peak_pending_author_requests.load(Ordering::Relaxed),
            peak_pending_author_bytes: self.peak_pending_author_bytes.load(Ordering::Relaxed),
        }
    }
}

pub(crate) struct ActiveConnection<'a>(&'a Metrics);

impl Drop for ActiveConnection<'_> {
    fn drop(&mut self) {
        self.0.active_connections.fetch_sub(1, Ordering::Relaxed);
    }
}

pub(crate) struct ActiveStream<'a>(&'a Metrics);

impl Drop for ActiveStream<'_> {
    fn drop(&mut self) {
        self.0.active_streams.fetch_sub(1, Ordering::Relaxed);
    }
}

/// Server-owned thresholds for connection and session liveness.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LivenessPolicy {
    /// Interval between QUIC PING frames while a connection is otherwise idle.
    pub heartbeat_interval: Duration,
    /// Maximum time without peer responsiveness before QUIC closes the connection.
    pub inactivity_timeout: Duration,
    /// Time an inactive author may remain before its membership is released.
    pub reconnect_grace: Duration,
    /// Buffered live events allowed before a lagging subscriber is evicted.
    pub max_event_lag: usize,
}

impl Default for LivenessPolicy {
    fn default() -> Self {
        Self {
            heartbeat_interval: Duration::from_secs(3),
            inactivity_timeout: Duration::from_secs(15),
            reconnect_grace: Duration::ZERO,
            max_event_lag: 256,
        }
    }
}

/// Bounded frame and lifecycle configuration.
#[derive(Clone, Debug)]
pub struct TransportConfig {
    /// Maximum bytes accepted in one Sea frame.
    pub max_frame_bytes: usize,
    /// Maximum sessions owned concurrently.
    pub max_connections: usize,
    /// Maximum bidirectional streams per connection.
    pub max_streams_per_connection: usize,
    /// Maximum author requests awaiting ordered responses per stream; one restores serial dispatch.
    /// Their total encoded input bytes are bounded by `max_frame_bytes`.
    /// Framing may additionally retain one lookahead frame and its decoder buffer.
    pub max_pending_author_requests: usize,
    /// One deadline for connection establishment, and a per-operation framed I/O timeout.
    pub operation_timeout: Duration,
    /// Connection heartbeat, inactivity, reconnect, and lag policy.
    pub liveness: LivenessPolicy,
}

impl Default for TransportConfig {
    fn default() -> Self {
        Self {
            max_frame_bytes: 4 * 1024 * 1024,
            max_connections: 16,
            max_streams_per_connection: 16,
            max_pending_author_requests: 256,
            operation_timeout: Duration::from_secs(5),
            liveness: LivenessPolicy::default(),
        }
    }
}

impl TransportConfig {
    pub(crate) fn validate(&self) -> Result<(), WebTransportError> {
        if self.max_frame_bytes < protocol::MIN_FRAME_BYTES
            || self.max_connections == 0
            || self.max_streams_per_connection == 0
            || self.max_pending_author_requests == 0
            || self.operation_timeout.is_zero()
            || self.liveness.heartbeat_interval.is_zero()
            || self.liveness.inactivity_timeout <= self.liveness.heartbeat_interval
            || self.liveness.max_event_lag == 0
        {
            return Err(WebTransportError::InvalidConfig);
        }
        Ok(())
    }
}

/// Failures from native Sea WebTransport setup, framing, or lifecycle.
#[derive(Debug, Error)]
pub enum WebTransportError {
    /// One configured bound is zero or too small.
    #[error("transport configuration is invalid")]
    InvalidConfig,
    /// A complete frame exceeds its configured bound.
    #[error("transport frame exceeds its configured bound")]
    FrameTooLarge,
    /// Connection or framed I/O exceeded its timeout.
    #[error("transport operation timed out")]
    Timeout,
    /// The peer closed or local client cancelled the connection.
    #[error("transport disconnected")]
    Disconnected,
    /// The HTTP/3 or QUIC implementation failed.
    #[error("transport failed: {0}")]
    Transport(String),
    /// A Sea frame failed bounded encoding or decoding.
    #[error("Sea protocol frame failed validation: {0}")]
    SeaProtocol(#[from] protocol::ProtocolError),
    /// The server cannot accept another shutdown request.
    #[error("server is no longer available for shutdown")]
    ShutdownUnavailable,
    /// Accepted storage work could not complete during orderly shutdown.
    #[error("storage shutdown failed: {0}")]
    StorageShutdown(String),
}

/// Native WebTransport endpoint serving final Sea sessions at `/sea`.
pub struct WebTransportServer {
    endpoint: Endpoint<ServerSide>,
    service: Arc<dyn SeaServiceHost>,
    config: TransportConfig,
    metrics: Arc<Metrics>,
    shutdown_request: watch::Sender<Option<ShutdownMode>>,
    shutdown_receiver: watch::Receiver<Option<ShutdownMode>>,
    accepting: watch::Sender<bool>,
}

impl WebTransportServer {
    /// Creates a native HTTP/3 endpoint bound to `address`.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid limits, UDP socket configuration, or endpoint binding failure.
    pub fn bind(
        address: SocketAddr,
        identity: Identity,
        service: Arc<dyn SeaServiceHost>,
        config: TransportConfig,
    ) -> Result<Self, WebTransportError> {
        config.validate()?;
        let socket = std::net::UdpSocket::bind(address).map_err(transport_error)?;
        let options = socket2::SockRef::from(&socket);
        let existing = options.recv_buffer_size().map_err(transport_error)?;
        let requested = 2 * 1024 * 1024;
        if existing < requested {
            options
                .set_recv_buffer_size(requested)
                .map_err(transport_error)?;
            let effective = options.recv_buffer_size().map_err(transport_error)?;
            if effective < requested {
                eprintln!(
                    "Sea UDP receive buffer limited by OS: requested {requested} bytes, effective {effective} bytes"
                );
            }
        }
        let server_config = ServerConfig::builder()
            .with_bind_socket(socket)
            .with_identity(identity)
            .keep_alive_interval(Some(config.liveness.heartbeat_interval))
            .max_idle_timeout(Some(config.liveness.inactivity_timeout))
            .map_err(transport_error)?
            .build();
        let endpoint = Endpoint::server(server_config).map_err(transport_error)?;
        let (shutdown_request, shutdown_receiver) = watch::channel(None);
        let (accepting, _) = watch::channel(true);
        Ok(Self {
            endpoint,
            service,
            config,
            metrics: Arc::new(Metrics::default()),
            shutdown_request,
            shutdown_receiver,
            accepting,
        })
    }

    /// Returns the bound UDP address.
    ///
    /// # Errors
    ///
    /// Returns an error when the endpoint cannot report its address.
    pub fn local_addr(&self) -> Result<SocketAddr, WebTransportError> {
        self.endpoint.local_addr().map_err(transport_error)
    }

    /// Returns current transport measurements.
    #[must_use]
    pub fn measurement(&self) -> TransportMeasurement {
        self.metrics.snapshot()
    }

    /// Returns a cloneable measurement handle.
    #[must_use]
    pub fn measurement_handle(&self) -> MeasurementHandle {
        MeasurementHandle(Arc::clone(&self.metrics))
    }

    /// Returns the configured connection and session liveness thresholds.
    #[must_use]
    pub const fn liveness_policy(&self) -> LivenessPolicy {
        self.config.liveness
    }

    /// Returns a cloneable shutdown handle.
    #[must_use]
    pub fn shutdown_handle(&self) -> ShutdownHandle {
        ShutdownHandle {
            request: self.shutdown_request.clone(),
            accepting: self.accepting.subscribe(),
        }
    }

    /// Serves until an explicit shutdown request.
    ///
    /// # Errors
    ///
    /// Returns a terminal established-connection or task error; failed admissions are local.
    pub async fn serve(self) -> Result<(), WebTransportError> {
        self.serve_until_shutdown().await.map(|_| ())
    }

    /// Serves until shutdown and reports drain versus cancellation.
    ///
    /// # Errors
    ///
    /// Returns a terminal established-connection or task error; failed admissions are local.
    #[expect(
        clippy::too_many_lines,
        reason = "Keep connection drain and persistence deadline handling together"
    )]
    pub async fn serve_until_shutdown(mut self) -> Result<ShutdownOutcome, WebTransportError> {
        let mut connections = JoinSet::new();
        let mut active_services = BTreeMap::new();
        let mut next_connection_id = 1_u64;
        let mode = loop {
            tokio::select! {
                incoming = self.endpoint.accept(), if connections.len() < self.config.max_connections => {
                    let service = self.service.connect(self.config.liveness);
                    let connection_id = next_connection_id;
                    next_connection_id = next_connection_id.wrapping_add(1).max(1);
                    active_services.insert(connection_id, Arc::clone(&service));
                    let config = self.config.clone();
                    let metrics = Arc::clone(&self.metrics);
                    let establishment_deadline = Instant::now() + config.operation_timeout;
                    connections.spawn(async move {
                        let result = async {
                            let establishment = timeout_at(establishment_deadline, async {
                                let request = incoming.await.map_err(transport_error)?;
                                if request.path() != "/sea" {
                                    request.forbidden().await;
                                    return Ok(None);
                                }
                                request.accept().await.map(Some).map_err(transport_error)
                            })
                            .await;
                            let Ok(Ok(Some(connection))) = establishment else {
                                service.connection_closed(false).await;
                                metrics.record_connection_cleanup();
                                return Ok(());
                            };
                            serve_connection(connection, service, config, metrics).await
                        }
                        .await;
                        (connection_id, result)
                    });
                }
                result = connections.join_next(), if !connections.is_empty() => {
                    match result {
                        Some(Ok((connection_id, Ok(())))) => {
                            active_services.remove(&connection_id);
                        }
                        Some(Ok((connection_id, Err(error)))) => {
                            active_services.remove(&connection_id);
                            cancel_connections(&mut connections, active_services, &self.metrics).await?;
                            return Err(error);
                        }
                        Some(Err(error)) => {
                            cancel_connections(&mut connections, active_services, &self.metrics).await?;
                            return Err(transport_error(error));
                        }
                        None => {}
                    }
                }
                changed = self.shutdown_receiver.changed() => {
                    changed.map_err(|_| WebTransportError::ShutdownUnavailable)?;
                    if let Some(mode) = *self.shutdown_receiver.borrow_and_update() {
                        break mode;
                    }
                }
            }
        };
        let started = Instant::now();
        self.accepting.send_replace(false);
        let owned_connections = connections.len();
        let deadline = match mode {
            ShutdownMode::Immediate => started,
            ShutdownMode::Drain { timeout } => started + timeout,
        };
        while !connections.is_empty() {
            match timeout_at(deadline, connections.join_next()).await {
                Ok(Some(Ok((connection_id, Ok(()))))) => {
                    active_services.remove(&connection_id);
                }
                Ok(Some(Ok((connection_id, Err(error))))) => {
                    active_services.remove(&connection_id);
                    cancel_connections(&mut connections, active_services, &self.metrics).await?;
                    return Err(error);
                }
                Ok(Some(Err(error))) => {
                    cancel_connections(&mut connections, active_services, &self.metrics).await?;
                    return Err(transport_error(error));
                }
                Ok(None) => break,
                Err(_) => {
                    let cancelled_connections = connections.len();
                    self.endpoint
                        .close(CLOSE_CODE, b"server shutdown deadline elapsed");
                    cancel_connections(&mut connections, active_services, &self.metrics).await?;
                    self.endpoint.wait_idle().await;
                    return Ok(ShutdownOutcome {
                        disposition: ShutdownDisposition::Cancelled,
                        owned_connections,
                        cancelled_connections,
                        elapsed: started.elapsed(),
                    });
                }
            }
        }
        self.endpoint.close(CLOSE_CODE, b"server shutdown complete");
        self.endpoint.wait_idle().await;
        let disposition = match timeout_at(deadline, self.service.flush()).await {
            Ok(result) => {
                result?;
                ShutdownDisposition::Drained
            }
            Err(_) => ShutdownDisposition::Cancelled,
        };
        Ok(ShutdownOutcome {
            disposition,
            owned_connections,
            cancelled_connections: 0,
            elapsed: started.elapsed(),
        })
    }
}

async fn cancel_connections(
    connections: &mut JoinSet<(u64, Result<(), WebTransportError>)>,
    mut services: BTreeMap<u64, Arc<dyn SeaConnectionService>>,
    metrics: &Metrics,
) -> Result<(), WebTransportError> {
    connections.abort_all();
    let mut failure = None;
    while let Some(result) = connections.join_next().await {
        match result {
            Ok((id, result)) => {
                // Completed tasks already cleaned up, even if shutdown won the select race.
                services.remove(&id);
                if let Err(error) = result {
                    failure.get_or_insert(error);
                }
            }
            Err(error) if error.is_cancelled() => {}
            Err(error) => {
                failure.get_or_insert_with(|| transport_error(error));
            }
        }
    }
    cleanup_services(services, metrics).await;
    failure.map_or(Ok(()), Err)
}

async fn cleanup_services(
    services: BTreeMap<u64, Arc<dyn SeaConnectionService>>,
    metrics: &Metrics,
) {
    let mut cleanups = FuturesUnordered::new();
    for service in services.into_values() {
        cleanups.push(async move { service.connection_closed(false).await });
    }
    while cleanups.next().await.is_some() {
        metrics.record_connection_cleanup();
    }
}

async fn serve_connection(
    connection: Connection,
    service: Arc<dyn SeaConnectionService>,
    config: TransportConfig,
    metrics: Arc<Metrics>,
) -> Result<(), WebTransportError> {
    let _active = metrics.enter_connection();
    let result = serve_connection_streams(
        connection,
        Arc::clone(&service),
        config,
        Arc::clone(&metrics),
    )
    .await;
    service.connection_closed(result.is_ok()).await;
    metrics.record_connection_cleanup();
    match result {
        Err(WebTransportError::SeaProtocol(_)) => Ok(()),
        result => result,
    }
}

async fn serve_connection_streams(
    connection: Connection,
    service: Arc<dyn SeaConnectionService>,
    config: TransportConfig,
    metrics: Arc<Metrics>,
) -> Result<(), WebTransportError> {
    let mut streams = FuturesUnordered::new();
    loop {
        tokio::select! {
            biased;
            result = streams.next(), if !streams.is_empty() => {
                if let Some(Err(error @ WebTransportError::SeaProtocol(_))) = result {
                    connection.close(CLOSE_CODE, b"invalid Sea stream");
                    return Err(error);
                }
            }
            datagram = connection.receive_datagram() => {
                let Ok(datagram) = datagram else { return Ok(()); };
                let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits { max_frame_bytes: config.max_frame_bytes });
                decoder.push(&datagram.payload());
                if let Ok(Some(frame)) = decoder.next_frame()
                    && decoder.finish().is_ok()
                    && let Ok(protocol::Request::SendSignal(submission)) = protocol::decode_request_frame(protocol::StreamRole::Signal, &frame)
                    && submission.best_effort {
                    service.signal_datagram(submission).await;
                }
            }
            accepted = connection.accept_bi(), if streams.len() < config.max_streams_per_connection => {
                let Ok((send, receive)) = accepted else {
                    return Ok(());
                };
                let service = Arc::clone(&service);
                let config = config.clone();
                let metrics = Arc::clone(&metrics);
                let datagrams = Some(connection.clone());
                streams.push(async move {
                    let _active = metrics.enter_stream();
                    serve_sea_stream_with_datagrams(send, receive, service, &config, &metrics, datagrams).await
                });
            }
        }
    }
}

#[cfg(feature = "websocket-stream")]
pub(crate) async fn serve_sea_stream(
    send: impl SendStream,
    receive: impl ReceiveStream,
    service: Arc<dyn SeaConnectionService>,
    config: &TransportConfig,
    metrics: &Metrics,
) -> Result<(), WebTransportError> {
    serve_sea_stream_with_datagrams(send, receive, service, config, metrics, None).await
}

/// Dispatches a logical stream with an optional independently negotiated datagram path.
async fn serve_sea_stream_with_datagrams(
    send: impl SendStream,
    mut receive: impl ReceiveStream,
    service: Arc<dyn SeaConnectionService>,
    config: &TransportConfig,
    metrics: &Metrics,
    datagrams: Option<Connection>,
) -> Result<(), WebTransportError> {
    let mut prefix = [0_u8; 4];
    timeout(config.operation_timeout, receive.read_exact(&mut prefix))
        .await
        .map_err(|_| WebTransportError::Timeout)?
        .map_err(transport_error)?;
    serve_network_stream(send, receive, prefix, service, config, metrics, datagrams).await
}

#[allow(clippy::too_many_lines)]
async fn serve_network_stream(
    mut send: impl SendStream,
    mut receive: impl ReceiveStream,
    prefix: [u8; 4],
    service: Arc<dyn SeaConnectionService>,
    config: &TransportConfig,
    metrics: &Metrics,
    datagrams: Option<Connection>,
) -> Result<(), WebTransportError> {
    let limits = protocol::Limits {
        max_frame_bytes: config.max_frame_bytes,
    };
    let frame = timeout(
        config.operation_timeout,
        read_one_network_frame(&mut receive, prefix, limits),
    )
    .await
    .map_err(|_| WebTransportError::Timeout)??;
    let role =
        frame
            .kind
            .request_role()
            .ok_or(protocol::ProtocolError::UnexpectedMessageDirection(
                frame.kind,
            ))?;

    let request = protocol::decode_request_frame(role, &frame)?;
    metrics.add_wire_bytes(frame.encoded_len()?);
    if let protocol::Request::OpenSignalStream(opening) = request {
        return serve_signal_stream(send, receive, service, config, metrics, opening, datagrams)
            .await;
    }
    let service = match &request {
        protocol::Request::OpenAuthorStream { authority }
        | protocol::Request::OpenSnapshotStream { authority, .. }
        | protocol::Request::OpenContentStream { authority } => {
            match service.bind_session(authority).await {
                Ok(session) => session,
                Err(response) => {
                    return write_network_response(
                        &mut send,
                        role,
                        &response,
                        limits,
                        config.operation_timeout,
                        metrics,
                        true,
                    )
                    .await;
                }
            }
        }
        _ => service,
    };
    if matches!(request, protocol::Request::OpenAuthorStream { .. }) {
        return serve_author_stream(send, receive, service, config, metrics, role, request).await;
    }
    if matches!(request, protocol::Request::OpenSnapshotStream { .. }) {
        return serve_snapshot_stream(send, receive, service, config, metrics, role, request).await;
    }
    if matches!(request, protocol::Request::OpenContentStream { .. }) {
        return serve_content_stream(send, receive, service, config, metrics, role, request).await;
    }
    if matches!(request, protocol::Request::OpenEventStream { .. }) {
        let mut responses = match service.open_event_stream(request).await {
            Ok(responses) => responses,
            Err(response) => {
                return write_network_response(
                    &mut send,
                    role,
                    &response,
                    limits,
                    config.operation_timeout,
                    metrics,
                    true,
                )
                .await;
            }
        };
        loop {
            let response = tokio::select! {
                biased;
                () = send.stopped() => return Ok(()),
                response = responses.next() => response,
            };
            let Some(response) = response else {
                return timeout(config.operation_timeout, send.finish())
                    .await
                    .map_err(|_| WebTransportError::Timeout)?
                    .map_err(transport_error);
            };
            write_network_response(
                &mut send,
                role,
                &response,
                limits,
                config.operation_timeout,
                metrics,
                false,
            )
            .await?;
        }
    }
    let response = protocol::Response::Error {
        kind: protocol::ErrorKind::Rejected,
        message: "request requires an open logical stream".to_owned(),
    };
    write_network_response(
        &mut send,
        role,
        &response,
        limits,
        config.operation_timeout,
        metrics,
        true,
    )
    .await
}

#[allow(clippy::too_many_arguments, clippy::too_many_lines)]
async fn serve_author_stream(
    mut send: impl SendStream,
    receive: impl ReceiveStream,
    service: Arc<dyn SeaConnectionService>,
    config: &TransportConfig,
    metrics: &Metrics,
    role: protocol::StreamRole,

    opening: protocol::Request,
) -> Result<(), WebTransportError> {
    let result = async {
        let limits = protocol::Limits {
            max_frame_bytes: config.max_frame_bytes,
        };
        let response = service.author_request(opening).await;
        write_network_response(
            &mut send,
            role,
            &response,
            limits,
            config.operation_timeout,
            metrics,
            false,
        )
        .await?;
        if matches!(response, protocol::Response::Error { .. }) {
            return send.finish().await.map_err(transport_error);
        }
        let mut incoming = Box::pin(stream::try_unfold(
            (receive, protocol::NetworkFrameDecoder::new(limits)),
            |(mut receive, mut decoder)| async move {
                let frame = read_next_network_frame(
                    &mut receive, &mut decoder, config.operation_timeout,
                ).await?;
                Ok::<_, WebTransportError>(frame.map(|frame| (frame, (receive, decoder))))
            },
        ));
        let mut pending = FuturesOrdered::new();
        let mut pending_bytes = 0;
        let mut lookahead = None;
        let mut eof = false;
        let mut barrier = false;
        loop {
            if eof && pending.is_empty() {
                let _ = service.author_request(protocol::Request::Close).await;
                return send.finish().await.map_err(transport_error);
            }
            if let Some((request, bytes)) = lookahead.as_ref()
                && pending.len() < config.max_pending_author_requests
                && *bytes <= config.max_frame_bytes - pending_bytes
                && (pending.is_empty() || matches!(request, protocol::Request::Submit { .. }))
            {
                let (request, bytes) = lookahead.take().expect("admissible lookahead");
                barrier = !matches!(request, protocol::Request::Submit { .. });
                let close = matches!(request, protocol::Request::Close);
                let mut response = service.author_request(request);
                // Establish call order independently of the completion queue's polling order.
                let first = poll_fn(|context| Poll::Ready(response.as_mut().poll(context))).await;
                pending.push_back(async move {
                    let response = match first {
                        Poll::Ready(response) => response,
                        Poll::Pending => response.await,
                    };
                    (bytes, close, response)
                });
                pending_bytes += bytes;
                metrics.peak_pending_author_requests.fetch_max(pending.len(), Ordering::Relaxed);
                metrics.peak_pending_author_bytes.fetch_max(pending_bytes, Ordering::Relaxed);
            }
            tokio::select! {
                biased;
                response = pending.next(), if !pending.is_empty() => {
                    let (bytes, close, response) = response.expect("pending author response");
                    write_network_response(
                        &mut send, role, &response, limits, config.operation_timeout, metrics, false,
                    ).await?;
                    pending_bytes -= bytes;
                    barrier = false;
                    if close || matches!(response, protocol::Response::Error { .. }) {
                        return send.finish().await.map_err(transport_error);
                    }
                }
                frame = incoming.next(), if !eof && !barrier && lookahead.is_none()
                    && pending.len() < config.max_pending_author_requests
                    && pending_bytes < config.max_frame_bytes => {
                    let Some(frame) = frame else {
                        eof = true;
                        continue;
                    };
                    let frame = frame?;
                    let bytes = frame.encoded_len()?;
                    let request = protocol::decode_request_frame(role, &frame)?;
                    if matches!(request, protocol::Request::OpenAuthorStream { .. }) {
                        return Err(protocol::ProtocolError::WrongStream { kind: request.kind(), role }.into());
                    }
                    metrics.add_wire_bytes(bytes);
                    lookahead = Some((request, bytes));
                }
            }
        }
    }
    .await;
    let _ = service.author_request(protocol::Request::Close).await;
    result
}

/// Pumps live signals independently of archive traffic and releases membership on every exit.
#[allow(clippy::too_many_arguments)]
async fn serve_signal_stream(
    mut send: impl SendStream,
    mut receive: impl ReceiveStream,
    service: Arc<dyn SeaConnectionService>,
    config: &TransportConfig,
    metrics: &Metrics,

    opening: protocol::signals::OpenSignals,
    datagrams: Option<Connection>,
) -> Result<(), WebTransportError> {
    use sea_core::signals::SeaSignals as _;
    let role = protocol::StreamRole::Signal;
    let limits = protocol::Limits {
        max_frame_bytes: config.max_frame_bytes,
    };
    let datagrams = datagrams.filter(|_| opening.datagrams);
    let connection = match service.open_signals(opening).await {
        Ok(connection) => connection,
        Err(response) => {
            return write_network_response(
                &mut send,
                role,
                &response,
                limits,
                config.operation_timeout,
                metrics,
                true,
            )
            .await;
        }
    };
    let result = async {
        write_network_response(&mut send, role, &protocol::Response::Acknowledged, limits, config.operation_timeout, metrics, false).await?;
        let mut decoder = protocol::NetworkFrameDecoder::new(limits);
        loop {
            tokio::select! {
                frame = read_next_network_frame(&mut receive, &mut decoder, config.operation_timeout) => {
                    let Some(frame) = frame? else { break; };
                    metrics.add_wire_bytes(frame.encoded_len()?);
                    let request = protocol::decode_request_frame(role, &frame)?;
                    let close = matches!(request, protocol::Request::Close);
                    let response = match request {
                        protocol::Request::SendSignal(submission) => match connection.send_signal(submission.into()).await {
                            Ok(()) => protocol::Response::Acknowledged,
                            Err(error) => crate::protocol::error_response(error),
                        },
                        protocol::Request::Close => protocol::Response::Acknowledged,
                        _ => protocol::Response::Error { kind: protocol::ErrorKind::Rejected, message: "invalid signal request".to_owned() },
                    };
                    let failed = matches!(response, protocol::Response::Error { .. });
                    write_network_response(&mut send, role, &response, limits, config.operation_timeout, metrics, false).await?;
                    if close || failed { break; }
                }
                event = connection.next_signal() => {
                    let response = match event {
                        Ok(Some(event)) => protocol::Response::SignalEvent(event.into()),
                        Ok(None) => break,
                        Err(error) => crate::protocol::error_response(error),
                    };
                    let failed = matches!(response, protocol::Response::Error { .. });
                    if let (Some(connection), protocol::Response::SignalEvent(protocol::signals::Event::Message { submission, .. })) = (&datagrams, &response)
                        && submission.best_effort {
                            let bytes = protocol::encode_response_frame(role, &response, limits)?;
                            if connection.max_datagram_size().is_some_and(|limit| bytes.len() <= limit) {
                                connection.send_datagram(&bytes).map_err(transport_error)?;
                                metrics.add_wire_bytes(bytes.len());
                                continue;
                            }
                    }
                    write_network_response(&mut send, role, &response, limits, config.operation_timeout, metrics, false).await?;
                    if failed { break; }
                }
            }
        }
        send.finish().await
    }.await;
    let _ = connection.close_signals().await;
    result
}

#[allow(clippy::too_many_arguments)]
async fn serve_snapshot_stream(
    mut send: impl SendStream,
    mut receive: impl ReceiveStream,
    service: Arc<dyn SeaConnectionService>,
    config: &TransportConfig,
    metrics: &Metrics,
    role: protocol::StreamRole,

    opening: protocol::Request,
) -> Result<(), WebTransportError> {
    let limits = protocol::Limits {
        max_frame_bytes: config.max_frame_bytes,
    };
    let mut notifications = match service.snapshot_stream(opening).await {
        Ok(notifications) => notifications,
        Err(response) => {
            return write_network_response(
                &mut send,
                role,
                &response,
                limits,
                config.operation_timeout,
                metrics,
                true,
            )
            .await;
        }
    };
    let result = async {
        write_network_response(
            &mut send,
            role,

            &protocol::Response::Acknowledged,
            limits,
            config.operation_timeout,
            metrics,
            false,
        )
        .await?;
        let mut decoder = protocol::NetworkFrameDecoder::new(limits);
        loop {
            tokio::select! {
                frame = read_next_network_frame(&mut receive, &mut decoder, config.operation_timeout) => {
                    let Some(frame) = frame? else { break };
                    let request = protocol::decode_request_frame(role, &frame)?;
                    metrics.add_wire_bytes(frame.encoded_len()?);
                    let close = matches!(request, protocol::Request::Close);
                    let response = service.snapshot_request(request).await;
                    write_network_response(
                        &mut send,
                        role,

                        &response,
                        limits,
                        config.operation_timeout,
                        metrics,
                        false,
                    ).await?;
                    if close { break; }
                }
                notification = notifications.next() => {
                    let Some(notification) = notification else { break };
                    write_network_response(
                        &mut send,
                        role,
                        &notification,
                        limits,
                        config.operation_timeout,
                        metrics,
                        false,
                    ).await?;
                }
            }
        }
        send.finish().await.map_err(transport_error)
    }
    .await;
    drop(notifications);
    result
}

#[allow(clippy::too_many_arguments)]
async fn serve_content_stream(
    mut send: impl SendStream,
    mut receive: impl ReceiveStream,
    service: Arc<dyn SeaConnectionService>,
    config: &TransportConfig,
    metrics: &Metrics,
    role: protocol::StreamRole,

    opening: protocol::Request,
) -> Result<(), WebTransportError> {
    let limits = protocol::Limits {
        max_frame_bytes: config.max_frame_bytes,
    };
    let response = service.open_content_stream(opening).await;
    write_network_response(
        &mut send,
        role,
        &response,
        limits,
        config.operation_timeout,
        metrics,
        false,
    )
    .await?;
    if matches!(response, protocol::Response::Error { .. }) {
        return send.finish().await.map_err(transport_error);
    }
    let mut decoder = protocol::NetworkFrameDecoder::new(limits);
    while let Some(frame) =
        read_next_network_frame(&mut receive, &mut decoder, config.operation_timeout).await?
    {
        let request = protocol::decode_request_frame(role, &frame)?;
        metrics.add_wire_bytes(frame.encoded_len()?);
        let mut responses = match service.content_request(request).await {
            Ok(responses) => responses,
            Err(response) => Box::pin(stream::once(async move { response })),
        };
        loop {
            let response = tokio::select! {
                biased;
                () = send.stopped() => return Ok(()),
                response = responses.next() => response,
            };
            let Some(response) = response else {
                break;
            };
            write_network_response(
                &mut send,
                role,
                &response,
                limits,
                config.operation_timeout,
                metrics,
                false,
            )
            .await?;
        }
        write_network_response(
            &mut send,
            role,
            &protocol::Response::ResponseComplete,
            limits,
            config.operation_timeout,
            metrics,
            false,
        )
        .await?;
    }
    send.finish().await.map_err(transport_error)
}

async fn read_next_network_frame(
    receive: &mut impl ReceiveStream,
    decoder: &mut protocol::NetworkFrameDecoder,
    operation_timeout: Duration,
) -> Result<Option<protocol::NetworkFrame>, WebTransportError> {
    let mut buffer = [0_u8; 8192];
    loop {
        if let Some(frame) = decoder.next_frame()? {
            return Ok(Some(frame));
        }
        let read = receive.read(&mut buffer);
        let result = if decoder.has_partial_frame() {
            timeout(operation_timeout, read)
                .await
                .map_err(|_| WebTransportError::Timeout)?
        } else {
            read.await
        };
        let Some(count) = result.map_err(transport_error)? else {
            decoder.finish()?;
            return Ok(None);
        };
        decoder.push(&buffer[..count]);
    }
}

async fn read_one_network_frame(
    receive: &mut impl ReceiveStream,
    prefix: [u8; 4],
    limits: protocol::Limits,
) -> Result<protocol::NetworkFrame, WebTransportError> {
    let mut decoder = protocol::NetworkFrameDecoder::new(limits);
    decoder.push(&prefix);
    loop {
        if let Some(frame) = decoder.next_frame()? {
            return Ok(frame);
        }
        let mut bytes = vec![0; decoder.next_read_size()?];
        receive
            .read_exact(&mut bytes)
            .await
            .map_err(transport_error)?;
        decoder.push(&bytes);
    }
}

#[allow(clippy::too_many_arguments)]
async fn write_network_response(
    send: &mut impl SendStream,
    role: protocol::StreamRole,

    response: &protocol::Response,
    limits: protocol::Limits,
    operation_timeout: Duration,
    metrics: &Metrics,
    finish: bool,
) -> Result<(), WebTransportError> {
    // QUIC writes and cached streams can both stay ready without spending Tokio's task budget.
    tokio::task::consume_budget().await;
    let encoded = protocol::encode_response_frame(role, response, limits)?;
    timeout(operation_timeout, async {
        send.write_all(&encoded).await.map_err(transport_error)?;
        if finish {
            send.finish().await.map_err(transport_error)?;
        }
        Ok::<(), WebTransportError>(())
    })
    .await
    .map_err(|_| WebTransportError::Timeout)??;
    metrics.add_wire_bytes(encoded.len());
    Ok(())
}

pub(crate) fn transport_error(error: impl std::fmt::Display) -> WebTransportError {
    WebTransportError::Transport(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, atomic::AtomicBool};
    use wtransport::ClientConfig;

    /// Records lifecycle callbacks for connections that never open Sea streams.
    #[derive(Default)]
    struct AdmissionService {
        /// Reconnect-grace arguments in callback order.
        closures: Arc<Mutex<Vec<bool>>>,
        tasks: Arc<Mutex<Vec<Option<tokio::task::Id>>>>,
    }

    impl SeaServiceHost for AdmissionService {
        fn connect(&self, _liveness: LivenessPolicy) -> Arc<dyn SeaConnectionService> {
            Arc::new(Self {
                closures: self.closures.clone(),
                tasks: self.tasks.clone(),
            })
        }
    }

    #[async_trait]
    impl SeaConnectionService for AdmissionService {
        async fn bind_session(
            self: Arc<Self>,
            _authority: &[u8],
        ) -> Result<Arc<dyn SeaConnectionService>, protocol::Response> {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn connection_closed(&self, allow_reconnect_grace: bool) {
            self.closures.lock().unwrap().push(allow_reconnect_grace);
            self.tasks.lock().unwrap().push(tokio::task::try_id());
        }

        async fn open_event_stream(
            &self,
            _request: protocol::Request,
        ) -> Result<SeaResponseStream, protocol::Response> {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn event_stream(
            &self,
            _resume_after: Option<u64>,
        ) -> Result<SeaResponseStream, protocol::Response> {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn author_request(&self, _request: protocol::Request) -> protocol::Response {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn snapshot_stream(
            &self,
            _request: protocol::Request,
        ) -> Result<SeaResponseStream, protocol::Response> {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn snapshot_request(&self, _request: protocol::Request) -> protocol::Response {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn revoke_snapshot_publisher(&self) {}

        async fn open_content_stream(&self, _request: protocol::Request) -> protocol::Response {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn content_request(
            &self,
            _request: protocol::Request,
        ) -> Result<SeaResponseStream, protocol::Response> {
            unreachable!("admission tests do not open Sea streams")
        }
    }

    /// Supplies test-controlled chunks without network or filesystem timers.
    struct TestReceive(tokio::sync::mpsc::UnboundedReceiver<Vec<u8>>);

    #[async_trait]
    impl ReceiveStream for TestReceive {
        async fn read(&mut self, buffer: &mut [u8]) -> Result<Option<usize>, WebTransportError> {
            Ok(self.0.recv().await.map(|bytes| {
                buffer[..bytes.len()].copy_from_slice(&bytes);
                bytes.len()
            }))
        }
    }

    /// Observes writes and exposes peer cancellation independently of response production.
    struct TestSend {
        writes: Arc<AtomicUsize>,
        /// Retains wire responses when ordering or acknowledgement timing is under test.
        responses: Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>,
        stopped: watch::Receiver<bool>,
        /// Injects a response-write failure.
        fail: Arc<AtomicBool>,
        /// Records whether cleanup happened before or after send-side completion.
        finished: Arc<AtomicBool>,
    }

    #[async_trait]
    impl SendStream for TestSend {
        async fn write_all(&mut self, bytes: &[u8]) -> Result<(), WebTransportError> {
            if self.fail.load(Ordering::Relaxed) {
                return Err(WebTransportError::Disconnected);
            }
            self.writes.fetch_add(1, Ordering::Relaxed);
            if let Some(responses) = &self.responses {
                responses.send(bytes.to_vec()).unwrap();
            }
            Ok(())
        }

        async fn finish(&mut self) -> Result<(), WebTransportError> {
            self.finished.store(true, Ordering::Relaxed);
            Ok(())
        }

        async fn stopped(&mut self) {
            let _ = self.stopped.wait_for(|stopped| *stopped).await;
        }
    }

    #[tokio::test]
    async fn ready_responses_yield_to_other_work() {
        let (_stop, stopped) = watch::channel(false);
        let writes = Arc::new(AtomicUsize::new(0));
        let mut send = TestSend {
            writes: writes.clone(),
            responses: None,
            stopped,
            fail: Arc::new(AtomicBool::new(false)),
            finished: Arc::new(AtomicBool::new(false)),
        };
        let metrics = Metrics::default();
        tokio::join!(
            biased;
            async {
                for _ in 0..1024 {
                    write_network_response(
                        &mut send,
                        protocol::StreamRole::Author,
                        &protocol::Response::Acknowledged,
                        protocol::Limits::default(),
                        Duration::from_secs(5),
                        &metrics,
                        false,
                    ).await.unwrap();
                }
            },
            async {
                assert!(writes.load(Ordering::Relaxed) < 1024);
            },
        );
        assert_eq!(writes.load(Ordering::Relaxed), 1024);
    }

    /// Makes mutable connection routing distinguishable from a captured session dispatcher.
    struct StreamBindingProbe {
        /// Session captured by binding, or none for the mutable connection.
        admitted: Option<u64>,
        /// Replacement session selected by the connection.
        current: Arc<AtomicU64>,
        /// Session, request, and send-completion state observed at each dispatch.
        calls: Arc<Mutex<Vec<(u64, protocol::Request, bool)>>>,
        /// Independent transport observation used to check cleanup ordering.
        finished: Arc<AtomicBool>,
        /// Lets tests settle individual submissions independently of their first poll.
        submissions: Option<
            tokio::sync::mpsc::UnboundedSender<tokio::sync::oneshot::Sender<protocol::Response>>,
        >,
    }

    impl StreamBindingProbe {
        /// Records the receiver's identity, not an identity supplied by the request.
        fn record(&self, request: protocol::Request) {
            let session = self
                .admitted
                .unwrap_or_else(|| self.current.load(Ordering::Relaxed));
            self.calls.lock().unwrap().push((
                session,
                request,
                self.finished.load(Ordering::Relaxed),
            ));
        }
    }

    #[async_trait]
    impl SeaConnectionService for StreamBindingProbe {
        async fn bind_session(
            self: Arc<Self>,
            authority: &[u8],
        ) -> Result<Arc<dyn SeaConnectionService>, protocol::Response> {
            if authority != b"probe" {
                return Err(protocol::Response::Error {
                    kind: protocol::ErrorKind::Rejected,
                    message: "invalid probe authority".to_owned(),
                });
            }
            Ok(Arc::new(Self {
                admitted: Some(self.current.load(Ordering::Relaxed)),
                current: self.current.clone(),
                calls: self.calls.clone(),
                finished: self.finished.clone(),
                submissions: self.submissions.clone(),
            }))
        }

        async fn connection_closed(&self, _allow_reconnect_grace: bool) {
            unreachable!("logical-stream tests do not close a physical connection")
        }

        async fn open_event_stream(
            &self,
            _request: protocol::Request,
        ) -> Result<SeaResponseStream, protocol::Response> {
            unreachable!("the probe supplies session identity without an event stream")
        }

        async fn event_stream(
            &self,
            _resume_after: Option<u64>,
        ) -> Result<SeaResponseStream, protocol::Response> {
            unreachable!("the probe supplies session identity without an event stream")
        }

        async fn author_request(&self, request: protocol::Request) -> protocol::Response {
            let submit = matches!(request, protocol::Request::Submit { .. });
            self.record(request);
            if submit && let Some(submissions) = &self.submissions {
                let (complete, receipt) = tokio::sync::oneshot::channel();
                submissions.send(complete).unwrap();
                return receipt.await.unwrap();
            }
            protocol::Response::Acknowledged
        }

        async fn snapshot_stream(
            &self,
            request: protocol::Request,
        ) -> Result<SeaResponseStream, protocol::Response> {
            self.record(request);
            Ok(Box::pin(stream::pending()))
        }

        async fn snapshot_request(&self, request: protocol::Request) -> protocol::Response {
            self.record(request);
            protocol::Response::Acknowledged
        }

        async fn revoke_snapshot_publisher(&self) {
            unreachable!("logical-stream cleanup drops its lease, not connection participation")
        }

        async fn open_content_stream(&self, request: protocol::Request) -> protocol::Response {
            self.record(request);
            protocol::Response::Acknowledged
        }

        async fn content_request(
            &self,
            request: protocol::Request,
        ) -> Result<SeaResponseStream, protocol::Response> {
            self.record(request);
            Ok(Box::pin(stream::once(async {
                protocol::Response::Acknowledged
            })))
        }
    }

    /// Runs the real author loop with independently controlled admission, receipts, and output.
    struct AuthorHarness {
        /// Dropping the input models a clean receive EOF.
        requests: Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>,
        /// Wire responses emitted by the transport.
        responses: tokio::sync::mpsc::UnboundedReceiver<Vec<u8>>,
        /// A receipt controller for each first-polled submission.
        submissions:
            tokio::sync::mpsc::UnboundedReceiver<tokio::sync::oneshot::Sender<protocol::Response>>,
        /// Dispatch identity, request, and send-finish observations.
        calls: Arc<Mutex<Vec<(u64, protocol::Request, bool)>>>,
        /// High-water evidence from the production loop.
        metrics: Arc<Metrics>,
        /// Response-write failure injection.
        fail: Arc<AtomicBool>,
        /// Stream-owned task, including its authority cleanup.
        serving: tokio::task::JoinHandle<Result<(), WebTransportError>>,
    }

    impl AuthorHarness {
        /// Starts a bound author stream and consumes its opening acknowledgement.
        async fn start(config: TransportConfig) -> Self {
            let (requests, receive) = tokio::sync::mpsc::unbounded_channel();
            let (responses, output) = tokio::sync::mpsc::unbounded_channel();
            let (submissions, admitted) = tokio::sync::mpsc::unbounded_channel();
            let calls = Arc::new(Mutex::new(Vec::new()));
            let finished = Arc::new(AtomicBool::new(false));
            let metrics = Arc::new(Metrics::default());
            let fail = Arc::new(AtomicBool::new(false));
            let service = Arc::new(StreamBindingProbe {
                admitted: Some(1),
                current: Arc::new(AtomicU64::new(1)),
                calls: calls.clone(),
                finished: finished.clone(),
                submissions: Some(submissions),
            });
            let send = TestSend {
                writes: Arc::new(AtomicUsize::new(0)),
                responses: Some(responses),
                stopped: watch::channel(false).1,
                fail: fail.clone(),
                finished,
            };
            let observations = metrics.clone();
            let serving = tokio::spawn(async move {
                serve_author_stream(
                    send,
                    TestReceive(receive),
                    service,
                    &config,
                    &observations,
                    protocol::StreamRole::Author,
                    protocol::Request::OpenAuthorStream {
                        authority: b"probe".to_vec(),
                    },
                )
                .await
            });
            let mut harness = Self {
                requests: Some(requests),
                responses: output,
                submissions: admitted,
                calls,
                metrics,
                fail,
                serving,
            };
            assert_eq!(harness.response().await, protocol::Response::Acknowledged);
            harness
        }

        /// Queues a complete request without awaiting a service receipt.
        fn request(&self, request: &protocol::Request) {
            self.requests
                .as_ref()
                .unwrap()
                .send(
                    protocol::encode_request_frame(
                        protocol::StreamRole::Author,
                        request,
                        protocol::Limits::default(),
                    )
                    .unwrap(),
                )
                .unwrap();
        }

        /// Awaits a first-polled submission, with a deadline that detects serial dispatch.
        async fn submission(&mut self) -> tokio::sync::oneshot::Sender<protocol::Response> {
            timeout(Duration::from_secs(1), self.submissions.recv())
                .await
                .unwrap()
                .unwrap()
        }

        /// Decodes the actual response bytes instead of trusting the fixture's intended value.
        async fn response(&mut self) -> protocol::Response {
            let bytes = timeout(Duration::from_secs(1), self.responses.recv())
                .await
                .unwrap()
                .unwrap();
            let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
            decoder.push(&bytes);
            let frame = decoder.next_frame().unwrap().unwrap();
            decoder.finish().unwrap();
            protocol::decode_response_network_frame(protocol::StreamRole::Author, &frame).unwrap()
        }
    }

    /// Supplies distinguishable, equally sized application submissions.
    fn author_submission(value: u8) -> protocol::Request {
        protocol::Request::Submit {
            reference: None,
            event: protocol::Event {
                payload: vec![value; 8],
                blob_tree: None,
            },
        }
    }

    #[tokio::test(start_paused = true)]
    async fn author_pipeline_bounds_admission_and_preserves_both_orders() {
        let bytes = protocol::encode_request_frame(
            protocol::StreamRole::Author,
            &author_submission(0),
            protocol::Limits::default(),
        )
        .unwrap()
        .len();
        for byte_bound in [false, true] {
            let config = TransportConfig {
                max_pending_author_requests: if byte_bound { 4 } else { 2 },
                max_frame_bytes: if byte_bound { 2 * bytes } else { 4096 },
                ..TransportConfig::default()
            };
            let mut harness = AuthorHarness::start(config).await;
            for value in 0..3 {
                harness.request(&author_submission(value));
            }
            let first = harness.submission().await;
            let second = harness.submission().await;
            second
                .send(protocol::Response::EventCommitted { position: 11 })
                .unwrap();
            tokio::task::yield_now().await;
            assert!(
                harness.responses.try_recv().is_err(),
                "no early or reordered acknowledgement"
            );
            assert!(
                harness.submissions.try_recv().is_err(),
                "completed suffix still consumes capacity"
            );
            first
                .send(protocol::Response::EventCommitted { position: 10 })
                .unwrap();
            assert_eq!(
                harness.response().await,
                protocol::Response::EventCommitted { position: 10 }
            );
            assert_eq!(
                harness.response().await,
                protocol::Response::EventCommitted { position: 11 }
            );
            let third = harness.submission().await;
            third
                .send(protocol::Response::EventCommitted { position: 12 })
                .unwrap();
            assert_eq!(
                harness.response().await,
                protocol::Response::EventCommitted { position: 12 }
            );
            drop(harness.requests.take());
            harness.serving.await.unwrap().unwrap();
            let calls = harness.calls.lock().unwrap();
            let submissions: Vec<_> = calls
                .iter()
                .filter_map(|(_, request, _)| match request {
                    protocol::Request::Submit { event, .. } => Some(event.payload[0]),
                    _ => None,
                })
                .collect();
            assert_eq!(submissions, [0, 1, 2]);
            assert_eq!(harness.metrics.snapshot().peak_pending_author_requests, 2);
            assert_eq!(
                harness.metrics.snapshot().peak_pending_author_bytes,
                2 * bytes
            );
        }
    }

    #[tokio::test(start_paused = true)]
    async fn author_pipeline_drains_before_controls_and_clean_eof() {
        for ending in ["eof", "close", "membership"] {
            let mut harness = AuthorHarness::start(TransportConfig::default()).await;
            harness.request(&author_submission(0));
            harness.request(&author_submission(1));
            if ending == "membership" {
                harness.request(&protocol::Request::AnnounceMembership { metadata: vec![42] });
                harness.request(&author_submission(2));
            }
            if ending != "eof" {
                harness.request(&protocol::Request::Close);
                harness.request(&author_submission(3));
            }
            drop(harness.requests.take());
            let first = harness.submission().await;
            let second = harness.submission().await;
            first
                .send(protocol::Response::EventCommitted { position: 10 })
                .unwrap();
            assert_eq!(
                harness.response().await,
                protocol::Response::EventCommitted { position: 10 }
            );
            tokio::task::yield_now().await;
            assert_eq!(
                harness.calls.lock().unwrap().len(),
                3,
                "control or EOF overtook pending writes"
            );
            second
                .send(protocol::Response::EventCommitted { position: 11 })
                .unwrap();
            assert_eq!(
                harness.response().await,
                protocol::Response::EventCommitted { position: 11 }
            );
            if ending == "membership" {
                assert_eq!(harness.response().await, protocol::Response::Acknowledged);
                let third = harness.submission().await;
                {
                    let calls = harness.calls.lock().unwrap();
                    assert!(matches!(
                        calls[3].1,
                        protocol::Request::AnnounceMembership { .. }
                    ));
                    assert_eq!(calls[4].1, author_submission(2));
                }
                third
                    .send(protocol::Response::EventCommitted { position: 12 })
                    .unwrap();
                assert_eq!(
                    harness.response().await,
                    protocol::Response::EventCommitted { position: 12 }
                );
            }
            harness.serving.await.unwrap().unwrap();
            assert!(
                harness.submissions.try_recv().is_err(),
                "nothing may follow close"
            );
            assert!(
                harness
                    .calls
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|(_, request, finished)| {
                        matches!(request, protocol::Request::Close) && !finished
                    })
            );
        }
    }

    #[tokio::test(start_paused = true)]
    async fn author_pipeline_errors_drop_pending_receipts_and_close_authority() {
        for failure in ["service", "write", "decode", "truncated", "cancel"] {
            let mut harness = AuthorHarness::start(TransportConfig::default()).await;
            harness.request(&author_submission(0));
            harness.request(&author_submission(1));
            let first = harness.submission().await;
            let second = harness.submission().await;
            match failure {
                "service" => first
                    .send(protocol::Response::Error {
                        kind: protocol::ErrorKind::Rejected,
                        message: "injected failure".to_owned(),
                    })
                    .unwrap(),
                "write" => {
                    harness.fail.store(true, Ordering::Relaxed);
                    first.send(protocol::Response::Acknowledged).unwrap();
                }
                "decode" => {
                    harness
                        .requests
                        .as_ref()
                        .unwrap()
                        .send(
                            protocol::encode_request_frame(
                                protocol::StreamRole::Snapshot,
                                &protocol::Request::LatestSnapshot,
                                protocol::Limits::default(),
                            )
                            .unwrap(),
                        )
                        .unwrap();
                }
                "truncated" => {
                    harness.requests.as_ref().unwrap().send(vec![0]).unwrap();
                    drop(harness.requests.take());
                }
                "cancel" => harness.serving.abort(),
                _ => unreachable!(),
            }
            let result = harness.serving.await;
            if failure == "cancel" {
                assert!(result.unwrap_err().is_cancelled());
            } else {
                assert_eq!(result.unwrap().is_ok(), failure == "service");
                assert!(matches!(
                    harness.calls.lock().unwrap().last().unwrap().1,
                    protocol::Request::Close
                ));
            }
            assert!(
                second.is_closed(),
                "{failure}: pending future must not outlive its stream"
            );
        }
    }

    #[tokio::test(start_paused = true)]
    async fn author_receipts_do_not_restart_partial_frame_deadlines() {
        let mut harness = AuthorHarness::start(TransportConfig::default()).await;
        harness.request(&author_submission(0));
        let first = harness.submission().await;
        harness.requests.as_ref().unwrap().send(vec![0]).unwrap();
        tokio::task::yield_now().await;
        tokio::time::advance(Duration::from_secs(3)).await;
        first
            .send(protocol::Response::EventCommitted { position: 10 })
            .unwrap();
        harness.response().await;
        tokio::time::advance(Duration::from_secs(2)).await;
        assert!(matches!(
            harness.serving.await.unwrap(),
            Err(WebTransportError::Timeout)
        ));
    }

    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn logical_stream_dispatch_and_cleanup_keep_the_admitted_session() {
        for role in [
            protocol::StreamRole::Author,
            protocol::StreamRole::Content,
            protocol::StreamRole::Snapshot,
        ] {
            for ending in [
                "eof",
                "close",
                "truncated-frame",
                "decode-error",
                "write-error",
                "opening-write-error",
                "invalid-authority",
            ] {
                if role != protocol::StreamRole::Author
                    && ending != "eof"
                    && ending != "invalid-authority"
                {
                    continue;
                }
                let authority = if ending == "invalid-authority" {
                    b"invalid".to_vec()
                } else {
                    b"probe".to_vec()
                };
                let (opening, request) = match role {
                    protocol::StreamRole::Author => (
                        protocol::Request::OpenAuthorStream { authority },
                        protocol::Request::Submit {
                            reference: None,
                            event: protocol::Event {
                                payload: b"payload".to_vec(),
                                blob_tree: None,
                            },
                        },
                    ),
                    protocol::StreamRole::Content => (
                        protocol::Request::OpenContentStream { authority },
                        protocol::Request::PutBlob {
                            payload: b"payload".to_vec(),
                        },
                    ),
                    protocol::StreamRole::Snapshot => (
                        protocol::Request::OpenSnapshotStream {
                            authority,
                            participation: protocol::SnapshotParticipation::ClientSelected,
                        },
                        protocol::Request::LatestSnapshot,
                    ),
                    _ => unreachable!(),
                };
                let current = Arc::new(AtomicU64::new(1));
                let calls = Arc::new(Mutex::new(Vec::new()));
                let finished = Arc::new(AtomicBool::new(false));
                let service = Arc::new(StreamBindingProbe {
                    admitted: None,
                    current: current.clone(),
                    calls: calls.clone(),
                    finished: finished.clone(),
                    submissions: None,
                });
                let limits = protocol::Limits::default();
                let opening = protocol::encode_request_frame(role, &opening, limits).unwrap();
                let prefix = opening[..4].try_into().unwrap();
                let (requests, receive) = tokio::sync::mpsc::unbounded_channel();
                for byte in &opening[4..] {
                    requests.send(vec![*byte]).unwrap();
                }
                let (_stop, stopped) = watch::channel(false);
                let fail = Arc::new(AtomicBool::new(ending == "opening-write-error"));
                let writes = Arc::new(AtomicUsize::new(0));
                let config = TransportConfig::default();
                let metrics = Metrics::default();
                let serving = serve_network_stream(
                    TestSend {
                        writes: writes.clone(),
                        responses: None,
                        stopped,
                        fail: fail.clone(),
                        finished: finished.clone(),
                    },
                    TestReceive(receive),
                    prefix,
                    service,
                    &config,
                    &metrics,
                    None,
                );
                tokio::pin!(serving);
                if ending == "invalid-authority" {
                    serving.await.unwrap();
                    assert!(
                        calls.lock().unwrap().is_empty(),
                        "rejected opening entered session dispatch or cleanup"
                    );
                    continue;
                }
                if ending == "opening-write-error" {
                    assert!(serving.await.is_err());
                    let calls = calls.lock().unwrap();
                    assert_eq!(calls.len(), 2, "failed opening must dispatch cleanup");
                    assert_eq!(calls.last(), Some(&(1, protocol::Request::Close, false)));
                    assert!(!finished.load(Ordering::Relaxed));
                    continue;
                }
                assert!(futures_util::poll!(&mut serving).is_pending());
                assert!(
                    writes.load(Ordering::Relaxed) > 0,
                    "opening must finish before replacement"
                );
                current.store(2, Ordering::Relaxed);
                let request = if ending == "close" {
                    protocol::Request::Close
                } else {
                    request
                };
                let mut encoded = protocol::encode_request_frame(role, &request, limits).unwrap();
                if ending == "truncated-frame" {
                    encoded.pop();
                } else if ending == "decode-error" {
                    encoded.truncate(5);
                    encoded[..4].copy_from_slice(&1_u32.to_be_bytes());
                }
                for byte in encoded {
                    requests.send(vec![byte]).unwrap();
                }
                drop(requests);
                fail.store(ending == "write-error", Ordering::Relaxed);
                let result = serving.await;
                assert_eq!(
                    result.is_err(),
                    matches!(ending, "truncated-frame" | "decode-error" | "write-error")
                );
                let calls = calls.lock().unwrap();
                assert!(
                    calls.len() >= 2,
                    "{role:?}/{ending}: operation or cleanup missing"
                );
                assert!(
                    calls.iter().all(|(session, _, _)| *session == 1),
                    "{role:?}/{ending}: {calls:?}"
                );
                if role == protocol::StreamRole::Author {
                    assert!(
                        calls.iter().any(|(_, request, after_finish)| {
                            matches!(request, protocol::Request::Close) && !*after_finish
                        }),
                        "{ending}: author cleanup must precede send completion"
                    );
                    assert_eq!(finished.load(Ordering::Relaxed), result.is_ok());
                    if ending == "truncated-frame" {
                        assert_eq!(
                            calls
                                .iter()
                                .filter(|(_, request, _)| {
                                    matches!(request, protocol::Request::Close)
                                })
                                .count(),
                            1,
                            "read failure must not dispatch duplicate cleanup"
                        );
                    }
                }
            }
        }
    }

    #[tokio::test]
    async fn idle_content_read_releases_its_stream_when_peer_cancels() {
        use sea_core::storage::SeaStorage as _;
        use sea_memory::MemoryStorage;
        use sea_sequencer::session::LocalSequencer;

        let (_, view) = MemoryStorage::new().create_view().await.unwrap();
        let sequencer = LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap();
        let session = sequencer.open_session(None).await.unwrap();
        let service = Arc::new(crate::SessionDispatcher::new(Arc::new(session)));
        let (requests, receive) = tokio::sync::mpsc::unbounded_channel();
        requests
            .send(
                protocol::encode_request_frame(
                    protocol::StreamRole::Content,
                    &protocol::Request::Read {
                        after: None,
                        stop_after: None,
                    },
                    protocol::Limits::default(),
                )
                .unwrap(),
            )
            .unwrap();
        let (stop, stopped) = watch::channel(false);
        let writes = Arc::new(AtomicUsize::new(0));
        let config = TransportConfig::default();
        let metrics = Metrics::default();
        let serving = serve_content_stream(
            TestSend {
                writes: writes.clone(),
                responses: None,
                stopped,
                fail: Arc::new(AtomicBool::new(false)),
                finished: Arc::new(AtomicBool::new(false)),
            },
            TestReceive(receive),
            service,
            &config,
            &metrics,
            protocol::StreamRole::Content,
            protocol::Request::OpenContentStream {
                authority: Vec::new(),
            },
        );
        tokio::pin!(serving);
        assert!(futures_util::poll!(&mut serving).is_pending());
        assert!(writes.load(Ordering::Relaxed) > 1, "read must have started");
        stop.send_replace(true);
        assert!(matches!(
            futures_util::poll!(&mut serving),
            std::task::Poll::Ready(Ok(()))
        ));
    }

    #[tokio::test(start_paused = true)]
    async fn idle_stream_outlives_operation_deadline() {
        let (sender, receiver) = tokio::sync::mpsc::unbounded_channel();
        let mut receive = TestReceive(receiver);
        let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        let reading = read_next_network_frame(&mut receive, &mut decoder, Duration::from_secs(5));
        tokio::pin!(reading);
        assert!(futures_util::poll!(&mut reading).is_pending());
        tokio::time::advance(Duration::from_secs(3600)).await;
        assert!(futures_util::poll!(&mut reading).is_pending());
        sender
            .send(
                protocol::encode_request_frame(
                    protocol::StreamRole::Author,
                    &protocol::Request::Close,
                    protocol::Limits::default(),
                )
                .unwrap(),
            )
            .unwrap();
        assert_eq!(
            reading.await.unwrap().unwrap().kind,
            protocol::MessageKind::Close
        );
    }

    #[tokio::test(start_paused = true)]
    async fn invalid_first_length_fails_without_waiting_for_more_bytes() {
        let (_sender, receiver) = tokio::sync::mpsc::unbounded_channel();
        let mut receive = TestReceive(receiver);
        let reading = read_one_network_frame(&mut receive, [0; 4], protocol::Limits::default());
        tokio::pin!(reading);
        assert!(matches!(
            futures_util::poll!(&mut reading),
            std::task::Poll::Ready(Err(_))
        ));
    }

    #[tokio::test(start_paused = true)]
    async fn partial_frame_expires_after_operation_deadline() {
        let (sender, receiver) = tokio::sync::mpsc::unbounded_channel();
        let mut receive = TestReceive(receiver);
        let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        sender
            .send(vec![u8::from(protocol::MessageKind::Close)])
            .unwrap();
        let reading = read_next_network_frame(&mut receive, &mut decoder, Duration::from_secs(5));
        tokio::pin!(reading);
        assert!(futures_util::poll!(&mut reading).is_pending());
        tokio::time::advance(Duration::from_secs(6)).await;
        assert!(matches!(reading.await, Err(WebTransportError::Timeout)));
    }

    /// Creates a one-slot listener and a certificate-pinned client configuration.
    fn admission_fixture() -> (WebTransportServer, ClientConfig, Arc<AdmissionService>) {
        let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
        let certificate_hash = identity.certificate_chain().as_slice()[0].hash();
        let service = Arc::new(AdmissionService::default());
        let server = WebTransportServer::bind(
            "127.0.0.1:0".parse().unwrap(),
            identity,
            service.clone(),
            TransportConfig {
                max_connections: 1,
                operation_timeout: Duration::from_millis(500),
                ..TransportConfig::default()
            },
        )
        .unwrap();
        let client = ClientConfig::builder()
            .with_bind_default()
            .with_server_certificate_hashes([certificate_hash])
            .build();
        (server, client, service)
    }

    /// Completes QUIC without sending the HTTP/3 settings required for admission.
    async fn stalled_admission(
        address: SocketAddr,
        config: &ClientConfig,
    ) -> (wtransport::quinn::Endpoint, wtransport::quinn::Connection) {
        let mut endpoint =
            wtransport::quinn::Endpoint::client("127.0.0.1:0".parse().unwrap()).unwrap();
        endpoint.set_default_client_config(config.quic_config().clone());
        let connection = endpoint
            .connect(address, "localhost")
            .unwrap()
            .await
            .unwrap();
        (endpoint, connection)
    }

    #[tokio::test]
    async fn failed_admissions_release_capacity_and_preserve_listener() {
        let (server, config, service) = admission_fixture();
        let address = server.local_addr().unwrap();
        let shutdown = server.shutdown_handle();
        let measurements = server.measurement_handle();
        let serving = tokio::spawn(server.serve_until_shutdown());
        let exercise = async {
            let (_raw_endpoint, stalled) = stalled_admission(address, &config).await;
            timeout(Duration::from_secs(2), stalled.closed())
                .await
                .expect("deadline must close the stalled transport");

            let (_aborted_endpoint, aborted) = stalled_admission(address, &config).await;
            aborted.close(wtransport::quinn::VarInt::from_u32(0), b"abandon handshake");

            let client = Endpoint::client(config).unwrap();
            assert!(
                client
                    .connect(format!("https://{address}/forbidden"))
                    .await
                    .is_err()
            );
            let connected = client
                .connect(format!("https://{address}/sea"))
                .await
                .unwrap();
            assert_eq!(measurements.snapshot().connection_cleanups, 3);
            assert_eq!(*service.closures.lock().unwrap(), [false, false, false]);
            assert_eq!(measurements.snapshot().active_connections, 1);
            connected.close(VarInt::from_u32(0), b"finished");
            shutdown
                .shutdown(ShutdownMode::Drain {
                    timeout: Duration::from_secs(2),
                })
                .unwrap();
        };
        timeout(Duration::from_secs(5), exercise).await.unwrap();
        assert_eq!(
            serving.await.unwrap().unwrap().disposition,
            ShutdownDisposition::Drained
        );
        assert_eq!(measurements.snapshot().connection_cleanups, 4);
    }

    #[tokio::test]
    async fn shutdown_cancels_pending_admission_without_reconnect_grace() {
        for mode in [
            ShutdownMode::Immediate,
            ShutdownMode::Drain {
                timeout: Duration::ZERO,
            },
        ] {
            let (server, config, service) = admission_fixture();
            let address = server.local_addr().unwrap();
            let shutdown = server.shutdown_handle();
            let measurements = server.measurement_handle();
            let serving = tokio::spawn(server.serve_until_shutdown());
            let (_endpoint, _connection) = stalled_admission(address, &config).await;
            shutdown.shutdown(mode).unwrap();
            let outcome = timeout(Duration::from_secs(2), serving)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            assert_eq!(outcome.disposition, ShutdownDisposition::Cancelled);
            assert_eq!(outcome.owned_connections, 1);
            assert_eq!(outcome.cancelled_connections, 1);
            assert_eq!(measurements.snapshot().connection_cleanups, 1);
            assert_eq!(*service.closures.lock().unwrap(), [false]);
        }
    }

    #[tokio::test]
    async fn connections_run_in_independent_owned_tasks() {
        let (mut server, config, service) = admission_fixture();
        server.config.max_connections = 2;
        let address = server.local_addr().unwrap();
        let shutdown = server.shutdown_handle();
        let serving = tokio::spawn(server.serve_until_shutdown());
        let listener_task = serving.id();
        let client = Endpoint::client(config).unwrap();
        let exercise = async {
            let first = client
                .connect(format!("https://{address}/sea"))
                .await
                .unwrap();
            let second = client
                .connect(format!("https://{address}/sea"))
                .await
                .unwrap();
            first.close(VarInt::from_u32(0), b"finished");
            second.close(VarInt::from_u32(0), b"finished");
            shutdown
                .shutdown(ShutdownMode::Drain {
                    timeout: Duration::from_secs(2),
                })
                .unwrap();
            assert_eq!(
                serving.await.unwrap().unwrap().disposition,
                ShutdownDisposition::Drained
            );
        };
        timeout(Duration::from_secs(5), exercise).await.unwrap();
        let tasks = service.tasks.lock().unwrap();
        assert_eq!(tasks.len(), 2);
        assert!(tasks.iter().all(Option::is_some));
        assert_ne!(tasks[0], Some(listener_task));
        assert_ne!(tasks[1], Some(listener_task));
        assert_ne!(tasks[0], tasks[1]);
    }

    #[tokio::test]
    async fn cancellation_joins_tasks_and_does_not_repeat_completed_cleanup() {
        let service = Arc::new(AdmissionService::default());
        let metrics = Arc::new(Metrics::default());
        let mut connections = JoinSet::new();
        let mut services = BTreeMap::new();
        for id in 1..=2 {
            services.insert(id, service.clone() as Arc<dyn SeaConnectionService>);
        }
        let (completed, completion) = tokio::sync::oneshot::channel();
        let task_service = service.clone();
        let task_metrics = metrics.clone();
        connections.spawn(async move {
            task_service.connection_closed(false).await;
            task_metrics.record_connection_cleanup();
            completed.send(()).unwrap();
            (1, Ok(()))
        });
        completion.await.unwrap();
        connections.spawn(std::future::pending());
        cancel_connections(&mut connections, services, &metrics)
            .await
            .unwrap();
        assert!(connections.is_empty());
        assert_eq!(*service.closures.lock().unwrap(), [false, false]);
        assert_eq!(metrics.snapshot().connection_cleanups, 2);
    }

    #[tokio::test]
    async fn cancellation_reports_panics_and_releases_their_services() {
        let service = Arc::new(AdmissionService::default());
        let metrics = Metrics::default();
        let mut connections = JoinSet::new();
        let (started, start) = tokio::sync::oneshot::channel();
        connections.spawn(async move {
            started.send(()).unwrap();
            panic!("injected connection task failure");
        });
        start.await.unwrap();
        let services = BTreeMap::from([(1, service.clone() as Arc<dyn SeaConnectionService>)]);
        let result = cancel_connections(&mut connections, services, &metrics).await;
        assert!(matches!(result, Err(WebTransportError::Transport(_))));
        assert!(connections.is_empty());
        assert_eq!(*service.closures.lock().unwrap(), [false]);
        assert_eq!(metrics.snapshot().connection_cleanups, 1);
    }

    /// Supplies storage settlement outcomes without involving a real network connection.
    struct FlushService {
        /// Fails immediately when set; otherwise leaves accepted storage work pending.
        fail: bool,
    }

    #[async_trait]
    impl SeaServiceHost for FlushService {
        fn connect(&self, _liveness: LivenessPolicy) -> Arc<dyn SeaConnectionService> {
            unreachable!("flush tests do not open connections")
        }

        async fn flush(&self) -> Result<(), WebTransportError> {
            if self.fail {
                Err(WebTransportError::StorageShutdown(
                    "injected failure".into(),
                ))
            } else {
                std::future::pending().await
            }
        }
    }

    #[tokio::test(start_paused = true)]
    async fn storage_flush_timeout_and_failure_never_report_drained() {
        for fail in [false, true] {
            let (mut server, _, _) = admission_fixture();
            server.service = Arc::new(FlushService { fail });
            server
                .shutdown_handle()
                .shutdown(ShutdownMode::Drain {
                    timeout: Duration::from_secs(1),
                })
                .unwrap();
            let result = server.serve_until_shutdown().await;
            if fail {
                assert!(matches!(result, Err(WebTransportError::StorageShutdown(_))));
            } else {
                assert_eq!(result.unwrap().disposition, ShutdownDisposition::Cancelled);
            }
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore = "run by the browser harness after building the test-only WASM fixture"]
    async fn browser_disconnect_and_drop_release_capacity() {
        std::env::var("SEA_BROWSER_LIFECYCLE_WASM")
            .expect("browser harness must provide the generated lifecycle fixture directory");
        let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
        let hash = identity.certificate_chain().as_slice()[0]
            .hash()
            .fmt(wtransport::tls::Sha256DigestFmt::DottedHex)
            .replace(':', "");
        let closures = Arc::new(Mutex::new(Vec::new()));
        let server = WebTransportServer::bind(
            "127.0.0.1:0".parse().unwrap(),
            identity,
            Arc::new(AdmissionService {
                closures,
                tasks: Arc::default(),
            }),
            TransportConfig {
                max_connections: 1,
                liveness: LivenessPolicy {
                    inactivity_timeout: Duration::from_secs(120),
                    ..LivenessPolicy::default()
                },
                ..TransportConfig::default()
            },
        )
        .unwrap();
        let url = format!("https://{}/sea", server.local_addr().unwrap());
        let shutdown = server.shutdown_handle();
        let measurements = server.measurement_handle();
        let serving = tokio::spawn(server.serve_until_shutdown());
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new("node")
                .current_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
                .args([
                    "tests/webtransport-browser/run-headless.mjs",
                    "tests/webtransport-browser",
                    &url,
                    &hash,
                ])
                .env_remove("SEA_WEBSOCKET_STREAM")
                .env_remove("SEA_ORDINARY_WEBSOCKET")
                .env_remove("SEA_BROWSER_HTTP_PORT")
                .output()
                .unwrap()
        })
        .await
        .unwrap();
        let cleanup = timeout(Duration::from_secs(2), async {
            while measurements.snapshot().active_connections != 0 {
                tokio::task::yield_now().await;
            }
        })
        .await;
        let observed = measurements.snapshot();
        shutdown.shutdown(ShutdownMode::Immediate).unwrap();
        serving.await.unwrap().unwrap();
        println!("{}", String::from_utf8_lossy(&output.stdout));
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        cleanup.unwrap();
        assert_eq!(observed.connection_cleanups, 4);
        assert_eq!(observed.peak_active_connections, 1);
        assert_eq!(observed.active_connections, 0);
    }
}
