#![doc = "In-memory reference implementation of the snapshotted stream contracts."]

use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::stream;
use snapshotted_stream_core::{
    AppendReceipt, AppendStream, Capabilities, ClassifiedError, Durability, ErrorKind,
    PublishedSnapshot, ReadRecord, Snapshot, SnapshotId, SnapshotPosition, SnapshotStore,
    StreamReader,
};
use thiserror::Error;
use tokio::sync::Mutex;

static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MemoryPosition {
    generation: u64,
    ordinal: u64,
}

#[derive(Debug, Error)]
pub enum MemoryError {
    #[error("position belongs to another stream generation")]
    ForeignPosition,
    #[error("position is beyond the committed head")]
    InvalidPosition,
    #[error("snapshot parent does not match the latest snapshot")]
    SnapshotConflict,
    #[error("snapshot position regresses behind the latest snapshot")]
    SnapshotRegression,
}

impl ClassifiedError for MemoryError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::ForeignPosition | Self::InvalidPosition => ErrorKind::InvalidPosition,
            Self::SnapshotConflict | Self::SnapshotRegression => ErrorKind::Conflict,
        }
    }
}

#[derive(Debug)]
struct State {
    records: Vec<Bytes>,
    latest_snapshot: Option<PublishedSnapshot<MemoryPosition>>,
    next_snapshot_id: u64,
}

#[derive(Clone, Debug)]
pub struct MemoryStream {
    generation: u64,
    state: Arc<Mutex<State>>,
}

impl Default for MemoryStream {
    fn default() -> Self {
        Self::new()
    }
}

impl MemoryStream {
    #[must_use]
    pub fn new() -> Self {
        Self {
            generation: NEXT_GENERATION.fetch_add(1, Ordering::Relaxed),
            state: Arc::new(Mutex::new(State {
                records: Vec::new(),
                latest_snapshot: None,
                next_snapshot_id: 1,
            })),
        }
    }

    fn validate_position(&self, position: &MemoryPosition, len: usize) -> Result<(), MemoryError> {
        if position.generation != self.generation {
            return Err(MemoryError::ForeignPosition);
        }
        if position.ordinal == 0 || position.ordinal > len as u64 {
            return Err(MemoryError::InvalidPosition);
        }
        Ok(())
    }
}

#[async_trait]
impl AppendStream for MemoryStream {
    type Position = MemoryPosition;
    type Error = MemoryError;

    fn capabilities(&self) -> Capabilities {
        Capabilities::NONE
    }

    async fn append(&self, value: Bytes) -> Result<AppendReceipt<Self::Position>, Self::Error> {
        let mut state = self.state.lock().await;
        state.records.push(value);
        let position = MemoryPosition {
            generation: self.generation,
            ordinal: state.records.len() as u64,
        };
        Ok(AppendReceipt {
            position,
            durability: Durability::Memory,
        })
    }

    async fn read(
        &self,
        after: Option<&Self::Position>,
    ) -> Result<StreamReader<Self::Position, Self::Error>, Self::Error> {
        let state = self.state.lock().await;
        let start = match after {
            Some(position) => {
                self.validate_position(position, state.records.len())?;
                usize::try_from(position.ordinal).map_err(|_| MemoryError::InvalidPosition)?
            }
            None => 0,
        };
        let end = state.records.len();
        drop(state);

        let generation = self.generation;
        let shared = Arc::clone(&self.state);
        Ok(Box::pin(stream::unfold(start, move |index| {
            let shared = Arc::clone(&shared);
            async move {
                if index >= end {
                    return None;
                }
                let payload = shared.lock().await.records[index].clone();
                let record = ReadRecord {
                    position: MemoryPosition {
                        generation,
                        ordinal: index as u64 + 1,
                    },
                    payload,
                };
                Some((Ok(record), index + 1))
            }
        })))
    }

    async fn head(&self) -> Result<Option<Self::Position>, Self::Error> {
        let len = self.state.lock().await.records.len();
        Ok((len > 0).then_some(MemoryPosition {
            generation: self.generation,
            ordinal: len as u64,
        }))
    }
}

#[async_trait]
impl SnapshotStore for MemoryStream {
    type Position = MemoryPosition;
    type Error = MemoryError;

    async fn latest(&self) -> Result<Option<PublishedSnapshot<Self::Position>>, Self::Error> {
        Ok(self.state.lock().await.latest_snapshot.clone())
    }

    async fn publish(
        &self,
        snapshot: Snapshot<Self::Position>,
        expected_parent: Option<&SnapshotId>,
    ) -> Result<SnapshotId, Self::Error> {
        let mut state = self.state.lock().await;
        let actual_parent = state.latest_snapshot.as_ref().map(|value| &value.id);
        if actual_parent != expected_parent {
            return Err(MemoryError::SnapshotConflict);
        }
        if let SnapshotPosition::At(position) = &snapshot.includes_through {
            self.validate_position(position, state.records.len())?;
        }
        if let Some(previous) = &state.latest_snapshot {
            let previous_ordinal = match &previous.snapshot.includes_through {
                SnapshotPosition::Initial => 0,
                SnapshotPosition::At(position) => position.ordinal,
            };
            let next_ordinal = match &snapshot.includes_through {
                SnapshotPosition::Initial => 0,
                SnapshotPosition::At(position) => position.ordinal,
            };
            if next_ordinal < previous_ordinal {
                return Err(MemoryError::SnapshotRegression);
            }
        }

        let id = SnapshotId::from_bytes(Bytes::copy_from_slice(
            &state.next_snapshot_id.to_be_bytes(),
        ));
        state.next_snapshot_id += 1;
        state.latest_snapshot = Some(PublishedSnapshot {
            id: id.clone(),
            snapshot,
        });
        Ok(id)
    }
}

#[cfg(test)]
mod tests {
    use futures_util::{StreamExt, TryStreamExt};
    use snapshotted_stream_core::{
        AppendStream, ErrorKind, Snapshot, SnapshotPosition, SnapshotStore,
    };

    use super::*;

    #[tokio::test]
    async fn passes_shared_conformance() {
        snapshotted_stream_conformance::run_conformance(MemoryStream::new).await;
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
    async fn rejects_positions_from_another_generation() {
        let first = MemoryStream::new();
        let second = MemoryStream::new();
        let receipt = first.append(Bytes::from_static(b"value")).await.unwrap();

        let Err(error) = second.read(Some(&receipt.position)).await else {
            panic!("foreign position was accepted");
        };
        assert_eq!(error.kind(), ErrorKind::InvalidPosition);
    }

    #[tokio::test]
    async fn snapshot_publication_requires_parent_and_non_regression() {
        let stream = MemoryStream::new();
        let first = stream.append(Bytes::from_static(b"one")).await.unwrap();
        let second = stream.append(Bytes::from_static(b"two")).await.unwrap();
        let first_id = stream
            .publish(
                Snapshot {
                    includes_through: SnapshotPosition::At(second.position),
                    payload: Bytes::from_static(b"2"),
                },
                None,
            )
            .await
            .unwrap();

        let conflict = stream
            .publish(
                Snapshot {
                    includes_through: SnapshotPosition::At(first.position.clone()),
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
                    includes_through: SnapshotPosition::At(first.position),
                    payload: Bytes::from_static(b"1"),
                },
                Some(&first_id),
            )
            .await
            .unwrap_err();
        assert_eq!(regression.kind(), ErrorKind::Conflict);
    }
}
