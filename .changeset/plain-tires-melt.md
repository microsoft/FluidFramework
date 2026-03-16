---
"@fluidframework/tree": minor
"__section": feature
---
Add splice as a new method on TreeArrayNode

#### Why this change

Adds support for splice on TreeArrayNode that follows the semantics of javascripts `Array.splice()`. Allows for the insertion and removal of item(s) while returning the removed item(s) as an array.

#### Usage

```typescript
import { TreeArrayNode } from "@fluidFramework/tree";

// inventory is a TreeArrayNode from your schema. inventory = ["Apples", "Bananas", "Pears"]

// Remove 2 items starting at index 0, insert new items in their place
const removed = inventory.splice(0, 2, "Oranges", "Grapes");
// removed: ["Apples", "Bananas"]
// inventory: ["Oranges, "Grapes, "Pears"]

// Removed everything from index 1 onward (omitting deleteCount)
const rest = inventory.splice(1);
// rest: ["Grapes", "Pears"]
// inventory: ["Oranges"]
```
