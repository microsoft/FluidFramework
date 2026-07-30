---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add clear and getOrInsert methods to TreeMapNodeAlpha

[`TreeMapNodeAlpha`](https://fluidframework.com/docs/api/fluid-framework/treemapnodealpha-interface) now has `clear` and `getOrInsert` methods, further aligning it with JavaScript's built-in Map API.

The merge semantics of `clear` are loosely specified. Either of the following may occur:

- `clear` may remove all elements that were in the map when the edit was authored, even if some of those elements have since been moved elsewhere in the tree (in which case they are removed from their new location).
- `clear` may remove all elements that are in the map when the edit is sequenced, even if some of those elements were not yet in the map when the edit was authored.

`getOrInsert` returns the value at a key, first inserting a fallback value if the map has no entry for that key.

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

inventory.size; // 2
inventory.getOrInsert("apples", 10); // 5 (existing value returned, not overwritten)
inventory.getOrInsert("oranges", 10); // 10 (inserted and returned)

inventory.size; // 3
inventory.clear();
inventory.size; // 0
```
