//! Server-side Sea protocol adaptation shared by WebTransport and WebSocket.
//!
//! This module owns request dispatch, wire-error conversion, version checks, authority tokens,
//! connection/session binding, and protocol cleanup. Typed document hosting remains in
//! [`crate::host`]; listeners own sockets, TLS, stream I/O, and transport deadlines.
//! The shared wire definitions remain in [`sea_webtransport::protocol`] for native and WASM clients.
//!
//! These protocol components could be extracted into a separate crate if another transport needs
//! independent reuse. No new crate is required to share this adapter between the current listeners.
//! Extraction would also define a public boundary for the typed document-host bridge and relocate
//! the shared liveness configuration and lifecycle error boundary.

use std::{pin::Pin, sync::Arc};

use async_trait::async_trait;
use futures_core::Stream;
use sea_webtransport::protocol as sea_v1;

use crate::{LivenessPolicy, WebTransportError};

mod dispatch;
mod host;

pub use dispatch::SessionDispatcher;
pub(crate) use dispatch::error_response;
pub use host::SeaProtocolHost;

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

/// Creates isolated Sea protocol state for each transport connection.
#[async_trait]
pub trait SeaServiceHost: Send + Sync {
    /// Creates one connection-scoped dispatcher.
    fn connect(&self, liveness: LivenessPolicy) -> Arc<dyn SeaConnectionService>;

    /// Writes the accepted storage prefix without stopping a host shared by other listeners.
    async fn flush(&self) -> Result<(), WebTransportError> {
        Ok(())
    }
}
