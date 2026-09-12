#![doc = "A bounded local transport for snapshotted stream contracts."]

use std::sync::{
    Arc,
    atomic::{AtomicU64, AtomicUsize, Ordering},
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::StreamExt;
use snapshotted_stream_core::{
    AppendReceipt, AppendStream, Capabilities, ClassifiedError, ErrorKind, PositionCodec,
    PublishedSnapshot, ReadRecord, Snapshot, SnapshotId, SnapshotStore, StreamReader,
};
use thiserror::Error;
use tokio::{
    sync::{mpsc, oneshot},
    task::{JoinHandle, JoinSet},
};

/// A transport failure or an error returned by the wrapped stream.
#[derive(Debug, Error)]
pub enum NetworkError<E> {
    /// The wrapped stream rejected the operation.
    #[error("remote stream error: {0}")]
    Backend(#[source] E),
    /// The connection closed before the operation completed.
    #[error("transport disconnected")]
    Disconnected,
    /// A zero-capacity transport was requested.
    #[error("transport capacity must be greater than zero")]
    InvalidCapacity,
}

impl<E> ClassifiedError for NetworkError<E>
where
    E: ClassifiedError,
{
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Backend(error) => error.kind(),
            Self::Disconnected => ErrorKind::Unavailable,
            Self::InvalidCapacity => ErrorKind::Rejected,
        }
    }
}

/// A point-in-time view of transport measurements.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct TransportMeasurement {
    /// Payload and opaque-token bytes successfully sent across the typed boundary.
    pub wire_bytes: u64,
    /// The largest number of records waiting in any read response channel.
    pub peak_queued_records: usize,
}

#[derive(Debug, Default)]
struct Metrics {
    wire_bytes: AtomicU64,
    peak_queued_records: AtomicUsize,
}

impl Metrics {
    fn add_wire_bytes(&self, bytes: usize) {
        self.wire_bytes.fetch_add(bytes as u64, Ordering::Relaxed);
    }

    fn observe_queue(&self, queued: usize) {
        self.peak_queued_records
            .fetch_max(queued, Ordering::Relaxed);
    }

    fn snapshot(&self) -> TransportMeasurement {
        TransportMeasurement {
            wire_bytes: self.wire_bytes.load(Ordering::Relaxed),
            peak_queued_records: self.peak_queued_records.load(Ordering::Relaxed),
        }
    }
}

enum ReadMessage<P, E> {
    Record(Result<ReadRecord<P>, E>),
    End,
}

type ReadReceiver<P, E> = mpsc::Receiver<ReadMessage<P, E>>;

enum Request<P, E> {
    Append {
        value: Bytes,
        reply: oneshot::Sender<Result<AppendReceipt<P>, E>>,
    },
    Read {
        after: Option<P>,
        reply: oneshot::Sender<Result<ReadReceiver<P, E>, E>>,
    },
    Head {
        reply: oneshot::Sender<Result<Option<P>, E>>,
    },
    Latest {
        reply: oneshot::Sender<Result<Option<PublishedSnapshot<P>>, E>>,
    },
    Publish {
        snapshot: Snapshot<P>,
        expected_parent: Option<SnapshotId>,
        reply: oneshot::Sender<Result<SnapshotId, E>>,
    },
}

/// Client half of a local bounded transport.
#[derive(Debug)]
pub struct NetworkClient<S>
where
    S: AppendStream,
{
    requests: mpsc::Sender<Request<S::Position, S::Error>>,
    codec: S,
    capabilities: Capabilities,
    metrics: Arc<Metrics>,
}

impl<S> Clone for NetworkClient<S>
where
    S: AppendStream + Clone,
{
    fn clone(&self) -> Self {
        Self {
            requests: self.requests.clone(),
            codec: self.codec.clone(),
            capabilities: self.capabilities,
            metrics: Arc::clone(&self.metrics),
        }
    }
}

impl<S> NetworkClient<S>
where
    S: AppendStream,
{
    /// Returns current byte and queue measurements for this connection.
    #[must_use]
    pub fn measurement(&self) -> TransportMeasurement {
        self.metrics.snapshot()
    }

    async fn send_request(
        &self,
        request: Request<S::Position, S::Error>,
    ) -> Result<(), NetworkError<S::Error>> {
        self.requests
            .send(request)
            .await
            .map_err(|_| NetworkError::Disconnected)
    }
}

/// Server task for one local connection.
#[derive(Debug)]
pub struct NetworkServer {
    task: JoinHandle<()>,
    metrics: Arc<Metrics>,
}

impl NetworkServer {
    /// Abruptly closes this connection and all active readers.
    pub fn disconnect(&self) {
        self.task.abort();
    }

    /// Returns current byte and queue measurements for this connection.
    #[must_use]
    pub fn measurement(&self) -> TransportMeasurement {
        self.metrics.snapshot()
    }
}

/// Starts a typed, in-process client/server connection with bounded request and read queues.
///
/// # Errors
///
/// Returns [`NetworkError::InvalidCapacity`] when `capacity` is zero.
pub fn local_transport<S>(
    backend: S,
    capacity: usize,
) -> Result<(NetworkClient<S>, NetworkServer), NetworkError<<S as AppendStream>::Error>>
where
    S: AppendStream
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>
        + Clone
        + 'static,
{
    if capacity == 0 {
        return Err(NetworkError::InvalidCapacity);
    }

    let capabilities = backend.capabilities();
    let codec = backend.clone();
    let metrics = Arc::new(Metrics::default());
    let (requests, receiver) = mpsc::channel(capacity);
    let task = tokio::spawn(serve(backend, receiver, capacity, Arc::clone(&metrics)));
    Ok((
        NetworkClient {
            requests,
            codec,
            capabilities,
            metrics: Arc::clone(&metrics),
        },
        NetworkServer { task, metrics },
    ))
}

async fn serve<S>(
    backend: S,
    mut requests: mpsc::Receiver<
        Request<<S as AppendStream>::Position, <S as AppendStream>::Error>,
    >,
    capacity: usize,
    metrics: Arc<Metrics>,
) where
    S: AppendStream
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>
        + 'static,
{
    let mut readers = JoinSet::new();
    while let Some(request) = requests.recv().await {
        match request {
            Request::Append { value, reply } => {
                metrics.add_wire_bytes(value.len());
                let _ = reply.send(backend.append(value).await);
            }
            Request::Read { after, reply } => match backend.read(after.as_ref()).await {
                Ok(mut reader) => {
                    let (sender, receiver) = mpsc::channel(capacity);
                    if reply.send(Ok(receiver)).is_ok() {
                        let reader_metrics = Arc::clone(&metrics);
                        readers.spawn(async move {
                            while let Some(record) = reader.next().await {
                                let payload_bytes =
                                    record.as_ref().map_or(0, |value| value.payload.len());
                                if sender.send(ReadMessage::Record(record)).await.is_err() {
                                    return;
                                }
                                reader_metrics.add_wire_bytes(payload_bytes);
                                reader_metrics
                                    .observe_queue(sender.max_capacity() - sender.capacity());
                            }
                            let _ = sender.send(ReadMessage::End).await;
                        });
                    }
                }
                Err(error) => {
                    let _ = reply.send(Err(error));
                }
            },
            Request::Head { reply } => {
                let _ = reply.send(backend.head().await);
            }
            Request::Latest { reply } => {
                let result = backend.latest().await;
                if let Ok(Some(published)) = &result {
                    metrics.add_wire_bytes(
                        published.id.as_bytes().len() + published.snapshot.payload.len(),
                    );
                }
                let _ = reply.send(result);
            }
            Request::Publish {
                snapshot,
                expected_parent,
                reply,
            } => {
                metrics.add_wire_bytes(
                    snapshot.payload.len()
                        + expected_parent
                            .as_ref()
                            .map_or(0, |parent| parent.as_bytes().len()),
                );
                let _ = reply.send(backend.publish(snapshot, expected_parent.as_ref()).await);
            }
        }
    }
}

#[async_trait]
impl<S> AppendStream for NetworkClient<S>
where
    S: AppendStream + Clone,
{
    type Position = <S as AppendStream>::Position;
    type Error = NetworkError<<S as AppendStream>::Error>;

    fn capabilities(&self) -> Capabilities {
        self.capabilities
    }

    async fn append(&self, value: Bytes) -> Result<AppendReceipt<Self::Position>, Self::Error> {
        let (reply, response) = oneshot::channel();
        self.send_request(Request::Append { value, reply }).await?;
        response
            .await
            .map_err(|_| NetworkError::Disconnected)?
            .map_err(NetworkError::Backend)
    }

    async fn read(
        &self,
        after: Option<&Self::Position>,
    ) -> Result<StreamReader<Self::Position, Self::Error>, Self::Error> {
        let (reply, response) = oneshot::channel();
        self.send_request(Request::Read {
            after: after.cloned(),
            reply,
        })
        .await?;
        let receiver = response
            .await
            .map_err(|_| NetworkError::Disconnected)?
            .map_err(NetworkError::Backend)?;
        Ok(Box::pin(futures_util::stream::unfold(
            (receiver, false),
            |(mut receiver, reported_disconnect)| async move {
                match receiver.recv().await {
                    Some(ReadMessage::Record(result)) => Some((
                        result.map_err(NetworkError::Backend),
                        (receiver, reported_disconnect),
                    )),
                    None if !reported_disconnect => {
                        Some((Err(NetworkError::Disconnected), (receiver, true)))
                    }
                    Some(ReadMessage::End) | None => None,
                }
            },
        )))
    }

    async fn head(&self) -> Result<Option<Self::Position>, Self::Error> {
        let (reply, response) = oneshot::channel();
        self.send_request(Request::Head { reply }).await?;
        response
            .await
            .map_err(|_| NetworkError::Disconnected)?
            .map_err(NetworkError::Backend)
    }
}

impl<S> PositionCodec for NetworkClient<S>
where
    S: PositionCodec + Clone,
{
    fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error> {
        self.codec
            .encode_position(position)
            .map_err(NetworkError::Backend)
    }

    fn decode_position(&self, token: &[u8]) -> Result<Self::Position, Self::Error> {
        self.codec
            .decode_position(token)
            .map_err(NetworkError::Backend)
    }
}

#[async_trait]
impl<S> SnapshotStore for NetworkClient<S>
where
    S: AppendStream
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>
        + Clone,
{
    type Position = <S as AppendStream>::Position;
    type Error = NetworkError<<S as AppendStream>::Error>;

    async fn latest(&self) -> Result<Option<PublishedSnapshot<Self::Position>>, Self::Error> {
        let (reply, response) = oneshot::channel();
        self.send_request(Request::Latest { reply }).await?;
        response
            .await
            .map_err(|_| NetworkError::Disconnected)?
            .map_err(NetworkError::Backend)
    }

    async fn publish(
        &self,
        snapshot: Snapshot<Self::Position>,
        expected_parent: Option<&SnapshotId>,
    ) -> Result<SnapshotId, Self::Error> {
        let (reply, response) = oneshot::channel();
        self.send_request(Request::Publish {
            snapshot,
            expected_parent: expected_parent.cloned(),
            reply,
        })
        .await?;
        response
            .await
            .map_err(|_| NetworkError::Disconnected)?
            .map_err(NetworkError::Backend)
    }
}

#[cfg(test)]
mod tests {
    use futures_util::{StreamExt, TryStreamExt};
    use snapshotted_stream_compression::CompressionStream;
    use snapshotted_stream_core::{
        AppendStream, ClassifiedError, ErrorKind, PositionCodec, Snapshot, SnapshotPosition,
        SnapshotStore,
    };
    use snapshotted_stream_memory::MemoryStream;

    use super::*;

    fn connected_memory(capacity: usize) -> (NetworkClient<MemoryStream>, NetworkServer) {
        local_transport(MemoryStream::new(), capacity).expect("valid local transport")
    }

    #[tokio::test]
    async fn passes_shared_conformance() {
        snapshotted_stream_conformance::run_conformance(|| connected_memory(2).0).await;
    }

    #[tokio::test]
    async fn passes_position_codec_conformance() {
        snapshotted_stream_conformance::run_position_codec_conformance(
            || connected_memory(2).0,
            b"invalid-memory-position",
        )
        .await;
    }

    #[tokio::test]
    async fn finite_reader_excludes_later_appends() {
        let (client, _server) = connected_memory(1);
        client
            .append(Bytes::from_static(b"captured"))
            .await
            .unwrap();
        let reader = client.read(None).await.unwrap();
        client.append(Bytes::from_static(b"later")).await.unwrap();

        let records = reader.try_collect::<Vec<_>>().await.unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].payload, Bytes::from_static(b"captured"));
    }

    #[tokio::test]
    async fn slow_reader_never_exceeds_configured_queue_capacity() {
        let (client, server) = connected_memory(1);
        for value in 0_u8..4 {
            client.append(Bytes::from(vec![value])).await.unwrap();
        }
        let reader = client.read(None).await.unwrap();
        for _ in 0..4 {
            tokio::task::yield_now().await;
        }

        assert_eq!(server.measurement().peak_queued_records, 1);
        assert_eq!(reader.try_collect::<Vec<_>>().await.unwrap().len(), 4);
        assert_eq!(server.measurement().peak_queued_records, 1);
    }

    #[tokio::test]
    async fn reconnect_resumes_historical_read_without_hidden_retry() {
        let backend = MemoryStream::new();
        let (first_client, first_server) = local_transport(backend.clone(), 1).unwrap();
        for &value in b"abc" {
            first_client.append(Bytes::from(vec![value])).await.unwrap();
        }
        let mut reader = first_client.read(None).await.unwrap();
        let first = reader.next().await.unwrap().unwrap();
        first_server.disconnect();

        let disconnect = loop {
            match reader.next().await {
                Some(Ok(_)) => {}
                Some(Err(error)) => break error,
                None => panic!("active reader ended cleanly after disconnect"),
            }
        };
        assert_eq!(disconnect.kind(), ErrorKind::Unavailable);

        let (second_client, _second_server) = local_transport(backend, 1).unwrap();
        let resumed = second_client
            .read(Some(&first.position))
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(
            resumed
                .iter()
                .map(|record| record.payload[0])
                .collect::<Vec<_>>(),
            vec![b'b', b'c']
        );
    }

    #[tokio::test]
    async fn closed_server_classifies_requests_as_unavailable() {
        let (client, server) = connected_memory(1);
        server.disconnect();
        tokio::task::yield_now().await;

        assert_eq!(
            client.head().await.unwrap_err().kind(),
            ErrorKind::Unavailable
        );
    }

    #[tokio::test]
    async fn forwards_codec_and_rejects_foreign_generation() {
        let (first, _first_server) = connected_memory(1);
        let (second, _second_server) = connected_memory(1);
        let receipt = first.append(Bytes::from_static(b"value")).await.unwrap();
        let token = first.encode_position(&receipt.position).unwrap();
        assert_eq!(first.decode_position(&token).unwrap(), receipt.position);
        assert_eq!(
            second.decode_position(&token).unwrap_err().kind(),
            ErrorKind::InvalidPosition
        );
        let Err(error) = second.read(Some(&receipt.position)).await else {
            panic!("foreign-generation position was accepted");
        };
        assert_eq!(error.kind(), ErrorKind::InvalidPosition);
    }

    #[tokio::test]
    async fn snapshot_recovery_reads_only_the_tail() {
        let (client, _server) = connected_memory(1);
        client.append(Bytes::from_static(b"one")).await.unwrap();
        let through = client.append(Bytes::from_static(b"two")).await.unwrap();
        client
            .publish(
                Snapshot {
                    includes_through: SnapshotPosition::At(through.position.clone()),
                    payload: Bytes::from_static(b"state-two"),
                },
                None,
            )
            .await
            .unwrap();
        client.append(Bytes::from_static(b"three")).await.unwrap();

        let latest = client.latest().await.unwrap().unwrap();
        assert_eq!(latest.snapshot.payload, Bytes::from_static(b"state-two"));
        let SnapshotPosition::At(position) = latest.snapshot.includes_through else {
            panic!("snapshot should include a committed position");
        };
        let tail = client
            .read(Some(&position))
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(tail.len(), 1);
        assert_eq!(tail[0].payload, Bytes::from_static(b"three"));
    }

    #[tokio::test]
    async fn compression_precedes_transport_on_the_wire() {
        let (client, server) = connected_memory(1);
        let compressed = CompressionStream::new(client);
        let payload = Bytes::from(vec![b'x'; 16 * 1024]);
        compressed.append(payload.clone()).await.unwrap();
        let records = compressed
            .read(None)
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();

        assert_eq!(records[0].payload, payload);
        let measurement = server.measurement();
        println!(
            "network-measurement source_bytes={} wire_bytes={} peak_queued_records={}",
            payload.len() * 2,
            measurement.wire_bytes,
            measurement.peak_queued_records
        );
        assert!(measurement.wire_bytes < (payload.len() * 2) as u64);
        assert_eq!(measurement.peak_queued_records, 1);
    }

    #[test]
    fn rejects_zero_capacity() {
        assert_eq!(
            local_transport(MemoryStream::new(), 0).unwrap_err().kind(),
            ErrorKind::Rejected
        );
    }
}
