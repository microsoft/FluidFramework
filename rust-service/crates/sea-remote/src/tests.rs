//! Deterministic failure and cancellation tests at the provider boundary.

use crate::{Error, Factory, Journal, Result, Storage, record::Record};
use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{FutureExt, StreamExt};
use sea_core::{
    ClassifiedError, ErrorKind,
    storage::{SeaStorage, StorageHandle},
};
use std::sync::{Arc, Mutex};

/// Persistent fake service with one document and controllable acknowledgment failures.
#[derive(Default)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "Independent fault-injection switches in a test-only provider."
)]
struct Service {
    /// Committed records remain available across exclusive openings.
    records: Vec<Bytes>,
    /// Current exclusive owner, released only by explicit close.
    owned: bool,
    /// Commit once, then never resolve the request future.
    pause: bool,
    /// Commit once, then return an uncertain result.
    ambiguous: bool,
    /// Actual provider commit group sizes, not caller batch lengths.
    groups: Vec<usize>,
    /// Actual requested page sizes and retained bytes.
    pages: Vec<(usize, usize)>,
    /// Holds an authoritative observation in flight to exercise progress under lock contention.
    pause_check: bool,
}

/// Shares a service across newly opened provider connections.
struct Provider(Arc<Mutex<Service>>);
/// One exclusive provider opening.
struct Connection(Arc<Mutex<Service>>);

impl Connection {
    /// Models an atomic provider group whose acknowledgment can be interrupted or lost.
    async fn publish(&mut self, records: Vec<Bytes>) -> Result<Vec<u64>> {
        let (locations, pause, ambiguous) = {
            let mut service = self.0.lock().unwrap();
            let start = service.records.len() as u64;
            let locations = (start..start + records.len() as u64).collect();
            service.groups.push(records.len());
            service.records.extend(records);
            (locations, service.pause, service.ambiguous)
        };
        if pause {
            std::future::pending::<()>().await;
        }
        if ambiguous {
            return Err(Error::new(ErrorKind::Ambiguous, "lost acknowledgment"));
        }
        Ok(locations)
    }
}

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
        let paused = self.0.lock().unwrap().pause_check;
        if paused {
            std::future::pending::<()>().await;
        }
        Ok(())
    }
    async fn append(&mut self, bytes: Bytes) -> Result<u64> {
        Ok(self.publish(vec![bytes]).await?[0])
    }
    async fn append_batch(&mut self, records: Vec<Bytes>) -> Result<Vec<u64>> {
        crate::batch_size(&records)?;
        self.publish(records).await
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
    async fn read_batch(&mut self, records: &[(u64, usize)]) -> Result<Vec<Bytes>> {
        crate::validate_read_batch(records)?;
        self.0.lock().unwrap().pages.push((
            records.len(),
            records.iter().map(|(_, length)| length + 4).sum(),
        ));
        let mut output = Vec::new();
        for &(location, length) in records {
            let bytes = self.read(location).await?;
            assert_eq!(bytes.len(), length);
            output.push(bytes);
        }
        Ok(output)
    }
    async fn close(&mut self) -> Result<()> {
        self.0.lock().unwrap().owned = false;
        Ok(())
    }
}

#[tokio::test]
async fn event_groups_obey_count_and_exact_byte_limits() {
    for (values, expected) in [
        (vec![(Bytes::new(), None); 129], vec![128, 1]),
        (
            vec![(Bytes::from(vec![0; crate::MAX_BATCH_BYTES / 2 - 46]), None); 3],
            vec![2, 1],
        ),
    ] {
        let service = Arc::new(Mutex::new(Service::default()));
        let storage = Storage::new(Provider(service.clone()));
        let (_, view) = storage.create_view().await.unwrap();
        let count = values.len();
        let results = view.append_batch(values).await;
        assert_eq!(results.len(), count);
        assert!(results.iter().all(Result::is_ok));
        assert_eq!(service.lock().unwrap().groups, expected);
        assert_eq!(view.head().await.unwrap().unwrap().get(), count as u64);
        let mut stream = view.read(None, view.head().await.unwrap());
        let mut delivered = 0;
        while let Some(item) = stream.next().await {
            if matches!(item.unwrap(), sea_core::MonitoredStreamItem::Item(_)) {
                delivered += 1;
            }
        }
        assert_eq!(delivered, count);
        assert!(
            service
                .lock()
                .unwrap()
                .pages
                .iter()
                .all(|(count, bytes)| *count <= 128 && *bytes <= crate::MAX_BATCH_BYTES)
        );
        storage.shutdown().await.unwrap();
    }
}

#[tokio::test]
async fn batch_input_error_commits_only_the_valid_prefix() {
    let service = Arc::new(Mutex::new(Service::default()));
    let storage = Storage::new(Provider(service.clone()));
    let (_, view) = storage.create_view().await.unwrap();
    let results = view
        .append_batch(vec![
            (Bytes::from_static(b"valid"), None),
            (Bytes::from(vec![0; crate::MAX_RECORD_BYTES]), None),
            (Bytes::from_static(b"unattempted"), None),
        ])
        .await;
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].as_ref().unwrap().id().get(), 1);
    assert_eq!(results[1].as_ref().unwrap_err().kind(), ErrorKind::Rejected);
    assert_eq!(service.lock().unwrap().groups, vec![1]);
    assert_eq!(view.head().await.unwrap().unwrap().get(), 1);
    storage.shutdown().await.unwrap();
}

#[tokio::test]
async fn interrupted_group_poisons_head_and_prefetched_reads_until_recovery() {
    for cancelled in [false, true] {
        let service = Arc::new(Mutex::new(Service::default()));
        let storage = Storage::new(Provider(service.clone()));
        let (id, view) = storage.create_view().await.unwrap();
        assert!(
            view.append_batch(vec![(Bytes::new(), None); 3])
                .await
                .iter()
                .all(Result::is_ok)
        );
        let mut stream = view.read(None, None);
        assert!(matches!(
            stream.next().await.unwrap().unwrap(),
            sea_core::MonitoredStreamItem::Item(_)
        ));
        assert_eq!(stream.progress().previous.unwrap().get(), 1);
        {
            let mut backend = service.lock().unwrap();
            backend.pause = cancelled;
            backend.ambiguous = !cancelled;
        }
        {
            let append = view.append_batch(vec![(Bytes::new(), None); 129]);
            tokio::pin!(append);
            if cancelled {
                assert!(append.as_mut().now_or_never().is_none());
            } else {
                let results = append.await;
                assert_eq!(results.len(), 128);
                assert!(
                    results
                        .iter()
                        .all(|result| result.as_ref().unwrap_err().kind() == ErrorKind::Ambiguous)
                );
            }
        }
        assert_eq!(view.head().await.unwrap_err().kind(), ErrorKind::Ambiguous);
        assert_eq!(
            stream.next().await.unwrap().unwrap_err().kind(),
            ErrorKind::Ambiguous
        );
        assert_eq!(
            stream.progress().previous.unwrap().get(),
            1,
            "prefetch must not advance delivery"
        );
        assert_eq!(service.lock().unwrap().groups, vec![3, 128]);
        drop(stream);
        drop(view);
        let reopened = storage.open_view(&id).await.unwrap().unwrap();
        assert_eq!(reopened.head().await.unwrap().unwrap().get(), 131);
        storage.shutdown().await.unwrap();
    }
}

#[tokio::test]
async fn bounded_replay_pages_over_interleaved_journal_records() {
    use sea_core::storage::BlobStore;
    let service = Arc::new(Mutex::new(Service::default()));
    let storage = Storage::new(Provider(service.clone()));
    let (_, view) = storage.create_view().await.unwrap();
    for _ in 0..3 {
        assert!(
            view.append_batch(vec![(Bytes::new(), None); 70])
                .await
                .iter()
                .all(Result::is_ok)
        );
        view.publish_checkpoint(Bytes::from_static(b"internal"))
            .await
            .unwrap();
        view.blobs()
            .put_blob(Bytes::from_static(b"content"))
            .await
            .unwrap();
    }
    let mut stream = view.read(
        Some(sea_core::EventPosition::new(7)),
        Some(sea_core::EventPosition::new(190)),
    );
    let mut positions = Vec::new();
    if let sea_core::MonitoredStreamItem::Item(event) = stream.next().await.unwrap().unwrap() {
        positions.push(event.position.get());
    } else {
        panic!("expected the first page's first event");
    }
    let observed = stream.progress();
    assert_eq!(observed.previous.unwrap().get(), 8);
    assert_eq!(observed.latest_known.unwrap().get(), 190);
    service.lock().unwrap().pause_check = true;
    {
        let head = view.head();
        tokio::pin!(head);
        assert!(head.as_mut().now_or_never().is_none());
        assert_eq!(stream.progress().latest_known, observed.latest_known);
    }
    service.lock().unwrap().pause_check = false;
    while let Some(item) = stream.next().await {
        if let sea_core::MonitoredStreamItem::Item(event) = item.unwrap() {
            positions.push(event.position.get());
        }
    }
    assert_eq!(positions, (8..=190).collect::<Vec<_>>());
    assert_eq!(
        service
            .lock()
            .unwrap()
            .pages
            .iter()
            .map(|(count, _)| *count)
            .collect::<Vec<_>>(),
        vec![128, 55]
    );
    storage.shutdown().await.unwrap();
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
