---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Rename TreeBranchAlpha to UntypedTreeViewAlpha

The alpha `TreeBranchAlpha` interface is now named `UntypedTreeViewAlpha` to clarify that it represents a tree view without a known schema.

Update alpha API imports and type annotations to use the new name:

```typescript
// Before
import type { TreeBranchAlpha } from "@fluidframework/tree/alpha";
const branch: TreeBranchAlpha = view.fork();

// After
import type { UntypedTreeViewAlpha } from "@fluidframework/tree/alpha";
const branch: UntypedTreeViewAlpha = view.fork();
```
