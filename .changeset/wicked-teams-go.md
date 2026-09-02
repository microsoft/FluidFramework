---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add the `minimize` transaction post-processor

When calling `runTransaction` or `runTransactionAsync`, with `RunTransactionParamsAlpha.postProcessor` set to `minimize`,
edits any newly created nodes which are removed by the transaction will be discarded.
Edits to removed nodes will also be discarded.
This is intended to remove information from changes (which, for example, may have been made by an AI system)
which cannot be easily inspected by a user looking at the effect of that change on the document.

```typescript
tree.runTransaction(() => { ... }, { postProcessor: minimize });
```
