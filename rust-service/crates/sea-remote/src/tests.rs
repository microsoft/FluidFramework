//! Deterministic failure and cancellation tests at the provider boundary.

use crate::{Error, Factory, Journal, Result, Storage, record::Record};
use async_trait::async_trait;
use bytes::Bytes;
use futures_util::FutureExt;
use sea_core::{
    ClassifiedError, ErrorKind,
    storage::{SeaStorage, StorageHandle},
};
use std::sync::{Arc, Mutex};

/// Persistent fake service with one document and controllable acknowledgment failures.
#[derive(Default)]
struct Service {
    /// Committed records remain available across exclusive openings.
    records: Vec<Bytes>,
    /// Current exclusive owner, released only by explicit close.
    owned: bool,
    /// Commit once, then never resolve the request future.
    pause: bool,
    /// Commit once, then return an uncertain result.
    ambiguous: bool,
}

/// Shares a service across newly opened provider connections.
struct Provider(Arc<Mutex<Service>>);
/// One exclusive provider opening.
struct Connection(Arc<Mutex<Service>>);

#[async_trait]
impl Factory for Provider {
    type Journal = Connection;
    async fn create(&self) -> Result<(sea_core::storage::DocumentId, Connection)> {
        let id = sea_core::storage::DocumentId::from_bytes(Bytes::from_static(b"document"));
        Ok((id.clone(), self.open(&id).await?.expect("known document")))
    }
    async fn open(&self, _: &sea_core::storage::DocumentId) -> Result<Option<Connection>> {
        let mut service = self.0.lock().unwrap();
        if service.owned {
            return Err(Error::new(ErrorKind::Conflict, "fake owner busy"));
        }
        service.owned = true;
        Ok(Some(Connection(self.0.clone())))
    }
}

#[async_trait]
impl Journal for Connection {
    async fn check(&mut self) -> Result<()> {
        Ok(())
    }
    async fn append(&mut self, bytes: Bytes) -> Result<u64> {
        let (location, pause, ambiguous) = {
            let mut service = self.0.lock().unwrap();
            let location = service.records.len() as u64;
            service.records.push(bytes);
            (location, service.pause, service.ambiguous)
        };
        if pause {
            std::future::pending::<()>().await;
        }
        if ambiguous {
            return Err(Error::new(ErrorKind::Ambiguous, "lost acknowledgment"));
        }
        Ok(location)
    }
    async fn read(&mut self, location: u64) -> Result<Bytes> {
        self.0
            .lock()
            .unwrap()
            .records
            .get(usize::try_from(location).unwrap())
            .cloned()
            .ok_or_else(|| Error::corrupt("missing fake record"))
    }
    async fn scan(&mut self, after: Option<u64>) -> Result<Vec<(u64, Bytes)>> {
        Ok(self
            .0
            .lock()
            .unwrap()
            .records
            .iter()
            .enumerate()
            .filter(|(index, _)| after.is_none_or(|cursor| *index as u64 > cursor))
            .map(|(index, bytes)| (index as u64, bytes.clone()))
            .collect())
    }
    async fn close(&mut self) -> Result<()> {
        self.0.lock().unwrap().owned = false;
        Ok(())
    }
}

#[tokio::test]
async fn uncertain_and_cancelled_appends_poison_heads_until_fenced_recovery() {
    for cancelled in [false, true] {
        let service = Arc::new(Mutex::new(Service::default()));
        let storage = Storage::new(Provider(service.clone()));
        let (id, view) = storage.create_view().await.unwrap();
        {
            let mut backend = service.lock().unwrap();
            backend.pause = cancelled;
            backend.ambiguous = !cancelled;
        }
        {
            let append = view.append(Bytes::from_static(b"may commit"), None);
            tokio::pin!(append);
            if cancelled {
                assert!(append.as_mut().now_or_never().is_none());
            } else {
                assert_eq!(append.await.unwrap_err().kind(), ErrorKind::Ambiguous);
            }
        }
        assert_eq!(view.head().await.unwrap_err().kind(), ErrorKind::Ambiguous);
        assert!(
            view.append(Bytes::from_static(b"must not commit"), None)
                .await
                .is_err()
        );
        assert_eq!(service.lock().unwrap().records.len(), 1);
        drop(view);
        let reopened = storage.open_view(&id).await.unwrap().unwrap();
        assert_eq!(reopened.head().await.unwrap().unwrap().get(), 1);
        assert_eq!(
            reopened
                .resolve_position(sea_core::EventPosition::new(1))
                .await
                .unwrap()
                .unwrap()
                .id()
                .get(),
            1
        );
        storage.shutdown().await.unwrap();
    }
}

#[tokio::test]
async fn recovery_rejects_corruption_and_missing_dependency_without_exposing_a_prefix() {
    for record in [
        Bytes::from_static(b"invalid encoded record"),
        Record::Event(sea_core::Event {
            payload: Bytes::new(),
            blob_tree: Some(sea_core::BlobTreeId::Blob(sea_core::BlobId::for_bytes(
                b"absent",
            ))),
        })
        .encode()
        .unwrap(),
    ] {
        let service = Arc::new(Mutex::new(Service {
            records: vec![record],
            ..Service::default()
        }));
        let storage = Storage::new(Provider(service.clone()));
        let error = storage
            .create_view()
            .await
            .err()
            .expect("corrupt recovery must fail");
        assert_eq!(error.kind(), ErrorKind::Corrupt);
        assert!(
            !service.lock().unwrap().owned,
            "failed recovery must release ownership"
        );
    }
}

#[test]
fn records_check_integrity_and_enforce_exact_size_boundary() {
    let payload_length = crate::MAX_RECORD_BYTES - 8 - 1 - 32;
    let accepted = Record::Blob(Bytes::from(vec![1; payload_length]))
        .encode()
        .unwrap();
    assert_eq!(accepted.len(), crate::MAX_RECORD_BYTES);
    assert!(Record::decode(&accepted).is_ok());
    assert_eq!(
        Record::Blob(Bytes::from(vec![1; payload_length + 1]))
            .encode()
            .unwrap_err()
            .kind(),
        ErrorKind::Rejected
    );
    let mut corrupt = accepted.to_vec();
    corrupt[10] ^= 1;
    assert_eq!(
        Record::decode(&Bytes::from(corrupt)).err().unwrap().kind(),
        ErrorKind::Corrupt
    );
    assert_eq!(
        Record::decode(&accepted.slice(..accepted.len() - 1))
            .err()
            .unwrap()
            .kind(),
        ErrorKind::Corrupt
    );
}
