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
type Records = Vec<([u8; 33], bytes::Bytes)>;
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
            queue: Mutex::default(),
            changed: Notify::new(),
            workers,
        })
    }

    /// Reserves bounded capacity and publishes atomically before scheduling an idle drain.
    pub(crate) fn admit<Output>(
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

    /// Captures and waits for the accepted prefix, optionally stopping further admission.
    pub(crate) async fn flush(&self, close: bool) -> Result<(), FileStorageError> {
        let target = {
            let mut queue = self.queue.lock().unwrap();
            queue.closed |= close;
            queue.accepted
        };
        loop {
            let notified = self.changed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            {
                let queue = self.queue.lock().unwrap();
                if queue.failed {
                    return Err(FileStorageError::Ambiguous);
                }
                if queue.written >= target {
                    return Ok(());
                }
            }
            notified.await;
        }
    }
}
