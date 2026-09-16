#![doc = "Implementation-independent conformance checks for Sea event archives."]

use std::{collections::BTreeMap, fmt::Debug};

use bytes::Bytes;
use futures_util::{StreamExt, TryStreamExt, future::join_all};
use sea_core::{
    BlobDirectory, BlobId, BlobTreeId, Capability, ClassifiedError, ErrorKind, Event,
    EventPosition, EventStream, PositionCodec, Snapshot, SnapshotPosition, SnapshotStore,
    archive::{
        EventSubmission, LoadEvent, OperationId, SeaSession, SeaStorage,
        Snapshot as ArchiveSnapshot, SnapshotPosition as ArchiveSnapshotPosition,
        SnapshotPublication,
    },
};

const MODEL_TRACE_SEED: u64 = 0x5eed_0002_d15c_a11e;

/// Runs the current session's observable behavior against a fresh archive session.
///
/// # Panics
///
/// Panics when submission recovery, content access, snapshot recovery, streaming, or close
/// behavior differs between session implementations.
pub async fn run_sea_session_observable_behavior<S>(session: &S)
where
    S: SeaSession,
    S::Error: Debug,
{
    assert_eq!(
        session.latest_snapshot().await.expect("initial snapshot"),
        None
    );
    let directory_id = round_trip_session_content(session).await;
    let first = submit_and_resolve_first_event(session, directory_id).await;
    let published = publish_and_resolve_snapshot(session, directory_id, first.position).await;

    let second = session
        .submit(EventSubmission {
            operation_id: OperationId::new(Bytes::from_static(b"observable-event-two"))
                .expect("operation identity"),
            reference: Some(first.position),
            event: Event {
                payload: Bytes::from_static(b"second"),
                blob_tree: None,
            },
        })
        .await
        .expect("second submission");
    let history = session
        .read(Some(first.position), Some(second.position))
        .await
        .expect("bounded read")
        .try_collect::<Vec<_>>()
        .await
        .expect("bounded read events");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].committed.position, second.position);

    let mut load = session.load(None).await.expect("snapshot recovery load");
    assert!(matches!(
        load.next().await.expect("load snapshot").expect("load result"),
        LoadEvent::Snapshot(snapshot) if snapshot == published
    ));
    assert!(matches!(
        load.next().await.expect("load event").expect("load result"),
        LoadEvent::Event(event) if event.committed.position == second.position
    ));
    assert!(matches!(
        load.next().await.expect("caught-up marker").expect("load result"),
        LoadEvent::CaughtUp(Some(position)) if position == second.position
    ));

    session.close().await.expect("session close");
    let closed_probe =
        OperationId::new(Bytes::from_static(b"closed-session-probe")).expect("operation identity");
    assert_eq!(
        session
            .resolve_submission(&closed_probe)
            .await
            .expect_err("closed session operation")
            .kind(),
        ErrorKind::Rejected
    );
}

async fn round_trip_session_content<S>(session: &S) -> sea_core::BlobDirectoryId
where
    S: SeaSession,
    S::Error: Debug,
{
    let blob_payload = Bytes::from_static(b"observable-blob");
    let blob = session
        .put_blob(blob_payload.clone())
        .await
        .expect("blob publication");
    assert_eq!(
        session.get_blob(blob).await.expect("blob retrieval"),
        blob_payload
    );
    let directory = BlobDirectory::new(BTreeMap::from([(
        "leaf".to_owned(),
        BlobTreeId::Blob(blob),
    )]))
    .expect("directory");
    let directory_id = session
        .put_directory(directory.clone())
        .await
        .expect("directory publication");
    assert_eq!(
        session
            .get_directory(directory_id)
            .await
            .expect("directory retrieval"),
        directory
    );
    directory_id
}

async fn submit_and_resolve_first_event<S>(
    session: &S,
    directory_id: sea_core::BlobDirectoryId,
) -> sea_core::archive::EventReceipt
where
    S: SeaSession,
    S::Error: Debug,
{
    let submission = EventSubmission {
        operation_id: OperationId::new(Bytes::from_static(b"observable-event-one"))
            .expect("operation identity"),
        reference: None,
        event: Event {
            payload: Bytes::from_static(b"first"),
            blob_tree: Some(BlobTreeId::Directory(directory_id)),
        },
    };
    let receipt = session
        .submit(submission.clone())
        .await
        .expect("first submission");
    assert_eq!(
        session
            .resolve_submission(&submission.operation_id)
            .await
            .expect("submission resolution"),
        Some(receipt.clone())
    );
    assert_eq!(
        session
            .submit(submission)
            .await
            .expect("idempotent submission retry"),
        receipt
    );
    receipt
}

async fn publish_and_resolve_snapshot<S>(
    session: &S,
    directory_id: sea_core::BlobDirectoryId,
    position: EventPosition,
) -> sea_core::archive::PublishedSnapshot
where
    S: SeaSession,
    S::Error: Debug,
{
    let mut snapshots = session
        .subscribe_snapshots()
        .await
        .expect("snapshot subscription");
    let publication = SnapshotPublication {
        operation_id: OperationId::new(Bytes::from_static(b"observable-snapshot"))
            .expect("snapshot operation identity"),
        expected_parent: None,
        snapshot: ArchiveSnapshot {
            at_event: ArchiveSnapshotPosition::At(position),
            root: BlobTreeId::Directory(directory_id),
        },
    };
    let published = session
        .publish_snapshot(publication.clone())
        .await
        .expect("snapshot publication");
    assert_eq!(
        snapshots
            .next()
            .await
            .expect("snapshot notification")
            .expect("snapshot notification result"),
        published
    );
    assert_eq!(
        session
            .publish_snapshot(publication.clone())
            .await
            .expect("idempotent snapshot retry"),
        published
    );
    assert_eq!(
        session
            .resolve_snapshot_publication(&publication.operation_id)
            .await
            .expect("snapshot resolution"),
        Some(published.clone())
    );
    assert_eq!(
        session
            .snapshot(&published.id)
            .await
            .expect("snapshot lookup"),
        Some(published.clone())
    );
    assert_eq!(
        session.latest_snapshot().await.expect("latest snapshot"),
        Some(published.clone())
    );
    published
}

/// Runs the final trusted-backend laws against a fresh archive.
///
/// # Panics
///
/// Panics when the backend violates content, atomicity, history, idempotency, or load laws.
pub async fn run_sea_storage_conformance<S, F>(make_storage: F)
where
    S: SeaStorage,
    S::Error: Debug,
    F: Fn() -> S,
{
    let storage = make_storage();
    let directory_id = prepare_blob_tree(&storage).await;
    reject_missing_event_tree(&storage).await;

    let initial_request = SnapshotPublication {
        operation_id: OperationId::new(Bytes::from_static(b"initial-publication"))
            .expect("operation identity"),
        expected_parent: None,
        snapshot: ArchiveSnapshot {
            at_event: ArchiveSnapshotPosition::Initial,
            root: BlobTreeId::Directory(directory_id),
        },
    };
    let initial = storage
        .publish_snapshot(initial_request)
        .await
        .expect("initial snapshot");

    let first = storage
        .append(Event {
            payload: Bytes::from_static(b"first"),
            blob_tree: Some(BlobTreeId::Directory(directory_id)),
        })
        .await
        .expect("first event");
    let second = storage
        .append(Event {
            payload: Bytes::from_static(b"second"),
            blob_tree: None,
        })
        .await
        .expect("second event");
    assert!(first.position < second.position);
    assert_eq!(
        EventPosition::from_bytes(first.position.to_bytes()),
        first.position
    );

    let positioned_request = SnapshotPublication {
        operation_id: OperationId::new(Bytes::from_static(b"positioned-publication"))
            .expect("operation identity"),
        expected_parent: Some(initial.id.clone()),
        snapshot: ArchiveSnapshot {
            at_event: ArchiveSnapshotPosition::At(first.position),
            root: BlobTreeId::Directory(directory_id),
        },
    };
    let positioned = storage
        .publish_snapshot(positioned_request.clone())
        .await
        .expect("positioned snapshot");
    let retry = storage
        .publish_snapshot(positioned_request.clone())
        .await
        .expect("exact publication retry");
    assert_eq!(retry, positioned);
    assert_eq!(
        storage
            .resolve_snapshot_publication(&positioned_request.operation_id)
            .await
            .expect("publication resolution"),
        Some(positioned.clone())
    );

    let conflicting = SnapshotPublication {
        snapshot: ArchiveSnapshot {
            at_event: ArchiveSnapshotPosition::At(second.position),
            root: BlobTreeId::Directory(directory_id),
        },
        ..positioned_request
    };
    let conflict = storage
        .publish_snapshot(conflicting)
        .await
        .expect_err("operation identity reuse must conflict");
    assert_eq!(conflict.kind(), ErrorKind::Conflict);
    assert_eq!(
        storage
            .snapshot(&positioned.id)
            .await
            .expect("snapshot by id"),
        Some(positioned.clone())
    );
    assert_eq!(
        storage
            .snapshot_at_or_before(first.position)
            .await
            .expect("historical selection"),
        Some(positioned.clone())
    );
    assert_captured_load(&storage, positioned, first.position, second.position).await;
}

async fn prepare_blob_tree<S>(storage: &S) -> sea_core::BlobDirectoryId
where
    S: SeaStorage,
    S::Error: Debug,
{
    let blob = storage
        .put_blob(Bytes::from_static(b"shared-content"))
        .await
        .expect("blob publication");
    assert_eq!(
        storage.get_blob(blob).await.expect("blob retrieval"),
        Bytes::from_static(b"shared-content")
    );

    let directory = BlobDirectory::new(BTreeMap::from([(
        "leaf".to_owned(),
        BlobTreeId::Blob(blob),
    )]))
    .expect("valid directory");
    let directory_id = storage
        .put_directory(directory.clone())
        .await
        .expect("directory publication");
    assert_eq!(
        storage
            .get_directory(directory_id)
            .await
            .expect("directory retrieval"),
        directory
    );
    directory_id
}

async fn reject_missing_event_tree<S>(storage: &S)
where
    S: SeaStorage,
    S::Error: Debug,
{
    let missing = BlobId::from_bytes(&[0xa5; 32]).expect("synthetic missing identity");
    let missing_error = storage
        .append(Event {
            payload: Bytes::from_static(b"must-not-commit"),
            blob_tree: Some(BlobTreeId::Blob(missing)),
        })
        .await
        .expect_err("missing tree must reject the event");
    assert_eq!(missing_error.kind(), ErrorKind::Rejected);
    assert_eq!(storage.head().await.expect("head after rejection"), None);
}

async fn assert_captured_load<S>(
    storage: &S,
    snapshot: sea_core::archive::PublishedSnapshot,
    snapshot_position: EventPosition,
    captured_head: EventPosition,
) where
    S: SeaStorage,
    S::Error: Debug,
{
    let load = storage
        .load(Some(snapshot_position))
        .await
        .expect("captured load");
    assert_eq!(load.snapshot, Some(snapshot));
    assert_eq!(load.head, Some(captured_head));
    storage
        .append(Event {
            payload: Bytes::from_static(b"after-captured-head"),
            blob_tree: None,
        })
        .await
        .expect("post-load event");
    let loaded = load
        .events
        .try_collect::<Vec<_>>()
        .await
        .expect("load events");
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].position, captured_head);
    assert_eq!(loaded[0].event.payload, Bytes::from_static(b"second"));
}

/// A deterministic oracle for append, snapshot, and recovery results.
#[derive(Debug, Default)]
struct ReferenceModel {
    /// Payloads in commit order.
    records: Vec<Bytes>,
    /// The included record count and payload of the latest snapshot.
    snapshot: Option<(usize, Bytes)>,
}

impl ReferenceModel {
    /// Commits one payload to the model.
    fn append(&mut self, payload: Bytes) {
        self.records.push(payload);
    }

    /// Returns model records after a zero-based included-record count.
    fn read_after(&self, after: Option<usize>) -> &[Bytes] {
        &self.records[after.unwrap_or(0)..]
    }

    /// Replaces the model's latest snapshot.
    fn publish(&mut self, at_event: usize, payload: Bytes) {
        self.snapshot = Some((at_event, payload));
    }

    /// Returns records that must be replayed after the latest snapshot.
    fn recover(&self) -> Vec<Bytes> {
        let at_event = self.snapshot.as_ref().map_or(0, |(at_event, _)| *at_event);
        self.read_after(Some(at_event)).to_vec()
    }
}

/// Runs the Phase 1 semantic baseline against a fresh implementation factory.
///
/// # Panics
///
/// Panics when the implementation violates a required semantic law.
pub async fn run_conformance<S, F>(make_stream: F)
where
    S: EventStream
        + SnapshotStore<Position = <S as EventStream>::Position, Error = <S as EventStream>::Error>,
    <S as EventStream>::Error: Debug,
    F: Fn() -> S,
{
    append_order_and_boundaries(&make_stream).await;
    concurrent_appends_are_contiguous(&make_stream).await;
    read_is_finite(&make_stream).await;
    read_after_head_is_empty(&make_stream).await;
    readers_are_independent_and_cancellable(&make_stream).await;
    positions_require_committed_ordinals(&make_stream).await;
    snapshot_positions_require_committed_ordinals(&make_stream).await;
    snapshots_require_lineage_and_monotonicity(&make_stream).await;
    snapshot_recovery_reads_only_subsequent_records(&make_stream).await;
    deterministic_reference_model_trace(&make_stream).await;
}

/// Runs position-codec round-trip and malformed-token laws.
///
/// `malformed_token` must be a token the implementation documents as malformed.
///
/// # Panics
///
/// Panics when the implementation violates a required position-codec law.
pub async fn run_position_codec_conformance<S, F>(make_stream: F, malformed_token: &[u8])
where
    S: EventStream + PositionCodec,
    <S as EventStream>::Error: Debug,
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
}

/// Compares a deterministic mixed append/read/snapshot trace with the reference model.
async fn deterministic_reference_model_trace<S, F>(make_stream: &F)
where
    S: EventStream
        + SnapshotStore<Position = <S as EventStream>::Position, Error = <S as EventStream>::Error>,
    <S as EventStream>::Error: Debug,
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
            let at_event = positions.len();
            let snapshot_payload = Bytes::copy_from_slice(&state.to_be_bytes());
            parent = Some(
                stream
                    .publish(
                        Snapshot {
                            at_event: SnapshotPosition::At(positions[at_event - 1].clone()),
                            payload: snapshot_payload.clone(),
                        },
                        parent.as_ref(),
                    )
                    .await
                    .expect("model trace snapshot publication"),
            );
            model.publish(at_event, snapshot_payload);
        }
    }

    let latest = stream
        .latest()
        .await
        .expect("model trace latest snapshot")
        .expect("model trace published snapshot");
    let SnapshotPosition::At(position) = latest.snapshot.at_event else {
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

/// Verifies that concurrent commits form one complete prefix without gaps or loss.
async fn concurrent_appends_are_contiguous<S, F>(make_stream: &F)
where
    S: EventStream,
    <S as EventStream>::Error: Debug,
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

/// Verifies commit order, empty-record preservation, and exclusive resume positions.
async fn append_order_and_boundaries<S, F>(make_stream: &F)
where
    S: EventStream,
    <S as EventStream>::Error: Debug,
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

/// Verifies that a reader ends at the head captured when reading begins.
async fn read_is_finite<S, F>(make_stream: &F)
where
    S: EventStream,
    <S as EventStream>::Error: Debug,
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

/// Verifies that resuming from the current head yields no records.
async fn read_after_head_is_empty<S, F>(make_stream: &F)
where
    S: EventStream,
    <S as EventStream>::Error: Debug,
    F: Fn() -> S,
{
    let stream = make_stream();
    let head = stream
        .append(Bytes::from_static(b"head"))
        .await
        .expect("head append")
        .position;
    let records = stream
        .read(Some(&head))
        .await
        .expect("reader after head")
        .try_collect::<Vec<_>>()
        .await
        .expect("records after head");
    assert!(records.is_empty());
}

/// Verifies that dropping one reader cannot cancel or mutate another reader.
async fn readers_are_independent_and_cancellable<S, F>(make_stream: &F)
where
    S: EventStream,
    <S as EventStream>::Error: Debug,
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

/// Verifies that a position must identify a committed ordinal.
async fn positions_require_committed_ordinals<S, F>(make_stream: &F)
where
    S: EventStream,
    <S as EventStream>::Error: Debug,
    F: Fn() -> S,
{
    let first = make_stream();
    let second = make_stream();
    let receipt = first
        .append(Bytes::from_static(b"value"))
        .await
        .expect("append");
    let Err(error) = second.read(Some(&receipt.position)).await else {
        panic!("position beyond the committed head was accepted");
    };
    assert!(matches!(
        error.kind(),
        ErrorKind::InvalidPosition | ErrorKind::StalePosition
    ));
}

/// Verifies that snapshot publication rejects uncommitted positions.
async fn snapshot_positions_require_committed_ordinals<S, F>(make_stream: &F)
where
    S: EventStream
        + SnapshotStore<Position = <S as EventStream>::Position, Error = <S as EventStream>::Error>,
    <S as EventStream>::Error: Debug,
    F: Fn() -> S,
{
    let first = make_stream();
    let second = make_stream();
    let position = first
        .append(Bytes::from_static(b"value"))
        .await
        .expect("append")
        .position;
    let error = second
        .publish(
            Snapshot {
                at_event: SnapshotPosition::At(position),
                payload: Bytes::from_static(b"foreign-position"),
            },
            None,
        )
        .await
        .expect_err("uncommitted snapshot position should be rejected");
    assert!(matches!(
        error.kind(),
        ErrorKind::InvalidPosition | ErrorKind::StalePosition
    ));
}

/// Verifies optimistic parent matching and monotonic snapshot positions.
async fn snapshots_require_lineage_and_monotonicity<S, F>(make_stream: &F)
where
    S: EventStream
        + SnapshotStore<Position = <S as EventStream>::Position, Error = <S as EventStream>::Error>,
    <S as EventStream>::Error: Debug,
    F: Fn() -> S,
{
    let stream = make_stream();
    let initial_parent = stream
        .publish(
            Snapshot {
                at_event: SnapshotPosition::Initial,
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
                at_event: SnapshotPosition::At(second.position),
                payload: Bytes::from_static(b"state-2"),
            },
            Some(&initial_parent),
        )
        .await
        .expect("initial publication");

    let conflict = stream
        .publish(
            Snapshot {
                at_event: SnapshotPosition::At(first.position.clone()),
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
                at_event: SnapshotPosition::At(first.position),
                payload: Bytes::from_static(b"regression"),
            },
            Some(&parent),
        )
        .await
        .expect_err("position regression should conflict");
    assert_eq!(regression.kind(), ErrorKind::Conflict);
}

/// Verifies that recovery replays only records after the published snapshot.
async fn snapshot_recovery_reads_only_subsequent_records<S, F>(make_stream: &F)
where
    S: EventStream
        + SnapshotStore<Position = <S as EventStream>::Position, Error = <S as EventStream>::Error>,
    <S as EventStream>::Error: Debug,
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
                at_event: SnapshotPosition::At(snapshot_position),
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
    let SnapshotPosition::At(position) = snapshot.snapshot.at_event else {
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
