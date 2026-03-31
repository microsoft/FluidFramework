---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": legacy
---

The deprecated getBranch API has been removed

To obtain a branch-like object, create a view from your tree via `viewWith`.
Or, use `TreeAlpha.context` to get a view from a `TreeNode`.
