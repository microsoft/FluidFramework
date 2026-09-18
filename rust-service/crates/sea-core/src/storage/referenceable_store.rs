//! Availability capabilities for values referenced across storage components.
//!
//! A stable identity can be serialized without proving that its value is currently available.
//! A [`StorageHandle`] pairs that identity with implementation-defined evidence sufficient for a
//! compatible store to make the value available before another component persists the identity.

use async_trait::async_trait;

use super::StorageSurface;

/// Implementation-defined evidence that a stored value can be made available by its owning store.
///
/// Concrete handle construction remains private to an implementation. A handle may represent an
/// already stored value, retained uploadable content, or another capability that can establish the
/// value on demand.
///
/// A handle is availability evidence, not independent writer authority or a guarantee that an
/// opening stays valid.
/// Implementations must document whether handles retain resources or ownership of an opening;
/// keeping a handle alive does not guarantee survival of an outage or failover.
/// After reopening, callers must establish availability through the new store with
/// [`ReferenceableStore::ensure_available`] or obtain a fresh handle with [`ReferenceableStore::resolve`].
/// An incompatible old handle must be rejected even though its identity remains readable.
pub trait StorageHandle: Clone + Send + Sync + 'static {
    /// Stable serializable identity represented by this handle.
    type Id: Copy + Send + Sync + 'static;

    /// Returns the stable identity carried by this capability.
    fn id(&self) -> Self::Id;
}

/// A store whose values may be safely referenced by an independent persistent component.
///
/// Resolving an identity produces implementation-defined availability evidence. Before persisting
/// that identity elsewhere, callers use [`ReferenceableStore::ensure_available`] to establish that
/// the value is available from this store. A handle from an incompatible store must be rejected.
#[async_trait]
pub trait ReferenceableStore: StorageSurface {
    /// Stable identity of one stored value.
    type Id: Copy + Send + Sync + 'static;

    /// Availability capability minted or accepted by this store.
    type Handle: StorageHandle<Id = Self::Id>;

    /// Resolves an available identity to evidence suitable for later reference publication.
    async fn resolve(&self, id: Self::Id) -> Result<Option<Self::Handle>, Self::Error>;

    /// Establishes that a handle's value is available through this store.
    ///
    /// This operation need not be passive: for example, a blob handle may retain bytes that must
    /// be uploaded or reuploaded before the method succeeds.
    async fn ensure_available(&self, handle: &Self::Handle) -> Result<(), Self::Error>;
}
