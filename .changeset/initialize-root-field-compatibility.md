---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Faster `TreeView.initialize()` for schemas without staged upgrades

[`TreeView.initialize()`](https://fluidframework.com/docs/api/fluid-framework/treeview-interface#initialize-methodsignature) no longer compares the view schema with the whole stored schema it installs when the view schema has no staged schema upgrades.
That stored schema is generated from the view schema, so only its root field can differ from it (a required root is installed as optional first, while the content is inserted).
In that case, compatibility is computed from the root field alone.

In a benchmark initializing an empty tree with a schema of about 1,780 node types, `initialize` took a median of about 88 ms instead of about 276 ms.
