---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Create independent branches from tree views

The `@alpha` API `forkBranch(view)` creates a new, independent `TreeBranchHandleAlpha` on every call.
Use `getViewOfBranch(branch, config)` to create a view of the branch.
Edits stay on the branch until you merge them into another view.
The caller owns each branch and must dispose it when it is no longer needed.
Disposing a view of the branch does not dispose the branch.
A successful merge disposes the branch by default.

```typescript
const branch = forkBranch(view);
const branchView = getViewOfBranch(branch, config);
branchView.root.count = 5; // Edit the branch only.
view.merge(branchView); // Merge into the source view. This disposes the branch.
```

A branch and its views do not support `rewindTo`. Use `revertTo` to restore earlier content instead.
To make another independent branch, pass a view of the branch to `forkBranch`.
Disposing a view returned by `view.fork()` also disposes its branch, even when the source view was created with `getViewOfBranch`.
