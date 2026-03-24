---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---

Array node `nodeChanged` events now include a delta payload describing what changed

The `nodeChanged` event for array nodes now provides a `delta` field — a sequence of `ArrayNodeDeltaOp` values that describe exactly what changed in the array. This lets you efficiently sync an external representation with tree changes, without snapshotting the old state or diffing the entire array.

The delta follows Quill-style semantics: each op covers a contiguous run of positions in the array before the change.

- `{ type: "retain", count: N }` — N elements were unchanged (and may have nested changes).
- `{ type: "insert", count: N }` — N elements were inserted; read their values from the current tree at these positions.
- `{ type: "remove", count: N }` — N elements were removed.

Trailing unchanged elements are not represented by a trailing `"retain"` op.

The `NodeChangedData` type is now a discriminated union:
- Object, map, and record nodes emit `NodeChangedDataProperties` (with a required `changedProperties` set).
- Array nodes emit `NodeChangedDataDelta` (with a `delta` field).

### Example: applying a delta to a plain array mirror

```typescript
const mirror: number[] = [1, 2, 3];

TreeBeta.on(myArrayNode, "nodeChanged", (data) => {
	let readPos = 0; // position in the current (post-change) tree
	let writePos = 0; // position in the mirror array

	for (const op of data.delta ?? []) {
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

### Example: narrowing the union in a handler

```typescript
TreeBeta.on(node as TreeNode, "nodeChanged", (data) => {
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
> - The array node is unhydrated (a known temporary limitation).
> - The array was modified across multiple batches within a single flush (e.g. due to an interleaved schema change).
