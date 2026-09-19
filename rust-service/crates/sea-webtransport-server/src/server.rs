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
    /// Timeout for connection establishment and framed I/O.
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
}

/// Response stream returned by a connection-scoped Sea service.
pub type SeaResponseStream = Pin<Box<dyn Stream<Item = sea_v1::Response> + Send + 'static>>;

/// Per-connection final Sea protocol dispatcher.
#[async_trait]
pub trait SeaConnectionService: Send + Sync {
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

    /// Validates author-stream authority or handles one ordered author operation.
    async fn author_request(&self, request: sea_v1::Request) -> sea_v1::Response;

    /// Opens latest-value snapshot coordination after validating session authority.
    async fn snapshot_stream(
        &self,
        request: sea_v1::Request,
    ) -> Result<SeaResponseStream, sea_v1::Response>;

    /// Handles one correlated operation on an open snapshot stream.
    /// `Close` acknowledges only; the transport ends and drops that stream's registration lease.
    async fn snapshot_request(&self, request: sea_v1::Request) -> sea_v1::Response;

    /// Revokes the session's current publisher membership after connection loss.
    async fn revoke_snapshot_publisher(&self);

    /// Validates content-stream authority.
    async fn open_content_stream(&self, request: sea_v1::Request) -> sea_v1::Response;

    /// Handles one bounded content operation.
    async fn content_request(
        &self,
        request: sea_v1::Request,
    ) -> Result<SeaResponseStream, sea_v1::Response>;
}

/// Creates isolated Sea protocol state for each WebTransport connection.
pub trait SeaServiceHost: Send + Sync {
    /// Creates one connection-scoped dispatcher.
    fn connect(&self, liveness: LivenessPolicy) -> Arc<dyn SeaConnectionService>;
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
    /// Returns the first terminal connection error.
    pub async fn serve(self) -> Result<(), WebTransportError> {
        self.serve_until_shutdown().await.map(|_| ())
    }

    /// Serves until shutdown and reports drain versus cancellation.
    ///
    /// # Errors
    ///
    /// Returns the first terminal connection error.
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
                    connections.push(async move {
                        let result = async {
                            let request = incoming.await.map_err(transport_error)?;
                            if request.path() != "/sea" {
                                request.forbidden().await;
                                return Ok(());
                            }
                            let connection = request.accept().await.map_err(transport_error)?;
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
        Ok(ShutdownOutcome {
            disposition: ShutdownDisposition::Drained,
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
    service.connection_closed(true).await;
    metrics.record_connection_cleanup();
    result
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
            accepted = connection.accept_bi(), if streams.len() < config.max_streams_per_connection => {
                let Ok((send, receive)) = accepted else {
                    return Ok(());
                };
                let service = Arc::clone(&service);
                let config = config.clone();
                let metrics = Arc::clone(&metrics);
                streams.push(async move {
                    let _active = metrics.enter_stream();
                    serve_sea_stream(send, receive, service, &config, &metrics).await
                });
            }
            _ = streams.next(), if !streams.is_empty() => {}
        }
    }
}

pub(crate) async fn serve_sea_stream(
    send: impl SendStream,
    mut receive: impl ReceiveStream,
    service: Arc<dyn SeaConnectionService>,
    config: &TransportConfig,
    metrics: &Metrics,
) -> Result<(), WebTransportError> {
    let mut prefix = [0_u8; 4];
    timeout(config.operation_timeout, receive.read_exact(&mut prefix))
        .await
        .map_err(|_| WebTransportError::Timeout)?
        .map_err(transport_error)?;
    serve_network_stream(send, receive, prefix, service, config, metrics).await
}

#[allow(clippy::too_many_lines)]
async fn serve_network_stream(
    mut send: impl SendStream,
    mut receive: impl ReceiveStream,
    prefix: [u8; 4],
    service: Arc<dyn SeaConnectionService>,
    config: &TransportConfig,
    metrics: &Metrics,
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
    let correlation_id = frame.correlation_id;
    let request = sea_v1::decode_request_frame(role, &frame)?;
    metrics.add_wire_bytes(4 + 1 + 8 + frame.payload.len());
    if matches!(request, sea_v1::Request::OpenAuthorStream { .. }) {
        return serve_author_stream(
            send,
            receive,
            service,
            config,
            metrics,
            role,
            frame.correlation_id,
            request,
        )
        .await;
    }
    if matches!(request, sea_v1::Request::OpenSnapshotStream { .. }) {
        return serve_snapshot_stream(
            send,
            receive,
            service,
            config,
            metrics,
            role,
            frame.correlation_id,
            request,
        )
        .await;
    }
    if matches!(request, sea_v1::Request::OpenContentStream { .. }) {
        return serve_content_stream(
            send,
            receive,
            service,
            config,
            metrics,
            role,
            frame.correlation_id,
            request,
        )
        .await;
    }
    if matches!(request, sea_v1::Request::OpenEventStream { .. }) {
        let mut responses = match service.open_event_stream(request).await {
            Ok(responses) => responses,
            Err(response) => {
                return write_network_response(
                    &mut send,
                    role,
                    correlation_id,
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
                correlation_id,
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
        correlation_id,
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
    correlation_id: u64,
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
            correlation_id,
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
            metrics.add_wire_bytes(4 + 1 + 8 + frame.payload.len());
            let close = matches!(request, sea_v1::Request::Close);
            let response = service.author_request(request).await;
            write_network_response(
                &mut send,
                role,
                frame.correlation_id,
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

#[allow(clippy::too_many_arguments)]
async fn serve_snapshot_stream(
    mut send: impl SendStream,
    mut receive: impl ReceiveStream,
    service: Arc<dyn SeaConnectionService>,
    config: &TransportConfig,
    metrics: &Metrics,
    role: sea_v1::StreamRole,
    correlation_id: u64,
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
                correlation_id,
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
            correlation_id,
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
                    metrics.add_wire_bytes(4 + 1 + 8 + frame.payload.len());
                    let close = matches!(request, sea_v1::Request::Close);
                    let response = service.snapshot_request(request).await;
                    write_network_response(
                        &mut send,
                        role,
                        frame.correlation_id,
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
                        0,
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
    correlation_id: u64,
    opening: sea_v1::Request,
) -> Result<(), WebTransportError> {
    let limits = sea_v1::Limits {
        max_frame_bytes: config.max_frame_bytes,
    };
    let response = service.open_content_stream(opening).await;
    write_network_response(
        &mut send,
        role,
        correlation_id,
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
        metrics.add_wire_bytes(4 + 1 + 8 + frame.payload.len());
        let mut responses = match service.content_request(request).await {
            Ok(responses) => responses,
            Err(response) => Box::pin(stream::once(async move { response })),
        };
        while let Some(response) = responses.next().await {
            write_network_response(
                &mut send,
                role,
                frame.correlation_id,
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
            frame.correlation_id,
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
    let mut buffer = [0_u8; 8192];
    loop {
        if let Some(frame) = decoder.next_frame()? {
            return Ok(frame);
        }
        let Some(count) = receive.read(&mut buffer).await.map_err(transport_error)? else {
            decoder.finish()?;
            return Err(WebTransportError::Disconnected);
        };
        decoder.push(&buffer[..count]);
    }
}

#[allow(clippy::too_many_arguments)]
async fn write_network_response(
    send: &mut impl SendStream,
    role: sea_v1::StreamRole,
    correlation_id: u64,
    response: &sea_v1::Response,
    limits: sea_v1::Limits,
    operation_timeout: Duration,
    metrics: &Metrics,
    finish: bool,
) -> Result<(), WebTransportError> {
    let encoded = sea_v1::encode_response_frame(role, correlation_id, response, limits)?;
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
