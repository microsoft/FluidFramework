//! Explicitly opt-in integration tests against real PostgreSQL.

use bytes::Bytes;
use sea_core::{ClassifiedError, ErrorKind, storage::SeaStorage};
use sea_postgres::{PostgresFactory, PostgresStorage};

/// Uses a caller-provided development database; no implicit network defaults.
async fn storage() -> PostgresStorage {
    let config = std::env::var("SEA_POSTGRES_URL")
        .expect("set SEA_POSTGRES_URL")
        .parse()
        .expect("PostgreSQL configuration");
    let factory = PostgresFactory::new(config);
    factory.initialize().await.unwrap();
    PostgresStorage::new(factory)
}

#[tokio::test]
#[ignore = "requires SEA_POSTGRES_URL"]
async fn conformance_and_recovery() {
    let storage = storage().await;
    tokio::time::timeout(std::time::Duration::from_secs(60), async {
        sea_conformance::run_view_conformance(&storage).await;
        sea_conformance::run_snapshot_archive_conformance(&storage).await;
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = sea_sequencer::session::LocalSequencer::<PostgresStorage>::recover(view)
            .await
            .unwrap();
        let first = runtime.open_session(None).await.unwrap();
        let second = runtime.open_session(None).await.unwrap();
        sea_conformance::run_session_conformance(&first, &second).await;
        runtime.shutdown().await.unwrap();
    })
    .await
    .expect("conformance timeout");
    storage.shutdown().await.unwrap();
}

#[tokio::test]
#[ignore = "requires SEA_POSTGRES_URL"]
async fn independent_factories_fence_ownership_and_recover_checkpoint() {
    let first = storage().await;
    let second = storage().await;
    let (id, view) = first.create_view().await.unwrap();
    let error = second
        .open_view(&id)
        .await
        .err()
        .expect("competing opener must fail");
    assert_eq!(error.kind(), ErrorKind::Conflict);
    view.publish_checkpoint(Bytes::from_static(b"checkpoint"))
        .await
        .unwrap();
    let event = view
        .append(Bytes::from_static(b"committed"), None)
        .await
        .unwrap();
    drop(event);
    first.shutdown().await.unwrap();
    assert!(view.head().await.is_err());
    let reopened = second.open_view(&id).await.unwrap().unwrap();
    assert_eq!(
        reopened.checkpoint().await.unwrap(),
        Some(Bytes::from_static(b"checkpoint"))
    );
    assert_eq!(reopened.head().await.unwrap().unwrap().get(), 1);
    second.shutdown().await.unwrap();
}
