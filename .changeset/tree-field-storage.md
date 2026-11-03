---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce memory overhead and improve selected SharedTree reads

SharedTree maps retain less memory when reading missing keys.
Maps and records also avoid retaining empty-field metadata after entries are removed, reducing memory growth when applications use many distinct keys.
These improvements require no application code changes.

#### Performance

Benchmarks show improvements in some read workloads, with tradeoffs in others.
Unhydrated nodes have not yet been inserted into a SharedTree view; hydrated nodes have been inserted.

| Workload | Approximate change in elapsed time |
| --- | --- |
| Unhydrated map reads of missing keys | 32% less |
| Hydrated record leaf reads with default storage | 16% less |
| Unhydrated object edits | 3-4% more |
| Unhydrated array edits | 2-4% more |
| Unhydrated record leaf reads and repeated insertion/removal of entries | 8% more |

These comparisons used identical benchmark code before and after the change, Node.js 22.22.3 on Linux x64, and production emulation.
Results are averages from four fresh processes per version, run serially in balanced order.
The improvements are workload-specific, not whole-application speedups, and smaller differences can be affected by run-to-run variation.
This change does not improve every read or edit workload.
