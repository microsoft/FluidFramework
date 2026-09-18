//! Common error contract for independently useful storage surfaces.

use crate::ClassifiedError;

/// A storage surface with one classified backend error type.
pub trait StorageSurface: Send + Sync {
    /// Classified backend error.
    type Error: ClassifiedError;
}
