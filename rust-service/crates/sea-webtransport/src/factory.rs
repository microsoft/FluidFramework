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

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use bytes::Bytes;
    use sea_core::SeaAuthorSession as _;
    use std::time::Duration;
    use wtransport::{Endpoint, Identity, ServerConfig};

    /// Reads one request from a peer without a document host interpreting its fields.
    async fn request(
        receive: &mut wtransport::RecvStream,
        role: protocol::StreamRole,
    ) -> protocol::Request {
        let mut decoder = protocol::NetworkFrameDecoder::new(protocol::Limits::default());
        loop {
            if let Some(frame) = decoder.next_frame().unwrap() {
                return protocol::decode_request_frame(role, &frame).unwrap();
            }
            let mut bytes = vec![0; decoder.next_read_size().unwrap()];
            let count = receive.read(&mut bytes).await.unwrap().unwrap();
            decoder.push(&bytes[..count]);
        }
    }

    /// Supplies protocol responses independently of any sequencer or factory implementation.
    async fn respond(
        send: &mut wtransport::SendStream,
        role: protocol::StreamRole,
        response: &protocol::Response,
    ) {
        send.write_all(
            &protocol::encode_response_frame(role, response, protocol::Limits::default()).unwrap(),
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn opens_forward_document_and_reference_on_independent_connections() {
        tokio::time::timeout(Duration::from_secs(10), async {
            let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
            let hash = identity.certificate_chain().as_slice()[0].hash();
            let endpoint = Endpoint::server(
                ServerConfig::builder()
                    .with_bind_address("127.0.0.1:0".parse().unwrap())
                    .with_identity(identity)
                    .build(),
            )
            .unwrap();
            let document = DocumentId::from_bytes(Bytes::from_static(b"factory-document"));
            let factory = WebTransportSessionFactory::new(
                format!("https://{}/sea", endpoint.local_addr().unwrap()),
                hash,
                TransportConfig::default(),
                document.clone(),
            );
            let cloned = factory.clone();
            let peer = async {
                let mut tasks = tokio::task::JoinSet::new();
                for (id, reference) in [(17, None), (29, Some(0x1234))] {
                    let connection = endpoint
                        .accept()
                        .await
                        .await
                        .unwrap()
                        .accept()
                        .await
                        .unwrap();
                    tasks.spawn(async move {
                        let (mut events, mut opening) = connection.accept_bi().await.unwrap();
                        assert_eq!(
                            request(&mut opening, protocol::StreamRole::Event).await,
                            protocol::Request::OpenEventStream {
                                version: protocol::PROTOCOL_VERSION,
                                archive: b"factory-document".to_vec(),
                                intent: protocol::ArchiveIntent::Open,
                                resume_after: reference,
                            }
                        );
                        respond(
                            &mut events,
                            protocol::StreamRole::Event,
                            &protocol::Response::EventStreamOpened {
                                session: id,
                                document: b"factory-document".to_vec(),
                                authority: vec![7; 32],
                            },
                        )
                        .await;
                        let (mut receipts, mut author) = connection.accept_bi().await.unwrap();
                        assert!(matches!(
                            request(&mut author, protocol::StreamRole::Author).await,
                            protocol::Request::OpenAuthorStream { .. }
                        ));
                        respond(
                            &mut receipts,
                            protocol::StreamRole::Author,
                            &protocol::Response::Acknowledged,
                        )
                        .await;
                        assert_eq!(
                            request(&mut author, protocol::StreamRole::Author).await,
                            protocol::Request::Close
                        );
                        respond(
                            &mut receipts,
                            protocol::StreamRole::Author,
                            &protocol::Response::Acknowledged,
                        )
                        .await;
                        connection.closed().await;
                    });
                }
                while let Some(task) = tasks.join_next().await {
                    task.unwrap();
                }
            };
            let clients = async {
                let first = factory.open_session(None).await.unwrap();
                let second = cloned
                    .open_session(Some(EventPosition::new(0x1234)))
                    .await
                    .unwrap();
                assert_eq!(first.id.get(), 17);
                assert_eq!(second.id.get(), 29);
                assert_eq!(&first.id, first.session.session_id());
                assert_eq!(&second.id, second.session.session_id());
                assert_eq!(first.session.document(), &document);
                assert_eq!(second.session.document(), &document);
                drop((factory, cloned));
                first.session.close().await.unwrap();
                second.session.close().await.unwrap();
            };
            tokio::join!(peer, clients);
        })
        .await
        .unwrap();
    }
}
