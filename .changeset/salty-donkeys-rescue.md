---
"@fluidframework/tree": minor
---

Breaking change: Removed the `"afterBatch"` event from `Treeview`.

This event is no longer necessary.
In the past, it provided a means for waiting for a batch of changes to finish applying to the tree before taking some action.
However, the tree change events exposed via `Tree.on` wait for a batch to complete before firing, so the `"afterBatch"` event provides no additional guarantees.
Listeners of this event who wish to respond to changes to the tree view can use `"rootChanged"` instead.
