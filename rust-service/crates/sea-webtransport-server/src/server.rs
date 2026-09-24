#![doc = "Native Sea WebTransport server endpoint and dispatch."]

use std::{
    collections::BTreeMap,
    net::SocketAddr,
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    time::Duration,
};

use async_trait::async_trait;
use futures_core::Stream;
use futures_util::{StreamExt as _, stream, stream::FuturesUnordered};
use thiserror::Error;
use tokio::{
    sync::watch,
    time::{Instant, timeout, timeout_at},
};
use wtransport::{
    Connection, Endpoint, Identity, ServerConfig, VarInt,
    endpoint::endpoint_side::Server as ServerSide,
};

use crate::stream::{ReceiveStream, SendStream};
use sea_webtransport::protocol as sea_v1;

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
            operation_timeout: Duration::from_secs(5),
            liveness: LivenessPolicy::default(),
        }
    }
}

impl TransportConfig {
    pub(crate) fn validate(&self) -> Result<(), WebTransportError> {
        if self.max_frame_bytes < sea_v1::MIN_FRAME_BYTES
            || self.max_connections == 0
            || self.max_streams_per_connection == 0
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
    SeaProtocol(#[from] sea_v1::ProtocolError),
    /// The server cannot accept another shutdown request.
    #[error("server is no longer available for shutdown")]
    ShutdownUnavailable,
    /// Accepted storage work could not complete during orderly shutdown.
    #[error("storage shutdown failed: {0}")]
    StorageShutdown(String),
}

/// Response stream returned by a connection-scoped Sea service.
pub type SeaResponseStream = Pin<Box<dyn Stream<Item = sea_v1::Response> + Send + 'static>>;

/// Sea protocol dispatch for a connection or an immutable session binding.
/// Transport loops bind author, content, and snapshot streams before invoking session operations.
#[async_trait]
pub trait SeaConnectionService: Send + Sync {
    /// Validates an opening token and binds a logical stream to that session incarnation.
    ///
    /// The returned dispatcher must keep the admitted session for all subsequent operations
    /// and cleanup, even if this connection opens a replacement session.
    /// A rejected opening must not close or otherwise mutate the current session.
    async fn bind_session(
        self: Arc<Self>,
        authority: &[u8],
    ) -> Result<Arc<dyn SeaConnectionService>, sea_v1::Response>;

    /// Admits a best-effort datagram for the connection's established signal registration.
    async fn signal_datagram(&self, _submission: sea_v1::signals::Submission) {}
    /// Opens ephemeral messaging without creating author membership.
    async fn open_signals(
        &self,
        _opening: sea_v1::signals::OpenSignals,
    ) -> Result<Arc<sea_signals::SignalConnection>, sea_v1::Response> {
        Err(sea_v1::Response::Error {
            kind: sea_v1::ErrorKind::Rejected,
            message: "signals are unsupported by this host".to_owned(),
        })
    }
    /// Releases all session state owned by this network connection.
    async fn connection_closed(&self, allow_reconnect_grace: bool);

    /// Opens the gap-free recovery and live event stream.
    async fn open_event_stream(
        &self,
        request: sea_v1::Request,
    ) -> Result<SeaResponseStream, sea_v1::Response>;

    /// Opens the gap-free recovery and live event stream for an established session.
    async fn event_stream(
        &self,
        resume_after: Option<u64>,
    ) -> Result<SeaResponseStream, sea_v1::Response>;

    /// Acknowledges a bound author-stream opening or handles one ordered author operation.
    async fn author_request(&self, request: sea_v1::Request) -> sea_v1::Response;

    /// Opens latest-value snapshot coordination on the bound session.
    async fn snapshot_stream(
        &self,
        request: sea_v1::Request,
    ) -> Result<SeaResponseStream, sea_v1::Response>;

    /// Handles one ordered operation on an open snapshot stream.
    /// `Close` acknowledges only; the transport ends and drops that stream's registration lease.
    async fn snapshot_request(&self, request: sea_v1::Request) -> sea_v1::Response;

    /// Revokes the session's current publisher membership after connection loss.
    async fn revoke_snapshot_publisher(&self);

    /// Acknowledges a content-stream opening on the bound session.
    async fn open_content_stream(&self, request: sea_v1::Request) -> sea_v1::Response;

    /// Handles one bounded content operation.
    async fn content_request(
        &self,
        request: sea_v1::Request,
    ) -> Result<SeaResponseStream, sea_v1::Response>;
}

/// Creates isolated Sea protocol state for each WebTransport connection.
#[async_trait]
pub trait SeaServiceHost: Send + Sync {
    /// Creates one connection-scoped dispatcher.
    fn connect(&self, liveness: LivenessPolicy) -> Arc<dyn SeaConnectionService>;

    /// Writes the accepted storage prefix without stopping a host shared by other listeners.
    async fn flush(&self) -> Result<(), WebTransportError> {
        Ok(())
    }
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
    /// Returns an error for invalid limits or endpoint binding failure.
    pub fn bind(
        address: SocketAddr,
        identity: Identity,
        service: Arc<dyn SeaServiceHost>,
        config: TransportConfig,
    ) -> Result<Self, WebTransportError> {
        config.validate()?;
        let server_config = ServerConfig::builder()
            .with_bind_address(address)
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
    /// Returns the first terminal established-connection error; failed admissions are local.
    pub async fn serve(self) -> Result<(), WebTransportError> {
        self.serve_until_shutdown().await.map(|_| ())
    }

    /// Serves until shutdown and reports drain versus cancellation.
    ///
    /// # Errors
    ///
    /// Returns the first terminal established-connection error; failed admissions are local.
    #[expect(
        clippy::too_many_lines,
        reason = "Keep connection drain and persistence deadline handling together"
    )]
    pub async fn serve_until_shutdown(mut self) -> Result<ShutdownOutcome, WebTransportError> {
        let mut connections = FuturesUnordered::new();
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
                    connections.push(async move {
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
                result = connections.next(), if !connections.is_empty() => {
                    match result {
                        Some((connection_id, Ok(()))) => {
                            active_services.remove(&connection_id);
                        }
                        Some((connection_id, Err(error))) => {
                            active_services.remove(&connection_id);
                            cleanup_services(active_services, &self.metrics).await;
                            return Err(error);
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
            match timeout_at(deadline, connections.next()).await {
                Ok(Some((connection_id, Ok(())))) => {
                    active_services.remove(&connection_id);
                }
                Ok(Some((connection_id, Err(error)))) => {
                    active_services.remove(&connection_id);
                    cleanup_services(active_services, &self.metrics).await;
                    return Err(error);
                }
                Ok(None) => break,
                Err(_) => {
                    let cancelled_connections = connections.len();
                    self.endpoint
                        .close(CLOSE_CODE, b"server shutdown deadline elapsed");
                    drop(connections);
                    cleanup_services(active_services, &self.metrics).await;
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
                let mut decoder = sea_v1::NetworkFrameDecoder::new(sea_v1::Limits { max_frame_bytes: config.max_frame_bytes });
                decoder.push(&datagram.payload());
                if let Ok(Some(frame)) = decoder.next_frame()
                    && decoder.finish().is_ok()
                    && let Ok(sea_v1::Request::SendSignal(submission)) = sea_v1::decode_request_frame(sea_v1::StreamRole::Signal, &frame)
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
    let limits = sea_v1::Limits {
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
            .ok_or(sea_v1::ProtocolError::UnexpectedMessageDirection(
                frame.kind,
            ))?;

    let request = sea_v1::decode_request_frame(role, &frame)?;
    metrics.add_wire_bytes(frame.encoded_len()?);
    if let sea_v1::Request::OpenSignalStream(opening) = request {
        return serve_signal_stream(send, receive, service, config, metrics, opening, datagrams)
            .await;
    }
    let service = match &request {
        sea_v1::Request::OpenAuthorStream { authority }
        | sea_v1::Request::OpenSnapshotStream { authority, .. }
        | sea_v1::Request::OpenContentStream { authority } => {
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
    if matches!(request, sea_v1::Request::OpenAuthorStream { .. }) {
        return serve_author_stream(send, receive, service, config, metrics, role, request).await;
    }
    if matches!(request, sea_v1::Request::OpenSnapshotStream { .. }) {
        return serve_snapshot_stream(send, receive, service, config, metrics, role, request).await;
    }
    if matches!(request, sea_v1::Request::OpenContentStream { .. }) {
        return serve_content_stream(send, receive, service, config, metrics, role, request).await;
    }
    if matches!(request, sea_v1::Request::OpenEventStream { .. }) {
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
    let response = sea_v1::Response::Error {
        kind: sea_v1::ErrorKind::Rejected,
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

#[allow(clippy::too_many_arguments)]
async fn serve_author_stream(
    mut send: impl SendStream,
    mut receive: impl ReceiveStream,
    service: Arc<dyn SeaConnectionService>,
    config: &TransportConfig,
    metrics: &Metrics,
    role: sea_v1::StreamRole,

    opening: sea_v1::Request,
) -> Result<(), WebTransportError> {
    let result = async {
        let limits = sea_v1::Limits {
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
        if matches!(response, sea_v1::Response::Error { .. }) {
            return send.finish().await.map_err(transport_error);
        }
        let mut decoder = sea_v1::NetworkFrameDecoder::new(limits);
        loop {
            let frame =
                match read_next_network_frame(&mut receive, &mut decoder, config.operation_timeout)
                    .await
                {
                    Ok(Some(frame)) => frame,
                    Ok(None) => {
                        let _ = service.author_request(sea_v1::Request::Close).await;
                        return send.finish().await.map_err(transport_error);
                    }
                    Err(error) => {
                        let _ = service.author_request(sea_v1::Request::Close).await;
                        return Err(error);
                    }
                };
            let request = sea_v1::decode_request_frame(role, &frame)?;
            if matches!(request, sea_v1::Request::OpenAuthorStream { .. }) {
                return Err(sea_v1::ProtocolError::WrongStream {
                    kind: request.kind(),
                    role,
                }
                .into());
            }
            metrics.add_wire_bytes(frame.encoded_len()?);
            let close = matches!(request, sea_v1::Request::Close);
            let response = service.author_request(request).await;
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
            if close || matches!(response, sea_v1::Response::Error { .. }) {
                return send.finish().await.map_err(transport_error);
            }
        }
    }
    .await;
    let _ = service.author_request(sea_v1::Request::Close).await;
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

    opening: sea_v1::signals::OpenSignals,
    datagrams: Option<Connection>,
) -> Result<(), WebTransportError> {
    use sea_core::signals::SeaSignals as _;
    let role = sea_v1::StreamRole::Signal;
    let limits = sea_v1::Limits {
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
        write_network_response(&mut send, role, &sea_v1::Response::Acknowledged, limits, config.operation_timeout, metrics, false).await?;
        let mut decoder = sea_v1::NetworkFrameDecoder::new(limits);
        loop {
            tokio::select! {
                frame = read_next_network_frame(&mut receive, &mut decoder, config.operation_timeout) => {
                    let Some(frame) = frame? else { break; };
                    metrics.add_wire_bytes(frame.encoded_len()?);
                    let request = sea_v1::decode_request_frame(role, &frame)?;
                    let close = matches!(request, sea_v1::Request::Close);
                    let response = match request {
                        sea_v1::Request::SendSignal(submission) => match connection.send_signal(submission.into()).await {
                            Ok(()) => sea_v1::Response::Acknowledged,
                            Err(error) => crate::dispatch::error_response(error),
                        },
                        sea_v1::Request::Close => sea_v1::Response::Acknowledged,
                        _ => sea_v1::Response::Error { kind: sea_v1::ErrorKind::Rejected, message: "invalid signal request".to_owned() },
                    };
                    let failed = matches!(response, sea_v1::Response::Error { .. });
                    write_network_response(&mut send, role, &response, limits, config.operation_timeout, metrics, false).await?;
                    if close || failed { break; }
                }
                event = connection.next_signal() => {
                    let response = match event {
                        Ok(Some(event)) => sea_v1::Response::SignalEvent(event.into()),
                        Ok(None) => break,
                        Err(error) => crate::dispatch::error_response(error),
                    };
                    let failed = matches!(response, sea_v1::Response::Error { .. });
                    if let (Some(connection), sea_v1::Response::SignalEvent(sea_v1::signals::Event::Message { submission, .. })) = (&datagrams, &response)
                        && submission.best_effort {
                            let bytes = sea_v1::encode_response_frame(role, &response, limits)?;
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
    role: sea_v1::StreamRole,

    opening: sea_v1::Request,
) -> Result<(), WebTransportError> {
    let limits = sea_v1::Limits {
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

            &sea_v1::Response::Acknowledged,
            limits,
            config.operation_timeout,
            metrics,
            false,
        )
        .await?;
        let mut decoder = sea_v1::NetworkFrameDecoder::new(limits);
        loop {
            tokio::select! {
                frame = read_next_network_frame(&mut receive, &mut decoder, config.operation_timeout) => {
                    let Some(frame) = frame? else { break };
                    let request = sea_v1::decode_request_frame(role, &frame)?;
                    metrics.add_wire_bytes(frame.encoded_len()?);
                    let close = matches!(request, sea_v1::Request::Close);
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
    role: sea_v1::StreamRole,

    opening: sea_v1::Request,
) -> Result<(), WebTransportError> {
    let limits = sea_v1::Limits {
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
    if matches!(response, sea_v1::Response::Error { .. }) {
        return send.finish().await.map_err(transport_error);
    }
    let mut decoder = sea_v1::NetworkFrameDecoder::new(limits);
    while let Some(frame) =
        read_next_network_frame(&mut receive, &mut decoder, config.operation_timeout).await?
    {
        let request = sea_v1::decode_request_frame(role, &frame)?;
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
            &sea_v1::Response::ResponseComplete,
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
    decoder: &mut sea_v1::NetworkFrameDecoder,
    operation_timeout: Duration,
) -> Result<Option<sea_v1::NetworkFrame>, WebTransportError> {
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
    limits: sea_v1::Limits,
) -> Result<sea_v1::NetworkFrame, WebTransportError> {
    let mut decoder = sea_v1::NetworkFrameDecoder::new(limits);
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
    role: sea_v1::StreamRole,

    response: &sea_v1::Response,
    limits: sea_v1::Limits,
    operation_timeout: Duration,
    metrics: &Metrics,
    finish: bool,
) -> Result<(), WebTransportError> {
    let encoded = sea_v1::encode_response_frame(role, response, limits)?;
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
    struct AdmissionService {
        /// Reconnect-grace arguments in callback order.
        closures: Arc<Mutex<Vec<bool>>>,
    }

    impl SeaServiceHost for AdmissionService {
        fn connect(&self, _liveness: LivenessPolicy) -> Arc<dyn SeaConnectionService> {
            Arc::new(Self {
                closures: self.closures.clone(),
            })
        }
    }

    #[async_trait]
    impl SeaConnectionService for AdmissionService {
        async fn bind_session(
            self: Arc<Self>,
            _authority: &[u8],
        ) -> Result<Arc<dyn SeaConnectionService>, sea_v1::Response> {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn connection_closed(&self, allow_reconnect_grace: bool) {
            self.closures.lock().unwrap().push(allow_reconnect_grace);
        }

        async fn open_event_stream(
            &self,
            _request: sea_v1::Request,
        ) -> Result<SeaResponseStream, sea_v1::Response> {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn event_stream(
            &self,
            _resume_after: Option<u64>,
        ) -> Result<SeaResponseStream, sea_v1::Response> {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn author_request(&self, _request: sea_v1::Request) -> sea_v1::Response {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn snapshot_stream(
            &self,
            _request: sea_v1::Request,
        ) -> Result<SeaResponseStream, sea_v1::Response> {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn snapshot_request(&self, _request: sea_v1::Request) -> sea_v1::Response {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn revoke_snapshot_publisher(&self) {}

        async fn open_content_stream(&self, _request: sea_v1::Request) -> sea_v1::Response {
            unreachable!("admission tests do not open Sea streams")
        }

        async fn content_request(
            &self,
            _request: sea_v1::Request,
        ) -> Result<SeaResponseStream, sea_v1::Response> {
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
        stopped: watch::Receiver<bool>,
        /// Injects a response-write failure after a successful opening.
        fail: Arc<AtomicBool>,
    }

    #[async_trait]
    impl SendStream for TestSend {
        async fn write_all(&mut self, _bytes: &[u8]) -> Result<(), WebTransportError> {
            if self.fail.load(Ordering::Relaxed) {
                return Err(WebTransportError::Disconnected);
            }
            self.writes.fetch_add(1, Ordering::Relaxed);
            Ok(())
        }

        async fn finish(&mut self) -> Result<(), WebTransportError> {
            Ok(())
        }

        async fn stopped(&mut self) {
            let _ = self.stopped.wait_for(|stopped| *stopped).await;
        }
    }

    /// Makes mutable connection routing distinguishable from a captured session dispatcher.
    struct StreamBindingProbe {
        /// Session captured by binding, or none for the mutable connection.
        admitted: Option<u64>,
        /// Replacement session selected by the connection.
        current: Arc<AtomicU64>,
        /// Session and request observed at each dispatch, including cleanup.
        calls: Arc<Mutex<Vec<(u64, sea_v1::Request)>>>,
    }

    impl StreamBindingProbe {
        /// Records the receiver's identity, not an identity supplied by the request.
        fn record(&self, request: sea_v1::Request) {
            let session = self
                .admitted
                .unwrap_or_else(|| self.current.load(Ordering::Relaxed));
            self.calls.lock().unwrap().push((session, request));
        }
    }

    #[async_trait]
    impl SeaConnectionService for StreamBindingProbe {
        async fn bind_session(
            self: Arc<Self>,
            authority: &[u8],
        ) -> Result<Arc<dyn SeaConnectionService>, sea_v1::Response> {
            if authority != b"probe" {
                return Err(sea_v1::Response::Error {
                    kind: sea_v1::ErrorKind::Rejected,
                    message: "invalid probe authority".to_owned(),
                });
            }
            Ok(Arc::new(Self {
                admitted: Some(self.current.load(Ordering::Relaxed)),
                current: self.current.clone(),
                calls: self.calls.clone(),
            }))
        }

        async fn connection_closed(&self, _allow_reconnect_grace: bool) {
            unreachable!("logical-stream tests do not close a physical connection")
        }

        async fn open_event_stream(
            &self,
            _request: sea_v1::Request,
        ) -> Result<SeaResponseStream, sea_v1::Response> {
            unreachable!("the probe supplies session identity without an event stream")
        }

        async fn event_stream(
            &self,
            _resume_after: Option<u64>,
        ) -> Result<SeaResponseStream, sea_v1::Response> {
            unreachable!("the probe supplies session identity without an event stream")
        }

        async fn author_request(&self, request: sea_v1::Request) -> sea_v1::Response {
            self.record(request);
            sea_v1::Response::Acknowledged
        }

        async fn snapshot_stream(
            &self,
            request: sea_v1::Request,
        ) -> Result<SeaResponseStream, sea_v1::Response> {
            self.record(request);
            Ok(Box::pin(stream::pending()))
        }

        async fn snapshot_request(&self, request: sea_v1::Request) -> sea_v1::Response {
            self.record(request);
            sea_v1::Response::Acknowledged
        }

        async fn revoke_snapshot_publisher(&self) {
            unreachable!("logical-stream cleanup drops its lease, not connection participation")
        }

        async fn open_content_stream(&self, request: sea_v1::Request) -> sea_v1::Response {
            self.record(request);
            sea_v1::Response::Acknowledged
        }

        async fn content_request(
            &self,
            request: sea_v1::Request,
        ) -> Result<SeaResponseStream, sea_v1::Response> {
            self.record(request);
            Ok(Box::pin(stream::once(async {
                sea_v1::Response::Acknowledged
            })))
        }
    }

    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn logical_stream_dispatch_and_cleanup_keep_the_admitted_session() {
        for role in [
            sea_v1::StreamRole::Author,
            sea_v1::StreamRole::Content,
            sea_v1::StreamRole::Snapshot,
        ] {
            for ending in [
                "eof",
                "close",
                "truncated-frame",
                "write-error",
                "invalid-authority",
            ] {
                if role != sea_v1::StreamRole::Author
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
                    sea_v1::StreamRole::Author => (
                        sea_v1::Request::OpenAuthorStream { authority },
                        sea_v1::Request::Submit {
                            reference: None,
                            event: sea_v1::Event {
                                payload: b"payload".to_vec(),
                                blob_tree: None,
                            },
                        },
                    ),
                    sea_v1::StreamRole::Content => (
                        sea_v1::Request::OpenContentStream { authority },
                        sea_v1::Request::PutBlob {
                            payload: b"payload".to_vec(),
                        },
                    ),
                    sea_v1::StreamRole::Snapshot => (
                        sea_v1::Request::OpenSnapshotStream {
                            authority,
                            participation: sea_v1::SnapshotParticipation::ClientSelected,
                        },
                        sea_v1::Request::LatestSnapshot,
                    ),
                    _ => unreachable!(),
                };
                let current = Arc::new(AtomicU64::new(1));
                let calls = Arc::new(Mutex::new(Vec::new()));
                let service = Arc::new(StreamBindingProbe {
                    admitted: None,
                    current: current.clone(),
                    calls: calls.clone(),
                });
                let limits = sea_v1::Limits::default();
                let opening = sea_v1::encode_request_frame(role, &opening, limits).unwrap();
                let prefix = opening[..4].try_into().unwrap();
                let (requests, receive) = tokio::sync::mpsc::unbounded_channel();
                for byte in &opening[4..] {
                    requests.send(vec![*byte]).unwrap();
                }
                let (_stop, stopped) = watch::channel(false);
                let fail = Arc::new(AtomicBool::new(false));
                let writes = Arc::new(AtomicUsize::new(0));
                let config = TransportConfig::default();
                let metrics = Metrics::default();
                let serving = serve_network_stream(
                    TestSend {
                        writes: writes.clone(),
                        stopped,
                        fail: fail.clone(),
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
                assert!(futures_util::poll!(&mut serving).is_pending());
                assert!(
                    writes.load(Ordering::Relaxed) > 0,
                    "opening must finish before replacement"
                );
                current.store(2, Ordering::Relaxed);
                let request = if ending == "close" {
                    sea_v1::Request::Close
                } else {
                    request
                };
                let mut encoded = sea_v1::encode_request_frame(role, &request, limits).unwrap();
                if ending == "truncated-frame" {
                    encoded.pop();
                }
                for byte in encoded {
                    requests.send(vec![byte]).unwrap();
                }
                drop(requests);
                fail.store(ending == "write-error", Ordering::Relaxed);
                let result = serving.await;
                assert_eq!(
                    result.is_err(),
                    matches!(ending, "truncated-frame" | "write-error")
                );
                let calls = calls.lock().unwrap();
                assert!(
                    calls.len() >= 2,
                    "{role:?}/{ending}: operation or cleanup missing"
                );
                assert!(
                    calls.iter().all(|(session, _)| *session == 1),
                    "{role:?}/{ending}: {calls:?}"
                );
                if role == sea_v1::StreamRole::Author {
                    assert!(
                        calls
                            .iter()
                            .any(|(_, request)| matches!(request, sea_v1::Request::Close))
                    );
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
                sea_v1::encode_request_frame(
                    sea_v1::StreamRole::Content,
                    &sea_v1::Request::Read {
                        after: None,
                        stop_after: None,
                    },
                    sea_v1::Limits::default(),
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
                stopped,
                fail: Arc::new(AtomicBool::new(false)),
            },
            TestReceive(receive),
            service,
            &config,
            &metrics,
            sea_v1::StreamRole::Content,
            sea_v1::Request::OpenContentStream {
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
        let mut decoder = sea_v1::NetworkFrameDecoder::new(sea_v1::Limits::default());
        let reading = read_next_network_frame(&mut receive, &mut decoder, Duration::from_secs(5));
        tokio::pin!(reading);
        assert!(futures_util::poll!(&mut reading).is_pending());
        tokio::time::advance(Duration::from_secs(3600)).await;
        assert!(futures_util::poll!(&mut reading).is_pending());
        sender
            .send(
                sea_v1::encode_request_frame(
                    sea_v1::StreamRole::Author,
                    &sea_v1::Request::Close,
                    sea_v1::Limits::default(),
                )
                .unwrap(),
            )
            .unwrap();
        assert_eq!(
            reading.await.unwrap().unwrap().kind,
            sea_v1::MessageKind::Close
        );
    }

    #[tokio::test(start_paused = true)]
    async fn invalid_first_length_fails_without_waiting_for_more_bytes() {
        let (_sender, receiver) = tokio::sync::mpsc::unbounded_channel();
        let mut receive = TestReceive(receiver);
        let reading = read_one_network_frame(&mut receive, [0; 4], sea_v1::Limits::default());
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
        let mut decoder = sea_v1::NetworkFrameDecoder::new(sea_v1::Limits::default());
        sender
            .send(vec![u8::from(sea_v1::MessageKind::Close)])
            .unwrap();
        let reading = read_next_network_frame(&mut receive, &mut decoder, Duration::from_secs(5));
        tokio::pin!(reading);
        assert!(futures_util::poll!(&mut reading).is_pending());
        tokio::time::advance(Duration::from_secs(6)).await;
        assert!(matches!(reading.await, Err(WebTransportError::Timeout)));
    }

    /// Creates a one-slot listener and a certificate-pinned client configuration.
    fn admission_fixture() -> (WebTransportServer, ClientConfig, Arc<Mutex<Vec<bool>>>) {
        let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
        let certificate_hash = identity.certificate_chain().as_slice()[0].hash();
        let closures = Arc::new(Mutex::new(Vec::new()));
        let server = WebTransportServer::bind(
            "127.0.0.1:0".parse().unwrap(),
            identity,
            Arc::new(AdmissionService {
                closures: closures.clone(),
            }),
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
        (server, client, closures)
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
        let (server, config, closures) = admission_fixture();
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
            assert_eq!(*closures.lock().unwrap(), [false, false, false]);
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
            let (server, config, closures) = admission_fixture();
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
            assert_eq!(*closures.lock().unwrap(), [false]);
        }
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
            Arc::new(AdmissionService { closures }),
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
