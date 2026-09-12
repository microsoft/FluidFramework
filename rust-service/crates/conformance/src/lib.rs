#![doc = "Implementation-independent conformance checks for snapshotted streams."]

use std::fmt::Debug;

use bytes::Bytes;
use futures_util::{StreamExt, TryStreamExt, future::join_all};
use snapshotted_stream_core::{
    AppendStream, Capability, ClassifiedError, ErrorKind, PositionCodec, Snapshot,
    SnapshotPosition, SnapshotStore,
};

const MODEL_TRACE_SEED: u64 = 0x5eed_0002_d15c_a11e;

#[derive(Debug, Default)]
struct ReferenceModel {
    records: Vec<Bytes>,
    snapshot: Option<(usize, Bytes)>,
}

impl ReferenceModel {
    fn append(&mut self, payload: Bytes) {
        self.records.push(payload);
    }

    fn read_after(&self, after: Option<usize>) -> &[Bytes] {
        &self.records[after.unwrap_or(0)..]
    }

    fn publish(&mut self, includes_through: usize, payload: Bytes) {
        self.snapshot = Some((includes_through, payload));
    }

    fn recover(&self) -> Vec<Bytes> {
        let includes_through = self
            .snapshot
            .as_ref()
            .map_or(0, |(includes_through, _)| *includes_through);
        self.read_after(Some(includes_through)).to_vec()
    }
}

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
    deterministic_reference_model_trace(&make_stream).await;
}

/// Runs position-codec laws against fresh stream generations.
///
/// `malformed_token` must be a token the implementation documents as malformed.
///
/// # Panics
///
/// Panics when the implementation violates a required position-codec law.
pub async fn run_position_codec_conformance<S, F>(make_stream: F, malformed_token: &[u8])
where
    S: AppendStream + PositionCodec,
    <S as AppendStream>::Error: Debug,
    F: Fn() -> S,
{
    let first = make_stream();
    assert!(
        first
            .capabilities()
            .supports(Capability::PositionSerialization)
    );
    let receipt = first
        .append(Bytes::from_static(b"codec-position"))
        .await
        .expect("codec append");
    let token = first
        .encode_position(&receipt.position)
        .expect("position encoding");
    assert_eq!(
        first.decode_position(&token).expect("position decoding"),
        receipt.position
    );
    let malformed = first
        .decode_position(malformed_token)
        .expect_err("malformed token should be rejected");
    assert_eq!(malformed.kind(), ErrorKind::InvalidPosition);

    let second = make_stream();
    let foreign_decode = second
        .decode_position(&token)
        .expect_err("foreign-generation token should be rejected");
    assert_eq!(foreign_decode.kind(), ErrorKind::InvalidPosition);
    let foreign_encode = second
        .encode_position(&receipt.position)
        .expect_err("foreign-generation position should be rejected");
    assert_eq!(foreign_encode.kind(), ErrorKind::InvalidPosition);
}

async fn deterministic_reference_model_trace<S, F>(make_stream: &F)
where
    S: AppendStream
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>,
    <S as AppendStream>::Error: Debug,
    F: Fn() -> S,
{
    let stream = make_stream();
    let mut model = ReferenceModel::default();
    let mut positions = Vec::new();
    let mut parent = None;
    let mut state = MODEL_TRACE_SEED;

    for step in 0_u8..24 {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        let mut payload = Vec::from(state.to_be_bytes());
        payload.push(step);
        let payload = Bytes::from(payload);
        let receipt = stream
            .append(payload.clone())
            .await
            .expect("model trace append");
        positions.push(receipt.position);
        model.append(payload);

        if step % 5 == 4 {
            let after = usize::from(step / 2);
            let records = stream
                .read(Some(&positions[after - 1]))
                .await
                .expect("model trace reader")
                .try_collect::<Vec<_>>()
                .await
                .expect("model trace records");
            assert_eq!(
                records
                    .iter()
                    .map(|record| record.payload.clone())
                    .collect::<Vec<_>>(),
                model.read_after(Some(after)),
                "reference model trace seed {MODEL_TRACE_SEED:#018x}, step {step}"
            );
        }

        if matches!(step, 7 | 15) {
            let includes_through = positions.len();
            let snapshot_payload = Bytes::copy_from_slice(&state.to_be_bytes());
            parent = Some(
                stream
                    .publish(
                        Snapshot {
                            includes_through: SnapshotPosition::At(
                                positions[includes_through - 1].clone(),
                            ),
                            payload: snapshot_payload.clone(),
                        },
                        parent.as_ref(),
                    )
                    .await
                    .expect("model trace snapshot publication"),
            );
            model.publish(includes_through, snapshot_payload);
        }
    }

    let latest = stream
        .latest()
        .await
        .expect("model trace latest snapshot")
        .expect("model trace published snapshot");
    let SnapshotPosition::At(position) = latest.snapshot.includes_through else {
        panic!("model trace snapshot should include a committed position");
    };
    assert_eq!(
        latest.snapshot.payload,
        model.snapshot.as_ref().expect("model snapshot").1
    );
    let recovered = stream
        .read(Some(&position))
        .await
        .expect("model recovery reader")
        .try_collect::<Vec<_>>()
        .await
        .expect("model recovery records");
    assert_eq!(
        recovered
            .iter()
            .map(|record| record.payload.clone())
            .collect::<Vec<_>>(),
        model.recover(),
        "reference model recovery seed {MODEL_TRACE_SEED:#018x}"
    );
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
