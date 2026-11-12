//! Service tests run unchanged against Azure and a locally hosted Azurite.

use bytes::Bytes;
use futures_util::StreamExt;
use sea_azure::{AzureFactory, AzureStorage};
use sea_core::{ClassifiedError, ErrorKind, MonitoredStreamItem, storage::SeaStorage};

/// Caller-owned test container; lower segment limits force rollover during conformance.
async fn storage() -> AzureStorage {
    let endpoint = std::env::var("SEA_AZURE_ENDPOINT").expect("set SEA_AZURE_ENDPOINT");
    let account = std::env::var("SEA_AZURE_ACCOUNT").expect("set SEA_AZURE_ACCOUNT");
    let key = std::env::var("SEA_AZURE_KEY").expect("set SEA_AZURE_KEY");
    let container = std::env::var("SEA_AZURE_CONTAINER").expect("set SEA_AZURE_CONTAINER");
    let factory = AzureFactory::new(&endpoint, account, &key, container)
        .unwrap()
        .with_segment_blocks(3)
        .unwrap();
    factory.initialize().await.unwrap();
    AzureStorage::new(factory)
}

#[tokio::test]
#[ignore = "requires SEA_AZURE_ENDPOINT, SEA_AZURE_ACCOUNT, SEA_AZURE_KEY, SEA_AZURE_CONTAINER"]
async fn conformance_across_segment_rollover() {
    let storage = storage().await;
    tokio::time::timeout(std::time::Duration::from_secs(90), async {
        sea_conformance::run_view_conformance(&storage).await;
        sea_conformance::run_snapshot_archive_conformance(&storage).await;
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = sea_sequencer::session::LocalSequencer::<AzureStorage>::recover(view)
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
#[ignore = "requires SEA_AZURE_ENDPOINT, SEA_AZURE_ACCOUNT, SEA_AZURE_KEY, SEA_AZURE_CONTAINER"]
async fn independent_factories_fence_and_recover_all_segments() {
    let first = storage().await;
    let second = storage().await;
    let (id, view) = first.create_view().await.unwrap();
    let error = second
        .open_view(&id)
        .await
        .err()
        .expect("competing opener must fail");
    assert_eq!(error.kind(), ErrorKind::Conflict);
    for n in 0..10_u8 {
        view.append(Bytes::from(vec![n]), None).await.unwrap();
    }
    view.publish_checkpoint(Bytes::from_static(b"checkpoint"))
        .await
        .unwrap();
    first.shutdown().await.unwrap();
    assert!(view.append(Bytes::new(), None).await.is_err());
    let reopened = second.open_view(&id).await.unwrap().unwrap();
    assert_eq!(
        reopened.checkpoint().await.unwrap(),
        Some(Bytes::from_static(b"checkpoint"))
    );
    let mut stream = reopened.read(None, reopened.head().await.unwrap());
    let mut payloads = Vec::new();
    while let Some(item) = stream.next().await {
        if let MonitoredStreamItem::Item(event) = item.unwrap() {
            payloads.push(event.event.payload);
        }
    }
    assert_eq!(
        payloads,
        (0..10_u8).map(|n| Bytes::from(vec![n])).collect::<Vec<_>>()
    );
    second.shutdown().await.unwrap();
}
