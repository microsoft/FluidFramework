//! Caller-visible failures from local multi-user sequencing.
//!
//! Backend failures retain their original [`sea_core::ErrorKind`]. Rejected input and closed
//! memberships are definitive caller outcomes; malformed committed envelopes are corruption.
//! [`SessionError::RecoveryRequired`] is intentionally ambiguous because the runtime could not
//! establish whether a mutation committed and must not permit another mutation until reopening.

use sea_core::{ClassifiedError, ErrorKind};
use std::{error::Error, fmt};

/// Failure from local multi-user sequencing or its trusted backend.
#[derive(Debug)]
pub enum SessionError<E> {
    /// The trusted backend failed.
    Storage(E),
    /// Independent notification that the storage opening is no longer valid.
    StorageInvalidated(std::sync::Arc<E>),
    /// Only this live subscription was revoked; author and sibling authority are unchanged.
    SubscriptionRevoked,
    /// Caller input conflicts with current authoritative session state.
    Rejected(&'static str),
    /// A committed private sequencer envelope is malformed or inconsistent.
    Corrupt(&'static str),
    /// This local session has been closed.
    Closed,
    /// A mutation's commitment could not be reconciled; the runtime must be recovered.
    RecoveryRequired,
}

impl<E: fmt::Display> fmt::Display for SessionError<E> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Storage(error) => write!(formatter, "storage failed: {error}"),
            Self::StorageInvalidated(error) => {
                write!(formatter, "storage opening invalidated: {error}")
            }
            Self::SubscriptionRevoked => formatter.write_str("live subscription revoked"),
            Self::Rejected(message) => write!(formatter, "session rejected operation: {message}"),
            Self::Corrupt(message) => write!(formatter, "sequencer log is corrupt: {message}"),
            Self::Closed => formatter.write_str("session is closed"),
            Self::RecoveryRequired => formatter.write_str("sequencer recovery is required"),
        }
    }
}

impl<E: Error + 'static> Error for SessionError<E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Storage(error) => Some(error),
            Self::StorageInvalidated(error) => Some(error.as_ref()),
            Self::SubscriptionRevoked
            | Self::Rejected(_)
            | Self::Corrupt(_)
            | Self::Closed
            | Self::RecoveryRequired => None,
        }
    }
}

impl<E: ClassifiedError> ClassifiedError for SessionError<E> {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Storage(error) => error.kind(),
            Self::StorageInvalidated(error) => error.kind(),
            Self::SubscriptionRevoked | Self::Rejected(_) | Self::Closed => ErrorKind::Rejected,
            Self::Corrupt(_) => ErrorKind::Corrupt,
            Self::RecoveryRequired => ErrorKind::Ambiguous,
        }
    }
}
