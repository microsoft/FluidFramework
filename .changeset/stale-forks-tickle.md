---
"@fluidframework/tree": minor
---
---
"section": tree
---

Added new and improved SharedTree branching API

This refreshes the (currently alpha) SharedTree branching API to be more accessible and intuitive.
The branching functionality (`branch`, `merge`, `rebaseOnto`, etc.) are now directly available on the view object rather than a separate object.
In particular, `TreeViewAlpha` is now a `TreeContext`, which exposes the methods to coordinate branches.
See the `TreeContext` interface for more details.

```typescript
const sf = new SchemaFactory("example");
class StringArray extends sf.array("StringArray", sf.string) {}

function example(view: TreeViewAlpha<typeof StringArray>): void {
	// Create a branch
	const branch = view.branch();
	// Modify the branch rather than the main view
	branch.root.insertAtEnd("new string");
	// `view` does not yet contain "new string"
	// ...
	// Later, merge the branch into the main view
	view.merge(branch);
	// `view` now contains "new string"
}
```
