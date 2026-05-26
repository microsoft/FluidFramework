---
"@fluidframework/tree": minor
"__section": tree
---
Starting a transaction inside a tree-change event listener now produces a usage error

Calling `runTransaction` from inside a `nodeChanged` or `treeChanged` event listener now throws a `UsageError`, and `runTransactionAsync` rejects with one.
This brings transactions into line with the existing rule that tree mutations from inside a change-event listener are forbidden.

The updated code throws before it can corrupt anything. Previously, a transaction started from a listener would push a transaction frame onto the running outer transaction's bookkeeping; if the inner body then attempted an edit (which is itself forbidden during a listener), the inner edit's throw would leave the outer transaction's frame stack corrupted.

The error message follows the existing format used by the other listener-time guards:

```
Running a transaction is forbidden during a nodeChanged or treeChanged event
```

After this error is thrown, the affected tree view enters a broken state and subsequent operations on it will throw an `Invalid use of ... after it was put into an invalid state` error.
Discard the view and acquire a fresh one to recover.

Applications should not make edits in response to edits. If a transaction in a listener previously appeared to "work", either its body was a no-op (in which case removing it changes nothing), or its body attempted an edit and the outer operation was already throwing on the inner edit's lock check.
