---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of reading nodes for the first time

Reading a property or array item for the first time created an anchor for the new field or node from its path, which was built from the cursor and then walked from the root of the tree.
The new field or node is now anchored directly under its parent's anchor, which is already known.
In a benchmark reading every property of 280 objects for the first time, the read took 61-86 ms instead of 85-114 ms with `ForestTypeOptimized`, and 2-11% less time with the default forest.
