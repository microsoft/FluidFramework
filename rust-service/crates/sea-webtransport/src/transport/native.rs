//! Native WebTransport connection and bidirectional-stream primitives.

use async_trait::async_trait;
use wtransport::{Connection, Endpoint, endpoint::endpoint_side::Client};

use super::{BidirectionalStream, ClientTransport};
use crate::{CLOSE_CODE, WebTransportError, transport_error};

/// Native connection retained by the typed session client.
pub struct NativeTransport {
    _endpoint: Endpoint<Client>,
    connection: Connection,
}

impl NativeTransport {
    pub(crate) const fn new(endpoint: Endpoint<Client>, connection: Connection) -> Self {
        Self {
            _endpoint: endpoint,
            connection,
        }
    }
}

#[async_trait]
impl ClientTransport for NativeTransport {
    type Stream = NativeBidirectionalStream;
    type Error = WebTransportError;

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
        let transport = NativeTransport::new(endpoint, connection);
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
