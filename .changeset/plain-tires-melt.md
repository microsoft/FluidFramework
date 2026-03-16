---
"@fluidframework/tree": minor
"__section": feature
---
Add splice method on TreeArrayNode

#### Why this change

Adds a `splice` method on `TreeArrayNode` that supports removing and inserting items in a single operation. Returns the removed items as an array. Supports negative `start` indcies (wraps from end). Optional `deleteCount` (omitting removes everthing from `start` onward). Requires safe integers values for `start` and `deleteCount`.

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
