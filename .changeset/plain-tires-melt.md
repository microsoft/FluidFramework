---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Adds TreeArrayNodeAlpha with a new splice method

Adds a `splice` method on `TreeArrayNodeAlpha` that supports removing and inserting items in a single operation to align with JavaScript's Array splice API.
Returns the removed items as an array.
Supports negative `start` indices (wraps from end).
Optional `deleteCount` (omitting removes everything from `start` onward).
The alpha API is accessible by an `asAlpha` cast on existing TreeArrayNodes, or using `schemaFactoryAlpha`.
`arrayAlpha` nodes are accepted wherever `TreeArrayNode` is expected, but not the reverse.
`asAlpha` is bidirectional since it's the same underlying schema.

#### Usage

```typescript
import { SchemaFactory, SchemaFactoryAlpha, asAlpha } from "@fluidframework/tree";

// Using AsAlpha to cast an existing TreeArrayNode
const sf = new SchemaFactory("example");
const Inventory = sf.array("Inventory", sf.string);
const inventory = new Inventory(["Apples", "Bananas", "Pears"]);
const inventoryAlpha = asAlpha(inventory)

// Using SchemaFactoryAlpha so splice is available directly
const sf = new SchemaFactoryAlpha("example");
const Inventory = sf.arrayAlpha("Inventory", sf.string);
const inventoryAlpha = new Inventory(["Apples", "Bananas", "Pears"]);

// Remove 2 items starting at index 0, insert new items in their place
const removed = inventoryAlpha.splice(0, 2, "Oranges", "Grapes");
// removed: ["Apples", "Bananas"]
// inventory: ["Oranges", "Grapes", "Pears"]

// Removed everything from index 1 onward (omitting deleteCount)
const rest = inventoryAlpha.splice(1);
// rest: ["Grapes", "Pears"]
// inventory: ["Oranges"]
```
