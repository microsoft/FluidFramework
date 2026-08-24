---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Promote array node change event deltas to beta

[`TreeBeta.on`](https://fluidframework.com/docs/api/fluid-framework/treebeta-interface#on-methodsignature) now provides detailed delta payloads for array nodes.
The [`nodeChanged`](https://fluidframework.com/docs/api/fluid-framework/treechangeeventsbeta-interface#nodechanged-propertysignature) event reports retain, insert, and remove operations for direct array changes.
The [`treeChanged`](https://fluidframework.com/docs/api/fluid-framework/treechangeeventsbeta-interface#treechanged-propertysignature) event also identifies retained elements whose subtrees changed.

The array delta payload and operation types are now exported from the beta entrypoint.
Existing [`TreeAlpha.on`](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#on-methodsignature) support remains, but is now deprecated in favor of the `TreeBeta` API.

#### Examples

For example, inserting `99` at index 1 in an array containing `[1, 2, 3]` produces the following delta.

```typescript
[
	{ type: "retain", count: 1 },
	{ type: "insert", count: 1 },
	{ type: "retain", count: 2 },
];
```

Removing the value at index 1 from an array containing `[1, 2, 3]` produces the following delta.

```typescript
[
	{ type: "retain", count: 1 },
	{ type: "remove", count: 1 },
	{ type: "retain", count: 1 },
];
```

The following example applies an array node's direct changes to an external array without comparing full snapshots.

```typescript
TreeBeta.on(arrayNode, "nodeChanged", ({ delta }) => {
	// Fall back to a full synchronization when a granular delta is unavailable.
	if (delta === undefined) {
		synchronizeAllItems(arrayNode);
		return;
	}

	// Track the current position in both the tree array and the displayed array.
	let index = 0;
	for (const operation of delta) {
		switch (operation.type) {
			case "retain":
				// Skip elements that were not inserted or removed.
				index += operation.count;
				break;
			case "remove":
				// Remove elements at the current position without advancing it.
				displayedItems.splice(index, operation.count);
				break;
			case "insert":
				// Read inserted values from the updated tree and add them to the display.
				displayedItems.splice(
					index,
					0,
					...arrayNode.slice(index, index + operation.count),
				);
				index += operation.count;
				break;
		}
	}
});
```
