---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Promote detailed Tree change event payloads to beta

[`TreeBeta.on`](https://fluidframework.com/docs/api/tree/treebeta-interface#on-methodsignature) now provides detailed change payloads for array nodes.
The [`nodeChanged`](https://fluidframework.com/docs/api/tree/treechangeevents-interface#nodechanged-methodsignature) event reports retain, insert, and remove operations for direct array changes.
The [`treeChanged`](https://fluidframework.com/docs/api/tree/treechangeevents-interface#treechanged-methodsignature) event also identifies retained elements whose subtrees changed.
For object nodes, `nodeChanged` identifies directly changed fields through [`changedProperties`](https://fluidframework.com/docs/api/tree/nodechangeddata-interface#changedproperties-propertysignature).

The corresponding payload and operation types are now exported from the beta entrypoint.
Existing [`TreeAlpha.on`](https://fluidframework.com/docs/api/tree/treealpha-interface#on-methodsignature) usage remains, but is now deprecated in favor of the `TreeBeta` API.

#### Examples

The following example uses `changedProperties` to update only the displayed values whose fields changed on an object node.

```typescript
TreeBeta.on(personNode, "nodeChanged", ({ changedProperties }) => {
	// Refresh each displayed value only when its corresponding field changed.
	if (changedProperties.has("name")) {
		updateDisplayedName(personNode.name);
	}
	if (changedProperties.has("age")) {
		updateDisplayedAge(personNode.age);
	}
});
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
