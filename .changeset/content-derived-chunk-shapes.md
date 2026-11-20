---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Optimized forest uses uniform chunks for optional and polymorphic fields

`ForestTypeOptimized` now stores subtrees compactly even where the schema allows optional or polymorphic fields, when their content repeats the same layout.
This reduces the memory used by trees whose nodes have optional properties, for content inserted locally, received from other clients, and loaded from summaries.
Tree content, ops and summaries are unchanged.
