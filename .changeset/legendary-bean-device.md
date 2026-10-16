---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

Revert to a commit directly from branch history

Commit metadata now has a `revertTo()` method that reverts later changes on the branch from which the commit was obtained.
This supersedes the existing `revertTo()` API on the view (though that API remains available).

```typescript
// Given some arbitrary commit in the history of a particular view...
const commit = view.branchHistory.getHead()?.getParent();
// ...check whether that commit can still be reverted, then revert if so
if (commit?.revertTo === undefined) {
	throw new Error("Sorry, the requested revert can't be completed");
}
commit.revertTo();
```

If the commit is no longer reachable on its original branch, the original branch has been replaced or disposed, or a later commit changes the schema, then the revert is not possible.
In any of these cases, the `revertTo()` method will be absent (`undefined`) from the commit metadata object.
The method is also unavailable while a transaction is in progress or during change events.
Read `revertTo` from the commit metadata before each call rather than retaining the function; each obtained function can be called only once.

Custom metadata supplied to transactions and reverts is read and serialized while edits to the target checkout are disallowed.
Getters and serialization hooks that attempt to edit that tree throw an error before the edit is applied.
