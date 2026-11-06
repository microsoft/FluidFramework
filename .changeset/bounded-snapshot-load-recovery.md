---
"@fluidframework/tree": minor
"fluid-framework": minor
"@fluidframework/sea-driver": minor
"__section": tree
---

Reduce network latency when loading chunked SharedTree snapshots

SharedTree downloads independent incremental-summary chunks in bounded parallel batches instead of reading every chunk sequentially.
Nested chunks share the same concurrency limit, and failed loads drain admitted reads before reporting the error.

The Sea driver retrieves missing snapshot directories in bounded multi-root requests and applies the configured descendant-prefetch hint during recovery.
Concurrent content misses share bounded multi-root requests instead of opening a separate request for every blob.
It preserves progress when responses are truncated or cache budgets are too small to retain requested roots.
Snapshot formats and default prefetch/cache budgets are unchanged.
