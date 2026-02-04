---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Promote TableSchema APIs to beta

Promotes the `SharedTree` [TableSchema](https://fluidframework.com/docs/api/fluid-framework/tableschema-namespace) from alpha to beta.
These APIs can now be imported via `@fluidframework/tree/beta`.
Documents from before this are not supported with the beta version of the schema to ensure orphan cell invariants can be guaranteed.
