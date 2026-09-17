#![doc = include_str!("../README.md")]

use async_trait::async_trait;
use bytes::{BufMut, Bytes, BytesMut};
use sea_core::{
    ArchiveEventStream, ArchiveLoadStream, BlobDirectory, BlobDirectoryId, BlobId, ClassifiedError,
    ErrorKind, SnapshotId,
    archive::{
        EventReceipt as SessionEventReceipt, EventSubmission, LoadEvent, OperationId,
        PublishedSnapshot as SessionPublishedSnapshot, SeaArchive, SeaAuthorSession,
        SeaEventSubscription, SeaService,
    },
    map_monitored_stream,
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

/// Compresses event payloads and blob leaves using one immutable shared dictionary.
#[derive(Clone, Debug)]
pub struct StatefulCompressionSession<S> {
    inner: S,
    dictionary: Bytes,
    dictionary_fingerprint: u64,
    max_decoded_bytes: usize,
}

impl<S> StatefulCompressionSession<S> {
    /// Wraps a session with bounded immutable-dictionary compression.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid dictionary or decoded payload bound.
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

    fn decompress(&self, framed: &Bytes) -> Result<Bytes, String> {
        decompress_frame(
            framed,
            &self.dictionary,
            self.dictionary_fingerprint,
            self.max_decoded_bytes,
        )
    }
}

impl<S> SeaService for StatefulCompressionSession<S>
where
    S: SeaService,
{
    type Error = StatefulCompressionError<S::Error>;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S> SeaEventSubscription for StatefulCompressionSession<S>
where
    S: SeaEventSubscription,
{
    fn load(&self, required: Option<sea_core::EventPosition>) -> ArchiveLoadStream<Self::Error> {
        let dictionary = self.dictionary.clone();
        let dictionary_fingerprint = self.dictionary_fingerprint;
        let max_decoded_bytes = self.max_decoded_bytes;
        map_monitored_stream(
            self.inner.load(required),
            move |mut item| {
                if let LoadEvent::Event(event) = &mut item {
                    event.committed.event.payload = decompress_frame(
                        &event.committed.event.payload,
                        &dictionary,
                        dictionary_fingerprint,
                        max_decoded_bytes,
                    )
                    .map_err(StatefulCompressionError::Corrupt)?;
                }
                Ok(item)
            },
            StatefulCompressionError::Store,
        )
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S> SeaArchive for StatefulCompressionSession<S>
where
    S: SeaArchive,
{
    fn read(
        &self,
        after: Option<sea_core::EventPosition>,
        stop_after: Option<sea_core::EventPosition>,
    ) -> ArchiveEventStream<Self::Error> {
        let dictionary = self.dictionary.clone();
        let dictionary_fingerprint = self.dictionary_fingerprint;
        let max_decoded_bytes = self.max_decoded_bytes;
        map_monitored_stream(
            self.inner.read(after, stop_after),
            move |mut event| {
                event.committed.event.payload = decompress_frame(
                    &event.committed.event.payload,
                    &dictionary,
                    dictionary_fingerprint,
                    max_decoded_bytes,
                )
                .map_err(StatefulCompressionError::Corrupt)?;
                Ok(event)
            },
            StatefulCompressionError::Store,
        )
    }

    async fn put_blob(&self, payload: Bytes) -> Result<BlobId, Self::Error> {
        if payload.len() > self.max_decoded_bytes {
            return Err(StatefulCompressionError::PayloadTooLarge {
                actual: payload.len(),
                maximum: self.max_decoded_bytes,
            });
        }
        let payload = self
            .compress(&payload)
            .map_err(StatefulCompressionError::Encode)?;
        self.inner
            .put_blob(payload)
            .await
            .map_err(StatefulCompressionError::Store)
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        let payload = self
            .inner
            .get_blob(id)
            .await
            .map_err(StatefulCompressionError::Store)?;
        self.decompress(&payload)
            .map_err(StatefulCompressionError::Corrupt)
    }

    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<BlobDirectoryId, Self::Error> {
        self.inner
            .put_directory(directory)
            .await
            .map_err(StatefulCompressionError::Store)
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.inner
            .get_directory(id)
            .await
            .map_err(StatefulCompressionError::Store)
    }

    async fn snapshot(
        &self,
        id: &SnapshotId,
    ) -> Result<Option<SessionPublishedSnapshot>, Self::Error> {
        self.inner
            .snapshot(id)
            .await
            .map_err(StatefulCompressionError::Store)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S> SeaAuthorSession for StatefulCompressionSession<S>
where
    S: SeaAuthorSession,
{
    async fn submit(
        &self,
        mut submission: EventSubmission,
    ) -> Result<SessionEventReceipt, Self::Error> {
        if submission.event.payload.len() > self.max_decoded_bytes {
            return Err(StatefulCompressionError::PayloadTooLarge {
                actual: submission.event.payload.len(),
                maximum: self.max_decoded_bytes,
            });
        }
        submission.event.payload = self
            .compress(&submission.event.payload)
            .map_err(StatefulCompressionError::Encode)?;
        self.inner
            .submit(submission)
            .await
            .map_err(StatefulCompressionError::Store)
    }

    async fn resolve_submission(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<SessionEventReceipt>, Self::Error> {
        self.inner
            .resolve_submission(operation_id)
            .await
            .map_err(StatefulCompressionError::Store)
    }

    async fn close(&self) -> Result<(), Self::Error> {
        self.inner
            .close()
            .await
            .map_err(StatefulCompressionError::Store)
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

#[cfg(test)]
mod current_tests {
    use std::sync::Arc;

    use bytes::Bytes;
    use sea_core::{
        ClassifiedError, ErrorKind, Event,
        archive::{
            AuthorId, EventSubmission, OperationId, SeaArchive, SeaAuthorSession, SessionId,
        },
    };
    use sea_memory::MemoryStream;
    use sea_sequencer::session::LocalSequencer;

    use super::{
        ConfigurationError, MAX_DECODED_BYTES, MAX_DICTIONARY_BYTES, StatefulCompressionError,
        StatefulCompressionSession,
    };

    const MAX_PAYLOAD: usize = 16 * 1024;
    const DICTIONARY: &[u8] = b"tenant=alpha;document=shared;operation=insert;path=/items/;value=collaborative-content;sequence=00000000";

    #[tokio::test]
    async fn passes_session_conformance() {
        let sequencer = LocalSequencer::recover(Arc::new(MemoryStream::new()))
            .await
            .unwrap();
        let session = sequencer
            .open_session(
                AuthorId::new(Bytes::from_static(b"conformance-author")).unwrap(),
                SessionId::new(Bytes::from_static(b"conformance-session")).unwrap(),
                None,
            )
            .await
            .unwrap();
        let compressed = StatefulCompressionSession::new(
            session.clone(),
            Bytes::from_static(DICTIONARY),
            MAX_PAYLOAD,
        )
        .unwrap();
        sea_conformance::run_sea_responsibility_observable_behavior(&compressed, &session).await;
    }

    #[test]
    fn frame_round_trip_rejects_invalid_metadata_and_payloads() {
        let codec =
            StatefulCompressionSession::new((), Bytes::from_static(DICTIONARY), MAX_PAYLOAD)
                .unwrap();
        let payload = Bytes::from_static(b"complete payload");
        let encoded = codec.compress(&payload).unwrap();
        assert_eq!(codec.decompress(&encoded).unwrap(), payload);
        let empty = Bytes::new();
        assert_eq!(
            codec.decompress(&codec.compress(&empty).unwrap()).unwrap(),
            empty
        );
        for end in 0..encoded.len() {
            assert!(
                codec.decompress(&encoded.slice(..end)).is_err(),
                "prefix length {end}"
            );
        }

        let wrong_dictionary = StatefulCompressionSession::new(
            (),
            Bytes::from_static(b"different dictionary"),
            MAX_PAYLOAD,
        )
        .unwrap();
        assert!(wrong_dictionary.decompress(&encoded).is_err());

        let mut unsupported_version = encoded.to_vec();
        unsupported_version[super::MAGIC.len()] += 1;
        assert_eq!(
            codec
                .decompress(&Bytes::from(unsupported_version))
                .unwrap_err(),
            "unsupported dictionary-frame version"
        );

        let length_offset = super::MAGIC.len() + 1 + 8;
        let mut false_length = encoded.to_vec();
        false_length[length_offset..super::HEADER_LEN]
            .copy_from_slice(&((payload.len() + 1) as u64).to_be_bytes());
        assert!(codec.decompress(&Bytes::from(false_length)).is_err());

        let mut oversized_length = encoded.to_vec();
        oversized_length[length_offset..super::HEADER_LEN]
            .copy_from_slice(&((MAX_PAYLOAD + 1) as u64).to_be_bytes());
        assert_eq!(
            codec
                .decompress(&Bytes::from(oversized_length))
                .unwrap_err(),
            format!(
                "decoded length {} exceeds configured maximum {MAX_PAYLOAD}",
                MAX_PAYLOAD + 1
            )
        );
    }

    #[tokio::test]
    async fn rejects_blob_and_event_payloads_over_configured_bound() {
        let sequencer = LocalSequencer::recover(Arc::new(MemoryStream::new()))
            .await
            .unwrap();
        let session = sequencer
            .open_session(
                AuthorId::new(Bytes::from_static(b"bounded-author")).unwrap(),
                SessionId::new(Bytes::from_static(b"bounded-session")).unwrap(),
                None,
            )
            .await
            .unwrap();
        let compressed =
            StatefulCompressionSession::new(session, Bytes::from_static(DICTIONARY), MAX_PAYLOAD)
                .unwrap();
        let error = compressed
            .put_blob(Bytes::from(vec![0; MAX_PAYLOAD + 1]))
            .await
            .unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Rejected);
        assert!(matches!(
            error,
            StatefulCompressionError::PayloadTooLarge { .. }
        ));

        let error = compressed
            .submit(EventSubmission {
                operation_id: OperationId::new(Bytes::from_static(b"oversized-event")).unwrap(),
                reference: None,
                event: Event {
                    payload: Bytes::from(vec![0; MAX_PAYLOAD + 1]),
                    blob_tree: None,
                },
            })
            .await
            .unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Rejected);
        assert!(matches!(
            error,
            StatefulCompressionError::PayloadTooLarge { .. }
        ));
    }

    #[test]
    fn configuration_has_hard_dictionary_and_payload_bounds() {
        assert!(matches!(
            StatefulCompressionSession::new((), Bytes::from(vec![0; MAX_DICTIONARY_BYTES + 1]), 1,),
            Err(ConfigurationError::DictionaryTooLarge { .. })
        ));
        assert!(matches!(
            StatefulCompressionSession::new((), Bytes::new(), 0),
            Err(ConfigurationError::ZeroPayloadBound)
        ));
        assert!(matches!(
            StatefulCompressionSession::new((), Bytes::new(), MAX_DECODED_BYTES + 1),
            Err(ConfigurationError::PayloadBoundTooLarge { .. })
        ));
    }
}
