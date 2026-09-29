//! Direct typed hosting without wire requests, a protocol adapter, or a listener.

use bytes::Bytes;
use futures_util::StreamExt as _;
use sea_core::{
    ClassifiedError, ErrorKind, Event, EventPosition, EventSubmission, MonitoredStreamItem,
    SeaArchive, SeaAuthorSession,
    archive::SessionEventKind,
    policy::PolicyError,
    storage::{DocumentId, SeaStorage, StorageHandle},
};
use sea_sequencer::session::SessionError;
use sea_webtransport_server::{
    DocumentHost, HostError, ReaderShedding, SessionSetup, StorageSetup,
};

/// Exercises the public typed path over any configured backend, preserving capability types.
async fn exercise<S: SeaStorage + 'static>(
    storage: StorageSetup<S>,
) -> (DocumentId, EventPosition) {
    let host =
        DocumentHost::new(storage, SessionSetup::default().decorate(ReaderShedding)).unwrap();
    let id = host.create_document().await.unwrap();
    host.ensure_document(&id).await.unwrap();
    let missing = DocumentId::from_bytes(Bytes::from_static(b"not-a-document"));
    assert!(matches!(
        host.ensure_document(&missing).await,
        Err(HostError::NotFound)
    ));

    let first = host.open_session(&id, None).await.unwrap();
    assert_eq!(
        first.id.get(),
        1,
        "document creation must not allocate membership"
    );
    let invalid = host
        .open_session(&id, Some(EventPosition::new(u64::MAX)))
        .await
        .err()
        .unwrap();
    assert!(matches!(
        invalid,
        HostError::Factory(PolicyError::Source(SessionError::Rejected(_)))
    ));
    assert_eq!(invalid.kind(), ErrorKind::Rejected);
    let sibling_host = host.clone();
    let second = sibling_host.open_session(&id, None).await.unwrap();
    assert_eq!(
        second.id.get(),
        2,
        "a failed open must not consume a membership"
    );

    let root = first
        .session
        .put_blob(Bytes::from_static(b"typed blob"))
        .await
        .unwrap();
    let position = first
        .session
        .submit(EventSubmission {
            reference: None,
            event: Event {
                payload: Bytes::from_static(b"typed event"),
                blob_tree: Some(root.id()),
            },
        })
        .await
        .unwrap();
    assert_eq!(
        second
            .session
            .resolve_tree(root.id())
            .await
            .unwrap()
            .unwrap()
            .id(),
        root.id()
    );
    let mut history = second.session.read(None, Some(position));
    let mut observed = Vec::new();
    while let Some(item) = history.next().await {
        if let MonitoredStreamItem::Item(event) = item.unwrap()
            && event.kind == SessionEventKind::Application
        {
            observed.push((event.committed.position, event.committed.event));
        }
    }
    assert_eq!(
        observed,
        vec![(
            position,
            Event {
                payload: Bytes::from_static(b"typed event"),
                blob_tree: Some(root.id()),
            }
        )]
    );
    first.session.close().await.unwrap();
    second.session.close().await.unwrap();
    host.flush().await.unwrap();
    sibling_host.shutdown().await.unwrap();
    assert!(matches!(
        host.create_document().await,
        Err(HostError::Closed)
    ));
    (id, position)
}

#[tokio::test]
async fn direct_sessions_preserve_typed_capabilities_and_errors_across_backends() {
    exercise(StorageSetup::memory()).await;
    let root = std::env::temp_dir().join(format!("sea-typed-host-{}", std::process::id()));
    assert!(!root.exists());
    exercise(StorageSetup::buffered(root.join("buffered"))).await;
    let (durable_id, position) = exercise(StorageSetup::durable(root.join("durable"))).await;
    let reopened = DocumentHost::new(
        StorageSetup::durable(root.join("durable")),
        SessionSetup::default(),
    )
    .unwrap();
    reopened.ensure_document(&durable_id).await.unwrap();
    let reader = reopened
        .open_session(&durable_id, None)
        .await
        .unwrap()
        .session;
    let mut history = reader.read(None, Some(position));
    let mut applications = Vec::new();
    while let Some(item) = history.next().await {
        if let MonitoredStreamItem::Item(event) = item.unwrap()
            && event.kind == SessionEventKind::Application
        {
            applications.push(event.committed.event.payload);
        }
    }
    assert_eq!(applications, vec![Bytes::from_static(b"typed event")]);
    reader.close().await.unwrap();
    reopened.shutdown().await.unwrap();
    drop((history, reader, reopened));
    std::fs::remove_dir_all(root).unwrap();
}
