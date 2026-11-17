---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of building, composing and applying edits

The maps keyed by change atom IDs, used whenever an edit is built, composed or rebased, compare their keys directly instead of through a generic tuple comparator.
Applying an edit that builds a single node, such as setting a property, no longer forks a cursor for it.
