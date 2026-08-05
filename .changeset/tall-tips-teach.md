---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce optimized SharedTree memory use after sequence edits

`ForestTypeOptimized` now coalesces adjacent uniformly shaped chunks after sequence insertions and removals.
For sequences of small, uniformly shaped subtrees, such as plain text, this reduces fragmentation and can reduce memory use by approximately 60%.
