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
        old.append_batch(vec![Bytes::from_static(b"stale"); 3])
            .await
            .unwrap_err()
            .kind(),
        ErrorKind::Conflict
    );
    assert!(
        old.check().await.is_err(),
        "authoritative observations must detect revoked root ownership"
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

#[tokio::test]
#[ignore = "requires an Azure/Azurite test container"]
async fn grouped_blocks_and_range_pages_survive_rollover_and_reopen() {
    let factory = factory().await;
    let (id, mut journal) = factory.create().await.unwrap();
    let first = journal.append(Bytes::from_static(b"first")).await.unwrap();
    let group = journal
        .append_batch(vec![Bytes::from_static(b"group"); 3])
        .await
        .unwrap();
    assert_eq!(
        journal.blocks, 2,
        "three records must consume one append block"
    );
    assert_eq!(journal.segments.len(), 1);
    journal.append(Bytes::from_static(b"gap")).await.unwrap();
    let tail = journal
        .append_batch(vec![Bytes::from_static(b"tail"); 3])
        .await
        .unwrap();
    assert_eq!(journal.blocks, 2);
    assert_eq!(journal.segments.len(), 2);
    journal.close().await.unwrap();
    let mut reopened = factory.open(&id).await.unwrap().unwrap();
    let records: Vec<_> = [(first, 5)]
        .into_iter()
        .chain(group.into_iter().map(|location| (location, 5)))
        .chain(tail.into_iter().map(|location| (location, 4)))
        .collect();
    let expected: Vec<_> = [Bytes::from_static(b"first")]
        .into_iter()
        .chain(vec![Bytes::from_static(b"group"); 3])
        .chain(vec![Bytes::from_static(b"tail"); 3])
        .collect();
    assert_eq!(reopened.read_batch(&records).await.unwrap(), expected);
    assert_eq!(
        reopened.read(records[2].0).await.unwrap(),
        Bytes::from_static(b"group")
    );
    let mut invalid = records;
    invalid[0].1 += 1;
    assert!(reopened.read_batch(&invalid).await.is_err());
    reopened.close().await.unwrap();
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
