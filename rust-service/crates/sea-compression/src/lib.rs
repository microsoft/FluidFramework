#![doc = include_str!("../README.md")]

mod session;

use std::io::{Read, Write};

use bytes::Bytes;
use flate2::{Compression, read::ZlibDecoder, write::ZlibEncoder};
use sea_core::{ClassifiedError, ErrorKind, SeaService};
use thiserror::Error;

/// An error produced by the compression wrapper or its underlying store.
#[derive(Debug, Error)]
pub enum CompressionError<E> {
    /// The underlying store failed; its error classification is preserved.
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

    /// Removes this wrapper and returns the underlying session without decoding stored data.
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
    use super::*;

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
