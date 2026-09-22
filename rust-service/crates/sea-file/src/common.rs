//! File-format and publication mechanisms shared by the execution policies.

#[path = "atomic_file.rs"]
pub(crate) mod atomic_file;
#[path = "journal.rs"]
pub(crate) mod journal;

use std::sync::Arc;
use tokio::sync::Semaphore;

use journal::FileStorageError;

/// Defines a concrete policy factory while sharing namespace and recovery mechanisms.
macro_rules! file_factory {
    ($name:ident, $durable:expr) => {
        /// Filesystem document factory with an independent backend execution policy.
        #[derive(Clone, Debug)]
        pub struct $name {
            /// Shared namespace, worker capacity, and lifecycle registrations.
            inner: crate::storage::Factory,
        }

        impl $name {
            /// Opens or creates a namespace synchronously; isolate this constructor on async callers.
            ///
            /// # Errors
            /// Returns namespace creation and required synchronization failures.
            pub fn open(
                root: impl AsRef<std::path::Path>,
            ) -> Result<Self, crate::FileStorageError> {
                Ok(Self {
                    inner: crate::storage::Factory::open(root, $durable)?,
                })
            }
        }

        #[async_trait::async_trait]
        impl sea_core::storage::SeaStorage for $name {
            type Error = crate::FileStorageError;
            type Blobs = crate::storage::FileBlobs;
            type Events = crate::storage::FileEvents;
            type Snapshots = crate::storage::FileSnapshots;
            fn durability(&self) -> sea_core::Durability {
                self.inner.durability()
            }
            async fn flush(&self) -> Result<(), Self::Error> {
                self.inner.flush().await
            }
            async fn shutdown(&self) -> Result<(), Self::Error> {
                self.inner.shutdown().await
            }
            async fn create_document(
                &self,
            ) -> Result<
                sea_core::storage::CreatedDocument<Self::Blobs, Self::Events, Self::Snapshots>,
                Self::Error,
            > {
                self.inner.create_document().await
            }
            async fn open_document(
                &self,
                id: &sea_core::storage::DocumentId,
            ) -> Result<
                Option<
                    sea_core::storage::StorageComponents<
                        Self::Blobs,
                        Self::Events,
                        Self::Snapshots,
                    >,
                >,
                Self::Error,
            > {
                self.inner.open_document(id).await
            }
        }
    };
}
pub(crate) use file_factory;

use futures_util::Stream;
use sea_core::{EventPosition, MonitoredStream, MonitoredStreamProgress, storage::ArchiveStream};
use std::{
    future::Future,
    pin::Pin,
    task::{Context, Poll},
};

/// Relays file-source wakeups across worker completion and changes of polling task.
#[derive(Default)]
struct ReadWake {
    /// Current async consumer, independent of the worker's captured context.
    consumer: futures_util::task::AtomicWaker,
    /// Records a mutation racing with an in-flight poll returning pending.
    notified: std::sync::atomic::AtomicBool,
}

impl futures_util::task::ArcWake for ReadWake {
    fn wake_by_ref(wake: &Arc<Self>) {
        wake.notified
            .store(true, std::sync::atomic::Ordering::Release);
        wake.consumer.wake();
    }
}

/// One bounded worker poll returns ownership of the lazy file stream and its result.
type PollJob<Item> = Pin<
    Box<
        dyn Future<
                Output = Result<
                    (
                        ArchiveStream<Item, EventPosition, FileStorageError>,
                        Poll<
                            Option<
                                Result<
                                    sea_core::MonitoredStreamItem<Item, EventPosition>,
                                    FileStorageError,
                                >,
                            >,
                        >,
                    ),
                    FileStorageError,
                >,
            > + Send,
    >,
>;

/// File stream whose polls execute outside the async executor, without background prefetch.
struct BlockingRead<Item> {
    /// Stable wake registration shared by all source polls.
    wake: Arc<ReadWake>,
    /// Source retained between polls, including unpolled streams.
    source: Option<ArchiveStream<Item, EventPosition, FileStorageError>>,
    /// At most one in-flight poll retains the opening after cancellation.
    job: Option<PollJob<Item>>,
    /// Last delivery-consistent source observation.
    progress: MonitoredStreamProgress<EventPosition>,
    /// Factory-wide worker budget.
    workers: Arc<Semaphore>,
}

/// Wraps a lazy file source without performing I/O until polled.
pub(crate) fn blocking_read<Item: Send + 'static>(
    source: ArchiveStream<Item, EventPosition, FileStorageError>,
    workers: Arc<Semaphore>,
) -> ArchiveStream<Item, EventPosition, FileStorageError> {
    let progress = source.progress();
    Box::pin(BlockingRead {
        source: Some(source),
        job: None,
        progress,
        workers,
        wake: Arc::default(),
    })
}

impl<Item: Send + 'static> Stream for BlockingRead<Item> {
    type Item = Result<sea_core::MonitoredStreamItem<Item, EventPosition>, FileStorageError>;

    fn poll_next(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let reader = self.get_mut();
        reader.wake.consumer.register(context.waker());
        if reader.job.is_none() {
            let Some(mut source) = reader.source.take() else {
                return Poll::Ready(None);
            };
            reader
                .wake
                .notified
                .store(false, std::sync::atomic::Ordering::Release);
            let waker = futures_util::task::waker(reader.wake.clone());
            reader.job = Some(Box::pin(blocking(reader.workers.clone(), move || {
                let result = source.as_mut().poll_next(&mut Context::from_waker(&waker));
                Ok((source, result))
            })));
        }
        match reader.job.as_mut().unwrap().as_mut().poll(context) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(result) => {
                reader.job = None;
                match result {
                    Ok((source, result)) => {
                        reader.progress = source.progress();
                        if !matches!(result, Poll::Ready(None)) {
                            reader.source = Some(source);
                        }
                        if result.is_pending()
                            && reader
                                .wake
                                .notified
                                .swap(false, std::sync::atomic::Ordering::AcqRel)
                        {
                            context.waker().wake_by_ref();
                        }
                        result
                    }
                    Err(error) => Poll::Ready(Some(Err(error))),
                }
            }
        }
    }
}

impl<Item: Send + 'static> MonitoredStream for BlockingRead<Item> {
    type Data = Item;
    type Position = EventPosition;
    type Error = FileStorageError;
    fn progress(&self) -> MonitoredStreamProgress<EventPosition> {
        self.progress.clone()
    }
}

/// Runs filesystem work with a factory-scoped concurrency budget retained through cancellation.
pub(crate) async fn blocking<Output: Send + 'static>(
    workers: Arc<Semaphore>,
    operation: impl FnOnce() -> Result<Output, FileStorageError> + Send + 'static,
) -> Result<Output, FileStorageError> {
    let permit = workers
        .acquire_owned()
        .await
        .map_err(|_| FileStorageError::Rejected("storage is shut down"))?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        operation()
    })
    .await
    .map_err(|_| FileStorageError::Ambiguous)?
}
