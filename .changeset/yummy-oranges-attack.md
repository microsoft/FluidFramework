---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Adds optional "label" parameter to runTransaction for grouping changes

Transaction labels can be used to group multiple changes for undo/redo, where groups of changes with the same label can be undone together. When multiple labels are used in nested transactions, only the outermost label will be used.

The following example demonstrates how to implement label-based undo/redo grouping. It listens to the `changed` event on the checkout to collect all commits with the same label into a group. When `undoLatestGroup()` is called, all transactions in that group are reverted together with a single operation.

```typescript
interface LabeledGroup {
	label: unknown;
	revertibles: { revert(): void }[];
}

const undoGroups: LabeledGroup[] = [];

// The callback on the "changed" event can be used to group the commits.
view.checkout.events.on("changed", (meta, getRevertible) => {
	// Only process local edits, not remote changes or Undo/Redo operations
	if (getRevertible !== undefined && meta.kind === CommitKind.Default) {
		const label = meta.label;
		const revertible = getRevertible();

		// Check if the latest group contains the same label.
		const latestGroup = undoGroups[undoGroups.length - 1];
		if (
			label !== undefined &&
			latestGroup !== undefined &&
			label === latestGroup.label
		) {
			latestGroup.revertibles.push(revertible);
		} else {
			undoGroups.push({ label, revertibles: [revertible] });
		}
	}
});

const undoLatestGroup = () => {
	const latestGroup = undoGroups.pop() ?? fail("There are currently no undo groups.");
	for (const revertible of latestGroup.revertibles.reverse()) {
		revertible.revert();
	}
};

// Group multiple transactions with the same label
view.runTransaction(() => { view.root.content = 1; }, { label: "EditGroup" });
view.runTransaction(() => { view.root.content = 2; }, { label: "EditGroup" });
view.runTransaction(() => { view.root.content = 3; }, { label: "EditGroup" });

// This would undo all three transactions together.
undoLatestGroup();
// view.root.content is now back to 0 (the initial state).
```
