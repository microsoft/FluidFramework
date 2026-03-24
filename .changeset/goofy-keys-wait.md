---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---

Array node `nodeChanged` events now include a delta payload (via `TreeAlpha`)

The `nodeChanged` event for array nodes — accessed via `TreeAlpha.on` — now provides a `delta` field, a sequence of `ArrayNodeDeltaOp` values that describe exactly what changed in the array. This lets you efficiently sync an external representation with tree changes, without snapshotting the old state or diffing the entire array.

The delta follows Quill-style semantics: each op covers a contiguous run of positions in the array before the change.

- `{ type: "retain", count: N }` — N elements stayed in place. Their positions are unchanged, though their contents may have changed (which would fire separate `nodeChanged` events on those elements).
- `{ type: "insert", count: N }` — N elements were inserted; read their values from the current tree at these positions.
- `{ type: "remove", count: N }` — N elements were removed.

Trailing unchanged elements are not represented by a trailing `"retain"` op.

Use `TreeAlpha.on` to subscribe to the richer alpha events. The data passed to the callback is typed as `NodeChangedDataAlpha<TNode>`:
- Object, map, and record nodes receive `NodeChangedDataProperties` (with a required `changedProperties` set).
- Array nodes receive `NodeChangedDataDelta` (with a `delta` field).

`TreeBeta.on` is unchanged and does not include delta information.

### Example: applying a delta to a plain array mirror

```typescript
// Walk the delta to keep a plain JS array in sync with an array node.
// retain = advance past unchanged elements, insert = splice in new elements,
// remove = splice out removed elements.
const mirror: number[] = [1, 2, 3];

TreeAlpha.on(myArrayNode, "nodeChanged", ({ delta }) => {
	let readPos = 0; // position in the current (post-change) tree
	let writePos = 0; // position in the mirror array

	for (const op of delta ?? []) {
		if (op.type === "retain") {
			writePos += op.count;
			readPos += op.count;
		} else if (op.type === "insert") {
			const newItems = Array.from({ length: op.count }, (_, i) =>
				myArrayNode[readPos + i],
			);
			mirror.splice(writePos, 0, ...newItems);
			writePos += op.count;
			readPos += op.count;
		} else if (op.type === "remove") {
			mirror.splice(writePos, op.count);
		}
	}
});
```

### Example: narrowing the union in a generic handler

```typescript
TreeAlpha.on(node as TreeNode, "nodeChanged", (data) => {
	if ("delta" in data) {
		// Array node — data is NodeChangedDataDelta
		console.log("array changed, delta:", data.delta);
	} else {
		// Object/map/record node — data is NodeChangedDataProperties
		console.log("properties changed:", data.changedProperties);
	}
});
```

> **Note:** The `delta` value may be `undefined` in two cases:
> - The node was created locally and has not yet been inserted into a document tree (a known temporary limitation).
> - The document was updated in a way that required multiple internal change passes in a single operation (for example, a data change combined with a schema upgrade).
