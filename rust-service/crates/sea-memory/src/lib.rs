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
