//! Native WebTransport connection and bidirectional-stream primitives.

use async_trait::async_trait;
use wtransport::{Connection, Endpoint, endpoint::endpoint_side::Client};

use super::{BidirectionalStream, ClientTransport};
use crate::{CLOSE_CODE, WebTransportError, transport_error};

/// Native connection retained by the typed session client.
pub struct NativeTransport {
    _endpoint: Endpoint<Client>,
    connection: Connection,
    /// Budget retained by every logical stream opened on this connection.
    operation_timeout: std::time::Duration,
}

impl NativeTransport {
    pub(crate) const fn new(
        endpoint: Endpoint<Client>,
        connection: Connection,
        operation_timeout: std::time::Duration,
    ) -> Self {
        Self {
            _endpoint: endpoint,
            connection,
            operation_timeout,
        }
    }
}

#[async_trait]
impl ClientTransport for NativeTransport {
    type Stream = NativeBidirectionalStream;
    type Error = WebTransportError;

    fn operation_timeout(&self) -> Option<std::time::Duration> {
        Some(self.operation_timeout)
    }

    fn supports_datagrams(&self) -> bool {
        self.connection.max_datagram_size().is_some()
    }

    async fn send_datagram(&self, bytes: &[u8]) -> Result<bool, Self::Error> {
        if self
            .connection
            .max_datagram_size()
            .is_none_or(|limit| bytes.len() > limit)
        {
            return Ok(false);
        }
        self.connection
            .send_datagram(bytes)
            .map_err(transport_error)?;
        Ok(true)
    }

    async fn receive_datagram(&self) -> Result<Vec<u8>, Self::Error> {
        Ok(self
            .connection
            .receive_datagram()
            .await
            .map_err(transport_error)?
            .payload()
            .to_vec())
    }

    async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error> {
        let (send, receive) = self
            .connection
            .open_bi()
            .await
            .map_err(transport_error)?
            .await
            .map_err(transport_error)?;
        Ok(NativeBidirectionalStream {
            send,
            receive: Some(receive),
        })
    }

    fn disconnect(&self) -> Result<(), Self::Error> {
        self.connection.close(CLOSE_CODE, b"Sea session closed");
        Ok(())
    }
}

/// Native bidirectional stream used by the shared session implementation.
pub struct NativeBidirectionalStream {
    send: wtransport::SendStream,
    receive: Option<wtransport::RecvStream>,
}

#[async_trait]
impl BidirectionalStream for NativeBidirectionalStream {
    type Error = WebTransportError;

    async fn send(&mut self, bytes: &[u8]) -> Result<(), Self::Error> {
        self.send.write_all(bytes).await.map_err(transport_error)
    }

    async fn finish(&mut self) -> Result<(), Self::Error> {
        self.send.finish().await.map_err(transport_error)
    }

    async fn receive(&mut self) -> Result<Option<Vec<u8>>, Self::Error> {
        let Some(receive) = self.receive.as_mut() else {
            return Ok(None);
        };
        let mut bytes = vec![0_u8; 8192];
        let Some(count) = receive.read(&mut bytes).await.map_err(transport_error)? else {
            return Ok(None);
        };
        bytes.truncate(count);
        Ok(Some(bytes))
    }

    async fn cancel(&mut self) -> Result<(), Self::Error> {
        let _ = self.send.reset(CLOSE_CODE);
        if let Some(receive) = self.receive.take() {
            receive.stop(CLOSE_CODE);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::FutureExt as _;
    use std::time::Duration;
    use tokio::time::timeout;
    use wtransport::{Identity, ServerConfig};

    /// Reads exactly one peer request for the controlled stalled-server test.
    async fn peer_request(receive: &mut wtransport::RecvStream) -> crate::protocol::NetworkFrame {
        let mut decoder =
            crate::protocol::NetworkFrameDecoder::new(crate::protocol::Limits::default());
        loop {
            if let Some(frame) = decoder.next_frame().unwrap() {
                return frame;
            }
            let mut bytes = vec![0; decoder.next_read_size().unwrap()];
            let count = receive.read(&mut bytes).await.unwrap().unwrap();
            decoder.push(&bytes[..count]);
        }
    }

    /// Sends one framed response without adding service-side timeout behavior.
    async fn peer_response(
        send: &mut wtransport::SendStream,
        role: crate::protocol::StreamRole,
        response: &crate::protocol::Response,
    ) {
        send.write_all(
            &crate::protocol::encode_response_frame(
                role,
                response,
                crate::protocol::Limits::default(),
            )
            .unwrap(),
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn configured_native_client_times_out_and_resets_a_stalled_content_request() {
        use crate::protocol::{self, Response, StreamRole};
        use sea_core::session::SeaArchive as _;

        timeout(Duration::from_secs(10), async {
            let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
            let hash = identity.certificate_chain().as_slice()[0].hash();
            let server = Endpoint::server(
                ServerConfig::builder()
                    .with_bind_address("127.0.0.1:0".parse().unwrap())
                    .with_identity(identity)
                    .build(),
            )
            .unwrap();
            let url = format!("https://{}/sea", server.local_addr().unwrap());
            let peer = async {
                let connection = server.accept().await.await.unwrap().accept().await.unwrap();
                let (mut event_send, mut event_receive) = connection.accept_bi().await.unwrap();
                assert_eq!(
                    peer_request(&mut event_receive).await.kind,
                    protocol::MessageKind::OpenEventStream
                );
                peer_response(
                    &mut event_send,
                    StreamRole::Event,
                    &Response::EventStreamOpened {
                        session: 1,
                        document: vec![1],
                        authority: vec![1; 32],
                    },
                )
                .await;
                let (mut author_send, mut author_receive) = connection.accept_bi().await.unwrap();
                assert_eq!(
                    peer_request(&mut author_receive).await.kind,
                    protocol::MessageKind::OpenAuthorStream
                );
                peer_response(
                    &mut author_send,
                    StreamRole::Author,
                    &Response::Acknowledged,
                )
                .await;
                let (mut content_send, mut content_receive) = connection.accept_bi().await.unwrap();
                assert_eq!(
                    peer_request(&mut content_receive).await.kind,
                    protocol::MessageKind::OpenContentStream
                );
                peer_response(
                    &mut content_send,
                    StreamRole::Content,
                    &Response::Acknowledged,
                )
                .await;
                assert_eq!(
                    peer_request(&mut content_receive).await.kind,
                    protocol::MessageKind::GetBlob
                );
                let error = content_receive
                    .read(&mut [0; 1])
                    .await
                    .expect_err("client must reset timed-out stream");
                assert!(
                    matches!(error, wtransport::error::StreamReadError::Reset(_)),
                    "{error:?}"
                );
            };
            let caller = async {
                let client = crate::NativeSeaClient::connect(
                    url,
                    hash,
                    crate::TransportConfig {
                        operation_timeout: Duration::from_secs(1),
                        ..Default::default()
                    },
                    crate::SessionOpen {
                        archive: bytes::Bytes::from_static(b"archive"),
                        intent: protocol::ArchiveIntent::Open,
                        reference: None,
                    },
                )
                .await
                .unwrap();
                let id = sea_core::BlobId::from_bytes(&[0; 32]).unwrap();
                assert!(matches!(
                    client.get_blob(id).await,
                    Err(crate::SeaClientError::Transport(WebTransportError::Timeout))
                ));
                assert!(matches!(
                    client.get_blob(id).await,
                    Err(crate::SeaClientError::Closed)
                ));
                // Retain the connection until the peer observes the stream reset.
                client
            };
            let (_client, ()) = tokio::join!(caller, peer);
        })
        .await
        .expect("stalled-server test must finish within its outer bound");
    }

    #[tokio::test]
    async fn datagrams_fall_back_before_admission_and_preserve_admitted_payloads() {
        let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
        let hash = identity.certificate_chain().as_slice()[0].hash();
        let server = Endpoint::server(
            ServerConfig::builder()
                .with_bind_address("127.0.0.1:0".parse().unwrap())
                .with_identity(identity)
                .build(),
        )
        .unwrap();
        let url = format!("https://{}/sea", server.local_addr().unwrap());
        let (client, peer) = timeout(Duration::from_secs(5), async {
            tokio::join!(
                crate::connect_once(&url, hash, Duration::from_secs(5)),
                async { server.accept().await.await.unwrap().accept().await.unwrap() }
            )
        })
        .await
        .unwrap();
        let (endpoint, connection) = client.unwrap();
        let transport = NativeTransport::new(endpoint, connection, Duration::from_secs(5));
        assert!(transport.supports_datagrams());
        let maximum = transport.connection.max_datagram_size().unwrap();
        assert!(
            !transport
                .send_datagram(&vec![0; maximum + 1])
                .await
                .unwrap()
        );
        assert!(peer.receive_datagram().now_or_never().is_none());
        assert!(transport.send_datagram(b"outbound").await.unwrap());
        let received = timeout(Duration::from_secs(2), peer.receive_datagram())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(received.payload().as_ref(), b"outbound");
        peer.send_datagram(b"inbound").unwrap();
        assert_eq!(
            timeout(Duration::from_secs(2), transport.receive_datagram())
                .await
                .unwrap()
                .unwrap(),
            b"inbound"
        );
        transport.disconnect().unwrap();
        timeout(Duration::from_secs(2), peer.closed())
            .await
            .unwrap();
    }
}
