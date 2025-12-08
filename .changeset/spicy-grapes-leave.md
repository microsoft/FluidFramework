---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fixed bug in sending of revert edits after an aborted transaction

Aborting a transaction used to put the tree in a state that would trigger an assert when sending some undo/redo edits to peers.
This would prevent some undo/redo edits from being sent and would put the tree in a broken state that prevented any further edits.
This issue could not have caused document corruption, so reopening the document was a possible remedy.
Aborting a transaction no longer puts the tree in such a state, so it is safe to perform undo/redo edits after that.
