---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Speed up and reduce memory overhead of some SharedTree reads

SharedTree maps retain less memory when reading missing keys.
Maps and records also avoid retaining empty-field metadata after entries are removed, reducing memory growth when applications use many distinct keys.
These improvements require no application code changes.

#### Performance

Benchmarks show improvements in some read workloads, with tradeoffs in others.
Unhydrated nodes have not yet been inserted into a SharedTree view; hydrated nodes have been inserted.
Hydrated storage is configured through [ForestOptions.forest](https://fluidframework.com/docs/api/fluid-framework/forestoptions-interface#forest-propertysignature).
The table summarizes full navigation-suite measurements.

| Workload | Approximate change in elapsed time |
| --- | --- |
| Unhydrated map reads of missing keys | 32% less |
| Hydrated record leaf reads with [ForestTypeReference](https://fluidframework.com/docs/api/fluid-framework/#foresttypereference-variable) (default) | 23% less |
| Hydrated record leaf reads with [ForestTypeOptimized](https://fluidframework.com/docs/api/fluid-framework/#foresttypeoptimized-variable) | 15% less |
| Unhydrated object edits | 1% less to 1.5% more |
| Unhydrated array edits | 0-3.5% more |
| Unhydrated record leaf reads and repeated insertion/removal of entries | 6-7% more |

Object reads and hydrated object/array edits showed comparatively small changes overall.
Hydrated cases ranged from about 3.5% less to 2% more elapsed time, while unhydrated object reads ranged from about 5% less to 2% more.
Separate focused unhydrated object-access runs measured reads within 3% of the previous implementation and edits taking about 3-3.5% more time.

These comparisons used identical benchmark code before and after the change, Node.js 22.22.3 on Linux x64, and production emulation.
Results are averages from four fresh processes per version, run serially in balanced order.
The improvements are workload-specific, not whole-application speedups, and results depend on benchmark context and run-to-run variation.
This change does not improve every read or edit workload.
