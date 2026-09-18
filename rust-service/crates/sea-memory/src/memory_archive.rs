//! Retained ordered data and lazy, lease-owning monitored reads.

use std::{
    collections::BTreeMap,
    ops::Bound::{Excluded, Included, Unbounded},
    pin::Pin,
    sync::{Arc, Mutex, Weak},
    task::{Context, Poll},
};

use futures_util::{Stream, task::AtomicWaker};
use sea_core::{
    EventPosition, MonitoredStream, MonitoredStreamItem, MonitoredStreamProgress,
    MonitoredStreamStatus, next::ArchiveStream,
};

use crate::MemoryStorageError;

/// Complete committed history plus weak subscriptions; dropped reads retain no registration.
#[derive(Debug)]
pub(crate) struct ArchiveData<Item> {
    /// Strictly ordered immutable entries.
    pub(crate) entries: BTreeMap<EventPosition, Item>,
    /// Readers to wake after committing an entry.
    readers: Vec<Weak<AtomicWaker>>,
}

impl<Item> Default for ArchiveData<Item> {
    fn default() -> Self {
        Self {
            entries: BTreeMap::new(),
            readers: Vec::new(),
        }
    }
}

impl<Item> ArchiveData<Item> {
    /// Returns the latest committed position, including sparse snapshot positions.
    pub(crate) fn head(&self) -> Option<EventPosition> {
        self.entries.last_key_value().map(|(position, _)| *position)
    }

    /// Commits one entry and returns live subscriptions to wake outside the history lock.
    pub(crate) fn insert(&mut self, position: EventPosition, item: Item) -> Vec<Arc<AtomicWaker>> {
        self.entries.insert(position, item);
        let mut readers = Vec::new();
        self.readers.retain(|reader| {
            if let Some(reader) = reader.upgrade() {
                readers.push(reader);
                true
            } else {
                false
            }
        });
        readers
    }
}

/// A read owns the opening even before initialization and after finite completion until dropped.
struct MemoryRead<Item> {
    /// Retained immutable entries and notification registrations.
    data: Arc<Mutex<ArchiveData<Item>>>,
    /// Prevents another writer opening while this stream exists.
    _opening: Arc<()>,
    /// Exclusive cursor, advanced only on data delivery.
    previous: Option<EventPosition>,
    /// Inclusive bound; absent for live delivery.
    stop_after: Option<EventPosition>,
    /// Notification registered under the same lock used by append.
    waker: Arc<AtomicWaker>,
    /// Bounds have been checked against an authoritative initialization head.
    initialized: bool,
    /// Terminal completion or failure has been returned.
    finished: bool,
    /// Empty ranges complete without validating future bounds or waiting.
    empty: bool,
    /// Last emitted observation prevents repeated progress-only delivery.
    reported: Option<MonitoredStreamProgress<EventPosition>>,
}

impl<Item> MemoryRead<Item> {
    /// Computes a coherent observation without advancing the delivered cursor.
    fn observe(&self, data: &ArchiveData<Item>) -> MonitoredStreamProgress<EventPosition> {
        let mut latest_known = self.previous;
        let mut status = MonitoredStreamStatus::StreamingBacklog;
        if self.initialized {
            let upper = self.stop_after.map_or(Unbounded, Included);
            if !self.empty {
                latest_known = latest_known.max(
                    data.entries
                        .range((Unbounded, upper))
                        .next_back()
                        .map(|(position, _)| *position),
                );
            }
            status = if latest_known == self.previous {
                MonitoredStreamStatus::AwaitingNewItems
            } else {
                let lower = self.previous.map_or(Unbounded, Excluded);
                if data.entries.range((lower, upper)).take(2).count() > 1 {
                    MonitoredStreamStatus::FallenBehind
                } else {
                    MonitoredStreamStatus::StreamingBacklog
                }
            };
        }
        MonitoredStreamProgress {
            previous: self.previous,
            latest_known,
            status,
        }
    }
}

impl<Item: Clone + Unpin> Stream for MemoryRead<Item> {
    type Item = Result<MonitoredStreamItem<Item, EventPosition>, MemoryStorageError>;

    fn poll_next(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        if this.finished {
            return Poll::Ready(None);
        }
        let mut data = this.data.lock().expect("archive lock");
        this.waker.register(context.waker());
        if !this.initialized {
            let head = data.head();
            if !this.empty
                && (this.previous.is_some_and(|bound| Some(bound) > head)
                    || this.stop_after.is_some_and(|bound| Some(bound) > head))
            {
                this.finished = true;
                return Poll::Ready(Some(Err(MemoryStorageError::InvalidPosition)));
            }
            this.initialized = true;
            data.readers.retain(|reader| reader.strong_count() != 0);
            data.readers.push(Arc::downgrade(&this.waker));
            let progress = this.observe(&data);
            this.reported = Some(progress.clone());
            return Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(progress))));
        }
        if !this.empty {
            let lower = this.previous.map_or(Unbounded, Excluded);
            let upper = this.stop_after.map_or(Unbounded, Included);
            if let Some((position, item)) = data.entries.range((lower, upper)).next() {
                this.previous = Some(*position);
                return Poll::Ready(Some(Ok(MonitoredStreamItem::Item(item.clone()))));
            }
        }
        let progress = this.observe(&data);
        if this.reported.as_ref() != Some(&progress) {
            this.reported = Some(progress.clone());
            return Poll::Ready(Some(Ok(MonitoredStreamItem::Progress(progress))));
        }
        if this.empty || this.stop_after.is_some() {
            this.finished = true;
            Poll::Ready(None)
        } else {
            Poll::Pending
        }
    }
}

impl<Item: Clone + Unpin> MonitoredStream for MemoryRead<Item> {
    type Data = Item;
    type Position = EventPosition;
    type Error = MemoryStorageError;

    fn progress(&self) -> MonitoredStreamProgress<Self::Position> {
        self.observe(&self.data.lock().expect("archive lock"))
    }
}

/// Creates a lazy reader; no state lock or initialization is performed here.
pub(crate) fn read<Item: Clone + Send + Unpin + 'static>(
    data: Arc<Mutex<ArchiveData<Item>>>,
    opening: Arc<()>,
    after: Option<EventPosition>,
    stop_after: Option<EventPosition>,
) -> ArchiveStream<Item, EventPosition, MemoryStorageError> {
    Box::pin(MemoryRead {
        data,
        _opening: opening,
        previous: after,
        stop_after,
        waker: Arc::new(AtomicWaker::new()),
        initialized: false,
        finished: false,
        empty: matches!((after, stop_after), (Some(after), Some(stop)) if after >= stop),
        reported: None,
    })
}
