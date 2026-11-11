---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of undoing an edit that later edits followed

Undoing an edit that was followed by other edits no longer computes the combined effect of those later edits, except when the undo has a constraint that requires the document to be unchanged since the edit.
This avoids a computation over all the later edits: in a benchmark, undoing an edit followed by 60 later edits took about 2 ms instead of 6 ms.