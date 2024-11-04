---
"@fluidframework/tree": minor
---
---
"section": tree
---

SharedTree branching API has been improved

The alpha SharedTree branching API has been updated to be more accessible and intuitive.
The branching functions (`branch`, `merge`, `rebaseOnto`, etc.) are now directly available on the view object rather than a separate object.
In particular, `TreeViewAlpha` is now a `TreeBranch`, which exposes the methods to coordinate branches.

The existing `TreeBranch` type has been renamed to `BranchableTree` and is now **deprecated**.

See the `TreeBranch` interface for more details.

The new API is used e.g. as follows:

```typescript
const sf = new SchemaFactory("example");
class StringArray extends sf.array("StringArray", sf.string) {}

function example(view: TreeViewAlpha<typeof StringArray>): void {
	// Create a branch
	const branch = view.fork();
	// Modify the branch rather than the main view
	branch.root.insertAtEnd("new string");
	// `view` does not yet contain "new string"
	// ...
	// Later, merge the branch into the main view
	view.merge(branch);
	// `view` now contains "new string"
}
```

Here is the equivalent behavior with the previous API, for reference:

```typescript
const sf = new SchemaFactory("example");
class StringArray extends sf.array("StringArray", sf.string) {}

function example(view: TreeViewAlpha<typeof StringArray>): void {
	// Get the branch for the view
	const branch = getBranch(view);
	const fork = branch.branch();
	// Modify the branch rather than the main view
	fork.root.insertAtEnd("new string");
	// `view` does not yet contain "new string"
	// ...
	// Later, merge the branch into the main view
	branch.merge(fork);
	// `view` now contains "new string"
}
```

Additionally, there is a new API to acquire the branch from a node:

```typescript
// All nodes that have been inserted into the tree belong to a branch - this retrieves that branch
const branch = TreeAlpha.branch(node);
```

To convert the branch object to a view with a known schema, use:

```typescript
if (branch.hasRootSchema(MySchema)) {
	const view = branch; // `branch` is now typed as a `TreeViewAlpha<MySchema>`
}
```

Use the following function to expose the alpha APIs on a `TreeView` that is not typed as a `TreeViewAlpha`:

```typescript
const viewAlpha = asTreeViewAlpha(view);
```
