---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Create independent branches from tree views

The `@alpha` API `forkBranch(view)` creates a new, independent `TreeBranchHandleAlpha` on every call.
Use `branch.viewWith(config)` to create a view of the branch.
The branch owns its state and history; a view provides schema-aware access to that state.
Edits stay on the branch until you merge them into another view.
The caller owns each branch and must dispose it when it is no longer needed.
Disposing a view of the branch does not dispose the branch.
Disposing the branch also disposes its view.
A successful merge disposes the source branch and its view by default, not the target branch or its view.
Pass `false` as the second argument to `merge` to keep the source branch and its view alive.

```typescript
const branch = forkBranch(view);
const branchView = branch.viewWith(config);
branchView.root.count = 5; // Edit the branch only.
view.merge(branchView); // Merge into view, then dispose branch and branchView.
```

A branch and its views do not support `rewindTo`. Use `revertTo` to restore earlier content instead.
To make another independent branch, pass a view of the branch to `forkBranch`.

Unlike a view created with `branch.viewWith(config)`, a view returned by `view.fork()` owns its new branch.
Disposing that view also disposes its branch, even when the source view was created with `branch.viewWith(config)`.
