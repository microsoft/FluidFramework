---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
TreeView transaction APIs have been promoted to beta

The [TreeViewBeta](https://fluidframework.com/docs/api/fluid-framework/treeviewbeta-interface) interface exposes `runTransaction` and `runTransactionAsync` methods.

The [asBeta](https://fluidframework.com/docs/api/fluid-framework/#asbeta-function) helper function can be used to down-cast a `TreeView` to a `TreeViewBeta`.

```typescript
import { asBeta } from "fluid-framework/beta";
// ...
const view = asBeta(tree.viewWith(config));
const result = view.runTransaction(() => {
	// ... make edits to the tree ...
});
if (result.success === false) {
	// ... handle the failed transaction ...
}
```

> [!IMPORTANT]
> Transaction constraints are not yet available as a part of the beta transaction APIs.
> These capabilities can still be accessed via the updated alpha APIs.

**Type Name Changes**

With the introduction of new beta types, existing alpha types have been replaced with new alpha and beta variants.

| Old | New Alpha | New Beta |
| --- | --- | --- |
| `RunTransactionParams` | `RunTransactionParamsAlpha` | `RunTransactionParamsBeta` |
| `TransactionCallbackStatus` | `TransactionCallbackStatusAlpha` | `TransactionCallbackStatusBeta` |
| `VoidTransactionCallbackStatus` | `VoidTransactionCallbackStatusAlpha` | `VoidTransactionCallbackStatusBeta` |

**Other Renames**

- `TransactionResult` (alpha) -> `TransactionVoidResult` (beta)
- `TransactionResultExt` (alpha) -> `TransactionValueResult` (beta)
