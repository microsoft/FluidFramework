#![doc = "In-memory reference implementation of the snapshotted stream contracts."]
#![doc = ""]
#![doc = "Appends are visible to handles in this process and report memory durability;"]
#![doc = "records and snapshots are lost when the last handle is dropped."]

use std::sync::Arc;

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::stream;
use sea_core::{
    AppendReceipt, AppendStream, Capabilities, ClassifiedError, Durability, ErrorKind,
    PositionCodec, PublishedSnapshot, ReadRecord, Snapshot, SnapshotId, SnapshotPosition,
    SnapshotStore, StreamReader,
};
use thiserror::Error;
use tokio::sync::Mutex;

/// An opaque one-based record ordinal within an in-memory stream.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MemoryPosition {
    /// One-based record index within the stream.
    ordinal: u64,
}

impl MemoryPosition {
    /// Returns the one-based record index within the stream.
    #[must_use]
    pub const fn ordinal(&self) -> u64 {
        self.ordinal
    }
}

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
}

impl ClassifiedError for MemoryError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::InvalidPosition | Self::InvalidPositionToken => ErrorKind::InvalidPosition,
            Self::SnapshotConflict | Self::SnapshotRegression => ErrorKind::Conflict,
        }
    }
}

/// Mutable state shared by cloned handles to one stream.
#[derive(Debug)]
struct State {
    /// Committed payloads in append order.
    records: Vec<Bytes>,
    /// The latest published snapshot, if any.
    latest_snapshot: Option<PublishedSnapshot<MemoryPosition>>,
    /// The numeric identity assigned to the next snapshot.
    next_snapshot_id: u64,
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
                records: Vec::new(),
                latest_snapshot: None,
                next_snapshot_id: 1,
            })),
        }
    }

    /// Rejects zero and beyond-head positions.
    fn validate_position(position: &MemoryPosition, len: usize) -> Result<(), MemoryError> {
        if position.ordinal == 0 || position.ordinal > len as u64 {
            return Err(MemoryError::InvalidPosition);
        }
        Ok(())
    }

    /// Resolves a one-based event ordinal in this stream.
    ///
    /// # Errors
    ///
    /// Returns [`MemoryError::InvalidPosition`] when the ordinal is not committed.
    pub async fn position_at(&self, ordinal: u64) -> Result<MemoryPosition, MemoryError> {
        let position = MemoryPosition { ordinal };
        Self::validate_position(&position, self.state.lock().await.records.len())?;
        Ok(position)
    }
}

#[async_trait]
impl AppendStream for MemoryStream {
    type Position = MemoryPosition;
    type Error = MemoryError;

    fn capabilities(&self) -> Capabilities {
        Capabilities::NONE.with(sea_core::Capability::PositionSerialization)
    }

    async fn append(&self, value: Bytes) -> Result<AppendReceipt<Self::Position>, Self::Error> {
        let mut state = self.state.lock().await;
        state.records.push(value);
        let position = MemoryPosition {
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
                Self::validate_position(position, state.records.len())?;
                usize::try_from(position.ordinal).map_err(|_| MemoryError::InvalidPosition)?
            }
            None => 0,
        };
        let end = state.records.len();
        drop(state);

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
            ordinal: len as u64,
        }))
    }
}

impl PositionCodec for MemoryStream {
    fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error> {
        Ok(Bytes::copy_from_slice(&position.ordinal.to_be_bytes()))
    }

    fn decode_position(&self, token: &[u8]) -> Result<Self::Position, Self::Error> {
        let token: [u8; 8] = token
            .try_into()
            .map_err(|_| MemoryError::InvalidPositionToken)?;
        let ordinal = u64::from_be_bytes(token);
        if ordinal == 0 {
            return Err(MemoryError::InvalidPositionToken);
        }
        Ok(MemoryPosition { ordinal })
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
            Self::validate_position(position, state.records.len())?;
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
    use std::sync::atomic::{AtomicBool, Ordering};

    use futures_util::{StreamExt, TryStreamExt};
    use sea_core::{
        AppendReceipt, AppendStream, Capabilities, ClassifiedError, ErrorKind, PublishedSnapshot,
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
        sea_conformance::run_conformance(MemoryStream::new).await;
    }

    #[tokio::test]
    async fn passes_position_codec_conformance() {
        sea_conformance::run_position_codec_conformance(
            MemoryStream::new,
            b"malformed",
        )
        .await;
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
