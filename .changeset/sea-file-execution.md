---
"__section": other
"__includeInReleaseNotes": false
---
Separate buffered and durable Sea storage execution

The experimental Rust file backends now share the `sea-file` crate with bounded worker execution and explicit `SeaStorage::flush` and `SeaStorage::shutdown`.
Buffered success acknowledges process-local admission, not completed OS writes; orderly persistence requires flushing, and crashes or later disk errors may lose acknowledged data or prevent recovery.
Durable acknowledgments retain their documented synchronization guarantees.

Replace `sea_file::storage::FileStorage::<false>::open(root)` with `sea_file::FileStorage::open(root)` and the former durable crate with `sea_file::DurableStorage::open(root)`.
WebTransport hosts can accept any `SeaStorage` through `BuiltInSeaHost::with_storage` without backend-specific transport dispatch.