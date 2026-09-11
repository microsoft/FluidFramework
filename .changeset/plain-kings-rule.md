---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Support flexible indexers when creating tree indexes

`createTreeIndex` now accepts the new `TreeIndexer` type: either a pure callback or an object with a `get` method. This simplifies the factory to two overloads while continuing to support `Map` and `ReadonlyMap` values.
