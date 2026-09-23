//! Storage replay followed by atomic delivered-cursor handoff to the experimental cache.

use std::{
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
};

use futures_util::{
    Stream, StreamExt, TryStreamExt,
    future::{Either, select},
    stream,
};
use sea_core::{
    CommittedEvent, EventPosition, MonitoredStream, MonitoredStreamItem, MonitoredStreamProgress,
    MonitoredStreamStatus, SessionCommittedEvent, boxed_monitored_stream,
    storage::{ArchiveStream, SeaStorage},
};

/// Keeps backlog status consistent when the positioned wrapper advances its delivered cursor.
struct LiveReadStream<E> {
    /// The positioned stream owns data delivery and discovery progress.
    inner: ArchiveStream<SessionCommittedEvent, EventPosition, SessionError<E>>,
}

impl<E> Stream for LiveReadStream<E> {
    type Item = Result<MonitoredStreamItem<SessionCommittedEvent, EventPosition>, SessionError<E>>;

    fn poll_next(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.get_mut().inner.as_mut().poll_next(context)
    }
}

impl<E> MonitoredStream for LiveReadStream<E> {
    type Data = SessionCommittedEvent;
    type Position = EventPosition;
    type Error = SessionError<E>;

    fn progress(&self) -> MonitoredStreamProgress<EventPosition> {
        let mut progress = self.inner.progress();
        if progress.previous == progress.latest_known
            && progress.status == MonitoredStreamStatus::FallenBehind
        {
            progress.status = MonitoredStreamStatus::StreamingBacklog;
        }
        progress
    }
}

use super::{
    LocalSession, SessionError, decode_committed,
    live_cache::{LiveCache, LiveReadRevocation, Subscription},
};

/// A replay cursor advances only on returned data, never on source progress.
struct Reader<Storage: SeaStorage> {
    /// Keeps runtime work pollable, not just cache publication observable.
    session: LocalSession<Storage>,
    /// Synchronous drop, close, and neutral revocation ownership.
    subscription: Subscription<Storage::Error>,
    /// Coalesced notification, subscribed before inspecting any state.
    changed: tokio::sync::watch::Receiver<()>,
    /// Last event actually returned to the consumer.
    delivered: Option<EventPosition>,
    /// Frontier already reported to the caller, never used as the delivered cursor.
    latest_known: Option<EventPosition>,
    /// A bounded replay holds no live retention claim.
    source: Option<ArchiveStream<CommittedEvent, EventPosition, Storage::Error>>,
    /// Captured applied head for the current finite replay.
    replay_through: Option<EventPosition>,
    /// Once attached, revocation never falls back to storage.
    attached: bool,
    /// Emit one progress transition on each return to caught-up state.
    report_waiting: bool,
    /// A terminal error is returned once.
    done: bool,
}

/// Creates a subscription immediately, including before its first poll.
pub(super) fn read<Storage: SeaStorage + 'static>(
    session: LocalSession<Storage>,
    cache: &Arc<LiveCache<Storage::Error>>,
    after: Option<EventPosition>,
) -> (
    ArchiveStream<SessionCommittedEvent, EventPosition, SessionError<Storage::Error>>,
    LiveReadRevocation,
) {
    let subscription = cache.subscribe(session.session.clone());
    let revocation = subscription.revocation();
    let mut changed = cache.changes();
    let initialized = stream::once(async move {
        loop {
            changed.borrow_and_update();
            if let Some(terminal) = subscription.terminal() {
                return Err(terminal.error());
            }
            let initialize = async {
                drive_retained(&session).await?;
                let runtime = session.sequencer.runtime.lock().await;
                runtime.member(&session.session)?;
                runtime.view().map(|_| ())
            };
            match select(Box::pin(changed.changed()), Box::pin(initialize)).await {
                Either::Left(_) => {}
                Either::Right((result, _)) => {
                    result?;
                    break;
                }
            }
        }
        let reader = Reader {
            session,
            subscription,
            changed,
            delivered: after,
            latest_known: after,
            source: None,
            replay_through: None,
            attached: false,
            report_waiting: true,
            done: false,
        };
        Ok::<_, SessionError<Storage::Error>>(stream::unfold(reader, |mut reader| async move {
            if reader.done {
                return None;
            }
            let item = reader.next().await;
            reader.done = item.is_err();
            if reader.done {
                reader.subscription.release();
            }
            Some((item, reader))
        }))
    });
    let stream = boxed_monitored_stream(
        initialized.try_flatten(),
        MonitoredStreamProgress {
            previous: after,
            latest_known: after,
            status: MonitoredStreamStatus::StreamingBacklog,
        },
        |event: &SessionCommittedEvent| Some(event.committed.position),
    );
    (Box::pin(LiveReadStream { inner: stream }), revocation)
}

impl<Storage: SeaStorage + 'static> Reader<Storage> {
    /// Returns one data/progress item or an explicit terminal outcome.
    async fn next(
        &mut self,
    ) -> Result<
        MonitoredStreamItem<SessionCommittedEvent, EventPosition>,
        SessionError<Storage::Error>,
    > {
        loop {
            self.changed.borrow_and_update();
            if let Some(terminal) = self.subscription.terminal() {
                return Err(terminal.error());
            }
            if let Some(source) = &mut self.source {
                let next =
                    match select(Box::pin(self.changed.changed()), Box::pin(source.next())).await {
                        Either::Left(_) => continue,
                        Either::Right((next, _)) => next,
                    };
                match next {
                    Some(Ok(MonitoredStreamItem::Item(record))) => {
                        let event = decode_committed(&record)?;
                        self.delivered = Some(event.committed.position);
                        return Ok(MonitoredStreamItem::Item(event));
                    }
                    Some(Ok(MonitoredStreamItem::Progress(mut progress))) => {
                        progress.previous = self.delivered;
                        if progress.status == MonitoredStreamStatus::AwaitingNewItems {
                            progress.status = MonitoredStreamStatus::StreamingBacklog;
                        }
                        self.latest_known = progress.latest_known;
                        return Ok(MonitoredStreamItem::Progress(progress));
                    }
                    Some(Err(error)) => return Err(SessionError::Storage(error)),
                    None => {
                        self.source = None;
                        if self.delivered != self.replay_through {
                            return Err(SessionError::Corrupt("incomplete live replay prefix"));
                        }
                        // A missed handoff retries from delivered data, yielding once per attempt.
                        yield_once().await;
                    }
                }
            }
            if !self.attached {
                self.attached = self.subscription.attach(self.delivered)?;
                if !self.attached {
                    self.replay_through = self.subscription.head();
                    let opening = async { self.session.sequencer.runtime.lock().await.view() };
                    let view =
                        match select(Box::pin(self.changed.changed()), Box::pin(opening)).await {
                            Either::Left(_) => continue,
                            Either::Right((result, _)) => result?,
                        };
                    self.source = Some(view.read(self.delivered, self.replay_through));
                    continue;
                }
            }
            if self.latest_known == self.delivered {
                let (head, unread) = self.subscription.backlog(self.delivered);
                if head > self.latest_known {
                    self.latest_known = head;
                    return Ok(MonitoredStreamItem::Progress(MonitoredStreamProgress {
                        previous: self.delivered,
                        latest_known: head,
                        status: if unread > 1 {
                            MonitoredStreamStatus::FallenBehind
                        } else {
                            MonitoredStreamStatus::StreamingBacklog
                        },
                    }));
                }
            }
            if self.latest_known > self.delivered {
                let event = self
                    .subscription
                    .next()?
                    .ok_or(SessionError::Corrupt("missing discovered live cache item"))?;
                self.delivered = Some(event.committed.position);
                self.report_waiting = true;
                return Ok(MonitoredStreamItem::Item(event));
            }
            if self.report_waiting {
                self.report_waiting = false;
                return Ok(MonitoredStreamItem::Progress(MonitoredStreamProgress {
                    previous: self.delivered,
                    latest_known: self.delivered,
                    status: MonitoredStreamStatus::AwaitingNewItems,
                }));
            }
            let work = drive_retained(&self.session);
            match select(Box::pin(self.changed.changed()), Box::pin(work)).await {
                Either::Left(_) => continue,
                Either::Right((result, _)) => result?,
            }
            // With no retained work, wait on the already-armed notification rather than spinning.
            let _ = self.changed.changed().await;
        }
    }
}

/// Drives accepted work without leaving a reader-owned runtime or lifecycle guard parked on I/O.
///
/// Application drivers remain shared and independently pollable by submitters and barriers.
/// Controls already installed in `Runtime::pending` are polled once under their original
/// serialization, then both guards are released before yielding. Failed-member cleanup stays
/// with ordinary lifecycle operations; a read does not initiate new checkpoint/control I/O.
async fn drive_retained<Storage: SeaStorage + 'static>(
    session: &LocalSession<Storage>,
) -> Result<(), SessionError<Storage::Error>> {
    loop {
        session
            .sequencer
            .pipeline
            .drain(&session.sequencer.runtime)
            .await;
        let gate = session.sequencer.pipeline.gate.write().await;
        if !session.sequencer.pipeline.is_empty() {
            drop(gate);
            continue;
        }
        let Ok(mut runtime) = session.sequencer.runtime.try_lock() else {
            drop(gate);
            drop(session.sequencer.runtime.lock().await);
            continue;
        };
        let result = {
            let mut settlement = std::pin::pin!(runtime.settle_pending());
            std::future::poll_fn(|context| {
                std::task::Poll::Ready(std::future::Future::poll(settlement.as_mut(), context))
            })
            .await
        };
        drop(runtime);
        drop(gate);
        if let std::task::Poll::Ready(result) = result {
            return result;
        }
        // The retained backend future owns this task's waker. Do not self-wake and spin,
        // and do not keep the runtime guard while waiting for that notification.
        let mut waiting = true;
        std::future::poll_fn(|_| {
            if std::mem::take(&mut waiting) {
                std::task::Poll::Pending
            } else {
                std::task::Poll::Ready(())
            }
        })
        .await;
    }
}

/// Cooperative retry without requiring a native executor or a per-document task.
async fn yield_once() {
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
