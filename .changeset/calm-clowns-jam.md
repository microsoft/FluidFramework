---
"@fluidframework/tree": "minor"
---

Better events

We have updated the Events to make it easier to create granular event listeners for single nodes and better support the
undo/redo feature. SharedTree nodes now expose `nodeChanged` and `treeChanged` events that fire in response to changes
in the node, and to changes in the subtree rooted at the node, respectively.

This change was originally made in [#20286](https://github.com/microsoft/FluidFramework/pull/20286) ([ac1e773960](https://github.com/microsoft/FluidFramework/commit/ac1e7739607551abb0dae7fa74dda56aec94b609)).

[Read more about SharedTree Events at fluidframework.com](https://fluidframework.com/docs/data-structures/tree/#event-handling)
