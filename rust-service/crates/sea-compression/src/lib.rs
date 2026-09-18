#![doc = include_str!("../README.md")]

mod next;

use std::io::{Read, Write};

use async_trait::async_trait;
use bytes::Bytes;
use flate2::{Compression, read::ZlibDecoder, write::ZlibEncoder};
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

/// Compresses event payloads and blob leaves through an individual Sea session.
#[derive(Clone, Debug)]
pub struct CompressionSession<S> {
    inner: S,
}

impl<S> CompressionSession<S> {
    /// Wraps one session with independent zlib frames.
    pub const fn new(inner: S) -> Self {
        Self { inner }
    }

    /// Returns the underlying uncompressed session.
    pub fn into_inner(self) -> S {
        self.inner
    }
}

impl<S> SeaService for CompressionSession<S>
where
    S: SeaService,
{
    type Error = CompressionError<S::Error>;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S> SeaEventSubscription for CompressionSession<S>
where
    S: SeaEventSubscription,
{
    fn load(&self, required: Option<sea_core::EventPosition>) -> ArchiveLoadStream<Self::Error> {
        map_monitored_stream(
            self.inner.load(required),
            |mut item| {
                if let LoadEvent::Event(event) = &mut item {
                    event.committed.event.payload =
                        decompress_payload(&event.committed.event.payload)
                            .map_err(CompressionError::Corrupt)?;
                }
                Ok(item)
            },
            CompressionError::Store,
        )
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S> SeaArchive for CompressionSession<S>
where
    S: SeaArchive,
{
    fn read(
        &self,
        after: Option<sea_core::EventPosition>,
        stop_after: Option<sea_core::EventPosition>,
    ) -> ArchiveEventStream<Self::Error> {
        map_monitored_stream(
            self.inner.read(after, stop_after),
            |mut event| {
                event.committed.event.payload = decompress_payload(&event.committed.event.payload)
                    .map_err(CompressionError::Corrupt)?;
                Ok(event)
            },
            CompressionError::Store,
        )
    }

    async fn put_blob(&self, payload: Bytes) -> Result<BlobId, Self::Error> {
        let payload = compress_payload(&payload).map_err(CompressionError::Encode)?;
        self.inner
            .put_blob(payload)
            .await
            .map_err(CompressionError::Store)
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        let payload = self
            .inner
            .get_blob(id)
            .await
            .map_err(CompressionError::Store)?;
        decompress_payload(&payload).map_err(CompressionError::Corrupt)
    }

    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<BlobDirectoryId, Self::Error> {
        self.inner
            .put_directory(directory)
            .await
            .map_err(CompressionError::Store)
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.inner
            .get_directory(id)
            .await
            .map_err(CompressionError::Store)
    }

    async fn snapshot(
        &self,
        id: &SnapshotId,
    ) -> Result<Option<SessionPublishedSnapshot>, Self::Error> {
        self.inner
            .snapshot(id)
            .await
            .map_err(CompressionError::Store)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<S> SeaAuthorSession for CompressionSession<S>
where
    S: SeaAuthorSession,
{
    async fn submit(
        &self,
        mut submission: EventSubmission,
    ) -> Result<SessionEventReceipt, Self::Error> {
        submission.event.payload =
            compress_payload(&submission.event.payload).map_err(CompressionError::Encode)?;
        self.inner
            .submit(submission)
            .await
            .map_err(CompressionError::Store)
    }

    async fn resolve_submission(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<SessionEventReceipt>, Self::Error> {
        self.inner
            .resolve_submission(operation_id)
            .await
            .map_err(CompressionError::Store)
    }

    async fn close(&self) -> Result<(), Self::Error> {
        self.inner.close().await.map_err(CompressionError::Store)
    }
}

/// Encodes one logical payload as one complete zlib frame.
fn compress_payload(payload: &Bytes) -> Result<Bytes, std::io::Error> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(payload)?;
    encoder.finish().map(Bytes::from)
}

/// Decodes one complete zlib frame and rejects trailing bytes.
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

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use futures_util::StreamExt;
    use sea_core::archive::{
        AuthorId, EventSubmission, LoadEvent, OperationId, SeaArchive, SeaAuthorSession,
        SeaEventSubscription, SessionId,
    };
    use sea_memory::MemoryStream;
    use sea_sequencer::session::LocalSequencer;

    use super::*;

    #[tokio::test]
    async fn session_decorator_round_trips_events_and_blobs() {
        let sequencer = LocalSequencer::recover(Arc::new(MemoryStream::new()))
            .await
            .unwrap();
        let session = sequencer
            .open_session(
                AuthorId::new(Bytes::from_static(b"author")).unwrap(),
                SessionId::new(Bytes::from_static(b"session")).unwrap(),
                None,
            )
            .await
            .unwrap();
        let compressed = CompressionSession::new(session);
        let blob = compressed
            .put_blob(Bytes::from_static(
                b"compressible compressible compressible",
            ))
            .await
            .unwrap();
        assert_eq!(
            compressed.get_blob(blob).await.unwrap(),
            Bytes::from_static(b"compressible compressible compressible")
        );
        let receipt = compressed
            .submit(EventSubmission {
                operation_id: OperationId::new(Bytes::from_static(b"operation")).unwrap(),
                reference: None,
                event: sea_core::Event {
                    payload: Bytes::from_static(b"event event event"),
                    blob_tree: None,
                },
            })
            .await
            .unwrap();
        let mut load = compressed.load(None);
        let event = loop {
            match load.next().await.unwrap().unwrap() {
                sea_core::MonitoredStreamItem::Item(LoadEvent::Event(event)) => break event,
                sea_core::MonitoredStreamItem::Item(LoadEvent::Snapshot(_))
                | sea_core::MonitoredStreamItem::Progress(_) => {}
            }
        };
        assert_eq!(event.committed.position, receipt.position);
        assert_eq!(
            event.committed.event.payload,
            Bytes::from_static(b"event event event")
        );
    }

    #[tokio::test]
    async fn classifies_malformed_stored_payloads_as_corrupt() {
        let sequencer = LocalSequencer::recover(Arc::new(MemoryStream::new()))
            .await
            .unwrap();
        let session = sequencer
            .open_session(
                AuthorId::new(Bytes::from_static(b"corrupt-author")).unwrap(),
                SessionId::new(Bytes::from_static(b"corrupt-session")).unwrap(),
                None,
            )
            .await
            .unwrap();
        let compressed = CompressionSession::new(session.clone());

        let blob = session
            .put_blob(Bytes::from_static(b"not a zlib frame"))
            .await
            .unwrap();
        let blob_error = compressed.get_blob(blob).await.unwrap_err();
        assert!(matches!(blob_error, CompressionError::Corrupt(_)));
        assert_eq!(blob_error.kind(), ErrorKind::Corrupt);

        let receipt = session
            .submit(EventSubmission {
                operation_id: OperationId::new(Bytes::from_static(b"corrupt-operation")).unwrap(),
                reference: None,
                event: sea_core::Event {
                    payload: Bytes::from_static(b"not a zlib frame"),
                    blob_tree: None,
                },
            })
            .await
            .unwrap();

        let mut history = compressed.read(None, Some(receipt.position));
        let read_error = loop {
            match history.next().await.unwrap() {
                Ok(sea_core::MonitoredStreamItem::Progress(_)) => {}
                Ok(sea_core::MonitoredStreamItem::Item(_)) => {
                    panic!("malformed event was returned")
                }
                Err(error) => break error,
            }
        };
        assert!(matches!(read_error, CompressionError::Corrupt(_)));
        assert_eq!(read_error.kind(), ErrorKind::Corrupt);

        let mut load = compressed.load(None);
        let load_error = loop {
            match load.next().await.unwrap() {
                Ok(
                    sea_core::MonitoredStreamItem::Progress(_)
                    | sea_core::MonitoredStreamItem::Item(LoadEvent::Snapshot(_)),
                ) => {}
                Ok(sea_core::MonitoredStreamItem::Item(LoadEvent::Event(_))) => {
                    panic!("malformed event was returned")
                }
                Err(error) => break error,
            }
        };
        assert!(matches!(load_error, CompressionError::Corrupt(_)));
        assert_eq!(load_error.kind(), ErrorKind::Corrupt);
    }

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
        let compressed = CompressionSession::new(session.clone());
        sea_conformance::run_sea_responsibility_observable_behavior(&compressed, &session).await;
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

    #[test]
    fn round_trips_an_empty_payload() {
        let payload = Bytes::new();
        let encoded = compress_payload(&payload).unwrap();

        assert_eq!(decompress_payload(&encoded).unwrap(), payload);
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
