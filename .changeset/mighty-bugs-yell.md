---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add "push" as alias for insertAtEnd on TreeArrayNode

Adds `push` as an alias to make the API more intuitive and reduce friction for both `LLM`-generated code and developers familiar with JavaScript array semantics.

#### Usage

```typescript
import { TreeArrayNode } from "@fluidframework/tree";

// `inventory` is a TreeArrayNode from your schema.
inventory.push({ name: "Apples", quantity: 3 });

// Insert multiple items in one call.
inventory.push(
  TreeArrayNode.spread([
    { name: "Oranges", quantity: 2 },
    { name: "Bananas", quantity: 5 },
  ]),
);
```
