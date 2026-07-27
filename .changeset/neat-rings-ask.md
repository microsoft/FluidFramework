---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add clear method to TreeMapNodeAlpha

`TreeMapNodeAlpha` now has a `clear` method, further aligning it with JavaScript's built-in Map API. It removes all elements from the map.

The merge semantics of `clear` are loosely specified: either of the following may occur:

- `clear` may remove/detach all elements present in the map at the time the edit was authored, even if such elements are attached somewhere else when the edit is sequenced.
- `clear` may remove/detach all elements present in the map at the time the edit is sequenced, even if such elements were not in the map at the time the edit was authored.

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
