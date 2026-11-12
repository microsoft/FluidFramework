//! Provider-level PostgreSQL connection-loss and retained-prefix tests.

use super::*;
use sea_core::ClassifiedError;

/// Creates an explicit caller-provisioned database fixture.
async fn factory() -> PostgresFactory {
    let factory = PostgresFactory::new(
        std::env::var("SEA_POSTGRES_URL")
            .expect("set SEA_POSTGRES_URL")
            .parse()
            .unwrap(),
    );
    factory.initialize().await.unwrap();
    factory
}

#[tokio::test]
#[ignore = "requires SEA_POSTGRES_URL"]
async fn terminated_connection_cannot_write_after_takeover() {
    let factory = factory().await;
    let (id, mut old) = factory.create().await.unwrap();
    old.append(Bytes::from_static(b"first")).await.unwrap();
    let pid: i32 = old
        .client()
        .unwrap()
        .query_one("SELECT pg_backend_pid()", &[])
        .await
        .unwrap()
        .get(0);
    let mut admin = factory.connect().await.unwrap();
    let terminated: bool = admin
        .client()
        .unwrap()
        .query_one("SELECT pg_terminate_backend($1, 5000)", &[&pid])
        .await
        .unwrap()
        .get(0);
    assert!(terminated);
    let mut new = factory.open(&id).await.unwrap().unwrap();
    assert!(old.append(Bytes::from_static(b"stale")).await.is_err());
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
    assert!(old.close().await.is_err());
    new.close().await.unwrap();
    admin.close().await.unwrap();
}

#[tokio::test]
#[ignore = "requires SEA_POSTGRES_URL"]
async fn missing_committed_row_fails_recovery() {
    let factory = factory().await;
    let (id, mut journal) = factory.create().await.unwrap();
    for _ in 0..3 {
        journal.append(Bytes::from_static(b"record")).await.unwrap();
    }
    let document = journal.document;
    journal.close().await.unwrap();
    let mut admin = factory.connect().await.unwrap();
    admin
        .client()
        .unwrap()
        .execute(
            "DELETE FROM sea_records WHERE document=$1 AND ordinal=2",
            &[&document],
        )
        .await
        .unwrap();
    let mut reopened = factory.open(&id).await.unwrap().unwrap();
    assert_eq!(
        reopened.scan(None).await.unwrap_err().kind(),
        ErrorKind::Corrupt
    );
    reopened.close().await.unwrap();
    admin.close().await.unwrap();
}
