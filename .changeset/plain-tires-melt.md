---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Adds an opt-in `TreeArrayNodeAlpha` with a new `splice` method.

Adds an opt-in alpha `splice` method on `TreeArrayNodeAlpha` that supports removing and inserting items in a single operation to align with JavaScripts Array splice API.
Returns the removed items as an array.
Supports negative `start` indices (wraps from end).
Optional `deleteCount` (omitting removes everything from `start` onward).

#### Usage

```typescript
import { TreeArrayNode } from "@fluidframework/tree";

// inventory is a TreeArrayNode from your schema. inventory = ["Apples", "Bananas", "Pears"]
// cast inventory asAlpha() to opt into the new alpha API
const inventoryAlpha = asAlpha(inventory);

// Remove 2 items starting at index 0, insert new items in their place
const removed = inventoryAlpha.splice(0, 2, "Oranges", "Grapes");
// removed: ["Apples", "Bananas"]
// inventory: ["Oranges", "Grapes", "Pears"]

// Removed everything from index 1 onward (omitting deleteCount)
const rest = inventoryAlpha.splice(1);
// rest: ["Grapes", "Pears"]
// inventory: ["Oranges"]
```
