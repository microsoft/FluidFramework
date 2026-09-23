#![doc = include_str!("../README.md")]

mod common;

pub mod buffered;

/// Synchronized storage execution and its factory.
pub mod durable;

pub use buffered::FileStorage;
pub use durable::DurableStorage;
pub use storage::{FileBlobs, FileEvents, FileHandle, FileSnapshots, FileStorageError};

pub(crate) use common::{atomic_file, journal};

/// Replacement document factory and independently usable file components.
pub mod storage;
