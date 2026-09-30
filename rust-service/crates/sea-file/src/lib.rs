#![doc = include_str!("../README.md")]

mod atomic_file;
mod common;
mod journal;

pub mod buffered;

/// Synchronized storage execution and its factory.
pub mod durable;

pub mod pressure;

pub use buffered::FileStorage;
pub use durable::DurableStorage;
pub use storage::{FileBlobs, FileEvents, FileHandle, FileSnapshots, FileStorageError};

/// Document factory and independently usable file components.
pub mod storage;
