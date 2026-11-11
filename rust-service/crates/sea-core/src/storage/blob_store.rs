//! Independent content-addressed blob-tree storage.
//!
//! Identities describe content and can be computed or decoded without proving that content is
//! stored. The store's [`super::StorageHandle`] is the corresponding availability capability: it
//! identifies a tree and carries backend-defined provenance needed to establish that the complete
//! tree is available to a compatible store.

use async_trait::async_trait;
use bytes::Bytes;

use crate::{BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId};

use super::ReferenceableStore;

/// An independently useful store of immutable blobs and directory trees.
///
/// Blob and directory publication is idempotent by content identity. Successfully publishing a
/// directory guarantees that every transitive child is available. A backend may retain
/// unreachable content; collection is outside this contract.
#[async_trait]
pub trait BlobStore: ReferenceableStore<Id = BlobTreeId> {
    /// Publishes or deduplicates one immutable blob and returns evidence of its availability.
    async fn put_blob(&self, payload: Bytes) -> Result<Self::Handle, Self::Error>;

    /// Fetches one immutable blob, trusting published payload bytes.
    ///
    /// Ordinary reads need not recompute the content hash. Callers requiring integrity validation
    /// must verify the stored representation against `id` before transforming it.
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error>;

    /// Publishes or deduplicates a directory after verifying all transitive children.
    async fn put_directory(&self, directory: BlobDirectory) -> Result<Self::Handle, Self::Error>;

    /// Fetches and verifies one immutable directory.
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error>;
}
