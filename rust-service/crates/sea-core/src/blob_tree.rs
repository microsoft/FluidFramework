//! Bounded session content requests and single-root convenience reads.

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::StreamExt;

use crate::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, ErrorKind, SeaArchive,
    SessionStream,
};

/// Maximum explicit roots accepted by one content request.
pub const MAX_BLOB_TREE_ROOTS: usize = 256;
/// Maximum unique items returned by one content request.
pub const MAX_BLOB_TREE_ITEMS: usize = 4096;
/// Soft response-byte limit; the first root is returned even when it exceeds this limit.
pub const MAX_BLOB_TREE_BYTES: usize = 16 * 1024 * 1024;
/// Maximum directory entries inspected by one content request.
pub const MAX_BLOB_TREE_WORK: usize = 65_536;

/// Advisory descendant selection; explicit roots are always eligible.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct BlobTreeHint {
    /// Includes descendant leaves as well as directories.
    pub include_descendant_blobs: bool,
    /// Maximum additional unique items, excluding all explicit roots.
    pub max_extra_items: u32,
}

/// One requested content item, retaining its stored identity through payload decoration.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BlobTreeItem {
    /// A leaf, with bytes decoded by any session decorators.
    Blob { id: BlobId, bytes: Bytes },
    /// An immutable directory.
    Directory {
        id: BlobDirectoryId,
        directory: BlobDirectory,
    },
}

impl BlobTreeItem {
    /// Returns the typed stored identity.
    #[must_use]
    pub const fn id(&self) -> BlobTreeId {
        match self {
            Self::Blob { id, .. } => BlobTreeId::Blob(*id),
            Self::Directory { id, .. } => BlobTreeId::Directory(*id),
        }
    }
}

/// A finite content response. Normal completion does not prove complete descendant coverage.
pub type BlobTreeStream<E> = SessionStream<BlobTreeItem, E>;

/// Failure to read the first explicitly requested content item.
#[derive(Debug)]
pub enum BlobTreeReadError<E> {
    /// Unchanged source failure.
    Source(E),
    /// A nonempty successful response did not contain its first root.
    MissingRoot,
    /// The first response item did not match the first root.
    UnexpectedItem,
}

impl<E: std::fmt::Display> std::fmt::Display for BlobTreeReadError<E> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Source(error) => error.fmt(formatter),
            Self::MissingRoot => formatter.write_str("content response omitted its first root"),
            Self::UnexpectedItem => {
                formatter.write_str("content response returned an unexpected root")
            }
        }
    }
}

impl<E: std::error::Error + 'static> std::error::Error for BlobTreeReadError<E> {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Source(error) => Some(error),
            Self::MissingRoot | Self::UnexpectedItem => None,
        }
    }
}

impl<E: ClassifiedError> ClassifiedError for BlobTreeReadError<E> {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Source(error) => error.kind(),
            Self::MissingRoot | Self::UnexpectedItem => ErrorKind::Corrupt,
        }
    }
}

/// Single-item reads built on the session's content-stream primitive.
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
pub trait SeaArchiveExt: SeaArchive {
    /// Reads one leaf without requesting descendants.
    ///
    /// # Errors
    /// Returns source failures or a malformed first-root response.
    async fn get_blob(&self, id: BlobId) -> Result<Bytes, BlobTreeReadError<Self::Error>> {
        match self
            .get_blob_trees(vec![BlobTreeId::Blob(id)], BlobTreeHint::default())
            .next()
            .await
            .ok_or(BlobTreeReadError::MissingRoot)?
            .map_err(BlobTreeReadError::Source)?
        {
            BlobTreeItem::Blob { id: actual, bytes } if actual == id => Ok(bytes),
            _ => Err(BlobTreeReadError::UnexpectedItem),
        }
    }

    /// Reads one directory without requesting descendants.
    ///
    /// # Errors
    /// Returns source failures or a malformed first-root response.
    async fn get_directory(
        &self,
        id: BlobDirectoryId,
    ) -> Result<BlobDirectory, BlobTreeReadError<Self::Error>> {
        match self
            .get_blob_trees(vec![BlobTreeId::Directory(id)], BlobTreeHint::default())
            .next()
            .await
            .ok_or(BlobTreeReadError::MissingRoot)?
            .map_err(BlobTreeReadError::Source)?
        {
            BlobTreeItem::Directory {
                id: actual,
                directory,
            } if actual == id => Ok(directory),
            _ => Err(BlobTreeReadError::UnexpectedItem),
        }
    }
}

impl<S: SeaArchive + ?Sized> SeaArchiveExt for S {}
