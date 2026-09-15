//! Bounded dictionary compression with independently restartable payloads.
//!
//! Each record and snapshot is one independent zstd frame prefixed by a wrapper
//! header containing a magic value, format version, dictionary fingerprint, and
//! declared decoded length. Reopening requires the same immutable dictionary and
//! configured decoded-size bound; no earlier record or mutable codec state is
//! needed. Positions, capabilities, and underlying errors pass through unchanged.
//!
//! The dictionary is limited to [`MAX_DICTIONARY_BYTES`], and the configured
//! decoded-size bound cannot exceed [`MAX_DECODED_BYTES`]. The declared length is
//! checked before decompression, the zstd window is capped from the configured
//! bound, and the actual decoded length must match. The complete stored frame and
//! decoded payload are nevertheless held in memory. A returned reader decodes
//! only the item being polled and adds no stream buffer or background task;
//! dropping it cancels further wrapper work.
//!
//! The dictionary fingerprint detects accidental mismatch but is not a
//! cryptographic authenticator. Use authenticated encryption outside this wrapper
//! when storage is untrusted; this ordering compresses plaintext before encryption.

use async_trait::async_trait;
use bytes::{BufMut, Bytes, BytesMut};
use futures_util::StreamExt;
use sea_core::{
    Capabilities, ClassifiedError, CommittedEvent, ErrorKind, EventReceipt, EventStream,
    PositionCodec, PublishedSnapshot, Snapshot, SnapshotId, SnapshotStore, StreamReader,
};
use thiserror::Error;

/// Identifies a dictionary-compressed frame before version parsing.
const MAGIC: &[u8; 4] = b"SSDZ";
/// Current dictionary-frame format version.
const VERSION: u8 = 1;
/// Wrapper header width before the zstd frame.
const HEADER_LEN: usize = MAGIC.len() + 1 + 8 + 8;
/// Fixed zstd compression level used for stored payloads.
const COMPRESSION_LEVEL: i32 = 3;

/// Maximum caller-supplied dictionary size retained by a wrapper.
pub const MAX_DICTIONARY_BYTES: usize = 64 * 1024;
/// Maximum decoded record or snapshot size accepted by any wrapper configuration.
pub const MAX_DECODED_BYTES: usize = 128 * 1024 * 1024;

/// Invalid bounded dictionary configuration.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum ConfigurationError {
    /// The configured decoded payload bound is zero.
    #[error("maximum decoded payload bytes must be nonzero")]
    ZeroPayloadBound,
    /// The immutable dictionary exceeds the wrapper's hard memory bound.
    #[error("dictionary has {actual} bytes; maximum is {maximum}")]
    DictionaryTooLarge {
        /// Supplied dictionary size.
        actual: usize,
        /// Hard dictionary-size ceiling.
        maximum: usize,
    },
    /// The decoded payload bound exceeds the wrapper's hard memory ceiling.
    #[error("decoded payload bound is {actual} bytes; maximum is {maximum}")]
    PayloadBoundTooLarge {
        /// Supplied decoded payload bound.
        actual: usize,
        /// Hard decoded payload ceiling.
        maximum: usize,
    },
}

/// An error produced by dictionary compression or its underlying store.
#[derive(Debug, Error)]
pub enum StatefulCompressionError<E> {
    /// The underlying store rejected the operation.
    #[error("underlying store error: {0}")]
    Store(#[source] E),
    /// The logical payload exceeds the configured decoded-size bound.
    #[error("payload has {actual} bytes; configured maximum is {maximum}")]
    PayloadTooLarge {
        /// Logical payload size presented by the caller.
        actual: usize,
        /// Configured decoded payload bound.
        maximum: usize,
    },
    /// A payload could not be encoded before storage.
    #[error("failed to compress payload: {0}")]
    Encode(#[source] std::io::Error),
    /// Stored bytes are malformed, use another dictionary, or exceed configured bounds.
    #[error("stored payload is corrupt: {0}")]
    Corrupt(String),
}

impl<E> ClassifiedError for StatefulCompressionError<E>
where
    E: ClassifiedError,
{
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Store(error) => error.kind(),
            Self::PayloadTooLarge { .. } | Self::Encode(_) => ErrorKind::Rejected,
            Self::Corrupt(_) => ErrorKind::Corrupt,
        }
    }
}

/// Compresses each record and snapshot as an independent zstd frame using one immutable dictionary.
#[derive(Clone, Debug)]
pub struct StatefulCompressionStream<S> {
    /// Store that receives framed compressed payloads and owns positions.
    inner: S,
    /// Immutable dictionary required to encode and decode every payload.
    dictionary: Bytes,
    /// Stable non-cryptographic identity recorded in each wrapper header.
    dictionary_fingerprint: u64,
    /// Configured maximum logical payload size for writes and reads.
    max_decoded_bytes: usize,
}

impl<S> StatefulCompressionStream<S> {
    /// Wraps a store with a bounded immutable dictionary and decoded payload limit.
    ///
    /// # Errors
    ///
    /// Returns an error when the payload bound is zero or the dictionary exceeds
    /// [`MAX_DICTIONARY_BYTES`].
    pub fn new(
        inner: S,
        dictionary: Bytes,
        max_decoded_bytes: usize,
    ) -> Result<Self, ConfigurationError> {
        if max_decoded_bytes == 0 {
            return Err(ConfigurationError::ZeroPayloadBound);
        }
        if max_decoded_bytes > MAX_DECODED_BYTES {
            return Err(ConfigurationError::PayloadBoundTooLarge {
                actual: max_decoded_bytes,
                maximum: MAX_DECODED_BYTES,
            });
        }
        if dictionary.len() > MAX_DICTIONARY_BYTES {
            return Err(ConfigurationError::DictionaryTooLarge {
                actual: dictionary.len(),
                maximum: MAX_DICTIONARY_BYTES,
            });
        }
        let dictionary_fingerprint = fingerprint(&dictionary);
        Ok(Self {
            inner,
            dictionary,
            dictionary_fingerprint,
            max_decoded_bytes,
        })
    }

    /// Returns the underlying store.
    pub fn into_inner(self) -> S {
        self.inner
    }

    /// Compresses one payload and prefixes its restart metadata.
    fn compress(&self, payload: &Bytes) -> Result<Bytes, std::io::Error> {
        let mut compressor =
            zstd::bulk::Compressor::with_dictionary(COMPRESSION_LEVEL, &self.dictionary)?;
        let compressed = compressor.compress(payload)?;
        let mut framed = BytesMut::with_capacity(HEADER_LEN + compressed.len());
        framed.extend_from_slice(MAGIC);
        framed.put_u8(VERSION);
        framed.put_u64(self.dictionary_fingerprint);
        framed.put_u64(payload.len() as u64);
        framed.extend_from_slice(&compressed);
        Ok(framed.freeze())
    }

    /// Decompresses one independently restartable wrapper frame.
    fn decompress(&self, framed: &Bytes) -> Result<Bytes, String> {
        decompress_frame(
            framed,
            &self.dictionary,
            self.dictionary_fingerprint,
            self.max_decoded_bytes,
        )
    }
}

/// Validates wrapper metadata and decodes one bounded zstd frame.
fn decompress_frame(
    framed: &Bytes,
    dictionary: &[u8],
    dictionary_fingerprint: u64,
    max_decoded_bytes: usize,
) -> Result<Bytes, String> {
    if framed.len() < HEADER_LEN || &framed[..MAGIC.len()] != MAGIC {
        return Err("missing dictionary-frame header".to_owned());
    }
    if framed[MAGIC.len()] != VERSION {
        return Err("unsupported dictionary-frame version".to_owned());
    }
    let fingerprint_offset = MAGIC.len() + 1;
    let stored_fingerprint = u64::from_be_bytes(
        framed[fingerprint_offset..fingerprint_offset + 8]
            .try_into()
            .expect("fixed fingerprint field"),
    );
    if stored_fingerprint != dictionary_fingerprint {
        return Err("dictionary fingerprint mismatch".to_owned());
    }
    let length_offset = fingerprint_offset + 8;
    let decoded_len_u64 = u64::from_be_bytes(
        framed[length_offset..HEADER_LEN]
            .try_into()
            .expect("fixed length field"),
    );
    let decoded_len = usize::try_from(decoded_len_u64)
        .map_err(|_| "decoded length does not fit usize".to_owned())?;
    if decoded_len > max_decoded_bytes {
        return Err(format!(
            "decoded length {decoded_len} exceeds configured maximum {max_decoded_bytes}"
        ));
    }
    let mut decompressor =
        zstd::bulk::Decompressor::with_dictionary(dictionary).map_err(|error| error.to_string())?;
    let window_bytes = max_decoded_bytes.max(dictionary.len()).max(1 << 10);
    let window_log = usize::BITS - window_bytes.saturating_sub(1).leading_zeros();
    decompressor
        .set_parameter(zstd::zstd_safe::DParameter::WindowLogMax(window_log))
        .map_err(|error| error.to_string())?;
    let decoded = decompressor
        .decompress(&framed[HEADER_LEN..], decoded_len)
        .map_err(|error| error.to_string())?;
    if decoded.len() != decoded_len {
        return Err(format!(
            "decoded length {} differs from declared length {decoded_len}",
            decoded.len()
        ));
    }
    Ok(Bytes::from(decoded))
}

/// Computes the stable dictionary fingerprint stored in wrapper headers.
fn fingerprint(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

#[async_trait]
impl<S> EventStream for StatefulCompressionStream<S>
where
    S: EventStream,
{
    type Position = S::Position;
    type Error = StatefulCompressionError<S::Error>;

    /// Reports the underlying store's capabilities unchanged.
    fn capabilities(&self) -> Capabilities {
        self.inner.capabilities()
    }

    /// Bounds, compresses, and appends one record without changing its receipt.
    async fn append(&self, value: Bytes) -> Result<EventReceipt<Self::Position>, Self::Error> {
        if value.len() > self.max_decoded_bytes {
            return Err(StatefulCompressionError::PayloadTooLarge {
                actual: value.len(),
                maximum: self.max_decoded_bytes,
            });
        }
        let encoded = self
            .compress(&value)
            .map_err(StatefulCompressionError::Encode)?;
        self.inner
            .append(encoded)
            .await
            .map_err(StatefulCompressionError::Store)
    }

    /// Opens an underlying reader that decodes each bounded frame when polled.
    async fn read(
        &self,
        after: Option<&Self::Position>,
    ) -> Result<StreamReader<Self::Position, Self::Error>, Self::Error> {
        let reader = self
            .inner
            .read(after)
            .await
            .map_err(StatefulCompressionError::Store)?;
        let dictionary = self.dictionary.clone();
        let dictionary_fingerprint = self.dictionary_fingerprint;
        let max_decoded_bytes = self.max_decoded_bytes;
        Ok(Box::pin(reader.map(move |result| {
            result
                .map_err(StatefulCompressionError::Store)
                .and_then(|record| {
                    decompress_frame(
                        &record.payload,
                        &dictionary,
                        dictionary_fingerprint,
                        max_decoded_bytes,
                    )
                    .map(|payload| CommittedEvent {
                        position: record.position,
                        payload,
                    })
                    .map_err(StatefulCompressionError::Corrupt)
                })
        })))
    }

    /// Returns the underlying stream head unchanged.
    async fn head(&self) -> Result<Option<Self::Position>, Self::Error> {
        self.inner
            .head()
            .await
            .map_err(StatefulCompressionError::Store)
    }
}

impl<S> PositionCodec for StatefulCompressionStream<S>
where
    S: PositionCodec,
{
    /// Delegates position encoding without interpreting the opaque token.
    fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error> {
        self.inner
            .encode_position(position)
            .map_err(StatefulCompressionError::Store)
    }

    /// Delegates position decoding without interpreting the opaque token.
    fn decode_position(&self, token: &[u8]) -> Result<Self::Position, Self::Error> {
        self.inner
            .decode_position(token)
            .map_err(StatefulCompressionError::Store)
    }
}

#[async_trait]
impl<S> SnapshotStore for StatefulCompressionStream<S>
where
    S: SnapshotStore,
{
    type Position = S::Position;
    type Error = StatefulCompressionError<S::Error>;

    /// Returns the latest snapshot after validating and decoding its frame.
    async fn latest(&self) -> Result<Option<PublishedSnapshot<Self::Position>>, Self::Error> {
        self.inner
            .latest()
            .await
            .map_err(StatefulCompressionError::Store)?
            .map(|published| {
                self.decompress(&published.snapshot.payload)
                    .map(|payload| PublishedSnapshot {
                        id: published.id,
                        snapshot: Snapshot {
                            at_event: published.snapshot.at_event,
                            payload,
                        },
                    })
                    .map_err(StatefulCompressionError::Corrupt)
            })
            .transpose()
    }

    /// Bounds and compresses a snapshot before delegating publication.
    async fn publish(
        &self,
        snapshot: Snapshot<Self::Position>,
        expected_parent: Option<&SnapshotId>,
    ) -> Result<SnapshotId, Self::Error> {
        if snapshot.payload.len() > self.max_decoded_bytes {
            return Err(StatefulCompressionError::PayloadTooLarge {
                actual: snapshot.payload.len(),
                maximum: self.max_decoded_bytes,
            });
        }
        let encoded = self
            .compress(&snapshot.payload)
            .map_err(StatefulCompressionError::Encode)?;
        self.inner
            .publish(
                Snapshot {
                    at_event: snapshot.at_event,
                    payload: encoded,
                },
                expected_parent,
            )
            .await
            .map_err(StatefulCompressionError::Store)
    }
}

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use futures_util::{StreamExt, TryStreamExt};
    use sea_compression::CompressionStream;
    use sea_core::{
        Capabilities, ClassifiedError, CommittedEvent, ErrorKind, EventReceipt, EventStream,
        PublishedSnapshot, Snapshot, SnapshotId, SnapshotPosition, SnapshotStore, StreamReader,
    };
    use sea_memory::{MemoryError, MemoryPosition, MemoryStream};

    use super::*;

    const MAX_PAYLOAD: usize = 16 * 1024;
    const DICTIONARY: &[u8] = b"tenant=alpha;document=shared;operation=insert;path=/items/;value=collaborative-content;sequence=00000000";

    /// Wraps a memory stream with the standard dictionary and payload bound.
    fn wrap(inner: MemoryStream) -> StatefulCompressionStream<MemoryStream> {
        StatefulCompressionStream::new(inner, Bytes::from_static(DICTIONARY), MAX_PAYLOAD)
            .expect("valid test configuration")
    }

    /// Produces records sharing dictionary-friendly field names and values.
    fn repeated_records(count: usize) -> Vec<Bytes> {
        (0..count)
            .map(|index| {
                Bytes::from(format!(
                    "tenant=alpha;document=shared;operation=insert;path=/items/{index:08};value=collaborative-content;sequence={index:08}"
                ))
            })
            .collect()
    }

    /// Produces deterministic pseudo-random records for incompressible comparisons.
    fn incompressible_records(count: usize, len: usize) -> Vec<Bytes> {
        let mut state = 0x4d59_5df4_d0f3_3173_u64;
        (0..count)
            .map(|_| {
                Bytes::from(
                    (0..len)
                        .map(|_| {
                            state ^= state << 13;
                            state ^= state >> 7;
                            state ^= state << 17;
                            state.to_le_bytes()[0]
                        })
                        .collect::<Vec<_>>(),
                )
            })
            .collect()
    }

    /// Collects encoded record payloads directly from the underlying memory stream.
    async fn stored_bytes(inner: &MemoryStream) -> Vec<Bytes> {
        inner
            .read(None)
            .await
            .expect("raw reader")
            .map_ok(|record| record.payload)
            .try_collect()
            .await
            .expect("raw records")
    }

    /// Applies the reversible transform used by the composition test store.
    fn xor(payload: &Bytes, key: u8) -> Bytes {
        Bytes::from(payload.iter().map(|byte| byte ^ key).collect::<Vec<_>>())
    }

    /// Minimal reversible store wrapper used to verify transformation ordering.
    #[derive(Clone, Debug)]
    struct XorStream {
        inner: MemoryStream,
        key: u8,
    }

    #[async_trait]
    impl EventStream for XorStream {
        type Position = MemoryPosition;
        type Error = MemoryError;

        fn capabilities(&self) -> Capabilities {
            self.inner.capabilities()
        }

        async fn append(&self, value: Bytes) -> Result<EventReceipt<Self::Position>, Self::Error> {
            self.inner.append(xor(&value, self.key)).await
        }

        async fn read(
            &self,
            after: Option<&Self::Position>,
        ) -> Result<StreamReader<Self::Position, Self::Error>, Self::Error> {
            let key = self.key;
            Ok(Box::pin(self.inner.read(after).await?.map(move |result| {
                result.map(|record| CommittedEvent {
                    position: record.position,
                    payload: xor(&record.payload, key),
                })
            })))
        }

        async fn head(&self) -> Result<Option<Self::Position>, Self::Error> {
            self.inner.head().await
        }
    }

    #[async_trait]
    impl SnapshotStore for XorStream {
        type Position = MemoryPosition;
        type Error = MemoryError;

        async fn latest(&self) -> Result<Option<PublishedSnapshot<Self::Position>>, Self::Error> {
            Ok(self
                .inner
                .latest()
                .await?
                .map(|published| PublishedSnapshot {
                    id: published.id,
                    snapshot: Snapshot {
                        at_event: published.snapshot.at_event,
                        payload: xor(&published.snapshot.payload, self.key),
                    },
                }))
        }

        async fn publish(
            &self,
            snapshot: Snapshot<Self::Position>,
            expected_parent: Option<&SnapshotId>,
        ) -> Result<SnapshotId, Self::Error> {
            self.inner
                .publish(
                    Snapshot {
                        at_event: snapshot.at_event,
                        payload: xor(&snapshot.payload, self.key),
                    },
                    expected_parent,
                )
                .await
        }
    }

    #[tokio::test]
    async fn passes_shared_conformance_directly() {
        sea_conformance::run_conformance(|| wrap(MemoryStream::new())).await;
    }

    #[tokio::test]
    async fn passes_position_codec_conformance_directly() {
        sea_conformance::run_position_codec_conformance(|| wrap(MemoryStream::new()), b"malformed")
            .await;
    }

    #[tokio::test]
    async fn every_position_resumes_after_reopen_without_history() {
        let inner = MemoryStream::new();
        let stream = wrap(inner.clone());
        let payloads = repeated_records(17);
        let mut positions = Vec::new();
        for payload in &payloads {
            positions.push(stream.append(payload.clone()).await.unwrap().position);
        }
        drop(stream);

        let reopened = wrap(inner);
        for start in 0..=payloads.len() {
            let after = start.checked_sub(1).map(|index| &positions[index]);
            let records = reopened
                .read(after)
                .await
                .unwrap()
                .try_collect::<Vec<_>>()
                .await
                .unwrap();
            assert_eq!(
                records
                    .iter()
                    .map(|record| record.payload.clone())
                    .collect::<Vec<_>>(),
                payloads[start..]
            );
        }
    }

    #[tokio::test]
    async fn a_single_retained_record_decodes_without_its_prefix() {
        let original_inner = MemoryStream::new();
        let original = wrap(original_inner.clone());
        let payloads = repeated_records(3);
        for payload in &payloads {
            original.append(payload.clone()).await.unwrap();
        }
        let retained_frame = stored_bytes(&original_inner).await.remove(2);

        let retained_inner = MemoryStream::new();
        retained_inner.append(retained_frame).await.unwrap();
        let retained = wrap(retained_inner);
        let records = retained
            .read(None)
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].payload, payloads[2]);
    }

    #[tokio::test]
    async fn snapshots_reopen_before_at_and_after_restart_boundaries() {
        let inner = MemoryStream::new();
        let stream = wrap(inner.clone());
        let initial = stream
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::Initial,
                    payload: Bytes::from_static(b"initial-state"),
                },
                None,
            )
            .await
            .unwrap();
        let first = stream.append(Bytes::from_static(b"first")).await.unwrap();
        let at_first = stream
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::At(first.position.clone()),
                    payload: Bytes::from_static(b"state-at-first"),
                },
                Some(&initial),
            )
            .await
            .unwrap();
        let second = stream.append(Bytes::from_static(b"second")).await.unwrap();
        stream
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::At(second.position.clone()),
                    payload: Bytes::from_static(b"state-after-boundary"),
                },
                Some(&at_first),
            )
            .await
            .unwrap();
        drop(stream);

        let reopened = wrap(inner);
        let latest = reopened.latest().await.unwrap().unwrap();
        assert_eq!(
            latest.snapshot.payload,
            Bytes::from_static(b"state-after-boundary")
        );
        assert_eq!(
            latest.snapshot.at_event,
            SnapshotPosition::At(second.position.clone())
        );
        assert!(
            reopened
                .read(Some(&second.position))
                .await
                .unwrap()
                .try_collect::<Vec<_>>()
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn rejects_oversize_and_round_trips_empty_and_maximum_records() {
        let inner = MemoryStream::new();
        let stream = wrap(inner.clone());
        stream.append(Bytes::new()).await.unwrap();
        stream
            .append(Bytes::from(vec![7; MAX_PAYLOAD]))
            .await
            .unwrap();
        let error = stream
            .append(Bytes::from(vec![8; MAX_PAYLOAD + 1]))
            .await
            .unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Rejected);
        assert_eq!(stored_bytes(&inner).await.len(), 2);
        let decoded = stream
            .read(None)
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert!(decoded[0].payload.is_empty());
        assert_eq!(decoded[1].payload, Bytes::from(vec![7; MAX_PAYLOAD]));
    }

    #[tokio::test]
    async fn rejects_oversize_snapshot_without_replacing_latest() {
        let inner = MemoryStream::new();
        let stream = wrap(inner);
        let maximum = Bytes::from(vec![7; MAX_PAYLOAD]);
        let snapshot_id = stream
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::Initial,
                    payload: maximum.clone(),
                },
                None,
            )
            .await
            .unwrap();

        let error = stream
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::Initial,
                    payload: Bytes::from(vec![8; MAX_PAYLOAD + 1]),
                },
                Some(&snapshot_id),
            )
            .await
            .unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Rejected);

        let latest = stream.latest().await.unwrap().unwrap();
        assert_eq!(latest.id, snapshot_id);
        assert_eq!(latest.snapshot.payload, maximum);
    }

    #[tokio::test]
    async fn classifies_truncation_malformed_frames_and_wrong_dictionary_as_corrupt() {
        let malformed = MemoryStream::new();
        malformed
            .append(Bytes::from_static(b"not a frame"))
            .await
            .unwrap();
        let error = wrap(malformed)
            .read(None)
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Corrupt);

        let encoded_store = MemoryStream::new();
        wrap(encoded_store.clone())
            .append(Bytes::from_static(b"valid payload"))
            .await
            .unwrap();
        let encoded = stored_bytes(&encoded_store).await.remove(0);
        let truncated_store = MemoryStream::new();
        truncated_store
            .append(encoded.slice(..encoded.len() - 1))
            .await
            .unwrap();
        let truncated = wrap(truncated_store)
            .read(None)
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap_err();
        assert_eq!(truncated.kind(), ErrorKind::Corrupt);

        let wrong_dictionary = StatefulCompressionStream::new(
            encoded_store,
            Bytes::from_static(b"different dictionary"),
            MAX_PAYLOAD,
        )
        .unwrap();
        let mismatch = wrong_dictionary
            .read(None)
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap_err();
        assert_eq!(mismatch.kind(), ErrorKind::Corrupt);
    }

    #[test]
    fn rejects_truncated_extended_and_false_length_frames() {
        let stream = wrap(MemoryStream::new());
        let payload = Bytes::from_static(b"complete payload");
        let encoded = stream.compress(&payload).unwrap();

        for end in 0..encoded.len() {
            assert!(
                stream.decompress(&encoded.slice(..end)).is_err(),
                "prefix length {end}"
            );
        }

        let mut extended = encoded.to_vec();
        extended.extend_from_slice(b"trailing bytes");
        assert!(stream.decompress(&Bytes::from(extended)).is_err());

        let length_offset = MAGIC.len() + 1 + 8;
        for declared_length in [payload.len() + 1, MAX_PAYLOAD + 1] {
            let mut false_length = encoded.to_vec();
            false_length[length_offset..HEADER_LEN]
                .copy_from_slice(&(declared_length as u64).to_be_bytes());
            assert!(stream.decompress(&Bytes::from(false_length)).is_err());
        }
    }

    #[tokio::test]
    async fn classifies_truncated_and_extended_snapshots_as_corrupt() {
        let stream = wrap(MemoryStream::new());
        let compressed = stream
            .compress(&Bytes::from_static(b"snapshot payload"))
            .unwrap();
        let mut extended = compressed.to_vec();
        extended.extend_from_slice(b"trailing bytes");

        for malformed in [
            compressed.slice(..compressed.len() - 1),
            Bytes::from(extended),
        ] {
            let inner = MemoryStream::new();
            inner
                .publish(
                    Snapshot {
                        at_event: SnapshotPosition::Initial,
                        payload: malformed,
                    },
                    None,
                )
                .await
                .unwrap();
            let error = wrap(inner).latest().await.unwrap_err();
            assert_eq!(error.kind(), ErrorKind::Corrupt);
        }
    }

    #[tokio::test]
    async fn decodes_records_lazily_at_poll_boundary() {
        let inner = MemoryStream::new();
        let encoder = wrap(MemoryStream::new());
        inner
            .append(encoder.compress(&Bytes::from_static(b"first")).unwrap())
            .await
            .unwrap();
        inner
            .append(Bytes::from_static(b"corrupt second frame"))
            .await
            .unwrap();
        let stream = wrap(inner);
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
    async fn compression_frames_are_inside_encryption_at_rest() {
        let raw = MemoryStream::new();
        let encrypted = XorStream {
            inner: raw.clone(),
            key: 0xa5,
        };
        let stream =
            StatefulCompressionStream::new(encrypted, Bytes::from_static(DICTIONARY), MAX_PAYLOAD)
                .unwrap();
        let payload = repeated_records(1).remove(0);
        let receipt = stream.append(payload.clone()).await.unwrap();
        stream
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::At(receipt.position),
                    payload: Bytes::from_static(b"encrypted snapshot"),
                },
                None,
            )
            .await
            .unwrap();

        let persisted = stored_bytes(&raw).await.remove(0);
        assert_ne!(&persisted[..MAGIC.len()], MAGIC);
        assert_eq!(
            stream
                .read(None)
                .await
                .unwrap()
                .try_collect::<Vec<_>>()
                .await
                .unwrap()[0]
                .payload,
            payload
        );
        assert_eq!(
            stream.latest().await.unwrap().unwrap().snapshot.payload,
            Bytes::from_static(b"encrypted snapshot")
        );
    }

    #[tokio::test]
    async fn deterministic_comparison_with_independent_zlib_frames() {
        for (name, payloads) in [
            ("repeated", repeated_records(256)),
            ("incompressible", incompressible_records(256, 128)),
        ] {
            let dictionary_inner = MemoryStream::new();
            let dictionary_stream = wrap(dictionary_inner.clone());
            let zlib_inner = MemoryStream::new();
            let zlib_stream = CompressionStream::new(zlib_inner.clone());

            let dictionary_start = Instant::now();
            for payload in &payloads {
                dictionary_stream.append(payload.clone()).await.unwrap();
            }
            let dictionary_elapsed = dictionary_start.elapsed();
            let zlib_start = Instant::now();
            for payload in &payloads {
                zlib_stream.append(payload.clone()).await.unwrap();
            }
            let zlib_elapsed = zlib_start.elapsed();

            let dictionary_records = stored_bytes(&dictionary_inner).await;
            let zlib_records = stored_bytes(&zlib_inner).await;
            let logical_bytes = payloads.iter().map(Bytes::len).sum::<usize>();
            let dictionary_bytes = dictionary_records.iter().map(Bytes::len).sum::<usize>();
            let zlib_bytes = zlib_records.iter().map(Bytes::len).sum::<usize>();
            println!(
                "compression-comparison workload={name} records={} logical_bytes={logical_bytes} dictionary_bytes={dictionary_bytes} zlib_bytes={zlib_bytes} dictionary_encode_us={} zlib_encode_us={}",
                payloads.len(),
                dictionary_elapsed.as_micros(),
                zlib_elapsed.as_micros()
            );
            assert_eq!(
                dictionary_stream
                    .read(None)
                    .await
                    .unwrap()
                    .map_ok(|record| record.payload)
                    .try_collect::<Vec<_>>()
                    .await
                    .unwrap(),
                payloads
            );
            if name == "repeated" {
                assert!(dictionary_bytes < zlib_bytes);
            }

            let second_inner = MemoryStream::new();
            let second = wrap(second_inner.clone());
            for payload in &payloads {
                second.append(payload.clone()).await.unwrap();
            }
            assert_eq!(stored_bytes(&second_inner).await, dictionary_records);
        }
    }

    #[test]
    fn configuration_has_hard_dictionary_and_payload_bounds() {
        assert_eq!(
            StatefulCompressionStream::new(
                MemoryStream::new(),
                Bytes::from(vec![0; MAX_DICTIONARY_BYTES + 1]),
                1,
            )
            .unwrap_err(),
            ConfigurationError::DictionaryTooLarge {
                actual: MAX_DICTIONARY_BYTES + 1,
                maximum: MAX_DICTIONARY_BYTES,
            }
        );
        assert_eq!(
            StatefulCompressionStream::new(MemoryStream::new(), Bytes::new(), 0).unwrap_err(),
            ConfigurationError::ZeroPayloadBound
        );
        assert_eq!(
            StatefulCompressionStream::new(
                MemoryStream::new(),
                Bytes::new(),
                MAX_DECODED_BYTES + 1,
            )
            .unwrap_err(),
            ConfigurationError::PayloadBoundTooLarge {
                actual: MAX_DECODED_BYTES + 1,
                maximum: MAX_DECODED_BYTES,
            }
        );
    }
}
