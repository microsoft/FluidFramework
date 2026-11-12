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

/// Maximum records retained by one commit group or event read page.
pub const MAX_BATCH_RECORDS: usize = 128;
/// Maximum commit or read-page bytes, including four framing bytes per record.
pub const MAX_BATCH_BYTES: usize = 4 * 1024 * 1024;

/// Validates the shared publication bound and returns the framed group size.
///
/// # Errors
/// Rejects oversized groups or records before any provider mutation.
pub fn batch_size(records: &[Bytes]) -> Result<usize> {
    if records.len() > MAX_BATCH_RECORDS {
        return Err(Error::rejected("too many records in commit group"));
    }
    let mut total = 0;
    for record in records {
        if record.is_empty() || record.len() > MAX_RECORD_BYTES {
            return Err(Error::rejected("invalid commit record length"));
        }
        total += record.len() + 4;
        if total > MAX_BATCH_BYTES {
            return Err(Error::rejected("commit group exceeds byte limit"));
        }
    }
    Ok(total)
}

/// Validates ordered read locations and the maximum retained page size.
///
/// # Errors
/// Rejects non-increasing locations, invalid lengths, or an oversized page.
pub fn validate_read_batch(records: &[(u64, usize)]) -> Result<()> {
    if records.len() > MAX_BATCH_RECORDS
        || records.windows(2).any(|pair| pair[0].0 >= pair[1].0)
        || records
            .iter()
            .any(|(_, length)| *length == 0 || *length > MAX_RECORD_BYTES)
        || records.iter().map(|(_, length)| length + 4).sum::<usize>() > MAX_BATCH_BYTES
    {
        return Err(Error::rejected("invalid journal read page"));
    }
    Ok(())
}

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
    /// Checks or renews exclusive ownership for an authoritative observation.
    async fn check(&mut self) -> Result<()>;
    /// Commits a single record, enforcing ownership on the write itself without a preceding check.
    /// Errors after uncertain submission must be classified as ambiguous.
    async fn append(&mut self, record: Bytes) -> Result<u64>;
    /// Commits a bounded ordered group and returns every corresponding location on success.
    ///
    /// Commitments must form an input prefix, including after cancellation.
    /// Any error after a possible commitment is ambiguous for the whole group.
    /// Implementations enforce ownership on the writes themselves, independently of `check`.
    /// The compatibility implementation is sequential; providers can group persistence atomically.
    async fn append_batch(&mut self, records: Vec<Bytes>) -> Result<Vec<u64>> {
        batch_size(&records)?;
        let mut locations = Vec::with_capacity(records.len());
        for record in records {
            match self.append(record).await {
                Ok(location) => locations.push(location),
                Err(error) if locations.is_empty() => return Err(error),
                Err(error) => {
                    return Err(Error::new(
                        ErrorKind::Ambiguous,
                        format!("partial journal group: {error}"),
                    ));
                }
            }
        }
        Ok(locations)
    }
    /// Reads the complete record at a known committed location.
    async fn read(&mut self, location: u64) -> Result<Bytes>;
    /// Reads known records in strictly increasing location order, verifying their encoded lengths.
    ///
    /// Callers bound the count and total framed length by `MAX_BATCH_RECORDS` and `MAX_BATCH_BYTES`.
    /// Providers must return exactly the requested records, failing rather than skipping a missing entry.
    async fn read_batch(&mut self, records: &[(u64, usize)]) -> Result<Vec<Bytes>> {
        validate_read_batch(records)?;
        let mut output = Vec::with_capacity(records.len());
        for &(location, length) in records {
            let bytes = self.read(location).await?;
            if bytes.len() != length {
                return Err(Error::corrupt("journal record length mismatch"));
            }
            output.push(bytes);
        }
        Ok(output)
    }
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
