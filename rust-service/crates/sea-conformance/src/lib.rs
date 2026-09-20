#![doc = include_str!("../README.md")]

//! Shared behavioral checks for storage and session implementations.
//!
//! The storage checks exercise contracts common to every backend: document isolation, handle
//! provenance, ordered archive ranges, dependency-closed publication, snapshot selection, and
//! reopening. They deliberately leave backend-specific future-bound behavior, durability, and
//! resource lifetimes to each implementation's focused tests.
//!
//! [`crate::run_session_conformance`] checks the implementation-independent session workflow
//! over two memberships: explicit initialization, conditional snapshot publication,
//! snapshot-plus-live loading, distinct equal submissions, ordered replay, and isolated close.
//! Cancellation, reconciliation failures, publisher fencing, and concrete runtime ownership remain
//! implementation responsibilities and require owner-local tests.

use sea_core::{
    archive::{EventSubmission, SnapshotParticipation},
    session::SeaSession,
};

/// Exercises two memberships sharing one runtime, including a real initialization event.
///
/// # Panics
/// Panics when session ordering, conditional publication, replay, or isolated close violates the contract.
pub async fn run_session_conformance<Session: SeaSession>(first: &Session, second: &Session) {
    let root = first
        .put_blob(Bytes::from_static(b"initial state"))
        .await
        .expect("state");
    let initialization = first
        .submit(EventSubmission {
            reference: None,
            event: Event {
                payload: Bytes::from_static(b"initialize"),
                blob_tree: Some(root.id()),
            },
        })
        .await
        .expect("explicit initialization event");
    let authority = first
        .coordinate_snapshots(SnapshotParticipation::ClientSelected)
        .await
        .expect("publisher");
    let initial = Snapshot {
        root,
        at_event: first
            .resolve_position(initialization)
            .await
            .expect("resolve")
            .expect("event"),
    };
    first
        .publish_snapshot(None, None, initial.clone())
        .await
        .expect("initial application snapshot");
    let mut loaded = second.load(LoadStart::LatestSnapshot).await.expect("load");
    assert_eq!(
        loaded.snapshot.as_ref().expect("snapshot").at_event.id(),
        initialization
    );
    assert_eq!(loaded.events.progress().previous, Some(initialization));
    let mut request = EventSubmission {
        reference: Some(initialization),
        event: Event {
            payload: Bytes::new(),
            blob_tree: None,
        },
    };
    let position = second
        .submit(request.clone())
        .await
        .expect("second session submission");
    let repeated = second
        .submit(request.clone())
        .await
        .expect("equal independent submission");
    assert!(repeated > position);
    for expected in [position, repeated] {
        assert_eq!(
            next_data(&mut loaded.events)
                .await
                .expect("live suffix")
                .committed
                .position,
            expected
        );
    }
    let mut bounded = first.read(None, Some(repeated));
    for expected in [initialization, position, repeated] {
        assert_eq!(
            next_data(&mut bounded)
                .await
                .expect("ordered replay")
                .committed
                .position,
            expected
        );
    }
    assert!(next_data(&mut bounded).await.is_none());
    first
        .publish_snapshot(None, None, initial)
        .await
        .expect("exact retry after publication");
    first.close().await.expect("close first membership");
    request.reference = Some(position);
    let final_position = second
        .submit(request)
        .await
        .expect("other session survives");
    assert_eq!(
        next_data(&mut loaded.events)
            .await
            .expect("live after peer close")
            .committed
            .position,
        final_position
    );
    drop(authority);
}

use std::collections::BTreeMap;

use bytes::Bytes;
use futures_util::StreamExt;
use sea_core::{
    BlobDirectory, Event, EventPosition, MonitoredStreamItem,
    storage::{
        Archive, ArchiveStream, BlobStore, LoadStart, ReferenceableStore, SeaStorage, SeaView,
        Snapshot, SnapshotArchive, StorageHandle,
    },
};

/// Concrete view provided by one conformance factory.
type View<Storage> = SeaView<
    <Storage as SeaStorage>::Blobs,
    <Storage as SeaStorage>::Events,
    <Storage as SeaStorage>::Snapshots,
>;

/// Blob evidence associated with a factory's view.
type BlobHandle<Storage> = <<Storage as SeaStorage>::Blobs as ReferenceableStore>::Handle;

/// Event evidence associated with a factory's view.
type EventHandle<Storage> = <<Storage as SeaStorage>::Events as ReferenceableStore>::Handle;

/// Returns the next data item, ignoring out-of-band progress observations.
async fn next_data<Item, Error: std::fmt::Debug>(
    stream: &mut ArchiveStream<Item, EventPosition, Error>,
) -> Option<Item> {
    while let Some(item) = stream.next().await {
        if let MonitoredStreamItem::Item(item) = item.expect("archive read") {
            return Some(item);
        }
    }
    None
}

/// Checks direct-view publication, snapshot policies, bounded replay, live load, and reopening.
///
/// # Panics
/// Panics when a factory violates storage laws. The caller should bound test duration
/// to diagnose a backend that never completes a bounded read or never wakes a live reader.
pub async fn run_view_conformance<Storage: SeaStorage>(storage: &Storage) {
    let (id, view) = storage.create_view().await.expect("create view");
    assert!(
        storage.open_view(&id).await.is_err(),
        "competing writer accepted"
    );
    assert_eq!(view.head().await.expect("empty head"), None);
    assert!(
        view.resolve_position(EventPosition::new(1))
            .await
            .expect("unknown event")
            .is_none()
    );
    let mut beginning = view
        .load(LoadStart::Beginning)
        .await
        .expect("empty live load");
    assert!(beginning.snapshot.is_none());
    let root = publish_tree::<Storage>(&view).await;
    let root_id = root.id();
    let first = view
        .append(Bytes::from_static(b"same"), None)
        .await
        .expect("first event");
    let second = view
        .append(Bytes::from_static(b"same"), None)
        .await
        .expect("distinct equal event");
    let third = view
        .append(Bytes::new(), Some(&root))
        .await
        .expect("tree event");
    assert!(first.id() < second.id() && second.id() < third.id());
    let positions = [first.id(), second.id(), third.id()];
    for position in positions {
        assert_eq!(
            next_data(&mut beginning.events)
                .await
                .expect("live event")
                .position,
            position
        );
    }
    assert_eq!(
        view.resolve_position(second.id())
            .await
            .expect("resolve event")
            .expect("event")
            .id(),
        second.id()
    );
    publish_snapshots_and_check_selection::<Storage>(&view, &root, [&first, &second, &third]).await;
    let mut bounded = view.read(Some(first.id()), Some(third.id()));
    assert_eq!(
        next_data(&mut bounded).await.expect("second").position,
        second.id()
    );
    let event = next_data(&mut bounded).await.expect("third");
    assert_eq!(event.position, third.id());
    assert_eq!(event.event.blob_tree, Some(root_id));
    assert!(next_data(&mut bounded).await.is_none());
    let mut empty = view.read(Some(third.id()), Some(first.id()));
    assert!(next_data(&mut empty).await.is_none());
    let mut loaded = view
        .load(LoadStart::LatestSnapshot)
        .await
        .expect("latest load");
    assert_eq!(
        loaded.snapshot.as_ref().expect("snapshot").at_event.id(),
        third.id()
    );
    let fourth = view
        .append(Bytes::from_static(b"live tail"), None)
        .await
        .expect("tail");
    let last_position = fourth.id();
    assert_eq!(
        next_data(&mut loaded.events)
            .await
            .expect("live tail")
            .position,
        last_position
    );
    drop((
        beginning, bounded, empty, loaded, root, first, second, third, fourth, view,
    ));
    assert_reopened_history(storage, &id, root_id, positions, last_position).await;
}

/// Verifies recovery without retaining any original opening or handles.
async fn assert_reopened_history<Storage: SeaStorage>(
    storage: &Storage,
    id: &sea_core::storage::DocumentId,
    root_id: sea_core::BlobTreeId,
    positions: [EventPosition; 3],
    last_position: EventPosition,
) {
    let reopened = storage
        .open_view(id)
        .await
        .expect("reopen")
        .expect("known document");
    assert_eq!(
        reopened.head().await.expect("recovered head"),
        Some(last_position)
    );
    let snapshot = reopened
        .get_snapshot(LoadStart::LatestSnapshot)
        .await
        .expect("snapshot lookup")
        .expect("retained snapshot");
    assert_eq!(snapshot.root.id(), root_id);
    reopened
        .blobs()
        .ensure_available(&snapshot.root)
        .await
        .expect("recovered root");
    let mut history = reopened.read(None, Some(last_position));
    for expected in positions.into_iter().chain([last_position]) {
        assert_eq!(
            next_data(&mut history)
                .await
                .expect("retained event")
                .position,
            expected
        );
    }
    assert!(next_data(&mut history).await.is_none());
}

/// Publishes and resolves a complete content tree for a direct view.
async fn publish_tree<Storage: SeaStorage>(view: &View<Storage>) -> BlobHandle<Storage> {
    let leaf = view
        .blobs()
        .put_blob(Bytes::from_static(b"state"))
        .await
        .expect("blob");
    let directory =
        BlobDirectory::new(BTreeMap::from([("leaf".to_owned(), leaf.id())])).expect("directory");
    let root = view
        .blobs()
        .put_directory(directory)
        .await
        .expect("complete tree");
    assert_eq!(
        view.blobs()
            .resolve(root.id())
            .await
            .expect("resolve")
            .expect("root")
            .id(),
        root.id()
    );
    view.blobs()
        .ensure_available(&root)
        .await
        .expect("availability");
    root
}

/// Checks snapshot selection independently of live event delivery.
async fn publish_snapshots_and_check_selection<Storage: SeaStorage>(
    view: &View<Storage>,
    root: &BlobHandle<Storage>,
    events: [&EventHandle<Storage>; 3],
) {
    for index in [0, 2] {
        view.publish_snapshot(&Snapshot {
            root: root.clone(),
            at_event: events[index].clone(),
        })
        .await
        .expect("snapshot");
    }
    assert!(
        view.get_snapshot(LoadStart::Beginning)
            .await
            .expect("beginning")
            .is_none()
    );
    for (bound, expected) in [
        (events[1].id(), events[0].id()),
        (events[2].id(), events[2].id()),
    ] {
        assert_eq!(
            view.get_snapshot(LoadStart::ReplayAtLeastAllAfter(bound))
                .await
                .expect("bounded snapshot")
                .expect("selected snapshot")
                .at_event
                .id(),
            expected
        );
    }
}

/// Checks sparse snapshot ranges, exact lookup, inclusive selection, and strict append order.
///
/// # Panics
/// Panics when an archive loses a publication or violates ordering/selection laws.
pub async fn run_snapshot_archive_conformance<Storage: SeaStorage>(storage: &Storage) {
    let created = storage
        .create_document()
        .await
        .expect("document components");
    let components = created.components;
    assert!(
        components
            .snapshots
            .latest_at_or_before(None)
            .await
            .expect("empty snapshots")
            .is_none()
    );
    let root = components
        .blobs
        .put_blob(Bytes::new())
        .await
        .expect("empty blob");
    let mut events = Vec::new();
    for _ in 0..3 {
        events.push(
            components
                .events
                .append(Event {
                    payload: Bytes::new(),
                    blob_tree: None,
                })
                .await
                .expect("event"),
        );
    }
    for index in [0, 2] {
        components
            .snapshots
            .append(Snapshot {
                root: root.clone(),
                at_event: events[index].clone(),
            })
            .await
            .expect("snapshot");
    }
    assert!(
        components
            .snapshots
            .get_snapshot_at(events[1].id())
            .await
            .expect("sparse exact lookup")
            .is_none()
    );
    let exact = components
        .snapshots
        .get_snapshot_at(events[0].id())
        .await
        .expect("exact lookup")
        .expect("snapshot");
    components
        .blobs
        .ensure_available(&exact.root)
        .await
        .expect("snapshot blob evidence");
    components
        .events
        .ensure_available(&exact.at_event)
        .await
        .expect("snapshot event evidence");
    assert_eq!(
        components
            .snapshots
            .latest_at_or_before(Some(events[1].id()))
            .await
            .expect("bounded lookup")
            .expect("first snapshot")
            .at_event
            .id(),
        events[0].id()
    );
    for index in [0, 2] {
        assert!(
            components
                .snapshots
                .append(Snapshot {
                    root: root.clone(),
                    at_event: events[index].clone()
                })
                .await
                .is_err()
        );
    }
    assert_snapshot_ranges(
        &components.snapshots,
        [events[0].id(), events[1].id(), events[2].id()],
    )
    .await;
}

/// Exercises range boundaries that need not name an actual snapshot publication.
async fn assert_snapshot_ranges<Snapshots: SnapshotArchive>(
    snapshots: &Snapshots,
    positions: [EventPosition; 3],
) {
    let mut prefix = snapshots.read(None, Some(positions[1]));
    assert_eq!(
        next_data(&mut prefix)
            .await
            .expect("first snapshot")
            .at_event
            .id(),
        positions[0]
    );
    assert!(next_data(&mut prefix).await.is_none());
    let mut suffix = snapshots.read(Some(positions[1]), Some(positions[2]));
    assert_eq!(
        next_data(&mut suffix)
            .await
            .expect("third snapshot")
            .at_event
            .id(),
        positions[2]
    );
    assert!(next_data(&mut suffix).await.is_none());
}
