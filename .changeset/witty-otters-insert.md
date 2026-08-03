---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add getOrInsert method to TreeMapNodeAlpha

[`TreeMapNodeAlpha`](https://fluidframework.com/docs/api/fluid-framework/treemapnodealpha-interface) now has a `getOrInsert` method, further aligning it with JavaScript's built-in Map API. It returns the value at a key, first inserting a fallback value if the map has no entry for that key.

When the fallback value is inserted and is not already a [`TreeNode`](https://fluidframework.com/docs/api/fluid-framework/treenode-class), the inserted and returned value is the result of implicitly constructing a node from it.

This method is available on `TreeMapNodeAlpha`, which can be obtained from an existing `TreeMapNode` via `asAlpha`, or by declaring the schema with `SchemaFactoryAlpha`'s `mapAlpha`.

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

inventory.size; // 3
```
