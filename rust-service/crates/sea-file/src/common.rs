//! File-format and publication mechanisms shared by the execution policies.

#[path = "atomic_file.rs"]
pub(crate) mod atomic_file;
#[path = "journal.rs"]
pub(crate) mod journal;

use std::sync::Arc;
use tokio::sync::Semaphore;

use journal::FileStorageError;

/// Retained preprocessing capacity, shared with a worker if validation outlives its caller.
pub(crate) type Preparation = Arc<(
    tokio::sync::OwnedSemaphorePermit,
    tokio::sync::OwnedSemaphorePermit,
)>;

/// Bounds content inputs and encodings before they reach a backend mutation queue.
pub(crate) struct PreparationBudget {
    /// Maximum concurrent content preparations per opening.
    requests: Arc<Semaphore>,
    /// Conservative input, encoding, and metadata charge.
    bytes: Arc<Semaphore>,
}

impl PreparationBudget {
    /// Creates a separate bounded staging budget without worker ownership.
    pub(crate) fn new() -> Self {
        Self {
            requests: Arc::new(Semaphore::new(128)),
            bytes: Arc::new(Semaphore::new(16 * 1024 * 1024)),
        }
    }

    /// Rejects excess preprocessing before allocating encodings or waiting for metadata reads.
    pub(crate) fn reserve(&self, bytes: usize) -> Result<Preparation, FileStorageError> {
        let bytes = u32::try_from(bytes)
            .map_err(|_| FileStorageError::Rejected("content preparation exceeds byte limit"))?;
        let request = self
            .requests
            .clone()
            .try_acquire_owned()
            .map_err(|_| FileStorageError::Rejected("content preparation queue is full"))?;
        let bytes = self
            .bytes
            .clone()
            .try_acquire_many_owned(bytes)
            .map_err(|_| FileStorageError::Rejected("content preparation byte budget is full"))?;
        Ok(Arc::new((request, bytes)))
    }
}

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
            /// Uses 32 concurrent filesystem workers for durable storage and four for buffered storage.
            /// Use [`Self::open_with_worker_limit`] to tune the shared filesystem concurrency budget.
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

            /// Opens a namespace with a shared limit on concurrent blocking filesystem operations.
            ///
            /// All documents, reads, mutations, recovery, and factory clones share this budget.
            /// Waiting operations do not occupy blocking workers; in-flight work retains its permit
            /// through cancellation. The Tokio runtime can impose a lower blocking-thread limit.
            /// Construction is synchronous and requires caller-provided execution isolation.
            ///
            /// # Errors
            /// Returns an error for zero or unsupported worker limits, before filesystem changes,
            /// or for namespace creation and required synchronization failures.
            pub fn open_with_worker_limit(
                root: impl AsRef<std::path::Path>,
                worker_limit: usize,
            ) -> Result<Self, crate::FileStorageError> {
                Ok(Self {
                    inner: crate::storage::Factory::open_with_worker_limit(
                        root,
                        $durable,
                        worker_limit,
                    )?,
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
    /// Completion stops worker dispatch without releasing the source's opening.
    finished: bool,
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
        finished: false,
        progress,
        workers,
        wake: Arc::default(),
    })
}

impl<Item: Send + 'static> Stream for BlockingRead<Item> {
    type Item = Result<sea_core::MonitoredStreamItem<Item, EventPosition>, FileStorageError>;

    fn poll_next(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let reader = self.get_mut();
        if reader.finished {
            return Poll::Ready(None);
        }
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
                        reader.finished = matches!(result, Poll::Ready(None));
                        reader.source = Some(source);
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

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;

    /// Signals readiness while a blocking poll is still returning pending.
    struct WakeDuringPoll {
        /// The first poll races its own wake; the next poll delivers progress.
        pending: bool,
    }

    impl Stream for WakeDuringPoll {
        type Item = Result<sea_core::MonitoredStreamItem<(), EventPosition>, FileStorageError>;

        fn poll_next(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Option<Self::Item>> {
            let source = self.get_mut();
            if source.pending {
                source.pending = false;
                context.waker().wake_by_ref();
                Poll::Pending
            } else {
                Poll::Ready(Some(Ok(sea_core::MonitoredStreamItem::Progress(
                    source.progress(),
                ))))
            }
        }
    }

    impl MonitoredStream for WakeDuringPoll {
        type Data = ();
        type Position = EventPosition;
        type Error = FileStorageError;

        fn progress(&self) -> MonitoredStreamProgress<EventPosition> {
            MonitoredStreamProgress {
                previous: None,
                latest_known: None,
                status: sea_core::MonitoredStreamStatus::AwaitingNewItems,
            }
        }
    }

    #[tokio::test]
    async fn blocking_read_preserves_a_wake_racing_with_pending_completion() {
        let mut reader = blocking_read(
            Box::pin(WakeDuringPoll { pending: true }),
            Arc::new(Semaphore::new(1)),
        );
        let next = tokio::time::timeout(std::time::Duration::from_secs(1), reader.next())
            .await
            .expect("the pending worker's wake must schedule another source poll");
        assert!(matches!(
            next,
            Some(Ok(sea_core::MonitoredStreamItem::Progress(_)))
        ));
    }

    #[tokio::test]
    async fn blocking_capacity_is_retained_until_cancelled_callers_work_settles() {
        let workers = Arc::new(Semaphore::new(1));
        let held = workers.clone().acquire_owned().await.unwrap();
        {
            let waiting = blocking(workers.clone(), || -> Result<(), FileStorageError> {
                panic!("cancelled waiter must not run")
            });
            tokio::pin!(waiting);
            assert!(futures_util::poll!(&mut waiting).is_pending());
        }
        drop(held);
        let (entered, entry) = tokio::sync::oneshot::channel();
        let (release, released) = std::sync::mpsc::channel();
        let caller = tokio::spawn(blocking(workers.clone(), move || {
            entered.send(()).unwrap();
            released
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap();
            Ok(())
        }));
        entry.await.unwrap();
        caller.abort();
        assert!(caller.await.unwrap_err().is_cancelled());
        assert_eq!(workers.available_permits(), 0);
        release.send(()).unwrap();
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            blocking(workers.clone(), || Ok(())),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(workers.available_permits(), 1);
    }

    #[test]
    fn preparation_limits_reject_excess_and_retain_worker_owned_charges() {
        let budget = PreparationBudget::new();
        let retained = budget.reserve(16 * 1024 * 1024).unwrap();
        assert!(matches!(
            budget.reserve(1),
            Err(FileStorageError::Rejected(_))
        ));
        let worker = retained.clone();
        drop(retained);
        assert!(budget.reserve(1).is_err());
        drop(worker);
        assert_eq!(budget.bytes.available_permits(), 16 * 1024 * 1024);
        assert!(budget.reserve(16 * 1024 * 1024 + 1).is_err());
        assert!(budget.reserve(usize::MAX).is_err());
        let requests = (0..128)
            .map(|_| budget.reserve(0).unwrap())
            .collect::<Vec<_>>();
        assert!(budget.reserve(0).is_err());
        drop(requests);
        assert_eq!(budget.requests.available_permits(), 128);
        assert!(budget.reserve(1).is_ok());
    }
}
