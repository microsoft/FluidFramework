---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
The edit lock now also covers the `changed` event

The existing edit-time lock that forbids tree mutations from inside a `nodeChanged` or `treeChanged` event listener now also covers the `changed` event.
Direct edits, branch operations, reverts, etc. attempted from inside a `changed` listener now throw the same canonical `UsageError` they already throw from the other change-event listeners.

Previously the lock did not extend to `changed` emissions, so edits made from a `changed` listener ran to completion: they applied to the tree, their commits fired further `changed` events, and the listener could re-enter for those commits.
This pattern could produce infinite edit loops, redundant work across clients, incorrect attribution, broken undo/redo grouping, and pollution of the outer commit's label data.

The error message now names all three events:

```
Editing the tree is forbidden during a nodeChanged, treeChanged, or changed event
```

Applications should not make edits in response to edits.
If a derived edit is genuinely needed, drive it from a user action or apply it on a `TreeBranchAlpha` and merge from there.
