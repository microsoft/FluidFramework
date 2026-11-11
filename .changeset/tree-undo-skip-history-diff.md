---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of undoing an edit that later edits followed

Undoing an edit that was followed by other edits no longer computes the combined effect of those later edits, except when the undo has a constraint that requires the document to be unchanged since the edit.
The cost of such an undo no longer grows with the number of later edits.