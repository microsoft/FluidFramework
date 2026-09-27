//! Bounded document admission for the opt-in policy decorator.

use std::sync::Arc;

use async_trait::async_trait;
use sea_core::{
    ClassifiedError, ErrorKind, EventPosition,
    policy::{DocumentPolicy, WriteRequest},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

/// Fixed logical input budget, not a bound on caller-owned backing allocations.
const WRITE_BYTES: usize = 16 * 1024 * 1024;

/// Definitive policy refusal before invoking a source operation.
#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub(crate) struct AdmissionError(pub(crate) &'static str);

impl ClassifiedError for AdmissionError {
    fn kind(&self) -> ErrorKind {
        ErrorKind::Rejected
    }
}

/// Pending input ownership, released before the source takes responsibility.
pub(crate) struct WritePermit {
    /// Retains one bounded waiter slot.
    _request: OwnedSemaphorePermit,
    /// Retains the conservative logical input charge.
    _bytes: OwnedSemaphorePermit,
}

/// Shared per-document bounds without pressure waiting or autonomous session closure.
pub(crate) struct AdmissionPolicy {
    /// Bounds pending operations, including same-session FIFO waits.
    requests: Arc<Semaphore>,
    /// Bounds pending logical content bytes.
    bytes: Arc<Semaphore>,
    /// Bounds admitted live streams, including pending loads.
    readers: Arc<Semaphore>,
}

impl AdmissionPolicy {
    /// Builds independent document-local admission authorities.
    pub(crate) fn new() -> Self {
        Self {
            requests: Arc::new(Semaphore::new(128)),
            bytes: Arc::new(Semaphore::new(WRITE_BYTES)),
            readers: Arc::new(Semaphore::new(128)),
        }
    }
}

#[async_trait]
impl DocumentPolicy for AdmissionPolicy {
    type Error = AdmissionError;
    type Permit = WritePermit;
    type ReaderPermit = OwnedSemaphorePermit;

    fn admit_session(&self, _reference: Option<EventPosition>) -> Result<(), Self::Error> {
        Ok(())
    }

    fn admit_live_reader(&self) -> Result<Self::ReaderPermit, Self::Error> {
        self.readers
            .clone()
            .try_acquire_owned()
            .map_err(|_| AdmissionError("document live-reader admission is full"))
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
        .ok_or(AdmissionError("pending write exceeds document byte limit"))?;
        let request = self
            .requests
            .clone()
            .try_acquire_owned()
            .map_err(|_| AdmissionError("document pending-write admission is full"))?;
        let bytes = self
            .bytes
            .clone()
            .try_acquire_many_owned(u32::try_from(bytes).expect("bounded pending bytes fit u32"))
            .map_err(|_| AdmissionError("document pending-write byte budget is full"))?;
        Ok(WritePermit {
            _request: request,
            _bytes: bytes,
        })
    }

    async fn wait_write(&self, _permit: &Self::Permit) -> Result<(), Self::Error> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;

    #[tokio::test]
    async fn admission_bounds_are_shared_and_release_on_drop() {
        let policy = AdmissionPolicy::new();
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
