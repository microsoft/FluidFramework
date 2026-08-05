---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add getOrInsert and getOrInsertComputed methods to TreeMapNodeAlpha

[`TreeMapNodeAlpha`](https://fluidframework.com/docs/api/fluid-framework/treemapnodealpha-interface) now has `getOrInsert` and `getOrInsertComputed` methods, further aligning it with JavaScript's built-in Map API.
Both return the value at a key, first inserting a value if the map has no entry for that key: `getOrInsert` takes the fallback value directly, while `getOrInsertComputed` takes a callback which is only invoked (with the key) when an insert is needed, which is preferable when producing the fallback value is expensive.

When the fallback value is inserted and is not already a [`TreeNode`](https://fluidframework.com/docs/api/fluid-framework/treenode-class), the inserted and returned value is the result of implicitly constructing a node from it.

These methods are available on `TreeMapNodeAlpha`, which can be obtained from an existing `TreeMapNode` via `asAlpha`, or by declaring the schema with `SchemaFactoryAlpha`'s `mapAlpha`.

```typescript
const schemaFactory = new SchemaFactoryAlpha("example");
class Inventory extends schemaFactory.mapAlpha("Inventory", schemaFactory.number) {}

const inventory = new Inventory(
	new Map([
		["apples", 5],
		["pears", 3],
	]),
);

inventory.getOrInsert("apples", 10); // 5 (existing value returned, not overwritten)
inventory.getOrInsert("oranges", 10); // 10 (inserted and returned)

inventory.getOrInsertComputed("pears", () => computeRestockAmount()); // 3 (existing value returned, callback not invoked)
inventory.getOrInsertComputed("plums", () => computeRestockAmount()); // inserts and returns the computed value

inventory.size; // 4
```
