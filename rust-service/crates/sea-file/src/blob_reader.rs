//! Bounded asynchronous reads that share the factory's blocking-operation budget.

use std::{
    future::Future,
    io::{self, Read},
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
};

use bytes::Bytes;
use tokio::{io::AsyncRead, sync::Semaphore};

/// Maximum allocation for one dispatched body read, independent of the blob's length.
const READ_BYTES: usize = 64 * 1024;

/// One operation retains source ownership while waiting for admission or completing blocking work.
type ReadJob<Source> = Pin<Box<dyn Future<Output = io::Result<(Source, Bytes)>> + Send + 'static>>;

/// Independent source cursor with at most one outstanding bounded read.
///
/// The source must retain any backend lease it needs. A dispatched worker owns that source and its
/// permit through completion, even if this reader is dropped. Buffered bytes retain no permit.
pub(crate) struct BlobFileReader<Source> {
    /// Source available between blocking operations.
    source: Option<Source>,
    /// Shared factory budget, never reserved merely for owning a reader.
    workers: Arc<Semaphore>,
    /// Captured extent not yet read from the source, excluding buffered bytes.
    remaining: u64,
    /// Unconsumed data from the most recent read.
    buffered: Bytes,
    /// Pending admission or dispatched blocking work.
    job: Option<ReadJob<Source>>,
    /// Prevents another read after a terminal error.
    failed: bool,
}

impl<Source: Read + Send + 'static> BlobFileReader<Source> {
    /// Takes an already-open independent cursor without reading or reserving worker capacity.
    pub(crate) fn new(source: Source, workers: Arc<Semaphore>, length: u64) -> Self {
        Self {
            source: Some(source),
            workers,
            remaining: length,
            buffered: Bytes::new(),
            job: None,
            failed: false,
        }
    }
}

impl<Source: Read + Send + Unpin + 'static> AsyncRead for BlobFileReader<Source> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        output: &mut tokio::io::ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        if output.remaining() == 0 {
            return Poll::Ready(Ok(()));
        }
        if self.failed {
            return Poll::Ready(Err(io::Error::other("blob reader has failed")));
        }
        if self.buffered.is_empty() {
            if self.remaining == 0 {
                return Poll::Ready(Ok(()));
            }
            if self.job.is_none() {
                let mut source = self.source.take().expect("idle reader owns its source");
                let workers = Arc::clone(&self.workers);
                let size = usize::try_from(self.remaining.min(READ_BYTES as u64))
                    .expect("bounded read fits usize");
                self.job = Some(Box::pin(async move {
                    crate::common::blocking(workers, move || {
                        let mut bytes = vec![0; size];
                        let count = loop {
                            match source.read(&mut bytes) {
                                Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
                                result => break result?,
                            }
                        };
                        bytes.truncate(count);
                        Ok((source, Bytes::from(bytes)))
                    })
                    .await
                    .map_err(|error| match error {
                        crate::journal::FileStorageError::Io(error) => error,
                        other => io::Error::other(other),
                    })
                }));
            }
            match self.job.as_mut().expect("active read").as_mut().poll(cx) {
                Poll::Pending => return Poll::Pending,
                Poll::Ready(result) => {
                    self.job = None;
                    match result {
                        Ok((source, bytes)) => {
                            self.source = Some(source);
                            self.remaining -= bytes.len() as u64;
                            self.buffered = bytes;
                        }
                        Err(error) => {
                            self.failed = true;
                            return Poll::Ready(Err(error));
                        }
                    }
                }
            }
        }
        let count = output.remaining().min(self.buffered.len());
        output.put_slice(&self.buffered.split_to(count));
        Poll::Ready(Ok(()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::io::AsyncReadExt as _;

    #[tokio::test]
    async fn interrupted_reads_retry_but_real_errors_release_resources() {
        /// Injects one syscall failure before an otherwise readable payload.
        struct FaultOnce {
            /// Error consumed by the first read.
            error: Option<io::ErrorKind>,
            /// Remaining successful bytes.
            bytes: io::Cursor<&'static [u8]>,
            /// Tracks ownership after failure or completion.
            dropped: Arc<AtomicUsize>,
        }
        impl Read for FaultOnce {
            fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
                if let Some(error) = self.error.take() {
                    return Err(error.into());
                }
                Read::read(&mut self.bytes, output)
            }
        }
        impl Drop for FaultOnce {
            fn drop(&mut self) {
                self.dropped.fetch_add(1, Ordering::SeqCst);
            }
        }
        for error in [io::ErrorKind::Interrupted, io::ErrorKind::PermissionDenied] {
            let workers = Arc::new(Semaphore::new(1));
            let dropped = Arc::new(AtomicUsize::new(0));
            let body = sea_core::BlobBody::Reader {
                length: 4,
                reader: Box::pin(BlobFileReader::new(
                    FaultOnce {
                        error: Some(error),
                        bytes: io::Cursor::new(b"data"),
                        dropped: dropped.clone(),
                    },
                    workers.clone(),
                    4,
                )),
            };
            let result = body.collect().await;
            if error == io::ErrorKind::Interrupted {
                assert_eq!(result.unwrap(), b"data"[..]);
            } else {
                assert_eq!(result.unwrap_err().kind(), error);
            }
            assert_eq!(workers.available_permits(), 1);
            assert_eq!(dropped.load(Ordering::SeqCst), 1);
        }
    }

    /// Counts actual blocking reads independently of polls and admission waits.
    struct Counted {
        /// Observed operation count shared with the test.
        reads: Arc<AtomicUsize>,
        /// Counts actual source bytes, including bounded read-ahead.
        bytes: Arc<AtomicUsize>,
        /// Optional gate keeps an admitted operation alive after cancellation.
        gate: Option<std::sync::mpsc::Receiver<()>>,
        /// Source-drop observation includes work that outlives the async caller.
        dropped: Arc<AtomicUsize>,
    }

    impl Read for Counted {
        fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
            self.reads.fetch_add(1, Ordering::SeqCst);
            self.bytes.fetch_add(bytes.len(), Ordering::SeqCst);
            if let Some(gate) = self.gate.take() {
                gate.recv().map_err(io::Error::other)?;
            }
            bytes.fill(7);
            Ok(bytes.len())
        }
    }

    impl Drop for Counted {
        fn drop(&mut self) {
            self.dropped.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[tokio::test]
    async fn cancellation_before_admission_never_dispatches() {
        let workers = Arc::new(Semaphore::new(1));
        let permit = workers.clone().acquire_owned().await.unwrap();
        let reads = Arc::new(AtomicUsize::new(0));
        let dropped = Arc::new(AtomicUsize::new(0));
        let mut reader = BlobFileReader::new(
            Counted {
                reads: reads.clone(),
                bytes: Arc::default(),
                gate: None,
                dropped: dropped.clone(),
            },
            workers.clone(),
            1,
        );
        let mut bytes = [0; 1];
        let mut read = Box::pin(reader.read(&mut bytes));
        assert!(futures_util::poll!(&mut read).is_pending());
        drop(read);
        drop(reader);
        drop(permit);
        assert_eq!(reads.load(Ordering::SeqCst), 0);
        assert_eq!(dropped.load(Ordering::SeqCst), 1);
        assert_eq!(workers.available_permits(), 1);
    }

    #[tokio::test]
    async fn dispatched_read_retains_permit_and_source_until_completion() {
        let workers = Arc::new(Semaphore::new(1));
        let reads = Arc::new(AtomicUsize::new(0));
        let dropped = Arc::new(AtomicUsize::new(0));
        let (release, gate) = std::sync::mpsc::channel();
        let mut reader = BlobFileReader::new(
            Counted {
                reads: reads.clone(),
                bytes: Arc::default(),
                gate: Some(gate),
                dropped: dropped.clone(),
            },
            workers.clone(),
            1,
        );
        let mut bytes = [0; 1];
        let mut read = Box::pin(reader.read(&mut bytes));
        assert!(futures_util::poll!(&mut read).is_pending());
        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            while reads.load(Ordering::SeqCst) == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        drop(read);
        drop(reader);
        assert_eq!(workers.available_permits(), 0);
        assert_eq!(dropped.load(Ordering::SeqCst), 0);
        release.send(()).unwrap();
        let permit = workers.clone().acquire_owned().await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            while dropped.load(Ordering::SeqCst) == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        drop(permit);
    }

    #[tokio::test]
    async fn opened_file_transfers_only_its_declared_payload() {
        let path = std::env::temp_dir().join(format!("sea-blob-reader-{}", std::process::id()));
        std::fs::write(&path, b"payload-trailing").unwrap();
        let body = sea_core::BlobBody::Reader {
            length: 7,
            reader: Box::pin(BlobFileReader::new(
                std::fs::File::open(&path).unwrap(),
                Arc::new(Semaphore::new(1)),
                7,
            )),
        };
        assert_eq!(body.collect().await.unwrap(), b"payload"[..]);
        std::fs::remove_file(path).unwrap();
    }

    #[tokio::test]
    async fn small_consumer_reads_share_bounded_reads_without_crossing_the_extent() {
        let reads = Arc::new(AtomicUsize::new(0));
        let bytes = Arc::new(AtomicUsize::new(0));
        let length = 64 * 1024 + 7;
        let mut reader = BlobFileReader::new(
            Counted {
                reads: reads.clone(),
                bytes: bytes.clone(),
                gate: None,
                dropped: Arc::default(),
            },
            Arc::new(Semaphore::new(1)),
            length,
        );
        for _ in 0..3 {
            let mut byte = [0];
            reader.read_exact(&mut byte).await.unwrap();
            assert_eq!(byte, [7]);
        }
        assert_eq!(reads.load(Ordering::SeqCst), 1);
        assert_eq!(bytes.load(Ordering::SeqCst), 64 * 1024);
        let mut rest = Vec::new();
        reader.read_to_end(&mut rest).await.unwrap();
        assert_eq!(rest, vec![7; usize::try_from(length).unwrap() - 3]);
        assert_eq!(reads.load(Ordering::SeqCst), 2);
        assert_eq!(
            bytes.load(Ordering::SeqCst),
            usize::try_from(length).unwrap()
        );
    }

    #[tokio::test]
    async fn stalled_writer_holds_no_worker_permit_or_unbounded_read_ahead() {
        /// Records the backpressure boundary without relying on elapsed time.
        struct BlockedWriter(Arc<AtomicUsize>);

        impl tokio::io::AsyncWrite for BlockedWriter {
            fn poll_write(
                self: Pin<&mut Self>,
                _: &mut Context<'_>,
                _: &[u8],
            ) -> Poll<io::Result<usize>> {
                self.0.fetch_add(1, Ordering::SeqCst);
                Poll::Pending
            }

            fn poll_flush(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<io::Result<()>> {
                Poll::Ready(Ok(()))
            }

            fn poll_shutdown(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<io::Result<()>> {
                Poll::Ready(Ok(()))
            }
        }

        let workers = Arc::new(Semaphore::new(1));
        let reads = Arc::new(AtomicUsize::new(0));
        let bytes = Arc::new(AtomicUsize::new(0));
        let reader = BlobFileReader::new(
            Counted {
                reads: reads.clone(),
                bytes: bytes.clone(),
                gate: None,
                dropped: Arc::new(AtomicUsize::new(0)),
            },
            workers.clone(),
            16 * 1024 * 1024,
        );
        let body = sea_core::BlobBody::Reader {
            length: 16 * 1024 * 1024,
            reader: Box::pin(reader),
        };
        let backpressure = Arc::new(AtomicUsize::new(0));
        let mut writer = BlockedWriter(backpressure.clone());
        let copying = tokio::spawn(async move { body.copy_to(&mut writer).await });
        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            while backpressure.load(Ordering::SeqCst) == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        crate::common::blocking(workers.clone(), || Ok(()))
            .await
            .unwrap();
        assert_eq!(reads.load(Ordering::SeqCst), 1);
        assert!(bytes.load(Ordering::SeqCst) <= 64 * 1024);
        copying.abort();
        assert!(copying.await.unwrap_err().is_cancelled());
        let permit = workers.acquire_owned().await.unwrap();
        drop(permit);
    }
}
