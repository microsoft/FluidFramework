---
"fluid-framework": minor
"@fluidframework/tree": minor
---

A new tree status has been added for SharedTree nodes.

`TreeStatus.Created` indicates that a SharedTree node has been constructed but not yet inserted into the tree.
Constraints passed to the `runTransaction` API are now marked as `readonly`.
