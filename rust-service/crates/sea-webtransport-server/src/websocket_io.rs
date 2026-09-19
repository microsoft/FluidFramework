//! Bounded WebSocket byte-stream adaptation with directional EOF.

use std::sync::Arc;

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{SinkExt as _, StreamExt as _, stream::SplitSink};
use sea_webtransport::websocket::{self, CHUNK_BYTES, DATA, FIN, Record};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    sync::{mpsc, watch},
    task::AbortHandle,
};
use tokio_tungstenite::{
    WebSocketStream,
    tungstenite::{Message, protocol::WebSocketConfig},
};

use crate::{
    WebTransportError,
    server::transport_error,
    stream::{ReceiveStream, SendStream},
};

/// Limits both complete messages and fragmented-message assembly.
pub(crate) fn socket_config() -> WebSocketConfig {
    WebSocketConfig::default()
        .max_message_size(Some(CHUNK_BYTES + 1))
        .max_frame_size(Some(CHUNK_BYTES + 1))
        .write_buffer_size(0)
        .max_write_buffer_size(2 * (CHUNK_BYTES + 32))
}

/// Aborts the reader task when both stream directions have been released.
struct ReaderLease(AbortHandle);

impl Drop for ReaderLease {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// Backpressured WebSocket writer; only FIN closes its direction cleanly.
pub(crate) struct SocketSend<Socket> {
    /// Owned write half, with no unbounded send queue.
    sink: SplitSink<WebSocketStream<Socket>, Message>,
    /// Peer closure notification, independent of directional FIN.
    stopped: watch::Receiver<bool>,
    /// Shared reader task lifetime.
    _lease: Arc<ReaderLease>,
    /// Whether FIN has already been sent.
    finished: bool,
}

/// Bounded queued data and partially consumed bytes for cancellation-safe reads.
pub(crate) struct SocketReceive {
    /// One queued record; a blocked producer stops polling the socket.
    receiver: mpsc::Receiver<Result<Option<Bytes>, WebTransportError>>,
    /// Bytes retained across short reads or cancelled read futures.
    pending: Bytes,
    /// Clean FIN already consumed.
    finished: bool,
    /// Shared reader task lifetime.
    _lease: Arc<ReaderLease>,
}

/// Splits a socket without draining received data into an unbounded queue.
pub(crate) fn split<Socket>(socket: WebSocketStream<Socket>) -> (SocketSend<Socket>, SocketReceive)
where
    Socket: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let (sink, mut source) = socket.split();
    let (sender, receiver) = mpsc::channel(1);
    let (stopped, stopped_receiver) = watch::channel(false);
    let task = tokio::spawn(async move {
        let mut finished = false;
        let result = async {
            loop {
                let message = tokio::select! {
                    message = source.next() => message,
                    () = sender.closed(), if !finished => return Ok(()),
                };
                match message {
                    Some(Ok(Message::Binary(bytes))) if !finished => {
                        match websocket::decode(&bytes) {
                            Some(Record::Data(_)) => {
                                sender
                                    .send(Ok(Some(bytes.slice(1..))))
                                    .await
                                    .map_err(transport_error)?;
                            }
                            Some(Record::Finish) => {
                                finished = true;
                                sender.send(Ok(None)).await.map_err(transport_error)?;
                            }
                            None => return Err(transport_error("invalid WebSocket stream record")),
                        }
                    }
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) | None => return Ok(()),
                    Some(Err(error)) => return Err(transport_error(error)),
                    _ => return Err(transport_error("unexpected WebSocket stream message")),
                }
            }
        }
        .await;
        stopped.send_replace(true);
        if let Err(error) = result {
            let _ = sender.send(Err(error)).await;
        }
    });
    let lease = Arc::new(ReaderLease(task.abort_handle()));
    (
        SocketSend {
            sink,
            stopped: stopped_receiver,
            _lease: Arc::clone(&lease),
            finished: false,
        },
        SocketReceive {
            receiver,
            pending: Bytes::new(),
            finished: false,
            _lease: lease,
        },
    )
}

#[async_trait]
impl<Socket> SendStream for SocketSend<Socket>
where
    Socket: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    async fn write_all(&mut self, bytes: &[u8]) -> Result<(), WebTransportError> {
        if self.finished {
            return Err(WebTransportError::Disconnected);
        }
        for chunk in bytes.chunks(CHUNK_BYTES) {
            let mut record = Vec::with_capacity(chunk.len() + 1);
            record.push(DATA);
            record.extend_from_slice(chunk);
            self.sink
                .send(Message::Binary(record.into()))
                .await
                .map_err(transport_error)?;
        }
        Ok(())
    }

    async fn finish(&mut self) -> Result<(), WebTransportError> {
        if !self.finished {
            self.sink
                .send(Message::Binary(Bytes::from_static(&[FIN])))
                .await
                .map_err(transport_error)?;
            self.finished = true;
        }
        Ok(())
    }

    async fn stopped(&mut self) {
        let _ = self.stopped.wait_for(|stopped| *stopped).await;
    }
}

#[async_trait]
impl ReceiveStream for SocketReceive {
    async fn read(&mut self, bytes: &mut [u8]) -> Result<Option<usize>, WebTransportError> {
        if bytes.is_empty() {
            return Ok(Some(0));
        }
        if self.finished {
            return Ok(None);
        }
        if self.pending.is_empty() {
            if let Some(data) = self
                .receiver
                .recv()
                .await
                .ok_or(WebTransportError::Disconnected)??
            {
                self.pending = data;
            } else {
                self.finished = true;
                return Ok(None);
            }
        }
        let count = bytes.len().min(self.pending.len());
        bytes[..count].copy_from_slice(&self.pending.split_to(count));
        Ok(Some(count))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{Duration, timeout};
    use tokio_tungstenite::tungstenite::protocol::Role;

    #[tokio::test]
    async fn finish_preserves_reverse_direction_and_cancel_notifies_writer() {
        let (client, server) = tokio::io::duplex(4096);
        let (mut client_send, mut client_receive) = split(
            WebSocketStream::from_raw_socket(client, Role::Client, Some(socket_config())).await,
        );
        let (mut server_send, mut server_receive) = split(
            WebSocketStream::from_raw_socket(server, Role::Server, Some(socket_config())).await,
        );
        client_send.write_all(b"request").await.unwrap();
        client_send.finish().await.unwrap();
        let mut buffer = [0; 7];
        server_receive.read_exact(&mut buffer).await.unwrap();
        assert_eq!(&buffer, b"request");
        assert_eq!(server_receive.read(&mut buffer).await.unwrap(), None);
        assert!(
            timeout(Duration::from_millis(20), server_send.stopped())
                .await
                .is_err()
        );
        server_send.write_all(b"reply").await.unwrap();
        assert_eq!(client_receive.read(&mut buffer).await.unwrap(), Some(5));
        assert_eq!(&buffer[..5], b"reply");
        drop(client_send);
        drop(client_receive);
        timeout(Duration::from_secs(1), server_send.stopped())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn unexpected_close_is_not_clean_eof() {
        let (client, server) = tokio::io::duplex(4096);
        let client =
            WebSocketStream::from_raw_socket(client, Role::Client, Some(socket_config())).await;
        let (_send, mut receive) = split(
            WebSocketStream::from_raw_socket(server, Role::Server, Some(socket_config())).await,
        );
        drop(client);
        assert!(receive.read(&mut [0; 8]).await.is_err());
    }

    #[tokio::test]
    async fn stalled_stream_is_bounded_independent_and_recovers_without_losing_bytes() {
        let (client, server) = tokio::io::duplex(128);
        let (mut client_send, _client_receive) = split(
            WebSocketStream::from_raw_socket(client, Role::Client, Some(socket_config())).await,
        );
        let (_server_send, mut server_receive) = split(
            WebSocketStream::from_raw_socket(server, Role::Server, Some(socket_config())).await,
        );
        assert!(
            timeout(Duration::from_millis(20), server_receive.read(&mut [0; 1]))
                .await
                .is_err()
        );
        let payload = vec![42; CHUNK_BYTES * 8 + 3];
        let expected = payload.clone();
        let mut writing = tokio::spawn(async move {
            client_send.write_all(&payload).await.unwrap();
            client_send.finish().await.unwrap();
            client_send
        });
        assert!(
            timeout(Duration::from_millis(20), &mut writing)
                .await
                .is_err()
        );
        let (independent_client, independent_server) = tokio::io::duplex(4096);
        let (mut independent_send, _independent_receive) = split(
            WebSocketStream::from_raw_socket(
                independent_client,
                Role::Client,
                Some(socket_config()),
            )
            .await,
        );
        let (_independent_send, mut independent_receive) = split(
            WebSocketStream::from_raw_socket(
                independent_server,
                Role::Server,
                Some(socket_config()),
            )
            .await,
        );
        independent_send.write_all(b"independent").await.unwrap();
        let mut reply = [0; 11];
        timeout(
            Duration::from_secs(1),
            independent_receive.read_exact(&mut reply),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(&reply, b"independent");
        let mut actual = Vec::new();
        let mut buffer = [0; 997];
        timeout(Duration::from_secs(2), async {
            while let Some(count) = server_receive.read(&mut buffer).await.unwrap() {
                actual.extend_from_slice(&buffer[..count]);
            }
        })
        .await
        .unwrap();
        assert_eq!(actual, expected);
        writing.await.unwrap();
    }

    #[tokio::test]
    async fn malformed_and_oversized_records_fail_without_clean_eof() {
        for message in [
            Message::Binary(Bytes::new()),
            Message::Binary(Bytes::from_static(&[DATA])),
            Message::Binary(Bytes::from_static(&[FIN, 0])),
            Message::Binary(Bytes::from_static(&[2])),
            Message::Binary(vec![DATA; CHUNK_BYTES + 2].into()),
            Message::Text("not binary".into()),
        ] {
            let (client, server) = tokio::io::duplex(CHUNK_BYTES * 2);
            let mut client = WebSocketStream::from_raw_socket(client, Role::Client, None).await;
            let (mut send, mut receive) = split(
                WebSocketStream::from_raw_socket(server, Role::Server, Some(socket_config())).await,
            );
            client.send(message).await.unwrap();
            assert!(
                timeout(Duration::from_secs(1), receive.read(&mut [0; 8]))
                    .await
                    .unwrap()
                    .is_err()
            );
            timeout(Duration::from_secs(1), send.stopped())
                .await
                .unwrap();
        }
    }
}
