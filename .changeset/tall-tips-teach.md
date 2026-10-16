---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Optimize memory use of arrays when using ForestTypeOptimized

[`ForestTypeOptimized`](https://fluidframework.com/docs/api/fluid-framework#foresttypeoptimized-variable) now more efficiently deduplicates structural information for adjacent children in [array nodes](https://fluidframework.com/docs/api/tree/treearraynode-interface) after edits.
For arrays of small, uniformly shaped subtrees, such as [`PlainText`](https://fluidframework.com/docs/api/fluid-framework/plaintext-namespace), this reduces fragmentation and can reduce memory use by approximately 60%.
