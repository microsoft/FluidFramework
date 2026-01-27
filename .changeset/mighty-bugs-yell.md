---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Add push as alias for insertAtEnd on TreeArrayNode

#### Why this change

Adding push as an alias makes the API more intuitive and reduces friction for both `LLM` generated code and developers familiar with JavaScript array semantics.

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
