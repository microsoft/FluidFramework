---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

SharedTree schema authors can deprecate allowed types

Use `SchemaFactoryAlpha.deprecated()` or `deprecatedRecursive()` to stop introducing a type into new documents while keeping existing documents usable.
A document that already permits the type still supports reads and writes of that type.
These alpha helpers do not remove stored types or migrate data.
