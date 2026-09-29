//! Bounded document admission for the configurable policy decorator.

use std::sync::Arc;

use async_trait::async_trait;
use sea_core::{
    ClassifiedError, ErrorKind, EventPosition,
    policy::{DocumentPolicy, WriteRequest},
};
use sea_file::{FileStorageError, pressure::DurableWritePressure};
use sea_sequencer::session::{LiveCachePressure, SessionError};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

/// Fixed logical input budget, not a bound on caller-owned backing allocations.
const WRITE_BYTES: usize = 16 * 1024 * 1024;
/// Soft cache entry target, not a publication limit.
const OUTPUT_ENTRIES: usize = 1024;
/// Soft canonical payload target, excluding downstream handles.
const OUTPUT_BYTES: usize = 8 * 1024 * 1024;

/// Selects bounded input admission and independent outgoing-reader shedding.
///
/// Requires live caching. See the crate documentation for fixed budgets and exclusions.
#[derive(Default)]
pub struct ReaderShedding;

impl<S, E> crate::SessionDecorator<S, E> for ReaderShedding
where
    S: sea_core::factory::SessionFactory<Session: 'static> + 'static,
    E: ClassifiedError,
{
    type Factory = sea_core::policy::PolicyFactory<S, AdmissionPolicy<E>>;

    fn requires_live_cache(&self) -> bool {
        true
    }

    fn decorate(&self, source: S, context: &crate::DocumentContext<'_, E>) -> Self::Factory {
        sea_core::policy::PolicyFactory::new(
            source,
            Arc::new(AdmissionPolicy::new(
                context.storage.clone(),
                context.output.clone().expect("host validated live caching"),
            )),
        )
    }
}

/// Definitive policy refusal before invoking a source operation.
#[derive(Debug, thiserror::Error)]
pub enum AdmissionError<E: ClassifiedError> {
    /// Refused before source invocation.
    #[error("{0}")]
    Rejected(&'static str),
    /// Retains the terminal durable-opening cause, not uncertainty about this refused operation.
    #[error("admission observation failed before source invocation: {0}")]
    Storage(#[from] FileStorageError),
    /// Retains the terminal cache cause, not uncertainty about this refused operation.
    #[error("admission observation failed before source invocation: {0}")]
    Output(#[source] SessionError<E>),
}

impl<E: ClassifiedError> ClassifiedError for AdmissionError<E> {
    fn kind(&self) -> ErrorKind {
        let kind = match self {
            Self::Rejected(_) => ErrorKind::Rejected,
            Self::Storage(error) => error.kind(),
            Self::Output(error) => error.kind(),
        };
        match kind {
            ErrorKind::Ambiguous => ErrorKind::Unavailable,
            other => other,
        }
    }
}

/// Pending input ownership, released before the source takes responsibility.
pub struct WritePermit {
    /// Retains one bounded waiter slot.
    _request: OwnedSemaphorePermit,
    /// Retains the conservative logical input charge.
    _bytes: OwnedSemaphorePermit,
}

/// Shared admission, durable pressure waiting, and independent outgoing-reader shedding.
pub struct AdmissionPolicy<E: ClassifiedError> {
    /// Bounds pending operations, including same-session FIFO waits.
    requests: Arc<Semaphore>,
    /// Bounds pending logical content bytes.
    bytes: Arc<Semaphore>,
    /// Bounds admitted live streams, including pending loads.
    readers: Arc<Semaphore>,
    /// Optional durable-only inbound observation; never retained storage ownership.
    storage: Option<DurableWritePressure>,
    /// Weak cache observation and identity-scoped shedding action.
    output: LiveCachePressure<E>,
    /// Cancels the coalesced driver when the document policy is no longer owned.
    monitor: tokio::task::JoinHandle<()>,
}

impl<E: ClassifiedError> Drop for AdmissionPolicy<E> {
    fn drop(&mut self) {
        self.monitor.abort();
    }
}

impl<E: ClassifiedError> AdmissionPolicy<E> {
    /// Builds independent document-local admission authorities.
    pub(crate) fn new(storage: Option<DurableWritePressure>, output: LiveCachePressure<E>) -> Self {
        let pressure = output.clone();
        let monitor = tokio::spawn(async move {
            loop {
                match pressure.wait_above(OUTPUT_ENTRIES, OUTPUT_BYTES).await {
                    Ok(_) => {}
                    Err(SessionError::Closed) => return,
                    Err(error) => {
                        eprintln!("document pressure monitor terminated: {error}");
                        return;
                    }
                }
                match pressure.revoke_lagging(OUTPUT_ENTRIES, OUTPUT_BYTES) {
                    Ok(_) => tokio::task::yield_now().await,
                    Err(SessionError::Closed) => return,
                    Err(error) => {
                        eprintln!("document pressure shedding terminated: {error}");
                        return;
                    }
                }
            }
        });
        Self {
            requests: Arc::new(Semaphore::new(128)),
            bytes: Arc::new(Semaphore::new(WRITE_BYTES)),
            readers: Arc::new(Semaphore::new(128)),
            storage,
            output,
            monitor,
        }
    }

    /// Rejects new sessions/readers above the soft target without blocking existing authors.
    fn admit_output(&self) -> Result<(), AdmissionError<E>> {
        let sample = self.output.current().map_err(AdmissionError::Output)?;
        if sample.entries > OUTPUT_ENTRIES || sample.payload_bytes > OUTPUT_BYTES {
            return Err(AdmissionError::Rejected(
                "document outgoing cache exceeds its soft target",
            ));
        }
        Ok(())
    }
}

#[async_trait]
impl<E: ClassifiedError> DocumentPolicy for AdmissionPolicy<E> {
    type Error = AdmissionError<E>;
    type Permit = WritePermit;
    type ReaderPermit = OwnedSemaphorePermit;

    fn admit_session(&self, _reference: Option<EventPosition>) -> Result<(), Self::Error> {
        self.admit_output()
    }

    fn admit_live_reader(&self) -> Result<Self::ReaderPermit, Self::Error> {
        self.admit_output()?;
        self.readers
            .clone()
            .try_acquire_owned()
            .map_err(|_| AdmissionError::Rejected("document live-reader admission is full"))
    }

    fn acquire_write(&self, input: WriteRequest<'_>) -> Result<Self::Permit, Self::Error> {
        let bytes = match input {
            WriteRequest::Submit(submission) => submission.event.payload.len().checked_add(128),
            WriteRequest::Blob(payload) => payload.len().checked_add(128),
            WriteRequest::Directory(directory) => directory
                .entries()
                .iter()
                .try_fold(128_usize, |bytes, (name, _)| {
                    bytes.checked_add(name.len())?.checked_add(64)
                }),
        }
        .filter(|bytes| *bytes <= WRITE_BYTES)
        .ok_or(AdmissionError::Rejected(
            "pending write exceeds document byte limit",
        ))?;
        let request =
            self.requests.clone().try_acquire_owned().map_err(|_| {
                AdmissionError::Rejected("document pending-write admission is full")
            })?;
        let bytes = self
            .bytes
            .clone()
            .try_acquire_many_owned(u32::try_from(bytes).expect("bounded pending bytes fit u32"))
            .map_err(|_| AdmissionError::Rejected("document pending-write byte budget is full"))?;
        Ok(WritePermit {
            _request: request,
            _bytes: bytes,
        })
    }

    async fn wait_write(&self, _permit: &Self::Permit) -> Result<(), Self::Error> {
        if let Some(storage) = &self.storage {
            storage.wait_below(127, WRITE_BYTES / 2).await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;
    use futures_util::StreamExt;
    use sea_core::{
        Event, EventSubmission, MonitoredStreamItem, SeaArchive, SeaAuthorSession,
        storage::SeaStorage,
    };
    use sea_sequencer::session::LocalSequencer;

    #[test]
    fn terminal_observation_errors_are_definitive() {
        let errors: [AdmissionError<FileStorageError>; 3] = [
            AdmissionError::Storage(FileStorageError::Ambiguous),
            AdmissionError::Output(SessionError::RecoveryRequired),
            AdmissionError::Output(SessionError::StorageInvalidated(Arc::new(
                FileStorageError::Ambiguous,
            ))),
        ];
        for error in errors {
            assert_eq!(error.kind(), ErrorKind::Unavailable);
            assert!(std::error::Error::source(&error).is_some());
        }
        assert_eq!(
            AdmissionError::<FileStorageError>::Storage(FileStorageError::Corrupt("test")).kind(),
            ErrorKind::Corrupt
        );
    }

    /// Injects terminal sensor results while retaining the concrete policy's admission permits.
    struct FailedObservation {
        admission: AdmissionPolicy<sea_memory::MemoryStorageError>,
        storage: bool,
    }

    #[async_trait]
    impl DocumentPolicy for FailedObservation {
        type Error = AdmissionError<sea_memory::MemoryStorageError>;
        type Permit = WritePermit;
        type ReaderPermit = OwnedSemaphorePermit;

        fn admit_session(&self, reference: Option<EventPosition>) -> Result<(), Self::Error> {
            self.admission.admit_session(reference)
        }

        fn admit_live_reader(&self) -> Result<Self::ReaderPermit, Self::Error> {
            self.admission.admit_live_reader()
        }

        fn acquire_write(&self, request: WriteRequest<'_>) -> Result<Self::Permit, Self::Error> {
            self.admission.acquire_write(request)
        }

        async fn wait_write(&self, permit: &Self::Permit) -> Result<(), Self::Error> {
            self.admission.wait_write(permit).await?;
            if self.storage {
                Err(AdmissionError::Storage(FileStorageError::Ambiguous))
            } else {
                Err(AdmissionError::Output(SessionError::RecoveryRequired))
            }
        }
    }

    #[tokio::test]
    async fn failed_observations_release_permits_and_end_only_wrapper_append_authority() {
        use sea_core::policy::{PolicyError, PolicySession};
        for storage_failure in [false, true] {
            let storage = sea_memory::MemoryStorage::new();
            let (_, view) = storage.create_view().await.unwrap();
            let runtime =
                LocalSequencer::<sea_memory::MemoryStorage>::recover_with_live_cache(view)
                    .await
                    .unwrap();
            let source = runtime.open_session(None).await.unwrap();
            let mut events = source.read(None, None);
            catch_up(&mut events).await;
            let policy = Arc::new(FailedObservation {
                admission: AdmissionPolicy::new(None, runtime.live_cache_pressure().unwrap()),
                storage: storage_failure,
            });
            let wrapped = PolicySession::new(source.clone(), policy.clone());
            let sibling = wrapped.clone();
            let submission = || EventSubmission {
                reference: None,
                event: Event {
                    payload: Bytes::from_static(b"not submitted"),
                    blob_tree: None,
                },
            };
            let error = wrapped.submit(submission()).await.unwrap_err();
            assert!(matches!(error, PolicyError::Policy(_)));
            assert_eq!(error.kind(), ErrorKind::Unavailable);
            assert_eq!(policy.admission.requests.available_permits(), 128);
            assert_eq!(policy.admission.bytes.available_permits(), WRITE_BYTES);
            assert!(matches!(
                sibling.submit(submission()).await,
                Err(PolicyError::Terminal)
            ));
            assert!(futures_util::poll!(events.next()).is_pending());
            source.submit(submission()).await.unwrap();
            while matches!(
                events.next().await.unwrap().unwrap(),
                MonitoredStreamItem::Progress(_)
            ) {}
            wrapped.close().await.unwrap();
            runtime.shutdown().await.unwrap();
        }
    }

    /// Consumes discovery until the empty live boundary without reading application data.
    async fn catch_up<E: ClassifiedError>(
        stream: &mut sea_core::storage::ArchiveStream<
            sea_core::SessionCommittedEvent,
            EventPosition,
            E,
        >,
    ) {
        while let Some(item) = stream.next().await {
            match item.unwrap() {
                MonitoredStreamItem::Progress(progress)
                    if progress.status == sea_core::MonitoredStreamStatus::AwaitingNewItems =>
                {
                    return;
                }
                MonitoredStreamItem::Progress(_) => {}
                MonitoredStreamItem::Item(_) => panic!("unexpected catch-up data"),
            }
        }
        panic!("stream terminated before live boundary");
    }

    #[tokio::test]
    async fn output_pressure_refuses_admission_then_sheds_without_slow_reader_polling() {
        let storage = sea_memory::MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<sea_memory::MemoryStorage>::recover_with_live_cache(view)
            .await
            .unwrap();
        let author = runtime.open_session(None).await.unwrap();
        let mut slow = author.read(None, None);
        let mut fast = author.read(None, None);
        catch_up(&mut slow).await;
        catch_up(&mut fast).await;
        let pressure = runtime.live_cache_pressure().unwrap();
        let policy = AdmissionPolicy::new(None, pressure.clone());
        for index in 0..=OUTPUT_ENTRIES {
            author
                .submit(EventSubmission {
                    reference: None,
                    event: Event {
                        payload: Bytes::from_static(b"x"),
                        blob_tree: None,
                    },
                })
                .await
                .unwrap();
            loop {
                if matches!(
                    fast.next().await.unwrap().unwrap(),
                    MonitoredStreamItem::Item(_)
                ) {
                    break;
                }
            }
            if index + 1 == OUTPUT_ENTRIES {
                assert_eq!(pressure.current().unwrap().entries, OUTPUT_ENTRIES);
                policy.admit_session(None).unwrap();
                drop(policy.admit_live_reader().unwrap());
            }
        }
        assert_eq!(pressure.current().unwrap().entries, OUTPUT_ENTRIES + 1);
        assert!(policy.admit_session(None).is_err());
        assert!(policy.admit_live_reader().is_err());
        let empty = Bytes::new();
        let permit = policy.acquire_write(WriteRequest::Blob(&empty)).unwrap();
        policy.wait_write(&permit).await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(5), pressure.wait_below(0, 0))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(pressure.current().unwrap().claims, 1);
        assert!(matches!(
            slow.next().await.unwrap(),
            Err(SessionError::SubscriptionRevoked)
        ));
        assert!(policy.admit_live_reader().is_ok());
        author
            .submit(EventSubmission {
                reference: None,
                event: Event {
                    payload: Bytes::from_static(b"still-authorized"),
                    blob_tree: None,
                },
            })
            .await
            .unwrap();
        assert!(fast.next().await.unwrap().is_ok());
        runtime.shutdown().await.unwrap();
        assert!(policy.admit_session(None).is_err());
        tokio::task::yield_now().await;
        assert!(policy.monitor.is_finished());
    }

    #[tokio::test]
    async fn byte_pressure_sheds_stopped_readers_and_monitor_does_not_own_the_document() {
        let storage = sea_memory::MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<sea_memory::MemoryStorage>::recover_with_live_cache(view)
            .await
            .unwrap();
        let author = runtime.open_session(None).await.unwrap();
        let mut slow = author.read(None, None);
        catch_up(&mut slow).await;
        let output = runtime.live_cache_pressure().unwrap();
        let owners = Arc::strong_count(&runtime);
        let policy = AdmissionPolicy::new(None, output.clone());
        assert_eq!(Arc::strong_count(&runtime), owners);
        for _ in 0..3 {
            author
                .submit(EventSubmission {
                    reference: None,
                    event: Event {
                        payload: Bytes::from(vec![1; 3 * 1024 * 1024]),
                        blob_tree: None,
                    },
                })
                .await
                .unwrap();
        }
        assert_eq!(output.current().unwrap().entries, 3);
        assert!(output.current().unwrap().payload_bytes > OUTPUT_BYTES);
        tokio::time::timeout(std::time::Duration::from_secs(5), output.wait_below(0, 0))
            .await
            .unwrap()
            .unwrap();
        let monitor = policy.monitor.abort_handle();
        drop(policy);
        tokio::task::yield_now().await;
        assert!(monitor.is_finished());
        assert!(matches!(
            slow.next().await.unwrap(),
            Err(SessionError::SubscriptionRevoked)
        ));
        drop((slow, author, runtime));
        assert!(matches!(output.current(), Err(SessionError::Closed)));
    }

    #[test]
    fn durable_pressure_wait_resumes_on_drain_or_fails_on_shutdown() {
        let executor = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .max_blocking_threads(1)
            .build()
            .unwrap();
        for shutdown in [false, true] {
            executor.block_on(async {
                let root = std::env::temp_dir().join(format!(
                    "sea-policy-pressure-{}-{shutdown}",
                    std::process::id()
                ));
                assert!(!root.exists());
                let storage = sea_file::DurableStorage::open(&root).unwrap();
                let (_, view) = storage.create_view().await.unwrap();
                let blobs = view.blobs().clone();
                let pressure = blobs.write_pressure().unwrap();
                let runtime =
                    LocalSequencer::<sea_file::DurableStorage>::recover_with_live_cache(view)
                        .await
                        .unwrap();
                let policy = AdmissionPolicy::new(
                    Some(pressure.clone()),
                    runtime.live_cache_pressure().unwrap(),
                );
                let (release, blocked) = std::sync::mpsc::channel();
                let (entered, started) = tokio::sync::oneshot::channel();
                let worker = tokio::task::spawn_blocking(move || {
                    entered.send(()).unwrap();
                    blocked.recv().unwrap();
                });
                started.await.unwrap();
                {
                    use sea_core::storage::BlobStore;
                    let write = blobs.put_blob(Bytes::from(vec![7; 3 * 1024 * 1024]));
                    tokio::pin!(write);
                    assert!(futures_util::poll!(&mut write).is_pending());
                    assert!(pressure.current().unwrap().preparation.bytes > WRITE_BYTES / 2);
                    let empty = Bytes::new();
                    let permit = policy.acquire_write(WriteRequest::Blob(&empty)).unwrap();
                    {
                        let waiting = policy.wait_write(&permit);
                        tokio::pin!(waiting);
                        assert!(futures_util::poll!(&mut waiting).is_pending());
                        assert_eq!(policy.requests.available_permits(), 127);
                        if shutdown {
                            {
                                let closing = storage.shutdown();
                                tokio::pin!(closing);
                                assert!(futures_util::poll!(&mut closing).is_pending());
                            }
                            assert!(matches!(waiting.await, Err(AdmissionError::Storage(_))));
                            release.send(()).unwrap();
                            assert!(matches!(
                                write.await,
                                Ok(_) | Err(FileStorageError::Rejected(_))
                            ));
                        } else {
                            release.send(()).unwrap();
                            let (written, ready) = tokio::join!(write, waiting);
                            written.unwrap();
                            ready.unwrap();
                            assert_eq!(pressure.current().unwrap().preparation.bytes, 0);
                        }
                    }
                    drop(permit);
                    assert_eq!(policy.requests.available_permits(), 128);
                    worker.await.unwrap();
                }
                storage.shutdown().await.unwrap();
                drop((policy, runtime, blobs, storage));
                std::fs::remove_dir_all(root).unwrap();
            });
        }
    }

    #[tokio::test]
    async fn every_write_kind_reserves_its_logical_bytes_before_source_admission() {
        use sea_core::{BlobDirectory, BlobId, BlobTreeId};
        use std::collections::BTreeMap;

        let storage = sea_memory::MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = LocalSequencer::<sea_memory::MemoryStorage>::recover_with_live_cache(view)
            .await
            .unwrap();
        let policy = AdmissionPolicy::new(None, runtime.live_cache_pressure().unwrap());
        let payload = Bytes::from_static(b"payload");
        let submission = EventSubmission {
            reference: None,
            event: Event {
                payload: payload.clone(),
                blob_tree: None,
            },
        };
        let directory = BlobDirectory::new(BTreeMap::from([
            (
                "first".to_owned(),
                BlobTreeId::Blob(BlobId::for_bytes(b"first")),
            ),
            (
                "second".to_owned(),
                BlobTreeId::Blob(BlobId::for_bytes(b"second")),
            ),
        ]))
        .unwrap();
        for (request, charge) in [
            (WriteRequest::Blob(&payload), 128 + payload.len()),
            (WriteRequest::Submit(&submission), 128 + payload.len()),
            (WriteRequest::Directory(&directory), 128 + 64 + 5 + 64 + 6),
        ] {
            let permit = policy
                .acquire_write(match &request {
                    WriteRequest::Blob(payload) => WriteRequest::Blob(payload),
                    WriteRequest::Submit(submission) => WriteRequest::Submit(submission),
                    WriteRequest::Directory(directory) => WriteRequest::Directory(directory),
                })
                .unwrap();
            assert_eq!(policy.requests.available_permits(), 127);
            assert_eq!(policy.bytes.available_permits(), WRITE_BYTES - charge);
            let remaining = policy
                .bytes
                .clone()
                .try_acquire_many_owned(u32::try_from(WRITE_BYTES - charge).unwrap())
                .unwrap();
            assert!(policy.acquire_write(request).is_err());
            assert_eq!(policy.requests.available_permits(), 127);
            drop((remaining, permit));
            assert_eq!(policy.requests.available_permits(), 128);
            assert_eq!(policy.bytes.available_permits(), WRITE_BYTES);
        }
    }

    #[tokio::test]
    async fn admission_bounds_are_shared_and_release_on_drop() {
        let storage = sea_memory::MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let runtime = sea_sequencer::session::LocalSequencer::<sea_memory::MemoryStorage>::recover_with_live_cache(view).await.unwrap();
        let policy = AdmissionPolicy::new(None, runtime.live_cache_pressure().unwrap());
        let empty = Bytes::new();
        let permits = (0..128)
            .map(|_| policy.acquire_write(WriteRequest::Blob(&empty)).unwrap())
            .collect::<Vec<_>>();
        assert!(policy.acquire_write(WriteRequest::Blob(&empty)).is_err());
        policy.wait_write(&permits[0]).await.unwrap();
        drop(permits);
        let full = Bytes::from(vec![0; WRITE_BYTES - 128]);
        let permit = policy.acquire_write(WriteRequest::Blob(&full)).unwrap();
        assert!(policy.acquire_write(WriteRequest::Blob(&empty)).is_err());
        assert_eq!(policy.requests.available_permits(), 127);
        drop(permit);
        assert_eq!(policy.requests.available_permits(), 128);
        assert_eq!(policy.bytes.available_permits(), WRITE_BYTES);
        let oversized = Bytes::from(vec![0; WRITE_BYTES]);
        assert!(
            policy
                .acquire_write(WriteRequest::Blob(&oversized))
                .is_err()
        );
        let readers = (0..128)
            .map(|_| policy.admit_live_reader().unwrap())
            .collect::<Vec<_>>();
        assert!(policy.admit_live_reader().is_err());
        drop(readers);
        assert!(policy.admit_live_reader().is_ok());
    }
}
