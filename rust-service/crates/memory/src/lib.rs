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
    PositionCodec, PublishedSnapshot, ReadRecord, Snapshot, SnapshotId, SnapshotPosition,
    SnapshotStore, StreamReader,
};
use thiserror::Error;
use tokio::sync::Mutex;

static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MemoryPosition {
    generation: u64,
    ordinal: u64,
}

impl MemoryPosition {
    #[must_use]
    pub const fn ordinal(&self) -> u64 {
        self.ordinal
    }
}

#[derive(Debug, Error)]
pub enum MemoryError {
    #[error("position belongs to another stream generation")]
    ForeignPosition,
    #[error("position is beyond the committed head")]
    InvalidPosition,
    #[error("position token is malformed")]
    InvalidPositionToken,
    #[error("snapshot parent does not match the latest snapshot")]
    SnapshotConflict,
    #[error("snapshot position regresses behind the latest snapshot")]
    SnapshotRegression,
}

impl ClassifiedError for MemoryError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::ForeignPosition | Self::InvalidPosition | Self::InvalidPositionToken => {
                ErrorKind::InvalidPosition
            }
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

    /// Resolves a one-based event ordinal in this stream generation.
    ///
    /// # Errors
    ///
    /// Returns [`MemoryError::InvalidPosition`] when the ordinal is not committed.
    pub async fn position_at(&self, ordinal: u64) -> Result<MemoryPosition, MemoryError> {
        let position = MemoryPosition {
            generation: self.generation,
            ordinal,
        };
        self.validate_position(&position, self.state.lock().await.records.len())?;
        Ok(position)
    }
}

#[async_trait]
impl AppendStream for MemoryStream {
    type Position = MemoryPosition;
    type Error = MemoryError;

    fn capabilities(&self) -> Capabilities {
        Capabilities::NONE.with(snapshotted_stream_core::Capability::PositionSerialization)
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

impl PositionCodec for MemoryStream {
    fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error> {
        if position.generation != self.generation {
            return Err(MemoryError::ForeignPosition);
        }
        let mut token = [0_u8; 16];
        token[..8].copy_from_slice(&position.generation.to_be_bytes());
        token[8..].copy_from_slice(&position.ordinal.to_be_bytes());
        Ok(Bytes::copy_from_slice(&token))
    }

    fn decode_position(&self, token: &[u8]) -> Result<Self::Position, Self::Error> {
        let token: [u8; 16] = token
            .try_into()
            .map_err(|_| MemoryError::InvalidPositionToken)?;
        let generation = u64::from_be_bytes(
            token[..8]
                .try_into()
                .map_err(|_| MemoryError::InvalidPositionToken)?,
        );
        if generation != self.generation {
            return Err(MemoryError::ForeignPosition);
        }
        let ordinal = u64::from_be_bytes(
            token[8..]
                .try_into()
                .map_err(|_| MemoryError::InvalidPositionToken)?,
        );
        if ordinal == 0 {
            return Err(MemoryError::InvalidPositionToken);
        }
        Ok(MemoryPosition {
            generation,
            ordinal,
        })
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
    use std::sync::atomic::AtomicBool;

    use futures_util::{StreamExt, TryStreamExt};
    use snapshotted_stream_core::{
        AppendReceipt, AppendStream, Capabilities, ClassifiedError, ErrorKind, PublishedSnapshot,
        Snapshot, SnapshotId, SnapshotPosition, SnapshotStore, StreamReader,
    };

    use super::*;

    #[derive(Clone, Copy, Debug)]
    enum AmbiguousAppend {
        BeforeCommit,
        AfterCommit,
    }

    #[derive(Debug, thiserror::Error)]
    enum FaultError {
        #[error(transparent)]
        Memory(#[from] MemoryError),
        #[error("append outcome is ambiguous")]
        Ambiguous,
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

    #[derive(Clone, Debug)]
    struct FaultingMemoryStream {
        inner: MemoryStream,
        ambiguous_append: Option<AmbiguousAppend>,
        interrupt_next_read: Arc<AtomicBool>,
    }

    impl FaultingMemoryStream {
        fn ambiguous(inner: MemoryStream, outcome: AmbiguousAppend) -> Self {
            Self {
                inner,
                ambiguous_append: Some(outcome),
                interrupt_next_read: Arc::new(AtomicBool::new(false)),
            }
        }

        fn interrupt_next_read(inner: MemoryStream) -> Self {
            Self {
                inner,
                ambiguous_append: None,
                interrupt_next_read: Arc::new(AtomicBool::new(true)),
            }
        }
    }

    #[async_trait]
    impl AppendStream for FaultingMemoryStream {
        type Position = MemoryPosition;
        type Error = FaultError;

        fn capabilities(&self) -> Capabilities {
            self.inner.capabilities()
        }

        async fn append(&self, value: Bytes) -> Result<AppendReceipt<Self::Position>, Self::Error> {
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
        snapshotted_stream_conformance::run_conformance(MemoryStream::new).await;
    }

    #[tokio::test]
    async fn passes_position_codec_conformance() {
        snapshotted_stream_conformance::run_position_codec_conformance(
            MemoryStream::new,
            b"malformed",
        )
        .await;
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
                    includes_through: SnapshotPosition::At(position),
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
        let SnapshotPosition::At(position) = latest.snapshot.includes_through else {
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
        assert_eq!(stream.decode_position(&token).unwrap(), receipt.position);
        assert_eq!(
            stream.decode_position(b"short").unwrap_err().kind(),
            ErrorKind::InvalidPosition
        );

        let other = MemoryStream::new();
        assert_eq!(
            other.decode_position(&token).unwrap_err().kind(),
            ErrorKind::InvalidPosition
        );
        assert_eq!(
            other.encode_position(&receipt.position).unwrap_err().kind(),
            ErrorKind::InvalidPosition
        );
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
