---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Enables Revertible objects to be cloned using `RevertibleAlpha.clone()`

Replaced `DisposableRevertible` with `RevertibleAlpha`. The new `RevertibleAlpha` interface extends `Revertible` and includes a `clone(branch: TreeBranch)` method to facilitate cloning a Revertible to a specified target branch. The source branch where the `RevertibleAlpha` was created must share revision logs with the target branch where the `RevertibleAlpha` is being cloned. If this condition is not met, the operation will throw an error.
