//! Bounded process-local publication for the testing and demonstration backend.

use crate::journal::FileStorageError;
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
};
use tokio::sync::{Notify, Semaphore};

crate::common::file_factory!(FileStorage, false);

/// Maximum queued and in-flight encoded bytes per document.
pub(crate) const MAX_BYTES: usize = 16 * 1024 * 1024;
/// Maximum queued and in-flight requests per document.
const MAX_REQUESTS: usize = 128;
/// Addressed encoded records shared between admission, reads, and drain workers.
type Records = Vec<(crate::storage::Key, bytes::Bytes)>;
/// One ordered filesystem operation over a selected record group.
type WriteRecords = Box<dyn FnOnce(Records) -> Result<(), FileStorageError> + Send>;
/// One mutation retained until its write and cursor publication settle.
pub(crate) struct Task {
    /// Pending records shared with the read overlay.
    pub(crate) records: Records,
    /// Consecutive event groups can share one append and cursor publication.
    pub(crate) events: bool,
    /// Filesystem work for the selected records, or an independent checkpoint control.
    pub(crate) run: WriteRecords,
}

/// Accepted operation and its memory charge.
struct Job {
    /// Monotonic accepted-prefix identity, unrelated to event byte offsets.
    sequence: u64,
    /// Retained encoded bytes including framing and bounded metadata allowance.
    bytes: usize,
    /// Ordered filesystem operation.
    task: Task,
}

/// Memory-only admission and completion bookkeeping.
#[derive(Default)]
struct Queue {
    /// Work not yet taken by the active drain.
    jobs: VecDeque<Job>,
    /// Accepted prefix.
    accepted: u64,
    /// OS-written prefix.
    written: u64,
    /// Queued and in-flight byte count.
    bytes: usize,
    /// Queued and in-flight request count.
    requests: usize,
    /// Exactly one drain chain exists while work is present.
    active: bool,
    /// Orderly shutdown has stopped admission.
    closed: bool,
    /// A background operation failed; previously acknowledged work may be lost.
    failed: bool,
}

/// Short-lived drains sharing a factory-wide blocking budget.
pub(crate) struct Executor {
    /// FIFO admission without holding a worker while capacity is exhausted.
    admission: tokio::sync::Mutex<()>,
    /// Bounds callers retaining inputs while waiting for queue capacity.
    waiting: Arc<Semaphore>,
    /// Independent byte budget for waiting input and encoding buffers.
    waiting_bytes: Arc<Semaphore>,
    /// Admission lock never covers disk I/O.
    queue: Mutex<Queue>,
    /// Written-prefix and terminal-state notification.
    changed: Notify,
    /// Factory-scoped filesystem concurrency.
    workers: Arc<Semaphore>,
}

impl Executor {
    /// Creates an idle queue with no permanent task or thread.
    pub(crate) fn new(workers: Arc<Semaphore>) -> Arc<Self> {
        Arc::new(Self {
            admission: tokio::sync::Mutex::new(()),
            waiting: Arc::new(Semaphore::new(MAX_REQUESTS)),
            waiting_bytes: Arc::new(Semaphore::new(MAX_BYTES)),
            queue: Mutex::default(),
            changed: Notify::new(),
            workers,
        })
    }

    /// Reserves bounded capacity and publishes atomically before scheduling an idle drain.
    pub(crate) async fn admit<Output>(
        self: &Arc<Self>,
        bytes: usize,
        publish: impl FnOnce() -> Result<(Output, Task), FileStorageError>,
    ) -> Result<Output, FileStorageError> {
        if bytes > MAX_BYTES {
            return Err(FileStorageError::Rejected("mutation exceeds byte limit"));
        }
        let _waiting = self
            .waiting
            .clone()
            .try_acquire_owned()
            .map_err(|_| FileStorageError::Rejected("too many waiting mutations"))?;
        let _bytes = self
            .waiting_bytes
            .clone()
            .try_acquire_many_owned(u32::try_from(bytes).expect("bounded admission bytes fit u32"))
            .map_err(|_| FileStorageError::Rejected("waiting mutation byte limit exceeded"))?;
        let _order = self.admission.lock().await;
        loop {
            let notified = self.changed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            {
                let queue = self.queue.lock().map_err(|_| FileStorageError::Ambiguous)?;
                if queue.failed {
                    return Err(FileStorageError::Ambiguous);
                }
                if queue.closed {
                    return Err(FileStorageError::Rejected("storage is shut down"));
                }
                if queue.requests < MAX_REQUESTS && bytes <= MAX_BYTES.saturating_sub(queue.bytes) {
                    break;
                }
            }
            notified.await;
        }
        self.publish(bytes, publish)
    }

    /// Transfers ownership and publishes while capacity and lifecycle state are locked.
    fn publish<Output>(
        self: &Arc<Self>,
        bytes: usize,
        publish: impl FnOnce() -> Result<(Output, Task), FileStorageError>,
    ) -> Result<Output, FileStorageError> {
        let mut queue = self.queue.lock().map_err(|_| FileStorageError::Ambiguous)?;
        if queue.failed {
            return Err(FileStorageError::Ambiguous);
        }
        if queue.closed {
            return Err(FileStorageError::Rejected("storage is shut down"));
        }
        if queue.requests == MAX_REQUESTS || bytes > MAX_BYTES.saturating_sub(queue.bytes) {
            return Err(FileStorageError::Rejected(
                "buffered admission capacity exceeded",
            ));
        }
        let sequence = queue
            .accepted
            .checked_add(1)
            .ok_or(FileStorageError::Rejected("admission sequence exhausted"))?;
        let (output, task) = publish()?;
        queue.accepted = sequence;
        queue.bytes += bytes;
        queue.requests += 1;
        queue.jobs.push_back(Job {
            sequence,
            bytes,
            task,
        });
        if !queue.active {
            queue.active = true;
            let executor = self.clone();
            tokio::spawn(async move {
                executor.drain().await;
            });
        }
        Ok(output)
    }

    /// Writes bounded turns without keeping a blocking worker between turns or while idle.
    async fn drain(self: Arc<Self>) {
        loop {
            let executor = self.clone();
            let result =
                crate::common::blocking(self.workers.clone(), move || executor.turn()).await;
            if result.is_err() {
                let mut queue = self
                    .queue
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                queue.failed = true;
                queue.active = false;
                queue.jobs.clear();
                drop(queue);
                self.changed.notify_waiters();
            }
            if !matches!(result, Ok(true)) {
                return;
            }
            tokio::task::yield_now().await;
        }
    }

    /// Settles a limited backlog on one worker, stopping permanently after the first error.
    fn turn(&self) -> Result<bool, FileStorageError> {
        let mut bytes = 0;
        for _ in 0..64 {
            let (mut job, requests) = {
                let mut queue = self.queue.lock().unwrap();
                let Some(mut job) = queue.jobs.pop_front() else {
                    queue.active = false;
                    drop(queue);
                    self.changed.notify_waiters();
                    return Ok(false);
                };
                let mut requests = 1;
                while job.task.events
                    && requests < 64
                    && queue.jobs.front().is_some_and(|next| {
                        next.task.events && next.bytes + job.bytes <= 1024 * 1024
                    })
                {
                    let next = queue.jobs.pop_front().unwrap();
                    job.sequence = next.sequence;
                    job.bytes += next.bytes;
                    job.task.records.extend(next.task.records);
                    requests += 1;
                }
                (job, requests)
            };
            let result = (job.task.run)(std::mem::take(&mut job.task.records));
            bytes += job.bytes;
            let mut queue = self.queue.lock().unwrap();
            queue.bytes -= job.bytes;
            queue.requests -= requests;
            if result.is_err() {
                queue.failed = true;
                queue.active = false;
                queue.jobs.clear();
                queue.bytes = 0;
                queue.requests = 0;
            } else {
                queue.written = job.sequence;
            }
            drop(queue);
            self.changed.notify_waiters();
            result?;
            if bytes >= 1024 * 1024 {
                break;
            }
        }
        Ok(true)
    }

    /// Fences admission immediately, including callers already waiting for capacity.
    pub(crate) fn close(&self) {
        self.queue.lock().unwrap().closed = true;
        self.changed.notify_waiters();
    }

    /// Captures and waits for the accepted prefix, optionally stopping further admission.
    pub(crate) async fn flush(&self, close: bool) -> Result<(), FileStorageError> {
        let target = {
            let mut queue = self.queue.lock().unwrap();
            queue.closed |= close;
            queue.accepted
        };
        if close {
            self.changed.notify_waiters();
        }
        loop {
            let notified = self.changed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            {
                let queue = self.queue.lock().unwrap();
                if queue.failed {
                    return Err(FileStorageError::Ambiguous);
                }
                if queue.written >= target && (!close || !queue.active) {
                    return Ok(());
                }
            }
            notified.await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Provides an ordered control operation without filesystem dependencies.
    fn task(operation: impl FnOnce() -> Result<(), FileStorageError> + Send + 'static) -> Task {
        Task {
            records: Vec::new(),
            events: false,
            run: Box::new(move |_| operation()),
        }
    }

    #[tokio::test]
    async fn hot_document_yields_worker_capacity_to_cold_document() {
        let workers = Arc::new(Semaphore::new(1));
        let held = workers.clone().acquire_owned().await.unwrap();
        let hot = Executor::new(workers.clone());
        let cold = Executor::new(workers);
        let observations = Arc::new(Mutex::new(Vec::new()));
        for _ in 0..128 {
            let observed = observations.clone();
            hot.admit(32 * 1024, || {
                Ok((
                    (),
                    task(move || {
                        observed.lock().unwrap().push("hot");
                        Ok(())
                    }),
                ))
            })
            .await
            .unwrap();
        }
        tokio::task::yield_now().await;
        let observed = observations.clone();
        cold.admit(1, || {
            Ok((
                (),
                task(move || {
                    observed.lock().unwrap().push("cold");
                    Ok(())
                }),
            ))
        })
        .await
        .unwrap();
        tokio::task::yield_now().await;
        drop(held);
        hot.flush(false).await.unwrap();
        cold.flush(false).await.unwrap();
        let observations = observations.lock().unwrap();
        assert_eq!(observations.len(), 129);
        assert!(
            observations
                .iter()
                .position(|value| *value == "cold")
                .unwrap()
                <= 32
        );
    }

    #[tokio::test]
    async fn shutdown_wakes_bounded_waiters_before_worker_settlement() {
        let workers = Arc::new(Semaphore::new(1));
        let held = workers.clone().acquire_owned().await.unwrap();
        let executor = Executor::new(workers);
        executor
            .admit(MAX_BYTES, || Ok(((), task(|| Ok(())))))
            .await
            .unwrap();
        let mut waiting = (0..MAX_REQUESTS)
            .map(|_| Box::pin(executor.admit(1, || Ok(((), task(|| Ok(())))))))
            .collect::<Vec<_>>();
        for future in &mut waiting {
            assert!(futures_util::poll!(future).is_pending());
        }
        assert!(executor.admit::<()>(1, || unreachable!()).await.is_err());
        executor.close();
        for future in waiting {
            assert!(matches!(future.await, Err(FileStorageError::Rejected(_))));
        }
        let flush = executor.flush(true);
        tokio::pin!(flush);
        assert!(futures_util::poll!(&mut flush).is_pending());
        drop(held);
        flush.await.unwrap();
    }

    #[tokio::test]
    async fn bounded_waiting_cancellation_shutdown_and_failure_wake_admission() {
        for fail in [false, true] {
            let workers = Arc::new(Semaphore::new(1));
            let held = workers.clone().acquire_owned().await.unwrap();
            let executor = Executor::new(workers);
            executor
                .admit(MAX_BYTES, || {
                    Ok((
                        (),
                        task(move || {
                            if fail {
                                Err(FileStorageError::Ambiguous)
                            } else {
                                Ok(())
                            }
                        }),
                    ))
                })
                .await
                .unwrap();
            assert!(
                executor
                    .admit::<()>(MAX_BYTES + 1, || unreachable!())
                    .await
                    .is_err()
            );
            {
                let waiting = executor.admit(MAX_BYTES, || Ok(((), task(|| Ok(())))));
                tokio::pin!(waiting);
                assert!(futures_util::poll!(&mut waiting).is_pending());
                assert!(executor.admit::<()>(1, || unreachable!()).await.is_err());
            }
            assert_eq!(executor.queue.lock().unwrap().accepted, 1);
            let waiting = executor.admit(1, || Ok(((), task(|| Ok(())))));
            tokio::pin!(waiting);
            assert!(futures_util::poll!(&mut waiting).is_pending());
            drop(held);
            let result = tokio::time::timeout(std::time::Duration::from_secs(5), &mut waiting)
                .await
                .unwrap();
            assert_eq!(result.is_err(), fail);
            assert_eq!(executor.flush(true).await.is_err(), fail);
            assert!(executor.admit::<()>(1, || unreachable!()).await.is_err());
        }
    }
}
