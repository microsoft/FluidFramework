---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

New Alpha APIs for tree data import and export

A collection of new `@alpha` APIs for important and exporting tree content and schema from SharedTrees has been added to `TreeAlpha`.
These include import and export APIs for for `VerboseTree`, `ConciseTree` and compressed tree formats.

`TreeAlpha.create` is also added to allow constructing trees with a more general API than having to use the schema constructor directly (since that doesn't handle polymorphic roots, or non-schema aware code).

The function `independentInitializedView` has been added to provide a way to combine data from the existing `extractPersistedSchema` and new `TreeAlpha.exportCompressed` back into a `TreeView` in a way which can support safely importing data which could have been exported with a different schema.
This allows replicating the schema evolution process for Fluid documents stored in a service, but entirely locally without involving any collaboration services.
`independentView` has also been added, which is similar but handles the case of creating a new view without an existing schema or tree.

Together these APIs address several use-cases:

1. Using SharedTree as a in memory non-collaborative datastore.
2. Importing and exporting data from a SharedTree to and from other services or storage locations (such as locally saved files).
3. Testing various scenarios without relying on a service.
4. Using SharedTree libraries for just the schema system and encode/decode support.
