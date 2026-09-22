//! Ordered, bounded execution for synchronized file storage.

use std::sync::Arc;
use tokio::sync::{Mutex, Notify, OwnedSemaphorePermit, Semaphore};

use crate::journal::FileStorageError;

crate::common::file_factory!(DurableStorage, true);

/// Document-local admission order and retained mutation budgets.
pub(crate) struct Executor {
    /// Async ordering authority; no worker waits for this mutex.
    order: Arc<Mutex<()>>,
    /// Bounds admitted requests, including work waiting for a worker.
    requests: Arc<Semaphore>,
    /// Bounds retained mutation input bytes, including in-flight work.
    bytes: Arc<Semaphore>,
    /// Factory-wide blocking concurrency shared with reads and recovery.
    workers: Arc<Semaphore>,
    /// Completion signal also emitted when a waiting caller cancels.
    changed: Arc<Notify>,
}

/// Retains admission through cancellation and notifies after returning capacity.
struct Admission {
    /// Request permit released before notification.
    request: Option<OwnedSemaphorePermit>,
    /// Retained byte budget.
    bytes: Option<OwnedSemaphorePermit>,
    /// Shutdown waiters.
    changed: Arc<Notify>,
}

impl Drop for Admission {
    fn drop(&mut self) {
        self.bytes.take();
        self.request.take();
        self.changed.notify_waiters();
    }
}

/// Maximum retained mutation bytes in one document opening.
pub(crate) const MAX_BYTES: usize = 16 * 1024 * 1024;

impl Executor {
    /// Creates an idle executor without starting a permanent worker.
    pub(crate) fn new(workers: Arc<Semaphore>) -> Self {
        Self {
            order: Arc::new(Mutex::new(())),
            requests: Arc::new(Semaphore::new(128)),
            bytes: Arc::new(Semaphore::new(MAX_BYTES)),
            workers,
            changed: Arc::new(Notify::new()),
        }
    }

    /// Rejects excess admission before retaining inputs and preserves admitted order through cancellation.
    pub(crate) async fn run<Output: Send + 'static>(
        &self,
        bytes: usize,
        operation: impl FnOnce() -> Result<Output, FileStorageError> + Send + 'static,
    ) -> Result<Output, FileStorageError> {
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
        let admission = Admission {
            request: Some(request),
            bytes: Some(bytes),
            changed: self.changed.clone(),
        };
        let order = self.order.clone().lock_owned().await;
        crate::common::blocking(self.workers.clone(), move || {
            let (_admission, _order) = (admission, order);
            operation()
        })
        .await
    }

    /// Waits for retained admissions, closing admission first for shutdown.
    pub(crate) async fn flush(&self, close: bool) {
        if close {
            self.requests.close();
        }
        loop {
            let notified = self.changed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if self.requests.available_permits() == 128 {
                return;
            }
            notified.await;
        }
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
