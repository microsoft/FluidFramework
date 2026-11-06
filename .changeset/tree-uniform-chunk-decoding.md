---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce decoding allocations for fixed-shape tree sequences

SharedTree decodes compatible fixed-shape sequences directly into compact uniform chunks instead of allocating a separate chunk for each node.
Decoding can reuse complete values arrays and retain compressed identifiers, which reduces memory use and improves decoding performance for these sequences.

#### Example measurements

In a local benchmark with 10,000-character documents using [ForestTypeOptimized](https://fluidframework.com/docs/api/v3/tree#foresttypeoptimized-variable), the median results before and after this change were:

| Metric | Formatted text, before to after | Plain text, before to after |
| --- | --- | --- |
| Retained tree heap after loading | 30.6 MiB to 30.6 MiB (about the same) | 2.72 MiB to 0.318 MiB (88% less) |
| Retained attached-content heap after loading | 10.5 MiB to 10.5 MiB (about the same) | 0.114 MiB to 0.0792 MiB (31% less) |
| Summary load time | 212 ms to 213 ms (about the same) | 33.7 ms to 17.7 ms (48% faster) |
| Receive insertion time | 431 ms to 433 ms (about the same) | 72.2 ms to 74.6 ms (3% slower) |
| Local insertion time | 1,334 ms to 1,333 ms (about the same) | 148 ms to 155 ms (4% slower) |

These measurements use Node.js 22.23.2, in-memory summary storage, and a mocked runtime, with 18 timed samples per case after warmup across two process orders.
Both variants include the existing optimized-forest compaction; the comparison isolates this decoding change.
Summary load times include mock runtime and storage setup but exclude subsequent content verification.
Receive insertion times include message synchronization and the sender's acknowledgement.

Heap measurements report median per-document retained heap from six batches of four loaded documents after garbage collection, with separate heap warmups.
The attached-content measurement retains only the root-field chunks, excluding the tree and checkout.
Shared summary fixtures and their ID compressor are excluded from heap deltas.
These measurements do not measure peak memory.

Plain-text summary loading uses less retained heap and completes sooner in this workload, while insertion timings are slightly slower.
Formatted-text results are essentially unchanged, and small timing differences can be noise.
Results depend on the document schema, workload, and environment.