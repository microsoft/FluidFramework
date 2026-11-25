---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of reading nodes after an edit

An edit invalidates the cursors used for reading the tree, and each node or field read after it moved a new cursor from the root of the tree to its place.
Reading an object or array node that was already read now finds it from its parent's anchor, without a cursor.
A node or field that needs a cursor now forks the cursor of the closest node or field above it that has one, instead of moving one from the root.
In a benchmark reading every property of 280 objects, a read after an edit took about 8.5 ms instead of 13 ms.