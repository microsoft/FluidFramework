---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Improved typing of `TreeBeta.clone`

The return type of `TreeBeta.clone` now matches the input type.
Existing usages which were supplying the generic parameter for the input/output type should remove the explicit generic parameter and allow it to be inferred from the input.

Previously:
```ts
const clone = TreeBeta.clone<typeof MyNode>(myNode);
```

Now:
```ts
const clone = TreeBeta.clone(myNode);
```
