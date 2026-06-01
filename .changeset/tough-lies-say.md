---
"@fluidframework/tree": minor
"__section": tree
---
Starting a transaction inside a tree-change event listener now produces a usage error

Calling `runTransaction` from inside a `nodeChanged`, `treeChanged`, or `changed` event listener now throws a `UsageError`, and `runTransactionAsync` rejects with one.
This brings transactions into line with the existing rule that tree mutations from inside a change-event listener are forbidden.

For `nodeChanged` and `treeChanged`, the existing edit-time lock was already throwing on any edit inside the transaction.
The new guard makes the error fire earlier with a clearer message that names the `runTransaction` call rather than the inner edit.

For `changed`, the new guard fixes a different class of bug.
The edit-time lock does not extend to `changed` emissions, so listener-started transactions previously ran to completion: their edits applied to the tree, their commits fired further `changed` events, and the listener could re-enter for those commits.
This pattern could produce infinite edit loops, redundant work across clients, incorrect attribution, broken undo/redo grouping, and pollution of the outer commit's label data.

The error messages follow the existing format used by the other listener-time guards:

```
Running a transaction is forbidden during a nodeChanged or treeChanged event
Running a transaction is forbidden during a changed event
```

After this error is thrown, the affected tree view enters a broken state and subsequent operations on it will throw an `Invalid use of ... after it was put into an invalid state` error.
Discard the view and acquire a fresh one to recover.

Applications should not make edits in response to edits.
For `nodeChanged` and `treeChanged` listeners no migration is needed — the inner edit was already throwing.
For `changed` listeners, the transaction was committing; if the derived work is still needed, drive it from a user action or apply it on a `TreeBranchAlpha` and merge from there.
