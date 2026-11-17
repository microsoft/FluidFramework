---
"@fluidframework/tree": minor
"__section": tree
---
Reduce view maintenance overhead for some SharedTree edits

When configured with [ForestTypeOptimized](https://fluidframework.com/docs/api/v3/tree#foresttypeoptimized-variable),
SharedTree reduces the cost of clearing cached navigation state during edits and the memory retained by that cleared state.
Results depend on the document schema, workload, and environment; not all operations improve.

#### Example measurements

An application-level benchmark measures the first edit after initializing an array of 1,000 points with numeric `x` and `y` fields.
It sets `point.x = 1001` on the middle point.
Initialization leaves cached navigation state for many nodes, which this first edit clears.
The comparison isolates this change from the subsequent in-place leaf-editing optimization.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| First local edit time after initialization | 0.780 ms | 0.655 ms | 16% less |
| Memory retained by the tree view after that edit | 2.662 MiB | 2.532 MiB | 4.9% less |

These results do not imply a comparable improvement for repeated edits to an already-edited document.
The memory reduction comes from smaller retained navigation state, not a more compact representation of the document content.

Measurements use Node.js 22.23.2 and report means across two runs per implementation in an interleaved comparison.
Timing covers the property assignment, excluding document initialization, point lookup, and result verification.
Memory figures are per document after garbage collection, including content and editing history retained by the tree view; they do not measure peak memory.
