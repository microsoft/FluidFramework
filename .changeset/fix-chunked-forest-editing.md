---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Detect inconsistent optimized SharedTree forest edits before mutation

This issue only affects applications configured to use [`ForestTypeOptimized`](https://fluidframework.com/docs/api/tree#foresttypeoptimized-variable).
The optimized forest now validates internal attach, detach, create, and destroy operations before mutating tree content.
Previously, an inconsistent operation could partially modify the forest or consume detached content before failing, obscuring the original cause and potentially leading to later out-of-bounds errors such as `0xcf9`.

Additional assertions now detect these inconsistencies closer to their source and provide more actionable failures when triaging similar issues in the future.
