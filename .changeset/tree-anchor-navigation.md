---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce navigation overhead for SharedTree reads and edits

SharedTree reads, edits, and parent/key queries have lower overhead, including in deeply nested trees.
No application code or stored document format changes are required.

#### Performance measurements

Benchmarks on trees nested ten levels deep measure improvements with both the [reference (default) forest](https://fluidframework.com/docs/api/tree/#foresttypereference-variable) and the [optimized forest](https://fluidframework.com/docs/api/tree/#foresttypeoptimized-variable).
Times are microseconds per benchmark iteration.

| Forest | Workload | Before | After | Less elapsed time |
| --- | --- | --- | --- | --- |
| Reference (default) | Object and array reads | 5.349 | 1.626 | 69.6% |
| Reference (default) | Edits | 138.518 | 115.525 | 16.6% |
| Reference (default) | Parent/key queries | 13.577 | 0.728 | 94.6% |
| Optimized | Object and array reads | 3.610 | 1.593 | 55.9% |
| Optimized | Edits | 112.610 | 97.693 | 13.2% |
| Optimized | Parent/key queries | 7.011 | 0.635 | 90.9% |

Results are means from two fresh processes per version, run serially in balanced order on Linux x64 with Node.js 22.22.3 and production emulation enabled.
These are workload-specific results on a shared host, not whole-application speedups.
Edit measurements are noisier, with relative margins of error up to approximately 20%, so treat those differences with caution.
