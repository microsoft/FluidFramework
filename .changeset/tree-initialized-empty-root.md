---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
SharedTree preserves the schema of an initialized empty root

An empty tree is not necessarily a new tree.
Previously, if you initialized a tree with an optional root that allowed no node types, reopening it reported `view.compatibility.canInitialize` as `true`.
A second call to `view.initialize()` could then replace its schema.
Now `canInitialize` is `false`, and a second initialization throws without replacing the schema.
