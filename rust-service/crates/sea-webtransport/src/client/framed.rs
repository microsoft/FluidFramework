//! Framed client I/O with native request and partial-frame deadlines.

use std::future::Future;

use super::{ClientError, ClientErrorReason};
use crate::{
    protocol::{self, NetworkFrameDecoder},
    transport::{BidirectionalStream, ClientTransport},
};

/// One stream's framing, timeout, and terminal transport state.
#[derive(Debug)]
pub(super) struct FramedStream<Stream> {
    /// Sole owner of the underlying byte stream.
    stream: Stream,
    /// Bytes retained across cancellation of a receive future.
    decoder: NetworkFrameDecoder,
    /// Native deadlines; browser transports retain their own timeout policy.
    deadline: Deadline,
    /// Failed or cancelled I/O must not be reused.
    terminal: bool,
    /// Completed cleanup, successful or not, must not repeat at each error-handling layer.
    cleanup_finished: bool,
}

impl<Stream: BidirectionalStream> FramedStream<Stream> {
    /// Wraps a scripted byte stream without a transport deadline.
    #[cfg(test)]
    pub(super) fn untimed(stream: Stream, limits: protocol::Limits) -> Self {
        Self {
            stream,
            decoder: NetworkFrameDecoder::new(limits),
            deadline: Deadline::default(),
            terminal: false,
            cleanup_finished: false,
        }
    }

    /// Opens a stream with one deadline covering admission and its handshake.
    pub(super) async fn open<Transport: ClientTransport<Stream = Stream, Error = Stream::Error>>(
        transport: &Transport,
        limits: protocol::Limits,
    ) -> Result<Self, ClientError<Stream::Error>> {
        let mut deadline = Deadline::default();
        #[cfg(not(target_arch = "wasm32"))]
        {
            deadline.timeout = transport.operation_timeout();
        }
        deadline.begin_request();
        let stream = deadline
            .run(async {
                transport
                    .open_bidirectional()
                    .await
                    .map_err(|error| ClientError::new(ClientErrorReason::Transport(error)))
            })
            .await?;
        Ok(Self {
            stream,
            decoder: NetworkFrameDecoder::new(limits),
            deadline,
            terminal: false,
            cleanup_finished: false,
        })
    }

    /// Starts a single budget for a request, including all interleaved responses.
    pub(super) fn begin_request(&mut self) {
        self.deadline.begin_request();
    }

    /// Releases the request budget after the matching completion.
    pub(super) fn end_request(&mut self) {
        self.deadline.end_request();
    }

    /// Cancels failed I/O without replacing its primary reason when cleanup also fails.
    pub(super) async fn cancel_on_error<T>(
        &mut self,
        result: Result<T, ClientError<Stream::Error>>,
    ) -> Result<T, ClientError<Stream::Error>> {
        if self.cleanup_finished {
            return result;
        }
        match result {
            Err(error) => Err(match self.cancel().await {
                Ok(()) => error,
                Err(cleanup) => error.with_additional_error(cleanup),
            }),
            Ok(value) => Ok(value),
        }
    }

    /// Writes one encoded frame without allowing a cancelled write to be reused.
    pub(super) async fn send(&mut self, bytes: &[u8]) -> Result<(), ClientError<Stream::Error>> {
        self.check_open()?;
        self.terminal = true;
        let result = self
            .deadline
            .run(async {
                self.stream
                    .send(bytes)
                    .await
                    .map_err(|error| ClientError::new(ClientErrorReason::Transport(error)))
            })
            .await;
        self.cancel_on_error(result).await?;
        self.terminal = false;
        Ok(())
    }

    /// Finishes sending within the active request budget.
    pub(super) async fn finish(&mut self) -> Result<(), ClientError<Stream::Error>> {
        self.check_open()?;
        self.terminal = true;
        let result = self
            .deadline
            .run(async {
                self.stream
                    .finish()
                    .await
                    .map_err(|error| ClientError::new(ClientErrorReason::Transport(error)))
            })
            .await;
        self.cancel_on_error(result).await?;
        self.terminal = false;
        Ok(())
    }

    /// Receives a frame, allowing idle subscriptions but bounding partial frames.
    ///
    /// Decoder bytes and their deadline survive cancellation of this future.
    pub(super) async fn receive(
        &mut self,
    ) -> Result<Option<protocol::NetworkFrame>, ClientError<Stream::Error>> {
        self.check_open()?;
        let result = self.receive_inner().await;
        self.cancel_on_error(result).await
    }

    /// Decodes without resetting either deadline when a peer trickles bytes.
    async fn receive_inner(
        &mut self,
    ) -> Result<Option<protocol::NetworkFrame>, ClientError<Stream::Error>> {
        loop {
            self.deadline.check()?;
            if let Some(frame) = self.decoder.next_frame()? {
                self.deadline.end_frame();
                return Ok(Some(frame));
            }
            if self.decoder.has_partial_frame() {
                self.deadline.begin_frame();
            }
            let chunk = self
                .deadline
                .run(async {
                    self.stream
                        .receive()
                        .await
                        .map_err(|error| ClientError::new(ClientErrorReason::Transport(error)))
                })
                .await?;
            let Some(chunk) = chunk else {
                self.decoder.finish()?;
                return Ok(None);
            };
            if !chunk.is_empty() {
                self.decoder.push(&chunk);
            }
        }
    }

    /// Rejects reuse after a failure or cancellation.
    fn check_open(&self) -> Result<(), ClientError<Stream::Error>> {
        if self.terminal {
            return Err(super::ClientStateError::Closed.into());
        }
        Ok(())
    }

    /// Abandons both directions, with bounded native cleanup.
    pub(super) async fn cancel(&mut self) -> Result<(), ClientError<Stream::Error>> {
        self.terminal = true;
        let mut cleanup = self.deadline;
        cleanup.end_frame();
        cleanup.begin_request();
        let result = cleanup
            .run(async {
                self.stream
                    .cancel()
                    .await
                    .map_err(|error| ClientError::new(ClientErrorReason::Transport(error)))
            })
            .await;
        self.cleanup_finished = true;
        result
    }
}

/// Optional native clocks; no Tokio timer is used on browser targets.
#[derive(Clone, Copy, Debug, Default)]
struct Deadline {
    /// Per-request and partial-frame duration supplied by the native transport.
    /// As with Tokio timeouts, expiry beyond the clock's range is effectively unbounded.
    #[cfg(not(target_arch = "wasm32"))]
    timeout: Option<std::time::Duration>,
    /// Absolute request expiry, unaffected by interleaved notifications.
    #[cfg(not(target_arch = "wasm32"))]
    request: Option<tokio::time::Instant>,
    /// Absolute expiry from observing an incomplete frame while receiving.
    #[cfg(not(target_arch = "wasm32"))]
    frame: Option<tokio::time::Instant>,
}

impl Deadline {
    /// Starts a fresh finite exchange.
    fn begin_request(&mut self) {
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.request = self
                .timeout
                .and_then(|timeout| tokio::time::Instant::now().checked_add(timeout));
        }
    }

    /// Returns to subscription-idle mode.
    fn end_request(&mut self) {
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.request = None;
        }
    }

    /// Starts a frame clock only once, preserving it through partial reads.
    fn begin_frame(&mut self) {
        #[cfg(not(target_arch = "wasm32"))]
        if self.frame.is_none() {
            self.frame = self
                .timeout
                .and_then(|timeout| tokio::time::Instant::now().checked_add(timeout));
        }
    }

    /// Clears the clock when the current frame completes.
    fn end_frame(&mut self) {
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.frame = None;
        }
    }

    /// Selects the stricter active deadline.
    #[cfg(not(target_arch = "wasm32"))]
    fn expires(&self) -> Option<tokio::time::Instant> {
        self.request.into_iter().chain(self.frame).min()
    }

    /// Checks expiry even when buffered responses are immediately ready.
    fn check<E>(&self) -> Result<(), ClientError<E>> {
        #[cfg(not(target_arch = "wasm32"))]
        if self
            .expires()
            .is_some_and(|expires| tokio::time::Instant::now() >= expires)
        {
            return Err(ClientError::new(ClientErrorReason::Timeout));
        }
        Ok(())
    }

    /// Polls one operation under the original absolute budget.
    async fn run<T, E>(
        &self,
        future: impl Future<Output = Result<T, ClientError<E>>>,
    ) -> Result<T, ClientError<E>> {
        self.check()?;
        #[cfg(not(target_arch = "wasm32"))]
        if let Some(expires) = self.expires() {
            return tokio::time::timeout_at(expires, future)
                .await
                .map_err(|_| ClientError::new(ClientErrorReason::Timeout))?;
        }
        future.await
    }
}
