//! Lazy membership-scoped reads that preserve synchronous backend progress.

use std::{
    convert::Infallible,
    pin::Pin,
    task::{Context, Poll, ready},
};

use futures_util::{Stream, stream};
use sea_core::{
    EventPosition, MonitoredStream, MonitoredStreamItem, MonitoredStreamProgress,
    MonitoredStreamStatus, SessionCommittedEvent, map_monitored_stream,
    storage::{ArchiveStream, SeaStorage},
};

use super::{LocalSession, SessionError, SessionStream, decode_committed};

/// Couples an initialized backend read to the membership that authorized it.
struct Active<E> {
    /// Retains backend progress, including observations made between data polls.
    source: ArchiveStream<SessionCommittedEvent, EventPosition, SessionError<E>>,
    /// Resolves on membership closure and takes precedence over further source delivery.
    closed: SessionStream<(), Infallible>,
}

/// Owns initialization or backend resources, releasing both permanently at termination.
enum State<E> {
    /// Defers settlement, membership validation, and backend creation until the first poll.
    Opening(SessionStream<Active<E>, SessionError<E>>),
    /// Keeps the monitored source accessible without polling for another item.
    Reading(Active<E>),
    /// Prevents another initialization or delivery after close, error, or end.
    Done,
}

/// Preserves backend progress through lazy opening and membership-scoped termination.
struct StorageRead<E> {
    /// Determines resource ownership and whether delivery may still advance.
    state: State<E>,
    /// Initial or final observation when no backend stream is retained.
    progress: MonitoredStreamProgress<EventPosition>,
}

impl<E> Stream for StorageRead<E> {
    type Item = Result<MonitoredStreamItem<SessionCommittedEvent, EventPosition>, SessionError<E>>;

    /// Prioritizes closure and freezes the source observation before releasing terminal resources.
    fn poll_next(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        let terminal = loop {
            match &mut this.state {
                State::Opening(opening) => match ready!(opening.as_mut().poll_next(context)) {
                    Some(Ok(active)) => this.state = State::Reading(active),
                    Some(Err(error)) => break Some(Err(error)),
                    None => break None,
                },
                State::Reading(active) => {
                    if active.closed.as_mut().poll_next(context).is_ready() {
                        this.progress = active.source.progress();
                        break None;
                    }
                    let next = ready!(active.source.as_mut().poll_next(context));
                    this.progress = active.source.progress();
                    if matches!(next, Some(Ok(_))) {
                        return Poll::Ready(next);
                    }
                    break next;
                }
                State::Done => return Poll::Ready(None),
            }
        };
        this.state = State::Done;
        Poll::Ready(terminal)
    }
}

impl<E> MonitoredStream for StorageRead<E> {
    type Data = SessionCommittedEvent;
    type Position = EventPosition;
    type Error = SessionError<E>;

    /// Observes the live backend directly, or returns the retained initial/final snapshot.
    fn progress(&self) -> MonitoredStreamProgress<EventPosition> {
        match &self.state {
            State::Reading(active) => active.source.progress(),
            State::Opening(_) | State::Done => self.progress.clone(),
        }
    }
}

/// Creates a lazy bounded or live read without acquiring a runtime guard or backend resource.
///
/// Initialization settles earlier mutations before validating membership.
/// Mapping preserves the backend cursor even when decoding a delivered record fails.
pub(super) fn read<Storage: SeaStorage + 'static>(
    session: LocalSession<Storage>,
    after: Option<EventPosition>,
    stop_after: Option<EventPosition>,
) -> ArchiveStream<SessionCommittedEvent, EventPosition, SessionError<Storage::Error>> {
    let opening = stream::once(async move {
        let _barrier = session.sequencer.barrier().await;
        let mut runtime = session.sequencer.runtime.lock().await;
        runtime.settle().await?;
        let mut closed = runtime.member(&session.session)?.closed.subscribe();
        let source = runtime.view()?.read(after, stop_after);
        Ok(Active {
            source: map_monitored_stream(
                source,
                |record| decode_committed(&record),
                SessionError::Storage,
            ),
            closed: Box::pin(stream::once(async move {
                loop {
                    if *closed.borrow_and_update() || closed.changed().await.is_err() {
                        return Ok(());
                    }
                }
            })),
        })
    });
    Box::pin(StorageRead {
        state: State::Opening(Box::pin(opening)),
        progress: MonitoredStreamProgress {
            previous: after,
            latest_known: after,
            status: MonitoredStreamStatus::StreamingBacklog,
        },
    })
}
