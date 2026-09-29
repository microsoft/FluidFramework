use std::time::Duration;

use bytes::Bytes;
use futures_util::StreamExt as _;
use sea_core::{Event, EventSubmission, SeaArchive, SeaAuthorSession, storage::LoadStart};
use tokio::time::timeout;

use super::*;
use crate::{PassThrough, ReaderShedding};

#[tokio::test]
async fn worker_failures_keep_initialization_and_document_ambiguity_distinct() {
    let initialization = DocumentHost::new(
        StorageSetup::<sea_memory::MemoryStorage>::open_with(|| {
            panic!("injected initialization failure")
        }),
        SessionSetup::default(),
    )
    .unwrap();
    let error = initialization.create_document().await.unwrap_err();
    assert!(matches!(error, HostError::InitializationWorker(_)));
    assert_eq!(error.kind(), ErrorKind::Unavailable);

    let mutation = DocumentHost::new(
        StorageSetup::from_storage(PausedStorage {
            inner: sea_memory::MemoryStorage::new(),
            pause: std::sync::Mutex::new(Some(Box::new(|| panic!("injected document failure")))),
            lifecycle: Arc::default(),
        }),
        SessionSetup::default(),
    )
    .unwrap();
    let error = mutation.create_document().await.unwrap_err();
    assert!(matches!(error, HostError::DocumentWorker(_)));
    assert_eq!(error.kind(), ErrorKind::Ambiguous);
}

/// Keeps storage-backed fixtures explicit without coupling them to production defaults.
fn registry<S: sea_core::storage::SeaStorage + 'static>(storage: S) -> DocumentRegistry<S> {
    registry_with(storage, SessionSetup::default().with_live_cache(false))
}

/// Constructs a fixture registry with a chosen document-factory composition.
fn registry_with<S, D>(storage: S, sessions: SessionSetup<D>) -> DocumentRegistry<S, D>
where
    S: sea_core::storage::SeaStorage + 'static,
    D: SessionDecorator<sea_sequencer::factory::LocalSessionFactory<S>, S::Error>,
{
    DocumentRegistry::new(
        Arc::new(storage),
        Arc::new(sessions),
        |_| None,
        opening_trace::OpeningTrace::default(),
    )
}

#[tokio::test]
async fn retained_document_factory_intercepts_before_allocation_and_dispatches_all_opens() {
    assert_factory(SessionSetup::default()).await;
    assert_factory(SessionSetup::default().decorate(PassThrough)).await;
    assert_factory(SessionSetup::default().decorate(ReaderShedding)).await;
    assert_factory(
        SessionSetup::default()
            .decorate(ReaderShedding)
            .decorate(PassThrough),
    )
    .await;
}

/// Verifies allocation, document sharing and author closure through the composed factory.
async fn assert_factory<D>(sessions: SessionSetup<D>)
where
    D: SessionDecorator<
            sea_sequencer::factory::LocalSessionFactory<sea_memory::MemoryStorage>,
            <sea_memory::MemoryStorage as sea_core::storage::SeaStorage>::Error,
        >,
{
    let registry = registry_with(sea_memory::MemoryStorage::new(), sessions);
    let id = registry.create().await.unwrap();
    let document = registry.open(&id).await.unwrap();
    assert!(Arc::ptr_eq(&document, &registry.open(&id).await.unwrap()));
    let first = document.factory.open_session(None).await.unwrap();
    assert_eq!(
        first.id.get(),
        1,
        "factory construction must not allocate membership"
    );
    let second = document.factory.open_session(None).await.unwrap();
    assert_eq!(second.id.get(), 2);
    let author = first.session;
    let sibling = second.session;
    let submit = || EventSubmission {
        reference: None,
        event: Event {
            payload: Bytes::from_static(b"pass-through"),
            blob_tree: None,
        },
    };
    author.submit(submit()).await.unwrap();
    author.close().await.unwrap();
    assert!(author.submit(submit()).await.is_err());
    sibling.submit(submit()).await.unwrap();
    sibling.close().await.unwrap();
    document.sequencer.shutdown().await.unwrap();
}

#[tokio::test]
async fn policy_reader_permits_are_document_wide_and_refusal_does_not_register() {
    let registry = registry_with(
        sea_memory::MemoryStorage::new(),
        SessionSetup::default().decorate(ReaderShedding),
    );
    let id = registry.create().await.unwrap();
    let document = registry.open(&id).await.unwrap();
    let factory = &document.factory;
    let first = factory.open_session(None).await.unwrap().session;
    let second = factory.open_session(None).await.unwrap().session;
    let readers = (0..128).map(|_| first.read(None, None)).collect::<Vec<_>>();
    let mut refused = second.read(None, None);
    assert!(refused.next().await.unwrap().is_err());
    assert_eq!(
        document.sequencer.live_cache_stats().unwrap().subscriptions,
        128
    );
    assert!(
        second
            .load(sea_core::storage::LoadStart::LatestSnapshot)
            .await
            .is_err()
    );
    drop(readers);
    let mut replacement = second.read(None, None);
    assert!(replacement.next().await.unwrap().is_ok());
    drop(replacement);
    first.close().await.unwrap();
    second.close().await.unwrap();
    document.sequencer.shutdown().await.unwrap();
}

#[tokio::test]
async fn resource_policy_refuses_disabled_cache_before_creating_storage() {
    let root = std::env::temp_dir().join(format!("sea-policy-disabled-{}", std::process::id()));
    assert!(!root.exists());
    let host = DocumentHost::new(
        StorageSetup::durable(root.clone()),
        SessionSetup::default()
            .with_live_cache(false)
            .decorate(ReaderShedding)
            .decorate(PassThrough),
    );
    assert!(host.is_err());
    assert!(!root.exists());
}

/// Exercises real file invalidation through experimental document recovery, without polling.
async fn assert_cache_shutdown<Storage: sea_core::storage::SeaStorage + 'static>(storage: Storage) {
    let registry = registry_with(storage, SessionSetup::default());
    let id = registry.create().await.unwrap();
    let runtime = registry.open(&id).await.unwrap();
    let author = runtime.sequencer.open_session(None).await.unwrap();
    let mut live = author.read(None, None);
    let unpolled = author.read(None, None);
    assert!(matches!(
        live.next().await.unwrap().unwrap(),
        sea_core::MonitoredStreamItem::Progress(_)
    ));
    author
        .submit(EventSubmission {
            reference: None,
            event: Event {
                payload: Bytes::from_static(b"retained"),
                blob_tree: None,
            },
        })
        .await
        .unwrap();
    assert_eq!(runtime.sequencer.live_cache_stats().unwrap().entries, 1);
    registry.storage.shutdown().await.unwrap();
    let stats = runtime.sequencer.live_cache_stats().unwrap();
    assert_eq!(
        (stats.subscriptions, stats.entries, stats.payload_bytes),
        (0, 0, 0)
    );
    assert!(matches!(
        live.next().await.unwrap(),
        Err(sea_sequencer::session::SessionError::StorageInvalidated(_))
    ));
    drop(unpolled);
}

#[tokio::test]
async fn experimental_file_registry_shutdown_releases_cache_without_subscriber_polling() {
    let root =
        std::path::PathBuf::from("target").join(format!("cache-registry-{}", std::process::id()));
    assert_cache_shutdown(sea_file::buffered::FileStorage::open(root.join("buffered")).unwrap())
        .await;
    assert_cache_shutdown(sea_file::durable::DurableStorage::open(root.join("durable")).unwrap())
        .await;
    std::fs::remove_dir_all(root).unwrap();
}

#[tokio::test]
async fn file_registry_recovers_checkpointed_offsets_and_departures() {
    use sea_core::{MonitoredStreamItem, archive::SessionEventKind, storage::SeaStorage};

    let root = std::env::temp_dir().join(format!("sea-registry-checkpoint-{}", std::process::id()));
    let storage = sea_file::durable::DurableStorage::open(&root).unwrap();
    let registry = registry(storage.clone());
    let id = registry.create().await.unwrap();
    let runtime = registry.open(&id).await.unwrap();
    let idle = runtime.sequencer.open_session(None).await.unwrap();
    idle.announce_membership(Bytes::from_static(b"idle"))
        .await
        .unwrap();
    let idle_id = idle.session_id().clone();
    let writer = runtime.sequencer.open_session(None).await.unwrap();
    let mut reference = None;
    for size in (0..1152).map(|ordinal| ordinal % 127) {
        reference = Some(
            writer
                .submit(EventSubmission {
                    reference,
                    event: Event {
                        payload: Bytes::from(vec![42; size]),
                        blob_tree: None,
                    },
                })
                .await
                .unwrap(),
        );
    }
    let head = reference.unwrap();
    let mut history = writer.read(None, Some(head));
    let mut floor = None;
    while let Some(item) = history.next().await {
        if let MonitoredStreamItem::Item(event) = item.unwrap() {
            assert!(event.minimum_reference >= floor);
            floor = event.minimum_reference;
        }
    }
    assert!(floor.is_some());
    drop((history, idle, writer, runtime, registry));
    let view = storage.open_view(&id).await.unwrap().unwrap();
    assert!(view.checkpoint().await.unwrap().is_some());
    assert!(
        view.get_snapshot(LoadStart::LatestSnapshot)
            .await
            .unwrap()
            .is_none()
    );
    drop(view);
    let registry = self::registry(storage);
    let runtime = registry.open(&id).await.unwrap();
    let reader = runtime.sequencer.open_session(None).await.unwrap();
    assert_eq!(reader.session_id().get(), 257);
    let mut departures = reader.read(Some(head), None);
    loop {
        if let MonitoredStreamItem::Item(event) = departures.next().await.unwrap().unwrap() {
            assert_eq!(event.kind, SessionEventKind::Left);
            assert_eq!(event.session_id, idle_id);
            assert!(event.minimum_reference >= floor);
            assert!(event.committed.position > head);
            break;
        }
    }
    drop((departures, reader, runtime, registry));
    std::fs::remove_dir_all(root).unwrap();
}

#[tokio::test]
async fn slow_backend_initialization_preserves_executor_progress_and_cancellation_ownership() {
    let (entered, entering) = tokio::sync::oneshot::channel();
    let (release, released) = std::sync::mpsc::channel();
    let pause = std::sync::Mutex::new(Some((entered, released)));
    let host = DocumentHost::new(
        StorageSetup::open_with(move || {
            let (entered, released) = pause.lock().unwrap().take().expect("initialize once");
            entered.send(()).unwrap();
            released
                .recv_timeout(Duration::from_secs(5))
                .expect("executor must release initialization");
            Ok(sea_memory::MemoryStorage::new())
        }),
        SessionSetup::default(),
    )
    .unwrap();
    assert!(host.inner.backend.lock().await.is_none());
    let initializing_host = host.clone();
    let initialization = tokio::spawn(async move { initializing_host.backend().await });
    entering.await.unwrap();
    let trace = host.opening_trace();
    assert_eq!(
        trace
            .snapshot()
            .iter()
            .map(|(_, stage)| *stage)
            .collect::<Vec<_>>(),
        [
            "backend: waiting for initialization lock",
            "backend: worker queued",
            "backend: worker started",
        ]
    );
    assert!(
        timeout(Duration::from_millis(10), host.backend())
            .await
            .is_err()
    );
    initialization.abort();
    assert!(matches!(initialization.await, Err(error) if error.is_cancelled()));
    assert!(host.inner.backend.try_lock().is_err());
    release.send(()).unwrap();
    let backend = host.backend().await.unwrap();
    assert!(Arc::ptr_eq(&backend, &host.backend().await.unwrap()));
    assert_eq!(
        trace
            .snapshot()
            .iter()
            .filter(|(_, stage)| *stage == "backend: storage initialized")
            .count(),
        1
    );
}

#[tokio::test]
async fn shutdown_rejects_document_admission_after_pending_backend_initialization() {
    for create in [false, true] {
        let storage = sea_memory::MemoryStorage::new();
        let (id, view) = storage.create_view().await.unwrap();
        drop(view);
        let (entered, entering) = tokio::sync::oneshot::channel();
        let (release, released) = std::sync::mpsc::channel();
        let pause = std::sync::Mutex::new(Some((entered, released, storage)));
        let host = DocumentHost::new(
            StorageSetup::open_with(move || {
                let (entered, released, storage) = pause.lock().unwrap().take().unwrap();
                entered.send(()).unwrap();
                released.recv_timeout(Duration::from_secs(5)).unwrap();
                Ok(storage)
            }),
            SessionSetup::default(),
        )
        .unwrap();
        let admission = async {
            if create {
                host.create_document().await.map(|_| ())
            } else {
                let opened = host.open_session(&id, None).await?;
                opened
                    .session
                    .submit(EventSubmission {
                        reference: None,
                        event: Event {
                            payload: Bytes::from_static(b"after shutdown"),
                            blob_tree: None,
                        },
                    })
                    .await
                    .unwrap();
                opened.session.close().await.unwrap();
                Ok(())
            }
        };
        tokio::pin!(admission);
        assert!(futures_util::poll!(&mut admission).is_pending());
        entering.await.unwrap();
        let shutdown = host.shutdown();
        tokio::pin!(shutdown);
        assert!(futures_util::poll!(&mut shutdown).is_pending());
        release.send(()).unwrap();
        timeout(Duration::from_secs(5), shutdown)
            .await
            .unwrap()
            .unwrap();
        assert!(
            matches!(admission.await, Err(HostError::Closed)),
            "create={create}"
        );
    }
}

#[tokio::test]
async fn shutdown_waits_for_cancelled_callers_document_worker() {
    let (entered, entering) = tokio::sync::oneshot::channel();
    let (release, released) = std::sync::mpsc::channel();
    let host = DocumentHost::new(
        StorageSetup::from_storage(PausedStorage {
            inner: sea_memory::MemoryStorage::new(),
            pause: std::sync::Mutex::new(Some(Box::new(move || {
                entered.send(()).unwrap();
                released.recv_timeout(Duration::from_secs(5)).unwrap();
            }))),
            lifecycle: Arc::default(),
        }),
        SessionSetup::default(),
    )
    .unwrap();
    let backend = host.backend().await.unwrap();
    let mut creation = Box::pin(host.create_document());
    assert!(futures_util::poll!(&mut creation).is_pending());
    entering.await.unwrap();
    drop(creation);
    let shutdown = host.shutdown();
    tokio::pin!(shutdown);
    assert!(futures_util::poll!(&mut shutdown).is_pending());
    release.send(()).unwrap();
    timeout(Duration::from_secs(5), shutdown)
        .await
        .unwrap()
        .unwrap();
    let documents = backend.documents.lock().await;
    assert_eq!(documents.entries.len(), 1);
    let runtime = documents.entries.first_key_value().unwrap().1;
    assert!(runtime.factory.open_session(None).await.is_err());
}

#[tokio::test]
async fn unused_lifecycle_operations_do_not_initialize_storage() {
    use std::sync::atomic::{AtomicUsize, Ordering};

    let attempts = Arc::new(AtomicUsize::new(0));
    let observed = attempts.clone();
    let host = DocumentHost::new(
        StorageSetup::open_with(move || {
            observed.fetch_add(1, Ordering::SeqCst);
            Ok(sea_memory::MemoryStorage::new())
        }),
        SessionSetup::default(),
    )
    .unwrap();
    host.flush().await.unwrap();
    assert_eq!(attempts.load(Ordering::SeqCst), 0);
    host.clone().shutdown().await.unwrap();
    host.flush().await.unwrap();
    let missing = DocumentId::from_bytes(Bytes::from_static(b"unused"));
    assert!(matches!(
        host.create_document().await,
        Err(HostError::Closed)
    ));
    assert!(matches!(
        host.ensure_document(&missing).await,
        Err(HostError::Closed)
    ));
    assert!(matches!(
        host.open_session(&missing, None).await,
        Err(HostError::Closed)
    ));
    assert_eq!(attempts.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn backend_initialization_failure_remains_retryable() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let attempts = Arc::new(AtomicUsize::new(0));
    let observed = attempts.clone();
    let host = DocumentHost::new(
        StorageSetup::open_with(move || {
            if observed.fetch_add(1, Ordering::SeqCst) == 0 {
                Err(sea_memory::MemoryStorageError::AlreadyOpen)
            } else {
                Ok(sea_memory::MemoryStorage::new())
            }
        }),
        SessionSetup::default(),
    )
    .unwrap();
    assert_eq!(attempts.load(Ordering::SeqCst), 0);
    assert!(matches!(
        host.backend().await,
        Err(HostError::Storage(
            sea_memory::MemoryStorageError::AlreadyOpen
        ))
    ));
    assert!(host.inner.backend.lock().await.is_none());
    let backend = host.backend().await.unwrap();
    assert!(Arc::ptr_eq(&backend, &host.backend().await.unwrap()));
    assert_eq!(attempts.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn document_registry_shares_concurrent_first_opens() {
    use sea_core::storage::SeaStorage as _;

    let storage = sea_memory::MemoryStorage::new();
    let (id, view) = storage
        .create_view()
        .await
        .expect("create persisted document");
    drop(view);
    let registry = self::registry(storage);
    let (first, second) = tokio::join!(registry.open(&id), registry.open(&id));
    assert!(Arc::ptr_eq(
        &first.expect("first"),
        &second.expect("second")
    ));
    let fresh = registry.create().await.expect("allocate document");
    assert_ne!(fresh, id);
    assert!(registry.open(&fresh).await.is_ok());
}

/// Injects synchronous storage latency independently of filesystem and VM timing.
struct PausedStorage {
    /// Real storage supplying exclusive document components after the pause.
    inner: sea_memory::MemoryStorage,
    /// One bounded blocking pause before creation or recovery.
    pause: std::sync::Mutex<Option<Box<dyn FnOnce() + Send>>>,
    /// Lifecycle calls observed through the backend-independent host interface.
    lifecycle: Arc<std::sync::Mutex<Vec<&'static str>>>,
}

impl PausedStorage {
    /// Consumes the pause on the first storage operation only.
    fn pause(&self) {
        if let Some(pause) = self.pause.lock().unwrap().take() {
            pause();
        }
    }
}

#[async_trait::async_trait]
impl sea_core::storage::SeaStorage for PausedStorage {
    type Error = <sea_memory::MemoryStorage as sea_core::storage::SeaStorage>::Error;
    type Blobs = <sea_memory::MemoryStorage as sea_core::storage::SeaStorage>::Blobs;
    type Events = <sea_memory::MemoryStorage as sea_core::storage::SeaStorage>::Events;
    type Snapshots = <sea_memory::MemoryStorage as sea_core::storage::SeaStorage>::Snapshots;

    fn durability(&self) -> sea_core::Durability {
        self.inner.durability()
    }

    async fn flush(&self) -> Result<(), Self::Error> {
        self.lifecycle.lock().unwrap().push("flush");
        Ok(())
    }

    async fn shutdown(&self) -> Result<(), Self::Error> {
        self.lifecycle.lock().unwrap().push("shutdown");
        Ok(())
    }

    async fn create_document(
        &self,
    ) -> Result<
        sea_core::storage::CreatedDocument<Self::Blobs, Self::Events, Self::Snapshots>,
        Self::Error,
    > {
        self.pause();
        self.inner.create_document().await
    }

    async fn open_document(
        &self,
        id: &sea_core::storage::DocumentId,
    ) -> Result<
        Option<sea_core::storage::StorageComponents<Self::Blobs, Self::Events, Self::Snapshots>>,
        Self::Error,
    > {
        self.pause();
        self.inner.open_document(id).await
    }
}

#[tokio::test]
async fn custom_storage_uses_generic_document_and_lifecycle_dispatch() {
    let lifecycle = Arc::new(std::sync::Mutex::new(Vec::new()));
    let host = DocumentHost::new(
        StorageSetup::from_storage(PausedStorage {
            inner: sea_memory::MemoryStorage::new(),
            pause: std::sync::Mutex::new(None),
            lifecycle: lifecycle.clone(),
        }),
        SessionSetup::default()
            .with_live_cache(false)
            .decorate(PassThrough),
    )
    .unwrap();
    let document = host.create_document().await.unwrap();
    let session = host.open_session(&document, None).await.unwrap().session;
    host.ensure_document(&document).await.unwrap();
    session.close().await.unwrap();
    host.flush().await.unwrap();
    host.shutdown().await.unwrap();
    assert_eq!(*lifecycle.lock().unwrap(), vec!["flush", "shutdown"]);
    assert!(host.open_session(&document, None).await.is_err());
}

#[tokio::test(flavor = "current_thread")]
async fn slow_document_initialization_preserves_executor_progress_and_cancellation_ownership() {
    use sea_core::storage::SeaStorage as _;

    for create in [false, true] {
        let storage = sea_memory::MemoryStorage::new();
        let (existing, view) = storage.create_view().await.unwrap();
        drop(view);
        let (entered, entering) = tokio::sync::oneshot::channel();
        let (release, released) = std::sync::mpsc::channel();
        let registry = Arc::new(self::registry(PausedStorage {
            inner: storage,
            lifecycle: Arc::default(),
            pause: std::sync::Mutex::new(Some(Box::new(move || {
                entered.send(()).unwrap();
                released
                    .recv_timeout(Duration::from_secs(5))
                    .expect("executor must release storage");
            }))),
        }));
        let initializing_registry = registry.clone();
        let initialization = tokio::spawn(async move {
            if create {
                initializing_registry.create().await.unwrap();
            } else {
                initializing_registry.open(&existing).await.unwrap();
            }
        });
        entering.await.unwrap();
        assert!(
            timeout(Duration::from_millis(10), registry.documents.lock())
                .await
                .is_err()
        );
        initialization.abort();
        assert!(initialization.await.unwrap_err().is_cancelled());
        assert!(registry.documents.try_lock().is_err());
        release.send(()).unwrap();
        let (id, cached) = {
            let documents = timeout(Duration::from_secs(5), registry.documents.lock())
                .await
                .unwrap();
            assert_eq!(documents.entries.len(), 1);
            let (id, cached) = documents.entries.first_key_value().unwrap();
            (
                sea_core::storage::DocumentId::from_bytes(Bytes::copy_from_slice(id)),
                cached.clone(),
            )
        };
        assert!(Arc::ptr_eq(&cached, &registry.open(&id).await.unwrap()));
    }
}

#[tokio::test]
async fn document_registry_retries_failed_initialization() {
    use sea_core::storage::{DocumentId, SeaStorage as _};

    let storage = sea_memory::MemoryStorage::new();
    let (id, external_view) = storage.create_view().await.expect("external writer");
    let registry = self::registry(storage);
    assert!(registry.open(&id).await.is_err());
    assert!(registry.documents.lock().await.entries.is_empty());
    drop(external_view);
    let runtime = registry
        .open(&id)
        .await
        .expect("retry after writer release");
    assert!(Arc::ptr_eq(
        &runtime,
        &registry.open(&id).await.expect("cached")
    ));
    let unknown = DocumentId::from_bytes(Bytes::from_static(b"unknown"));
    assert!(registry.open(&unknown).await.is_err());
    assert_eq!(registry.documents.lock().await.entries.len(), 1);
}
