#![doc = "Sea wire protocol and native client transport bindings."]

pub mod protocol;

#[doc(hidden)]
pub mod client;

#[cfg(not(target_arch = "wasm32"))]
mod native;
#[cfg(not(target_arch = "wasm32"))]
pub use native::{NativeSeaClient, NativeSessionOpen, SeaClientError};

#[cfg(not(target_arch = "wasm32"))]
use bytes::Bytes;
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
    /// Timeout for connection establishment and framed I/O.
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
        if self.max_frame_bytes < sea_v1::MAGIC.len() + 1
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
    /// Connection or framed I/O exceeded its timeout.
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
pub(crate) async fn write_frame(
    send: &mut wtransport::SendStream,
    bytes: &[u8],
    operation_timeout: Duration,
) -> Result<(), WebTransportError> {
    timeout(operation_timeout, async {
        send.write_all(bytes).await.map_err(transport_error)?;
        send.finish().await.map_err(transport_error)
    })
    .await
    .map_err(|_| WebTransportError::Timeout)?
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) async fn read_sea_unary_frame(
    receive: &mut wtransport::RecvStream,
    max_frame_bytes: usize,
) -> Result<Bytes, WebTransportError> {
    read_sea_unary_frame_with_prefix(receive, &[], max_frame_bytes).await
}

#[cfg(not(target_arch = "wasm32"))]
async fn read_sea_unary_frame_with_prefix(
    receive: &mut wtransport::RecvStream,
    prefix: &[u8],
    max_frame_bytes: usize,
) -> Result<Bytes, WebTransportError> {
    if prefix.len() > max_frame_bytes {
        return Err(WebTransportError::FrameTooLarge);
    }
    let mut bytes = prefix.to_vec();
    let mut buffer = [0_u8; 8192];
    while let Some(count) = receive.read(&mut buffer).await.map_err(transport_error)? {
        let next_length = bytes
            .len()
            .checked_add(count)
            .ok_or(WebTransportError::FrameTooLarge)?;
        if next_length > max_frame_bytes {
            return Err(WebTransportError::FrameTooLarge);
        }
        bytes.extend_from_slice(&buffer[..count]);
    }
    Ok(Bytes::from(bytes))
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) async fn read_sea_stream_frame(
    receive: &mut wtransport::RecvStream,
    max_frame_bytes: usize,
) -> Result<Option<Bytes>, WebTransportError> {
    let mut decoder = StreamFrameDecoder::new(max_frame_bytes);
    let mut buffer = [0_u8; 8192];
    loop {
        if let Some(frame) = decoder.next_frame()? {
            return Ok(Some(frame));
        }
        let read_length = decoder.bytes_needed()?.min(buffer.len());
        let Some(count) = receive
            .read(&mut buffer[..read_length])
            .await
            .map_err(transport_error)?
        else {
            return decoder.finish();
        };
        decoder.push(&buffer[..count]);
    }
}

#[cfg(not(target_arch = "wasm32"))]
struct StreamFrameDecoder {
    buffered: Vec<u8>,
    max_frame_bytes: usize,
}

#[cfg(not(target_arch = "wasm32"))]
impl StreamFrameDecoder {
    const fn new(max_frame_bytes: usize) -> Self {
        Self {
            buffered: Vec::new(),
            max_frame_bytes,
        }
    }

    fn push(&mut self, bytes: &[u8]) {
        self.buffered.extend_from_slice(bytes);
    }

    fn next_frame(&mut self) -> Result<Option<Bytes>, WebTransportError> {
        let Some(length_bytes) = self.buffered.get(..4) else {
            return Ok(None);
        };
        let length = usize::try_from(u32::from_be_bytes(
            length_bytes
                .try_into()
                .expect("frame length has four bytes"),
        ))
        .map_err(|_| WebTransportError::FrameTooLarge)?;
        if length > self.max_frame_bytes {
            return Err(WebTransportError::FrameTooLarge);
        }
        let frame_end = 4_usize
            .checked_add(length)
            .ok_or(WebTransportError::FrameTooLarge)?;
        if self.buffered.len() < frame_end {
            return Ok(None);
        }
        let frame = Bytes::copy_from_slice(&self.buffered[4..frame_end]);
        self.buffered.drain(..frame_end);
        Ok(Some(frame))
    }

    fn bytes_needed(&self) -> Result<usize, WebTransportError> {
        let Some(length_bytes) = self.buffered.get(..4) else {
            return Ok(4 - self.buffered.len());
        };
        let length = usize::try_from(u32::from_be_bytes(
            length_bytes
                .try_into()
                .expect("frame length has four bytes"),
        ))
        .map_err(|_| WebTransportError::FrameTooLarge)?;
        if length > self.max_frame_bytes {
            return Err(WebTransportError::FrameTooLarge);
        }
        4_usize
            .checked_add(length)
            .and_then(|frame_end| frame_end.checked_sub(self.buffered.len()))
            .ok_or(WebTransportError::FrameTooLarge)
    }

    fn finish(&mut self) -> Result<Option<Bytes>, WebTransportError> {
        if self.buffered.is_empty() {
            Ok(None)
        } else {
            Err(WebTransportError::Disconnected)
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn transport_error(error: impl std::fmt::Display) -> WebTransportError {
    WebTransportError::Transport(error.to_string())
}

#[cfg(test)]
mod tests {
    use bytes::Bytes;

    use super::{StreamFrameDecoder, WebTransportError};

    struct ScriptedFrameInput {
        decoder: StreamFrameDecoder,
    }

    impl ScriptedFrameInput {
        const fn new(max_frame_bytes: usize) -> Self {
            Self {
                decoder: StreamFrameDecoder::new(max_frame_bytes),
            }
        }

        fn push(&mut self, chunk: &[u8]) -> Result<Option<Bytes>, WebTransportError> {
            self.decoder.push(chunk);
            self.decoder.next_frame()
        }

        async fn push_delayed(&mut self, chunk: &[u8]) -> Result<Option<Bytes>, WebTransportError> {
            tokio::task::yield_now().await;
            self.push(chunk)
        }

        fn finish(&mut self) -> Result<Option<Bytes>, WebTransportError> {
            self.decoder.finish()
        }
    }

    #[test]
    fn stream_frame_decoder_handles_fragmented_and_coalesced_input() {
        let mut input = ScriptedFrameInput::new(5);
        assert_eq!(input.push(&[0, 0]).expect("partial length"), None);
        assert_eq!(input.push(&[0, 3, b'a']).expect("partial payload"), None);
        assert_eq!(
            input
                .push(&[b'b', b'c', 0, 0, 0, 2, b'd', b'e'])
                .expect("coalesced frames"),
            Some(Bytes::from_static(b"abc"))
        );
        assert_eq!(
            input.push(&[]).expect("buffered second frame"),
            Some(Bytes::from_static(b"de"))
        );
        assert_eq!(input.finish().expect("complete input"), None);
    }

    #[test]
    fn stream_frame_decoder_rejects_oversized_and_dropped_frames() {
        let mut oversized = ScriptedFrameInput::new(2);
        assert!(matches!(
            oversized.push(&[0, 0, 0, 3]),
            Err(WebTransportError::FrameTooLarge)
        ));

        let mut dropped = ScriptedFrameInput::new(3);
        assert_eq!(dropped.push(&[0, 0, 0, 3, b'a']).unwrap(), None);
        assert!(matches!(
            dropped.finish(),
            Err(WebTransportError::Disconnected)
        ));
    }

    #[tokio::test]
    async fn stream_frame_decoder_handles_delayed_chunks() {
        let mut input = ScriptedFrameInput::new(4);
        assert_eq!(input.push_delayed(&[0, 0, 0]).await.unwrap(), None);
        assert_eq!(input.push_delayed(&[2, b'a']).await.unwrap(), None);
        assert_eq!(
            input.push_delayed(b"b").await.unwrap(),
            Some(Bytes::from_static(b"ab"))
        );
    }
}
