//! Lazy bounded and live reads over an opening's recovered indexes.

use crate::{
    Error, Journal,
    storage::{Handle, Opening, snapshot},
};
use futures_util::{
    Stream, StreamExt,
    stream::{self, BoxStream},
};
use sea_core::{
    BlobTreeId, CommittedEvent, EventPosition, MonitoredStream, MonitoredStreamItem,
    MonitoredStreamProgress, MonitoredStreamStatus, map_monitored_stream,
    storage::{ArchiveStream, Snapshot},
};
use std::{
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};

/// One indexed archive entry before its typed stream conversion.
enum Entry {
    /// Full event loaded lazily from the provider.
    Event(CommittedEvent),
    /// Root identity of a sparse snapshot publication.
    Snapshot(EventPosition, BlobTreeId),
}

impl Entry {
    /// Returns the common archive cursor.
    fn position(&self) -> EventPosition {
        match self {
            Self::Event(event) => event.position,
            Self::Snapshot(position, _) => *position,
        }
    }
}

/// State retained by the asynchronous source between polls.
struct Cursor<J: Journal> {
    /// Owns the exclusive opening while a stream exists.
    opening: Arc<Opening<J>>,
    /// Selects snapshot indexes instead of event indexes.
    snapshots: bool,
    /// Last delivered position.
    after: Option<EventPosition>,
    /// Optional inclusive terminal bound.
    stop: Option<EventPosition>,
    /// Bounds have been checked against the initialization head.
    initialized: bool,
    /// Terminal result has already been delivered.
    done: bool,
}

/// Stream progress can observe locally committed writes without polling the reader.
struct Reader<J: Journal> {
    /// Owns asynchronous provider reads without a background task.
    source: BoxStream<'static, Result<MonitoredStreamItem<Entry, EventPosition>, Error>>,
    /// Allows pressure observations while the consumer is idle.
    opening: Arc<Opening<J>>,
    /// Selects the appropriate archive head.
    snapshots: bool,
    /// Inclusive read bound.
    stop: Option<EventPosition>,
    /// Last delivered progress, excluding merely fetched bytes.
    progress: MonitoredStreamProgress<EventPosition>,
}

impl<J: Journal> Unpin for Reader<J> {}

impl<J: Journal> Stream for Reader<J> {
    type Item = Result<MonitoredStreamItem<Entry, EventPosition>, Error>;
    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        let result = this.source.as_mut().poll_next(cx);
        match &result {
            Poll::Ready(Some(Ok(MonitoredStreamItem::Item(entry)))) => {
                this.progress.previous = Some(entry.position());
                this.progress.latest_known = this.progress.latest_known.max(this.progress.previous);
                this.progress.status = MonitoredStreamStatus::StreamingBacklog;
            }
            Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(progress)))) => {
                this.progress = progress.clone();
            }
            _ => {}
        }
        result
    }
}

impl<J: Journal> MonitoredStream for Reader<J> {
    type Data = Entry;
    type Position = EventPosition;
    type Error = Error;
    fn progress(&self) -> MonitoredStreamProgress<EventPosition> {
        let mut progress = self.progress.clone();
        if let Ok(state) = self.opening.state.try_lock() {
            let head = if self.snapshots {
                state
                    .index
                    .snapshots
                    .range(..=self.stop.unwrap_or(EventPosition::new(u64::MAX)))
                    .next_back()
                    .map(|(p, _)| *p)
            } else {
                state
                    .index
                    .events
                    .range(..=self.stop.unwrap_or(EventPosition::new(u64::MAX)))
                    .next_back()
                    .map(|(p, _)| *p)
            };
            progress.latest_known = progress.latest_known.max(head);
            if progress.previous < progress.latest_known {
                progress.status = MonitoredStreamStatus::FallenBehind;
            }
        }
        progress
    }
}

/// Creates the common lazy stream, checking future bounds only on first polling.
fn read<J: Journal>(
    opening: Arc<Opening<J>>,
    snapshots: bool,
    after: Option<EventPosition>,
    stop: Option<EventPosition>,
) -> ArchiveStream<Entry, EventPosition, Error> {
    let cursor = Cursor {
        opening: opening.clone(),
        snapshots,
        after,
        stop,
        initialized: false,
        done: false,
    };
    let source = stream::unfold(cursor, |mut cursor| async move {
        if cursor.done {
            return None;
        }
        let outcome = next(&mut cursor).await;
        match outcome {
            Ok(Some(item)) => Some((Ok(item), cursor)),
            Ok(None) => None,
            Err(error) => {
                cursor.done = true;
                Some((Err(error), cursor))
            }
        }
    })
    .boxed();
    Box::pin(Reader {
        source,
        opening,
        snapshots,
        stop,
        progress: MonitoredStreamProgress {
            previous: after,
            latest_known: after,
            status: MonitoredStreamStatus::StreamingBacklog,
        },
    })
}

/// Produces one data or progress observation without holding a lock during idle waits.
async fn next<J: Journal>(
    cursor: &mut Cursor<J>,
) -> crate::Result<Option<MonitoredStreamItem<Entry, EventPosition>>> {
    let mut state = cursor.opening.state.lock().await;
    state.check().await?;
    if matches!((cursor.after, cursor.stop), (Some(after), Some(stop)) if after >= stop) {
        return Ok(None);
    }
    let head = if cursor.snapshots {
        state.index.snapshots.last_key_value().map(|(p, _)| *p)
    } else {
        state.index.events.last_key_value().map(|(p, _)| *p)
    };
    if !cursor.initialized {
        if cursor.after > head || cursor.stop > head {
            return Err(Error::new(
                sea_core::ErrorKind::InvalidPosition,
                "read bound exceeds initialization head",
            ));
        }
        cursor.initialized = true;
    }
    let bounds = (
        cursor
            .after
            .map_or(std::ops::Bound::Unbounded, std::ops::Bound::Excluded),
        cursor
            .stop
            .map_or(std::ops::Bound::Unbounded, std::ops::Bound::Included),
    );
    let item = if cursor.snapshots {
        state
            .index
            .snapshots
            .range(bounds)
            .next()
            .map(|(p, root)| Entry::Snapshot(*p, *root))
    } else if let Some(position) = state.index.events.range(bounds).next().map(|(p, _)| *p) {
        Some(Entry::Event(state.event(position).await?))
    } else {
        None
    };
    if let Some(item) = item {
        cursor.after = Some(item.position());
        return Ok(Some(MonitoredStreamItem::Item(item)));
    }
    if cursor.stop.is_some() {
        return Ok(None);
    }
    drop(state);
    tokio::time::sleep(Duration::from_millis(25)).await;
    Ok(Some(MonitoredStreamItem::Progress(
        MonitoredStreamProgress {
            previous: cursor.after,
            latest_known: cursor.after,
            status: MonitoredStreamStatus::AwaitingNewItems,
        },
    )))
}

/// Converts common entries into committed event values.
pub(crate) fn events<J: Journal>(
    opening: Arc<Opening<J>>,
    after: Option<EventPosition>,
    stop: Option<EventPosition>,
) -> ArchiveStream<CommittedEvent, EventPosition, Error> {
    map_monitored_stream(
        read(opening, false, after, stop),
        |entry| match entry {
            Entry::Event(event) => Ok(event),
            Entry::Snapshot(_, _) => Err(Error::corrupt("event stream kind")),
        },
        |error| error,
    )
}

/// A snapshot's two opening-scoped availability capabilities.
type SnapshotValue<J> = Snapshot<Handle<J, BlobTreeId>, Handle<J, EventPosition>>;

/// Converts snapshot identities into opening-scoped availability capabilities.
pub(crate) fn snapshots<J: Journal>(
    opening: Arc<Opening<J>>,
    after: Option<EventPosition>,
    stop: Option<EventPosition>,
) -> ArchiveStream<SnapshotValue<J>, EventPosition, Error> {
    map_monitored_stream(
        read(opening.clone(), true, after, stop),
        move |entry| match entry {
            Entry::Snapshot(position, root) => Ok(snapshot(&opening, root, position)),
            Entry::Event(_) => Err(Error::corrupt("snapshot stream kind")),
        },
        |error| error,
    )
}
