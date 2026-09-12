#![doc = "Thin native helpers over the raw snapshotted stream traits."]

use bytes::Bytes;
use futures_util::TryStreamExt;
use snapshotted_stream_core::{
    AppendStream, PublishedSnapshot, Snapshot, SnapshotPosition, SnapshotStore,
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CounterError<E> {
    #[error("stream operation failed: {0}")]
    Stream(E),
    #[error("counter record must contain exactly eight bytes")]
    InvalidRecord,
}

pub struct CounterClient<'a, S> {
    stream: &'a S,
}

impl<'a, S> CounterClient<'a, S>
where
    S: AppendStream
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>,
{
    #[must_use]
    pub fn new(stream: &'a S) -> Self {
        Self { stream }
    }

    /// Appends one counter delta and returns its committed position.
    ///
    /// # Errors
    ///
    /// Returns the implementation error when the append does not succeed.
    pub async fn append_delta(
        &self,
        delta: i64,
    ) -> Result<<S as AppendStream>::Position, CounterError<<S as AppendStream>::Error>> {
        self.stream
            .append(Bytes::copy_from_slice(&delta.to_be_bytes()))
            .await
            .map(|receipt| receipt.position)
            .map_err(CounterError::Stream)
    }

    /// Recovers the counter from the latest snapshot and subsequent records.
    ///
    /// # Errors
    ///
    /// Returns an implementation error or `InvalidRecord` for malformed counter bytes.
    pub async fn recover(
        &self,
    ) -> Result<
        (i64, Option<<S as AppendStream>::Position>),
        CounterError<<S as AppendStream>::Error>,
    > {
        let latest = self.stream.latest().await.map_err(CounterError::Stream)?;
        let (mut value, after) = decode_snapshot(latest.as_ref())?;
        let records = self
            .stream
            .read(after.as_ref())
            .await
            .map_err(CounterError::Stream)?
            .try_collect::<Vec<_>>()
            .await
            .map_err(CounterError::Stream)?;
        let mut head = after;
        for record in records {
            value += decode_i64(&record.payload)?;
            head = Some(record.position);
        }
        Ok((value, head))
    }

    /// Conditionally publishes the current counter state.
    ///
    /// # Errors
    ///
    /// Returns the implementation error when loading or publishing the snapshot fails.
    pub async fn publish_snapshot(
        &self,
        value: i64,
        includes_through: Option<<S as AppendStream>::Position>,
    ) -> Result<(), CounterError<<S as AppendStream>::Error>> {
        let parent = self.stream.latest().await.map_err(CounterError::Stream)?;
        let position = includes_through.map_or(SnapshotPosition::Initial, SnapshotPosition::At);
        self.stream
            .publish(
                Snapshot {
                    includes_through: position,
                    payload: Bytes::copy_from_slice(&value.to_be_bytes()),
                },
                parent.as_ref().map(|value| &value.id),
            )
            .await
            .map_err(CounterError::Stream)?;
        Ok(())
    }
}

type RecoveryState<P> = (i64, Option<P>);

fn decode_snapshot<P: Clone, E>(
    snapshot: Option<&PublishedSnapshot<P>>,
) -> Result<RecoveryState<P>, CounterError<E>> {
    let Some(snapshot) = snapshot else {
        return Ok((0, None));
    };
    let value = decode_i64(&snapshot.snapshot.payload)?;
    let position = match &snapshot.snapshot.includes_through {
        SnapshotPosition::Initial => None,
        SnapshotPosition::At(position) => Some(position.clone()),
    };
    Ok((value, position))
}

fn decode_i64<E>(value: &Bytes) -> Result<i64, CounterError<E>> {
    let encoded: [u8; 8] = value
        .as_ref()
        .try_into()
        .map_err(|_| CounterError::InvalidRecord)?;
    Ok(i64::from_be_bytes(encoded))
}
