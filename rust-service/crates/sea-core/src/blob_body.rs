//! Owned immutable blob bodies with an exact transfer extent.

use std::{io, pin::Pin};

use bytes::Bytes;
use tokio::io::{AsyncRead, AsyncReadExt as _, AsyncWrite, AsyncWriteExt as _};

#[cfg(not(target_arch = "wasm32"))]
/// An owned native reader; filesystem implementations retain their own admission and leases.
pub type BlobReader = Pin<Box<dyn AsyncRead + Send + 'static>>;
#[cfg(target_arch = "wasm32")]
/// An owned browser-local reader, without a native thread-safety requirement.
pub type BlobReader = Pin<Box<dyn AsyncRead + 'static>>;

/// Immutable bytes or an owned reader whose declared extent bounds every transfer.
///
/// Opening errors retain the source API's error type. Errors while consuming a reader are I/O
/// errors; a short body is [`io::ErrorKind::UnexpectedEof`].
/// Dropping a body stops further reads, but already-dispatched filesystem work may still own
/// resources until it completes. Transport callers must finish or abort an already-started frame.
pub enum BlobBody {
    /// Already resident immutable content; cloning the bytes does not copy their payload.
    Bytes(Bytes),
    /// An independent reader positioned at the first payload byte.
    Reader {
        /// Exact payload extent, excluding any storage or transport header.
        length: u64,
        /// Owns its source and any lease needed while reading.
        reader: BlobReader,
    },
}

impl BlobBody {
    /// Returns the declared payload length without reading the source.
    #[must_use]
    pub fn len(&self) -> u64 {
        match self {
            Self::Bytes(bytes) => bytes.len() as u64,
            Self::Reader { length, .. } => *length,
        }
    }

    /// Reports whether the declared payload extent is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Writes exactly the declared extent without probing trailing source bytes.
    ///
    /// # Errors
    /// Returns source/writer errors or unexpected EOF. Cancellation may leave partial output;
    /// callers must not reuse a partially written framed stream.
    pub async fn copy_to<W: AsyncWrite + Unpin + ?Sized>(self, writer: &mut W) -> io::Result<u64> {
        match self {
            Self::Bytes(bytes) => {
                writer.write_all(&bytes).await?;
                Ok(bytes.len() as u64)
            }
            Self::Reader { length, reader } => {
                let copied = tokio::io::copy(&mut reader.take(length), writer).await?;
                if copied != length {
                    return Err(io::Error::new(
                        io::ErrorKind::UnexpectedEof,
                        "blob body ended before its declared length",
                    ));
                }
                Ok(copied)
            }
        }
    }

    /// Materializes the declared extent for callers that require owned bytes.
    ///
    /// # Errors
    /// Returns an error for an unrepresentable length, source failure, or short body.
    pub async fn collect(self) -> io::Result<Bytes> {
        if let Self::Bytes(bytes) = self {
            return Ok(bytes);
        }
        usize::try_from(self.len()).map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "blob length exceeds address space",
            )
        })?;
        let mut bytes = Vec::new();
        self.copy_to(&mut bytes).await?;
        Ok(bytes.into())
    }
}

impl From<Bytes> for BlobBody {
    fn from(bytes: Bytes) -> Self {
        Self::Bytes(bytes)
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;

    #[tokio::test]
    async fn bounds_reader_extent_and_rejects_short_bodies() {
        let body = BlobBody::Reader {
            length: 3,
            reader: Box::pin(std::io::Cursor::new(b"abc-extra")),
        };
        assert_eq!(body.collect().await.unwrap(), b"abc"[..]);
        let body = BlobBody::Reader {
            length: 4,
            reader: Box::pin(std::io::Cursor::new(b"abc")),
        };
        assert_eq!(
            body.collect().await.unwrap_err().kind(),
            io::ErrorKind::UnexpectedEof
        );
    }

    #[tokio::test]
    async fn empty_extent_never_polls_the_reader() {
        /// Fails if an empty transfer tries to probe the source.
        struct Unreadable;
        impl AsyncRead for Unreadable {
            fn poll_read(
                self: Pin<&mut Self>,
                _: &mut std::task::Context<'_>,
                _: &mut tokio::io::ReadBuf<'_>,
            ) -> std::task::Poll<io::Result<()>> {
                panic!("an empty body must not read its source");
            }
        }
        let body = BlobBody::Reader {
            length: 0,
            reader: Box::pin(Unreadable),
        };
        assert!(body.collect().await.unwrap().is_empty());
    }
}
