//! Opens independent WebTransport sessions for one existing document.

use async_trait::async_trait;
use sea_core::{
    EventPosition, SeaService,
    factory::{OpenedSession, SessionFactory},
    storage::DocumentId,
};

#[cfg(not(target_arch = "wasm32"))]
use wtransport::tls::Sha256Digest;

#[cfg(not(target_arch = "wasm32"))]
use crate::{NativeSeaClient, TransportConfig};
use crate::{SeaClientError, SessionOpen, protocol};
#[cfg(target_arch = "wasm32")]
use crate::{SessionClient, transport::browser::BrowserTransport};

/// Connects each session to the same existing document on a fresh WebTransport connection.
///
/// Construction and cloning retain only connection settings and document identity.
/// Opening delegates to the existing client without retries or background open tasks.
/// Cancelling an open drops that client's pending connection or handshake; it does not
/// promise to roll back work already accepted by the server.
/// Dropping the factory does not close sessions it returned.
#[derive(Clone)]
pub struct WebTransportSessionFactory {
    /// Endpoint used independently by every open.
    url: String,
    /// Existing backend identity; this factory never requests document creation.
    document: DocumentId,
    /// Native certificate pin passed unchanged to the client.
    #[cfg(not(target_arch = "wasm32"))]
    certificate_hash: Sha256Digest,
    /// Native framing and operation settings.
    #[cfg(not(target_arch = "wasm32"))]
    config: TransportConfig,
    /// Browser certificate pin passed unchanged to the transport.
    #[cfg(target_arch = "wasm32")]
    certificate_hash: [u8; 32],
    /// Browser framing settings; timeouts remain owned by the browser transport.
    #[cfg(target_arch = "wasm32")]
    limits: protocol::Limits,
}

impl WebTransportSessionFactory {
    /// Retains native connection settings for an existing document without connecting.
    ///
    /// Configuration validation and document lookup occur when a session is opened.
    #[cfg(not(target_arch = "wasm32"))]
    #[must_use]
    pub fn new(
        url: impl Into<String>,
        certificate_hash: Sha256Digest,
        config: TransportConfig,
        document: DocumentId,
    ) -> Self {
        Self {
            url: url.into(),
            document,
            certificate_hash,
            config,
        }
    }

    /// Retains browser connection settings for an existing document without connecting.
    ///
    /// Connection establishment and document lookup occur when a session is opened.
    #[cfg(target_arch = "wasm32")]
    #[must_use]
    pub fn new(
        url: impl Into<String>,
        certificate_hash: [u8; 32],
        limits: protocol::Limits,
        document: DocumentId,
    ) -> Self {
        Self {
            url: url.into(),
            document,
            certificate_hash,
            limits,
        }
    }
}

impl SeaService for WebTransportSessionFactory {
    type Error = SeaClientError;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl SessionFactory for WebTransportSessionFactory {
    #[cfg(not(target_arch = "wasm32"))]
    type Session = NativeSeaClient;
    #[cfg(target_arch = "wasm32")]
    type Session = SessionClient<BrowserTransport>;

    async fn open_session(
        &self,
        reference: Option<EventPosition>,
    ) -> Result<OpenedSession<Self::Session>, Self::Error> {
        let open = SessionOpen {
            archive: self.document.as_bytes().clone(),
            intent: protocol::ArchiveIntent::Open,
            reference,
        };
        #[cfg(not(target_arch = "wasm32"))]
        let session = NativeSeaClient::connect(
            self.url.clone(),
            self.certificate_hash.clone(),
            self.config.clone(),
            open,
        )
        .await?;
        #[cfg(target_arch = "wasm32")]
        let session = SessionClient::open(
            BrowserTransport::connect(&self.url, &self.certificate_hash).await?,
            self.limits,
            open,
        )
        .await?;
        Ok(OpenedSession {
            id: session.session_id().clone(),
            session,
        })
    }
}
