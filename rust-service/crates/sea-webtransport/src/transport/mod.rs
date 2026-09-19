//! Narrow platform transport primitives consumed by the shared Sea client.

use async_trait::async_trait;

/// One transport-provided bidirectional byte stream.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait BidirectionalStream {
    /// Transport-specific failure.
    type Error;

    /// Sends bytes without closing the stream's send direction.
    async fn send(&mut self, bytes: &[u8]) -> Result<(), Self::Error>;

    /// Closes the stream's send direction.
    async fn finish(&mut self) -> Result<(), Self::Error>;

    /// Receives the next arbitrary byte chunk, or `None` at clean EOF.
    async fn receive(&mut self) -> Result<Option<Vec<u8>>, Self::Error>;

    /// Cancels both directions of the stream.
    async fn cancel(&mut self) -> Result<(), Self::Error>;
}

/// Connection primitive that opens independent bidirectional byte streams.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait ClientTransport {
    /// Stream opened by this transport.
    type Stream: BidirectionalStream<Error = Self::Error>;
    /// Transport-specific failure.
    type Error;

    /// Opens one bidirectional stream.
    async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error>;

    /// Disconnects the underlying connection.
    fn disconnect(&self) -> Result<(), Self::Error>;
}

#[cfg(target_arch = "wasm32")]
pub mod browser;
#[cfg(all(target_arch = "wasm32", feature = "websocket-stream"))]
pub mod browser_socket;
#[cfg(not(target_arch = "wasm32"))]
pub(crate) mod native;
