#![doc = "Implementation-independent conformance checks for snapshotted streams."]

use std::fmt::Debug;

use bytes::Bytes;
use futures_util::{StreamExt, TryStreamExt, future::join_all};
use snapshotted_stream_core::{
    AppendStream, ClassifiedError, ErrorKind, Snapshot, SnapshotPosition, SnapshotStore,
};

/// Runs the Phase 1 semantic baseline against a fresh implementation factory.
///
/// # Panics
///
/// Panics when the implementation violates a required semantic law.
pub async fn run_conformance<S, F>(make_stream: F)
where
    S: AppendStream
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>,
    <S as AppendStream>::Error: Debug,
    F: Fn() -> S,
{
    append_order_and_boundaries(&make_stream).await;
    concurrent_appends_are_contiguous(&make_stream).await;
    read_is_finite(&make_stream).await;
    readers_are_independent_and_cancellable(&make_stream).await;
    positions_are_generation_scoped(&make_stream).await;
    snapshots_require_lineage_and_monotonicity(&make_stream).await;
    snapshot_recovery_reads_only_subsequent_records(&make_stream).await;
}

async fn concurrent_appends_are_contiguous<S, F>(make_stream: &F)
where
    S: AppendStream,
    <S as AppendStream>::Error: Debug,
    F: Fn() -> S,
{
    let stream = make_stream();
    let appends = (0_u8..32).map(|value| stream.append(Bytes::from(vec![value])));
    for result in join_all(appends).await {
        result.expect("concurrent append");
    }
    stream
        .append(Bytes::from_static(b"sentinel"))
        .await
        .expect("precedence append");

    let records = stream
        .read(None)
        .await
        .expect("reader")
        .try_collect::<Vec<_>>()
        .await
        .expect("records");
    assert_eq!(records.len(), 33);
    assert_eq!(
        records.last().expect("sentinel record").payload,
        Bytes::from_static(b"sentinel")
    );
    let mut concurrent_values = records[..32]
        .iter()
        .map(|record| record.payload[0])
        .collect::<Vec<_>>();
    concurrent_values.sort_unstable();
    assert_eq!(concurrent_values, (0_u8..32).collect::<Vec<_>>());
}

async fn append_order_and_boundaries<S, F>(make_stream: &F)
where
    S: AppendStream,
    <S as AppendStream>::Error: Debug,
    F: Fn() -> S,
{
    let stream = make_stream();
    let first = stream
        .append(Bytes::from_static(b"first"))
        .await
        .expect("first append");
    let second = stream.append(Bytes::new()).await.expect("second append");
    let third = stream
        .append(Bytes::from_static(b"third"))
        .await
        .expect("third append");
    assert_eq!(
        stream.head().await.expect("head"),
        Some(third.position.clone())
    );

    let records = stream
        .read(Some(&first.position))
        .await
        .expect("reader")
        .try_collect::<Vec<_>>()
        .await
        .expect("records");
    assert_eq!(records.len(), 2);
    assert_eq!(records[0].position, second.position);
    assert_eq!(records[0].payload, Bytes::new());
    assert_eq!(records[1].position, third.position);
    assert_eq!(records[1].payload, Bytes::from_static(b"third"));
}

async fn read_is_finite<S, F>(make_stream: &F)
where
    S: AppendStream,
    <S as AppendStream>::Error: Debug,
    F: Fn() -> S,
{
    let stream = make_stream();
    stream
        .append(Bytes::from_static(b"captured"))
        .await
        .expect("append");
    let reader = stream.read(None).await.expect("reader");
    stream
        .append(Bytes::from_static(b"later"))
        .await
        .expect("later append");
    let records = reader.try_collect::<Vec<_>>().await.expect("records");
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].payload, Bytes::from_static(b"captured"));
}

async fn readers_are_independent_and_cancellable<S, F>(make_stream: &F)
where
    S: AppendStream,
    <S as AppendStream>::Error: Debug,
    F: Fn() -> S,
{
    let stream = make_stream();
    stream
        .append(Bytes::from_static(b"one"))
        .await
        .expect("first append");
    stream
        .append(Bytes::from_static(b"two"))
        .await
        .expect("second append");
    let mut cancelled = stream.read(None).await.expect("cancelled reader");
    let complete = stream.read(None).await.expect("complete reader");
    assert!(cancelled.next().await.is_some());
    drop(cancelled);

    let records = complete
        .try_collect::<Vec<_>>()
        .await
        .expect("complete records");
    assert_eq!(records.len(), 2);
    assert_eq!(
        stream.head().await.expect("head"),
        Some(records[1].position.clone())
    );
}

async fn positions_are_generation_scoped<S, F>(make_stream: &F)
where
    S: AppendStream,
    <S as AppendStream>::Error: Debug,
    F: Fn() -> S,
{
    let first = make_stream();
    let second = make_stream();
    let receipt = first
        .append(Bytes::from_static(b"value"))
        .await
        .expect("append");
    let Err(error) = second.read(Some(&receipt.position)).await else {
        panic!("position from another stream generation was accepted");
    };
    assert!(matches!(
        error.kind(),
        ErrorKind::InvalidPosition | ErrorKind::StalePosition
    ));
}

async fn snapshots_require_lineage_and_monotonicity<S, F>(make_stream: &F)
where
    S: AppendStream
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>,
    <S as AppendStream>::Error: Debug,
    F: Fn() -> S,
{
    let stream = make_stream();
    let initial_parent = stream
        .publish(
            Snapshot {
                includes_through: SnapshotPosition::Initial,
                payload: Bytes::from_static(b"initial-state"),
            },
            None,
        )
        .await
        .expect("initial snapshot publication");
    let first = stream
        .append(Bytes::from_static(b"one"))
        .await
        .expect("first append");
    let second = stream
        .append(Bytes::from_static(b"two"))
        .await
        .expect("second append");
    let parent = stream
        .publish(
            Snapshot {
                includes_through: SnapshotPosition::At(second.position),
                payload: Bytes::from_static(b"state-2"),
            },
            Some(&initial_parent),
        )
        .await
        .expect("initial publication");

    let conflict = stream
        .publish(
            Snapshot {
                includes_through: SnapshotPosition::At(first.position.clone()),
                payload: Bytes::from_static(b"stale-parent"),
            },
            None,
        )
        .await
        .expect_err("stale parent should conflict");
    assert_eq!(conflict.kind(), ErrorKind::Conflict);

    let regression = stream
        .publish(
            Snapshot {
                includes_through: SnapshotPosition::At(first.position),
                payload: Bytes::from_static(b"regression"),
            },
            Some(&parent),
        )
        .await
        .expect_err("position regression should conflict");
    assert_eq!(regression.kind(), ErrorKind::Conflict);
}

async fn snapshot_recovery_reads_only_subsequent_records<S, F>(make_stream: &F)
where
    S: AppendStream
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>,
    <S as AppendStream>::Error: Debug,
    F: Fn() -> S,
{
    let stream = make_stream();
    stream
        .append(Bytes::copy_from_slice(&2_i64.to_be_bytes()))
        .await
        .expect("first counter append");
    let snapshot_position = stream
        .append(Bytes::copy_from_slice(&3_i64.to_be_bytes()))
        .await
        .expect("second counter append")
        .position;
    stream
        .publish(
            Snapshot {
                includes_through: SnapshotPosition::At(snapshot_position),
                payload: Bytes::copy_from_slice(&5_i64.to_be_bytes()),
            },
            None,
        )
        .await
        .expect("snapshot publication");
    stream
        .append(Bytes::copy_from_slice(&(-1_i64).to_be_bytes()))
        .await
        .expect("subsequent counter append");

    let snapshot = stream
        .latest()
        .await
        .expect("latest snapshot")
        .expect("published snapshot");
    let SnapshotPosition::At(position) = snapshot.snapshot.includes_through else {
        panic!("counter snapshot should include a committed position");
    };
    let records = stream
        .read(Some(&position))
        .await
        .expect("recovery reader")
        .try_collect::<Vec<_>>()
        .await
        .expect("recovery records");
    let recovered = records.iter().fold(5_i64, |value, record| {
        let encoded: [u8; 8] = record.payload.as_ref().try_into().expect("counter record");
        value + i64::from_be_bytes(encoded)
    });
    assert_eq!(recovered, 4);
}
