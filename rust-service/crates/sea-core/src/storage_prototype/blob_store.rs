//! Independent content-addressed blob-tree storage.
//!
//! Identities describe content and can be computed or decoded without proving that content is
//! stored. [`BlobTreeHandle`] is the corresponding availability capability: it identifies a tree
//! and carries backend-defined provenance needed to establish that the complete tree is available
//! to a compatible store.

use async_trait::async_trait;
use bytes::Bytes;

use crate::{BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError};

/// Evidence that a complete immutable blob tree is available through a compatible store.
///
/// The provenance may be a store-instance token, retained client-side bytes, or a transport
/// registration capable of uploading or reuploading the tree. Implementations choose the concrete
/// handle type, allowing its construction and provenance to remain private.
pub trait BlobTreeHandle: Clone + Send + Sync + 'static {
    /// Returns the stable content identity represented by this handle.
    fn id(&self) -> BlobTreeId;
}

/// An independently useful store of immutable blobs and directory trees.
///
/// Blob and directory publication is idempotent by content identity. Successfully publishing a
/// directory guarantees that every transitive child is available. A backend may retain
/// unreachable content; collection is outside this contract.
#[async_trait]
pub trait BlobStore: Send + Sync {
    /// Classified backend error.
    type Error: ClassifiedError;

    /// Backend-defined availability capability minted by this store.
    type Handle: BlobTreeHandle;

    /// Publishes or deduplicates one immutable blob and returns evidence of its availability.
    async fn put_blob(&self, payload: Bytes) -> Result<Self::Handle, Self::Error>;

    /// Fetches and verifies one immutable blob.
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error>;

    /// Publishes or deduplicates a directory after verifying all transitive children.
    async fn put_directory(&self, directory: BlobDirectory) -> Result<Self::Handle, Self::Error>;

    /// Fetches and verifies one immutable directory.
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error>;

    /// Resolves an identity to availability evidence after verifying the complete tree.
    async fn resolve_tree(&self, id: BlobTreeId) -> Result<Option<Self::Handle>, Self::Error>;

    /// Verifies that a handle can be used to publish references through this store cohort.
    ///
    /// Implementations may accept handles containing uploadable content and establish storage as
    /// part of this operation. Success guarantees that a subsequently published owner record can
    /// rely on the tree's availability under the encompassing [`super::SeaStorage`] contract.
    async fn verify_handle(&self, handle: &Self::Handle) -> Result<(), Self::Error>;
}
