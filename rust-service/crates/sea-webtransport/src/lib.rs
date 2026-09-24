#![doc = include_str!("../README.md")]

pub mod protocol;
pub mod signals;

#[cfg(feature = "websocket-stream")]
pub mod websocket;

#[doc(hidden)]
pub mod client;
#[doc(hidden)]
pub mod transport;

mod native;
pub use native::SeaClientError;
#[cfg(not(target_arch = "wasm32"))]
pub use native::{NativeSeaClient, NativeSessionOpen};
pub use native::{SessionClient, SessionOpen};

#[cfg(not(target_arch = "wasm32"))]
use std::time::Duration;
#[cfg(not(target_arch = "wasm32"))]
use thiserror::Error;
#[cfg(not(target_arch = "wasm32"))]
use tokio::time::timeout;
#[cfg(not(target_arch = "wasm32"))]
use wtransport::{
    ClientConfig, Connection, Endpoint, VarInt, endpoint::endpoint_side::Client, tls::Sha256Digest,
};

#[cfg(not(target_arch = "wasm32"))]
pub(crate) const CLOSE_CODE: VarInt = VarInt::from_u32(1);

#[cfg(not(target_arch = "wasm32"))]
use crate::protocol as sea_v1;

/// Bounded frame and lifecycle configuration.
#[cfg(not(target_arch = "wasm32"))]
#[derive(Clone, Debug)]
pub struct TransportConfig {
    /// Maximum bytes accepted in one Sea frame.
    pub max_frame_bytes: usize,
    /// Maximum sessions owned concurrently.
    pub max_connections: usize,
    /// Maximum bidirectional streams per connection.
    pub max_streams_per_connection: usize,
    /// Native budget for connection establishment, each logical-stream opening, and each request.
    ///
    /// A finite request includes sending and receiving its matching completion; interleaved
    /// notifications do not restart the budget. Monitored reads use it through their first response.
    /// Idle subscriptions remain pending indefinitely, but an observed incomplete frame must
    /// finish within this duration, even across cancellation of a receive future.
    /// Expiry cancels the affected stream; append and snapshot-publication timeouts are ambiguous
    /// and are never retried automatically. Browser transports retain their own timeout policy.
    pub operation_timeout: Duration,
}

#[cfg(not(target_arch = "wasm32"))]
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

#[cfg(not(target_arch = "wasm32"))]
impl TransportConfig {
    pub(crate) fn validate(&self) -> Result<(), WebTransportError> {
        if self.max_frame_bytes < sea_v1::MIN_FRAME_BYTES
            || self.max_connections == 0
            || self.max_streams_per_connection == 0
        {
            return Err(WebTransportError::InvalidConfig);
        }
        Ok(())
    }
}

/// Failures from native Sea WebTransport setup, framing, or lifecycle.
#[cfg(not(target_arch = "wasm32"))]
#[derive(Debug, Error)]
pub enum WebTransportError {
    /// One configured bound is zero or too small.
    #[error("transport configuration is invalid")]
    InvalidConfig,
    /// A complete frame exceeds its configured bound.
    #[error("transport frame exceeds its configured bound")]
    FrameTooLarge,
    /// Native connection, logical-stream opening, request, or partial frame exceeded its timeout.
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

#[cfg(not(target_arch = "wasm32"))]
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

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn transport_error(error: impl std::fmt::Display) -> WebTransportError {
    WebTransportError::Transport(error.to_string())
}
