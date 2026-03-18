---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add splice method on TreeArrayNode

Adds a `splice` method on `TreeArrayNode` that supports removing and inserting items in a single operation to align with JavaScripts Array splice API.
Returns the removed items as an array.
Supports negative `start` indices (wraps from end).
Optional `deleteCount` (omitting removes everything from `start` onward).

#### Usage

```typescript
import { TreeArrayNode } from "@fluidframework/tree";

// inventory is a TreeArrayNode from your schema. inventory = ["Apples", "Bananas", "Pears"]

// Remove 2 items starting at index 0, insert new items in their place
const removed = inventory.splice(0, 2, "Oranges", "Grapes");
// removed: ["Apples", "Bananas"]
// inventory: ["Oranges", "Grapes", "Pears"]

// Removed everything from index 1 onward (omitting deleteCount)
const rest = inventory.splice(1);
// rest: ["Grapes", "Pears"]
// inventory: ["Oranges"]
```
