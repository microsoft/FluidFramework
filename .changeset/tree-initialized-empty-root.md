---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
SharedTree preserves the schema of an initialized empty root

A tree initialized with an optional root that permits no node types can have no content and no stored node definitions.
Its stored root field still distinguishes it from a new tree.
When you reopen it, `view.compatibility.canInitialize` now returns `false`, and `view.initialize()` no longer allows a second initialization to replace its schema.
