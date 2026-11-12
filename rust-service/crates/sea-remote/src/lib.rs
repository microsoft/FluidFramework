#![doc = include_str!("../README.md")]

mod record;
mod storage;
mod stream;
#[cfg(test)]
mod tests;

use async_trait::async_trait;
use bytes::Bytes;
use sea_core::{ClassifiedError, ErrorKind, storage::DocumentId};
use std::sync::Arc;

pub use record::MAX_RECORD_BYTES;
pub use storage::{Blobs, Events, Handle, Snapshots, Storage};

/// Shared classified error, cloneable so terminal failures reach every dependent owner.
#[derive(Clone, Debug, thiserror::Error)]
#[error("{message}")]
pub struct Error {
    /// Stable caller-visible classification.
    kind: ErrorKind,
    /// Diagnostic context without credentials.
    message: Arc<str>,
}

impl Error {
    /// Constructs a classified provider error without discarding its diagnostic context.
    pub fn new(kind: ErrorKind, message: impl Into<Arc<str>>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    /// Reports invalid input before any mutation.
    pub fn rejected(message: impl Into<Arc<str>>) -> Self {
        Self::new(ErrorKind::Rejected, message)
    }

    /// Reports persisted data that violates the document contract.
    pub fn corrupt(message: impl Into<Arc<str>>) -> Self {
        Self::new(ErrorKind::Corrupt, message)
    }
}

impl ClassifiedError for Error {
    fn kind(&self) -> ErrorKind {
        self.kind
    }
}

/// Result shared by the adapter and its provider boundary.
pub type Result<T> = std::result::Result<T, Error>;

/// An exclusively fenced ordered record journal.
///
/// Locations increase strictly and remain stable across reopening.
/// A successful append atomically persists exactly one complete record.
/// No append may be retried after an uncertain outcome.
/// Reopening must fence all requests from the preceding opening before reading history.
/// Reads and scans must reject missing or malformed committed records rather than omit them.
#[async_trait]
pub trait Journal: Send + 'static {
    /// Checks or renews exclusive ownership; failure invalidates this opening.
    async fn check(&mut self) -> Result<()>;
    /// Commits a single record; errors after submission must be classified as ambiguous.
    async fn append(&mut self, record: Bytes) -> Result<u64>;
    /// Reads the complete record at a known committed location.
    async fn read(&mut self, location: u64) -> Result<Bytes>;
    /// Reads a bounded page strictly after the cursor; empty means end of history.
    async fn scan(&mut self, after: Option<u64>) -> Result<Vec<(u64, Bytes)>>;
    /// Settles requests and releases writer authority; may be called more than once.
    async fn close(&mut self) -> Result<()>;
}

/// Allocates document identities and acquires provider-enforced exclusive openings.
#[async_trait]
pub trait Factory: Send + Sync + 'static {
    /// Provider-specific connection and ownership state.
    type Journal: Journal;
    /// Creates a fresh, durably discoverable document already owned by the caller.
    async fn create(&self) -> Result<(DocumentId, Self::Journal)>;
    /// Opens a known document, refusing competing owners; unknown identities return `None`.
    async fn open(&self, id: &DocumentId) -> Result<Option<Self::Journal>>;
}
