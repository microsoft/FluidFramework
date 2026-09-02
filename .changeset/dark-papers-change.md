---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Tree contexts now support beta transactions

The new [`TreeBeta.context`](https://fluidframework.com/docs/api/tree/treebeta-interface#context-methodsignature) method gets a [`TreeContextBeta`](https://fluidframework.com/docs/api/tree/treecontextbeta-interface) for a tree node.
Use this context to run synchronous or asynchronous transactions on hydrated and unhydrated nodes.
The transaction methods accept [`RunTransactionParamsBeta`](https://fluidframework.com/docs/api/tree/runtransactionparamsbeta-interface), which supports transaction labels.

Use `isView()` to determine if the context is associated with an [`UntypedTreeView`](https://fluidframework.com/docs/api/tree/untypedtreeview-interface).
If `isView()` returns `true`, TypeScript narrows the context to `UntypedTreeView`.
The view-specific transaction overloads are then available.
These overloads let a transaction callback request a rollback and return a value for each result.

The following example runs a transaction on any tree node context.
It then uses `isView()` to run a transaction that can request a rollback.

```typescript
import { TreeBeta } from "@fluidframework/tree/beta";

// ...
const context = TreeBeta.context(myNode);

const updateResult = context.runTransaction(
  () => {
    myNode.title = "Updated title";
    return { value: myNode.title };
  },
);

if (context.isView()) {
  const validatedResult = context.runTransaction(
    () => {
      myNode.title = proposedTitle;

      // Roll back all edits in this transaction when the title is not valid.
      if (proposedTitle.length === 0) {
        return { rollback: true, value: "Title must not be empty" };
      }

      return { rollback: false, value: myNode.title };
    },
  );

  if (!validatedResult.success) {
    showValidationError(validatedResult.value);
  }
}
```
