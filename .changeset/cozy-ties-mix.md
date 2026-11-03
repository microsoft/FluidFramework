---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Create independent branches directly from trees

Use the new `@alpha` method `tree.forkBranch()` to create an independent branch.
Each call returns a new `TreeBranchHandleAlpha`.
`ViewableTreeAlpha` defines this method, and `ITreeAlpha` inherits it.
For `ITreeAlpha`, the method forks the SharedTree main branch.
For a tree from `createIndependentTreeAlpha`, the method forks that tree's current state.
You do not need a source view or a schema configuration to fork the tree.
You can fork the tree before you create a view or after you dispose a view.

Use `branch.viewWith(config)` to create a view of the branch.
The branch owns its state and history.
The view uses the configured schema to read and edit that state.
Edits affect only this branch until you merge them into another view.
You own each branch.
Dispose the branch when you no longer need it.
If you dispose the view, the branch remains available.
If you dispose the branch, it also disposes its view.
By default, a successful merge disposes the source branch and its view.
It does not dispose the target branch or its view.
Pass `false` as the second argument to `merge` to keep the source branch and its view available.

```typescript
import { asAlpha } from "@fluidframework/tree/alpha";

// tree is an initialized ITree with no active view.
// config contains its schema configuration.
const branch = asAlpha(tree).forkBranch();
const branchView = branch.viewWith(config);
branchView.root.count = 5; // Edit the branch only.

const child = branch.fork(); // Create a separate branch with the same state.
child.dispose(); // Does not dispose branch or branchView.

const view = asAlpha(tree.viewWith(config));
view.merge(branchView); // Merge the edits, then dispose branch and branchView.
```

A branch and its views do not support `rewindTo`.
Use `revertTo` to restore earlier content.
Use `branch.fork()` to create an independent child branch.
If you dispose a parent branch, its children remain available.
If you dispose a child branch, its parent remains available.
`tree.forkBranch()` and `branch.fork()` throw a `UsageError` if the source branch has a pending transaction.
They also throw a `UsageError` if the source branch is disposed.

See [Indexes and Branches](../packages/dds/tree/docs/main/indexes-and-branches.md) for more details.

A view from `view.fork()` owns its new branch.
If you dispose that view, it also disposes its branch.
This rule also applies when you create the source view with `branch.viewWith(config)`.
