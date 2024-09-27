---
"@fluidframework/tree": minor
---
---
"section": tree
---

Unhydrated SharedTree nodes emit change events when edited

Newly-created SharedTree nodes which have not yet been inserted into the tree will now emit `nodeChanged` and `treeChanged` events when they are mutated via editing operations.
