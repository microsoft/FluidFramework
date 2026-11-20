---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of applying edits and undoing them

Applying an edit visits the changed part of the tree twice: once to detach content and once to attach it.
The second visit now skips the nodes that have nothing left to attach once the first is done, such as the nodes above a property that was set or above content that was removed.
