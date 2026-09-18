//! Retained ordered data and lazy monitored reads independent of writable openings.

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

/// Complete committed history plus weak subscriptions that do not keep dropped reads alive.
#[derive(Debug)]
pub(crate) struct ArchiveData<Item> {
    /// Strictly ordered immutable entries.
    ///
    /// Archives are append-only, so a sorted vector could reduce allocation overhead and improve locality.
    /// Binary search would retain O(log N) lookup for sparse snapshot positions, like this `BTreeMap`.
    /// Event archives have dense positions, so they could benefit further from
    /// O(1) indexing by position minus one, without storing separate map keys.
    /// For now a `BTreeMap` is used for simplicity of implementation.
    pub(crate) entries: BTreeMap<EventPosition, Item>,
    /// Readers to wake after committing an entry; dead registrations are pruned on insert or initialization.
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
    ///
    /// # Panics
    ///
    /// Panics before modifying history if the position does not strictly advance the head.
    pub(crate) fn insert(&mut self, position: EventPosition, item: Item) -> Vec<Arc<AtomicWaker>> {
        assert!(
            self.head().is_none_or(|head| position > head),
            "archive inserts must strictly advance the head"
        );
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

/// A read retains its archive independently of writable components and subsequent openings.
struct MemoryRead<Item> {
    /// Retained entries and notification registrations, without writer ownership.
    data: Arc<Mutex<ArchiveData<Item>>>,
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
/// Only archive data is retained, so readers do not prevent a new writable opening.
pub(crate) fn read<Item: Clone + Send + Unpin + 'static>(
    data: Arc<Mutex<ArchiveData<Item>>>,
    after: Option<EventPosition>,
    stop_after: Option<EventPosition>,
) -> ArchiveStream<Item, EventPosition, MemoryStorageError> {
    Box::pin(MemoryRead {
        data,
        previous: after,
        stop_after,
        waker: Arc::new(AtomicWaker::new()),
        initialized: false,
        finished: false,
        empty: matches!((after, stop_after), (Some(after), Some(stop)) if after >= stop),
        reported: None,
    })
}

#[cfg(test)]
mod tests {
    use std::panic::{AssertUnwindSafe, catch_unwind};

    use futures_util::{FutureExt, StreamExt};

    use super::*;

    /// Checks that progress reflects only unread in-range entries and the delivered cursor.
    fn assert_range_progress(
        progress: &MonitoredStreamProgress<EventPosition>,
        previous: Option<EventPosition>,
        positions: &[u64],
        stop: u64,
        empty: bool,
    ) {
        assert_eq!(progress.previous, previous);
        let remaining: Vec<_> = positions
            .iter()
            .copied()
            .filter(|ordinal| {
                !empty && Some(EventPosition::new(*ordinal)) > previous && *ordinal <= stop
            })
            .collect();
        assert_eq!(
            progress.latest_known,
            remaining
                .last()
                .copied()
                .map(EventPosition::new)
                .or(previous)
        );
        assert_eq!(
            progress.status,
            match remaining.len() {
                0 => MonitoredStreamStatus::AwaitingNewItems,
                1 => MonitoredStreamStatus::StreamingBacklog,
                _ => MonitoredStreamStatus::FallenBehind,
            }
        );
    }

    #[test]
    fn finite_reads_check_sparse_bounds_progress_and_completion() {
        for positions in [vec![], vec![2, 5, 9]] {
            let mut archive = ArchiveData::default();
            for &ordinal in &positions {
                let position = EventPosition::new(ordinal);
                archive.insert(position, position);
            }
            let data = Arc::new(Mutex::new(archive));
            let head = positions.last().copied();
            for after in [None, Some(1), Some(2), Some(3), Some(5), Some(9), Some(10)] {
                for stop in [1, 2, 3, 5, 6, 9, 10] {
                    let mut stream = read(
                        data.clone(),
                        after.map(EventPosition::new),
                        Some(EventPosition::new(stop)),
                    );
                    let initial = stream.progress();
                    assert_eq!(initial.previous, after.map(EventPosition::new));
                    assert_eq!(initial.latest_known, initial.previous);
                    assert_eq!(initial.status, MonitoredStreamStatus::StreamingBacklog);

                    let empty = after.is_some_and(|after| after >= stop);
                    let invalid = !empty && (after > head || Some(stop) > head);
                    let mut previous = initial.previous;
                    let mut delivered = Vec::new();
                    let mut errors = 0;
                    let mut completed = false;
                    for _ in 0..positions.len() + 3 {
                        let next = stream
                            .next()
                            .now_or_never()
                            .expect("finite read must not wait");
                        match next {
                            None => {
                                completed = true;
                                break;
                            }
                            Some(Err(MemoryStorageError::InvalidPosition)) => errors += 1,
                            Some(Err(error)) => panic!("unexpected read error: {error}"),
                            Some(Ok(item)) => {
                                assert!(!invalid);
                                if let MonitoredStreamItem::Item(position) = item {
                                    assert!(Some(position) > previous);
                                    previous = Some(position);
                                    delivered.push(position.get());
                                } else if let MonitoredStreamItem::Progress(progress) = item {
                                    assert_eq!(progress, stream.progress());
                                }
                                assert_range_progress(
                                    &stream.progress(),
                                    previous,
                                    &positions,
                                    stop,
                                    empty,
                                );
                            }
                        }
                    }
                    assert!(completed, "finite read must terminate");
                    assert_eq!(errors, usize::from(invalid));
                    let expected: Vec<_> = positions
                        .iter()
                        .copied()
                        .filter(|ordinal| {
                            !invalid && !empty && Some(*ordinal) > after && *ordinal <= stop
                        })
                        .collect();
                    assert_eq!(delivered, expected);
                    assert!(matches!(stream.next().now_or_never(), Some(None)));
                }
            }
        }
    }

    #[test]
    fn dropped_readers_are_pruned_without_retaining_their_wakers() {
        let data = Arc::new(Mutex::new(ArchiveData::<EventPosition>::default()));
        let mut first = read(data.clone(), None, None);
        assert!(matches!(first.next().now_or_never(), Some(Some(Ok(_)))));
        let registration = data.lock().unwrap().readers[0].clone();
        drop(first);
        assert!(registration.upgrade().is_none());

        let mut second = read(data.clone(), None, None);
        assert!(matches!(second.next().now_or_never(), Some(Some(Ok(_)))));
        assert_eq!(data.lock().unwrap().readers.len(), 1);
        let position = EventPosition::new(1);
        assert_eq!(data.lock().unwrap().insert(position, position).len(), 1);
        drop(second);
        let position = EventPosition::new(2);
        let mut archive = data.lock().unwrap();
        assert!(archive.insert(position, position).is_empty());
        assert!(archive.readers.is_empty());
    }

    #[test]
    fn inserts_accept_strictly_increasing_sparse_positions() {
        let mut data = ArchiveData::default();
        data.insert(EventPosition::new(2), "first");
        data.insert(EventPosition::new(5), "second");

        assert_eq!(data.head(), Some(EventPosition::new(5)));
        assert_eq!(
            data.entries,
            BTreeMap::from([
                (EventPosition::new(2), "first"),
                (EventPosition::new(5), "second"),
            ])
        );
    }

    #[test]
    fn nonadvancing_inserts_panic_without_modifying_history() {
        let mut data = ArchiveData::default();
        data.insert(EventPosition::new(2), "first");
        data.insert(EventPosition::new(5), "second");
        let original = data.entries.clone();

        for ordinal in [1, 2, 4, 5] {
            let result = catch_unwind(AssertUnwindSafe(|| {
                data.insert(EventPosition::new(ordinal), "invalid");
            }));
            assert!(result.is_err(), "position {ordinal} must be rejected");
            assert_eq!(data.entries, original);
        }
    }
}
