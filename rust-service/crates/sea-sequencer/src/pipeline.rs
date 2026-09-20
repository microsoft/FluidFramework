//! Bounded application admission and cancellation-retained batch execution.

use std::{collections::VecDeque, sync::Arc};

use futures_util::{
    FutureExt,
    future::{Either, Shared, select},
};
use sea_core::{
    ClassifiedError, ErrorKind, Event, EventPosition,
    archive::{AuthorId, EventSubmission, SessionId},
    storage::{ReferenceableStore, SeaStorage, StorageHandle},
};
use tokio::sync::{Mutex, RwLock, oneshot};

use super::{AppendGuard, MutationFuture, Runtime, SessionError, append_once};

/// Maximum admitted entries, including the batch currently being persisted.
const ENTRY_LIMIT: usize = 256;
/// Maximum retained input bytes, including identities and envelope overhead.
const BYTE_LIMIT: usize = 4 * 1024 * 1024;

#[cfg(not(target_arch = "wasm32"))]
/// Retained work is driven by callers without requiring a spawned executor task.
type Driver = futures_util::future::BoxFuture<'static, ()>;
#[cfg(target_arch = "wasm32")]
/// Browser storage streams need not be transferable between threads.
type Driver = futures_util::future::LocalBoxFuture<'static, ()>;

/// One admitted input and the caller waiting for its settled result.
struct Entry<Error> {
    /// Stable author used for encoding this membership's submissions.
    author: AuthorId,
    /// Membership whose failure prevents dispatch of queued successors.
    session: SessionId,
    /// Original input, encoded only against settled runtime metadata.
    submission: EventSubmission,
    /// Charged bytes released only after completion or definitive rejection.
    bytes: usize,
    /// Completion does not require the caller to remain alive.
    completion: oneshot::Sender<Result<EventPosition, SessionError<Error>>>,
}

/// Ring storage and accounting shared independently of the persistence driver.
struct Queue<Error> {
    /// Undispatched inputs in admission order.
    entries: VecDeque<Entry<Error>>,
    /// Queued plus in-flight entry count.
    count: usize,
    /// Queued plus in-flight byte charge.
    bytes: usize,
}

/// Admission is independent of backend I/O; lifecycle changes drain under the gate.
pub(super) struct Pipeline<Storage: SeaStorage> {
    /// Lifecycle writers exclude new admissions until their barrier is complete.
    pub(super) gate: RwLock<()>,
    /// Short synchronous queue lock, never held while polling storage.
    queue: Arc<std::sync::Mutex<Queue<Storage::Error>>>,
    /// Retains a partially polled batch even when its driving caller is cancelled.
    driver: std::sync::Mutex<Option<Shared<Driver>>>,
}

impl<Storage: SeaStorage + 'static> Pipeline<Storage> {
    #[cfg(test)]
    /// Reports total charged work, including any in-flight persistence batch.
    pub(super) fn occupancy(&self) -> (usize, usize) {
        let queue = self.queue.lock().expect("pipeline queue lock");
        (queue.count, queue.bytes)
    }

    /// Creates an empty bounded ring without starting a background task.
    pub(super) fn new() -> Self {
        Self {
            gate: RwLock::new(()),
            queue: Arc::new(std::sync::Mutex::new(Queue {
                entries: VecDeque::with_capacity(ENTRY_LIMIT),
                count: 0,
                bytes: 0,
            })),
            driver: std::sync::Mutex::new(None),
        }
    }

    /// Holds membership order through capacity waits, releasing it immediately after enqueue.
    /// The caller acquires membership order before any runtime or lifecycle gate lock.
    pub(super) async fn submit(
        &self,
        runtime: &Arc<Mutex<Runtime<Storage>>>,
        membership_admission: tokio::sync::MutexGuard<'_, ()>,
        author: AuthorId,
        session: SessionId,
        submission: EventSubmission,
    ) -> Result<EventPosition, SessionError<Storage::Error>> {
        let bytes = submission
            .event
            .payload
            .len()
            .saturating_add(author.as_bytes().len())
            .saturating_add(session.as_bytes().len())
            .saturating_add(128);
        let mut input = Some(submission);
        let receiver;
        let mut guard;
        loop {
            let admission = self.gate.read().await;
            let mut state = runtime.lock().await;
            if state.recovery_required {
                return Err(SessionError::RecoveryRequired);
            }
            if state.pending.is_some() {
                drop(state);
                drop(admission);
                let _barrier = self.gate.write().await;
                self.drain(runtime).await;
                runtime.lock().await.settle().await?;
                continue;
            }
            let failed = state.member(&session)?.failed.clone();
            if bytes > BYTE_LIMIT {
                failed.store(true, std::sync::atomic::Ordering::SeqCst);
                return Err(SessionError::Rejected(
                    "submission exceeds pipeline byte limit",
                ));
            }
            if self.queue.lock().expect("pipeline queue lock").count == 0 {
                guard = AppendGuard(Some(failed));
                match self
                    .start_idle(
                        runtime,
                        &mut state,
                        author,
                        session,
                        input.take().expect("unadmitted input"),
                        bytes,
                    )
                    .await
                {
                    Either::Left(result) => {
                        if result.is_ok() {
                            guard.disarm();
                        }
                        return result;
                    }
                    Either::Right(completion) => receiver = completion,
                }
                break;
            }
            let admitted = {
                let mut queue = self.queue.lock().expect("pipeline queue lock");
                if queue.count < ENTRY_LIMIT && bytes <= BYTE_LIMIT - queue.bytes {
                    let (completion, pending) = oneshot::channel();
                    queue.count += 1;
                    queue.bytes += bytes;
                    queue.entries.push_back(Entry {
                        author: author.clone(),
                        session: session.clone(),
                        submission: input.take().expect("unadmitted input"),
                        bytes,
                        completion,
                    });
                    Some(pending)
                } else {
                    None
                }
            };
            drop(state);
            drop(admission);
            if let Some(pending) = admitted {
                receiver = pending;
                guard = AppendGuard(Some(failed));
                break;
            }
            self.drive(runtime).await;
        }
        drop(membership_admission);
        self.complete(runtime, receiver, guard).await
    }

    /// Drives retained work until this caller's receipt is ready, preserving cooperative yielding.
    async fn complete(
        &self,
        runtime: &Arc<Mutex<Runtime<Storage>>>,
        mut receiver: oneshot::Receiver<Result<EventPosition, SessionError<Storage::Error>>>,
        mut guard: AppendGuard,
    ) -> Result<EventPosition, SessionError<Storage::Error>> {
        loop {
            match select(&mut receiver, std::pin::pin!(self.drive(runtime))).await {
                Either::Left((result, _)) => {
                    let result = result.unwrap_or(Err(SessionError::RecoveryRequired));
                    if result.is_ok() {
                        guard.disarm();
                    }
                    return result;
                }
                Either::Right(_) => {
                    let mut yielded = false;
                    std::future::poll_fn(|context| {
                        if yielded {
                            std::task::Poll::Ready(())
                        } else {
                            yielded = true;
                            context.waker().wake_by_ref();
                            std::task::Poll::Pending
                        }
                    })
                    .await;
                }
            }
        }
    }

    /// Polls an idle append under both admission locks; pending work moves to the retained driver.
    async fn start_idle(
        &self,
        runtime: &Arc<Mutex<Runtime<Storage>>>,
        state: &mut Runtime<Storage>,
        author: AuthorId,
        session: SessionId,
        submission: EventSubmission,
        bytes: usize,
    ) -> Either<
        Result<EventPosition, SessionError<Storage::Error>>,
        oneshot::Receiver<Result<EventPosition, SessionError<Storage::Error>>>,
    > {
        let event = match state.prepare_submission(
            &author,
            &session,
            &submission,
            state.minimum_reference,
            true,
        ) {
            Ok(event) => event,
            Err(error) => return Either::Left(Err(error)),
        };
        let view = match state.view() {
            Ok(view) => view,
            Err(error) => return Either::Left(Err(error)),
        };
        let input = event.clone();
        let mut future: MutationFuture<Storage::Error> =
            Box::pin(async move { append_once::<Storage>(&view, input).await });
        if let std::task::Poll::Ready(result) =
            std::future::poll_fn(|context| std::task::Poll::Ready(future.as_mut().poll(context)))
                .await
        {
            return Either::Left(apply_result(state, event, result));
        }
        let (completion, receiver) = oneshot::channel();
        let entry = Entry {
            author,
            session,
            submission,
            bytes,
            completion,
        };
        {
            let mut queue = self.queue.lock().expect("pipeline queue lock");
            queue.count += 1;
            queue.bytes += bytes;
        }
        let runtime = runtime.clone();
        let queue = self.queue.clone();
        let driver: Driver = Box::pin(async move {
            let result = future.await;
            let mut state = runtime.lock().await;
            let result = apply_result(&mut state, event, result);
            finish(&mut state, &queue, entry, result);
        });
        *self.driver.lock().expect("pipeline driver lock") = Some(driver.shared());
        Either::Right(receiver)
    }

    /// Settles all admitted work while a lifecycle caller excludes new admission.
    pub(super) async fn drain(&self, runtime: &Arc<Mutex<Runtime<Storage>>>) {
        loop {
            self.drive(runtime).await;
            if self.queue.lock().expect("pipeline queue lock").count == 0 {
                break;
            }
        }
    }

    /// Drives one retained batch; dropping this call leaves its future in the driver slot.
    async fn drive(&self, runtime: &Arc<Mutex<Runtime<Storage>>>) {
        let work = {
            let mut driver = self.driver.lock().expect("pipeline driver lock");
            if driver.is_none() {
                let mut entries = Vec::new();
                {
                    let mut queue = self.queue.lock().expect("pipeline queue lock");
                    while let Some(entry) = queue.entries.pop_front() {
                        entries.push(entry);
                    }
                }
                if entries.is_empty() {
                    return;
                }
                let runtime = runtime.clone();
                let queue = self.queue.clone();
                let future: Driver = Box::pin(async move {
                    let mut prepared = Vec::new();
                    let mut state = runtime.lock().await;
                    let floor = state.minimum_reference;
                    let last = entries.len() - 1;
                    for (index, entry) in entries.into_iter().enumerate() {
                        let result = if state.recovery_required {
                            Err(SessionError::RecoveryRequired)
                        } else {
                            state.prepare_submission(
                                &entry.author,
                                &entry.session,
                                &entry.submission,
                                floor,
                                index == last,
                            )
                        };
                        match result {
                            Ok(event) => {
                                prepared.push((entry, event));
                            }
                            Err(error) => finish(&mut state, &queue, entry, Err(error)),
                        }
                    }
                    let view = state.view();
                    drop(state);
                    if prepared.is_empty() {
                        return;
                    }
                    let results = match view {
                        Ok(view) if prepared.len() == 1 => {
                            vec![append_once::<Storage>(&view, prepared[0].1.clone()).await]
                        }
                        Ok(view) => {
                            append_batch::<Storage>(
                                &view,
                                prepared.iter().map(|(_, event)| event.clone()).collect(),
                            )
                            .await
                        }
                        Err(_) => Vec::new(),
                    };
                    let mut state = runtime.lock().await;
                    let mut results = results.into_iter();
                    for (entry, event) in prepared {
                        let result = results.next().unwrap_or(Err(SessionError::Rejected(
                            "batch suffix was not attempted",
                        )));
                        let result = apply_result(&mut state, event, result);
                        finish(&mut state, &queue, entry, result);
                    }
                });
                *driver = Some(future.shared());
            }
            driver.as_ref().expect("retained batch").clone()
        };
        work.clone().await;
        let mut driver = self.driver.lock().expect("pipeline driver lock");
        if driver.as_ref().is_some_and(|current| current.ptr_eq(&work)) {
            driver.take();
        }
    }
}

/// Applies a settled append before receipt publication and preserves ambiguous recovery barriers.
fn apply_result<Storage: SeaStorage + 'static>(
    state: &mut Runtime<Storage>,
    event: Event,
    result: Result<EventPosition, SessionError<Storage::Error>>,
) -> Result<EventPosition, SessionError<Storage::Error>> {
    let result = match result {
        Ok(position) => state
            .apply(&sea_core::CommittedEvent { position, event })
            .map(|()| position),
        Err(error) => Err(error),
    };
    if matches!(
        &result,
        Err(SessionError::RecoveryRequired | SessionError::Corrupt(_))
    ) {
        state.recovery_required = true;
    }
    result
}

/// Publishes completion only after runtime metadata has caught up with backend commitment.
fn finish<Storage: SeaStorage>(
    state: &mut Runtime<Storage>,
    queue: &std::sync::Mutex<Queue<Storage::Error>>,
    entry: Entry<Storage::Error>,
    result: Result<EventPosition, SessionError<Storage::Error>>,
) {
    if result.is_err()
        && let Some(member) = state.members.get(&entry.session)
    {
        member
            .failed
            .store(true, std::sync::atomic::Ordering::SeqCst);
    }
    let mut queue = queue.lock().expect("pipeline queue lock");
    queue.count -= 1;
    queue.bytes -= entry.bytes;
    let _ = entry.completion.send(result);
}

/// Resolves dependencies in order, commits the checked prefix, and never retries ambiguity.
async fn append_batch<Storage: SeaStorage>(
    view: &super::View<Storage>,
    events: Vec<Event>,
) -> Vec<Result<EventPosition, SessionError<Storage::Error>>> {
    let mut values = Vec::new();
    let mut failure = None;
    for event in events {
        let tree = match event.blob_tree {
            Some(id) => match view.blobs().resolve(id).await {
                Ok(Some(handle)) => Some(handle),
                Ok(None) => {
                    failure = Some(SessionError::Rejected("event tree unavailable"));
                    break;
                }
                Err(error) => {
                    failure = Some(SessionError::Storage(error));
                    break;
                }
            },
            None => None,
        };
        values.push((event.payload, tree));
    }
    let checked = values.len();
    let mut results: Vec<_> = view
        .append_batch(values)
        .await
        .into_iter()
        .map(|result| {
            result.map(|handle| handle.id()).map_err(|error| {
                if error.kind() == ErrorKind::Ambiguous {
                    SessionError::RecoveryRequired
                } else {
                    SessionError::Storage(error)
                }
            })
        })
        .collect();
    if results.len() == checked
        && results.iter().all(Result::is_ok)
        && let Some(error) = failure
    {
        results.push(Err(error));
    }
    results
}
