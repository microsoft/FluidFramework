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
use sea_core::{ClassifiedError, ErrorKind};
use sea_webtransport::protocol;

use crate::{LivenessPolicy, WebTransportError};

mod dispatch;
mod host;

pub use dispatch::SessionDispatcher;
pub use host::SeaProtocolHost;

pub(crate) fn error_response(error: impl ClassifiedError) -> protocol::Response {
    let kind = error.kind();
    let message = error.to_string();
    drop(error);
    protocol::Response::Error {
        kind: match kind {
            ErrorKind::InvalidPosition => protocol::ErrorKind::Invalid,
            ErrorKind::StalePosition => protocol::ErrorKind::Stale,
            ErrorKind::Conflict => protocol::ErrorKind::Conflict,
            ErrorKind::Rejected => protocol::ErrorKind::Rejected,
            ErrorKind::Ambiguous => protocol::ErrorKind::Ambiguous,
            ErrorKind::Unavailable => protocol::ErrorKind::Unavailable,
            ErrorKind::Corrupt => protocol::ErrorKind::Corrupt,
        },
        message,
    }
}

/// Response stream returned by a connection-scoped Sea service.
pub type SeaResponseStream = Pin<Box<dyn Stream<Item = protocol::Response> + Send + 'static>>;

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
    ) -> Result<Arc<dyn SeaConnectionService>, protocol::Response>;

    /// Admits a best-effort datagram for the connection's established signal registration.
    async fn signal_datagram(&self, _submission: protocol::signals::Submission) {}
    /// Opens ephemeral messaging without creating author membership.
    async fn open_signals(
        &self,
        _opening: protocol::signals::OpenSignals,
    ) -> Result<Arc<sea_signals::SignalConnection>, protocol::Response> {
        Err(protocol::Response::Error {
            kind: protocol::ErrorKind::Rejected,
            message: "signals are unsupported by this host".to_owned(),
        })
    }
    /// Releases all session state owned by this network connection.
    async fn connection_closed(&self, allow_reconnect_grace: bool);

    /// Opens the gap-free recovery and live event stream.
    async fn open_event_stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response>;

    /// Opens the gap-free recovery and live event stream for an established session.
    async fn event_stream(
        &self,
        resume_after: Option<u64>,
    ) -> Result<SeaResponseStream, protocol::Response>;

    /// Acknowledges a bound author-stream opening or handles one ordered author operation.
    ///
    /// Transports first-poll submissions in receive order but may poll later submissions before
    /// earlier calls finish. Implementations must preserve admission order and fence the suffix
    /// after a failed submission. Successful responses must still wait for the storage commit.
    /// Other operations are barriers: earlier submissions finish before the operation is invoked.
    async fn author_request(&self, request: protocol::Request) -> protocol::Response;

    /// Opens latest-value snapshot coordination on the bound session.
    async fn snapshot_stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response>;

    /// Handles one ordered operation on an open snapshot stream.
    /// `Close` acknowledges only; the transport ends and drops that stream's registration lease.
    async fn snapshot_request(&self, request: protocol::Request) -> protocol::Response;

    /// Revokes the session's current publisher membership after connection loss.
    async fn revoke_snapshot_publisher(&self);

    /// Acknowledges a content-stream opening on the bound session.
    async fn open_content_stream(&self, request: protocol::Request) -> protocol::Response;

    /// Handles one bounded content operation.
    async fn content_request(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response>;
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
