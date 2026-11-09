---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce decoding allocations for tree leaves and fixed-shape sequences

SharedTree decodes compatible fixed-shape sequences directly into compact uniform chunks instead of allocating a separate chunk for each node.
Decoding can reuse complete values arrays and retain compressed identifiers, which reduces memory use and improves decoding performance for these sequences.
Individual fixed-type leaves with a required value also use a direct read and a cached chunk shape, including leaves within polymorphic content.

#### Example measurements

In a local benchmark with 10,000-character documents using [ForestTypeOptimized](https://fluidframework.com/docs/api/v3/tree#foresttypeoptimized-variable), the median results before and after this change were:

| Metric | Formatted text, before to after | Plain text, before to after |
| --- | --- | --- |
| Retained tree heap after loading | 30.6 MiB to 25.4 MiB (17% less) | 2.72 MiB to 0.316 MiB (88% less) |
| Retained attached-content heap after loading | 10.5 MiB to 10.5 MiB (about the same) | 0.114 MiB to 0.0805 MiB (29% less) |
| Summary load time | 215 ms to 205 ms (4% faster) | 33.8 ms to 17.6 ms (48% faster) |
| Receive insertion time | 432 ms to 405 ms (6% faster) | 73.1 ms to 67.3 ms (8% faster) |
| Local insertion time | 1,343 ms to 1,323 ms (about the same) | 153 ms to 150 ms (about the same) |

These measurements use Node.js 22.23.2, in-memory summary storage, and a mocked runtime, with 18 timed samples per case after warmup across two process orders.
Both variants include the existing optimized-forest compaction; the comparison isolates this decoding change.
Summary load times include mock runtime and storage setup but exclude subsequent content verification.
Receive insertion times include message synchronization and the sender's acknowledgement.

Heap measurements report median per-document retained heap from six batches of four loaded documents after garbage collection, with separate heap warmups.
The attached-content measurement retains only the root-field chunks, excluding the tree and checkout.
Shared summary fixtures and their ID compressor are excluded from heap deltas.
These measurements do not measure peak memory.

Both document schemas use less retained whole-tree heap and load summaries sooner in this workload.
Formatted-text attached-content heap is essentially unchanged because its enclosing polymorphic structures do not use the fixed-shape sequence path.
Small timing differences can be noise, and preparing a decoder for a custom leaf type can cost more than the general path for a tiny batch.
Results depend on the document schema, workload, and environment.
