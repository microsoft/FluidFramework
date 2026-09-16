#![doc = "Implementation-independent conformance checks for Sea event archives."]

use std::{collections::BTreeMap, fmt::Debug};

use bytes::Bytes;
use futures_util::{StreamExt, TryStreamExt, future::join_all};
use sea_core::{
    BlobDirectory, BlobId, BlobTreeId, ClassifiedError, ErrorKind, Event, EventPosition,
    archive::{
        EventSubmission, LoadEvent, OperationId, SeaArchive, SeaAuthorSession,
        SeaEventSubscription, SeaSession, SeaSnapshotCoordinator, SeaStorage,
        Snapshot as ArchiveSnapshot, SnapshotPosition as ArchiveSnapshotPosition,
        SnapshotPublication,
    },
};

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
    run_sea_responsibility_observable_behavior(session, session).await;
}

/// Runs observable behavior across separately composed session and snapshot responsibilities.
///
/// # Panics
///
/// Panics when the composed responsibilities do not preserve current Sea behavior.
pub async fn run_sea_responsibility_observable_behavior<S, C>(session: &S, snapshots: &C)
where
    S: SeaArchive + SeaAuthorSession + SeaEventSubscription,
    S::Error: Debug,
    C: SeaSnapshotCoordinator,
    C::Error: Debug,
{
    assert_eq!(
        snapshots.latest_snapshot().await.expect("initial snapshot"),
        None
    );
    let directory_id = round_trip_session_content(session).await;
    let first = submit_and_resolve_first_event(session, directory_id).await;
    let published =
        publish_and_resolve_snapshot(session, snapshots, directory_id, first.position).await;

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

    drop(load);
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
    assert_eq!(
        snapshots
            .latest_snapshot()
            .await
            .expect_err("closed snapshot coordinator")
            .kind(),
        ErrorKind::Rejected
    );
}

async fn round_trip_session_content<S>(session: &S) -> sea_core::BlobDirectoryId
where
    S: SeaArchive,
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
    S: SeaAuthorSession,
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
            .submit(submission.clone())
            .await
            .expect("idempotent submission retry"),
        receipt
    );
    let mut conflicting = submission;
    conflicting.event.payload = Bytes::from_static(b"different");
    assert!(matches!(
        session
            .submit(conflicting)
            .await
            .expect_err("operation identity reuse with different input")
            .kind(),
        ErrorKind::Conflict | ErrorKind::Rejected
    ));
    receipt
}

async fn publish_and_resolve_snapshot<S, C>(
    archive: &S,
    coordinator: &C,
    directory_id: sea_core::BlobDirectoryId,
    position: EventPosition,
) -> sea_core::archive::PublishedSnapshot
where
    S: SeaArchive,
    S::Error: Debug,
    C: SeaSnapshotCoordinator,
    C::Error: Debug,
{
    let mut snapshots = coordinator
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
    let published = coordinator
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
        coordinator
            .publish_snapshot(publication.clone())
            .await
            .expect("idempotent snapshot retry"),
        published
    );
    assert_eq!(
        coordinator
            .resolve_snapshot_publication(&publication.operation_id)
            .await
            .expect("snapshot resolution"),
        Some(published.clone())
    );
    assert_eq!(
        archive
            .snapshot(&published.id)
            .await
            .expect("snapshot lookup"),
        Some(published.clone())
    );
    assert_eq!(
        coordinator
            .latest_snapshot()
            .await
            .expect("latest snapshot"),
        Some(published.clone())
    );
    published
}

/// Runs the final trusted-backend laws against a fresh archive.
///
/// # Panics
///
/// Panics when the backend violates content, atomicity, history, idempotency, or load laws.
#[allow(clippy::too_many_lines)]
pub async fn run_sea_storage_conformance<S, F>(make_storage: F)
where
    S: SeaStorage,
    S::Error: Debug,
    F: Fn() -> S,
{
    storage_append_order_and_boundaries(&make_storage).await;
    storage_concurrent_appends_are_contiguous(&make_storage).await;
    storage_read_is_finite(&make_storage).await;
    storage_readers_are_independent_and_cancellable(&make_storage).await;
    storage_positions_require_committed_ordinals(&make_storage).await;
    storage_snapshot_positions_require_committed_ordinals(&make_storage).await;

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

    let stale_parent = storage
        .publish_snapshot(SnapshotPublication {
            operation_id: OperationId::new(Bytes::from_static(b"stale-parent-publication"))
                .expect("operation identity"),
            expected_parent: Some(initial.id),
            snapshot: ArchiveSnapshot {
                at_event: ArchiveSnapshotPosition::At(second.position),
                root: BlobTreeId::Directory(directory_id),
            },
        })
        .await
        .expect_err("stale snapshot parent must be rejected");
    assert_eq!(stale_parent.kind(), ErrorKind::Conflict);

    let regressive = storage
        .publish_snapshot(SnapshotPublication {
            operation_id: OperationId::new(Bytes::from_static(b"regressive-publication"))
                .expect("operation identity"),
            expected_parent: Some(positioned.id.clone()),
            snapshot: ArchiveSnapshot {
                at_event: ArchiveSnapshotPosition::Initial,
                root: BlobTreeId::Directory(directory_id),
            },
        })
        .await
        .expect_err("regressive snapshot must be rejected");
    assert_eq!(regressive.kind(), ErrorKind::Conflict);

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

async fn storage_append_order_and_boundaries<S, F>(make_storage: &F)
where
    S: SeaStorage,
    S::Error: Debug,
    F: Fn() -> S,
{
    let storage = make_storage();
    let first = storage
        .append(Event {
            payload: Bytes::from_static(b"first"),
            blob_tree: None,
        })
        .await
        .expect("first append");
    let second = storage
        .append(Event {
            payload: Bytes::new(),
            blob_tree: None,
        })
        .await
        .expect("second append");
    let third = storage
        .append(Event {
            payload: Bytes::from_static(b"third"),
            blob_tree: None,
        })
        .await
        .expect("third append");
    assert_eq!(storage.head().await.expect("head"), Some(third.position));

    let records = storage
        .read(Some(first.position), None)
        .await
        .expect("reader")
        .try_collect::<Vec<_>>()
        .await
        .expect("records");
    assert_eq!(records.len(), 2);
    assert_eq!(records[0].position, second.position);
    assert_eq!(records[0].event.payload, Bytes::new());
    assert_eq!(records[1].position, third.position);
    assert_eq!(records[1].event.payload, Bytes::from_static(b"third"));

    let after_head = storage
        .read(Some(third.position), None)
        .await
        .expect("reader after head")
        .try_collect::<Vec<_>>()
        .await
        .expect("records after head");
    assert!(after_head.is_empty());
}

async fn storage_concurrent_appends_are_contiguous<S, F>(make_storage: &F)
where
    S: SeaStorage,
    S::Error: Debug,
    F: Fn() -> S,
{
    let storage = make_storage();
    let appends = (0_u8..32).map(|value| {
        storage.append(Event {
            payload: Bytes::from(vec![value]),
            blob_tree: None,
        })
    });
    for result in join_all(appends).await {
        result.expect("concurrent append");
    }
    storage
        .append(Event {
            payload: Bytes::from_static(b"sentinel"),
            blob_tree: None,
        })
        .await
        .expect("precedence append");
    let records = storage
        .read(None, None)
        .await
        .expect("reader")
        .try_collect::<Vec<_>>()
        .await
        .expect("records");
    assert_eq!(records.len(), 33);
    assert_eq!(
        records.last().expect("sentinel record").event.payload,
        Bytes::from_static(b"sentinel")
    );
    let mut concurrent_values = records[..32]
        .iter()
        .map(|record| record.event.payload[0])
        .collect::<Vec<_>>();
    concurrent_values.sort_unstable();
    assert_eq!(concurrent_values, (0_u8..32).collect::<Vec<_>>());
}

async fn storage_read_is_finite<S, F>(make_storage: &F)
where
    S: SeaStorage,
    S::Error: Debug,
    F: Fn() -> S,
{
    let storage = make_storage();
    storage
        .append(Event {
            payload: Bytes::from_static(b"captured"),
            blob_tree: None,
        })
        .await
        .expect("captured append");
    let reader = storage.read(None, None).await.expect("reader");
    storage
        .append(Event {
            payload: Bytes::from_static(b"later"),
            blob_tree: None,
        })
        .await
        .expect("later append");
    let records = reader.try_collect::<Vec<_>>().await.expect("records");
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].event.payload, Bytes::from_static(b"captured"));
}

async fn storage_readers_are_independent_and_cancellable<S, F>(make_storage: &F)
where
    S: SeaStorage,
    S::Error: Debug,
    F: Fn() -> S,
{
    let storage = make_storage();
    for payload in [Bytes::from_static(b"one"), Bytes::from_static(b"two")] {
        storage
            .append(Event {
                payload,
                blob_tree: None,
            })
            .await
            .expect("append");
    }
    let mut cancelled = storage.read(None, None).await.expect("cancelled reader");
    let complete = storage.read(None, None).await.expect("complete reader");
    assert!(cancelled.next().await.is_some());
    drop(cancelled);
    let records = complete
        .try_collect::<Vec<_>>()
        .await
        .expect("complete records");
    assert_eq!(records.len(), 2);
    assert_eq!(
        storage.head().await.expect("head"),
        Some(records[1].position)
    );
}

async fn storage_positions_require_committed_ordinals<S, F>(make_storage: &F)
where
    S: SeaStorage,
    S::Error: Debug,
    F: Fn() -> S,
{
    let first = make_storage();
    let second = make_storage();
    let receipt = first
        .append(Event {
            payload: Bytes::from_static(b"value"),
            blob_tree: None,
        })
        .await
        .expect("append");
    let Err(error) = second.read(Some(receipt.position), None).await else {
        panic!("position beyond the committed head was accepted");
    };
    assert!(matches!(
        error.kind(),
        ErrorKind::InvalidPosition | ErrorKind::StalePosition
    ));
}

async fn storage_snapshot_positions_require_committed_ordinals<S, F>(make_storage: &F)
where
    S: SeaStorage,
    S::Error: Debug,
    F: Fn() -> S,
{
    let first = make_storage();
    let second = make_storage();
    let position = first
        .append(Event {
            payload: Bytes::from_static(b"value"),
            blob_tree: None,
        })
        .await
        .expect("append")
        .position;
    let root = second
        .put_blob(Bytes::from_static(b"foreign-position"))
        .await
        .expect("snapshot content");
    let error = second
        .publish_snapshot(SnapshotPublication {
            operation_id: OperationId::new(Bytes::from_static(b"foreign-position-publication"))
                .expect("operation identity"),
            expected_parent: None,
            snapshot: ArchiveSnapshot {
                at_event: ArchiveSnapshotPosition::At(position),
                root: BlobTreeId::Blob(root),
            },
        })
        .await
        .expect_err("uncommitted snapshot position should be rejected");
    assert!(matches!(
        error.kind(),
        ErrorKind::InvalidPosition | ErrorKind::StalePosition
    ));
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
