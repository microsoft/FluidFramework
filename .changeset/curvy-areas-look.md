---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Prefer UntypedTreeViewAlpha over TreeBranchAlpha

`UntypedTreeViewAlpha` is now the preferred name for the alpha `TreeBranchAlpha` interface, clarifying that it represents a tree view without a known schema. `TreeBranchAlpha` remains available as a deprecated alias for compatibility and will be removed in a future release.

Update alpha API imports and type annotations to use the new name:

```typescript
// Before
import type { TreeBranchAlpha } from "@fluidframework/tree/alpha";
const branch: TreeBranchAlpha = view.fork();

// After
import type { UntypedTreeViewAlpha } from "@fluidframework/tree/alpha";
const branch: UntypedTreeViewAlpha = view.fork();
```
