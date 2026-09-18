//! Replacement blob capabilities over the immutable content-addressed object engine.
//!
//! [`ContentStore`] remains independently useful rather than becoming a document factory. Trait
//! publication returns [`crate::storage::ContentHandle`] evidence scoped to the store's canonical
//! namespace; equal content identities from another namespace do not establish local availability.
//!
//! Directory publication and handle resolution verify the complete reachable tree, visiting shared
//! subtrees once. A missing root resolves as absent, while a stored root with a missing descendant
//! is corruption. Handles retain provenance but no writer lock, so a compatible reopened store can
//! revalidate them.

use crate::{ContentStore, StoreError};
use async_trait::async_trait;
use bytes::Bytes;
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, ErrorKind,
    storage::{BlobStore, ReferenceableStore, StorageHandle, StorageSurface},
};
use std::{collections::BTreeSet, path::PathBuf, sync::Arc};

/// Evidence scoped to one canonical content namespace; retains no writer lock.
#[derive(Clone, Debug)]
pub struct ContentHandle {
    /// Stable stored identity.
    id: BlobTreeId,
    /// Namespace provenance revalidated whenever the handle is used.
    root: Arc<PathBuf>,
}

impl StorageHandle for ContentHandle {
    type Id = BlobTreeId;
    fn id(&self) -> BlobTreeId {
        self.id
    }
}

impl ClassifiedError for StoreError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Io(_) => ErrorKind::Unavailable,
            Self::Corrupt(_) => ErrorKind::Corrupt,
            Self::Missing
            | Self::IncompatibleHandle
            | Self::BlobTooLarge { .. }
            | Self::DirectoryTooLarge { .. } => ErrorKind::Rejected,
        }
    }
}

impl StorageSurface for ContentStore {
    type Error = StoreError;
}

impl ContentStore {
    /// Verifies all reachable objects, visiting shared subtrees only once.
    fn verify_tree(&self, root: BlobTreeId) -> Result<(), StoreError> {
        let mut pending = vec![root];
        let mut visited = BTreeSet::new();
        while let Some(id) = pending.pop() {
            if !visited.insert(id) {
                continue;
            }
            match id {
                BlobTreeId::Blob(id) => {
                    self.get_blob(id)?;
                }
                BlobTreeId::Directory(id) => {
                    pending.extend(self.get_directory(id)?.entries().values().copied());
                }
            }
        }
        Ok(())
    }

    /// Mints a handle after successful transitive validation.
    fn handle(&self, id: BlobTreeId) -> ContentHandle {
        ContentHandle {
            id,
            root: Arc::new(self.root.clone()),
        }
    }
}

#[async_trait]
impl ReferenceableStore for ContentStore {
    type Id = BlobTreeId;
    type Handle = ContentHandle;
    async fn resolve(&self, id: BlobTreeId) -> Result<Option<ContentHandle>, StoreError> {
        let present = match id {
            BlobTreeId::Blob(id) => self.get_blob(id).map(|_| ()),
            BlobTreeId::Directory(id) => self.get_directory(id).map(|_| ()),
        };
        match present {
            Err(StoreError::Missing) => return Ok(None),
            other => other?,
        }
        self.verify_tree(id).map_err(|error| match error {
            StoreError::Missing => StoreError::Corrupt("missing transitive dependency"),
            other => other,
        })?;
        Ok(Some(self.handle(id)))
    }
    async fn ensure_available(&self, handle: &ContentHandle) -> Result<(), StoreError> {
        if *handle.root != self.root {
            return Err(StoreError::IncompatibleHandle);
        }
        self.verify_tree(handle.id)
    }
}

#[async_trait]
impl BlobStore for ContentStore {
    async fn put_blob(&self, payload: Bytes) -> Result<ContentHandle, StoreError> {
        self.put_blob(&payload)
            .map(|id| self.handle(BlobTreeId::Blob(id)))
    }
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, StoreError> {
        self.get_blob(id)
    }
    async fn put_directory(&self, directory: BlobDirectory) -> Result<ContentHandle, StoreError> {
        for child in directory.entries().values() {
            self.verify_tree(*child)?;
        }
        self.put_directory(&directory)
            .map(|id| self.handle(BlobTreeId::Directory(id)))
    }
    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, StoreError> {
        self.get_directory(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::StoreConfig;
    use std::{collections::BTreeMap, fs};

    #[tokio::test]
    async fn closure_provenance_reopen_and_missing_dependency() {
        let root = std::env::temp_dir().join(format!("sea-next-content-{}", std::process::id()));
        let store = ContentStore::open(root.join("first"), StoreConfig::default()).unwrap();
        let other = ContentStore::open(root.join("other"), StoreConfig::default()).unwrap();
        let blob = BlobStore::put_blob(&store, Bytes::from_static(b"content"))
            .await
            .unwrap();
        let foreign = BlobStore::put_blob(&other, Bytes::from_static(b"content"))
            .await
            .unwrap();
        assert!(matches!(
            store.ensure_available(&foreign).await,
            Err(StoreError::IncompatibleHandle)
        ));
        let directory =
            BlobDirectory::new(BTreeMap::from([("leaf".to_owned(), blob.id())])).unwrap();
        let tree = BlobStore::put_directory(&store, directory.clone())
            .await
            .unwrap();
        let missing = BlobDirectory::new(BTreeMap::from([(
            "missing".to_owned(),
            BlobTreeId::Blob(BlobId::for_bytes(b"absent")),
        )]))
        .unwrap();
        assert!(
            BlobStore::put_directory(&store, missing.clone())
                .await
                .is_err()
        );
        assert!(
            store
                .resolve(BlobTreeId::Directory(missing.id().unwrap()))
                .await
                .unwrap()
                .is_none()
        );
        drop(store);
        let reopened = ContentStore::open(root.join("first"), StoreConfig::default()).unwrap();
        reopened.ensure_available(&tree).await.unwrap();
        for entry in fs::read_dir(root.join("first/blobs")).unwrap() {
            fs::remove_file(entry.unwrap().path()).unwrap();
        }
        assert!(matches!(
            reopened.resolve(tree.id()).await,
            Err(StoreError::Corrupt(_))
        ));
        fs::remove_dir_all(root).unwrap();
    }
}
