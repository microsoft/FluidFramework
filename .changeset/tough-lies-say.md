---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Edits and transactions started inside a tree-change event listener now produce a usage error

The existing edit-time lock that forbids tree mutations from inside a `nodeChanged` or `treeChanged` event listener now also covers the `changed` event, and starting a transaction from inside any of these listeners is also forbidden.
Calling `runTransaction` from such a listener throws a `UsageError`, `runTransactionAsync` rejects with one, and direct edits, branch operations, etc. throw with the same canonical wording — consistent with how the lock already covered the other event types.

For `nodeChanged` and `treeChanged`, this primarily improves the error message.
Edits inside the transaction were already throwing on the inner mutation's lock check, so any listener-started transaction whose body did real work was already failing — just with an error that named the inner edit rather than the `runTransaction` call.
The new guard fails earlier and names the actual misuse.

For `changed`, the new guard fixes a different class of bug.
The existing edit-time lock did not extend to `changed` emissions, so listener-started transactions (and direct edits, branching, etc.) previously ran to completion: their edits applied to the tree, their commits fired further `changed` events, and the listener could re-enter for those commits.
This pattern could produce infinite edit loops, redundant work across clients, incorrect attribution, broken undo/redo grouping, and pollution of the outer commit's label data.

The error message follows the existing format used by the other listener-time guards:

```
Running a transaction is forbidden during a nodeChanged, treeChanged, or changed event
```

After this error is thrown, the affected tree view enters a broken state and subsequent operations on it will throw an `Invalid use of ... after it was put into an invalid state` error.
Discard the view and acquire a fresh one to recover.

Applications should not make edits in response to edits.
For `nodeChanged` and `treeChanged` listeners no migration is needed — the inner edit was already throwing.
For `changed` listeners, the work was actually committing; if the derived edit is still needed, drive it from a user action or apply it on a `TreeBranchAlpha` and merge from there.
