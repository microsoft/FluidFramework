#![doc = "In-memory reference implementation of the Sea event archive contracts."]
#![doc = ""]
#![doc = "Appends are visible to handles in this process and report memory durability;"]
#![doc = "records and snapshots are lost when the last handle is dropped."]

use std::{collections::BTreeMap, sync::Arc};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::stream;
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, Durability, ErrorKind,
    Event, EventPosition, SnapshotId,
    archive::{
        CommittedEvent as ArchiveCommittedEvent, EventReceipt as ArchiveEventReceipt, OperationId,
        PublishedSnapshot as ArchivePublishedSnapshot, SnapshotPosition as ArchiveSnapshotPosition,
        SnapshotPublication, StorageEventStream, StorageLoad,
    },
};
use thiserror::Error;
use tokio::sync::Mutex;

/// Failures produced by the in-memory stream and snapshot store.
#[derive(Debug, Error)]
pub enum MemoryError {
    /// A position does not identify a committed record.
    #[error("position is beyond the committed head")]
    InvalidPosition,
    /// A position token has the wrong length or encodes ordinal zero.
    #[error("position token is malformed")]
    InvalidPositionToken,
    /// The supplied expected parent is not the latest snapshot.
    #[error("snapshot parent does not match the latest snapshot")]
    SnapshotConflict,
    /// A snapshot includes fewer records than its predecessor.
    #[error("snapshot position regresses behind the latest snapshot")]
    SnapshotRegression,
    /// A referenced blob-tree node is unavailable.
    #[error("referenced blob-tree node is unavailable")]
    MissingBlobTree,
    /// A stable operation identity was reused with different publication input.
    #[error("operation identity is already bound to different input")]
    OperationConflict,
    /// This in-memory archive cannot assign another position or snapshot identity.
    #[error("numeric identity space is exhausted")]
    IdentityExhausted,
}

impl ClassifiedError for MemoryError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::InvalidPosition | Self::InvalidPositionToken => ErrorKind::InvalidPosition,
            Self::SnapshotConflict | Self::SnapshotRegression | Self::OperationConflict => {
                ErrorKind::Conflict
            }
            Self::MissingBlobTree | Self::IdentityExhausted => ErrorKind::Rejected,
        }
    }
}

/// State used by the final Sea archive contract during migration.
#[derive(Debug, Default)]
struct ArchiveState {
    events: Vec<ArchiveCommittedEvent>,
    blobs: BTreeMap<BlobId, Bytes>,
    directories: BTreeMap<BlobDirectoryId, BlobDirectory>,
    snapshots: Vec<ArchivePublishedSnapshot>,
    snapshot_operations: BTreeMap<OperationId, (SnapshotPublication, ArchivePublishedSnapshot)>,
    next_snapshot_id: u64,
}

/// Mutable state shared by cloned handles to one stream.
#[derive(Debug)]
struct State {
    /// Current Sea archive state.
    archive: ArchiveState,
}

/// A cloneable, process-local implementation of append and snapshot contracts.
#[derive(Clone, Debug)]
pub struct MemoryStream {
    /// Append records and snapshot state shared by cloned handles.
    state: Arc<Mutex<State>>,
}

impl Default for MemoryStream {
    fn default() -> Self {
        Self::new()
    }
}

impl MemoryStream {
    /// Creates an empty stream.
    #[must_use]
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(State {
                archive: ArchiveState {
                    next_snapshot_id: 1,
                    ..ArchiveState::default()
                },
            })),
        }
    }

    fn validate_archive_position(position: EventPosition, len: usize) -> Result<(), MemoryError> {
        let ordinal = position.get();
        if ordinal == 0 || ordinal > len as u64 {
            return Err(MemoryError::InvalidPosition);
        }
        Ok(())
    }

    fn validate_tree(state: &ArchiveState, root: BlobTreeId) -> Result<(), MemoryError> {
        match root {
            BlobTreeId::Blob(id) => state
                .blobs
                .contains_key(&id)
                .then_some(())
                .ok_or(MemoryError::MissingBlobTree),
            BlobTreeId::Directory(id) => {
                let directory = state
                    .directories
                    .get(&id)
                    .ok_or(MemoryError::MissingBlobTree)?;
                for child in directory.entries().values() {
                    Self::validate_tree(state, *child)?;
                }
                Ok(())
            }
        }
    }
}

#[async_trait]
impl sea_core::archive::SeaStorage for MemoryStream {
    type Error = MemoryError;

    fn durability(&self) -> Durability {
        Durability::Memory
    }

    async fn put_blob(&self, payload: Bytes) -> Result<BlobId, Self::Error> {
        let id = BlobId::for_bytes(&payload);
        self.state
            .lock()
            .await
            .archive
            .blobs
            .entry(id)
            .or_insert(payload);
        Ok(id)
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        self.state
            .lock()
            .await
            .archive
            .blobs
            .get(&id)
            .cloned()
            .ok_or(MemoryError::MissingBlobTree)
    }

    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<BlobDirectoryId, Self::Error> {
        let mut state = self.state.lock().await;
        for child in directory.entries().values() {
            Self::validate_tree(&state.archive, *child)?;
        }
        let id = directory.id().map_err(|_| MemoryError::MissingBlobTree)?;
        state.archive.directories.entry(id).or_insert(directory);
        Ok(id)
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        self.state
            .lock()
            .await
            .archive
            .directories
            .get(&id)
            .cloned()
            .ok_or(MemoryError::MissingBlobTree)
    }

    async fn append(&self, event: Event) -> Result<ArchiveEventReceipt, Self::Error> {
        let mut state = self.state.lock().await;
        if let Some(root) = event.blob_tree {
            Self::validate_tree(&state.archive, root)?;
        }
        let ordinal = u64::try_from(state.archive.events.len())
            .ok()
            .and_then(|value| value.checked_add(1))
            .ok_or(MemoryError::IdentityExhausted)?;
        let position = EventPosition::new(ordinal);
        state
            .archive
            .events
            .push(ArchiveCommittedEvent { position, event });
        Ok(ArchiveEventReceipt {
            position,
            durability: Durability::Memory,
        })
    }

    async fn read(
        &self,
        after: Option<EventPosition>,
        through: Option<EventPosition>,
    ) -> Result<StorageEventStream<Self::Error>, Self::Error> {
        let state = self.state.lock().await;
        if let Some(position) = after {
            Self::validate_archive_position(position, state.archive.events.len())?;
        }
        if let Some(position) = through {
            Self::validate_archive_position(position, state.archive.events.len())?;
        }
        let start = after
            .map(|position| usize::try_from(position.get()))
            .transpose()
            .map_err(|_| MemoryError::InvalidPosition)?
            .unwrap_or(0);
        let end = through
            .map(|position| usize::try_from(position.get()))
            .transpose()
            .map_err(|_| MemoryError::InvalidPosition)?
            .unwrap_or(state.archive.events.len());
        if end < start {
            return Err(MemoryError::InvalidPosition);
        }
        let events = state.archive.events[start..end].to_vec();
        Ok(Box::pin(stream::iter(events.into_iter().map(Ok))))
    }

    async fn head(&self) -> Result<Option<EventPosition>, Self::Error> {
        let len = self.state.lock().await.archive.events.len();
        Ok((len > 0).then(|| EventPosition::new(len as u64)))
    }

    async fn snapshot(
        &self,
        id: &SnapshotId,
    ) -> Result<Option<ArchivePublishedSnapshot>, Self::Error> {
        Ok(self
            .state
            .lock()
            .await
            .archive
            .snapshots
            .iter()
            .find(|snapshot| &snapshot.id == id)
            .cloned())
    }

    async fn latest_snapshot(&self) -> Result<Option<ArchivePublishedSnapshot>, Self::Error> {
        Ok(self.state.lock().await.archive.snapshots.last().cloned())
    }

    async fn snapshot_at_or_before(
        &self,
        position: EventPosition,
    ) -> Result<Option<ArchivePublishedSnapshot>, Self::Error> {
        let state = self.state.lock().await;
        Self::validate_archive_position(position, state.archive.events.len())?;
        Ok(state
            .archive
            .snapshots
            .iter()
            .rev()
            .find(|snapshot| match snapshot.snapshot.at_event {
                ArchiveSnapshotPosition::Initial => true,
                ArchiveSnapshotPosition::At(at_event) => at_event <= position,
            })
            .cloned())
    }

    async fn publish_snapshot(
        &self,
        publication: SnapshotPublication,
    ) -> Result<ArchivePublishedSnapshot, Self::Error> {
        let mut state = self.state.lock().await;
        if let Some((original, published)) = state
            .archive
            .snapshot_operations
            .get(&publication.operation_id)
        {
            return if original == &publication {
                Ok(published.clone())
            } else {
                Err(MemoryError::OperationConflict)
            };
        }
        let actual_parent = state.archive.snapshots.last().map(|snapshot| &snapshot.id);
        if actual_parent != publication.expected_parent.as_ref() {
            return Err(MemoryError::SnapshotConflict);
        }
        if let ArchiveSnapshotPosition::At(position) = publication.snapshot.at_event {
            Self::validate_archive_position(position, state.archive.events.len())?;
        }
        if state
            .archive
            .snapshots
            .last()
            .is_some_and(|previous| previous.snapshot.at_event > publication.snapshot.at_event)
        {
            return Err(MemoryError::SnapshotRegression);
        }
        Self::validate_tree(&state.archive, publication.snapshot.root)?;
        let id = SnapshotId::from_bytes(Bytes::copy_from_slice(
            &state.archive.next_snapshot_id.to_be_bytes(),
        ));
        state.archive.next_snapshot_id = state
            .archive
            .next_snapshot_id
            .checked_add(1)
            .ok_or(MemoryError::IdentityExhausted)?;
        let published = ArchivePublishedSnapshot {
            id,
            parent: publication.expected_parent.clone(),
            snapshot: publication.snapshot.clone(),
        };
        state.archive.snapshots.push(published.clone());
        state.archive.snapshot_operations.insert(
            publication.operation_id.clone(),
            (publication, published.clone()),
        );
        Ok(published)
    }

    async fn resolve_snapshot_publication(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<ArchivePublishedSnapshot>, Self::Error> {
        Ok(self
            .state
            .lock()
            .await
            .archive
            .snapshot_operations
            .get(operation_id)
            .map(|(_, published)| published.clone()))
    }

    async fn load(
        &self,
        required: Option<EventPosition>,
    ) -> Result<StorageLoad<Self::Error>, Self::Error> {
        let state = self.state.lock().await;
        if let Some(position) = required {
            Self::validate_archive_position(position, state.archive.events.len())?;
        }
        let snapshot = match required {
            Some(position) => state
                .archive
                .snapshots
                .iter()
                .rev()
                .find(|snapshot| match snapshot.snapshot.at_event {
                    ArchiveSnapshotPosition::Initial => true,
                    ArchiveSnapshotPosition::At(at_event) => at_event <= position,
                })
                .cloned(),
            None => state.archive.snapshots.last().cloned(),
        };
        let start = match snapshot.as_ref().map(|snapshot| snapshot.snapshot.at_event) {
            None | Some(ArchiveSnapshotPosition::Initial) => 0,
            Some(ArchiveSnapshotPosition::At(position)) => {
                usize::try_from(position.get()).map_err(|_| MemoryError::InvalidPosition)?
            }
        };
        let head = state.archive.events.last().map(|event| event.position);
        let events = state.archive.events[start..].to_vec();
        Ok(StorageLoad {
            snapshot,
            head,
            events: Box::pin(stream::iter(events.into_iter().map(Ok))),
        })
    }
}

#[cfg(all(test, any()))]
mod tests {
    use std::sync::atomic::{AtomicBool, Ordering};

    use futures_util::{StreamExt, TryStreamExt};
    use sea_core::{
        Capabilities, ClassifiedError, ErrorKind, EventReceipt, EventStream, PublishedSnapshot,
        Snapshot, SnapshotId, SnapshotPosition, SnapshotStore, StreamReader,
    };

    use super::*;

    /// Selects whether an injected ambiguous append fails before or after commit.
    #[derive(Clone, Copy, Debug)]
    enum AmbiguousAppend {
        /// Return ambiguity without committing the payload.
        BeforeCommit,
        /// Commit the payload before returning ambiguity.
        AfterCommit,
    }

    /// Error surface used to exercise client reconciliation and reader interruption.
    #[derive(Debug, thiserror::Error)]
    enum FaultError {
        /// A failure from the underlying in-memory implementation.
        #[error(transparent)]
        Memory(#[from] MemoryError),
        /// An append whose commit outcome is deliberately hidden.
        #[error("append outcome is ambiguous")]
        Ambiguous,
        /// A reader that becomes unavailable after yielding one record.
        #[error("reader was interrupted")]
        Interrupted,
    }

    impl ClassifiedError for FaultError {
        fn kind(&self) -> ErrorKind {
            match self {
                Self::Memory(error) => error.kind(),
                Self::Ambiguous => ErrorKind::Ambiguous,
                Self::Interrupted => ErrorKind::Unavailable,
            }
        }
    }

    /// A test adapter that injects one append or read failure mode.
    #[derive(Clone, Debug)]
    struct FaultingMemoryStream {
        /// The implementation under test.
        inner: MemoryStream,
        /// Optional ambiguous outcome for every append through this adapter.
        ambiguous_append: Option<AmbiguousAppend>,
        /// Shared one-shot flag that interrupts the next reader.
        interrupt_next_read: Arc<AtomicBool>,
    }

    impl FaultingMemoryStream {
        /// Wraps a stream with a selected ambiguous append outcome.
        fn ambiguous(inner: MemoryStream, outcome: AmbiguousAppend) -> Self {
            Self {
                inner,
                ambiguous_append: Some(outcome),
                interrupt_next_read: Arc::new(AtomicBool::new(false)),
            }
        }

        /// Wraps a stream so the next reader fails after its first record.
        fn interrupt_next_read(inner: MemoryStream) -> Self {
            Self {
                inner,
                ambiguous_append: None,
                interrupt_next_read: Arc::new(AtomicBool::new(true)),
            }
        }
    }

    #[async_trait]
    impl EventStream for FaultingMemoryStream {
        type Position = MemoryPosition;
        type Error = FaultError;

        fn capabilities(&self) -> Capabilities {
            self.inner.capabilities()
        }

        async fn append(&self, value: Bytes) -> Result<EventReceipt<Self::Position>, Self::Error> {
            match self.ambiguous_append {
                Some(AmbiguousAppend::BeforeCommit) => Err(FaultError::Ambiguous),
                Some(AmbiguousAppend::AfterCommit) => {
                    self.inner.append(value).await?;
                    Err(FaultError::Ambiguous)
                }
                None => self.inner.append(value).await.map_err(Into::into),
            }
        }

        async fn read(
            &self,
            after: Option<&Self::Position>,
        ) -> Result<StreamReader<Self::Position, Self::Error>, Self::Error> {
            let reader = self.inner.read(after).await?;
            if self.interrupt_next_read.swap(false, Ordering::SeqCst) {
                Ok(Box::pin(reader.enumerate().take(2).map(|(index, item)| {
                    if index == 1 {
                        Err(FaultError::Interrupted)
                    } else {
                        item.map_err(Into::into)
                    }
                })))
            } else {
                Ok(Box::pin(reader.map_err(Into::into)))
            }
        }

        async fn head(&self) -> Result<Option<Self::Position>, Self::Error> {
            self.inner.head().await.map_err(Into::into)
        }
    }

    #[async_trait]
    impl SnapshotStore for FaultingMemoryStream {
        type Position = MemoryPosition;
        type Error = FaultError;

        async fn latest(&self) -> Result<Option<PublishedSnapshot<Self::Position>>, Self::Error> {
            self.inner.latest().await.map_err(Into::into)
        }

        async fn publish(
            &self,
            snapshot: Snapshot<Self::Position>,
            expected_parent: Option<&SnapshotId>,
        ) -> Result<SnapshotId, Self::Error> {
            self.inner
                .publish(snapshot, expected_parent)
                .await
                .map_err(Into::into)
        }
    }

    #[tokio::test]
    async fn passes_shared_conformance() {
        sea_conformance::run_conformance(MemoryStream::new).await;
    }

    #[tokio::test]
    async fn passes_position_codec_conformance() {
        sea_conformance::run_position_codec_conformance(MemoryStream::new, b"malformed").await;
    }

    #[tokio::test]
    async fn passes_final_storage_conformance() {
        sea_conformance::run_sea_storage_conformance(MemoryStream::new).await;
    }

    #[tokio::test]
    async fn append_reports_memory_durability() {
        let stream = MemoryStream::new();
        let receipt = stream.append(Bytes::from_static(b"value")).await.unwrap();

        assert_eq!(receipt.durability, Durability::Memory);
    }

    #[tokio::test]
    async fn ambiguous_append_outcomes_are_reconciled_by_committed_state() {
        for (outcome, expected_payloads) in [
            (AmbiguousAppend::BeforeCommit, Vec::new()),
            (
                AmbiguousAppend::AfterCommit,
                vec![Bytes::from_static(b"uncertain")],
            ),
        ] {
            let stream = FaultingMemoryStream::ambiguous(MemoryStream::new(), outcome);
            let error = stream
                .append(Bytes::from_static(b"uncertain"))
                .await
                .expect_err("fault plan should hide the append outcome");
            assert_eq!(error.kind(), ErrorKind::Ambiguous);

            let committed = stream
                .read(None)
                .await
                .expect("reconciliation reader")
                .try_collect::<Vec<_>>()
                .await
                .expect("reconciliation records");
            assert_eq!(
                committed
                    .into_iter()
                    .map(|record| record.payload)
                    .collect::<Vec<_>>(),
                expected_payloads
            );
        }
    }

    #[tokio::test]
    async fn interrupted_reader_does_not_affect_independent_reader() {
        let inner = MemoryStream::new();
        for payload in [b"one".as_slice(), b"two".as_slice(), b"three".as_slice()] {
            inner.append(Bytes::copy_from_slice(payload)).await.unwrap();
        }
        let stream = FaultingMemoryStream::interrupt_next_read(inner);
        let mut interrupted = stream.read(None).await.unwrap();
        let independent = stream.read(None).await.unwrap();

        assert_eq!(
            interrupted.next().await.unwrap().unwrap().payload,
            Bytes::from_static(b"one")
        );
        let error = interrupted.next().await.unwrap().unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Unavailable);
        assert!(interrupted.next().await.is_none());
        let records = independent.try_collect::<Vec<_>>().await.unwrap();
        assert_eq!(records.len(), 3);
        assert_eq!(records[2].payload, Bytes::from_static(b"three"));
    }

    #[tokio::test]
    async fn snapshot_recovery_observes_committed_ambiguous_append() {
        let inner = MemoryStream::new();
        let position = inner
            .append(Bytes::from_static(b"snapshotted"))
            .await
            .unwrap()
            .position;
        inner
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::At(position),
                    payload: Bytes::from_static(b"state-at-snapshot"),
                },
                None,
            )
            .await
            .unwrap();
        let stream = FaultingMemoryStream::ambiguous(inner, AmbiguousAppend::AfterCommit);
        assert_eq!(
            stream
                .append(Bytes::from_static(b"after-snapshot"))
                .await
                .unwrap_err()
                .kind(),
            ErrorKind::Ambiguous
        );

        let latest = stream.latest().await.unwrap().unwrap();
        let SnapshotPosition::At(position) = latest.snapshot.at_event else {
            panic!("snapshot should include a committed position");
        };
        let recovered = stream
            .read(Some(&position))
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].payload, Bytes::from_static(b"after-snapshot"));
    }

    #[tokio::test]
    async fn position_codec_round_trips_and_rejects_invalid_tokens() {
        let stream = MemoryStream::new();
        let receipt = stream.append(Bytes::from_static(b"value")).await.unwrap();
        let token = stream.encode_position(&receipt.position).unwrap();
        assert_eq!(token.len(), 8);
        assert_eq!(stream.decode_position(&token).unwrap(), receipt.position);
        assert_eq!(
            stream.decode_position(b"short").unwrap_err().kind(),
            ErrorKind::InvalidPosition
        );

        let other = MemoryStream::new();
        assert_eq!(other.decode_position(&token).unwrap(), receipt.position);
        assert_eq!(other.encode_position(&receipt.position).unwrap(), token);
    }

    #[tokio::test]
    async fn reads_append_boundaries_in_order() {
        let stream = MemoryStream::new();
        let first = stream.append(Bytes::from_static(b"first")).await.unwrap();
        stream.append(Bytes::new()).await.unwrap();
        stream.append(Bytes::from_static(b"third")).await.unwrap();

        let records = stream
            .read(Some(&first.position))
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(
            records
                .iter()
                .map(|record| record.payload.clone())
                .collect::<Vec<_>>(),
            vec![Bytes::new(), Bytes::from_static(b"third")]
        );
    }

    #[tokio::test]
    async fn reader_ends_at_head_captured_when_read_begins() {
        let stream = MemoryStream::new();
        stream.append(Bytes::from_static(b"visible")).await.unwrap();
        let mut reader = stream.read(None).await.unwrap();
        stream.append(Bytes::from_static(b"later")).await.unwrap();

        assert_eq!(
            reader.next().await.unwrap().unwrap().payload,
            Bytes::from_static(b"visible")
        );
        assert!(reader.next().await.is_none());
    }

    #[tokio::test]
    async fn accepts_positions_from_another_stream_when_ordinal_exists() {
        let first = MemoryStream::new();
        let second = MemoryStream::new();
        let receipt = first.append(Bytes::from_static(b"value")).await.unwrap();
        second.append(Bytes::from_static(b"other")).await.unwrap();
        second.append(Bytes::from_static(b"next")).await.unwrap();

        let records = second
            .read(Some(&receipt.position))
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].payload, Bytes::from_static(b"next"));
    }

    #[tokio::test]
    async fn snapshot_publication_requires_parent_and_non_regression() {
        let stream = MemoryStream::new();
        let first = stream.append(Bytes::from_static(b"one")).await.unwrap();
        let second = stream.append(Bytes::from_static(b"two")).await.unwrap();
        let first_id = stream
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::At(second.position),
                    payload: Bytes::from_static(b"2"),
                },
                None,
            )
            .await
            .unwrap();

        let conflict = stream
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::At(first.position.clone()),
                    payload: Bytes::from_static(b"1"),
                },
                None,
            )
            .await
            .unwrap_err();
        assert_eq!(conflict.kind(), ErrorKind::Conflict);
        let regression = stream
            .publish(
                Snapshot {
                    at_event: SnapshotPosition::At(first.position),
                    payload: Bytes::from_static(b"1"),
                },
                Some(&first_id),
            )
            .await
            .unwrap_err();
        assert_eq!(regression.kind(), ErrorKind::Conflict);
    }
}

#[cfg(test)]
mod current_tests {
    use bytes::Bytes;
    use futures_util::TryStreamExt as _;
    use sea_core::{
        Durability, Event,
        archive::{SeaStorage, StorageEventStream},
    };

    use super::MemoryStream;

    #[tokio::test]
    async fn passes_storage_conformance() {
        sea_conformance::run_sea_storage_conformance(MemoryStream::new).await;
    }

    #[tokio::test]
    async fn append_reports_memory_durability() {
        let storage = MemoryStream::new();
        let receipt = storage
            .append(Event {
                payload: Bytes::from_static(b"value"),
                blob_tree: None,
            })
            .await
            .unwrap();
        assert_eq!(receipt.durability, Durability::Memory);
        let records: StorageEventStream<_> = storage.read(None, None).await.unwrap();
        assert_eq!(records.try_collect::<Vec<_>>().await.unwrap().len(), 1);
    }
}
