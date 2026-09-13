//! Transparent per-payload zlib compression for snapshotted streams.
//!
//! Each record and snapshot is one independent zlib frame. Positions, snapshot
//! boundaries, capabilities, and underlying error classifications pass through
//! unchanged; stored payload bytes do not. Reads reject malformed, truncated,
//! or extended frames as [`ErrorKind::Corrupt`].
//!
//! Encoding and decoding buffer one complete payload in memory. This wrapper
//! does not impose a decoded-size bound, so callers handling untrusted storage
//! should enforce a payload limit in another layer. A returned reader decodes
//! only the item being polled and adds no stream buffer or background task;
//! dropping it cancels further wrapper work, while underlying cancellation and
//! backpressure behavior remain the store's responsibility.
//!
//! Compression should normally wrap encryption so compression happens before
//! encryption. Reversing that order generally prevents useful compression.

use std::io::{Read, Write};

use async_trait::async_trait;
use bytes::Bytes;
use flate2::{Compression, read::ZlibDecoder, write::ZlibEncoder};
use futures_util::StreamExt;
use snapshotted_stream_core::{
    AppendReceipt, AppendStream, Capabilities, ClassifiedError, ErrorKind, PublishedSnapshot,
    ReadRecord, Snapshot, SnapshotId, SnapshotStore, StreamReader,
};
use thiserror::Error;

/// An error produced by the compression wrapper or its underlying store.
#[derive(Debug, Error)]
pub enum CompressionError<E> {
    /// The underlying store rejected the operation.
    #[error("underlying store error: {0}")]
    Store(#[source] E),
    /// A payload could not be encoded before it was appended or published.
    #[error("failed to compress payload: {0}")]
    Encode(#[source] std::io::Error),
    /// A stored payload was not a valid compressed frame.
    #[error("stored payload is corrupt: {0}")]
    Corrupt(#[source] std::io::Error),
}

impl<E> ClassifiedError for CompressionError<E>
where
    E: ClassifiedError,
{
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Store(error) => error.kind(),
            Self::Encode(_) => ErrorKind::Rejected,
            Self::Corrupt(_) => ErrorKind::Corrupt,
        }
    }
}

/// Compresses every record and snapshot independently over an underlying store.
#[derive(Clone, Debug)]
pub struct CompressionStream<S> {
    inner: S,
}

impl<S> CompressionStream<S> {
    /// Wraps an existing store.
    pub const fn new(inner: S) -> Self {
        Self { inner }
    }

    /// Returns the underlying store.
    pub fn into_inner(self) -> S {
        self.inner
    }
}

impl<S> From<S> for CompressionStream<S> {
    fn from(inner: S) -> Self {
        Self::new(inner)
    }
}

fn compress_payload(payload: &Bytes) -> Result<Bytes, std::io::Error> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(payload)?;
    encoder.finish().map(Bytes::from)
}

fn decompress_payload(payload: &Bytes) -> Result<Bytes, std::io::Error> {
    let mut decoder = ZlibDecoder::new(payload.as_ref());
    let mut output = Vec::new();
    decoder.read_to_end(&mut output)?;
    if decoder.total_in() != payload.len() as u64 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "trailing bytes after zlib frame",
        ));
    }
    Ok(Bytes::from(output))
}

#[async_trait]
impl<S> AppendStream for CompressionStream<S>
where
    S: AppendStream,
{
    type Position = S::Position;
    type Error = CompressionError<S::Error>;

    fn capabilities(&self) -> Capabilities {
        self.inner.capabilities()
    }

    async fn append(&self, value: Bytes) -> Result<AppendReceipt<Self::Position>, Self::Error> {
        let encoded = compress_payload(&value).map_err(CompressionError::Encode)?;
        self.inner
            .append(encoded)
            .await
            .map_err(CompressionError::Store)
    }

    async fn read(
        &self,
        after: Option<&Self::Position>,
    ) -> Result<StreamReader<Self::Position, Self::Error>, Self::Error> {
        let reader = self
            .inner
            .read(after)
            .await
            .map_err(CompressionError::Store)?;
        Ok(Box::pin(reader.map(|result| {
            result.map_err(CompressionError::Store).and_then(|record| {
                decompress_payload(&record.payload)
                    .map(|payload| ReadRecord {
                        position: record.position,
                        payload,
                    })
                    .map_err(CompressionError::Corrupt)
            })
        })))
    }

    async fn head(&self) -> Result<Option<Self::Position>, Self::Error> {
        self.inner.head().await.map_err(CompressionError::Store)
    }
}

#[async_trait]
impl<S> SnapshotStore for CompressionStream<S>
where
    S: SnapshotStore,
{
    type Position = S::Position;
    type Error = CompressionError<S::Error>;

    async fn latest(&self) -> Result<Option<PublishedSnapshot<Self::Position>>, Self::Error> {
        self.inner
            .latest()
            .await
            .map_err(CompressionError::Store)?
            .map(|published| {
                decompress_payload(&published.snapshot.payload)
                    .map(|payload| PublishedSnapshot {
                        id: published.id,
                        snapshot: Snapshot {
                            includes_through: published.snapshot.includes_through,
                            payload,
                        },
                    })
                    .map_err(CompressionError::Corrupt)
            })
            .transpose()
    }

    async fn publish(
        &self,
        snapshot: Snapshot<Self::Position>,
        expected_parent: Option<&SnapshotId>,
    ) -> Result<SnapshotId, Self::Error> {
        let encoded = compress_payload(&snapshot.payload).map_err(CompressionError::Encode)?;
        self.inner
            .publish(
                Snapshot {
                    includes_through: snapshot.includes_through,
                    payload: encoded,
                },
                expected_parent,
            )
            .await
            .map_err(CompressionError::Store)
    }
}

#[cfg(test)]
mod tests {
    use futures_util::{StreamExt, TryStreamExt};
    use snapshotted_stream_core::{
        AppendStream, ClassifiedError, ErrorKind, Snapshot, SnapshotPosition, SnapshotStore,
    };
    use snapshotted_stream_memory::MemoryStream;

    use super::*;

    #[tokio::test]
    async fn passes_shared_conformance() {
        snapshotted_stream_conformance::run_conformance(|| {
            CompressionStream::new(MemoryStream::new())
        })
        .await;
    }

    #[tokio::test]
    async fn preserves_append_boundaries_positions_and_payloads() {
        let stream = CompressionStream::new(MemoryStream::new());
        let first = stream.append(Bytes::from_static(b"first")).await.unwrap();
        let second = stream.append(Bytes::new()).await.unwrap();
        let third = stream.append(Bytes::from_static(b"third")).await.unwrap();

        let records = stream
            .read(Some(&first.position))
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].position, second.position);
        assert_eq!(records[0].payload, Bytes::new());
        assert_eq!(records[1].position, third.position);
        assert_eq!(records[1].payload, Bytes::from_static(b"third"));
        assert_eq!(stream.head().await.unwrap(), Some(third.position));
    }

    #[tokio::test]
    async fn empty_small_and_large_records_round_trip() {
        let stream = CompressionStream::new(MemoryStream::new());
        let payloads = [
            Bytes::new(),
            Bytes::from_static(b"x"),
            Bytes::from(vec![0x5a; 1024 * 1024]),
        ];
        for payload in &payloads {
            stream.append(payload.clone()).await.unwrap();
        }

        let decoded = stream
            .read(None)
            .await
            .unwrap()
            .map_ok(|record| record.payload)
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(decoded, payloads);
    }

    #[tokio::test]
    async fn snapshot_supports_counter_equivalent_recovery() {
        let stream = CompressionStream::new(MemoryStream::new());
        stream
            .append(Bytes::copy_from_slice(&1_i64.to_be_bytes()))
            .await
            .unwrap();
        let second = stream
            .append(Bytes::copy_from_slice(&2_i64.to_be_bytes()))
            .await
            .unwrap();
        let snapshot_id = stream
            .publish(
                Snapshot {
                    includes_through: SnapshotPosition::At(second.position.clone()),
                    payload: Bytes::copy_from_slice(&3_i64.to_be_bytes()),
                },
                None,
            )
            .await
            .unwrap();
        stream
            .append(Bytes::copy_from_slice(&4_i64.to_be_bytes()))
            .await
            .unwrap();

        let latest = stream.latest().await.unwrap().unwrap();
        assert_eq!(latest.id, snapshot_id);
        assert_eq!(
            latest.snapshot.payload,
            Bytes::copy_from_slice(&3_i64.to_be_bytes())
        );
        assert_eq!(
            latest.snapshot.includes_through,
            SnapshotPosition::At(second.position.clone())
        );
        let tail = stream
            .read(Some(&second.position))
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(tail.len(), 1);
        assert_eq!(
            tail[0].payload,
            Bytes::copy_from_slice(&4_i64.to_be_bytes())
        );
    }

    #[tokio::test]
    async fn classifies_malformed_records_as_corrupt() {
        let inner = MemoryStream::new();
        inner
            .append(Bytes::from_static(b"not a zlib frame"))
            .await
            .unwrap();
        let stream = CompressionStream::new(inner);

        let error = stream
            .read(None)
            .await
            .unwrap()
            .next()
            .await
            .unwrap()
            .unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Corrupt);
    }

    #[test]
    fn rejects_truncated_and_extended_frames() {
        let encoded = compress_payload(&Bytes::from_static(b"complete payload")).unwrap();

        for end in 0..encoded.len() {
            assert!(
                decompress_payload(&encoded.slice(..end)).is_err(),
                "accepted frame truncated to {end} bytes"
            );
        }

        let mut extended = encoded.to_vec();
        extended.extend_from_slice(b"trailing bytes");
        assert!(decompress_payload(&Bytes::from(extended)).is_err());
    }

    #[tokio::test]
    async fn classifies_truncated_and_extended_snapshots_as_corrupt() {
        let encoded = compress_payload(&Bytes::from_static(b"snapshot payload")).unwrap();
        let mut extended = encoded.to_vec();
        extended.extend_from_slice(b"trailing bytes");

        for malformed in [encoded.slice(..encoded.len() - 1), Bytes::from(extended)] {
            let inner = MemoryStream::new();
            inner
                .publish(
                    Snapshot {
                        includes_through: SnapshotPosition::Initial,
                        payload: malformed,
                    },
                    None,
                )
                .await
                .unwrap();
            let error = CompressionStream::new(inner).latest().await.unwrap_err();
            assert_eq!(error.kind(), ErrorKind::Corrupt);
        }
    }

    #[tokio::test]
    async fn decodes_records_lazily_at_poll_boundary() {
        let inner = MemoryStream::new();
        inner
            .append(compress_payload(&Bytes::from_static(b"first")).unwrap())
            .await
            .unwrap();
        inner
            .append(Bytes::from_static(b"corrupt second frame"))
            .await
            .unwrap();
        let stream = CompressionStream::new(inner);
        let mut reader = stream.read(None).await.unwrap();

        assert_eq!(
            reader.next().await.unwrap().unwrap().payload,
            Bytes::from_static(b"first")
        );
        assert_eq!(
            reader.next().await.unwrap().unwrap_err().kind(),
            ErrorKind::Corrupt
        );
    }

    #[tokio::test]
    async fn preserves_underlying_error_classification() {
        let first = CompressionStream::new(MemoryStream::new());
        let second = CompressionStream::new(MemoryStream::new());
        let receipt = first.append(Bytes::from_static(b"value")).await.unwrap();

        let Err(error) = second.read(Some(&receipt.position)).await else {
            panic!("foreign position was accepted");
        };
        assert_eq!(error.kind(), ErrorKind::InvalidPosition);
    }

    #[test]
    fn reports_repeated_and_deterministic_pseudo_random_sizes() {
        let repeated = Bytes::from(vec![b'a'; 16 * 1024]);
        let mut state = 0x4d59_5df4_d0f3_3173_u64;
        let pseudo_random = Bytes::from(
            (0..16 * 1024)
                .map(|_| {
                    state ^= state << 13;
                    state ^= state >> 7;
                    state ^= state << 17;
                    state.to_le_bytes()[0]
                })
                .collect::<Vec<_>>(),
        );
        let repeated_encoded = compress_payload(&repeated).unwrap();
        let pseudo_random_encoded = compress_payload(&pseudo_random).unwrap();

        println!(
            "compressed-size repeated={} repeated_encoded={} pseudo_random={} pseudo_random_encoded={}",
            repeated.len(),
            repeated_encoded.len(),
            pseudo_random.len(),
            pseudo_random_encoded.len()
        );
        assert!(repeated_encoded.len() < repeated.len());
        assert_eq!(decompress_payload(&repeated_encoded).unwrap(), repeated);
        assert_eq!(
            decompress_payload(&pseudo_random_encoded).unwrap(),
            pseudo_random
        );
    }
}
