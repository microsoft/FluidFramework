---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of starting and committing transactions

A transaction no longer copies the record of removed content kept for undo when it starts.
Instead, it records how to undo each change to that record, and replays those records only if the transaction is aborted.
The cost of a transaction therefore no longer grows with the amount of history kept for undo.