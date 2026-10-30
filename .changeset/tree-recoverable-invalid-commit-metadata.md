---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Invalid custom commit metadata no longer breaks the tree view

Passing `customMetadata` that is not a JSON-serializable object to `TreeViewAlpha.runTransaction`, `TreeViewAlpha.runTransactionAsync`, or `TreeBranchAlpha.revertTo` still throws a `UsageError`, but the view now remains usable afterwards.
Previously, the error put the view into a broken state, and every later operation on it failed.

The metadata is validated before the transaction starts, so a transaction rejected for invalid metadata never runs.
Errors thrown by the transaction itself still put the view into a broken state, as before.
