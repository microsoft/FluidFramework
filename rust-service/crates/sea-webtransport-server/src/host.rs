//! Typed document recovery and session hosting, independent of wire protocols and listeners.

use std::{collections::BTreeMap, sync::Arc};

use sea_core::{
    ClassifiedError, ErrorKind, EventPosition, SeaService,
    factory::{OpenedSession, SessionFactory},
    storage::{DocumentId, SeaStorage},
};
use sea_sequencer::{
    factory::LocalSessionFactory,
    session::{LocalSequencer, SessionError},
};
use tokio::sync::Mutex;

use crate::{
    DocumentContext, LiveCacheRequired, SessionDecorator, SessionSetup, StorageSetup,
    setup::Undecorated,
};

#[cfg(test)]
pub(crate) mod opening_trace;

/// The composed factory selected by a storage-specific session setup.
pub type DocumentFactory<S, D> =
    <D as SessionDecorator<LocalSessionFactory<S>, <S as SeaStorage>::Error>>::Factory;

/// Typed host failures, including the selected decorated factory's opening errors.
pub type DocumentHostError<S, D = Undecorated> =
    HostError<<S as SeaStorage>::Error, <DocumentFactory<S, D> as SeaService>::Error>;

/// Host operation failures before any wire-protocol error conversion.
#[derive(Debug, thiserror::Error)]
pub enum HostError<StorageError: ClassifiedError, FactoryError: ClassifiedError> {
    /// Storage initialization, document creation, flush, or shutdown failed.
    #[error(transparent)]
    Storage(StorageError),
    /// Sequencer recovery or shutdown failed.
    #[error(transparent)]
    Recovery(SessionError<StorageError>),
    /// The composed session factory refused or failed to open a membership.
    #[error(transparent)]
    Factory(FactoryError),
    /// No document with the requested identity exists in this namespace.
    #[error("document does not exist")]
    NotFound,
    /// Host shutdown has stopped new document and session admission.
    #[error("host is shut down")]
    Closed,
    /// Backend construction failed outside its classified error path.
    #[error("storage initialization worker failed: {0}")]
    InitializationWorker(#[source] tokio::task::JoinError),
    /// A document worker failed after it might have mutated storage.
    #[error("storage worker failed: {0}")]
    DocumentWorker(#[source] tokio::task::JoinError),
}

impl<E: ClassifiedError, F: ClassifiedError> ClassifiedError for HostError<E, F> {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Storage(error) => error.kind(),
            Self::Recovery(error) => error.kind(),
            Self::Factory(error) => error.kind(),
            Self::NotFound | Self::Closed => ErrorKind::Rejected,
            Self::InitializationWorker(_) => ErrorKind::Unavailable,
            Self::DocumentWorker(_) => ErrorKind::Ambiguous,
        }
    }
}

/// Serializes document admission with shutdown and retains exclusive runtimes.
struct DocumentRuntimes<
    Storage: SeaStorage + 'static,
    D: SessionDecorator<LocalSessionFactory<Storage>, Storage::Error>,
> {
    /// Rejects operations that obtained their backend before shutdown.
    closed: bool,
    /// Recovered documents indexed by opaque identity.
    entries: BTreeMap<Vec<u8>, Arc<HostedDocument<Storage, D>>>,
}

/// Shared namespace and its retained document runtimes after successful storage initialization.
type SharedRegistry<S, D> = Arc<DocumentRegistry<S, D>>;

/// Retains the creation boundary for the lifetime of one recovered document.
struct HostedDocument<
    Storage: SeaStorage + 'static,
    D: SessionDecorator<LocalSessionFactory<Storage>, Storage::Error>,
> {
    /// Owns sequencing and shutdown independently of interception.
    sequencer: Arc<LocalSequencer<Storage>>,
    /// One composed factory shared by every session in this document opening.
    factory: D::Factory,
}

impl<Storage, D> HostedDocument<Storage, D>
where
    Storage: SeaStorage + 'static,
    D: SessionDecorator<LocalSessionFactory<Storage>, Storage::Error>,
{
    /// Composes the document factory without allocating a session.
    fn new(
        id: &DocumentId,
        sequencer: Arc<LocalSequencer<Storage>>,
        storage: Option<sea_file::pressure::DurableWritePressure>,
        decorator: &D,
    ) -> Arc<Self> {
        let context = DocumentContext {
            document: id,
            storage,
            output: sequencer.live_cache_pressure(),
        };
        let factory = decorator.decorate(LocalSessionFactory::new(sequencer.clone()), &context);
        Arc::new(Self { sequencer, factory })
    }
}

/// Serializes lazy runtime recovery within one backend namespace.
struct DocumentRegistry<
    Storage: SeaStorage + 'static,
    D: SessionDecorator<LocalSessionFactory<Storage>, Storage::Error> = Undecorated,
> {
    /// Validated sequencer delivery and session-factory composition.
    sessions: Arc<SessionSetup<D>>,
    /// Backend-specific observation captured before the view moves into its sequencer.
    storage_pressure: fn(&Storage::Blobs) -> Option<sea_file::pressure::DurableWritePressure>,
    /// Factory retaining the backend namespace independently of active views.
    storage: Arc<Storage>,
    /// Serializes first recovery; failed attempts are never cached.
    documents: Arc<Mutex<DocumentRuntimes<Storage, D>>>,
    /// Bounded test-only timing evidence for the actual opening path.
    #[cfg(test)]
    trace: opening_trace::OpeningTrace,
}

impl<Storage, D> DocumentRegistry<Storage, D>
where
    Storage: SeaStorage + 'static,
    D: SessionDecorator<LocalSessionFactory<Storage>, Storage::Error>,
{
    /// Retains configured storage and validated composition until document recovery.
    fn new(
        storage: Arc<Storage>,
        sessions: Arc<SessionSetup<D>>,
        storage_pressure: fn(&Storage::Blobs) -> Option<sea_file::pressure::DurableWritePressure>,
        #[cfg(test)] trace: opening_trace::OpeningTrace,
    ) -> Self {
        Self {
            storage,
            sessions,
            storage_pressure,
            documents: Arc::new(Mutex::new(DocumentRuntimes {
                closed: false,
                entries: BTreeMap::new(),
            })),
            #[cfg(test)]
            trace,
        }
    }

    /// Allocates a backend identity and retains its recovered exclusive view.
    async fn create(&self) -> Result<DocumentId, DocumentHostError<Storage, D>> {
        #[cfg(test)]
        self.trace.record("create: waiting for registry");
        let mut documents = self.documents.clone().lock_owned().await;
        if documents.closed {
            return Err(HostError::Closed);
        }
        let storage = self.storage.clone();
        let sessions = self.sessions.clone();
        let storage_pressure = self.storage_pressure;
        #[cfg(test)]
        let trace = self.trace.clone();
        #[cfg(test)]
        trace.record("create: worker queued");
        storage_worker(async move {
            #[cfg(test)]
            trace.record("create: worker started");
            let (id, view) = storage.create_view().await.map_err(HostError::Storage)?;
            #[cfg(test)]
            trace.record("create: storage view created");
            let pressure = storage_pressure(view.blobs());
            let runtime = if sessions.live_cache {
                LocalSequencer::recover_with_live_cache(view).await
            } else {
                LocalSequencer::recover(view).await
            }
            .map_err(HostError::Recovery)?;
            #[cfg(test)]
            trace.record("create: sequencer recovered");
            documents.entries.insert(
                id.as_bytes().to_vec(),
                HostedDocument::new(&id, runtime, pressure, &sessions.decorator),
            );
            Ok(id)
        })
        .await
    }

    /// Shares the existing runtime or exclusively recovers one without caching failures.
    async fn open(
        &self,
        id: &DocumentId,
    ) -> Result<Arc<HostedDocument<Storage, D>>, DocumentHostError<Storage, D>> {
        let mut documents = self.documents.clone().lock_owned().await;
        if documents.closed {
            return Err(HostError::Closed);
        }
        if let Some(runtime) = documents.entries.get(id.as_bytes().as_ref()) {
            return Ok(runtime.clone());
        }
        let storage = self.storage.clone();
        let sessions = self.sessions.clone();
        let storage_pressure = self.storage_pressure;
        let id = id.clone();
        storage_worker(async move {
            let view = storage
                .open_view(&id)
                .await
                .map_err(HostError::Storage)?
                .ok_or(HostError::NotFound)?;
            let pressure = storage_pressure(view.blobs());
            let runtime = if sessions.live_cache {
                LocalSequencer::recover_with_live_cache(view).await
            } else {
                LocalSequencer::recover(view).await
            }
            .map_err(HostError::Recovery)?;
            let runtime = HostedDocument::new(&id, runtime, pressure, &sessions.decorator);
            documents
                .entries
                .insert(id.as_bytes().to_vec(), runtime.clone());
            Ok(runtime)
        })
        .await
    }

    /// Settles every retained document, then shuts down storage even after a document failure.
    async fn shutdown(&self) -> Result<(), DocumentHostError<Storage, D>> {
        let mut documents = self.documents.lock().await;
        documents.closed = true;
        let mut failure = None;
        for runtime in documents.entries.values() {
            if let Err(error) = runtime.sequencer.shutdown().await {
                failure = Some(HostError::Recovery(error));
            }
        }
        if let Err(error) = self.storage.shutdown().await {
            failure = Some(HostError::Storage(error));
        }
        failure.map_or(Ok(()), Err)
    }
}

/// Runs potentially synchronous storage futures off the executor, retaining captured ownership on cancellation.
/// A failed worker may have mutated storage, so its outcome is ambiguous and is never retried here.
async fn storage_worker<Output: Send + 'static, E: ClassifiedError, F: ClassifiedError>(
    operation: impl std::future::Future<Output = Result<Output, HostError<E, F>>> + Send + 'static,
) -> Result<Output, HostError<E, F>> {
    tokio::task::spawn_blocking(move || tokio::runtime::Handle::current().block_on(operation))
        .await
        .map_err(HostError::DocumentWorker)?
}

/// Shared lazy backend initialization and retained document ownership.
struct HostInner<S: SeaStorage + 'static, D: SessionDecorator<LocalSessionFactory<S>, S::Error>> {
    /// Rejects new document/session admission after host-wide shutdown starts.
    closed: std::sync::atomic::AtomicBool,
    /// Retryable backend construction and pressure observation.
    storage: StorageSetup<S>,
    /// Composes each retained document's session factory.
    sessions: Arc<SessionSetup<D>>,
    /// Successful initialization; errors leave this empty for retry.
    backend: Arc<Mutex<Option<SharedRegistry<S, D>>>>,
    /// Shared with test protocol observers, without retaining the host.
    #[cfg(test)]
    trace: opening_trace::OpeningTrace,
}

/// Hosts typed documents and sessions without protocol dispatch or connection ownership.
///
/// Clones share storage initialization, recovered document runtimes, and session policies.
/// Callers own session closure. Dropping a session does not promise a committed departure.
pub struct DocumentHost<
    S: SeaStorage + 'static,
    D: SessionDecorator<LocalSessionFactory<S>, S::Error> = Undecorated,
> {
    /// Shared admission, initialization, and document lifetime.
    inner: Arc<HostInner<S, D>>,
}

impl<S, D> Clone for DocumentHost<S, D>
where
    S: SeaStorage + 'static,
    D: SessionDecorator<LocalSessionFactory<S>, S::Error>,
{
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}

impl<S, D> DocumentHost<S, D>
where
    S: SeaStorage + 'static,
    D: SessionDecorator<LocalSessionFactory<S>, S::Error>,
{
    /// Validates composition without opening storage or allocating memberships.
    ///
    /// # Errors
    /// Returns [`LiveCacheRequired`] if a decorator requires disabled live caching.
    pub fn new(
        storage: StorageSetup<S>,
        sessions: SessionSetup<D>,
    ) -> Result<Self, LiveCacheRequired> {
        if !sessions.live_cache && sessions.decorator.requires_live_cache() {
            return Err(LiveCacheRequired);
        }
        Ok(Self {
            inner: Arc::new(HostInner {
                closed: std::sync::atomic::AtomicBool::new(false),
                storage,
                sessions: Arc::new(sessions),
                backend: Arc::new(Mutex::new(None)),
                #[cfg(test)]
                trace: opening_trace::OpeningTrace::default(),
            }),
        })
    }

    /// Creates and retains a recovered document without opening author membership.
    ///
    /// # Errors
    /// Returns typed initialization, storage, or recovery failures.
    /// Cancellation does not roll back creation; its identity might not reach the caller.
    pub async fn create_document(&self) -> Result<DocumentId, DocumentHostError<S, D>> {
        self.backend().await?.create().await
    }

    /// Ensures a document exists and retains its recovered runtime without opening membership.
    ///
    /// # Errors
    /// Returns [`HostError::NotFound`] or a typed initialization/recovery failure.
    pub async fn ensure_document(&self, id: &DocumentId) -> Result<(), DocumentHostError<S, D>> {
        self.backend().await?.open(id).await.map(|_| ())
    }

    /// Opens a session through the document's shared decorated factory.
    ///
    /// # Errors
    /// Returns typed document failures or the factory's classified opening error.
    /// Pending-open cancellation and session closure follow the selected factory's contract.
    pub async fn open_session(
        &self,
        id: &DocumentId,
        reference: Option<EventPosition>,
    ) -> Result<
        OpenedSession<<DocumentFactory<S, D> as SessionFactory>::Session>,
        DocumentHostError<S, D>,
    > {
        let document = self.backend().await?.open(id).await?;
        #[cfg(test)]
        self.inner.trace.record("membership: opening");
        let opened = document
            .factory
            .open_session(reference)
            .await
            .map_err(HostError::Factory)?;
        #[cfg(test)]
        self.inner.trace.record("membership: opened");
        Ok(opened)
    }

    /// Returns test diagnostics without extending the host's lifetime.
    #[cfg(test)]
    pub(crate) fn opening_trace(&self) -> opening_trace::OpeningTrace {
        self.inner.trace.clone()
    }

    /// Flushes initialized storage without stopping admission or initializing unused storage.
    ///
    /// # Errors
    /// Returns the storage's classified flush failure.
    pub async fn flush(&self) -> Result<(), DocumentHostError<S, D>> {
        let backend = self.inner.backend.lock().await;
        if let Some(backend) = backend.as_ref() {
            backend.storage.flush().await.map_err(HostError::Storage)?;
        }
        Ok(())
    }

    /// Stops new admission and settles initialized documents and storage.
    /// Waits for admitted document workers, including those whose callers cancelled.
    /// Pending operations cannot create or recover documents after shutdown completes.
    ///
    /// # Errors
    /// Returns a typed sequencer or storage shutdown failure.
    pub async fn shutdown(&self) -> Result<(), DocumentHostError<S, D>> {
        self.inner
            .closed
            .store(true, std::sync::atomic::Ordering::Release);
        let backend = self.inner.backend.lock().await;
        if let Some(backend) = backend.as_ref() {
            backend.shutdown().await?;
        }
        Ok(())
    }

    /// Retains serialized initialization after cancellation, off the async executor.
    async fn backend(&self) -> Result<SharedRegistry<S, D>, DocumentHostError<S, D>> {
        let inner = self.inner.clone();
        #[cfg(test)]
        inner
            .trace
            .record("backend: waiting for initialization lock");
        let mut current = inner.backend.clone().lock_owned().await;
        if inner.closed.load(std::sync::atomic::Ordering::Acquire) {
            return Err(HostError::Closed);
        }
        if let Some(backend) = current.as_ref() {
            return Ok(backend.clone());
        }
        #[cfg(test)]
        inner.trace.record("backend: worker queued");
        tokio::task::spawn_blocking(move || {
            #[cfg(test)]
            inner.trace.record("backend: worker started");
            let storage = (inner.storage.initialize)().map_err(HostError::Storage)?;
            #[cfg(test)]
            inner.trace.record("backend: storage initialized");
            let backend = Arc::new(DocumentRegistry::new(
                storage,
                inner.sessions.clone(),
                inner.storage.pressure,
                #[cfg(test)]
                inner.trace.clone(),
            ));
            *current = Some(backend.clone());
            Ok(backend)
        })
        .await
        .map_err(HostError::InitializationWorker)?
    }
}

#[cfg(test)]
mod tests;
