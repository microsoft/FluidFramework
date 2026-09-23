#![doc = include_str!("../README.md")]

mod document;
mod memory_archive;

pub use document::{
    MemoryBlobHandle, MemoryBlobStore, MemoryEventArchive, MemoryEventHandle,
    MemorySnapshotArchive, MemoryStorage, MemoryStorageError,
};
