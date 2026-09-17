use std::sync::Arc;

use bytes::Bytes;
use futures_util::StreamExt as _;
use sea_core::{
    BlobTreeId, Event,
    archive::{
        AuthorId, EventSubmission, LoadEvent, OperationId, SeaArchive, SeaAuthorSession,
        SeaEventSubscription, SeaSnapshotCoordinator, SessionId, Snapshot, SnapshotPosition,
        SnapshotPublication,
    },
};
use sea_memory::MemoryStream;
use sea_sequencer::session::{LocalSequencer, LocalSession};

type CounterSession = LocalSession<MemoryStream>;

/// Opens an in-memory session for the counter's fixed author and session identifiers.
async fn counter_session(storage: Arc<MemoryStream>) -> CounterSession {
    LocalSequencer::recover(storage)
        .await
        .expect("recover sequencer")
        .open_session(
            AuthorId::new(Bytes::from_static(b"counter-author")).expect("author"),
            SessionId::new(Bytes::from_static(b"counter-session")).expect("session"),
            None,
        )
        .await
        .expect("open session")
}

/// Appends one signed counter delta to the session.
async fn append_delta(session: &CounterSession, operation: &'static [u8], delta: i64) {
    session
        .submit(EventSubmission {
            operation_id: OperationId::new(Bytes::from_static(operation)).expect("operation"),
            reference: None,
            event: Event {
                payload: Bytes::copy_from_slice(&delta.to_be_bytes()),
                blob_tree: None,
            },
        })
        .await
        .expect("append delta");
}

/// Publishes a blob-backed counter snapshot at the supplied stream position.
async fn publish_snapshot(
    session: &CounterSession,
    operation: &'static [u8],
    value: i64,
    at_event: SnapshotPosition,
) {
    let root = session
        .put_blob(Bytes::copy_from_slice(&value.to_be_bytes()))
        .await
        .expect("put snapshot blob");
    session
        .publish_snapshot(SnapshotPublication {
            operation_id: OperationId::new(Bytes::from_static(operation)).expect("operation"),
            expected_parent: None,
            snapshot: Snapshot {
                at_event,
                root: BlobTreeId::Blob(root),
            },
        })
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
    let mut load = session.load(None).await.expect("load counter");
    let mut value = 0_i64;
    while let Some(item) = load.next().await {
        match item.expect("load item") {
            LoadEvent::Snapshot(snapshot) => {
                let BlobTreeId::Blob(root) = snapshot.snapshot.root else {
                    panic!("counter snapshot root must be a blob");
                };
                let bytes = session.get_blob(root).await.expect("get snapshot blob");
                value = decode_counter_value(
                    bytes.as_ref(),
                    "counter snapshot must contain exactly 8 bytes",
                )?;
            }
            LoadEvent::Event(event) => {
                value += decode_counter_value(
                    event.committed.event.payload.as_ref(),
                    "counter delta must contain exactly 8 bytes",
                )?;
            }
            LoadEvent::CaughtUp(_) => break,
        }
    }
    Ok(value)
}

/// Runs the snapshot and replay demonstration.
#[tokio::main]
async fn main() {
    let session = counter_session(Arc::new(MemoryStream::new())).await;
    append_delta(&session, b"delta-1", 2).await;
    append_delta(&session, b"delta-2", 3).await;
    let position = session
        .resolve_submission(&OperationId::new(Bytes::from_static(b"delta-2")).unwrap())
        .await
        .unwrap()
        .unwrap()
        .position;
    publish_snapshot(&session, b"snapshot", 5, SnapshotPosition::At(position)).await;
    append_delta(&session, b"delta-3", -1).await;

    let value = recover(&session).await.expect("recover counter");
    assert_eq!(value, 4);
    println!("recovered counter: {value}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn recovers_from_initial_snapshot() {
        let session = counter_session(Arc::new(MemoryStream::new())).await;
        publish_snapshot(&session, b"initial", 10, SnapshotPosition::Initial).await;
        append_delta(&session, b"delta", -3).await;
        assert_eq!(recover(&session).await, Ok(7));
    }

    #[tokio::test]
    async fn recovers_only_events_after_later_snapshot() {
        let session = counter_session(Arc::new(MemoryStream::new())).await;
        append_delta(&session, b"first", 2).await;
        append_delta(&session, b"second", 3).await;
        let position = session
            .resolve_submission(&OperationId::new(Bytes::from_static(b"second")).unwrap())
            .await
            .unwrap()
            .unwrap()
            .position;
        publish_snapshot(&session, b"later", 5, SnapshotPosition::At(position)).await;
        append_delta(&session, b"final", -1).await;
        assert_eq!(recover(&session).await, Ok(4));
    }

    #[tokio::test]
    async fn rejects_malformed_delta() {
        let session = counter_session(Arc::new(MemoryStream::new())).await;
        session
            .submit(EventSubmission {
                operation_id: OperationId::new(Bytes::from_static(b"malformed")).unwrap(),
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
}
