---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
All non-structurally named schema factory APIs now support node schema metadata

The "options" parameter which allows providing metadata for `TreeNodeSchema` is now available consistently on `SchemaFactory` and `SchemaFactoryBeta`,
not just `SchemaFactoryAlpha` and a subset of `SchemaFactoryBeta`.
