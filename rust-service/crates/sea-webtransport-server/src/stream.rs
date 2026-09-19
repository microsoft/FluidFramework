//! Internal stream operations shared by network listeners.

use async_trait::async_trait;

use crate::{WebTransportError, server::transport_error};

/// Independently writable direction with remote cancellation notification.
#[async_trait]
pub(crate) trait SendStream: Send {
    /// Writes all bytes, applying transport backpressure.
    async fn write_all(&mut self, bytes: &[u8]) -> Result<(), WebTransportError>;
    /// Finishes this direction without closing the receive direction.
    async fn finish(&mut self) -> Result<(), WebTransportError>;
    /// Waits for peer cancellation or connection loss, not peer send EOF.
    async fn stopped(&mut self);
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

    async fn stopped(&mut self) {
        let _ = Self::stopped(self).await;
    }
}

#[async_trait]
impl ReceiveStream for wtransport::RecvStream {
    async fn read(&mut self, bytes: &mut [u8]) -> Result<Option<usize>, WebTransportError> {
        Self::read(self, bytes).await.map_err(transport_error)
    }
}
