# simple-tree node Binding

Hydration is a three step process which provides the ability to use a simple-tree node both before and after it is inserted into the tree.
This allows developers to "read back" values that they insert into the tree much more succinctly.
Here is an example:

```ts
function addPoint(curve: Curve, x: number, y: number): Point {
	const point = new Point({ x: 3, y: 3 });
	curve.points.insertAtEnd(point);
	// `point` is the same simple-tree node object that you would get from reading it off of its new parent in the tree:
	assert(point === curve.points[curve.points.length - 1]);
	// So, to read the content that was just inserted, the original object can be used and there is no need to read via the parent:
	return point;
	// (rather than: `return curve.points[curve.points.length - 1]`)
}
```

## Implementation

This feature is supported by doing some bookkeeping to ensure that the simple-tree objects,
flex tree nodes and anchor nodes in the tree get associated and disassociated at the right times.
There are three states that a node simple-tree node can be in: "Unhydrated", "hydrating" and "Hydrated".

### Unhydrated Nodes

A newly created simple-tree node, a.k.a. an **unhydrated** simple-tree node. An unhydrated simple-tree node is produced by invoking the schema-provided constructor for a node:

```ts
const unhydratedPoint = new Point({ x: 3, y: 3 });
```

Such a simple-tree node will be unhydrated until it is inserted into the tree and becomes "hydrated" (see below).
Unhydrated nodes can be read or mutated just like hydrated ones.

### Hydrating Nodes

Between insertion edit and the change callback which updates the node to "Hydrated" (see [prepareForInsertion.ts](../prepareForInsertion.ts)),
the node is in a poorly defined "hydrating" state and should not be interacted with.

### Hydrated Nodes

A simple-tree node is fully hydrated when it is associated with a `HydratedFlexTreeNode`.

```ts
const point = new Point({ x: 3, y: 3 }); // `point` is unhydrated
curves.points.insertAtEnd(point); // `point` becomes hydrated
```
