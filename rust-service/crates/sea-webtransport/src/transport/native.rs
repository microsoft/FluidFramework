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
