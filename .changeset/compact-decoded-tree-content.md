---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce optimized forest memory overhead after loading and receiving inserted content

SharedTree configured with [ForestTypeOptimized](https://fluidframework.com/docs/api/v3/tree#foresttypeoptimized-variable) now uses compact in-memory storage for eligible content loaded from summaries or received in insertion operations.

#### Example measurements

In a local benchmark with 10,000-character documents, the median results before and after this change were:

| Metric | Formatted text, before to after | Plain text, before to after |
| --- | --- | --- |
| Retained tree heap after loading | 39.9 MiB to 30.6 MiB (23% less) | 5.12 MiB to 2.79 MiB (46% less) |
| Retained attached-content heap after loading | 19.8 MiB to 10.5 MiB (47% less) | 2.44 MiB to 0.113 MiB (95% less) |
| Summary load time | 142 ms to 214 ms | 28.6 ms to 41.2 ms |
| Receive insertion time | 272 ms to 448 ms | 239 ms to 65.8 ms |
| Local insertion time | 1,151 ms to 1,259 ms | 135 ms to 133 ms |

These measurements use Node.js 22, in-memory storage, and a mocked runtime, with 18 timed samples per case across two process orders.
Heap measurements use repeated batches of loaded documents after garbage collection and do not measure peak memory.
The memory savings can come with additional processing time, particularly when loading summaries or receiving formatted text.
Results depend on the document schema, workload, and environment.
