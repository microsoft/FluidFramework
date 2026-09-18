//! Classified errors from local sequencing.

use sea_core::{ClassifiedError, ErrorKind};
use std::{error::Error, fmt};

/// Failure from local multi-user sequencing or its trusted backend.
#[derive(Debug)]
pub enum SessionError<E> {
    /// The trusted backend failed.
    Storage(E),
    /// Caller input conflicts with current authoritative session state.
    Rejected(&'static str),
    /// A committed private sequencer envelope is malformed or inconsistent.
    Corrupt(&'static str),
    /// This local session has been closed.
    Closed,
    /// A live subscriber fell behind the bounded in-process queue.
    Lagged,
    /// A mutation's commitment could not be reconciled; the runtime must be recovered.
    RecoveryRequired,
}

impl<E: fmt::Display> fmt::Display for SessionError<E> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Storage(error) => write!(formatter, "storage failed: {error}"),
            Self::Rejected(message) => write!(formatter, "session rejected operation: {message}"),
            Self::Corrupt(message) => write!(formatter, "sequencer log is corrupt: {message}"),
            Self::Closed => formatter.write_str("session is closed"),
            Self::Lagged => formatter.write_str("session subscriber fell behind"),
            Self::RecoveryRequired => formatter.write_str("sequencer recovery is required"),
        }
    }
}

impl<E: Error + 'static> Error for SessionError<E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Storage(error) => Some(error),
            Self::Rejected(_)
            | Self::Corrupt(_)
            | Self::Closed
            | Self::Lagged
            | Self::RecoveryRequired => None,
        }
    }
}

impl<E: ClassifiedError> ClassifiedError for SessionError<E> {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Storage(error) => error.kind(),
            Self::Rejected(_) | Self::Closed => ErrorKind::Rejected,
            Self::Corrupt(_) => ErrorKind::Corrupt,
            Self::Lagged => ErrorKind::Unavailable,
            Self::RecoveryRequired => ErrorKind::Ambiguous,
        }
    }
}
