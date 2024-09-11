---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": "tree"
---

A `@beta` version of `nodeChanged` which includes the list of properties has been added

```typescript
const factory = new SchemaFactory("example");
class Point2d extends factory.object("Point2d", {
	x: factory.number,
	y: factory.number,
}) {}

const point = new Point2d({ x: 0, y: 0 });

TreeBeta.on(point, "nodeChanged", (data) => {
	const changed: ReadonlySet<"x" | "y"> = data.changedProperties;
	if (changed.has("x")) {
		// ...
	}
});
```

The payload of the `nodeChanged` event emitted by SharedTree's `TreeBeta` includes a `changedProperties` property that indicates
which properties of the node changed.

For object nodes, the list of properties uses the property identifiers defined in the schema, and not the persisted
identifiers (or "stored keys") that can be provided through `FieldProps` when defining a schema.
See the documentation for `FieldProps` for more details about the distinction between "property keys" and "stored keys".

For map nodes, every key that was added, removed, or updated by a change to the tree is included in the list of properties.

For array nodes, the set of properties will always be undefined: there is currently no API to get details about changes to an array.

Object nodes revieve strongly types sets of changed keys, allowing compile time detection of incorrect keys:

```typescript
TreeBeta.on(point, "nodeChanged", (data) => {
	// @ts-expect-error Strong typing for changed properties of object nodes detects incorrect keys:
	if (data.changedProperties.has("z")) {
		// ...
	}
});
```

The existing stable "nodeChanged" event's callback now is given a parameter called `unstable` of type `unknown` which is used to indicate that additional data can be provided there.
This could break existing code using "nodeChanged" in a particularly fragile way.

```typescript
function f(optional?: number) {
	// ...
}
Tree.on(point, "nodeChanged", f); // Bad
```

Code like this which is implicitly discarding an optional argument from the function used as the listener will be broken.
It can be fixed by using an inline lambda expression:

```typescript
function f(optional?: number) {
	// ...
}
Tree.on(point, "nodeChanged", () => f()); // Safe
```
