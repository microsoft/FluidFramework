//! Ordered streams with observable delivery progress.
//!
//! A monitored stream interleaves ordered data items with out-of-band progress snapshots.
//! Progress may describe data that is buffered behind it, so progress does not participate in the
//! ordering of data items and may cut ahead of them. Implementations may coalesce superseded
//! progress snapshots, but must not reorder data or allow progress updates to starve data delivery.

use std::pin::Pin;

use futures_core::Stream;

/// The current delivery state of a [`MonitoredStream`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MonitoredStreamStatus {
    /// Initial latest-position discovery is incomplete, or unread items are known to exist.
    StreamingBacklog,
    /// Initial discovery is complete and the stream is waiting for a new item.
    AwaitingNewItems,
    /// Items are known to be buffering because throughput is limiting delivery.
    FallenBehind,
}

/// One atomic snapshot of a monitored stream's delivery progress.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MonitoredStreamProgress<P> {
    /// Cursor immediately before the next unread data item.
    ///
    /// This starts at the cursor used to create the stream and advances only when a data item is
    /// returned to the reader. Receiving, downloading, decoding, or buffering an item does not
    /// advance it. A wrapper created by [`map_monitored_stream`] preserves the source cursor, so
    /// a transformation error does not rewind an item that the source already delivered.
    pub previous: Option<P>,
    /// Newest item position currently known to belong to the stream's range.
    ///
    /// Before initial discovery completes, this may equal `previous` while `status` remains
    /// [`MonitoredStreamStatus::StreamingBacklog`].
    pub latest_known: Option<P>,
    /// Current delivery state for this progress snapshot.
    pub status: MonitoredStreamStatus,
}

/// A data item or an out-of-band progress observation from a [`MonitoredStream`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MonitoredStreamItem<T, P> {
    /// One data item in the stream's logical order.
    Item(T),
    /// The latest progress state when this value is observed.
    ///
    /// This value has no logical stream position and may cut ahead of buffered data items.
    Progress(MonitoredStreamProgress<P>),
}

/// An ordered data stream with observable delivery progress.
///
/// The progress returned by [`Self::progress`] is one internally consistent snapshot. Position
/// fields must not move backward during one uninterrupted stream. `AwaitingNewItems` requires
/// `previous == latest_known`; `FallenBehind` requires `previous < latest_known`. Equality alone
/// does not imply that the stream is awaiting new items because initial discovery may be pending.
///
/// Implementations choose when buffered throughput pressure qualifies as `FallenBehind`, but must
/// eventually report it if new items continue accumulating while the consumer does not read them.
///
/// Backlog status does not describe connection health or guarantee timely delivery.
pub trait MonitoredStream:
    Stream<Item = Result<MonitoredStreamItem<Self::Data, Self::Position>, Self::Error>>
{
    /// Data yielded in the stream's logical order.
    type Data;
    /// Monotonic position used to report delivery progress.
    type Position: Clone + PartialOrd;
    /// Error yielded while initializing or reading the stream.
    type Error;

    /// Returns the latest atomic progress snapshot without waiting for another stream item.
    fn progress(&self) -> MonitoredStreamProgress<Self::Position>;
}

#[cfg(not(target_arch = "wasm32"))]
/// A boxed monitored stream on native targets.
pub type BoxMonitoredStream<T, P, E> = Pin<
    Box<
        dyn MonitoredStream<
                Data = T,
                Position = P,
                Error = E,
                Item = Result<MonitoredStreamItem<T, P>, E>,
            > + Send
            + 'static,
    >,
>;

#[cfg(target_arch = "wasm32")]
/// A boxed monitored stream on browser targets.
pub type BoxMonitoredStream<T, P, E> = Pin<
    Box<
        dyn MonitoredStream<
                Data = T,
                Position = P,
                Error = E,
                Item = Result<MonitoredStreamItem<T, P>, E>,
            > + 'static,
    >,
>;

/// Tracks delivery positions while accepting the source's progress observations unchanged.
struct PositionedMonitoredStream<S, F, P> {
    /// Ordered source whose allocation remains pinned while the wrapper moves.
    inner: Pin<Box<S>>,
    /// Extracts a delivered item's cursor; `None` leaves progress unchanged.
    position_of: F,
    /// Current progress, updated by source observations and positioned data delivery.
    progress: MonitoredStreamProgress<P>,
}

// Only the separately allocated source is pinned; no pinned references to callbacks or progress escape.
impl<S, F, P> Unpin for PositionedMonitoredStream<S, F, P> {}

impl<S, F, T, P, E> Stream for PositionedMonitoredStream<S, F, P>
where
    S: Stream<Item = Result<MonitoredStreamItem<T, P>, E>>,
    F: FnMut(&T) -> Option<P>,
    P: Clone + PartialOrd,
{
    type Item = Result<MonitoredStreamItem<T, P>, E>;

    fn poll_next(
        self: Pin<&mut Self>,
        context: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        let this = self.get_mut();
        match this.inner.as_mut().poll_next(context) {
            std::task::Poll::Ready(Some(Ok(MonitoredStreamItem::Item(item)))) => {
                if let Some(position) = (this.position_of)(&item) {
                    if this
                        .progress
                        .latest_known
                        .as_ref()
                        .is_none_or(|latest| position > *latest)
                    {
                        this.progress.latest_known = Some(position.clone());
                    }
                    this.progress.previous = Some(position);
                    if this.progress.status == MonitoredStreamStatus::FallenBehind
                        && this.progress.previous == this.progress.latest_known
                    {
                        this.progress.status = MonitoredStreamStatus::StreamingBacklog;
                    }
                }
                std::task::Poll::Ready(Some(Ok(MonitoredStreamItem::Item(item))))
            }
            std::task::Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(progress)))) => {
                this.progress = progress.clone();
                std::task::Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(progress))))
            }
            other => other,
        }
    }
}

impl<S, F, T, P, E> MonitoredStream for PositionedMonitoredStream<S, F, P>
where
    S: Stream<Item = Result<MonitoredStreamItem<T, P>, E>>,
    F: FnMut(&T) -> Option<P>,
    P: Clone + PartialOrd,
{
    type Data = T;
    type Position = P;
    type Error = E;

    fn progress(&self) -> MonitoredStreamProgress<Self::Position> {
        self.progress.clone()
    }
}

#[cfg(not(target_arch = "wasm32"))]
/// Boxes a native monitored stream and tracks the position of each yielded data item.
///
/// The source must emit ordered data and coherent progress observations.
/// A `position_of` result of `None` leaves progress unchanged for that item.
/// Delivery also advances `latest_known` if needed and clears `FallenBehind` when its known
/// backlog is exhausted. Only a source observation establishes `AwaitingNewItems`.
pub fn boxed_monitored_stream<S, F, T, P, E>(
    stream: S,
    initial: MonitoredStreamProgress<P>,
    position_of: F,
) -> BoxMonitoredStream<T, P, E>
where
    S: Stream<Item = Result<MonitoredStreamItem<T, P>, E>> + Send + 'static,
    F: FnMut(&T) -> Option<P> + Send + 'static,
    T: 'static,
    P: Clone + PartialOrd + Send + 'static,
    E: 'static,
{
    Box::pin(PositionedMonitoredStream {
        inner: Box::pin(stream),
        position_of,
        progress: initial,
    })
}

#[cfg(target_arch = "wasm32")]
/// Boxes a browser monitored stream and tracks the position of each yielded data item.
///
/// The source must emit ordered data and coherent progress observations.
/// A `position_of` result of `None` leaves progress unchanged for that item.
/// Delivery also advances `latest_known` if needed and clears `FallenBehind` when its known
/// backlog is exhausted. Only a source observation establishes `AwaitingNewItems`.
pub fn boxed_monitored_stream<S, F, T, P, E>(
    stream: S,
    initial: MonitoredStreamProgress<P>,
    position_of: F,
) -> BoxMonitoredStream<T, P, E>
where
    S: Stream<Item = Result<MonitoredStreamItem<T, P>, E>> + 'static,
    F: FnMut(&T) -> Option<P> + 'static,
    T: 'static,
    P: Clone + PartialOrd + 'static,
    E: 'static,
{
    Box::pin(PositionedMonitoredStream {
        inner: Box::pin(stream),
        position_of,
        progress: initial,
    })
}

/// Transforms data and errors without changing the source's delivery progress.
struct MappedMonitoredStream<T, P, E, F, G> {
    /// Source that remains authoritative for progress, including after a mapping error.
    inner: BoxMonitoredStream<T, P, E>,
    /// Fallible transformation applied only to data items, not progress observations.
    map_data: F,
    /// Converts source errors independently of data-transformation errors.
    map_error: G,
}

// Moving this wrapper keeps its source pinned; neither callback is structurally pinned.
impl<T, P, E, F, G> Unpin for MappedMonitoredStream<T, P, E, F, G> {}

impl<T, U, P, E, O, F, G> Stream for MappedMonitoredStream<T, P, E, F, G>
where
    F: FnMut(T) -> Result<U, O>,
    G: FnMut(E) -> O,
    P: Clone + PartialOrd,
{
    type Item = Result<MonitoredStreamItem<U, P>, O>;

    fn poll_next(
        self: Pin<&mut Self>,
        context: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        let this = self.get_mut();
        match this.inner.as_mut().poll_next(context) {
            std::task::Poll::Ready(Some(Ok(MonitoredStreamItem::Item(item)))) => {
                std::task::Poll::Ready(Some((this.map_data)(item).map(MonitoredStreamItem::Item)))
            }
            std::task::Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(progress)))) => {
                std::task::Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(progress))))
            }
            std::task::Poll::Ready(Some(Err(error))) => {
                std::task::Poll::Ready(Some(Err((this.map_error)(error))))
            }
            std::task::Poll::Ready(None) => std::task::Poll::Ready(None),
            std::task::Poll::Pending => std::task::Poll::Pending,
        }
    }
}

impl<T, U, P, E, O, F, G> MonitoredStream for MappedMonitoredStream<T, P, E, F, G>
where
    F: FnMut(T) -> Result<U, O>,
    G: FnMut(E) -> O,
    P: Clone + PartialOrd,
{
    type Data = U;
    type Position = P;
    type Error = O;

    fn progress(&self) -> MonitoredStreamProgress<Self::Position> {
        self.inner.progress()
    }
}

#[cfg(not(target_arch = "wasm32"))]
/// Maps monitored data and errors while preserving source progress observations.
///
/// A data transformation error does not rewind the source cursor because the source item was
/// delivered before its transformation failed.
pub fn map_monitored_stream<T, U, P, E, O, F, G>(
    stream: BoxMonitoredStream<T, P, E>,
    map_data: F,
    map_error: G,
) -> BoxMonitoredStream<U, P, O>
where
    T: 'static,
    U: 'static,
    P: Clone + PartialOrd + Send + 'static,
    E: 'static,
    O: 'static,
    F: FnMut(T) -> Result<U, O> + Send + 'static,
    G: FnMut(E) -> O + Send + 'static,
{
    Box::pin(MappedMonitoredStream {
        inner: stream,
        map_data,
        map_error,
    })
}

#[cfg(target_arch = "wasm32")]
/// Maps monitored data and errors while preserving source progress observations.
///
/// A data transformation error does not rewind the source cursor because the source item was
/// delivered before its transformation failed.
pub fn map_monitored_stream<T, U, P, E, O, F, G>(
    stream: BoxMonitoredStream<T, P, E>,
    map_data: F,
    map_error: G,
) -> BoxMonitoredStream<U, P, O>
where
    T: 'static,
    U: 'static,
    P: Clone + PartialOrd + 'static,
    E: 'static,
    O: 'static,
    F: FnMut(T) -> Result<U, O> + 'static,
    G: FnMut(E) -> O + 'static,
{
    Box::pin(MappedMonitoredStream {
        inner: stream,
        map_data,
        map_error,
    })
}

#[cfg(test)]
mod tests {
    use std::{
        convert::Infallible,
        marker::PhantomPinned,
        pin::Pin,
        task::{Context, Poll},
    };

    use futures_core::Stream;

    use super::{
        BoxMonitoredStream, MonitoredStream, MonitoredStreamItem, MonitoredStreamProgress,
        MonitoredStreamStatus, boxed_monitored_stream, map_monitored_stream,
    };

    /// Object-safety fixture with observable progress but no stream items.
    struct EmptyStream {
        /// Fixed observation exposed through the monitored-stream trait object.
        progress: MonitoredStreamProgress<u64>,
    }

    impl Stream for EmptyStream {
        type Item = Result<MonitoredStreamItem<(), u64>, Infallible>;

        fn poll_next(self: Pin<&mut Self>, _context: &mut Context<'_>) -> Poll<Option<Self::Item>> {
            Poll::Ready(None)
        }
    }

    impl MonitoredStream for EmptyStream {
        type Data = ();
        type Position = u64;
        type Error = Infallible;

        fn progress(&self) -> MonitoredStreamProgress<Self::Position> {
            self.progress.clone()
        }
    }

    #[test]
    fn adapters_accept_pinned_sources_positions_and_callback_captures() {
        let pinned = PhantomPinned;
        let initial = MonitoredStreamProgress {
            previous: None,
            latest_known: Some((4, PhantomPinned)),
            status: MonitoredStreamStatus::StreamingBacklog,
        };
        let source = futures_util::stream::unfold(0, |step| async move {
            match step {
                0 => Some((Ok(MonitoredStreamItem::Item(4_u64)), 1)),
                1 => Some((Err("source failure"), 2)),
                _ => None,
            }
        });
        let positioned = boxed_monitored_stream(source, initial, move |position| {
            std::hint::black_box(&pinned);
            Some((*position, PhantomPinned))
        });
        let mut mapped = map_monitored_stream(
            positioned,
            move |value| {
                std::hint::black_box(&pinned);
                Ok::<_, &'static str>(value + 1)
            },
            move |error| {
                std::hint::black_box(&pinned);
                assert_eq!(error, "source failure");
                "mapped failure"
            },
        );
        let mut context = Context::from_waker(futures_util::task::noop_waker_ref());
        assert!(matches!(
            mapped.as_mut().poll_next(&mut context),
            Poll::Ready(Some(Ok(MonitoredStreamItem::Item(5))))
        ));
        assert_eq!(mapped.progress().previous, Some((4, PhantomPinned)));
        assert!(matches!(
            mapped.as_mut().poll_next(&mut context),
            Poll::Ready(Some(Err("mapped failure")))
        ));
        assert_eq!(mapped.progress().previous, Some((4, PhantomPinned)));
        assert!(matches!(
            mapped.as_mut().poll_next(&mut context),
            Poll::Ready(None)
        ));
    }

    #[test]
    fn monitored_stream_is_object_safe_and_reports_one_progress_snapshot() {
        let expected = MonitoredStreamProgress {
            previous: Some(3),
            latest_known: Some(3),
            status: MonitoredStreamStatus::AwaitingNewItems,
        };
        let stream: BoxMonitoredStream<(), u64, Infallible> = Box::pin(EmptyStream {
            progress: expected.clone(),
        });

        assert_eq!(stream.progress(), expected);
    }

    #[test]
    fn previous_advances_only_when_an_item_is_yielded() {
        let discovered = MonitoredStreamProgress {
            previous: Some(3),
            latest_known: Some(5),
            status: MonitoredStreamStatus::StreamingBacklog,
        };
        let source = futures_util::stream::iter([
            Ok::<_, Infallible>(MonitoredStreamItem::Progress(discovered.clone())),
            Ok(MonitoredStreamItem::Item(4_u64)),
        ]);
        let mut stream =
            boxed_monitored_stream(source, discovered.clone(), |position| Some(*position));
        let mut context = Context::from_waker(futures_util::task::noop_waker_ref());

        assert_eq!(stream.progress(), discovered);
        assert!(matches!(
            stream.as_mut().poll_next(&mut context),
            Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(_))))
        ));
        assert_eq!(stream.progress().previous, Some(3));
        assert!(matches!(
            stream.as_mut().poll_next(&mut context),
            Poll::Ready(Some(Ok(MonitoredStreamItem::Item(4))))
        ));
        assert_eq!(stream.progress().previous, Some(4));
    }

    #[test]
    fn mapped_progress_preserves_source_delivery_after_transformation_error() {
        let initial = MonitoredStreamProgress {
            previous: Some(3),
            latest_known: Some(5),
            status: MonitoredStreamStatus::StreamingBacklog,
        };
        let source = futures_util::stream::iter([
            Ok::<_, Infallible>(MonitoredStreamItem::Item(4_u64)),
            Ok(MonitoredStreamItem::Item(5_u64)),
        ]);
        let positioned = boxed_monitored_stream(source, initial, |position| Some(*position));
        let mut stream = map_monitored_stream(
            positioned,
            |position| (position < 5).then_some(position).ok_or("invalid item"),
            |error| match error {},
        );
        let mut context = Context::from_waker(futures_util::task::noop_waker_ref());

        assert!(matches!(
            stream.as_mut().poll_next(&mut context),
            Poll::Ready(Some(Ok(MonitoredStreamItem::Item(4))))
        ));
        assert_eq!(stream.progress().previous, Some(4));
        assert!(matches!(
            stream.as_mut().poll_next(&mut context),
            Poll::Ready(Some(Err("invalid item")))
        ));
        assert_eq!(stream.progress().previous, Some(5));
    }

    #[test]
    fn delivered_items_keep_latest_and_backlog_status_coherent() {
        let discovered = MonitoredStreamProgress {
            previous: Some(3),
            latest_known: Some(4),
            status: MonitoredStreamStatus::FallenBehind,
        };
        let source = futures_util::stream::iter([
            Ok::<_, Infallible>(MonitoredStreamItem::Item(4_u64)),
            Ok(MonitoredStreamItem::Item(5_u64)),
        ]);
        let mut stream = boxed_monitored_stream(source, discovered, |position| Some(*position));
        let mut context = Context::from_waker(futures_util::task::noop_waker_ref());
        for expected in [4, 5] {
            assert!(matches!(
                stream.as_mut().poll_next(&mut context),
                Poll::Ready(Some(Ok(MonitoredStreamItem::Item(position)))) if position == expected
            ));
            let progress = stream.progress();
            assert_eq!(progress.previous, Some(expected));
            assert_eq!(progress.latest_known, Some(expected));
            assert_eq!(progress.status, MonitoredStreamStatus::StreamingBacklog);
        }
    }

    #[test]
    fn mapped_source_errors_and_progress_do_not_transform_data_or_advance_cursor() {
        let initial = MonitoredStreamProgress {
            previous: Some(3),
            latest_known: Some(5),
            status: MonitoredStreamStatus::FallenBehind,
        };
        let source = futures_util::stream::iter([
            Ok(MonitoredStreamItem::<u64, _>::Progress(initial.clone())),
            Err("source failure"),
        ]);
        let positioned =
            boxed_monitored_stream(source, initial.clone(), |position| Some(*position));
        let mut stream = map_monitored_stream(
            positioned,
            |_| -> Result<(), String> { panic!("only data may be transformed") },
            |error| format!("mapped {error}"),
        );
        let mut context = Context::from_waker(futures_util::task::noop_waker_ref());
        assert!(matches!(
            stream.as_mut().poll_next(&mut context),
            Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(progress)))) if progress == initial
        ));
        assert_eq!(stream.progress(), initial);
        assert!(matches!(
            stream.as_mut().poll_next(&mut context),
            Poll::Ready(Some(Err(error))) if error == "mapped source failure"
        ));
        assert_eq!(stream.progress(), initial);
        assert!(matches!(
            stream.as_mut().poll_next(&mut context),
            Poll::Ready(None)
        ));
    }

    #[test]
    fn delivery_after_awaiting_and_changed_source_progress_remain_coherent() {
        let initial = MonitoredStreamProgress {
            previous: Some(3),
            latest_known: Some(3),
            status: MonitoredStreamStatus::AwaitingNewItems,
        };
        let discovered = MonitoredStreamProgress {
            previous: Some(4),
            latest_known: Some(6),
            status: MonitoredStreamStatus::FallenBehind,
        };
        let source = futures_util::stream::iter([
            Ok::<_, Infallible>(MonitoredStreamItem::Item(4_u64)),
            Ok(MonitoredStreamItem::Progress(discovered.clone())),
            Ok(MonitoredStreamItem::Item(5_u64)),
            Ok(MonitoredStreamItem::Item(6_u64)),
        ]);
        let mut stream = boxed_monitored_stream(source, initial, |position| Some(*position));
        let mut context = Context::from_waker(futures_util::task::noop_waker_ref());
        assert!(matches!(
            stream.as_mut().poll_next(&mut context),
            Poll::Ready(Some(Ok(MonitoredStreamItem::Item(4))))
        ));
        assert_eq!(
            stream.progress(),
            MonitoredStreamProgress {
                previous: Some(4),
                latest_known: Some(4),
                status: MonitoredStreamStatus::AwaitingNewItems,
            }
        );
        assert!(matches!(
            stream.as_mut().poll_next(&mut context),
            Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(progress)))) if progress == discovered
        ));
        assert_eq!(stream.progress(), discovered);
        for (position, status) in [
            (5, MonitoredStreamStatus::FallenBehind),
            (6, MonitoredStreamStatus::StreamingBacklog),
        ] {
            assert!(matches!(
                stream.as_mut().poll_next(&mut context),
                Poll::Ready(Some(Ok(MonitoredStreamItem::Item(delivered)))) if delivered == position
            ));
            assert_eq!(
                stream.progress(),
                MonitoredStreamProgress {
                    previous: Some(position),
                    latest_known: Some(6),
                    status,
                }
            );
        }
    }
}
