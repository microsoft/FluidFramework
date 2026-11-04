---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---

Manage branch state independently of views

You can now create and retain an independent branch without keeping a typed view alive.
This lets you separate the lifetime of branch state and history from the schema-configured view used to read and edit it.

This change is a step toward separating branch management from views and reducing the current one-view-per-branch restriction.
It does not enable multiple active views of the same branch: each branch still supports one active view at a time.

Use the new `@alpha` method `tree.forkBranch()` to create a `TreeBranchHandleAlpha` without a source view or schema configuration.
Use `branch.viewWith(config)` when you need to read or edit the branch.
Disposing that view preserves the branch so you can create another view later.
Edits remain isolated until you merge them into another view.

```typescript
import { asAlpha } from "@fluidframework/tree/alpha";

// tree is an initialized ITree with root.count === 0 and no active view.
// config contains its schema configuration.
const branch = asAlpha(tree).forkBranch();
const branchView = branch.viewWith(config);
const view = asAlpha(tree.viewWith(config));

branchView.root.count = 5;
console.log(view.root.count); // 0: the branch edit is isolated.

view.merge(branchView); // Also disposes branch and branchView.
console.log(view.root.count); // 5
```

You own each branch and must dispose it when you no longer need it.
Disposing a branch also disposes its active view.

Use `branch.fork()` to create an independent child branch.
Existing `view.fork()` behavior is unchanged: the returned view owns its branch, and disposing that view also disposes its branch.

See [Indexes and Branches](../packages/dds/tree/docs/main/indexes-and-branches.md) for more details.
