//! Provider-level fencing and format checks.

use super::*;
use sea_core::ClassifiedError;

/// Creates the same explicit service fixture used by integration tests.
async fn factory() -> AzureFactory {
    let factory = AzureFactory::new(
        &std::env::var("SEA_AZURE_ENDPOINT").expect("set SEA_AZURE_ENDPOINT"),
        std::env::var("SEA_AZURE_ACCOUNT").expect("set SEA_AZURE_ACCOUNT"),
        &std::env::var("SEA_AZURE_KEY").expect("set SEA_AZURE_KEY"),
        std::env::var("SEA_AZURE_CONTAINER").expect("set SEA_AZURE_CONTAINER"),
    )
    .unwrap()
    .with_segment_blocks(2)
    .unwrap();
    factory.initialize().await.unwrap();
    factory
}

#[tokio::test]
#[ignore = "requires an Azure/Azurite test container"]
async fn takeover_fences_old_segment_requests_before_recovery() {
    let factory = factory().await;
    let (id, mut old) = factory.create().await.unwrap();
    old.append(Bytes::from_static(b"first")).await.unwrap();
    let root = old.ownership.lock().await.root.clone();
    old.http.lease(&root, "break", "").await.unwrap();
    let mut new = factory.open(&id).await.unwrap().unwrap();
    // Simulates a stale write already dispatched after the old root lease was lost.
    assert_eq!(
        old.append(Bytes::from_static(b"stale"))
            .await
            .unwrap_err()
            .kind(),
        ErrorKind::Conflict
    );
    new.append(Bytes::from_static(b"second")).await.unwrap();
    assert_eq!(
        new.scan(None)
            .await
            .unwrap()
            .into_iter()
            .map(|(_, b)| b)
            .collect::<Vec<_>>(),
        vec![Bytes::from_static(b"first"), Bytes::from_static(b"second")]
    );
    assert!(
        old.close().await.is_err(),
        "stale leases must not release the new owner's leases"
    );
    new.check().await.unwrap();
    new.close().await.unwrap();
}

#[test]
fn manifest_rejects_corrupt_or_duplicate_segments() {
    let id = Uuid::new_v4();
    let valid = encode_manifest(&[Segment { id, sealed: 0 }]).unwrap();
    assert_eq!(decode_manifest(&valid).unwrap().len(), 1);
    let mut damaged = valid.to_vec();
    damaged[12] ^= 1;
    assert_eq!(
        decode_manifest(&damaged).err().unwrap().kind(),
        ErrorKind::Corrupt
    );
    let duplicate =
        encode_manifest(&[Segment { id, sealed: 40 }, Segment { id, sealed: 0 }]).unwrap();
    assert!(decode_manifest(&duplicate).is_err());
}
