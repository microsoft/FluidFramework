---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
highlight: true
---

✨ New! Alpha SharedTree branching APIs

Several APIs have been added to allow for creating and coordinating "version-control"-style branches of the SharedTree.
Use the `getBranch` entry point function to acquire a branch.
For example:

```ts
function makeEditOnBranch(mainView: TreeView<typeof MySchema>) {
	mainView.root.myData = 3;
	const mainBranch = getBranch(mainView); // This function accepts either a view of a SharedTree (acquired e.g. via `sharedTree.viewWith(...)`) or a `SharedTree` directly.
	const forkBranch = mainBranch.branch(); // This creates a new branch based on the existing branch.
	const forkView = forkBranch.viewWith(new TreeViewConfiguration({ schema: MySchema })); // Acquire a view of the forked branch in order to read or edit its tree.
	forkView.root.myData = 4; // Set the value on the fork branch to be 4. The main branch still has a value of 3.
	mainBranch.merge(forkBranch); // Merging the fork changes into the main branch causes the main branch to have a value of 4.

	// Note: The main branch (and therefore, also the `forkView`) is automatically disposed by the merge.
	// To prevent this, use `mainBranch.merge(forkBranch, false)`.
}
```
