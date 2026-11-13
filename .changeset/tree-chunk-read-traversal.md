---
"@fluidframework/tree": minor
"__section": tree
---
Improve traversal performance for some optimized SharedTree workloads

When configured with [ForestTypeOptimized](https://fluidframework.com/docs/api/v3/tree#foresttypeoptimized-variable),
SharedTree reduces traversal overhead for some nested storage layouts.
The effect depends on the document and workload; not all traversal patterns improve.

#### Example measurements

Local benchmarks on Node.js 22.23.2 compare the previous implementation with this traversal change.
The figures below are means across two runs per implementation, measured in an interleaved comparison:

- Scanning 100 numeric nodes through four nested sequence-storage layers takes about 78% less time.
- Descending and ascending a chain of 100 individually stored nodes takes about 28% less time.
- Scanning 100 individually stored sibling nodes takes about 16% more time, increasing from 4.4 microseconds to 5.1 microseconds.

These are storage-level traversal measurements, not end-to-end application timings.
Results depend on the document representation, workload, and environment.
