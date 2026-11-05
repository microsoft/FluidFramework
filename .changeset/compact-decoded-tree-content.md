---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce optimized forest memory overhead after loading and receiving inserted content

SharedTree configured with [ForestTypeOptimized](https://fluidframework.com/docs/api/v3/tree#foresttypeoptimized-variable) now uses compact in-memory storage for eligible content loaded from summaries or received in insertion operations.
