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
    assert!(
        old.append_batch(vec![Bytes::from_static(b"stale"); 3])
            .await
            .is_err()
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
    assert!(old.close().await.is_err());
    new.close().await.unwrap();
    admin.close().await.unwrap();
}

#[tokio::test]
#[ignore = "requires SEA_POSTGRES_URL"]
async fn missing_committed_row_fails_recovery() {
    let factory = factory().await;
    let (id, mut journal) = factory.create().await.unwrap();
    journal
        .append_batch(vec![Bytes::from_static(b"record"); 3])
        .await
        .unwrap();
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
        reopened
            .read_batch(&[(1, 6), (2, 6), (3, 6)])
            .await
            .unwrap_err()
            .kind(),
        ErrorKind::Corrupt
    );
    assert_eq!(
        reopened.scan(None).await.unwrap_err().kind(),
        ErrorKind::Corrupt
    );
    reopened.close().await.unwrap();
    admin.close().await.unwrap();
}

#[tokio::test]
#[ignore = "requires SEA_POSTGRES_URL"]
async fn constraint_failure_rolls_back_the_entire_group_and_head_update() {
    let factory = factory().await;
    let (_, mut journal) = factory.create().await.unwrap();
    let mut admin = factory.connect().await.unwrap();
    admin
        .client()
        .unwrap()
        .execute(
            "INSERT INTO sea_records(document,ordinal,payload) VALUES ($1,2,$2)",
            &[&journal.document, &&b"conflict"[..]],
        )
        .await
        .unwrap();
    assert_eq!(
        journal
            .append_batch(vec![Bytes::from_static(b"group"); 3])
            .await
            .unwrap_err()
            .kind(),
        ErrorKind::Ambiguous
    );
    let count: i64 = admin
        .client()
        .unwrap()
        .query_one(
            "SELECT records FROM sea_documents WHERE id=$1",
            &[&journal.document],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(
        count, 0,
        "failed insertion must roll back the committed head"
    );
    let rows = admin
        .client()
        .unwrap()
        .query(
            "SELECT ordinal FROM sea_records WHERE document=$1 ORDER BY ordinal",
            &[&journal.document],
        )
        .await
        .unwrap();
    assert_eq!(
        rows.len(),
        1,
        "no prefix of the rejected SQL group may commit"
    );
    assert_eq!(rows[0].get::<_, i64>(0), 2);
    admin
        .client()
        .unwrap()
        .execute(
            "DELETE FROM sea_records WHERE document=$1",
            &[&journal.document],
        )
        .await
        .unwrap();
    journal.close().await.unwrap();
    admin.close().await.unwrap();
}
