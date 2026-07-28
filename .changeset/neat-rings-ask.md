---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add clear method to TreeMapNodeAlpha

[`TreeMapNodeAlpha`](https://fluidframework.com/docs/api/fluid-framework/treemapnodealpha-interface) now has a `clear` method, further aligning it with JavaScript's built-in Map API. It removes all elements from the map.

The merge semantics of `clear` are loosely specified: either of the following may occur:

- `clear` may remove all elements that were in the map when the edit was authored, even if some of those elements have since been moved elsewhere in the tree (in which case they are removed from their new location).
- `clear` may remove all elements that are in the map when the edit is sequenced, even if some of those elements were not yet in the map when the edit was authored.

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

inventory.size; // 2
inventory.clear();
inventory.size; // 0
```
