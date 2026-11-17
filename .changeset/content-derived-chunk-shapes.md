---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
The optimized forest stores content in uniform chunks even where the schema allows optional or polymorphic fields

`ForestTypeOptimized` stores a subtree compactly, as a uniform chunk (an array of values plus a shared description of the subtree's shape), only when its schema fixes the layout of the whole subtree.
Any optional field, or a field allowing several types, made each node a separate chunk with its own map of fields.

The forest now also derives shapes from the content itself: a node gets a shape when each of its fields holds a single child with a shape, so nodes whose optional properties are mostly unset or hold small objects are stored as uniform chunks.
This applies to content inserted locally, received from other clients, and loaded from summaries.
It changes how content is stored in memory only: the content, its field order, ops and summaries are unchanged.

In a benchmark of a 200-section document whose nodes mostly carry optional properties, the heap retained by the tree after inserting the content fell by 46-58% (for example from about 35.0 MB to about 16.2 MB for text-heavy sections), and after loading it from a summary by 29-34%.
