---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Allow constructing recursive maps from objects

Previously only non-recursive maps could be constructed from objects.
Now all maps nodes can constructed from objects:

```typescript
class MapRecursive extends sf.mapRecursive("Map", [() => MapRecursive]) {}
{
	type _check = ValidateRecursiveSchema<typeof MapRecursive>;
}
// New:
const fromObject = new MapRecursive({ x: new MapRecursive() });
// Existing:
const fromIterator = new MapRecursive([["x", new MapRecursive()]]);
const fromMap = new MapRecursive(new Map([["x", new MapRecursive()]]));
const fromNothing = new MapRecursive();
const fromUndefined = new MapRecursive(undefined);
```
