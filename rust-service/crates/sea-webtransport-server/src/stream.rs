//! Internal stream operations shared by network listeners.

use async_trait::async_trait;
use tokio::io::{AsyncWrite, AsyncWriteExt};

use crate::{WebTransportError, server::transport_error};

/// Independently writable direction with remote cancellation notification.
#[async_trait]
pub(crate) trait SendStream: AsyncWrite + Unpin + Send {
    /// Writes and flushes all bytes, applying transport backpressure.
    async fn write_all(&mut self, bytes: &[u8]) -> Result<(), WebTransportError> {
        AsyncWriteExt::write_all(self, bytes)
            .await
            .map_err(transport_error)?;
        self.flush().await.map_err(transport_error)
    }
    /// Finishes this direction without closing the receive direction.
    async fn finish(&mut self) -> Result<(), WebTransportError>;
    /// Waits for peer cancellation or connection loss, not peer send EOF.
    fn stopped(&self) -> impl Future<Output = ()> + Send + 'static;
    /// Aborts an incomplete frame. The caller must drop this direction without sending FIN.
    fn abort(&mut self);
}

/// Cancellation-safe byte reads with clean directional EOF.
#[async_trait]
pub(crate) trait ReceiveStream: Send {
    /// Reads bytes, returning `None` only at clean directional EOF.
    async fn read(&mut self, bytes: &mut [u8]) -> Result<Option<usize>, WebTransportError>;
    /// Reads a required prefix before dispatching a stream.
    async fn read_exact(&mut self, bytes: &mut [u8]) -> Result<(), WebTransportError> {
        let mut offset = 0;
        while offset < bytes.len() {
            let count = self
                .read(&mut bytes[offset..])
                .await?
                .ok_or(WebTransportError::Disconnected)?;
            offset += count;
        }
        Ok(())
    }
}

#[async_trait]
impl SendStream for wtransport::SendStream {
    async fn write_all(&mut self, bytes: &[u8]) -> Result<(), WebTransportError> {
        Self::write_all(self, bytes).await.map_err(transport_error)
    }

    async fn finish(&mut self) -> Result<(), WebTransportError> {
        Self::finish(self).await.map_err(transport_error)
    }

    fn stopped(&self) -> impl Future<Output = ()> + Send + 'static {
        let stopped = self.quic_stream().stopped();
        async move {
            let _ = stopped.await;
        }
    }

    fn abort(&mut self) {
        // Already-closed streams need no further reset.
        let _ = self.reset(wtransport::VarInt::from_u32(1));
    }
}

#[async_trait]
impl ReceiveStream for wtransport::RecvStream {
    async fn read(&mut self, bytes: &mut [u8]) -> Result<Option<usize>, WebTransportError> {
        Self::read(self, bytes).await.map_err(transport_error)
    }
}

#[cfg(test)]
mod tests {
    use sea_core::BlobBody;
    use tokio::time::{Duration, timeout};
    use wtransport::{ClientConfig, Endpoint, Identity, ServerConfig, VarInt};

    #[tokio::test]
    async fn owned_body_copies_to_the_pinned_native_transport_writer() {
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
            let address = server.local_addr().unwrap();
            let client = Endpoint::client(
                ClientConfig::builder()
                    .with_bind_default()
                    .with_server_certificate_hashes([hash])
                    .build(),
            )
            .unwrap();
            let serving = async {
                let connection = server.accept().await.await.unwrap().accept().await.unwrap();
                let (mut send, mut receive) = connection.accept_bi().await.unwrap();
                receive.read_exact(&mut [0; 1]).await.unwrap();
                let body = BlobBody::Reader {
                    length: 128 * 1024,
                    reader: Box::pin(std::io::Cursor::new(vec![7; 128 * 1024 + 1])),
                };
                assert_eq!(body.copy_to(&mut send).await.unwrap(), 128 * 1024);
                send.finish().await.unwrap();
                connection.closed().await;
            };
            let receiving = async {
                let connection = client
                    .connect(format!("https://{address}/sea"))
                    .await
                    .unwrap();
                let (mut send, mut receive) = connection.open_bi().await.unwrap().await.unwrap();
                send.write_all(&[1]).await.unwrap();
                send.finish().await.unwrap();
                let mut actual = Vec::new();
                let mut chunk = [0; 127];
                while let Some(count) = receive.read(&mut chunk).await.unwrap() {
                    actual.extend_from_slice(&chunk[..count]);
                }
                assert_eq!(actual, vec![7; 128 * 1024]);
                connection.close(VarInt::from_u32(0), b"done");
            };
            tokio::join!(serving, receiving);
        })
        .await
        .unwrap();
    }
}
