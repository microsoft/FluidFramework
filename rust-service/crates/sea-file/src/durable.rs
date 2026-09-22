//! Ordered, bounded execution for synchronized file storage.

use futures_util::FutureExt;
use std::sync::Arc;
use tokio::sync::{Mutex, OwnedMutexGuard, Semaphore};

use crate::journal::FileStorageError;

crate::common::file_factory!(DurableStorage, true);

/// Document-local admission order and retained mutation budgets.
pub(crate) struct Executor {
    /// Serializes capacity reservation with FIFO registration and flush barriers.
    admission: std::sync::Mutex<()>,
    /// Async ordering authority; no worker waits for this mutex.
    order: Arc<Mutex<()>>,
    /// Bounds admitted requests, including work waiting for a worker.
    requests: Arc<Semaphore>,
    /// Bounds retained mutation input bytes, including in-flight work.
    bytes: Arc<Semaphore>,
    /// Factory-wide blocking concurrency shared with reads and recovery.
    workers: Arc<Semaphore>,
}

/// Maximum retained mutation bytes in one document opening.
pub(crate) const MAX_BYTES: usize = 16 * 1024 * 1024;

impl Executor {
    /// Creates an idle executor without starting a permanent worker.
    pub(crate) fn new(workers: Arc<Semaphore>) -> Self {
        Self {
            admission: std::sync::Mutex::new(()),
            order: Arc::new(Mutex::new(())),
            requests: Arc::new(Semaphore::new(128)),
            bytes: Arc::new(Semaphore::new(MAX_BYTES)),
            workers,
        }
    }

    /// Rejects excess admission before retaining inputs and preserves admitted order through cancellation.
    pub(crate) async fn run<Output: Send + 'static>(
        &self,
        bytes: usize,
        operation: impl FnOnce() -> Result<Output, FileStorageError> + Send + 'static,
    ) -> Result<Output, FileStorageError> {
        let task = self.enqueue(bytes, operation)?;
        task.await.map_err(|_| FileStorageError::Ambiguous)?
    }

    /// Reserves and registers work without an intervening cancellation or scheduling point.
    fn enqueue<Output: Send + 'static>(
        &self,
        bytes: usize,
        operation: impl FnOnce() -> Result<Output, FileStorageError> + Send + 'static,
    ) -> Result<tokio::task::JoinHandle<Result<Output, FileStorageError>>, FileStorageError> {
        let _registration = self
            .admission
            .lock()
            .map_err(|_| FileStorageError::Ambiguous)?;
        if bytes > MAX_BYTES {
            return Err(FileStorageError::Rejected("mutation exceeds byte limit"));
        }
        let request = self
            .requests
            .clone()
            .try_acquire_owned()
            .map_err(|_| FileStorageError::Rejected("mutation queue is full"))?;
        let bytes = self
            .bytes
            .clone()
            .try_acquire_many_owned(u32::try_from(bytes).expect("bounded mutation bytes fit u32"))
            .map_err(|_| FileStorageError::Rejected("mutation byte budget is full"))?;
        let order = self.register_order();
        let workers = self.workers.clone();
        Ok(tokio::spawn(async move {
            let _order = order.await;
            crate::common::blocking(workers, move || {
                let (_request, _bytes) = (request, bytes);
                operation()
            })
            .await
        }))
    }

    /// Registers FIFO order synchronously, even when the caller exhausted Tokio's cooperative budget.
    fn register_order(&self) -> impl Future<Output = OwnedMutexGuard<()>> + Send + 'static {
        let mut order = Box::pin(self.order.clone().lock_owned());
        let acquired = tokio::task::unconstrained(order.as_mut()).now_or_never();
        async move {
            match acquired {
                Some(guard) => guard,
                None => order.await,
            }
        }
    }

    /// Fences admission without waiting for a worker or earlier mutations.
    pub(crate) fn close(&self) {
        let _registration = self.admission.lock().unwrap();
        self.requests.close();
    }

    /// Waits for the captured admission prefix, closing admission first for shutdown.
    pub(crate) async fn flush(&self, close: bool) {
        let barrier = {
            let _registration = self.admission.lock().unwrap();
            if close {
                self.requests.close();
            }
            self.register_order()
        };
        drop(barrier.await);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;
    use futures_util::{FutureExt, StreamExt};
    use sea_core::{
        Durability, MonitoredStreamItem,
        storage::{BlobStore, SeaStorage, Snapshot, StorageHandle},
    };
    use std::{
        fs,
        io::Write,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };

    /// Unique local namespace for concurrently executing tests.
    static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

    #[tokio::test]
    async fn queued_document_mutations_leave_workers_for_reads_and_other_documents() {
        let workers = Arc::new(Semaphore::new(1));
        let hot = Executor::new(workers.clone());
        let cold = Executor::new(workers.clone());
        let held_order = hot.order.clone().lock_owned().await;
        let completed = Arc::new(AtomicU64::new(0));
        let mut mutations = Vec::new();
        for _ in 0..128 {
            let completed = completed.clone();
            mutations.push(
                hot.enqueue(1, move || {
                    completed.fetch_add(1, Ordering::Relaxed);
                    Ok(())
                })
                .unwrap(),
            );
        }
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            tokio::task::yield_now().await;
            crate::common::blocking(workers.clone(), || Ok(()))
                .await
                .unwrap();
            cold.run(1, || Ok(())).await.unwrap();
            assert_eq!(completed.load(Ordering::Relaxed), 0);
            drop(held_order);
            for mutation in mutations {
                mutation.await.unwrap().unwrap();
            }
        })
        .await
        .expect("queued document order must not occupy filesystem workers");
        assert_eq!(completed.load(Ordering::Relaxed), 128);
        assert_eq!(workers.available_permits(), 1);
    }

    #[tokio::test]
    async fn flush_captures_prefix_before_later_admission() {
        let executor = Executor::new(Arc::new(Semaphore::new(1)));
        let held = executor.order.clone().lock_owned().await;
        let flush = executor.flush(false);
        tokio::pin!(flush);
        assert!(futures_util::poll!(&mut flush).is_pending());
        let (release, wait) = std::sync::mpsc::channel();
        let mutation = executor.run(1, move || {
            wait.recv_timeout(std::time::Duration::from_secs(5))
                .unwrap();
            Ok(())
        });
        tokio::pin!(mutation);
        assert!(futures_util::poll!(&mut mutation).is_pending());
        drop(held);
        tokio::time::timeout(std::time::Duration::from_secs(1), flush)
            .await
            .unwrap();
        release.send(()).unwrap();
        mutation.await.unwrap();
    }

    #[tokio::test]
    async fn accepted_waiter_survives_cancellation_and_shutdown_drains_it() {
        let executor = Executor::new(Arc::new(Semaphore::new(1)));
        let held = executor.order.clone().lock_owned().await;
        let completed = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let observed = completed.clone();
        {
            let mutation = executor.run(1, move || {
                observed.store(true, Ordering::Release);
                Ok(())
            });
            tokio::pin!(mutation);
            assert!(futures_util::poll!(&mut mutation).is_pending());
        }
        let shutdown = executor.flush(true);
        tokio::pin!(shutdown);
        assert!(futures_util::poll!(&mut shutdown).is_pending());
        assert!(executor.run(1, || Ok(())).await.is_err());
        drop(held);
        tokio::time::timeout(std::time::Duration::from_secs(5), shutdown)
            .await
            .unwrap();
        assert!(completed.load(Ordering::Acquire));
    }
    /// Allocates a fresh path without any old-format fixtures.
    fn root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "sea-next-durable-{}-{}",
            std::process::id(),
            NEXT_ROOT.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[tokio::test]
    async fn durable_conformance() {
        let root = root();
        let storage = DurableStorage::open(&root).unwrap();
        assert_eq!(storage.durability(), Durability::Durable);
        sea_conformance::run_view_conformance(&storage).await;
        sea_conformance::run_snapshot_archive_conformance(&storage).await;
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn recovery_preserves_dependencies_discards_torn_tail_and_rejects_corruption() {
        let root = root();
        let storage = DurableStorage::open(&root).unwrap();
        let (id, view) = storage.create_view().await.unwrap();
        let blob = view
            .blobs()
            .put_blob(Bytes::from_static(b"state"))
            .await
            .unwrap();
        let event = view
            .append(Bytes::from_static(b"event"), Some(&blob))
            .await
            .unwrap();
        view.publish_snapshot(&Snapshot {
            root: blob.clone(),
            at_event: event.clone(),
        })
        .await
        .unwrap();
        drop(view);
        let path = root.join("0000000000000001.sea");
        let committed = fs::read(&path).unwrap();
        fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(b"partial next frame")
            .unwrap();
        let reopened = storage.open_view(&id).await.unwrap().unwrap();
        assert_eq!(reopened.head().await.unwrap(), Some(event.id()));
        assert_eq!(
            reopened
                .get_snapshot(sea_core::storage::LoadStart::LatestSnapshot)
                .await
                .unwrap()
                .unwrap()
                .root
                .id(),
            blob.id()
        );
        assert_eq!(fs::read(&path).unwrap(), committed);
        drop(reopened);
        let mut corrupt = committed;
        corrupt[56] ^= 1;
        fs::write(&path, corrupt).unwrap();
        assert!(matches!(
            storage.open_view(&id).await,
            Err(FileStorageError::Corrupt(_))
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn independent_factories_and_live_streams_share_exclusive_ownership() {
        let root = root();
        let storage = DurableStorage::open(&root).unwrap();
        let other = DurableStorage::open(&root).unwrap();
        let (id, view) = storage.create_view().await.unwrap();
        let mut live = view.read(None, None);
        assert!(matches!(
            live.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        assert!(live.next().now_or_never().is_none());
        view.append(Bytes::new(), None).await.unwrap();
        assert!(matches!(
            live.next().await,
            Some(Ok(MonitoredStreamItem::Item(_)))
        ));
        drop(view);
        assert!(matches!(
            other.open_view(&id).await,
            Err(FileStorageError::Busy)
        ));
        drop(live);
        assert!(other.open_view(&id).await.unwrap().is_some());
        fs::remove_dir_all(root).unwrap();
    }
}
