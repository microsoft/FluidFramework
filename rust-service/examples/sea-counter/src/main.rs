use bytes::Bytes;
use futures_util::StreamExt as _;
use sea_core::{
    BlobTreeId, Event, EventPosition, MonitoredStreamItem, MonitoredStreamStatus,
    archive::{EventSubmission, SnapshotParticipation},
    session::{SeaArchive, SeaAuthorSession, SeaSnapshotCoordinator},
    storage::{LoadStart, SeaStorage, Snapshot, StorageHandle},
};
use sea_memory::MemoryStorage;
use sea_sequencer::session::{LocalSequencer, LocalSession};

/// Counter membership over one exclusively opened memory document.
type CounterSession = LocalSession<MemoryStorage>;

/// Opens an in-memory session for the counter's session identity.
async fn counter_session() -> CounterSession {
    let (_, view) = MemoryStorage::new()
        .create_view()
        .await
        .expect("create document");
    LocalSequencer::<MemoryStorage>::recover(view)
        .await
        .expect("recover sequencer")
        .open_session(None)
        .await
        .expect("open session")
}

/// Appends one signed counter delta to the session.
async fn append_delta(session: &CounterSession, delta: i64) -> EventPosition {
    session
        .submit(EventSubmission {
            reference: None,
            event: Event {
                payload: Bytes::copy_from_slice(&delta.to_be_bytes()),
                blob_tree: None,
            },
        })
        .await
        .expect("append delta")
}

/// Publishes a blob-backed counter snapshot at the supplied stream position.
async fn publish_snapshot(session: &CounterSession, value: i64, at_event: EventPosition) {
    let root = session
        .put_blob(Bytes::copy_from_slice(&value.to_be_bytes()))
        .await
        .expect("put snapshot blob");
    let _participation = session
        .coordinate_snapshots(SnapshotParticipation::ClientSelected)
        .await
        .expect("coordinate snapshots");
    let at_event = session
        .resolve_position(at_event)
        .await
        .expect("resolve position")
        .expect("committed event");
    session
        .publish_snapshot(None, None, Snapshot { at_event, root })
        .await
        .expect("publish snapshot");
}

/// Decodes one counter value from its fixed-width big-endian representation.
fn decode_counter_value(
    bytes: &[u8],
    invalid_length_message: &'static str,
) -> Result<i64, &'static str> {
    let encoded = bytes.try_into().map_err(|_| invalid_length_message)?;
    Ok(i64::from_be_bytes(encoded))
}

/// Recovers the counter from the newest snapshot and its subsequent events.
async fn recover(session: &CounterSession) -> Result<i64, &'static str> {
    let load = session.load(LoadStart::LatestSnapshot).await.expect("load");
    let mut value = 0_i64;
    if let Some(snapshot) = load.snapshot {
        let BlobTreeId::Blob(root) = snapshot.root.id() else {
            panic!("counter snapshot root must be a blob");
        };
        let bytes = session.get_blob(root).await.expect("get snapshot blob");
        value = decode_counter_value(
            bytes.as_ref(),
            "counter snapshot must contain exactly 8 bytes",
        )?;
    }
    let mut events = load.events;
    while let Some(item) = events.next().await {
        match item.expect("load item") {
            MonitoredStreamItem::Item(event) => {
                value += decode_counter_value(
                    event.committed.event.payload.as_ref(),
                    "counter delta must contain exactly 8 bytes",
                )?;
            }
            MonitoredStreamItem::Progress(progress)
                if progress.status == MonitoredStreamStatus::AwaitingNewItems =>
            {
                break;
            }
            MonitoredStreamItem::Progress(_) => {}
        }
    }
    Ok(value)
}

/// Runs the snapshot and replay demonstration.
async fn run_demo() -> i64 {
    let session = counter_session().await;
    append_delta(&session, 2).await;
    let position = append_delta(&session, 3).await;
    publish_snapshot(&session, 5, position).await;
    append_delta(&session, -1).await;

    recover(&session).await.expect("recover counter")
}

/// Runs the snapshot and replay demonstration.
#[tokio::main]
async fn main() {
    let value = run_demo().await;
    assert_eq!(value, 4);
    println!("recovered counter: {value}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn replays_without_a_snapshot_and_stops_at_the_live_boundary() {
        let session = counter_session().await;
        assert_eq!(recover(&session).await, Ok(0));
        append_delta(&session, 7).await;
        append_delta(&session, -10).await;
        assert_eq!(recover(&session).await, Ok(-3));
    }

    #[tokio::test]
    async fn recovers_from_committed_initial_state() {
        let session = counter_session().await;
        let position = append_delta(&session, 10).await;
        publish_snapshot(&session, 10, position).await;
        append_delta(&session, -3).await;
        assert_eq!(recover(&session).await, Ok(7));
    }

    #[tokio::test]
    async fn later_snapshot_replaces_prior_event_state_before_tail_replay() {
        let session = counter_session().await;
        let position = append_delta(&session, 2).await;
        publish_snapshot(&session, 20, position).await;
        append_delta(&session, -1).await;

        assert_eq!(recover(&session).await, Ok(19));
    }

    #[tokio::test]
    async fn runs_snapshot_and_replay_demo() {
        assert_eq!(run_demo().await, 4);
    }

    #[tokio::test]
    async fn rejects_malformed_delta() {
        let session = counter_session().await;
        session
            .submit(EventSubmission {
                reference: None,
                event: Event {
                    payload: Bytes::from_static(b"not-an-i64"),
                    blob_tree: None,
                },
            })
            .await
            .unwrap();

        assert_eq!(
            recover(&session).await,
            Err("counter delta must contain exactly 8 bytes")
        );
    }

    #[tokio::test]
    async fn rejects_malformed_snapshot() {
        let session = counter_session().await;
        let root = session
            .put_blob(Bytes::from_static(b"not-an-i64"))
            .await
            .unwrap();
        let position = session
            .submit(EventSubmission {
                reference: None,
                event: Event {
                    payload: Bytes::copy_from_slice(&0_i64.to_be_bytes()),
                    blob_tree: Some(root.id()),
                },
            })
            .await
            .unwrap();
        let at_event = session.resolve_position(position).await.unwrap().unwrap();
        let _participation = session
            .coordinate_snapshots(SnapshotParticipation::ClientSelected)
            .await
            .unwrap();
        session
            .publish_snapshot(None, None, Snapshot { at_event, root })
            .await
            .unwrap();

        assert_eq!(
            recover(&session).await,
            Err("counter snapshot must contain exactly 8 bytes")
        );
    }
}
