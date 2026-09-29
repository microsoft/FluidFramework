//! Independent storage initialization and per-document session composition.

use std::{path::PathBuf, sync::Arc};

use sea_core::{
    ClassifiedError,
    factory::{PassThroughFactory, SessionFactory},
    storage::{DocumentId, SeaStorage},
};
use sea_file::{buffered::FileStorage, durable::DurableStorage, pressure::DurableWritePressure};
use sea_memory::MemoryStorage;
use sea_sequencer::session::LiveCachePressure;

/// Retryable storage construction, run by the host off the async executor.
type InitializeStorage<S> = dyn Fn() -> Result<Arc<S>, <S as SeaStorage>::Error> + Send + Sync;

/// Configured storage initialization and its optional document-pressure observation.
///
/// File paths identify the storage namespace itself; no `documents` suffix is added.
pub struct StorageSetup<S: SeaStorage> {
    /// Retains successful caller-owned storage or a retryable opening recipe.
    pub(crate) initialize: Arc<InitializeStorage<S>>,
    /// Obtains a weak pressure observer before transferring the view to its sequencer.
    pub(crate) pressure: fn(&S::Blobs) -> Option<DurableWritePressure>,
}

impl<S: SeaStorage + 'static> StorageSetup<S> {
    /// Uses an already configured storage instance without requiring it to be cloneable.
    ///
    /// No pressure observer is inferred. Attach one with [`Self::with_write_pressure`] if needed.
    #[must_use]
    pub fn from_storage(storage: S) -> Self {
        let storage = Arc::new(storage);
        Self {
            initialize: Arc::new(move || Ok(storage.clone())),
            pressure: |_| None,
        }
    }

    /// Defers fallible synchronous construction until the host first needs storage.
    ///
    /// Failures remain retryable; successful initialization is retained even if its caller cancels.
    #[must_use]
    pub fn open_with(initialize: impl Fn() -> Result<S, S::Error> + Send + Sync + 'static) -> Self {
        Self {
            initialize: Arc::new(move || initialize().map(Arc::new)),
            pressure: |_| None,
        }
    }

    /// Supplies an optional durable-write observer for a custom storage configuration.
    ///
    /// This callback must be short and nonblocking. It runs once per document recovery.
    #[must_use]
    pub fn with_write_pressure(
        mut self,
        pressure: fn(&S::Blobs) -> Option<DurableWritePressure>,
    ) -> Self {
        self.pressure = pressure;
        self
    }
}

impl StorageSetup<MemoryStorage> {
    /// Configures a fresh, independent in-memory namespace without a path.
    #[must_use]
    pub fn memory() -> Self {
        Self::open_with(|| Ok(MemoryStorage::new()))
    }
}

impl StorageSetup<FileStorage> {
    /// Configures buffered file storage at exactly `root`, without durable-pressure accounting.
    #[must_use]
    pub fn buffered(root: PathBuf) -> Self {
        Self::open_with(move || FileStorage::open(&root))
    }
}

impl StorageSetup<DurableStorage> {
    /// Configures durable file storage at exactly `root`, including its write-pressure observer.
    #[must_use]
    pub fn durable(root: PathBuf) -> Self {
        Self::open_with(move || DurableStorage::open(&root))
            .with_write_pressure(sea_file::FileBlobs::write_pressure)
    }
}

/// Opening-local observations provided once while composing a document's session factory.
///
/// Observers do not retain storage/cache ownership or account for transport buffers.
pub struct DocumentContext<'a, E> {
    /// Stable document identity for application-specific configuration.
    pub document: &'a DocumentId,
    /// Optional durable-storage pressure supplied by the storage setup.
    pub storage: Option<DurableWritePressure>,
    /// Outgoing-cache pressure, present when live caching is enabled.
    pub output: Option<LiveCachePressure<E>>,
}

/// Transforms a session factory once per recovered document, before any membership is opened.
///
/// Keep construction short and nonblocking; it is serialized with document recovery.
/// The returned factory is shared by every session and listener using that document opening.
/// Preserve source open/cancellation/close semantics or document any stronger ownership contract.
pub trait SessionDecorator<Source: SessionFactory, E: ClassifiedError>:
    Send + Sync + 'static
{
    /// Decorated source, retaining the session implementation's typed errors and capabilities.
    type Factory: SessionFactory<Session: 'static> + 'static;

    /// Whether construction needs an outgoing-cache observer.
    ///
    /// The host rejects incompatible setup before initializing storage.
    fn requires_live_cache(&self) -> bool {
        false
    }

    /// Builds the shared document factory without opening a membership.
    ///
    /// Callers must supply an output observer when [`Self::requires_live_cache`] returns true.
    /// [`crate::DocumentHost`] checks this requirement before opening storage.
    fn decorate(&self, source: Source, context: &DocumentContext<'_, E>) -> Self::Factory;
}

/// Leaves the local factory unchanged, without an extra session wrapper.
#[derive(Default)]
pub struct Undecorated;

impl<S: SessionFactory<Session: 'static> + 'static, E: ClassifiedError> SessionDecorator<S, E>
    for Undecorated
{
    type Factory = S;

    fn decorate(&self, source: S, _context: &DocumentContext<'_, E>) -> S {
        source
    }
}

/// Adds the existing transparent session wrapper for interception comparisons.
#[derive(Default)]
pub struct PassThrough;

impl<S: SessionFactory<Session: 'static> + 'static, E: ClassifiedError> SessionDecorator<S, E>
    for PassThrough
{
    type Factory = PassThroughFactory<S>;

    fn decorate(&self, source: S, _context: &DocumentContext<'_, E>) -> Self::Factory {
        PassThroughFactory::new(source)
    }
}

/// Applies an outer decorator to the factory produced by an inner decorator.
pub struct Decorated<Inner, Outer> {
    /// First transformation, nearest the sequencer.
    inner: Inner,
    /// Second transformation, nearest the session consumer.
    outer: Outer,
}

impl<S, E, Inner, Outer> SessionDecorator<S, E> for Decorated<Inner, Outer>
where
    S: SessionFactory,
    E: ClassifiedError,
    Inner: SessionDecorator<S, E>,
    Outer: SessionDecorator<Inner::Factory, E>,
{
    type Factory = Outer::Factory;

    fn requires_live_cache(&self) -> bool {
        self.inner.requires_live_cache() || self.outer.requires_live_cache()
    }

    fn decorate(&self, source: S, context: &DocumentContext<'_, E>) -> Self::Factory {
        self.outer
            .decorate(self.inner.decorate(source, context), context)
    }
}

/// Sequencer delivery configuration and an ordered document-factory decorator chain.
///
/// The default enables live caching and leaves sessions undecorated.
/// Stalled readers can retain unbounded cache history without an application resource policy.
pub struct SessionSetup<D = Undecorated> {
    /// Controls document recovery, independently of storage durability.
    pub(crate) live_cache: bool,
    /// Composes the per-document session factory.
    pub(crate) decorator: D,
}

impl Default for SessionSetup {
    fn default() -> Self {
        Self {
            live_cache: true,
            decorator: Undecorated,
        }
    }
}

impl<D> SessionSetup<D> {
    /// Selects cached or storage-backed event delivery.
    #[must_use]
    pub fn with_live_cache(mut self, enabled: bool) -> Self {
        self.live_cache = enabled;
        self
    }

    /// Appends a decorator outside the existing chain.
    ///
    /// Decorators are constructed in call order, sharing the same document observations.
    #[must_use]
    pub fn decorate<Outer>(self, outer: Outer) -> SessionSetup<Decorated<D, Outer>> {
        SessionSetup {
            live_cache: self.live_cache,
            decorator: Decorated {
                inner: self.decorator,
                outer,
            },
        }
    }
}

/// The selected decorator chain requires cached delivery but the setup disables it.
#[derive(Debug, thiserror::Error)]
#[error("session decorator requires live caching")]
pub struct LiveCacheRequired;
