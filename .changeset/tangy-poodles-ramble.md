---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Promote importConcise and exportConcise to beta

`importConcise` and `exportConcise` were previously available via [TreeAlpha](https://fluidframework.com/docs/api/tree/treealpha-interface).
They may now also be accessed via [TreeBeta](https://fluidframework.com/docs/api/tree/treebeta-interface).

Note that the beta form of `importConcise` does not support [UnsafeUnknownSchema](https://fluidframework.com/docs/api/fluid-framework/unsafeunknownschema-typealias).
