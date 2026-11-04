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
Hydrated storage is configured through [ForestOptions.forest](https://fluidframework.com/docs/api/fluid-framework/forestoptions-interface#forest-propertysignature).

| Workload | Approximate change in elapsed time |
| --- | --- |
| Unhydrated map reads of missing keys | 32% less |
| Hydrated record leaf reads with [ForestTypeReference](https://fluidframework.com/docs/api/fluid-framework/#foresttypereference-variable) (default) | 22% less |
| Hydrated record leaf reads with [ForestTypeOptimized](https://fluidframework.com/docs/api/fluid-framework/#foresttypeoptimized-variable) | 16% less |
| Unhydrated object edits | 3-4% more |
| Unhydrated array edits | 2-4% more |
| Unhydrated record leaf reads and repeated insertion/removal of entries | 8% more |

Object reads and hydrated object/array edits showed comparatively small changes overall.
Hydrated cases ranged from about 3% less to 2% more elapsed time, while unhydrated object reads ranged from about 5% less to 3% more.
Separate focused unhydrated object-read benchmarks were within 1% of the previous implementation.

These comparisons used identical benchmark code before and after the change, Node.js 22.22.3 on Linux x64, and production emulation.
Results are averages from four fresh processes per version, run serially in balanced order.
The improvements are workload-specific, not whole-application speedups, and smaller differences can be affected by run-to-run variation.
This change does not improve every read or edit workload.
