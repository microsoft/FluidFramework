---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
TreeView transaction APIs have been promoted to beta

The new `TreeViewBeta` interface exposes `runTransaction` and `runTransactionAsync` methods.

An `asBeta` helper is also provided for down-casting a `TreeView` to a `TreeViewBeta`, mirroring the existing `asAlpha` helper.

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

**Type Name Changes**

With the introduction of new beta types, existing alpha types have been replaced with new alpha and beta variants.
| Old | New Alpha | New Beta |
| --- | --- | --- |
| `RunTransactionParams` | `RunTransactionParamsAlpha` | `RunTransactionParamsBeta` |
| `TransactionCallbackStatus` | `TransactionCallbackStatusAlpha` | `TransactionCallbackStatusBeta` |
| `VoidTransactionCallbackStatus` | `VoidTransactionCallbackStatusAlpha` | `VoidTransactionCallbackStatusBeta` |
