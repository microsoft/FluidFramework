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
    /// advance it.
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
/// TODO: Add a separate mechanism for connection health and whether timely delivery is currently
/// guaranteed. Those concerns are independent of buffered backlog.
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

#[cfg(test)]
mod tests {
    use std::{
        convert::Infallible,
        pin::Pin,
        task::{Context, Poll},
    };

    use futures_core::Stream;

    use super::{
        BoxMonitoredStream, MonitoredStream, MonitoredStreamItem, MonitoredStreamProgress,
        MonitoredStreamStatus,
    };

    struct EmptyStream {
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
}
