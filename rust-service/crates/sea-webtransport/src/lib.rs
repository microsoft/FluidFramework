#![doc = "Native HTTP/3 WebTransport server and client for typed Sea sessions."]
#![cfg(not(target_arch = "wasm32"))]

mod dispatch;
mod native;
pub mod protocol;

pub use dispatch::SessionDispatcher;
pub use native::{NativeSeaClient, SeaClientError};

use std::{
    net::SocketAddr,
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    time::Duration,
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_core::Stream;
use futures_util::{StreamExt as _, stream::FuturesUnordered};
use thiserror::Error;
use tokio::{
    sync::watch,
    time::{Instant, timeout, timeout_at},
};
use wtransport::{
    ClientConfig, Connection, Endpoint, Identity, ServerConfig, VarInt,
    endpoint::endpoint_side::{Client, Server as ServerSide},
    tls::Sha256Digest,
};

use crate::protocol as sea_v1;

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
    request: watch::Sender<Option<ShutdownMode>>,
    accepting: watch::Receiver<bool>,
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
struct Metrics {
    wire_bytes: AtomicU64,
    active_connections: AtomicUsize,
    peak_active_connections: AtomicUsize,
    active_streams: AtomicUsize,
    peak_active_streams: AtomicUsize,
}

/// Cloneable view of transport measurements.
#[derive(Clone, Debug)]
pub struct MeasurementHandle(Arc<Metrics>);

impl MeasurementHandle {
    /// Returns a point-in-time measurement snapshot.
    #[must_use]
    pub fn snapshot(&self) -> TransportMeasurement {
        self.0.snapshot()
    }
}

impl Metrics {
    fn enter_connection(&self) -> ActiveConnection<'_> {
        let active = self.active_connections.fetch_add(1, Ordering::Relaxed) + 1;
        self.peak_active_connections
            .fetch_max(active, Ordering::Relaxed);
        ActiveConnection(self)
    }

    fn enter_stream(&self) -> ActiveStream<'_> {
        let active = self.active_streams.fetch_add(1, Ordering::Relaxed) + 1;
        self.peak_active_streams
            .fetch_max(active, Ordering::Relaxed);
        ActiveStream(self)
    }

    fn add_wire_bytes(&self, count: usize) {
        self.wire_bytes.fetch_add(count as u64, Ordering::Relaxed);
    }

    fn snapshot(&self) -> TransportMeasurement {
        TransportMeasurement {
            wire_bytes: self.wire_bytes.load(Ordering::Relaxed),
            active_connections: self.active_connections.load(Ordering::Relaxed),
            peak_active_connections: self.peak_active_connections.load(Ordering::Relaxed),
            peak_active_streams: self.peak_active_streams.load(Ordering::Relaxed),
        }
    }
}

struct ActiveConnection<'a>(&'a Metrics);

impl Drop for ActiveConnection<'_> {
    fn drop(&mut self) {
        self.0.active_connections.fetch_sub(1, Ordering::Relaxed);
    }
}

struct ActiveStream<'a>(&'a Metrics);

impl Drop for ActiveStream<'_> {
    fn drop(&mut self) {
        self.0.active_streams.fetch_sub(1, Ordering::Relaxed);
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
}

impl Default for TransportConfig {
    fn default() -> Self {
        Self {
            max_frame_bytes: 4 * 1024 * 1024,
            max_connections: 16,
            max_streams_per_connection: 16,
            operation_timeout: Duration::from_secs(5),
        }
    }
}

impl TransportConfig {
    pub(crate) fn validate(&self) -> Result<(), WebTransportError> {
        if self.max_frame_bytes < sea_v1::MAGIC.len() + 1
            || self.max_connections == 0
            || self.max_streams_per_connection == 0
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
    /// Handles one unary request.
    async fn request(&self, request: sea_v1::Request) -> sea_v1::Response;

    /// Opens one server-to-client response stream.
    async fn stream(&self, request: sea_v1::Request)
    -> Result<SeaResponseStream, sea_v1::Response>;
}

/// Creates isolated Sea protocol state for each WebTransport connection.
pub trait SeaServiceHost: Send + Sync {
    /// Creates one connection-scoped dispatcher.
    fn connect(&self) -> Arc<dyn SeaConnectionService>;
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
        let endpoint = Endpoint::server(
            ServerConfig::builder()
                .with_bind_address(address)
                .with_identity(identity)
                .keep_alive_interval(Some(Duration::from_secs(3)))
                .build(),
        )
        .map_err(transport_error)?;
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
        let mode = loop {
            tokio::select! {
                incoming = self.endpoint.accept(), if connections.len() < self.config.max_connections => {
                    let service = self.service.connect();
                    let config = self.config.clone();
                    let metrics = Arc::clone(&self.metrics);
                    connections.push(async move {
                        let request = incoming.await.map_err(transport_error)?;
                        if request.path() != "/sea" {
                            request.forbidden().await;
                            return Ok(());
                        }
                        let connection = request.accept().await.map_err(transport_error)?;
                        serve_connection(connection, service, config, metrics).await
                    });
                }
                result = connections.next(), if !connections.is_empty() => {
                    if let Some(result) = result {
                        result?;
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
                Ok(Some(result)) => result?,
                Ok(None) => break,
                Err(_) => {
                    let cancelled_connections = connections.len();
                    self.endpoint
                        .close(CLOSE_CODE, b"server shutdown deadline elapsed");
                    drop(connections);
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

async fn serve_connection(
    connection: Connection,
    service: Arc<dyn SeaConnectionService>,
    config: TransportConfig,
    metrics: Arc<Metrics>,
) -> Result<(), WebTransportError> {
    let _active = metrics.enter_connection();
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
            result = streams.next(), if !streams.is_empty() => {
                if let Some(result) = result {
                    result?;
                }
            }
        }
    }
}

async fn serve_sea_stream(
    mut send: wtransport::SendStream,
    mut receive: wtransport::RecvStream,
    service: Arc<dyn SeaConnectionService>,
    config: &TransportConfig,
    metrics: &Metrics,
) -> Result<(), WebTransportError> {
    let request_bytes = timeout(
        config.operation_timeout,
        read_sea_unary_frame(&mut receive, config.max_frame_bytes),
    )
    .await
    .map_err(|_| WebTransportError::Timeout)??;
    metrics.add_wire_bytes(request_bytes.len());
    let limits = sea_v1::Limits {
        max_frame_bytes: config.max_frame_bytes,
    };
    let frame = sea_v1::decode::<sea_v1::Frame<sea_v1::Request>>(&request_bytes, limits)?;
    let request_id = frame.request_id;
    if matches!(
        frame.message,
        sea_v1::Request::Load { .. }
            | sea_v1::Request::Read { .. }
            | sea_v1::Request::SubscribeSnapshots
    ) {
        let mut responses = match service.stream(frame.message).await {
            Ok(responses) => responses,
            Err(response) => {
                return write_unary_response(
                    &mut send,
                    request_id,
                    response,
                    limits,
                    config.operation_timeout,
                    metrics,
                )
                .await;
            }
        };
        loop {
            let response = tokio::select! {
                biased;
                _ = send.stopped() => return Ok(()),
                response = responses.next() => response,
            };
            let Some(response) = response else {
                return timeout(config.operation_timeout, send.finish())
                    .await
                    .map_err(|_| WebTransportError::Timeout)?
                    .map_err(transport_error);
            };
            let response = sea_v1::encode(
                &sea_v1::Frame {
                    request_id,
                    message: response,
                },
                limits,
            )?;
            write_sea_stream_frame(&mut send, &response, config.operation_timeout).await?;
            metrics.add_wire_bytes(response.len());
        }
    }
    let response = service.request(frame.message).await;
    write_unary_response(
        &mut send,
        request_id,
        response,
        limits,
        config.operation_timeout,
        metrics,
    )
    .await
}

async fn write_unary_response(
    send: &mut wtransport::SendStream,
    request_id: u64,
    response: sea_v1::Response,
    limits: sea_v1::Limits,
    operation_timeout: Duration,
    metrics: &Metrics,
) -> Result<(), WebTransportError> {
    let response = sea_v1::encode(
        &sea_v1::Frame {
            request_id,
            message: response,
        },
        limits,
    )?;
    write_frame(send, &response, operation_timeout).await?;
    metrics.add_wire_bytes(response.len());
    Ok(())
}

pub(crate) async fn connect_once(
    url: &str,
    certificate_hash: Sha256Digest,
    operation_timeout: Duration,
) -> Result<(Endpoint<Client>, Connection), WebTransportError> {
    let endpoint = Endpoint::client(
        ClientConfig::builder()
            .with_bind_default()
            .with_server_certificate_hashes([certificate_hash])
            .build(),
    )
    .map_err(transport_error)?;
    let connection = timeout(operation_timeout, endpoint.connect(url))
        .await
        .map_err(|_| WebTransportError::Timeout)?
        .map_err(transport_error)?;
    Ok((endpoint, connection))
}

pub(crate) async fn write_frame(
    send: &mut wtransport::SendStream,
    bytes: &[u8],
    operation_timeout: Duration,
) -> Result<(), WebTransportError> {
    timeout(operation_timeout, async {
        send.write_all(bytes).await.map_err(transport_error)?;
        send.finish().await.map_err(transport_error)
    })
    .await
    .map_err(|_| WebTransportError::Timeout)?
}

async fn write_sea_stream_frame(
    send: &mut wtransport::SendStream,
    bytes: &[u8],
    operation_timeout: Duration,
) -> Result<(), WebTransportError> {
    let length = u32::try_from(bytes.len()).map_err(|_| WebTransportError::FrameTooLarge)?;
    timeout(operation_timeout, async {
        send.write_all(&length.to_be_bytes())
            .await
            .map_err(transport_error)?;
        send.write_all(bytes).await.map_err(transport_error)
    })
    .await
    .map_err(|_| WebTransportError::Timeout)?
}

pub(crate) async fn read_sea_unary_frame(
    receive: &mut wtransport::RecvStream,
    max_frame_bytes: usize,
) -> Result<Bytes, WebTransportError> {
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 8192];
    while let Some(count) = receive.read(&mut buffer).await.map_err(transport_error)? {
        let next_length = bytes
            .len()
            .checked_add(count)
            .ok_or(WebTransportError::FrameTooLarge)?;
        if next_length > max_frame_bytes {
            return Err(WebTransportError::FrameTooLarge);
        }
        bytes.extend_from_slice(&buffer[..count]);
    }
    Ok(Bytes::from(bytes))
}

pub(crate) async fn read_sea_stream_frame(
    receive: &mut wtransport::RecvStream,
    max_frame_bytes: usize,
) -> Result<Option<Bytes>, WebTransportError> {
    let mut length = [0_u8; 4];
    let Some(first) = receive
        .read(&mut length[..1])
        .await
        .map_err(transport_error)?
    else {
        return Ok(None);
    };
    debug_assert_eq!(first, 1);
    receive
        .read_exact(&mut length[1..])
        .await
        .map_err(transport_error)?;
    let length = usize::try_from(u32::from_be_bytes(length))
        .map_err(|_| WebTransportError::FrameTooLarge)?;
    if length > max_frame_bytes {
        return Err(WebTransportError::FrameTooLarge);
    }
    let mut bytes = vec![0; length];
    receive
        .read_exact(&mut bytes)
        .await
        .map_err(transport_error)?;
    Ok(Some(Bytes::from(bytes)))
}

pub(crate) fn transport_error(error: impl std::fmt::Display) -> WebTransportError {
    WebTransportError::Transport(error.to_string())
}
