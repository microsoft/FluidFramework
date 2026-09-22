---
"__section": fix
"__includeInReleaseNotes": false
---
Allow concurrent durable Sea storage work across more documents

The experimental Rust durable file backend now defaults to 32 concurrent filesystem operations per factory instead of four, avoiding the measured multi-document bottleneck from synchronization occupying every worker.
Buffered storage retains its default of four.
Both backends expose `open_with_worker_limit(root, limit)` to tune the shared bounded budget without changing persistence guarantees.

```rust
let storage = sea_file::DurableStorage::open_with_worker_limit(root, 16)?;
```

The limit includes reads and mutations across all documents and factory clones; independently opened factories have separate budgets.
Invalid limits are rejected before namespace creation, and the Tokio runtime can impose a lower blocking-thread limit.