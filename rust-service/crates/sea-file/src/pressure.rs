//! Advisory observations of one durable document's existing inbound budgets.

use std::sync::{
    Arc,
    atomic::{AtomicU8, Ordering},
};
use tokio::sync::{Notify, OwnedSemaphorePermit, Semaphore};

use crate::FileStorageError;

/// Fixed request limit for each independent inbound budget.
const MAX_REQUESTS: usize = 128;
/// Fixed conservative byte-charge limit for each independent inbound budget.
pub(crate) const MAX_BYTES: usize = 16 * 1024 * 1024;

/// An advisory sample of one budget, not a reservation or exact backing-memory count.
///
/// Requests and bytes are sampled independently and may change immediately.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BudgetPressure {
    /// Retained requests, including work whose caller was cancelled.
    pub requests: usize,
    /// Conservative charged input/encoding/metadata bytes.
    pub bytes: usize,
    /// Fixed maximum number of retained requests.
    pub request_limit: usize,
    /// Fixed maximum byte charge.
    pub byte_limit: usize,
}

/// Separate stages may overlap; their charges must not be treated as unique backing bytes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct WritePressure {
    /// Content preparation before encoding or metadata waits.
    pub preparation: BudgetPressure,
    /// Accepted mutation work through blocking completion, not result consumption.
    pub mutations: BudgetPressure,
}

/// A cloneable observation handle for one durable document opening.
///
/// Does not retain the document, OS lock, or a worker. Old handles become terminal on
/// failure, shutdown, or opening drop and never refer to a replacement opening.
/// Observations exclude reads, worker utilization, sequencer queues, returned results,
/// OS buffering, and total process memory. Admission remains authoritative.
#[derive(Clone)]
pub struct DurableWritePressure {
    /// Independent preparation admission authority.
    pub(crate) preparation: Arc<Budget>,
    /// Independent mutation admission authority.
    pub(crate) mutations: Arc<Budget>,
}

impl DurableWritePressure {
    /// Constructs the two existing independent budgets with shared release notification.
    pub(crate) fn new() -> Self {
        let signal = Arc::new(Signal::default());
        Self {
            preparation: Budget::new(signal.clone()),
            mutations: Budget::new(signal),
        }
    }

    /// Samples both budgets without reserving capacity.
    ///
    /// # Errors
    /// Returns the sticky classified failure or closure of this opening.
    pub fn current(&self) -> Result<WritePressure, FileStorageError> {
        self.preparation.signal.check()?;
        let pressure = WritePressure {
            preparation: self.preparation.current(),
            mutations: self.mutations.current(),
        };
        self.preparation.signal.check()?;
        Ok(pressure)
    }

    /// Waits until both independent budgets are at or below the supplied ceilings.
    ///
    /// Ceilings apply separately to each budget, not their sum. This level-triggered wait
    /// does not reserve capacity, enqueue a mutation, or retain a payload/worker.
    /// Registering precedes checking, so release or termination cannot be missed.
    /// Cancelling the wait removes only its notification registration.
    /// A caller choosing ceilings at the limits may return while admission is still full.
    ///
    /// # Errors
    /// Returns a rejection for ceilings above the fixed limits, or the sticky opening error.
    pub async fn wait_below(
        &self,
        requests: usize,
        bytes: usize,
    ) -> Result<WritePressure, FileStorageError> {
        if requests > MAX_REQUESTS || bytes > MAX_BYTES {
            return Err(FileStorageError::Rejected(
                "pressure ceiling exceeds budget",
            ));
        }
        loop {
            let notified = self.preparation.signal.changed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            let pressure = self.current()?;
            if [pressure.preparation, pressure.mutations]
                .iter()
                .all(|budget| budget.requests <= requests && budget.bytes <= bytes)
            {
                return Ok(pressure);
            }
            notified.await;
        }
    }

    /// The first terminal transition wins, matching opening invalidation semantics.
    pub(crate) fn terminate(&self, failed: bool) {
        self.preparation.signal.terminate(failed);
    }
}

/// Sticky opening status and capacity-release notifications, without policy callbacks.
#[derive(Default)]
struct Signal {
    /// Zero is live, one is closed, two is an ambiguous opening failure.
    terminal: AtomicU8,
    /// Wakes all current waiters when charges are released or the opening terminates.
    changed: Notify,
}

impl Signal {
    /// Preserves the first terminal classification.
    fn terminate(&self, failed: bool) {
        let _ = self.terminal.compare_exchange(
            0,
            if failed { 2 } else { 1 },
            Ordering::AcqRel,
            Ordering::Acquire,
        );
        self.changed.notify_waiters();
    }

    /// Never reports terminal state as available capacity.
    fn check(&self) -> Result<(), FileStorageError> {
        match self.terminal.load(Ordering::Acquire) {
            0 => Ok(()),
            1 => Err(FileStorageError::Rejected("storage opening is closed")),
            _ => Err(FileStorageError::Ambiguous),
        }
    }
}

/// Existing semaphore admission authority with release observations.
pub(crate) struct Budget {
    /// Request permits held through actual work completion.
    pub(crate) requests: Arc<Semaphore>,
    /// Byte permits held through actual work completion.
    pub(crate) bytes: Arc<Semaphore>,
    /// Shared by the two stages of one opening.
    signal: Arc<Signal>,
}

impl Budget {
    /// Creates one fixed-capacity stage.
    fn new(signal: Arc<Signal>) -> Arc<Self> {
        Arc::new(Self {
            requests: Arc::new(Semaphore::new(MAX_REQUESTS)),
            bytes: Arc::new(Semaphore::new(MAX_BYTES)),
            signal,
        })
    }

    /// Samples authoritative semaphore usage without a second accounting ledger.
    fn current(&self) -> BudgetPressure {
        BudgetPressure {
            requests: MAX_REQUESTS - self.requests.available_permits(),
            bytes: MAX_BYTES - self.bytes.available_permits(),
            request_limit: MAX_REQUESTS,
            byte_limit: MAX_BYTES,
        }
    }

    /// Retains charges and arranges notification after both permits are released.
    pub(crate) fn retain(
        &self,
        request: OwnedSemaphorePermit,
        bytes: OwnedSemaphorePermit,
    ) -> Reservation {
        Reservation {
            permits: Some((request, bytes)),
            signal: self.signal.clone(),
        }
    }

    /// Notifies after a partially acquired admission attempt releases its request.
    pub(crate) fn released(&self) {
        self.signal.changed.notify_waiters();
    }
}

/// Releases capacity before waking observers, including during cancellation or unwinding.
pub(crate) struct Reservation {
    /// Taken explicitly before notification.
    permits: Option<(OwnedSemaphorePermit, OwnedSemaphorePermit)>,
    /// Does not retain the opening or its filesystem resources.
    signal: Arc<Signal>,
}

impl Drop for Reservation {
    fn drop(&mut self) {
        drop(self.permits.take());
        self.signal.changed.notify_waiters();
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{FutureExt, task::ArcWake};
    use std::sync::atomic::AtomicUsize;

    /// Counts notifications without introducing an executor scheduling dependency.
    #[derive(Default)]
    struct Wakes(AtomicUsize);

    impl ArcWake for Wakes {
        fn wake_by_ref(this: &Arc<Self>) {
            this.0.fetch_add(1, Ordering::SeqCst);
        }
    }

    /// Acquires real semaphore charges, as the two admission implementations do.
    fn reserve(budget: &Arc<Budget>, bytes: usize) -> Reservation {
        budget.retain(
            budget.requests.clone().try_acquire_owned().unwrap(),
            budget
                .bytes
                .clone()
                .try_acquire_many_owned(u32::try_from(bytes).unwrap())
                .unwrap(),
        )
    }

    #[tokio::test]
    async fn pressure_keeps_stages_separate_and_waits_for_actual_last_owner() {
        let pressure = DurableWritePressure::new();
        let preparation = Arc::new(reserve(&pressure.preparation, MAX_BYTES));
        let worker_owner = preparation.clone();
        let mutation = reserve(&pressure.mutations, 8);
        let sample = pressure.current().unwrap();
        assert_eq!(sample.preparation.requests, 1);
        assert_eq!(sample.preparation.bytes, MAX_BYTES);
        assert_eq!(sample.mutations.requests, 1);
        assert_eq!(sample.mutations.bytes, 8);
        let waiting = pressure.wait_below(0, 0);
        tokio::pin!(waiting);
        assert!(futures_util::poll!(&mut waiting).is_pending());
        drop(preparation);
        drop(mutation);
        assert!(futures_util::poll!(&mut waiting).is_pending());
        drop(worker_owner);
        assert_eq!(waiting.await.unwrap().preparation.bytes, 0);
        assert!(pressure.wait_below(0, 0).now_or_never().unwrap().is_ok());
        assert!(pressure.wait_below(MAX_REQUESTS + 1, 0).await.is_err());
        assert!(pressure.wait_below(0, MAX_BYTES + 1).await.is_err());
    }

    #[test]
    fn wait_below_checks_each_dimension_and_stage_inclusively() {
        let pressure = DurableWritePressure::new();
        for budget in [&pressure.preparation, &pressure.mutations] {
            let reservation = reserve(budget, 8);
            assert!(pressure.wait_below(1, 7).now_or_never().is_none());
            assert!(pressure.wait_below(0, 8).now_or_never().is_none());
            assert_eq!(
                pressure.wait_below(1, 8).now_or_never().unwrap().unwrap(),
                pressure.current().unwrap()
            );
            drop(reservation);
        }
        let preparation = reserve(&pressure.preparation, 8);
        let mutation = reserve(&pressure.mutations, 8);
        let sample = pressure.wait_below(1, 8).now_or_never().unwrap().unwrap();
        assert_eq!(sample.preparation.requests, 1);
        assert_eq!(sample.preparation.bytes, 8);
        assert_eq!(sample.mutations, sample.preparation);
        drop((preparation, mutation));
    }

    #[test]
    fn release_wakes_every_registered_waiter_without_requiring_another_poll() {
        let pressure = DurableWritePressure::new();
        let reservation = reserve(&pressure.mutations, 1);
        let notifications = Arc::new(Wakes::default());
        let waker = futures_util::task::waker(notifications.clone());
        let mut context = std::task::Context::from_waker(&waker);
        let mut first = Box::pin(pressure.wait_below(0, 0));
        let mut second = Box::pin(pressure.wait_below(0, 0));
        let mut cancelled = Box::pin(pressure.wait_below(0, 0));
        assert!(first.as_mut().poll(&mut context).is_pending());
        assert!(second.as_mut().poll(&mut context).is_pending());
        assert!(cancelled.as_mut().poll(&mut context).is_pending());
        drop(cancelled);
        drop(reservation);
        assert_eq!(notifications.0.load(Ordering::SeqCst), 2);
        assert!(first.as_mut().poll(&mut context).is_ready());
        assert!(second.as_mut().poll(&mut context).is_ready());
    }

    #[tokio::test]
    async fn release_racing_first_poll_cannot_leave_waiter_asleep() {
        for _ in 0..32 {
            let pressure = DurableWritePressure::new();
            let reservation = reserve(&pressure.mutations, 1);
            let barrier = Arc::new(std::sync::Barrier::new(2));
            let ready = barrier.clone();
            let worker = std::thread::spawn(move || {
                ready.wait();
                drop(reservation);
            });
            barrier.wait();
            tokio::time::timeout(std::time::Duration::from_secs(5), pressure.wait_below(0, 0))
                .await
                .unwrap()
                .unwrap();
            worker.join().unwrap();
        }
    }

    #[tokio::test]
    async fn termination_wakes_waiters_and_remains_sticky_after_release() {
        for failed in [false, true] {
            let pressure = DurableWritePressure::new();
            let reservation = reserve(&pressure.preparation, 1);
            let notifications = Arc::new(Wakes::default());
            let waker = futures_util::task::waker(notifications.clone());
            let mut context = std::task::Context::from_waker(&waker);
            let waiting = pressure.wait_below(0, 0);
            tokio::pin!(waiting);
            assert!(waiting.as_mut().poll(&mut context).is_pending());
            assert_eq!(notifications.0.load(Ordering::SeqCst), 0);
            pressure.terminate(failed);
            assert_eq!(notifications.0.load(Ordering::SeqCst), 1);
            let error = waiting.await.unwrap_err();
            assert_eq!(matches!(error, FileStorageError::Ambiguous), failed);
            drop(reservation);
            pressure.terminate(!failed);
            assert_eq!(
                matches!(pressure.current(), Err(FileStorageError::Ambiguous)),
                failed
            );
            assert!(pressure.wait_below(MAX_REQUESTS, MAX_BYTES).await.is_err());
        }
    }
}
